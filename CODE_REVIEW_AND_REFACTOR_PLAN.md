# CODE REVIEW AND REFACTOR PLAN

## Prioritized TODO
1. [x] **P0**: Fix LLM failure handling so one bad/invalid model response does not fail an entire analyze batch.
2. [x] **P0**: Correct budget/cost accounting to be provider-aware and stop using hardcoded Anthropic rates globally.
3. [x] **P0**: Enforce consistent input validation for inline reviews in `loadReviews` (currently weaker than file-based path).
4. [ ] **P1**: Split `dispatchToolCall` switch into a registry-based command layer to reduce coupling and improve testability.
5. [ ] **P1**: Introduce domain-level typed result contracts for analysis output instead of late schema parsing in hot paths.
6. [ ] **P1**: Add explicit request-level observability primitives (request IDs, duration buckets, error classes).
7. [ ] **P1**: Improve scraper/runtime config consistency by centralizing URL parsing and env loading strategy.
8. [ ] **P2**: Raise coverage on startup/runtime wiring (`src/index.ts`) and add smoke tests for tool registration + dispatch.
9. [ ] **P2**: Tighten OSS package hygiene (engines, publish files, dependency policy, release automation).

## Progress Update (2026-02-22)
- Completed P0 reliability hardening in:
  - `src/tools/analyze.ts` (all-settled orchestration + per-item fallback handling)
  - `src/tools/analyze_service.ts` (circuit-breaker trip safety in fallback path)
  - `src/tools/import.ts` (unified validation/normalization for inline + file)
  - `src/engine/circuitBreaker.ts` (model-aware pricing map)
  - `src/engine/llmClient.ts`, `src/domain/ports/llm_client.ts` (model propagation to cost tracking)
- Added/updated tests:
  - `__tests__/analyze.test.ts`
  - `__tests__/circuitBreaker.test.ts`
  - `__tests__/import.test.ts` (validated through full suite)
- Validation status:
  - `npm run test -- __tests__/analyze.test.ts __tests__/circuitBreaker.test.ts __tests__/import.test.ts` passed
  - `npm run verify` passed (28 files, 102 tests)

## Executive Summary
Overall health is **good** and close to open-source-ready. CI is green (`npm run verify` passes: lint + 102 tests + coverage threshold).

The original highest-risk P0 items (LLM failure handling, budget accounting, and inline validation consistency) are now implemented and validated. Biggest remaining risks are concentrated in **modularity/coupling in dispatcher/bootstrap paths** and **observability consistency**.

Open-source readiness is **mostly in place** (`LICENSE`, `README`, `CONTRIBUTING`, `SECURITY`, CI workflow), but production-hardening refactors are still recommended before broad external adoption.

## Strengths
- Clear top-level layering intent (`app`, `tools`, `engine`, `infrastructure`, `domain`, `utils`).
- Good automated test surface and enforced coverage thresholds (`vitest.config.ts`).
- Sensible schema-first validation approach via Zod and explicit error envelope patterns.
- Useful operational artifacts for OSS (`CHANGELOG.md`, release checklist, contribution and security docs).
- PII redaction integrated in analysis and safety alert fast-path.

## Issues and Improvements

### P0 (Must Fix Before Open-Sourcing)

#### P0-1: Batch analyze can fail hard on single malformed LLM output
- Status: **Completed (2026-02-22)**
- Where: `src/tools/analyze.ts`, `src/tools/analyze_service.ts` (`processSingleReview`, `buildAnalyzedOutput`)
- Why it matters: A single invalid/partial LLM response can trigger schema parse exceptions and fail the full request, hurting reliability and user trust.
- Recommended fix:
  - Convert per-review processing to return a typed `Result` (`ok | recoverable_error`).
  - Use `Promise.allSettled` at batch orchestration level.
  - On per-item parse failure, downgrade to safe rule-engine fallback and record failure metric.
- Example:
```ts
// before
const results = await Promise.all(reviews.map(processFn));

// after
const settled = await Promise.allSettled(reviews.map(processFn));
const processed = settled.map(normalizeSettledResultWithFallback);
```

#### P0-2: Budget guardrail is based on provider-inaccurate hardcoded pricing
- Status: **Completed (2026-02-22)**
- Where: `src/engine/circuitBreaker.ts`
- Why it matters: Cost estimates affect runtime control flow (`budget_guardrail`); inaccurate pricing can overrun budgets or over-throttle analysis.
- Recommended fix:
  - Move pricing config to provider/model-specific policy map.
  - Compute cost from the model actually used per request.
  - Store pricing policy version in metadata.
- Example:
```ts
// before: hardcoded Anthropic rates
estimatedCost += inTokens * 0.25/1e6 + outTokens * 1.25/1e6;

// after: model-aware rate lookup
estimatedCost += inTokens * pricing.inUsdPerM/1e6 + outTokens * pricing.outUsdPerM/1e6;
```

#### P0-3: Inline source path bypasses strict per-review schema validation
- Status: **Completed (2026-02-22)**
- Where: `src/tools/import.ts` (`loadReviews`)
- Why it matters: `inline` reviews are deduped but not normalized/validated equivalently to file input. This can introduce invalid records into downstream flows and nondeterministic behavior.
- Recommended fix:
  - Validate every review through `ReviewInputSchema` for both `file` and `inline` paths.
  - Normalize coercions (`score`, dates) in one shared transformer.
  - Emit diagnostics for dropped/invalid inline rows just like file mode.

### P1 (Strongly Recommended)

#### P1-1: Dispatcher is a monolithic switch with mixed responsibilities
- Where: `src/app/tool_dispatcher.ts`
- Why it matters: Adds coupling between transport contracts, validation, dependency wiring, and business logic; increases regression risk when adding tools.
- Recommended fix:
  - Replace switch with `ToolHandlerRegistry` (`name -> {schema, handler}`).
  - Keep transport formatting (`asTextResponse`) in adapter layer only.
  - Split search argument schema into dedicated module for reuse in registry + tests.

#### P1-2: Runtime composition in `index.ts` is not test-covered and not injectable enough
- Where: `src/index.ts`
- Why it matters: Startup and wiring regressions may escape unit tests; OSS users often hit integration failures first.
- Recommended fix:
  - Extract composition root to `src/app/bootstrap.ts` with pure factory functions.
  - Add integration smoke tests for server boot, tool listing, and one tool call with mocked deps.

#### P1-3: Config/env loading has side effects at module load time
- Where: `src/utils/config.ts`
- Why it matters: Import-time side effects complicate tests and embedders; `override: true` can unexpectedly replace host-provided env values.
- Recommended fix:
  - Move dotenv loading into explicit bootstrap call.
  - Respect existing process env by default (`override: false`) unless explicit opt-in.
  - Keep diagnostics, but separate from config parsing module.

#### P1-4: Scraper logic duplicates URL parsing and weakly validates runtime params
- Where: `scripts/scrape.js`, `src/utils/config.ts` (`extractAppId`)
- Why it matters: Two parsing paths can drift; scraper reliability issues become support burden in OSS.
- Recommended fix:
  - Share app link parsing utility between runtime and script.
  - Introduce schema validation for scraper env (`parseScrapeConfig`) directly in script.

#### P1-5: Observability is structured but lacks request correlation and severity taxonomy
- Where: `src/utils/logger.ts`, usage across `src/tools/*`, `src/infrastructure/*`
- Why it matters: Hard to trace failures across phases and classify actionable vs non-actionable events in production.
- Recommended fix:
  - Add `request_id`, `tool_name`, and `phase` fields to all logs.
  - Add stable error categories (`validation`, `provider`, `storage`, `internal`) and standard event names.

### P2 (Nice-to-Have)

#### P2-1: Tool schema sources are split between JSON schema objects and Zod runtime schemas
- Where: `src/app/tool_registry.ts` vs `src/tools/*` input schemas
- Why it matters: Drift risk between MCP contract declaration and actual runtime validation.
- Recommended fix:
  - Generate `inputSchema` from single source where possible.
  - Add a contract parity test that ensures every tool schema has matching runtime parser.

#### P2-2: Coverage blind spots remain in entrypoint and scripts
- Where: `src/index.ts`, `scripts/lint_markdown.js`, `scripts/scrape.js`
- Why it matters: Startup and release automation paths are critical for OSS onboarding.
- Recommended fix:
  - Add minimal smoke tests for entrypoint behavior.
  - Add unit tests for scrape CSV conversion and date normalization edge cases.

#### P2-3: Packaging metadata can be stricter for OSS consumers
- Where: `package.json`
- Why it matters: Better install/runtime predictability for external users.
- Recommended fix:
  - Add `engines`, `files`, and `exports` constraints.
  - Consider dependency update policy (`renovate`/`dependabot`) and release tagging automation.

## Proposed Target Architecture

```text
src/
  app/
    bootstrap.ts            # composition root, env/bootstrap
    server.ts               # MCP transport + handlers
    tool_router.ts          # dispatch by registry, no business logic
  domain/
    models/                 # review, classification, metadata
    services/               # pure orchestration contracts
    ports/                  # llm_client, vector_store, logger, clock
  usecases/
    analyze/
      analyze_usecase.ts
      analyze_types.ts
    import/
      import_usecase.ts
    search/
      search_usecase.ts
  infrastructure/
    llm/
      openai_client.ts
      anthropic_client.ts
      pricing_policy.ts
    vector/
      voy_vector_store.ts
      persistence.ts
    logging/
      json_logger.ts
  interfaces/
    mcp/
      tool_registry.ts
      dto_mappers.ts
  schemas/
    zod/
    mcp_json_schema/
```

Dependency direction should be strictly inward:
- `interfaces -> usecases -> domain`
- `infrastructure` implements `domain/ports`
- `app/bootstrap` wires concrete implementations

## Incremental Refactor Plan (Safe, Minimal Breakage)

### Phase 1: Reliability Hardening (P0)
- Status: **Completed (2026-02-22)**
- Changes:
  - Introduce per-item safe result handling in analyze pipeline.
  - Make cost accounting provider/model aware.
  - Unify review validation/normalization for inline + file inputs.
- Validation:
  - `npm run test -- __tests__/analyze.test.ts __tests__/import.test.ts __tests__/circuitBreaker.test.ts`
  - `npm run verify`
- Risk level: **Medium**
- Rollback strategy:
  - Keep old orchestration branch behind feature flag (`ANALYZE_PIPELINE_V1=true`) for one release.
  - Revert usecase-only files without touching transport layer.

### Phase 2: Modularity and Dependency Direction (P1)
- Changes:
  - Replace dispatcher switch with registry handlers.
  - Extract bootstrap/composition root.
  - Move config loading to explicit bootstrap step.
- Validation:
  - `npm run test -- __tests__/tool_dispatcher.test.ts __tests__/tool_registry_contract.test.ts`
  - Add and run bootstrap smoke test.
- Risk level: **Medium**
- Rollback strategy:
  - Keep compatibility adapter mapping old switch signature to new registry for one version.

### Phase 3: Observability and Runtime Operations (P1)
- Changes:
  - Request correlation IDs and standardized event taxonomy.
  - Error-class conventions and metric-friendly log fields.
- Validation:
  - Unit tests for logger formatter.
  - Snapshot tests for critical log envelopes.
- Risk level: **Low**
- Rollback strategy:
  - Logger remains backward-compatible on required core fields (`ts`, `level`, `event`).

### Phase 4: OSS Experience and Packaging (P2)
- Changes:
  - Tighten `package.json` publish/runtime constraints.
  - Add coverage for scripts/entrypoint smoke tests.
  - Optional release automation and dependency update bot.
- Validation:
  - `npm pack --dry-run`
  - `npm run verify`
  - CI green on pull request.
- Risk level: **Low**
- Rollback strategy:
  - Keep existing npm scripts and entrypoint contract stable.

## Backwards Compatibility Strategy
- Preserve MCP tool names and top-level response envelope shape.
- Version any input/output schema breaking changes (e.g., `reviews_analyze_v2`) and keep deprecated aliases for at least one minor cycle.
- Add contract tests that assert existing tool names and required fields remain unchanged.

## Coding Standard Baseline for OSS

### Formatting and linting
- TypeScript strict mode + `tsc --noEmit` in CI.
- Add ESLint (TypeScript + import rules + no-floating-promises).
- Keep Markdown lint check; add JSON/YAML lint for workflow/package hygiene.

### Error handling conventions
- Use `AppError` for all expected operational failures.
- Map external provider/storage errors into typed categories.
- Avoid raw `Error` throws outside infrastructure adapters.

### Logging strategy
- JSON logs only.
- Required fields: `ts`, `level`, `event`, `request_id`, `tool_name`.
- Never log raw review text unless explicitly opt-in debug mode and redaction verified.

### Type safety strategy
- Single source of truth for schema validation per contract.
- Avoid `any` in adapters and tools; use narrow DTOs and mappers.
- Prefer explicit return types for public module boundaries.

### Testing strategy and coverage
- Keep current threshold floor; raise branch coverage to >=70 project-wide after Phase 2.
- Add targeted integration tests for bootstrap + dispatcher registry.
- Add failure-mode tests (timeout, malformed LLM JSON, partial provider outages).

### Documentation expectations
- README: production deployment caveats, storage requirements, env matrix.
- `docs/architecture.md`: update to reflect actual module boundaries.
- Changelog entries for every contract-affecting change.

## Review Checklist Coverage
- API design: mostly clear; needs stronger schema parity and versioning discipline.
- Architecture: good foundation; improve dependency direction and reduce dispatcher coupling.
- Correctness: strong baseline; P0 reliability gaps in analyze failure modes.
- Security: generally good (redaction + docs); strengthen config/bootstrap and secret handling boundaries.
- Performance: adequate for current scale; chunking + batching are sensible.
- Reliability: retries/circuit breaker present; needs safer partial-failure behavior.
- Observability: structured logs exist; needs request correlation and error taxonomy.
- Testability: good unit coverage; add startup/integration and script-path tests.
- DX: strong docs/CI baseline.
- OSS readiness: close; finish P0/P1 hardening and packaging polish first.
