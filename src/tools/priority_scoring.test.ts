import { describe, expect, it } from "vitest";
import { priorityScoringTool } from "./priority_scoring.js";

describe("reviews_priority_scoring", () => {
    it("ranks issue clusters by impact score", async () => {
        const result = await priorityScoringTool({
            reviews: [
                { review_id: "r1", issue_type: "Bug", feature_area: "Login/OTP", severity: "P1", sentiment: "Negative", score: 1, review_created_at: "2026-02-01T10:00:00.000Z" },
                { review_id: "r2", issue_type: "Bug", feature_area: "Login/OTP", severity: "P0", sentiment: "Negative", score: 1, review_created_at: "2026-02-02T10:00:00.000Z" },
                { review_id: "r3", issue_type: "Feature Request", feature_area: "Onboarding", severity: "FYI", sentiment: "Neutral", score: 4, review_created_at: "2026-02-03T10:00:00.000Z" }
            ]
        });
        expect(result.data.rankings.length).toBeGreaterThan(0);
        expect(result.data.rankings[0].issue_key).toBe("Bug::Login/OTP");
    });
});
