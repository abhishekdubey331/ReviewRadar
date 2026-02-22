export interface VectorSearchOptions {
    limit?: number;
    min_score?: number;
    max_score?: number;
    start_date?: string;
    end_date?: string;
    sort_by?: "relevance" | "date";
    sort_direction?: "asc" | "desc";
}

export interface ReviewRecord {
    review_id: string;
    content: string;
    score?: number;
    review_created_at?: string;
    user_name?: string;
    [key: string]: unknown;
}

export interface VectorSearchResult {
    id: string;
    relevance_rank: number;
    author?: string;
    content?: string;
    score?: number;
    date?: string;
}

export interface IndexStatus {
    total_indexed: number;
    metadata_health: {
        has_score: number;
        has_date: number;
        score_count: number;
        date_count: number;
    };
    is_ready: boolean;
    storage_paths: {
        index: string;
        metadata: string;
    };
}

export interface StorageDiagnostics {
    [key: string]: unknown;
}

export interface IVectorStore {
    indexReviews(reviews: ReviewRecord[]): Promise<number>;
    search(query: string, options?: VectorSearchOptions): Promise<VectorSearchResult[]>;
    clear(): Promise<void>;
    getIndexStatus(): Promise<IndexStatus>;
    getStorageDiagnostics(): StorageDiagnostics;
}
