import { getConfig } from "./utils/config.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { VoyVectorStore } from "./infrastructure/adapters/voy_vector_store.js";
import { ConcurrentLLMClient } from "./engine/llmClient.js";
import { TOOL_DEFINITIONS } from "./app/tool_registry.js";
import { dispatchToolCall } from "./app/tool_dispatcher.js";
import { AppError } from "./utils/errors.js";
import { resolveStorageDir } from "./utils/config.js";

function buildRuntimeDeps() {
    // Validate configuration once at the composition root before creating dependencies.
    const config = getConfig();
    return {
        vectorStore: new VoyVectorStore({ storageDir: resolveStorageDir(config.STORAGE_DIR) }),
        llmClient: new ConcurrentLLMClient({ concurrency: 10 })
    };
}

const { vectorStore, llmClient } = buildRuntimeDeps();

const server = new Server(
    {
        name: "ReviewRadar-MCP",
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
            : new AppError("INTERNAL", "Unexpected internal error");

        return {
            content: [{ type: "text", text: JSON.stringify({ error: { code: err.code, message: err.message, details: err.details } }) }],
            isError: true
        };
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("ReviewRadar MCP server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error starting server:", error);
    process.exit(1);
});
