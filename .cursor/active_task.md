# Active Task: WF3-S2 — geocode-permits.js paired UPDATE atomicity
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `164e70af`

## Context
* **Goal:** Wrap the two paired pool.query UPDATEs in scripts/geocode-permits.js
  (main geocode at line 51 + zombie cleanup at line 70) in a single
  pipeline.withTransaction so a dashboard read between them cannot observe
  inconsistent coordinate state (geocoded + zombie not-yet-cleared).
* **Target Spec:** docs/specs/pipeline/47_pipeline_script_protocol.md §7.6
* **Key Files:**
  - scripts/geocode-permits.js              (MODIFY — wrap 2 UPDATEs in withTransaction)
  - src/tests/geocode-permits.infra.test.ts (NEW — rollback + atomicity assertion)

## Technical Implementation
* **New/Modified Components:**
  - scripts/geocode-permits.js — extract geocodePermits(pool, pl) testable fn;
    wrap two UPDATE queries in pipeline.withTransaction
  - src/tests/geocode-permits.infra.test.ts — dependency-injection tests
* **Database Impact:** NO — transaction-boundary change only.
* **Backwards compatibility:** Re-run is idempotent (IS DISTINCT FROM guards on both UPDATEs).

## Execution Plan
- [x] **Rollback Anchor:** `164e70af`
- [x] **State Verification:** Two bare pool.query UPDATEs at lines 51–77 with no
      BEGIN/COMMIT. Comment at line 50 incorrectly claims "Single UPDATE is inherently
      atomic" — there are actually two. The zombie cleanup is a separate mutation.
- [x] **Spec Review:** §7.6 — paired mutations affecting the same rows must share a txn.
- [ ] **Reproduction:** Failing test asserts zombie-cleanup failure rolls back main geocode.
- [ ] **Red Light:** Must fail.
- [ ] **Fix:** Extract geocodePermits(pool, pl); wrap both UPDATEs in pl.withTransaction.
- [ ] **Pre-Review Self-Checklist:**
      1. Lock-hold: 2 bulk UPDATEs (set-based, not per-row). Fast.
      2. Idempotency: IS DISTINCT FROM guard on geocode; WHERE geocoded_at IS NOT NULL on zombie.
      3. Batch boundary: tight 2-statement block, not a streaming loop.
- [ ] **Green Light:** npm run test && npm run lint -- --fix && npm run typecheck
