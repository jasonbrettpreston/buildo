# Active Task: Fix classify-permit-phase.js — 3 bugs
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `d290f0c`

## Context
* **Goal:** Fix 3 validated bugs in the permit phase classification script
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:** `scripts/classify-permit-phase.js`, `src/tests/inspections.logic.test.ts`

## Bug Triage
| # | Bug | Severity | Verdict |
|---|-----|----------|---------|
| 1 | Unhandled Promise Rejections | REPORTED | **NOT A BUG** — pipeline SDK `run()` already wraps callback in try/catch (pipeline.js:213-219). Errors are logged and re-thrown. |
| 2 | Denominator Dilution | MEDIUM | **CONFIRMED** — `examRate` divides by `COUNT(*) FROM permits` (237K+ all-time permits). Should use relevant active pool. |
| 3 | Cross-Revision State Bleed | HIGH | **CONFIRMED** — UPDATE targets all revision_nums. Multiple revisions per permit_num inflates counts and applies Examination to revisions that may have different lifecycle states. |
| 4 | Epoch Date Bypass | LOW | **PARTIALLY CONFIRMED** — `issued_date` is type DATE so empty strings are impossible. But epoch dates (1970-01-01) from bad ETL could bypass `IS NULL`. Fixing defensively. |

## Technical Implementation
* **Fix 2:** Change denominator to `COUNT(*) FILTER (WHERE status = 'Inspection')` — the relevant pool
* **Fix 3:** Add `AND revision_num = '00'` to both SELECT and UPDATE queries. Use `rows.length` instead of `rowCount` for metrics.
* **Fix 4:** Expand `issued_date IS NULL` to `(issued_date IS NULL OR issued_date < '1970-01-02')` to catch epoch defaults
* **Also:** Bump `last_seen_at = NOW()` on the UPDATE for CDC consistency (same pattern as classify-inspection-status.js)

## Standards Compliance
* **Try-Catch Boundary:** N/A — pipeline script, SDK handles errors
* **Unhappy Path Tests:** Epoch dates, multi-revision permits
* **logError Mandate:** N/A — uses pipeline SDK logging
* **Mobile-First:** N/A — backend script

## Execution Plan
- [ ] **Rollback Anchor:** `d290f0c`
- [ ] **State Verification:** Pipeline SDK already handles errors; permits PK is composite
- [ ] **Spec Review:** Read spec for intended behavior
- [ ] **Reproduction:** Create failing tests
- [ ] **Red Light:** Run tests — must fail
- [ ] **Fix:** Modify classify-permit-phase.js
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6
