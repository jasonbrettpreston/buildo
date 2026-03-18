# Active Task: Migration Cleanup — Delete Dead Migrations & Extract Backfills
**Status:** Implementation
**Rollback Anchor:** `fe5080c3` (fe5080c352271b13e18ff8f5dca2dbae23a4577a)
**Workflow:** WF3 — Bug Fix

## Context
* **Goal:** Delete 2 fully-applied one-time cleanup migrations (049, 050) and extract 2 data-backfill migrations (033, 043) into standalone one-time scripts, leaving only schema portions in the migration files.
* **Target Spec:** `docs/specs/00_engineering_standards.md` §3.2 (Migration Rollback Safety)
* **Key Files:**
  - `migrations/049_cleanup_stale_scope_slugs.sql` — DELETE only
  - `migrations/050_cleanup_prefixed_scope_slugs.sql` — DELETE only
  - `migrations/033_pipeline_runs.sql` — schema CREATE + backfill INSERTs
  - `migrations/043_entities_data_migration.sql` — pure data migration

## Technical Implementation
* **Deleted Files:** `migrations/049_cleanup_stale_scope_slugs.sql`, `migrations/050_cleanup_prefixed_scope_slugs.sql`, `migrations/043_entities_data_migration.sql`
* **Modified:** `migrations/033_pipeline_runs.sql` — keep CREATE TABLE + CREATE INDEX, remove backfill INSERTs (lines 21–67)
* **New Scripts:** `scripts/backfill/seed-pipeline-runs.js`, `scripts/backfill/migrate-entities.js`
* **Database Impact:** NO — no schema changes; removing SQL that already runs as no-ops

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes
* **Unhappy Path Tests:** Test that `npm run migrate` still succeeds after file changes
* **logError Mandate:** N/A
* **Mobile-First:** N/A — backend-only

## §10 Plan Compliance Checklist

### If Database Impact = YES:
- ⬜ N/A all sub-items

### If API Route Created/Modified:
- ⬜ N/A all sub-items

### If UI Component Created/Modified:
- ⬜ N/A all sub-items

### If Shared Logic Touched:
- ⬜ N/A all sub-items

### If Pipeline Script Created/Modified:
- ⬜ N/A — backfill scripts are one-time utilities, not pipeline chain steps

## Execution Plan
- [ ] **Rollback Anchor:** Record current Git commit hash
- [ ] **State Verification:** Confirm all 4 migrations are no-ops on current DB
- [ ] **Spec Review:** §3.2 requires UP+DOWN — remaining migrations must still comply
- [ ] **Reproduction:** Run `npm run migrate` — passes. Verify 049/050 DELETE match 0 rows, 043 INSERTs match 0 rows via ON CONFLICT, 033 backfills match 0 rows
- [ ] **Red Light:** Add test asserting the 4 migration files no longer exist / are trimmed
- [ ] **Fix:**
  1. Delete `migrations/049_cleanup_stale_scope_slugs.sql`
  2. Delete `migrations/050_cleanup_prefixed_scope_slugs.sql`
  3. Delete `migrations/043_entities_data_migration.sql`
  4. Trim `migrations/033_pipeline_runs.sql` to schema-only (lines 1–19)
  5. Create `scripts/backfill/seed-pipeline-runs.js` with extracted INSERT logic
  6. Create `scripts/backfill/migrate-entities.js` with extracted entity migration logic
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6.
