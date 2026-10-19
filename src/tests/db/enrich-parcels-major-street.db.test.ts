// SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §2 step 7 (major-street membership)
// SPEC LINK: .cursor/major-street-audit-2026-10-19.md (operator Q-MS-1 / Q-MS-2, 2026-10-19)
//
// Live-DB test of `on_policy_road` ("a lot abutting a major street", 800.50(457)) against real PostGIS:
// the frontage arm (primary frontage street NAME = the Major Streets line's road_name, within
// enrich_parcels_major_street_frontage_m) and the flank arm (corner / through lot within
// enrich_parcels_major_street_flank_m). Config comes from the test DB's seeded logic_variables (migration 277),
// through the SAME resolveConfig the runner uses (./_lib/enrich-parcels-harness.js).
//
// Geometry: a straight Major Streets centreline along y = 0 near (0,0); lots 10 m wide x 30 m deep north of it.
// At the equator 1 degree = 111,320 m, so metres are converted with M(). One BEGIN/ROLLBACK, no cleanup.
//
// Positive / negative controls (the audit's real-data controls are in the recapture report):
//   MSD-1 frontage lot 12 m from the line, frontage name matches        -> true
//   MSD-2 local-street lot 12 m from the line, not corner/through        -> false (the side-street lot near a corner)
//   MSD-3 corner lot 10 m from the line, frontage on the local street     -> true  (flank arm, Q-MS-2)
//   MSD-4 corner lot 16 m from the line                                   -> false (beyond the flank distance)
//   MSD-5 frontage name matches but 25 m from the line                    -> false (beyond the frontage distance)
//   MSD-6 frontage name matches in another case ('TESTMAJOR ST')          -> true  (case-insensitive)
//   MSD-7 frontage name matches a DIFFERENT road's line within 20 m only  -> false (name tested against the NEARBY line)

import { describe, it, expect, beforeAll } from 'vitest';
import type { PoolClient, Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enrichParcels } = require('./_lib/enrich-parcels-harness');

const TEST_PARCEL = 990_100_000;
const TEST_SRC = 990_100_000;
const SCOPE = `p.feature_type = 'TEST' AND p.parcel_id LIKE '9901%'`;
const M = (m: number): number => m / 111_320;

function rect(x0m: number, y0m: number, x1m: number, y1m: number): string {
  const [x0, y0, x1, y1] = [M(x0m), M(y0m), M(x1m), M(y1m)];
  return JSON.stringify({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
}
function line(x0m: number, y0m: number, x1m: number, y1m: number): string {
  return JSON.stringify({ type: 'LineString', coordinates: [[M(x0m), M(y0m)], [M(x1m), M(y1m)]] });
}

async function insRoad(c: PoolClient, sid: number, name: string, g: string) {
  await c.query(
    `INSERT INTO zoning_policy_road_overlay (source_id, road_name, geometry, geom, source_dataset_version)
     VALUES ($1, $2, $3::jsonb, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($3::text),4326)), NOW())`,
    [sid, name, g],
  );
}
async function insLot(c: PoolClient, pid: number, g: string, frontage: string | null, corner: boolean) {
  await c.query(
    `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, primary_frontage_street_name, is_corner_lot, is_through_lot)
     VALUES ($1, 'TEST', $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326), $3, $4, false)`,
    [pid, g, frontage, corner],
  );
}
async function flag(c: PoolClient, pid: number): Promise<boolean | null> {
  const { rows } = await c.query('SELECT on_policy_road FROM parcels WHERE parcel_id = $1', [String(pid)]);
  return rows[0].on_policy_road;
}

describe.skipIf(!dbAvailable())('Spec 65 §2 step 7 — major-street membership (live DB)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  it('MSD-1..7 frontage-name arm, flank arm, distances, case, and the nearby-line name test', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // The Major Streets line along y = 0 (x 0..1000 m), and a different road's line far to the east.
      await insRoad(c, TEST_SRC + 1, 'Testmajor St', line(0, 0, 1000, 0));
      await insRoad(c, TEST_SRC + 2, 'Otherarterial Ave', line(5000, 0, 6000, 0));

      await insLot(c, TEST_PARCEL + 1, rect(100, 12, 110, 42), 'Testmajor St', false);
      await insLot(c, TEST_PARCEL + 2, rect(200, 12, 210, 42), 'Local St', false);
      await insLot(c, TEST_PARCEL + 3, rect(300, 10, 310, 40), 'Local St', true);
      await insLot(c, TEST_PARCEL + 4, rect(400, 16, 410, 46), 'Local St', true);
      await insLot(c, TEST_PARCEL + 5, rect(500, 25, 510, 55), 'Testmajor St', false);
      await insLot(c, TEST_PARCEL + 6, rect(600, 12, 610, 42), 'TESTMAJOR ST', false);
      // Fronts "Otherarterial Ave" by name, but the only line within 20 m is Testmajor St's.
      await insLot(c, TEST_PARCEL + 7, rect(700, 12, 710, 42), 'Otherarterial Ave', false);

      await enrichParcels(c, { scopeWhere: SCOPE, full: true });

      expect(await flag(c, TEST_PARCEL + 1), 'MSD-1 frontage lot 12 m, name matches').toBe(true);
      expect(await flag(c, TEST_PARCEL + 2), 'MSD-2 local-street lot 12 m, not corner/through').toBe(false);
      expect(await flag(c, TEST_PARCEL + 3), 'MSD-3 corner lot 10 m (flank arm)').toBe(true);
      expect(await flag(c, TEST_PARCEL + 4), 'MSD-4 corner lot 16 m').toBe(false);
      expect(await flag(c, TEST_PARCEL + 5), 'MSD-5 name matches, 25 m').toBe(false);
      expect(await flag(c, TEST_PARCEL + 6), 'MSD-6 case-insensitive name').toBe(true);
      expect(await flag(c, TEST_PARCEL + 7), 'MSD-7 name of a road whose line is not nearby').toBe(false);
    } finally {
      await c.query('ROLLBACK').catch(() => {});
      c.release();
    }
  });
});
