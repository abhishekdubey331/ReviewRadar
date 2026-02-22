import { describe, expect, it } from "vitest";
import { TOOL_DEFINITIONS } from "../src/app/tool_registry.js";

function getTool(name: string) {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === name);
    expect(tool, `Missing tool: ${name}`).toBeDefined();
    return tool!;
}

describe("tool registry contract", () => {
    it("has unique tool names", () => {
        const names = TOOL_DEFINITIONS.map((t) => t.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it("enforces strict top-level input schemas", () => {
        for (const tool of TOOL_DEFINITIONS) {
            expect(tool.inputSchema.type).toBe("object");
            expect((tool.inputSchema as any).additionalProperties).toBe(false);
        }
    });

    it("requires source for analyze and safety tools", () => {
        const analyze = getTool("reviews_analyze");
        const safety = getTool("reviews_get_safety_alerts");
        expect((analyze.inputSchema as any).required).toContain("source");
        expect((safety.inputSchema as any).required).toContain("source");
    });

    it("keeps export schema constrained", () => {
        const exportTool = getTool("reviews_export");
        const props = (exportTool.inputSchema as any).properties;
        expect(props.format.enum).toEqual(["markdown", "jira"]);
        expect(props.reviews.maxItems).toBe(5000);
        expect(props.reviews.items.additionalProperties).toBe(false);
    });
});
