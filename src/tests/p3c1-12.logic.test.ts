// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §2 row 2 (inputs: expect_nonempty · on_missing); registry-truth plan Phase 3 WIRE #12 (PLAN :238); FLEET-2 A-1 rulings 2026-10-03
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Row = { metric: string; value: unknown; threshold: unknown; status: string; source?: string; errored?: boolean };
type GuardResult = { rows: Row[]; halt: boolean };
type Runner = {
  measureInputGuards: (pool: unknown, descriptor: unknown) => Promise<GuardResult>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module under test
const runner: Runner = require(join(process.cwd(), 'scripts/lib/step/index.js'));

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

function countPool(counts: Record<string, number>) {
  const sql: string[] = [];
  return {
    sql,
    query: async (text: string) => {
      sql.push(text);
      const m = /COUNT\(\*\)::bigint AS n FROM (\w+)/.exec(text);
      if (m) return { rows: [{ n: String(counts[m[1]!] ?? 0) }] };
      return { rows: [] };
    },
  };
}

function d(over: Record<string, unknown> = {}) {
  return clone({
    identity: { name: 'fixture_step', archetype: 'ENRICHER' },
    inputs: {
      reads: {
        steps: [],
        tables: [
          { table: 'neighbourhoods', columns: ['id'] },
          { table: 'permits', columns: ['id'] },
          { table: 'parcels', columns: ['id'] },
        ],
        externals: [],
      },
      expect_nonempty: true,
      on_missing: 'halt',
      ...over,
    },
    outputs: { writes: [{ table: 'parcels' }] },
    guards: { empty_source: 'none' },
  });
}

describe('P3-C1 #12 — inputs.expect_nonempty / inputs.on_missing pre-compute guard', () => {
  it('N1 halt — an empty declared read table halts with an errored FAIL gate row', async () => {
    // RED today because `measureInputGuards` is not exported.
    const pool = countPool({ neighbourhoods: 0, permits: 5 });
    const res = await runner.measureInputGuards(pool, d());
    expect(res.halt).toBe(true);
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0]!;
    expect(row.metric).toBe('inputs_nonempty');
    expect(row.status).toBe('FAIL');
    expect(row.errored).toBe(true);
    expect(row.source).toBe('gate');
    expect(row.value).toBe('empty: neighbourhoods');
  });

  it('N2 warn — the same empty table yields a WARN gate row that does not halt', async () => {
    // RED today because `measureInputGuards` is not exported.
    const pool = countPool({ neighbourhoods: 0, permits: 5 });
    const res = await runner.measureInputGuards(pool, d({ on_missing: 'warn' }));
    expect(res.halt).toBe(false);
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0]!;
    expect(row.metric).toBe('inputs_nonempty');
    expect(row.status).toBe('WARN');
    expect(row.source).toBe('gate');
    expect(row.errored).toBeUndefined();
    expect(row.value).toBe('empty: neighbourhoods');
  });

  it('N3 run — the same empty table yields an INFO row and no halt', async () => {
    // RED today because `measureInputGuards` is not exported.
    const pool = countPool({ neighbourhoods: 0, permits: 5 });
    const res = await runner.measureInputGuards(pool, d({ on_missing: 'run' }));
    expect(res.halt).toBe(false);
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0]!;
    expect(row.status).toBe('INFO');
    expect(row.value).toBe('empty: neighbourhoods');
  });

  it('N4 clean — every counted table non-zero yields one INFO row carrying the counts', async () => {
    // RED today because `measureInputGuards` is not exported.
    const pool = countPool({ neighbourhoods: 3, permits: 5 });
    const res = await runner.measureInputGuards(pool, d());
    expect(res.halt).toBe(false);
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0]!;
    expect(row.status).toBe('INFO');
    expect(row.value).toEqual({ neighbourhoods: 3, permits: 5 });
  });

  it('N5 self-written table excluded — the step never counts the table it writes', async () => {
    // RED today because `measureInputGuards` is not exported.
    const pool = countPool({ neighbourhoods: 3, permits: 5, parcels: 0 });
    const res = await runner.measureInputGuards(pool, d());
    expect(res.halt).toBe(false);
    expect(pool.sql.some((s) => /FROM parcels/.test(s))).toBe(false);
    const counted = pool.sql
      .map((s) => /COUNT\(\*\)::bigint AS n FROM (\w+)/.exec(s)?.[1])
      .filter((t): t is string => Boolean(t))
      .sort();
    expect(counted).toEqual(['neighbourhoods', 'permits']);

    // A descriptor whose ONLY read table is the one it writes issues zero queries.
    const onlySelf = countPool({ parcels: 0 });
    const selfDescriptor = d({
      reads: { steps: [], tables: [{ table: 'parcels', columns: ['id'] }], externals: [] },
    });
    const res2 = await runner.measureInputGuards(onlySelf, selfDescriptor);
    expect(onlySelf.sql).toHaveLength(0);
    expect(res2).toEqual({ rows: [], halt: false });
  });

  it('N6 expect_nonempty false — no query and no row even when a read table is empty', async () => {
    // GREEN control on the guard's off-switch: no query, no row.
    const pool = countPool({ neighbourhoods: 0, permits: 0 });
    const res = await runner.measureInputGuards(pool, d({ expect_nonempty: false }));
    expect(pool.sql).toHaveLength(0);
    expect(res).toEqual({ rows: [], halt: false });
  });

  it('N7 runner wiring — measureInputGuards runs pre-dispatch and gates compute', () => {
    // RED today: the runner does not yet call `measureInputGuards`, dispatch on
    // `inputGuard.halt`, or gate `runnable.compute` behind it.
    const src = readFileSync(join(process.cwd(), 'scripts/lib/step/index.js'), 'utf8');
    const at = src.indexOf('async function runWithPool(');
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at);
    const guardAt = body.indexOf('measureInputGuards(');
    const dispatchAt = body.indexOf('} else if (isLinkStep(descriptor)) {');
    expect(guardAt).toBeGreaterThan(-1);
    expect(dispatchAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(dispatchAt);
    expect(body).toContain('inputGuard.halt');
    expect(body).toContain('if (inputGuard.halt) {');
    expect(body).toContain('inputGuard.halt ? null : await runnable.compute(stepCtx)');
  });
});
