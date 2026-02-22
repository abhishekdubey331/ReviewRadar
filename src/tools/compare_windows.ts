import { z } from "zod";
import { createError } from "../utils/errors.js";
import { topIssues } from "../analytics/aggregations.js";
import { AnalyticsReviewSchema } from "./analytics_schemas.js";

export const CompareWindowsToolInputSchema = z.object({
    baseline_reviews: z.array(AnalyticsReviewSchema),
    current_reviews: z.array(AnalyticsReviewSchema),
    options: z.object({
        top_n: z.number().int().min(1).max(20).default(5).optional()
    }).optional()
}).strict();

export async function compareWindowsTool(input: unknown) {
    const parseResult = CompareWindowsToolInputSchema.safeParse(input);
    if (!parseResult.success) {
        throw createError("INVALID_SCHEMA", "Invalid compare windows parameters", parseResult.error.format());
    }

    const { baseline_reviews, current_reviews, options } = parseResult.data;
    const topN = options?.top_n ?? 5;

    const baseTotal = baseline_reviews.length;
    const currTotal = current_reviews.length;
    const baseNegative = baseline_reviews.filter((r) => r.sentiment === "Negative").length;
    const currNegative = current_reviews.filter((r) => r.sentiment === "Negative").length;
    const baseCritical = baseline_reviews.filter((r) => r.severity === "P0" || r.severity === "P1").length;
    const currCritical = current_reviews.filter((r) => r.severity === "P0" || r.severity === "P1").length;

    const metricRows = [
        { metric: "total_reviews", baseline: baseTotal, current: currTotal },
        { metric: "negative_share", baseline: baseTotal ? baseNegative / baseTotal : 0, current: currTotal ? currNegative / currTotal : 0 },
        { metric: "critical_share", baseline: baseTotal ? baseCritical / baseTotal : 0, current: currTotal ? currCritical / currTotal : 0 }
    ].map((m) => {
        const delta = m.current - m.baseline;
        const deltaPct = m.baseline === 0 ? null : (delta / m.baseline);
        return {
            ...m,
            delta: Number(delta.toFixed(4)),
            delta_pct: deltaPct === null ? null : Number(deltaPct.toFixed(4)),
            is_regression: delta > 0
        };
    });

    const baseIssues = topIssues(baseline_reviews, { limit: 500 }).issues;
    const currIssues = topIssues(current_reviews, { limit: 500 }).issues;
    const baseMap = new Map(baseIssues.map((i) => [i.issue_key, i.review_count]));
    const currMap = new Map(currIssues.map((i) => [i.issue_key, i.review_count]));
    const issueKeys = Array.from(new Set([...baseMap.keys(), ...currMap.keys()]));

    const issueDeltas = issueKeys.map((key) => {
        const baseline = baseMap.get(key) || 0;
        const current = currMap.get(key) || 0;
        const delta = current - baseline;
        return {
            issue_key: key,
            baseline,
            current,
            delta,
            delta_pct: baseline === 0 ? null : Number((delta / baseline).toFixed(4)),
            is_regression: delta > 0
        };
    }).sort((a, b) => {
        if (b.delta !== a.delta) return b.delta - a.delta;
        return a.issue_key.localeCompare(b.issue_key);
    });

    return {
        data: {
            metrics: metricRows,
            top_regressions: issueDeltas.filter((d) => d.is_regression).slice(0, topN),
            top_improvements: issueDeltas.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, topN)
        }
    };
}
