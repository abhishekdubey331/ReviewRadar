import { describe, expect, it } from "vitest";
import { compareWindowsTool } from "./compare_windows.js";

describe("reviews_compare_windows", () => {
    it("returns regression and improvement deltas", async () => {
        const result = await compareWindowsTool({
            baseline_reviews: [
                { review_id: "b1", issue_type: "Bug", feature_area: "Login/OTP", sentiment: "Negative", severity: "P1", score: 2 },
                { review_id: "b2", issue_type: "Feature Request", feature_area: "Onboarding", sentiment: "Neutral", severity: "FYI", score: 4 }
            ],
            current_reviews: [
                { review_id: "c1", issue_type: "Bug", feature_area: "Login/OTP", sentiment: "Negative", severity: "P1", score: 1 },
                { review_id: "c2", issue_type: "Bug", feature_area: "Login/OTP", sentiment: "Negative", severity: "P0", score: 1 },
                { review_id: "c3", issue_type: "Performance", feature_area: "Notifications", sentiment: "Mixed", severity: "P2", score: 3 }
            ]
        });
        expect(result.data.metrics.length).toBe(3);
        expect(result.data.top_regressions[0].issue_key).toBe("Bug::Login/OTP");
    });
});
