import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitBreakerError } from '../src/engine/circuitBreaker.js';

describe('Circuit Breaker', () => {
    let cb: CircuitBreaker;

    beforeEach(() => {
        cb = new CircuitBreaker();
    });

    it('tracks tokens and calculates estimated cost', () => {
        cb.recordSuccess(1000000, 1000000);
        const state = cb.getState();
        expect(state.inputTokens).toBe(1000000);
        expect(state.outputTokens).toBe(1000000);
        expect(state.estimatedCostUsd).toBeCloseTo(1.50);
        expect(state.totalCalls).toBe(1);
    });

    it('trips on 10 consecutive failures', () => {
        for (let i = 0; i < 9; i++) {
            cb.recordFailure();
        }
        expect(() => cb.recordFailure()).toThrowError(CircuitBreakerError);
        expect(() => cb.recordFailure()).toThrowError("CIRCUIT_BREAKER_TRIPPED");
    });

    it('trips if >= 15% failure rate over 50 calls', () => {
        for (let i = 0; i < 42; i++) {
            cb.recordSuccess(10, 10);
        }
        for (let i = 0; i < 7; i++) {
            cb.recordFailure();
        }
        expect(() => cb.recordFailure()).toThrowError(CircuitBreakerError);
    });

    it('does not trip if < 15% failure rate over 50 calls', () => {
        for (let i = 0; i < 43; i++) {
            cb.recordSuccess(10, 10);
        }
        for (let i = 0; i < 6; i++) {
            cb.recordFailure();
        }
        expect(() => cb.recordFailure()).not.toThrowError(CircuitBreakerError);
    });

    it('resets consecutive failures on success', () => {
        for (let i = 0; i < 9; i++) {
            cb.recordFailure();
        }
        cb.recordSuccess(10, 10);
        expect(cb.getState().consecutiveFailures).toBe(0);

        expect(() => cb.recordFailure()).not.toThrowError(CircuitBreakerError);
    });

    it('uses model-aware pricing when model is provided', () => {
        cb.recordSuccess(1000000, 1000000, 'gpt-4o-mini');
        const state = cb.getState();
        expect(state.estimatedCostUsd).toBeCloseTo(0.75);
    });
});
