import { describe, it, expect } from 'vitest';
import { importReviews } from '../src/tools/import.js';
import { writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import os from 'os';

describe('importReviews', () => {
    it('should throw INVALID_SCHEMA for invalid input', async () => {
        await expect(importReviews({})).rejects.toMatchObject({ code: 'INVALID_SCHEMA' });
    });

    it('should deduplicate inline reviews by review_id', async () => {
        const input = {
            source: {
                type: 'inline',
                reviews: [
                    { review_id: '1', content: 'test', score: 5 },
                    { review_id: '2', content: 'test2', score: 4 },
                    { review_id: '1', content: 'duplicate', score: 1 },
                ]
            }
        };

        const result = await importReviews(input);
        const reviews = result.data.reviews;
        expect(reviews).toHaveLength(2);
        expect(reviews[0].review_id).toBe('1');
        expect(reviews[1].review_id).toBe('2');
        // It keeps the first one
        expect(reviews[0].content).toBe('test');
    });

    it('should correctly parse CSV and deduplicate', async () => {
        const csvContent = `review_id,content,score
1,csv content 1,5
2,csv content 2,4
1,duplicate content,1`;
        const tempPath = path.join(os.tmpdir(), 'test_reviews.csv');
        writeFileSync(tempPath, csvContent, 'utf8');

        try {
            const input = {
                source: {
                    type: 'file',
                    path: tempPath
                }
            };

            const result = await importReviews(input);
            const reviews = result.data.reviews;
            expect(reviews).toHaveLength(2);
            expect(reviews[0].review_id).toBe('1');
            expect(reviews[0].score).toBe(5);
            expect(reviews[1].review_id).toBe('2');
        } finally {
            unlinkSync(tempPath);
        }
    });

    it('should correctly parse JSON file and deduplicate', async () => {
        const jsonContent = JSON.stringify([
            { review_id: '10', content: 'json 1', score: 5 },
            { review_id: '11', content: 'json 2', score: 4 },
            { review_id: '10', content: 'duplicate json', score: 1 },
        ]);
        const tempPath = path.join(os.tmpdir(), 'test_reviews.json');
        writeFileSync(tempPath, jsonContent, 'utf8');

        try {
            const input = {
                source: {
                    type: 'file',
                    path: tempPath
                }
            };

            const result = await importReviews(input);
            const reviews = result.data.reviews;
            expect(reviews).toHaveLength(2);
            expect(reviews[0].review_id).toBe('10');
            expect(reviews[1].review_id).toBe('11');
        } finally {
            unlinkSync(tempPath);
        }
    });

    it('should throw INPUT_TOO_LARGE when limit exceeded', async () => {
        const reviews = Array.from({ length: 6 }, (_, i) => ({ review_id: String(i), content: 'test', score: 5 }));

        const input = {
            source: { type: 'inline', reviews: [{ review_id: 'temp', content: 'temp', score: 5 }] }, // Just passing basic validation, will override
        };
        input.source.reviews = reviews as any; // Max items validation on Zod will trigger here unless we do it correctly

        // Wait, Zod schema has max(5000), but if we want to test custom max_reviews = 5, we can do:
        const input2 = {
            source: {
                type: 'inline',
                reviews: [
                    { review_id: '1', content: 'A', score: 1 },
                    { review_id: '2', content: 'A', score: 1 },
                    { review_id: '3', content: 'A', score: 1 },
                    { review_id: '4', content: 'A', score: 1 },
                    { review_id: '5', content: 'A', score: 1 },
                    { review_id: '6', content: 'A', score: 1 },
                ]
            },
            options: {
                max_reviews: 5
            }
        };

        await expect(importReviews(input2)).rejects.toMatchObject({ code: 'INPUT_TOO_LARGE' });
    });
});
