export interface AnalyzeModelDefaults {
    routing: string;
    summary: string;
}

const FALLBACK_ROUTING_MODEL = "gpt-4o-mini";
const FALLBACK_SUMMARY_MODEL = "gpt-4o";

export function resolveAnalyzeModelDefaults(
    options?: { routing_model?: string; summary_model?: string },
    defaults?: AnalyzeModelDefaults
): AnalyzeModelDefaults {
    if (options?.routing_model && options?.summary_model) {
        return { routing: options.routing_model, summary: options.summary_model };
    }

    return {
        routing: options?.routing_model || defaults?.routing || FALLBACK_ROUTING_MODEL,
        summary: options?.summary_model || defaults?.summary || FALLBACK_SUMMARY_MODEL
    };
}
