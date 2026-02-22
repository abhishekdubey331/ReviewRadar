import { z } from "zod";
import { createError } from "../utils/errors.js";
import { topIssues } from "../analytics/aggregations.js";
import { AnalyticsReviewSchema } from "./analytics_schemas.js";

const OwnershipRuleSchema = z.object({
    feature_area: z.string(),
    issue_type: z.string().optional(),
    squad: z.string(),
    owner: z.string()
}).strict();

export const FeatureOwnershipMapToolInputSchema = z.object({
    reviews: z.array(AnalyticsReviewSchema),
    ownership_rules: z.array(OwnershipRuleSchema),
    options: z.object({
        include_unmapped: z.boolean().default(true).optional(),
        top_n: z.number().int().min(1).max(50).default(20).optional()
    }).optional()
}).strict();

export async function featureOwnershipMapTool(input: unknown) {
    const parseResult = FeatureOwnershipMapToolInputSchema.safeParse(input);
    if (!parseResult.success) {
        throw createError("INVALID_SCHEMA", "Invalid feature ownership mapping parameters", parseResult.error.format());
    }
    const { reviews, ownership_rules, options } = parseResult.data;
    const includeUnmapped = options?.include_unmapped ?? true;

    const mapped = topIssues(reviews, { limit: 500 }).issues.map((i) => {
        const matched = ownership_rules.find((r) => r.feature_area === i.feature_area && (!r.issue_type || r.issue_type === i.issue_type));
        return {
            issue_key: i.issue_key,
            issue_type: i.issue_type,
            feature_area: i.feature_area,
            review_count: i.review_count,
            squad: matched?.squad || null,
            owner: matched?.owner || null,
            is_unmapped: !matched
        };
    }).filter((r) => includeUnmapped || !r.is_unmapped)
        .sort((a, b) => b.review_count - a.review_count)
        .slice(0, options?.top_n ?? 20);

    return { data: { mappings: mapped } };
}
