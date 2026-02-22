export interface RuntimePolicy {
    llm_timeout_ms: number;
    llm_retries: number;
    llm_retry_min_timeout_ms: number;
    llm_retry_max_timeout_ms: number;
    default_analyze_budget_usd: number;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
    if (!raw) return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parsePositiveNumber(raw: string | undefined, fallback: number): number {
    if (!raw) return fallback;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getRuntimePolicy(env: NodeJS.ProcessEnv = process.env): RuntimePolicy {
    return {
        llm_timeout_ms: parsePositiveInt(env.LLM_TIMEOUT_MS, 20000),
        llm_retries: parsePositiveInt(env.LLM_RETRIES, 3),
        llm_retry_min_timeout_ms: parsePositiveInt(env.LLM_RETRY_MIN_TIMEOUT_MS, 1000),
        llm_retry_max_timeout_ms: parsePositiveInt(env.LLM_RETRY_MAX_TIMEOUT_MS, 8000),
        default_analyze_budget_usd: parsePositiveNumber(env.DEFAULT_ANALYZE_BUDGET_USD, 5)
    };
}
