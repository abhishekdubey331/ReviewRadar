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

export class VectorStore {
    private voy: Voy | null = null;
    private openai: OpenAI | null = null;
    private isInitialized = false;

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
    }

    private async save() {
        if (!this.voy) return;
        try {
            if (!fs.existsSync(STORAGE_DIR)) {
                fs.mkdirSync(STORAGE_DIR, { recursive: true });
            }
            const serialized = this.voy.serialize();
            fs.writeFileSync(INDEX_FILE, serialized, "utf8");
            console.error("💾 Persistent vector index saved to disk.");
        } catch (e) {
            console.error("❌ Failed to save vector index:", e);
        }
    }

    async indexReviews(reviews: any[]) {
        await this.ensureInitialized();

        const texts = reviews.map(r => r.content);

        try {
            const chunkSize = 500;
            const allEmbeddedResources: EmbeddedResource[] = [];

            for (let i = 0; i < texts.length; i += chunkSize) {
                const chunk = texts.slice(i, i + chunkSize);
                const reviewChunk = reviews.slice(i, i + chunkSize);

                const response = await this.getOpenAI().embeddings.create({
                    model: "text-embedding-3-small",
                    input: chunk,
                });

                const embeddings = response.data.map(d => d.embedding);

                const chunkResources: EmbeddedResource[] = reviewChunk.map((r, idx) => ({
                    id: String(r.review_id),
                    title: r.user_name || "Review",
                    url: r.content,
                    embeddings: embeddings[idx],
                }));
                allEmbeddedResources.push(...chunkResources);
            }

            const resource: Resource = { embeddings: allEmbeddedResources };
            this.voy!.add(resource);
            this.isInitialized = true;

            // Save to disk after indexing
            await this.save();

            return allEmbeddedResources.length;
        } catch (error: any) {
            throw createError("INTERNAL", `Failed to index reviews: ${error.message}`);
        }
    }

    async search(query: string, limit: number = 5) {
        await this.ensureInitialized();

        if (!this.isInitialized) {
            throw createError("INTERNAL", "Vector store not initialized. Please import reviews first.");
        }

        try {
            const response = await this.getOpenAI().embeddings.create({
                model: "text-embedding-3-small",
                input: query,
            });

            const queryEmbedding = new Float32Array(response.data[0].embedding);
            const results = this.voy!.search(queryEmbedding, limit);

            return results.neighbors;
        } catch (error: any) {
            throw createError("INTERNAL", `Failed to search: ${error.message}`);
        }
    }

    async clear() {
        if (this.voy) {
            this.voy.clear();
            if (fs.existsSync(INDEX_FILE)) {
                fs.unlinkSync(INDEX_FILE);
            }
        }
        this.isInitialized = false;
    }
}

export const vectorStore = new VectorStore();
