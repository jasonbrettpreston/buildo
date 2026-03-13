# Active Task: Fix recordsUpdated scope crash in assert-engine-health.js
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `9d9acf7`

## Context
* **Goal:** Fix `ReferenceError: recordsUpdated is not defined` in `assert-engine-health.js`. Same bug class as the vacuumTargets scope crash (committed `9d9acf7`). `let recordsUpdated = 0` is declared at line 143 inside the outer `try` block but referenced at line 206 in `PIPELINE_SUMMARY` outside that block. The script runs all checks and snapshots successfully, then crashes when emitting PIPELINE_SUMMARY.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `scripts/quality/assert-engine-health.js` — hoist `let recordsUpdated = 0` before outer `try` (line 143 → before line 64)

## Bug Description
`let recordsUpdated = 0` is declared at line 143 inside the outer `try` block (line 64). Line 206 (`PIPELINE_SUMMARY`) references `recordsUpdated` outside that block. Since `let` is block-scoped, the variable is not accessible after the `catch` on line 175. The script completes all health checks and writes snapshots, then crashes with `ReferenceError: recordsUpdated is not defined`.

Discovered during WF5 manual testing: CoA pipeline Engine Health step failed with 292ms, error `Command failed: node ...assert-engine-health.js`. Running the script directly revealed the stack trace pointing to line 206.

## Technical Implementation
* **New/Modified Components:** N/A
* **Data Hooks/Libs:** N/A
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes modified
* **Unhappy Path Tests:** Test that `recordsUpdated` is declared before the outer try block
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan
- [ ] **Rollback Anchor:** `9d9acf7`
- [ ] **State Verification:** Confirmed: `let recordsUpdated = 0` at line 143 inside outer try; `PIPELINE_SUMMARY` at line 206 references it outside try. Running script directly produces `ReferenceError: recordsUpdated is not defined`.
- [ ] **Spec Review:** Spec 28 §3 — engine health script must complete and emit PIPELINE_SUMMARY.
- [ ] **Reproduction:** Add test asserting `let recordsUpdated` is declared near `let vacuumTargets` (both hoisted before try).
- [ ] **Red Light:** Run tests — new test fails.
- [ ] **Fix:** Move `let recordsUpdated = 0` before the outer `try` block (alongside `vacuumTargets`). Remove inner declaration.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
