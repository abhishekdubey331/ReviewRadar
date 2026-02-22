import { z } from 'zod';
import pLimit from 'p-limit';
import { SourceSchema } from '../schemas/shared.js';
import { loadReviews } from './import.js';
import { CircuitBreaker } from '../engine/circuitBreaker.js';
import { createError } from '../utils/errors.js';
import { IVectorStore } from '../domain/ports/vector_store.js';
import { ILLMClient } from '../domain/ports/llm_client.js';
import { logger } from '../utils/logger.js';
import { getRuntimePolicy } from '../utils/runtime_policy.js';
import { buildAnalyzedOutput, buildSafetyAlert, LoadedReview, processSingleReview } from './analyze_service.js';

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
        throw createError('INVALID_SCHEMA', 'Invalid analyze parameters', parseResult.error.format());
    }

    const { source, options } = parseResult.data;
    const includeRawText = options?.include_raw_text ?? false;
    const { llmClient } = deps;
    const runtimePolicy = getRuntimePolicy();
    const budgetUsd = options?.budget_usd ?? runtimePolicy.default_analyze_budget_usd;
    const loaded = await loadReviews({ source });
    const rawInputReviews = loaded.reviews as LoadedReview[];

    const startTime = Date.now();
    const circuitBreaker = new CircuitBreaker();

    let filtered_spam = 0;
    let llm_routed_count = 0;
    let rule_only_count = 0;
    let hybrid_count = 0;
    let timeout_count = 0;
    let rate_limit_count = 0;
    let budget_guardrail_count = 0;

    const models_used = {
        routing: options?.routing_model || 'claude-3-haiku-20240307',
        summary: options?.summary_model || 'claude-3.5-sonnet-20240620'
    };

    const finalReviews = [];
    const safety_alerts = [];
    const processingLimit = pLimit(options?.concurrency ?? 15);

    const results = await Promise.all(
        rawInputReviews.map((review) =>
            processingLimit(() => processSingleReview(review, llmClient, models_used.routing, circuitBreaker, budgetUsd))
        )
    );

    for (const result of results) {
        if (result.type === 'spam') {
            filtered_spam++;
            continue;
        }

        const out = result.output;
        if (result.fallback_reason === 'timeout') timeout_count++;
        if (result.fallback_reason === 'rate_limited') rate_limit_count++;
        if (result.fallback_reason === 'budget_guardrail') budget_guardrail_count++;
        if (out.classification_source === 'hybrid') {
            hybrid_count++;
        } else {
            rule_only_count++;
        }

        if (result.needsLlm && out.classification_source === 'hybrid') {
            llm_routed_count++;
        }

        finalReviews.push(buildAnalyzedOutput(result.review, out, includeRawText));

        if (out.severity === 'P0' || out.severity === 'P1') {
            safety_alerts.push(buildSafetyAlert(result.review, out, includeRawText));
        }
    }

    const total_processed = finalReviews.length;
    const total_reviews_input = rawInputReviews.length;
    const spam_ratio = total_reviews_input > 0 ? filtered_spam / total_reviews_input : 0;
    const llm_routed_ratio = total_processed > 0 ? llm_routed_count / total_processed : 0;
    const rule_coverage_drop = total_processed > 0 && llm_routed_ratio > 0.4;

    const cbState = circuitBreaker.getState();

    const warnings: string[] = [];
    if (cbState.consecutiveFailures > 0) warnings.push('LLM Fallback Triggered');
    if (spam_ratio > 0.2) warnings.push('Suspiciously high spam ratio detected.');
    if (budget_guardrail_count > 0) warnings.push('Budget guardrail triggered; routed reviews fell back to rule engine.');
    const degraded_reasons = [
        ...(cbState.consecutiveFailures > 0 ? ['llm_fallback_triggered'] : []),
        ...(timeout_count > 0 ? ['llm_timeout'] : []),
        ...(rate_limit_count > 0 ? ['rate_limited'] : []),
        ...(budget_guardrail_count > 0 ? ['budget_guardrail'] : [])
    ];
    const degraded_mode = degraded_reasons.length > 0;

    if (rule_coverage_drop) {
        logger.warn('analyze.rule_coverage_drop', {
            llm_routed_ratio,
            threshold: 0.4
        });
    }

    logger.info('analyze.batch_processed', {
        total_reviews_input,
        filtered_spam,
        llm_routed_count,
        hybrid_count,
        rule_only_count,
        rules_fallback: warnings.includes('LLM Fallback Triggered')
    });

    return {
        data: {
            metadata: {
                schema_version: '1.0',
                rules_version: '1.0',
                taxonomy_version: '1.0',
                models_used,
                pii_redaction_engine: 'Regex/Custom',
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
                degraded_mode,
                degraded_reasons,
                budget_usd: budgetUsd,
                budget_guardrail_count,
                rate_limit_count,
                retry_count: cbState.totalFailures,
                timeout_count,
                cost_estimate_usd: cbState.estimatedCostUsd,
                execution_time_ms: Date.now() - startTime
            },
            safety_alerts,
            reviews: finalReviews.length > 1000 ? finalReviews.slice(0, 1000) : finalReviews
        }
    };
}
