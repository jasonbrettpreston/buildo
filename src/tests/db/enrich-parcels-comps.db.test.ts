// 🔗 SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-3C (comparable-builds pass)
//
// Live-DB integration for the enrich-parcels comparable-builds kNN pass: fixtures → enrichComparableBuilds
// → the §K comp_* columns + comparable_builds JSONB. Covers the kNN match, the zoning + lot/frontage ±20%
// post-filter, the over-capture (build_ratio > 1.1) exclusion from the p50, and comp_count=0 for no-match.
// Determinism vs the ~9.1K REAL candidates: fixtures use a UNIQUE zoning_class so the zoning post-filter
// drops every real candidate regardless of distance. Skipped unless BUILDO_TEST_DB=1.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ep = require('../../../scripts/enrich-parcels');

const Z = 'RS-COMPTEST';      // unique zoning_class → zoning post-filter excludes all real candidates
const P = (n: number) => 9_900_300 + n;

async function insParcel(pool: Pool, id: number, over: Record<string, unknown>, lng: number) {
  const cols: Record<string, unknown> = {
    id, parcel_id: `COMP-TEST-${id}`, zoning_class: Z, lot_size_sqm: 400, frontage_m: 12,
    max_buildable_footprint_sqm: 140, imagery_roof_footprint_sqm: 100, ...over,
  };
  const keys = Object.keys(cols);
  const ph = keys.map((_, i) => `$${i + 1}`).join(',');
  await pool.query(
    `INSERT INTO parcels (${keys.join(',')}, geom) VALUES (${ph}, ST_SetSRID(ST_MakePoint($${keys.length + 1}, 0), 4326))
     ON CONFLICT (id) DO UPDATE SET ${keys.filter((k) => k !== 'id').map((k) => `${k}=EXCLUDED.${k}`).join(',')}, geom=EXCLUDED.geom`,
    [...keys.map((k) => cols[k]), lng],
  );
}
let pseq = 0;
async function insPermit(pool: Pool, parcel: number, projectType: string, residentialSqm: number | null = null) {
  pseq += 1;
  await pool.query(
    `INSERT INTO permits (permit_num, revision_num, project_type, zoning_dominant_parcel_id, street_num, street_name, issued_date, residential_sqm)
     VALUES ($1, '00', $2, $3, $4, 'COMPTEST AVE', now()::date - interval '1 year', $5)`,
    [`COMP-TEST-${pseq}`, projectType, parcel, String(100 + parcel % 100), residentialSqm],
  );
}

describe.skipIf(!dbAvailable())('Spec 78 §Phase-3C enrich-parcels comparable-builds — live DB (mig 202)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  afterEach(async () => {
    await pool.query(`DELETE FROM permits WHERE permit_num LIKE 'COMP-TEST-%'`);
    await pool.query(`DELETE FROM parcels WHERE parcel_id LIKE 'COMP-TEST-%'`);
    pseq = 0;
  });

  it('kNN + zoning/lot filter + over-capture exclusion; comparable_builds JSONB + comp medians', async () => {
    // Subject (no permit → not a candidate). Candidates have a recent new_build/addition permit.
    await insParcel(pool, P(0), { lot_size_sqm: 400, frontage_m: 12 }, 0);                                  // S
    await insParcel(pool, P(1), { lot_size_sqm: 400, frontage_m: 12, imagery_roof_footprint_sqm: 100 }, 0.0001); // C1 br 0.71
    await insParcel(pool, P(2), { lot_size_sqm: 420, frontage_m: 11, imagery_roof_footprint_sqm: 120 }, 0.0002); // C2 br 0.86
    await insParcel(pool, P(3), { lot_size_sqm: 700, frontage_m: 12, imagery_roof_footprint_sqm: 100 }, 0.0003); // C3 lot OUT of ±20%
    await insParcel(pool, P(4), { lot_size_sqm: 400, frontage_m: 12, imagery_roof_footprint_sqm: 200 }, 0.0004); // C4 br 1.43 (>1.1)
    await insParcel(pool, P(5), { zoning_class: 'CR-COMPTEST', lot_size_sqm: 400, frontage_m: 12 }, 0.0005);     // C5 wrong zoning
    await insPermit(pool, P(1), 'new_build');
    await insPermit(pool, P(2), 'addition');
    await insPermit(pool, P(3), 'new_build');
    await insPermit(pool, P(4), 'new_build');
    await insPermit(pool, P(5), 'new_build');

    // The pass uses an ON COMMIT DROP temp table → needs ONE dedicated connection across BEGIN→…→COMMIT.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ep.enrichComparableBuilds(client, { full: true, scopeWhere: "parcel_id = 'COMP-TEST-9900300'" });
      await client.query('COMMIT');
    } finally { client.release(); }

    const s = (await pool.query(`SELECT comp_count, comp_dominant_build, comp_build_ratio_p50,
      jsonb_array_length(comparable_builds) AS n,
      (SELECT count(*) FROM jsonb_array_elements(comparable_builds) e WHERE (e->>'build_ratio')::numeric > 1.1) AS over_cap
      FROM parcels WHERE id = $1`, [P(0)])).rows[0];

    expect(Number(s.comp_count)).toBe(3);                       // C1 + C2 + C4 (C3 lot-excluded, C5 zoning-excluded)
    expect(Number(s.n)).toBe(3);                                // evidence array length
    expect(s.comp_dominant_build).toBe('new_build');            // mode(new_build, addition, new_build)
    expect(Number(s.comp_build_ratio_p50)).toBeCloseTo(0.785, 3); // median(0.71, 0.86) — C4's 1.43 EXCLUDED
    expect(Number(s.over_cap)).toBe(1);                         // C4's 1.43 IS in the evidence array (just not the p50)
  }, 120_000);

  it('WF3: comp_fsi_p50 = NEW-BUILD comps only, two-sided plausibility band; array keeps all comps', async () => {
    // Subject + 4 candidate comps (all lot 400, zoning Z → all pass the post-filter).
    await insParcel(pool, P(0), { lot_size_sqm: 400, frontage_m: 12 }, 0);
    await insParcel(pool, P(1), { lot_size_sqm: 400, frontage_m: 12 }, 0.0001); // new_build, fsi 0.70 (COUNTS)
    await insParcel(pool, P(2), { lot_size_sqm: 400, frontage_m: 12 }, 0.0002); // addition,  fsi 0.10 (excluded: work_type)
    await insParcel(pool, P(3), { lot_size_sqm: 400, frontage_m: 12 }, 0.0003); // new_build, fsi 362  (excluded: > 8 garbage)
    await insParcel(pool, P(4), { lot_size_sqm: 400, frontage_m: 12 }, 0.0004); // new_build, fsi 0.01 (excluded: < 0.05 low-tail)
    await insPermit(pool, P(1), 'new_build', 280);      // 280/400 = 0.70
    await insPermit(pool, P(2), 'addition', 40);        // 40/400  = 0.10
    await insPermit(pool, P(3), 'new_build', 145000);   // 145000/400 = 362.5
    await insPermit(pool, P(4), 'new_build', 4);        // 4/400 = 0.01

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ep.enrichComparableBuilds(client, { full: true, scopeWhere: "parcel_id = 'COMP-TEST-9900300'" });
      await client.query('COMMIT');
    } finally { client.release(); }

    const s = (await pool.query(`SELECT comp_count, comp_fsi_p50, comp_dominant_build,
      jsonb_array_length(comparable_builds) AS n FROM parcels WHERE id = $1`, [P(0)])).rows[0];
    expect(Number(s.comp_count)).toBe(4);                       // all 4 in the evidence array
    expect(Number(s.n)).toBe(4);
    expect(Number(s.comp_fsi_p50)).toBeCloseTo(0.70, 2);        // ONLY the in-band new_build (C1); C2/C3/C4 excluded
    expect(s.comp_dominant_build).toBe('new_build');            // unchanged — modal over all comps
  }, 120_000);

  it('WF3: a subject with ONLY addition comps → comp_fsi_p50 NULL (no comparable build) but comp_count > 0', async () => {
    await insParcel(pool, P(0), { lot_size_sqm: 400, frontage_m: 12 }, 0);
    await insParcel(pool, P(1), { lot_size_sqm: 400, frontage_m: 12 }, 0.0001);
    await insParcel(pool, P(2), { lot_size_sqm: 400, frontage_m: 12 }, 0.0002);
    await insPermit(pool, P(1), 'addition', 40);
    await insPermit(pool, P(2), 'addition', 55);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ep.enrichComparableBuilds(client, { full: true, scopeWhere: "parcel_id = 'COMP-TEST-9900300'" });
      await client.query('COMMIT');
    } finally { client.release(); }

    const s = (await pool.query(`SELECT comp_count, comp_fsi_p50 FROM parcels WHERE id = $1`, [P(0)])).rows[0];
    expect(Number(s.comp_count)).toBe(2);      // additions still populate the array
    expect(s.comp_fsi_p50).toBeNull();         // no new-build comp → honest NULL (not a fake mixed median)
  }, 120_000);

  it('WF3: a subject that LOST its footprint has stale comp_* RESET to NULL (ineligible reset)', async () => {
    await insParcel(pool, P(0), { lot_size_sqm: 400, frontage_m: 12 }, 0);        // eligible subject
    await insParcel(pool, P(1), { lot_size_sqm: 400, frontage_m: 12 }, 0.0001);   // a matching comp
    await insPermit(pool, P(1), 'new_build', 280);
    const run = async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const s = await ep.enrichComparableBuilds(client, { full: true, scopeWhere: "parcel_id = 'COMP-TEST-9900300'" });
        await client.query('COMMIT');
        return s;
      } finally { client.release(); }
    };
    await run();
    expect((await pool.query(`SELECT comp_count FROM parcels WHERE id=$1`, [P(0)])).rows[0].comp_count).not.toBeNull();
    // Footprint lost (e.g. a heritage-mislink freeze nulled it) → re-run → stale comp_* must clear.
    await pool.query(`UPDATE parcels SET max_buildable_footprint_sqm = NULL WHERE id = $1`, [P(0)]);
    const stats = await run();
    expect(stats.reset_ineligible).toBeGreaterThanOrEqual(1);
    const after = (await pool.query(`SELECT comp_count, comp_fsi_p50, comparable_builds FROM parcels WHERE id=$1`, [P(0)])).rows[0];
    expect(after.comp_count).toBeNull();
    expect(after.comp_fsi_p50).toBeNull();
    expect(after.comparable_builds).toBeNull();
  }, 120_000);

  it('a subject with no comparable candidates gets comp_count = 0 (processed marker)', async () => {
    await insParcel(pool, P(0), { zoning_class: 'ZZ-LONELY-COMPTEST', lot_size_sqm: 400 }, 5); // unique zoning, no candidates
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ep.enrichComparableBuilds(client, { full: true, scopeWhere: "parcel_id = 'COMP-TEST-9900300'" });
      await client.query('COMMIT');
    } finally { client.release(); }
    const s = (await pool.query(`SELECT comp_count, comparable_builds FROM parcels WHERE id = $1`, [P(0)])).rows[0];
    expect(Number(s.comp_count)).toBe(0);
    expect(s.comparable_builds).toBeNull();
  }, 120_000);
});
