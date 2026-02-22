export type AnalyticsReview = {
    review_id: string;
    issue_type?: string;
    feature_area?: string;
    severity?: "P0" | "P1" | "P2" | "FYI" | string;
    sentiment?: "Positive" | "Mixed" | "Neutral" | "Negative" | string;
    review_created_at?: string;
    score?: number;
    app_version?: string;
    os_version?: string;
    device?: string;
    locale?: string;
    platform?: string;
};

export type AnalyticsFilters = {
    start_date?: string;
    end_date?: string;
    severities?: string[];
    sentiments?: string[];
    feature_areas?: string[];
    issue_types?: string[];
};

export type TopIssueRow = {
    issue_key: string;
    issue_type: string;
    feature_area: string;
    review_count: number;
    affected_share: number;
    severity_breakdown: {
        P0: number;
        P1: number;
        P2: number;
        FYI: number;
    };
    avg_rating: number | null;
    example_review_ids: string[];
};

export type SegmentDimension =
    | "app_version"
    | "os_version"
    | "device"
    | "locale"
    | "platform"
    | "rating_bucket";

export type SegmentRow = {
    segment_dimension: SegmentDimension;
    segment_value: string;
    issue_count: number;
    p0_p1_count: number;
    avg_rating: number | null;
};

export type TimeTrendRow = {
    time_bucket: string;
    total_reviews: number;
    negative_share: number;
    p0_count: number;
    p1_count: number;
    p2_count: number;
    fyi_count: number;
    top_issue_keys: string[];
};

function toDate(value?: string): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function inDateRange(value: string | undefined, start?: string, end?: string): boolean {
    const d = toDate(value);
    if (!d) return false;
    const s = toDate(start);
    const e = toDate(end);
    if (s && d < s) return false;
    if (e && d > e) return false;
    return true;
}

export function applyFilters(reviews: AnalyticsReview[], filters?: AnalyticsFilters): AnalyticsReview[] {
    if (!filters) return reviews;
    return reviews.filter((r) => {
        if ((filters.start_date || filters.end_date) && !inDateRange(r.review_created_at, filters.start_date, filters.end_date)) {
            return false;
        }
        if (filters.severities && filters.severities.length > 0 && !filters.severities.includes(r.severity || "")) {
            return false;
        }
        if (filters.sentiments && filters.sentiments.length > 0 && !filters.sentiments.includes(r.sentiment || "")) {
            return false;
        }
        if (filters.feature_areas && filters.feature_areas.length > 0 && !filters.feature_areas.includes(r.feature_area || "")) {
            return false;
        }
        if (filters.issue_types && filters.issue_types.length > 0 && !filters.issue_types.includes(r.issue_type || "")) {
            return false;
        }
        return true;
    });
}

function defaultSeverityBreakdown() {
    return { P0: 0, P1: 0, P2: 0, FYI: 0 };
}

export function topIssues(
    reviews: AnalyticsReview[],
    options?: { limit?: number; filters?: AnalyticsFilters }
): { total_reviews_considered: number; issues: TopIssueRow[] } {
    const filtered = applyFilters(reviews, options?.filters);
    const grouped = new Map<string, TopIssueRow>();

    for (const review of filtered) {
        const issueType = review.issue_type || "Unknown";
        const featureArea = review.feature_area || "Unknown";
        const key = `${issueType}::${featureArea}`;

        if (!grouped.has(key)) {
            grouped.set(key, {
                issue_key: key,
                issue_type: issueType,
                feature_area: featureArea,
                review_count: 0,
                affected_share: 0,
                severity_breakdown: defaultSeverityBreakdown(),
                avg_rating: null,
                example_review_ids: []
            });
        }
        const row = grouped.get(key)!;
        row.review_count += 1;
        if (review.review_id && row.example_review_ids.length < 3) {
            row.example_review_ids.push(review.review_id);
        }
        const sev = review.severity === "P0" || review.severity === "P1" || review.severity === "P2" || review.severity === "FYI"
            ? review.severity
            : "FYI";
        row.severity_breakdown[sev] += 1;

        if (typeof review.score === "number") {
            const total = (row.avg_rating ?? 0) * (row.review_count - 1) + review.score;
            row.avg_rating = Number((total / row.review_count).toFixed(2));
        }
    }

    const total = filtered.length || 1;
    const sorted = Array.from(grouped.values())
        .map((row) => ({ ...row, affected_share: Number((row.review_count / total).toFixed(4)) }))
        .sort((a, b) => {
            if (b.review_count !== a.review_count) return b.review_count - a.review_count;
            const aCritical = a.severity_breakdown.P0 + a.severity_breakdown.P1;
            const bCritical = b.severity_breakdown.P0 + b.severity_breakdown.P1;
            if (bCritical !== aCritical) return bCritical - aCritical;
            return a.issue_key.localeCompare(b.issue_key);
        });

    const limit = options?.limit ?? 10;
    return {
        total_reviews_considered: filtered.length,
        issues: sorted.slice(0, Math.max(1, limit))
    };
}

function getRatingBucket(score?: number): string {
    if (typeof score !== "number") return "unknown";
    if (score <= 2) return "1-2";
    if (score === 3) return "3";
    return "4-5";
}

function getSegmentValue(review: AnalyticsReview, dimension: SegmentDimension): string {
    if (dimension === "rating_bucket") return getRatingBucket(review.score);
    const value = review[dimension];
    return typeof value === "string" && value.trim().length > 0 ? value : "unknown";
}

export function segmentBreakdown(
    reviews: AnalyticsReview[],
    options: { dimension: SegmentDimension; limit?: number; filters?: AnalyticsFilters }
): { total_reviews_considered: number; segments: SegmentRow[] } {
    const filtered = applyFilters(reviews, options.filters);
    const grouped = new Map<string, SegmentRow>();

    for (const review of filtered) {
        const value = getSegmentValue(review, options.dimension);
        if (!grouped.has(value)) {
            grouped.set(value, {
                segment_dimension: options.dimension,
                segment_value: value,
                issue_count: 0,
                p0_p1_count: 0,
                avg_rating: null
            });
        }
        const row = grouped.get(value)!;
        row.issue_count += 1;
        if (review.severity === "P0" || review.severity === "P1") row.p0_p1_count += 1;
        if (typeof review.score === "number") {
            const total = (row.avg_rating ?? 0) * (row.issue_count - 1) + review.score;
            row.avg_rating = Number((total / row.issue_count).toFixed(2));
        }
    }

    const sorted = Array.from(grouped.values()).sort((a, b) => {
        if (b.issue_count !== a.issue_count) return b.issue_count - a.issue_count;
        if (b.p0_p1_count !== a.p0_p1_count) return b.p0_p1_count - a.p0_p1_count;
        return a.segment_value.localeCompare(b.segment_value);
    });
    return {
        total_reviews_considered: filtered.length,
        segments: sorted.slice(0, Math.max(1, options.limit ?? 10))
    };
}

function toDayBucket(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function toWeekBucket(date: Date): string {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay();
    const shift = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + shift);
    return d.toISOString().slice(0, 10);
}

export function timeTrends(
    reviews: AnalyticsReview[],
    options?: { bucket?: "day" | "week"; top_issue_limit?: number; filters?: AnalyticsFilters }
): { total_reviews_considered: number; trends: TimeTrendRow[] } {
    const bucket = options?.bucket || "week";
    const topIssueLimit = options?.top_issue_limit ?? 3;
    const filtered = applyFilters(reviews, options?.filters).filter((r) => toDate(r.review_created_at));
    const grouped = new Map<string, TimeTrendRow & { negative_count: number; issue_counts: Record<string, number> }>();

    for (const review of filtered) {
        const date = toDate(review.review_created_at)!;
        const key = bucket === "day" ? toDayBucket(date) : toWeekBucket(date);
        if (!grouped.has(key)) {
            grouped.set(key, {
                time_bucket: key,
                total_reviews: 0,
                negative_share: 0,
                p0_count: 0,
                p1_count: 0,
                p2_count: 0,
                fyi_count: 0,
                top_issue_keys: [],
                negative_count: 0,
                issue_counts: {}
            });
        }
        const row = grouped.get(key)!;
        row.total_reviews += 1;
        if (review.sentiment === "Negative") row.negative_count += 1;
        if (review.severity === "P0") row.p0_count += 1;
        else if (review.severity === "P1") row.p1_count += 1;
        else if (review.severity === "P2") row.p2_count += 1;
        else row.fyi_count += 1;

        const issueKey = `${review.issue_type || "Unknown"}::${review.feature_area || "Unknown"}`;
        row.issue_counts[issueKey] = (row.issue_counts[issueKey] || 0) + 1;
    }

    const trends = Array.from(grouped.values())
        .map((row) => {
            const topIssueKeys = Object.entries(row.issue_counts)
                .sort((a, b) => {
                    if (b[1] !== a[1]) return b[1] - a[1];
                    return a[0].localeCompare(b[0]);
                })
                .slice(0, Math.max(1, topIssueLimit))
                .map(([issueKey]) => issueKey);
            return {
                time_bucket: row.time_bucket,
                total_reviews: row.total_reviews,
                negative_share: Number((row.negative_count / row.total_reviews).toFixed(4)),
                p0_count: row.p0_count,
                p1_count: row.p1_count,
                p2_count: row.p2_count,
                fyi_count: row.fyi_count,
                top_issue_keys: topIssueKeys
            };
        })
        .sort((a, b) => a.time_bucket.localeCompare(b.time_bucket));

    return {
        total_reviews_considered: filtered.length,
        trends
    };
}
