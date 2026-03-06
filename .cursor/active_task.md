# Active Task: WF3+WF2 — Status reset on re-run, Stop button fixes, warning flash
**Status:** Implementation

## Context
* **Goal:** (1) Status dots stay green from last run when re-running — should reset to blank/running. (2) Permits pipeline shows zero new records — investigate data source. (3) Stop button disappears while pipeline runs. (4) Stop button didn't work. (5) Stop button should always be visible while running. (6) WF2: Warning status steps should flash to draw attention.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `src/components/FreshnessTimeline.tsx` (status dots, stop button visibility, warning flash)
  - `src/components/DataQualityDashboard.tsx` (cancelPipeline, runningPipelines state, polling)
  - `src/app/api/admin/pipelines/[slug]/route.ts` (DELETE handler)
  - `scripts/load-permits.js` (data source investigation)
* **Rollback Anchor:** `f7acd3a`

## State Verification (Root Cause Analysis)

### Bug 1: Status dots stay green on re-run
- **Root cause:** When "Run All" is clicked, `triggerPipeline` adds the chain slug (e.g. `chain_permits`) to `runningPipelines`. But `pipelineLastRun` still has the PREVIOUS run's data for each scoped step (e.g. `permits:assert_schema` → status: 'completed'). The `getStatusDot` function (line 239) checks `isRunning` first, but `isRunning` at line 570 checks `runningPipelines.has(scopedKey)` — the scoped keys (`permits:assert_schema`) are NOT in runningPipelines, only `chain_permits` is. So dots stay green from last run.
- **Fix:** When a chain is running, all its steps should show as "pending" (gray) unless individually running. Add logic: if `isChainRunning && !isRunning && !info?.status === 'running'`, show a "Pending" dot.

### Bug 2: Zero new permits
- **Root cause:** NOT a bug. `load-permits.js` fetches live from CKAN API (line 204-206, `fetchFromCKAN()`). The upsert uses `data_hash IS DISTINCT FROM EXCLUDED.data_hash` (line 184) — updates only happen when data actually changes. Toronto Open Data typically updates once per business day. If you re-run on the same day after already loading, the hashes match and zero records are new/updated. This is correct behavior.
- **Action:** No code fix. Will add a "Same-day re-run — 0 changes expected" note in the records display when records_new=0 and records_total>0.

### Bug 3+4+5: Stop button disappears / doesn't work
- **Root causes (multiple):**
  1. **Disappears:** `isChainRunning` depends on `runningPipelines.has(chainSlug)`. When `cancelPipeline` succeeds (line 201), it immediately removes the slug from `runningPipelines` → `isChainRunning` becomes false → Stop button vanishes before user sees confirmation. The chain process is still running in the background (DB cancel doesn't kill the process).
  2. **Doesn't work:** The DELETE handler cancels DB rows, but the Node.js child process spawned by `execFile` keeps running. `run-chain.js` uses `execFileSync` per step — it doesn't check DB status between steps. So cancellation only marks DB rows, doesn't stop execution.
  3. **Fix for visibility:** Don't remove from `runningPipelines` immediately on cancel. Let polling detect the cancelled status. Show "Stopping..." state instead.
  4. **Fix for actual cancellation:** The API route has a reference to the `child` process. Store running children in a Map and kill them on DELETE. For `run-chain.js`, add a DB status check between steps.

### WF2 Bug 6: Warning steps should flash
- **Root cause:** `getStatusDot` returns `'bg-yellow-500'` for aging steps (24-72h) but no animation. Only running state gets `animate-pulse`.
- **Fix:** Add `animate-pulse` to warning dots (yellow/stale status) to draw attention.

## Standards Compliance
* **Try-Catch Boundary:** DELETE handler already has try-catch. No new routes.
* **Unhappy Path Tests:** Test status reset on re-run. Test stop button visible while running. Test warning dot has animation.
* **Mobile-First:** Stop button already has 44px touch target. Warning flash is CSS-only.

## Execution Plan
- [x] **Rollback Anchor:** `f7acd3a`
- [x] **Reproduction Tests (Red Light):** 6 failing tests confirmed
- [x] **Fix 1:** Reset step dots to "Pending" (gray animate-pulse) when parent chain is running
- [x] **Fix 2:** Zero new records is correct — CKAN hash-based upsert, same-day re-run = 0 changes
- [x] **Fix 3:** Stop button: removed immediate runningPipelines delete, added "Stopping..." state
- [x] **Fix 4:** Kill child process on DELETE via runningProcesses Map + cancellation check between steps in run-chain.js
- [x] **Fix 6 (WF2):** Added animate-pulse to Aging (yellow) and Stale (red) status dots
- [x] **Green Light:** 1712 tests pass, 0 type errors, 0 lint errors, 0 collateral
- [ ] **Atomic Commit**
