# Proposed FK Migrations — Adversarial Review Artifact

**Migration:** `migrations/109_fk_hardening.sql`
**Rollback Anchor:** `b3ac5e5f5d6ddbd4ac3468651fdee1d83507be85`
**Audit Date:** 2026-04-24
**Spec:** `docs/specs/00-architecture/01_database_schema.md`

---

## Context

The FK orphan audit (`node scripts/quality/audit-fk-orphans.js`) confirmed that all 18 Tier 1
relationships are fully enforced. 5 Tier 2 relationships remain unenforced:

| Child Table | Parent Table | FK Cols | Orphaned Rows | Blocker |
|---|---|---|---|---|
| `permit_history` | `permits` | `permit_num, revision_num` | 0 | None |
| `permit_history` | `sync_runs` | `sync_run_id` | 0 | None |
| `tracked_projects` | `permits` | `permit_num, revision_num` | 0 | None |
| `permits` | `neighbourhoods` | `neighbourhood_id` | **13** | Must clean first |
| `permit_products` | `permits` | `permit_num, revision_num` | 0 | `permit_num` VARCHAR(20) vs VARCHAR(30) |

---

## Cascade Decision Matrix

| Child Table | Parent Table | On Delete | Rationale |
|---|---|---|---|
| `permit_history` | `permits` | **CASCADE** | Audit-log rows for a deleted revision are meaningless without the parent. Internal app data. |
| `permit_history` | `sync_runs` | **SET NULL** | `sync_run_id` is nullable. Purging old sync runs should not destroy history rows — lose provenance pointer, keep the record. Municipal data lifecycle. |
| `tracked_projects` | `permits` | **CASCADE** | A user's claimed project on a deleted permit revision has no meaning. Internal app data. |
| `permits` | `neighbourhoods` | **SET NULL** | `neighbourhoods` is municipal source data. Re-import may replace neighbourhood rows. Preserve 237K permit rows — just null the reference. |
| `permit_products` | `permits` | **CASCADE** | Product classification for a deleted revision is meaningless. Internal app data. |

---

## UP Block

> **Note (post-adversarial-fix):** The ordering shown below reflects the pre-review draft that was
> submitted to Gemini and DeepSeek. The final migration `migrations/109_fk_hardening.sql` applies
> the DeepSeek-recommended fix: for `permits→neighbourhoods`, the ADD CONSTRAINT NOT VALID runs
> **before** the UPDATE (not after), eliminating the race window. Consult the migration file for
> the corrected implementation.

```sql
-- ── Step 1: Clean 13 orphaned neighbourhood_id values on permits ─────────────
-- WHERE clause ensures only the 13 orphaned rows are touched; idempotent on re-run.
UPDATE permits
SET neighbourhood_id = NULL
WHERE neighbourhood_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM neighbourhoods WHERE id = permits.neighbourhood_id
  );

-- ── Step 2: Fix permit_products.permit_num VARCHAR(20) → VARCHAR(30) ─────────
-- Guarded by information_schema check — idempotent on re-run.
-- Table has 0 rows at time of migration — zero data at risk.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name  = 'permit_products'
      AND column_name = 'permit_num'
      AND character_maximum_length = 20
  ) THEN
    ALTER TABLE permit_products ALTER COLUMN permit_num TYPE VARCHAR(30);
  END IF;
END;
$$;

-- ── Step 3: Index on permit_history.sync_run_id ───────────────────────────────
-- idx_permit_history_sync_run already exists (migration 002). No action needed.

-- ── Step 4a: permit_history → permits (CASCADE) ───────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname   = 'fk_permit_history_permits'
      AND conrelid  = 'permit_history'::regclass
  ) THEN
    ALTER TABLE permit_history
      ADD CONSTRAINT fk_permit_history_permits
      FOREIGN KEY (permit_num, revision_num)
      REFERENCES permits (permit_num, revision_num)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END;
$$;
ALTER TABLE permit_history VALIDATE CONSTRAINT fk_permit_history_permits;

-- ── Step 4b: permit_history → sync_runs (SET NULL) ───────────────────────────
-- sync_run_id is nullable — SET NULL is safe and preserves history rows when
-- old sync_run records are purged.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname   = 'fk_permit_history_sync_runs'
      AND conrelid  = 'permit_history'::regclass
  ) THEN
    ALTER TABLE permit_history
      ADD CONSTRAINT fk_permit_history_sync_runs
      FOREIGN KEY (sync_run_id)
      REFERENCES sync_runs (id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$$;
ALTER TABLE permit_history VALIDATE CONSTRAINT fk_permit_history_sync_runs;

-- ── Step 4c: tracked_projects → permits (CASCADE) ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname   = 'fk_tracked_projects_permits'
      AND conrelid  = 'tracked_projects'::regclass
  ) THEN
    ALTER TABLE tracked_projects
      ADD CONSTRAINT fk_tracked_projects_permits
      FOREIGN KEY (permit_num, revision_num)
      REFERENCES permits (permit_num, revision_num)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END;
$$;
ALTER TABLE tracked_projects VALIDATE CONSTRAINT fk_tracked_projects_permits;

-- ── Step 4d: permits → neighbourhoods (SET NULL) ──────────────────────────────
-- 237K-row table. VALIDATE scans all rows under AccessShareLock (seconds, not minutes).
-- 13 orphans nulled in Step 1 — zero orphans remain at VALIDATE time.
-- neighbourhoods is municipal source data; SET NULL preserves permit rows if
-- a neighbourhood is replaced or removed during re-import.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname   = 'fk_permits_neighbourhoods'
      AND conrelid  = 'permits'::regclass
  ) THEN
    ALTER TABLE permits
      ADD CONSTRAINT fk_permits_neighbourhoods
      FOREIGN KEY (neighbourhood_id)
      REFERENCES neighbourhoods (id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$$;
ALTER TABLE permits VALIDATE CONSTRAINT fk_permits_neighbourhoods;

-- ── Step 4e: permit_products → permits (CASCADE) ──────────────────────────────
-- permit_products.permit_num widened to VARCHAR(30) in Step 2.
-- Table has 0 rows — VALIDATE is instant.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname   = 'fk_permit_products_permits'
      AND conrelid  = 'permit_products'::regclass
  ) THEN
    ALTER TABLE permit_products
      ADD CONSTRAINT fk_permit_products_permits
      FOREIGN KEY (permit_num, revision_num)
      REFERENCES permits (permit_num, revision_num)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END;
$$;
ALTER TABLE permit_products VALIDATE CONSTRAINT fk_permit_products_permits;
```

---

## DOWN Block

```sql
-- Execute in reverse order: drop constraints first, then undo column type change.
--
-- WARNING: Reverting permit_products.permit_num to VARCHAR(20) is only safe if
-- no permit_num longer than 20 characters was written after migration 109.
-- Verify before executing: SELECT MAX(LENGTH(permit_num)) FROM permit_products;
--
-- ALTER TABLE permit_products   DROP CONSTRAINT IF EXISTS fk_permit_products_permits;
-- ALTER TABLE permits           DROP CONSTRAINT IF EXISTS fk_permits_neighbourhoods;
-- ALTER TABLE tracked_projects  DROP CONSTRAINT IF EXISTS fk_tracked_projects_permits;
-- ALTER TABLE permit_history    DROP CONSTRAINT IF EXISTS fk_permit_history_sync_runs;
-- ALTER TABLE permit_history    DROP CONSTRAINT IF EXISTS fk_permit_history_permits;
-- ALTER TABLE permit_products   ALTER COLUMN permit_num TYPE VARCHAR(20);
```

---

## Self-Review Checklist (walked against actual diff)

1. **UPDATE WHERE clause prevents full-table wipe?**
   Yes — `WHERE neighbourhood_id IS NOT NULL AND NOT EXISTS (...)`. Cannot wipe non-orphaned rows.

2. **`information_schema` guard compares to current width (20), not target (30)?**
   Yes — `character_maximum_length = 20`. The guard fires only if still at old width.

3. **Each `DO $$` block uses the exact same constraint name as the subsequent VALIDATE call?**
   - `fk_permit_history_permits` ✓
   - `fk_permit_history_sync_runs` ✓
   - `fk_tracked_projects_permits` ✓
   - `fk_permits_neighbourhoods` ✓
   - `fk_permit_products_permits` ✓

4. **`sync_run_id` is nullable in DDL (migration 002)?**
   Yes — `sync_run_id INTEGER` (no NOT NULL). SET NULL semantics are valid.

5. **`neighbourhood_id` is nullable in permits schema (migration 014)?**
   Yes — `ALTER TABLE permits ADD COLUMN IF NOT EXISTS neighbourhood_id INTEGER` (no NOT NULL). SET NULL semantics are valid.

6. **DOWN block reverses all 5 FKs AND the column type change, in correct reverse order?**
   Yes — constraints dropped in reverse dependency order (4e → 4d → 4c → 4b → 4a), then column type reverted.

7. **DB test covers happy-path (valid FK insert succeeds) AND unhappy-path (orphan insert rejected) for each constraint?**
   Yes — `src/tests/db/109_fk_hardening.db.test.ts` covers both paths plus CASCADE/SET NULL behavior for all 5 constraints.

8. **DB test gated on `dbAvailable()` so standard `npm run test` suite is unaffected?**
   Yes — `describe.skipIf(!dbAvailable())`.

---

## Notes for Adversarial Reviewers

- **No `CREATE INDEX CONCURRENTLY`:** `idx_permit_history_sync_run` already exists in migration 002.
  `idx_permits_neighbourhood_id` already exists in migration 014. No new indexes are needed,
  so the entire migration runs in a single transaction (the transactional path in `scripts/migrate.js`).

- **NOT VALID + VALIDATE pattern:** Each constraint is added `NOT VALID` (no table scan, instant),
  then immediately `VALIDATE`d (table scan under `AccessShareLock` only, no writes blocked).
  For empty tables this is trivial. For `permits` (237K rows), the VALIDATE scan is the only
  non-trivial operation — estimated a few seconds on local hardware.

- **Idempotency:** Every DDL block is guarded — the UPDATE has a WHERE clause, the ALTER COLUMN
  is guarded by `information_schema`, and all ADD CONSTRAINT blocks check `pg_constraint` by name.
  Safe to re-run.

- **Migration 031 dependency:** `permit_products.product_id` already has an enforced FK to
  `product_groups(id)` (migration 031). Migration 109 adds the second FK on `(permit_num, revision_num)`.
  No interaction — independent constraints on different columns.
