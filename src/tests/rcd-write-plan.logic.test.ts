// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-CD / Rule 10 / R-BZ G5
//
// S2-RCD-1 — the runner's half of Spec 124 R-CD: a compute MAY return `write_plan =
// {table, sql, rows, report_check}` and the RUNNER executes it here (one autocommit
// `pool.query(sql, params)` per row, txn_scope:"none": no BEGIN/COMMIT, no dedicated client),
// stopping at the FIRST failing row without throwing. The outcome is a DECLARED check's
// observation through `report` (Rule 10), never a compute-side DML and never a parallel
// boolean. A step whose compute returns no plan is untouched: zero queries, zero reports,
// `computeResult` not modified.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Outcome = { executed: number; updated: number; failed: boolean; error: string | null };
type Plan = { table: string; sql: string; rows: unknown[][]; report_check: string };
type ComputeResult = { write_plan?: unknown; records_meta?: Record<string, unknown> } | null;
type Report = (checkId: string, observation: { violations: number; detail: string | null }) => void;
type Log = { warn: (tag: string, msg: string) => void };
type Runner = {
  runWritePlan: (
    pool: unknown,
    computeResult: ComputeResult,
    report: Report,
    log: Log,
    tag: string,
  ) => Promise<Outcome | null>;
  executeWritePlan: (pool: unknown, plan: Plan) => Promise<Outcome>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module under test
const runner: Runner = require(join(process.cwd(), 'scripts/lib/step/index.js'));

const TAG = '[t]';
const PLAN: Plan = {
  table: 'engine_health_snapshots',
  sql: 'INSERT x RETURNING xmax',
  rows: [['a', 1], ['b', 2], ['c', 3]],
  report_check: 'engine_health_write_failed',
};

function fakePool() {
  return { query: vi.fn() };
}

describe('runWritePlan — Spec 124 R-CD', () => {
  it('a. a null computeResult runs nothing', async () => {
    const pool = fakePool();
    const report = vi.fn();
    const log = { warn: vi.fn() };
    const outcome = await runner.runWritePlan(pool, null, report, log, TAG);
    expect(outcome).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('b. a computeResult with no write_plan runs nothing and leaves records_meta alone', async () => {
    const pool = fakePool();
    const report = vi.fn();
    const log = { warn: vi.fn() };
    const computeResult: ComputeResult = { records_meta: { k: 1 } };
    const outcome = await runner.runWritePlan(pool, computeResult, report, log, TAG);
    expect(outcome).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
    expect(computeResult!.records_meta).toEqual({ k: 1 });
  });

  it('c. executes one query per row and counts xmax != 0 as updated', async () => {
    const pool = fakePool();
    pool.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ xmax: '0' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ xmax: '5' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ xmax: '7' }] });
    const report = vi.fn();
    const log = { warn: vi.fn() };
    const computeResult: ComputeResult = { write_plan: PLAN, records_meta: { tables_checked: 3 } };
    const outcome = await runner.runWritePlan(pool, computeResult, report, log, TAG);
    expect(outcome).toEqual({ executed: 3, updated: 2, failed: false, error: null });
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(pool.query).toHaveBeenNthCalledWith(1, 'INSERT x RETURNING xmax', ['a', 1]);
    expect(pool.query).toHaveBeenNthCalledWith(2, 'INSERT x RETURNING xmax', ['b', 2]);
    expect(pool.query).toHaveBeenNthCalledWith(3, 'INSERT x RETURNING xmax', ['c', 3]);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('engine_health_write_failed', { violations: 0, detail: null });
    expect(log.warn).not.toHaveBeenCalled();
    expect(computeResult!.records_meta).toEqual({ tables_checked: 3, records_updated: 2 });
  });

  it('d. rowCount 0 / no rows counts as not-updated without throwing', async () => {
    const pool = fakePool();
    pool.query.mockResolvedValue({ rowCount: 0, rows: [] });
    const report = vi.fn();
    const log = { warn: vi.fn() };
    const computeResult: ComputeResult = { write_plan: PLAN, records_meta: {} };
    const outcome = await runner.runWritePlan(pool, computeResult, report, log, TAG);
    expect(outcome).toEqual({ executed: 3, updated: 0, failed: false, error: null });
    expect(report).toHaveBeenCalledWith('engine_health_write_failed', { violations: 0, detail: null });
  });

  it('e. a failing row stops the loop, reports violations:1 and warns once', async () => {
    const pool = fakePool();
    pool.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ xmax: '4' }] })
      .mockRejectedValueOnce(new Error('boom'));
    const report = vi.fn();
    const log = { warn: vi.fn() };
    const computeResult: ComputeResult = { write_plan: PLAN, records_meta: {} };
    const outcome = await runner.runWritePlan(pool, computeResult, report, log, TAG);
    expect(outcome).toEqual({ executed: 1, updated: 1, failed: true, error: 'boom' });
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('engine_health_write_failed', { violations: 1, detail: 'boom' });
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith('[t]', 'Could not write engine_health_snapshots: boom');
    expect(computeResult!.records_meta!.records_updated).toBe(1);
  });

  it('f. an empty plan rows array issues zero queries but still reports', async () => {
    const pool = fakePool();
    const report = vi.fn();
    const log = { warn: vi.fn() };
    const computeResult: ComputeResult = { write_plan: { ...PLAN, rows: [] } };
    const outcome = await runner.runWritePlan(pool, computeResult, report, log, TAG);
    expect(outcome).toEqual({ executed: 0, updated: 0, failed: false, error: null });
    expect(pool.query).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('engine_health_write_failed', { violations: 0, detail: null });
    expect(computeResult!.records_meta).toEqual({ records_updated: 0 });
  });

  it('g. a malformed plan is a compute defect and throws', async () => {
    const malformed = [
      { ...PLAN, sql: '' },
      { ...PLAN, rows: 'x' },
      { ...PLAN, rows: [1] },
      { ...PLAN, report_check: undefined },
      { ...PLAN, table: undefined },
    ];
    for (const bad of malformed) {
      const pool = fakePool();
      const report = vi.fn();
      const log = { warn: vi.fn() };
      await expect(
        runner.runWritePlan(pool, { write_plan: bad }, report, log, TAG),
      ).rejects.toThrow(/malformed write_plan/);
      expect(pool.query).not.toHaveBeenCalled();
      expect(report).not.toHaveBeenCalled();
    }
  });

  it('h. a throwing report (undeclared check id) is not swallowed', async () => {
    const pool = fakePool();
    pool.query.mockResolvedValue({ rowCount: 0, rows: [] });
    const report = vi.fn(() => {
      throw new Error('undeclared');
    });
    const log = { warn: vi.fn() };
    await expect(
      runner.runWritePlan(pool, { write_plan: { ...PLAN, rows: [] } }, report, log, TAG),
    ).rejects.toThrow('undeclared');
  });

  it('i. the runner calls runWritePlan between compute and the pre_write merge', () => {
    const src = readFileSync(join(process.cwd(), 'scripts/lib/step/index.js'), 'utf8');
    const call = 'await runWritePlan(pool, computeResult,';
    const compute = 'await runnable.compute(stepCtx)';
    const merge = 'for (const id of Object.keys(preWriteObserved))';
    expect(src.split(call).length - 1).toBe(1);
    const at = src.indexOf(call);
    expect(at).toBeGreaterThan(src.indexOf(compute));
    expect(at).toBeLessThan(src.indexOf(merge));
  });
});
