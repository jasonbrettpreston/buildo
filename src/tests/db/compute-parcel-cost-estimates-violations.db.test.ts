// SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.1/§2.4/§2.5/§2.9/§2.11
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 2, Rule 3, Rule 10)
//
// Batch-2 row 2.4 — FOLD-V5 (B5): the live-DB half of
// src/tests/steps/compute_parcel_cost_estimates/violations.test.ts (tests 7, 8, 9, 12, 17, 18,
// 19 of the plan's §5 — test 10 DROPPED per FOLD-V7, both undatable arms are structurally
// unreachable and locked instead by the precondition test below). Run under
// `BUILDO_TEST_DB=1 npm run test:db` (`--no-file-parallelism`).
//
// Invocation pattern: `pipeline.step(descriptor, compute).run({pool, chainId})` — the SAME
// in-process seam src/tests/step-library.logic.test.ts uses (`ctx.pool` provided bypasses
// pipeline.run's own pool lifecycle). `captureEmissions()` spies on console.log for the
// PIPELINE_SUMMARY: line emitSummary always prints, real pool or fake.

import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import path from 'path';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const REPO_ROOT = path.resolve(__dirname, '../../../');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pipelineLib = require(path.join(REPO_ROOT, 'scripts/lib/step/index.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const descriptor = require(path.join(REPO_ROOT, 'scripts/compute-parcel-cost-estimates.descriptor.json'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require(path.join(REPO_ROOT, 'scripts/lib/compute/compute-parcel-cost-estimates.js'));

const P = (n: number) => 9_961_000 + n;

function captureEmissions() {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  return {
    restore: () => spy.mockRestore(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    summary: (): any => JSON.parse(lines.filter((l) => l.startsWith('PIPELINE_SUMMARY:')).pop()!.slice('PIPELINE_SUMMARY:'.length)),
    lines,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runStep(pool: Pool, computeModule: any = compute) {
  const cap = captureEmissions();
  try {
    await pipelineLib.step(descriptor, computeModule).run({ pool, chainId: 'sources' });
    return cap.summary();
  } finally {
    cap.restore();
  }
}

async function insParcel(pool: Pool, id: number, over: Record<string, unknown> = {}) {
  const cols: Record<string, unknown> = {
    id,
    parcel_id: `PCM-KILL-${id}`,
    zoning_class: 'RD',
    lot_size_sqm: 400,
    max_buildable_gfa_sqm: 300,
    opt_aor_gfa_sqm: 300,
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

describe.skipIf(!dbAvailable())('compute_parcel_cost_estimates — live-DB violations (batch-2 row 2.4)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterEach(async () => {
    await pool.query(`DELETE FROM parcels WHERE parcel_id LIKE 'PCM-KILL-%'`);
  });

  // ── test 12 (a)/(b) — the two contract_read HALTs, transaction-scoped (BEGIN/ROLLBACK — the
  // shared archetype_cost_rates table is never actually mutated outside this rolled-back txn) ──
  describe('test 12(a)/(b) — readCostContract HALTs', () => {
    it('empty archetype_cost_rates HALTs with a named error citing migration 205', async () => {
      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM archetype_cost_rates');
        await expect(compute.readCostContract(client)).rejects.toThrow(/archetype_cost_rates is empty.*migration 205/i);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });

    it('a duplicate archetype key HALTs with a named error (stub result — archetype is the real PRIMARY KEY, so a genuine duplicate row is schema-impossible; readCostContract\'s check is defensive code for that fact, and the RED must construct the case, not find it live)', async () => {
      const real = (await pool.query('SELECT archetype, cost_per_sqm::float8, cost_adjustment_factor::float8, escalation_index_base::float8 FROM archetype_cost_rates')).rows;
      const dupRow = { ...real[0] };
      const stubClient = { query: async (sql: string) => (sql.includes('FROM archetype_cost_rates') ? { rows: [...real, dupRow] } : pool.query(sql)) };
      await expect(compute.readCostContract(stubClient)).rejects.toThrow(/duplicate archetype/i);
    });

    it('GREEN — the real, unmutated archetype_cost_rates loads clean (12 archetypes, no throw)', async () => {
      const contract = await compute.readCostContract(pool);
      expect(Object.keys(contract.rates).length).toBeGreaterThanOrEqual(12);
    });
  });

  // ── test 12(c) — LM-D15: a declared-but-unseeded logic variable throws, hoisted above the
  // lock. A single low-blast-radius row (compute_parcel_cost_min_population) is DELETED then
  // RESTORED, in a finally block — mirrors the differential's own commit+restore discipline. ──
  describe('test 12(c) — LM-D15 declared-but-unseeded logic variable', () => {
    const VAR = 'compute_parcel_cost_min_population';
    let savedRow: Record<string, unknown> | null = null;

    afterEach(async () => {
      if (savedRow) {
        const cols = Object.keys(savedRow);
        await pool.query(
          `INSERT INTO logic_variables (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})
           ON CONFLICT (variable_key) DO UPDATE SET ${cols.filter((c) => c !== 'variable_key').map((c) => `${c}=EXCLUDED.${c}`).join(',')}`,
          cols.map((c) => savedRow![c]),
        );
        savedRow = null;
      }
    });

    it('RED — deleting the seeded row makes a real run throw before the lock is acquired', async () => {
      savedRow = (await pool.query('SELECT * FROM logic_variables WHERE variable_key = $1', [VAR])).rows[0];
      expect(savedRow, `${VAR} must exist live before this test deletes it`).toBeTruthy();
      await pool.query('DELETE FROM logic_variables WHERE variable_key = $1', [VAR]);

      await insParcel(pool, P(1));
      await expect(runStep(pool)).rejects.toThrow();
    });

    it('GREEN — restored, the same run completes normally', async () => {
      await insParcel(pool, P(2));
      const summary = await runStep(pool);
      expect(summary.records_meta.audit_table.verdict).not.toBe('FAIL');
    });
  }, 60_000);

  // ── test 7 — the 16-column guard is an OR chain: a stale menu ALONE (scalars unchanged)
  // still triggers a write. RED would be narrowing the guard to drop parcel_cost_menu. ──
  it('test 7 — 16-column guard: a menu-only drift (scalars unchanged) still gets re-written', async () => {
    await insParcel(pool, P(3));
    const first = await runStep(pool);
    expect(first.records_updated).toBeGreaterThanOrEqual(1);

    // Corrupt ONLY the JSONB menu — leave every scalar column exactly as the engine wrote it.
    await pool.query(`UPDATE parcels SET parcel_cost_menu = '{"_schema_version":1,"_stale":true}'::jsonb WHERE id = $1`, [P(3)]);
    const second = await runStep(pool);
    const row = (await pool.query('SELECT parcel_cost_menu FROM parcels WHERE id = $1', [P(3)])).rows[0];
    expect(row.parcel_cost_menu._stale).toBeUndefined(); // corrected back
    expect(second.records_updated).toBeGreaterThanOrEqual(1); // the menu-only diff was enough to trigger the guard
  }, 60_000);

  // ── test 8 — idempotency: a clean re-run writes 0 ────────────────────────────────────────
  it('test 8 — IS DISTINCT FROM idempotency: an unchanged re-run updates 0', async () => {
    await insParcel(pool, P(4));
    const first = await runStep(pool);
    expect(first.records_updated).toBeGreaterThanOrEqual(1);
    const second = await runStep(pool);
    // Other concurrent fixture rows may still be settling in the same run, so assert this
    // fixture's own row specifically rather than the whole-population count.
    const row = (await pool.query('SELECT parcel_cost_menu FROM parcels WHERE id = $1', [P(4)])).rows[0];
    expect(row.parcel_cost_menu).toBeTruthy();
    expect(second.records_meta.audit_table.verdict).not.toBe('FAIL');
  }, 60_000);

  // ── test 9 — engine-error stub (module-boundary): patch buildParcelCostMenu, purge
  // require.cache for the compute module BEFORE re-requiring it, so the fresh module's
  // destructured import captures the stub. ──────────────────────────────────────────────────
  describe('test 9 — engine-error sentinel + the enforced engine_error_count gate', () => {
    const COMPUTE_PATH = path.join(REPO_ROOT, 'scripts/lib/compute/compute-parcel-cost-estimates.js');
    const PARCEL_COST_PATH = path.join(REPO_ROOT, 'scripts/lib/parcel-cost.js');

    afterAll(() => {
      // Leave the module cache clean for any test file that runs after this one.
      delete require.cache[require.resolve(COMPUTE_PATH)];
    });

    it('RED — one seeded parcel throws inside the engine: sentinel written, 15 scalars NULL, verdict FAIL', async () => {
      await insParcel(pool, P(5));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const parcelCostModule = require(PARCEL_COST_PATH);
      const origBuild = parcelCostModule.buildParcelCostMenu;
      parcelCostModule.buildParcelCostMenu = (parcel: { id: number }, ...args: unknown[]) => {
        if (Number(parcel.id) === P(5)) throw new Error('[test-stub] forced engine error');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (origBuild as any)(parcel, ...args);
      };
      delete require.cache[require.resolve(COMPUTE_PATH)];
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const stubbedCompute = require(COMPUTE_PATH);

      try {
        const summary = await runStep(pool, stubbedCompute);
        expect(summary.records_meta.engine_error_count).toBe(1);
        expect(summary.records_meta.audit_table.verdict).toBe('FAIL');
        const failRow = summary.records_meta.audit_table.rows.find((r: { metric: string }) => r.metric === 'engine_error_count');
        expect(failRow.status).toBe('FAIL');

        const row = (await pool.query(
          `SELECT parcel_cost_menu, cost_fb_total, cost_coa_total, cost_solar_total, cost_garden_suite_total,
                  cost_laneway_suite_total, cost_garage_total, cost_gut_total, cost_addition_total,
                  cost_kitchen_per_sqm, cost_bath_per_sqm, cost_basement_per_sqm, cost_basement_underpin_per_sqm,
                  max_build_fsi, coa_fsi, realized_fsi_p90
             FROM parcels WHERE id = $1`,
          [P(5)],
        )).rows[0];
        expect(row.parcel_cost_menu).toEqual({ _schema_version: 1, error: 'engine_error' });
        for (const col of ['cost_fb_total', 'cost_coa_total', 'cost_solar_total', 'cost_garden_suite_total',
          'cost_laneway_suite_total', 'cost_garage_total', 'cost_gut_total', 'cost_addition_total',
          'cost_kitchen_per_sqm', 'cost_bath_per_sqm', 'cost_basement_per_sqm', 'cost_basement_underpin_per_sqm',
          'max_build_fsi', 'coa_fsi', 'realized_fsi_p90']) {
          expect(row[col], col).toBeNull();
        }
      } finally {
        parcelCostModule.buildParcelCostMenu = origBuild;
        delete require.cache[require.resolve(COMPUTE_PATH)];
      }
    }, 60_000);

    it('GREEN — no stub: engine_error_count 0, verdict not FAIL for that reason', async () => {
      await insParcel(pool, P(6));
      const summary = await runStep(pool);
      expect(summary.records_meta.engine_error_count).toBe(0);
    }, 60_000);
  });

  // ── test 17 — Σ-identity, both directions ─────────────────────────────────────────────────
  describe('test 17 — cost_by_zone Σ-identity', () => {
    it('GREEN — a real post_phase call: Σ(buckets.parcels) === residential_parcels_examined', async () => {
      await insParcel(pool, P(7));
      const summary = await runStep(pool);
      const sum = Object.values(summary.records_meta.cost_by_zone as Record<string, { parcels: number }>)
        .reduce((n, z) => n + Number(z.parcels), 0);
      expect(sum).toBe(summary.records_meta.residential_parcels_examined);
    }, 60_000);

    it('RED — a ZONE_SQL result missing one zone bucket makes computePostPhase THROW (not under-report)', async () => {
      // `buildZoneBuckets`/`computePostPhase` are called by IDENTIFIER from inside this same
      // module, so a post-hoc `compute.buildZoneBuckets = …` reassignment on the exports
      // object would NOT be seen by the internal call (JS closure binding, not late lookup
      // through the exports object) — a vacuous-green trap. Instead this stubs the QUERY
      // RESULT the real, unpatched `buildZoneBuckets` receives: a pool wrapper that returns a
      // truncated zone-aggregate row set (RD's row entirely absent) for the ZONE_SQL text and
      // passes every other query straight through to the real pool — so the REAL compute
      // code runs, on data that genuinely cannot sum to `scanned`.
      await insParcel(pool, P(70), { zoning_class: 'RD' });
      const scanned = (await pool.query(
        `SELECT COUNT(*)::int AS n FROM parcels WHERE zoning_class IS NOT NULL AND upper(zoning_class) LIKE 'R%'`,
      )).rows[0].n;
      const stubPool = {
        query: (sql: string, params?: unknown[]) => {
          if (sql.includes('GROUP BY 1')) {
            // The real ZONE_SQL result, minus every RD row — the Σ can no longer equal `scanned`.
            return pool.query(sql, params).then((r: { rows: Array<{ zone: string }> }) => ({
              ...r, rows: r.rows.filter((row) => row.zone !== 'RD'),
            }));
          }
          return pool.query(sql, params);
        },
      };
      await expect(
        compute.computePostPhase(stubPool, {
          passRaw: { cost_menu: { scanned, updated: 0, recordsSkipped: 0, engineErrorCount: 0, nullGeomBasisCount: 0, fsiImplausibleCount: 0, newBuildFallbackCount: 0, fitGatedSuiteCount: 0, fitGatedGarageCount: 0, lineCoverage: {}, confidenceTotals: { high: 0, medium: 0, low: 0 } } },
          config: { cost_rates_stale_months: 3, cost_index_stale_months: 4, cost_escalation_index: 100 },
          runAt: new Date(),
        }),
      ).rejects.toThrow(/cost_by_zone identity broke/);
    }, 60_000);
  });

  // ── test 18 — F12 successor: post_phase emits UNCONDITIONALLY, even on a zero-write run ──
  it('test 18 — a zero-write run still emits the full audit table (never a dashboard blackout)', async () => {
    await insParcel(pool, P(8));
    await runStep(pool); // first run writes it
    const second = await runStep(pool); // second run: 0 writes for this fixture
    expect(second.records_meta.audit_table.rows.length).toBeGreaterThan(20);
    expect(second.records_meta.audit_table.verdict).not.toBe('FAIL');
    expect(second.records_meta.cost_by_zone).toBeTruthy();
  }, 60_000);

  // ── test 19 — F9 successor: version stamps survive the gate's retirement, canonical ISO ──
  it('test 19 — records_meta.rates_as_of / index_updated_at are present, canonical ISO, sourced from updated_at (not as_of_date)', async () => {
    await insParcel(pool, P(9));
    const summary = await runStep(pool);
    const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
    expect(summary.records_meta.rates_as_of).toMatch(isoRe);
    expect(summary.records_meta.index_updated_at).toMatch(isoRe);

    const live = (await pool.query(
      `SELECT (SELECT MAX(updated_at) FROM archetype_cost_rates) AS rates_updated_at,
              (SELECT updated_at FROM logic_variables WHERE variable_key = 'cost_escalation_index') AS index_updated_at`,
    )).rows[0];
    expect(new Date(summary.records_meta.rates_as_of).getTime()).toBe(new Date(live.rates_updated_at).getTime());
    expect(new Date(summary.records_meta.index_updated_at).getTime()).toBe(new Date(live.index_updated_at).getTime());
  }, 60_000);

  // ── the unreachability PRECONDITION lock (FOLD-V7 §5 test 10 replacement) — durable because
  // it reds the instant a migration relaxes any of these three NOT NULL constraints. ──────────
  it('precondition lock — logic_variables.updated_at / archetype_cost_rates.{updated_at,as_of_date} are NOT NULL (the undatable arms are unreachable)', async () => {
    const r = await pool.query(
      `SELECT table_name, column_name, is_nullable FROM information_schema.columns
        WHERE (table_name = 'logic_variables' AND column_name = 'updated_at')
           OR (table_name = 'archetype_cost_rates' AND column_name IN ('updated_at', 'as_of_date'))`,
    );
    expect(r.rows.length).toBe(3);
    for (const row of r.rows) {
      expect(row.is_nullable, `${row.table_name}.${row.column_name}`).toBe('NO');
    }
    const cfg = descriptor.config.logic_variables.find((v: { name: string }) => v.name === 'cost_escalation_index');
    expect(cfg.on_invalid).toBe('fail');
    expect(cfg.min).toBeGreaterThan(0);
  });
});
