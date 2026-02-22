import { Voy, EmbeddedResource } from "voy-search/voy_search.js";
import { createError } from "../../utils/errors.js";
import fs from "fs";
import path from "path";
import { IVectorStore, VectorSearchOptions, IndexStatus, ReviewRecord, VectorSearchResult, StorageDiagnostics } from "../../domain/ports/vector_store.js";
import { EmbeddingClient, OpenAIEmbeddingClient } from "./openai_embedding_client.js";
import { loadPersistedMetadata, loadVoyIndex, saveVoyState } from "./voy_persistence.js";
import { buildMetadataOnlyRecords, buildSemanticSearchRecords, finalizeSearchResults } from "./voy_search_service.js";
import { addEmbeddingsInBatches, indexReviewsInChunks } from "./voy_indexing_service.js";
import { logger } from "../../utils/logger.js";

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
                    logger.info("voy.index_loaded", { index_file: this.indexFile });
                }
            } catch (e) {
                logger.error("voy.index_load_failed", { message: e instanceof Error ? e.message : String(e) });
                this.voy = new Voy();
            }
        }

        if (this.indexedMetadata.size === 0 && fs.existsSync(this.metadataFile)) {
            try {
                this.indexedMetadata = loadPersistedMetadata(this.metadataFile);
            } catch (e) {
                logger.error("voy.metadata_load_failed", { message: e instanceof Error ? e.message : String(e) });
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

            logger.info("voy.state_saved", { total_reviews: this.indexedMetadata.size });
        } catch (e) {
            logger.error("voy.state_save_failed", { message: e instanceof Error ? e.message : String(e) });
        }
    }

    private isValidEmbedding(embedding: unknown): embedding is number[] {
        return Array.isArray(embedding)
            && embedding.length === this.embeddingDimensions
            && embedding.every(v => Number.isFinite(v));
    }

    private addEmbeddingsSafely(items: EmbeddedResource[]) {
        if (!this.voy || items.length === 0) return;
        addEmbeddingsInBatches(
            this.voy,
            items,
            this.voyAddBatchSize,
            (batchSize) => logger.warn("voy.add_batch_failed", { batch_size: batchSize }),
            (id, error) => logger.error("voy.add_single_failed", {
                vector_id: id,
                message: error instanceof Error ? error.message : String(error)
            })
        );
    }

    async indexReviews(reviews: ReviewRecord[]): Promise<number> {
        await this.ensureInitialized();

        const newReviews = reviews.filter(r => !this.indexedMetadata.has(String(r.review_id)));

        if (newReviews.length === 0) {
            logger.info("voy.index_skipped_all_existing");
            return 0;
        }

        logger.info("voy.index_start", {
            new_reviews: newReviews.length,
            embedding_dimensions: this.embeddingDimensions
        });

        try {
            const chunkSize = 500;
            const saveInterval = 5000;

            let processedInThisRun = 0;

            for (let i = 0; i < newReviews.length; i += saveInterval) {
                const saveBatch = newReviews.slice(i, i + saveInterval);
                const flatBatch = await indexReviewsInChunks(
                    saveBatch,
                    { chunkSize, concurrency: 2 },
                    {
                        embed: (input) => this.embeddingClient.embed(input),
                        isValidEmbedding: (embedding) => this.isValidEmbedding(embedding),
                        onInvalidEmbedding: (reviewId) => logger.warn("voy.invalid_embedding", { review_id: reviewId })
                    }
                );

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

                logger.info("voy.index_checkpoint", {
                    progress_percent: progress,
                    total_indexed: totalIndexed,
                    processed_in_run: processedInThisRun
                });
            }

            return processedInThisRun;
        } catch (error: any) {
            logger.error("voy.index_failed", { message: error instanceof Error ? error.message : String(error) });
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
            logger.error("voy.search_failed", { message: error instanceof Error ? error.message : String(error) });
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
