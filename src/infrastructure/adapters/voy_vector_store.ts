import { Voy, EmbeddedResource } from "voy-search/voy_search.js";
import { createError } from "../../utils/errors.js";
import fs from "fs";
import path from "path";
import pLimit from "p-limit";
import { IVectorStore, VectorSearchOptions, IndexStatus, ReviewRecord, VectorSearchResult, StorageDiagnostics } from "../../domain/ports/vector_store.js";
import { EmbeddingClient, OpenAIEmbeddingClient } from "./openai_embedding_client.js";
import { loadPersistedMetadata, loadVoyIndex, saveVoyState } from "./voy_persistence.js";
import { buildMetadataOnlyRecords, buildSemanticSearchRecords, finalizeSearchResults } from "./voy_search_service.js";

export class VoyVectorStore implements IVectorStore {
    private voy: Voy | null = null;
    private readonly embeddingClient: EmbeddingClient;
    private isInitialized = false;
    private indexedMetadata: Map<string, any> = new Map();
    private readonly embeddingDimensions = 512;
    private readonly voyAddBatchSize = 250;
    private readonly storageDir: string;
    private readonly indexFile: string;
    private readonly metadataFile: string;

    constructor(options?: { storageDir?: string; embeddingApiKey?: string; embeddingClient?: EmbeddingClient }) {
        this.storageDir = options?.storageDir ?? path.resolve(process.cwd(), "storage");
        this.indexFile = path.join(this.storageDir, "vector_index.json");
        this.metadataFile = path.join(this.storageDir, "metadata.json");
        this.embeddingClient = options?.embeddingClient ?? new OpenAIEmbeddingClient({
            apiKey: options?.embeddingApiKey,
            dimensions: this.embeddingDimensions,
            model: "text-embedding-3-small"
        });
    }

    private async ensureInitialized() {
        if (!this.voy) {
            try {
                this.voy = loadVoyIndex(this.indexFile) ?? new Voy();
                this.isInitialized = fs.existsSync(this.indexFile);
                if (this.isInitialized) {
                    console.error("Loaded persistent vector index from disk.");
                }
            } catch (e) {
                console.error("Failed to load persistent index, creating new one:", e);
                this.voy = new Voy();
            }
        }

        if (this.indexedMetadata.size === 0 && fs.existsSync(this.metadataFile)) {
            try {
                this.indexedMetadata = loadPersistedMetadata(this.metadataFile);
            } catch (e) {
                console.error("Failed to load metadata:", e);
            }
        }
    }

    private async save() {
        if (!this.voy) return;
        try {
            saveVoyState(
                {
                    storageDir: this.storageDir,
                    indexFile: this.indexFile,
                    metadataFile: this.metadataFile
                },
                this.voy,
                this.indexedMetadata
            );

            console.error(`Vector index and metadata (${this.indexedMetadata.size} reviews) saved to disk.`);
        } catch (e) {
            console.error("Failed to save vector store state:", e);
        }
    }

    private isValidEmbedding(embedding: unknown): embedding is number[] {
        return Array.isArray(embedding)
            && embedding.length === this.embeddingDimensions
            && embedding.every(v => Number.isFinite(v));
    }

    private addWithBisect(items: EmbeddedResource[]) {
        if (!this.voy || items.length === 0) return;

        try {
            this.voy.add({ embeddings: items });
            return;
        } catch (error) {
            if (items.length === 1) {
                console.error(`Skipping vector id=${items[0].id} after Voy.add failure:`, error);
                return;
            }
        }

        const mid = Math.floor(items.length / 2);
        this.addWithBisect(items.slice(0, mid));
        this.addWithBisect(items.slice(mid));
    }

    private addEmbeddingsSafely(items: EmbeddedResource[]) {
        if (!this.voy || items.length === 0) return;

        for (let i = 0; i < items.length; i += this.voyAddBatchSize) {
            const batch = items.slice(i, i + this.voyAddBatchSize);
            try {
                this.voy.add({ embeddings: batch });
            } catch (error) {
                console.error(`Voy.add failed for batch size=${batch.length}; retrying with bisect fallback.`);
                this.addWithBisect(batch);
            }
        }
    }

    async indexReviews(reviews: ReviewRecord[]): Promise<number> {
        await this.ensureInitialized();

        const newReviews = reviews.filter(r => !this.indexedMetadata.has(String(r.review_id)));

        if (newReviews.length === 0) {
            console.error("All reviews in this batch are already indexed. Skipping.");
            return 0;
        }

        console.error(`Indexing ${newReviews.length} new reviews (${this.embeddingDimensions}-dim, checkpointed)...`);

        try {
            const chunkSize = 500;
            const concurrencyLimit = pLimit(2);
            const saveInterval = 5000;

            let processedInThisRun = 0;

            for (let i = 0; i < newReviews.length; i += saveInterval) {
                const saveBatch = newReviews.slice(i, i + saveInterval);
                const tasks = [];

                for (let j = 0; j < saveBatch.length; j += chunkSize) {
                    const reviewChunk = saveBatch.slice(j, j + chunkSize);
                    const texts = reviewChunk.map(r => r.content);

                    tasks.push(concurrencyLimit(async () => {
                        const embeddings = await this.embeddingClient.embed(texts);

                        return reviewChunk
                            .map((r, idx) => ({
                                id: String(r.review_id),
                                title: r.user_name || "Review",
                                url: r.content,
                                embeddings: embeddings[idx],
                                reviewMetadata: {
                                    id: String(r.review_id),
                                    author: r.user_name,
                                    content: r.content,
                                    score: r.score,
                                    date: r.review_created_at,
                                }
                            }))
                            .filter(item => {
                                const valid = this.isValidEmbedding(item.embeddings);
                                if (!valid) {
                                    console.error(`Skipping invalid embedding for review_id=${item.id}`);
                                }
                                return valid;
                            });
                    }));
                }

                const batchResults = await Promise.all(tasks);
                const flatBatch = batchResults.flat();

                if (!this.voy) throw new Error("Vector store not initialized properly.");

                const embeddingsToAdd = flatBatch.map(item => ({
                    id: item.id,
                    title: item.title,
                    url: item.url,
                    embeddings: item.embeddings
                }));
                this.addEmbeddingsSafely(embeddingsToAdd);

                flatBatch.forEach(item => {
                    this.indexedMetadata.set(item.id, item.reviewMetadata);
                });

                processedInThisRun += flatBatch.length;

                this.isInitialized = true;
                await this.save();

                const totalIndexed = this.indexedMetadata.size;
                const progress = Math.round((totalIndexed / (newReviews.length + (this.indexedMetadata.size - processedInThisRun))) * 100);

                console.error(`Checkpoint: [${progress}%] Indexed ${totalIndexed} total reviews to disk. (+${processedInThisRun} in this run)`);
            }

            return processedInThisRun;
        } catch (error: any) {
            console.error("Indexing Process Failed:", error);
            throw createError("INTERNAL", "Failed to index reviews");
        }
    }

    async search(query: string, options: VectorSearchOptions = {}): Promise<VectorSearchResult[]> {
        await this.ensureInitialized();
        const { limit = 5, sort_by = "relevance" } = options;

        if (!this.isInitialized || !this.voy) {
            throw createError("INTERNAL", "Vector store not initialized. Please import reviews first.");
        }

        try {
            let filteredResults = [];

            if (query && query !== "*" && query.trim() !== "") {
                const embeddings = await this.embeddingClient.embed(query);
                const queryEmbedding = new Float32Array(embeddings[0]);

                const hasFilters =
                    options.min_score !== undefined
                    || options.max_score !== undefined
                    || options.start_date
                    || options.end_date
                    || sort_by === "date";
                const candidateLimit = hasFilters ? 5000 : limit * 2;
                const results = this.voy.search(queryEmbedding, candidateLimit);
                filteredResults = buildSemanticSearchRecords(results.neighbors, this.indexedMetadata);
            } else {
                filteredResults = buildMetadataOnlyRecords(this.indexedMetadata);
            }

            return finalizeSearchResults(filteredResults, options);
        } catch (error: any) {
            console.error("Search Failed:", error);
            throw createError("INTERNAL", "Failed to search reviews");
        }
    }

    async clear(): Promise<void> {
        if (this.voy) {
            this.voy.clear();
            if (fs.existsSync(this.indexFile)) {
                fs.unlinkSync(this.indexFile);
            }
            if (fs.existsSync(this.metadataFile)) {
                fs.unlinkSync(this.metadataFile);
            }
        }
        this.indexedMetadata.clear();
        this.isInitialized = false;
    }

    async getIndexStatus(): Promise<IndexStatus> {
        await this.ensureInitialized();
        const total = this.indexedMetadata.size;
        let withScore = 0;
        let withDate = 0;

        this.indexedMetadata.forEach(meta => {
            if (meta.score !== undefined) withScore++;
            if (meta.date || meta.review_created_at) withDate++;
        });

        return {
            total_indexed: total,
            metadata_health: {
                has_score: total > 0 ? (withScore / total) : 0,
                has_date: total > 0 ? (withDate / total) : 0,
                score_count: withScore,
                date_count: withDate
            },
            is_ready: total > 0 && withScore > 0,
            storage_paths: {
                index: this.indexFile,
                metadata: this.metadataFile
            }
        };
    }

    getStorageDiagnostics(): StorageDiagnostics {
        return {
            storage_dir: this.storageDir,
            index_file: this.indexFile,
            metadata_file: this.metadataFile,
            storage_dir_exists: fs.existsSync(this.storageDir),
            index_exists: fs.existsSync(this.indexFile),
            metadata_exists: fs.existsSync(this.metadataFile)
        };
    }
}
