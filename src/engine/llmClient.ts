import OpenAI from 'openai';
import retry from 'async-retry';
import pLimit from 'p-limit';
import { ILLMClient, LLMResponse } from '../domain/ports/llm_client.js';
import { getConfig } from '../utils/config.js';
import { getRuntimePolicy } from '../utils/runtime_policy.js';

export interface LLMClientOptions {
    concurrency?: number;
    timeoutMs?: number;
}

export class ConcurrentLLMClient implements ILLMClient {
    public openai?: OpenAI;
    private limit: ReturnType<typeof pLimit>;
    private timeoutMs: number;
    private retries: number;
    private retryMinTimeoutMs: number;
    private retryMaxTimeoutMs: number;

    constructor(options?: LLMClientOptions) {
        const envConfig = getConfig();
        const policy = getRuntimePolicy();
        const concurrency = options?.concurrency ?? 15;
        this.limit = pLimit(concurrency);
        this.timeoutMs = options?.timeoutMs ?? policy.llm_timeout_ms;
        this.retries = policy.llm_retries;
        this.retryMinTimeoutMs = policy.llm_retry_min_timeout_ms;
        this.retryMaxTimeoutMs = policy.llm_retry_max_timeout_ms;
        this.openai = new OpenAI({ apiKey: envConfig.OPENAI_API_KEY });
    }

    private async withTimeout<T>(op: Promise<T>, timeoutMs: number): Promise<T> {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                op,
                new Promise<T>((_, reject) => {
                    timeout = setTimeout(() => reject(new Error(`TIMEOUT after ${timeoutMs}ms`)), timeoutMs);
                })
            ]);
        } finally {
            if (timeout) clearTimeout(timeout);
        }
    }

    public async processPrompt(prompt: string, model?: string): Promise<LLMResponse> {
        return this.limit(() =>
            retry(
                async (bail) => {
                    try {
                        if (!this.openai) {
                            throw new Error("OpenAI client not initialized");
                        }
                        const oaiModel = model || 'gpt-4o';
                        const response = await this.withTimeout(this.openai.chat.completions.create({
                            model: oaiModel,
                            max_tokens: 1024,
                            messages: [{ role: 'user', content: prompt }]
                        }), this.timeoutMs);

                        return {
                            content: [{ type: 'text', text: response.choices[0]?.message?.content || '' }],
                            model: oaiModel,
                            usage: {
                                input_tokens: response.usage?.prompt_tokens || 0,
                                output_tokens: response.usage?.completion_tokens || 0
                            }
                        } as LLMResponse;
                    } catch (error: any) {
                        if (error.status === 429 || (error.status >= 500 && error.status < 600)) {
                            throw error;
                        }
                        bail(error);
                        throw error;
                    }
                },
                {
                    retries: this.retries,
                    factor: 2,
                    minTimeout: this.retryMinTimeoutMs,
                    maxTimeout: this.retryMaxTimeoutMs
                }
            )
        );
    }

    public async processBatch(prompts: string[], model?: string): Promise<LLMResponse[]> {
        const promises = prompts.map(prompt => this.processPrompt(prompt, model));
        return Promise.all(promises);
    }
}
