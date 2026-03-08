# Active Task: Fix Pipeline Dashboard Display Bugs (WF3)
**Status:** Implementation

## Context
* **Goal:** Fix multiple display bugs in the Data Quality pipeline dashboard identified from live UI inspection
* **Target Spec:** docs/specs/28_data_quality_dashboard.md
* **Key Files:** `src/components/FreshnessTimeline.tsx`, `src/components/funnel/FunnelPanels.tsx`, `src/lib/admin/funnel.ts`

## Bug List (from live dashboard inspection)

| # | Bug | Root Cause | Fix |
|---|-----|-----------|-----|
| 1 | `[object Object]` in records_meta display for quality steps | records_meta renderer iterates all keys including nested `pipeline_meta` object, calls `String()` on it | Filter out `pipeline_meta` and non-primitive values from records_meta rendering |
| 2 | Footer shows "Status: Healthy" when 0 new/changed records (Step 2 permits) | `computeRowData()` status is purely time-based — only checks SLA window, ignores record counts | Add 0-records check → status = 'warning' |
| 3 | WRITES column shows ALL DB columns without highlighting (Steps 1, 2) | Ingest/quality STEP_DESCRIPTIONS missing `writes` array → `writesSet = null` → all columns lit | Add `writes` arrays to assert_schema, assert_data_bounds |
| 4 | Live PIPELINE_META overrides step-specific writes (shared scripts) | classify_scope_class + classify_scope_tags share same script, emit same PIPELINE_META | DataFlowTile always uses static STEP_DESCRIPTIONS for writes, live meta for reads only |
| 5 | Step 4 (Scope Tags) shows 0 records processed, "Healthy" | Same script runs twice; second run finds nothing. Status purely time-based | Fixed by bug #2 (warning status) + "No Change" label in getStatusDot |

## Execution Plan
- [x] **Rollback Anchor:** b482694
- [x] **State Verification:** Inspected live dashboard via Chrome, documented 5 bugs
- [x] **Spec Review:** Read docs/specs/28_data_quality_dashboard.md
- [x] **Bug 1 Fix:** Filter `pipeline_meta` + nested objects from records_meta renderer
- [x] **Bug 2 Fix:** Add 0-records → 'warning' status in computeRowData
- [x] **Bug 3 Fix:** Add `writes` arrays to assert_schema/assert_data_bounds STEP_DESCRIPTIONS
- [x] **Bug 4 Fix:** DataFlowTile always uses static desc.writes, live meta for reads only
- [x] **Bug 5 Fix:** getStatusDot returns "No Change" for stale-exempt steps with 0 records
- [ ] **Reproduction Tests:** Add tests for each bug
- [ ] **Green Light:** Run `npm run test && npm run lint -- --fix`
- [ ] **Visual Verification:** Reload dashboard and confirm fixes
- [ ] **Atomic Commit**
