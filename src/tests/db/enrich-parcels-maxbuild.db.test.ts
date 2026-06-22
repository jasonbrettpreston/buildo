// 🔗 SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §4 (Max-build envelope), MB-2..MB-6
//
// Live-DB integration test for the max-build second pass (enrichMaxBuild). Skipped unless
// DATABASE_URL (CI) or BUILDO_TEST_DB=1 (local testcontainer); the harness applies migrations
// 001..186 first. The max-build pass reads ALREADY-WRITTEN parcels columns (zoning feed + lot
// dims + flags) — so each fixture sets those directly via UPDATE (no need to run the zoning pass),
// then calls enrichMaxBuild({ full: true }). All inside BEGIN/ROLLBACK (temp tables drop on rollback).
//
// Exercises the cases the SQL-string logic tests are blind to:
//   - high-confidence lot → envelope emitted (footprint/box/gfa, fsi-bound, confidence high)
//   - out-of-bounds lot → lot_size_confidence low, envelope NULL, reason low_lot_confidence
//   - heritage WITH massing → freeze to existing dims (basis heritage_existing, confidence high)
//   - heritage WITHOUT massing → heritage_no_massing, footprint NULL
//   - ravine → envelope_constrained, reason ravine
//   - idempotent re-run updates 0 rows

import { describe, it, expect, beforeAll } from 'vitest';
import type { PoolClient, Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enrichMaxBuild } = require('../../../scripts/enrich-parcels');

const TEST_PARCEL = 991_000_000;
const SCOPE = `p.feature_type = 'TEST' AND p.parcel_id LIKE '991%'`;

// GeoJSON axis-aligned square near (0,0) (equator → degrees ≈ metres: 0.0002° ≈ 22.2 m ≈ 494 m²).
function sq(x0: number, y0: number, side: number): string {
  return JSON.stringify({
    type: 'Polygon',
    coordinates: [[[x0, y0], [x0 + side, y0], [x0 + side, y0 + side], [x0, y0 + side], [x0, y0]]],
  });
}

interface MbFields {
  lot_size_sqm?: number | null; frontage_m?: number | null; depth_m?: number | null;
  bylaw_max_height_m?: number | null; bylaw_max_stories?: number | null;
  bylaw_max_fsi?: number | null; bylaw_max_coverage_pct?: number | null;
  bylaw_standard_setback_m?: number | null; zoning_class?: string | null;
  is_heritage_designated?: boolean; is_in_ravine_protection_area?: boolean; is_corner_lot?: boolean;
}

async function insMb(c: PoolClient, pid: number, geo: string, f: MbFields): Promise<number> {
  await c.query(
    `INSERT INTO parcels (parcel_id, feature_type, geometry, geom)
     VALUES ($1, 'TEST', $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326))`,
    [pid, geo],
  );
  await c.query(
    `UPDATE parcels SET lot_size_sqm=$2, frontage_m=$3, depth_m=$4, bylaw_max_height_m=$5,
       bylaw_max_stories=$6, bylaw_max_fsi=$7, bylaw_max_coverage_pct=$8, bylaw_standard_setback_m=$9,
       zoning_class=$10, is_heritage_designated=$11, is_in_ravine_protection_area=$12, is_corner_lot=$13
     WHERE parcel_id=$1`,
    [pid, f.lot_size_sqm ?? null, f.frontage_m ?? null, f.depth_m ?? null, f.bylaw_max_height_m ?? null,
      f.bylaw_max_stories ?? null, f.bylaw_max_fsi ?? null, f.bylaw_max_coverage_pct ?? null,
      f.bylaw_standard_setback_m ?? null, f.zoning_class ?? null,
      f.is_heritage_designated ?? false, f.is_in_ravine_protection_area ?? false, f.is_corner_lot ?? false],
  );
  const { rows } = await c.query(`SELECT id FROM parcels WHERE parcel_id=$1`, [pid]);
  return rows[0].id;
}

async function addMassing(c: PoolClient, parcelDbId: number, footprint: number, stories: number) {
  // building_footprints.source_id (VARCHAR NOT NULL UNIQUE) + geometry (JSONB NOT NULL) are required.
  const { rows } = await c.query(
    `INSERT INTO building_footprints (source_id, geometry, footprint_area_sqm, estimated_stories)
     VALUES ($1, '{"type":"Point","coordinates":[0,0]}'::jsonb, $2, $3) RETURNING id`,
    [`MB-TEST-${parcelDbId}`, footprint, stories],
  );
  await c.query(
    `INSERT INTO parcel_buildings (parcel_id, building_id, is_primary) VALUES ($1,$2,true)`,
    [parcelDbId, rows[0].id],
  );
}

async function getParcel(c: PoolClient, pid: number) {
  const { rows } = await c.query(`SELECT * FROM parcels WHERE parcel_id=$1`, [pid]);
  return rows[0];
}

describe.skipIf(!dbAvailable())('Spec 65 max-build — live DB (migration 185 + enrichMaxBuild)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  it('high-confidence lot → full envelope (footprint/box/gfa, fsi-bound, confidence high)', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // ~22.2m square ≈ 494 m²; dims agree with lot_size → lot_size_confidence high.
      await insMb(c, TEST_PARCEL + 1, sq(0, 0, 0.0002), {
        lot_size_sqm: 495, frontage_m: 22.24, depth_m: 22.24, zoning_class: 'RD',
        bylaw_max_height_m: 10, bylaw_max_stories: 3, bylaw_max_fsi: 1.0,
        bylaw_max_coverage_pct: 45, bylaw_standard_setback_m: 6,
      });
      const res = await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      expect(res.updated).toBeGreaterThanOrEqual(1);

      const p = await getParcel(c, TEST_PARCEL + 1);
      expect(p.lot_size_confidence).toBe('high');
      expect(p.max_build_setback_basis).toBe('bylaw');
      expect(Number(p.max_buildable_footprint_sqm)).toBeGreaterThan(0);
      expect(Number(p.max_build_width_m)).toBeGreaterThan(0);
      expect(Number(p.max_build_stories)).toBe(3);
      expect(p.max_build_basis).toBe('rect_approx');
      expect(Number(p.max_buildable_gfa_sqm)).toBeGreaterThan(0);
      expect(p.max_buildable_gfa_basis).toBe('fsi'); // fsi cap (495) < footprint×stories
      expect(p.max_build_confidence).toBe('high');
      expect(p.garden_suite_fits).toBe(true);
      expect(p.envelope_constrained).toBe(false);
      expect(p.envelope_constraint_reason).toBeNull();

      // idempotent — second full pass writes 0 rows
      const res2 = await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      expect(res2.updated).toBe(0);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('out-of-bounds lot → low confidence, envelope NULL, reason low_lot_confidence', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // ~2.2km square ≈ 4.9M m² → out of the 50–2000 band.
      await insMb(c, TEST_PARCEL + 2, sq(0, 0, 0.02), {
        lot_size_sqm: 4_900_000, frontage_m: 2220, depth_m: 2220, zoning_class: 'RD',
        bylaw_max_height_m: 10, bylaw_standard_setback_m: 6,
      });
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await getParcel(c, TEST_PARCEL + 2);
      expect(p.lot_size_confidence).toBe('low');
      expect(p.max_buildable_footprint_sqm).toBeNull();
      expect(p.max_buildable_gfa_sqm).toBeNull();
      expect(p.max_build_confidence).toBeNull();
      expect(p.garden_suite_fits).toBe(false);
      expect(p.envelope_constraint_reason).toBe('low_lot_confidence');
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('heritage WITH massing → freeze to existing dims (basis heritage_existing, confidence high)', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const id = await insMb(c, TEST_PARCEL + 3, sq(0, 0, 0.0002), {
        lot_size_sqm: 495, frontage_m: 22.24, depth_m: 22.24, zoning_class: 'RD',
        bylaw_max_height_m: 10, bylaw_max_stories: 3, bylaw_max_fsi: 1.0,
        bylaw_max_coverage_pct: 45, bylaw_standard_setback_m: 6, is_heritage_designated: true,
      });
      await addMassing(c, id, 200, 2);
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await getParcel(c, TEST_PARCEL + 3);
      expect(Number(p.max_buildable_footprint_sqm)).toBe(200);     // frozen to existing
      expect(Number(p.max_build_stories)).toBe(2);
      expect(p.max_build_basis).toBe('heritage_existing');
      expect(Number(p.max_buildable_gfa_sqm)).toBe(400);           // 200 × 2
      expect(p.max_build_confidence).toBe('high');                 // measured massing = high-accuracy
      expect(p.envelope_constrained).toBe(true);
      expect(p.envelope_constraint_reason).toBe('heritage');
      expect(p.max_build_width_m).toBeNull();                      // freeze has no W/L
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('heritage WITHOUT massing → heritage_no_massing, footprint NULL', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await insMb(c, TEST_PARCEL + 4, sq(0, 0, 0.0002), {
        lot_size_sqm: 495, frontage_m: 22.24, depth_m: 22.24, zoning_class: 'RD',
        bylaw_max_height_m: 10, bylaw_max_stories: 3, bylaw_standard_setback_m: 6,
        is_heritage_designated: true,
      });
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await getParcel(c, TEST_PARCEL + 4);
      expect(p.max_buildable_footprint_sqm).toBeNull();
      expect(p.envelope_constraint_reason).toBe('heritage_no_massing');
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('ravine lot → envelope_constrained, reason ravine', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await insMb(c, TEST_PARCEL + 5, sq(0, 0, 0.0002), {
        lot_size_sqm: 495, frontage_m: 22.24, depth_m: 22.24, zoning_class: 'RD',
        bylaw_max_height_m: 10, bylaw_max_stories: 3, bylaw_max_fsi: 1.0,
        bylaw_max_coverage_pct: 45, bylaw_standard_setback_m: 6, is_in_ravine_protection_area: true,
      });
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await getParcel(c, TEST_PARCEL + 5);
      expect(p.envelope_constrained).toBe(true);
      expect(p.envelope_constraint_reason).toBe('ravine');
      expect(p.garden_suite_fits).toBe(false); // suite excluded on ravine
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
});
