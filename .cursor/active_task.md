# Active Task: Replace process.exit() with throw + upgrade silent console.warn
**Status:** Implementation
**Rollback Anchor:** `ea46a6a`
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** Fix 2 bugs: (1) `process.exit(1)` inside `pipeline.run()` bypasses SDK cleanup (pool.end, finally blocks), orphaning DB connections. (2) Quality scripts use bare `console.warn` instead of `pipeline.log.warn` for pipeline_runs insert failures, losing structured observability.
* **Target Spec:** `docs/specs/00_engineering_standards.md` §9.4 (Pipeline SDK), `docs/specs/37_pipeline_system.md`
* **Key Files:**
  - `scripts/load-wsib.js` — lines 78, 84: `process.exit(1)` → `throw`
  - `scripts/load-permits.js` — line 408: `process.exit(1)` → `throw`
  - `scripts/load-coa.js` — line 346: `process.exit(1)` → `throw`
  - `scripts/reclassify-all.js` — lines 29, 153: `process.exit(1)` → `throw` / `process.exitCode`
  - `scripts/quality/assert-data-bounds.js` — line 44: `console.warn` → `pipeline.log.warn`
  - `scripts/quality/assert-schema.js` — line 205: `console.warn` → `pipeline.log.warn`
  - `scripts/quality/assert-engine-health.js` — line 48: `console.warn` → `pipeline.log.warn`

## Technical Implementation
* **Bug 1:** Replace `process.exit(1)` with `throw new Error(...)` inside `pipeline.run()` callbacks so the SDK can catch, log, and cleanly release the pool. For `reclassify-all.js` (not SDK-wrapped), convert inner exit to throw (caught by outer try) and top-level exit to `process.exitCode = 1`.
* **Bug 2:** Replace bare `console.warn` with `pipeline.log.warn` in 3 quality scripts for structured logging consistency.
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** Errors now thrown into pipeline.run's catch boundary instead of bypassing it
* **Unhappy Path Tests:** N/A — script error handling, not testable via vitest
* **logError Mandate:** N/A — scripts use pipeline.log, not src/ logError
* **Mobile-First:** N/A

## §10 Plan Compliance Checklist

### If Pipeline Script Created/Modified:
- [x] Uses Pipeline SDK: all modified scripts already use `pipeline.run` (§9.4)
- [x] No new streaming ingestion changes (§9.5)

### Other categories:
- ⬜ DB — N/A
- ⬜ API — N/A
- ⬜ UI — N/A
- ⬜ Shared Logic — N/A

## Execution Plan
- [ ] **Rollback Anchor:** `ea46a6a`
- [ ] **State Verification:** Confirmed `process.exit(1)` in 4 scripts inside pipeline.run; confirmed `console.warn` in 3 quality scripts
- [ ] **Spec Review:** §9.4 mandates pipeline SDK lifecycle; process.exit bypasses it
- [ ] **Reproduction:** Confirmed via grep
- [ ] **Red Light:** N/A — script infrastructure, not testable via vitest
- [ ] **Fix:**
  1. `load-wsib.js` — 2 process.exit → throw
  2. `load-permits.js` — 1 process.exit → throw
  3. `load-coa.js` — 1 process.exit → throw
  4. `reclassify-all.js` — throw + process.exitCode
  5. 3 quality scripts — console.warn → pipeline.log.warn
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
