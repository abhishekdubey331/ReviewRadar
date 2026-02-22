import { SourceSchema, ReviewInputSchema } from '../schemas/shared.js';
import { IVectorStore } from '../domain/ports/vector_store.js';
import { createError } from '../utils/errors.js';
import { z } from 'zod';
import { readFileSync, existsSync, statSync } from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { fileURLToPath } from 'url';

export const ImportToolInputSchema = z.object({
    source: SourceSchema.optional(),
});

export const LoadReviewsInputSchema = z.object({
    source: SourceSchema,
});

function resolveDefaultSourcePath(): string {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const candidates = [
        path.resolve(__dirname, '../../sample_data/scraped_reviews.csv'),
        path.resolve(__dirname, '../../sample_data/reviews.csv'),
        path.resolve(process.cwd(), 'sample_data/scraped_reviews.csv'),
        path.resolve(process.cwd(), 'sample_data/reviews.csv')
    ];

    const existing = candidates.find((candidate) => existsSync(candidate));
    if (!existing) {
        throw createError("FILE_NOT_FOUND", "Default sample data file not found", { candidates });
    }

    return existing;
}

function resolveSource(input: unknown) {
    const parseResult = ImportToolInputSchema.safeParse(input);
    if (!parseResult.success) {
        throw createError("INVALID_SCHEMA", "Invalid import parameters", parseResult.error.format());
    }

    let { source } = parseResult.data;

    // Non-destructive import by default: keep existing index if indexing fails mid-run.

    // Default to the auto-scraped dataset if no source is explicitly provided
    if (!source || (source.type === 'file' && !source.path)) {
        source = { type: 'file', path: resolveDefaultSourcePath() };
    }

    if (source.type === "file" && !existsSync(source.path)) {
        throw createError("FILE_NOT_FOUND", `File not found at path: ${source.path}`);
    }

    return source;
}

export async function loadReviews(input: unknown) {
    const parseResult = LoadReviewsInputSchema.safeParse(input);
    if (!parseResult.success) {
        throw createError("INVALID_SCHEMA", "Invalid load parameters", parseResult.error.format());
    }

    const { source } = parseResult.data;

    const maxReviews = 50000;
    let rawReviews: any[] = [];

    if (source.type === "inline") {
        rawReviews = source.reviews;
    } else if (source.type === "file") {
        const stats = statSync(source.path);
        if (stats.size > 100 * 1024 * 1024) {
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
    let invalidRowsDropped = 0;
    let duplicatesDropped = 0;

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
                invalidRowsDropped++;
                continue;
            }
            const review = reviewParse.data;
            if (!reviewsMap.has(review.review_id)) {
                reviewsMap.set(review.review_id, review);
            } else {
                duplicatesDropped++;
            }
        } else {
            if (!reviewsMap.has(raw.review_id)) {
                reviewsMap.set(raw.review_id, raw);
            } else {
                duplicatesDropped++;
            }
        }
    }

    const uniqueReviews = Array.from(reviewsMap.values());

    if (uniqueReviews.length > maxReviews) {
        throw createError("INPUT_TOO_LARGE", `Reviews count (${uniqueReviews.length}) exceeds the maximum allowed (${maxReviews})`);
    }

    const total_reviews_input = rawReviews.length;
    const filtered_spam = total_reviews_input - uniqueReviews.length;

    return {
        reviews: uniqueReviews,
        diagnostics: {
            total_reviews_input,
            filtered_spam,
            invalid_rows_dropped: invalidRowsDropped,
            duplicates_dropped: duplicatesDropped,
            spam_ratio: total_reviews_input > 0 ? filtered_spam / total_reviews_input : 0
        }
    };
}

export async function importReviews(input: unknown, vectorStore: IVectorStore) {
    const source = resolveSource(input);
    const loaded = await loadReviews({ source });
    const uniqueReviews = loaded.reviews;
    const {
        total_reviews_input,
        filtered_spam,
        invalid_rows_dropped,
        duplicates_dropped,
        spam_ratio
    } = loaded.diagnostics;

    let vector_indexing_status = "disabled";
    let import_status: "success" | "partial_success" = "success";
    try {
        await vectorStore.indexReviews(uniqueReviews);
        vector_indexing_status = "success";
    } catch (e: any) {
        vector_indexing_status = `failed: ${e.message}`;
        import_status = "partial_success";
    }

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
                invalid_rows_dropped,
                duplicates_dropped,
                spam_ratio,
                total_processed: uniqueReviews.length,
                import_status,
                vector_indexing_status,
                cost_estimate_usd: (uniqueReviews.length * 55 / 1000000) * 0.02,
                execution_time_ms: 0
            },
            reviews: uniqueReviews,
            message: import_status === "success"
                ? `Successfully imported and indexed ${uniqueReviews.length} unique reviews from the dataset. The vector database is now populated and ready for searching.`
                : `Imported ${uniqueReviews.length} unique reviews, but vector indexing failed. Search will be unavailable until indexing succeeds.`
        }
    };
}
