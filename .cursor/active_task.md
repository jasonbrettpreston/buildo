# Active Task: Fix PIPELINE_SUMMARY — route captures worker summary, not orchestrator aggregate
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `117d3d66`

## Context
* **Goal:** When the orchestrator spawns 5 workers, each worker emits PIPELINE_SUMMARY to stdout. The orchestrator also emits its own aggregated PIPELINE_SUMMARY. But route.ts uses `stdout.match(/PIPELINE_SUMMARY:(.+)/)` which matches the FIRST occurrence. Workers stream their output through the orchestrator's stdout, so the last worker's summary may appear after the orchestrator's. Need to capture the LAST PIPELINE_SUMMARY line instead of the first.
* **Target Spec:** `docs/specs/38_inspection_scraping.md`
* **Key Files:**
  - `src/app/api/admin/pipelines/[slug]/route.ts` — captures PIPELINE_SUMMARY
  - `scripts/aic-orchestrator.py` — emits aggregated summary

## Bug Description
1. `route.ts` line 224: `stdout.match(/PIPELINE_SUMMARY:(.+)/)` — matches FIRST occurrence
2. Workers stream PIPELINE_SUMMARY through orchestrator stdout before the orchestrator emits its own
3. Result: dashboard shows 1 worker's stats (10 attempted) instead of aggregate (50 attempted)

## Technical Implementation
* **Modified File:** `src/app/api/admin/pipelines/[slug]/route.ts`
  - Change regex match to capture the LAST `PIPELINE_SUMMARY` line, not the first
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** Existing
* **Unhappy Path Tests:** Test that last PIPELINE_SUMMARY is captured
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan
- [x] **Rollback Anchor:** `117d3d66`
- [x] **State Verification:** DB confirms run 1529 has worker summary (10 attempted) not aggregate (50)
- [x] **Spec Review:** Spec 38 — orchestrator emits aggregate after all workers complete
- [ ] **Reproduction:** Write failing test
- [ ] **Red Light:** Test fails
- [ ] **Fix:** Use last match instead of first
- [ ] **Green Light:** All tests pass → WF6
