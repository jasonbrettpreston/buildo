# Active Task: Phase 2 — Classifier State Machine Upgrade
**Status:** Planning
**Workflow:** WF1 — New Feature Genesis
**Domain Mode:** **Backend/Pipeline**

---

## Context
* **Goal:** Upgrade the lifecycle classifier from a static state-reporter into a time-tracking state machine. When a permit's `lifecycle_phase` changes (e.g., P11 → P12), the classifier must: (a) stamp `phase_started_at = NOW()` on the permit, (b) write a row to `permit_phase_transitions`, and (c) backfill `phase_started_at` for all 243K existing permits using best-available proxies. The critical invariant is: `phase_started_at` must ONLY update when the phase actually changes — not every nightly run — so countdown math never resets.
* **Why now:** Phase 1 (commit `258c5aa`) created the schema infrastructure. Without Phase 2 populating it, the tables are empty shells. Phases 3 (calibration) and 4 (forecasting) cannot start until transition data is flowing.
* **Target Spec:** `docs/reports/lifecycle_phase_implementation.md`
* **Key Files:** `scripts/classify-lifecycle-phase.js`, `src/tests/classify-lifecycle-phase.infra.test.ts`

## Technical Implementation

### Change 1: Modify `buildPermitUpdateSQL` to conditionally stamp `phase_started_at`

The current SQL:
```sql
UPDATE permits p
   SET lifecycle_phase = v.phase,
       lifecycle_stalled = v.stalled,
       lifecycle_classified_at = NOW()
  FROM (VALUES ...) AS v(permit_num, revision_num, phase, stalled)
 WHERE p.permit_num = v.permit_num
   AND p.revision_num = v.revision_num
   AND (p.lifecycle_phase IS DISTINCT FROM v.phase
        OR p.lifecycle_stalled IS DISTINCT FROM v.stalled)
```

**New SQL** adds a CASE for `phase_started_at`:
```sql
UPDATE permits p
   SET lifecycle_phase = v.phase,
       lifecycle_stalled = v.stalled,
       lifecycle_classified_at = NOW(),
       phase_started_at = CASE
         WHEN p.lifecycle_phase IS DISTINCT FROM v.phase
         THEN NOW()
         ELSE p.phase_started_at   -- keep existing anchor
       END
  FROM (VALUES ...) AS v(...)
 WHERE ...same IS DISTINCT FROM guard...
```

The `IS DISTINCT FROM` in the WHERE ensures only rows with actual changes are UPDATEd. The inner CASE further discriminates: if ONLY `lifecycle_stalled` changed (but phase is the same), `phase_started_at` is preserved. Only a real phase transition resets the clock.

### Change 2: Write transition rows to `permit_phase_transitions`

After each batch UPDATE, collect the rows that had a phase change (not just a stalled change) and INSERT into `permit_phase_transitions`. The classifier already knows the new phase (`v.phase`) and can capture the old phase by including `p.lifecycle_phase` as a RETURNING column from the UPDATE, or by querying the batch result.

**Approach:** Modify the batch UPDATE to use `RETURNING permit_num, revision_num, (old phase)`. PostgreSQL's UPDATE...RETURNING can't directly return the pre-UPDATE value, so we use a CTE:

```sql
WITH old_phases AS (
  SELECT permit_num, revision_num, lifecycle_phase AS old_phase,
         permit_type, neighbourhood_id
    FROM permits
   WHERE (permit_num, revision_num) IN (VALUES ...)
),
do_update AS (
  UPDATE permits p
     SET lifecycle_phase = v.phase,
         lifecycle_stalled = v.stalled,
         lifecycle_classified_at = NOW(),
         phase_started_at = CASE
           WHEN p.lifecycle_phase IS DISTINCT FROM v.phase THEN NOW()
           ELSE p.phase_started_at
         END
    FROM (VALUES ...) AS v(permit_num, revision_num, phase, stalled)
   WHERE p.permit_num = v.permit_num
     AND p.revision_num = v.revision_num
     AND (p.lifecycle_phase IS DISTINCT FROM v.phase
          OR p.lifecycle_stalled IS DISTINCT FROM v.stalled)
  RETURNING p.permit_num, p.revision_num, p.lifecycle_phase AS new_phase
)
INSERT INTO permit_phase_transitions
  (permit_num, revision_num, from_phase, to_phase, transitioned_at, permit_type, neighbourhood_id)
SELECT du.permit_num, du.revision_num, op.old_phase, du.new_phase, NOW(),
       op.permit_type, op.neighbourhood_id
  FROM do_update du
  JOIN old_phases op USING (permit_num, revision_num)
 WHERE op.old_phase IS DISTINCT FROM du.new_phase
```

This is a single atomic CTE that: reads the old phase, writes the new phase, and logs the transition — all in one statement per batch. No round-trip between JS and SQL for the old value. The `WHERE old_phase IS DISTINCT FROM new_phase` filter at the INSERT level catches the case where only `lifecycle_stalled` changed (no transition to log).

### Change 3: Backfill `phase_started_at` for 243K existing permits

After the main classification loop, run a one-time backfill for permits that have `lifecycle_phase IS NOT NULL AND phase_started_at IS NULL`:

| Phase bucket | Proxy for `phase_started_at` |
|---|---|
| P7a/P7b/P7c/P7d | `issued_date` (exact — we know when it was issued) |
| P3-P6 | `application_date` (best available for pre-issuance) |
| P8 | `issued_date` (revision is post-issuance) |
| P9-P17 | Latest passed inspection_date from `permit_inspections` (already loaded in the rollup Map) |
| P18 | `issued_date` as fallback (generic active, no sub-stage data) |
| P19/P20 | `last_seen_at` (when we last observed the terminal status) |
| O1-O3 | `application_date` or `first_seen_at` |
| null (dead) | Leave NULL — dead permits don't need countdown math |

This runs ONCE — guarded by `WHERE phase_started_at IS NULL AND lifecycle_phase IS NOT NULL`. Subsequent runs only stamp `phase_started_at` on actual phase transitions (Change 1).

### Change 4: Backfill initial transition rows

For the 243K existing permits that already have a `lifecycle_phase`, write a single "initial classification" transition row with `from_phase = NULL`:

```sql
INSERT INTO permit_phase_transitions
  (permit_num, revision_num, from_phase, to_phase, transitioned_at, permit_type, neighbourhood_id)
SELECT permit_num, revision_num, NULL, lifecycle_phase, phase_started_at,
       permit_type, neighbourhood_id
  FROM permits
 WHERE lifecycle_phase IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM permit_phase_transitions t
      WHERE t.permit_num = permits.permit_num
        AND t.revision_num = permits.revision_num
   )
```

This also runs ONCE — the `NOT EXISTS` guard makes it idempotent.

* **New/Modified Components:** `scripts/classify-lifecycle-phase.js`
* **Data Hooks/Libs:** None (pure function unchanged — the state machine is in the pipeline script, not the classifier logic)
* **Database Impact:** YES — writes to existing `permits.phase_started_at` + `permit_phase_transitions`. No new columns/tables (Phase 1 already created them).

## Standards Compliance
* **Try-Catch Boundary:** CTE-based UPDATE+INSERT runs inside existing `pipeline.withTransaction` per-batch. Error propagation unchanged.
* **Unhappy Path Tests:** Infra shape tests for the new CTE pattern, transition INSERT guard, backfill idempotency guard.
* **logError Mandate:** N/A — uses pipeline.log.
* **Mobile-First:** N/A — backend-only.

## Execution Plan

- [ ] **Contract Definition:** N/A — no API changes.

- [ ] **Spec & Registry Sync:** Update target spec §2.3 with state-machine design. Run `npm run system-map`.

- [ ] **Schema Evolution:** N/A — Phase 1 already created the tables.

- [ ] **Test Scaffolding:** Update `src/tests/classify-lifecycle-phase.infra.test.ts` with:
  - Shape test: batch UPDATE SQL includes `phase_started_at = CASE` conditional stamp
  - Shape test: CTE includes `INSERT INTO permit_phase_transitions`
  - Shape test: backfill queries guarded by `phase_started_at IS NULL`
  - Shape test: initial transition INSERT guarded by `NOT EXISTS`

- [ ] **Red Light:** Run updated infra tests — must FAIL before implementation.

- [ ] **Implementation:**
  1. Rewrite `buildPermitUpdateSQL` to produce the CTE-based UPDATE+INSERT (Change 1+2)
  2. Update `flattenPermitBatch` to match new VALUES shape (still 4 params per row — no change needed since the CTE reads the VALUES the same way)
  3. Add backfill function for `phase_started_at` proxies (Change 3) — runs after the main dirty-permit loop, guarded by `WHERE phase_started_at IS NULL AND lifecycle_phase IS NOT NULL`
  4. Add initial transition backfill (Change 4) — runs after Change 3, guarded by `NOT EXISTS`
  5. Update `permitsUpdated` counter to distinguish phase changes vs stalled-only changes (for telemetry: `phase_transitions_logged` metric)
  6. Add `phase_transitions_logged` and `phase_started_at_backfilled` to PIPELINE_SUMMARY records_meta
  7. Update PIPELINE_META writes map to include `phase_started_at` + `permit_phase_transitions`

- [ ] **Auth Boundary & Secrets:** N/A.

- [ ] **Pre-Review Self-Checklist:**
  1. Does the CTE correctly capture the PRE-update phase via the `old_phases` sub-SELECT?
  2. Does the `IS DISTINCT FROM` filter in the transition INSERT correctly exclude stalled-only changes?
  3. Does the backfill use the correct proxy per phase bucket?
  4. Is the backfill idempotent? (Second run touches 0 rows)
  5. Does the initial transition backfill handle permits with `phase_started_at = NULL` gracefully? (It should use `COALESCE(phase_started_at, NOW())` for the transitioned_at)
  6. Does the per-batch transaction still wrap both the CTE UPDATE+INSERT and the classified_at stamp atomically?
  7. What happens on the first run after this upgrade? (243K permits have lifecycle_phase but phase_started_at=NULL — the backfill handles this)
  8. Does the CTE-based SQL stay under the 65535 param limit? (Same 4 params × 500 batch size = 2000 — well under)

- [ ] **Green Light:** `npm run test && npm run lint -- --fix && npm run typecheck`. All pass. Verify on live DB: (a) run classifier, (b) check `phase_started_at IS NOT NULL` count matches `lifecycle_phase IS NOT NULL` count, (c) check `permit_phase_transitions` row count > 0.

- [ ] **Independent + adversarial review agents** (parallel, isolated worktrees). Triage results, WF3 any fixes, defer remainder to review_followups.md.

- [ ] → WF6 review gate + atomic commit.

---

## §10 Compliance

- ✅ **DB:** No new columns/tables (Phase 1 covers). Writes to existing columns via guarded UPDATE. Backfill is idempotent (WHERE IS NULL guard). Per-batch transactions (bounded locks). Advisory lock (concurrency safe).
- ⬜ **API:** N/A
- ⬜ **UI:** N/A
- ⬜ **Shared Logic:** N/A — pure function unchanged; state machine logic lives in the pipeline script only.
- ✅ **Pipeline:** Uses Pipeline SDK · per-batch withTransaction · advisory lock · PIPELINE_SUMMARY + PIPELINE_META updated · idempotent backfill
