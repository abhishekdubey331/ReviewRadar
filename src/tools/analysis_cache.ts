import { LoadedReview, ReviewProcessingResult } from "./analyze_service.js";
import { createStableHash, normalizeForAnalysis } from "../utils/text.js";
import { redactPII } from "../utils/redact.js";

export interface AnalysisCache {
    getOrCreate(
        review: LoadedReview,
        factory: () => Promise<ReviewProcessingResult>
    ): { promise: Promise<ReviewProcessingResult>; isDuplicate: boolean };
}

function buildCacheKey(review: LoadedReview): string {
    return createStableHash(`${review.score ?? "na"}:${normalizeForAnalysis(redactPII(review.content))}`);
}

export class InMemoryAnalysisCache implements AnalysisCache {
    private readonly cache = new Map<string, Promise<ReviewProcessingResult>>();

    getOrCreate(
        review: LoadedReview,
        factory: () => Promise<ReviewProcessingResult>
    ): { promise: Promise<ReviewProcessingResult>; isDuplicate: boolean } {
        const cacheKey = buildCacheKey(review);
        const existing = this.cache.get(cacheKey);
        if (existing) {
            return { promise: existing, isDuplicate: true };
        }

        const promise = factory();
        this.cache.set(cacheKey, promise);
        return { promise, isDuplicate: false };
    }
}
