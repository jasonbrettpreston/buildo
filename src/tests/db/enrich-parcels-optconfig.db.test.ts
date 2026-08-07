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
async function insNorm(pool: Pool, nbhd: number | null, realizedFsiP90: number | null = null, family = 'all') {
  // P2: seed a (nbhd,family) / (NULL,family) cohort. Most tests use 'all' (the test parcels have no
  // zoning_class → parcelFamilyFromZoning → 'all'); the R2 test uses 'detached' (R2 is detached-only,
  // plan fold #3). Citywide guarded on (NULL,family) — the partial-unique singleton is per-family;
  // per-nbhd uses the composite ON CONFLICT. R2: realized_fsi_p90 grounds the CoA tier.
  if (nbhd == null) {
    await pool.query(`INSERT INTO neighbourhood_build_norms (neighbourhood_id, structure_family, storeys_p50, storeys_p90, new_builds_5yr, additions_5yr, renos_5yr, coa_approved, coa_refused, coa_approval_rate, existing_build_ratio_p25, existing_build_ratio_p50, build_ratio_p50, realized_fsi_p90, sample_n)
       SELECT NULL, $2, 2, 3, 3000, 6000, 9000, 900, 70, 0.93, 0.55, 0.62, 0.80, $1, 30000
       WHERE NOT EXISTS (SELECT 1 FROM neighbourhood_build_norms WHERE neighbourhood_id IS NULL AND structure_family = $2)`, [realizedFsiP90, family]);
  } else {
    await pool.query(`INSERT INTO neighbourhood_build_norms (neighbourhood_id, structure_family, storeys_p50, storeys_p90, new_builds_5yr, additions_5yr, renos_5yr, coa_approved, coa_refused, coa_approval_rate, existing_build_ratio_p25, existing_build_ratio_p50, build_ratio_p50, realized_fsi_p90, sample_n)
       VALUES ($1, $3, 2, 3, 25, 88, 81, 19, 1, 0.95, 0.55, 0.62, 0.80, $2, 195) ON CONFLICT (neighbourhood_id, structure_family) DO NOTHING`, [nbhd, realizedFsiP90, family]);
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
    // Already configured — WF3 D-D: a configured parcel must carry a CONVERGENT optimal_config
    // (stored as_of_right.main_footprint_sqm == live footprint), else the staleness predicate
    // deliberately re-selects it (that is the D-D heal, not a regression).
    await insParcel(pool, P(2), NB, {
      opt_config_confidence: 'high',
      optimal_config: '{"as_of_right":{"main_footprint_sqm":140}}',
    });

    const stats = await ep.enrichOptimalConfig(pool, { full: false, scopeWhere: SCOPE });
    expect(stats.updated).toBe(1);                                     // only P(1)
  }, 90_000);

  it('WF3: a parcel that LOST its footprint has stale opt_* RESET to NULL (else cost prices the stale opt_aor)', async () => {
    await insNbhd(pool, NB, 'TEST-OC-NBHD');
    await insNorm(pool, NB);
    await insNorm(pool, null);
    // Configure a parcel (footprint present) → opt_* written.
    await insParcel(pool, P(30), NB);
    await ep.enrichOptimalConfig(pool, { full: true, scopeWhere: SCOPE });
    const configured = (await pool.query(`SELECT opt_aor_gfa_sqm, opt_config_confidence FROM parcels WHERE id = $1`, [P(30)])).rows[0];
    expect(configured.opt_aor_gfa_sqm).not.toBeNull();

    // Now the footprint becomes NULL (e.g. a heritage-mislink freeze nulled the envelope). Re-run.
    await pool.query(`UPDATE parcels SET max_buildable_footprint_sqm = NULL WHERE id = $1`, [P(30)]);
    const stats = await ep.enrichOptimalConfig(pool, { full: true, scopeWhere: SCOPE });
    expect(stats.reset_ineligible).toBeGreaterThanOrEqual(1);
    const after = (await pool.query(
      `SELECT opt_aor_gfa_sqm, opt_coa_gfa_sqm, opt_aor_storeys, opt_config_confidence, optimal_config FROM parcels WHERE id = $1`, [P(30)])).rows[0];
    expect(after.opt_aor_gfa_sqm).toBeNull();      // stale opt_aor cleared → cost can't price it
    expect(after.opt_coa_gfa_sqm).toBeNull();
    expect(after.opt_config_confidence).toBeNull();
    expect(after.optimal_config).toBeNull();
  }, 90_000);

  it('WF3: as-of-right storeys capped at max_build_stories (opt_aor ≤ envelope); opt_coa (p90) not capped', async () => {
    await insNbhd(pool, NB, 'TEST-OC-NBHD');
    await insNorm(pool, NB);       // storeys_p50=2, storeys_p90=3
    await insNorm(pool, null);
    // This parcel's envelope caps at 1 storey (max_build_stories=1, gfa=footprint×1=140); the nbhd p50=2
    // would overshoot the envelope — the cap must bring opt_aor down to 1 storey.
    await insParcel(pool, P(40), NB, { max_build_stories: 1, max_buildable_footprint_sqm: 140, max_buildable_gfa_sqm: 140, bylaw_max_fsi: null });
    const stats = await ep.enrichOptimalConfig(pool, { full: true, scopeWhere: SCOPE });
    expect(stats.envelope_capped).toBeGreaterThanOrEqual(1);
    const r = (await pool.query(`SELECT opt_aor_storeys, opt_aor_gfa_sqm, opt_coa_storeys, max_buildable_gfa_sqm FROM parcels WHERE id = $1`, [P(40)])).rows[0];
    expect(Number(r.opt_aor_storeys)).toBe(1);                                              // capped from p50=2 → 1
    expect(Number(r.opt_aor_gfa_sqm)).toBeLessThanOrEqual(Number(r.max_buildable_gfa_sqm) + 0.5); // the invariant holds
    expect(Number(r.opt_coa_storeys)).toBe(3);                                              // p90 uncapped — CoA upside intact
  }, 90_000);

  it('R2 (detached-only): opt_coa is grounded in realized detached FSI p90 (norm → engine → opt_coa wiring)', async () => {
    await insNbhd(pool, NB, 'TEST-OC-NBHD');
    await insNorm(pool, null);                     // (NULL,'all') backstop — the cwa CROSS JOIN needs it
    await insNorm(pool, NB, 1.5, 'detached');       // pocket DETACHED cohort, realized_fsi_p90 = 1.5 (dense)
    // detached (RD) parcel with a low by-law FSI → the realized detached 1.5 lifts the CoA tier.
    await insParcel(pool, P(20), NB, { zoning_class: 'RD', bylaw_max_fsi: 0.5 });
    // control: a townhouse (RT) parcel — R2 is detached-only, so it keeps by-law (no realized lift).
    await insNorm(pool, NB, 1.5, 'townhouse');
    await insParcel(pool, P(21), NB, { zoning_class: 'RT', bylaw_max_fsi: 0.5 });

    await ep.enrichOptimalConfig(pool, { full: true, scopeWhere: SCOPE });

    const det = (await pool.query(`SELECT opt_aor_gfa_sqm, opt_coa_gfa_sqm FROM parcels WHERE id = $1`, [P(20)])).rows[0];
    expect(Number(det.opt_aor_gfa_sqm)).toBeCloseTo(200, 0);   // by-law 0.5 → MIN(140×2, 200) = 200
    expect(Number(det.opt_coa_gfa_sqm)).toBeCloseTo(420, 0);   // realized 1.5 → MIN(140×3, 600) = 420
    expect(Number(det.opt_coa_gfa_sqm)).toBeGreaterThan(Number(det.opt_aor_gfa_sqm));
    // townhouse control: R2 detached-only → CoA stays by-law-bound (MIN(140×3, 0.5×400=200) = 200 = as-of-right).
    const twn = (await pool.query(`SELECT opt_aor_gfa_sqm, opt_coa_gfa_sqm FROM parcels WHERE id = $1`, [P(21)])).rows[0];
    expect(Number(twn.opt_coa_gfa_sqm)).toBeCloseTo(200, 0);   // NOT lifted to 420 — by-law FSI kept
  }, 90_000);
});
