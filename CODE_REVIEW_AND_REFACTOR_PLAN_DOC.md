# CODE REVIEW AND REFACTOR PLAN

## Prioritized TODO
1. [x] [P0] Standardize public contract naming/docs identity and tool naming consistency.
2. [x] [P0] Split `VoyVectorStore` into independently testable modules and remove hidden env coupling.
3. [~] [P0] Replace permissive public tool schemas with strict schemas/shared DTOs.
4. [x] [P1] Introduce structured logger and remove raw `console.*` in core runtime paths.
5. [~] [P1] Refactor `analyze` into modular typed units.
6. [x] [P1] Fix docs/runbook drift (invalid commands/paths and encoding corruption in README).
7. [~] [P1] Raise OSS quality gates (linting, stronger coverage thresholds, contract tests, release policy).
8. [ ] [P2] Add reliability hardening (timeouts budgets, explicit retry policy, degraded-mode metadata).

## Execution Tracker
- Done: `7e6750a` docs identity and onboarding contract normalization (`README.md`, `docs/setup_guide.md`, `docs/architecture.md`, `package.json`, `src/index.ts`).
- Done: `57f2960` `reviews_export` schema hardening + tests (`src/tools/export.ts`, `src/tools/export.test.ts`).
- Done: `9cd6a7e` structured logger and observability migration for runtime/tool paths (`src/utils/logger.ts`, `src/index.ts`, `src/tools/analyze.ts`, `src/tools/safety_alerts.ts`).
- Done: `160b45e` modular typed refactor of analyze pipeline (`src/tools/analyze.ts`).
- Done: `d48ee8d` vector store embedding key injection via composition root (`src/infrastructure/adapters/voy_vector_store.ts`, `src/index.ts`, `__tests__/voy_vector_store.test.ts`).
- Done: `81d9a07` extracted `OpenAIEmbeddingClient` from `VoyVectorStore` (`src/infrastructure/adapters/openai_embedding_client.ts`, `src/infrastructure/adapters/voy_vector_store.ts`).
- Done: `8032b1f` extracted Voy persistence module for index/metadata load/save (`src/infrastructure/adapters/voy_persistence.ts`, `src/infrastructure/adapters/voy_vector_store.ts`).
- Done: `fc8ea51` extracted vector search/filter/sort service from `VoyVectorStore` (`src/infrastructure/adapters/voy_search_service.ts`, `src/infrastructure/adapters/voy_vector_store.ts`).
- Done: `c902999` strengthened quality gates (coverage thresholds, tool registry contract tests, release checklist) (`vitest.config.ts`, `__tests__/tool_registry_contract.test.ts`, `docs/release_checklist.md`, `CONTRIBUTING.md`).
- Done: `12d21be` extracted indexing service and migrated vector-store logs to structured logger (`src/infrastructure/adapters/voy_indexing_service.ts`, `src/infrastructure/adapters/voy_vector_store.ts`).
- Done: `3504052` tool registry schema tightening for `source`, `options`, and export payload shapes (`src/app/tool_registry.ts`).
- Done: `VoyVectorStore` decomposition baseline (embedding/persistence/search/indexing services extracted; env coupling removed).
- In progress: remaining tool-registry/public-schema alignment.

## Executive Summary
Overall health is moderate: the codebase has a working architecture direction (ports/adapters, schema-driven boundaries, broad tests), but key production-readiness gaps remain around contract consistency, module boundaries, and OSS documentation quality. The project can run and passes current verification, but should not be open-sourced in its current form without the P0 fixes below.

Biggest open-source readiness risks:
- Public contract drift and product naming inconsistency across runtime/docs.
- A large infrastructure class (`VoyVectorStore`) with mixed responsibilities and hard-coded provider coupling.
- Runtime schemas that are too permissive at public boundaries.
- Documentation inaccuracies that break onboarding and reduce trust.

## Strengths
- Clear baseline architecture docs and domain ports (`src/domain/ports/vector_store.ts`, `src/domain/ports/llm_client.ts`).
- Broad automated tests with passing CI (`.github/workflows/ci.yml`) and successful `npm run verify` execution.
- Good use of Zod for many tool inputs and shared schemas (`src/schemas/shared.ts`).
- Practical operational capabilities included early (circuit breaker, retries, storage diagnostics).

## Issues And Improvements

### P0 (Must fix before open-sourcing)

#### 1) Public contract and identity are inconsistent across runtime and docs
- Where:
  - `package.json:2`
  - `src/index.ts:25`
  - `README.md:36`
  - `README.md:81`
  - `docs/setup_guide.md:54`
  - `docs/architecture.md:16`
- Why it matters:
  - API/DX stability risk. Users cannot reliably configure clients when project name, command path, and tool naming conventions disagree.
- Recommended fix:
  - Choose one canonical identity (`ReviewRadar`) and one tool naming convention (`reviews_*` already implemented).
  - Update docs/examples and include a migration/compatibility section for any prior names.
  - Add a CI docs smoke-test that validates referenced commands and file paths exist.
- Example:
  - Before: `reviews.analyze(...)` in docs while server exposes `reviews_analyze`.
  - After: all docs/tool examples use `reviews_analyze`.

#### 2) `VoyVectorStore` violates SRP and inverts dependency direction
- Where:
  - `src/infrastructure/adapters/voy_vector_store.ts:10`
  - `src/infrastructure/adapters/voy_vector_store.ts:28`
  - `src/infrastructure/adapters/voy_vector_store.ts:56`
  - `src/infrastructure/adapters/voy_vector_store.ts:87`
- Why it matters:
  - Maintainability and testability risk. One class handles provider auth, embeddings, serialization, filesystem IO, indexing strategy, query filtering, and observability.
  - Hidden coupling to environment (`process.env`) bypasses composition root and prevents deterministic dependency injection.
- Recommended fix:
  - Extract modules:
    - `EmbeddingClient` (provider-specific)
    - `VectorIndexRepository` (voy serialize/deserialize)
    - `ReviewMetadataRepository` (metadata persistence)
    - `VectorSearchService` (query/filter/sort policy)
  - Inject provider key/config via `getConfig()` at composition root only.
- Example:
  - Before: `process.env.OPENAI_API_KEY` read inside adapter.
  - After: `new OpenAIEmbeddingClient({ apiKey, model, dimensions })` injected into store/service.

#### 3) Public tool schemas are too permissive for OSS API contracts
- Where:
  - `src/tools/export.ts:84`
  - `src/app/tool_registry.ts:17`
  - `src/app/tool_registry.ts:53`
- Why it matters:
  - Correctness and security hardening risk. `z.any()` and broad object schemas reduce contract guarantees and make silent data-shape breakages likely.
- Recommended fix:
  - Define strict request DTO schemas per tool using shared domain schemas.
  - Derive MCP `inputSchema` from the same canonical Zod schemas (single source of truth).
- Example:
  - Before: `reviews: z.array(z.any())`.
  - After: `reviews: z.array(AnalyzedReviewSchema)` (or explicit export schema variant).

#### 4) OSS docs contain broken/misleading setup instructions
- Where:
  - `docs/setup_guide.md:3` (references `docs/execution_plan.md` missing)
  - `docs/setup_guide.md:54` (`build/index.js` path is incorrect; output is `dist/index.js`)
  - `docs/setup_guide.md:67` (`npm run test:golden` missing from `package.json`)
  - `README.md:15` and `README.md:131` (encoding corruption / malformed section text)
- Why it matters:
  - First-run failure and credibility risk for external contributors.
- Recommended fix:
  - Correct all command/path references; remove references to missing scripts/files or add them.
  - Re-save docs as UTF-8 and add markdown lint in CI.

### P1 (Strongly recommended)

#### 5) Analyze pipeline is hard to evolve safely due to untyped flow and mixed responsibilities
- Where:
  - `src/tools/analyze.ts:56`
  - `src/tools/analyze.ts:60`
  - `src/tools/analyze.ts:77`
- Why it matters:
  - Maintainability risk. Business orchestration, LLM prompting/parsing, metrics, and response shaping are interleaved; `any` weakens type invariants.
- Recommended fix:
  - Split into:
    - `analyzeOrchestrator`
    - `classifyReviewWithRules`
    - `classifyReviewWithLlm`
    - `mergeClassification`
    - `buildAnalyzeResponse`
  - Replace `any` with typed DTOs and discriminated unions for stage outputs.

#### 6) Logging strategy is not production-grade
- Where:
  - `src/tools/analyze.ts:166`
  - `src/tools/safety_alerts.ts:57`
  - `src/infrastructure/adapters/voy_vector_store.ts:63`
- Why it matters:
  - Observability and operability risk. Unstructured logs are hard to query and redact at scale.
- Recommended fix:
  - Introduce a logger abstraction (level, fields, request/tool correlation ID, redaction policy).
  - Emit structured events for retries, fallback activation, indexing checkpoints, and tool latency.

#### 7) Config surface is partially unused and inconsistent
- Where:
  - `src/utils/config.ts:35`
  - `src/tools/analyze.ts:15`
  - `src/engine/llmClient.ts:20`
- Why it matters:
  - Reliability and operator confusion risk. Budget fields exist but are not enforced in runtime path; model defaults are scattered.
- Recommended fix:
  - Centralize runtime policy config (models, concurrency, retry, budget, timeout).
  - Enforce budget at orchestration layer and expose deterministic metadata when requests are short-circuited.

#### 8) Export/reply tools need stricter domain boundaries
- Where:
  - `src/tools/export.ts:51`
  - `src/tools/reply.ts:1`
- Why it matters:
  - API stability and extensibility risk. Tool logic combines domain transformation and transport-specific rendering in one file.
- Recommended fix:
  - Move pure domain formatters to `src/domain/services/reporting/*`.
  - Keep tool files as thin adapters (parse -> call service -> format response envelope).

#### 9) Coverage thresholds are low for a library-style OSS server
- Where:
  - `vitest.config.ts:17`
- Why it matters:
  - Regression risk during external contributions.
- Recommended fix:
  - Raise global minimums over phases (e.g., lines/statements 80+, branches 70+, functions 85+) while keeping per-file gating.
  - Add contract tests for `tool_registry` + dispatcher behavior.

### P2 (Nice-to-have)

#### 10) Add explicit API versioning and deprecation policy
- Where:
  - `src/index.ts:26`
  - `CHANGELOG.md:1`
- Why it matters:
  - Open-source lifecycle risk when introducing breaking tool/schema changes.
- Recommended fix:
  - Document SemVer policy, deprecation window, and migration notes template.

#### 11) Improve data model cohesion for analytics tools
- Where:
  - `src/tools/top_issues.ts`
  - `src/tools/segment_breakdown.ts`
  - `src/tools/time_trends.ts`
- Why it matters:
  - Maintainability risk as analytics surface expands.
- Recommended fix:
  - Consolidate shared aggregation primitives under `src/analytics/` and keep tool wrappers thin.

## Proposed Target Architecture

```text
src/
  app/
    mcp_server.ts
    tool_dispatcher.ts
    tool_registry.ts
  domain/
    models/
      review.ts
      analysis.ts
      alerts.ts
    ports/
      llm_client.ts
      embedding_client.ts
      vector_store.ts
      logger.ts
    services/
      analyze/
        orchestrator.ts
        classify_rules.ts
        classify_llm.ts
        response_builder.ts
      safety/
        alerts_service.ts
      reporting/
        markdown_exporter.ts
        jira_exporter.ts
  infrastructure/
    adapters/
      llm/
        anthropic_client.ts
        openai_client.ts
      embeddings/
        openai_embeddings.ts
      vector/
        voy_index_repository.ts
        metadata_repository.ts
        voy_vector_store.ts
      logging/
        pino_logger.ts
  tools/
    analyze.ts
    import.ts
    search.ts
    summarize.ts
    export.ts
    reply.ts
  schemas/
    requests/
    responses/
    shared.ts
  utils/
    config.ts
    redact.ts
```

## Incremental Refactor Plan (Safe, phased)

### Phase 1: Contract and Docs Stabilization
- Changes:
  - Unify naming/product identity.
  - Fix setup docs, scripts references, and encoding issues.
  - Add docs validation in CI.
- Validate:
  - `npm run verify`
  - `npm run build`
  - Smoke test MCP startup command from docs.
- Risk level: Low
- Rollback strategy:
  - Revert docs/registry-only commits; runtime behavior unchanged.

### Phase 2: Schema Hardening at Tool Boundaries
- Changes:
  - Replace permissive schemas with strict DTOs.
  - Reuse shared schemas between registry and runtime parser.
- Validate:
  - `npm run test`
  - Add negative tests for malformed payloads per tool.
- Risk level: Medium
- Rollback strategy:
  - Keep compatibility adapter for previous payload shape behind temporary flag/versioned parser.

### Phase 3: Vector Store Decomposition
- Changes:
  - Extract embedding/persistence/search components.
  - Inject config and providers from composition root.
- Validate:
  - `npm run test -- __tests__/voy_vector_store.test.ts`
  - `npm run verify`
- Risk level: High
- Rollback strategy:
  - Preserve existing adapter behind `LegacyVoyVectorStore`; feature-toggle to swap implementation.

### Phase 4: Analyze Pipeline Refactor
- Changes:
  - Split orchestration from classification/merge/response mapping.
  - Remove `any` from runtime path.
- Validate:
  - `npm run test -- __tests__/analyze.test.ts __tests__/analytics_integration.test.ts`
  - `npm run verify`
- Risk level: Medium
- Rollback strategy:
  - Keep old `analyzeReviewsTool` wrapper delegating to legacy path until parity tests pass.

### Phase 5: Observability + Reliability Baseline
- Changes:
  - Structured logger abstraction.
  - Centralized timeout/retry/budget policy config.
- Validate:
  - Unit tests for policy enforcement and fallback metadata.
  - Integration test for degraded mode behavior.
- Risk level: Medium
- Rollback strategy:
  - Logger shim can route back to `console` without changing domain logic.

### Phase 6: OSS Quality Gates
- Changes:
  - Add markdown lint, optional ESLint, stricter coverage thresholds, release checklist.
- Validate:
  - CI green on pull requests.
- Risk level: Low
- Rollback strategy:
  - Loosen thresholds temporarily; keep checks non-blocking until stabilized.

## Dependency Inversion Opportunities
- Replace direct OpenAI embedding dependency inside vector store with `EmbeddingClient` port.
- Replace direct logging calls with `Logger` port.
- Move provider/model defaults out of tools and into centralized runtime policy config.

## Backwards Compatibility Strategy
- Keep existing tool names stable (`reviews_*`) while introducing stricter schemas via tolerant parser window.
- Version response metadata (`schema_version`) when fields are added/removed.
- Publish migration notes in `CHANGELOG.md` for each contract change.

## Coding Standard Baseline For OSS
- Formatting/linting:
  - Keep TypeScript strict mode.
  - Add ESLint (`@typescript-eslint`) and markdown lint.
  - Keep Prettier optional but enforce one formatter in CI.
- Error handling conventions:
  - Domain errors only via `AppError` variants with typed `details`.
  - No raw provider errors crossing tool boundary.
- Logging strategy:
  - Structured JSON logs with severity, tool name, correlation ID, and redacted fields.
- Type safety strategy:
  - Ban runtime `any` in `src/**`.
  - Use discriminated unions for pipeline stage results.
- Testing strategy and coverage targets:
  - Unit tests for all domain services.
  - Contract tests for every tool input/output schema.
  - Coverage target: lines/statements >= 80, branches >= 70, functions >= 85.
- Documentation expectations:
  - README quickstart must be copy-paste valid.
  - Architecture + setup docs must reference existing files/scripts only.
  - Maintain API/tool reference table with examples.

## Review Checklist Mapping
- API design: mostly clear, but contract inconsistencies and permissive schemas are blocking.
- Architecture: promising layering, but major cohesion/coupling issue in vector adapter.
- Correctness: generally solid; needs stronger schema enforcement and deterministic contract tests.
- Security: PII redaction exists; improve boundary strictness and logging redaction guarantees.
- Performance: batching/concurrency present; decomposition needed for tunable hot paths.
- Reliability: retries/circuit breaker exist; policy centralization and timeout/budget enforcement are incomplete.
- Observability: logs exist but are unstructured and dispersed.
- Testability: good baseline; stronger contract tests and reduced `any` needed.
- DX: CI and docs exist but contain onboarding-breaking drift.
- Open-source readiness: license/contributing/security files exist; release/versioning and docs quality need hardening.

## Validation Snapshot
- Executed: `npm run verify`
- Result: pass (`27` test files, `95` tests).
- Current residual risk despite green tests: several P0 items are contract/docs/module-boundary quality issues not fully covered by existing tests.
