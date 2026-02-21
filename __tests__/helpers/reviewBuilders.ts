export type RawReview = {
    review_id: string;
    content: string;
    score: number;
    review_created_at?: string;
    app_version?: string;
    device?: string;
    os_version?: string;
    locale?: string;
    platform?: "play_store" | "app_store" | "unknown";
};

export type AnalyzedReview = {
    review_id: string;
    issue_type: string;
    feature_area: string;
    severity: "P0" | "P1" | "P2" | "FYI";
    sentiment: "Positive" | "Mixed" | "Neutral" | "Negative";
    confidence_score: number;
    classification_source: "rule_engine" | "llm" | "hybrid";
    signals: {
        summary: string;
        repro_hints: string[];
        device: string;
        os_version: string;
        app_version: string;
        feature_mentions: string[];
    };
    review_created_at?: string;
    score?: number;
    app_version?: string;
    os_version?: string;
    device?: string;
    locale?: string;
    platform?: "play_store" | "app_store" | "unknown";
};

export function makeRawReview(overrides: Partial<RawReview> = {}): RawReview {
    return {
        review_id: overrides.review_id ?? "r-1",
        content: overrides.content ?? "App crashes on startup",
        score: overrides.score ?? 1,
        review_created_at: overrides.review_created_at ?? "2026-02-01T10:00:00.000Z",
        app_version: overrides.app_version ?? "1.0.0",
        device: overrides.device ?? "Pixel 8",
        os_version: overrides.os_version ?? "Android 14",
        locale: overrides.locale ?? "en-US",
        platform: overrides.platform ?? "play_store"
    };
}

export function makeAnalyzedReview(overrides: Partial<AnalyzedReview> = {}): AnalyzedReview {
    return {
        review_id: overrides.review_id ?? "a-1",
        issue_type: overrides.issue_type ?? "Bug",
        feature_area: overrides.feature_area ?? "Crash Detection",
        severity: overrides.severity ?? "P1",
        sentiment: overrides.sentiment ?? "Negative",
        confidence_score: overrides.confidence_score ?? 0.92,
        classification_source: overrides.classification_source ?? "hybrid",
        signals: {
            summary: overrides.signals?.summary ?? "",
            repro_hints: overrides.signals?.repro_hints ?? [],
            device: overrides.signals?.device ?? "Pixel 8",
            os_version: overrides.signals?.os_version ?? "Android 14",
            app_version: overrides.signals?.app_version ?? "1.0.0",
            feature_mentions: overrides.signals?.feature_mentions ?? []
        },
        review_created_at: overrides.review_created_at ?? "2026-02-01T10:00:00.000Z",
        score: overrides.score ?? 1,
        app_version: overrides.app_version ?? "1.0.0",
        os_version: overrides.os_version ?? "Android 14",
        device: overrides.device ?? "Pixel 8",
        locale: overrides.locale ?? "en-US",
        platform: overrides.platform ?? "play_store"
    };
}
