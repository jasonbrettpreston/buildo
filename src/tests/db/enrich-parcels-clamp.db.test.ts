// 🔗 SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §4 MB-3 (below-floor clamp — WF3 Phase 1 D-C)
//
// D-C: a build dimension below the viability floor (max_build_min_dimension_m, default 3.0 m) is not
// a geometry we believe — it is evidence the zone-default setbacks do not describe this lot.
//   - NON-ravine sub-floor → dims NULL, envelope goes COVERAGE-ONLY (footprint = coverage cap; the
//     degenerate box AND buffer are excluded), max_buildable_gfa_basis='coverage_only',
//     envelope_constrained=true, confidence low. Exact-zero rows join the same contract.
//   - RAVINE sub-floor → 'ravine_constrained': ALL envelope dims + GFAs NULL (no coverage fallback —
//     coverage×lot is ravine-blind), envelope_constrained=true, confidence low. Ordered ABOVE the
//     unconditional 'ravine' branch; an above-floor ravine parcel KEEPS 'ravine' + its envelope.
//   - Boundary: width exactly 3.0 emits; 2.99 clamps. Missing logic-var → default 3.0 (no throw).

import { describe, it, expect, beforeAll } from 'vitest';
import type { PoolClient, Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enrichMaxBuild } = require('../../../scripts/enrich-parcels');

const TEST_PARCEL = 991_200_000;
const SCOPE = `p.feature_type = 'TEST' AND p.parcel_id LIKE '9912%'`;

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
      f.is_in_ravine_protection_area ?? false, f.is_corner_lot ?? false],
  );
  const { rows } = await c.query(`SELECT id FROM parcels WHERE parcel_id=$1`, [pid]);
  return rows[0].id;
}

async function getParcel(c: PoolClient, pid: number) {
  const { rows } = await c.query(`SELECT * FROM parcels WHERE parcel_id=$1`, [pid]);
  return rows[0];
}

describe.skipIf(!dbAvailable())('WF3 D-C below-floor clamp — live DB', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  // RD non-corner: width_raw = frontage − 2×0.9 = frontage − 1.8. Sub-floor at frontage < 4.8.
  it('non-ravine sub-floor width → dims NULL, coverage-only envelope, basis coverage_only, reason lot_too_narrow', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // frontage 4.5 → width_raw 2.7 (sub-floor, > 0). depth 40 → length 26.5 (fine). lot 180.
      await insMb(c, TEST_PARCEL + 1, sq(0, 0, 0.0002), {
        lot_size_sqm: 180, frontage_m: 4.5, depth_m: 40, zoning_class: 'RD',
        bylaw_max_height_m: 10, bylaw_max_stories: 2, bylaw_max_coverage_pct: 33,
        bylaw_standard_setback_m: 6,
      });
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await getParcel(c, TEST_PARCEL + 1);
      expect(p.max_build_width_m).toBeNull();                        // RED pre-fix: 2.70 emitted
      expect(Number(p.max_build_length_m)).toBeCloseTo(26.5, 1);     // per-axis clamp: the honest dim survives (box still excluded)
      expect(Number(p.max_buildable_footprint_sqm)).toBeCloseTo(59.4, 1); // coverage-ONLY: 180 × 33%
      expect(p.max_buildable_gfa_basis).toBe('coverage_only');
      expect(p.envelope_constrained).toBe(true);
      expect(p.max_build_confidence).toBe('low');
      expect(p.envelope_constraint_reason).toBe('lot_too_narrow');
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('boundary: width exactly 3.0 EMITS; 2.99 clamps; exact-zero joins the same contract', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const base = { lot_size_sqm: 195, depth_m: 40, zoning_class: 'RD', bylaw_max_height_m: 10,
        bylaw_max_stories: 2, bylaw_max_coverage_pct: 90, bylaw_standard_setback_m: 6 };
      await insMb(c, TEST_PARCEL + 2, sq(0, 0, 0.0002), { ...base, frontage_m: 4.8 });   // width 3.00 exact
      await insMb(c, TEST_PARCEL + 3, sq(0, 0, 0.0002), { ...base, frontage_m: 4.79 });  // width 2.99
      await insMb(c, TEST_PARCEL + 4, sq(0, 0, 0.0002), { ...base, lot_size_sqm: 72, frontage_m: 1.8 }); // width 0.00 exact (lot = f×d so confidence emits)
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const atFloor = await getParcel(c, TEST_PARCEL + 2);
      const under = await getParcel(c, TEST_PARCEL + 3);
      const zero = await getParcel(c, TEST_PARCEL + 4);
      expect(Number(atFloor.max_build_width_m)).toBeCloseTo(3.0, 2); // >= floor emits
      expect(under.max_build_width_m).toBeNull();
      expect(under.max_buildable_gfa_basis).toBe('coverage_only');
      expect(zero.max_build_width_m).toBeNull();
      expect(zero.max_buildable_gfa_basis).toBe('coverage_only');    // no "0.0 gets coverage, 0.29 gets NULL" split
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('RAVINE sub-floor → ravine_constrained: ALL envelope dims + GFAs NULL, no coverage fallback', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // The E2 exemplar shape: ravine RD, frontage 14.77 → width_raw 14.77−1.8−10 = 2.97 (sub-floor).
      // depth 80 → length 56.5 (fine). Pre-fix this emitted GFA ~500 m² priced at $4.5M.
      await insMb(c, TEST_PARCEL + 5, sq(0, 0, 0.0002), {
        lot_size_sqm: 495, frontage_m: 14.77, depth_m: 80, zoning_class: 'RD',
        bylaw_max_height_m: 10, bylaw_max_stories: 2, bylaw_max_fsi: 1.0,
        bylaw_max_coverage_pct: 33, bylaw_standard_setback_m: 6, is_in_ravine_protection_area: true,
      });
      const s = await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await getParcel(c, TEST_PARCEL + 5);
      expect(p.envelope_constraint_reason).toBe('ravine_constrained'); // RED pre-fix: 'ravine'
      expect(p.max_build_width_m).toBeNull();
      expect(p.max_build_length_m).toBeNull();
      expect(p.max_buildable_footprint_sqm).toBeNull();               // NO coverage fallback (ravine-blind)
      expect(p.max_buildable_gfa_sqm).toBeNull();                     // NOT the fsi_cap leak via LEAST
      expect(p.max_buildable_gfa_basis).toBeNull();
      expect(p.max_build_stories).toBeNull();
      expect(p.max_build_height_m).toBeNull();
      expect(p.max_build_basis).toBeNull();
      expect(p.envelope_constrained).toBe(true);
      expect(p.max_build_confidence).toBe('low');
      expect(s.ravine_constrained_cnt).toBeGreaterThanOrEqual(1);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('ravine ABOVE the floor keeps reason ravine + its envelope (the ~19,751 class is untouched)', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // 22.24 frontage, depth 40: width 22.24−1.8−10 = 10.44, length 40−6−7.5−10 = 16.5 — both clear.
      await insMb(c, TEST_PARCEL + 6, sq(0, 0, 0.0002), {
        lot_size_sqm: 495, frontage_m: 22.24, depth_m: 40, zoning_class: 'RD',
        bylaw_max_height_m: 10, bylaw_max_stories: 2, bylaw_max_fsi: 1.0,
        bylaw_max_coverage_pct: 45, bylaw_standard_setback_m: 6, is_in_ravine_protection_area: true,
      });
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await getParcel(c, TEST_PARCEL + 6);
      expect(p.envelope_constraint_reason).toBe('ravine');
      expect(Number(p.max_build_width_m)).toBeCloseTo(10.44, 2);
      expect(p.max_buildable_footprint_sqm).not.toBeNull();
      expect(p.max_buildable_gfa_sqm).not.toBeNull();
      expect(p.envelope_constrained).toBe(true);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('missing-variable window: enrichMaxBuild without minDim opt applies the 3.0 default (no throw)', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await insMb(c, TEST_PARCEL + 7, sq(0, 0, 0.0002), {
        lot_size_sqm: 195, frontage_m: 4.79, depth_m: 40, zoning_class: 'RD',
        bylaw_max_height_m: 10, bylaw_max_stories: 2, bylaw_max_coverage_pct: 33, bylaw_standard_setback_m: 6,
      });
      // No acc.minDim / no logic-var → the max-build.js default (3.0) governs; 2.99 still clamps.
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await getParcel(c, TEST_PARCEL + 7);
      expect(p.max_build_width_m).toBeNull();
      expect(p.max_buildable_gfa_basis).toBe('coverage_only');
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('control: a normal parcel is value-stable (envelope/basis/confidence/dims unchanged by D-C)', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await insMb(c, TEST_PARCEL + 8, sq(0, 0, 0.0002), {
        lot_size_sqm: 495, frontage_m: 22.24, depth_m: 22.24, zoning_class: 'RD',
        bylaw_max_height_m: 10, bylaw_max_stories: 3, bylaw_max_fsi: 1.0,
        bylaw_max_coverage_pct: 45, bylaw_standard_setback_m: 6,
      });
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await getParcel(c, TEST_PARCEL + 8);
      expect(Number(p.max_build_width_m)).toBeCloseTo(20.44, 2);
      expect(Number(p.max_build_length_m)).toBeCloseTo(8.74, 2);
      expect(p.max_buildable_gfa_basis).toBe('fsi');
      expect(p.max_build_basis).toBe('rect_approx');
      expect(p.max_build_confidence).toBe('high');
      expect(p.envelope_constraint_reason).toBeNull();
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
});
