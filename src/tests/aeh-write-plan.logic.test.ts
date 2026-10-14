// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-CD / R-BZ G5, G13
//
// R-CD (operator y 2026-10-12): "An ASSERT's snapshot upsert (assert_engine_health)
// is a compute-returned `*_sql` plan executed by the runner write seam with
// txn_scope:none per-row autocommit; a per-row failure stops the loop and writes one
// WARN row; no compute-side DML." Closes ledger G5
// `compute-direct-write@23265920758bf06c#1` and G13
// `compute-no-swallow@writeFailed = true;` (G6 `compute-no-sql-clock@const UPSERT_SQL...`
// no longer fires since R-CE).
//
// The RUNNER half (brief s2-rcd-1, `runWritePlan` in scripts/lib/step/index.js) executes
// the plan; the non-fatal per-row semantics are pinned there
// (src/tests/rcd-write-plan.logic.test.ts case e). THIS file exercises the compute alone:
// it returns `{ table, sql, rows, report_check }` and issues NO DML.

import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS compute module */
const mod = require(
  path.join(process.cwd(), 'scripts/lib/compute/assert-engine-health.js'),
) as {
  UPSERT_SQL: string;
  compute: (ctx: unknown) => Promise<{
    write_plan: {
      table: string;
      sql: string;
      rows: Array<Array<number | string>>;
      report_check: string;
    };
    records_meta: Record<string, unknown>;
    counters: Record<string, unknown>;
  }>;
  buildSnapshotPlan: (
    tableResults: Array<Record<string, number | string>>,
    clockMs: number,
    zone: string,
  ) => { table: string; sql: string; rows: Array<Array<number | string>>; report_check: string };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const COMPUTE_REL = 'scripts/lib/compute/assert-engine-health.js';
const CLOCK_MS = 1760238425000;

/** One discovered table's stats row, as buildTableResults emits them. */
const ENTRY: Record<string, number | string> = {
  table_name: 'parcels',
  n_live_tup: 100,
  n_dead_tup: 5,
  dead_ratio: 0.05,
  seq_scan: 2,
  idx_scan: 20,
  seq_ratio: 0.1,
};

function computeSource(): string {
  return fs.readFileSync(path.join(process.cwd(), COMPUTE_REL), 'utf-8');
}

describe('assert_engine_health — the snapshot upsert as a compute-returned write_plan (R-CD)', () => {
  it('(1) buildSnapshotPlan shapes { table, sql, rows, report_check } for one table', () => {
    expect(mod.buildSnapshotPlan([ENTRY], 1760238425000, 'UTC')).toEqual({
      table: 'engine_health_snapshots',
      sql: mod.UPSERT_SQL,
      rows: [['parcels', 100, 5, 0.05, 2, 20, 0.1, 1760238425000, 'UTC']],
      report_check: 'engine_health_write_failed',
    });
  });

  it('(2) empty tableResults yields an empty plan rows[]', () => {
    expect(mod.buildSnapshotPlan([], 1760238425000, 'UTC').rows).toEqual([]);
  });

  it('(3) compute issues no DML, returns the plan, and leaves records_updated to the runner', async () => {
    const tables = { rows: [{ relname: 'parcels' }] };
    const stats = {
      rows: [{
        table_name: 'parcels',
        n_live_tup: '100',
        n_dead_tup: '5',
        seq_scan: '2',
        idx_scan: '20',
        n_tup_ins: '7',
        n_tup_upd: '3',
      }],
    };
    const seenSql: string[] = [];
    const pool = {
      query: vi.fn(async (sql: string) => {
        seenSql.push(sql);
        if (sql.includes('SELECT relname FROM pg_stat_user_tables')) return tables;
        if (sql.includes('n_tup_upd::bigint AS n_tup_upd')) return stats;
        return { rows: [] };
      }),
    };
    const ctx = {
      pool,
      config: {
        engine_health_dead_tuple_min_rows: 1000,
        engine_health_seq_scan_min_rows: 10000,
        pipeline_timezone: 'UTC',
      },
      checks: ['dead_tuple_ratio_high', 'engine_health_write_failed'],
      clock: () => 1760238425000,
      log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
      report: vi.fn(),
      descriptor: { identity: { name: 'assert_engine_health' } },
    };

    const result = await mod.compute(ctx);

    for (const sql of seenSql) {
      expect(sql).not.toContain('INSERT INTO engine_health_snapshots');
    }

    expect(result.write_plan.rows).toHaveLength(1);
    const deadRatio = result.records_meta.engine_health as unknown as
      Array<{ dead_ratio: number; seq_ratio: number }>;
    expect(result.write_plan.rows[0]).toEqual([
      'parcels', 100, 5, deadRatio[0]!.dead_ratio, 2, 20, deadRatio[0]!.seq_ratio, 1760238425000, 'UTC',
    ]);

    const reported = ctx.report.mock.calls.map((c) => c[0]);
    expect(reported).toContain('dead_tuple_ratio_high');
    expect(reported).not.toContain('engine_health_write_failed');

    expect(result.records_meta).not.toHaveProperty('records_updated');
    expect(result.counters).toEqual({ records_total: 1 });
    expect(result.records_meta.tables_checked).toBe(1);
    expect(ctx.log.warn).not.toHaveBeenCalled();
  });

  it('(4) source lock — no compute-side DML, no swallow, no legacy export', () => {
    const text = computeSource();
    expect(text).not.toContain('pool.query(UPSERT_SQL');
    expect(text).not.toContain('writeFailed');
    expect(text).not.toContain('writeError');
    expect(text).not.toContain('writeSnapshots');
    expect(text).toContain('buildSnapshotPlan(tableResults, ctx.clock(), config.pipeline_timezone)');
  });

  it('(5) the runner-observed check stays in the dispatch table as a skipped no-op (dispatch ≡ declared checks, §5.5)', () => {
    const text = computeSource();
    expect(text).toContain('engine_health_write_failed: function engine_health_write_failed() {},');
    expect(text).toContain('if (id === writePlan.report_check) continue;');
  });
});
