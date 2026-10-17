// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BZ G1, R-CB
//
// S1-P-9 — AGC check #8 (`p_step26_entity_tracing_last_verdict`) reads the LAST
// recorded outcome of `assert_entity_tracing` through `ctx.producer` (design §4
// row #8), NOT through a hand-rolled `pipeline_runs` SQL string. R-BZ G1: no
// `pipeline_runs` SQL in compute. R-CB: a verdict read is NOT a baseline — it
// declares the full terminal status set, so a covered-FAIL run
// (`completed_with_errors`) is the latest and is never hidden behind an older
// PASS.
//
// WHAT IS DRIVEN: `compute(ctx)` (the REAL compute, scripts/lib/compute/
// assert-global-coverage.js) with `ctx.checks = ['p_step26_entity_tracing_last_verdict']`
// (the compute runs ONLY the selected checks — §5.5 (2)), so exactly one branch
// loader (`permits`) runs and exactly one producer read is issued.
//
// WHY A FAKE POOL: `loadPermitsBranch` issues a long series of COUNT/aggregate
// reads and destructures `rows[0]` of each; the shape-tolerated answer
// `{ rows: [{}] }` (proven by src/tests/steps/assert_global_coverage/
// witness-fixture.logic.test.ts) keeps every coverage metric at 0 without
// fabricating a table/column NAME. The pool is ALSO recorded, which lets case (g)
// assert that no statement naming `pipeline_runs` was ever issued.
import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS compute */
const COMPUTE_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'lib', 'compute', 'assert-global-coverage.js');
const compute = require(COMPUTE_PATH) as (ctx: unknown) => Promise<void>;
/* eslint-enable @typescript-eslint/no-require-imports */

const CHECK_ID = 'p_step26_entity_tracing_last_verdict';

/** The producer result shape the compute reads (makeProducer's contract). */
interface ProducerResult {
  slug?: string;
  forms?: string[];
  reason: 'FOUND' | 'MISSING' | 'ERROR';
  sid?: number | null;
  status?: string | null;
  audit_outcome?: string | null;
  error?: string;
}

/**
 * A fake pool for the permits branch. The default answer is the "all-zero
 * aggregate row" `{ rows: [{}] }` — never `{ rows: [] }`, because
 * `loadPermitsBranch` destructures `rows[0]` of every aggregate. Every statement
 * is recorded so case (g) can assert the SQL text.
 */
function recordingPool(): { sql: string[]; query: (text: string, values?: unknown[]) => Promise<{ rows: object[] }> } {
  const sql: string[] = [];
  return {
    sql,
    query: async (text: string) => {
      sql.push(text);
      return { rows: [{}] };
    },
  };
}

/** Build the minimal ctx the compute + `evalCoverageLike`/`evalInfo` touch. */
function makeCtx(result: ProducerResult) {
  const pool = recordingPool();
  const report = vi.fn();
  const producer = vi.fn(async () => result);
  const ctx = {
    checks: [CHECK_ID],
    report,
    pool,
    producer,
    // CP-S5 (Spec 124 R-CX) — the runner hands every ASSERT compute ctx.catalog; this harness answers a fixed count.
    catalog: { columnCount: async () => 0, columnCounts: async () => ({}), columnType: async () => null },
    descriptor: { identity: { name: 'assert_global_coverage' } },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    // CP-PLANA (R-BZ G6 + R-CE): the loaders bind the run clock + pipeline_timezone, never NOW().
    clock: () => Date.UTC(2026, 9, 16),
    config: { pipeline_timezone: 'UTC' },
  };
  return { ctx, pool, report, producer };
}

/** The value the check reported for its own id (undefined when it did not report). */
function reportedValue(report: ReturnType<typeof vi.fn>): unknown {
  const call = report.mock.calls.find((c) => c[0] === CHECK_ID);
  expect(call, `check ${CHECK_ID} must report exactly one row`).toBeDefined();
  return (call as unknown[])[1];
}

describe('assert_global_coverage #8 — assert_entity_tracing outcome via ctx.producer (S1-P-9)', () => {
  it('a. FOUND + completed + audit_outcome PASS -> reports value 1', async () => {
    const { ctx, report } = makeCtx({ reason: 'FOUND', sid: 9, status: 'completed', audit_outcome: 'PASS' });
    await compute(ctx);
    expect(reportedValue(report)).toEqual({ violations: 1 });
  });

  it('b. a covered-FAIL run (completed_with_errors + audit_outcome FAIL) -> reports 0 (R-CB: not hidden behind an older PASS)', async () => {
    const { ctx, report } = makeCtx({ reason: 'FOUND', sid: 11, status: 'completed_with_errors', audit_outcome: 'FAIL' });
    await compute(ctx);
    expect(reportedValue(report)).toEqual({ violations: 0 });
  });

  it('c. failed before writing an audit table (audit_outcome null, status failed) -> reports 0', async () => {
    const { ctx, report } = makeCtx({ reason: 'FOUND', sid: 12, status: 'failed', audit_outcome: null });
    await compute(ctx);
    expect(reportedValue(report)).toEqual({ violations: 0 });
  });

  it('d. no run at all (MISSING) -> reports 0 (the old NO_RUN reading)', async () => {
    const { ctx, report } = makeCtx({ reason: 'MISSING', audit_outcome: null });
    await compute(ctx);
    expect(reportedValue(report)).toEqual({ violations: 0 });
  });

  it('e. producer ERROR -> the check fails closed, reported as { error } (compute error boundary) — never a silent 0', async () => {
    const { ctx, report } = makeCtx({ reason: 'ERROR', error: 'boom' });
    await compute(ctx);
    const payload = reportedValue(report) as { error?: Error };
    expect(payload.error).toBeInstanceOf(Error);
    expect(payload.error?.message).toMatch(/assert_entity_tracing outcome read failed: boom/);
  });

  it('f. ctx.producer was called exactly once, with the explicit terminal status set + started_at ordering key', async () => {
    const { ctx, producer } = makeCtx({ reason: 'FOUND', sid: 9, status: 'completed', audit_outcome: 'PASS' });
    await compute(ctx);
    expect(producer).toHaveBeenCalledTimes(1);
    expect(producer).toHaveBeenCalledWith('assert_entity_tracing', { statuses: 'terminal', orderBy: 'started_at' });
  });

  it('g. the permits branch issued no pipeline_runs statement (R-BZ G1: no ledger SQL in compute)', async () => {
    const { ctx, pool } = makeCtx({ reason: 'FOUND', sid: 9, status: 'completed', audit_outcome: 'PASS' });
    await compute(ctx);
    expect(pool.sql.length).toBeGreaterThan(0);
    const offending = pool.sql.filter((s) => s.includes('pipeline_runs'));
    expect(offending, `compute issued pipeline_runs SQL: ${JSON.stringify(offending)}`).toEqual([]);
  });

  it('h. source lock: the compute text names no pipeline_runs / read-entity-tracing / readEntityTracingVerdict', () => {
    const text = fs.readFileSync(COMPUTE_PATH, 'utf8');
    expect(text).not.toMatch(/pipeline_runs|read-entity-tracing|readEntityTracingVerdict/);
  });
});
