import { z } from "zod";
import { createError } from "../utils/errors.js";
import { topIssues } from "../analytics/aggregations.js";
import { AnalyticsReviewSchema } from "./analytics_schemas.js";

export const PriorityScoringToolInputSchema = z.object({
    reviews: z.array(AnalyticsReviewSchema),
    options: z.object({
        weights: z.object({
            volume: z.number().default(0.4).optional(),
            severity: z.number().default(0.3).optional(),
            trend: z.number().default(0.2).optional(),
            rating_drag: z.number().default(0.1).optional()
        }).optional(),
        top_n: z.number().int().min(1).max(50).default(10).optional()
    }).optional()
}).strict();

function latestHalfTrend(reviews: { review_created_at?: string }[]): number {
    const dated = reviews.filter((r) => r.review_created_at).sort((a, b) => new Date(a.review_created_at!).getTime() - new Date(b.review_created_at!).getTime());
    if (dated.length < 4) return 0;
    const mid = Math.floor(dated.length / 2);
    const early = mid;
    const late = dated.length - mid;
    if (early === 0) return 0;
    return (late - early) / early;
}

export async function priorityScoringTool(input: unknown) {
    const parseResult = PriorityScoringToolInputSchema.safeParse(input);
    if (!parseResult.success) {
        throw createError("INVALID_SCHEMA", "Invalid priority scoring parameters", parseResult.error.format());
    }

    const { reviews, options } = parseResult.data;
    const weights = {
        volume: options?.weights?.volume ?? 0.4,
        severity: options?.weights?.severity ?? 0.3,
        trend: options?.weights?.trend ?? 0.2,
        rating_drag: options?.weights?.rating_drag ?? 0.1
    };

    const grouped = topIssues(reviews, { limit: 500 }).issues;
    const total = reviews.length || 1;

    const scored = grouped.map((g) => {
        const key = g.issue_key;
        const members = reviews.filter((r) => `${r.issue_type}::${r.feature_area}` === key);
        const criticalShare = g.review_count === 0 ? 0 : (g.severity_breakdown.P0 + g.severity_breakdown.P1) / g.review_count;
        const trend = latestHalfTrend(members);
        const ratingDrag = g.avg_rating === null ? 0 : Math.max(0, (5 - g.avg_rating) / 4);
        const volumeShare = g.review_count / total;
        const impact = (weights.volume * volumeShare) + (weights.severity * criticalShare) + (weights.trend * Math.max(0, trend)) + (weights.rating_drag * ratingDrag);
        return {
            issue_key: key,
            review_count: g.review_count,
            impact_score: Number((impact * 100).toFixed(2)),
            drivers: {
                volume_share: Number(volumeShare.toFixed(4)),
                critical_share: Number(criticalShare.toFixed(4)),
                trend_velocity: Number(trend.toFixed(4)),
                rating_drag: Number(ratingDrag.toFixed(4))
            }
        };
    }).sort((a, b) => b.impact_score - a.impact_score);

    return {
        data: {
            rankings: scored.slice(0, options?.top_n ?? 10),
            weights
        }
    };
}
