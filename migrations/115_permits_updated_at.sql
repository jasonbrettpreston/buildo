-- Migration 115: permits.updated_at column + auto-update trigger
-- SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.2 Amber Update Flash
--            docs/specs/03-mobile/91_mobile_lead_feed.md §4.3 Detailed Investigation View
--
-- Adds an updated_at timestamp to the 237K-row permits table so the mobile
-- Flight Board can show a "newly updated" amber flash on cards whose source
-- permit changed while the app was backgrounded.
--
-- Migration follows the §3.1 zero-downtime pattern for tables >100K rows:
-- add nullable → backfill → constrain → trigger. PostgreSQL 11+ makes the
-- nullable ADD COLUMN instant (no rewrite); the backfill seeds existing rows
-- from last_seen_at/first_seen_at; SET DEFAULT + SET NOT NULL after the
-- backfill avoids any row scan; the trigger reuses the trigger_set_timestamp()
-- function established by migration 100 (no redefinition).

-- ============================================================
-- UP
-- ============================================================

-- Step 1: nullable add (instant on PG 11+, no table rewrite)
ALTER TABLE permits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Step 2: backfill existing rows from the best-known recency signal
-- coalesce: last_seen_at (most recent ingestion) → first_seen_at (initial seed) → NOW()
UPDATE permits
SET updated_at = COALESCE(last_seen_at, first_seen_at, NOW())
WHERE updated_at IS NULL;

-- Step 3: SET DEFAULT — instant on any PG version (metadata-only, no rewrite)
ALTER TABLE permits ALTER COLUMN updated_at SET DEFAULT NOW();

-- Step 4: NOT NULL via validated CHECK constraint (PG 12+ optimisation).
--
-- The naive `ALTER COLUMN ... SET NOT NULL` always performs a full sequential
-- scan under ACCESS EXCLUSIVE lock to verify no nulls remain — that would
-- block all reads and writes on a 237K-row table for 100-500ms. The
-- workaround: add a NOT VALID CHECK first (cheap, just metadata), VALIDATE
-- it under ShareUpdateExclusiveLock (concurrent reads OK), then run
-- SET NOT NULL — PG 12+ recognises the validated CHECK and skips the scan.
-- Finally drop the redundant CHECK so we only have the NOT NULL invariant.
ALTER TABLE permits
  ADD CONSTRAINT permits_updated_at_not_null
  CHECK (updated_at IS NOT NULL) NOT VALID;
ALTER TABLE permits VALIDATE CONSTRAINT permits_updated_at_not_null;
ALTER TABLE permits ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE permits DROP CONSTRAINT permits_updated_at_not_null;

-- Step 5: reuse trigger_set_timestamp() from migration 100 — auto-updates
-- updated_at = NOW() on every UPDATE, eliminating the risk of ingestion
-- and other write paths forgetting to set it (Bug Prevention Strategy §5).
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON permits
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- ============================================================
-- DOWN
-- ============================================================
-- (commented out — scripts/migrate.js executes the entire file as one transaction
-- and does NOT respect `-- DOWN` as a section marker. Uncommenting any line below
-- would cause the migration's UP work to be immediately reversed. See
-- tasks/lessons.md "migration runner UP/DOWN convention" for the full context.)
-- DROP TRIGGER IF EXISTS set_updated_at ON permits;
-- ALTER TABLE permits DROP COLUMN IF EXISTS updated_at;
