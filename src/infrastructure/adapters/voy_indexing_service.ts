import { EmbeddedResource, Voy } from "voy-search/voy_search.js";
import pLimit from "p-limit";
import { ReviewRecord } from "../../domain/ports/vector_store.js";

export interface IndexedReviewRecord {
    id: string;
    title: string;
    url: string;
    embeddings: number[];
    reviewMetadata: Record<string, unknown>;
}

export interface IndexingDeps {
    embed: (input: string[] | string) => Promise<number[][]>;
    isValidEmbedding: (embedding: unknown) => boolean;
    onInvalidEmbedding: (reviewId: string) => void;
}

export function addWithBisect(
    voy: Voy,
    items: EmbeddedResource[],
    onSingleFailure: (id: string, error: unknown) => void
) {
    if (items.length === 0) return;

    try {
        voy.add({ embeddings: items });
        return;
    } catch (error) {
        if (items.length === 1) {
            onSingleFailure(items[0].id, error);
            return;
        }
    }

    const mid = Math.floor(items.length / 2);
    addWithBisect(voy, items.slice(0, mid), onSingleFailure);
    addWithBisect(voy, items.slice(mid), onSingleFailure);
}

export function addEmbeddingsInBatches(
    voy: Voy,
    items: EmbeddedResource[],
    batchSize: number,
    onBatchFailure: (batchSize: number) => void,
    onSingleFailure: (id: string, error: unknown) => void
) {
    if (items.length === 0) return;

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        try {
            voy.add({ embeddings: batch });
        } catch {
            onBatchFailure(batch.length);
            addWithBisect(voy, batch, onSingleFailure);
        }
    }
}

export async function embedReviewBatch(
    reviews: ReviewRecord[],
    deps: IndexingDeps
): Promise<IndexedReviewRecord[]> {
    const texts = reviews.map((r) => r.content);
    const embeddings = await deps.embed(texts);

    return reviews
        .map((review, idx) => ({
            id: String(review.review_id),
            title: review.user_name || "Review",
            url: review.content,
            embeddings: embeddings[idx],
            reviewMetadata: {
                id: String(review.review_id),
                author: review.user_name,
                content: review.content,
                score: review.score,
                date: review.review_created_at,
            }
        }))
        .filter((item) => {
            const valid = deps.isValidEmbedding(item.embeddings);
            if (!valid) deps.onInvalidEmbedding(item.id);
            return valid;
        });
}

export async function indexReviewsInChunks(
    reviews: ReviewRecord[],
    options: {
        chunkSize: number;
        concurrency: number;
    },
    deps: IndexingDeps
): Promise<IndexedReviewRecord[]> {
    const limit = pLimit(options.concurrency);
    const tasks: Array<Promise<IndexedReviewRecord[]>> = [];

    for (let i = 0; i < reviews.length; i += options.chunkSize) {
        const reviewChunk = reviews.slice(i, i + options.chunkSize);
        tasks.push(limit(() => embedReviewBatch(reviewChunk, deps)));
    }

    const results = await Promise.all(tasks);
    return results.flat();
}
