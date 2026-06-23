// 🔗 SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §7 (Garage + rear-suite accessory fit)
//
// Live-DB integration for the Phase-3 accessory fit (computed in enrichMaxBuild's accessory CTEs).
// Skipped unless DATABASE_URL / BUILDO_TEST_DB=1. BEGIN/ROLLBACK. Exercises what the SQL-string
// logic tests can't: real garage/rear-suite math, the strict laneway⊕garden exclusion, the
// greenspace-driven *_permission tri-state, total-footprint (non-primary structures), and idempotency.

import { describe, it, expect, beforeAll } from 'vitest';
import type { PoolClient, Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enrichMaxBuild } = require('../../../scripts/enrich-parcels');

const TEST_PARCEL = 996_000_000;
const SCOPE = `p.feature_type = 'TEST' AND p.parcel_id LIKE '996%'`;

function sq(x0: number, y0: number, side: number): string {
  return JSON.stringify({ type: 'Polygon', coordinates: [[[x0, y0], [x0 + side, y0], [x0 + side, y0 + side], [x0, y0 + side], [x0, y0]]] });
}

interface Fields {
  lot_size_sqm: number; frontage_m: number; depth_m: number; side: number;
  zoning_class?: string; bylaw_max_height_m?: number; bylaw_max_stories?: number;
  bylaw_max_fsi?: number; bylaw_max_coverage_pct?: number; bylaw_standard_setback_m?: number;
  abuts_laneway?: boolean; is_heritage_designated?: boolean; is_in_ravine_protection_area?: boolean;
}

async function ins(c: PoolClient, pid: number, f: Fields): Promise<number> {
  await c.query(
    `INSERT INTO parcels (parcel_id, feature_type, geometry, geom)
     VALUES ($1,'TEST',$2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326))`,
    [pid, sq(0, 0, f.side)],
  );
  await c.query(
    `UPDATE parcels SET lot_size_sqm=$2, frontage_m=$3, depth_m=$4, zoning_class=$5,
       bylaw_max_height_m=$6, bylaw_max_stories=$7, bylaw_max_fsi=$8, bylaw_max_coverage_pct=$9,
       bylaw_standard_setback_m=$10, abuts_laneway=$11, is_heritage_designated=$12, is_in_ravine_protection_area=$13
     WHERE parcel_id=$1`,
    [pid, f.lot_size_sqm, f.frontage_m, f.depth_m, f.zoning_class ?? 'RD',
      f.bylaw_max_height_m ?? 10, f.bylaw_max_stories ?? 3, f.bylaw_max_fsi ?? 1.0,
      f.bylaw_max_coverage_pct ?? 45, f.bylaw_standard_setback_m ?? 6,
      f.abuts_laneway ?? false, f.is_heritage_designated ?? false, f.is_in_ravine_protection_area ?? false],
  );
  const { rows } = await c.query(`SELECT id FROM parcels WHERE parcel_id=$1`, [pid]);
  return rows[0].id;
}

async function addBuilding(c: PoolClient, parcelDbId: number, footprint: number, isPrimary: boolean) {
  const { rows } = await c.query(
    `INSERT INTO building_footprints (source_id, geometry, footprint_area_sqm, estimated_stories)
     VALUES ($1, '{"type":"Point","coordinates":[0,0]}'::jsonb, $2, 2) RETURNING id`,
    [`ACC-${parcelDbId}-${isPrimary ? 'p' : 's'}`, footprint],
  );
  await c.query(`INSERT INTO parcel_buildings (parcel_id, building_id, is_primary) VALUES ($1,$2,$3)`,
    [parcelDbId, rows[0].id, isPrimary]);
}

const get = async (c: PoolClient, pid: number) => (await c.query(`SELECT * FROM parcels WHERE parcel_id=$1`, [pid])).rows[0];
// ~22.2m square ≈ 494 m² (high-confidence lot).
const BIG = { lot_size_sqm: 495, frontage_m: 22.24, depth_m: 22.24, side: 0.0002 };

describe.skipIf(!dbAvailable())('Spec 65 Phase 3 accessory fit — live DB (mig 191 + enrichMaxBuild)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  it('non-lane lot → garden rear suite + garage, both as_of_right (ample greenspace)', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await ins(c, TEST_PARCEL + 1, { ...BIG, abuts_laneway: false });
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await get(c, TEST_PARCEL + 1);
      expect(p.rear_suite_type).toBe('garden');         // NOT laneway (no lane)
      expect(Number(p.max_rear_suite_gfa_sqm)).toBe(60); // garden cap
      expect(p.rear_suite_permission).toBe('as_of_right');
      expect(Number(p.max_garage_gfa_sqm)).toBeGreaterThan(0);
      expect(Number(p.garage_capacity_cars)).toBeGreaterThanOrEqual(1);
      expect(p.garage_permission).toBe('as_of_right');
      expect(p.garage_constraint_reason).toBeNull();
      await c.query('ROLLBACK');
    } finally { c.release(); }
  }, 60_000);

  it('lane-abutting lot → laneway rear suite (NOT garden)', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await ins(c, TEST_PARCEL + 2, { ...BIG, abuts_laneway: true });
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await get(c, TEST_PARCEL + 2);
      expect(p.rear_suite_type).toBe('laneway');
      expect(Number(p.max_rear_suite_gfa_sqm)).toBe(120); // laneway cap (2-storey)
      await c.query('ROLLBACK');
    } finally { c.release(); }
  }, 60_000);

  it('lane lot too small for a laneway suite → rear_suite_type NULL (NEVER garden on a lane lot)', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // 200 m² lot (< laneway_suite_min_lot 230), lane-abutting → laneway doesn't fit; garden forbidden on a lane lot.
      await ins(c, TEST_PARCEL + 3, { lot_size_sqm: 200, frontage_m: 14.14, depth_m: 14.14, side: 0.000127, abuts_laneway: true });
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await get(c, TEST_PARCEL + 3);
      expect(p.rear_suite_type).toBeNull();
      expect(p.max_rear_suite_gfa_sqm).toBeNull();
      // garage also blocked (lot < garage_min_lot 230) → not_permitted + reason.
      expect(p.garage_permission).toBe('not_permitted');
      expect(p.garage_constraint_reason).toBe('lot_too_small');
      await c.query('ROLLBACK');
    } finally { c.release(); }
  }, 60_000);

  it('greenspace below the soft-landscaping floor → coa_required (via a high min_soft_landscaping_pct)', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await ins(c, TEST_PARCEL + 4, { ...BIG, abuts_laneway: false });
      // 0.95 floor: garden+garage push greenspace below 0.95×lot → fits but needs a variance.
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true, acc: { minSoftPct: 0.95 } });
      const p = await get(c, TEST_PARCEL + 4);
      expect(p.garage_permission).toBe('coa_required');
      expect(p.rear_suite_permission).toBe('coa_required');
      await c.query('ROLLBACK');
    } finally { c.release(); }
  }, 60_000);

  it('an existing NON-PRIMARY structure (shed) shrinks the garage vs an identical vacant lot', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await ins(c, TEST_PARCEL + 5, { ...BIG, abuts_laneway: false });            // vacant
      const sid = await ins(c, TEST_PARCEL + 6, { ...BIG, abuts_laneway: false }); // + shed
      await addBuilding(c, sid, 120, false); // 120 m² non-primary shed
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const vacant = await get(c, TEST_PARCEL + 5);
      const shed = await get(c, TEST_PARCEL + 6);
      expect(Number(shed.max_garage_gfa_sqm)).toBeLessThan(Number(vacant.max_garage_gfa_sqm));
      await c.query('ROLLBACK');
    } finally { c.release(); }
  }, 60_000);

  it('heritage lot → garage/rear-suite not_permitted + reason; idempotent re-run writes 0', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await ins(c, TEST_PARCEL + 7, { ...BIG, abuts_laneway: false, is_heritage_designated: true });
      await addBuilding(c, (await get(c, TEST_PARCEL + 7)).id, 150, true); // primary → heritage freeze (not no-massing)
      await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      const p = await get(c, TEST_PARCEL + 7);
      expect(p.garage_permission).toBe('not_permitted');
      expect(p.garage_constraint_reason).toBe('heritage');
      expect(p.rear_suite_type).toBeNull();
      expect(p.rear_suite_permission).toBe('not_permitted');
      const res2 = await enrichMaxBuild(c, { scopeWhere: SCOPE, full: true });
      expect(res2.updated).toBe(0); // idempotent
      await c.query('ROLLBACK');
    } finally { c.release(); }
  }, 60_000);
});
