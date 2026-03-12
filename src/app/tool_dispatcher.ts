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
import { IVectorStore } from "../domain/ports/vector_store.js";
import { ILLMClient } from "../domain/ports/llm_client.js";
import { logger } from "../utils/logger.js";
import { AnalysisCache } from "../tools/analysis_cache.js";
import { AnalysisPromptContext } from "../tools/analyze_service.js";
import { AnalyzeModelDefaults } from "../tools/analyze_models.js";
import { adaptDispatcherError, asRecord, asTextResponse, ensureAnalyzedReviewsInArgs, ensureTopIssuesWindow, hasInternalAnalyzeOptions, resolveTopIssuesMinReviewTarget, SearchToolArgsSchema } from "./tool_dispatcher_helpers.js";

export interface DispatcherDeps {
    vectorStore: IVectorStore;
    llmClient: ILLMClient;
    promptContext?: AnalysisPromptContext;
    analysisCache?: AnalysisCache;
    modelDefaults?: AnalyzeModelDefaults;
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

export { resolveTopIssuesMinReviewTarget } from "./tool_dispatcher_helpers.js";

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
        const withReviews = await ensureAnalyzedReviewsInArgs(
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
        const actionableError = adaptDispatcherError(error, name, TOOLS_REQUIRING_ANALYZED_REVIEWS);

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
