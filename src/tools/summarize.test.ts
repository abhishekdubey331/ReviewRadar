import { describe, it, expect, vi } from 'vitest';
import { summarizeReviews, summarizeTool } from './summarize.js';
import { ConcurrentLLMClient } from '../engine/llmClient.js';

vi.mock('../engine/llmClient.js', () => {
    return {
        ConcurrentLLMClient: vi.fn().mockImplementation(() => {
            return {
                processPrompt: vi.fn().mockResolvedValue({
                    content: [{ type: "text", text: '["Theme 1", "Theme 2", "Theme 3"]' }]
                })
            };
        })
    };
});

describe('reviews.summarize', () => {
    it('groups reviews by FeatureArea and IssueType, and calculates aggregated counts correctly', async () => {
        const mockClient = new ConcurrentLLMClient({ apiKey: 'mock' });
        const input = [
            { text: "Terrible crash!", feature_area: "Login", issue_type: "Bug", severity: "P0" },
            { text: "Can't log in.", feature_area: "Login", issue_type: "Bug", severity: "P0" },
            { text: "Slow app", feature_area: "Dashboard", issue_type: "Performance", severity: "P1" },
            { text: "Need dark mode", feature_area: "Settings", issue_type: "UX", severity: "P2" },
            { text: "Great app!", feature_area: "Other", issue_type: "Praise", severity: "FYI" }
        ];

        const result = await summarizeReviews(input, mockClient);

        expect(result.p0_count).toBe(2);
        expect(result.p1_count).toBe(1);
        expect(result.p2_count).toBe(1);
        expect(result.fyi_count).toBe(1);
        expect(result.top_themes).toEqual(["Theme 1", "Theme 2", "Theme 3"]);
    });

    it('rejects oversized summarize payloads', async () => {
        const mockClient = new ConcurrentLLMClient({ apiKey: 'mock' });
        const oversized = Array.from({ length: 5001 }, (_, idx) => ({
            text: `Review ${idx}`,
            feature_area: "Login",
            issue_type: "Bug",
            severity: "P1"
        }));

        await expect(summarizeTool({ reviews: oversized }, mockClient as any)).rejects.toMatchObject({
            code: "INVALID_SCHEMA",
            message: "Invalid summarize parameters"
        });
    });

    it('accepts analyzed-review payloads that omit text', async () => {
        const mockClient = new ConcurrentLLMClient({ apiKey: 'mock' });
        const input = [{
            review_id: "r1",
            issue_type: "Bug",
            feature_area: "Login/OTP",
            severity: "P1",
            sentiment: "Negative",
            confidence_score: 0.8,
            classification_source: "hybrid",
            signals: {
                summary: "",
                repro_hints: [],
                device: "Unknown",
                os_version: "Unknown",
                app_version: "Unknown",
                feature_mentions: []
            },
            text: ""
        }];

        const result = await summarizeTool({ reviews: input }, mockClient as any);
        expect(result.data.p1_count).toBe(1);
    });
});
