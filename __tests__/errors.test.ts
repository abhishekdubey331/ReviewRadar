import { describe, it, expect } from "vitest";
import { AppError, createError } from "../src/utils/errors.js";

describe("AppError", () => {
    it("creates typed error instances with code/message/details", () => {
        const err = createError("INVALID_SCHEMA", "bad input", { field: "source" });

        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe("INVALID_SCHEMA");
        expect(err.message).toBe("bad input");
        expect(err.details).toEqual({ field: "source" });
    });

    it("supports details omission", () => {
        const err = createError("INTERNAL", "unexpected");

        expect(err.code).toBe("INTERNAL");
        expect(err.details).toBeUndefined();
    });
});
