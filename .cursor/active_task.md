# Active Task: Fix critical bugs in classify-lifecycle-phase.js + assert-lifecycle-phase-distribution.js
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `6f45012` (feat(75_lead_feed_implementation): lifecycle phase classifier V1 + review hardening)
**Domain Mode:** **Backend/Pipeline**

---

## Context
* **Goal:** Fix 10 bugs across the classifier and assertion scripts identified by external code review. The most dangerous bug is the advisory lock using `pool.query` (ephemeral connections) which can lose the lock mid-run due to the pool's 10-second idle timeout during the 20-60s CPU-bound Map-building phase. Other bugs include silent cross-check passes (SQL NOT IN ignores NULL), object-spread key collisions, missing CoA unclassified checks, a too-strict Strangler Fig cross-check, and hardcoded dead-status lists in 3 places.
* **Target Spec:** `docs/reports/lifecycle_phase_implementation.md`
* **Key Files:** `scripts/classify-lifecycle-phase.js`, `scripts/quality/assert-lifecycle-phase-distribution.js`, `scripts/lib/lifecycle-phase.js`

## Technical Implementation
* **New/Modified Components:** None
* **Data Hooks/Libs:** `scripts/lib/lifecycle-phase.js` (export DEAD_STATUS_ARRAY for SQL interpolation)
* **Database Impact:** NO

## Standards Compliance
* **Try-Catch Boundary:** Both scripts already use pipeline.run + try/finally. Advisory lock now uses dedicated client with explicit release.
* **Unhappy Path Tests:** Infra shape tests updated to lock the new patterns (dedicated client, SQL rollup, NOT IN + IS NULL guards).
* **logError Mandate:** N/A — both scripts use pipeline.log.
* **Mobile-First:** N/A — backend-only.

## Execution Plan

- [ ] **Rollback Anchor:** `6f45012`

- [ ] **State Verification:**
  - Confirm pg Pool default `idleTimeoutMillis` is 10000ms (the root cause of the lock-reap bug)
  - Confirm `scripts/lib/lifecycle-phase.js` exports `DEAD_STATUS_SET` (verified: line 364)
  - Confirm the classifier spends 20-60s on CPU-bound Map building between the lock acquire and the first batch UPDATE — this is the idle-timeout danger window

- [ ] **Spec Review:** Read `docs/reports/lifecycle_phase_implementation.md` §2.3 (classifier) + §3.3 (distribution assertion)

- [ ] **Reproduction:** The pool.query advisory-lock bug is structural (code review, not runtime). The NOT IN + NULL bug can be demonstrated by inserting a row with lifecycle_phase=NULL + enriched_status='Permit Issued' and running the cross-check query. Add test assertions for both patterns.

- [ ] **Red Light:** Shape test assertions for the new patterns must FAIL before the fix.

- [ ] **Fix — classify-lifecycle-phase.js (5 changes):**
  1. **Advisory lock: dedicated client.** `pool.connect()` → `client.query(pg_try_advisory_lock)` → hold client for entire run → `client.query(pg_advisory_unlock)` → `client.release()` in finally. The dedicated client is immune to idle-timeout reaping because it's checked out, not idle.
  2. **Inspection rollup: SQL aggregation.** Replace the full-table-load + JS-side rollup with a SQL query using `DISTINCT ON` + `GROUP BY`:
     ```sql
     WITH latest_passed AS (
       SELECT DISTINCT ON (permit_num) permit_num, stage_name
       FROM permit_inspections WHERE status='Passed'
       ORDER BY permit_num, inspection_date DESC NULLS LAST
     ),
     rollup AS (
       SELECT permit_num,
              MAX(inspection_date) AS latest_inspection_date,
              BOOL_OR(status='Passed') AS has_passed_inspection
       FROM permit_inspections GROUP BY permit_num
     )
     SELECT r.permit_num, lp.stage_name AS latest_passed_stage,
            r.latest_inspection_date, r.has_passed_inspection
     FROM rollup r LEFT JOIN latest_passed lp USING (permit_num)
     ```
     Node receives ~10K rows (one per permit with inspections) instead of 94K raw rows.
  3. **CoA unclassified check.** Add a secondary query counting coa_applications with `lifecycle_phase IS NULL AND decision NOT IN (dead set) AND decision IS NOT NULL`. Sum into `unclassifiedCount`.
  4. **Dead status list: import from shared lib.** Replace the 2 hardcoded `NOT IN (...)` SQL lists with a dynamically built `$N` parameterized list from `require('./lib/lifecycle-phase').DEAD_STATUS_SET`.
  5. **Document watermark race.** Add a code comment explaining the best-effort incremental pattern and why the race is acceptable (next run re-classifies with fresh data).

- [ ] **Fix — assert-lifecycle-phase-distribution.js (5 changes):**
  1. **Object spread: explicit summing.** Replace `{ ...permitCounts, ...coaCounts }` with an additive merge that sums shared keys (the `null` key is the collision vector).
  2. **NOT IN + IS NULL: fix 3 cross-check queries.** Add `OR lifecycle_phase IS NULL` to cross-check 2 (`Active Inspection`) and cross-check 3 (`Permit Issued`). Cross-check 1 (`Stalled`) uses `lifecycle_stalled = false` (boolean, not IN), so no change needed there.
  3. **CoA unclassified check.** Add a secondary query mirroring the classifier's CoA dead-decision set. Sum into `unclassifiedCount`.
  4. **Strangler Fig stalled cross-check: FAIL → WARN.** The new classifier uses more accurate date math than the legacy `enriched_status='Stalled'` column. Holding the new logic hostage to legacy bugs is counterproductive. Change to WARN with threshold < 1000 before escalating to FAIL.
  5. **Advisory lock awareness.** Add `pg_try_advisory_lock(85)` check at the top. If the classifier is mid-write, skip the assertion with an INFO log and `skipped:true` summary (same pattern as the classifier's own skip).
  6. **Dead status list: import from shared lib.** Same fix as the classifier — parameterized list from `DEAD_STATUS_SET`.

- [ ] **Fix — scripts/lib/lifecycle-phase.js (1 change):**
  1. Export `DEAD_STATUS_ARRAY` (a plain `[...DEAD_STATUS_SET]` frozen array) alongside the existing Set export, so SQL interpolation in both scripts can use `$1::text[]` parameterization instead of string concat.

- [ ] **Pre-Review Self-Checklist:**
  1. Does the dedicated client survive the 20-60s idle window without being reaped?
  2. Does the SQL inspection rollup produce the same Map shape as the JS-side rollup?
  3. Does the NOT IN + IS NULL fix actually catch rows where lifecycle_phase is NULL?
  4. Does the object-spread fix correctly sum the `null` key from both tables?
  5. Does the advisory lock skip in the assertion script produce a valid pipeline_runs row?
  6. Is the DEAD_STATUS_ARRAY import used consistently in both scripts' SQL queries?
  7. Does downgrading stalled cross-check to WARN still catch massive divergences (> 1000)?

- [ ] **Green Light:** `npm run test && npm run lint -- --fix && npm run typecheck`. All pass. → WF6.

---

## §10 Compliance

- ⬜ **DB:** N/A — no schema changes
- ⬜ **API:** N/A — no route changes
- ⬜ **UI:** N/A — backend-only
- ✅ **Shared Logic:** DEAD_STATUS_ARRAY export added to the dual-code-path JS module
- ✅ **Pipeline:** Advisory lock uses dedicated client · inspection rollup in SQL · CoA unclassified check · dead-status list from shared source · NOT IN + IS NULL guards
