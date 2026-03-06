# Active Task: WF3 — Status dots don't reset, link_similar stale, warning rows don't flash
**Status:** Planning

## Context
* **Goal:** (1) Status dots don't reset to neutral on "Run All" — stepDone guard blocks pending reset because previous run's completed status persists. (2) link_similar shows 0% and "Stale" even after running. (3) Warning/stale steps don't visibly flash — animate-pulse only on 8px dot, not the row.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `src/components/FreshnessTimeline.tsx` (isPending logic, row flash)
* **Rollback Anchor:** `8287291`

## State Verification (Root Cause Analysis)

### Bug 1: Status dots still don't reset on re-run
- **Root cause:** The `stepDone` guard at line 598 checks `info?.status === 'completed'`. But `info` comes from `pipelineLastRun[scopedKey]` which still has the PREVIOUS run's completed status when "Run All" is clicked. The new chain row exists in the DB but step rows haven't been created yet — the old step rows show `status: 'completed'`, so `stepDone = true` → `isPending = false` for every step.
- **Fix:** Compare step `last_run_at` against chain `last_run_at`. The chain row is created immediately by the API, so `pipelineLastRun[chainSlug].last_run_at` is the current run's start time. A step is only truly "done in this run" if its `last_run_at >= chainStartedAt`. Otherwise it's stale from a previous run → show pending.

### Bug 2: link_similar shows stale / 0%
- **Root cause:** Same as Bug 1 — the status dot shows "Stale" because `getStatusDot` uses the old `last_run_at` (from many hours ago). The `isPending` guard should override this but doesn't because of the `stepDone` bug. Once Bug 1 is fixed, the dot will correctly show "Pending" while the chain is running, and "Fresh" once the step completes and polling picks it up.
- **The 0% funnel issue** is separate: `link_similar`'s `records_total` reflects propagated scope tags (not linked permits). If the run propagated 0 tags, `matchCount = 0`. This is a data issue, not a code bug.

### Bug 3: Warning/stale steps don't visibly flash
- **Root cause:** `animate-pulse` is applied to the status dot (`w-2 h-2 rounded-full`) — a tiny 8px circle. The user expects the entire step row/tile to flash. The pulse on 8px is practically invisible.
- **Fix:** Apply a subtle flash to the entire pipeline tile border when the step's status is warning or stale. Use `animate-pulse` on the border color or a ring effect.

## Standards Compliance
* **Try-Catch Boundary:** No new routes.
* **Unhappy Path Tests:** Update stepDone test for chain-time comparison. Test row-level flash class.
* **Mobile-First:** CSS-only changes, no layout impact.

## Execution Plan
- [x] **Rollback Anchor:** `8287291`
- [x] **Fix 1+2:** Compare step last_run_at vs chain last_run_at for stepDoneThisRun guard
- [x] **Fix 3:** Apply animate-pulse + colored border to entire pipeline tile for warning/stale steps
- [x] **Green Light:** 1714 tests pass, 0 type errors, 0 lint errors
- [ ] **Atomic Commit**
