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
