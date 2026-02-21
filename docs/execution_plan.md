# Greenlight App Reviews MCP: Git Execution Plan

This document outlines the exact commit-by-commit phases required to build the Greenlight App Review Intelligence MCP Server. It translates the `PRD.md` and `interface_specs.md` into 4 strict engineering milestones.

> **CRITICAL:** Every single commit listed below MUST follow the verification rules defined in [`docs/testing_guidelines.md`](./testing_guidelines.md). Code must not be advanced or pushed without accompanying Vitest unit tests and boundary validations.

### Milestone 1: Core Pipeline & Parsing (No LLM)
**Goal:** Ingest raw CSV/JSON, validate it against the MCP schema, redact PII locally, and run the pure Regex/Rule Engine.

*   **Commit 1: `chore: init typescript project and mcp sdk`**
    *   Setup `package.json`, `tsconfig.json`, `esbuild`/`tsup`.
    *   Install `@modelcontextprotocol/sdk`, `zod`, `papaparse`.
    *   Create basic `index.ts` connecting the stdio transport layer.
*   **Commit 2: `feat: implement Zod schemas for shared types`**
    *   Translate `interface_specs.md` into Zod schemas (`ReviewInput`, `IssueType`, `FeatureArea`, `Severity`, `Metadata`, etc.).
    *   Create generic `Error` factory function (`INPUT_TOO_LARGE`, `INVALID_SCHEMA`).
*   **Commit 3: `feat: implement reviews.import tool (CSV/JSON parsing)`**
    *   Add file reading and inline JSON parsing handlers.
    *   Implement row deduplication.
    *   Enforce `max_reviews` (5,000) and payload limits.
*   **Commit 4: `security: implement pre-LLM PII redaction engine`**
    *   Integrate Regex/Presidio wrapper.
    *   Implement function to scrub emails, phone numbers, and coordinates from `content`.
    *   Write strict unit tests verifying `content_redacted` output.
*   **Commit 5: `feat: implement deterministic Rule Engine pass`**
    *   Implement Phase 1 Pipeline: Low-signal / Spam Filter (regex rejection for `<10` chars).
    *   Implement Keyword Heuristics for `FeatureArea` mapping.
*   **Commit 6: `feat: implement explicit P0/P1 severity precedence engine`**
    *   Code the exact "Severity Evaluation Order" logic from PRD Section 6.2(C) (e.g. `CRITICAL_PHRASES`, `SAFETY_FAILURE_PHRASES`).
    *   Compute `rule_confidence` (max score of feature/issue/sentiment).

### Milestone 2: Selective LLM Routing & Concurrency
**Goal:** Connect to Anthropic/OpenAI APIs, enforce circuit breakers, and only route ambiguous/complex reviews to the model.

*   **Commit 7: `feat: implement LLM routing barrier`**
    *   Write logic: `isLlmRequired(review)`. 
    *   Only return `true` if `rule_confidence < 0.60`, `feature_area === "Unknown"`, or severity is `P0/P1` safety.
*   **Commit 8: `feat: implement concurrent LLM processing client`**
    *   Install `p-limit` and `async-retry`.
    *   Connect official SDK (OpenAI/Anthropic).
    *   Implement batch processing with max 15-20 concurrency.
    *   Implement exponential backoff (`1s, 2s, 4s, 8s`) for `429` errors.
*   **Commit 9: `feat: implement dynamic cost and circuit breakers`**
    *   Add token tracking and cost estimation metric pipeline.
    *   Implement failure trigger (trip if 15%+ failure rate over 50 calls, or 10 consecutive).
*   **Commit 10: `feat: wire reviews.analyze tool endpoint`**
    *   Merge Phase 1 (Determinism) + Phase 2 (LLM).
    *   Assemble full `reviews[]` array and output `metadata` with routing stats (`llm_routed_ratio`, `spam_ratio`, etc.).

### Milestone 3: Aggregation, Summaries & Exports
**Goal:** Provide the high-level artifacts that PMs and Support teams use daily.

*   **Commit 11: `feat: implement reviews.summarize tool`**
    *   Group `reviews[]` by `FeatureArea` and `IssueType`.
    *   Extract top 3 `top_themes` using high-tier model (e.g., Claude 3.5 Sonnet).
    *   Generate `p0_count`, `p1_count`, and feature heatmaps.
*   **Commit 12: `feat: implement reviews.reply_suggest tool`**
    *   Write the specific prompt forcing policy adherence (no refunds, no timelines).
    *   Accept `tone` parameter.
    *   Always append `needs_human_approval: true`.
*   **Commit 13: `feat: implement reviews.export tool formatters`**
    *   Add Markdown generator (Slack-ready).
    *   Add Jira-draft payload generator.

### Milestone 4: Safety Workflow & Observability (Production Ready)
**Goal:** Unblock the Safety Team and secure the system against operational drift.

*   **Commit 14: `feat: implement reviews.get_safety_alerts tool`**
    *   Implement fast-path: Return *only* items triggering the `safety_alerts[]` explicit criteria.
    *   Bypass standard feature mapping to save latency.
*   **Commit 15: `chore: implement observability requirements`**
    *   Add console logging for `rule_coverage_drop` thresholds.
    *   Add `WARNINGS` array payload logic for high-spam batches.
    *   Enforce strict no-raw-text logging rules.
*   **Commit 16: `test: build Golden Dataset Evaluation Harness`**
    *   Create Vitest suite.
    *   Store 200 mocked "golden" reviews in `/__tests__/fixtures`.
    *   Write regression gate asserting `> 90%` accuracy for issue matching and `100%` recall for safety phrases.
