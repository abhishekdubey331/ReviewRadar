# Greenlight App Reviews MCP: Testing & Verification Guidelines

To ensure the MCP server remains robust, cost-effective, and fully compliant with the `v1.0` PRD, **every single commit** in the execution plan MUST be accompanied by corresponding tests and manual verification steps.

Code must not be pushed if the tests fail or if the verification steps have not been executed.

## 1. Core Testing Philosophy
*   **Vitest as the Runner:** All automated tests will use Vitest for execution.
*   **Isolated Verification:** Every feature commit (e.g., Zod schema creation, PII redaction) must be tested in isolation before moving to the next commit.
*   **No Live LLM in Unit Tests:** Any tests involving the LLM routing or summarization (Phase 2) must mock the LLM response to ensure tests are fast, deterministic, and free of API costs. The only exception is the final Golden Dataset Evaluation.

## 2. Commit-by-Commit Verification Rules

### Milestone 1: Core Pipeline
*   **Schemas (Commit 2):** Write unit tests passing both valid payloads and purposely malformed payloads (missing fields, wrong types). Assert that `ZodError` is thrown correctly.
*   **Import / Parsing (Commit 3):** Provide a mock CSV and JSON array. Assert that the parser correctly deduplicates rows and throws the `INPUT_TOO_LARGE` error if limits are exceeded.
*   **PII Redaction (Commit 4):** This is **CRITICAL**. Write tests feeding raw strings with fake phone numbers, emails, and coordinates. Assert that the output string strict-matches the expected `[REDACTED]` format and leaks zero PII.
*   **Rule Engine & Severity (Commits 5 & 6):** Write unit tests for each specific rule branch.
    *   *Test 1:* A review with "can't login" must assert as `P0`.
    *   *Test 2:* A review about "location not updating" with negative sentiment must assert as `P0`.
    *   *Test 3:* A review with <10 characters must trigger the spam filter and return `rule_confidence = 1.0`.

### Milestone 2: LLM Routing & Concurrency
*   **Routing Barrier (Commit 7):** Provide mock outputs from the Rule Engine. Assert that `isLlmRequired` returns `true` only for the explicit PRD criteria (e.g., `< 0.60 confidence`, `Unknown` feature area, etc.).
*   **Concurrency & Circuit Breakers (Commits 8 & 9):**
    *   Mock the LLM client to simulate a `429 Too Many Requests` error. Assert that the exponential backoff triggers.
    *   Mock 10 consecutive failures. Assert that the Circuit Breaker trips and throws the `CIRCUIT_BREAKER_TRIPPED` error.

### Milestone 3/4: Summaries, Exports, and Safety
*   **Output Formats (Commits 11, 12, 13):** Assert that the generated markdown and Jira formats match the expected string templates. Assert that `reviews.reply_suggest` always outputs `needs_human_approval: true`.
*   **Safety Alerts Fast-Path (Commit 14):** Assert that calling `reviews.get_safety_alerts` returns *only* reviews matching the safety criteria, ignoring all others.

## 3. Pre-Commit Checklist
Before committing and pushing code for any step in the Execution Plan, the engineer MUST:
1.  Run `npm run verify` (which should theoretically run `tsc --noEmit` and `vitest run`).
2.  Ensure 100% of newly added tests pass.
3.  Ensure 0 regressions in previously written tests.

## 4. The Golden Dataset (Final Verification)
At the end of the project (Commit 16), an integration test suite will be run against a static `golden_dataset.json` (200 mocked reviews).
*   **Quality Gate:** The pipeline must achieve `> 90%` classification accuracy against the known golden labels.
*   **Safety Gate:** The pipeline must achieve `100%` recall on P0 Safety issues.
