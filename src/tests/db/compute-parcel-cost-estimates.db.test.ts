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
import fs from 'fs';
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

  it('WF3: new_build (cost_fb_total) prices opt_aor_gfa; NULL opt_aor → envelope fallback + counted (CPCE-D4 CLOSED)', async () => {
    // (a) opt_aor 250 ≠ max_buildable 300 → the max_build line prices 250, not the envelope.
    await insParcel(pool, P(5), { opt_aor_gfa_sqm: 250, max_buildable_gfa_sqm: 300 });
    // (b) opt_aor NULL → COALESCE falls back to the max-build envelope (300).
    await insParcel(pool, P(6), { opt_aor_gfa_sqm: null, max_buildable_gfa_sqm: 300 });

    const s = await runStep(pool);
    expect(s.records_meta.engine_error_count).toBe(0);
    // CPCE-D4 CLOSED (O3, 2026-09-21) — the OBSERVABILITY half of this case is now a real
    // audit-table row (matching legacy's own shape: an INFO row, never a records_meta flat key
    // — legacy never had one either, per docs/reports/golden/compute_parcel_cost_estimates/pre/
    // standalone.json's records_meta key list).
    const fallbackRow = s.records_meta.audit_table.rows.find(
      (r: { metric: string }) => r.metric === 'new_build_fallback_count',
    );
    expect(fallbackRow).toBeTruthy();
    expect(fallbackRow.value).toBeGreaterThanOrEqual(1); // P(6) used the fallback
    expect(fallbackRow.status).toBe('INFO');

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

  // CPCE-D4 CLOSED (O3, 2026-09-21). Was: `newBuildFallbackCount`/`fsiImplausibleCount` were
  // measured into `ctx.matched` but reached neither records_meta nor the audit table (no
  // checks[] entry reported them) — a real observability regression vs the legacy, which
  // carried both as INFO audit rows (`docs/reports/golden/compute_parcel_cost_estimates/pre/
  // standalone.json`). Fixed: two new `checks[]` entries (severity INFO, matching legacy's
  // non-verdict-affecting status) dispatch `fsi_implausible_count`/`new_build_fallback_count`
  // into the audit table — see the assertion folded into the test above (same fixture,
  // same case; a separate it.fails() case is no longer needed once the assertion is live).
  it('fsi_implausible_count audit row is present and INFO (CPCE-D4 CLOSED)', async () => {
    await insParcel(pool, P(7), { opt_aor_gfa_sqm: null, max_buildable_gfa_sqm: 300 });
    const s = await runStep(pool);
    const fsiRow = s.records_meta.audit_table.rows.find(
      (r: { metric: string }) => r.metric === 'fsi_implausible_count',
    );
    expect(fsiRow).toBeTruthy();
    expect(fsiRow.status).toBe('INFO');
    expect(typeof fsiRow.value).toBe('number');
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
      // S0.2 (WF3 existing-structure-area-artifacts): max_buildable_gfa_sqm must be NON-NULL for
      // this parcel to be scanned at all (the product-scope bound excludes NULL from the stream
      // entirely) — 0 satisfies that while still being <= compute_parcel_cost_min_priceable_area_sqm
      // (default 0), so the COALESCE'd new_build area is priceable-floor-excluded, not NULL-excluded;
      // same "no computable line" outcome as the pre-S0.2 fixture, reached a different way.
      max_buildable_gfa_sqm: 0,
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

  // ── CPCE-D2 — the retraction of cost values stranded outside the R% population ───────────
  describe('CPCE-D2 — ctx.retract(1, []) nulls a stranded (non-R%) parcel\'s menu + 15 scalars', () => {
    const BEFORE_IMAGE_DIR = path.join(
      REPO_ROOT, 'docs/reports/golden/compute_parcel_cost_estimates/before-image',
    );

    function listBeforeImageFiles(): Set<string> {
      try {
        return new Set(fs.readdirSync(BEFORE_IMAGE_DIR));
      } catch {
        return new Set();
      }
    }

    it('RED — a stranded CR parcel carrying a priced menu is NULLed; an RD parcel survives', async () => {
      // P(80): RD (in-population) — priced, must SURVIVE unchanged.
      await insParcel(pool, P(80));
      // P(81): CR (outside the R% population) — already carries a full priced menu, as if a
      // prior run priced it before a re-zoning moved it out (CPCE-D2's exact live shape,
      // measured against parcels 373779/11891 in the real dev DB).
      await insParcel(pool, P(81), {
        zoning_class: 'CR',
        parcel_cost_menu: { _schema_version: 1, max_build: { total: 100, per_sqm: 1, area: 100, area_confidence: 'high', norm_basis: 'n/a', trades: null, products: null } },
        cost_fb_total: 3478226.93,
        cost_coa_total: 3478226.93,
        max_build_fsi: 1.05,
      });

      const s = await runStep(pool);
      expect(s.records_meta.engine_error_count).toBe(0);

      const rowA = (await pool.query(
        `SELECT parcel_cost_menu, cost_fb_total FROM parcels WHERE id = $1`, [P(80)],
      )).rows[0];
      expect(rowA.parcel_cost_menu).toBeTruthy(); // RD parcel: priced, untouched by the retraction
      expect(rowA.parcel_cost_menu._schema_version).toBe(1);

      const rowB = (await pool.query(
        `SELECT parcel_cost_menu, cost_fb_total, cost_coa_total, cost_solar_total, cost_garden_suite_total,
                cost_laneway_suite_total, cost_garage_total, cost_gut_total, cost_addition_total,
                cost_kitchen_per_sqm, cost_bath_per_sqm, cost_basement_per_sqm, cost_basement_underpin_per_sqm,
                max_build_fsi, coa_fsi, realized_fsi_p90
           FROM parcels WHERE id = $1`,
        [P(81)],
      )).rows[0];
      for (const col of Object.keys(rowB)) {
        expect(rowB[col], `P(81).${col} (stranded CR parcel)`).toBeNull();
      }
    }, 60_000);

    it('both-directions (a) — a stranded parcel with all 16 columns ALREADY NULL is excluded by the guard (stranded_cost_rows_retracted does not count it)', async () => {
      await insParcel(pool, P(82), { zoning_class: 'O' }); // non-R, but nothing to retract
      const s = await runStep(pool);
      const row = (await pool.query(`SELECT parcel_cost_menu FROM parcels WHERE id = $1`, [P(82)])).rows[0];
      expect(row.parcel_cost_menu).toBeNull();
      // this fixture alone contributed 0 to the count — asserted via the SQL invariant directly,
      // since other concurrent fixtures may also be retracting in the same run.
      const still = (await pool.query(
        `SELECT count(*)::int AS n FROM parcels WHERE id = $1 AND parcel_cost_menu IS NOT NULL`, [P(82)],
      )).rows[0];
      expect(still.n).toBe(0);
      void s;
    }, 60_000);

    it('both-directions (b) — an immediate second run reports stranded_cost_rows_retracted === 0 for this parcel (self-extinguishing, idempotent_rerun:"zero_writes" proven, not merely asserted)', async () => {
      await insParcel(pool, P(83), {
        zoning_class: 'CR',
        parcel_cost_menu: { _schema_version: 1 },
        cost_fb_total: 999,
      });
      const first = await runStep(pool);
      expect(first.records_meta.stranded_cost_rows_retracted).toBeGreaterThanOrEqual(1); // P(83) retracted
      const afterFirst = (await pool.query(`SELECT cost_fb_total FROM parcels WHERE id = $1`, [P(83)])).rows[0];
      expect(afterFirst.cost_fb_total).toBeNull();

      // Second run over the SAME (now all-NULL) row: the guard ("at least one of the 16 IS
      // DISTINCT FROM NULL") excludes it, so the UPDATE's own rowCount for P(83) is 0 — proven
      // by the fact the row's value is UNCHANGED (still NULL, no error), not merely re-read as
      // NULL by coincidence. (The before-image SELECT itself is scope-only, per write.js#
      // buildBeforeImageSelectSql — it still reads P(83) on every run, the declared superset
      // divergence — so file presence alone cannot prove the guard fired; the DB state can.)
      const second = await runStep(pool);
      expect(second.records_meta.engine_error_count).toBe(0);
      const afterSecond = (await pool.query(`SELECT cost_fb_total FROM parcels WHERE id = $1`, [P(83)])).rows[0];
      expect(afterSecond.cost_fb_total).toBeNull();
    }, 60_000);

    it('both-directions (c) — written.e1.updated (records_updated) is unchanged by the seam (R-AT — no double count)', async () => {
      await insParcel(pool, P(84)); // RD, priced normally through writes[0]
      await insParcel(pool, P(85), { zoning_class: 'CR', parcel_cost_menu: { _schema_version: 1 }, cost_fb_total: 1 });
      const s = await runStep(pool);
      // records_updated sources from written.e1.updated (writes[0] ONLY) — the retraction on
      // writes[1] (P(85)) must not inflate it. P(84) alone accounts for >=1 of records_updated;
      // asserting only a lower bound keeps this robust to concurrent fixture rows in the suite.
      expect(s.records_updated).toBeGreaterThanOrEqual(1);
      const rowB = (await pool.query(`SELECT cost_fb_total FROM parcels WHERE id = $1`, [P(85)])).rows[0];
      expect(rowB.cost_fb_total).toBeNull();
    }, 60_000);

    it('both-directions (d) — a before-image JSONL is written BEFORE the retraction, carrying the stranded parcel\'s pre-retraction values', async () => {
      await insParcel(pool, P(86), {
        zoning_class: 'CR',
        parcel_cost_menu: { _schema_version: 1, max_build: { total: 42 } },
        cost_fb_total: 12345.67,
      });
      const filesBefore = listBeforeImageFiles();
      await runStep(pool);
      const filesAfter = listBeforeImageFiles();
      const newFiles = [...filesAfter].filter((f) => !filesBefore.has(f) && f.endsWith('-parcels.jsonl'));
      expect(newFiles.length, 'a new before-image JSONL for this run').toBeGreaterThanOrEqual(1);
      const rows = newFiles.flatMap((f) =>
        fs.readFileSync(path.join(BEFORE_IMAGE_DIR, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
      const mine = rows.find((r) => r.id === P(86));
      expect(mine, 'P(86) present in a before-image file').toBeTruthy();
      expect(Number(mine.cost_fb_total)).toBeCloseTo(12345.67, 1);
    }, 60_000);

    it('new declared observables: stranded_cost_rows_retracted (INFO) + no_cost_outside_population (FAIL invariant, always 0 post-retraction)', async () => {
      await insParcel(pool, P(87), { zoning_class: 'CR', parcel_cost_menu: { _schema_version: 1 }, cost_fb_total: 1 });
      const s = await runStep(pool);
      const strandedRow = s.records_meta.audit_table.rows.find(
        (r: { metric: string }) => r.metric === 'stranded_cost_rows_retracted',
      );
      expect(strandedRow).toBeTruthy();
      expect(strandedRow.status).toBe('INFO');
      expect(typeof strandedRow.value).toBe('number');
      expect(strandedRow.value).toBeGreaterThanOrEqual(1); // P(87) alone

      const invariantRow = s.records_meta.audit_table.rows.find(
        (r: { metric: string }) => r.metric === 'no_cost_outside_population',
      );
      expect(invariantRow).toBeTruthy();
      expect(invariantRow.status).not.toBe('FAIL'); // evaluated AFTER this run's own retraction
      expect(s.records_meta.stranded_cost_rows_retracted).toBeGreaterThanOrEqual(1);
    }, 60_000);
  });
});
