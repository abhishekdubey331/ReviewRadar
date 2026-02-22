# CODE_REVIEW_AND_REFACTOR_PLAN

## Prioritized TODO (Re-ranked)
1. [x] **Mandatory (Blocker)** Fix provider wiring vs README contract (`OPENAI_API_KEY` vs `ANTHROPIC_API_KEY`) so supported configurations actually boot.
2. [x] **High (Pre-release recommended, not strict blocker)** Remove config import-time side effects and stop env override at module load.
3. [x] **High (Pre-release recommended, not strict blocker)** Replace monolithic dispatcher switch with registry-based handlers.
4. [x] **High (Pre-release recommended, not strict blocker)** Add request-scoped observability fields (`request_id`, `tool_name`, `phase`, `error_class`).
5. [ ] **Medium** Decompose `analyze.ts` and `voy_vector_store.ts` into smaller cohesive modules.
6. [ ] **Medium** Enforce MCP schema/runtime parser parity tests for all tools.
7. [ ] **Medium** Redact runtime diagnostics by default; expose detailed paths only in explicit debug mode.
8. [ ] **Low** Strengthen OSS package metadata (`engines`, `exports`, `files`).
9. [ ] **Low** Add smoke tests for entrypoint/scripts.

## Executive Summary
The codebase is in good shape and already close to open-source readiness. After re-review, only **one item is truly mandatory before open-sourcing**: runtime behavior must match the public README capability contract.

Most other items are important for maintainability and operations quality, but they are not strict blockers for publishing if you are comfortable shipping v1 with known technical debt.

## Status Update (2026-02-22)
- Completed mandatory + high-priority implementation items:
  - Provider boot behavior no longer fails at startup for Anthropic-only environments; embedding-dependent flows fail lazily with explicit runtime error.
  - Config loading is now explicit (`loadEnv`) and no longer overrides host env at module import.
  - `dispatchToolCall` is now registry-based rather than a monolithic switch.
  - Dispatcher/server logs now include request-scoped observability fields (`request_id`, `tool_name`, `phase`, `error_class` in failure paths).
- Validation:
  - `npm run verify` passed (lint + tests + coverage).

## What Is Truly Mandatory?

### Blocker Before Open-Sourcing

#### B1: Provider contract mismatch (Mandatory)
- Where: `README.md`, `src/index.ts`, `src/infrastructure/adapters/openai_embedding_client.ts`, `src/engine/llmClient.ts`
- Why mandatory: this is a correctness + trust issue. Public docs state one behavior, runtime enforces another.
- Release criterion:
  - Either support Anthropic-only startup as documented, or
  - update README to explicitly require OpenAI key for import/search.
- Validation:
  - Test matrix: OpenAI-only, Anthropic-only, both keys, no keys.
- Risk: Medium
- Rollback: keep legacy bootstrap behind feature flag for one minor release.

## Strongly Recommended (Not Strict Blockers)

### R1: Config side effects at import time
- Where: `src/utils/config.ts`
- Why: integration fragility and hidden behavior (`dotenv override`) in host processes.
- Recommendation: move env loading to explicit bootstrap, default `override: false`.
- Risk: Medium
- Rollback: fallback to old loader via env flag.

### R2: Dispatcher monolith
- Where: `src/app/tool_dispatcher.ts`
- Why: maintainability and scale risk.
- Recommendation: registry-based routing, isolate response mapping.
- Risk: Medium
- Rollback: adapter preserving old switch contract.

### R3: Observability lacks correlation context
- Where: `src/utils/logger.ts` + call sites
- Why: slower incident triage.
- Recommendation: enforce request context fields.
- Risk: Low
- Rollback: keep old logger fields backward-compatible.

## Nice-to-Have / Follow-up
- Decompose `src/tools/analyze.ts` and `src/infrastructure/adapters/voy_vector_store.ts`.
- Add schema parity enforcement between `src/app/tool_registry.ts` and runtime Zod schemas.
- Gate detailed diagnostics in `reviews_diagnose_runtime` behind debug mode.
- Add package publish hardening and script/entrypoint smoke tests.

## Strengths
- Strong test baseline and CI gate (`npm run verify` passing).
- Clear architecture intent and good use of ports/adapters.
- Solid validation and reliability patterns (retry, circuit breaker, fallbacks).
- OSS governance files already present.

## Proposed Target Architecture

```text
src/
  app/
    bootstrap.ts
    server.ts
  interfaces/mcp/
    tool_registry.ts
    tool_router.ts
    response_mapper.ts
  usecases/
    import_reviews/
    analyze_reviews/
    search_reviews/
  domain/
    models/
    ports/
  infrastructure/
    llm/
    embeddings/
    vector/
    logging/
  shared/
    config/
    errors/
    validation/
```

Dependency direction:
- `interfaces -> usecases -> domain`
- `infrastructure` implements `domain/ports`
- `app/bootstrap` is the composition root

## Incremental Plan (with Validation, Risk, Rollback)

### Phase 1: Mandatory correctness
- Scope: fix provider capability contract mismatch.
- Validate: provider matrix tests + `npm run verify`.
- Risk: Medium.
- Rollback: feature-flagged legacy boot path.

### Phase 2: Pre-release hardening
- Scope: explicit env bootstrap, dispatcher registry, request correlation logging.
- Validate: `npm run test -- __tests__/config.test.ts __tests__/tool_dispatcher.test.ts` + `npm run verify`.
- Risk: Medium.
- Rollback: compatibility adapter + old env loader fallback.

### Phase 3: Maintainability refactors
- Scope: split large modules, schema parity tests, diagnostics gating.
- Validate: focused suites (`analyze`, `voy_vector_store`, contract tests) + `npm run verify`.
- Risk: Medium.
- Rollback: preserve existing public interfaces while swapping internals.

### Phase 4: OSS polish
- Scope: package metadata hardening and smoke tests.
- Validate: `npm pack --dry-run`, clean-clone CI, `npm run verify`.
- Risk: Low.
- Rollback: revert metadata/scripts without API changes.

## Backwards Compatibility Strategy
- Keep existing MCP tool names and response envelope stable.
- Version breaking I/O changes and support deprecated aliases for at least one minor release.
- Add contract tests to prevent accidental tool/shape drift.

## Coding Standard Baseline
- Linting: `tsc --noEmit` + ESLint (`@typescript-eslint`, import/order, no-floating-promises).
- Errors: typed `AppError` for operational failures, normalized `error_class` taxonomy.
- Logging: structured JSON + correlation fields on warn/error logs.
- Types: avoid `any` on runtime paths; explicit boundary DTOs.
- Testing: keep coverage gates, add provider-matrix and startup smoke tests.
- Docs: README must match actual runtime behavior exactly.
