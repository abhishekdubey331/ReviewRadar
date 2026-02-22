import { describe, expect, it } from "vitest";
import { timeTrendsTool } from "./time_trends.js";

describe("reviews_time_trends", () => {
    it("returns day bucket metrics", async () => {
        const result = await timeTrendsTool({
            reviews: [
                { review_id: "r1", issue_type: "Bug", feature_area: "Login/OTP", severity: "P1", sentiment: "Negative", review_created_at: "2026-02-01T10:00:00.000Z" },
                { review_id: "r2", issue_type: "Bug", feature_area: "Login/OTP", severity: "P0", sentiment: "Negative", review_created_at: "2026-02-01T12:00:00.000Z" },
                { review_id: "r3", issue_type: "Performance", feature_area: "Notifications", severity: "P2", sentiment: "Mixed", review_created_at: "2026-02-02T10:00:00.000Z" }
            ],
            options: { bucket: "day", top_issue_limit: 1 }
        });

        expect(result.data.total_reviews_considered).toBe(3);
        expect(result.data.trends).toHaveLength(2);
        expect(result.data.trends[0].time_bucket).toBe("2026-02-01");
        expect(result.data.trends[0].total_reviews).toBe(2);
        expect(result.data.trends[0].p0_count).toBe(1);
        expect(result.data.trends[0].p1_count).toBe(1);
        expect(result.data.trends[0].top_issue_keys).toEqual(["Bug::Login/OTP"]);
    });

    it("supports weekly trends, filters, and schema validation", async () => {
        const result = await timeTrendsTool({
            reviews: [
                { review_id: "r1", issue_type: "Bug", feature_area: "Login/OTP", severity: "P1", sentiment: "Negative", review_created_at: "2026-02-01T10:00:00.000Z" },
                { review_id: "r2", issue_type: "Feature Request", feature_area: "Onboarding", severity: "FYI", sentiment: "Neutral", review_created_at: "2026-02-10T10:00:00.000Z" },
                { review_id: "r3", issue_type: "Bug", feature_area: "Login/OTP", severity: "P1", sentiment: "Negative", review_created_at: "2026-02-11T10:00:00.000Z" }
            ],
            options: {
                bucket: "week",
                filters: { sentiments: ["Negative"] }
            }
        });

        expect(result.data.total_reviews_considered).toBe(2);
        expect(result.data.trends).toHaveLength(2);
        expect(result.data.trends[1].p1_count).toBe(1);

        await expect(timeTrendsTool({
            reviews: [{ review_id: "bad", issue_type: "Bug", feature_area: "Login/OTP", severity: "P3" }]
        })).rejects.toMatchObject({ code: "INVALID_SCHEMA" });
    });
});
