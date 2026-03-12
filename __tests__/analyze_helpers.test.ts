import { describe, expect, it } from "vitest";
import { resolveAnalyzeModelDefaults } from "../src/tools/analyze_models.js";
import { selectReviewsForAnalysis } from "../src/tools/analyze_selection.js";
import { buildAnalyzeWarnings, createAnalyzeCounters, trackAnalyzeResult } from "../src/tools/analyze_metrics.js";

describe("analyze helper modules", () => {
    it("resolves model defaults from explicit options first", () => {
        const defaults = resolveAnalyzeModelDefaults(
            { routing_model: "r-custom", summary_model: "s-custom" },
            { routing: "r-default", summary: "s-default" }
        );

        expect(defaults).toEqual({ routing: "r-custom", summary: "s-custom" });
    });

    it("selects most recent reviews first", () => {
        const selected = selectReviewsForAnalysis([
            { review_id: "1", content: "a", score: 1, review_created_at: "2026-01-01T00:00:00.000Z" },
            { review_id: "2", content: "b", score: 1, review_created_at: "2026-01-03T00:00:00.000Z" },
            { review_id: "3", content: "c", score: 1, review_created_at: "2026-01-02T00:00:00.000Z" }
        ], 2);

        expect(selected.map((review) => review.review_id)).toEqual(["2", "3"]);
    });

    it("tracks analyze counters and warning state", () => {
        const counters = createAnalyzeCounters();
        trackAnalyzeResult({
            type: "processed",
            review: { review_id: "1", content: "x", score: 1 },
            needsLlm: true,
            output: {
                issue_type: "Bug",
                feature_area: "Crash Detection",
                severity: "P1",
                sentiment: "Negative",
                confidence_score: 0.8,
                classification_source: "hybrid",
                is_spam: false
            },
            fallback_reason: "timeout"
        }, counters);

        const diagnostics = buildAnalyzeWarnings(1, 2, counters, {
            inputTokens: 0,
            outputTokens: 0,
            consecutiveFailures: 1,
            totalCalls: 1,
            totalFailures: 1,
            estimatedCostUsd: 0.01,
            recentCalls: [false]
        });

        expect(counters.hybrid_count).toBe(1);
        expect(counters.llm_routed_count).toBe(1);
        expect(counters.timeout_count).toBe(1);
        expect(diagnostics.warnings).toContain("LLM Fallback Triggered");
        expect(diagnostics.degradedMode).toBe(true);
    });
});
