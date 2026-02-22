import { z } from "zod";
import { createError } from "../utils/errors.js";
import { AnalyticsReviewSchema } from "./analytics_schemas.js";
import { topIssues } from "../analytics/aggregations.js";
import { spikeDetectionTool } from "./spike_detection.js";
import { priorityScoringTool } from "./priority_scoring.js";
import { featureOwnershipMapTool } from "./feature_ownership_map.js";

const OwnershipRuleSchema = z.object({
    feature_area: z.string(),
    issue_type: z.string().optional(),
    squad: z.string(),
    owner: z.string()
}).strict();

export const WeeklyReportToolInputSchema = z.object({
    reviews: z.array(AnalyticsReviewSchema),
    ownership_rules: z.array(OwnershipRuleSchema).optional(),
    options: z.object({
        top_n: z.number().int().min(1).max(20).default(5).optional()
    }).optional()
}).strict();

export async function weeklyReportTool(input: unknown) {
    const parseResult = WeeklyReportToolInputSchema.safeParse(input);
    if (!parseResult.success) {
        throw createError("INVALID_SCHEMA", "Invalid weekly report parameters", parseResult.error.format());
    }
    const { reviews, ownership_rules, options } = parseResult.data;
    const topN = options?.top_n ?? 5;
    const total = reviews.length;
    const negative = reviews.filter((r) => r.sentiment === "Negative").length;
    const critical = reviews.filter((r) => r.severity === "P0" || r.severity === "P1").length;

    const top = topIssues(reviews, { limit: topN }).issues;
    const spikes = await spikeDetectionTool({ reviews, options: { top_n: topN } });
    const priorities = await priorityScoringTool({ reviews, options: { top_n: topN } });

    const ownership = ownership_rules && ownership_rules.length > 0
        ? await featureOwnershipMapTool({ reviews, ownership_rules, options: { include_unmapped: false, top_n: topN } })
        : { data: { mappings: [] } };

    return {
        data: {
            summary: {
                total_reviews: total,
                negative_share: total ? Number((negative / total).toFixed(4)) : 0,
                critical_share: total ? Number((critical / total).toFixed(4)) : 0
            },
            top_issues: top,
            spike_alerts: spikes.data.alerts,
            priority_rankings: priorities.data.rankings,
            ownership_assignments: ownership.data.mappings
        }
    };
}
