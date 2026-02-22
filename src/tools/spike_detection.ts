import { z } from "zod";
import { createError } from "../utils/errors.js";
import { AnalyticsReviewSchema } from "./analytics_schemas.js";

export const SpikeDetectionToolInputSchema = z.object({
    reviews: z.array(AnalyticsReviewSchema),
    options: z.object({
        bucket: z.enum(["day", "week"]).default("day").optional(),
        min_baseline_count: z.number().int().min(1).default(1).optional(),
        spike_ratio_threshold: z.number().min(1).default(2).optional(),
        top_n: z.number().int().min(1).max(20).default(10).optional()
    }).optional()
}).strict();

function bucketKey(dateStr: string | undefined, bucket: "day" | "week"): string | null {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    if (bucket === "day") return d.toISOString().slice(0, 10);
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = x.getUTCDay();
    const shift = day === 0 ? -6 : 1 - day;
    x.setUTCDate(x.getUTCDate() + shift);
    return x.toISOString().slice(0, 10);
}

export async function spikeDetectionTool(input: unknown) {
    const parseResult = SpikeDetectionToolInputSchema.safeParse(input);
    if (!parseResult.success) {
        throw createError("INVALID_SCHEMA", "Invalid spike detection parameters", parseResult.error.format());
    }

    const { reviews, options } = parseResult.data;
    const bucket = options?.bucket ?? "day";
    const minBaseline = options?.min_baseline_count ?? 1;
    const ratioThreshold = options?.spike_ratio_threshold ?? 2;
    const topN = options?.top_n ?? 10;

    const bucketIssueCounts = new Map<string, Map<string, number>>();
    for (const r of reviews) {
        const b = bucketKey(r.review_created_at, bucket);
        if (!b) continue;
        const key = `${r.issue_type}::${r.feature_area}`;
        if (!bucketIssueCounts.has(b)) bucketIssueCounts.set(b, new Map());
        const m = bucketIssueCounts.get(b)!;
        m.set(key, (m.get(key) || 0) + 1);
    }

    const buckets = Array.from(bucketIssueCounts.keys()).sort();
    if (buckets.length < 2) return { data: { alerts: [] } };
    const latest = buckets[buckets.length - 1];
    const previous = buckets.slice(0, -1);

    const latestCounts = bucketIssueCounts.get(latest)!;
    const issueKeys = Array.from(new Set(previous.flatMap((b) => Array.from(bucketIssueCounts.get(b)!.keys()).concat(Array.from(latestCounts.keys())))));
    const alerts = issueKeys.map((issueKey) => {
        const baselineTotal = previous.reduce((acc, b) => acc + (bucketIssueCounts.get(b)!.get(issueKey) || 0), 0);
        const baselineAvg = baselineTotal / previous.length;
        const current = latestCounts.get(issueKey) || 0;
        const ratio = baselineAvg === 0 ? (current > 0 ? Infinity : 0) : current / baselineAvg;
        return {
            issue_key: issueKey,
            bucket: latest,
            baseline_rate: Number(baselineAvg.toFixed(4)),
            current_rate: Number(current.toFixed(4)),
            spike_score: ratio === Infinity ? null : Number(ratio.toFixed(4)),
            is_spike: current >= minBaseline && ratio >= ratioThreshold
        };
    }).filter((a) => a.is_spike)
        .sort((a, b) => {
            const aScore = a.spike_score ?? Number.MAX_SAFE_INTEGER;
            const bScore = b.spike_score ?? Number.MAX_SAFE_INTEGER;
            if (bScore !== aScore) return bScore - aScore;
            return a.issue_key.localeCompare(b.issue_key);
        })
        .slice(0, topN);

    return { data: { alerts } };
}
