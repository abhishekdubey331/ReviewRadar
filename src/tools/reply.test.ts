import { describe, it, expect, vi } from 'vitest';
import { replySuggestTool } from './reply.js';

vi.mock('../engine/llmClient.js', () => {
    return {
        ConcurrentLLMClient: vi.fn().mockImplementation(() => {
            return {
                processPrompt: vi.fn().mockResolvedValue({
                    content: [{ type: "text", text: 'We apologize for the inconvenience.' }]
                })
            };
        })
    };
});

describe('reviews.reply_suggest', () => {
    it('returns a reply_text and sets needs_human_approval to true', async () => {
        const input = {
            review_text: "My app crashed!",
            tone: "empathetic_formal"
        };
        const mockClient = {
            processPrompt: vi.fn().mockResolvedValue({
                content: [{ type: "text", text: 'We apologize for the inconvenience.' }]
            })
        } as any;

        const result = await replySuggestTool(input, mockClient);

        expect(result.data.needs_human_approval).toBe(true);
        expect(result.data.reply_text).toBe('We apologize for the inconvenience.');
    });

    it('validates schema', async () => {
        const mockClient = {} as any;
        await expect(replySuggestTool({}, mockClient)).rejects.toThrow();
    });
});
