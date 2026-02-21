import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import retry from 'async-retry';
import pLimit from 'p-limit';
import { ILLMClient, LLMResponse } from '../domain/ports/llm_client.js';
import { getConfig } from '../utils/config.js';

export interface LLMClientOptions {
    apiKey: string;
    concurrency?: number;
}

export class ConcurrentLLMClient implements ILLMClient {
    public anthropic?: Anthropic;
    public openai?: OpenAI;
    private limit: ReturnType<typeof pLimit>;
    private provider: 'openai' | 'anthropic' = 'anthropic';

    constructor(options?: LLMClientOptions) {
        const envConfig = getConfig();
        const concurrency = options?.concurrency ?? 15;
        this.limit = pLimit(concurrency);

        if (envConfig.OPENAI_API_KEY) {
            this.provider = 'openai';
            this.openai = new OpenAI({ apiKey: envConfig.OPENAI_API_KEY });
        } else if (envConfig.ANTHROPIC_API_KEY) {
            this.provider = 'anthropic';
            this.anthropic = new Anthropic({ apiKey: envConfig.ANTHROPIC_API_KEY });
        } else {
            // Fallback to options or dummy
            this.anthropic = new Anthropic({ apiKey: options?.apiKey || 'DUMMY_KEY' });
        }
    }

    public async processPrompt(prompt: string, model?: string): Promise<LLMResponse> {
        return this.limit(() =>
            retry(
                async (bail) => {
                    try {
                        if (this.provider === 'openai' && this.openai) {
                            const oaiModel = model === 'claude-3-haiku-20240307' ? 'gpt-4o-mini' : (model || 'gpt-4o');
                            const response = await this.openai.chat.completions.create({
                                model: oaiModel,
                                max_tokens: 1024,
                                messages: [{ role: 'user', content: prompt }]
                            });

                            return {
                                content: [{ type: 'text', text: response.choices[0]?.message?.content || '' }],
                                usage: {
                                    input_tokens: response.usage?.prompt_tokens || 0,
                                    output_tokens: response.usage?.completion_tokens || 0
                                }
                            } as LLMResponse;
                        } else if (this.anthropic) {
                            const response = await this.anthropic.messages.create({
                                model: model || 'claude-3-haiku-20240307',
                                max_tokens: 1024,
                                messages: [{ role: 'user', content: prompt }]
                            });
                            return response as LLMResponse;
                        }
                        throw new Error("No LLM provider initialized");
                    } catch (error: any) {
                        if (error.status === 429 || (error.status >= 500 && error.status < 600)) {
                            throw error;
                        }
                        bail(error);
                        throw error;
                    }
                },
                {
                    retries: 3,
                    factor: 2,
                    minTimeout: 1000,
                    maxTimeout: 8000
                }
            )
        );
    }

    public async processBatch(prompts: string[], model?: string): Promise<LLMResponse[]> {
        const promises = prompts.map(prompt => this.processPrompt(prompt, model));
        return Promise.all(promises);
    }
}
