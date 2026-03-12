import { describe, expect, it } from "vitest";
import { HybridSearchRankingStrategy } from "../src/infrastructure/adapters/search_ranking_strategy.js";
import { buildVoyIndexStatus } from "../src/infrastructure/adapters/voy_index_status.js";
import { searchVoyIndex } from "../src/infrastructure/adapters/voy_query_engine.js";

describe("voy helper modules", () => {
    it("builds index status from metadata health", () => {
        const status = buildVoyIndexStatus(new Map([
            ["1", { id: "1", score: 5, date: "2026-01-01" }],
            ["2", { id: "2" }]
        ]), "index.json", "metadata.json");

        expect(status.total_indexed).toBe(2);
        expect(status.metadata_health.score_count).toBe(1);
        expect(status.metadata_health.date_count).toBe(1);
    });

    it("combines semantic and lexical retrieval candidates", async () => {
        const results = await searchVoyIndex({
            query: "android 14",
            options: { limit: 5 },
            metadata: new Map([
                ["1", { id: "1", content: "generic feedback" }],
                ["2", { id: "2", content: "android 14 crash on launch", date: "2026-01-01" }]
            ]),
            embedQuery: async () => new Array(512).fill(0),
            searchIndex: () => ({ neighbors: [{ id: "1" }] }),
            rankingStrategy: new HybridSearchRankingStrategy()
        });

        expect(results.some((result) => result.id === "2")).toBe(true);
    });
});
