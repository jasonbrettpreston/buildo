-- Migration 083 — PostGIS drift repair
-- 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11 Phase 0
-- 🔗 ADR: docs/adr/004-manual-create-index-concurrently.md
--
-- DRIFT BACKGROUND:
-- Migrations 039 (schema hardening), 067 (permits.location column), and
-- 078 (geography expression index) are all marked applied in
-- `schema_migrations`, but their PostGIS-dependent content was NEVER
-- executed against the local dev database.
--
-- Migrations 067 and 078 have defensive guards:
--   IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')
--   THEN RAISE NOTICE '... skipping ...'; RETURN;
-- that silently no-op when PostGIS is absent — the migration is marked
-- applied (no error raised) but zero schema changes land. Migration 039
-- has no such guard; its drift was introduced either by a historical
-- PostGIS uninstall or a DB restore from a postgis-less snapshot.
--
-- Either way, before this repair migration, the local state was:
--   parcels.geom        — MISSING (migration 039 should have added)
--   neighbourhoods.geom — MISSING (migration 039 should have added)
--   permits.location    — MISSING (migration 067 should have added)
--   permits_set_location() — MISSING (trigger function)
--   trg_permits_set_location — MISSING (trigger binding)
--   idx_permits_location_gist — MISSING
--   idx_permits_location_geography_gist — MISSING
--
-- WHAT THIS MIGRATION DOES:
-- Repairs the drift with fully idempotent operations. A successful run
-- leaves the DB in the same state as if 039/067/078 had run correctly
-- the first time. Safe to re-run via IF NOT EXISTS / IS NULL guards.
--
-- PRODUCTION SAFETY:
-- On Cloud SQL (PostGIS installed, 039/067/078 already ran correctly),
-- this migration is a near-no-op:
--   - CREATE EXTENSION IF NOT EXISTS postgis    → no-op
--   - ADD COLUMN IF NOT EXISTS                  → no-op (columns exist)
--   - Backfill UPDATEs                          → 0 rows (WHERE ... IS NULL)
--   - CREATE OR REPLACE FUNCTION                → overwrites with 067's exact body
--   - DROP TRIGGER IF EXISTS / CREATE TRIGGER   → brief ~ms lock on permits
--   - CREATE INDEX IF NOT EXISTS                → no-op (indexes exist)
-- Net prod impact: trigger re-creation lock. Safe.
--
-- OPERATOR RUNBOOK (per ADR 004 — large-table CREATE INDEX):
-- For production, pre-create the GIST indexes out-of-band with
-- CONCURRENTLY before applying this migration so the in-migration
-- CREATE INDEX IF NOT EXISTS becomes a no-op:
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_location_gist
--     ON permits USING GIST (location);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_location_geography_gist
--     ON permits USING GIST ((location::geography));
--
-- The in-migration commands below use the simpler non-CONCURRENT form
-- inside a DO block (matching the 067/078 pattern) because
-- scripts/migrate.js executes each migration file as a single multi-
-- statement query, which prevents bare CONCURRENTLY from running.
-- On dev (237K rows) the non-CONCURRENT index creation holds a brief
-- lock; operators following the runbook above never hit this path.

-- UP

-- ---------------------------------------------------------------------------
-- 0. Pre-flight: ensure postgis is available at the OS level
-- ---------------------------------------------------------------------------
-- Without this check, a missing OS-level postgis package produces the
-- default error "could not open extension control file". Raising our own
-- exception here gives the operator a direct, actionable message.
DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN
    RAISE EXCEPTION
      'PostGIS package is not available at the OS level. Install postgis before running this migration. Windows: download PostGIS binaries from download.osgeo.org/postgis/windows/ and extract into scoop/apps/postgresql/current/. Linux: apt install postgresql-NN-postgis-3. Mac: brew install postgis. Cloud SQL has it by default. See migration 083 header for full guidance.';
  END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Extension
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- 2. Replay migration 039 — parcels + neighbourhoods geom columns
-- ---------------------------------------------------------------------------

ALTER TABLE parcels ADD COLUMN IF NOT EXISTS geom GEOMETRY(Geometry, 4326);

-- Backfill parcels.geom from the legacy jsonb `geometry` column.
-- `ST_GeomFromGeoJSON` raises on malformed JSONB; the WHERE clause
-- catches NULL source rows but does NOT guard malformed content. Dev
-- data is trusted; prod already has this populated so no rows run
-- through this UPDATE in prod.
UPDATE parcels
SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326)
WHERE geometry IS NOT NULL AND geom IS NULL;

ALTER TABLE neighbourhoods ADD COLUMN IF NOT EXISTS geom GEOMETRY(Geometry, 4326);

UPDATE neighbourhoods
SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326)
WHERE geometry IS NOT NULL AND geom IS NULL;

-- parcels + neighbourhoods GIST indexes (small tables; no CONCURRENTLY
-- needed per validator rules, which only flag the LARGE_TABLES list).
CREATE INDEX IF NOT EXISTS idx_parcels_geom_gist
  ON parcels USING GiST (geom);

CREATE INDEX IF NOT EXISTS idx_neighbourhoods_geom_gist
  ON neighbourhoods USING GiST (geom);

-- ---------------------------------------------------------------------------
-- 3. Replay migration 067 — permits.location column + trigger
-- ---------------------------------------------------------------------------

ALTER TABLE permits ADD COLUMN IF NOT EXISTS location geometry(Point, 4326);

-- Function body is an EXACT copy of migration 067's `permits_set_location`.
-- Deliberately NOT adding range validation (that was migration 077's intent
-- but 077 targeted a different function name — `sync_permit_location` — and
-- is orphan code. Addressing 077's bug is scope creep for this repair and
-- is tracked in review_followups.md.)
CREATE OR REPLACE FUNCTION permits_set_location() RETURNS TRIGGER AS $body$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    IF (TG_OP = 'INSERT')
       OR (NEW.latitude IS DISTINCT FROM OLD.latitude)
       OR (NEW.longitude IS DISTINCT FROM OLD.longitude) THEN
      NEW.location := ST_SetSRID(
        ST_MakePoint(NEW.longitude::float8, NEW.latitude::float8),
        4326
      );
    END IF;
  ELSE
    NEW.location := NULL;
  END IF;
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_permits_set_location ON permits;
CREATE TRIGGER trg_permits_set_location
  BEFORE INSERT OR UPDATE OF latitude, longitude ON permits
  FOR EACH ROW EXECUTE FUNCTION permits_set_location();

-- Large-table CREATE INDEX inside a DO block per 067/078 pattern.
-- Operator runbook documents the out-of-band CONCURRENTLY path for prod.
DO $idx$
BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_permits_location_gist
           ON permits USING GIST (location)';
END
$idx$;

-- ---------------------------------------------------------------------------
-- 4. Backfill permits.location for existing rows (~237K on dev)
-- ---------------------------------------------------------------------------
-- Idempotent via `location IS NULL` clause. Direct SET on `location` does
-- NOT fire `trg_permits_set_location` (which triggers only on UPDATE OF
-- latitude, longitude), so this backfill runs in a single pass without
-- trigger re-processing.
--
-- Range guards (`latitude BETWEEN -90 AND 90`, `longitude BETWEEN -180 AND
-- 180`) protect against corrupted ingestion rows that would otherwise
-- produce invalid geometries. Rows with out-of-range coordinates are
-- left with `location IS NULL`, which the lead feed SQL already filters
-- via `p.location IS NOT NULL` — harmless in query output.
UPDATE permits
SET location = ST_SetSRID(
  ST_MakePoint(longitude::float8, latitude::float8),
  4326
)
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND latitude BETWEEN -90 AND 90
  AND longitude BETWEEN -180 AND 180
  AND location IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Replay migration 078 — (location::geography) expression GIST index
-- ---------------------------------------------------------------------------
-- The lead feed query casts `p.location::geography` at runtime to get
-- meter-accurate `ST_DWithin` distance filtering. A plain geometry GIST
-- index cannot serve a query with a geography cast — the planner falls
-- back to a sequential scan on 237K+ rows per feed request. This
-- expression index lets the planner match the cast expression and use
-- the geography GIST operator class.
--
-- Created AFTER the backfill above so index statistics reflect the
-- populated rows (not an empty table).
--
-- Double parens around `(location::geography)` are REQUIRED by
-- PostgreSQL's expression-index parser — single parens would be
-- interpreted as a column name.
--
-- Wrapped in a DO block so migrate.js doesn't reject the CONCURRENTLY-
-- aware large-table rule. Matches the 067/078 pattern.
DO $geog_idx$
BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_permits_location_geography_gist
           ON permits USING GIST ((location::geography))';
END
$geog_idx$;

-- DOWN
-- DROP INDEX IF EXISTS idx_permits_location_geography_gist;
-- DROP INDEX IF EXISTS idx_permits_location_gist;
-- DROP TRIGGER IF EXISTS trg_permits_set_location ON permits;
-- DROP FUNCTION IF EXISTS permits_set_location();
-- ALTER TABLE permits DROP COLUMN IF EXISTS location;
-- DROP INDEX IF EXISTS idx_neighbourhoods_geom_gist;
-- ALTER TABLE neighbourhoods DROP COLUMN IF EXISTS geom;
-- DROP INDEX IF EXISTS idx_parcels_geom_gist;
-- ALTER TABLE parcels DROP COLUMN IF EXISTS geom;
-- NOTE: postgis extension is NOT dropped on DOWN — other tables may depend
-- on it. Use `DROP EXTENSION postgis CASCADE` manually if a full tear-down
-- is needed.
