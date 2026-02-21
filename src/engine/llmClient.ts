import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import retry from 'async-retry';
import pLimit from 'p-limit';
import { getConfig } from '../utils/config.js';

export interface LLMConfig {
    apiKey?: string;     // Legacy fallback support
    concurrency?: number;
}

export class ConcurrentLLMClient {
    public anthropic?: Anthropic;
    public openai?: OpenAI;
    private limit: ReturnType<typeof pLimit>;
    private provider: 'openai' | 'anthropic';

    constructor(config?: LLMConfig) {
        // Read directly from config validation for environment vars
        const envConfig = getConfig();

        // Prioritize OpenAI if provided
        if (envConfig.OPENAI_API_KEY) {
            this.provider = 'openai';
            this.openai = new OpenAI({ apiKey: envConfig.OPENAI_API_KEY });
        } else if (envConfig.ANTHROPIC_API_KEY) {
            this.provider = 'anthropic';
            this.anthropic = new Anthropic({ apiKey: envConfig.ANTHROPIC_API_KEY });
        } else {
            // Fallback to legacy config or dummy for tests
            this.provider = 'anthropic';
            this.anthropic = new Anthropic({ apiKey: config?.apiKey || 'DUMMY_KEY' });
        }

        this.limit = pLimit(config?.concurrency ?? 15);
    }

    public async processPrompt(prompt: string, model?: string): Promise<Anthropic.Message> {
        return this.limit(() =>
            retry(
                async (bail) => {
                    try {
                        if (this.provider === 'openai' && this.openai) {
                            // Translate to OpenAI API
                            const oaiModel = model === 'claude-3-haiku-20240307' ? 'gpt-4o-mini' : (model || 'gpt-4o');
                            const response = await this.openai.chat.completions.create({
                                model: oaiModel,
                                max_tokens: 1024,
                                messages: [{ role: 'user', content: prompt }]
                            });

                            // Map OpenAI response back to Anthropic format expected by existing tools
                            return {
                                id: response.id,
                                type: 'message',
                                role: 'assistant',
                                content: [{ type: 'text', text: response.choices[0]?.message?.content || '' }],
                                model: response.model,
                                stop_reason: response.choices[0]?.finish_reason === 'stop' ? 'end_turn' : 'max_tokens',
                                stop_sequence: null,
                                usage: {
                                    input_tokens: response.usage?.prompt_tokens || 0,
                                    output_tokens: response.usage?.completion_tokens || 0
                                }
                            } as Anthropic.Message;
                        } else if (this.anthropic) {
                            // Native Anthropic API
                            const response = await this.anthropic.messages.create({
                                model: model || 'claude-3-haiku-20240307',
                                max_tokens: 1024,
                                messages: [{ role: 'user', content: prompt }]
                            });
                            return response;
                        }
                        throw new Error("No LLM provider initialized");
                    } catch (error: any) {
                        // Only retry on 429 Too Many Requests or 5xx server errors
                        if (error.status === 429 || (error.status >= 500 && error.status < 600)) {
                            throw error;
                        }
                        bail(error);
                        throw error;
                    }
                },
                {
                    retries: 3, // Will try initial + 3 retries (1s, 2s, 4s)
                    factor: 2,
                    minTimeout: 1000,
                    maxTimeout: 8000
                }
            )
        );
    }

    public async processBatch(prompts: string[], model?: string): Promise<Anthropic.Message[]> {
        const promises = prompts.map(prompt => this.processPrompt(prompt, model));
        return Promise.all(promises);
    }
}
