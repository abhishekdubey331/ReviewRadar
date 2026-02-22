import { importReviews } from "../tools/import.js";
import { analyzeReviewsTool } from "../tools/analyze.js";
import { getCriticalAlertsTool } from "../tools/safety_alerts.js";
import { summarizeTool } from "../tools/summarize.js";
import { exportTool } from "../tools/export.js";
import { topIssuesTool } from "../tools/top_issues.js";
import { segmentBreakdownTool } from "../tools/segment_breakdown.js";
import { timeTrendsTool } from "../tools/time_trends.js";
import { compareWindowsTool } from "../tools/compare_windows.js";
import { spikeDetectionTool } from "../tools/spike_detection.js";
import { priorityScoringTool } from "../tools/priority_scoring.js";
import { featureOwnershipMapTool } from "../tools/feature_ownership_map.js";
import { weeklyReportTool } from "../tools/weekly_report.js";
import { clusterReviewsTool } from "../tools/cluster_reviews.js";
import { getConfigDiagnostics } from "../utils/config.js";
import { createError } from "../utils/errors.js";
import { AppError } from "../utils/errors.js";
import { IVectorStore } from "../domain/ports/vector_store.js";
import { ILLMClient } from "../domain/ports/llm_client.js";
import { logger } from "../utils/logger.js";
import { z } from "zod";

export interface DispatcherDeps {
    vectorStore: IVectorStore;
    llmClient: ILLMClient;
}

export interface DispatchContext {
    request_id?: string;
    tool_name?: string;
}

interface ToolHandlerContext {
    args: unknown;
    deps: DispatcherDeps;
    context: DispatchContext;
}

type ToolHandler = (ctx: ToolHandlerContext) => Promise<unknown>;

const TOOLS_REQUIRING_ANALYZED_REVIEWS = new Set([
    "reviews_summarize",
    "reviews_export",
    "reviews_top_issues",
    "reviews_segment_breakdown",
    "reviews_time_trends",
    "reviews_spike_detection",
    "reviews_priority_scoring",
    "reviews_feature_ownership_map",
    "reviews_weekly_report"
    ,
    "reviews_cluster_reviews"
]);

async function ensureAnalyzedReviewsInArgs(args: unknown, deps: DispatcherDeps, toolName: string) {
    const argRecord = asRecord(args);
    if (Array.isArray(argRecord.reviews) && argRecord.reviews.length > 0) {
        return argRecord;
    }

    const analyzed = await analyzeReviewsTool({}, deps) as Record<string, unknown>;
    const analyzedData = asRecord(analyzed.data);
    const reviews = analyzedData.reviews;
    if (!Array.isArray(reviews)) {
        throw createError("INTERNAL", `Unable to auto-resolve analyzed reviews for ${toolName}`);
    }

    return { ...argRecord, reviews };
}

async function ensureAnalyzedReviewsInArgsWithAnalyzeInput(
    args: unknown,
    deps: DispatcherDeps,
    toolName: string,
    analyzeInput: Record<string, unknown>
) {
    const argRecord = asRecord(args);
    if (Array.isArray(argRecord.reviews) && argRecord.reviews.length > 0) {
        return argRecord;
    }

    const analyzed = await analyzeReviewsTool(analyzeInput, deps) as Record<string, unknown>;
    const analyzedData = asRecord(analyzed.data);
    const reviews = analyzedData.reviews;
    if (!Array.isArray(reviews)) {
        throw createError("INTERNAL", `Unable to auto-resolve analyzed reviews for ${toolName}`);
    }

    return { ...argRecord, reviews };
}

function isMissingRequiredReviews(details: unknown): boolean {
    const detailsRecord = asRecord(details);
    const reviewsNode = asRecord(detailsRecord.reviews);
    const errors = reviewsNode._errors;
    return Array.isArray(errors) && errors.some((err) => String(err).toLowerCase().includes("required"));
}

function asTextResponse(data: unknown) {
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function ensureTopIssuesWindow(args: Record<string, unknown>) {
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

function hasInternalAnalyzeOptions(args: unknown): boolean {
    const argRecord = asRecord(args);
    const options = asRecord(argRecord.options);
    return "internal_max_reviews" in options || "internal_rule_only" in options;
}

const SearchToolArgsSchema = z.object({
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

const TOOL_HANDLERS: Record<string, ToolHandler> = {
    reviews_import: async ({ args, deps }) => {
        const result = await importReviews(args, deps.vectorStore);
        const importData = result.data as Record<string, unknown>;
        const metadata = asRecord(importData.metadata);

        return {
            data: {
                import_status: metadata.import_status ?? "unknown",
                total_processed: metadata.total_processed ?? 0,
                vector_indexing_status: metadata.vector_indexing_status ?? "unknown",
                filtered_spam: metadata.filtered_spam ?? 0,
                invalid_rows_dropped: metadata.invalid_rows_dropped ?? 0,
                duplicates_dropped: metadata.duplicates_dropped ?? 0,
                processed_at: metadata.processed_at ?? null,
                message: importData.message ?? "Import completed."
            }
        };
    },
    reviews_analyze: ({ args, deps }) => {
        if (hasInternalAnalyzeOptions(args)) {
            throw createError("INVALID_SCHEMA", "Invalid analyze parameters", {
                options: { _errors: ["internal_* options are reserved for server orchestration"] }
            });
        }
        return analyzeReviewsTool(args, deps);
    },
    reviews_get_critical_alerts: ({ args, deps }) => getCriticalAlertsTool(args, deps.vectorStore),
    reviews_summarize: async ({ args, deps }) => summarizeTool(await ensureAnalyzedReviewsInArgs(args, deps, "reviews_summarize"), deps.llmClient),
    reviews_export: async ({ args, deps }) => exportTool(await ensureAnalyzedReviewsInArgs(args, deps, "reviews_export")),
    reviews_top_issues: async ({ args, deps }) => {
        const withWindow = ensureTopIssuesWindow(asRecord(args));
        const minReviews = resolveTopIssuesMinReviewTarget(withWindow);
        const withReviews = await ensureAnalyzedReviewsInArgsWithAnalyzeInput(
            withWindow,
            deps,
            "reviews_top_issues",
            { options: { internal_max_reviews: minReviews, internal_rule_only: true } }
        );
        return topIssuesTool(withReviews);
    },
    reviews_segment_breakdown: async ({ args, deps }) => segmentBreakdownTool(await ensureAnalyzedReviewsInArgs(args, deps, "reviews_segment_breakdown")),
    reviews_time_trends: async ({ args, deps }) => timeTrendsTool(await ensureAnalyzedReviewsInArgs(args, deps, "reviews_time_trends")),
    reviews_compare_windows: ({ args }) => compareWindowsTool(args),
    reviews_spike_detection: async ({ args, deps }) => spikeDetectionTool(await ensureAnalyzedReviewsInArgs(args, deps, "reviews_spike_detection")),
    reviews_priority_scoring: async ({ args, deps }) => priorityScoringTool(await ensureAnalyzedReviewsInArgs(args, deps, "reviews_priority_scoring")),
    reviews_feature_ownership_map: async ({ args, deps }) => featureOwnershipMapTool(await ensureAnalyzedReviewsInArgs(args, deps, "reviews_feature_ownership_map")),
    reviews_weekly_report: async ({ args, deps }) => weeklyReportTool(await ensureAnalyzedReviewsInArgs(args, deps, "reviews_weekly_report")),
    reviews_cluster_reviews: async ({ args, deps }) => clusterReviewsTool(await ensureAnalyzedReviewsInArgs(args, deps, "reviews_cluster_reviews")),
    reviews_search: async ({ args, deps }) => {
        const parsedArgs = asRecord(args);
        const searchParse = SearchToolArgsSchema.safeParse(parsedArgs);
        if (!searchParse.success) {
            throw createError("INVALID_SCHEMA", "Invalid search parameters", searchParse.error.format());
        }

        const { query, ...options } = searchParse.data;
        const results = await deps.vectorStore.search(query, options);
        return { results };
    },
    reviews_get_index_status: ({ deps }) => deps.vectorStore.getIndexStatus(),
    reviews_diagnose_runtime: async ({ deps }) => ({
        node_version: process.version,
        process_cwd: process.cwd(),
        config: getConfigDiagnostics(),
        storage: deps.vectorStore.getStorageDiagnostics()
    })
};

export async function dispatchToolCall(name: string, args: unknown, deps: DispatcherDeps, context: DispatchContext = {}) {
    const handler = TOOL_HANDLERS[name];
    if (!handler) {
        throw createError("INVALID_SCHEMA", "Tool not found", { tool_name: name });
    }

    logger.info("tool.dispatch.start", {
        request_id: context.request_id,
        tool_name: name,
        phase: "dispatch"
    });

    try {
        const data = await handler({ args, deps, context: { ...context, tool_name: name } });
        logger.info("tool.dispatch.success", {
            request_id: context.request_id,
            tool_name: name,
            phase: "dispatch"
        });
        return asTextResponse(data);
    } catch (error) {
        const actionableError = error instanceof AppError
            && error.code === "INVALID_SCHEMA"
            && TOOLS_REQUIRING_ANALYZED_REVIEWS.has(name)
            && isMissingRequiredReviews(error.details)
            ? new AppError(
                "INVALID_SCHEMA",
                `${name} requires analyzed reviews in the \`reviews\` field. First run \`reviews_analyze\`, then pass \`result.data.reviews\` to ${name}.`,
                error.details,
                error
            )
            : error;

        logger.error("tool.dispatch.failed", {
            request_id: context.request_id,
            tool_name: name,
            phase: "dispatch",
            error_class: "internal",
            message: actionableError instanceof Error ? actionableError.message : String(actionableError)
        });
        throw actionableError;
    }
}
