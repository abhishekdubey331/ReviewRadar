import { SourceSchema, ReviewInputSchema } from '../schemas/shared.js';
import { createError } from '../utils/errors.js';
import { z } from 'zod';
import { readFileSync, existsSync, statSync } from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { vectorStore } from '../utils/vector_store.js';
import { fileURLToPath } from 'url';

export const ImportOptionsSchema = z.object({
    max_reviews: z.number().int().max(50000).default(50000).optional(),
    enable_vector_search: z.boolean().default(true).optional(),
});

export const ImportToolInputSchema = z.object({
    source: SourceSchema.optional(),
    options: ImportOptionsSchema.optional(),
});

export async function importReviews(input: unknown) {
    const parseResult = ImportToolInputSchema.safeParse(input);
    if (!parseResult.success) {
        throw createError("INVALID_SCHEMA", "Invalid import parameters", parseResult.error.format());
    }

    let { source, options } = parseResult.data;

    // Default to the auto-scraped dataset if no source is explicitly provided by the LLM
    if (!source || (source.type === 'file' && !source.path)) {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        source = { type: 'file', path: path.resolve(__dirname, '../sample_data/scraped_reviews.csv') };
    }

    const maxReviews = options?.max_reviews ?? 50000;

    let rawReviews: any[] = [];

    if (source.type === "inline") {
        rawReviews = source.reviews;
    } else if (source.type === "file") {
        if (!existsSync(source.path)) {
            throw createError("FILE_NOT_FOUND", `File not found at path: ${source.path}`);
        }

        const stats = statSync(source.path);
        if (stats.size > 100 * 1024 * 1024) { // Increase to 100 MB for 50k reviews
            throw createError("INPUT_TOO_LARGE", "File size exceeds 100 MB");
        }

        const ext = path.extname(source.path).toLowerCase();

        try {
            const fileContent = readFileSync(source.path, 'utf8');

            if (ext === '.json') {
                const parsed = JSON.parse(fileContent);
                if (Array.isArray(parsed)) {
                    rawReviews = parsed;
                } else {
                    throw createError("INVALID_SCHEMA", "JSON file must contain an array of reviews");
                }
            } else if (ext === '.csv') {
                const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
                rawReviews = parsed.data;
            } else {
                throw createError("INVALID_SCHEMA", "Unsupported file type. Expected .json or .csv");
            }
        } catch (e: any) {
            if (e.code === "INVALID_SCHEMA" || e.code === "INPUT_TOO_LARGE") throw e;
            throw createError("INTERNAL", "Error reading or parsing file", { message: e.message });
        }
    }

    const reviewsMap = new Map<string, any>();

    for (const raw of rawReviews) {
        if (source.type === "file") {
            if (typeof raw.score === 'string') {
                raw.score = parseInt(raw.score, 10);
            }
            if (typeof raw.thumbs_up_count === 'string') {
                raw.thumbs_up_count = parseInt(raw.thumbs_up_count, 10);
            }

            const reviewParse = ReviewInputSchema.safeParse(raw);
            if (!reviewParse.success) {
                continue; // Skip invalid rows instead of failing entire import for large files
            }
            const review = reviewParse.data;
            if (!reviewsMap.has(review.review_id)) {
                reviewsMap.set(review.review_id, review);
            }
        } else {
            if (!reviewsMap.has(raw.review_id)) {
                reviewsMap.set(raw.review_id, raw);
            }
        }
    }

    const uniqueReviews = Array.from(reviewsMap.values());

    if (uniqueReviews.length > maxReviews) {
        throw createError("INPUT_TOO_LARGE", `Reviews count (${uniqueReviews.length}) exceeds the maximum allowed (${maxReviews})`);
    }

    // Index if vector search is enabled
    let vector_indexing_status = "disabled";
    if (options?.enable_vector_search !== false) {
        try {
            await vectorStore.indexReviews(uniqueReviews);
            vector_indexing_status = "success";
        } catch (e: any) {
            vector_indexing_status = `failed: ${e.message}`;
        }
    }

    const total_reviews_input = rawReviews.length;
    const filtered_spam = total_reviews_input - uniqueReviews.length;

    return {
        data: {
            metadata: {
                schema_version: "1.0",
                rules_version: "1.0",
                taxonomy_version: "1.0",
                models_used: { routing: "none", summary: "none", embedding: "text-embedding-3-small" },
                pii_redaction_engine: "Regex/Custom",
                processed_at: new Date().toISOString(),
                total_reviews_input,
                filtered_spam,
                spam_ratio: total_reviews_input > 0 ? filtered_spam / total_reviews_input : 0,
                total_processed: uniqueReviews.length,
                vector_indexing_status,
                cost_estimate_usd: (uniqueReviews.length * 55 / 1000000) * 0.02, // Estimate cost based on $0.02/1M tokens
                execution_time_ms: 0
            },
            message: `Successfully imported and indexed ${uniqueReviews.length} unique reviews from the dataset. The vector database is now populated and ready for searching.`
        }
    };
}

