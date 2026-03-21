# Active Task: Phase 2 — Aggregate audit_table verdicts in run-chain.js
**Status:** Implementation
**Rollback Anchor:** `fcd6ff6`
**Workflow:** WF2 — Feature Enhancement

## Context
* **Goal:** Update `scripts/run-chain.js` to aggregate `records_meta.audit_table.verdict` strings from each completed step. When any step has `verdict: 'WARN'`, the chain-level status should be `'completed_with_warnings'` instead of plain `'completed'`. When any step has `verdict: 'FAIL'` (but the script still exited 0), the chain should be `'completed_with_errors'`. This gives the admin dashboard a chain-level amber/red signal without halting the pipeline.
* **Target Spec:** `docs/specs/37_pipeline_system.md`
* **Key Files:**
  - `scripts/run-chain.js` — aggregate verdicts, update chain status
  - `src/components/FreshnessTimeline.tsx` — render new chain-level statuses (amber for warnings)

## Technical Implementation
* **Verdict collection:** After each step completes, extract `recordsMeta?.audit_table?.verdict` and push to a `stepVerdicts` array.
* **Chain status logic (lines 321-337):**
  ```
  Current:  cancelled | failed | completed
  New:      cancelled | failed | completed_with_errors | completed_with_warnings | completed
  ```
  - If any step exited non-zero → `'failed'` (unchanged)
  - If all steps exited 0 but any verdict is `'FAIL'` → `'completed_with_errors'`
  - If all steps exited 0 but any verdict is `'WARN'` → `'completed_with_warnings'`
  - If all verdicts are `'PASS'` or `'INFO'` → `'completed'`
* **Chain records_meta:** Include `{ step_verdicts: { step_slug: 'PASS'|'WARN'|'FAIL', ... } }` for drill-down
* **UI rendering:** FreshnessTimeline already color-codes chain status. Need to add `completed_with_warnings` → amber and `completed_with_errors` → red badge treatment.
* **Database Impact:** NO — status is a TEXT column, accepts any string

## Standards Compliance
* **Try-Catch Boundary:** N/A — adding data aggregation to existing orchestrator
* **Unhappy Path Tests:** N/A — orchestrator infrastructure
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## §10 Plan Compliance Checklist

### If Pipeline Script Created/Modified:
- [x] Uses Pipeline SDK: run-chain.js is the orchestrator itself (§9.4)
- [x] No streaming changes (§9.5)

### If UI Component Created/Modified:
- [x] Mobile-first: adding status color mapping only, no layout changes (§1.1)
- [x] No new touch targets

### Other:
- ⬜ DB — N/A
- ⬜ API — N/A
- ⬜ Shared Logic — N/A

## Execution Plan
- [ ] **State Verification:** Current chain status is binary: completed | failed | cancelled
- [ ] **Contract Definition:** N/A
- [ ] **Spec Update:** N/A
- [ ] **Schema Evolution:** N/A
- [ ] **Guardrail Test:** N/A — orchestrator + UI display logic
- [ ] **Red Light:** N/A
- [ ] **Implementation:**
  1. Add `stepVerdicts` array to run-chain.js
  2. After each step, extract audit_table.verdict from recordsMeta
  3. Compute chain-level verdict from aggregated step verdicts
  4. Update chain pipeline_runs row with enriched status + step_verdicts in records_meta
  5. Update FreshnessTimeline.tsx status color mapping for new statuses
- [ ] **UI Regression Check:** N/A — status display only
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
