// 🔗 SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-1 (neighbourhood build-norms)
//
// Live-DB integration for compute-build-norms: per-neighbourhood realized FSI/build-ratio/old-stock
// ratio + principal-row dedup (DISTINCT ON parcel+kind, max residential) + over-capture clamp + the
// NULL-residential guard (existing_ratio NULL, not 0) + reno-% + CoA approval + low_sample + the
// UNCONDITIONAL citywide row + idempotency. Skipped unless BUILDO_TEST_DB=1. Fixtures COMMITTED then
// cleaned (the script writes in its own txn, so BEGIN/ROLLBACK isolation can't be used).

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { computeBuildNorms } = require('../../../scripts/compute-build-norms');

const N1 = 9101; const N2 = 9102;
const P = (n: number) => 9_900_000 + n; // test parcel ids, well above max(parcels.id)

async function insNbhd(pool: Pool, id: number) {
  await pool.query(
    `INSERT INTO neighbourhoods (id, neighbourhood_id, name) VALUES ($1,$1,$2) ON CONFLICT (id) DO NOTHING`,
    [id, `TEST-BN-${id}`],
  );
}
async function insParcel(pool: Pool, id: number, nbhd: number, lot: number | null, gfa: number | null) {
  await pool.query(
    `INSERT INTO parcels (id, parcel_id, neighbourhood_id, lot_size_sqm, max_buildable_gfa_sqm)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET neighbourhood_id=EXCLUDED.neighbourhood_id,
       lot_size_sqm=EXCLUDED.lot_size_sqm, max_buildable_gfa_sqm=EXCLUDED.max_buildable_gfa_sqm`,
    [id, `BN-TEST-${id}`, nbhd, lot, gfa],
  );
}
let pseq = 0;
async function insPermit(
  pool: Pool, parcel: number, projectType: string, opts: { res?: number | null; ia?: number | null; desc?: string; structure?: string } = {},
) {
  pseq += 1;
  await pool.query(
    `INSERT INTO permits (permit_num, revision_num, project_type, structure_type, description,
       zoning_dominant_parcel_id, residential_sqm, interior_alterations_sqm, issued_date)
     VALUES ($1, '00', $2, $3, $4, $5, $6, $7, now()::date - interval '6 months')`,
    [`BN-TEST-${pseq}`, projectType, opts.structure ?? null, opts.desc ?? null, parcel, opts.res ?? null, opts.ia ?? null],
  );
}
async function insCoa(pool: Pool, parcel: number, decision: string) {
  pseq += 1;
  await pool.query(
    `INSERT INTO coa_applications (application_number, address, zoning_dominant_parcel_id, decision, decision_date)
     VALUES ($1, $2, $3, $4, now()::date - interval '3 months')`,
    [`BN-COA-${pseq}`, `${parcel} Test St`, parcel, decision],
  );
}

describe.skipIf(!dbAvailable())('Spec 78 §Phase-1 compute-build-norms — live DB (mig 198/199)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  afterEach(async () => {
    await pool.query(`DELETE FROM permits WHERE permit_num LIKE 'BN-TEST-%'`);
    await pool.query(`DELETE FROM coa_applications WHERE application_number LIKE 'BN-COA-%'`);
    await pool.query(`DELETE FROM parcels WHERE parcel_id LIKE 'BN-TEST-%'`);
    await pool.query(`DELETE FROM neighbourhoods WHERE id IN ($1,$2)`, [N1, N2]);
    pseq = 0;
  });

  it('realized FSI/build-ratio/old-stock + dedup + clamp + NULL-residual guard + reno% + CoA + low_sample', async () => {
    await insNbhd(pool, N1); await insNbhd(pool, N2);
    // N1 new-builds (distinct parcels): P1 lot400/gfa500, P2 lot500/gfa600, P3 lot400/gfa500
    await insParcel(pool, P(1), N1, 400, 500);
    await insParcel(pool, P(2), N1, 500, 600);
    await insParcel(pool, P(3), N1, 400, 500);
    await insPermit(pool, P(1), 'new_build', { res: 400 });
    await insPermit(pool, P(1), 'new_build', { res: 300 }); // dedup re-file: principal = max(400) wins
    await insPermit(pool, P(2), 'new_build', { res: 600 }); // build_ratio 1.0
    await insPermit(pool, P(3), 'new_build', { res: 700 }); // build_ratio 1.4 > 1.1 → excluded from br percentile
    // N1 additions (old-stock): P4 res190/gfa500 → 0.62, P5 res100/gfa500 → 0.80, P6 res NULL → MUST be excluded (not 0)
    await insParcel(pool, P(4), N1, 400, 500);
    await insParcel(pool, P(5), N1, 400, 500);
    await insParcel(pool, P(6), N1, 400, 500);
    await insPermit(pool, P(4), 'addition', { res: 190 });
    await insPermit(pool, P(5), 'addition', { res: 100 });
    await insPermit(pool, P(6), 'addition', { res: null });
    // N1 kitchen reno: ia50/gfa500 → reno_frac 0.10
    await insParcel(pool, P(7), N1, 400, 500);
    await insPermit(pool, P(7), 'renovation', { ia: 50, desc: 'new kitchen island' });
    // N1 CoA: 1 approved + 1 refused → approval_rate 0.5
    await insCoa(pool, P(1), 'Approved');
    await insCoa(pool, P(2), 'Refused - application denied');
    // N2: only 2 obs → low_sample
    await insParcel(pool, P(8), N2, 400, 500);
    await insParcel(pool, P(9), N2, 400, 500);
    await insPermit(pool, P(8), 'new_build', { res: 400 });
    await insPermit(pool, P(9), 'new_build', { res: 410 });

    await computeBuildNorms(pool);

    const get = async (nbhd: number) =>
      (await pool.query(`SELECT * FROM neighbourhood_build_norms WHERE neighbourhood_id = $1`, [nbhd])).rows[0];

    const n1 = await get(N1);
    expect(n1.new_builds_5yr).toBe(3);                 // dedup: P1's two new_builds → ONE obs
    expect(n1.additions_5yr).toBe(3);
    expect(n1.renos_5yr).toBe(1);                      // kitchen counted under reno bucket
    expect(Number(n1.realized_fsi_p50)).toBeCloseTo(1.2, 5);   // median([1.0,1.2,1.75])
    expect(Number(n1.build_ratio_p50)).toBeCloseTo(0.9, 5);    // median([0.8,1.0]); 1.4 clamp-excluded
    // old-stock: P6 (NULL res) excluded → percentiles over [0.62, 0.80]; if the NULL became 0, ex_p25 would be ~0.31
    expect(Number(n1.existing_build_ratio_p50)).toBeCloseTo(0.71, 5);
    expect(Number(n1.existing_build_ratio_p25)).toBeGreaterThan(0.6);
    expect(Number(n1.reno_kitchen_pct)).toBeCloseTo(0.1, 5);
    expect(Number(n1.coa_approved)).toBe(1);
    expect(Number(n1.coa_refused)).toBe(1);
    expect(Number(n1.coa_approval_rate)).toBeCloseTo(0.5, 3);
    expect(n1.low_sample).toBe(false);                 // sample_n 7 ≥ 5
    expect(n1.data_provenance).toBe('market_realized_5yr');

    const n2 = await get(N2);
    expect(n2.new_builds_5yr).toBe(2);
    expect(n2.low_sample).toBe(true);                  // 2 < 5

    // exactly ONE citywide row (neighbourhood_id IS NULL) — written unconditionally
    const cw = await pool.query(`SELECT count(*)::int n FROM neighbourhood_build_norms WHERE neighbourhood_id IS NULL`);
    expect(cw.rows[0].n).toBe(1);
  }, 90_000);

  it('idempotent: a second run leaves exactly one row per neighbourhood (truncate-replace)', async () => {
    await insNbhd(pool, N1);
    await insParcel(pool, P(1), N1, 400, 500);
    await insPermit(pool, P(1), 'new_build', { res: 400 });

    await computeBuildNorms(pool);
    await computeBuildNorms(pool);

    const n1 = await pool.query(`SELECT count(*)::int n FROM neighbourhood_build_norms WHERE neighbourhood_id = $1`, [N1]);
    expect(n1.rows[0].n).toBe(1);
    const cw = await pool.query(`SELECT count(*)::int n FROM neighbourhood_build_norms WHERE neighbourhood_id IS NULL`);
    expect(cw.rows[0].n).toBe(1);
  }, 90_000);
});
