import { VectorSearchOptions } from "../../domain/ports/vector_store.js";

export interface RankedSearchRecord {
    relevance_rank: number;
    lexical_score?: number;
    date?: string;
}

export interface SearchRankingStrategy {
    compare(a: RankedSearchRecord, b: RankedSearchRecord, options: VectorSearchOptions): number;
}

export class HybridSearchRankingStrategy implements SearchRankingStrategy {
    compare(a: RankedSearchRecord, b: RankedSearchRecord, options: VectorSearchOptions): number {
        const { sort_by = "relevance", sort_direction = "desc" } = options;

        if (sort_by === "date") {
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return sort_direction === "desc" ? dateB - dateA : dateA - dateB;
        }

        const scoreA = (a.lexical_score ?? 0) * 1000 - a.relevance_rank;
        const scoreB = (b.lexical_score ?? 0) * 1000 - b.relevance_rank;
        return sort_direction === "asc" ? scoreA - scoreB : scoreB - scoreA;
    }
}
