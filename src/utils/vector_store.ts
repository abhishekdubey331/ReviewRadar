import { Voy, Resource, EmbeddedResource } from "voy-search/voy_search.js";
import OpenAI from "openai";
import { createError } from "./errors.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_DIR = path.join(__dirname, "../../storage");
const INDEX_FILE = path.join(STORAGE_DIR, "vector_index.json");
const METADATA_FILE = path.join(STORAGE_DIR, "metadata.json");

import pLimit from "p-limit";

export class VectorStore {
    private voy: Voy | null = null;
    private openai: OpenAI | null = null;
    private isInitialized = false;
    private indexedIds: Set<string> = new Set();

    constructor() {
        // OpenAI client is initialized lazily so dotenv has time to load
    }

    private getOpenAI(): OpenAI {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey || apiKey === "dummy-key" || apiKey.includes("your-openai-api-key")) {
            throw createError("INTERNAL", "OPENAI_API_KEY not found or is invalid. Vector indexing requires a valid API key in the .env file.");
        }
        if (!this.openai) {
            this.openai = new OpenAI({ apiKey });
        }
        return this.openai;
    }

    private async ensureInitialized() {
        if (!this.voy) {
            if (fs.existsSync(INDEX_FILE)) {
                try {
                    const serialized = fs.readFileSync(INDEX_FILE, "utf8");
                    this.voy = Voy.deserialize(serialized);
                    this.isInitialized = true;
                    console.error("✅ Loaded persistent vector index from disk.");
                } catch (e) {
                    console.error("⚠️ Failed to load persistent index, creating new one:", e);
                    this.voy = new Voy();
                }
            } else {
                this.voy = new Voy();
            }
        }

        // Load metadata
        if (this.indexedIds.size === 0 && fs.existsSync(METADATA_FILE)) {
            try {
                const meta = JSON.parse(fs.readFileSync(METADATA_FILE, "utf8"));
                if (Array.isArray(meta.indexed_ids)) {
                    this.indexedIds = new Set(meta.indexed_ids);
                }
            } catch (e) {
                console.error("⚠️ Failed to load metadata:", e);
            }
        }
    }

    private async save() {
        if (!this.voy) return;
        try {
            if (!fs.existsSync(STORAGE_DIR)) {
                fs.mkdirSync(STORAGE_DIR, { recursive: true });
            }
            const serialized = this.voy.serialize();
            fs.writeFileSync(INDEX_FILE, serialized, "utf8");

            // Save metadata
            const meta = {
                indexed_ids: Array.from(this.indexedIds),
                updated_at: new Date().toISOString()
            };
            fs.writeFileSync(METADATA_FILE, JSON.stringify(meta, null, 2), "utf8");

            console.error(`💾 Vector index and metadata (${this.indexedIds.size} IDs) saved to disk.`);
        } catch (e) {
            console.error("❌ Failed to save vector store state:", e);
        }
    }

    async indexReviews(reviews: any[]) {
        await this.ensureInitialized();

        // Incremental: Filter only new reviews
        const newReviews = reviews.filter(r => !this.indexedIds.has(String(r.review_id)));

        if (newReviews.length === 0) {
            console.error("⏩ All reviews in this batch are already indexed. Skipping.");
            return 0;
        }

        console.error(`🚀 Indexing ${newReviews.length} new reviews (512-dim, Checkpointed)...`);

        try {
            const chunkSize = 250;
            const concurrencyLimit = pLimit(2); // Throttled concurrency for stability
            const saveInterval = 1000; // Save index every 1k reviews

            let processedInThisRun = 0;

            for (let i = 0; i < newReviews.length; i += saveInterval) {
                const saveBatch = newReviews.slice(i, i + saveInterval);
                const tasks = [];

                for (let j = 0; j < saveBatch.length; j += chunkSize) {
                    const reviewChunk = saveBatch.slice(j, j + chunkSize);
                    const texts = reviewChunk.map(r => r.content);

                    tasks.push(concurrencyLimit(async () => {
                        const response = await this.getOpenAI().embeddings.create({
                            model: "text-embedding-3-small",
                            input: texts,
                            dimensions: 512, // DRATICALLY reduces memory usage (from 1536 to 512)
                        });

                        const embeddings = response.data.map(d => d.embedding);

                        return reviewChunk.map((r, idx) => ({
                            id: String(r.review_id),
                            title: r.user_name || "Review",
                            url: r.content,
                            embeddings: embeddings[idx],
                        }));
                    }));
                }

                const batchResults = await Promise.all(tasks);
                const flatBatch = batchResults.flat();

                if (!this.voy) throw new Error("Vector store not initialized properly.");

                // Add this batch to WASM
                this.voy.add({ embeddings: flatBatch });

                // Update tracking IDs
                flatBatch.forEach(res => this.indexedIds.add(res.id));
                processedInThisRun += flatBatch.length;

                // CHECKPOINT: Save progress to disk
                this.isInitialized = true;
                await this.save();
                console.error(`🏗️ Checkpoint: Saved ${this.indexedIds.size} total reviews to disk.`);
            }

            return processedInThisRun;
        } catch (error: any) {
            console.error("❌ Indexing Process Failed:", error);
            throw createError("INTERNAL", `Failed to index reviews: ${error.message}`);
        }
    }

    async search(query: string, limit: number = 5) {
        await this.ensureInitialized();

        if (!this.isInitialized || !this.voy) {
            throw createError("INTERNAL", "Vector store not initialized. Please import reviews first.");
        }

        try {
            const response = await this.getOpenAI().embeddings.create({
                model: "text-embedding-3-small",
                input: query,
                dimensions: 512, // Must match indexing
            });

            const queryEmbedding = new Float32Array(response.data[0].embedding);
            const results = this.voy.search(queryEmbedding, limit);

            return results.neighbors;
        } catch (error: any) {
            console.error("❌ Search Failed:", error);
            throw createError("INTERNAL", `Failed to search: ${error.message}`);
        }
    }

    async clear() {
        if (this.voy) {
            this.voy.clear();
            if (fs.existsSync(INDEX_FILE)) {
                fs.unlinkSync(INDEX_FILE);
            }
            if (fs.existsSync(METADATA_FILE)) {
                fs.unlinkSync(METADATA_FILE);
            }
        }
        this.indexedIds.clear();
        this.isInitialized = false;
    }
}

export const vectorStore = new VectorStore();
