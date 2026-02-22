import { importReviews } from "../tools/import.js";
import { analyzeReviewsTool } from "../tools/analyze.js";
import { getSafetyAlertsTool } from "../tools/safety_alerts.js";
import { summarizeTool } from "../tools/summarize.js";
import { replySuggestTool } from "../tools/reply.js";
import { exportTool } from "../tools/export.js";
import { topIssuesTool } from "../tools/top_issues.js";
import { segmentBreakdownTool } from "../tools/segment_breakdown.js";
import { timeTrendsTool } from "../tools/time_trends.js";
import { compareWindowsTool } from "../tools/compare_windows.js";
import { spikeDetectionTool } from "../tools/spike_detection.js";
import { priorityScoringTool } from "../tools/priority_scoring.js";
import { featureOwnershipMapTool } from "../tools/feature_ownership_map.js";
import { weeklyReportTool } from "../tools/weekly_report.js";
import { getConfigDiagnostics } from "../utils/config.js";
import { createError } from "../utils/errors.js";
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

function asTextResponse(data: unknown) {
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
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
        const { reviews: _reviews, ...sanitizedData } = importData;
        return { data: sanitizedData };
    },
    reviews_analyze: ({ args, deps }) => analyzeReviewsTool(args, deps),
    reviews_get_safety_alerts: ({ args, deps }) => getSafetyAlertsTool(args, deps.vectorStore),
    reviews_summarize: ({ args, deps }) => summarizeTool(args, deps.llmClient),
    reviews_reply_suggest: ({ args, deps }) => replySuggestTool(args, deps.llmClient),
    reviews_export: ({ args }) => exportTool(args),
    reviews_top_issues: ({ args }) => topIssuesTool(args),
    reviews_segment_breakdown: ({ args }) => segmentBreakdownTool(args),
    reviews_time_trends: ({ args }) => timeTrendsTool(args),
    reviews_compare_windows: ({ args }) => compareWindowsTool(args),
    reviews_spike_detection: ({ args }) => spikeDetectionTool(args),
    reviews_priority_scoring: ({ args }) => priorityScoringTool(args),
    reviews_feature_ownership_map: ({ args }) => featureOwnershipMapTool(args),
    reviews_weekly_report: ({ args }) => weeklyReportTool(args),
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
        logger.error("tool.dispatch.failed", {
            request_id: context.request_id,
            tool_name: name,
            phase: "dispatch",
            error_class: "internal",
            message: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}
