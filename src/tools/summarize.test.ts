import { describe, it, expect, vi } from 'vitest';
import { summarizeReviews } from './summarize.js';
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
});
