export class CircuitBreakerError extends Error {
    constructor() {
        super("CIRCUIT_BREAKER_TRIPPED");
        this.name = "CircuitBreakerError";
    }
}

export interface MetricsState {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    totalCalls: number;
    totalFailures: number;
    consecutiveFailures: number;
    recentCalls: boolean[];
}

interface TokenPricing {
    inUsdPerM: number;
    outUsdPerM: number;
}

const DEFAULT_PRICING: TokenPricing = { inUsdPerM: 0.25, outUsdPerM: 1.25 };

function resolvePricing(model?: string): TokenPricing {
    const normalized = (model || "").toLowerCase();
    if (normalized.includes("gpt-4o-mini")) {
        return { inUsdPerM: 0.15, outUsdPerM: 0.6 };
    }
    if (normalized.includes("gpt-4o")) {
        return { inUsdPerM: 5.0, outUsdPerM: 15.0 };
    }
    if (normalized.includes("claude-3.5-sonnet")) {
        return { inUsdPerM: 3.0, outUsdPerM: 15.0 };
    }
    if (normalized.includes("claude-3-haiku")) {
        return { inUsdPerM: 0.25, outUsdPerM: 1.25 };
    }
    return DEFAULT_PRICING;
}

export class CircuitBreaker {
    private state: MetricsState = {
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        totalCalls: 0,
        totalFailures: 0,
        consecutiveFailures: 0,
        recentCalls: []
    };

    private isTripped = false;

    public recordSuccess(inputTokens: number, outputTokens: number, model?: string) {
        if (this.isTripped) throw new CircuitBreakerError();

        this.state.totalCalls++;
        this.state.consecutiveFailures = 0;
        this.state.inputTokens += inputTokens;
        this.state.outputTokens += outputTokens;

        const pricing = resolvePricing(model);
        this.state.estimatedCostUsd +=
            (inputTokens * pricing.inUsdPerM / 1000000) +
            (outputTokens * pricing.outUsdPerM / 1000000);

        this.recordCall(true);
    }

    public recordFailure() {
        if (this.isTripped) throw new CircuitBreakerError();

        this.state.totalCalls++;
        this.state.totalFailures++;
        this.state.consecutiveFailures++;

        this.recordCall(false);
        this.checkBreaker();
    }

    private recordCall(success: boolean) {
        this.state.recentCalls.push(success);
        if (this.state.recentCalls.length > 50) {
            this.state.recentCalls.shift();
        }
    }

    private checkBreaker() {
        if (this.state.consecutiveFailures >= 10) {
            this.isTripped = true;
            throw new CircuitBreakerError();
        }

        if (this.state.recentCalls.length === 50) {
            const failures = this.state.recentCalls.filter(success => !success).length;
            const failureRate = failures / 50;
            if (failureRate >= 0.15) {
                this.isTripped = true;
                throw new CircuitBreakerError();
            }
        }
    }

    public getState(): MetricsState {
        return { ...this.state };
    }
}
