import { CircuitBreaker } from "../engine/circuitBreaker.js";
import { ReviewProcessingResult } from "./analyze_service.js";

export interface AnalyzeCounters {
    filtered_spam: number;
    llm_routed_count: number;
    rule_only_count: number;
    hybrid_count: number;
    timeout_count: number;
    rate_limit_count: number;
    budget_guardrail_count: number;
    duplicate_review_groups: number;
}

export function createAnalyzeCounters(): AnalyzeCounters {
    return {
        filtered_spam: 0,
        llm_routed_count: 0,
        rule_only_count: 0,
        hybrid_count: 0,
        timeout_count: 0,
        rate_limit_count: 0,
        budget_guardrail_count: 0,
        duplicate_review_groups: 0
    };
}

export function trackAnalyzeResult(result: ReviewProcessingResult, counters: AnalyzeCounters): boolean {
    if (result.type === "spam") {
        counters.filtered_spam++;
        return false;
    }

    if (result.fallback_reason === "timeout") counters.timeout_count++;
    if (result.fallback_reason === "rate_limited") counters.rate_limit_count++;
    if (result.fallback_reason === "budget_guardrail") counters.budget_guardrail_count++;

    if (result.output.classification_source === "hybrid") {
        counters.hybrid_count++;
    } else {
        counters.rule_only_count++;
    }

    if (result.needsLlm && result.output.classification_source === "hybrid") {
        counters.llm_routed_count++;
    }

    return true;
}

export function buildAnalyzeWarnings(
    totalProcessed: number,
    totalReviewsInput: number,
    counters: AnalyzeCounters,
    cbState: ReturnType<CircuitBreaker["getState"]>
) {
    const spamRatio = totalReviewsInput > 0 ? counters.filtered_spam / totalReviewsInput : 0;
    const llmRoutedRatio = totalProcessed > 0 ? counters.llm_routed_count / totalProcessed : 0;
    const ruleCoverageDrop = totalProcessed > 0 && llmRoutedRatio > 0.4;

    const warnings: string[] = [];
    if (cbState.consecutiveFailures > 0) warnings.push("LLM Fallback Triggered");
    if (spamRatio > 0.2) warnings.push("Suspiciously high spam ratio detected.");
    if (counters.budget_guardrail_count > 0) warnings.push("Budget guardrail triggered; routed reviews fell back to rule engine.");

    const degradedReasons = [
        ...(cbState.consecutiveFailures > 0 ? ["llm_fallback_triggered"] : []),
        ...(counters.timeout_count > 0 ? ["llm_timeout"] : []),
        ...(counters.rate_limit_count > 0 ? ["rate_limited"] : []),
        ...(counters.budget_guardrail_count > 0 ? ["budget_guardrail"] : [])
    ];

    return {
        spamRatio,
        llmRoutedRatio,
        ruleCoverageDrop,
        warnings,
        degradedMode: degradedReasons.length > 0,
        degradedReasons
    };
}
