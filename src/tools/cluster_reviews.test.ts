import { describe, expect, it } from "vitest";
import { clusterReviewsTool } from "./cluster_reviews.js";

describe("reviews_cluster_reviews", () => {
    const reviews = [
        { review_id: "r1", issue_type: "Unknown", feature_area: "Unknown", severity: "P2", sentiment: "Negative", score: 2, review_created_at: "2026-02-21T10:00:00.000Z", text: "weird issue one" },
        { review_id: "r2", issue_type: "Unknown", feature_area: "Unknown", severity: "FYI", sentiment: "Neutral", score: 3, review_created_at: "2026-02-20T10:00:00.000Z", text: "weird issue two" },
        { review_id: "r3", issue_type: "Bug", feature_area: "Login/OTP", severity: "P1", sentiment: "Negative", score: 1, review_created_at: "2026-02-19T10:00:00.000Z", text: "cannot login" }
    ];

    it("returns unknown cluster rows for last_30_days", async () => {
        const result = await clusterReviewsTool({
            reviews,
            options: { include_unknown_only: true, window: "last_30_days", reference_date: "2026-02-22T00:00:00.000Z" }
        });

        expect(result.data.total_cluster_matches).toBe(2);
        expect(result.data.reviews).toHaveLength(2);
        expect(result.data.reviews[0].review_id).toBe("r1");
    });
});

