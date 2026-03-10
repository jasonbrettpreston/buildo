# Active Task: Fix steps not flashing blue when pipeline is running
**Status:** Planning

## Context
* **Goal:** Steps in the FreshnessTimeline don't show blue flash/running state while a chain is executing. Root cause: the 5-second polling calls `fetchData()` which fetches BOTH `/api/quality` and `/api/admin/stats` (30+ parallel SQL queries). When pipelines are active, these APIs take >10s, exceeding `FETCH_TIMEOUT_MS = 10_000`, so the poll returns null. `runningPipelines` never gets updated with individual step scoped keys → no blue flash.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md` (line 25: "Dashboard polls every 5s while any pipeline is running") and `docs/specs/37_pipeline_system.md` (§4.3: step tracking via `{chain}:{step}` scoped keys)
* **Key Files:**
  - MODIFY: `src/components/DataQualityDashboard.tsx` — change polling to use lightweight endpoint instead of full `fetchData()`
  - CREATE: `src/app/api/admin/pipelines/status/route.ts` — lightweight endpoint returning only `pipeline_last_run` from `pipeline_runs` table (single fast query)
  - MODIFY: `src/tests/quality.infra.test.ts` — add test for new status endpoint

## Technical Implementation
### New lightweight endpoint: `GET /api/admin/pipelines/status`
Returns ONLY the `DISTINCT ON (pipeline)` query from `pipeline_runs` — the same query currently embedded in `/api/admin/stats` (lines 212-217), but without the 30+ count queries. Single fast query (~5ms even under load).

Response shape:
```typescript
{ pipeline_last_run: Record<string, { last_run_at: string | null; status: string | null; duration_ms: number | null; error_message: string | null; records_total: number | null; records_new: number | null; records_updated: number | null; records_meta: Record<string, unknown> | null; }> }
```

### Polling change in `DataQualityDashboard.tsx`
The existing polling loop (lines 296-329) calls `fetchData()` which fetches both APIs. Change it to:
1. During polling (`runningPipelines.size > 0`), fetch ONLY `/api/admin/pipelines/status`
2. Update `runningPipelines` from the lightweight response
3. Also update `stats.pipeline_last_run` so the FreshnessTimeline renders correctly
4. After all running pipelines complete (runningPipelines becomes empty), call full `fetchData()` once to refresh all dashboard data

## Standards Compliance
*(Fill in ALL items below. Mark inapplicable ones as N/A.)*
* **Try-Catch Boundary:** New API route gets overarching try-catch with `logError('[admin/pipelines/status]', err, { handler: 'GET' })`. The `pipeline_runs` table may not exist — empty object fallback.
* **Unhappy Path Tests:** Test that polling endpoint returns `pipeline_last_run` key. Test response when `pipeline_runs` table is empty (returns `{}`).
* **logError Mandate:** New catch block uses `logError('[admin/pipelines/status]', err, { handler: 'GET' })`.
* **Mobile-First:** N/A — no UI layout changes. Only polling behavior changes.

## §10 Compliance
### If Database Impact = YES:
⬜ N/A — no schema changes

### If API Route Created/Modified:
- [x] Request/Response TypeScript interface defined BEFORE implementation: `{ pipeline_last_run: Record<string, PipelineRunInfo> }`
- [x] Overarching try-catch with `logError('[admin/pipelines/status]', err, { handler: 'GET' })` (§2.2, §6.1)
- [x] Unhappy-path test cases: empty pipeline_runs → `{}`, normal response shape validated
- [x] Route guarded in `src/middleware.ts` — inherits existing `/api/admin/*` guard (§4.1)
- [x] No `.env` secrets exposed to client components

### If UI Component Created/Modified:
⬜ N/A — only polling logic, no layout changes

### If Shared Logic Touched:
⬜ N/A

### If Pipeline Script Created/Modified:
⬜ N/A

## Execution Plan
- [ ] **Rollback Anchor:** Current commit `590b570`.
- [ ] **State Verification:** Polling calls `fetchData()` which fetches both `/api/quality` + `/api/admin/stats`. Stats API >10s under pipeline load (verified via curl timeout during manual testing). `FreshnessTimeline` checks `runningPipelines.has(scopedKey)` at line 481 — set is never populated because poll fetch times out.
- [ ] **Spec Review:** `28_data_quality_dashboard.md` line 25 mandates 5s polling. `37_pipeline_system.md` §4.3 documents `{chain}:{step}` scoped keys in `pipeline_runs`. Spec §4.6 documents cancellation check between steps.
- [ ] **Reproduction:** Write infra test asserting `GET /api/admin/pipelines/status` returns `pipeline_last_run` key with correct shape.
- [ ] **Red Light:** Run test. MUST fail (endpoint doesn't exist yet).
- [ ] **Fix:**
  1. Create `src/app/api/admin/pipelines/status/route.ts` — lightweight `DISTINCT ON (pipeline)` query returning `{ pipeline_last_run: Record<string, PipelineRunInfo> }`
  2. In `DataQualityDashboard.tsx`, add `pollPipelineStatus()` function that fetches only `/api/admin/pipelines/status`
  3. Change polling `setInterval` to call `pollPipelineStatus()` instead of `fetchData()`
  4. Merge the lightweight response into `stats.pipeline_last_run` so FreshnessTimeline re-renders
  5. After `runningPipelines` becomes empty, call full `fetchData()` once to refresh all dashboard data
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
      Output visible execution summary using ✅/⬜ for every step above. → WF6.
