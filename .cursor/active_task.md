# Active Task: WF3 — Permanent Chaos Tests in CI Suite
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `6b26842`

## Context
* **Goal:** Convert the 4 manual chaos tests into permanent automated tests that prevent regressions.
* **Target Spec:** `docs/specs/00_engineering_standards.md`
* **Key Files:** `src/tests/pipeline-sdk.logic.test.ts`, `src/tests/chain.logic.test.ts`

## Bug
Chaos tests A-D were run manually and passed, but there are no automated tests to prevent future regressions of these defenses.

## Test Plan

### Test A (Linter Guard): Feed bad code strings to ESLint programmatically
- Load `eslint.config.mjs` and run ESLint API on inline bad code
- Assert `new Pool()`, `new pg.Pool()`, `process.exit()` produce warnings
- If someone weakens the linter rules, this test fails

### Test B (Pre-Flight Gate): Pure logic test for bloat gate
- Already partially exists (threshold logic test). Add: verify run-chain.js source contains Phase 0 audit_table with sys_db_bloat metrics and ABORT path

### Test C (Telemetry Intercept): Assert emitSummary auto-injection
- Already exists (7 tests from this session). Verify they cover: sys_* always present, err_*/dq_* opt-in, append-don't-replace, namespace isolation

### Test D (Memory Squeeze): Verify streamQuery is async generator with destroy
- Already partially exists. Add: verify streamQuery yields rows without buffering (mock stream test)

## Execution Plan
- [ ] **Reproduction:** Identify which tests already exist vs need adding
- [ ] **Red Light:** New tests fail
- [ ] **Fix:** Add missing tests
- [ ] **Green Light:** All pass
