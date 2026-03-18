# Active Task: Fix 4 analytics query bugs — date_trunc, schema ghost, sync_runs, N+1
**Status:** Implementation
**Rollback Anchor:** `8f94a0b`
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** Fix 4 bugs in `src/lib/analytics/queries.ts`: (1) date_trunc parameterization crash, (2) permit_trades.trade_name ghost column, (3) sync_runs stale data source, (4) N+1 correlated subquery in getTopBuilders.
* **Target Spec:** `docs/specs/23_analytics.md`
* **Key Files:**
  - `src/lib/analytics/queries.ts` — all 4 fixes
  - `src/tests/analytics.logic.test.ts` — update test for groupBy interpolation

## Technical Implementation
* **Bug 1 (date_trunc):** Interpolate `groupBy` directly into SQL (safe — typed as `'day'|'week'|'month'`). Shift params to `$1, $2`.
* **Bug 2 (trade_name):** JOIN `trades t ON pt.trade_id = t.id`, use `t.name AS trade_name`.
* **Bug 3 (sync_runs):** Point `getPermitTrends` at `pipeline_runs WHERE pipeline = 'permits'`.
* **Bug 4 (N+1):** Replace correlated subquery with single-pass JOIN + GROUP BY.
* **Database Impact:** NO

## §10 Plan Compliance Checklist
- ⬜ DB — N/A
- ⬜ API — N/A (queries called by routes, but routes unchanged)
- ⬜ UI — N/A
- ⬜ Shared Logic — N/A
- ⬜ Pipeline — N/A

## Execution Plan
- [ ] **Rollback Anchor:** `8f94a0b`
- [ ] **State Verification:** All 4 bugs confirmed by code review
- [ ] **Fix:** Patch all 4 queries + update test assertion for groupBy
- [ ] **Green Light:** typecheck + test pass → WF6
