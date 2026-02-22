import { z } from "zod";
import { createError } from "../utils/errors.js";
import { segmentBreakdown } from "../analytics/aggregations.js";
import { AnalyticsFiltersSchema, AnalyticsReviewSchema } from "./analytics_schemas.js";

export const SegmentBreakdownToolInputSchema = z.object({
    reviews: z.array(AnalyticsReviewSchema),
    options: z.object({
        dimension: z.enum(["app_version", "os_version", "device", "locale", "platform", "rating_bucket"]),
        limit: z.number().int().min(1).max(100).default(10).optional(),
        filters: AnalyticsFiltersSchema.optional()
    })
}).strict();

export async function segmentBreakdownTool(input: unknown) {
    const parseResult = SegmentBreakdownToolInputSchema.safeParse(input);
    if (!parseResult.success) {
        throw createError("INVALID_SCHEMA", "Invalid segment breakdown parameters", parseResult.error.format());
    }

    const { reviews, options } = parseResult.data;
    const result = segmentBreakdown(reviews, {
        dimension: options.dimension,
        limit: options.limit,
        filters: options.filters
    });

    return { data: result };
}
