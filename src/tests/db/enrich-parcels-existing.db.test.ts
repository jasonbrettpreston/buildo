// 🔗 SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §5 (Existing structure — Phase 1)
//
// Live-DB integration for the existing-structure third pass (enrichExistingStructure). Skipped
// unless DATABASE_URL (CI) or BUILDO_TEST_DB=1; harness applies migrations 001..N first. Each
// fixture sets parcels + parcel_buildings + building_footprints directly, then calls
// enrichExistingStructure({ full: true }) (full → no parcel_max_build dependency). BEGIN/ROLLBACK.

import { describe, it, expect, beforeAll } from 'vitest';
import type { PoolClient, Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enrichExistingStructure } = require('../../../scripts/enrich-parcels');

const TEST_PARCEL = 994_000_000;
const SCOPE = `p.feature_type = 'TEST' AND p.parcel_id LIKE '994%'`;

function poly(x0: number, y0: number, x1: number, y1: number): string {
  return JSON.stringify({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
}
// Two disjoint squares as a MultiPolygon (primary footprint that isn't a simple Polygon).
function multipoly(): string {
  return JSON.stringify({
    type: 'MultiPolygon',
    coordinates: [
      [[[0, 0], [0.00009, 0], [0.00009, 0.000045], [0, 0.000045], [0, 0]]],
      [[[0.0002, 0], [0.00029, 0], [0.00029, 0.000045], [0.0002, 0.000045], [0.0002, 0]]],
    ],
  });
}

async function insParcel(c: PoolClient, pid: number, geo: string, lotSqm: number | null): Promise<number> {
  await c.query(
    `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, lot_size_sqm)
     VALUES ($1, 'TEST', $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326), $3)`,
    [pid, geo, lotSqm],
  );
  const { rows } = await c.query(`SELECT id FROM parcels WHERE parcel_id=$1`, [pid]);
  return rows[0].id;
}
async function insBuilding(c: PoolClient, srcId: string, geo: string, footprint: number | null, stories: number | null, height: number | null): Promise<number> {
  const { rows } = await c.query(
    `INSERT INTO building_footprints (source_id, geometry, geom, footprint_area_sqm, estimated_stories, max_height_m)
     VALUES ($1, $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326), $3, $4, $5) RETURNING id`,
    [srcId, geo, footprint, stories, height],
  );
  return rows[0].id;
}
async function link(c: PoolClient, parcelDbId: number, buildingId: number, isPrimary: boolean, confidence: number) {
  await c.query(
    `INSERT INTO parcel_buildings (parcel_id, building_id, is_primary, structure_type, match_type, confidence)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [parcelDbId, buildingId, isPrimary, isPrimary ? 'primary' : 'garage', isPrimary ? 'centroid_in_parcel' : 'nearest', confidence],
  );
}
async function get(c: PoolClient, pid: number) {
  return (await c.query(`SELECT * FROM parcels WHERE parcel_id=$1`, [pid])).rows[0];
}

describe.skipIf(!dbAvailable())('Spec 65 Phase 1 existing-structure — live DB (mig 187 + enrichExistingStructure)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  it('high-confidence primary: footprint/stories/gfa/dims + greenspace + other-structures', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // Lot ~22m square (~490 m²); primary house ~10m×5m polygon (footprint 50, 2 storeys); a garage ~6m².
      const id = await insParcel(c, TEST_PARCEL + 1, poly(0, 0, 0.0002, 0.0002), 490);
      const house = await insBuilding(c, 'EX-1', poly(0.00002, 0.00002, 0.00011, 0.000065), 50, 2, 6.0);
      const garage = await insBuilding(c, 'EX-1G', poly(0.00015, 0.00015, 0.000174, 0.00018), 6, 1, 3.0);
      await link(c, id, house, true, 0.95);
      await link(c, id, garage, false, 0.95);
      const res = await enrichExistingStructure(c, { scopeWhere: SCOPE, full: true });
      expect(res.updated).toBeGreaterThanOrEqual(1);

      const p = await get(c, TEST_PARCEL + 1);
      expect(Number(p.existing_footprint_sqm)).toBe(50);
      expect(Number(p.existing_stories)).toBe(2);
      expect(Number(p.existing_height_m)).toBe(6);
      expect(Number(p.existing_gfa_sqm)).toBe(100); // 50 × 2
      expect(Number(p.existing_width_m)).toBeGreaterThan(0);
      expect(Number(p.existing_length_m)).toBeGreaterThan(Number(p.existing_width_m)); // 10m > 5m
      expect(p.existing_structure_confidence).toBe('high');
      expect(Number(p.existing_other_structures_count)).toBe(1);    // the garage
      expect(Number(p.existing_other_structures_sqm)).toBe(6);
      expect(Number(p.existing_greenspace_sqm)).toBeCloseTo(490 - 50 - 6, 0); // lot − primary − other

      const res2 = await enrichExistingStructure(c, { scopeWhere: SCOPE, full: true });
      expect(res2.updated).toBe(0); // idempotent
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('nearest-fallback primary (0.60) → existing_structure_confidence low', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const id = await insParcel(c, TEST_PARCEL + 2, poly(0, 0, 0.0002, 0.0002), 490);
      const b = await insBuilding(c, 'EX-2', poly(0.00002, 0.00002, 0.00011, 0.000065), 50, 2, 6.0);
      await link(c, id, b, true, 0.60);
      await enrichExistingStructure(c, { scopeWhere: SCOPE, full: true });
      const p = await get(c, TEST_PARCEL + 2);
      expect(p.existing_structure_confidence).toBe('low');
      expect(Number(p.existing_footprint_sqm)).toBe(50); // still emitted
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('bungalow stories 0 → GFA floored at 1 storey (not zeroed)', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const id = await insParcel(c, TEST_PARCEL + 3, poly(0, 0, 0.0002, 0.0002), 490);
      const b = await insBuilding(c, 'EX-3', poly(0.00002, 0.00002, 0.00011, 0.000065), 80, 0, 2.5);
      await link(c, id, b, true, 0.95);
      await enrichExistingStructure(c, { scopeWhere: SCOPE, full: true });
      const p = await get(c, TEST_PARCEL + 3);
      expect(Number(p.existing_gfa_sqm)).toBe(80); // 80 × GREATEST(1,0) = 80, not 0
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('MultiPolygon primary → oriented-envelope dims still computed', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const id = await insParcel(c, TEST_PARCEL + 4, poly(-0.0001, -0.0001, 0.0004, 0.0004), 1500);
      const b = await insBuilding(c, 'EX-4', multipoly(), 90, 2, 6.0);
      await link(c, id, b, true, 0.95);
      await enrichExistingStructure(c, { scopeWhere: SCOPE, full: true });
      const p = await get(c, TEST_PARCEL + 4);
      expect(Number(p.existing_width_m)).toBeGreaterThan(0);
      expect(Number(p.existing_length_m)).toBeGreaterThan(0);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('no massing link → existing_* all NULL', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await insParcel(c, TEST_PARCEL + 5, poly(0, 0, 0.0002, 0.0002), 490);
      await enrichExistingStructure(c, { scopeWhere: SCOPE, full: true });
      const p = await get(c, TEST_PARCEL + 5);
      expect(p.existing_footprint_sqm).toBeNull();
      expect(p.existing_gfa_sqm).toBeNull();
      expect(p.existing_structure_confidence).toBeNull();
      expect(p.existing_other_structures_count).toBeNull();
      expect(p.existing_greenspace_sqm).toBeNull();
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
});
