import { z } from "zod";
import { AnalyzeDeps, analyzeReviewsTool } from "../tools/analyze.js";
import { AppError, createError } from "../utils/errors.js";

export function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function asTextResponse(data: unknown) {
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

export async function ensureAnalyzedReviewsInArgs(
    args: unknown,
    deps: AnalyzeDeps,
    toolName: string,
    analyzeInput?: Record<string, unknown>
) {
    const argRecord = asRecord(args);
    if (Array.isArray(argRecord.reviews) && argRecord.reviews.length > 0) {
        return argRecord;
    }

    const analyzed = await analyzeReviewsTool(analyzeInput ?? {}, deps) as Record<string, unknown>;
    const analyzedData = asRecord(analyzed.data);
    const reviews = analyzedData.reviews;
    if (!Array.isArray(reviews)) {
        throw createError("INTERNAL", `Unable to auto-resolve analyzed reviews for ${toolName}`);
    }

    return { ...argRecord, reviews };
}

export function isMissingRequiredReviews(details: unknown): boolean {
    const detailsRecord = asRecord(details);
    const reviewsNode = asRecord(detailsRecord.reviews);
    const errors = reviewsNode._errors;
    return Array.isArray(errors) && errors.some((err) => String(err).toLowerCase().includes("required"));
}

export function ensureTopIssuesWindow(args: Record<string, unknown>) {
    const options = asRecord(args.options);
    const filters = asRecord(options.filters);
    const hasDateRange = typeof filters.start_date === "string" || typeof filters.end_date === "string";
    const hasWindow = typeof options.window === "string";

    if (hasDateRange || hasWindow) {
        return args;
    }

    return {
        ...args,
        options: {
            ...options,
            window: "this_week"
        }
    };
}

export function resolveTopIssuesMinReviewTarget(args: Record<string, unknown>): number {
    const options = asRecord(args.options);
    const filters = asRecord(options.filters);
    const window = typeof options.window === "string" ? options.window : "this_week";

    const fromWindow = (() => {
        switch (window) {
            case "this_week":
            case "last_7_days":
                return 100;
            case "last_30_days":
                return 500;
            case "last_90_days":
                return 1000;
            case "last_180_days":
                return 1500;
            case "last_12_months":
                return 2000;
            default:
                return 300;
        }
    })();

    const startDateRaw = typeof filters.start_date === "string" ? Date.parse(filters.start_date) : Number.NaN;
    const endDateRaw = typeof filters.end_date === "string" ? Date.parse(filters.end_date) : Number.NaN;
    const referenceDateRaw = typeof options.reference_date === "string" ? Date.parse(options.reference_date) : Date.now();
    const referenceDate = Number.isFinite(referenceDateRaw) ? referenceDateRaw : Date.now();
    let days: number | null = null;

    if (Number.isFinite(startDateRaw) && Number.isFinite(endDateRaw) && endDateRaw >= startDateRaw) {
        days = Math.floor((endDateRaw - startDateRaw) / (24 * 60 * 60 * 1000)) + 1;
    } else if (Number.isFinite(startDateRaw)) {
        days = Math.floor((referenceDate - startDateRaw) / (24 * 60 * 60 * 1000)) + 1;
    } else if (Number.isFinite(endDateRaw)) {
        const fallbackStart = endDateRaw - (29 * 24 * 60 * 60 * 1000);
        days = Math.floor((endDateRaw - fallbackStart) / (24 * 60 * 60 * 1000)) + 1;
    }

    if (days === null || days <= 0) return fromWindow;
    if (days <= 7) return 100;
    if (days <= 31) return 500;
    if (days <= 90) return 1000;
    if (days <= 180) return 1500;
    return 2000;
}

export function hasInternalAnalyzeOptions(args: unknown): boolean {
    const argRecord = asRecord(args);
    const options = asRecord(argRecord.options);
    return "internal_max_reviews" in options || "internal_rule_only" in options;
}

export function adaptDispatcherError(error: unknown, toolName: string, toolsRequiringAnalyzedReviews: Set<string>) {
    if (
        error instanceof AppError
        && error.code === "INVALID_SCHEMA"
        && toolsRequiringAnalyzedReviews.has(toolName)
        && isMissingRequiredReviews(error.details)
    ) {
        return new AppError(
            "INVALID_SCHEMA",
            `${toolName} requires analyzed reviews in the \`reviews\` field. First run \`reviews_analyze\`, then pass \`result.data.reviews\` to ${toolName}.`,
            error.details,
            error
        );
    }

    return error;
}

export const SearchToolArgsSchema = z.object({
    query: z.string().max(1000).default(""),
    limit: z.number().int().min(1).max(100).default(5),
    min_score: z.number().min(1).max(5).optional(),
    max_score: z.number().min(1).max(5).optional(),
    start_date: z.string().min(1).optional(),
    end_date: z.string().min(1).optional(),
    sort_by: z.enum(["relevance", "date"]).default("relevance"),
    sort_direction: z.enum(["asc", "desc"]).default("desc")
}).refine((value) => {
    if (value.min_score !== undefined && value.max_score !== undefined) {
        return value.min_score <= value.max_score;
    }
    return true;
}, {
    message: "min_score must be less than or equal to max_score",
    path: ["min_score"]
}).refine((value) => {
    if (value.start_date) {
        return Number.isFinite(Date.parse(value.start_date));
    }
    return true;
}, {
    message: "start_date must be a valid date string",
    path: ["start_date"]
}).refine((value) => {
    if (value.end_date) {
        return Number.isFinite(Date.parse(value.end_date));
    }
    return true;
}, {
    message: "end_date must be a valid date string",
    path: ["end_date"]
}).refine((value) => {
    if (value.start_date && value.end_date) {
        return new Date(value.start_date).getTime() <= new Date(value.end_date).getTime();
    }
    return true;
}, {
    message: "start_date must be earlier than or equal to end_date",
    path: ["start_date"]
});
