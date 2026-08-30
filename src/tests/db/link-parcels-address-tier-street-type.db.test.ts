// 🔗 SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md §4 ("Consumed by: `link-parcels` Strategy 1a")
//             docs/specs/01-pipeline/124_step_standard_policy.md (Rule 10 row-derived verdict, G4d both-directions locks)
//             docs/reports/defect-ledger.md (LP-D9 — see the ledger row this test locks)
//
// LP-D9 (commit 8a, 2026-08-30): Strategy 1a's `address_points_exact` JOIN matched on
// house-number + street-name ONLY — no `street_type` predicate — so two addresses that
// share a house number and street NAME but differ in street TYPE (e.g. "26 MEADOWVALE
// RD" vs "26 MEADOWVALE DR", ~31.6km apart in the live DB) could collide, with the
// `ap.address_point_id ASC` tiebreak arbitrarily picking whichever candidate happened to
// have the lower id — REGARDLESS of which one the permit's own declared street_type
// names. Strategy 1b (`exact`) already carries this predicate; 1a never did.
//
// This fixture reproduces that exact collision shape at the SQL level (RED on the
// unfixed compute — the wrong parcel, PARCEL B, wins on the id-ASC tiebreak; GREEN
// after `street_type` mirrors Strategy 1b's own predicate into 1a's JOIN + WHERE).
// Fixtures are COMMITTED then cleaned. Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildMatchSql } = require('../../../scripts/lib/compute/link-parcels') as {
  buildMatchSql: (descriptor: unknown, config: Record<string, number> | null, mode: 'full' | 'incremental') => { primary_match_sql: string };
};

const sq = (x0: number, y0: number, side: number): string => JSON.stringify({
  type: 'Polygon', coordinates: [[[x0, y0], [x0 + side, y0], [x0 + side, y0 + side], [x0, y0 + side], [x0, y0]]],
});

// Two locations far apart in longitude but at the SAME latitude — mirrors the live
// 26 MEADOWVALE RD/DR collision's real-world separation while keeping
// ST_Area(geom::geography) IDENTICAL for both same-sized squares (area varies with
// latitude via the geography cast's cos(lat) factor, not with longitude alone), so the
// CTE's own area tiebreak cannot accidentally decide the outcome before street_type
// gets a chance to — the ONLY remaining disambiguator is `ap.address_point_id ASC`,
// deliberately set below so the id-ASC tiebreak alone would pick the WRONG parcel for
// one of the two directions if street_type is not part of the JOIN.
const LOC_RD: [number, number] = [-79.1577, 43.7000];
const LOC_DR: [number, number] = [-79.5066, 43.7000];

describe.skipIf(!dbAvailable())('LP-D9 — Strategy 1a address_points_exact street_type collision (live DB)', () => {
  let pool: Pool;
  beforeAll(() => {
    pool = getTestPool() as Pool;
  });
  afterEach(async () => {
    await pool.query(`DELETE FROM parcel_address_points WHERE address_point_id IN (900000001, 900000002)`);
    await pool.query(`DELETE FROM address_points WHERE address_point_id IN (900000001, 900000002)`);
    await pool.query(`DELETE FROM parcels WHERE parcel_id LIKE 'LPD9-TEST-%'`);
  });

  async function seedCollision() {
    // PARCEL_RD ("26 TESTCOLLISION RD") and PARCEL_DR ("26 TESTCOLLISION DR") — same
    // addr_num_normalized + street_name_normalized, DIFFERENT street_type_normalized,
    // far-apart geometry. PARCEL_DR's address_point gets the LOWER id so the
    // UNFIXED query's `ap.address_point_id ASC` tiebreak deterministically wins it —
    // proving the collision is real, not a coincidence of insertion order.
    const rdRes = await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, addr_num_normalized,
         street_name_normalized, street_type_normalized, address_number, linear_name_full)
       VALUES ('LPD9-TEST-RD','TEST',$1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326),
         '26','TESTCOLLISION','RD','26','Testcollision Rd')
       RETURNING id`,
      [sq(LOC_RD[0], LOC_RD[1], 0.0005)],
    );
    const drRes = await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, addr_num_normalized,
         street_name_normalized, street_type_normalized, address_number, linear_name_full)
       VALUES ('LPD9-TEST-DR','TEST',$1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326),
         '26','TESTCOLLISION','DR','26','Testcollision Dr')
       RETURNING id`,
      [sq(LOC_DR[0], LOC_DR[1], 0.0005)],
    );
    const rdParcelId = rdRes.rows[0].id as number;
    const drParcelId = drRes.rows[0].id as number;

    // address_points has NO street-type column of its own (linear_name_normalized is
    // type-less) — this is exactly why the JOIN needs the parcel's own
    // street_type_normalized to disambiguate. id 900000001 (DR) < 900000002 (RD).
    await pool.query(
      `INSERT INTO address_points (address_point_id, latitude, longitude, geom,
         addr_num_normalized, linear_name_normalized, maint_stage, address_status, address_class_desc)
       VALUES
        (900000001, $1::numeric, $2::numeric, ST_SetSRID(ST_MakePoint($2::float8,$1::float8),4326), '26','TESTCOLLISION','REGULAR','CURRENT','STRUCTURE'),
        (900000002, $3::numeric, $4::numeric, ST_SetSRID(ST_MakePoint($4::float8,$3::float8),4326), '26','TESTCOLLISION','REGULAR','CURRENT','STRUCTURE')`,
      [LOC_DR[1], LOC_DR[0], LOC_RD[1], LOC_RD[0]],
    );
    await pool.query(
      `INSERT INTO parcel_address_points (parcel_id, address_point_id, computed_at)
       VALUES ($1, 900000001, NOW()), ($2, 900000002, NOW())`,
      [drParcelId, rdParcelId],
    );
    return { rdParcelId, drParcelId };
  }

  it('a permit declaring street_type RD resolves to PARCEL_RD, never the id-ASC-favoured PARCEL_DR (locks LP-D9 both directions)', async () => {
    const { rdParcelId, drParcelId } = await seedCollision();
    const { primary_match_sql } = buildMatchSql({} as never, null, 'full');
    const { rows } = await pool.query(primary_match_sql, [
      ['LPD9-PERMIT'], ['00'], ['26'], ['TESTCOLLISION'], ['RD'],
    ]);
    const hit = rows.find((r: { match_type: string }) => r.match_type === 'address_points_exact');
    expect(hit, 'expected an address_points_exact hit for the RD-declaring permit').toBeTruthy();
    // THE ASSERTION: must be the RD parcel (the one the permit actually named), never
    // the DR parcel — which is exactly what the id-ASC tiebreak would pick if
    // street_type is not part of the JOIN. Pre-fix this is RED (parcel_id === drParcelId).
    expect(Number(hit!.parcel_id)).toBe(rdParcelId);
    expect(Number(hit!.parcel_id)).not.toBe(drParcelId);
  });

  it('a permit declaring street_type DR resolves to PARCEL_DR (the OTHER direction — proves it is not simply "always picks RD")', async () => {
    const { rdParcelId, drParcelId } = await seedCollision();
    const { primary_match_sql } = buildMatchSql({} as never, null, 'full');
    const { rows } = await pool.query(primary_match_sql, [
      ['LPD9-PERMIT-2'], ['00'], ['26'], ['TESTCOLLISION'], ['DR'],
    ]);
    const hit = rows.find((r: { match_type: string }) => r.match_type === 'address_points_exact');
    expect(hit, 'expected an address_points_exact hit for the DR-declaring permit').toBeTruthy();
    expect(Number(hit!.parcel_id)).toBe(drParcelId);
    expect(Number(hit!.parcel_id)).not.toBe(rdParcelId);
  });

  it('an EMPTY permit street_type does NOT match either collision candidate — mirrors Strategy 1b\'s own (effectively strict, not permissive) empty-type tolerance exactly', async () => {
    await seedCollision();
    const { primary_match_sql } = buildMatchSql({} as never, null, 'full');
    const { rows } = await pool.query(primary_match_sql, [
      ['LPD9-PERMIT-3'], ['00'], ['26'], ['TESTCOLLISION'], [''],
    ]);
    const hit = rows.find((r: { match_type: string }) => r.match_type === 'address_points_exact');
    // Strategy 1b's `pa.street_type_normalized = ip.street_type` JOIN condition makes its
    // own WHERE-clause "empty tolerance" dead code in practice (verified live: 0 permits
    // with empty street_type currently match via exact_address) — 1a must reproduce that
    // SAME behavior, not invent a more permissive one. An empty-type permit here should
    // fall through address_points_exact entirely (to name_only, in real cascade use).
    expect(hit).toBeUndefined();
  });
});
