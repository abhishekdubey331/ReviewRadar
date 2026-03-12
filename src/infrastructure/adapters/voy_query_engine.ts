import { VectorSearchOptions } from "../../domain/ports/vector_store.js";
import { SearchRankingStrategy } from "./search_ranking_strategy.js";
import { SearchMetadata, buildLexicalSearchRecords, buildMetadataOnlyRecords, buildSemanticSearchRecords, finalizeSearchResults, mergeSearchRecords } from "./voy_search_service.js";

export async function searchVoyIndex(params: {
    query: string;
    options: VectorSearchOptions;
    metadata: Map<string, SearchMetadata>;
    embedQuery: (query: string) => Promise<number[]>;
    searchIndex: (embedding: Float32Array, limit: number) => { neighbors: Array<{ id: string; title?: string; url?: string }> };
    rankingStrategy: SearchRankingStrategy;
}) {
    const { query, options, metadata, embedQuery, searchIndex, rankingStrategy } = params;
    const { limit = 5, sort_by = "relevance" } = options;

    if (query && query !== "*" && query.trim() !== "") {
        const embedding = await embedQuery(query);
        const hasFilters =
            options.min_score !== undefined
            || options.max_score !== undefined
            || options.start_date
            || options.end_date
            || sort_by === "date";
        const candidateLimit = hasFilters ? 5000 : Math.max(limit * 5, 50);
        const results = searchIndex(new Float32Array(embedding), candidateLimit);
        const semanticResults = buildSemanticSearchRecords(results.neighbors, metadata);
        const lexicalResults = buildLexicalSearchRecords(metadata, query, candidateLimit);
        return finalizeSearchResults(mergeSearchRecords(semanticResults, lexicalResults), options, rankingStrategy);
    }

    return finalizeSearchResults(buildMetadataOnlyRecords(metadata), options, rankingStrategy);
}
