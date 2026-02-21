import { z } from 'zod';
import { ConcurrentLLMClient } from '../engine/llmClient.js';
import { createError } from '../utils/errors.js';

export const ReplySuggestSchema = z.object({
    review_text: z.string().min(1),
    tone: z.string().default("empathetic_formal")
});

export async function replySuggestTool(input: unknown) {
    const parseResult = ReplySuggestSchema.safeParse(input);
    if (!parseResult.success) {
        throw createError("INVALID_SCHEMA", "Invalid reply_suggest parameters", parseResult.error.format());
    }

    const { review_text, tone } = parseResult.data;
    const llmClient = new ConcurrentLLMClient({ apiKey: process.env.ANTHROPIC_API_KEY || 'MOCK_KEY', concurrency: 5 });

    const systemPrompt = `You are a customer support AI for Greenlight.
Your tone should be: ${tone}.
STRICT POLICY:
1. Do NOT promise refunds.
2. Do NOT offer timelines for bug fixes.
3. Be professional and helpful.
Generate a reply draft to the following user review. Write only the reply text.`;

    const prompt = `${systemPrompt}\n\nReview: ${review_text}`;

    let reply_text = "";
    try {
        const resp = await llmClient.processPrompt(prompt, 'claude-3-haiku-20240307');
        reply_text = Array.isArray(resp.content) && resp.content[0].type === "text" ? resp.content[0].text : "Fallback response due to unexpected output.";
    } catch (e: any) {
        throw createError("INTERNAL", "LLM failure during reply generation", e.message);
    }

    return {
        data: {
            reply_text: reply_text.trim(),
            needs_human_approval: true
        }
    };
}
