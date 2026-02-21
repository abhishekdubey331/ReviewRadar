import { describe, it, expect } from "vitest";
import {
    ReviewInputSchema,
    SourceSchema,
    MetadataSchema,
} from "../src/schemas/shared.js";
import { createError } from "../src/utils/errors.js";

describe("Shared Zod Schemas Validation", () => {
    describe("ReviewInputSchema", () => {
        it("should accept a valid review payload", () => {
            const valid = {
                review_id: "123",
                content: "Great app!",
                score: 5,
                platform: "play_store",
                thumbs_up_count: 10,
                extra_field: "allowed"
            };
            expect(() => ReviewInputSchema.parse(valid)).not.toThrow();
        });

        it("should reject when required fields are missing", () => {
            const invalid = {
                score: 5,
                content: "missing id"
            };
            expect(() => ReviewInputSchema.parse(invalid)).toThrow("Required");
        });

        it("should reject when score is out of bounds", () => {
            const invalid = {
                review_id: "123",
                content: "Bad!",
                score: 6
            };
            expect(() => ReviewInputSchema.parse(invalid)).toThrow("Number must be less than or equal to 5");
        });
    });

    describe("SourceSchema", () => {
        it("should accept file source", () => {
            expect(() => SourceSchema.parse({ type: "file", path: "/tmp/data.csv" })).not.toThrow();
        });

        it("should accept inline source with reviews", () => {
            expect(() => SourceSchema.parse({
                type: "inline",
                reviews: [{ review_id: "1", content: "test", score: 3 }]
            })).not.toThrow();
        });

        it("should reject inline source with too many reviews", () => {
            const reviews = Array.from({ length: 5001 }).map((_, i) => ({
                review_id: String(i),
                content: "test",
                score: 3
            }));
            expect(() => SourceSchema.parse({ type: "inline", reviews })).toThrow("Array must contain at most 5000 element(s)");
        });

        it("should reject missing required paths for file source", () => {
            expect(() => SourceSchema.parse({ type: "file" })).toThrow();
        });
    });

    describe("Error Utility", () => {
        it("should create a correctly formatted error object", () => {
            const err = createError("INPUT_TOO_LARGE", "Too many items", { count: 5001 });
            expect(err).toEqual({
                code: "INPUT_TOO_LARGE",
                message: "Too many items",
                details: { count: 5001 }
            });
        });
    });
});
