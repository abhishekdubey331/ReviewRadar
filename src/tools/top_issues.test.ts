import { describe, expect, it } from "vitest";
import { topIssuesTool } from "./top_issues.js";

describe("reviews_top_issues", () => {
    it("returns ranked issue clusters", async () => {
        const result = await topIssuesTool({
            reviews: [
                { review_id: "r1", issue_type: "Bug", feature_area: "Login/OTP", severity: "P1", sentiment: "Negative", score: 1, review_created_at: "2026-02-01T10:00:00.000Z" },
                { review_id: "r2", issue_type: "Bug", feature_area: "Login/OTP", severity: "P0", sentiment: "Negative", score: 2, review_created_at: "2026-02-02T10:00:00.000Z" },
                { review_id: "r3", issue_type: "Performance", feature_area: "Notifications", severity: "P2", sentiment: "Mixed", score: 3, review_created_at: "2026-02-03T10:00:00.000Z" }
            ],
            options: { limit: 1 }
        });

        expect(result.data.total_reviews_considered).toBe(3);
        expect(result.data.issues).toHaveLength(1);
        expect(result.data.issues[0].issue_key).toBe("Bug::Login/OTP");
        expect(result.data.issues[0].review_count).toBe(2);
    });

    it("applies filters and validates schema", async () => {
        const result = await topIssuesTool({
            reviews: [
                { review_id: "r1", issue_type: "Bug", feature_area: "Login/OTP", severity: "P1", sentiment: "Negative", score: 1, review_created_at: "2026-02-01T10:00:00.000Z" },
                { review_id: "r2", issue_type: "Feature Request", feature_area: "Onboarding", severity: "FYI", sentiment: "Neutral", score: 4, review_created_at: "2026-02-10T10:00:00.000Z" }
            ],
            options: { filters: { severities: ["P1"] } }
        });

        expect(result.data.total_reviews_considered).toBe(1);
        expect(result.data.issues[0].issue_key).toBe("Bug::Login/OTP");

        await expect(topIssuesTool({ reviews: [{ review_id: "x" }] })).rejects.toMatchObject({
            code: "INVALID_SCHEMA"
        });
    });
});
