import OpenAI from "openai";
import retry from "async-retry";
import { createError } from "../../utils/errors.js";

export interface EmbeddingClient {
    embed(input: string[] | string): Promise<number[][]>;
}

export class OpenAIEmbeddingClient implements EmbeddingClient {
    private readonly apiKey?: string;
    private readonly dimensions: number;
    private readonly model: string;
    private openai: OpenAI | null = null;

    constructor(options: { apiKey?: string; dimensions?: number; model?: string }) {
        const apiKey = options.apiKey;
        this.apiKey = apiKey;
        this.dimensions = options.dimensions ?? 512;
        this.model = options.model ?? "text-embedding-3-small";
    }

    private getClient(): OpenAI {
        if (!this.openai) {
            if (!this.apiKey || this.apiKey === "dummy-key" || this.apiKey.includes("your-openai-api-key")) {
                throw createError("INTERNAL", "Embedding provider not configured. Set OPENAI_API_KEY to use import/search tools.");
            }
            this.openai = new OpenAI({ apiKey: this.apiKey });
        }
        return this.openai;
    }

    async embed(input: string[] | string): Promise<number[][]> {
        const response = await retry(
            async () => this.getClient().embeddings.create({
                model: this.model,
                input,
                dimensions: this.dimensions,
            }),
            {
                retries: 4,
                factor: 2,
                minTimeout: 1000,
                maxTimeout: 10000,
            }
        );
        return response.data.map((d) => d.embedding);
    }
}
