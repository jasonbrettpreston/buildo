# Active Task: Fix Orphaned Duration Anomalies & Make Banner Warnings Actionable
**Status:** Implementation — Green Light ✅
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** Three banner bugs: (A) Duration anomaly SQL treats `builders` and `permits:builders` as separate pipelines — 3 of 4 slow-pipeline warnings come from orphaned standalone slugs that will never get new runs. (B) "7 data quality violations" shows only a count — no breakdown of what the violations are or what to do about them. (C) Slow pipeline warnings don't identify which chain or pipeline name they refer to (shows raw slug like `coa:assert_data_bounds` instead of "Data Quality Checks (CoA chain)").
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `src/app/api/quality/route.ts` — duration query SQL (add SPLIT_PART normalization)
  - `src/lib/quality/types.ts` — `computeSystemHealth()` message formatting
  - `src/tests/quality.infra.test.ts` — SQL normalization test
  - `src/tests/quality.logic.test.ts` — violation breakdown + naming tests

## Technical Implementation
* **New/Modified Components:** None
* **Data Hooks/Libs:** `src/lib/quality/types.ts` (message formatting), `src/app/api/quality/route.ts` (SQL only)
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** Existing try-catch in route.ts preserved — no new routes
* **Unhappy Path Tests:** Test normalization, violation breakdown, pipeline naming
* **logError Mandate:** N/A — no new catch blocks
* **Mobile-First:** N/A — no UI component changes

## Execution Plan
- [x] **Rollback Anchor:** `4875d78`
- [x] **State Verification:** 3/4 duration warnings from orphaned standalone slugs; violation message is unactionable count; slugs are raw identifiers
- [x] **Spec Review:** Spec 28 §3 — failure query already normalizes with SPLIT_PART; duration query doesn't. PIPELINE_REGISTRY already maps slug→human name.
- [x] **Reproduction:** Add 3 tests:
  1. (infra) Duration query SQL uses SPLIT_PART to normalize chain prefixes
  2. (logic) `computeSystemHealth` violation warning shows type breakdown, not just total
  3. (logic) `computeSystemHealth` duration warning includes human-readable pipeline name
- [x] **Red Light:** 3 failures confirmed, 238 pass
- [x] **Fix:**
  1. `route.ts`: SPLIT_PART normalization in duration query — partitions by `base_pipeline`
  2. `types.ts`: Violation breakdown — shows "5 cost outliers, 2 future-dated permits" instead of "7 data quality violations"
  3. `types.ts`: Pipeline name lookup — inline `PIPELINE_NAMES` map, shows "Extract Entities (builders)" instead of raw slug
- [x] **Green Light:** 2212/2212 tests pass, lint clean
