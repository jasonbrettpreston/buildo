# Active Task: WF5 DB Audit Follow-up — B3 + B1+B2+A4 + Annotation Sweep
**Status:** Completed
**Domain Mode:** Backend/Pipeline

---

## Review Protocol (applies to all three tasks)

Per `feedback_review_protocol.md` + user opt-in for adversarial on WF3:

| Step | Task 1 (WF3) | Task 2 (WF2) | Task 3 (WF2) |
|------|-------------|-------------|-------------|
| §12 Self-Review Walk | ✅ applicable sections | ✅ applicable sections | ✅ migration section |
| Independent review (worktree) | ✅ always | ✅ always | ✅ always |
| Gemini adversarial | ✅ user opted in | ✅ WF2 mandate | ✅ WF2 mandate |
| DeepSeek adversarial | ✅ user opted in | ✅ WF2 mandate | ✅ WF2 mandate |
| Triage → review_followups.md | ✅ | ✅ | ✅ |

**§12 scope for tooling scripts** (non-pipeline-chain scripts):
- Concurrency / Config & Validation / Atomicity / Writes / Time & Date / Streams → N/A (no advisory locks, no DB config loading, no writes/streams)
- NULL Safety → applicable to audit-fk-orphans.js queries
- Observability → applicable to audit-fk-orphans.js (emitSummary call)
- Constants → applicable (RELATIONSHIPS array, LARGE_TABLES list)
- Spec compliance → applicable (SPEC LINK header present in both files)
- Migration section → applicable to Task 3 (SQL files being annotated)

**Triage decision tree (per protocol):**
- **Real** → fix in a follow-up commit on top of the implementation commit before WF6
- **Defensible (per spec)** → explain rationale; mark WONTFIX in review_followups.md
- **Out-of-scope** → mark in review_followups.md as "future hardening WF" with severity LOW

---

## Task 1: WF3 — B3: Remove stale builder_contacts→builders from audit-fk-orphans.js

### Context

* **Goal:** Remove the `{ child: 'builder_contacts', parent: 'builders' }` Tier 1 entry from
  `scripts/quality/audit-fk-orphans.js`. Both tables dropped in migration 056. Stale entry
  causes ERROR rows in production CQA reports indistinguishable from real constraint violations.
* **Target Spec:** `docs/specs/00-architecture/01_database_schema.md`
* **Rollback Anchor:** `f44d95f`
* **Key Files:**
  - `scripts/quality/audit-fk-orphans.js` — remove entry; add `require.main` guard + `module.exports`
  - `src/tests/audit-fk-orphans.logic.test.ts` — new test file

### Technical Implementation

1. Add `if (require.main === module) { pipeline.run(...) }` guard — makes file safely `require()`-able in tests without triggering DB connection.
2. Add `module.exports = { RELATIONSHIPS }` at bottom.
3. Remove the 8-line `builder_contacts → builders` block (lines 73–80 in current file).
4. New test asserts:
   - No entry in RELATIONSHIPS references `builder_contacts` or `builders`
   - No duplicate child→parent+childCols key

### Database Impact: NO

### Standards Compliance
* **Try-Catch Boundary:** N/A
* **Unhappy Path Tests:** Test verifies absence of stale entries — regression if re-added
* **logError Mandate:** N/A
* **Mobile-First:** N/A
* **§12.10 Real-DB Tests:** N/A — static RELATIONSHIPS array test

### Execution Plan
```
- [ ] Rollback Anchor: f44d95f
- [ ] State Verification: confirm builder_contacts/builders absent in current DB schema
- [ ] Spec Review: 01_database_schema.md Tier classification rules
- [ ] Guardrail Test: write audit-fk-orphans.logic.test.ts — must FAIL (stale entry present)
- [ ] Red Light: npx vitest run src/tests/audit-fk-orphans.logic.test.ts
- [ ] Fix: remove entry; add require.main guard + module.exports
- [ ] Pre-Review Self-Checklist (3 items — see below)
- [ ] Green Light: npm run test && npm run lint -- --fix. All pass.
- [ ] §12 Self-Review Walk: Observability — emitSummary still called exactly once after fix?
      Constants — RELATIONSHIPS array no longer references dropped tables?
      Spec compliance — SPEC LINK header present?
      All other §12 sections: N/A (no advisory locks, no DB writes, no streams).
- [ ] Adversarial Reviews (parallel background — user opted in for WF3):
        node scripts/gemini-review.js review scripts/quality/audit-fk-orphans.js
        node scripts/deepseek-review.js review scripts/quality/audit-fk-orphans.js
        node scripts/gemini-review.js review src/tests/audit-fk-orphans.logic.test.ts
        node scripts/deepseek-review.js review src/tests/audit-fk-orphans.logic.test.ts
- [ ] Independent Review Agent: worktree isolation, self-generated checklist against
      01_database_schema.md Tier rules + audit-fk-orphans.js behavioral contract.
- [ ] Triage: Real → fix-commit; Defensible → WONTFIX; Out-of-scope → future WF.
- [ ] Append deferred findings to docs/reports/review_followups.md (section: Task1 commit SHA).
- [ ] WF6 Atomic Commit (after any Real fixes applied).
```

### Pre-Review Self-Checklist (walk before Green Light)
1. Does `pipeline.run` still execute correctly when file is run directly (`node scripts/quality/audit-fk-orphans.js`)?
2. Is ONLY the `builder_contacts → builders` entry removed — not `entity_contacts → entities` (still valid Tier 1)?
3. Does `module.exports = { RELATIONSHIPS }` appear after `pipeline.run` so it doesn't shadow the local `const`?

---

## Task 2: WF2 — B1+B2+A4: validate-migration.js hardening

### Context

* **Goal:** Fix two validator false-positive bugs + expand LARGE_TABLES:
  - **B1:** Rule 1 scans the entire file including DOWN blocks → false-positive ERRORs on
    legitimate rollback DROP statements (migrations 051, 059, 060).
  - **B2:** Rule 5 `*_id INTEGER` heuristic fires on `address_point_id INTEGER PRIMARY KEY`
    (migration 018) — source-data table PK, not a FK reference.
  - **A4:** `permit_history` missing from LARGE_TABLES — future indexes run without CONCURRENTLY protection.
* **Target Spec:** `docs/specs/00-architecture/00_engineering_standards.md` §3.2 + spec 47 §12 migration section
* **Key Files:**
  - `scripts/validate-migration.js`
  - `src/tests/migration-validator.logic.test.ts` (4 new tests)

### Technical Implementation

**B1 — UP block scoping for Rule 1:**
```js
// Extract content before the first `-- DOWN` marker; fall back to full content if absent
const downMarkerMatch = /^[ \t]*--[ \t]*DOWN\b/im.exec(content);
const upBlockContent = downMarkerMatch ? content.slice(0, downMarkerMatch.index) : content;
const upBlockStripped = blankStringLiterals(stripLineComments(stripBlockComments(upBlockContent)));
// Rule 1 scans upBlockStripped instead of stripped
```

**B2 — PRIMARY KEY exclusion from Rule 5 integer-ID check:**
```js
// Reuse existing splitTopLevelCommas helper to check each column clause individually
const clauses = splitTopLevelCommas(body);
const hasIdCol = clauses.some(clause =>
  /\b\w+_id\s+(?:INTEGER|INT|BIGINT)\b/i.test(clause) &&
  !/\bPRIMARY\s+KEY\b/i.test(clause)
);
```

**A4 — Expand LARGE_TABLES:**
```js
const LARGE_TABLES = [
  'permits', 'permit_trades', 'permit_parcels',
  'wsib_registry', 'entities', 'permit_history',
];
```

**4 new guardrail tests (must FAIL before implementation):**
1. B1 regression — DROP TABLE in DOWN block does NOT error without `-- ALLOW-DESTRUCTIVE`
2. B1 correctness — DROP TABLE in UP block still errors without `-- ALLOW-DESTRUCTIVE`
3. B2 — `foo_id INTEGER PRIMARY KEY` in CREATE TABLE does NOT produce Rule 5 warning
4. A4 — `CREATE INDEX ON permit_history (col)` without CONCURRENTLY produces Rule 2 error

### Database Impact: NO

### Standards Compliance
* **Try-Catch Boundary:** N/A
* **Unhappy Path Tests:** B1 correctness test verifies UP-block Rule 1 protection not regressed
* **logError Mandate:** N/A
* **Mobile-First:** N/A
* **§12.10 Real-DB Tests:** N/A

### Execution Plan
```
- [ ] State Verification: N/A (bugs confirmed by WF5 audit)
- [ ] Contract Definition: N/A
- [ ] Spec Update: N/A
- [ ] Schema Evolution: N/A
- [ ] Guardrail Test: add 4 new tests to migration-validator.logic.test.ts — must FAIL
- [ ] Red Light: npx vitest run src/tests/migration-validator.logic.test.ts
- [ ] Implementation: B1 + B2 + A4 in validate-migration.js
- [ ] UI Regression Check: N/A
- [ ] Pre-Review Self-Checklist (5 items — see below)
- [ ] Green Light: npm run test && npm run lint -- --fix. All pass.
- [ ] §12 Self-Review Walk:
      Constants — LARGE_TABLES updated to include permit_history?
      Spec compliance — SPEC LINK header still present in validate-migration.js?
      Migration section (applicable items):
        - All existing rules still fire correctly on their target patterns?
        - No executable DROP added to any migration in this WF?
      All other §12 sections: N/A (no advisory locks, no DB config, no streams, no writes).
- [ ] Adversarial Reviews (parallel background — WF2 mandate):
        node scripts/gemini-review.js review scripts/validate-migration.js
        node scripts/deepseek-review.js review scripts/validate-migration.js
        node scripts/gemini-review.js review src/tests/migration-validator.logic.test.ts
        node scripts/deepseek-review.js review src/tests/migration-validator.logic.test.ts
- [ ] Independent Review Agent: worktree isolation, self-generated checklist against
      00_engineering_standards.md §3.2 + spec 47 §12 migration section.
- [ ] Triage: Real → fix-commit; Defensible → WONTFIX; Out-of-scope → future WF.
- [ ] Append deferred findings to docs/reports/review_followups.md (section: Task2 commit SHA).
- [ ] WF6 Atomic Commit (after any Real fixes applied).
```

### Pre-Review Self-Checklist (walk before Green Light)
1. Does B1 still catch `DROP TABLE` in the UP block — Rule 1 protection not regressed?
2. Does B1 handle migrations with no `-- DOWN` marker (falls back to full content scan)?
3. Does B2 still warn for `builder_id INTEGER NOT NULL` (no PRIMARY KEY in that clause)?
4. Does A4 addition leave all 29 existing migration-validator tests unaffected?
5. Does `node scripts/validate-migration.js migrations/*.sql` now produce 0 false-positive Rule 1/Rule 5 errors for migrations 018, 051, 059, 060?

---

## Task 3: WF2 — Retroactive Annotation Sweep

### Context

* **Goal:** Suppress all grandfathered validator noise via file-level annotations so
  `node scripts/validate-migration.js migrations/*.sql` exits 0 with 0 errors and 0 spurious
  Rule 5 warnings. Add reversibility to migrations 042/045. Annotate hardcoded neighbourhood count.
* **Target Spec:** `docs/specs/00-architecture/00_engineering_standards.md` §3.2
* **Key Files:** 9 migration files + `scripts/quality/assert-data-bounds.js`

### Changes

**A1 — FK-EXEMPT headers** (suppresses Rule 5 — file-level scope):
```sql
-- migrations/002_permit_history.sql (top of file):
-- FK-EXEMPT: FKs added in migration 109 (permit_history→permits CASCADE, permit_history→sync_runs SET NULL)

-- migrations/013_neighbourhoods.sql (top of file):
-- FK-EXEMPT: neighbourhood_id is a Toronto Open Data natural key, not a FK reference to another table

-- migrations/069_lead_views.sql (top of file):
-- FK-EXEMPT: permit_num/revision_num FK enforced via later ALTER TABLE (Tier 1 in audit-fk-orphans.js)

-- migrations/089_valuation_claiming_schema.sql (top of file):
-- FK-EXEMPT: tracked_projects→permits FK added in migration 109 (CASCADE)
```

**A2 — UP/DOWN headers** (suppresses Rule 4 missing-block errors):
- `041_records_meta.sql` — add `-- UP` before `ALTER TABLE`; add `-- DOWN\n-- noop — ADD COLUMN IF NOT EXISTS is idempotent; column removal requires ALLOW-DESTRUCTIVE`
- `042_entities.sql` — add `-- UP` before first `CREATE TYPE`; DOWN block added in A6
- `044_wsib_entity_link.sql` — add `-- UP` before `ALTER TABLE`; add `-- DOWN\n-- ALTER TABLE wsib_registry DROP COLUMN IF EXISTS linked_entity_id;`
- `045_permit_inspections.sql` — add `-- UP` before `CREATE TABLE`; DOWN block added in A6
- `046_performance_indexes.sql` — add `-- UP` before first `CREATE INDEX`; add `-- DOWN\n-- DROP INDEX IF EXISTS idx_permits_est_const_cost;\n-- DROP INDEX IF EXISTS idx_permits_application_date;\n-- DROP INDEX IF EXISTS idx_coa_hearing_date;`

**A3 — ALLOW-DESTRUCTIVE** (migration 056 UP block intentionally drops legacy tables):
```sql
-- ALLOW-DESTRUCTIVE: removing builders/builder_contacts legacy tables after entity
-- consolidation (Spec 37). Data migrated to entities/entity_contacts in migration 042/055.
```
Added to UP block BEFORE the first DROP statement.

**A5 — Neighbourhood count source comment** (`scripts/quality/assert-data-bounds.js`):
Line containing `>= 158`: add trailing comment `-- Toronto 2021 neighbourhood boundaries (City of Toronto Open Data, 158 neighbourhoods)`

**A6 — Commented-out DOWN blocks** for migrations lacking reversibility:
- `042_entities.sql`:
  ```sql
  -- DOWN
  -- DROP TABLE IF EXISTS entity_projects;
  -- DROP TABLE IF EXISTS entities;
  -- DROP TYPE IF EXISTS project_role_enum;
  -- DROP TYPE IF EXISTS entity_type_enum;
  ```
- `045_permit_inspections.sql`:
  ```sql
  -- DOWN
  -- DROP TABLE IF EXISTS permit_inspections;
  ```

### Database Impact: NO (annotation-only)

### Standards Compliance
* **Try-Catch Boundary:** N/A
* **Unhappy Path Tests:** N/A — annotation sweep verified by validator clean run
* **logError Mandate:** N/A
* **Mobile-First:** N/A
* **§12.10 Real-DB Tests:** N/A

### Execution Plan
```
- [ ] State Verification: node scripts/validate-migration.js migrations/*.sql — record baseline
      error count (expected: 26 errors, 5 warnings)
- [ ] Contract Definition: N/A
- [ ] Spec Update: N/A
- [ ] Schema Evolution: N/A
- [ ] Guardrail Test: N/A — annotation sweep; Red Light is the baseline validator run above
- [ ] Red Light: baseline error/warn count confirmed before any edits
- [ ] Implementation: apply A1 + A2 + A3 + A5 + A6
- [ ] UI Regression Check: N/A
- [ ] Pre-Review Self-Checklist (5 items — see below)
- [ ] Green Light: node scripts/validate-migration.js migrations/*.sql → 0 errors, 0 spurious warnings
       npm run test && npm run lint -- --fix → all pass
- [ ] §12 Self-Review Walk (migration section — applicable since SQL files are being modified):
      UP/DOWN blocks present in all 5 newly-annotated migrations?
      ALLOW-DESTRUCTIVE marker precedes the DROP statements in migration 056?
      DOWN blocks in 042/045 are fully commented-out (not live SQL)?
      node scripts/validate-migration.js on all annotated files exits 0?
      All other §12 sections: N/A.
- [ ] Adversarial Reviews (parallel background — WF2 mandate):
      Run on ALL changed files (annotations carry semantic risk — wrong scope, wrong migration):
        node scripts/gemini-review.js review migrations/002_permit_history.sql
        node scripts/deepseek-review.js review migrations/002_permit_history.sql
        node scripts/gemini-review.js review migrations/013_neighbourhoods.sql
        node scripts/deepseek-review.js review migrations/013_neighbourhoods.sql
        node scripts/gemini-review.js review migrations/041_records_meta.sql
        node scripts/deepseek-review.js review migrations/041_records_meta.sql
        node scripts/gemini-review.js review migrations/042_entities.sql
        node scripts/deepseek-review.js review migrations/042_entities.sql
        node scripts/gemini-review.js review migrations/044_wsib_entity_link.sql
        node scripts/deepseek-review.js review migrations/044_wsib_entity_link.sql
        node scripts/gemini-review.js review migrations/045_permit_inspections.sql
        node scripts/deepseek-review.js review migrations/045_permit_inspections.sql
        node scripts/gemini-review.js review migrations/046_performance_indexes.sql
        node scripts/deepseek-review.js review migrations/046_performance_indexes.sql
        node scripts/gemini-review.js review migrations/056_drop_legacy_tables.sql
        node scripts/deepseek-review.js review migrations/056_drop_legacy_tables.sql
        node scripts/gemini-review.js review migrations/069_lead_views.sql
        node scripts/deepseek-review.js review migrations/069_lead_views.sql
        node scripts/gemini-review.js review migrations/089_valuation_claiming_schema.sql
        node scripts/deepseek-review.js review migrations/089_valuation_claiming_schema.sql
        node scripts/gemini-review.js review scripts/quality/assert-data-bounds.js
        node scripts/deepseek-review.js review scripts/quality/assert-data-bounds.js
- [ ] Independent Review Agent: worktree isolation; verify every annotation is correctly
      scoped (FK-EXEMPT before -- UP, ALLOW-DESTRUCTIVE before first DROP, DOWN blocks
      fully commented-out) and check for any annotation that contradicts the actual schema.
- [ ] Triage: Real → fix-commit; Defensible → WONTFIX; Out-of-scope → future WF.
- [ ] Append deferred findings to docs/reports/review_followups.md (section: Task3 commit SHA).
- [ ] WF6 Atomic Commit (after any Real fixes applied).
```

### Pre-Review Self-Checklist (walk before Green Light)
1. Do `-- FK-EXEMPT` headers appear BEFORE the `-- UP` line in all 4 migrations (file-level scope)?
2. Does `-- ALLOW-DESTRUCTIVE` in migration 056 appear before the first DROP statement in the UP block?
3. Are the DOWN blocks in migrations 042 and 045 fully commented-out — no live executable SQL?
4. Does `node scripts/validate-migration.js migrations/*.sql` exit 0 with 0 errors after all edits?
5. Does `npm run test` still pass (no migration-validator guardrail tests broken by the annotation changes)?

---

## §10 Compliance

- ⬜ **DB:** N/A — no schema changes across all three tasks.
- ⬜ **API:** N/A.
- ⬜ **UI:** N/A.
- ⬜ **Shared Logic:** N/A.
- ✅ **Pipeline/Tooling:**
  - Task 1: Backwards-compatible; `pipeline.run` behavior unchanged; new test covers stale-entry regression.
  - Task 2: 4 guardrail tests; B1 correctness test verifies UP-block protection preserved; all 29 existing tests unaffected.
  - Task 3: Pure annotation; verified by validator clean run; no behavior change to any script or migration.
  - All three tasks: adversarial (Gemini + DeepSeek) + independent review run on every changed file; findings triaged to review_followups.md.

---

**PLAN LOCKED. Do you authorize this three-task WF3+WF2+WF2 sequence with adversarial reviews, §12 Self-Review Walks, and review_followups.md triage on all tasks? (y/n)**
DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
