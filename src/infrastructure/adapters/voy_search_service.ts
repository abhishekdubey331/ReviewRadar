import { VectorSearchOptions, VectorSearchResult } from "../../domain/ports/vector_store.js";
import { tokenizeQuery } from "../../utils/text.js";
import { HybridSearchRankingStrategy, SearchRankingStrategy } from "./search_ranking_strategy.js";

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
    lexical_score?: number;
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

function applySort(
    records: SearchRecord[],
    options: VectorSearchOptions,
    rankingStrategy: SearchRankingStrategy
): SearchRecord[] {
    const sorted = [...records];
    sorted.sort((a, b) => rankingStrategy.compare(a, b, options));
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

export function buildLexicalSearchRecords(
    metadataById: Map<string, SearchMetadata>,
    query: string,
    limit: number
): SearchRecord[] {
    const tokens = tokenizeQuery(query);
    if (tokens.length === 0) return [];

    const records = Array.from(metadataById.values())
        .map((meta) => {
            const haystack = `${meta.author || ""} ${meta.content || ""}`.toLowerCase();
            const lexicalScore = tokens.reduce((score, token) => {
                if (haystack.includes(token)) {
                    return score + (haystack.includes(` ${token} `) ? 2 : 1);
                }
                return score;
            }, 0);

            return {
                id: meta.id || "",
                relevance_rank: Number.MAX_SAFE_INTEGER,
                author: meta.author,
                content: meta.content,
                score: meta.score,
                date: meta.date || meta.review_created_at,
                lexical_score: lexicalScore
            };
        })
        .filter((record) => record.id && (record.lexical_score ?? 0) > 0)
        .sort((a, b) => {
            const lexicalDelta = (b.lexical_score ?? 0) - (a.lexical_score ?? 0);
            if (lexicalDelta !== 0) return lexicalDelta;
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return dateB - dateA;
        });

    return records.slice(0, limit);
}

export function mergeSearchRecords(primary: SearchRecord[], supplemental: SearchRecord[]): SearchRecord[] {
    const merged = new Map<string, SearchRecord>();

    for (const record of [...primary, ...supplemental]) {
        const existing = merged.get(record.id);
        if (!existing) {
            merged.set(record.id, record);
            continue;
        }

        merged.set(record.id, {
            ...existing,
            ...record,
            relevance_rank: Math.min(existing.relevance_rank, record.relevance_rank),
            lexical_score: Math.max(existing.lexical_score ?? 0, record.lexical_score ?? 0)
        });
    }

    return Array.from(merged.values());
}

export function finalizeSearchResults(
    records: SearchRecord[],
    options: VectorSearchOptions,
    rankingStrategy: SearchRankingStrategy = new HybridSearchRankingStrategy()
): VectorSearchResult[] {
    const limit = options.limit ?? 5;
    return applySort(applyFilters(records, options), options, rankingStrategy).slice(0, limit);
}
