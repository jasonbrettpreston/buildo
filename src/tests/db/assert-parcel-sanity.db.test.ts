// 🔗 SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md (value-sanity layer) + Spec 48 §3.6
//
// Live-DB proof that runSanity's FAIL-gate catches a value regression: a seeded WELD parcel
// (9m/6st = 1.5 m/storey, physically impossible) makes the GATED `bylaw_height_per_storey_impossible`
// check non-zero → status FAIL → the row-derived verdict is FAIL. Seeding guarantees ≥1 regardless of the
// DB baseline, so this is deterministic. The PASS side (gate:true + 0 → PASS) is covered by the statusFor
// unit test. Skipped unless BUILDO_TEST_DB=1.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runSanity, deriveVerdict } = require('../../../scripts/analysis/parcel-sanity-audit.js');

const sq = (x0: number, y0: number, side: number): string => JSON.stringify({
  type: 'Polygon', coordinates: [[[x0, y0], [x0 + side, y0], [x0 + side, y0 + side], [x0, y0 + side], [x0, y0]]],
});

describe.skipIf(!dbAvailable())('assert_parcel_sanity — runSanity FAIL-gate (live DB)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterEach(async () => { await pool.query(`DELETE FROM parcels WHERE parcel_id LIKE 'SANITY-TEST-%'`); });

  it('a seeded WELD parcel (9 m / 6 storeys = 1.5 m/storey) → gated check FAILs → verdict FAIL', async () => {
    await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, zoning_class, bylaw_max_height_m, bylaw_max_stories)
       VALUES ('SANITY-TEST-WELD', 'TEST', $1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326), 'RD', 9, 6)`,
      [sq(0, 0, 0.0002)],
    );
    const { results } = await runSanity(pool);
    const weld = results.find((r: { id: string }) => r.id === 'bylaw_height_per_storey_impossible');
    expect(Number(weld.viol)).toBeGreaterThanOrEqual(1);
    expect(weld.gate).toBe(true);        // it is a gated invariant
    expect(weld.status).toBe('FAIL');    // non-zero + gate → FAIL
    // …and the step-level verdict is therefore FAIL (a gated check tripped).
    expect(deriveVerdict(results.map((r: { status: string }) => ({ status: r.status })))).toBe('FAIL');
  }, 120_000);

  // WF3 Phase 1 D-E 1 (R3-M6): a build dimension exceeding its lot dimension (the wrong-axis error
  // class D-A fixed) must trip the gated high-side invariant.
  it('a seeded wrong-axis parcel (width > frontage) → max_build_dim_exceeds_lot_dim FAILs', async () => {
    await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, zoning_class, frontage_m, depth_m, max_build_width_m, max_build_length_m)
       VALUES ('SANITY-TEST-AXIS', 'TEST', $1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326), 'RD', 10, 30, 14.5, 16.5)`,
      [sq(0, 0, 0.0002)],
    );
    const { results } = await runSanity(pool);
    const c = results.find((r: { id: string }) => r.id === 'max_build_dim_exceeds_lot_dim');
    expect(Number(c.viol)).toBeGreaterThanOrEqual(1);
    expect(c.status).toBe('FAIL');
  }, 120_000);

  // WF3 Phase 1 D-E 2 (RC 1e): a ravine_constrained parcel carrying priced cost / opt_* is the R3-M1
  // regression (the withheld envelope re-priced somewhere downstream) → gated FAIL.
  it('a seeded ravine_constrained parcel with priced cost → ravine_constrained_carries_priced_cost FAILs', async () => {
    await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, zoning_class, envelope_constraint_reason, cost_fb_total)
       VALUES ('SANITY-TEST-RVC', 'TEST', $1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326), 'RD', 'ravine_constrained', 4520847.07)`,
      [sq(0, 0, 0.0002)],
    );
    const { results } = await runSanity(pool);
    const c = results.find((r: { id: string }) => r.id === 'ravine_constrained_carries_priced_cost');
    expect(Number(c.viol)).toBeGreaterThanOrEqual(1);
    expect(c.status).toBe('FAIL');
  }, 120_000);

  // D-E 4: on a DB with no ravine_constrained rows at all, the tripwire reads inert-INFO (pop 0),
  // never a green PASS — the empty-fixture policy the plan pins.
  it('with zero ravine_constrained rows the tripwire is inert-INFO (pop 0), not PASS', async () => {
    const { results } = await runSanity(pool);
    const c = results.find((r: { id: string }) => r.id === 'ravine_constrained_carries_priced_cost');
    expect(Number(c.pop)).toBe(0);
    expect(c.inert).toBe(true);
    expect(c.status).toBe('INFO');
  }, 120_000);

  // Reality-Check finding, 2026-09-18 (correcting an earlier, ungrounded F-RC1 claim in
  // docs/reports/2026-09-18-batch2-p1-1-assert-parcel-sanity-assessment.md): the two P12-A2
  // accept-lists (COST_FB_GT15M_LEGIT / COST_ADDITION_GT50M_LEGIT) are NOT inert — measured
  // on the live dev DB, `cost_fb_total > 15000000` (lowrise, no filter) returns EXACTLY the
  // 24 accept-listed ids ($15,146,558.28-$17,559,952.91) and `cost_addition_total > 50000000`
  // (no filter) returns EXACTLY the 42 accept-listed ids ($51,683,977.14-$117,729,837.89) —
  // the lists are 100% load-bearing, filtering out their own entire current population, not
  // a dead no-op. This is the regression lock for that mechanism, proven on a clean container
  // (not the live DB's specific ids, which are environment-fragile): a REAL accept-listed id
  // (7402, COST_FB_GT15M_LEGIT) crossing the threshold is EXCLUDED (viol does not count it);
  // a NEW id (not on either list) crossing the same threshold IS counted — proving the filter
  // is a real, selective `id <> ALL(...)` exclusion, not a predicate that always reads 0.
  // S0.3 (WF3 existing-structure-area-artifacts, 2026-09-21) — the review_followups.md:3123
  // blind spot ("0 of 42 rules reference parcel_buildings/match_type/confidence/is_primary")
  // closed: two parcels sharing the SAME primary building (a block/row polygon serving both,
  // link_massing has no apportionment until slice 1) must trip both new WARN checks.
  it('two parcels sharing the same primary building → existing_structure_shared_with_other_parcel WARNs on both', async () => {
    const bf = await pool.query(
      `INSERT INTO building_footprints (source_id, geometry, geom, footprint_area_sqm)
       VALUES ('SANITY-TEST-BF-SHARED', $1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326), 200)
       RETURNING id`,
      [sq(0, 0, 0.0002)],
    );
    const buildingId = bf.rows[0].id;
    const p1 = await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, zoning_class, cur_floor_gfa_sqm)
       VALUES ('SANITY-TEST-SHARE-A', 'TEST', $1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326), 'RD', 100)
       RETURNING id`,
      [sq(0, 0, 0.0002)],
    );
    const p2 = await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, zoning_class, cur_floor_gfa_sqm)
       VALUES ('SANITY-TEST-SHARE-B', 'TEST', $1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326), 'RD', 100)
       RETURNING id`,
      [sq(0.001, 0, 0.0002)],
    );
    await pool.query(
      `INSERT INTO parcel_buildings (parcel_id, building_id, is_primary, match_type)
       VALUES ($1, $3, true, 'centroid_in_parcel'), ($2, $3, true, 'nearest')`,
      [p1.rows[0].id, p2.rows[0].id, buildingId],
    );
    try {
      const { results } = await runSanity(pool);
      const shared = results.find((r: { id: string }) => r.id === 'existing_structure_shared_with_other_parcel');
      expect(Number(shared.viol)).toBeGreaterThanOrEqual(2);
      expect(shared.status).toBe('WARN');
      const borrowed = results.find((r: { id: string }) => r.id === 'existing_structure_borrowed_primary');
      // only p2 (match_type='nearest') is a "borrowed" primary — p1's own link is centroid_in_parcel.
      expect(Number(borrowed.viol)).toBeGreaterThanOrEqual(1);
      expect(borrowed.status).toBe('WARN');
    } finally {
      await pool.query('DELETE FROM parcel_buildings WHERE building_id = $1', [buildingId]);
      await pool.query('DELETE FROM building_footprints WHERE id = $1', [buildingId]);
    }
  }, 120_000);

  // FOLD-RC3 — the reno-half of the withheld-envelope tripwire (ravine_constrained_carries_
  // priced_cost's own predicate names ONLY the max-build cost fields; this is the SEPARATE id
  // for the reno-line fields, so the existing check's own 0 baseline stays interpretable).
  it('a seeded ravine_constrained parcel with a priced GUT line → ravine_constrained_carries_priced_reno FAILs (gate:true)', async () => {
    await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, zoning_class, envelope_constraint_reason, cost_gut_total)
       VALUES ('SANITY-TEST-RVR', 'TEST', $1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326), 'RD', 'ravine_constrained', 245000)`,
      [sq(0, 0, 0.0002)],
    );
    const { results } = await runSanity(pool);
    const c = results.find((r: { id: string }) => r.id === 'ravine_constrained_carries_priced_reno');
    expect(Number(c.viol)).toBeGreaterThanOrEqual(1);
    expect(c.gate).toBe(true);
    expect(c.status).toBe('FAIL');
    // the SIBLING check (max-build cost fields only) must NOT fire on this fixture — proof the
    // two ids are genuinely disjoint predicates, not a widened copy of one another.
    const sibling = results.find((r: { id: string }) => r.id === 'ravine_constrained_carries_priced_cost');
    expect(Number(sibling.viol)).toBe(0);
  }, 120_000);

  it('P12-A2 accept-list is a real, selective filter: a listed id (7402) is excluded, a NEW id still trips', async () => {
    await pool.query(
      `INSERT INTO parcels (id, parcel_id, feature_type, geometry, geom, zoning_class, lot_size_sqm, cost_fb_total)
       VALUES
         (7402, 'SANITY-TEST-ACC', 'TEST', $1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326), 'RD', 1500, 16000000),
         (900000001, 'SANITY-TEST-NEW', 'TEST', $1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326), 'RD', 1500, 16000000)
       ON CONFLICT (id) DO UPDATE SET cost_fb_total = EXCLUDED.cost_fb_total, zoning_class = EXCLUDED.zoning_class, lot_size_sqm = EXCLUDED.lot_size_sqm`,
      [sq(0, 0, 0.0002)],
    );
    const { results } = await runSanity(pool);
    const c = results.find((r: { id: string }) => r.id === 'lowrise_cost_fb_gt_15m');
    expect(Number(c.pop)).toBe(2); // both rows are in the applies population (lowrise, cost_fb_total NOT NULL)
    expect(Number(c.viol)).toBe(1); // only the NEW (non-accept-listed) id counts as a violation
  }, 120_000);
});

// S0.3 — existing_structure_onlot_share_low is a `frequency:"validate_only"` invariants[]
// entry, NOT part of runSanity's folded checks[] scan (it needs a real ST_Intersection
// against building_footprints, not a cheap bare-`parcels` predicate) — proven directly
// against its own declared SQL (scripts/lib/assert-parcel-sanity-fields.js INVARIANT_DEFS),
// the same instrument capture-step-golden.js executes for any invariants[] entry.
describe.skipIf(!dbAvailable())('assert_parcel_sanity — existing_structure_onlot_share_low (validate_only invariant, live DB)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterEach(async () => { await pool.query(`DELETE FROM parcels WHERE parcel_id LIKE 'SANITY-TEST-%'`); });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { INVARIANT_DEFS } = require('../../../scripts/lib/assert-parcel-sanity-fields.js');
  const onlotDef = INVARIANT_DEFS.find((d: { id: string }) => d.id === 'existing_structure_onlot_share_low');

  it('a building only ~25% on-lot (RD, floor 0.90) trips the invariant; a fully on-lot building does not', async () => {
    // "on-lot" building: identical footprint to its own parcel → ratio 1.0, never a violation.
    const bfOnLot = await pool.query(
      `INSERT INTO building_footprints (source_id, geometry, geom, footprint_area_sqm)
       VALUES ('SANITY-TEST-BF-ONLOT', $1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326), 484)
       RETURNING id`,
      [sq(10, 10, 0.0002)],
    );
    const pOnLot = await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, zoning_class, cur_floor_gfa_sqm)
       VALUES ('SANITY-TEST-ONLOT', 'TEST', $1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326), 'RD', 484)
       RETURNING id`,
      [sq(10, 10, 0.0002)],
    );
    // "off-lot" building: a 4x-wider footprint whose parcel only covers ~1/4 of it (share ~0.25 < 0.90 RD floor).
    const bfOffLot = await pool.query(
      `INSERT INTO building_footprints (source_id, geometry, geom, footprint_area_sqm)
       VALUES ('SANITY-TEST-BF-OFFLOT', $1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326), 1936)
       RETURNING id`,
      [sq(20, 20, 0.0004)],
    );
    const pOffLot = await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, zoning_class, cur_floor_gfa_sqm)
       VALUES ('SANITY-TEST-OFFLOT', 'TEST', $1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326), 'RD', 484)
       RETURNING id`,
      [sq(20, 20, 0.0002)],
    );
    await pool.query(
      `INSERT INTO parcel_buildings (parcel_id, building_id, is_primary, match_type)
       VALUES ($1, $2, true, 'centroid_in_parcel'), ($3, $4, true, 'centroid_in_parcel')`,
      [pOnLot.rows[0].id, bfOnLot.rows[0].id, pOffLot.rows[0].id, bfOffLot.rows[0].id],
    );
    try {
      const r = await pool.query(onlotDef.sql);
      expect(Number(r.rows[0].viol)).toBeGreaterThanOrEqual(1);
      // the on-lot fixture alone must NOT trip it — isolate by re-running scoped to it only.
      const scopedSql: string = onlotDef.sql.replace('WHERE ', 'WHERE p.id = $1 AND ');
      const r2 = await pool.query(scopedSql, [pOnLot.rows[0].id]);
      expect(Number(r2.rows[0].viol)).toBe(0);
    } finally {
      await pool.query('DELETE FROM parcel_buildings WHERE building_id = ANY($1::int[])', [[bfOnLot.rows[0].id, bfOffLot.rows[0].id]]);
      await pool.query('DELETE FROM building_footprints WHERE id = ANY($1::int[])', [[bfOnLot.rows[0].id, bfOffLot.rows[0].id]]);
    }
  }, 120_000);
});
