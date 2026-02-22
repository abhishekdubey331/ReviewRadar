import { VectorSearchOptions, VectorSearchResult } from "../../domain/ports/vector_store.js";

export interface SearchNeighbor {
    id: string;
    title?: string;
    url?: string;
}

export interface SearchMetadata {
    id?: string;
    author?: string;
    content?: string;
    score?: number;
    date?: string;
    review_created_at?: string;
}

interface SearchRecord extends VectorSearchResult {
    date?: string;
    score?: number;
}

function applyFilters(records: SearchRecord[], options: VectorSearchOptions): SearchRecord[] {
    const { min_score, max_score, start_date, end_date } = options;
    let filtered = records;

    if (min_score !== undefined) {
        filtered = filtered.filter((r) => r.score !== undefined && r.score >= min_score);
    }
    if (max_score !== undefined) {
        filtered = filtered.filter((r) => r.score !== undefined && r.score <= max_score);
    }
    if (start_date) {
        filtered = filtered.filter((r) => r.date && new Date(r.date) >= new Date(start_date));
    }
    if (end_date) {
        filtered = filtered.filter((r) => r.date && new Date(r.date) <= new Date(end_date));
    }

    return filtered;
}

function applySort(records: SearchRecord[], options: VectorSearchOptions): SearchRecord[] {
    const { sort_by = "relevance", sort_direction = "desc" } = options;
    const sorted = [...records];

    if (sort_by === "date") {
        sorted.sort((a, b) => {
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return sort_direction === "desc" ? dateB - dateA : dateA - dateB;
        });
        return sorted;
    }

    sorted.sort((a, b) => a.relevance_rank - b.relevance_rank);
    return sorted;
}

export function buildSemanticSearchRecords(
    neighbors: SearchNeighbor[],
    metadataById: Map<string, SearchMetadata>
): SearchRecord[] {
    return neighbors.map((neighbor, index) => {
        const meta = metadataById.get(neighbor.id) || {};
        return {
            id: neighbor.id,
            relevance_rank: index,
            author: meta.author || neighbor.title,
            content: meta.content || neighbor.url,
            score: meta.score,
            date: meta.date || meta.review_created_at
        };
    });
}

export function buildMetadataOnlyRecords(metadataById: Map<string, SearchMetadata>): SearchRecord[] {
    return Array.from(metadataById.values()).map((meta) => ({
        id: meta.id || "",
        relevance_rank: 0,
        author: meta.author,
        content: meta.content,
        score: meta.score,
        date: meta.date || meta.review_created_at
    }));
}

export function finalizeSearchResults(records: SearchRecord[], options: VectorSearchOptions): VectorSearchResult[] {
    const limit = options.limit ?? 5;
    return applySort(applyFilters(records, options), options).slice(0, limit);
}
