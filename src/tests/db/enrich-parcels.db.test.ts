// 🔗 SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md (v1.0) §2, §3, §5
//
// Live-DB integration test for Spec 65 enrich-parcels — migration 165 schema +
// the script's set-based spatial enrichment, against real PostGIS. Skipped unless
// DATABASE_URL (CI) or BUILDO_TEST_DB=1 (local testcontainer) is set; the harness
// applies migrations 001..165 before this runs.
//
// Exercises the bug-classes mocked-pool tests are blind to (all inside one
// BEGIN/ROLLBACK so no fixture cleanup is needed; temp tables drop on rollback):
//   - 36 columns exist live with the right types
//   - single-zone parcel: dominant identity + overlay-sourced height/coverage (D4)
//   - boundary parcel: MIN ceiling / MAX floor across 2 base zones (DEC-1) + conflict
//   - gap parcel (no intersecting zone) → all-NULL, counted (not a failure)
//   - ambiguity flag when dominant share < 0.60
//   - idempotent re-run updates 0 rows (IS DISTINCT FROM write-guard)

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PoolClient, Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enrichParcels, assertPreconditions } = require('../../../scripts/enrich-parcels');

const TEST_PARCEL = 990_000_000; // test parcel_id range — isolated by ROLLBACK
const TEST_SRC = 990_000_000;    // test source_id range for zoning fixtures
// parcels.parcel_id is VARCHAR(20) (mig 011 — the text business key, NOT the integer
// PK parcels.id), so `parcel_id >= 990000000` errors with "character varying >= integer".
// Scope by the fixtures' own feature_type='TEST' marker (set in insParcel) AND the 990-id
// prefix (insParcel ids are TEST_PARCEL+N = '990…') — two type-safe axes so the exact-count
// assertions can't be inflated by any future test that commits a 'TEST' parcel without ROLLBACK.
const SCOPE = `p.feature_type = 'TEST' AND p.parcel_id LIKE '990%'`;

// GeoJSON axis-aligned square helper [x0,y0]-[x1,y1] near (0,0), far from Toronto.
function box(x0: number, y0: number, x1: number, y1: number): string {
  return JSON.stringify({
    type: 'Polygon',
    coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
  });
}

async function insBase(
  c: PoolClient, sid: number, zn: string,
  fsi: number | null, units: number | null, frontage: number | null, g: string,
) {
  await c.query(
    // $7 is bound to BOTH the JSONB `geometry` column and the text arg of
    // ST_GeomFromGeoJSON — without explicit casts PG cannot deduce one param type
    // ("inconsistent types deduced for parameter $7"). Cast each site (text -> jsonb /
    // text -> text) so $7 resolves to text and both uses are valid. Data unchanged.
    `INSERT INTO zoning_bylaw_areas
       (source_id, zn_zone, zn_string, fsi_max, units_max, frontage_min_m, geometry, geom, source_dataset_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($7::text),4326)), NOW())`,
    [sid, zn, `${zn} (test)`, fsi, units, frontage, g],
  );
}
async function insOverlay(c: PoolClient, table: string, cols: string, vals: unknown[], g: string) {
  // geom is the last positional ($N) — wrapped in ST_Multi for the MultiPolygon column.
  const n = vals.length + 1;
  await c.query(
    // $${n} feeds both the JSONB `geometry` column and ST_GeomFromGeoJSON — cast each
    // site so PG can deduce the param type (see insBase). Data unchanged.
    `INSERT INTO ${table} (${cols}, geometry, geom, source_dataset_version)
     VALUES (${vals.map((_, i) => `$${i + 1}`).join(',')}, $${n}::jsonb, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($${n}::text),4326)), NOW())`,
    [...vals, g],
  );
}
async function insParcel(c: PoolClient, pid: number, g: string) {
  await c.query(
    // $2 feeds both the JSONB `geometry` column and ST_GeomFromGeoJSON — cast each
    // site so PG can deduce the param type (see insBase). Data unchanged.
    `INSERT INTO parcels (parcel_id, feature_type, geometry, geom)
     VALUES ($1, 'TEST', $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326))`,
    [pid, g],
  );
}
async function getParcel(c: PoolClient, pid: number) {
  const { rows } = await c.query(`SELECT * FROM parcels WHERE parcel_id = $1`, [pid]);
  return rows[0];
}

describe.skipIf(!dbAvailable())('Spec 65 enrich-parcels — live DB (migration 165 + engine)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(async () => { /* rollback-per-test isolation; pool closed by harness */ });

  it('migration 165 added all 36 zoning columns to parcels', async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='parcels'
         AND (column_name LIKE 'bylaw_%' OR column_name LIKE 'zoning_%'
              OR column_name IN ('exception_number','exception_text','bylaw_chapter','bylaw_section',
                  'bylaw_exception_ref','zone_status','in_policy_area','on_policy_road',
                  'in_rooming_house_overlay','in_parking_zone_overlay','in_building_setback_overlay',
                  'on_priority_retail','in_queenstw_eat_overlay'))`,
    );
    expect(rows.length).toBe(36);
  });

  it('assertPreconditions passes (GIST on parcels.geom + PostGIS present)', async () => {
    const c = await pool.connect();
    try { await expect(assertPreconditions(c)).resolves.not.toThrow(); }
    finally { c.release(); }
  });

  it('enriches single-zone, boundary, gap, and ambiguous parcels correctly', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // Two adjacent base zones: A=[0,0]-[10,10] (RD, fsi 2), B=[10,0]-[20,10] (CR, fsi 3).
      await insBase(c, TEST_SRC + 1, 'RD', 2.0, 10, 6, box(0, 0, 10, 10));
      await insBase(c, TEST_SRC + 2, 'CR', 3.0, 50, 9, box(10, 0, 20, 10));
      // Overlays covering the whole area.
      await insOverlay(c, 'zoning_height_overlay',
        'source_id, height_max_m, ht_stories', [TEST_SRC + 3, 15.0, 5], box(0, 0, 20, 20));
      await insOverlay(c, 'zoning_lot_coverage_overlay',
        'source_id, coverage_max_pct_override', [TEST_SRC + 4, 45.0], box(0, 0, 20, 20));
      await insOverlay(c, 'zoning_policy_area_overlay',
        'source_id, policy_id', [TEST_SRC + 5, 'P1'], box(0, 0, 20, 20));

      await insParcel(c, TEST_PARCEL + 1, box(1, 1, 2, 2));         // fully in A
      await insParcel(c, TEST_PARCEL + 2, box(8, 1, 11, 2));        // straddle: 2/3 in A
      await insParcel(c, TEST_PARCEL + 3, box(50, 50, 51, 51));     // gap (no zone)
      await insParcel(c, TEST_PARCEL + 4, box(9.4, 1, 10.6, 2));    // ~50/50 straddle → ambiguous

      const res = await enrichParcels(c, { scopeWhere: SCOPE, full: true });
      expect(res.updated).toBeGreaterThanOrEqual(3);
      expect(res.gaps).toBeGreaterThanOrEqual(1);

      // P1 — single zone A + overlays
      const p1 = await getParcel(c, TEST_PARCEL + 1);
      expect(p1.zoning_class).toBe('RD');
      expect(Number(p1.bylaw_max_fsi)).toBe(2.0);
      expect(Number(p1.bylaw_max_height_m)).toBe(15.0);   // overlay replaces base (D4)
      expect(Number(p1.bylaw_max_stories)).toBe(5);
      expect(Number(p1.bylaw_max_coverage_pct)).toBe(45.0);
      expect(p1.in_policy_area).toBe(true);
      expect(Number(p1.zoning_dominant_area_share)).toBeCloseTo(1.0, 3);
      expect(p1.zoning_is_ambiguous).toBe(false);

      // P2 — boundary, dominant A: MIN(fsi)=2, MAX(frontage)=9
      const p2 = await getParcel(c, TEST_PARCEL + 2);
      expect(p2.zoning_class).toBe('RD');
      expect(Number(p2.bylaw_max_fsi)).toBe(2.0);            // MIN(2,3) ceiling
      expect(Number(p2.bylaw_min_frontage_m)).toBe(9.0);    // MAX(6,9) floor
      expect(p2.zoning_is_ambiguous).toBe(false);           // ~0.667 share

      // P3 — gap parcel: all zoning NULL
      const p3 = await getParcel(c, TEST_PARCEL + 3);
      expect(p3.zoning_class).toBeNull();
      expect(p3.bylaw_max_fsi).toBeNull();

      // P4 — ~50/50 straddle → ambiguous
      const p4 = await getParcel(c, TEST_PARCEL + 4);
      expect(p4.zoning_is_ambiguous).toBe(true);
      expect(Number(p4.zoning_dominant_area_share)).toBeLessThan(0.6);

      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('is idempotent — a second full pass updates 0 rows, INCLUDING multi-zone parcels', async () => {
    // Regression lock: a multi-zone parcel's zoning_dominant_area_share is a
    // fraction (e.g. 0.6667). If the temp-table column is float8 but parcels is
    // NUMERIC(5,4), the IS DISTINCT FROM guard compares unequal every run and the
    // parcel never reaches its fixed point. A single-zone parcel (share=1.0) would
    // not catch this — so this fixture MUST straddle two zones.
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await insBase(c, TEST_SRC + 1, 'RD', 2.0, 10, 6, box(0, 0, 10, 10));
      await insBase(c, TEST_SRC + 2, 'CR', 3.0, 50, 9, box(10, 0, 20, 10));
      await insParcel(c, TEST_PARCEL + 1, box(1, 1, 2, 2));     // single zone
      await insParcel(c, TEST_PARCEL + 2, box(8, 1, 11, 2));    // multi-zone (2/3 vs 1/3)
      const r1 = await enrichParcels(c, { scopeWhere: SCOPE, full: true });
      expect(r1.updated).toBe(2);
      // Verify the multi-zone parcel actually has a fractional share (not 1.0).
      const p2 = await getParcel(c, TEST_PARCEL + 2);
      expect(Number(p2.zoning_dominant_area_share)).toBeGreaterThan(0.5);
      expect(Number(p2.zoning_dominant_area_share)).toBeLessThan(1.0);
      const r2 = await enrichParcels(c, { scopeWhere: SCOPE, full: true });
      expect(r2.updated).toBe(0); // <-- the regression: was = multi-zone count before the round() fix
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
});
