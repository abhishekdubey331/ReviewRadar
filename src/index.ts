import { getConfig } from "./utils/config.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { VoyVectorStore } from "./infrastructure/adapters/voy_vector_store.js";
import { ConcurrentLLMClient } from "./engine/llmClient.js";
import { TOOL_DEFINITIONS } from "./app/tool_registry.js";
import { dispatchToolCall } from "./app/tool_dispatcher.js";

// Validate environment on boot
getConfig();

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

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    try {
        return await dispatchToolCall(request.params.name, request.params.arguments, { vectorStore, llmClient });
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
