import { describe, it, expect } from 'vitest';
import { evaluateRules } from '../src/engine/rules.js';

describe('evaluateRules Rule Engine', () => {
    it('should assert reviews < 10 characters as Spam and P0 rule_confidence', () => {
        const result = evaluateRules("bad app", 1);
        expect(result.is_spam).toBe(true);
        expect(result.issue_type).toBe("Spam / Bot / Irrelevant");
        expect(result.confidence_score).toBe(1.0);
    });

    it('should assert review with `can\'t login` as P0', () => {
        const result = evaluateRules("I can't login to my account anymore.", 1);
        expect(result.severity).toBe("P0");
        expect(result.is_spam).toBe(false);
        expect(result.feature_area).toBe("Login/OTP");
    });

    it('should assert review about `location not updating` with negative sentiment as P0', () => {
        const result = evaluateRules("my son's location not updating on map. safety problem!", 2);
        // By rating=2, sentiment is Negative. "location not updating" is in SAFETY_FAILURE_PHRASES 
        // OR it detects "Family Location" feature via keyword and Negative sentiment, and triggers failure.
        expect(result.severity).toBe("P0");
        expect(result.issue_type).toBe("Safety Concern");
        expect(result.feature_area).toBe("Family Location");
    });

    it('should assert positive rating as FYI and Praise', () => {
        const result = evaluateRules("This app works wonderfully well. Good app, saves my life.", 5);
        expect(result.is_spam).toBe(false);
        expect(result.severity).toBe("FYI");
        expect(result.sentiment).toBe("Positive");
    });

    it('should leave unknown feature_area if no rules fired', () => {
        // Just providing enough characters but none of the words match feature
        const result = evaluateRules("I just got a brand new device and it is doing things differently.", 2);
        expect(result.feature_area).toBe("Unknown");
        // Due to rating 2, sentiment is negative
        expect(result.sentiment).toBe("Negative");
    });
});
