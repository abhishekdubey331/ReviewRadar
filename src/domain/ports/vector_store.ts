export interface VectorSearchOptions {
    limit?: number;
    min_score?: number;
    max_score?: number;
    start_date?: string;
    end_date?: string;
    sort_by?: "relevance" | "date";
    sort_direction?: "asc" | "desc";
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

export interface IVectorStore {
    indexReviews(reviews: any[]): Promise<number>;
    search(query: string, options?: VectorSearchOptions): Promise<any[]>;
    clear(): Promise<void>;
    getIndexStatus(): Promise<IndexStatus>;
    getStorageDiagnostics(): any;
}
