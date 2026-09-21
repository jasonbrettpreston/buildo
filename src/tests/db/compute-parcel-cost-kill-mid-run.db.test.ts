// SPEC LINK: docs/specs/01-pipeline/88_parcel_cost_model.md §2.11
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 12 — truthful crash posture)
//
// Batch-2 row 2.4, §5/§8 — the kill-mid-run pattern (enrich_heritage/enrich_ravines
// precedent), adapted for a BATCH-FLUSH step (unlike those two set-based single-statement
// steps, this one has NO shared transaction: `execution.txn_scope:"none"`, each
// `ctx.flushBatch` call is its OWN short transaction). The claim is therefore different and
// stated correctly here: (a) a cancel mid-flush commits ZERO rows for THAT batch — Postgres
// statements are atomic by construction, proven against the real backend, never assumed —
// (b) an unmodified re-run of the SAME flush then converges, and (c) a third, still-unmodified
// run writes 0 (idempotent).
//
// Exercises `compute.buildFlushSql`'s generated UPDATE statement DIRECTLY (real `pg` client,
// real `pg_cancel_backend`), the same statement `ctx.flushBatch` executes inside its own
// BEGIN/COMMIT wrapper (scripts/lib/step/index.js:3732) — mirrors the enrich_heritage
// kill-mid-run precedent's own technique (a slowed variant of the real generated SQL), rather
// than racing the full pipeline.step(...).run() orchestration, which shares this runner
// mechanism with every other converted ENRICHER and is not this step's own logic to re-prove.
// `tasks/lessons.md:34`: pg_cancel_backend, never a process kill.
//
// Skipped unless BUILDO_TEST_DB=1.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import path from 'path';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const REPO_ROOT = path.resolve(__dirname, '../../../');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require(path.join(REPO_ROOT, 'scripts/lib/compute/compute-parcel-cost-estimates.js'));

const P = (n: number) => 9_962_000 + n;

/** Injects a 2s delay into the generated flush UPDATE, changing nothing else. */
function slowedSql(sql: string): string {
  return sql.replace('FROM (VALUES', 'FROM (SELECT pg_sleep(2)) AS _delay, (VALUES');
}

function fakeBatchRow(id: number, seed: number) {
  return {
    id,
    menu: { _schema_version: 1, max_build: { total: seed, per_sqm: seed, area: 1, area_confidence: 'high', norm_basis: 'n/a', trades: null, products: null } },
    scalars: {
      cost_fb_total: seed, cost_coa_total: seed, cost_solar_total: seed, cost_garden_suite_total: seed,
      cost_laneway_suite_total: seed, cost_garage_total: seed, cost_gut_total: seed, cost_addition_total: seed,
      cost_kitchen_per_sqm: seed, cost_bath_per_sqm: seed, cost_basement_per_sqm: seed, cost_basement_underpin_per_sqm: seed,
      max_build_fsi: 1, coa_fsi: 1, realized_fsi_p90: null,
    },
  };
}

describe.skipIf(!dbAvailable())('compute_parcel_cost_estimates — kill-mid-run (real pg_cancel_backend)', () => {
  let pool: Pool;
  beforeAll(() => { pool = getTestPool() as Pool; });
  afterAll(async () => {
    await pool.query(`DELETE FROM parcels WHERE parcel_id LIKE 'PCM-KILL2-%'`);
    await pool.end();
  });

  it('(a) a mid-statement cancel commits ZERO writes for that batch; (b) an unmodified re-run then converges; (c) a third run writes 0', async () => {
    await pool.query(`DELETE FROM parcels WHERE parcel_id LIKE 'PCM-KILL2-%'`);
    await pool.query(
      `INSERT INTO parcels (id, parcel_id, zoning_class, lot_size_sqm) VALUES
         ($1, 'PCM-KILL2-A', 'RD', 400), ($2, 'PCM-KILL2-B', 'RD', 400)`,
      [P(1), P(2)],
    );

    const batch = [fakeBatchRow(P(1), 111.11), fakeBatchRow(P(2), 222.22)];
    const { sql, params } = compute.buildFlushSql(batch);
    expect(slowedSql(sql)).not.toBe(sql); // sanity: the injection actually changed the text
    expect(slowedSql(sql).replace('FROM (SELECT pg_sleep(2)) AS _delay, (VALUES', 'FROM (VALUES')).toBe(sql); // …and ONLY the injection

    const slowClient: PoolClient = await pool.connect();
    try {
      const pidRes = await slowClient.query('SELECT pg_backend_pid() AS pid');
      const pid = pidRes.rows[0].pid;

      const slowPromise = slowClient.query(slowedSql(sql), params).catch((err: unknown) => err);

      let cancelled = false;
      for (let i = 0; i < 40 && !cancelled; i++) {
        const activity = await pool.query(
          `SELECT state, query FROM pg_stat_activity WHERE pid = $1 AND state = 'active' AND query ILIKE '%pg_sleep%'`,
          [pid],
        );
        if (activity.rows.length > 0) {
          await pool.query('SELECT pg_cancel_backend($1)', [pid]);
          cancelled = true;
        } else {
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      expect(cancelled).toBe(true); // the race actually landed mid-statement — not a vacuous pass

      const result = await slowPromise;
      expect(result).toBeInstanceOf(Error);
      expect(String((result as Error).message)).toMatch(/canceling statement due to user request/i);
    } finally {
      slowClient.release();
    }

    // (a) ZERO committed writes — both fixture rows are still at their INSERT-time defaults.
    const afterCancel = await pool.query(
      `SELECT parcel_cost_menu, cost_fb_total FROM parcels WHERE id = ANY($1::int[]) ORDER BY id`,
      [[P(1), P(2)]],
    );
    expect(afterCancel.rows.every((r) => r.parcel_cost_menu === null)).toBe(true);
    expect(afterCancel.rows.every((r) => r.cost_fb_total === null)).toBe(true);

    // (b) an UNMODIFIED re-run (the real, un-slowed statement) converges.
    const rerun = await pool.query(sql, params);
    expect(rerun.rowCount).toBe(2);
    const afterRerun = await pool.query(
      `SELECT parcel_cost_menu, cost_fb_total FROM parcels WHERE id = ANY($1::int[]) ORDER BY id`,
      [[P(1), P(2)]],
    );
    expect(afterRerun.rows[0].parcel_cost_menu).toBeTruthy();
    expect(Number(afterRerun.rows[0].cost_fb_total)).toBeCloseTo(111.11, 2);
    expect(Number(afterRerun.rows[1].cost_fb_total)).toBeCloseTo(222.22, 2);

    // (c) a THIRD run of the same unmodified statement, same values, writes 0 (idempotent —
    // the 16-column IS DISTINCT FROM guard short-circuits an unchanged re-write).
    const third = await pool.query(sql, params);
    expect(third.rowCount).toBe(0);
  }, 30_000);
});
