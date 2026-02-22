import { evaluateRules } from "../engine/rules.js";
import { isLlmRequired } from "../engine/routing.js";
import { CircuitBreaker } from "../engine/circuitBreaker.js";
import { ILLMClient, LLMResponse } from "../domain/ports/llm_client.js";
import { AnalyzedReviewSchema } from "../schemas/shared.js";
import { redactPII } from "../utils/redact.js";

export interface LoadedReview {
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

export interface ClassificationOutput {
    issue_type: string;
    feature_area: string;
    severity?: string;
    sentiment?: string;
    confidence_score: number;
    classification_source: "rule_engine" | "llm" | "hybrid";
    is_spam: boolean;
}

export type FallbackReason = "budget_guardrail" | "timeout" | "rate_limited" | "provider_failure" | null;

export type ReviewProcessingResult =
    | { type: "spam" }
    | {
        type: "processed";
        review: LoadedReview;
        needsLlm: boolean;
        output: ClassificationOutput;
        fallback_reason: FallbackReason;
    };

function firstTextContent(resp: LLMResponse): string {
    if (Array.isArray(resp.content) && resp.content[0]?.type === "text") {
        return resp.content[0].text || "{}";
    }
    return "{}";
}

function parseLlmClassification(rawText: string): LlmClassification {
    try {
        const parsed = JSON.parse(rawText) as LlmClassification;
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function mergeRuleAndLlm(ruleOutput: ClassificationOutput, llmOutput: LlmClassification): ClassificationOutput {
    return {
        ...ruleOutput,
        feature_area: llmOutput.feature_area || ruleOutput.feature_area,
        issue_type: llmOutput.issue_type || (ruleOutput.issue_type === "Unknown" ? "Bug" : ruleOutput.issue_type),
        severity: llmOutput.severity || ruleOutput.severity,
        classification_source: "hybrid"
    };
}

function classifyFailure(error: unknown): FallbackReason {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes("timeout")) return "timeout";
    if (message.includes("429") || message.includes("rate")) return "rate_limited";
    return "provider_failure";
}

export async function processSingleReview(
    review: LoadedReview,
    llmClient: ILLMClient,
    routingModel: string,
    circuitBreaker: CircuitBreaker,
    budgetUsd?: number
): Promise<ReviewProcessingResult> {
    const redacted = redactPII(review.content);
    const rulesRes = evaluateRules(redacted, review.score);

    if (rulesRes.is_spam) {
        return { type: "spam" };
    }

    const needsLlm = isLlmRequired(rulesRes);
    if (!needsLlm) {
        return { type: "processed", review, needsLlm, output: rulesRes, fallback_reason: null };
    }

    if (budgetUsd !== undefined && circuitBreaker.getState().estimatedCostUsd >= budgetUsd) {
        return {
            type: "processed",
            review,
            needsLlm,
            output: {
                ...rulesRes,
                classification_source: "rule_engine"
            },
            fallback_reason: "budget_guardrail"
        };
    }

    try {
        const prompt = `Classify this review (return JSON with feature_area, issue_type, severity):\nReview: ${redacted}`;
        const llmResp = await llmClient.processPrompt(prompt, routingModel);
        const parsed = parseLlmClassification(firstTextContent(llmResp));

        const inTokens = llmResp.usage?.input_tokens || 50;
        const outTokens = llmResp.usage?.output_tokens || 50;
        circuitBreaker.recordSuccess(inTokens, outTokens, llmResp.model ?? routingModel);

        return {
            type: "processed",
            review,
            needsLlm,
            output: mergeRuleAndLlm(rulesRes, parsed),
            fallback_reason: null
        };
    } catch (error) {
        try {
            circuitBreaker.recordFailure();
        } catch {
            // If breaker trips, keep request alive by falling back to rules for this item.
        }
        return {
            type: "processed",
            review,
            needsLlm,
            output: {
                ...rulesRes,
                classification_source: "rule_engine"
            },
            fallback_reason: classifyFailure(error)
        };
    }
}

export function buildAnalyzedOutput(review: LoadedReview, output: ClassificationOutput, includeRawText: boolean) {
    return AnalyzedReviewSchema.parse({
        review_id: review.review_id,
        text: includeRawText ? review.content : redactPII(review.content),
        issue_type: output.issue_type,
        feature_area: output.feature_area,
        severity: output.severity || "FYI",
        sentiment: output.sentiment || "Neutral",
        confidence_score: output.confidence_score,
        classification_source: output.classification_source,
        signals: {
            summary: "",
            repro_hints: [],
            device: review.device || "Unknown",
            os_version: review.os_version || "Unknown",
            app_version: review.app_version || "Unknown",
            feature_mentions: []
        }
    });
}

export function buildSafetyAlert(review: LoadedReview, output: ClassificationOutput, includeRawText: boolean) {
    return {
        review_id: review.review_id,
        text: includeRawText ? review.content : redactPII(review.content),
        feature_area: output.feature_area,
        severity: output.severity || "FYI",
        requires_immediate_attention: output.severity === "P0"
    };
}
