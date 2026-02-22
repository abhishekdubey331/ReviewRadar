import { z } from 'zod';
import { AnalyzeToolInputSchema } from './analyze.js';
import { loadReviews } from './import.js';
import { evaluateRules } from '../engine/rules.js';
import { redactPII } from '../utils/redact.js';
import { createError } from '../utils/errors.js';
import { IVectorStore } from '../domain/ports/vector_store.js';
import { logger } from '../utils/logger.js';

export async function getSafetyAlertsTool(input: unknown, _vectorStore: IVectorStore) {
    const parseResult = AnalyzeToolInputSchema.safeParse(input);
    if (!parseResult.success) {
        throw createError("INVALID_SCHEMA", "Invalid analyze parameters", parseResult.error.format());
    }

    const { source, options } = parseResult.data;
    const includeRawText = options?.include_raw_text ?? false;
    const loaded = await loadReviews({ source });
    const rawInputReviews = loaded.reviews;

    const startTime = Date.now();
    let filtered_spam = 0;

    const safety_alerts: any[] = [];

    // Fast path: bypass LLM
    for (const review of rawInputReviews) {
        const redacted = redactPII(review.content);
        const rulesRes = evaluateRules(redacted, review.score);

        if (rulesRes.is_spam) {
            filtered_spam++;
            continue;
        }

        const out = rulesRes;

        // P0 or P1 severity
        if (out.severity === "P0" || out.severity === "P1") {
            // "related to safety": we can filter by issue_type === 'Safety Concern' or just severity since it's safety_alerts criteria
            safety_alerts.push({
                review_id: review.review_id,
                text: includeRawText ? review.content : redacted,
                feature_area: out.feature_area,
                severity: out.severity,
                requires_immediate_attention: (out.severity === "P0")
            });
        }
    }

    const total_reviews_input = loaded.diagnostics.total_reviews_input;
    const total_processed = total_reviews_input - filtered_spam;
    const spam_ratio = total_reviews_input > 0 ? (filtered_spam / total_reviews_input) : 0;

    const warnings: string[] = [];
    if (spam_ratio > 0.2) warnings.push("Suspiciously high spam ratio detected.");

    logger.info("safety_alerts.batch_processed", {
        total_reviews_input,
        filtered_spam,
        alerts_generated: safety_alerts.length
    });

    return {
        data: {
            metadata: {
                schema_version: "1.0",
                rules_version: "1.0",
                taxonomy_version: "1.0",
                models_used: {
                    routing: "none (fast-path)",
                    summary: "none"
                },
                pii_redaction_engine: "Regex/Custom",
                processed_at: new Date().toISOString(),
                total_reviews_input,
                filtered_spam,
                spam_ratio,
                total_processed,
                llm_routed_count: 0,
                llm_routed_ratio: 0,
                rule_only_count: total_processed,
                hybrid_count: 0,
                rule_coverage_drop: false,
                warnings,
                rate_limit_count: 0,
                retry_count: 0,
                timeout_count: 0,
                cost_estimate_usd: 0,
                execution_time_ms: Date.now() - startTime
            },
            safety_alerts
        }
    };
}
