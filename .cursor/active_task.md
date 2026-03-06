# Active Task: Fix Pipeline Run All + Error Reporting + Toggle Bugs
**Status:** Planning

## Context
* **Goal:** Fix three persistent bugs: (1) Run All button shows "Running" then stops with no error, (2) pipeline error reporting not surfacing to the user, (3) toggle on/off not responsive. Also verify pipeline runs actually work end-to-end.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `src/components/FreshnessTimeline.tsx` (toggle optimistic state, Run All onClick, error display)
  - `src/components/DataQualityDashboard.tsx` (triggerPipeline, polling, fetchData)
  - `src/app/api/admin/stats/route.ts` (pipeline_last_run query)
  - `src/app/api/admin/pipelines/[slug]/route.ts` (pipeline trigger API)
  - `src/tests/admin.ui.test.tsx` (regression tests)
  - `src/tests/quality.infra.test.ts` (infra tests)
* **Rollback Anchor:** `f15820d35cd4a270365f9ac184bb114bc6a7bfbd`

## State Verification (Root Cause Analysis)

### Bug 1: Run All says "Running" then stops (no error)
- **Root cause:** `GET /api/admin/stats` queries `records_meta` column from `pipeline_runs`, but migration 041 was never applied to the DB. The query fails silently (empty `catch {}` on line 222 of stats/route.ts), returning **zero** `pipeline_last_run` entries.
- **Effect:** Poll sees no running entry for `chain_permits` -> grace period expires (15s) -> button reverts to "Run All". The chain actually runs fine in the background -- the UI just can't see it.
- **Evidence:** `curl /api/admin/stats` returned `pipeline_last_run: {}` (0 keys). After applying migration 041, returns 51 keys.

### Bug 2: Error reporting not working
- **Root cause:** Run All button calls `onTrigger(chainSlug)` directly (line 573 of FreshnessTimeline.tsx) instead of `handleRun(chainSlug)`. The `onTrigger` prop maps to `triggerPipeline` in DataQualityDashboard which catches errors into `pipelineError` state passed as `triggerError` prop -- so the prop-based error path works for HTTP errors. But if the API returns 200 and the child process fails later, status silently reverts due to Bug 1 (poll returns empty data).

### Bug 3: Toggle not responsive / can't turn back on
- **Root cause (already fixed in prior session):** `handleToggle` stored `!currentlyDisabled` (the SAME state) instead of `currentlyDisabled` (the desired new enabled state). Also, the useEffect sync used broken reference comparison on a new Set created every render.

### Bug 4: Pipeline test coverage gaps
- No test verifies that `stats/route.ts` returns `pipeline_last_run` entries when `records_meta` column is missing (the silent failure scenario).

## Technical Implementation
* **Modified Files:**
  - `src/app/api/admin/stats/route.ts` -- Fallback query without `records_meta` (already done)
  - `src/components/FreshnessTimeline.tsx` -- Change Run All `onClick` from `onTrigger` to `handleRun`; toggle fix (already done); optimistic timer cleanup (already done)
  - `src/tests/quality.infra.test.ts` -- Add test: stats route has fallback query for missing records_meta
  - `src/tests/admin.ui.test.tsx` -- Add test: Run All uses handleRun (not raw onTrigger); regression tests for toggle + isChainRunning (already done)

## Standards Compliance
* **Try-Catch Boundary:** Stats route already has outer try-catch. Adding inner fallback try-catch for records_meta column graceful degradation.
* **Unhappy Path Tests:** Testing the silent failure scenario (missing column -> empty pipeline_last_run).
* **Mobile-First:** N/A -- bug fix only, no layout changes.

## Execution Plan
- [ ] **Rollback Anchor:** `f15820d` recorded above.
- [ ] **State Verification:** Root causes documented above.
- [ ] **Spec Review:** Spec 28 confirms: "Dashboard polls every 5s while any pipeline is running" -- Bug 1 breaks this contract.
- [ ] **Reproduction Tests (Red Light):**
  - Test 1: Stats route pipeline_last_run query has fallback for missing records_meta
  - Test 2: Run All button uses `handleRun` (not raw `onTrigger`)
  - Test 3: Toggle stores correct optimistic value (already added)
  - Test 4: isChainRunning only checks chain slug (already added)
- [ ] **Red Light:** Run tests -- new tests MUST fail before fix.
- [ ] **Fix:**
  - Apply migration 041 to DB (already done)
  - Stats route: inner fallback query without records_meta (already done)
  - FreshnessTimeline: Run All onClick -> handleRun
  - FreshnessTimeline: toggle fix + optimistic timer (already done)
- [ ] **Green Light:** `npm run test && npm run lint -- --fix` -- all pass.
- [ ] **Collateral Check:** `npx vitest related src/app/api/admin/stats/route.ts --run`
- [ ] **Atomic Commit:** `git commit -m "fix(28_quality): pipeline Run All + toggle + error reporting"`
- [ ] **Spec Audit:** No spec change needed -- fixes restore intended behavior.
