import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConcurrentLLMClient } from '../src/engine/llmClient.js';
import Anthropic from '@anthropic-ai/sdk';
import * as configModule from '../src/utils/config.js';

vi.mock('@anthropic-ai/sdk', () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            messages: {
                create: vi.fn()
            }
        }))
    };
});

describe('Concurrent LLM Client (Anthropic Native)', () => {
    let client: ConcurrentLLMClient;

    beforeEach(() => {
        vi.useFakeTimers();
        // Force the config to use Anthropic so client.anthropic is defined
        vi.spyOn(configModule, 'getConfig').mockReturnValue({
            ANTHROPIC_API_KEY: 'test-key',
            OPENAI_ROUTING_MODEL: 'gpt-4o-mini',
            OPENAI_SUMMARY_MODEL: 'gpt-4o',
            ANTHROPIC_ROUTING_MODEL: 'claude-3-haiku-20240307',
            ANTHROPIC_SUMMARY_MODEL: 'claude-3-5-sonnet-20241022',
            SUPPORT_BRAND_NAME: 'test app',
            MAX_BATCH_BUDGET_USD: '5.00',
            STORAGE_DIR: 'storage'
        });
        client = new ConcurrentLLMClient({ apiKey: 'test' });
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('retries on 429 error and tests exponential backoff timing indirectly', async () => {
        const mockCreate = client.anthropic!.messages.create as unknown as ReturnType<typeof vi.fn>;

        const rateLimitError = new Error('Rate Limited');
        (rateLimitError as any).status = 429;

        mockCreate
            .mockRejectedValueOnce(rateLimitError)
            .mockRejectedValueOnce(rateLimitError)
            .mockResolvedValueOnce({ id: 'msg_1', content: [] });

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
        const mockCreate = client.anthropic!.messages.create as unknown as ReturnType<typeof vi.fn>;

        const badReqError = new Error('Bad Request');
        (badReqError as any).status = 400;

        mockCreate.mockRejectedValueOnce(badReqError);

        await expect(client.processPrompt('test prompt')).rejects.toThrow('Bad Request');
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('processes batch adhering to limits', async () => {
        const mockCreate = client.anthropic!.messages.create as unknown as ReturnType<typeof vi.fn>;
        mockCreate.mockResolvedValue({ id: 'msg_ok', content: [] });

        const batch = Array(20).fill('prompt');
        await client.processBatch(batch);

        expect(mockCreate).toHaveBeenCalledTimes(20);
    });
});
