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

  // WF3-B — party-wall side-setbacks: attached types subtract fewer side setbacks (RD 2 / RS 1 / RT 0).
  // Needs the footprint box-bound so it reflects width_raw = frontage − side_count×side. WF3 coverage-default:
  // pass bylaw_max_coverage_pct=90 (495×0.90=445 m² ≫ box ~194 m²) so coverage never binds and the RD<RS<RT
  // footprint monotonicity survives (else all three collapse to the same 33% zone-default coverage cap).
  it('attached widen: identical geometry RD < RS < RT in width + footprint; RD byte-stable', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const base = { lot_size_sqm: 495, frontage_m: 22.24, depth_m: 22.24,
        bylaw_max_height_m: 10, bylaw_max_stories: 3, bylaw_max_fsi: 1.0, bylaw_max_coverage_pct: 90 }; // box-bound (coverage non-binding)
      await insMb(c, TEST_PARCEL + 10, sq(0, 0, 0.0002), { ...base, zoning_class: 'RD' });
      await insMb(c, TEST_PARCEL + 11, sq(0, 0, 0.0002), { ...base, zoning_class: 'RS' });
      await insMb(c, TEST_PARCEL + 12, sq(0, 0, 0.0002), { ...base, zoning_class: 'RT' });
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const rd = await getParcel(c, TEST_PARCEL + 10);
      const rs = await getParcel(c, TEST_PARCEL + 11);
      const rt = await getParcel(c, TEST_PARCEL + 12);
      // width_m = frontage − side_count×side_setback: RD 22.24−1.8=20.44, RS 22.24−0.9=21.34, RT 22.24
      expect(Number(rd.max_build_width_m)).toBeCloseTo(20.44, 2); // RD byte-stable (side_count 2 = old 2×)
      expect(Number(rs.max_build_width_m)).toBeCloseTo(21.34, 2);
      expect(Number(rt.max_build_width_m)).toBeCloseTo(22.24, 2);
      // footprint monotonic: attached strictly wider than detached
      expect(Number(rt.max_buildable_footprint_sqm)).toBeGreaterThan(Number(rs.max_buildable_footprint_sqm));
      expect(Number(rs.max_buildable_footprint_sqm)).toBeGreaterThan(Number(rd.max_buildable_footprint_sqm));
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  // WF3 — zone-default coverage caps the footprint when bylaw_max_coverage_pct is NULL (the ~37% gap).
  // Reuse the proven-emitting WF3-B geometry (lot 495): RD box ≈ 179 m², but 33% of 495 = 163 m² is the
  // tighter LEAST term → coverage binds. bylaw coverage NULL → the default fires.
  it('NULL bylaw coverage → footprint capped by the RD 33% zone default; defaulted + binding counted', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await insMb(c, TEST_PARCEL + 20, sq(0, 0, 0.0002), {
        lot_size_sqm: 495, frontage_m: 22.24, depth_m: 22.24, bylaw_max_height_m: 10, bylaw_max_stories: 3,
        zoning_class: 'RD', // NO bylaw_max_coverage_pct, NO fsi → coverage-box basis
      });
      const s = await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await getParcel(c, TEST_PARCEL + 20);
      // footprint = 33% × 495 = 163.35 m² (coverage-bound), NOT the ~179 m² setback box.
      expect(Number(p.max_buildable_footprint_sqm)).toBeCloseTo(163.35, 1);
      expect(s.coverage_defaulted_cnt).toBeGreaterThanOrEqual(1);
      expect(s.coverage_binding_cnt).toBeGreaterThanOrEqual(1); // coverage actually reduced the footprint
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  // WF3 — a NULL lot_size_sqm parcel cannot be coverage-capped (lot × pct = NULL → coverage_cap NULL).
  // The footprint still emits from the setback box (NOT coverage-bound), and the default is NOT counted.
  it('NULL lot_size → coverage_cap NULL, footprint falls to the box (not capped), not counted', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await insMb(c, TEST_PARCEL + 21, sq(0, 0, 0.0002), {
        lot_size_sqm: null, frontage_m: 22.24, depth_m: 22.24, bylaw_max_height_m: 10,
        bylaw_max_stories: 3, zoning_class: 'RD', // NULL coverage + NULL lot
      });
      const s = await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await getParcel(c, TEST_PARCEL + 21);
      // coverage_cap = lot(NULL) × default = NULL → LEAST drops it → footprint = the RD box (~178.65),
      // NOT coverage-bound. Proves the fix can't cap without a lot area.
      expect(Number(p.max_buildable_footprint_sqm)).toBeCloseTo(178.65, 1);
      expect(s.coverage_defaulted_cnt).toBe(0); // coverage_cap NULL → excluded (default didn't produce a cap)
      expect(s.coverage_binding_cnt).toBe(0);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  // WF3-C2: pocket-derived storeys + neighbourhood premium via the parcels→neighbourhoods spatial join.
  it('pocket norm drives stories (basis pocket, legal-capped) + aggregate p90 + hotspot + income premium', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // A neighbourhood polygon covering the (0,0) fixture area, income 120000 (→ tier 1.35).
      const nbhdGeo = JSON.stringify({ type: 'Polygon', coordinates: [[[-0.001, -0.001], [0.001, -0.001], [0.001, 0.001], [-0.001, 0.001], [-0.001, -0.001]]] });
      await c.query(
        `INSERT INTO neighbourhoods (id, neighbourhood_id, name, geom, avg_household_income)
         VALUES (8001, 8001, 'C2-TEST', ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326), 120000)`,
        [nbhdGeo],
      );
      // pocket p50=2, p90=4 (sample 20). With by-law height 10 / RD 3.0 → height_implied=3.
      await c.query(
        `INSERT INTO neighbourhood_storey_norms (neighbourhood_id, storeys_p50, storeys_p90, sample_count) VALUES (8001, 2, 4, 20)`,
      );
      // Parcel inside the nbhd, NO bylaw_max_stories (so the pocket branch drives), height 10.
      await insMb(c, TEST_PARCEL + 20, sq(0, 0, 0.0002), {
        lot_size_sqm: 495, frontage_m: 22.24, depth_m: 22.24, zoning_class: 'RD',
        bylaw_max_height_m: 10, bylaw_max_fsi: 1.0, bylaw_max_coverage_pct: 45,
      });
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await getParcel(c, TEST_PARCEL + 20);
      expect(p.max_build_stories_basis).toBe('pocket');
      expect(Number(p.max_build_stories)).toBe(2);             // LEAST(pocket p50=2, height_implied=3)
      expect(Number(p.max_build_stories_aggressive)).toBe(4);  // pocket p90, UNCAPPED
      expect(p.market_exceeds_bylaw).toBe(true);               // p90=4 > height_implied=3
      expect(Number(p.neighbourhood_id)).toBe(8001);
      expect(Number(p.neighbourhood_cost_premium)).toBe(1.35); // income 120000 → tier 1.35
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('parcel with NO neighbourhood join → premium 1.00, neighbourhood_id NULL, derived/bylaw stories unchanged', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // No neighbourhoods inserted → the LATERAL finds nothing → premium 1.00 (NULL income), basis bylaw.
      await insMb(c, TEST_PARCEL + 21, sq(0, 0, 0.0002), {
        lot_size_sqm: 495, frontage_m: 22.24, depth_m: 22.24, zoning_class: 'RD',
        bylaw_max_height_m: 10, bylaw_max_stories: 3, bylaw_max_fsi: 1.0, bylaw_max_coverage_pct: 45,
      });
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await getParcel(c, TEST_PARCEL + 21);
      expect(p.neighbourhood_id).toBeNull();
      expect(Number(p.neighbourhood_cost_premium)).toBe(1.00); // NULL income → 1.0
      expect(p.max_build_stories_basis).toBe('bylaw');         // bylaw authoritative, byte-identical
      expect(Number(p.max_build_stories)).toBe(3);
      expect(p.max_build_stories_aggressive).toBeNull();       // no pocket
      expect(p.market_exceeds_bylaw).toBe(false);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  // WF3-B NEW-1 cascade: the wider width_m for attached flows into rear_yard_area → garage GFA.
  it('accessory cascade: RT wider rear yard → larger max_garage_gfa than identical RD', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const base = { lot_size_sqm: 495, frontage_m: 22.24, depth_m: 22.24,
        bylaw_max_height_m: 10, bylaw_max_stories: 3, bylaw_max_fsi: 1.0 };
      const rdId = await insMb(c, TEST_PARCEL + 13, sq(0, 0, 0.0002), { ...base, zoning_class: 'RD' });
      const rtId = await insMb(c, TEST_PARCEL + 14, sq(0, 0, 0.0002), { ...base, zoning_class: 'RT' });
      await addMassing(c, rdId, 50, 1); // small primary → rear yard well under the garage GFA cap
      await addMassing(c, rtId, 50, 1);
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const rd = await getParcel(c, TEST_PARCEL + 13);
      const rt = await getParcel(c, TEST_PARCEL + 14);
      expect(rd.garage_permission).not.toBeNull();
      expect(rt.garage_permission).not.toBeNull();
      // RT's wider width_m → larger rear_yard_area → larger garage GFA (both below the 60 m² cap)
      expect(Number(rt.max_garage_gfa_sqm)).toBeGreaterThan(Number(rd.max_garage_gfa_sqm));
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
});
