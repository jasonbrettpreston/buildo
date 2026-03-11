# Active Task: Prevent concurrent chain runs (B11)
**Status:** Implementation

## Context
* **Goal:** classify_permits takes 88+ minutes on the full 237K dataset. When two chains run concurrently (e.g., "Retry Failed" fires chain_permits and chain_sources simultaneously), they compete for DB connections and lock on shared tables, making both slower and causing timeout failures. The API route's `runningProcesses` map already tracks child processes, but POST doesn't check it before spawning a new one for the same slug. Additionally, re-triggering a chain marks the old DB row cancelled but leaves the old OS process alive (zombie).
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `src/app/api/admin/pipelines/[slug]/route.ts` — POST handler, lines 88-210
  - `src/tests/chain.logic.test.ts` — chain behavior tests
  - `src/tests/api.infra.test.ts` — API route tests

## Execution Plan
- [x] **Rollback Anchor:** Git commit `f0cf1d3`
- [x] **State Verification:** Current code allows concurrent runs — confirmed via code inspection.
- [x] **Spec Review:** Spec 28 §3 says "API force-cancels any existing 'running' rows for the slug before inserting a new run (no 409 rejection)." Updating to add 409 rejection.
- [ ] **Reproduction:** Add test asserting POST returns 409 when process already running.
- [ ] **Red Light:** New test must fail against current code.
- [ ] **Fix:** Add `runningProcesses` guard in POST handler. Kill stale process on re-trigger.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
