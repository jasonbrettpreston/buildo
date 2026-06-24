// 🔗 SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §5 (existing-structure honesty — WF3-A)
//
// Live-DB integration for the WF3-A data-quality changes in the existing-structure pass:
//   - RETIRE existing_stories / existing_height_m (always NULL, even when massing carries values)
//   - MISLINK guard: existing_footprint > lot × (1+tol) → whole existing structure NULL + flag
//   - cur-GFA range menu: cur_floor / cur_pot_2story (always), cur_pot_3story + range_basis gated
//     on the pocket's max_build_stories (>= 3 → '1-3' + 3-storey option; else '1-2')
// Skipped unless DATABASE_URL / BUILDO_TEST_DB=1. BEGIN/ROLLBACK.

import { describe, it, expect, beforeAll } from 'vitest';
import type { PoolClient, Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enrichExistingStructure } = require('../../../scripts/enrich-parcels');

const TEST_PARCEL = 996_000_000;
const SCOPE = `p.feature_type = 'TEST' AND p.parcel_id LIKE '996%'`;

function poly(x0: number, y0: number, x1: number, y1: number): string {
  return JSON.stringify({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
}

describe.skipIf(!dbAvailable())('Spec 65 WF3-A existing-structure honesty — live DB', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  // Insert a parcel (with an optional pocket max_build_stories) + one primary building, then enrich.
  async function setup(c: PoolClient, pid: number, lotSqm: number, footprint: number, stories: number, height: number, maxStories: number | null) {
    await c.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, lot_size_sqm, max_build_stories)
       VALUES ($1,'TEST',$2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326), $3, $4)`,
      [pid, poly(0, 0, 0.0002, 0.0002), lotSqm, maxStories],
    );
    const { rows } = await c.query(`SELECT id FROM parcels WHERE parcel_id=$1`, [pid]);
    const b = await c.query(
      `INSERT INTO building_footprints (source_id, geometry, geom, footprint_area_sqm, estimated_stories, max_height_m)
       VALUES ($1, $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326), $3, $4, $5) RETURNING id`,
      [`DQ-${pid}`, poly(0.00002, 0.00002, 0.00011, 0.000065), footprint, stories, height],
    );
    await c.query(
      `INSERT INTO parcel_buildings (parcel_id, building_id, is_primary, structure_type, match_type, confidence)
       VALUES ($1,$2,true,'primary','centroid_in_parcel',0.95)`,
      [rows[0].id, b.rows[0].id],
    );
  }
  const get = async (c: PoolClient, pid: number) => (await c.query(`SELECT * FROM parcels WHERE parcel_id=$1`, [pid])).rows[0];

  it('contaminated bungalow (massing 7 storeys / 22 m) → existing_stories + existing_height_m NULL (retired)', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await setup(c, TEST_PARCEL + 1, 490, 80, 7, 22.1, 2); // tree-contaminated massing, pocket tops at 2
      await enrichExistingStructure(c, { scopeWhere: SCOPE, full: true, reno: { mislinkTol: 0.05 } });
      const p = await get(c, TEST_PARCEL + 1);
      expect(p.existing_stories).toBeNull();   // not 7
      expect(p.existing_height_m).toBeNull();  // not 22.1
      expect(Number(p.existing_footprint_sqm)).toBe(80); // footprint trusted
      expect(p.existing_data_quality_flag).toBeNull();   // footprint 80 < lot 490 → not a mislink
      await c.query('ROLLBACK');
    } finally { c.release(); }
  }, 60_000);

  it('mislink (footprint > lot × 1.05) → whole existing structure NULL + flag + confidence low', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await setup(c, TEST_PARCEL + 2, 100, 150, 2, 6.0, 3); // 150 > 100×1.05 = wrong building (block attribution)
      await enrichExistingStructure(c, { scopeWhere: SCOPE, full: true, reno: { mislinkTol: 0.05 } });
      const p = await get(c, TEST_PARCEL + 2);
      expect(p.existing_data_quality_flag).toBe('footprint_exceeds_lot');
      expect(p.existing_structure_confidence).toBe('low');
      expect(p.existing_footprint_sqm).toBeNull();   // whole structure NULLed — not this parcel's building
      expect(p.existing_gfa_sqm).toBeNull();
      expect(p.existing_width_m).toBeNull();
      expect(p.cur_floor_gfa_sqm).toBeNull();
      expect(p.cur_pot_2story_gfa_sqm).toBeNull();
      expect(p.cur_pot_3story_gfa_sqm).toBeNull();
      expect(p.cur_gfa_range_basis).toBeNull();
      await c.query('ROLLBACK');
    } finally { c.release(); }
  }, 60_000);

  it('pocket tops at 2 storeys → range 1-2, no 3-storey option', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await setup(c, TEST_PARCEL + 3, 490, 100, 2, 6.0, 2);
      await enrichExistingStructure(c, { scopeWhere: SCOPE, full: true, reno: { mislinkTol: 0.05 } });
      const p = await get(c, TEST_PARCEL + 3);
      expect(Number(p.cur_floor_gfa_sqm)).toBe(100);
      expect(Number(p.cur_pot_2story_gfa_sqm)).toBe(200);
      expect(p.cur_pot_3story_gfa_sqm).toBeNull();
      expect(p.cur_gfa_range_basis).toBe('1-2');
      await c.query('ROLLBACK');
    } finally { c.release(); }
  }, 60_000);

  it('pocket supports 3 storeys → range 1-3, 3-storey option emitted', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await setup(c, TEST_PARCEL + 4, 490, 100, 2, 6.0, 3);
      await enrichExistingStructure(c, { scopeWhere: SCOPE, full: true, reno: { mislinkTol: 0.05 } });
      const p = await get(c, TEST_PARCEL + 4);
      expect(Number(p.cur_pot_3story_gfa_sqm)).toBe(300);
      expect(p.cur_gfa_range_basis).toBe('1-3');
      // idempotent re-run
      const res2 = await enrichExistingStructure(c, { scopeWhere: SCOPE, full: true, reno: { mislinkTol: 0.05 } });
      expect(res2.updated).toBe(0);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  }, 60_000);
});
