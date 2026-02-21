import { getConfig, getConfigDiagnostics } from "./utils/config.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { importReviews } from "./tools/import.js";
import { analyzeReviewsTool } from "./tools/analyze.js";
import { getSafetyAlertsTool } from "./tools/safety_alerts.js";
import { summarizeTool } from "./tools/summarize.js";
import { replySuggestTool } from "./tools/reply.js";
import { exportTool } from "./tools/export.js";
import { VoyVectorStore } from "./infrastructure/adapters/voy_vector_store.js";
import { ConcurrentLLMClient } from "./engine/llmClient.js";

// Validate environment on boot
const envConfig = getConfig();

// Composition Root - Global instances
const vectorStore = new VoyVectorStore();
const llmClient = new ConcurrentLLMClient({ apiKey: process.env.ANTHROPIC_API_KEY || 'MOCK_KEY', concurrency: 10 });

const server = new Server(
    {
        name: "Greenlight-App-Reviews-MCP",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "reviews_import",
                description: "Import app reviews securely from the auto-scraped dataset.",
                inputSchema: {
                    type: "object",
                    properties: {
                        source: { type: "object", description: "Optional source override. If omitted, uses sample_data/scraped_reviews.csv." }
                    }
                }
            },
            {
                name: "reviews_analyze",
                description: "Analyze reviews using hybrid deterministic rules and LLM routing.",
                inputSchema: {
                    type: "object",
                    properties: {
                        source: { type: "object" },
                        options: { type: "object" }
                    },
                    required: ["source"]
                }
            },
            {
                name: "reviews_get_safety_alerts",
                description: "Fast-path tool to get only P0 and P1 safety alerts.",
                inputSchema: {
                    type: "object",
                    properties: {
                        source: { type: "object" },
                        options: { type: "object" }
                    },
                    required: ["source"]
                }
            },
            {
                name: "reviews_summarize",
                description: "Summarize a list of analyzed reviews to extract themes and counts.",
                inputSchema: {
                    type: "object",
                    properties: {
                        reviews: {
                            type: "array",
                            items: { type: "object" }
                        }
                    },
                    required: ["reviews"]
                }
            },
            {
                name: "reviews_reply_suggest",
                description: "Draft a policy-compliant reply to a user review.",
                inputSchema: {
                    type: "object",
                    properties: {
                        review_text: { type: "string" },
                        tone: { type: "string" }
                    },
                    required: ["review_text"]
                }
            },
            {
                name: "reviews_export",
                description: "Export analyzed reviews into different formats (e.g. Markdown or Jira).",
                inputSchema: {
                    type: "object",
                    properties: {
                        format: { type: "string", enum: ["markdown", "jira"] },
                        reviews: {
                            type: "array",
                            items: { type: "object" }
                        }
                    },
                    required: ["format", "reviews"]
                }
            },
            {
                name: "reviews_search",
                description: "Semantically search through imported reviews using a natural language query with optional filtering and sorting.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "The search query (e.g. 'battery drain problems')" },
                        limit: { type: "number", default: 5 },
                        min_score: { type: "number", description: "Minimum star rating (1-5)" },
                        max_score: { type: "number", description: "Maximum star rating (1-5)" },
                        start_date: { type: "string", description: "ISO date string (e.g. '2024-01-01')" },
                        end_date: { type: "string", description: "ISO date string (e.g. '2024-12-31')" },
                        sort_by: { type: "string", enum: ["relevance", "date"], default: "relevance", description: "Sort by semantic relevance or recency" },
                        sort_direction: { type: "string", enum: ["asc", "desc"], default: "desc", description: "Chronological sort order: 'desc' for newest first, 'asc' for oldest first." }
                    },
                    required: []
                }
            },
            {
                name: "reviews_get_index_status",
                description: "Get diagnostic information about the vector database, including metadata health and record counts.",
                inputSchema: { type: "object", properties: {} }
            },
            {
                name: "reviews_diagnose_runtime",
                description: "Get runtime diagnostics for env loading and index storage paths (keys are masked).",
                inputSchema: { type: "object", properties: {} }
            }
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    try {
        if (request.params.name === "reviews_import") {
            const result = await importReviews(request.params.arguments, vectorStore);
            // Internal tools need the data, but we strip it for the MCP response to avoid bloat
            const { reviews, ...sanitizedData } = result.data as any;
            return {
                content: [{ type: "text", text: JSON.stringify({ data: sanitizedData }) }]
            };
        }

        if (request.params.name === "reviews_analyze") {
            const data = await analyzeReviewsTool(request.params.arguments, vectorStore);
            return {
                content: [{ type: "text", text: JSON.stringify(data) }]
            };
        }

        if (request.params.name === "reviews_get_safety_alerts") {
            const data = await getSafetyAlertsTool(request.params.arguments, vectorStore);
            return {
                content: [{ type: "text", text: JSON.stringify(data) }]
            };
        }

        if (request.params.name === "reviews_summarize") {
            const data = await summarizeTool(request.params.arguments, llmClient);
            return {
                content: [{ type: "text", text: JSON.stringify(data) }]
            };
        }

        if (request.params.name === "reviews_reply_suggest") {
            const data = await replySuggestTool(request.params.arguments, llmClient);
            return {
                content: [{ type: "text", text: JSON.stringify(data) }]
            };
        }

        if (request.params.name === "reviews_export") {
            const data = await exportTool(request.params.arguments);
            return {
                content: [{ type: "text", text: JSON.stringify(data) }]
            };
        }

        if (request.params.name === "reviews_search") {
            const { query = "", ...options } = request.params.arguments;
            const results = await vectorStore.search(query, options);

            return {
                content: [{ type: "text", text: JSON.stringify({ results }) }]
            };
        }

        if (request.params.name === "reviews_get_index_status") {
            const status = await vectorStore.getIndexStatus();
            return {
                content: [{ type: "text", text: JSON.stringify(status) }]
            };
        }

        if (request.params.name === "reviews_diagnose_runtime") {
            const data = {
                node_version: process.version,
                process_cwd: process.cwd(),
                config: getConfigDiagnostics(),
                storage: vectorStore.getStorageDiagnostics()
            };
            return {
                content: [{ type: "text", text: JSON.stringify(data) }]
            };
        }

        throw new Error("Tool not found");
    } catch (e: any) {
        return {
            content: [{ type: "text", text: JSON.stringify({ error: { code: e.code || "INTERNAL", message: e.message } }) }],
            isError: true
        };
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Greenlight App Reviews MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error starting server:", error);
    process.exit(1);
});
