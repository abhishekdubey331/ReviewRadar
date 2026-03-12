import { LoadedReview } from "./analyze_service.js";

export function selectReviewsForAnalysis(reviews: LoadedReview[], maxReviews: number): LoadedReview[] {
    return [...reviews]
        .sort((a, b) => {
            const aTs = a.review_created_at ? Date.parse(a.review_created_at) : Number.NaN;
            const bTs = b.review_created_at ? Date.parse(b.review_created_at) : Number.NaN;
            const aNum = Number.isFinite(aTs) ? aTs : 0;
            const bNum = Number.isFinite(bTs) ? bTs : 0;
            return bNum - aNum;
        })
        .slice(0, maxReviews);
}
