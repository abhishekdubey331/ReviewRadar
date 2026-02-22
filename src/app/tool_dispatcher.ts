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
import { IVectorStore } from "../domain/ports/vector_store.js";
import { ILLMClient } from "../domain/ports/llm_client.js";

export interface DispatcherDeps {
    vectorStore: IVectorStore;
    llmClient: ILLMClient;
}

function asTextResponse(data: unknown) {
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

export async function dispatchToolCall(name: string, args: any, deps: DispatcherDeps) {
    const { vectorStore, llmClient } = deps;

    switch (name) {
        case "reviews_import": {
            const result = await importReviews(args, vectorStore);
            const { reviews, ...sanitizedData } = result.data as any;
            return asTextResponse({ data: sanitizedData });
        }
        case "reviews_analyze":
            return asTextResponse(await analyzeReviewsTool(args, vectorStore));
        case "reviews_get_safety_alerts":
            return asTextResponse(await getSafetyAlertsTool(args, vectorStore));
        case "reviews_summarize":
            return asTextResponse(await summarizeTool(args, llmClient));
        case "reviews_reply_suggest":
            return asTextResponse(await replySuggestTool(args, llmClient));
        case "reviews_export":
            return asTextResponse(await exportTool(args));
        case "reviews_top_issues":
            return asTextResponse(await topIssuesTool(args));
        case "reviews_segment_breakdown":
            return asTextResponse(await segmentBreakdownTool(args));
        case "reviews_time_trends":
            return asTextResponse(await timeTrendsTool(args));
        case "reviews_compare_windows":
            return asTextResponse(await compareWindowsTool(args));
        case "reviews_spike_detection":
            return asTextResponse(await spikeDetectionTool(args));
        case "reviews_priority_scoring":
            return asTextResponse(await priorityScoringTool(args));
        case "reviews_feature_ownership_map":
            return asTextResponse(await featureOwnershipMapTool(args));
        case "reviews_weekly_report":
            return asTextResponse(await weeklyReportTool(args));
        case "reviews_search": {
            const { query = "", ...options } = args || {};
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
            throw new Error("Tool not found");
    }
}
