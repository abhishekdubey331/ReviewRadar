# 📄 Product Requirements Document
**Product:** ReviewRadar App Review Intelligence MCP Server
**Owner:** Abhishek Dubey
**Version:** v1.0 *(Implementation Contract Ready)*

## 1. Problem Statement

ReviewRadar ingests a continuous stream of app reviews across platforms (Play Store, App Store).

**Currently:**
*   Reviews are manually scanned.
*   Patterns are discovered late.
*   Bugs surface only after escalation.
*   Safety-related issues may go unnoticed.
*   No structured intelligence by feature area (Crash Detection, Driving Reports, Family Location, etc.).

We need a structured, automated, reproducible review intelligence engine that:
*   Classifies reviews consistently.
*   Extracts actionable signals.
*   Detects severity (P0 / P1 / P2) using heuristic + NLP signals.
*   Highlights Safety-critical issues.
*   Generates PM-ready & Eng-ready summaries.

This will be implemented as an **MCP server**, making it a stateless, modular intelligence layer usable by Cursor, Claude Desktop, internal dashboards, and automation workflows.

## 2. Goals

**Primary Goals (v1)**
*   Normalize incoming review data.
*   Classify each review into a structured taxonomy.
*   Extract feature-area level insights.
*   Detect severity with high determinism based on pre-defined rule precedence.
*   Generate weekly/batch insight reports.
*   Suggest safe, policy-aligned reply drafts with configurable tones.

**Secondary Goals (v2)**
*   Version-level regression detection.
*   Spike detection after release.
*   Jira export integration.
*   Trend visualization layer.
*   Historical state storage.

## 3. Non-Goals (v1)

*   Direct integration with Play Store/App Store APIs.
*   Real-time streaming analysis.
*   Fully automated reply publishing.
*   Sentiment/ML model fine-tuning.
*   **Historical Data Storage**: v1 is strictly stateless.
*   **Cross-Version Comparison**: Focus is on point-in-time analysis to nail taxonomy.

## 4. Target Users

**Primary Users**
*   **Product Managers**: Need to see top complaint themes this week to prioritize roadmap changes.
*   **Engineering Leads**: Need P0 issues grouped by feature for immediate action.
*   **Safety Team**: Need crash detection and location-sharing complaints flagged instantly.
*   **Customer Support**: Need reply drafts aligned with policy tone.

**Secondary Users**
*   **Marketing / Executive Reporting**: High-level automated summaries of user sentiment and top app complaints to gauge overall product health.

---

## 5. Architecture & Data Processing Strategy

To meet latency, cost, and reliability constraints, the system uses a **Stateless Hybrid Processing Pipeline**.

### 5.1 Stateful vs Stateless
*   **Strictly Stateless (v1):** The MCP tools act solely as a processing engine. The host client (Cursor, custom script, or dashboard) is responsible for retaining historical state, storing the output JSON, and providing data via file paths or payload.

### 5.2 Phase-Based Execution (Performance & Cost)
Passing 10,000 reviews entirely through an LLM is unscalable due to rate limits and context constraints.

**Phase 1: Deterministic Pass (Extremely Fast, Near-Zero Cost)**
1.  **PII Redaction:** Raw text passes through local Regex/Presidio to redact emails, phone numbers, and location identifiers.
2.  **Rule Engine:** Keyword heuristics map obvious feature areas.
3.  **Low-Signal / Spam Filter:** Regex-based rejection for reviews with `< 10` alphabetical characters, pure emojis, or repeating character anomalies (e.g., "asdfghjkl", "good app").

**Phase 2: LLM Pass (Selective, High Intelligence)**
*   *Explicit LLM Routing Rule*: A review is routed to the LLM **only if ANY of the following are true**:
    *   `severity` ∈ `{P0, P1}` OR `issue_type` == `Safety Concern`
    *   `feature_area` is `Unknown/Other` AND text length > 15 characters
    *   `confidence_score` from Rule-Engine < 0.60
    *   User explicitly requested a generated `reply`
    *   User explicitly requested a detailed `summary` of the specific review
*   Chunked batch processing handles concurrency without context window overload.

### 5.3 LLM Execution Control & Concurrency
To ensure operational stability and avoid API rate limits/errors:
*   **Concurrency Limits**: Maximum of 15-20 concurrent LLM requests.
*   **Retry Strategy**: Exponential backoff (`1s, 2s, 4s, 8s`) on `429 Too Many Requests` or network timeouts.
*   **Circuit Breaker**: Failure breaker: trip if 15%+ failure rate over a rolling window of last 50 LLM calls, OR 10 consecutive failures (whichever comes first). Stops execution immediately if the dynamic cost-calculator exceeds the batch budget ($X).
*   **Batch Timeout**: Rigid timeout limit (e.g., 45 seconds per chunk) to avoid hanging processes.

---

## 6. Functional Requirements

### 6.1 Review Import (`reviews.import`)
*   **Input**: CSV, JSON array.
*   **Must**: Verify schema, normalize fields, remove duplicates.
*   **Security (CRITICAL)**: Execute Pre-LLM PII redaction. *Never send raw PII to an LLM.*
*   **Input Guardrails**:
    *   Max reviews per request: 5,000
    *   Max raw payload size: 10 MB
    *   Max CSV file size: 25 MB
    *   *If exceeded: return a structured error with code = `INPUT_TOO_LARGE` and guidance to split the batch.*

### 6.2 Review Classification (`reviews.analyze`)
Output for each review:

**A. Issue Type**
Bug | Performance | UX | Feature Request | Account/Auth | Billing/Pricing | Safety Concern | Praise | **Spam / Bot / Irrelevant**

**B. Feature Area (domain-specific)**
Crash Detection | Driving Reports | Family Location | SOS | Card Controls | Allowance/Chores | Savings/Investing | Bank Linking | Notifications | Onboarding | Login/OTP | Other | **Unknown**
*   *Unknown*: Cannot classify confidently (routes to LLM).
*   *Other*: Confidently classified as none of the known buckets (does not route).

**C. Deterministic Severity Logic (Precedence-based, explicit)**

*Definitions*
*   `CRITICAL_PHRASES` = `["can't login", "cannot login", "login failed", "account blocked", "money missing", "charged", "payment failed", "crashed on startup", "app won't open", "stuck on loading"]`
*   `SAFETY_FAILURE_PHRASES` = `["crash detection not working", "didn't detect crash", "no alert sent", "location not updating", "stopped sharing location", "SOS not working", "emergency alert failed", "not getting notifications"]`

*Severity Evaluation Order (highest wins, stop at first match)*

*   **P0 — Critical (Global)**:
    *   IF review text contains any `CRITICAL_PHRASES`
    *   OR IF rating ≤ 2 AND text contains `["scam", "fraud", "stole", "unauthorized"]`
    *   *(Overrides LLM; deterministic)*
*   **P0 — Safety Failure**:
    *   IF (`issue_type` == Safety Concern)
    *   OR ((`feature_area` ∈ `[Crash Detection, Family Location, SOS]`) AND (`sentiment` == Negative))
    *   AND (text contains any `SAFETY_FAILURE_PHRASES` OR text contains `["not working", "stopped", "fails", "failed", "broken"]` with a safety feature mention).
    *   *(Overrides LLM; deterministic)*
*   **P1 — Major**:
    *   IF `issue_type` == Bug AND `sentiment` == Negative AND rating ≤ 3
    *   OR IF `issue_type` == Performance AND text contains `["crash", "freeze", "lag", "hang"]` AND rating ≤ 3.
*   **P2 — Minor**:
    *   IF `issue_type` == UX
    *   OR IF rating == 4 AND `sentiment` == Mixed
    *   OR minor functional annoyance without critical phrases.
*   **FYI**: Feature requests, neutral feedback, praise, informational notes.
*   *Note: Rating influences severity but does not decide it. LLM is only used when the deterministic layer cannot confidently classify.*

**D. Sentiment**
Positive | **Mixed** | Neutral | Negative

**E. Extracted Signals**
Problem summary, Repro hints, Device/version, Feature mentions.

**F. Confidence Scoring**
*   **confidence_score**: Decimal threshold `0.0 - 1.0`.
*   **classification_source**: Enum `[rule_engine, llm, hybrid]`.
*   *Rule-Engine Confidence Formula*: `rule_confidence = max(score(feature_area), score(issue_type), score(sentiment))` with scores derived from keyword-hit strength (exact phrase > fuzzy match > weak token match), capped `0-1`.
    *   *Spam override*: If spam filter triggers → `rule_confidence = 1.0` and `issue_type = Spam`.
*   *Value*: Enables clients to automatically trust high-confidence clusters (`> 0.85`) and route low-confidence anomalies (`< 0.60`) to humans or stronger LLMs.

### 6.3 Aggregation & Summary (`reviews.summarize`)
*   **Must Generate**: Top complaint themes, Top praised features, P0/P1 list, Feature heatmap (count by area).
*   **Safety Escalation Logic (CRITICAL)**:
    *   **IF** (`Issue Type = Safety Concern`) **OR** ((`Feature Area in [Crash Detection, Family Location, SOS]`) **AND** (`Sentiment = Negative`))
    *   **THEN**: Bypass standard weekly aggregation → Push to dedicated `safety_alerts[]` output array → Flag `requires_immediate_attention: true`.

### 6.4 Reply Suggestions (`reviews.reply_suggest`)
*   **Inputs**: `review_text`, `tone` (optional, e.g., `empathetic_formal`, `casual`).
*   **Constraints**: Avoid promising refunds, giving timelines, or admitting fault beyond policy.
*   **Must Include**: Empathy, clear next step, support escalation link placeholder.
*   **Output Flag**: `needs_human_approval: true`

### 6.5 Export (`reviews.export`)
*   Formats: Markdown (Slack-ready), JSON (dashboard-ready), Jira-draft format.

### 6.6 Safety Extraction (`reviews.get_safety_alerts`) *Optional/Practical*
*   **Input**: Same batch payload/path as import block.
*   **Output**: Only `safety_alerts[]` + minimal metadata.
*   *Benefit*: Faster, cheaper, and more focused daily use by the Safety Team without needing to read full reports.

### 6.7 Structured Output Contract (v1 Schema)
To ensure the MCP server is a stable primitive, all batch analysis tools MUST conform to the following JSON schema:

```json
{
  "metadata": {
    "schema_version": "1.0",
    "rules_version": "v1.0.0-alpha",
    "taxonomy_version": "1.0",
    "models_used": {"routing": "claude-3-5-haiku", "summary": "claude-3-5-sonnet"},
    "pii_redaction_engine": "presidio-2.2",
    "processed_at": "2024-03-01T12:00:00Z",
    "total_reviews_input": 1000,
    "filtered_spam": 45,
    "spam_ratio": 0.045,
    "total_processed": 955,

    "llm_routed_count": 210,
    "llm_routed_ratio": 0.22,
    "rule_only_count": 620,
    "hybrid_count": 125,

    "rule_coverage_drop": false,
    "warnings": [],

    "cost_estimate_usd": 1.85,
    "execution_time_ms": 14500
  },
  "safety_alerts": [
    {
      "review_id": "rev_123",
      "text": "Location sharing stopped working when my kid left school.",
      "feature_area": "Family Location",
      "severity": "P0",
      "requires_immediate_attention": true
    }
  ],
  "reviews": [
    {
      "review_id": "rev_124",
      "issue_type": "Bug",
      "feature_area": "Card Controls",
      "severity": "P1",
      "sentiment": "Negative",
      "confidence_score": 0.92,
      "classification_source": "hybrid",
      "signals": {
        "summary": "Card toggle failing to save state",
        "device": "Android 14"
      }
    }
  ],
  "summary": {
    "top_themes": ["Card Controls Sync", "OTP SMS delay"],
    "p0_count": 1,
    "p1_count": 14
  }
}
```

*Metadata Rules:*
*   `spam_ratio` = `filtered_spam / total_reviews_input`
*   `rule_coverage_drop` = `true` if `llm_routed_ratio > 0.35` (tunable threshold indicating the deterministic rules are failing to classify reviews).
*   *Warnings array should populate if thresholds are breached:*
    *   `"HIGH_SPAM_RATIO"` if `spam_ratio > 0.25`
    *   `"RULE_COVERAGE_DROP"` if `rule_coverage_drop = true`
    *   `"CIRCUIT_BREAKER_TRIPPED"` if cost/timeout breaker activates.

### 6.8 Global Error Contract
All MCP tools must return standard, deterministic errors for proper client handling on failure:

```json
{
  "error": {
    "code": "INPUT_TOO_LARGE | INVALID_SCHEMA | FILE_NOT_FOUND | RATE_LIMITED | CIRCUIT_BREAKER_TRIPPED | TIMEOUT | INTERNAL",
    "message": "Human-readable explanation.",
    "details": { "optional": true, "provided_size": "30MB", "max_size": "25MB" }
  }
}
```

---

## 7. Non-Functional Requirements & Cost Governance

*   **Cost Efficiency Target**: Maximum cost per 1,000 processed reviews < `$X.XX`.
*   **Model Tiering Strategy**:
    *   *Classification/Routing*: Use high-throughput, low-cost models (e.g., GPT-4o-mini, Claude 3.5 Haiku).
    *   *System Summarization*: Use reasoning models (e.g., Claude 3.5 Sonnet, GPT-4o) selectively for the final `reviews.summarize` aggregation.
*   **Throughput**: Capable of ingesting and rule-processing 100 reviews/second (Phase 1).
*   **Security Compliance**: Complete redaction of Financial/Family/Location PII prior to leaving the local environment.

### 7.1 Observability Requirements
For production stability, the pipeline MUST emit:
*   **Per-Batch Counters**: `rate_limit_count`, `retry_count`, `timeout_count`.
*   **Sample Logs**: For `safety_alerts` (redacted), `rule_coverage_drop`, and `circuit_breaker` events.
*   **Security Barrier**: NEVER log raw review text unless it has passed through the PII redaction layer.

## 8. Success Metrics
*   **Quality**: 90% classification consistency across batches.
*   **Safety First**: 100% of P0 safety issues successfully tripped the `safety_alerts[]` threshold.
*   **Efficiency**: Reduction in overall manual review processing time by 70%.
*   **Cost Adherence**: Operations remain strictly under the defined cost target, with circuit breaker tripping 0 times in normal load.
*   **Business Impact**: Faster bug detection, reduced support escalations, and a clear feature signal to the roadmap.

## 9. Evaluation Harness & Execution Plan

### 9.1 Evaluation Harness (Golden Dataset)
To prove the "90% consistency" metric:
*   **Dataset**: Maintain 200–500 manually labeled "golden" internal reviews.
*   **Metrics**: Track label accuracy per dimension (`issue_type`, `feature_area`, `severity`), plus strict **safety recall**.
*   **Regression Gate**: PRs must not drop overall accuracy against the golden dataset by `> 2%`.

### 9.2 Execution Milestones
The engineering build should proceed in these stateless milestones:
1.  **Core Pipeline (Phase 1)**: CSV/JSON parsing, dedupe, regex PII redaction, spam filter, rule engine feature mapping, and error schema integration.
2.  **Selective LLM Routing**: Implementation of explicit routing logic, concurrency limits, retries, circuit breakers, and confidence scoring.
3.  **Summaries & Exports**: Theme clustering (Rule + LLM), markdown report formatter, and Jira-draft exporter.
4.  **Safety Workflow**: Deployment of `reviews.get_safety_alerts` and associated deterministic guardrails.
