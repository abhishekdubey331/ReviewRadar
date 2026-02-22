import { z } from "zod";
import { createError } from "../utils/errors.js";
import { AnalyticsFiltersSchema, AnalyticsReviewSchema } from "./analytics_schemas.js";
import { applyFilters } from "../analytics/aggregations.js";

const WindowEnum = z.enum([
    "this_week",
    "last_7_days",
    "last_30_days",
    "last_90_days",
    "last_180_days",
    "last_12_months"
]);

export const ClusterReviewsToolInputSchema = z.object({
    reviews: z.array(AnalyticsReviewSchema),
    options: z.object({
        issue_type: z.string().optional(),
        feature_area: z.string().optional(),
        window: WindowEnum.optional(),
        reference_date: z.string().optional(),
        filters: AnalyticsFiltersSchema.optional(),
        include_unknown_only: z.boolean().optional(),
        max_results: z.number().int().min(1).max(500).default(100).optional()
    }).optional()
}).strict();

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
    return { ...(filters ?? {}), ...resolveWindowRange(window, referenceDate) };
}

export async function clusterReviewsTool(input: unknown) {
    const parseResult = ClusterReviewsToolInputSchema.safeParse(input);
    if (!parseResult.success) {
        throw createError("INVALID_SCHEMA", "Invalid cluster reviews parameters", parseResult.error.format());
    }

    const { reviews, options } = parseResult.data;
    const referenceDate = options?.reference_date ? new Date(options.reference_date) : new Date();
    if (Number.isNaN(referenceDate.getTime())) {
        throw createError("INVALID_SCHEMA", "Invalid cluster reviews parameters", {
            reference_date: { _errors: ["Invalid date string"] }
        });
    }

    const effectiveFilters = mergeFiltersWithWindow(options?.filters, options?.window, referenceDate);
    const byDateAndFilters = applyFilters(reviews, effectiveFilters);

    const issueTypeFilter = options?.issue_type?.trim().toLowerCase();
    const featureAreaFilter = options?.feature_area?.trim().toLowerCase();
    const unknownOnly = options?.include_unknown_only ?? false;
    const maxResults = options?.max_results ?? 100;

    const matched = byDateAndFilters.filter((r) => {
        const issueType = (r.issue_type || "").toLowerCase();
        const featureArea = (r.feature_area || "").toLowerCase();

        if (unknownOnly && !(issueType === "unknown" || featureArea === "unknown")) {
            return false;
        }
        if (issueTypeFilter && issueType !== issueTypeFilter) return false;
        if (featureAreaFilter && featureArea !== featureAreaFilter) return false;
        return true;
    });

    const sorted = matched
        .slice()
        .sort((a, b) => {
            const aTs = a.review_created_at ? Date.parse(a.review_created_at) : Number.NaN;
            const bTs = b.review_created_at ? Date.parse(b.review_created_at) : Number.NaN;
            const aNum = Number.isFinite(aTs) ? aTs : 0;
            const bNum = Number.isFinite(bTs) ? bTs : 0;
            return bNum - aNum;
        })
        .slice(0, maxResults);

    return {
        data: {
            total_reviews_considered: byDateAndFilters.length,
            total_cluster_matches: matched.length,
            returned: sorted.length,
            cluster_filter: {
                issue_type: options?.issue_type ?? null,
                feature_area: options?.feature_area ?? null,
                include_unknown_only: unknownOnly
            },
            window_applied: options?.window ?? null,
            filter_range: effectiveFilters
                ? { start_date: effectiveFilters.start_date ?? null, end_date: effectiveFilters.end_date ?? null }
                : null,
            reviews: sorted
        }
    };
}

