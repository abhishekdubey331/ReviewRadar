import { describe, expect, it, vi } from "vitest";
import { analyzeReviewsTool } from "../src/tools/analyze.js";
import { topIssuesTool } from "../src/tools/top_issues.js";
import { segmentBreakdownTool } from "../src/tools/segment_breakdown.js";
import { timeTrendsTool } from "../src/tools/time_trends.js";

vi.mock("../src/tools/import.js", () => ({
    loadReviews: vi.fn().mockResolvedValue({
        reviews: [
            { review_id: "r1", content: "app crashes after login", score: 1, app_version: "1.0.0", review_created_at: "2026-02-01T10:00:00.000Z", device: "Pixel 8", os_version: "Android 14", locale: "en-US", platform: "play_store" },
            { review_id: "r2", content: "otp never arrives", score: 2, app_version: "1.0.0", review_created_at: "2026-02-02T10:00:00.000Z", device: "Pixel 8", os_version: "Android 14", locale: "en-US", platform: "play_store" },
            { review_id: "r3", content: "good app overall", score: 5, app_version: "1.0.1", review_created_at: "2026-02-03T10:00:00.000Z", device: "iPhone 15", os_version: "iOS 18", locale: "en-US", platform: "app_store" }
        ],
        diagnostics: {
            total_reviews_input: 3,
            filtered_spam: 0,
            invalid_rows_dropped: 0,
            duplicates_dropped: 0,
            spam_ratio: 0
        }
    })
}));

vi.mock("../src/engine/llmClient.js", () => ({
    ConcurrentLLMClient: vi.fn().mockImplementation(() => ({
        processPrompt: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "{\"issue_type\":\"Bug\",\"feature_area\":\"Login/OTP\",\"severity\":\"P1\"}" }],
            usage: { input_tokens: 10, output_tokens: 10 }
        })
    }))
}));

describe("analytics tool integration", () => {
    it("chains analyze -> top_issues/segment_breakdown/time_trends", async () => {
        const rawReviews = [
            { review_id: "r1", content: "app crashes after login", score: 1, app_version: "1.0.0", review_created_at: "2026-02-01T10:00:00.000Z", device: "Pixel 8", os_version: "Android 14", locale: "en-US", platform: "play_store" },
            { review_id: "r2", content: "otp never arrives", score: 2, app_version: "1.0.0", review_created_at: "2026-02-02T10:00:00.000Z", device: "Pixel 8", os_version: "Android 14", locale: "en-US", platform: "play_store" },
            { review_id: "r3", content: "good app overall", score: 5, app_version: "1.0.1", review_created_at: "2026-02-03T10:00:00.000Z", device: "iPhone 15", os_version: "iOS 18", locale: "en-US", platform: "app_store" }
        ];

        const vectorStore = {
            indexReviews: vi.fn(),
            search: vi.fn(),
            clear: vi.fn(),
            getIndexStatus: vi.fn(),
            getStorageDiagnostics: vi.fn()
        } as any;

        const llmClient = {
            processPrompt: vi.fn().mockResolvedValue({
                content: [{ type: "text", text: "{\"issue_type\":\"Bug\",\"feature_area\":\"Login/OTP\",\"severity\":\"P1\"}" }],
                usage: { input_tokens: 10, output_tokens: 10 }
            })
        } as any;

        const analyzed = await analyzeReviewsTool({
            source: { type: "inline", reviews: rawReviews }
        }, { vectorStore, llmClient });

        const rawById = new Map(rawReviews.map((r) => [r.review_id, r]));
        const enriched = analyzed.data.reviews.map((r: any) => {
            const raw = rawById.get(r.review_id);
            return {
                review_id: r.review_id,
                issue_type: r.issue_type,
                feature_area: r.feature_area,
                severity: r.severity,
                sentiment: r.sentiment,
                review_created_at: raw?.review_created_at,
                score: raw?.score,
                app_version: raw?.app_version,
                os_version: raw?.os_version,
                device: raw?.device,
                locale: raw?.locale,
                platform: raw?.platform
            };
        });

        const topIssues = await topIssuesTool({ reviews: enriched, options: { limit: 3 } });
        expect(topIssues.data.total_reviews_considered).toBe(3);
        expect(topIssues.data.issues.length).toBeGreaterThan(0);

        const segments = await segmentBreakdownTool({
            reviews: enriched,
            options: { dimension: "app_version" }
        });
        expect(segments.data.total_reviews_considered).toBe(3);
        expect(segments.data.segments.length).toBeGreaterThan(0);

        const trends = await timeTrendsTool({
            reviews: enriched,
            options: { bucket: "day" }
        });
        expect(trends.data.total_reviews_considered).toBe(3);
        expect(trends.data.trends.length).toBe(3);
    });
});
