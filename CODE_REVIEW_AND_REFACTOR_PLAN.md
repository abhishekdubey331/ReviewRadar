# CODE REVIEW AND REFACTOR PLAN

## Prioritized TODO
1. **P0:** Fix provider/config bootstrapping and dependency direction so runtime behavior is deterministic and testable (`src/index.ts`, `src/tools/analyze.ts`, `src/utils/config.ts`).
2. **P0:** Fix data correctness bug in App Store scraping timestamps and harden scraper failure handling (`scripts/scrape.js`).
3. **P0:** Replace untyped error and input handling in dispatch/runtime boundary with explicit schemas and typed `AppError` mapping (`src/app/tool_dispatcher.ts`, `src/index.ts`).
4. **P1:** Decouple infrastructure from process CWD and convert sync file I/O hotspots to async or isolated persistence service (`src/infrastructure/adapters/voy_vector_store.ts`).
5. **P1:** Tighten import/analyze contracts, remove dead options, and report dropped rows explicitly (`src/tools/import.ts`, `src/tools/analyze.ts`).
6. **P1:** Raise OSS baseline quality: lint/format stack, CI gates, and coverage thresholds for critical modules (`package.json`, `vitest.config.ts`, `.github/workflows/ci.yml`).
7. **P1:** Fix README quality and branding inconsistencies for public consumers (`README.md`, `package.json`, `src/index.ts`).
8. **P2:** Introduce structured logging and observability hooks with consistent event schema (`src/tools/analyze.ts`, `src/infrastructure/adapters/voy_vector_store.ts`).
9. **P2:** Refine architecture docs to match actual stateful index behavior and runtime model (`docs/architecture.md`).

## Executive Summary
Overall health is **good for an internal prototype** and **not yet open-source production grade**.

The repository has strong test breadth and clear feature intent, but there are critical issues in runtime composition, typing boundaries, and data correctness that can create non-obvious failures for external adopters. The largest risks are:
- Ambiguous and coupled provider/config initialization paths.
- Untyped request/response boundary handling in the MCP server.
- Scraper correctness and reliability gaps.
- Portability and maintainability problems from process-global assumptions (`process.cwd()`, sync I/O, constructor side effects).

Readiness to open-source today: **Conditional / not recommended until P0 items are fixed.**

## Strengths
- Good test coverage breadth with integration chaining for core flows (`__tests__/analytics_integration.test.ts`, `__tests__/tool_dispatcher.test.ts`).
- Clear domain concepts and early port abstractions (`src/domain/ports/llm_client.ts`, `src/domain/ports/vector_store.ts`).
- Solid baseline schema usage via Zod for tool inputs (`src/schemas/shared.ts`).
- Circuit breaker and retry patterns are present and give a foundation for resiliency (`src/engine/circuitBreaker.ts`, `src/engine/llmClient.ts`).
- OSS scaffolding exists (license, CoC, contributing, security policy).

## Issues and Improvements

### P0 (Must fix before open-sourcing)

#### P0-1: Runtime/provider wiring is inconsistent and breaks dependency direction
- Where:
  - `src/index.ts:14`
  - `src/tools/analyze.ts:35`
  - `src/app/tool_dispatcher.ts:37`
- Why it matters:
  - `analyzeReviewsTool` constructs its own `ConcurrentLLMClient` instead of using injected dependencies, bypassing dispatcher DI and making behavior non-deterministic and harder to test/mock.
  - Provider selection logic is duplicated and inconsistent across entrypoints.
  - This increases correctness risk and makes long-term maintenance expensive.
- Recommended fix:
  - Inject `ILLMClient` into `analyzeReviewsTool` the same way summarize/reply are handled.
  - Create one composition root in `src/index.ts` that builds runtime dependencies exactly once.
  - Move provider/config selection to a single `RuntimeConfig`/factory module.
- Example (before/after):

```ts
// before
case "reviews_analyze":
  return asTextResponse(await analyzeReviewsTool(args, vectorStore));

// after
case "reviews_analyze":
  return asTextResponse(await analyzeReviewsTool(args, { vectorStore, llmClient }));
```

- Validation:
  - `npm run test -- __tests__/analyze.test.ts __tests__/tool_dispatcher.test.ts`
  - `npm run verify`
- Risk level: **Medium**
- Rollback strategy:
  - Keep old overload signature temporarily; if regressions appear, route analyze back to old signature while retaining new tests.

#### P0-2: Config module has process-exit side effects and weak library behavior
- Where:
  - `src/utils/config.ts:69`
  - `src/utils/config.ts:81`
- Why it matters:
  - `process.exit(1)` in utility code is unsafe in a reusable OSS package and makes integration testing brittle.
  - Hard exits block host-level error handling and can terminate parent processes unexpectedly.
- Recommended fix:
  - Replace `process.exit` with throwing a typed `AppError` (`INVALID_SCHEMA` or `INTERNAL_CONFIG`).
  - Handle fatal startup errors only in `src/index.ts` composition root.
- Validation:
  - Add tests asserting `getConfig()` throws typed errors instead of exiting (`__tests__/config.test.ts`).
  - `npm run verify`
- Risk level: **Low**
- Rollback strategy:
  - Reintroduce temporary adapter in `index.ts` that maps thrown config errors to previous behavior.

#### P0-3: MCP boundary is weakly typed and loses error semantics
- Where:
  - `src/index.ts:32`
  - `src/index.ts:35`
  - `src/app/tool_dispatcher.ts:28`
  - `src/app/tool_dispatcher.ts:80`
- Why it matters:
  - `any` request args and generic `new Error("Tool not found")` hide contract violations and reduce actionable diagnostics for users.
  - Public OSS users need stable and explicit error contracts.
- Recommended fix:
  - Define typed tool-call request DTO and discriminated error mapping.
  - Throw `createError("INVALID_SCHEMA" | "INTERNAL" ...)` consistently.
  - Add tests for unknown tool and malformed args at dispatcher boundary.
- Validation:
  - `npm run test -- __tests__/tool_dispatcher.test.ts __tests__/errors.test.ts`
- Risk level: **Low**
- Rollback strategy:
  - Keep compatibility layer that maps `AppError` to current MCP response shape.

#### P0-4: App Store scraping timestamp logic is incorrect
- Where:
  - `scripts/scrape.js:66`
- Why it matters:
  - `date: review.url ? new Date().toISOString() : new Date().toISOString()` always writes “now”, corrupting temporal analytics and trend accuracy.
- Recommended fix:
  - Map to real review timestamp field from `app-store-scraper`; fallback only when field absent.
  - Add parser guardrails and unit tests around date extraction.
- Validation:
  - Add scraper unit tests for both stores.
  - Run `npm run scrape` with a known app and inspect generated CSV dates.
- Risk level: **Low**
- Rollback strategy:
  - Feature flag date-normalization path and revert to prior behavior only if source API schema unexpectedly differs.

### P1 (Strongly recommended)

#### P1-1: Storage path portability relies on `process.cwd()`
- Where:
  - `src/infrastructure/adapters/voy_vector_store.ts:10`
- Why it matters:
  - MCP hosts often launch with arbitrary CWD; index files may be written to unexpected locations.
- Recommended fix:
  - Introduce explicit storage root config (`REVIEWRADAR_STORAGE_DIR`) with deterministic default from project/runtime root.
  - Pass storage path via constructor dependency.
- Validation:
  - Add tests for path resolution with mocked cwd/env.
- Risk level: **Medium**
- Rollback strategy:
  - Keep CWD fallback for one minor release with deprecation warning.

#### P1-2: Synchronous file I/O in hot paths harms scalability
- Where:
  - `src/infrastructure/adapters/voy_vector_store.ts:72`
  - `src/infrastructure/adapters/voy_vector_store.ts:106`
  - `src/tools/import.ts:65`
- Why it matters:
  - Blocking I/O pauses event loop and degrades concurrency under large imports.
- Recommended fix:
  - Migrate to `fs/promises` and isolate persistence in a repository/service module.
- Validation:
  - Existing tests + stress test importing large dataset.
- Risk level: **Medium**
- Rollback strategy:
  - Keep old sync implementation behind an adapter while async path stabilizes.

#### P1-3: Import flow silently drops invalid records and mislabels metrics
- Where:
  - `src/tools/import.ts:97`
  - `src/tools/import.ts:129`
- Why it matters:
  - Invalid schema rows are silently skipped; metric `filtered_spam` conflates spam with invalid rows/duplicates.
  - This damages trust in analytics.
- Recommended fix:
  - Track counters separately: `duplicates_dropped`, `invalid_rows_dropped`, `spam_dropped`.
  - Return structured diagnostics in metadata.
- Validation:
  - Extend `__tests__/import.test.ts` with mixed invalid/duplicate samples.
- Risk level: **Low**
- Rollback strategy:
  - Keep old metadata fields while adding new fields; deprecate old naming later.

#### P1-4: Dead options and contract drift in analyze/import interfaces
- Where:
  - `src/tools/analyze.ts:33`
  - `src/tools/import.ts:10`
- Why it matters:
  - `analyze` passes `options: { max_reviews: 20000 }` to import, but import schema ignores it.
  - Signals weak API discipline and confuses maintainers.
- Recommended fix:
  - Remove dead options now or add explicit schema support plus tests.
- Validation:
  - `npm run test -- __tests__/analyze.test.ts __tests__/import.test.ts`
- Risk level: **Low**
- Rollback strategy:
  - Temporarily accept deprecated option with warning before removal.

#### P1-5: OSS DX quality issues in README and naming consistency
- Where:
  - `README.md:15`
  - `README.md:123`
  - `package.json:2`
  - `src/index.ts:18`
- Why it matters:
  - Mojibake/encoding artifacts and mixed product names reduce trust for first-time adopters.
- Recommended fix:
  - Rewrite README in clean UTF-8, align product naming (`ReviewRadar`), and ensure commands/config examples match current repo.
- Validation:
  - Manual docs pass from clean clone: install -> build -> test -> connect MCP client.
- Risk level: **Low**
- Rollback strategy:
  - Docs-only revert commit.

#### P1-6: Linting baseline is too weak for OSS maintenance
- Where:
  - `package.json:12`
  - `vitest.config.ts:19`
- Why it matters:
  - `lint` is only `tsc --noEmit`; coverage thresholds are low for critical runtime modules.
- Recommended fix:
  - Add ESLint + Prettier + import/order/type rules.
  - Raise thresholds progressively, with strict gates on core modules (`src/app`, `src/engine`, `src/infrastructure`).
- Validation:
  - CI green with new lint + coverage gates.
- Risk level: **Medium**
- Rollback strategy:
  - Start in warn mode for one release and then enforce.

### P2 (Nice-to-have)

#### P2-1: Logging is unstructured and inconsistent
- Where:
  - `src/tools/analyze.ts:160`
  - `src/infrastructure/adapters/voy_vector_store.ts:114`
- Why it matters:
  - String logs without fields are hard to aggregate and alert on in production.
- Recommended fix:
  - Add logger interface (`info/warn/error(event, fields)`) and inject implementation.
- Validation:
  - Unit tests for emitted event shape.
- Risk level: **Low**
- Rollback strategy:
  - Keep console adapter implementing new interface.

#### P2-2: Architecture doc mismatches real state model
- Where:
  - `docs/architecture.md:43`
- Why it matters:
  - Doc says “0 MB state between requests” while vector index persists to disk.
- Recommended fix:
  - Update docs to describe persisted storage and lifecycle clearly.
- Validation:
  - Architecture doc review in PR checklist.
- Risk level: **Low**
- Rollback strategy:
  - Docs-only revert.

## Proposed Target Architecture

### Module layout
```text
src/
  app/
    server.ts                # MCP transport + handlers only
    tool_registry.ts         # tool metadata only
    dispatcher.ts            # route name -> application service
  application/
    tools/
      analyze_reviews.ts     # orchestrates use-cases
      import_reviews.ts
      summarize_reviews.ts
    dto/
      tool_inputs.ts
      tool_outputs.ts
  domain/
    models/
      review.ts
      classification.ts
    services/
      rules_engine.ts
      routing_policy.ts
    ports/
      llm_client.ts
      vector_store.ts
      logger.ts
      clock.ts
  infrastructure/
    llm/
      anthropic_client.ts
      openai_client.ts
      llm_factory.ts
    vector/
      voy_vector_store.ts
      vector_store_persistence.ts
    logging/
      console_logger.ts
  config/
    runtime_config.ts
    env_loader.ts
  index.ts                   # composition root only
```

### Dependency direction
- `app -> application -> domain`
- `infrastructure -> domain (implements ports)`
- `domain` has zero dependency on MCP SDK, OpenAI SDK, filesystem, or process globals.

### Dependency inversion opportunities
- Inject `ILLMClient`, `IVectorStore`, `Logger`, `Clock`, and `IdGenerator` into use-cases.
- Separate pure classification logic from side-effect orchestration for deterministic unit tests.

## Incremental Refactor Plan (Safe, Minimal Breakage)

### Phase 1: Stabilize runtime boundary (P0)
- Changes:
  - Introduce typed runtime config and error mapping.
  - DI for `analyzeReviewsTool`; remove internal client construction.
  - Fix scraper timestamp extraction.
- Validation:
  - `npm run test -- __tests__/analyze.test.ts __tests__/tool_dispatcher.test.ts __tests__/config.test.ts`
  - `npm run verify`
- Risk: **Medium**
- Rollback:
  - Keep compatibility adapters/signatures and gate behavior with temporary feature flags.

### Phase 2: Harden contracts and observability (P1)
- Changes:
  - Separate dropped-row metrics in import.
  - Add structured error codes for unknown tool/schema failures.
  - Standardize response DTOs and remove `any` from dispatcher boundary.
- Validation:
  - `npm run test -- __tests__/import.test.ts __tests__/errors.test.ts __tests__/tool_dispatcher.test.ts`
- Risk: **Low**
- Rollback:
  - Preserve existing output fields while adding new fields.

### Phase 3: Infrastructure decoupling (P1)
- Changes:
  - Configurable storage directory.
  - Async persistence abstraction for vector metadata/index.
- Validation:
  - `npm run test -- __tests__/voy_vector_store.test.ts`
  - manual import/search smoke test.
- Risk: **Medium**
- Rollback:
  - Keep legacy sync persistence path behind adapter toggle.

### Phase 4: OSS quality baseline (P1/P2)
- Changes:
  - Add ESLint + Prettier + CI gates.
  - Raise coverage thresholds for critical modules.
  - Rewrite README and align naming/versioning docs.
- Validation:
  - clean clone onboarding test and CI run.
- Risk: **Low**
- Rollback:
  - Split into docs/tooling-only commits for isolated revert.

## Backwards Compatibility Strategy
- Keep MCP tool names and top-level response shape stable for now.
- Add fields additively; avoid field removal until next semver major.
- Provide deprecation warnings in diagnostics for one minor release before removing old options.
- Publish migration notes in `CHANGELOG.md` for any behavior-impacting changes (routing thresholds, metadata semantics, persistence paths).

## Coding Standard Baseline for Open Source

### Formatting and linting
- `typescript-eslint` with strict rules (`no-explicit-any`, `no-floating-promises`, `consistent-type-imports`).
- `prettier` for formatting with CI enforcement.
- Optional: `eslint-plugin-import` and `eslint-plugin-unicorn` for consistency.

### Error handling conventions
- Use typed `AppError` only at app boundary.
- Domain/application layers return typed results or throw typed errors; no `process.exit` outside composition root.
- Ensure every thrown error maps to stable MCP error payload.

### Logging strategy
- Structured logs with event names and fields (`event`, `tool`, `duration_ms`, `record_count`, `error_code`).
- No raw user content in logs; include IDs/counts only.

### Type safety strategy
- Eliminate `any` at tool boundaries.
- Centralize Zod schemas for inputs/outputs and infer TS types from schemas.

### Testing strategy and coverage targets
- Unit tests for pure domain logic.
- Integration tests for tool orchestration paths.
- Coverage target recommendation:
  - Global: lines/statements >= 80, branches >= 70.
  - Critical modules (`src/app`, `src/engine`, `src/infrastructure`): lines >= 85, branches >= 75.

### Documentation expectations
- README: accurate quickstart from clean clone, environment matrix, example MCP config.
- `docs/architecture.md`: updated dependency boundaries and persistence model.
- `CONTRIBUTING.md`: PR checklist requiring validation commands and migration notes.

## Checklist Assessment
- API design: **Needs improvement** (contract drift, weak typed boundary).
- Architecture: **Partially strong** (ports exist, but dependency inversion not consistently applied).
- Correctness: **Moderate risk** (scraper timestamp bug, silent row drops).
- Security: **Acceptable baseline** (secret handling mostly okay), but improve error/log redaction discipline.
- Performance: **Moderate risk** (sync I/O + potential large dataset event-loop blocking).
- Reliability: **Foundation exists** (retry/circuit breaker), needs clearer failure semantics.
- Observability: **Weak** (string logs, no structured events/metrics hooks).
- Testability: **Good baseline**, improve with DI consistency and stricter boundary typing.
- DX: **Mixed** (CI exists, docs quality/naming inconsistency hurts onboarding).
- Open-source readiness: **Close but not ready** until P0 fixes land.

## Current Validation Snapshot
- Command run: `npm run verify`
- Result: **Pass** (`tsc --noEmit`, `vitest run --coverage`, 81 tests passing)
- Note: passing tests do not currently cover all runtime boundary and OSS-DX concerns above.
