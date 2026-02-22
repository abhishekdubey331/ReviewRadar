import { describe, it, expect, vi } from "vitest";
import { dispatchToolCall } from "../src/app/tool_dispatcher.js";

describe("tool dispatcher", () => {
    it("routes reviews_search to vector store", async () => {
        const vectorStore = {
            search: vi.fn().mockResolvedValue([{ id: "r1" }]),
            indexReviews: vi.fn(),
            clear: vi.fn(),
            getIndexStatus: vi.fn(),
            getStorageDiagnostics: vi.fn()
        } as any;
        const llmClient = { processPrompt: vi.fn() } as any;

        const response: any = await dispatchToolCall("reviews_search", { query: "battery", limit: 1 }, { vectorStore, llmClient });

        expect(vectorStore.search).toHaveBeenCalledWith("battery", { limit: 1 });
        expect(response.content[0].type).toBe("text");
        expect(response.content[0].text).toContain("results");
    });

    it("throws for unknown tool", async () => {
        const vectorStore = {
            search: vi.fn(),
            indexReviews: vi.fn(),
            clear: vi.fn(),
            getIndexStatus: vi.fn(),
            getStorageDiagnostics: vi.fn()
        } as any;
        const llmClient = { processPrompt: vi.fn() } as any;

        await expect(dispatchToolCall("reviews_unknown", {}, { vectorStore, llmClient })).rejects.toMatchObject({
            code: "INVALID_SCHEMA",
            message: "Tool not found",
            details: { tool_name: "reviews_unknown" }
        });
    });
});
