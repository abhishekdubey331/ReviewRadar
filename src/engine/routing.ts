import { RuleResult } from './rules.js';

export function isLlmRequired(result: RuleResult): boolean {
    if (result.confidence_score < 0.60) {
        return true;
    }
    if (result.feature_area === "Unknown") {
        return true;
    }
    if (result.severity === "P0" || result.severity === "P1") {
        return true;
    }
    return false;
}
