# PM/Analyst Tooling Review for ReviewRadar MCP

## Goal
Define the MCP toolset needed for product managers and analysts to analyze app-review datasets deeply ("left, right, and center"), and compare this against the current implementation.

## Current Toolset (As Implemented)
From `src/index.ts`, the server currently exposes:
- `reviews_import`
- `reviews_analyze`
- `reviews_get_safety_alerts`
- `reviews_summarize`
- `reviews_reply_suggest`
- `reviews_export`
- `reviews_search`
- `reviews_get_index_status`
- `reviews_diagnose_runtime`

## Current Toolset (In Interface Spec)
From `docs/interface_specs.md`, the documented tools focus on:
- `reviews.import`
- `reviews.analyze`
- `reviews.get_safety_alerts`
- `reviews.reply_suggest`
- shared error contracts

## Key Findings
1. Naming mismatch exists between docs and implementation.
- Docs use dotted names (`reviews.analyze`).
- Runtime uses underscored names (`reviews_analyze`).
- This can create client integration confusion and broken tool invocation.

2. PM-critical analytics are partially present, but not packaged as direct insights.
- You can derive top issues/themes by chaining `reviews_analyze` + `reviews_summarize`.
- There is no dedicated ranked output for "top issues", "top regressions", "impact by segment", etc.

3. Analyst depth is limited by lack of first-class aggregation and comparison tools.
- There is no built-in time-window comparison, cohort segmentation, trend/spike detection, or driver analysis.

4. Operational/diagnostic tools are good, but product analytics tools are missing.
- `reviews_get_index_status` and `reviews_diagnose_runtime` are useful for engineering health.
- PMs/analysts need decision-grade tools with business-ready metrics.

## Coverage Matrix: PM/Analyst Questions vs Current Tools
- "What are top user issues this week?"
  - Partial: `reviews_analyze` + post-processing required.
- "What are the core themes?"
  - Yes: `reviews_summarize`.
- "What got worse vs last release?"
  - No first-class tool.
- "Which feature area drives most 1-2 star reviews?"
  - Partial via manual grouping.
- "Which app versions/devices are causing pain?"
  - Partial; signals exist but no grouped report.
- "Are support replies reducing repeat complaints?"
  - No.
- "What should roadmap prioritize by impact?"
  - No scoring/prioritization tool.

## Recommended Tool Additions
Priority labels:
- P0: highest product value and broadest PM/analyst utility.
- P1: high value once P0 exists.
- P2: specialized or optimization tools.

### P0 Tools (Build First)
1. `reviews_top_issues`
- Purpose: Return ranked issues with counts, affected users, severity mix, and representative quotes.
- Why: Directly answers the most common PM question without manual aggregation.
- Suggested output fields:
  - `issue_key` (`issue_type + feature_area`)
  - `review_count`
  - `affected_share`
  - `severity_breakdown`
  - `avg_rating`
  - `example_review_ids`

2. `reviews_theme_clusters`
- Purpose: Stable theme clusters with labels, confidence, and trend-ready IDs.
- Why: Current `top_themes` list is useful but too lightweight for tracking over time.
- Suggested output fields:
  - `theme_id`, `theme_label`, `count`, `share`, `sentiment_mix`, `severity_mix`, `sample_reviews`

3. `reviews_segment_breakdown`
- Purpose: Break down pain by app version, OS version, device, locale, platform, rating bucket.
- Why: Root cause isolation for engineering and release managers.
- Suggested output fields:
  - `segment_dimension`, `segment_value`, `issue_count`, `p0_p1_count`, `avg_rating`

4. `reviews_time_trends`
- Purpose: Daily/weekly trendlines for issue volume, severity, sentiment, and themes.
- Why: Needed for weekly product reviews and launch monitoring.
- Suggested output fields:
  - `time_bucket`, `total_reviews`, `negative_share`, `p0_count`, `top_issue_keys`

### P1 Tools
5. `reviews_compare_windows`
- Purpose: Compare two date windows (or two app versions) and detect regressions/improvements.
- Why: Essential for release-quality analysis.
- Suggested output fields:
  - `metric`, `baseline`, `current`, `delta`, `delta_pct`, `is_regression`

6. `reviews_spike_detection`
- Purpose: Detect statistically meaningful spikes in issue/theme volume.
- Why: Early-warning before ratings collapse.
- Suggested output fields:
  - `detected_at`, `issue_key`, `spike_score`, `baseline_rate`, `current_rate`, `possible_drivers`

7. `reviews_priority_scoring`
- Purpose: Rank issue clusters by impact score (volume x severity x recency x rating drag).
- Why: Converts raw analytics into roadmap-ready prioritization.
- Suggested output fields:
  - `issue_key`, `impact_score`, `confidence`, `recommended_owner`, `suggested_next_action`

8. `reviews_feature_health`
- Purpose: Feature-area scorecard (health index, trend, risk level).
- Why: Executive/PM dashboard primitive.

### P2 Tools
9. `reviews_cohort_retention_signals`
- Purpose: Infer churn-risk signals from review text and rating trajectories.
- Why: Useful but requires more assumptions.

10. `reviews_reply_effectiveness`
- Purpose: Measure whether support replies reduce repeated complaints in similar issue clusters.
- Why: Support ops optimization.

11. `reviews_taxonomy_quality_audit`
- Purpose: Track unknown/other overflow, low-confidence clusters, label drift.
- Why: Keeps analytics trustworthy as data evolves.

12. `reviews_report_generate`
- Purpose: One-shot PM weekly report generation (summary, top regressions, priorities, action list).
- Why: Workflow accelerator once underlying primitives exist.

## Recommended Updates to Existing Tools
1. `reviews_analyze`
- Add optional `group_by` and `aggregations` parameters.
- Add optional `date_range` filter for time-scoped analysis.
- Return optional `top_issues` block directly.

2. `reviews_summarize`
- Add explicit `include_top_issues`, `include_feature_heatmap`, `include_praise_drivers` flags.
- Return structured clusters (IDs + counts), not only free-text themes.

3. `reviews_export`
- Add `format: "csv" | "parquet" | "jsonl"` for analyst workflows.
- Add deterministic schema versioning in output headers.

4. `reviews_search`
- Add faceted search (`issue_type`, `feature_area`, `severity`, `sentiment`).
- Add pagination cursor and total hit count.

## Contract and Product Hygiene Recommendations
1. Standardize tool naming.
- Pick one convention (prefer dotted MCP style for docs and runtime consistency).

2. Publish a canonical analytics schema.
- Define `IssueCluster`, `ThemeCluster`, `TimeBucketMetric`, `SegmentMetric` once and reuse.

3. Add state strategy for historical analytics.
- Current architecture is stateless; trend/regression tools require host-managed snapshots or a lightweight persisted store.

4. Add evaluation metrics for analytics quality.
- Theme stability, cluster purity, regression precision/recall, spike false-positive rate.

## Suggested Delivery Plan
Phase 1 (Immediate)
- Ship `reviews_top_issues`, `reviews_segment_breakdown`, naming consistency fix.

Phase 2
- Ship `reviews_time_trends`, `reviews_compare_windows`, `reviews_spike_detection`.

Phase 3
- Ship `reviews_priority_scoring`, `reviews_feature_health`, `reviews_report_generate`.

## Bottom Line
Current tools are strong for ingestion, per-review classification, safety triage, and basic summarization. For PM/analyst-grade deep analysis, the biggest missing layer is first-class aggregation, comparison, and prioritization tools. Adding the P0 set above will immediately convert the MCP server from "analysis engine" to "decision engine."
