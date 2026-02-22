# Remaining Additions Backlog (Excludes Already Built)

This document lists only items that are **not already implemented** in the current MCP runtime (`src/index.ts`).

## Already Implemented (Excluded)
- `reviews_import`
- `reviews_analyze`
- `reviews_get_safety_alerts`
- `reviews_summarize`
- `reviews_reply_suggest`
- `reviews_export`
- `reviews_search`
- `reviews_get_index_status`
- `reviews_diagnose_runtime`
- `reviews_top_issues`
- `reviews_segment_breakdown`
- `reviews_time_trends`

## Priority 1: Buildable Now (Stateless, High Impact)

1. `reviews_compare_windows`
- Purpose: Compare two provided windows (date/version cohorts) and return deltas.
- Why now: Strong release validation and regression detection without persistence.
- Output: `metric`, `baseline`, `current`, `delta`, `delta_pct`, `is_regression`.

2. `reviews_spike_detection`
- Purpose: Detect abnormal jumps in issue/theme volume inside supplied time windows.
- Why now: Enables early warning from current dataset snapshots.
- Output: `issue_key`, `bucket`, `baseline_rate`, `current_rate`, `spike_score`, `severity`.

3. `reviews_priority_scoring`
- Purpose: Score issue clusters by impact using review-native signals.
- Why now: Converts analysis into roadmap ranking.
- Suggested formula: `volume_weight * volume + severity_weight * critical_share + trend_weight * velocity + rating_weight * rating_drag`.

4. `reviews_feature_ownership_map`
- Purpose: Map issue clusters to squad/owner based on config.
- Why now: Adds accountability and routing speed with no external dependencies.
- Input: `ownership_rules` map (feature/issue -> owner/team).

5. `reviews_theme_clusters`
- Purpose: Structured clusters with stable IDs and counts.
- Why now: Current summarize themes are free-text; this makes themes trackable.
- Output: `theme_id`, `theme_label`, `count`, `share`, `sentiment_mix`, `severity_mix`.

6. `reviews_feature_request_dashboard`
- Purpose: Rank user requests by demand and intensity.
- Why now: Helps growth roadmap and UX backlog planning.
- Output: `request_cluster`, `count`, `avg_rating`, `trend`, `sample_reviews`.

7. `reviews_weekly_report`
- Purpose: One-call PM report (top issues, regressions, owners, alerts, action list).
- Why now: Operationalizes usage cadence.

## Deferred (Not Priority for Current Version)

These are intentionally deferred from the current execution plan to keep focus on roadmap-impacting features:
- `reviews_feature_request_dashboard`
- `reviews_competitor_intel`
- `reviews_search_facets`
- `reviews_export_advanced`
- `reviews_taxonomy_quality_audit`

## Later Phase: Requires Stateful Layer / External Data

1. Persistent spike/regression monitoring across continuous history.
2. Correlation with retention, conversion, revenue, crash analytics.
3. Reply effectiveness measurement across repeated user cohorts/time.
4. Cohort retention signals with longitudinal behavior.

## Recommended Next 5 Builds (Order)
1. `reviews_compare_windows`
2. `reviews_spike_detection`
3. `reviews_priority_scoring`
4. `reviews_feature_ownership_map`
5. `reviews_weekly_report`

## Focus Principle for This Version
- Keep only features that directly improve prioritization, regression visibility, or ownership accountability.
- Avoid workflow or cosmetic expansions until the core decision loop is in daily/weekly use.

## Notes
- This backlog intentionally omits anything already in `src/index.ts`.
- Items above are derived from PM/analyst decision impact and current architecture constraints.
