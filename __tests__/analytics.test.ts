import { describe, expect, it } from "vitest";
import { makeAnalyzedReview } from "./helpers/reviewBuilders.js";
import { applyFilters, segmentBreakdown, timeTrends, topIssues } from "../src/analytics/aggregations.js";

describe("analytics aggregations", () => {
    const dataset = [
        makeAnalyzedReview({ review_id: "r1", issue_type: "Bug", feature_area: "Login/OTP", severity: "P1", sentiment: "Negative", score: 1, app_version: "1.0.0", review_created_at: "2026-02-01T10:00:00.000Z" }),
        makeAnalyzedReview({ review_id: "r2", issue_type: "Bug", feature_area: "Login/OTP", severity: "P0", sentiment: "Negative", score: 1, app_version: "1.0.0", review_created_at: "2026-02-02T10:00:00.000Z" }),
        makeAnalyzedReview({ review_id: "r3", issue_type: "Performance", feature_area: "Notifications", severity: "P2", sentiment: "Mixed", score: 3, app_version: "1.0.1", review_created_at: "2026-02-08T10:00:00.000Z" }),
        makeAnalyzedReview({ review_id: "r4", issue_type: "Feature Request", feature_area: "Onboarding", severity: "FYI", sentiment: "Neutral", score: 4, app_version: "1.0.1", review_created_at: "2026-02-09T10:00:00.000Z" }),
        makeAnalyzedReview({ review_id: "r5", issue_type: "Bug", feature_area: "Login/OTP", severity: "P1", sentiment: "Negative", score: 2, app_version: "1.0.2", review_created_at: "2026-02-10T10:00:00.000Z" }),
        makeAnalyzedReview({ review_id: "r6", issue_type: "Praise", feature_area: "Card Controls", severity: "FYI", sentiment: "Positive", score: 5, app_version: "1.0.2", review_created_at: "2026-02-11T10:00:00.000Z" })
    ];

    it("filters by date and severity", () => {
        const filtered = applyFilters(dataset, {
            start_date: "2026-02-08T00:00:00.000Z",
            end_date: "2026-02-11T23:59:59.000Z",
            severities: ["P1", "P2", "FYI"]
        });
        expect(filtered.map((r) => r.review_id)).toEqual(["r3", "r4", "r5", "r6"]);
    });

    it("builds ranked top issues", () => {
        const result = topIssues(dataset, { limit: 2 });
        expect(result.total_reviews_considered).toBe(6);
        expect(result.issues[0].issue_key).toBe("Bug::Login/OTP");
        expect(result.issues[0].review_count).toBe(3);
        expect(result.issues[0].severity_breakdown.P0).toBe(1);
        expect(result.issues[0].severity_breakdown.P1).toBe(2);
        expect(result.issues[0].avg_rating).toBe(1.33);
        expect(result.issues[0].example_review_ids).toEqual(["r1", "r2", "r5"]);
        expect(result.issues).toHaveLength(2);
    });

    it("builds segment breakdown for app_version", () => {
        const result = segmentBreakdown(dataset, { dimension: "app_version" });
        expect(result.total_reviews_considered).toBe(6);
        expect(result.segments[0]).toMatchObject({
            segment_dimension: "app_version",
            segment_value: "1.0.0",
            issue_count: 2,
            p0_p1_count: 2
        });
    });

    it("builds segment breakdown by rating buckets", () => {
        const result = segmentBreakdown(dataset, { dimension: "rating_bucket" });
        const oneTwo = result.segments.find((s) => s.segment_value === "1-2");
        const three = result.segments.find((s) => s.segment_value === "3");
        const fourFive = result.segments.find((s) => s.segment_value === "4-5");
        expect(oneTwo?.issue_count).toBe(3);
        expect(three?.issue_count).toBe(1);
        expect(fourFive?.issue_count).toBe(2);
    });

    it("builds day-level time trends", () => {
        const result = timeTrends(dataset, { bucket: "day", top_issue_limit: 2 });
        expect(result.total_reviews_considered).toBe(6);
        expect(result.trends[0].time_bucket).toBe("2026-02-01");
        expect(result.trends[0].negative_share).toBe(1);
        expect(result.trends[0].top_issue_keys[0]).toBe("Bug::Login/OTP");
    });

    it("builds week-level time trends with filters", () => {
        const result = timeTrends(dataset, {
            bucket: "week",
            filters: {
                start_date: "2026-02-08T00:00:00.000Z",
                sentiments: ["Mixed", "Neutral", "Negative"]
            }
        });
        expect(result.total_reviews_considered).toBe(3);
        expect(result.trends).toHaveLength(2);
        expect(result.trends[0].time_bucket).toBe("2026-02-02");
        expect(result.trends[0].p1_count).toBe(0);
        expect(result.trends[0].p2_count).toBe(1);
        expect(result.trends[0].fyi_count).toBe(0);
        expect(result.trends[1].time_bucket).toBe("2026-02-09");
        expect(result.trends[1].p1_count).toBe(1);
    });
});
