# Active Task: WF3 — 3 remaining db.test.ts fixture sync issues
**Status:** Implementation
**Workflow:** WF3 — CI unblock continuation
**Domain Mode:** Backend/Pipeline

## Context
After commit ba85cce fixed 4 db.test.ts schema-drift issues, CI run 26132371073 surfaced 3 more from the same migration batch:

1. `compute-opportunity-scores.db.test.ts:101,162` — `cost_estimates.cost_source` NOT NULL (mig 071); both seed INSERTs omit the column → 23502.
2. `lead-inspect-query.db.test.ts:265` — `ON CONFLICT (permit_type, phase)` on `phase_stay_calibration`, but mig 147 dropped that PK; replacement is a partial unique index `phase_stay_calibration_permit_legacy_unique` ON (permit_type, phase) WHERE permit_type IS NOT NULL.
3. `lead-inspect-query.db.test.ts:333` — `lifecycle.phase_name=null`. Downstream of #2: when the timeline test's seed throws at line 265, the `UPDATE permits SET lifecycle_phase='P7c'` (line 281) never runs, so the phase_name test that calls fetchLeadInspect afterward sees no lifecycle_phase. Fix #2 should auto-resolve #3.

## Fix scope
- Provide `cost_source='permit'` in both compute-opportunity-scores INSERTs.
- Change phase_stay_calibration ON CONFLICT to use the partial-index target with WHERE predicate.

## Execution Plan
- [ ] compute-opportunity-scores: add cost_source to both INSERTs
- [ ] lead-inspect-query: switch phase_stay_calibration ON CONFLICT to partial-index syntax
- [ ] Typecheck + relevant local tests
- [ ] Commit + push, monitor CI

## Operating Boundaries
- Target: 2 test files in `src/tests/db/`
- Out of scope: rewriting tests; migration edits; skipping tests
