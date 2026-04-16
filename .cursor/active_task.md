# Active Task: WF3-S3 — enrich-wsib.js cleanup-block squash
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `3e44218`

## Context
* **Goal:** Wrap the two cleanup UPDATEs in scripts/enrich-wsib.js (email scrub
  at ~line 776 + website scrub at ~line 788) in a single pipeline.withTransaction
  so a partial scrub (email cleared, website not yet cleared) is never visible
  to reads between them.
* **Target Spec:** docs/specs/pipeline/47_pipeline_script_protocol.md §7.6
* **Key Files:**
  - scripts/enrich-wsib.js              (MODIFY — extract runAutoCleanup + wrap UPDATEs)
  - src/tests/enrich-wsib.infra.test.ts (NEW — rollback + atomicity assertion)

## Technical Implementation
* **New/Modified Components:**
  - scripts/enrich-wsib.js — extract `runAutoCleanup(pool, opts)` with injectable
    withTransaction; add require.main guard; add module.exports
  - src/tests/enrich-wsib.infra.test.ts — dependency-injection tests
* **Database Impact:** NO — transaction-boundary change only.
* **Backwards compatibility:** Non-fatal outer try/catch preserved; behaviour
  identical on success path, cleaner on partial failure.

## Execution Plan
- [x] **Rollback Anchor:** `3e44218`
- [x] **State Verification:** Two bare pool.query UPDATEs inside a try/catch in
      `finalize()` at lines 771–802. No transaction wrapper.
- [x] **Spec Review:** §7.6 — paired mutations affecting the same rows must share a txn.
- [ ] **Reproduction:** Infra test asserts website-cleanup failure rolls back email cleanup.
- [ ] **Red Light:** Must fail.
- [ ] **Fix:** Extract runAutoCleanup(pool, opts); wrap both UPDATEs in withTransaction.
- [ ] **Pre-Review Self-Checklist (3 items):**
      1. Lock-hold: 2 bulk UPDATEs scoped to last 1 hour. Fast.
      2. Idempotency: WHERE clauses are idempotent (NULL-setting, ILIKE filter).
      3. Batch boundary: tight 2-statement block, not a loop.
- [ ] **Green Light:** npm run test && npm run lint -- --fix && npm run typecheck
