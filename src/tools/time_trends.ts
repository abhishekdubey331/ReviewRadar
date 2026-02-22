import { z } from "zod";
import { createError } from "../utils/errors.js";
import { timeTrends } from "../analytics/aggregations.js";

const AnalyticsReviewSchema = z.object({
    review_id: z.string(),
    issue_type: z.string(),
    feature_area: z.string(),
    severity: z.enum(["P0", "P1", "P2", "FYI"]).optional(),
    sentiment: z.enum(["Positive", "Mixed", "Neutral", "Negative"]).optional(),
    review_created_at: z.string().optional(),
    score: z.number().int().min(1).max(5).optional(),
    app_version: z.string().optional(),
    os_version: z.string().optional(),
    device: z.string().optional(),
    locale: z.string().optional(),
    platform: z.string().optional()
}).strict();

const AnalyticsFiltersSchema = z.object({
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    severities: z.array(z.string()).optional(),
    sentiments: z.array(z.string()).optional(),
    feature_areas: z.array(z.string()).optional(),
    issue_types: z.array(z.string()).optional()
}).strict();

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
