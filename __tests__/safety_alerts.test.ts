import { describe, it, expect, vi } from 'vitest';
import { getSafetyAlertsTool } from '../src/tools/safety_alerts.js';

describe('reviews.get_safety_alerts tool', () => {
    it('returns only safety alerts and metadata using the fast-path', async () => {
        const input = {
            source: {
                type: 'inline',
                reviews: [
                    {
                        review_id: "1",
                        content: "This app is great, I love it!",
                        score: 5
                    },
                    {
                        review_id: "2",
                        content: "SOS not working, could not send emergency alert!",
                        score: 1
                    },
                    {
                        review_id: "3",
                        content: "App is very slow and freezes sometimes.",
                        score: 2
                    }
                ]
            }
        };

        const mockVectorStore = {
            indexReviews: vi.fn(),
            search: vi.fn(),
            clear: vi.fn(),
            getIndexStatus: vi.fn(),
            getStorageDiagnostics: vi.fn()
        } as any;

        const result = await getSafetyAlertsTool(input, mockVectorStore);

        expect(result.data).toBeDefined();
        expect(result.data.metadata).toBeDefined();
        // Since it's fast path, we expect no models to be used for routing really, but let's check basic structure
        expect(result.data.metadata.total_reviews_input).toBe(3);

        expect(result.data.safety_alerts).toBeDefined();
        // Should only have the P0 alert (SOS not working) and possibly the P1 freeze depending on rule engine priority
        // The freeze might be P1 Performance.

        // review 1: FYI, review 2: P0 Safety, review 3: P1 Performance (from rules.ts logic)
        expect(result.data.safety_alerts.length).toBe(2);

        const review2Alert = result.data.safety_alerts.find((a: any) => a.review_id === "2");
        expect(review2Alert).toBeDefined();
        expect(review2Alert.severity).toBe("P0");
        expect(review2Alert.requires_immediate_attention).toBe(true);

        const review3Alert = result.data.safety_alerts.find((a: any) => a.review_id === "3");
        expect(review3Alert).toBeDefined();
        expect(review3Alert.severity).toBe("P1");
        expect(review3Alert.requires_immediate_attention).toBe(false);

        // It should NOT contain the `reviews` array payload
        expect((result.data as any).reviews).toBeUndefined();
    });
});
