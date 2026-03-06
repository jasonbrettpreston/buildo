# Active Task: Fix stale "running" pipeline_runs blocking new triggers
**Status:** Planning

## Context
* **Goal:** "Run All" on permits pipeline returns 409 "already running" even when no process is active. Stale `pipeline_runs` rows with `status = 'running'` from crashed/interrupted processes block the concurrency guard indefinitely (up to 2 hours).
* **Target Spec:** `docs/specs/26_admin.md`
* **Rollback Anchor:** `9a42a11`
* **Key Files:**
  - `src/app/api/admin/pipelines/[slug]/route.ts` — concurrency guard

## Technical Implementation
* Before the concurrency check, auto-expire stale runs: `UPDATE pipeline_runs SET status = 'failed', error_message = 'Stale run auto-cleaned', completed_at = NOW() WHERE status = 'running' AND started_at < NOW() - INTERVAL '30 minutes'`. This catches processes that died without updating their row. Then the existing concurrency check only blocks legitimately running pipelines (started < 30 min ago).
* Reduce the concurrency guard window from 2 hours to 30 minutes to match.
* **Database Impact:** NO (no schema change, just a cleanup UPDATE before the SELECT)

## Execution Plan
- [ ] **Reproduction test:** Add test verifying stale run cleanup logic.
- [ ] **Red Light:** Test fails.
- [ ] **Fix:** Add stale-run cleanup UPDATE before the concurrency SELECT in route.ts.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`
- [ ] **Collateral Check:** `npx vitest related src/app/api/admin/pipelines/[slug]/route.ts --run`
- [ ] **Atomic Commit.**
