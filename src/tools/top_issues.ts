import { z } from "zod";
import { createError } from "../utils/errors.js";
import { topIssues } from "../analytics/aggregations.js";
import { AnalyticsFiltersSchema, AnalyticsReviewSchema } from "./analytics_schemas.js";

const WindowEnum = z.enum([
    "this_week",
    "last_7_days",
    "last_30_days",
    "last_90_days",
    "last_180_days",
    "last_12_months"
]);

export const TopIssuesToolInputSchema = z.object({
    reviews: z.array(AnalyticsReviewSchema),
    options: z.object({
        filters: AnalyticsFiltersSchema.optional(),
        window: WindowEnum.optional(),
        reference_date: z.string().optional()
    }).optional()
}).strict();

const TOP_ISSUES_OUTPUT_LIMIT = 25;

function toIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function startOfUtcWeek(date: Date): Date {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay();
    const shift = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + shift);
    return d;
}

function resolveWindowRange(window: z.infer<typeof WindowEnum>, referenceDate: Date) {
    const end = toIsoDate(referenceDate);

    if (window === "this_week") {
        return { start_date: toIsoDate(startOfUtcWeek(referenceDate)), end_date: end };
    }

    if (window === "last_7_days") {
        const start = new Date(referenceDate);
        start.setUTCDate(start.getUTCDate() - 6);
        return { start_date: toIsoDate(start), end_date: end };
    }

    const start = new Date(referenceDate);
    const lookbackDays = window === "last_30_days"
        ? 29
        : window === "last_90_days"
            ? 89
            : window === "last_180_days"
                ? 179
                : 364;
    start.setUTCDate(start.getUTCDate() - lookbackDays);
    return { start_date: toIsoDate(start), end_date: end };
}

function mergeFiltersWithWindow(
    filters: z.infer<typeof AnalyticsFiltersSchema> | undefined,
    window: z.infer<typeof WindowEnum> | undefined,
    referenceDate: Date
) {
    if (!window) return filters;
    if (filters?.start_date || filters?.end_date) return filters;
    const windowRange = resolveWindowRange(window, referenceDate);
    return {
        ...(filters ?? {}),
        ...windowRange
    };
}

export async function topIssuesTool(input: unknown) {
    const parseResult = TopIssuesToolInputSchema.safeParse(input);
    if (!parseResult.success) {
        throw createError("INVALID_SCHEMA", "Invalid top issues parameters", parseResult.error.format());
    }

    const { reviews, options } = parseResult.data;
    const referenceDate = options?.reference_date
        ? new Date(options.reference_date)
        : new Date();
    if (Number.isNaN(referenceDate.getTime())) {
        throw createError("INVALID_SCHEMA", "Invalid top issues parameters", {
            reference_date: { _errors: ["Invalid date string"] }
        });
    }
    const effectiveFilters = mergeFiltersWithWindow(options?.filters, options?.window, referenceDate);
    const result = topIssues(reviews, {
        limit: TOP_ISSUES_OUTPUT_LIMIT,
        filters: effectiveFilters
    });

    return {
        data: {
            ...result,
            window_applied: options?.window ?? null,
            filter_range: effectiveFilters
                ? { start_date: effectiveFilters.start_date ?? null, end_date: effectiveFilters.end_date ?? null }
                : null
        }
    };
}
