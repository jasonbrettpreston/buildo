# Active Task: WF3 — fix 4 db-test/schema drift findings surfaced by CI 26131978346
**Status:** Implementation
**Workflow:** WF3 — CRIT CI blocker continuation
**Domain Mode:** Backend/Pipeline

## Context
Mig 148 NULL-NOT-NULL fix (commit 3c50b6c) unblocked migrations. Next CI run surfaced 4 real test failures — tests written against earlier schema states, never updated when migrations 145/153 shifted constraints:

1. `lifecycle-status-history-writers.db.test.ts:254` — uses `ON CONFLICT ON CONSTRAINT uniq_lifecycle_status_history_natural_key` but mig 127:58 created it as an INDEX, not a CONSTRAINT (PG 42704).
2. `lead-inspect-query.db.test.ts:132` — uses `ON CONFLICT (permit_num, revision_num)` on cost_estimates, but mig 145 swapped PK to `lead_id` (PG 42P10).
3. `compute-opportunity-scores.db.test.ts:92,154` — explicitly sets `urgency=NULL` in INSERT, but `trade_forecasts.urgency` is NOT NULL with a default; explicit NULL bypasses default (PG 23502).
4. `109_fk_hardening.db.test.ts:192,202` — asserts `fk_tracked_projects_permits` CASCADE/reject behavior, but mig 153 dropped that FK entirely so CoA leads (no permit) can insert.

## Fix scope
Bundle of 4 test-side adjustments (no migration changes; the migrations correctly reflect current design). Each test updated to match the schema mig 145/153 left behind.

## Execution Plan
- [x] Root cause traced via annotations API
- [ ] lifecycle-status-history-writers: change ON CONFLICT to expect-throw pattern
- [ ] lead-inspect-query: change ON CONFLICT to `(lead_id)` per mig 145 PK
- [ ] compute-opportunity-scores: omit urgency from INSERT (let DB default apply)
- [ ] 109_fk_hardening: invert the 2 FK assertions (no FK → INSERT succeeds, no CASCADE → row persists)
- [ ] Run typecheck + relevant tests locally
- [ ] Commit + push, monitor CI

## Operating Boundaries
- Target files: 4 test files in `src/tests/db/`
- Out of scope: any migration edits; converting INDEX→CONSTRAINT in mig 127 (would require new migration; current fix doesn't need it).
