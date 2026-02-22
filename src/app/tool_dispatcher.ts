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
import { z } from "zod";

export interface DispatcherDeps {
    vectorStore: IVectorStore;
    llmClient: ILLMClient;
}

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

export async function dispatchToolCall(name: string, args: unknown, deps: DispatcherDeps) {
    const { vectorStore, llmClient } = deps;
    const toolArgs = args as any;

    switch (name) {
        case "reviews_import": {
            const result = await importReviews(toolArgs, vectorStore);
            const { reviews, ...sanitizedData } = result.data as any;
            return asTextResponse({ data: sanitizedData });
        }
        case "reviews_analyze":
            return asTextResponse(await analyzeReviewsTool(toolArgs, { vectorStore, llmClient }));
        case "reviews_get_safety_alerts":
            return asTextResponse(await getSafetyAlertsTool(toolArgs, vectorStore));
        case "reviews_summarize":
            return asTextResponse(await summarizeTool(toolArgs, llmClient));
        case "reviews_reply_suggest":
            return asTextResponse(await replySuggestTool(toolArgs, llmClient));
        case "reviews_export":
            return asTextResponse(await exportTool(toolArgs));
        case "reviews_top_issues":
            return asTextResponse(await topIssuesTool(toolArgs));
        case "reviews_segment_breakdown":
            return asTextResponse(await segmentBreakdownTool(toolArgs));
        case "reviews_time_trends":
            return asTextResponse(await timeTrendsTool(toolArgs));
        case "reviews_compare_windows":
            return asTextResponse(await compareWindowsTool(toolArgs));
        case "reviews_spike_detection":
            return asTextResponse(await spikeDetectionTool(toolArgs));
        case "reviews_priority_scoring":
            return asTextResponse(await priorityScoringTool(toolArgs));
        case "reviews_feature_ownership_map":
            return asTextResponse(await featureOwnershipMapTool(toolArgs));
        case "reviews_weekly_report":
            return asTextResponse(await weeklyReportTool(toolArgs));
        case "reviews_search": {
            const parsedArgs = asRecord(args);
            const searchParse = SearchToolArgsSchema.safeParse(parsedArgs);
            if (!searchParse.success) {
                throw createError("INVALID_SCHEMA", "Invalid search parameters", searchParse.error.format());
            }

            const { query, ...options } = searchParse.data;
            const results = await vectorStore.search(query, options);
            return asTextResponse({ results });
        }
        case "reviews_get_index_status":
            return asTextResponse(await vectorStore.getIndexStatus());
        case "reviews_diagnose_runtime": {
            const data = {
                node_version: process.version,
                process_cwd: process.cwd(),
                config: getConfigDiagnostics(),
                storage: vectorStore.getStorageDiagnostics()
            };
            return asTextResponse(data);
        }
        default:
            throw createError("INVALID_SCHEMA", "Tool not found", { tool_name: name });
    }
}
