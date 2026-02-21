import { describe, it, expect, vi } from 'vitest';
import { analyzeReviewsTool } from '../src/tools/analyze.js';

vi.mock('../src/tools/import.js', () => ({
    importReviews: vi.fn().mockResolvedValue({
        data: {
            metadata: { total_reviews_input: 2, total_processed: 2 },
            reviews: [
                { review_id: 'r1', content: 'app keeps crashing always', score: 1 },
                { review_id: 'r2', content: 'this is a good app for card controls!', score: 5 }
            ]
        }
    })
}));

vi.mock('../src/engine/llmClient.js', () => {
    return {
        ConcurrentLLMClient: vi.fn().mockImplementation(() => ({
            processPrompt: vi.fn().mockResolvedValue({
                content: [{ type: "text", text: '{"issue_type": "Bug", "feature_area": "Crash Detection", "severity": "P0"}' }],
                usage: { input_tokens: 10, output_tokens: 10 }
            })
        }))
    };
});

describe('Analyze Tool', () => {
    it('analyzes reviews, calculates metadata math correctly, and routes to LLM', async () => {
        const input = {
            source: { type: "inline", reviews: [{ review_id: 'r1', content: 'app keeps crashing', score: 1 }, { review_id: 'r2', content: 'good app', score: 5 }] },
            options: { concurrency: 1 }
        };

        const mockVectorStore = {
            indexReviews: vi.fn(),
            search: vi.fn(),
            clear: vi.fn(),
            getIndexStatus: vi.fn(),
            getStorageDiagnostics: vi.fn()
        } as any;

        const result: any = await analyzeReviewsTool(input, mockVectorStore);

        // Expect 2 reviews to have been processed
        expect(result.data.metadata.total_processed).toBe(2);

        // Review 1 ("app keeps crashing") routes to LLM (Crash + Negative)
        // Review 2 ("good app") routes to pure deterministic rule_engine (Positive praise)
        expect(result.data.metadata.llm_routed_count).toBe(1);
        expect(result.data.metadata.llm_routed_ratio).toBe(0.5); // 1 out of 2

        expect(result.data.reviews.length).toBe(2);

        // P0 safety alerts should be captured
        expect(result.data.safety_alerts.length).toBe(1);
        expect(result.data.safety_alerts[0].review_id).toBe('r1');

        // Cost estimate should be > 0 due to 1 LLM request
        expect(result.data.metadata.cost_estimate_usd).toBeGreaterThan(0);
    });
});
