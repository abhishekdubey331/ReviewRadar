import { describe, it, expect, vi } from "vitest";
import { dispatchToolCall, resolveTopIssuesMinReviewTarget } from "../src/app/tool_dispatcher.js";

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

        expect(vectorStore.search).toHaveBeenCalledWith("battery", { limit: 1, sort_by: "relevance", sort_direction: "desc" });
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

    it("rejects invalid reviews_search args", async () => {
        const vectorStore = {
            search: vi.fn(),
            indexReviews: vi.fn(),
            clear: vi.fn(),
            getIndexStatus: vi.fn(),
            getStorageDiagnostics: vi.fn()
        } as any;
        const llmClient = { processPrompt: vi.fn() } as any;

        await expect(dispatchToolCall("reviews_search", { query: "battery", limit: 1000 }, { vectorStore, llmClient })).rejects.toMatchObject({
            code: "INVALID_SCHEMA",
            message: "Invalid search parameters"
        });
    });

    it("does not rewrite non-reviews validation errors for analytics tools", async () => {
        const vectorStore = {
            search: vi.fn(),
            indexReviews: vi.fn(),
            clear: vi.fn(),
            getIndexStatus: vi.fn(),
            getStorageDiagnostics: vi.fn()
        } as any;
        const llmClient = { processPrompt: vi.fn() } as any;

        await expect(dispatchToolCall("reviews_feature_ownership_map", { reviews: [] }, { vectorStore, llmClient })).rejects.toMatchObject({
            code: "INVALID_SCHEMA",
            message: "Invalid feature ownership mapping parameters"
        });
    });

    it("defaults reviews_top_issues to this_week window when scope is omitted", async () => {
        const vectorStore = {
            search: vi.fn(),
            indexReviews: vi.fn(),
            clear: vi.fn(),
            getIndexStatus: vi.fn(),
            getStorageDiagnostics: vi.fn()
        } as any;
        const llmClient = { processPrompt: vi.fn() } as any;

        const response: any = await dispatchToolCall("reviews_top_issues", {
            reviews: [
                {
                    review_id: "r1",
                    issue_type: "Bug",
                    feature_area: "Login/OTP",
                    severity: "P1",
                    sentiment: "Negative",
                    review_created_at: "2026-02-22T00:00:00.000Z"
                }
            ]
        }, { vectorStore, llmClient });

        expect(response.content[0].text).toContain('"window_applied":"this_week"');
    });

    it("auto-fills analyzed reviews when reviews array is empty", async () => {
        const vectorStore = {
            search: vi.fn(),
            indexReviews: vi.fn(),
            clear: vi.fn(),
            getIndexStatus: vi.fn(),
            getStorageDiagnostics: vi.fn()
        } as any;
        const llmClient = {
            processPrompt: vi.fn().mockResolvedValue({
                content: [{ type: "text", text: '{"issue_type":"Bug","feature_area":"Login/OTP","severity":"P1"}' }],
                usage: { input_tokens: 10, output_tokens: 10 }
            })
        } as any;

        const response: any = await dispatchToolCall("reviews_top_issues", { reviews: [] }, { vectorStore, llmClient });
        expect(response.content[0].text).toContain('"window_applied":"this_week"');
        expect(response.content[0].text).not.toContain('"total_reviews_considered":0');
        expect(llmClient.processPrompt).not.toHaveBeenCalled();
    });

    it("routes reviews_cluster_reviews and returns matching rows", async () => {
        const vectorStore = {
            search: vi.fn(),
            indexReviews: vi.fn(),
            clear: vi.fn(),
            getIndexStatus: vi.fn(),
            getStorageDiagnostics: vi.fn()
        } as any;
        const llmClient = { processPrompt: vi.fn() } as any;

        const response: any = await dispatchToolCall("reviews_cluster_reviews", {
            reviews: [
                { review_id: "r1", issue_type: "Unknown", feature_area: "Unknown", severity: "P2", sentiment: "Negative", review_created_at: "2026-02-22T00:00:00.000Z", text: "x" },
                { review_id: "r2", issue_type: "Bug", feature_area: "Login/OTP", severity: "P1", sentiment: "Negative", review_created_at: "2026-02-22T00:00:00.000Z", text: "y" }
            ],
            options: { include_unknown_only: true }
        }, { vectorStore, llmClient });

        expect(response.content[0].text).toContain('"total_cluster_matches":1');
    });

    it("rejects internal analyze options from public reviews_analyze calls", async () => {
        const vectorStore = {
            search: vi.fn(),
            indexReviews: vi.fn(),
            clear: vi.fn(),
            getIndexStatus: vi.fn(),
            getStorageDiagnostics: vi.fn()
        } as any;
        const llmClient = { processPrompt: vi.fn() } as any;

        await expect(dispatchToolCall("reviews_analyze", {
            options: { internal_max_reviews: 100 }
        }, { vectorStore, llmClient })).rejects.toMatchObject({
            code: "INVALID_SCHEMA"
        });
    });

    it("resolves min review target for partial date filters", () => {
        const startOnly = resolveTopIssuesMinReviewTarget({
            options: { filters: { start_date: "2026-01-20" }, reference_date: "2026-02-22T00:00:00.000Z" }
        });
        const endOnly = resolveTopIssuesMinReviewTarget({
            options: { filters: { end_date: "2026-02-22" } }
        });

        expect(startOnly).toBe(1000);
        expect(endOnly).toBe(500);
    });
});
