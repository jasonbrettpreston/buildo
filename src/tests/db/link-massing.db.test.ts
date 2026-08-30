// 🔗 SPEC LINK: docs/specs/01-pipeline/56_source_massing.md (geom column / link-massing fast path, WF3 2026-06-22)
//
// Live-DB geometric proof of the link-massing predicate fix. Skipped unless DATABASE_URL (CI) or
// BUILDO_TEST_DB=1 (local testcontainer); the harness applies migrations 001..N first. All inside
// BEGIN/ROLLBACK.
//
// The bug: the PostGIS fast path tested parcel-centroid-INSIDE-building. A house covers ~35% of its
// lot, so the lot centroid lands in the yard, NOT under the house → the building is missed. The fix
// tests building-centroid-INSIDE-parcel. This test builds exactly that scenario (a small house
// footprint at the front of a lot; the lot centroid is in the rear yard) and asserts:
//   - OLD predicate ST_Contains(building.geom, lot_centroid)        → NO match (the bug)
//   - NEW predicate ST_Contains(parcel.geom, building_centroid)     → match  (the fix)

import { describe, it, expect, beforeAll } from 'vitest';
import type { PoolClient, Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS executor
const { runInvariants, runPlausibility } = require('../../../scripts/lib/step/plausibility.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LINK_MASSING_DESCRIPTOR = require('../../../scripts/link-massing.descriptor.json');

const TEST_PARCEL = 993_000_000;

// GeoJSON axis-aligned square [x0,y0]-[x1,y1] (near equator → degrees ≈ metres).
function box(x0: number, y0: number, x1: number, y1: number): string {
  return JSON.stringify({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
}

describe.skipIf(!dbAvailable())('Spec 56 link-massing — building-centroid-in-parcel predicate (WF3)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  it('links a house whose footprint is NOT under the lot centroid (the exact bug)', async () => {
    const c: PoolClient = await pool.connect();
    try {
      await c.query('BEGIN');
      // Lot: 0..0.0002 square (~22m), centroid at (0.0001, 0.0001).
      // House: small footprint at the FRONT [0.00003..0.00009] (~6.6m), centroid ~(0.00006,0.00006)
      //        — inside the lot, but the lot centroid (0.0001) is OUTSIDE the house (>0.00009).
      const lotGeo = box(0, 0, 0.0002, 0.0002);
      const houseGeo = box(0.00003, 0.00003, 0.00009, 0.00009);
      await c.query(
        `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, centroid_lat, centroid_lng)
         VALUES ($1, 'TEST', $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326), 0.0001, 0.0001)`,
        [TEST_PARCEL + 1, lotGeo],
      );
      await c.query(
        `INSERT INTO building_footprints (source_id, geometry, geom, footprint_area_sqm, centroid_lat, centroid_lng)
         VALUES ('MB-LM-1', $1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326), 40, 0.00006, 0.00006)`,
        [houseGeo],
      );

      // OLD predicate (parcel-centroid-in-building) — the bug: lot centroid is in the yard → NO match.
      const oldMatch = await c.query(
        `SELECT 1 FROM parcels p JOIN building_footprints bf
           ON bf.geom && p.geom
           AND ST_Contains(bf.geom, ST_SetSRID(ST_MakePoint(p.centroid_lng, p.centroid_lat),4326))
         WHERE p.parcel_id = $1 AND bf.source_id = 'MB-LM-1'`,
        [TEST_PARCEL + 1],
      );
      expect(oldMatch.rows.length).toBe(0); // the bug: the house is missed

      // NEW predicate (building-centroid-in-parcel) — the fix: building centre is on the lot → match.
      const newMatch = await c.query(
        `SELECT 1 FROM parcels p JOIN building_footprints bf
           ON bf.geom && p.geom
           AND ST_Contains(p.geom, ST_SetSRID(ST_MakePoint(bf.centroid_lng, bf.centroid_lat),4326))
         WHERE p.parcel_id = $1 AND bf.source_id = 'MB-LM-1'`,
        [TEST_PARCEL + 1],
      );
      expect(newMatch.rows.length).toBe(1); // the fix: the house links

      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
});

// ---------------------------------------------------------------------------
// R-C round-trip lock (Fold B-10, orchestrator ruling 2026-08-30) — proves the
// descriptor-driven executor's computed values are IDENTICAL to a raw direct
// query for the SAME sql, round-tripped against the SAME (real, current) DB
// state — before link_massing's golden invariants.json is deleted. Read-only,
// no BEGIN/ROLLBACK needed. Runs against real link_massing data, not fixture
// rows, which is the point: this validates the EXECUTION PATH (runInvariants/
// runPlausibility -> checkRow -> row.value), not the SQL text itself.
describe.skipIf(!dbAvailable())('R-C round-trip lock — invariants[]/plausibility[] executor values match raw SQL (Fold B-10)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  it('every migrated invariants[]/plausibility[] entry\'s executor-reported value equals a raw direct query for the SAME sql', async () => {
    const entries = [
      ...(Array.isArray(LINK_MASSING_DESCRIPTOR.invariants) ? LINK_MASSING_DESCRIPTOR.invariants : []),
      ...(Array.isArray(LINK_MASSING_DESCRIPTOR.plausibility) ? LINK_MASSING_DESCRIPTOR.plausibility : []),
    ];
    expect(entries.length, 'link_massing must have migrated invariants/plausibility entries for this lock to prove anything').toBeGreaterThan(0);

    const invariantsRun = await runInvariants(pool, LINK_MASSING_DESCRIPTOR, { frequency: 'every_run', when: null });
    const plausibilityRun = await runPlausibility(pool, LINK_MASSING_DESCRIPTOR, { frequency: 'every_run', when: null });
    const observations: Record<string, { value?: unknown; violations?: unknown; error?: unknown }> = {
      ...invariantsRun.observations,
      ...plausibilityRun.observations,
    };

    for (const entry of entries) {
      const obs = observations[entry.id];
      expect(obs, `${entry.id}: the executor did not report an observation`).toBeDefined();
      if (!obs) continue; // narrows for TS below — the expect() above already failed the test if this were reached
      expect(obs.error, `${entry.id}: the executor's own query errored: ${String(obs.error)}`).toBeUndefined();

      const raw = await pool.query(entry.sql);
      const rawValue = raw.rows[0] ? Object.values(raw.rows[0])[0] : null;
      const rawNumeric = typeof rawValue === 'string' && /^-?\d+(?:\.\d+)?$/.test(rawValue.trim())
        ? Number(rawValue)
        : rawValue;

      expect(obs.value, `${entry.id}: executor value diverges from a raw direct query for the same sql (round-trip, R-C)`).toEqual(rawNumeric);
    }
  });
});
