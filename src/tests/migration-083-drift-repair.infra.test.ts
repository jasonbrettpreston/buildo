// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11 Phase 0
// 🔗 MIGRATION: migrations/083_postgis_drift_repair.sql
//
// File-shape regression lock for the PostGIS drift repair migration.
// Migrations 039/067/078 were silently no-op'd due to defensive guards
// that RETURN early when postgis is absent — they were marked applied
// in schema_migrations but their PostGIS-dependent content never ran.
// Migration 083 replays that content idempotently. These tests lock
// the critical invariants of the repair so a future edit can't remove
// them without breaking the test suite.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../migrations/083_postgis_drift_repair.sql',
);

const source = fs.readFileSync(MIGRATION_PATH, 'utf-8');

describe('migration 083 — PostGIS drift repair', () => {
  describe('pre-flight', () => {
    it('raises a descriptive EXCEPTION if postgis is unavailable at the OS level', () => {
      // Without this check, the default pg error is "could not open
      // extension control file" which is uninformative. The custom
      // EXCEPTION gives the operator multi-OS install guidance.
      expect(source).toContain('RAISE EXCEPTION');
      expect(source).toContain('pg_available_extensions');
      expect(source).toMatch(/PostGIS package is not available/);
    });

    it('loads the postgis extension via CREATE EXTENSION IF NOT EXISTS', () => {
      expect(source).toContain('CREATE EXTENSION IF NOT EXISTS postgis');
    });
  });

  describe('permits.location repair (from migration 067)', () => {
    it('adds permits.location as geometry(Point, 4326) with IF NOT EXISTS', () => {
      expect(source).toMatch(
        /ALTER TABLE permits ADD COLUMN IF NOT EXISTS location geometry\(Point, 4326\)/,
      );
    });

    it('creates permits_set_location() function matching migration 067 body', () => {
      expect(source).toContain('CREATE OR REPLACE FUNCTION permits_set_location()');
      expect(source).toContain('ST_MakePoint(NEW.longitude::float8, NEW.latitude::float8)');
      // IS DISTINCT FROM guards to avoid trigger churn on unchanged rows
      expect(source).toContain('NEW.latitude IS DISTINCT FROM OLD.latitude');
      expect(source).toContain('NEW.longitude IS DISTINCT FROM OLD.longitude');
    });

    it('binds the trigger to BEFORE INSERT OR UPDATE OF latitude, longitude', () => {
      expect(source).toContain('DROP TRIGGER IF EXISTS trg_permits_set_location ON permits');
      expect(source).toMatch(
        /CREATE TRIGGER trg_permits_set_location\s+BEFORE INSERT OR UPDATE OF latitude, longitude/,
      );
    });

    it('creates the geometry GiST index with IF NOT EXISTS (large-table DO block pattern)', () => {
      expect(source).toContain('CREATE INDEX IF NOT EXISTS idx_permits_location_gist');
      expect(source).toContain('USING GIST (location)');
    });
  });

  describe('permits.location backfill', () => {
    it('uses a direct SET (not via trigger) and is idempotent via IS NULL', () => {
      // Direct SET is CRITICAL — the trigger fires only on UPDATE OF
      // latitude, longitude. If we did `UPDATE permits SET latitude = latitude`
      // to force trigger invocation, the trigger's IS DISTINCT FROM
      // guard would skip every row (latitude didn't change), and nothing
      // would happen. Direct SET on location bypasses the trigger entirely.
      expect(source).toMatch(/UPDATE permits\s+SET location = ST_SetSRID/);
      expect(source).toContain('location IS NULL');
    });

    it('guards corrupted coordinates with BETWEEN range checks (WGS84)', () => {
      // Out-of-range latitude/longitude (e.g. 91.5, -185) would produce
      // invalid geometries that crash ST_DWithin queries downstream.
      // Range guards leave those rows with NULL location; the lead feed
      // SQL already filters `p.location IS NOT NULL`.
      expect(source).toContain('latitude BETWEEN -90 AND 90');
      expect(source).toContain('longitude BETWEEN -180 AND 180');
    });

    it('uses ST_MakePoint(longitude, latitude) order — lng FIRST (GIS convention)', () => {
      // WGS84 / PostGIS convention: X (longitude) before Y (latitude).
      // Flipping the args produces points over the ocean for Toronto
      // coordinates — the kind of silent bug that passes tests but
      // breaks production radius filters.
      expect(source).toMatch(
        /ST_MakePoint\(\s*longitude::float8,\s*latitude::float8\s*\)/,
      );
    });
  });

  describe('parcels + neighbourhoods repair (from migration 039)', () => {
    it('adds parcels.geom + neighbourhoods.geom with IF NOT EXISTS', () => {
      expect(source).toContain('ALTER TABLE parcels ADD COLUMN IF NOT EXISTS geom');
      expect(source).toContain('ALTER TABLE neighbourhoods ADD COLUMN IF NOT EXISTS geom');
    });

    it('backfills both from the legacy jsonb geometry column via ST_GeomFromGeoJSON', () => {
      expect(source).toMatch(/UPDATE parcels[\s\S]+ST_GeomFromGeoJSON\(geometry::text\)/);
      expect(source).toMatch(/UPDATE neighbourhoods[\s\S]+ST_GeomFromGeoJSON\(geometry::text\)/);
    });

    it('creates GiST indexes on both geom columns', () => {
      expect(source).toContain('idx_parcels_geom_gist');
      expect(source).toContain('idx_neighbourhoods_geom_gist');
    });
  });

  describe('geography expression index (from migration 078)', () => {
    it('creates idx_permits_location_geography_gist on (location::geography)', () => {
      // Double-parens REQUIRED by pg's expression-index parser.
      // Single-parens would be interpreted as a column name.
      expect(source).toContain('idx_permits_location_geography_gist');
      expect(source).toContain('USING GIST ((location::geography))');
    });

    it('is created AFTER the permits.location backfill (positional assertion)', () => {
      // Index statistics must reflect populated rows, not an empty
      // table. If the index is created before the backfill, the
      // planner's row estimates for `ST_DWithin(location::geography, ...)`
      // are wrong until the next ANALYZE.
      //
      // Use the unique `$geog_idx$` dollar-quoted DO block tag as the
      // needle — it only appears in the actual CREATE INDEX site,
      // unlike the symbol name and the cast expression which appear
      // in comments and the DOWN block.
      const backfillIdx = source.indexOf('UPDATE permits\nSET location');
      const geogIndexIdx = source.indexOf('$geog_idx$');
      expect(backfillIdx).toBeGreaterThan(-1);
      expect(geogIndexIdx).toBeGreaterThan(-1);
      expect(backfillIdx).toBeLessThan(geogIndexIdx);
    });
  });

  describe('DOWN block', () => {
    it('contains a commented DOWN block with reverse-order drops', () => {
      expect(source).toContain('-- DOWN');
      expect(source).toContain('-- DROP INDEX IF EXISTS idx_permits_location_geography_gist');
      expect(source).toContain('-- DROP TRIGGER IF EXISTS trg_permits_set_location');
      expect(source).toContain('-- DROP FUNCTION IF EXISTS permits_set_location()');
      expect(source).toContain('-- ALTER TABLE permits DROP COLUMN IF EXISTS location');
    });

    it('does NOT drop the postgis extension on DOWN (other tables depend on it)', () => {
      // The DOWN block leaves postgis in place because rollback should
      // only undo THIS migration's schema changes, not the cross-
      // migration extension dependency.
      expect(source).not.toMatch(/^[^-]*DROP EXTENSION postgis/m);
    });
  });

  describe('operator runbook', () => {
    it('documents the out-of-band CONCURRENTLY index creation for production', () => {
      expect(source).toContain('CREATE INDEX CONCURRENTLY');
      expect(source).toMatch(/OPERATOR RUNBOOK/i);
    });
  });
});
