import { describe, it, expect } from 'vitest';
import { isLlmRequired } from '../src/engine/routing.js';
import { RuleResult } from '../src/engine/rules.js';

describe('LLM Routing Barrier Logic', () => {
    it('returns true if rule_confidence < 0.60', () => {
        const mockResult: RuleResult = {
            issue_type: "Performance",
            feature_area: "Login/OTP",
            severity: "P2",
            sentiment: "Negative",
            confidence_score: 0.59,
            classification_source: "rule_engine",
            is_spam: false
        };
        expect(isLlmRequired(mockResult)).toBe(true);
    });

    it('returns true if feature_area is "Unknown"', () => {
        const mockResult: RuleResult = {
            issue_type: "Performance",
            feature_area: "Unknown",
            severity: "P2",
            sentiment: "Negative",
            confidence_score: 0.80,
            classification_source: "rule_engine",
            is_spam: false
        };
        expect(isLlmRequired(mockResult)).toBe(true);
    });

    it('returns true if severity is P0 or P1', () => {
        const mockResultP0: RuleResult = {
            issue_type: "Safety Concern",
            feature_area: "Login/OTP",
            severity: "P0",
            sentiment: "Negative",
            confidence_score: 0.90,
            classification_source: "rule_engine",
            is_spam: false
        };
        expect(isLlmRequired(mockResultP0)).toBe(true);

        const mockResultP1: RuleResult = {
            issue_type: "Safety Concern",
            feature_area: "Login/OTP",
            severity: "P1",
            sentiment: "Negative",
            confidence_score: 0.90,
            classification_source: "rule_engine",
            is_spam: false
        };
        expect(isLlmRequired(mockResultP1)).toBe(true);
    });

    it('returns false for high confidence, known feature area, and non-P0/P1 severity', () => {
        const mockResult: RuleResult = {
            issue_type: "Feature Request",
            feature_area: "Login/OTP",
            severity: "P2",
            sentiment: "Neutral",
            confidence_score: 0.80,
            classification_source: "rule_engine",
            is_spam: false
        };
        expect(isLlmRequired(mockResult)).toBe(false);
    });
});
