// 🔗 SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2 (parcel cost model — Mutator)
//
// Live-DB integration for compute-parcel-cost-estimates: residential-parcel scope (zoning R%),
// the cost menu + headline/FSI scalars written to parcels, IS-DISTINCT-FROM idempotency (re-run →
// 0 updated), absent-line vs fits:false, engine-error sentinel isolation, and the row-derived verdict.
// Reads the rates seeded by migration 205. Skipped unless DATABASE_URL / BUILDO_TEST_DB=1.
//
// RE-DERIVED — batch-2 row 2.4 (2026-09-21). The pre-conversion `computeParcelCostEstimates(pool,
// {config})` testable-core export is retired by the frozen shell (Spec 122 §5.1 — the file shape
// permits no executable statement beyond `pipeline.step()`). Re-pointed at
// `pipeline.step(descriptor, compute).run({pool, chainId})`, the same in-process seam
// src/tests/step-library.logic.test.ts uses. The hardcoded seeded-rate values (4844, 377, 3498,
// 1615, …) are KEPT — they are the value-equivalence anchor this file exists for, unchanged by
// the conversion (Spec 123 §1.1 behaviour-neutral).

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import type { Pool } from 'pg';
import path from 'path';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const REPO_ROOT = path.resolve(__dirname, '../../../');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pipelineLib = require(path.join(REPO_ROOT, 'scripts/lib/step/index.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const descriptor = require(path.join(REPO_ROOT, 'scripts/compute-parcel-cost-estimates.descriptor.json'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require(path.join(REPO_ROOT, 'scripts/lib/compute/compute-parcel-cost-estimates.js'));

const P = (n: number) => 9_960_000 + n;

function captureEmissions() {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  return {
    restore: () => spy.mockRestore(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    summary: (): any => JSON.parse(lines.filter((l) => l.startsWith('PIPELINE_SUMMARY:')).pop()!.slice('PIPELINE_SUMMARY:'.length)),
  };
}

async function runStep(pool: Pool) {
  const cap = captureEmissions();
  try {
    await pipelineLib.step(descriptor, compute).run({ pool, chainId: 'sources' });
    return cap.summary();
  } finally {
    cap.restore();
  }
}

async function insParcel(pool: Pool, id: number, over: Record<string, unknown> = {}) {
  const cols: Record<string, unknown> = {
    id,
    parcel_id: `PCM-TEST-${id}`,
    zoning_class: 'RD',
    lot_size_sqm: 400,
    max_buildable_gfa_sqm: 300,
    opt_aor_gfa_sqm: 300, // WF3: new_build prices this; == max_buildable_gfa → cost_fb_total assertions stay value-neutral
    max_buildable_footprint_sqm: 120,
    opt_coa_gfa_sqm: 360,
    max_garden_suite_gfa_sqm: 60,
    max_laneway_suite_gfa_sqm: 55,
    cur_est_kitchen_gfa_sqm: 14,
    cur_est_bath_gfa_sqm: 8,
    max_garage_gfa_sqm: 37,
    cur_floor_gfa_sqm: 110,
    cur_pot_2story_gfa_sqm: 220,
    neighbourhood_cost_premium: 1.0,
    rear_suite_permission: 'as_of_right',
    garage_permission: 'as_of_right',
    max_build_confidence: 'high',
    ...over,
  };
  const keys = Object.keys(cols);
  const ph = keys.map((_, i) => `$${i + 1}`).join(',');
  await pool.query(
    `INSERT INTO parcels (${keys.join(',')}) VALUES (${ph})
     ON CONFLICT (id) DO UPDATE SET ${keys.filter((k) => k !== 'id').map((k) => `${k}=EXCLUDED.${k}`).join(',')}`,
    keys.map((k) => cols[k]),
  );
}

describe.skipIf(!dbAvailable())('Spec 88 compute-parcel-cost-estimates — live DB (mig 205-207, converted)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });

  afterEach(async () => {
    await pool.query(`DELETE FROM parcels WHERE parcel_id LIKE 'PCM-TEST-%'`);
  });

  it('writes parcel_cost_menu + headline/FSI scalars; verdict not FAIL; engine errors 0', async () => {
    await insParcel(pool, P(1)); // full detached parcel — all 13 lines computable

    const s = await runStep(pool);

    expect(s.records_meta.engine_error_count).toBe(0);
    expect(s.records_meta.audit_table.verdict).not.toBe('FAIL');
    expect(s.records_total).toBeGreaterThanOrEqual(1);

    const row = (await pool.query(
      `SELECT parcel_cost_menu, cost_fb_total, cost_coa_total, cost_solar_total,
              cost_kitchen_per_sqm, cost_basement_underpin_per_sqm,
              max_build_fsi, coa_fsi, realized_fsi_p90
         FROM parcels WHERE id = $1`,
      [P(1)],
    )).rows[0];

    const menu = row.parcel_cost_menu;
    expect(menu._schema_version).toBe(1);
    // all 13 lines present
    for (const id of [
      'max_build', 'coa_build', 'solar_max', 'solar_coa', 'garden_suite', 'laneway_suite',
      'kitchen', 'bath', 'garage', 'basement_underpin', 'basement', 'gut', 'addition',
    ]) {
      expect(menu[id], `line ${id}`).toBeTruthy();
    }
    // top-down formula (premium 1.0, escalation 1.0): max build = 4844 × 300
    expect(Number(row.cost_fb_total)).toBeCloseTo(4844 * 300, 0);
    // solar_coa = solar_max (footprint capped) and uses the 0.75 adj factor
    expect(menu.solar_coa.total).toBe(menu.solar_max.total);
    expect(Number(row.cost_solar_total)).toBeCloseTo(377 * 0.75 * 120, 0);
    // per_sqm headline scalars
    expect(Number(row.cost_kitchen_per_sqm)).toBeCloseTo(3498, 0);
    expect(Number(row.cost_basement_underpin_per_sqm)).toBeCloseTo(1615, 0);
    // FSI derived; realized_fsi_p90 read-through (NULL in P1)
    expect(Number(row.max_build_fsi)).toBeCloseTo(300 / 400, 2);
    expect(Number(row.coa_fsi)).toBeCloseTo(360 / 400, 2);
    expect(row.realized_fsi_p90).toBeNull();
    // trades/products deferred to P3
    expect(menu.max_build.trades).toBeNull();
    expect(menu.max_build.products).toBeNull();
    // CoA-line-scoped norm_basis — the fixture is RD (detached), so R2 grounds it → r2_refined (P2).
    expect(menu.coa_build.norm_basis).toBe('r2_refined');
    expect(menu.kitchen.norm_basis).toBe('n/a');
  }, 60_000);

  it('WF3: new_build (cost_fb_total) prices opt_aor_gfa; NULL opt_aor → envelope fallback + counted', async () => {
    // (a) opt_aor 250 ≠ max_buildable 300 → the max_build line prices 250, not the envelope.
    await insParcel(pool, P(5), { opt_aor_gfa_sqm: 250, max_buildable_gfa_sqm: 300 });
    // (b) opt_aor NULL → COALESCE falls back to the max-build envelope (300) + increments the counter.
    await insParcel(pool, P(6), { opt_aor_gfa_sqm: null, max_buildable_gfa_sqm: 300 });

    const s = await runStep(pool);
    expect(s.records_meta.engine_error_count).toBe(0);
    expect(s.records_meta.new_build_fallback_count).toBeGreaterThanOrEqual(1); // P(6) used the fallback

    const rowA = (await pool.query(
      `SELECT parcel_cost_menu, cost_fb_total, max_build_fsi FROM parcels WHERE id = $1`, [P(5)],
    )).rows[0];
    expect(rowA.parcel_cost_menu.max_build.area).toBe(250);   // priced opt_aor, not 300
    expect(Number(rowA.cost_fb_total)).toBeCloseTo(4844 * 250, 0);
    expect(Number(rowA.max_build_fsi)).toBeCloseTo(300 / 400, 2); // envelope FSI still from max_buildable_gfa

    const rowB = (await pool.query(
      `SELECT parcel_cost_menu, cost_fb_total FROM parcels WHERE id = $1`, [P(6)],
    )).rows[0];
    expect(rowB.parcel_cost_menu.max_build.area).toBe(300);   // fell back to the envelope
    expect(Number(rowB.cost_fb_total)).toBeCloseTo(4844 * 300, 0);
  }, 60_000);

  it('IS-DISTINCT-FROM idempotency: a clean re-run updates 0 parcels', async () => {
    await insParcel(pool, P(2));
    const first = await runStep(pool);
    expect(first.records_updated).toBeGreaterThanOrEqual(1);
    const second = await runStep(pool);
    // the only fixture parcel is unchanged → guard short-circuits its UPDATE
    const reRow = (await pool.query(`SELECT parcel_cost_menu FROM parcels WHERE id = $1`, [P(2)])).rows[0];
    expect(reRow.parcel_cost_menu).toBeTruthy();
    // second run must not re-write our unchanged fixture (other test parcels are cleaned per-test)
    expect(second.records_updated).toBe(0);
  }, 60_000);

  it('absent-line (NULL geom) vs fits:false (permission) are distinct', async () => {
    // garage geom NULL → line ABSENT; suites permission prohibited → present + fits:false
    await insParcel(pool, P(3), {
      max_garage_gfa_sqm: null,
      garage_permission: null,
      rear_suite_permission: 'not_permitted',
    });

    const s = await runStep(pool);
    expect(s.records_meta.engine_error_count).toBe(0);

    const menu = (await pool.query(`SELECT parcel_cost_menu FROM parcels WHERE id = $1`, [P(3)])).rows[0]
      .parcel_cost_menu;
    expect('garage' in menu).toBe(false); // NULL geom → absent
    expect(menu.garden_suite.fits).toBe(false); // present + priced + not-permitted
    expect(menu.garden_suite.total).toBeGreaterThan(0);
    expect(s.records_meta.fit_gated_suite_count).toBeGreaterThanOrEqual(2); // garden + laneway
  }, 60_000);

  it('a parcel with NO computable line counts as null_geom_basis (menu has no lines)', async () => {
    await insParcel(pool, P(4), {
      max_buildable_gfa_sqm: null,
      opt_aor_gfa_sqm: null, // WF3: null both so the COALESCE'd new_build area is also NULL (no computable line)
      max_buildable_footprint_sqm: null,
      opt_coa_gfa_sqm: null,
      max_garden_suite_gfa_sqm: null,
      max_laneway_suite_gfa_sqm: null,
      cur_est_kitchen_gfa_sqm: null,
      cur_est_bath_gfa_sqm: null,
      max_garage_gfa_sqm: null,
      cur_floor_gfa_sqm: null,
      cur_pot_2story_gfa_sqm: null,
    });

    const s = await runStep(pool);
    expect(s.records_meta.null_geom_basis_count).toBeGreaterThanOrEqual(1);
    const menu = (await pool.query(`SELECT parcel_cost_menu FROM parcels WHERE id = $1`, [P(4)])).rows[0]
      .parcel_cost_menu;
    // only the schema version key — no priced lines
    expect(Object.keys(menu).filter((k) => k !== '_schema_version').length).toBe(0);
  }, 60_000);
});
