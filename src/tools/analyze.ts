import { z } from 'zod';
import pLimit from 'p-limit';
import { SourceSchema, AnalyzedReviewSchema } from '../schemas/shared.js';
import { loadReviews } from './import.js';
import { evaluateRules } from '../engine/rules.js';
import { isLlmRequired } from '../engine/routing.js';
import { CircuitBreaker } from '../engine/circuitBreaker.js';
import { redactPII } from '../utils/redact.js';
import { createError } from '../utils/errors.js';
import { IVectorStore } from '../domain/ports/vector_store.js';
import { ILLMClient, LLMResponse } from '../domain/ports/llm_client.js';
import { logger } from '../utils/logger.js';

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

interface LoadedReview {
    review_id: string;
    content: string;
    score: number;
    device?: string;
    os_version?: string;
    app_version?: string;
}

interface LlmClassification {
    feature_area?: string;
    issue_type?: string;
    severity?: string;
}

interface ClassificationOutput {
    issue_type: string;
    feature_area: string;
    severity?: string;
    sentiment?: string;
    confidence_score: number;
    classification_source: 'rule_engine' | 'llm' | 'hybrid';
    is_spam: boolean;
}

type ReviewProcessingResult =
    | { type: 'spam' }
    | {
        type: 'processed';
        review: LoadedReview;
        needsLlm: boolean;
        output: ClassificationOutput;
    };

function firstTextContent(resp: LLMResponse): string {
    if (Array.isArray(resp.content) && resp.content[0]?.type === 'text') {
        return resp.content[0].text || '{}';
    }
    return '{}';
}

function parseLlmClassification(rawText: string): LlmClassification {
    try {
        const parsed = JSON.parse(rawText) as LlmClassification;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function mergeRuleAndLlm(ruleOutput: ClassificationOutput, llmOutput: LlmClassification): ClassificationOutput {
    return {
        ...ruleOutput,
        feature_area: llmOutput.feature_area || ruleOutput.feature_area,
        issue_type: llmOutput.issue_type || (ruleOutput.issue_type === 'Unknown' ? 'Bug' : ruleOutput.issue_type),
        severity: llmOutput.severity || ruleOutput.severity,
        classification_source: 'hybrid'
    };
}

async function processSingleReview(
    review: LoadedReview,
    llmClient: ILLMClient,
    routingModel: string,
    circuitBreaker: CircuitBreaker
): Promise<ReviewProcessingResult> {
    const redacted = redactPII(review.content);
    const rulesRes = evaluateRules(redacted, review.score);

    if (rulesRes.is_spam) {
        return { type: 'spam' };
    }

    const needsLlm = isLlmRequired(rulesRes);
    if (!needsLlm) {
        return { type: 'processed', review, needsLlm, output: rulesRes };
    }

    try {
        const prompt = `Classify this review (return JSON with feature_area, issue_type, severity):\nReview: ${redacted}`;
        const llmResp = await llmClient.processPrompt(prompt, routingModel);
        const parsed = parseLlmClassification(firstTextContent(llmResp));

        const inTokens = llmResp.usage?.input_tokens || 50;
        const outTokens = llmResp.usage?.output_tokens || 50;
        circuitBreaker.recordSuccess(inTokens, outTokens);

        return {
            type: 'processed',
            review,
            needsLlm,
            output: mergeRuleAndLlm(rulesRes, parsed)
        };
    } catch {
        circuitBreaker.recordFailure();
        return {
            type: 'processed',
            review,
            needsLlm,
            output: {
                ...rulesRes,
                classification_source: 'rule_engine'
            }
        };
    }
}

function buildAnalyzedOutput(review: LoadedReview, output: ClassificationOutput, includeRawText: boolean) {
    const mapped = {
        review_id: review.review_id,
        text: includeRawText ? review.content : redactPII(review.content),
        issue_type: output.issue_type,
        feature_area: output.feature_area,
        severity: output.severity || 'FYI',
        sentiment: output.sentiment || 'Neutral',
        confidence_score: output.confidence_score,
        classification_source: output.classification_source,
        signals: {
            summary: '',
            repro_hints: [],
            device: review.device || 'Unknown',
            os_version: review.os_version || 'Unknown',
            app_version: review.app_version || 'Unknown',
            feature_mentions: []
        }
    };

    return AnalyzedReviewSchema.parse(mapped);
}

function buildSafetyAlert(review: LoadedReview, output: ClassificationOutput, includeRawText: boolean) {
    return {
        review_id: review.review_id,
        text: includeRawText ? review.content : redactPII(review.content),
        feature_area: output.feature_area,
        severity: output.severity || 'FYI',
        requires_immediate_attention: output.severity === 'P0'
    };
}

export async function analyzeReviewsTool(input: unknown, deps: AnalyzeDeps) {
    const parseResult = AnalyzeToolInputSchema.safeParse(input);
    if (!parseResult.success) {
        throw createError('INVALID_SCHEMA', 'Invalid analyze parameters', parseResult.error.format());
    }

    const { source, options } = parseResult.data;
    const includeRawText = options?.include_raw_text ?? false;
    const { llmClient } = deps;
    const loaded = await loadReviews({ source });
    const rawInputReviews = loaded.reviews as LoadedReview[];

    const startTime = Date.now();
    const circuitBreaker = new CircuitBreaker();

    let filtered_spam = 0;
    let llm_routed_count = 0;
    let rule_only_count = 0;
    let hybrid_count = 0;

    const models_used = {
        routing: options?.routing_model || 'claude-3-haiku-20240307',
        summary: options?.summary_model || 'claude-3.5-sonnet-20240620'
    };

    const finalReviews = [];
    const safety_alerts = [];
    const processingLimit = pLimit(options?.concurrency ?? 15);

    const results = await Promise.all(
        rawInputReviews.map((review) =>
            processingLimit(() => processSingleReview(review, llmClient, models_used.routing, circuitBreaker))
        )
    );

    for (const result of results) {
        if (result.type === 'spam') {
            filtered_spam++;
            continue;
        }

        const out = result.output;
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
                rate_limit_count: 0,
                retry_count: 0,
                timeout_count: 0,
                cost_estimate_usd: cbState.estimatedCostUsd,
                execution_time_ms: Date.now() - startTime
            },
            safety_alerts,
            reviews: finalReviews.length > 1000 ? finalReviews.slice(0, 1000) : finalReviews
        }
    };
}
