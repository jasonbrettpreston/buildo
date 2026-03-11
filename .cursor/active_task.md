# Active Task: Show records_total in Chain Completion Report per-step rows
**Status:** Implementation

## Context
* **Goal:** The Chain Completion Report per-step rows show "—" when `records_new` and `records_updated` are both 0. But `records_total` (total records processed) is available and informative. Add it so users can see throughput even when no records changed.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `src/components/FreshnessTimeline.tsx` — Chain Completion Report (lines 524-613)
  - `src/tests/chain.logic.test.ts` — completion report tests

## Execution Plan
- [x] **Rollback Anchor:** Git commit `f468503`
- [x] **State Verification:** CoA completion report shows steps with "—" for records (confirmed via browser API).
- [x] **Spec Review:** Spec 28 §3 documents per-step drill-down with records_total/records_new/records_updated.
- [x] **Reproduction:** Updated test to assert `records_total` appears in completion report.
- [x] **Red Light:** Test failed against code without records_total.
- [x] **Fix:** Added `records_total` to stepRows and render it in the per-step summary.
- [x] **Green Light:** 2129 tests pass, typecheck clean, lint clean. → WF6.
