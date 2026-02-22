import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoyVectorStore } from '../src/infrastructure/adapters/voy_vector_store.js';
import fs from 'fs';
import OpenAI from 'openai';
import { Voy } from 'voy-search/voy_search.js';
import path from 'path';

// Mock dependencies
vi.mock('fs');
vi.mock('openai');
vi.mock('voy-search/voy_search.js', () => {
    return {
        Voy: vi.fn().mockImplementation(() => ({
            add: vi.fn(),
            search: vi.fn().mockReturnValue({ neighbors: [] }),
            serialize: vi.fn().mockReturnValue('{}'),
            clear: vi.fn(),
        })),
        Resource: vi.fn(),
        EmbeddedResource: vi.fn(),
    };
});

// Mock Static method
Voy.deserialize = vi.fn().mockImplementation(() => new Voy());

describe('VoyVectorStore', () => {
    let vectorStore: VoyVectorStore;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.OPENAI_API_KEY = 'test-key';
        vectorStore = new VoyVectorStore();

        // Mock fs exists and readFileSync for initialization
        (fs.existsSync as any).mockReturnValue(false);
        (fs.mkdirSync as any).mockImplementation(() => { });
        (fs.writeFileSync as any).mockImplementation(() => { });
    });

    it('should initialize and index reviews with metadata', async () => {
        const reviews = [
            { review_id: '1', content: 'Great app', score: 5, date: '2024-01-01', user_name: 'User 1' },
            { review_id: '2', content: 'Bad app', score: 1, date: '2024-01-02', user_name: 'User 2' },
        ];

        // Mock OpenAI Embeddings
        const mockEmbeddings = [new Array(512).fill(0.1), new Array(512).fill(0.2)];
        const mockCreate = vi.fn().mockResolvedValue({
            data: mockEmbeddings.map(e => ({ embedding: e }))
        });
        (OpenAI as any).mockImplementation(() => ({
            embeddings: { create: mockCreate }
        }));

        const count = await vectorStore.indexReviews(reviews);
        expect(count).toBe(2);
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            dimensions: 512,
            model: 'text-embedding-3-small'
        }));

        // Verify serializing and saving
        expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should filter search results by score', async () => {
        // Setup state with indexed metadata
        const reviews = [
            { review_id: '1', content: 'Good', score: 5, date: '2024-01-01' },
            { review_id: '2', content: 'Bad', score: 1, date: '2024-01-02' },
        ];

        // Hack to inject metadata without full indexing run
        (vectorStore as any).indexedMetadata = new Map([
            ['1', { id: '1', score: 5, date: '2024-01-01', content: 'Good' }],
            ['2', { id: '2', score: 1, date: '2024-01-02', content: 'Bad' }],
        ]);
        (vectorStore as any).isInitialized = true;
        (vectorStore as any).voy = new Voy();

        // Mock Voy search to return both
        (vectorStore as any).voy.search.mockReturnValue({
            neighbors: [{ id: '1' }, { id: '2' }]
        });

        // Mock OpenAI for search query
        (OpenAI as any).mockImplementation(() => ({
            embeddings: { create: vi.fn().mockResolvedValue({ data: [{ embedding: new Array(512).fill(0) }] }) }
        }));

        // Search for 1-star reviews
        const results = await vectorStore.search('test', { min_score: 1, max_score: 1 });
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('2');
    });

    it('should sort results by date', async () => {
        (vectorStore as any).indexedMetadata = new Map([
            ['1', { id: '1', score: 5, date: '2024-01-01', content: 'Old' }],
            ['2', { id: '2', score: 5, date: '2024-02-01', content: 'New' }],
        ]);
        (vectorStore as any).isInitialized = true;
        (vectorStore as any).voy = new Voy();

        (vectorStore as any).voy.search.mockReturnValue({
            neighbors: [{ id: '1' }, { id: '2' }]
        });

        (OpenAI as any).mockImplementation(() => ({
            embeddings: { create: vi.fn().mockResolvedValue({ data: [{ embedding: new Array(512).fill(0) }] }) }
        }));

        const results = await vectorStore.search('test', { sort_by: 'date' });
        expect(results[0].id).toBe('2'); // Newest first
    });

    it('should handle incremental indexing', async () => {
        (vectorStore as any).indexedMetadata = new Map([
            ['1', { id: '1' }]
        ]);
        (vectorStore as any).isInitialized = true;

        const reviews = [
            { review_id: '1', content: 'Already here', score: 5 },
            { review_id: '2', content: 'New review', score: 4 },
        ];

        // Mock OpenAI to return only 1 result for the new review
        const mockCreate = vi.fn().mockResolvedValue({
            data: [{ embedding: new Array(512).fill(0) }]
        });
        (OpenAI as any).mockImplementation(() => ({
            embeddings: { create: mockCreate }
        }));

        const count = await vectorStore.indexReviews(reviews);
        expect(count).toBe(1);
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should return index status with metadata health', async () => {
        (vectorStore as any).indexedMetadata = new Map([
            ['1', { id: '1', score: 5, date: '2024-01-01' }],
            ['2', { id: '2', score: 1 }] // Missing date
        ]);
        (vectorStore as any).isInitialized = true;

        const status = await vectorStore.getIndexStatus();
        expect(status.total_indexed).toBe(2);
        expect(status.metadata_health.score_count).toBe(2);
        expect(status.metadata_health.date_count).toBe(1);
        expect(status.is_ready).toBe(true);
    });

    it('should recover from Voy.add batch failures via fallback splitting', async () => {
        const reviews = Array.from({ length: 120 }, (_, i) => ({
            review_id: String(i + 1),
            content: `review-${i + 1}`,
            score: 5,
            user_name: 'User'
        }));

        const mockCreate = vi.fn().mockResolvedValue({
            data: Array.from({ length: 120 }, () => ({ embedding: new Array(512).fill(0.1) }))
        });
        (OpenAI as any).mockImplementation(() => ({
            embeddings: { create: mockCreate }
        }));

        (vectorStore as any).voy = new Voy();
        (vectorStore as any).isInitialized = true;
        const addMock = (vectorStore as any).voy.add as any;
        addMock.mockImplementation((resource: any) => {
            if (resource.embeddings.length > 30) {
                throw new Error('WASM unreachable');
            }
        });

        const count = await vectorStore.indexReviews(reviews);

        expect(count).toBe(120);
        expect(addMock).toHaveBeenCalled();
        expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should use configured storage directory for diagnostics', () => {
        const storageDir = path.resolve(process.cwd(), 'custom_storage');
        const store = new VoyVectorStore({ storageDir });
        const diagnostics: any = store.getStorageDiagnostics();

        expect(diagnostics.storage_dir).toBe(storageDir);
        expect(diagnostics.index_file).toContain(path.join('custom_storage', 'vector_index.json'));
        expect(diagnostics.metadata_file).toContain(path.join('custom_storage', 'metadata.json'));
    });
});
