# Active Task: Fix review_followups.md — batch failure accounting + purge-lead-views manifest
**Status:** Implementation
**Workflow:** WF3 — Bug Fix (batch)
**Domain Mode:** **Backend/Pipeline**

## Context
* **Goal:** Fix 2 actionable OPEN bugs from review_followups.md after Phase 6 completion.
* **Target Spec:** `docs/specs/pipeline/40_pipeline_system.md`, `docs/specs/product/future/72_lead_cost_model.md`
* **Key Files:** `scripts/compute-cost-estimates.js`, `scripts/manifest.json`
* **Rollback Anchor:** `df8371a`

## Bug 1 — HIGH: Batch failure accounting (line 668)
`compute-cost-estimates.js` — when `flushBatch` throws (lines 381/397), `inserted`/`updated` counters don't include the failed batch's rows, but `records_total` (from `processed`) does. This creates an asymmetry in `emitSummary`: total says 237K processed but new+updated only sum to 235K with no indication of failure.
**Fix:** Track `failedBatches` + `failedRows` counters, include in `records_meta`.

## Bug 2 — MED (partial): purge-lead-views.js not in manifest (line 211)
The file exists (created 2026-04-09) but is not registered in `scripts/manifest.json`. No chain placement needed yet (it's a standalone retention script), but manifest registration is required per §9.6.
**Fix:** Add manifest entry. No chain placement — runs standalone via cron/manual.

## Execution Plan
- [x] **Rollback Anchor:** `df8371a`
- [ ] **Fix 1:** Add failedBatches/failedRows tracking to compute-cost-estimates.js
- [ ] **Fix 2:** Register purge-lead-views.js in manifest.json
- [ ] **Tests:** Verify existing tests pass + add source-grep test for failed batch tracking
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`
- [ ] **Update review_followups.md:** Close both items
