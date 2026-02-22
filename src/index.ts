import { getConfig } from "./utils/config.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { VoyVectorStore } from "./infrastructure/adapters/voy_vector_store.js";
import { ConcurrentLLMClient } from "./engine/llmClient.js";
import { TOOL_DEFINITIONS } from "./app/tool_registry.js";
import { dispatchToolCall } from "./app/tool_dispatcher.js";
import { AppError } from "./utils/errors.js";

const vectorStore = new VoyVectorStore();
const llmClient = new ConcurrentLLMClient({ apiKey: process.env.ANTHROPIC_API_KEY || "MOCK_KEY", concurrency: 10 });

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
    return { tools: [...TOOL_DEFINITIONS] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        return await dispatchToolCall(request.params.name, request.params.arguments, { vectorStore, llmClient });
    } catch (error: unknown) {
        const err = error instanceof AppError
            ? error
            : new AppError("INTERNAL", error instanceof Error ? error.message : "Unknown error");

        return {
            content: [{ type: "text", text: JSON.stringify({ error: { code: err.code, message: err.message, details: err.details } }) }],
            isError: true
        };
    }
});

async function main() {
    getConfig();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Greenlight App Reviews MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error starting server:", error);
    process.exit(1);
});
