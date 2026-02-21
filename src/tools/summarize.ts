import { ConcurrentLLMClient } from '../engine/llmClient.js';

export interface SummarizeReviewInput {
    text: string;
    feature_area: string;
    issue_type: string;
    severity: string;
}

export async function summarizeReviews(
    reviews: SummarizeReviewInput[],
    llmClient: ConcurrentLLMClient,
    model: string = 'claude-3.5-sonnet-20240620'
): Promise<{
    top_themes: string[];
    p0_count: number;
    p1_count: number;
    p2_count: number;
    fyi_count: number;
}> {
    let p0_count = 0;
    let p1_count = 0;
    let p2_count = 0;
    let fyi_count = 0;

    const grouped: Record<string, Record<string, number>> = {};

    for (const r of reviews) {
        if (r.severity === "P0") p0_count++;
        else if (r.severity === "P1") p1_count++;
        else if (r.severity === "P2") p2_count++;
        else fyi_count++;

        if (!grouped[r.feature_area]) {
            grouped[r.feature_area] = {};
        }
        if (!grouped[r.feature_area][r.issue_type]) {
            grouped[r.feature_area][r.issue_type] = 0;
        }
        grouped[r.feature_area][r.issue_type]++;
    }

    const reviewTexts = reviews.map(r => r.text).filter(t => t.trim().length > 0);
    const prompt = `Based on these reviews, extract the top 3 recurring themes. Return ONLY a JSON array of 3 strings.\n\nReviews:\n${reviewTexts.slice(0, 50).join("\n---\n")}`;

    let top_themes: string[] = ["No themes found", "Not enough data", "Unknown"];
    if (reviewTexts.length > 0) {
        try {
            const resp = await llmClient.processPrompt(prompt, model);
            const content = Array.isArray(resp.content) && resp.content[0].type === "text" ? resp.content[0].text : "[]";
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed) && parsed.length > 0) {
                top_themes = parsed.slice(0, 3).map(String);
            }
        } catch (e) {
            top_themes = ["Error extracting themes", "LLM failure", "Fallback"];
        }
    }

    return {
        top_themes,
        p0_count,
        p1_count,
        p2_count,
        fyi_count
    };
}

export async function summarizeTool(input: { reviews: SummarizeReviewInput[] }) {
    const llmClient = new ConcurrentLLMClient({ apiKey: process.env.ANTHROPIC_API_KEY || 'MOCK_KEY' });
    const res = await summarizeReviews(input.reviews || [], llmClient);
    return { data: res };
}
