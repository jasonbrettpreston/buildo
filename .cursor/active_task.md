# Active Task: Fix 21 verified bugs across pipeline scripts
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `0e8e357`

## Context
* **Goal:** Fix all 21 confirmed bugs found by WF5 audit of `scripts/` folder. Bugs span quality gates, classifiers, linkers, and analysis scripts.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`, `docs/specs/00_engineering_standards.md` §9
* **Key Files:**
  - `scripts/quality/assert-staleness.js`
  - `scripts/quality/assert-network-health.js`
  - `scripts/quality/assert-schema.js`
  - `scripts/quality/assert-engine-health.js`
  - `scripts/quality/assert-data-bounds.js`
  - `scripts/quality/assert-pre-permit-aging.js`
  - `scripts/classify-permits.js`
  - `scripts/classify-scope.js`
  - `scripts/reclassify-all.js`
  - `scripts/refresh-snapshot.js`
  - `scripts/link-coa.js`
  - `scripts/analysis/audit-scope-accuracy.js`

## Technical Implementation

### Group A: Quality gate `process.exit(1)` leak (Bugs #1, #2)
Replace `process.exit(1)` with `throw new Error(...)` inside `pipeline.run()` callbacks in `assert-staleness.js:119` and `assert-network-health.js:158`. The `pipeline.run()` lifecycle handles pool cleanup in `finally` and re-throws.

### Group B: Silent `.catch(() => {})` error swallowing (Bugs #5–10)
Replace empty `.catch(() => {})` on `pipeline_runs` UPDATE and `pool.end()` calls in `assert-schema.js`, `assert-engine-health.js`, `assert-data-bounds.js` with `.catch((err) => pipeline.log.warn(...))` to surface failures.

### Group C: PIPELINE_SUMMARY missing `records_updated` (Bugs #13, #14)
Replace raw `console.log('PIPELINE_SUMMARY:...')` in `assert-schema.js:388` and `assert-data-bounds.js:659` with `pipeline.emitSummary()` which null-coalesces `records_updated`.

### Group D: `assert-pre-permit-aging.js` can never fail (Bug #11)
Add threshold logic: `expired_pre_permits > 0` → `'WARN'` status (matching doc contract at line 14).

### Group E: `assert-data-bounds.js` ungated inspection checks (Bug #12)
Gate inspection checks (lines 477–593) behind a `runInspectionChecks` flag (`CHAIN_ID === 'deep_scrapes' || !CHAIN_ID`).

### Group F: `classify-permits.js` missing 11 trades (Bug #3)
Add TRADES entries for IDs 21–31: trim-work, millwork-cabinetry, tiling, stone-countertops, decking-fences, eavestrough-siding, pool-installation, solar, security, temporary-fencing, caulking.

### Group G: `reclassify-all.js` per-permit pool.connect + individual INSERTs (Bugs #4, #18)
Acquire single client outside the loop. Batch trade inserts using multi-row VALUES instead of per-match INSERT.

### Group H: `refresh-snapshot.js` division by zero (Bug #15)
Guard `neighbourhood_count/active_permits*100` with `active_permits > 0 ? ... : 0` at line 179.

### Group I: `audit-scope-accuracy.js` SDK violation + logic drift (Bugs #16, #17)
Replace `new Pool()` with `pipeline.run()`. Import `classifyScope` from shared module instead of inlining.

### Group J: `classify-scope.js` meaningless counter (Bug #19)
Fix `withTags` to only count permits with tags beyond the mandatory `useType` tag.

### Group K: `link-coa.js` LIKE wildcard escape (Bug #20)
Escape `%` and `_` in street_name before embedding in LIKE pattern using SQL `REPLACE()`.

### Group L: `assert-engine-health.js` VACUUM string interpolation (Bug #21)
Replace `"${target.table_name}"` with `pipeline.quoteIdent()` helper (or `pg` identifier quoting).

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes modified
* **Unhappy Path Tests:** Test the `process.exit` → `throw` change, test PIPELINE_SUMMARY shape, test division-by-zero guard
* **logError Mandate:** N/A — scripts use `pipeline.log.*`
* **Mobile-First:** N/A — no UI changes

## Execution Plan
- [ ] **Rollback Anchor:** Git commit `0e8e357`
- [ ] **State Verification:** All 21 bugs verified against live codebase (completed in audit)
- [ ] **Spec Review:** `docs/specs/28_data_quality_dashboard.md` + `00_engineering_standards.md` §9 (completed)
- [ ] **Reproduction:** Create failing tests for critical bugs:
  - Test that `pipeline.run()` callback throwing (not `process.exit`) still cleans up pool
  - Test PIPELINE_SUMMARY shape includes `records_updated`
  - Test `classify-permits.js` TRADES covers all 32 slugs
  - Test `refresh-snapshot.js` handles `active_permits=0`
- [ ] **Red Light:** Run tests — MUST fail to confirm reproduction
- [ ] **Fix Group A:** `assert-staleness.js` + `assert-network-health.js` — `process.exit(1)` → `throw`
- [ ] **Fix Group B:** Silent `.catch(() => {})` → logged warnings in 3 quality scripts
- [ ] **Fix Group C:** Raw PIPELINE_SUMMARY → `pipeline.emitSummary()` in 2 quality scripts
- [ ] **Fix Group D:** `assert-pre-permit-aging.js` — add WARN threshold for expired pre-permits
- [ ] **Fix Group E:** `assert-data-bounds.js` — gate inspection checks behind CHAIN_ID
- [ ] **Fix Group F:** `classify-permits.js` — add 11 missing TRADES entries
- [ ] **Fix Group G:** `reclassify-all.js` — single client + batch inserts
- [ ] **Fix Group H:** `refresh-snapshot.js` — division-by-zero guard
- [ ] **Fix Group I:** `audit-scope-accuracy.js` — migrate to pipeline SDK + shared classifier import
- [ ] **Fix Group J:** `classify-scope.js` — fix `withTags` counter semantics
- [ ] **Fix Group K:** `link-coa.js` — escape LIKE wildcards
- [ ] **Fix Group L:** `assert-engine-health.js` — `quoteIdent()` for VACUUM
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6
