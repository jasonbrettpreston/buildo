-- 109_fk_hardening.sql
-- Tier 2 FK lock-down: adds 5 foreign key constraints after orphan cleanup
-- and a column type fix. All 5 relationships were Tier 2 in audit-fk-orphans.js
-- (no FK, data confirmed clean or cleaned here before constraint addition).
--
-- Rollback anchor: b3ac5e5f5d6ddbd4ac3468651fdee1d83507be85
--
-- Constraints added (in dependency order):
--   a. permit_history   → permits        ON DELETE CASCADE
--   b. permit_history   → sync_runs      ON DELETE SET NULL
--   c. tracked_projects → permits        ON DELETE CASCADE
--   d. permits          → neighbourhoods ON DELETE SET NULL
--   e. permit_products  → permits        ON DELETE CASCADE
--
-- Pre-flight checks (confirmed by audit run 2026-04-24):
--   • permit_history has 0 rows — FK additions are instant.
--   • tracked_projects has 0 rows — FK additions are instant.
--   • permit_products has 0 rows — column type change and FK addition are trivial.
--   • permits → neighbourhoods: 13 orphaned rows cleaned inline before VALIDATE.
--   • idx_permit_history_sync_run already exists (migration 002) — no new index needed.
--   • permit_products_pkey (permit_num, revision_num, product_id) covers FK lookup
--     on (permit_num, revision_num) as a prefix — no additional index needed.
--
-- Transactional path: no CONCURRENTLY indexes added here, so migrate.js wraps
-- this entire file in a single BEGIN...COMMIT transaction.
--
-- Adversarial review fixes applied (Gemini + DeepSeek, 2026-04-24):
--   • Step 1 DO block now verifies empty table before ALTER; raises EXCEPTION if not.
--   • permits→neighbourhoods reordered: ADD NOT VALID → UPDATE → VALIDATE to
--     eliminate the race window between orphan cleanup and constraint addition.
--
-- Note: VALIDATE CONSTRAINT on permits (237K rows) takes a few seconds under
-- AccessShareLock. Run this migration during a low-traffic window to avoid
-- lock pile-up with concurrent DDL.

-- UP

-- ── Step 1: Fix permit_products.permit_num VARCHAR(20) → VARCHAR(30) ──────────
-- Must run before Step 5 (permit_products → permits FK) because column types
-- must match for the FK to be created.
-- Hardened per Gemini adversarial review: verifies table is empty before altering;
-- raises EXCEPTION if rows exist to prevent an unintended AccessExclusiveLock.
DO $$
DECLARE
  row_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name  = 'permit_products'
      AND column_name = 'permit_num'
      AND character_maximum_length = 20
  ) THEN
    SELECT COUNT(*) INTO row_count FROM permit_products;
    IF row_count > 0 THEN
      RAISE EXCEPTION
        'Cannot alter permit_products.permit_num: table is not empty (% rows found). '
        'Manual intervention required before running this migration.',
        row_count;
    END IF;
    ALTER TABLE permit_products ALTER COLUMN permit_num TYPE VARCHAR(30);
  END IF;
END;
$$;

-- ── Step 2: Index notes ───────────────────────────────────────────────────────
-- idx_permit_history_sync_run already exists (migration 002). No action needed.
-- permit_products_pkey (permit_num, revision_num, product_id) covers FK lookups
-- on (permit_num, revision_num) as a B-tree prefix. No additional index needed.

-- ── Step 3a: permit_history → permits (CASCADE) ───────────────────────────────
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

-- ── Step 3b: permit_history → sync_runs (SET NULL) ───────────────────────────
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

-- ── Step 3c: tracked_projects → permits (CASCADE) ────────────────────────────
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

-- ── Step 4: permits → neighbourhoods (SET NULL) ───────────────────────────────
-- Revised order per DeepSeek adversarial review (2026-04-24):
--   4a. ADD CONSTRAINT NOT VALID — instant, no existing-row scan; blocks new
--       inserts with orphaned neighbourhood_id from this point forward.
--   4b. UPDATE — cleans 13 orphaned rows now that concurrent inserts are blocked.
--   4c. VALIDATE — scans 237K rows under AccessShareLock; zero orphans remain.
-- This eliminates the race window where a concurrent insert could create a new
-- orphan between the UPDATE and the constraint addition.

-- Step 4a: ADD CONSTRAINT NOT VALID (instant — no table scan)
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

-- Step 4b: Clean 13 orphaned neighbourhood_id values.
-- WHERE clause is precise — idempotent on re-run.
UPDATE permits
SET
  neighbourhood_id = NULL
WHERE
  neighbourhood_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM neighbourhoods
    WHERE neighbourhoods.id = permits.neighbourhood_id
  );

-- Step 4c: VALIDATE — scans 237K rows, expected seconds under AccessShareLock.
ALTER TABLE permits VALIDATE CONSTRAINT fk_permits_neighbourhoods;

-- ── Step 5: permit_products → permits (CASCADE) ───────────────────────────────
-- permit_num widened to VARCHAR(30) in Step 1. Table has 0 rows — VALIDATE is instant.
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

-- DOWN
-- Execute in reverse order: drop constraints first, then revert column type.
--
-- SAFETY CHECK — run this query before executing the VARCHAR(20) revert:
--   SELECT MAX(LENGTH(permit_num)) FROM permit_products;
-- If result > 20, the revert will fail. Clean oversized data manually first.
-- Programmatic guard to include in a manual rollback script:
--   DO $$
--   BEGIN
--     IF EXISTS (SELECT 1 FROM permit_products WHERE LENGTH(permit_num) > 20) THEN
--       RAISE EXCEPTION 'Cannot revert to VARCHAR(20): oversized data exists. '
--                       'Manual cleanup required.';
--     END IF;
--   END;
--   $$;
--
-- ALTER TABLE permit_products   DROP CONSTRAINT IF EXISTS fk_permit_products_permits;
-- ALTER TABLE permits           DROP CONSTRAINT IF EXISTS fk_permits_neighbourhoods;
-- ALTER TABLE tracked_projects  DROP CONSTRAINT IF EXISTS fk_tracked_projects_permits;
-- ALTER TABLE permit_history    DROP CONSTRAINT IF EXISTS fk_permit_history_sync_runs;
-- ALTER TABLE permit_history    DROP CONSTRAINT IF EXISTS fk_permit_history_permits;
-- ALTER TABLE permit_products   ALTER COLUMN permit_num TYPE VARCHAR(20);
