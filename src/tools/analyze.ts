import { z } from 'zod';
import { SourceSchema } from '../schemas/shared.js';
import { loadReviews } from './import.js';
import { evaluateRules } from '../engine/rules.js';
import { isLlmRequired } from '../engine/routing.js';
import { CircuitBreaker } from '../engine/circuitBreaker.js';
import { redactPII } from '../utils/redact.js';
import { createError } from '../utils/errors.js';
import { IVectorStore } from '../domain/ports/vector_store.js';
import { ILLMClient } from '../domain/ports/llm_client.js';
import pLimit from 'p-limit';
import { AnalyzedReviewSchema } from '../schemas/shared.js';

export const AnalyzeOptionsSchema = z.object({
    budget_usd: z.number().optional(),
    concurrency: z.number().int().min(1).max(20).default(15).optional(),
    routing_model: z.string().optional(),
    summary_model: z.string().optional(),
    include_summary: z.boolean().default(false).optional(),
    include_raw_text: z.boolean().default(false).optional(),
});

export const AnalyzeToolInputSchema = z.object({
    source: SourceSchema,
    options: AnalyzeOptionsSchema.optional(),
});

export interface AnalyzeDeps {
    vectorStore: IVectorStore;
    llmClient: ILLMClient;
}

export async function analyzeReviewsTool(input: unknown, deps: AnalyzeDeps) {
    const parseResult = AnalyzeToolInputSchema.safeParse(input);
    if (!parseResult.success) {
        throw createError("INVALID_SCHEMA", "Invalid analyze parameters", parseResult.error.format());
    }

    const { source, options } = parseResult.data;
    const includeRawText = options?.include_raw_text ?? false;
    const { llmClient } = deps;
    const loaded = await loadReviews({ source });
    const rawInputReviews = loaded.reviews;

    const startTime = Date.now();
    const cb = new CircuitBreaker();
    let filtered_spam = 0;
    let llm_routed_count = 0;
    let rule_only_count = 0;
    let hybrid_count = 0;
    const models_used = {
        routing: options?.routing_model || "claude-3-haiku-20240307",
        summary: options?.summary_model || "claude-3.5-sonnet-20240620"
    };

    const finalReviews: any[] = [];
    const safety_alerts: any[] = [];
    const processingLimit = pLimit(options?.concurrency ?? 15);

    const processReview = async (review: any) => {
        const redacted = redactPII(review.content);
        const rulesRes = evaluateRules(redacted, review.score);

        if (rulesRes.is_spam) {
            return { type: 'spam' as const };
        }

        const needsLlm = isLlmRequired(rulesRes);
        let finalOutput = { ...rulesRes };

        if (needsLlm) {
            try {
                const prompt = `Classify this review (return JSON with feature_area, issue_type, severity):\nReview: ${redacted}`;
                const llmResp = await llmClient.processPrompt(prompt, models_used.routing);
                const txt = Array.isArray(llmResp.content) && llmResp.content[0].type === "text" ? llmResp.content[0].text : "{}";

                let parsed: any = {};
                try {
                    parsed = JSON.parse(txt);
                } catch { /* ignore fallback */ }

                // Track mock tokens
                const inTokens = llmResp.usage?.input_tokens || 50;
                const outTokens = llmResp.usage?.output_tokens || 50;
                cb.recordSuccess(inTokens, outTokens);

                finalOutput = {
                    ...rulesRes,
                    feature_area: parsed.feature_area || rulesRes.feature_area,
                    issue_type: parsed.issue_type || (rulesRes.issue_type === "Unknown" ? "Bug" : rulesRes.issue_type),
                    severity: parsed.severity || rulesRes.severity,
                    classification_source: "hybrid"
                };
            } catch (e) {
                cb.recordFailure();
                // Fallback to rules if LLM fails
                finalOutput.classification_source = "rule_engine";
            }
        }

        return { type: 'processed' as const, review, finalOutput, needsLlm };
    };

    const results = await Promise.all(
        rawInputReviews.map((review: any) => processingLimit(() => processReview(review)))
    );

    for (const res of results) {
        if (res.type === 'spam') {
            filtered_spam++;
        } else {
            const out = res.finalOutput;
            if (out.classification_source === 'hybrid') hybrid_count++;
            else rule_only_count++;

            if (res.needsLlm && out.classification_source === 'hybrid') {
                llm_routed_count++;
            }

            const rOutput = {
                review_id: res.review.review_id,
                text: includeRawText ? res.review.content : redactPII(res.review.content),
                issue_type: out.issue_type,
                feature_area: out.feature_area,
                severity: out.severity || "FYI",
                sentiment: out.sentiment || "Neutral",
                confidence_score: out.confidence_score,
                classification_source: out.classification_source,
                signals: {
                    summary: "",
                    repro_hints: [],
                    device: res.review.device || "Unknown",
                    os_version: res.review.os_version || "Unknown",
                    app_version: res.review.app_version || "Unknown",
                    feature_mentions: []
                }
            };
            finalReviews.push(AnalyzedReviewSchema.parse(rOutput));

            if (out.severity === "P0" || out.severity === "P1") {
                safety_alerts.push({
                    review_id: res.review.review_id,
                    text: includeRawText ? res.review.content : redactPII(res.review.content),
                    feature_area: out.feature_area,
                    severity: out.severity,
                    requires_immediate_attention: (out.severity === "P0")
                });
            }
        }
    }

    const total_processed = finalReviews.length;
    const total_reviews_input = rawInputReviews.length;
    const spam_ratio = total_reviews_input > 0 ? (filtered_spam / total_reviews_input) : 0;
    const llm_routed_ratio = total_processed > 0 ? (llm_routed_count / total_processed) : 0;
    const rule_coverage_drop = (total_processed > 0 && llm_routed_ratio > 0.4);

    const cbState = cb.getState();

    const warnings: string[] = [];
    if (cbState.consecutiveFailures > 0) warnings.push("LLM Fallback Triggered");
    if (spam_ratio > 0.2) warnings.push("Suspiciously high spam ratio detected.");

    // Observability Logging
    if (rule_coverage_drop) {
        console.warn(`[OBSERVABILITY/WARN] rule_coverage_drop threshold exceeded: llm_routed_ratio is ${(llm_routed_ratio * 100).toFixed(1)}%`);
    }
    console.info(`[OBSERVABILITY/INFO] Processed batch. Total Input: ${total_reviews_input}. Spam: ${filtered_spam}. LLM Routed: ${llm_routed_count}. Hybrid: ${hybrid_count}. Rule Only: ${rule_only_count}. Rules Fallback: ${warnings.includes("LLM Fallback Triggered")}`);

    return {
        data: {
            metadata: {
                schema_version: "1.0",
                rules_version: "1.0",
                taxonomy_version: "1.0",
                models_used,
                pii_redaction_engine: "Regex/Custom",
                processed_at: new Date().toISOString(),
                total_reviews_input,
                filtered_spam,
                spam_ratio,
                total_processed,
                llm_routed_count,
                llm_routed_ratio,
                rule_only_count,
                hybrid_count,
                rule_coverage_drop,
                warnings,
                rate_limit_count: 0,
                retry_count: 0,
                timeout_count: 0,
                cost_estimate_usd: cbState.estimatedCostUsd,
                execution_time_ms: Date.now() - startTime
            },
            safety_alerts,
            // Truncate reviews array to avoid 1MB limit in MCP transport
            reviews: finalReviews.length > 1000 ? finalReviews.slice(0, 1000) : finalReviews
        }
    };
}
