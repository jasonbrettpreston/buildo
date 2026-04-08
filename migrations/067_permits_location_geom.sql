-- Migration 067: Add native PostGIS Point column to permits
-- Spec: docs/specs/product/future/75_lead_feed_implementation_guide.md §11
--
-- Adds permits.location (geometry Point, SRID 4326) plus a BEFORE
-- INSERT/UPDATE trigger that keeps it in sync with latitude/longitude.
-- IS DISTINCT FROM guards make the trigger a no-op when neither lat
-- nor lng changed (avoids unnecessary index churn on the 237K-row table).
--
-- NOTE on CONCURRENTLY: scripts/migrate.js executes each migration file
-- as a single multi-statement query, which prevents `CREATE INDEX
-- CONCURRENTLY` from running. We use a regular `CREATE INDEX IF NOT
-- EXISTS` here. On production (237K rows) the index should be created
-- manually beforehand with:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_location_gist
--     ON permits USING GIST (location);
-- so this migration's IF NOT EXISTS becomes a no-op.

-- UP
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    RAISE NOTICE 'PostGIS not installed — skipping permits.location column, trigger, and index';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE permits ADD COLUMN IF NOT EXISTS location geometry(Point, 4326)';

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION permits_set_location() RETURNS TRIGGER AS $body$
    BEGIN
      IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        IF (TG_OP = 'INSERT')
           OR (NEW.latitude IS DISTINCT FROM OLD.latitude)
           OR (NEW.longitude IS DISTINCT FROM OLD.longitude) THEN
          NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude::float8, NEW.latitude::float8), 4326);
        END IF;
      ELSE
        NEW.location := NULL;
      END IF;
      RETURN NEW;
    END;
    $body$ LANGUAGE plpgsql;
  $fn$;

  EXECUTE 'DROP TRIGGER IF EXISTS trg_permits_set_location ON permits';
  EXECUTE 'CREATE TRIGGER trg_permits_set_location
           BEFORE INSERT OR UPDATE OF latitude, longitude ON permits
           FOR EACH ROW EXECUTE FUNCTION permits_set_location()';

  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_permits_location_gist
           ON permits USING GIST (location)';
END
$mig$;

-- DOWN
-- DROP INDEX IF EXISTS idx_permits_location_gist;
-- DROP TRIGGER IF EXISTS trg_permits_set_location ON permits;
-- DROP FUNCTION IF EXISTS permits_set_location();
-- ALTER TABLE permits DROP COLUMN IF EXISTS location;
