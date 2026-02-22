import { describe, it, expect, vi } from 'vitest';
import { analyzeReviewsTool } from '../src/tools/analyze.js';

vi.mock('../src/tools/import.js', () => ({
    loadReviews: vi.fn().mockResolvedValue({
        reviews: [
            { review_id: 'r1', content: 'app keeps crashing contact me at jane@example.com', score: 1 },
            { review_id: 'r2', content: 'this is a good app for card controls!', score: 5 }
        ],
        diagnostics: {
            total_reviews_input: 2,
            filtered_spam: 0,
            invalid_rows_dropped: 0,
            duplicates_dropped: 0,
            spam_ratio: 0
        }
    })
}));

describe('Analyze Tool', () => {
    it('accepts omitted source and uses default dataset resolution', async () => {
        const mockVectorStore = {
            indexReviews: vi.fn(),
            search: vi.fn(),
            clear: vi.fn(),
            getIndexStatus: vi.fn(),
            getStorageDiagnostics: vi.fn()
        } as any;

        const mockLlmClient = {
            processPrompt: vi.fn().mockResolvedValue({
                content: [{ type: "text", text: '{"issue_type": "Bug", "feature_area": "Crash Detection", "severity": "P0"}' }],
                usage: { input_tokens: 10, output_tokens: 10 }
            })
        } as any;

        const result: any = await analyzeReviewsTool({}, { vectorStore: mockVectorStore, llmClient: mockLlmClient });
        expect(result.data.metadata.total_processed).toBe(2);
    });

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

        const mockLlmClient = {
            processPrompt: vi.fn().mockResolvedValue({
                content: [{ type: "text", text: '{"issue_type": "Bug", "feature_area": "Crash Detection", "severity": "P0"}' }],
                usage: { input_tokens: 10, output_tokens: 10 }
            })
        } as any;

        const result: any = await analyzeReviewsTool(input, { vectorStore: mockVectorStore, llmClient: mockLlmClient });

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
        expect(result.data.safety_alerts[0].text).not.toContain('jane@example.com');
        expect(result.data.safety_alerts[0].text).toContain('[REDACTED]');

        // Cost estimate should be > 0 due to 1 LLM request
        expect(result.data.metadata.cost_estimate_usd).toBeGreaterThan(0);
    });

    it('does not leak circuit-breaker metrics across separate analyze calls', async () => {
        const input = {
            source: { type: "inline", reviews: [{ review_id: 'r1', content: 'app keeps crashing contact me at jane@example.com', score: 1 }, { review_id: 'r2', content: 'good app', score: 5 }] },
            options: { concurrency: 1 }
        };

        const mockVectorStore = {
            indexReviews: vi.fn(),
            search: vi.fn(),
            clear: vi.fn(),
            getIndexStatus: vi.fn(),
            getStorageDiagnostics: vi.fn()
        } as any;

        const mockLlmClient = {
            processPrompt: vi.fn().mockResolvedValue({
                content: [{ type: "text", text: '{"issue_type": "Bug", "feature_area": "Crash Detection", "severity": "P0"}' }],
                usage: { input_tokens: 10, output_tokens: 10 }
            })
        } as any;

        const first: any = await analyzeReviewsTool(input, { vectorStore: mockVectorStore, llmClient: mockLlmClient });
        const second: any = await analyzeReviewsTool(input, { vectorStore: mockVectorStore, llmClient: mockLlmClient });

        expect(first.data.metadata.cost_estimate_usd).toBeGreaterThan(0);
        expect(second.data.metadata.cost_estimate_usd).toBe(first.data.metadata.cost_estimate_usd);
    });

    it('falls back to rule engine when LLM output cannot be mapped to valid analyzed schema', async () => {
        const input = {
            source: { type: "inline", reviews: [{ review_id: 'r1', content: 'app keeps crashing', score: 1 }] },
            options: { concurrency: 1 }
        };

        const mockVectorStore = {
            indexReviews: vi.fn(),
            search: vi.fn(),
            clear: vi.fn(),
            getIndexStatus: vi.fn(),
            getStorageDiagnostics: vi.fn()
        } as any;

        const mockLlmClient = {
            processPrompt: vi.fn().mockResolvedValue({
                content: [{ type: "text", text: '{"issue_type": "Bug", "feature_area": "Crash Detection", "severity": "CRITICAL"}' }],
                usage: { input_tokens: 10, output_tokens: 10 }
            })
        } as any;

        const result: any = await analyzeReviewsTool(input, { vectorStore: mockVectorStore, llmClient: mockLlmClient });
        expect(result.data.metadata.total_processed).toBe(2);
        expect(result.data.reviews[0].classification_source).toBe('rule_engine');
    });

    it('accepts deprecated max_reviews option for backward compatibility', async () => {
        const mockVectorStore = {
            indexReviews: vi.fn(),
            search: vi.fn(),
            clear: vi.fn(),
            getIndexStatus: vi.fn(),
            getStorageDiagnostics: vi.fn()
        } as any;
        const mockLlmClient = {
            processPrompt: vi.fn().mockResolvedValue({
                content: [{ type: "text", text: '{"issue_type":"Bug","feature_area":"Crash Detection","severity":"P0"}' }],
                usage: { input_tokens: 10, output_tokens: 10 }
            })
        } as any;

        const result: any = await analyzeReviewsTool({ options: { max_reviews: 1 } }, { vectorStore: mockVectorStore, llmClient: mockLlmClient });
        expect(result.data.metadata.total_reviews_input).toBe(1);
        expect(result.data.metadata.max_reviews).toBe(1);
    });
});
