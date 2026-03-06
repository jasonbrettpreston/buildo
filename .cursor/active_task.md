# Active Task: WF3 — link_similar 0% funnel + failed steps don't flash
**Status:** Planning

## Context
* **Goal:** (1) link_similar shows 0% with zero baseline matched — investigate why records_total is 0. (2) COA step failed and isn't flashing — failed status short-circuits before staleness check, and tileFlash only triggers on Aging/Stale labels.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `src/components/FreshnessTimeline.tsx` (getStatusDot, tileFlash)
  - `src/lib/admin/funnel.ts` (link_similar funnel)
  - `scripts/link-similar.js` (PIPELINE_SUMMARY)
* **Rollback Anchor:** `8b7d93d`

## State Verification (Root Cause Analysis)

### Bug 1: link_similar shows 0% matched
- **Root cause:** The funnel's `matchCount` for link_similar uses `lastRunRecordsTotal` (line 426 in funnel.ts), which comes from the PIPELINE_SUMMARY emitted by `link-similar.js`. The script reports `records_total: propagated + demFixed`. If the propagation query matched 0 companion permits, `records_total = 0` → `matchPct = 0%`.
- This could happen legitimately if:
  - `classify_scope_tags` hasn't populated `scope_tags` on any BLD permits yet
  - There are no companion permits (PLB/MS/DM etc.) in the database
  - The regex pattern doesn't match the permit_num format
- **However**, the funnel is also misleading: it shows `matchCount = records_total` (propagated count) against `matchDenominator = active_permits`. That makes "0 of 237K matched" look like a failure, when really it should show the companion permit count or the number with propagated tags.
- **Fix:** The funnel for link_similar should use a DB-sourced count (permits with `scope_source = 'propagated'`) rather than relying solely on last-run records_total. But that requires a new stat. Simpler: change baselineTotal/matchDenominator to be based on `lastRunRecordsTotal` so it shows "X of X matched" when data exists, and show a "No data — run pipeline first" message when null.
- **Actually simplest correct fix:** The real metric for link_similar is "how many companion permits got scope tags propagated". Use `records_total` as both baseline and match when available. When `records_total` is null (never run), show 0%. This accurately represents what the step does.

### Bug 2: Failed COA step doesn't flash
- **Root cause:** `getStatusDot()` (line 242) returns `{ label: 'Failed' }` immediately when `info.status === 'failed'`, short-circuiting the time-based check. The `tileFlash` logic only triggers on `label === 'Aging'` or `label === 'Stale'`. Failed steps get a static red dot but no tile flash.
- **Fix:** Add `'Failed'` to the `tileFlash` conditions. Failed steps deserve the most attention. Use `tile-flash-stale` (red pulse) for failed steps too.

## Standards Compliance
* **Try-Catch Boundary:** No new routes.
* **Unhappy Path Tests:** Test failed steps get tile flash. Test link_similar funnel with null records.
* **Mobile-First:** CSS-only changes.

## Execution Plan
- [x] **Rollback Anchor:** `8b7d93d`
- [ ] **Fix 1:** Update link_similar funnel to handle 0/null records_total gracefully
- [ ] **Fix 2:** Add 'Failed' to tileFlash conditions so failed steps flash red
- [ ] **Green Light:** All tests pass
- [ ] **Atomic Commit**
