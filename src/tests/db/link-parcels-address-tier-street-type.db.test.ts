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
  buildMatchSql: (descriptor: unknown, config: Record<string, number> | null, mode: 'full' | 'incremental') => {
    primary_match_sql: string;
    street_type_mismatch_sql: string;
  };
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
    await pool.query(`DELETE FROM parcel_address_points WHERE address_point_id IN (900000001, 900000002, 900000003, 900000004)`);
    await pool.query(`DELETE FROM address_points WHERE address_point_id IN (900000001, 900000002, 900000003, 900000004)`);
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

    // Since mig 257 (2026-10-10) address points carry their own parsed street type
    // (Spec 54 §3 level 0); the parcel column is the fallback.
    // id 900000001 (DR) < 900000002 (RD).
    await pool.query(
      `INSERT INTO address_points (address_point_id, latitude, longitude, geom,
         addr_num_normalized, linear_name_normalized, street_type_normalized, linear_name_full,
         maint_stage, address_status, address_class_desc)
       VALUES
        (900000001, $1::numeric, $2::numeric, ST_SetSRID(ST_MakePoint($2::float8,$1::float8),4326), '26','TESTCOLLISION','DR','Testcollision Dr','REGULAR','CURRENT','STRUCTURE'),
        (900000002, $3::numeric, $4::numeric, ST_SetSRID(ST_MakePoint($4::float8,$3::float8),4326), '26','TESTCOLLISION','RD','Testcollision Rd','REGULAR','CURRENT','STRUCTURE')`,
      [LOC_DR[1], LOC_DR[0], LOC_RD[1], LOC_RD[0]],
    );
    await pool.query(
      `INSERT INTO parcel_address_points (parcel_id, address_point_id, computed_at)
       VALUES ($1, 900000001, NOW()), ($2, 900000002, NOW())`,
      [drParcelId, rdParcelId],
    );
    return { rdParcelId, drParcelId };
  }

  // The POST-STRIP state (Spec 54 §3 level 0): the parcel rows have had their
  // street_type_normalized / address_number / linear_name_full stripped to NULL, so the
  // ONLY surviving source of the street type is the address point's own parsed column.
  // Address points keep their types ('DR' 900000003 < 'RD' 900000004, so the id tiebreak
  // would favour DR).
  async function seedStrippedCollision() {
    const rdRes = await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, addr_num_normalized,
         street_name_normalized, street_type_normalized, address_number, linear_name_full)
       VALUES ('LPD9-TEST-RD-STRP','TEST',$1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326),
         NULL,NULL,NULL,NULL,NULL)
       RETURNING id`,
      [sq(LOC_RD[0], LOC_RD[1], 0.0005)],
    );
    const drRes = await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, addr_num_normalized,
         street_name_normalized, street_type_normalized, address_number, linear_name_full)
       VALUES ('LPD9-TEST-DR-STRP','TEST',$1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326),
         NULL,NULL,NULL,NULL,NULL)
       RETURNING id`,
      [sq(LOC_DR[0], LOC_DR[1], 0.0005)],
    );
    const rdParcelId = rdRes.rows[0].id as number;
    const drParcelId = drRes.rows[0].id as number;

    await pool.query(
      `INSERT INTO address_points (address_point_id, latitude, longitude, geom,
         addr_num_normalized, linear_name_normalized, street_type_normalized, linear_name_full,
         maint_stage, address_status, address_class_desc)
       VALUES
        (900000003, $1::numeric, $2::numeric, ST_SetSRID(ST_MakePoint($2::float8,$1::float8),4326), '26','TESTCOLLISION','DR','Testcollision Dr','REGULAR','CURRENT','STRUCTURE'),
        (900000004, $3::numeric, $4::numeric, ST_SetSRID(ST_MakePoint($4::float8,$3::float8),4326), '26','TESTCOLLISION','RD','Testcollision Rd','REGULAR','CURRENT','STRUCTURE')`,
      [LOC_DR[1], LOC_DR[0], LOC_RD[1], LOC_RD[0]],
    );
    await pool.query(
      `INSERT INTO parcel_address_points (parcel_id, address_point_id, computed_at)
       VALUES ($1, 900000003, NOW()), ($2, 900000004, NOW())`,
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

  it('post-strip: a permit declaring RD resolves to the RD parcel through the ADDRESS POINT\'s type when both parcels have a NULL type (Spec 54 level 0)', async () => {
    const { rdParcelId, drParcelId } = await seedStrippedCollision();
    const { primary_match_sql } = buildMatchSql({} as never, null, 'full');
    const { rows } = await pool.query(primary_match_sql, [
      ['LPD9-PERMIT-4'], ['00'], ['26'], ['TESTCOLLISION'], ['RD'],
    ]);
    const hit = rows.find((r: { match_type: string }) => r.match_type === 'address_points_exact');
    expect(hit, 'expected an address_points_exact hit for the RD-declaring permit').toBeTruthy();
    // The parcels carry no type of their own — only the address point's parsed type can
    // disambiguate, and the id-ASC tiebreak would otherwise favour the DR-stripped parcel.
    expect(Number(hit!.parcel_id)).toBe(rdParcelId);
    expect(Number(hit!.parcel_id)).not.toBe(drParcelId);
  });

  it('post-strip: a permit declaring DR resolves to the DR parcel through the ADDRESS POINT\'s type (the OTHER direction)', async () => {
    const { rdParcelId, drParcelId } = await seedStrippedCollision();
    const { primary_match_sql } = buildMatchSql({} as never, null, 'full');
    const { rows } = await pool.query(primary_match_sql, [
      ['LPD9-PERMIT-5'], ['00'], ['26'], ['TESTCOLLISION'], ['DR'],
    ]);
    const hit = rows.find((r: { match_type: string }) => r.match_type === 'address_points_exact');
    expect(hit, 'expected an address_points_exact hit for the DR-declaring permit').toBeTruthy();
    expect(Number(hit!.parcel_id)).toBe(drParcelId);
    expect(Number(hit!.parcel_id)).not.toBe(rdParcelId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// `street_type_mismatch_sql` — the STANDING whole-table audit behind the
// `street_type_conflict` observability check (WARN, `viol == 0`), added with LP-D9 in
// commit 8a. It counts `address_points_exact` links whose linked parcel carries NO
// address point (retired_at IS NULL) whose COALESCEd street type — the address point's
// own parsed type, Spec 54 §3 level 0, the parcel column only as fallback — equals the
// permit's declared `street_type`.
//
// Structural (Spec 54 level 0): the JOIN side of the audit is "an address point on the
// linked parcel, matching the permit's type"; the parcel's street_type_normalized is
// merely the fallback when the address point carries none. These three `it`s pin that
// shape behaviourally — a regression that judged on the parcel column alone (the
// ~4.7K false-positive corner pairs the COALESCE exists to avoid) or on the
// address-point list as a whole rather than per-parcel would flip at least one of them.
//
// Every assertion is a DELTA against a baseline read BEFORE the permit link is
// inserted, so unrelated rows elsewhere in the shared test DB cannot break it.
// ─────────────────────────────────────────────────────────────────────────────────────
describe.skipIf(!dbAvailable())('street_type_mismatch_sql counts conflicting address_points_exact links (Spec 54 level 0)', () => {
  let pool: Pool;
  beforeAll(() => {
    pool = getTestPool() as Pool;
  });
  afterEach(async () => {
    await pool.query(`DELETE FROM permit_parcels WHERE permit_num LIKE 'LPD9-MM-%'`);
    await pool.query(`DELETE FROM permits WHERE permit_num LIKE 'LPD9-MM-%'`);
    await pool.query(`DELETE FROM parcel_address_points WHERE address_point_id IN (900000001, 900000002, 900000003, 900000004, 900000005)`);
    await pool.query(`DELETE FROM address_points WHERE address_point_id IN (900000001, 900000002, 900000003, 900000004, 900000005)`);
    await pool.query(`DELETE FROM parcels WHERE parcel_id LIKE 'LPD9-TEST-%'`);
  });

  /** The live audit, run exactly as the step does (`pool.query(sql)`, no params). */
  async function mismatchCount(): Promise<number> {
    const { street_type_mismatch_sql } = buildMatchSql({} as never, null, 'full');
    const { rows } = await pool.query(street_type_mismatch_sql);
    return Number(rows[0].n);
  }

  // ---- fixture helpers (same shape as the LP-D9 describe above, which is describe.skipIf'd
  // inside its own scope — hence the deliberate repetition here) ----

  async function seedCornerParcels() {
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

    // The two ORIGINAL points: 1 = DR, 2 = RD (same ids/order as the LP-D9 describe).
    await pool.query(
      `INSERT INTO address_points (address_point_id, latitude, longitude, geom,
         addr_num_normalized, linear_name_normalized, street_type_normalized, linear_name_full,
         maint_stage, address_status, address_class_desc)
       VALUES
        (900000001, $1::numeric, $2::numeric, ST_SetSRID(ST_MakePoint($2::float8,$1::float8),4326), '26','TESTCOLLISION','DR','Testcollision Dr','REGULAR','CURRENT','STRUCTURE'),
        (900000002, $3::numeric, $4::numeric, ST_SetSRID(ST_MakePoint($4::float8,$3::float8),4326), '26','TESTCOLLISION','RD','Testcollision Rd','REGULAR','CURRENT','STRUCTURE')`,
      [LOC_DR[1], LOC_DR[0], LOC_RD[1], LOC_RD[0]],
    );
    await pool.query(
      `INSERT INTO parcel_address_points (parcel_id, address_point_id, computed_at)
       VALUES ($1, 900000001, NOW()), ($2, 900000002, NOW())`,
      [drParcelId, rdParcelId],
    );
    return { rdParcelId, drParcelId };
  }

  /**
   * `seedCornerParcels()` PLUS a second DR address point bridged to the RD parcel — the real
   * corner shape (~4.7K live pairs), and the reason the audit COALESCEs on the ADDRESS POINT
   * rather than judging the parcel's own column: the RD parcel legitimately carries a DR
   * point too.
   */
  async function seedCollision() {
    const ids = await seedCornerParcels();
    await pool.query(
      `INSERT INTO address_points (address_point_id, latitude, longitude, geom,
         addr_num_normalized, linear_name_normalized, street_type_normalized, linear_name_full,
         maint_stage, address_status, address_class_desc)
       VALUES (900000005, $1::numeric, $2::numeric, ST_SetSRID(ST_MakePoint($2::float8,$1::float8),4326),
         '26','TESTCOLLISION','DR','Testcollision Dr','REGULAR','CURRENT','STRUCTURE')`,
      [LOC_DR[1], LOC_DR[0]],
    );
    await pool.query(
      `INSERT INTO parcel_address_points (parcel_id, address_point_id, computed_at)
       VALUES ($1, 900000005, NOW())`,
      [ids.rdParcelId],
    );
    return ids;
  }

  /**
   * The POST-STRIP state (Spec 54 §3 level 0): the parcel rows have had their
   * street_type_normalized / address_number / linear_name_full stripped to NULL, so the
   * ONLY surviving source of a street type is the address point's own parsed column.
   */
  async function seedStrippedCollision() {
    const rdRes = await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, addr_num_normalized,
         street_name_normalized, street_type_normalized, address_number, linear_name_full)
       VALUES ('LPD9-TEST-RD-STRP','TEST',$1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326),
         NULL,NULL,NULL,NULL,NULL)
       RETURNING id`,
      [sq(LOC_RD[0], LOC_RD[1], 0.0005)],
    );
    const drRes = await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, addr_num_normalized,
         street_name_normalized, street_type_normalized, address_number, linear_name_full)
       VALUES ('LPD9-TEST-DR-STRP','TEST',$1::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($1::text),4326),
         NULL,NULL,NULL,NULL,NULL)
       RETURNING id`,
      [sq(LOC_DR[0], LOC_DR[1], 0.0005)],
    );
    const rdParcelId = rdRes.rows[0].id as number;
    const drParcelId = drRes.rows[0].id as number;

    await pool.query(
      `INSERT INTO address_points (address_point_id, latitude, longitude, geom,
         addr_num_normalized, linear_name_normalized, street_type_normalized, linear_name_full,
         maint_stage, address_status, address_class_desc)
       VALUES
        (900000003, $1::numeric, $2::numeric, ST_SetSRID(ST_MakePoint($2::float8,$1::float8),4326), '26','TESTCOLLISION','DR','Testcollision Dr','REGULAR','CURRENT','STRUCTURE'),
        (900000004, $3::numeric, $4::numeric, ST_SetSRID(ST_MakePoint($4::float8,$3::float8),4326), '26','TESTCOLLISION','RD','Testcollision Rd','REGULAR','CURRENT','STRUCTURE')`,
      [LOC_DR[1], LOC_DR[0], LOC_RD[1], LOC_RD[0]],
    );
    await pool.query(
      `INSERT INTO parcel_address_points (parcel_id, address_point_id, computed_at)
       VALUES ($1, 900000003, NOW()), ($2, 900000004, NOW())`,
      [drParcelId, rdParcelId],
    );
    return { rdParcelId, drParcelId };
  }

  /** A `permits` row exactly as the watermark test seeds them (revision '00', stamped). */
  async function seedPermit(permitNum: string, streetType: string) {
    await pool.query(
      `INSERT INTO permits (permit_num, revision_num, street_num, street_name, street_type, parcel_linked_at, geocoded_at)
       VALUES ($1, '00', '26', 'TESTCOLLISION', $2, NOW(), NOW())`,
      [permitNum, streetType],
    );
  }

  /** The link the audit reads — `match_type = 'address_points_exact'`, `confidence` 0.95. */
  async function seedExactLink(permitNum: string, parcelId: number) {
    await pool.query(
      `INSERT INTO permit_parcels (permit_num, revision_num, parcel_id, match_type, confidence, linked_at)
       VALUES ($1, '00', $2, 'address_points_exact', 0.95, NOW())`,
      [permitNum, parcelId],
    );
  }

  it('a permit typed DR linked to the RD parcel is NOT counted — the corner parcel carries a matching DR address point (Spec 54 level 0 COALESCE)', async () => {
    const { rdParcelId } = await seedCollision();
    const before = await mismatchCount();

    // The corner shape: parcel "LPD9-TEST-RD" carries BOTH the RD point (900000002, its own)
    // and the second DR point (900000005, bridged above). Judged on the PARCEL's own column
    // this link would read as a conflict ('DR' ≠ 'RD'); judged — as the audit is — on the
    // address points bridged to the linked parcel, 900000005 matches and it is NO conflict.
    // This is the ~4.7K false-positive class the COALESCE exists to suppress.
    await seedPermit('LPD9-MM-DR-OK', 'DR');
    await seedExactLink('LPD9-MM-DR-OK', rdParcelId);

    expect(await mismatchCount()).toBe(before);
  });

  it('a permit typed CRES linked to the RD parcel IS counted — no CRES address point on that parcel', async () => {
    const { rdParcelId } = await seedCollision();
    const before = await mismatchCount();

    // Every point bridged to the RD parcel is RD or DR; nothing there can satisfy CRES.
    await seedPermit('LPD9-MM-CRES', 'CRES');
    await seedExactLink('LPD9-MM-CRES', rdParcelId);

    expect(await mismatchCount()).toBe(before + 1);
  });

  it('post-strip: a permit typed RD linked to the RD-stripped parcel IS counted when the address points carry NO type (the parcel fallback is NULL too)', async () => {
    const { rdParcelId } = await seedStrippedCollision();
    // Spec 54 level 0 stripped the PARCEL of its type; strip the ADDRESS POINT's own parsed
    // type too, so COALESCE(ap.street_type_normalized, pa.street_type_normalized) has nothing
    // to offer at all and the RD-typed permit is a genuine conflict.
    await pool.query(
      `UPDATE address_points SET street_type_normalized = NULL
        WHERE address_point_id IN (900000003, 900000004)`,
    );
    const before = await mismatchCount();

    await seedPermit('LPD9-MM-STRIP-RD', 'RD');
    await seedExactLink('LPD9-MM-STRIP-RD', rdParcelId);

    expect(await mismatchCount()).toBe(before + 1);
  });
});
