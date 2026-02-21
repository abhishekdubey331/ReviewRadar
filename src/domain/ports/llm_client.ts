export interface LLMResponse {
    content: any;
    usage?: {
        input_tokens: number;
        output_tokens: number;
    };
}

export interface ILLMClient {
    processPrompt(prompt: string, model?: string): Promise<LLMResponse>;
}
