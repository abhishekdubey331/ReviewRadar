import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConcurrentLLMClient } from '../src/engine/llmClient.js';
import * as configModule from '../src/utils/config.js';

vi.mock('openai', () => {
    const create = vi.fn();
    const OpenAIMock = vi.fn().mockImplementation(() => ({
        chat: {
            completions: { create }
        }
    }));
    return {
        default: OpenAIMock,
        __mockCreate: create
    };
});

describe('Concurrent LLM Client (OpenAI)', () => {
    let client: ConcurrentLLMClient;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(configModule, 'getConfig').mockReturnValue({
            OPENAI_API_KEY: 'test-key',
            OPENAI_ROUTING_MODEL: 'gpt-4o-mini',
            OPENAI_SUMMARY_MODEL: 'gpt-4o',
            SUPPORT_BRAND_NAME: 'test app',
            MAX_BATCH_BUDGET_USD: '5.00',
            STORAGE_DIR: 'storage'
        });
        client = new ConcurrentLLMClient();
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('retries on 429 error and tests exponential backoff timing indirectly', async () => {
        const openaiModule = await import('openai') as unknown as { __mockCreate: ReturnType<typeof vi.fn> };
        const mockCreate = openaiModule.__mockCreate;

        const rateLimitError = new Error('Rate Limited');
        (rateLimitError as any).status = 429;

        mockCreate
            .mockRejectedValueOnce(rateLimitError)
            .mockRejectedValueOnce(rateLimitError)
            .mockResolvedValueOnce({
                choices: [{ message: { content: 'ok' } }],
                usage: { prompt_tokens: 1, completion_tokens: 1 }
            });

        // Start processing but don't await immediately
        const promise = client.processPrompt('test prompt');

        // Fast forward through async-retry internal timeouts
        for (let i = 0; i < 5; i++) {
            await vi.advanceTimersByTimeAsync(5000);
        }

        const result = await promise;
        expect(mockCreate).toHaveBeenCalledTimes(3);
        expect(Array.isArray(result.content)).toBe(true);
    });

    it('does not retry on 400 bad request error', async () => {
        const openaiModule = await import('openai') as unknown as { __mockCreate: ReturnType<typeof vi.fn> };
        const mockCreate = openaiModule.__mockCreate;

        const badReqError = new Error('Bad Request');
        (badReqError as any).status = 400;

        mockCreate.mockRejectedValueOnce(badReqError);

        await expect(client.processPrompt('test prompt')).rejects.toThrow('Bad Request');
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('processes batch adhering to limits', async () => {
        const openaiModule = await import('openai') as unknown as { __mockCreate: ReturnType<typeof vi.fn> };
        const mockCreate = openaiModule.__mockCreate;
        mockCreate.mockResolvedValue({
            choices: [{ message: { content: 'ok' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 }
        });

        const batch = Array(20).fill('prompt');
        await client.processBatch(batch);

        expect(mockCreate).toHaveBeenCalledTimes(20);
    });
});
