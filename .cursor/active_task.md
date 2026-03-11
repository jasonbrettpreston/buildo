# Active Task: Add per-step summary to Chain Completion Report
**Status:** Implementation

## Context
* **Goal:** The Chain Completion Report tile currently only shows aggregate ins/upd/del totals. After a chain completes, the user wants to see what each step did — records_total/new/updated, duration, and whether steps were skipped (gate abort). This data already exists in `pipelineLastRun` per scoped step key.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `src/components/FreshnessTimeline.tsx` — Chain Completion Report (lines 514-567)
  - `src/tests/chain.logic.test.ts` — chain behavior tests
  - `src/tests/admin.ui.test.tsx` — UI pattern tests

## Technical Implementation

### Current behavior
The report shows: `{chain.label} Completed | {duration} | +N inserted | N updated | N deleted | No rows impacted`

### New behavior
Add a collapsible per-step table below the aggregate summary. Each step row shows:
- Step name (from `chain.steps[i].label`)
- Status indicator: completed (green dot), skipped (gray), or the step's `records_new`/`records_updated` counts
- Duration
- Gate-skipped steps (those with old timestamps vs the chain's `last_run_at`) shown as "Skipped" in gray

The step data comes from `pipelineLastRun[${chain.id}:${step.slug}]` which has `status`, `records_total`, `records_new`, `records_updated`, `duration_ms`, and `last_run_at`.

A step is considered "ran in this chain" if its `last_run_at` is close to the chain's `last_run_at` (within the chain duration window). Otherwise it was skipped.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes.
* **Unhappy Path Tests:** N/A — no API routes.
* **logError Mandate:** N/A — no API routes.
* **Mobile-First:** Report table uses `flex flex-col` base layout, stacks naturally on mobile.

## Execution Plan
- [ ] **Rollback Anchor:** Git commit `e3748f6`
- [ ] **State Verification:** Confirmed via WF5: CoA completion report shows "No rows impacted" with no per-step breakdown.
- [ ] **Spec Review:** Spec 28 documents pipeline chain orchestrator with step-level tracking.
- [ ] **Reproduction:** Add test asserting Chain Completion Report includes per-step rows.
- [ ] **Red Light:** New test must fail against current code.
- [ ] **Fix:** Add per-step summary table to the Chain Completion Report IIFE in FreshnessTimeline.tsx.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
