import crypto from "crypto";

export function collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

export function normalizeForAnalysis(value: string): string {
    return collapseWhitespace(value)
        .normalize("NFKC")
        .toLowerCase()
        .replace(/\b(v?\d+(?:\.\d+){1,3})\b/g, "<version>");
}

export function tokenizeQuery(value: string): string[] {
    const tokens = collapseWhitespace(value)
        .toLowerCase()
        .match(/[a-z0-9]+/g);

    if (!tokens) return [];
    return tokens.filter((token) => token.length >= 2);
}

export function createStableHash(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
}
