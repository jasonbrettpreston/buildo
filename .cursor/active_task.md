# Active Task: Fix vacuumTargets scope crash and false "ALL CHECKS PASSED" on failed steps
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `255f010`

## Context
* **Goal:** Fix two bugs found during WF5 manual testing of the CQA trio hardening:
  (1) `assert-engine-health.js` crashes with `ReferenceError: vacuumTargets is not defined` because the variable is declared inside a `try` block (line 126) but referenced in `meta` construction (line 189) outside that scope.
  (2) FreshnessTimeline CQA verdict banner shows green "ALL CHECKS PASSED" even when the step status is "failed" — because when the script crashes before emitting PIPELINE_SUMMARY, `records_meta` is null and all counters default to 0.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `scripts/quality/assert-engine-health.js` — vacuumTargets scope fix (line 126 → hoist before try)
  - `src/components/FreshnessTimeline.tsx` — verdict banner must check step status (lines 973-979)

## Bug Description
1. **vacuumTargets scope crash:** `const vacuumTargets` is declared at line 126 inside the outer `try` block (line 63). The `meta` object at line 189 references `vacuumTargets.length` but is outside the `try`. If the outer `try` completes normally, this works — but if any earlier code in the `try` throws (or if JS hoisting rules don't apply to `const`), the variable is not in scope at line 189. In practice, the script runs all checks successfully, writes snapshots, then crashes at line 189 because `const` is block-scoped and `vacuumTargets` exits scope at the `catch` on line 174.
2. **False "ALL CHECKS PASSED" on crash:** When the script crashes, `run-chain.js` captures the error but `records_meta` is null (no PIPELINE_SUMMARY emitted). The UI renders the verdict banner with all counters defaulting to 0, showing green "ALL CHECKS PASSED" — misleading when the step actually failed.

## Technical Implementation
* **New/Modified Components:** `FreshnessTimeline.tsx` — verdict banner conditional
* **Data Hooks/Libs:** N/A
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes modified
* **Unhappy Path Tests:** Test that vacuumTargets is declared outside try; test that verdict banner respects step failure status
* **logError Mandate:** N/A
* **Mobile-First:** N/A — existing component, no layout changes

## Execution Plan
- [ ] **Rollback Anchor:** `255f010`
- [ ] **State Verification:** Confirmed: vacuumTargets at line 126 inside try; meta at line 189 outside try; verdict banner shows "ALL CHECKS PASSED" when records_meta is null.
- [ ] **Spec Review:** Spec 28 §3 defines CQA tiers — engine health should not crash; verdict banner should reflect actual status.
- [ ] **Reproduction:** Add tests: (a) assert-engine-health.js declares vacuumTargets before the outer try block; (b) FreshnessTimeline verdict banner does not show "ALL CHECKS PASSED" when step status is failed.
- [ ] **Red Light:** Run tests — new tests fail.
- [ ] **Fix:** (a) Move `let vacuumTargets = []` declaration before the outer `try` block. (b) Add guard to verdict banner: when `info.status === 'failed'` and no meaningful records_meta, show red "FAILED" instead of green "ALL CHECKS PASSED".
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
