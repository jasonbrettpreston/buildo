// 🔗 SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-3A (optimal-config enrich pass)
//
// Live-DB integration for the enrich-parcels optimal-config pass: fixtures → enrichOptimalConfig →
// the §I opt_* columns + §J nearby_builds_summary JSONB. Covers the happy path (suite fits), holding
// gate, through-lot (no suite), and the citywide-fallback join. Skipped unless BUILDO_TEST_DB=1.
// Fixtures COMMITTED then cleaned (the pass streams + writes on its own connection — no BEGIN/ROLLBACK).

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ep = require('../../../scripts/enrich-parcels');

const NB = 9301;        // a neighbourhood WITH a build-norm row
const NB_NONORM = 9399; // a neighbourhood WITHOUT one → citywide fallback
const P = (n: number) => 9_900_100 + n;
const SCOPE = "p.parcel_id LIKE 'OPTCFG-TEST-%'";

async function insNbhd(pool: Pool, id: number, name: string) {
  await pool.query(`INSERT INTO neighbourhoods (id, neighbourhood_id, name) VALUES ($1,$1,$2) ON CONFLICT (id) DO NOTHING`, [id, name]);
}
async function insParcel(pool: Pool, id: number, nbhd: number | null, over: Record<string, unknown> = {}) {
  const cols: Record<string, unknown> = {
    id, parcel_id: `OPTCFG-TEST-${id}`, neighbourhood_id: nbhd, lot_size_sqm: 400, frontage_m: 12, depth_m: 35,
    max_buildable_footprint_sqm: 140, max_buildable_gfa_sqm: 300, bylaw_max_coverage_pct: 35,
    max_build_stories: 2, existing_greenspace_sqm: 150, existing_other_structures_sqm: 0,
    existing_other_structures_count: 0, lot_size_confidence: 'high', abuts_laneway: false, ...over,
  };
  const keys = Object.keys(cols);
  const ph = keys.map((_, i) => `$${i + 1}`).join(',');
  await pool.query(
    `INSERT INTO parcels (${keys.join(',')}) VALUES (${ph})
     ON CONFLICT (id) DO UPDATE SET ${keys.filter((k) => k !== 'id').map((k) => `${k}=EXCLUDED.${k}`).join(',')}`,
    keys.map((k) => cols[k]),
  );
}
async function insNorm(pool: Pool, nbhd: number | null) {
  // P2: seed the (nbhd,'all') / (NULL,'all') family — the test parcels have no zoning_class →
  // parcelFamilyFromZoning → 'all', so they read the 'all' cohort. Citywide guarded on (NULL,'all')
  // (the partial-unique singleton is now per-family); per-nbhd uses the composite ON CONFLICT.
  if (nbhd == null) {
    await pool.query(`INSERT INTO neighbourhood_build_norms (neighbourhood_id, structure_family, storeys_p50, storeys_p90, new_builds_5yr, additions_5yr, renos_5yr, coa_approved, coa_refused, coa_approval_rate, existing_build_ratio_p25, existing_build_ratio_p50, build_ratio_p50, sample_n)
       SELECT NULL, 'all', 2, 3, 3000, 6000, 9000, 900, 70, 0.93, 0.55, 0.62, 0.80, 30000
       WHERE NOT EXISTS (SELECT 1 FROM neighbourhood_build_norms WHERE neighbourhood_id IS NULL AND structure_family = 'all')`);
  } else {
    await pool.query(`INSERT INTO neighbourhood_build_norms (neighbourhood_id, structure_family, storeys_p50, storeys_p90, new_builds_5yr, additions_5yr, renos_5yr, coa_approved, coa_refused, coa_approval_rate, existing_build_ratio_p25, existing_build_ratio_p50, build_ratio_p50, sample_n)
       VALUES ($1, 'all', 2, 3, 25, 88, 81, 19, 1, 0.95, 0.55, 0.62, 0.80, 195) ON CONFLICT (neighbourhood_id, structure_family) DO NOTHING`, [nbhd]);
  }
}

describe.skipIf(!dbAvailable())('Spec 78 §Phase-3A enrich-parcels optimal-config — live DB (mig 200)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  afterEach(async () => {
    await pool.query(`DELETE FROM parcels WHERE parcel_id LIKE 'OPTCFG-TEST-%'`);
    await pool.query(`DELETE FROM neighbourhood_build_norms`); // incl. the seeded (NULL,'all') citywide — no cross-test leak
    await pool.query(`DELETE FROM neighbourhoods WHERE id IN ($1,$2)`, [NB, NB_NONORM]);
  });

  it('writes the §I opt_* columns + §J JSONB; suite fits; holding gated; through-lot no suite; citywide fallback', async () => {
    await insNbhd(pool, NB, 'TEST-OC-NBHD');
    await insNbhd(pool, NB_NONORM, 'TEST-OC-NONORM');
    await insNorm(pool, NB);
    await insNorm(pool, null); // ensure a citywide row exists for the CROSS JOIN

    await insParcel(pool, P(1), NB);                                   // normal → suite fits
    await insParcel(pool, P(2), NB, { zoning_holding: 'H' });          // holding → gated
    await insParcel(pool, P(3), NB, { is_through_lot: true });         // through-lot → no suite
    await insParcel(pool, P(4), NB_NONORM);                           // no per-nbhd norm → citywide

    const stats = await ep.enrichOptimalConfig(pool, { full: true, scopeWhere: SCOPE });
    expect(stats.updated).toBe(4);
    expect(stats.errors).toBe(0);

    const get = async (id: number) =>
      (await pool.query(`SELECT opt_aor_storeys, opt_aor_gfa_sqm, opt_aor_units, opt_coa_storeys, opt_coa_gfa_sqm,
        opt_suite_type, opt_suite_fits_full, opt_binding_constraint, opt_config_confidence,
        optimal_config->>'bylaw_version' AS bv,
        nearby_builds_summary->>'basis' AS nb_basis, nearby_builds_summary->>'headline' AS headline
        FROM parcels WHERE id = $1`, [id])).rows[0];

    const p1 = await get(P(1));
    expect(Number(p1.opt_aor_storeys)).toBe(2);                       // nbhd p50
    expect(Number(p1.opt_aor_gfa_sqm)).toBeGreaterThan(100);
    expect(Number(p1.opt_coa_storeys)).toBe(3);                       // nbhd p90 — CoA up
    expect(Number(p1.opt_coa_gfa_sqm)).toBeGreaterThan(Number(p1.opt_aor_gfa_sqm));
    expect(p1.opt_suite_type).toBe('garden');
    expect(p1.opt_suite_fits_full).toBe(true);
    expect(Number(p1.opt_aor_units)).toBe(2);
    expect(p1.bv).toBe('569-2013_consolidation_2025');
    expect(p1.nb_basis).toBe('neighbourhood');
    expect(p1.headline).toContain('TEST-OC-NBHD');

    const p2 = await get(P(2));
    expect(p2.opt_binding_constraint).toBe('holding');
    expect(p2.opt_suite_type).toBe('none');
    expect(Number(p2.opt_aor_units)).toBe(1);

    const p3 = await get(P(3));
    expect(p3.opt_suite_type).toBe('none');                           // through-lot → no rear-yard suite

    const p4 = await get(P(4));
    expect(p4.nb_basis).toBe('citywide_fallback');                    // no per-nbhd norm → citywide
    expect(Number(p4.opt_aor_storeys)).toBe(2);                       // citywide p50
  }, 90_000);

  it('incremental (full=false) only configures not-yet-configured parcels', async () => {
    await insNbhd(pool, NB, 'TEST-OC-NBHD');
    await insNorm(pool, NB);
    await insNorm(pool, null);
    await insParcel(pool, P(1), NB);
    await insParcel(pool, P(2), NB, { opt_config_confidence: 'high' }); // already configured

    const stats = await ep.enrichOptimalConfig(pool, { full: false, scopeWhere: SCOPE });
    expect(stats.updated).toBe(1);                                     // only P(1)
  }, 90_000);
});
