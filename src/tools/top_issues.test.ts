import { describe, expect, it } from "vitest";
import { topIssuesTool } from "./top_issues.js";

describe("reviews_top_issues", () => {
    it("returns ranked issue clusters", async () => {
        const result = await topIssuesTool({
            reviews: [
                { review_id: "r1", issue_type: "Bug", feature_area: "Login/OTP", severity: "P1", sentiment: "Negative", score: 1, review_created_at: "2026-02-01T10:00:00.000Z" },
                { review_id: "r2", issue_type: "Bug", feature_area: "Login/OTP", severity: "P0", sentiment: "Negative", score: 2, review_created_at: "2026-02-02T10:00:00.000Z" },
                { review_id: "r3", issue_type: "Performance", feature_area: "Notifications", severity: "P2", sentiment: "Mixed", score: 3, review_created_at: "2026-02-03T10:00:00.000Z" }
            ]
        });

        expect(result.data.total_reviews_considered).toBe(3);
        expect(result.data.issues.length).toBeGreaterThan(0);
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

    it("applies this_week window filter using reference_date", async () => {
        const result = await topIssuesTool({
            reviews: [
                { review_id: "r1", issue_type: "Bug", feature_area: "Login/OTP", severity: "P1", sentiment: "Negative", score: 1, review_created_at: "2026-02-21T10:00:00.000Z" },
                { review_id: "r2", issue_type: "Bug", feature_area: "Login/OTP", severity: "P0", sentiment: "Negative", score: 2, review_created_at: "2026-02-20T10:00:00.000Z" },
                { review_id: "r3", issue_type: "Performance", feature_area: "Notifications", severity: "P2", sentiment: "Mixed", score: 3, review_created_at: "2026-02-10T10:00:00.000Z" }
            ],
            options: { window: "this_week", reference_date: "2026-02-22T00:00:00.000Z" }
        });

        expect(result.data.total_reviews_considered).toBe(2);
        expect(result.data.window_applied).toBe("this_week");
        expect(result.data.filter_range).toEqual({ start_date: "2026-02-16", end_date: "2026-02-22" });
        expect(result.data.issues[0].issue_key).toBe("Bug::Login/OTP");
    });

    it("supports last_90_days preset and explicit date filter override", async () => {
        const resultPreset = await topIssuesTool({
            reviews: [
                { review_id: "r1", issue_type: "Bug", feature_area: "Login/OTP", severity: "P1", sentiment: "Negative", score: 1, review_created_at: "2026-01-10T10:00:00.000Z" },
                { review_id: "r2", issue_type: "Bug", feature_area: "Login/OTP", severity: "P0", sentiment: "Negative", score: 2, review_created_at: "2025-10-10T10:00:00.000Z" }
            ],
            options: { window: "last_90_days", reference_date: "2026-02-22T00:00:00.000Z" }
        });
        expect(resultPreset.data.total_reviews_considered).toBe(1);
        expect(resultPreset.data.filter_range).toEqual({ start_date: "2025-11-25", end_date: "2026-02-22" });

        const resultOverride = await topIssuesTool({
            reviews: [
                { review_id: "r1", issue_type: "Bug", feature_area: "Login/OTP", severity: "P1", sentiment: "Negative", score: 1, review_created_at: "2026-01-10T10:00:00.000Z" },
                { review_id: "r2", issue_type: "Performance", feature_area: "Notifications", severity: "P2", sentiment: "Mixed", score: 3, review_created_at: "2026-02-15T10:00:00.000Z" }
            ],
            options: {
                window: "last_180_days",
                reference_date: "2026-02-22T00:00:00.000Z",
                filters: { start_date: "2026-02-01", end_date: "2026-02-28" }
            }
        });
        expect(resultOverride.data.total_reviews_considered).toBe(1);
        expect(resultOverride.data.filter_range).toEqual({ start_date: "2026-02-01", end_date: "2026-02-28" });
        expect(resultOverride.data.issues[0].issue_key).toBe("Performance::Notifications");
    });
});
