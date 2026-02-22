# Tooling Surface

Use these prompts directly in your MCP-enabled IDE/chat. Results are JSON-like payloads unless noted.

| Tool | What this tool gives | Sample prompt | Expected result |
|---|---|---|---|
| `reviews_import` | Imports reviews from file/inline source into local index and metadata store. | "Run `reviews_import` using default source." | Import summary with processed count, success/failure info, and index updates. |
| `reviews_search` | Semantic search across imported reviews with optional date/rating filters. | "Use `reviews_search` for: `login OTP not received`, limit 10, sort by relevance." | Ranked list of matching reviews with relevance metadata and review fields. |
| `reviews_analyze` | Full hybrid analysis (rules + LLM routing) for deep review-level diagnostics. Not the default PM summary entrypoint. | "Analyze these latest reviews and include summary: run `reviews_analyze`." | Per-review analysis objects plus optional aggregate summary fields. |
| `reviews_get_critical_alerts` | Fast path for business-critical P0/P1 incidents needing immediate action. | "Run `reviews_get_critical_alerts` with `source: { type: 'file', path: 'sample_data/reviews.csv' }`." | Business-critical alert objects (P0/P1) with issue type, rationale, and escalation-ready signals. |
| `reviews_summarize` | Theme-level summary from already analyzed reviews. | "Run `reviews_summarize` on this analyzed review list." | Theme buckets, counts, and concise narrative summary. |
| `reviews_export` | Formats analyzed reviews for reporting workflows (Markdown/Jira payloads). | "Export these analyzed reviews with `reviews_export` in markdown format." | Rendered markdown text or Jira-ready structured payload. |
| `reviews_top_issues` | Primary PM summary entrypoint for customer pain points (counts + severity). Supports time windows/custom ranges and defaults to `this_week` when scope is omitted. | "Run `reviews_top_issues` with `options.window='last_90_days'` or `options.filters.start_date/end_date`." | Sorted issue clusters with counts/severity, plus applied range metadata. |
| `reviews_segment_breakdown` | Breakdown by app version/device/platform/locale/rating segment. | "Use `reviews_segment_breakdown` by app_version and platform." | Segment table-style metrics showing where issues concentrate. |
| `reviews_time_trends` | Trend buckets over day/week for volume, severity, and sentiment. | "Run `reviews_time_trends` weekly for the last 8 weeks." | Time-series buckets with movement of key issue metrics. |
| `reviews_compare_windows` | Baseline vs current window comparison for regressions/improvements. | "Compare last 7 days vs previous 7 days with `reviews_compare_windows`." | Delta report with up/down changes in issues, severity, and sentiment. |
| `reviews_spike_detection` | Detects sudden issue spikes in most recent buckets. | "Run `reviews_spike_detection` and flag notable new spikes." | Spike list with magnitude, time bucket, and related issue keys. |
| `reviews_priority_scoring` | Impact-based ranking to help roadmap prioritization. | "Run `reviews_priority_scoring` for this month of analyzed reviews." | Priority-scored clusters with rank and score breakdown. |
| `reviews_feature_ownership_map` | Maps issue clusters to teams/owners using ownership rules. | "Run `reviews_feature_ownership_map` with these ownership rules." | Issue-to-owner assignments and unmapped items needing triage. |
| `reviews_weekly_report` | PM-ready weekly rollup combining issues, spikes, priorities, ownership. | "Generate a weekly report with `reviews_weekly_report`." | Consolidated weekly report payload for sharing with product/eng. |
| `reviews_cluster_reviews` | One-call drilldown to get full review rows for a specific cluster (e.g., Unknown/Unknown) with window/date filtering. | "Run `reviews_cluster_reviews` for `include_unknown_only=true` and `window='last_30_days'` and return review_id/date/score/text." | Matching full review rows so PMs can inspect exact customer text without search loops. |
| `reviews_get_index_status` | Index diagnostics: record counts and metadata health. | "Run `reviews_get_index_status`." | Health/status snapshot of vector index and metadata state. |
| `reviews_diagnose_runtime` | Runtime/env diagnostics with masked secrets and path checks. | "Run `reviews_diagnose_runtime` and show runtime diagnostics." | Diagnostic payload for env loading and storage path troubleshooting. |

Provider notes:
- Current provider support: OpenAI only.
- `reviews_search` requires `OPENAI_API_KEY` (embedding path).
- `reviews_import` can ingest without embeddings, but full vector indexing requires `OPENAI_API_KEY`.
