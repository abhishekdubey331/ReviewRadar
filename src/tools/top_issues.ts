import { z } from "zod";
import { createError } from "../utils/errors.js";
import { topIssues } from "../analytics/aggregations.js";
import { AnalyticsFiltersSchema, AnalyticsReviewSchema } from "./analytics_schemas.js";

export const TopIssuesToolInputSchema = z.object({
    reviews: z.array(AnalyticsReviewSchema),
    options: z.object({
        limit: z.number().int().min(1).max(50).default(10).optional(),
        filters: AnalyticsFiltersSchema.optional()
    }).optional()
}).strict();

export async function topIssuesTool(input: unknown) {
    const parseResult = TopIssuesToolInputSchema.safeParse(input);
    if (!parseResult.success) {
        throw createError("INVALID_SCHEMA", "Invalid top issues parameters", parseResult.error.format());
    }

    const { reviews, options } = parseResult.data;
    const result = topIssues(reviews, {
        limit: options?.limit,
        filters: options?.filters
    });

    return { data: result };
}
