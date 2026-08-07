// 🔗 SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-3A (D-D staleness amendment :206-207)
//
// WF3 Phase 1 D-D — optconfig staleness + the buildTier fallback twin (R3-M1/R3-M4/R3-M5).
// 1) Incremental predicate: a parcel whose stored optimal_config→'as_of_right'→'main_footprint_sqm'
//    diverged from max_buildable_footprint_sqm is RE-SELECTED and recomputed (value-change → recompute).
// 2) Steady state: a second incremental run selects 0 rows (updated 0 AND reset_ineligible 0).
// 3) Reset extension: footprint non-NULL but (lot_size_sqm > 0) IS NOT TRUE (NULL/0 lot — the limbo
//    class the stream can never select) → opt_* reset, not kept priced forever.
// 4) buildTier ravine-fallback gate (unit altitude — the only altitude that can prove the gate): a
//    ravine parcel with NULL footprint must NEVER get the coverage×lot fallback (the D-C envelope was
//    deliberately withheld); non-ravine NULL-footprint keeps the fallback (control).
// DB parts skipped unless BUILDO_TEST_DB=1; the buildTier gate is pure JS and always runs.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ep = require('../../../scripts/enrich-parcels');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const optcfg = require('../../../scripts/lib/optimal-config');

const NB = 9311; // dedicated neighbourhood id (no collision with enrich-parcels-optconfig fixtures)
const P = (n: number) => 9_900_300 + n;
const SCOPE = "p.parcel_id LIKE 'OPTSTL-%'";

async function insNbhd(pool: Pool, id: number, name: string) {
  await pool.query(`INSERT INTO neighbourhoods (id, neighbourhood_id, name) VALUES ($1,$1,$2) ON CONFLICT (id) DO NOTHING`, [id, name]);
}
async function insParcel(pool: Pool, id: number, nbhd: number | null, over: Record<string, unknown> = {}) {
  const cols: Record<string, unknown> = {
    id, parcel_id: `OPTSTL-${id}`, neighbourhood_id: nbhd, lot_size_sqm: 400, frontage_m: 12, depth_m: 35,
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
async function insNorm(pool: Pool, nbhd: number | null, family = 'all') {
  if (nbhd == null) {
    await pool.query(`INSERT INTO neighbourhood_build_norms (neighbourhood_id, structure_family, storeys_p50, storeys_p90, new_builds_5yr, additions_5yr, renos_5yr, coa_approved, coa_refused, coa_approval_rate, existing_build_ratio_p25, existing_build_ratio_p50, build_ratio_p50, sample_n)
       SELECT NULL, $1, 2, 3, 3000, 6000, 9000, 900, 70, 0.93, 0.55, 0.62, 0.80, 30000
       WHERE NOT EXISTS (SELECT 1 FROM neighbourhood_build_norms WHERE neighbourhood_id IS NULL AND structure_family = $1)`, [family]);
  } else {
    await pool.query(`INSERT INTO neighbourhood_build_norms (neighbourhood_id, structure_family, storeys_p50, storeys_p90, new_builds_5yr, additions_5yr, renos_5yr, coa_approved, coa_refused, coa_approval_rate, existing_build_ratio_p25, existing_build_ratio_p50, build_ratio_p50, sample_n)
       VALUES ($1, $2, 2, 3, 25, 88, 81, 19, 1, 0.95, 0.55, 0.62, 0.80, 195) ON CONFLICT (neighbourhood_id, structure_family) DO NOTHING`, [nbhd, family]);
  }
}

describe.skipIf(!dbAvailable())('WF3 D-D optconfig staleness — live DB', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  afterEach(async () => {
    await pool.query(`DELETE FROM parcels WHERE parcel_id LIKE 'OPTSTL-%'`);
    await pool.query(`DELETE FROM neighbourhood_build_norms`);
    await pool.query(`DELETE FROM neighbourhoods WHERE id = $1`, [NB]);
  });

  it('value-change → recompute: a stored-vs-current footprint mismatch re-selects the parcel incrementally', async () => {
    await insNbhd(pool, NB, 'TEST-STALE-NBHD');
    await insNorm(pool, NB);
    await insNorm(pool, null);
    await insParcel(pool, P(1), NB);
    await ep.enrichOptimalConfig(pool, { full: true, scopeWhere: SCOPE });
    const before = (await pool.query(
      `SELECT (optimal_config->'as_of_right'->>'main_footprint_sqm')::numeric AS f FROM parcels WHERE id = $1`, [P(1)])).rows[0];
    expect(Number(before.f)).toBe(140);

    // The envelope moves (e.g. the D-A/D-C geometry fix re-ran) — stored optconfig is now stale.
    await pool.query(`UPDATE parcels SET max_buildable_footprint_sqm = 200 WHERE id = $1`, [P(1)]);
    const stats = await ep.enrichOptimalConfig(pool, { full: false, scopeWhere: SCOPE });
    expect(stats.updated).toBeGreaterThanOrEqual(1); // RED pre-fix: incremental gated on confidence IS NULL → 0
    const after = (await pool.query(
      `SELECT (optimal_config->'as_of_right'->>'main_footprint_sqm')::numeric AS f FROM parcels WHERE id = $1`, [P(1)])).rows[0];
    expect(Number(after.f)).toBe(200);
  }, 90_000);

  it('steady state: the second incremental run selects 0 rows (updated 0 AND reset_ineligible 0)', async () => {
    await insNbhd(pool, NB, 'TEST-STALE-NBHD');
    await insNorm(pool, NB);
    await insNorm(pool, null);
    await insParcel(pool, P(2), NB);
    await ep.enrichOptimalConfig(pool, { full: true, scopeWhere: SCOPE });
    const stats = await ep.enrichOptimalConfig(pool, { full: false, scopeWhere: SCOPE });
    expect(stats.updated).toBe(0);
    expect(stats.reset_ineligible).toBe(0);
  }, 90_000);

  it('reset extension: footprint non-NULL but lot NULL (limbo — outside the stream) has opt_* reset', async () => {
    await insNbhd(pool, NB, 'TEST-STALE-NBHD');
    await insNorm(pool, null);
    // Simulate the cloud limbo class: configured once, then lot_size_sqm became NULL. The stream
    // (WHERE lot_size_sqm > 0) can never select it; pre-fix the reset (footprint IS NULL only) never
    // fires either — the priced opt_aor survives forever.
    await insParcel(pool, P(3), NB, {
      lot_size_sqm: null, opt_config_confidence: 'medium', opt_aor_gfa_sqm: 2966.28,
      opt_aor_storeys: 3, optimal_config: '{"as_of_right":{"main_footprint_sqm":988.76}}',
    });
    const stats = await ep.enrichOptimalConfig(pool, { full: false, scopeWhere: SCOPE });
    expect(stats.reset_ineligible).toBeGreaterThanOrEqual(1); // RED pre-fix: 0
    const r = (await pool.query(
      `SELECT opt_aor_gfa_sqm, opt_aor_storeys, opt_config_confidence, optimal_config FROM parcels WHERE id = $1`, [P(3)])).rows[0];
    expect(r.opt_aor_gfa_sqm).toBeNull();
    expect(r.opt_aor_storeys).toBeNull();
    expect(r.opt_config_confidence).toBeNull();
    expect(r.optimal_config).toBeNull();
  }, 90_000);

  it('reset extension: lot_size_sqm = 0 (not just NULL) is equally ineligible — three-valued logic spelled out', async () => {
    await insNbhd(pool, NB, 'TEST-STALE-NBHD');
    await insNorm(pool, null);
    await insParcel(pool, P(4), NB, {
      lot_size_sqm: 0, opt_config_confidence: 'low', opt_aor_gfa_sqm: 100,
      optimal_config: '{"as_of_right":{"main_footprint_sqm":50}}',
    });
    const stats = await ep.enrichOptimalConfig(pool, { full: false, scopeWhere: SCOPE });
    expect(stats.reset_ineligible).toBeGreaterThanOrEqual(1);
    const r = (await pool.query(`SELECT opt_aor_gfa_sqm, opt_config_confidence FROM parcels WHERE id = $1`, [P(4)])).rows[0];
    expect(r.opt_aor_gfa_sqm).toBeNull();
    expect(r.opt_config_confidence).toBeNull();
  }, 90_000);
});

describe('WF3 D-D buildTier ravine-fallback gate (pure engine — unit altitude)', () => {
  it('ravine + NULL footprint → NULL tier, never a coverage-derived footprint (R3-M1)', () => {
    const t = optcfg.buildTier(
      { isRavine: true, maxBuildableFootprintSqm: null, coverageCapFrac: 0.33, lotSizeSqm: 500 }, 2, true);
    expect(t.main_footprint_sqm).toBeNull(); // RED pre-fix: 0.33 × 500 = 165 (the ravine bug relocated)
    expect(t.main_gfa_sqm).toBeNull();
    expect(t.total_gfa_sqm).toBeNull();
  });

  it('full engine: ravine + NULL footprint → NULL opt_aor/opt_coa GFAs, binding=ravine, no NaN uplift', () => {
    const cfg = optcfg.computeOptimalConfig({
      isRavine: true, maxBuildableFootprintSqm: null, coverageCapFrac: 0.33, lotSizeSqm: 500,
      lotSizeConfidence: 'high', frontageM: 12, depthM: 40,
    });
    expect(cfg.as_of_right.main_gfa_sqm).toBeNull();
    expect(cfg.coa_upside.main_gfa_sqm).toBeNull();
    expect(cfg.opt_binding_constraint).toBe('ravine');
    expect(cfg.opt_coa_gfa_uplift_sqm).toBeNull(); // not NaN
  });

  it('control: NON-ravine NULL footprint keeps the coverage×lot fallback (behavior unchanged)', () => {
    const t = optcfg.buildTier(
      { isRavine: false, maxBuildableFootprintSqm: null, coverageCapFrac: 0.33, lotSizeSqm: 500 }, 2, true);
    expect(t.main_footprint_sqm).toBeCloseTo(165, 2);
  });

  it('control: ravine WITH a footprint is untouched (the gate keys on NULL footprint, not ravine alone)', () => {
    const t = optcfg.buildTier(
      { isRavine: true, maxBuildableFootprintSqm: 120, coverageCapFrac: 0.33, lotSizeSqm: 500 }, 2, true);
    expect(t.main_footprint_sqm).toBeCloseTo(120, 2);
    expect(t.main_gfa_sqm).toBeCloseTo(240, 2);
  });
});
