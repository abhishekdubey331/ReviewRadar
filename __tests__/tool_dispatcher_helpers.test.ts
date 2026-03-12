import { describe, expect, it } from "vitest";
import { AppError } from "../src/utils/errors.js";
import { adaptDispatcherError, asRecord, ensureTopIssuesWindow, hasInternalAnalyzeOptions, resolveTopIssuesMinReviewTarget } from "../src/app/tool_dispatcher_helpers.js";

describe("tool dispatcher helpers", () => {
    it("normalizes unknown values into records", () => {
        expect(asRecord(null)).toEqual({});
        expect(asRecord({ ok: true })).toEqual({ ok: true });
    });

    it("applies the default top issues window only when none is provided", () => {
        const updated = ensureTopIssuesWindow({ options: {} });
        expect(updated).toEqual({ options: { window: "this_week" } });
    });

    it("detects reserved internal analyze options", () => {
        expect(hasInternalAnalyzeOptions({ options: { internal_rule_only: true } })).toBe(true);
        expect(hasInternalAnalyzeOptions({ options: { limit: 10 } })).toBe(false);
    });

    it("adapts missing reviews validation errors into actionable guidance", () => {
        const error = new AppError("INVALID_SCHEMA", "bad", {
            reviews: { _errors: ["Required"] }
        });
        const adapted = adaptDispatcherError(error, "reviews_export", new Set(["reviews_export"]));
        expect(adapted).toBeInstanceOf(AppError);
        expect((adapted as AppError).message).toContain("requires analyzed reviews");
    });

    it("resolves min review targets from date windows", () => {
        const result = resolveTopIssuesMinReviewTarget({
            options: { filters: { start_date: "2026-01-01", end_date: "2026-01-10" } }
        });

        expect(result).toBe(500);
    });
});
