# Active Task: WF2 — FK Hardening: Tier 2 Lock-Down
**Status:** Planning
**Domain Mode:** Backend/Pipeline

---

## Context

* **Goal:** Close the FK hardening gap identified by `scripts/quality/audit-fk-orphans.js` (2026-04-24).
  All 18 Tier 1 relationships are already fully enforced at the DB level — no action needed there.
  This task targets the 5 remaining Tier 2 relationships that have no FK constraint yet:
  1. `permit_history → permits` (clean, 0 rows)
  2. `permit_history → sync_runs` (clean, nullable, 0 rows)
  3. `tracked_projects → permits` (clean, 0 rows)
  4. `permits → neighbourhoods` (**13 orphaned rows must be cleaned first**)
  5. `permit_products → permits` (**VARCHAR(20) type mismatch must be fixed first**)

  Output the proposed migration SQL to `docs/reports/proposed_fk_migrations.md` for adversarial
  (DeepSeek + Gemini) review. Do NOT run `npm run migrate` until the user confirms validation.

* **Target Spec:** `docs/specs/00-architecture/01_database_schema.md`
* **Rollback Anchor:** To be recorded at implementation start.
* **Key Files:**
  - `migrations/109_fk_hardening.sql` (new)
  - `docs/reports/proposed_fk_migrations.md` (adversarial review artifact — output first)
  - `src/tests/db/109_fk_hardening.db.test.ts` (new, §12.10 mandate)

---

## Technical Implementation

### Cascade Decision Matrix

| Child Table | Parent Table | FK Cols | On Delete | Rationale |
|---|---|---|---|---|
| `permit_history` | `permits` | `permit_num, revision_num` | **CASCADE** | Audit-log rows for a deleted revision are orphaned and meaningless. Internal. |
| `permit_history` | `sync_runs` | `sync_run_id` | **SET NULL** | `sync_run_id` is nullable. Purging old sync runs should not destroy history rows — lose the provenance pointer, keep the record. Municipal data lifecycle. |
| `tracked_projects` | `permits` | `permit_num, revision_num` | **CASCADE** | User's claimed project on a deleted permit has no meaning. Internal app data. |
| `permits` | `neighbourhoods` | `neighbourhood_id` | **SET NULL** | `neighbourhoods` is municipal source data. If a neighbourhood is replaced during re-import, preserve the 237K permit rows — just null the reference. |
| `permit_products` | `permits` | `permit_num, revision_num` | **CASCADE** | Product classification for a deleted revision is meaningless. Internal. |

### Pre-existing index coverage (from live DB query — no new CONCURRENTLY indexes needed)

| Table | FK Cols | Index | Status |
|---|---|---|---|
| `permit_history` | `(permit_num, revision_num)` | `idx_permit_history_permit` | ✅ Exists |
| `permit_history` | `sync_run_id` | — | ❌ Missing — add non-CONCURRENTLY (table is empty) |
| `tracked_projects` | `(permit_num, revision_num)` | `idx_tracked_projects_permit` | ✅ Exists |
| `permits` | `neighbourhood_id` | `idx_permits_neighbourhood_id` | ✅ Exists |
| `permit_products` | `(permit_num, revision_num, product_id)` | `permit_products_pkey` | ✅ Exists (PK covers it) |

Because no `CREATE INDEX CONCURRENTLY` is needed, the entire migration runs in a single
transaction — the migration runner's transactional path applies. This is strictly safer than
the non-transactional CONCURRENTLY path.

### Migration structure (`migrations/109_fk_hardening.sql`)

**Step 1 — Orphan cleanup:**
```sql
UPDATE permits
SET neighbourhood_id = NULL
WHERE neighbourhood_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM neighbourhoods WHERE id = permits.neighbourhood_id);
```
Affects exactly 13 rows (audit confirmed). Has WHERE clause. Idempotent.

**Step 2 — Fix `permit_products.permit_num` column type:**
Guarded by `DO $$...$$` with `information_schema` check so it's idempotent on re-run.
`permit_products` has 0 rows — no data at risk. Zero lock concern.

**Step 3 — New index on `permit_history.sync_run_id`:**
`CREATE INDEX IF NOT EXISTS idx_permit_history_sync_run ON permit_history(sync_run_id)
WHERE sync_run_id IS NOT NULL;`
Non-CONCURRENTLY is safe: table is empty.

**Steps 4a–4e — FK additions (NOT VALID + VALIDATE pattern):**
Each FK uses a `DO $$...$$` idempotency guard (`IF NOT EXISTS pg_constraint`), then a
separate `ALTER TABLE ... VALIDATE CONSTRAINT` statement. The NOT VALID + VALIDATE pattern
splits the lock: the ADD is instant (no scan), VALIDATE uses AccessShareLock only.

**DOWN block:** Commented-out DROP CONSTRAINT + DROP INDEX statements in reverse order.
Includes a safety note that the VARCHAR(20) rollback is only safe if no permit_num > 20 chars
was ever written to `permit_products`.

### Database Impact: YES

- 237K-row `permits` table: `UPDATE` touches only 13 rows (indexed lookup via PK).
  `VALIDATE CONSTRAINT` on `fk_permits_neighbourhoods` scans all 237K rows under AccessShareLock.
  Estimated duration: a few seconds on local dev hardware — acceptable.
- All other affected tables are empty (0 rows) — trivial.
- `npm run db:generate` required after migration to regenerate Drizzle types.

---

## Standards Compliance

* **Try-Catch Boundary:** N/A — no API routes.
* **Unhappy Path Tests:** `src/tests/db/109_fk_hardening.db.test.ts` — tests bad-FK insert
  rejection, CASCADE delete propagation, and SET NULL delete propagation for each constraint.
* **logError Mandate:** N/A — no API routes.
* **Mobile-First:** N/A — backend/DB only.
* **§12.10 Real-DB Tests:** Mandatory — migration adds FK constraints with CASCADE/SET NULL.
  Test file exercises constraints against real Postgres via testcontainers.
* **§12.8 SQL Linting:** SQLFluff lint + `validate-migration.js` run before adversarial review.
* **Spec 47:** This is a migration file + test, not a pipeline script. §2 script skeleton does
  not apply. However: §9.1 transaction discipline applies — the migration runner wraps the
  full migration in `BEGIN...COMMIT` (verified from `scripts/migrate.js`).

---

## Execution Plan

### Phase A — Propose (execute on "Yes" authorization)

```
- [ ] Rollback Anchor: record current git commit hash in this task.
- [ ] State Verification: re-run audit-fk-orphans.js to confirm 13 orphans still present
      and no new orphans have appeared since the 2026-04-24 run.
- [ ] Write docs/reports/proposed_fk_migrations.md — exact UP + DOWN SQL that will go into
      migration 109. This is the adversarial review artifact.
- [ ] Write migrations/109_fk_hardening.sql — identical SQL content, proper migration header.
- [ ] Write src/tests/db/109_fk_hardening.db.test.ts — test each FK constraint:
        - INSERT orphaned FK value rejected (bad neighbourhood_id, bad sync_run_id, etc.)
        - CASCADE: deleting parent row cascades to child (permit_history, tracked_projects,
          permit_products)
        - SET NULL: deleting parent row nulls FK col (permits.neighbourhood_id,
          permit_history.sync_run_id)
- [ ] Lint gate:
        a. sqlfluff lint --dialect postgres migrations/109_fk_hardening.sql
        b. node scripts/validate-migration.js migrations/109_fk_hardening.sql
- [ ] Adversarial Review — Gemini (gemini-2.5-pro):
        node scripts/gemini-review.js review docs/reports/proposed_fk_migrations.md \
          --context docs/specs/00-architecture/01_database_schema.md
        node scripts/gemini-review.js plan
- [ ] Adversarial Review — DeepSeek (deepseek-reasoner / R1):
        node scripts/deepseek-review.js review docs/reports/proposed_fk_migrations.md \
          --context docs/specs/00-architecture/01_database_schema.md
        node scripts/deepseek-review.js plan
- [ ] HALT — Phase A complete. Output all four review responses in full.
      Do NOT run npm run migrate. Await user confirmation of adversarial validation
      before Phase B execution.
```

### Phase B — Execute (only after user confirms adversarial validation)

```
- [ ] Guardrail Test (Red Light): BUILDO_TEST_DB=1 npm run test:db — must FAIL
      (migration not yet applied; FK constraints absent).
- [ ] Implementation: npm run migrate — apply migration 109.
- [ ] Green: BUILDO_TEST_DB=1 npm run test:db — all db tests must pass.
- [ ] DB Generate: npm run db:generate
- [ ] Type Check: npm run typecheck — must be 0 errors.
- [ ] Spec Update: Update docs/specs/00-architecture/01_database_schema.md to note
      new FK constraints. Add new relationships to RELATIONSHIPS registry in
      scripts/quality/audit-fk-orphans.js (Tier 1 after constraint is applied).
      Run npm run system-map.
- [ ] UI Regression Check: N/A — no shared components modified.
- [ ] Pre-Review Self-Checklist: (walked against actual diff before Green Light — see below)
- [ ] Green Light: npm run test && npm run lint -- --fix. All pass.
      Output ✅/⬜ execution summary for every step above. → Independent Review Agent.
- [ ] Independent Review Agent (isolation: worktree):
      Inputs: docs/specs/00-architecture/01_database_schema.md,
              [migrations/109_fk_hardening.sql, src/tests/db/109_fk_hardening.db.test.ts],
              "Added 5 FK constraints to Tier 2 relationships after orphan cleanup and
               permit_products type fix; Gemini + DeepSeek adversarial SQL review already
               completed in Phase A."
      Agent self-generates checklist from spec. Returns PASS/FAIL per item with line numbers.
- [ ] Triage: WF3 any FAIL items. Defer lower-priority gaps → docs/reports/review_followups.md.
- [ ] WF6 + Atomic Commit.
```

### Pre-Review Self-Checklist (walked against actual diff before Green Light)

1. Does the UPDATE in Step 1 have a WHERE clause that prevents a full-table NULL wipe?
2. Is the `DO $$...$$` guard on the ALTER COLUMN TYPE actually checking the right
   `character_maximum_length` value (20), or does it compare to the target (30)?
3. Does each `DO $$...$$` FK block use the correct `pg_constraint` name that matches
   the subsequent `VALIDATE CONSTRAINT` call? (Name mismatch = silently skips VALIDATE.)
4. For `permit_history → sync_runs (SET NULL)`: is `sync_run_id` actually defined as
   nullable in the migration DDL? (NOT NULL + SET NULL = impossible FK.)
5. For `permits → neighbourhoods (SET NULL)`: is `neighbourhood_id` nullable in the
   permits schema? (NOT NULL + SET NULL = impossible FK.)
6. Does the DOWN block reverse all 5 FK additions AND the new index AND the column type
   change, in the correct reverse order (constraints before index before column)?
7. Does the db test file include both the happy-path (valid FK insert succeeds) AND the
   unhappy-path (orphan insert rejected) for each new constraint?
8. Is the db test file gated on `dbAvailable()` so it self-skips without BUILDO_TEST_DB=1,
   leaving the standard `npm run test` suite unaffected?

---

## §10 Compliance

- ✅ **DB: UP + DOWN migration** in `migrations/109_fk_hardening.sql` (§3.2)
- ✅ **DB: Backfill strategy for 100K+ row table** — `permits` (237K rows): UPDATE touches
  only 13 rows via indexed lookup. FK addition uses NOT VALID + VALIDATE (split-lock pattern).
  `idx_permits_neighbourhood_id` already exists — no CONCURRENTLY index needed. Full
  migration is transactional. `permit_products` has 0 rows — ALTER COLUMN TYPE is trivial.
- ✅ **DB: factories.ts** — `neighbourhood_id` already exists on the permit factory; no new
  columns added to any table, so no factory update required.
- ✅ **DB: npm run typecheck planned** after `db:generate`.
- ⬜ **API:** N/A — no API routes created or modified.
- ⬜ **UI:** N/A — no UI components modified.
- ⬜ **Shared Logic (§7 dual code path):** N/A — no classification/scoring logic touched.
- ⬜ **Pipeline:** N/A — no pipeline scripts modified.
- ✅ **DB/Migration: DOWN block** included with safety note on VARCHAR rollback.
- ✅ **DB/Migration: SQLFluff lint** planned (Phase A Step 4a).
- ✅ **DB/Migration: validate-migration.js** planned (Phase A Step 4b).
- ✅ **DB/Migration: No raw SQL string concatenation** — all SQL is literal DDL.
- ✅ **Pre-Review Self-Checklist** planned (Phase B, 8 items above).
- ✅ **Cross-Layer Contracts:** No numeric thresholds cross spec/SQL/Zod boundaries.
- ✅ **§12.10 Real-DB Integration Tests** — `src/tests/db/109_fk_hardening.db.test.ts`
  tests CASCADE, SET NULL, and orphan-rejection behavior for all 5 new constraints.

---

**PLAN LOCKED. Do you authorize this WF2 plan? (y/n)**
DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
