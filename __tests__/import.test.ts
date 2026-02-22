import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importReviews } from '../src/tools/import.js';
import { writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import os from 'os';
import { IVectorStore } from '../src/domain/ports/vector_store.js';

const mockVectorStore: IVectorStore = {
    indexReviews: vi.fn().mockResolvedValue(0),
    search: vi.fn().mockResolvedValue([]),
    clear: vi.fn().mockResolvedValue(undefined),
    getIndexStatus: vi.fn().mockResolvedValue({}),
    getStorageDiagnostics: vi.fn().mockReturnValue({})
} as any;

describe('importReviews', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should throw INVALID_SCHEMA for invalid input', async () => {
        await expect(importReviews({ source: "invalid" }, mockVectorStore)).rejects.toMatchObject({ code: 'INVALID_SCHEMA' });
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

        const result = await importReviews(input, mockVectorStore);
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

            const result = await importReviews(input, mockVectorStore);
            const reviews = result.data.reviews;
            expect(reviews).toHaveLength(2);
            expect(reviews[0].review_id).toBe('1');
            expect(reviews[0].score).toBe(5);
            expect(reviews[1].review_id).toBe('2');
            expect(result.data.metadata.duplicates_dropped).toBe(1);
            expect(result.data.metadata.invalid_rows_dropped).toBe(0);
        } finally {
            unlinkSync(tempPath);
        }
    });

    it('tracks invalid rows separately from duplicates', async () => {
        const csvContent = `review_id,content,score\n1,csv content 1,5\n2,missing score,\n1,duplicate content,1`;
        const tempPath = path.join(os.tmpdir(), 'test_reviews_invalid.csv');
        writeFileSync(tempPath, csvContent, 'utf8');

        try {
            const input = {
                source: {
                    type: 'file',
                    path: tempPath
                }
            };

            const result = await importReviews(input, mockVectorStore);
            expect(result.data.metadata.duplicates_dropped).toBe(1);
            expect(result.data.metadata.invalid_rows_dropped).toBe(1);
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

            const result = await importReviews(input, mockVectorStore);
            const reviews = result.data.reviews;
            expect(reviews).toHaveLength(2);
            expect(reviews[0].review_id).toBe('10');
            expect(reviews[1].review_id).toBe('11');
        } finally {
            unlinkSync(tempPath);
        }
    });

    it('should load reviews from default sample_data path when source is omitted', async () => {
        const result = await importReviews({}, mockVectorStore);
        expect(result.data.reviews.length).toBeGreaterThan(0);
        expect(mockVectorStore.indexReviews).toHaveBeenCalledTimes(1);
    });
});
