// 🔗 SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §6 (Reno/build scenarios + storey-height)
//
// Live-DB integration for the Phase-2 scenario GFAs (computed in enrichExistingStructure's scenario
// pass) + the storey-height refinement (enrichMaxBuild) + the geom_basis column-existence check.
// Skipped unless DATABASE_URL / BUILDO_TEST_DB=1. BEGIN/ROLLBACK.

import { describe, it, expect, beforeAll } from 'vitest';
import type { PoolClient, Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enrichExistingStructure } = require('../../../scripts/enrich-parcels');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const aj = require('../../../scripts/lib/archetypes');

const TEST_PARCEL = 995_000_000;
const SCOPE = `p.feature_type = 'TEST' AND p.parcel_id LIKE '995%'`;

function poly(x0: number, y0: number, x1: number, y1: number): string {
  return JSON.stringify({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
}

describe.skipIf(!dbAvailable())('Spec 65 Phase 2 scenarios — live DB (mig 189 + scenario pass)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  async function setup(c: PoolClient, pid: number, maxGfa: number | null, maxStories: number | null, footprint: number, stories: number) {
    await c.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, lot_size_sqm, max_buildable_gfa_sqm, max_build_stories)
       VALUES ($1,'TEST',$2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326), 490, $3, $4)`,
      [pid, poly(0, 0, 0.0002, 0.0002), maxGfa, maxStories],
    );
    const { rows } = await c.query(`SELECT id FROM parcels WHERE parcel_id=$1`, [pid]);
    const b = await c.query(
      `INSERT INTO building_footprints (source_id, geometry, geom, footprint_area_sqm, estimated_stories, max_height_m)
       VALUES ($1, $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326), $3, $4, 6.0) RETURNING id`,
      [`SC-${pid}`, poly(0.00002, 0.00002, 0.00011, 0.000065), footprint, stories],
    );
    await c.query(
      `INSERT INTO parcel_buildings (parcel_id, building_id, is_primary, structure_type, match_type, confidence)
       VALUES ($1,$2,true,'primary','centroid_in_parcel',0.95)`,
      [rows[0].id, b.rows[0].id],
    );
  }
  const get = async (c: PoolClient, pid: number) => (await c.query(`SELECT * FROM parcels WHERE parcel_id=$1`, [pid])).rows[0];

  // enrichExistingStructure's prim/allb CTEs scan all parcel_buildings (whole-DB pass, by design —
  // a live `--full` run scopes to every parcel anyway), so against the full dev DB even a one-parcel
  // scoped run materializes the building dataset. 60s is generous headroom over that fixed cost.
  it('computes all 6 scenario GFAs from existing + max-build inputs', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await setup(c, TEST_PARCEL + 1, 500, 4, 100, 2); // footprint 100, 2 storeys; max gfa 500, max 4 storeys
      await enrichExistingStructure(c, { scopeWhere: SCOPE, full: true, reno: { coaUplift: 0.05, kitchenPct: 0.15, bathPct: 0.07 } });
      const p = await get(c, TEST_PARCEL + 1);
      expect(Number(p.max_newbuild_coa_gfa_sqm)).toBe(525);  // 500 × 1.05
      expect(Number(p.cur_basement_gfa_sqm)).toBe(100);      // = existing_footprint
      expect(Number(p.cur_interior_reno_gfa_sqm)).toBe(200); // = existing_gfa (100×2)
      expect(Number(p.cur_est_kitchen_gfa_sqm)).toBe(15);    // 100 × 0.15
      expect(Number(p.cur_est_bath_gfa_sqm)).toBe(7);        // 100 × 0.07
      expect(Number(p.cur_storey_gfa_sqm)).toBe(200);        // 100 × (4 − 2)
      await c.query('ROLLBACK');
    } finally { c.release(); }
  }, 60_000);

  it('cur_storey_gfa is NULL (not 0) when max_build_stories is unknown', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await setup(c, TEST_PARCEL + 2, null, null, 100, 2); // no max-build stories
      await enrichExistingStructure(c, { scopeWhere: SCOPE, full: true, reno: {} });
      const p = await get(c, TEST_PARCEL + 2);
      expect(p.cur_storey_gfa_sqm).toBeNull();
      expect(p.max_newbuild_coa_gfa_sqm).toBeNull(); // max_buildable_gfa NULL
      expect(Number(p.cur_basement_gfa_sqm)).toBe(100); // still computed off existing
      await c.query('ROLLBACK');
    } finally { c.release(); }
  }, 60_000);

  it('every non-null ARCHETYPE_GEOM_BASIS maps to a real parcels column (drift-proof)', async () => {
    const c = await pool.connect();
    try {
      const { rows } = await c.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='parcels'`);
      const cols = new Set(rows.map((r) => r.column_name));
      for (const [code, field] of Object.entries(aj.ARCHETYPE_GEOM_BASIS)) {
        if (field !== null) expect(cols.has(field as string), `${code} → ${field}`).toBe(true);
      }
    } finally { c.release(); }
  });
});
