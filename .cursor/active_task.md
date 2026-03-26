# Active Task: Fix link-wsib Tier 3 fuzzy query performance (OR trap)
**Status:** Planning
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** `link_wsib` Tier 3 fuzzy query went from ~4 min to ~30 min between Mar 13–22. The `OR`-based similarity join prevents PostgreSQL from using GIN trigram indexes, causing a nested loop over 107K × 3.6K rows (~394M similarity calls). This eats the chain's time budget and causes downstream `classify_permits` to get killed by the 2h chain timeout.
* **Target Spec:** `docs/specs/28_data_quality_dashboard.md`
* **Key Files:**
  - `scripts/link-wsib.js` — Tier 3 `TIER3_CTE` (lines 47–61)
  - `src/tests/quality.logic.test.ts` — pipeline tests

## Technical Implementation
* **Root Cause:** The `TIER3_CTE` joins `wsib_registry` to `entities` using `similarity(col_a, e.name) > 0.6 OR similarity(col_b, e.name) > 0.6`. The `OR` defeats GIN trigram index use. PostgreSQL falls back to a nested loop sequential scan.
* **Fix:** Split the `OR` into two separate CTEs (`trade_matches`, `legal_matches`) using the `%` operator in the `ON` clause (triggers GIN index scan), then `UNION ALL` + `DISTINCT ON`. The `%` operator uses the default similarity threshold (0.3) as a candidate filter; the explicit `similarity() > 0.6` in the WHERE clause applies the real threshold.
* **Database Impact:** NO
* **New/Modified Components:** `scripts/link-wsib.js` (TIER3_CTE rewrite)

## Standards Compliance
* **Try-Catch Boundary:** N/A — pipeline script, not API route
* **Unhappy Path Tests:** Existing chain.logic tests cover link_wsib execution
* **logError Mandate:** N/A — pipeline script uses pipeline.log
* **Mobile-First:** N/A — backend script

## Execution Plan
- [x] **Rollback Anchor:** `13bdfb8`
- [ ] **State Verification:** Confirm 107K unlinked WSIB records, existing GIN indexes, current query runtime
- [ ] **Spec Review:** Read spec 28 for WSIB linking behavior (3-tier cascade)
- [ ] **Reproduction:** Benchmark current Tier 3 query to confirm ~30 min runtime
- [ ] **Red Light:** N/A — this is a perf fix, not a logic change. Existing tests must still pass.
- [ ] **Fix:** Replace `TIER3_CTE` with split UNION approach using `%` operator
- [ ] **Benchmark:** Run new query to confirm < 2 min runtime
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6
