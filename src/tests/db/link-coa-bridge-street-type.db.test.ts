// 🔗 SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md §3 (level 0 — the address point's own street type first, parcel as fallback)
//             docs/specs/01-pipeline/42_chain_coa.md tier 1a (§6.5 step 9 — the CoA bridge path)
//             docs/specs/01-pipeline/42_chain_coa.md §6.8 (advisory lock 4201)
//
// CoA tier-1a bridge live-DB lock (WF2 brief L, 2026-10-10).
//
// The CoA script's bridge query (`apBridge`) is the twin of link-parcels Strategy 1a's
// `address_points_exact` JOIN — same street_type discipline, same 3-level disambiguation
// (type-confirmed DESC → ADDRESS_CLASS_DESC priority → ap.address_point_id ASC). It moved
// out of scripts/link-coa-to-parcels.js into scripts/lib/coa-link-sql.js (tier1aBridgeSql)
// in brief L; this test drives that function against a real DB.
//
// The collision shape: two parcels that share house number + street NAME but differ in
// street TYPE (AVE vs CRES), each bridged to its own address point, with the LOWER id on
// the WRONG one for the CRES declaration — so the `ap.address_point_id ASC` tiebreak alone
// would pick the AVE parcel for a CRES-typed CoA if the type predicate / ORDER BY key were
// dropped. Both parcel rows carry street_type_normalized NULL (the post-strip state,
// Spec 54 §3 level 0), so the ONLY surviving type source is the address point's own column.
//
// Tolerant cases (Spec 54 §3 level 0: "unknown on either side stays tolerant"): an empty
// declared type matches; a NULL-typed address point matches — but in both, `type_confirmed`
// must NOT be `true` (the row-level provenance the script counts via tier1aTypeTolerant).
//
// Fixtures are COMMITTED then cleaned. Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { tier1aBridgeSql } = require('../../../scripts/lib/coa-link-sql') as {
  tier1aBridgeSql: (hasPostGIS: boolean) => string;
};

const sq = (x0: number, y0: number, side: number): string => JSON.stringify({
  type: 'Polygon', coordinates: [[[x0, y0], [x0 + side, y0], [x0 + side, y0 + side], [x0, y0 + side], [x0, y0]]],
});

// Same latitude, far-apart longitude — keeps ST_Area(geom::geography) IDENTICAL for the two
// same-sized squares (area varies with latitude, not longitude), so the area tiebreak cannot
// decide the outcome before the type predicate gets its chance.
const LOC_AVE: [number, number] = [-79.5000, 43.7000];
const LOC_CRES: [number, number] = [-79.1000, 43.7000];
const LOC_NULL: [number, number] = [-79.3000, 43.7000];

const FIXTURE_IDS = [900000101, 900000102, 900000103];

describe.skipIf(!dbAvailable())('CoA tier-1a bridge — street_type judged on the address point (live DB)', () => {
  let pool: Pool;
  beforeAll(() => {
    pool = getTestPool() as Pool;
  });
  afterEach(async () => {
    await pool.query(`DELETE FROM parcel_address_points WHERE address_point_id IN (900000101, 900000102, 900000103)`);
    await pool.query(`DELETE FROM address_points WHERE address_point_id IN (900000101, 900000102, 900000103)`);
    await pool.query(`DELETE FROM parcels WHERE parcel_id LIKE 'COA-TEST-%'`);
  });

  /** One typed parcel + its single bridged address point. `street_type_normalized` stays NULL. */
  async function seedParcel(
    parcelId: string,
    loc: [number, number],
    pointId: number,
    pointType: string | null,
  ): Promise<number> {
    const parcelRes = await pool.query(
      `INSERT INTO parcels (parcel_id, feature_type, geometry, geom, addr_num_normalized,
         street_name_normalized, street_type_normalized, address_number, linear_name_full)
       VALUES ($1,'TEST',$2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326),
         '5','COABIRCH',NULL,NULL,NULL)
       RETURNING id`,
      [parcelId, sq(loc[0], loc[1], 0.0005)],
    );
    const parcelNumericId = parcelRes.rows[0].id as number;
    await pool.query(
      `INSERT INTO address_points (address_point_id, latitude, longitude, geom,
         addr_num_normalized, linear_name_normalized, street_type_normalized, linear_name_full,
         maint_stage, address_status, address_class_desc)
       VALUES ($1, $2::numeric, $3::numeric, ST_SetSRID(ST_MakePoint($3::float8,$2::float8),4326),
         '5','COABIRCH', $4, $5, 'REGULAR','CURRENT','STRUCTURE')`,
      [
        pointId,
        loc[1],
        loc[0],
        pointType,
        pointType === null ? 'Coabirch' : `Coabirch ${pointType}`,
      ],
    );
    await pool.query(
      `INSERT INTO parcel_address_points (parcel_id, address_point_id, computed_at)
       VALUES ($1, $2, NOW())`,
      [parcelNumericId, pointId],
    );
    return parcelNumericId;
  }

  /**
   * The collision fixture: AVE parcel + CRES parcel, both NULL-typed themselves.
   * 900000101 (AVE, the LOWER id) and 900000102 (CRES) — the id-ASC tiebreak alone
   * would favour the AVE parcel.
   */
  async function seedCollision() {
    const aveParcelId = await seedParcel('COA-TEST-AVE', LOC_AVE, 900000101, 'AVE');
    const cresParcelId = await seedParcel('COA-TEST-CRES', LOC_CRES, 900000102, 'CRES');
    return { aveParcelId, cresParcelId };
  }

  /** The NULL-typed point on its own parcel — the "unknown on either side stays tolerant" case. */
  async function seedNullTyped() {
    return seedParcel('COA-TEST-NULL', LOC_NULL, 900000103, null);
  }

  it('a CoA declaring CRES resolves to the CRES parcel, never the id-ASC-favoured AVE one, and type_confirmed is true', async () => {
    const { aveParcelId, cresParcelId } = await seedCollision();
    const { rows } = await pool.query(tier1aBridgeSql(true), ['5', 'COABIRCH', 'CRES']);
    expect(rows.length, 'expected a bridge hit for the CRES-declaring CoA').toBe(1);
    expect(rows[0].id).toBe(cresParcelId);
    expect(rows[0].id).not.toBe(aveParcelId);
    expect(rows[0].type_confirmed).toBe(true);
  });

  it('a CoA declaring AVE resolves to the AVE parcel (the OTHER direction — not simply "always picks CRES")', async () => {
    const { aveParcelId, cresParcelId } = await seedCollision();
    const { rows } = await pool.query(tier1aBridgeSql(true), ['5', 'COABIRCH', 'AVE']);
    expect(rows.length, 'expected a bridge hit for the AVE-declaring CoA').toBe(1);
    expect(rows[0].id).toBe(aveParcelId);
    expect(rows[0].id).not.toBe(cresParcelId);
    expect(rows[0].type_confirmed).toBe(true);
  });

  it("an EMPTY declared type still returns a row (tolerant) but type_confirmed is NOT true", async () => {
    await seedCollision();
    const { rows } = await pool.query(tier1aBridgeSql(true), ['5', 'COABIRCH', '']);
    expect(rows.length, 'an unknown declared type must stay tolerant, not match nothing').toBe(1);
    // $3 = '' can never equal a non-empty address-point type, so the row is a tolerant hit.
    expect(rows[0].type_confirmed).not.toBe(true);
  });

  it('a NULL-typed address point still matches a typed CoA (tolerant) but type_confirmed is NOT true', async () => {
    await seedCollision();
    // Remove the two typed candidates so only the NULL-typed point remains.
    await pool.query(`DELETE FROM parcel_address_points WHERE address_point_id IN (900000101, 900000102)`);
    await pool.query(`DELETE FROM address_points WHERE address_point_id IN (900000101, 900000102)`);
    const nullParcelId = await seedNullTyped();

    const { rows } = await pool.query(tier1aBridgeSql(true), ['5', 'COABIRCH', 'CRES']);
    expect(rows.length, 'a NULL-typed address point must still match (unknown stays tolerant)').toBe(1);
    expect(rows[0].id).toBe(nullParcelId);
    expect(rows[0].type_confirmed).not.toBe(true);
  });

  it('fixture-id guard: the ids this file owns are exactly 900000101..900000103', () => {
    expect(FIXTURE_IDS).toEqual([900000101, 900000102, 900000103]);
  });
});
