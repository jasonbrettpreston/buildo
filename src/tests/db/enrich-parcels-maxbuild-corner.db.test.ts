// 🔗 SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §4 MB-5 (corner width axis — WF3 Phase 1 D-A)
//
// D-A regression lock (NEW — no corner lock existed; the §5:282 claim was false). The corner branch
// charged the FRONT setback against the WIDTH: width = frontage − front − flankage. The front setback
// is a DEPTH loss — on a 13.49 m frontage RD corner it produced width 2.99 m (physically impossible;
// ~6,961 corners). Correct: width = frontage − side_setback × MIN(side_count,1) − flankage — a corner
// loses its flankage side plus at most ONE interior side setback (side_count-aware: attached corner
// units don't double-inset — the D-B intersection this lock owns).

import { describe, it, expect, beforeAll } from 'vitest';
import type { PoolClient, Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enrichMaxBuild } = require('../../../scripts/enrich-parcels');

const TEST_PARCEL = 991_100_000;
const SCOPE = `p.feature_type = 'TEST' AND p.parcel_id LIKE '9911%'`;

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
  is_in_ravine_protection_area?: boolean; is_corner_lot?: boolean;
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
       zoning_class=$10, is_in_ravine_protection_area=$11, is_corner_lot=$12
     WHERE parcel_id=$1`,
    [pid, f.lot_size_sqm ?? null, f.frontage_m ?? null, f.depth_m ?? null, f.bylaw_max_height_m ?? null,
      f.bylaw_max_stories ?? null, f.bylaw_max_fsi ?? null, f.bylaw_max_coverage_pct ?? null,
      f.bylaw_standard_setback_m ?? null, f.zoning_class ?? null,
      f.is_in_ravine_protection_area ?? false, f.is_corner_lot ?? true],
  );
  const { rows } = await c.query(`SELECT id FROM parcels WHERE parcel_id=$1`, [pid]);
  return rows[0].id;
}

async function getParcel(c: PoolClient, pid: number) {
  const { rows } = await c.query(`SELECT * FROM parcels WHERE parcel_id=$1`, [pid]);
  return rows[0];
}

describe.skipIf(!dbAvailable())('WF3 D-A corner width axis — live DB regression lock', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  it('RD corner: width = frontage − 1×side − flankage (NOT − front − flankage); width ≤ frontage', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // The E1b exemplar shape: 13.49 m frontage RD corner. Buggy axis: 13.49−6−4.5 = 2.99 m.
      // Correct: 13.49 − MIN(side_count=2,1)×0.9 − 4.5 = 8.09 m.
      await insMb(c, TEST_PARCEL + 1, sq(0, 0, 0.0002), {
        lot_size_sqm: 463, frontage_m: 13.49, depth_m: 34.29, zoning_class: 'RD',
        bylaw_max_height_m: 10, bylaw_max_stories: 2, bylaw_max_fsi: 0.6,
        bylaw_max_coverage_pct: 90, bylaw_standard_setback_m: 6, // coverage non-binding → box drives
      });
      const res = await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      expect(res.updated).toBeGreaterThanOrEqual(1);
      const p = await getParcel(c, TEST_PARCEL + 1);
      expect(Number(p.max_build_width_m)).toBeCloseTo(8.09, 2); // RED pre-fix: 2.99
      expect(Number(p.max_build_width_m)).toBeGreaterThanOrEqual(3);
      expect(Number(p.max_build_width_m)).toBeLessThanOrEqual(Number(p.frontage_m)); // high-side lot bound
      // Length keeps the DEPTH axis: depth − front − rear = 34.29 − 6 − 7.5 = 20.79 (unchanged by D-A).
      expect(Number(p.max_build_length_m)).toBeCloseTo(20.79, 2);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('attached corners (D-B intersection): RT corner loses NO interior side setback, RS exactly one', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const base = { lot_size_sqm: 463, frontage_m: 13.49, depth_m: 34.29,
        bylaw_max_height_m: 10, bylaw_max_stories: 2, bylaw_max_coverage_pct: 90, bylaw_standard_setback_m: 6 };
      await insMb(c, TEST_PARCEL + 2, sq(0, 0, 0.0002), { ...base, zoning_class: 'RS' });
      await insMb(c, TEST_PARCEL + 3, sq(0, 0, 0.0002), { ...base, zoning_class: 'RT' });
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const rs = await getParcel(c, TEST_PARCEL + 2);
      const rt = await getParcel(c, TEST_PARCEL + 3);
      // RS: MIN(side_count=1,1)=1 → 13.49 − 0.9 − 4.5 = 8.09. RT: MIN(0,1)=0 → 13.49 − 4.5 = 8.99.
      expect(Number(rs.max_build_width_m)).toBeCloseTo(8.09, 2);
      expect(Number(rt.max_build_width_m)).toBeCloseTo(8.99, 2);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('corner ∩ ravine: the −10 m ravine stack now applies to a correctly-axed width (clears the floor)', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // 22.24 m frontage RD corner in ravine: old 22.24−6−4.5−10 = 1.74 (sub-floor);
      // new 22.24−0.9−4.5−10 = 6.84 (clears 3 m). Depth long enough that length also survives.
      await insMb(c, TEST_PARCEL + 4, sq(0, 0, 0.0002), {
        lot_size_sqm: 495, frontage_m: 22.24, depth_m: 40, zoning_class: 'RD',
        bylaw_max_height_m: 10, bylaw_max_stories: 2, bylaw_max_coverage_pct: 90,
        bylaw_standard_setback_m: 6, is_in_ravine_protection_area: true,
      });
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await getParcel(c, TEST_PARCEL + 4);
      expect(Number(p.max_build_width_m)).toBeCloseTo(6.84, 2); // RED pre-fix: 1.74
      expect(Number(p.max_build_width_m)).toBeGreaterThanOrEqual(3);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('non-corner width is byte-stable (D-A touches ONLY the corner branch)', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await insMb(c, TEST_PARCEL + 5, sq(0, 0, 0.0002), {
        lot_size_sqm: 495, frontage_m: 22.24, depth_m: 22.24, zoning_class: 'RD',
        bylaw_max_height_m: 10, bylaw_max_stories: 3, bylaw_max_fsi: 1.0,
        bylaw_max_coverage_pct: 90, bylaw_standard_setback_m: 6, is_corner_lot: false,
      });
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await getParcel(c, TEST_PARCEL + 5);
      expect(Number(p.max_build_width_m)).toBeCloseTo(20.44, 2); // frontage − 2×0.9 (unchanged)
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
});
