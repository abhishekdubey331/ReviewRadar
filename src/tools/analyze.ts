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
import { getConfig, resolveLlmProviderConfig } from '../utils/config.js';
import { AnalysisPromptContext, buildAnalyzedOutput, buildSafetyAlert, LoadedReview, processSingleReview } from './analyze_service.js';
import { redactPII } from '../utils/redact.js';
import { evaluateRules } from '../engine/rules.js';
import { AnalysisCache, InMemoryAnalysisCache } from './analysis_cache.js';
import { AnalyzeModelDefaults, resolveAnalyzeModelDefaults } from './analyze_models.js';
import { buildAnalyzeWarnings, createAnalyzeCounters, trackAnalyzeResult } from './analyze_metrics.js';
import { selectReviewsForAnalysis } from './analyze_selection.js';

export const AnalyzeOptionsSchema = z.object({
    budget_usd: z.number().optional(),
    concurrency: z.number().int().min(1).max(20).default(15).optional(),
    // Backward-compatible public option; prefer internal_max_reviews for orchestrated calls.
    max_reviews: z.number().int().min(1).max(5000).optional(),
    routing_model: z.string().optional(),
    summary_model: z.string().optional(),
    include_summary: z.boolean().default(false).optional(),
    include_raw_text: z.boolean().default(false).optional(),
    alert_limit: z.number().int().min(1).max(500).default(50).optional(),
    // Internal orchestration hint used by dispatcher-level PM flows.
    internal_max_reviews: z.number().int().min(1).max(2000).optional(),
    // Internal fast path for summary tools where deterministic speed is preferred.
    internal_rule_only: z.boolean().optional(),
});

export const AnalyzeToolInputSchema = z.object({
    source: SourceSchema.optional(),
    options: AnalyzeOptionsSchema.optional(),
});

export interface AnalyzeDeps {
    vectorStore: IVectorStore;
    llmClient: ILLMClient;
    promptContext?: AnalysisPromptContext;
    analysisCache?: AnalysisCache;
    modelDefaults?: AnalyzeModelDefaults;
}

function resolveModelDefaults(options?: z.infer<typeof AnalyzeOptionsSchema>) {
    try {
        const providerDefaults = resolveLlmProviderConfig(getConfig());
        return resolveAnalyzeModelDefaults(options, {
            routing: providerDefaults.routing_model,
            summary: providerDefaults.summary_model
        });
    } catch {
        return resolveAnalyzeModelDefaults(options);
    }
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
    const allLoadedReviews = loaded.reviews as LoadedReview[];
    const maxReviews = options?.internal_max_reviews ?? options?.max_reviews ?? 300;
    const rawInputReviews = selectReviewsForAnalysis(allLoadedReviews, maxReviews);

    const startTime = Date.now();
    const circuitBreaker = new CircuitBreaker();
    const counters = createAnalyzeCounters();

    const models_used = deps.modelDefaults
        ? resolveAnalyzeModelDefaults(options, deps.modelDefaults)
        : resolveModelDefaults(options);
    const promptContext = deps.promptContext ?? {};
    const analysisCache = deps.analysisCache ?? new InMemoryAnalysisCache();

    const finalReviews = [];
    const safety_alerts = [];
    const processingLimit = pLimit(options?.concurrency ?? 15);

    const settledResults = await Promise.allSettled(
        rawInputReviews.map((review) => {
            const cachedTask = analysisCache.getOrCreate(
                review,
                () => processingLimit(() => processSingleReview(
                    review,
                    llmClient,
                    models_used.routing,
                    circuitBreaker,
                    budgetUsd,
                    options?.internal_rule_only ?? false,
                    promptContext
                ))
            );
            if (cachedTask.isDuplicate) {
                counters.duplicate_review_groups++;
            }
            return cachedTask.promise;
        })
    );

    const results = settledResults.map((settled, index) => {
        if (settled.status === 'fulfilled') {
            return settled.value;
        }

        const review = rawInputReviews[index];
        const ruleOutput = evaluateRules(redactPII(review.content), review.score);
        return {
            type: 'processed' as const,
            review,
            needsLlm: true,
            output: {
                ...ruleOutput,
                classification_source: 'rule_engine' as const
            },
            fallback_reason: 'provider_failure' as const
        };
    });

    for (const result of results) {
        const processed = trackAnalyzeResult(result, counters);
        if (!processed || result.type === 'spam') {
            continue;
        }

        let out = result.output;
        try {
            finalReviews.push(buildAnalyzedOutput(result.review, out, includeRawText));
        } catch {
            out = {
                ...evaluateRules(redactPII(result.review.content), result.review.score),
                classification_source: 'rule_engine'
            };
            finalReviews.push(buildAnalyzedOutput(result.review, out, includeRawText));
        }

        if (out.severity === 'P0' || out.severity === 'P1') {
            safety_alerts.push(buildSafetyAlert(result.review, out, includeRawText));
        }
    }

    const total_processed = finalReviews.length;
    const total_reviews_input = rawInputReviews.length;
    const total_reviews_available = allLoadedReviews.length;
    const sampled = total_reviews_available > total_reviews_input;

    const cbState = circuitBreaker.getState();
    const diagnostics = buildAnalyzeWarnings(total_processed, total_reviews_input, counters, cbState);

    if (diagnostics.ruleCoverageDrop) {
        logger.warn('analyze.rule_coverage_drop', {
            llm_routed_ratio: diagnostics.llmRoutedRatio,
            threshold: 0.4
        });
    }

    logger.info('analyze.batch_processed', {
        total_reviews_input,
        filtered_spam: counters.filtered_spam,
        llm_routed_count: counters.llm_routed_count,
        hybrid_count: counters.hybrid_count,
        rule_only_count: counters.rule_only_count,
        rules_fallback: diagnostics.warnings.includes('LLM Fallback Triggered')
    });

    return {
        data: {
            metadata: {
                schema_version: '1.0',
                rules_version: '1.0',
                taxonomy_version: '1.1',
                models_used,
                pii_redaction_engine: 'Regex/Custom',
                processed_at: new Date().toISOString(),
                total_reviews_input,
                total_reviews_available,
                sampled,
                max_reviews: maxReviews,
                duplicate_review_groups: counters.duplicate_review_groups,
                filtered_spam: counters.filtered_spam,
                spam_ratio: diagnostics.spamRatio,
                total_processed,
                llm_routed_count: counters.llm_routed_count,
                llm_routed_ratio: diagnostics.llmRoutedRatio,
                rule_only_count: counters.rule_only_count,
                hybrid_count: counters.hybrid_count,
                rule_coverage_drop: diagnostics.ruleCoverageDrop,
                warnings: diagnostics.warnings,
                degraded_mode: diagnostics.degradedMode,
                degraded_reasons: diagnostics.degradedReasons,
                budget_usd: budgetUsd,
                budget_guardrail_count: counters.budget_guardrail_count,
                rate_limit_count: counters.rate_limit_count,
                retry_count: cbState.totalFailures,
                timeout_count: counters.timeout_count,
                cost_estimate_usd: cbState.estimatedCostUsd,
                execution_time_ms: Date.now() - startTime
            },
            safety_alerts,
            reviews: finalReviews.length > 1000 ? finalReviews.slice(0, 1000) : finalReviews
        }
    };
}
