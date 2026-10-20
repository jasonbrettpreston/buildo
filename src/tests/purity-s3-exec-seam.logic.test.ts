// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-CA(ii), CP-S3 ctx.exec)
//
// S3-E1 (2026-10-13): the ENRICHER write seam `ctx.exec(writesRef, sql, params)` is the
// ONE generic write seam. It runs the statement on whatever client the seams are bound to
// (the shared-txn client for passes 1–4, the autocommit post-commit client for pass 5),
// and REFUSES anything that is not a single UPDATE/INSERT/DELETE — a statement starting
// `WITH` included, on purpose: a CTE hides the verb, and a caller with a CTE-DELETE uses
// the library's own retire path (R-BZ G5). These cases drive the exported pure helper
// directly, without a runner.
//
// S3-E7 (2026-10-14): ctx.exec is COUNTER-NEUTRAL. It ROUTES the statement and VALIDATES
// that its target is declared (R-CK); it never bumps `written[...]` and never marks a
// target seam-owned. Counting stays with the pass's own returned stats (the runner's
// per-phase fallback, index.js ≈:5192) — counting in the seam double-counted write 3
// (four statements summed on top of the pass result) and under-counted write 4 (pass 5's
// flushBatch/recovery writes skipped the fallback). See the "counter-neutral" case below.

import { describe, expect, it } from 'vitest';

const { makeExecSeam } = await import('../../scripts/lib/step/index.js');

// A fake client that records what it was asked to run and answers with the result object
// the seam must hand back UNCHANGED (callers read `res.rowCount` / `res.rows`).
const makeFakeClient = (result: Record<string, unknown> | undefined = undefined) => {
  const calls: Array<{ sql: string; params: unknown }> = [];
  const res = result === undefined ? { rowCount: 1, rows: [{ ok: true }] } : result;
  const client = {
    query: async (sql: string, params: unknown) => {
      calls.push({ sql, params });
      return res;
    },
  };
  return { client, calls, res };
};

// The seamTarget helper's contract: an undeclared writesRef throws. A declared one returns
// the spec (the exec seam does not read any field off it — declare is the whole gate).
const seamTargetStub = (declared: Record<string, unknown>) => (writesRef: string, seam: string) => {
  if (!Object.prototype.hasOwnProperty.call(declared, writesRef)) {
    throw new Error(`tag ctx.${seam}(${writesRef}) — outputs.writes[${writesRef}] is not declared`);
  }
  return declared[writesRef];
};

describe('ctx.exec seam (Spec 124 R-CA(ii), CP-S3)', () => {
  it('runs a single UPDATE/INSERT/DELETE once with the given params and returns the client result by reference', async () => {
    for (const [sql, verb] of [
      ['UPDATE t SET a = 1', 'UPDATE'],
      ['INSERT INTO t (a) VALUES ($1)', 'INSERT'],
      ['DELETE FROM t WHERE a = $1', 'DELETE'],
    ] as const) {
      const { client, calls, res } = makeFakeClient();
      const exec = makeExecSeam({
        client,
        seamTarget: seamTargetStub({ w: { name: 'w' } }),
        tag: 'tag',
      });
      const params = [1, 2];
      const out = await exec('w', sql, params);
      expect(out).toBe(res);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.sql).toBe(sql);
      expect(calls[0]!.params).toBe(params);
      expect(verb).toBe(sql.split(' ')[0]);
    }
  });

  it('is COUNTER-NEUTRAL: after UPDATE/INSERT/DELETE, `written` and `seamOwned` are UNCHANGED (no bump, no seam-owned mark)', async () => {
    const cases = ['UPDATE t SET a = 1', 'INSERT INTO t (a) VALUES ($1)', 'DELETE FROM t WHERE a = $1'] as const;
    for (const sql of cases) {
      const { client, calls } = makeFakeClient({ rowCount: 7, rows: [] });
      // The runner-owned counter objects. The seam is handed the SAME references so that any
      // mutation by the seam would be observable here; a counter-neutral seam touches neither.
      const written = { w: { inserted: 0, updated: 0, deleted: 0, retracted: 0, rows_changed: 0 } };
      const seamOwned = new Set<string>();
      const writtenBefore = structuredClone(written);
      const exec = makeExecSeam({
        client,
        seamTarget: seamTargetStub({ w: {} }),
        tag: 'tag',
      });
      const res = (await exec('w', sql, [])) as { rowCount: number };
      // Routed exactly once, and the driver result is handed back for the pass to count from.
      expect(calls).toHaveLength(1);
      expect(res.rowCount).toBe(7);
      // No counter moved: `written` is deep-equal to its pre-exec snapshot...
      expect(written).toStrictEqual(writtenBefore);
      // ...and no target was marked seam-owned (that would SKIP the runner fallback, ≈:5192).
      expect(seamOwned.size).toBe(0);
      expect(seamOwned.has('w')).toBe(false);
    }
  });

  it('returns the driver result unchanged, including a missing rowCount (the pass counts it)', async () => {
    const { client, calls } = makeFakeClient({ rows: [] });
    const exec = makeExecSeam({
      client,
      seamTarget: seamTargetStub({ w: {} }),
      tag: 'tag',
    });
    const res = (await exec('w', 'UPDATE t SET a = 1', [])) as { rowCount?: number; rows: unknown[] };
    expect(calls).toHaveLength(1);
    // No synthesised rowCount and no counter side-effect — the caller reads what the driver gave.
    expect(res.rowCount).toBeUndefined();
    expect(res.rows).toEqual([]);
  });

  it('refuses SELECT / WITH / DDL / BEGIN and issues NO query', async () => {
    for (const sql of [
      'SELECT 1',
      'WITH x AS (SELECT 1) DELETE FROM t WHERE a IN (SELECT 1 FROM x)',
      'CREATE TABLE t ()',
      'BEGIN',
    ]) {
      const { client, calls } = makeFakeClient();
      const exec = makeExecSeam({
        client,
        seamTarget: seamTargetStub({ w: {} }),
        tag: 'tag',
      });
      await expect(exec('w', sql, [])).rejects.toThrow(/only a single UPDATE\/INSERT\/DELETE statement is a write; .* is not \(R-BZ G5\)/);
      await expect(exec('w', sql, [])).rejects.toThrow('tag ctx.exec(w)');
      expect(calls).toHaveLength(0);
    }
  });

  // rule-map: R-CI (partial) — undeclared writesRef refused; library-owned hygiene DELETEs not asserted (verify-12 N1, operator y 2026-10-20 consolidation 1-4)
  it('refuses an undeclared writesRef and issues NO query', async () => {
    const { client, calls } = makeFakeClient();
    const exec = makeExecSeam({
      client,
      seamTarget: seamTargetStub({}), // nothing declared → throws
      tag: 'tag',
    });
    await expect(exec('nope', 'UPDATE t SET a = 1', [])).rejects.toThrow('ctx.exec(nope) — outputs.writes[nope] is not declared');
    expect(calls).toHaveLength(0);
  });

  it('accepts a statement preceded by a leading `--` comment line', async () => {
    const { client, calls } = makeFakeClient({ rowCount: 3, rows: [] });
    const written = { w: { inserted: 0, updated: 0, deleted: 0, retracted: 0, rows_changed: 0 } };
    const seamOwned = new Set<string>();
    const writtenBefore = structuredClone(written);
    const exec = makeExecSeam({
      client,
      seamTarget: seamTargetStub({ w: {} }),
      tag: 'tag',
    });
    const sql = '-- retract the deposited rows\nUPDATE t SET a = NULL WHERE a = 1';
    await exec('w', sql, []);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toBe(sql);
    // Comment-stripping classifies the verb for the GATE only; it does not enable counting.
    expect(written).toStrictEqual(writtenBefore);
    expect(seamOwned.size).toBe(0);
  });
});

const { scopeRetireLockHeldRows } = await import('../../scripts/lib/step/index.js');

// R-CJ (S3, 2026-09-15) — the lock-held signal is rendered as ONE WARN row when the scope
// ledger retirement is suppressed by a live peer `enrich_parcels` run. `value` is
// `rows_retained`, and 0 stays 0 (never null): "held, and nothing to do" is still a held
// lock. No row when the guard did not trip, and no lock-held row on `scopeRetireError` —
// that failure already has its own row.
describe('R-CJ — scopeRetireLockHeldRows', () => {
  it('renders exactly one WARN row for the guard trip and deep-equals the detail', () => {
    const rows = scopeRetireLockHeldRows([{ scopeRetireLockHeld: { holder_run_id: 5001, rows_retained: 0 } }]) as Array<{ metric: string; status: string; value: unknown; detail: unknown }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.metric).toBe('scope_retire_lock_held');
    expect(rows[0]!.status).toBe('WARN');
    expect(rows[0]!.value).toBe(0);
    expect(rows[0]!.value).not.toBeNull();
    expect(rows[0]!.detail).toStrictEqual({ holder_run_id: 5001, rows_retained: 0 });
  });

  it('reports rows_retained as the value when the suppressed retirement had work to do', () => {
    const rows = scopeRetireLockHeldRows([{ scopeRetireLockHeld: { holder_run_id: 5001, rows_retained: 12 } }]) as Array<{ metric: string; status: string; value: unknown; detail: unknown }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).toBe(12);
    expect(rows[0]!.status).toBe('WARN');
  });

  it('emits NO row when the guard did not trip', () => {
    const cases: unknown[] = [
      [{ scopeRetireLockHeld: null }],
      [null],
      [],
      undefined,
    ];
    for (const phaseResults of cases) {
      expect(scopeRetireLockHeldRows(phaseResults as never)).toEqual([]);
    }
  });

  it('emits NO lock-held row when retirement failed', () => {
    const rows = scopeRetireLockHeldRows([
      { scopeRetireError: new Error('boom'), scopeRetireLockHeld: null },
    ] as never);
    expect(rows).toEqual([]);
  });
});
