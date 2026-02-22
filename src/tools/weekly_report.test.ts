import { describe, expect, it } from "vitest";
import { weeklyReportTool } from "./weekly_report.js";

describe("reviews_weekly_report", () => {
    it("generates a weekly report payload with key sections", async () => {
        const result = await weeklyReportTool({
            reviews: [
                { review_id: "r1", issue_type: "Bug", feature_area: "Login/OTP", severity: "P1", sentiment: "Negative", score: 1, review_created_at: "2026-02-01T10:00:00.000Z" },
                { review_id: "r2", issue_type: "Bug", feature_area: "Login/OTP", severity: "P0", sentiment: "Negative", score: 1, review_created_at: "2026-02-02T10:00:00.000Z" },
                { review_id: "r3", issue_type: "Feature Request", feature_area: "Onboarding", severity: "FYI", sentiment: "Neutral", score: 4, review_created_at: "2026-02-03T10:00:00.000Z" }
            ],
            ownership_rules: [{ feature_area: "Login/OTP", squad: "Identity", owner: "alice" }]
        });

        expect(result.data.summary.total_reviews).toBe(3);
        expect(result.data.top_issues.length).toBeGreaterThan(0);
        expect(result.data.priority_rankings.length).toBeGreaterThan(0);
    });
});
