# Active Task: Fix classify-permits.js — 3 bugs
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `3a074ee`

## Context
* **Goal:** Fix 3 bugs in the trade classification script: N+1 ghost cleanup, rowCount metric inaccuracy, and hardcoded VACUUM
* **Target Spec:** `docs/specs/pipeline/80_taxonomies.md`
* **Key Files:** `scripts/classify-permits.js`, `src/tests/classification.logic.test.ts`

## Bug Inventory
| # | Bug | Severity | Verdict |
|---|-----|----------|---------|
| 1 | N+1 Ghost Trade Cleanup | HIGH | **CONFIRMED** — Lines 660-669: individual DELETE per permit inside a for loop while holding a transaction lock. 900 permits = 900 sequential round-trips. Fix: batch with unnest(). |
| 2 | rowCount Trap | MEDIUM | **CONFIRMED** — Line 641: `dbUpdated += result.rowCount` accumulates the raw rowCount from ON CONFLICT DO UPDATE upserts. Use RETURNING to count actual mutations accurately. |
| 3 | Hardcoded VACUUM | MEDIUM | **CONFIRMED** — Line 706: `VACUUM ANALYZE permit_trades` causes I/O spikes, ties up connection pool. PostgreSQL autovacuum handles this. Remove. |

## Technical Implementation
* **Fix 1:** Replace the for-loop DELETE with a single bulk DELETE using unnest() of parallel arrays (permit_nums, revision_nums, trade_id arrays). This matches the already-correct pattern used for zero-match cleanup at lines 675-684.
* **Fix 2:** Add `RETURNING permit_num` to the upsert and use `result.rows.length` instead of `result.rowCount`.
* **Fix 3:** Remove `VACUUM ANALYZE permit_trades` line entirely.

## Standards Compliance
* **Try-Catch Boundary:** N/A — pipeline script, SDK handles errors
* **Unhappy Path Tests:** N/A — infrastructure fixes, not logic changes
* **logError Mandate:** N/A — uses pipeline SDK logging
* **Mobile-First:** N/A — backend script

## Execution Plan
- [ ] **Rollback Anchor:** `3a074ee`
- [ ] **State Verification:** Confirmed N+1 loop, rowCount accumulation, VACUUM call
- [ ] **Spec Review:** Script correctly implements classification logic; bugs are infrastructure-only
- [ ] **Reproduction:** Create failing tests
- [ ] **Red Light:** Run tests — must fail
- [ ] **Fix:** Modify classify-permits.js
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6
