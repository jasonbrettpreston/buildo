# Active Task: WF3 — fix mig 148 NULL-INSERT vs logic_variables.variable_value NOT NULL
**Status:** Implementation
**Workflow:** WF3 — CRIT CI blocker
**Domain Mode:** Backend/Pipeline

## Context
* **Goal:** Unblock `DB Integration Tests` CI (failing on every push to main since `6871dda`).
* **Root cause:** `migrations/148_lifecycle_seq_bands_logic_variables.sql:75` INSERTs `NULL` into `logic_variables.variable_value` when `rows_count IS NULL OR rows_count = 0` (the "no upper bound" sentinel). But `logic_variables.variable_value` was declared `DECIMAL NOT NULL` in mig 092:29.
* **Evidence:** CI log from run 26128072381 — `FAILED: null value in column "variable_value" of relation "logic_variables" violates not-null constraint` at mig 148.
* **Design intent verified:** comment at mig 148:75 says "v4 fold v3-G-CRIT-formula: NULL == 'no upper bound'". JS consumer at `scripts/quality/assert-lifecycle-phase-distribution.js:206-212` reads `logicVars[maxKey] != null ? Number(...) : null` — design assumes nullable. Regression-lock test at `src/tests/migration-148-lifecycle-seq-bands.infra.test.ts:59` explicitly mandates `THEN NULL` (rejecting `999999` sentinel). The schema is the gap.

## Fix
Prepend an `ALTER TABLE logic_variables ALTER COLUMN variable_value DROP NOT NULL;` to mig 148 UP section, so the design works end-to-end. Non-destructive (just relaxes a constraint; existing rows unaffected).

## Why mig 148 not a new mig 158
- 158 would run AFTER 148; 148 would still fail first → CI never reaches 158.
- Mig 148 has never successfully applied anywhere (CI failed every time since it landed; dev/staging same batch).
- migrate.js drift handling: warn-skip on re-encounter; safe for any environment that somehow did apply it.

## Execution Plan
- [x] Trace root cause via CI log
- [ ] Edit mig 148: prepend ALTER COLUMN
- [ ] Update mig 148 SQL-shape test if needed (verify no test asserts NOT NULL anywhere)
- [ ] Run typecheck + relevant tests locally
- [ ] Independent code-reviewer review (per project review protocol)
- [ ] Commit + push
- [ ] Monitor CI run

## Operating Boundaries
- Target files: `migrations/148_lifecycle_seq_bands_logic_variables.sql` (+1 line in UP section)
- Out of scope: changing the regression-lock test (the NULL semantic remains correct); changing JS-side band consumption; mig 149-157.
