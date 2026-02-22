import { describe, expect, it } from "vitest";
import { segmentBreakdownTool } from "./segment_breakdown.js";

describe("reviews_segment_breakdown", () => {
    it("returns grouped metrics for app_version", async () => {
        const result = await segmentBreakdownTool({
            reviews: [
                { review_id: "r1", issue_type: "Bug", feature_area: "Login/OTP", severity: "P1", sentiment: "Negative", score: 1, app_version: "1.0.0" },
                { review_id: "r2", issue_type: "Bug", feature_area: "Login/OTP", severity: "P0", sentiment: "Negative", score: 2, app_version: "1.0.0" },
                { review_id: "r3", issue_type: "Performance", feature_area: "Notifications", severity: "P2", sentiment: "Mixed", score: 3, app_version: "1.0.1" }
            ],
            options: { dimension: "app_version" }
        });

        expect(result.data.total_reviews_considered).toBe(3);
        expect(result.data.segments[0]).toMatchObject({
            segment_dimension: "app_version",
            segment_value: "1.0.0",
            issue_count: 2,
            p0_p1_count: 2
        });
    });

    it("supports rating_bucket and validates schema", async () => {
        const result = await segmentBreakdownTool({
            reviews: [
                { review_id: "r1", issue_type: "Bug", feature_area: "Login/OTP", severity: "P1", score: 1 },
                { review_id: "r2", issue_type: "Bug", feature_area: "Login/OTP", severity: "P0", score: 2 },
                { review_id: "r3", issue_type: "Performance", feature_area: "Notifications", severity: "FYI", score: 4 }
            ],
            options: { dimension: "rating_bucket", limit: 2 }
        });

        expect(result.data.segments).toHaveLength(2);
        expect(result.data.segments[0].segment_dimension).toBe("rating_bucket");

        await expect(segmentBreakdownTool({
            reviews: [{ review_id: "r1", issue_type: "Bug", feature_area: "Login/OTP" }]
        })).rejects.toMatchObject({ code: "INVALID_SCHEMA" });
    });
});
