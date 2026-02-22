import { z } from "zod";
import { createError } from "../utils/errors.js";
import { timeTrends } from "../analytics/aggregations.js";
import { AnalyticsFiltersSchema, AnalyticsReviewSchema } from "./analytics_schemas.js";

export const TimeTrendsToolInputSchema = z.object({
    reviews: z.array(AnalyticsReviewSchema),
    options: z.object({
        bucket: z.enum(["day", "week"]).default("week").optional(),
        top_issue_limit: z.number().int().min(1).max(10).default(3).optional(),
        filters: AnalyticsFiltersSchema.optional()
    }).optional()
}).strict();

export async function timeTrendsTool(input: unknown) {
    const parseResult = TimeTrendsToolInputSchema.safeParse(input);
    if (!parseResult.success) {
        throw createError("INVALID_SCHEMA", "Invalid time trends parameters", parseResult.error.format());
    }

    const { reviews, options } = parseResult.data;
    const result = timeTrends(reviews, {
        bucket: options?.bucket,
        top_issue_limit: options?.top_issue_limit,
        filters: options?.filters
    });
    return { data: result };
}
