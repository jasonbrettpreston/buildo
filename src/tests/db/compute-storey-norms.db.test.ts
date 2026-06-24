// 🔗 SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §8 (permit-pocket storey norms — WF3-C1)
//
// Live-DB integration for compute-storey-norms: extraction + building-permit-type MEP dedup +
// dominant-parcel dedup + neighbourhood p50/p90 + low_sample flag + NULL citywide row + -1 exclusion.
// Skipped unless DATABASE_URL / BUILDO_TEST_DB=1. Fixtures are COMMITTED (the script streams on its
// own connection + writes in its own txn, so BEGIN/ROLLBACK isolation can't be used) then cleaned up.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { computeStoreyNorms } = require('../../../scripts/compute-storey-norms');

const N1 = 9001; const N2 = 9002; const NNEG = -1;

async function insNbhd(pool: Pool, id: number) {
  await pool.query(
    `INSERT INTO neighbourhoods (id, neighbourhood_id, name) VALUES ($1,$1,$2)
     ON CONFLICT (id) DO NOTHING`,
    [id, `TEST-NBHD-${id}`],
  );
}
let permitSeq = 0;
async function insPermit(pool: Pool, nbhd: number, parcel: number | null, permitType: string, desc: string) {
  permitSeq += 1;
  await pool.query(
    `INSERT INTO permits (permit_num, revision_num, permit_type, neighbourhood_id, zoning_dominant_parcel_id, description)
     VALUES ($1, 0, $2, $3, $4, $5)`,
    [`SN-TEST-${permitSeq}`, permitType, nbhd, parcel, desc],
  );
}

describe.skipIf(!dbAvailable())('Spec 65 §8 compute-storey-norms — live DB (mig 195)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  afterEach(async () => {
    await pool.query(`DELETE FROM permits WHERE permit_num LIKE 'SN-TEST-%'`);
    await pool.query(`DELETE FROM neighbourhood_storey_norms`);
    await pool.query(`DELETE FROM neighbourhoods WHERE id IN ($1,$2,$3)`, [N1, N2, NNEG]);
    permitSeq = 0;
  });

  it('p50/p90 per neighbourhood; MEP + dedup-pair counted once; low_sample; NULL citywide; -1 excluded', async () => {
    await insNbhd(pool, N1); await insNbhd(pool, N2); await insNbhd(pool, NNEG);

    // N1: 10× "2 storey" + 3× "3 storey" (distinct parcels) → 13 obs.
    for (let i = 0; i < 10; i++) await insPermit(pool, N1, 100 + i, 'New Houses', 'new 2 storey detached dwelling');
    for (let i = 0; i < 3; i++) await insPermit(pool, N1, 200 + i, 'New Houses', 'new 3 storey dwelling');
    // dedup pair: New Houses + Residential Building Permit on the SAME parcel → ONE obs (a 2).
    await insPermit(pool, N1, 300, 'New Houses', 'construct 2 storey home');
    await insPermit(pool, N1, 300, 'Residential Building Permit', 'two storey dwelling (re-file)');
    // MEP companion with a storey count → EXCLUDED by permit_type filter (must not push p90 to 5).
    await insPermit(pool, N1, 400, 'Plumbing(PS)', '5 storey plumbing');

    // N2: only 2 obs → low_sample.
    await insPermit(pool, N2, 500, 'New Houses', 'one storey bungalow');
    await insPermit(pool, N2, 501, 'New Houses', 'two storey');

    // -1 no-match sentinel → excluded entirely.
    await insPermit(pool, NNEG, 600, 'New Houses', '4 storey');

    await computeStoreyNorms(pool);

    const get = async (nbhd: number) =>
      (await pool.query(`SELECT * FROM neighbourhood_storey_norms WHERE neighbourhood_id = $1`, [nbhd])).rows[0];

    const n1 = await get(N1);
    expect(Number(n1.storeys_p50)).toBe(2);            // median of 11 twos + 3 threes
    expect(Number(n1.storeys_p90)).toBe(3);            // ~21% threes → p90=3
    expect(Number(n1.sample_count)).toBe(14);          // 13 + dedup-pair(1); MEP excluded (else 15), pair once (else 15)
    expect(n1.low_sample).toBe(false);                 // 14 ≥ 10
    expect(n1.data_provenance).toBe('market_realized_new_builds');

    const n2 = await get(N2);
    expect(Number(n2.sample_count)).toBe(2);
    expect(n2.low_sample).toBe(true);                  // < 10

    // -1 sentinel produced NO pocket.
    const neg = await get(NNEG);
    expect(neg).toBeUndefined();

    // exactly one citywide row (neighbourhood_id NULL).
    const cw = await pool.query(`SELECT * FROM neighbourhood_storey_norms WHERE neighbourhood_id IS NULL`);
    expect(cw.rowCount).toBe(1);
    expect(Number(cw.rows[0].sample_count)).toBe(16);  // N1 14 + N2 2 (−1 excluded)
  }, 60_000);

  it('empty corpus → no pockets, no citywide row', async () => {
    await insNbhd(pool, N1);
    await insPermit(pool, N1, 700, 'New Houses', 'interior alterations only'); // no storey text
    const s = await computeStoreyNorms(pool);
    expect(s.pockets).toBe(0);
    const all = await pool.query(`SELECT count(*)::int AS n FROM neighbourhood_storey_norms`);
    expect(all.rows[0].n).toBe(0);
  }, 60_000);
});
