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

    public recordSuccess(inputTokens: number, outputTokens: number) {
        if (this.isTripped) throw new CircuitBreakerError();

        this.state.totalCalls++;
        this.state.consecutiveFailures = 0;
        this.state.inputTokens += inputTokens;
        this.state.outputTokens += outputTokens;

        // Claude 3 Haiku: $0.25 per 1M input, $1.25 per 1M output
        this.state.estimatedCostUsd += (inputTokens * 0.25 / 1000000) + (outputTokens * 1.25 / 1000000);

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
