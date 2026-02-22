export interface LLMResponse {
    content: Array<{
        type: string;
        text: string;
    }>;
    model?: string;
    usage?: {
        input_tokens: number;
        output_tokens: number;
    };
}

export interface ILLMClient {
    processPrompt(prompt: string, model?: string): Promise<LLMResponse>;
}
