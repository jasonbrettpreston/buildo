// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.0-§1.1
//
// Pure-logic locks for `scripts/analysis/capture-rerun-proof.js` — the two-run
// `idempotent_rerun: "zero_writes"` proof. Covers the descriptor→table projection
// (strict vs drift_declared vs no claim at all), the POST-capture path predicate,
// the SQL builders' identifier validation, the decision table (including the
// "a measurement gap is never a pass" rule and the xmin-based rewrite probe's
// precedence over a plain row count) and `measureRerun`'s query ORDER against a
// fake pool. No DB, no network, no child process.
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const proof = require('../../scripts/analysis/capture-rerun-proof.js');
const {
  ZERO_WRITES,
  ANSWERS,
  TXID_SQL,
  COUNT_SQL,
  rewrittenSql,
  rerunTables,
  isPostCapturePath,
  rerunProofDecision,
  measureRerun,
} = proof;

/** One `outputs.writes[]` entry declaring `idempotent_rerun`. */
function target(table: string, idempotentRerun?: string) {
  return {
    table,
    key: 'id',
    write_discipline: {
      class: 'guarded_upsert',
      guard: 'is_distinct_from',
      ...(idempotentRerun === undefined ? {} : { idempotent_rerun: idempotentRerun }),
    },
  };
}

function descriptor(writes: unknown[], outputs: unknown = { writes }) {
  return { outputs };
}

// ── 1. the closed answer set ────────────────────────────────────────────────
describe('answer vocabulary', () => {
  it('ZERO_WRITES is the declared literal and ANSWERS is a frozen closed set', () => {
    expect(ZERO_WRITES).toBe('zero_writes');
    expect(ANSWERS).toEqual(['zero', 'rewrote', 'drift_declared']);
    expect(Object.isFrozen(ANSWERS)).toBe(true);
  });
});

// ── 2. rerunTables ──────────────────────────────────────────────────────────
describe('rerunTables', () => {
  it('includes only tables with a zero_writes target, sorted by table', () => {
    const d = descriptor([
      target('zeta_rows', ZERO_WRITES),
      target('alpha_rows', ZERO_WRITES),
      target('beta_rows', 'declared_drift'),
    ]);
    expect(rerunTables(d)).toEqual([
      { table: 'alpha_rows', mode: 'strict' },
      { table: 'zeta_rows', mode: 'strict' },
    ]);
  });

  it('mode is strict when EVERY target on the table is zero_writes', () => {
    const d = descriptor([target('parcel_buildings', ZERO_WRITES), target('parcel_buildings', ZERO_WRITES)]);
    expect(rerunTables(d)).toEqual([{ table: 'parcel_buildings', mode: 'strict' }]);
  });

  it('mode is drift_declared when another target on the SAME table declares drift', () => {
    const d = descriptor([target('parcel_buildings', ZERO_WRITES), target('parcel_buildings', 'declared_drift')]);
    expect(rerunTables(d)).toEqual([{ table: 'parcel_buildings', mode: 'drift_declared' }]);
  });

  it('a target with NO idempotent_rerun makes the table drift_declared (not proven zero_writes)', () => {
    const d = descriptor([target('parcel_buildings', ZERO_WRITES), target('parcel_buildings')]);
    expect(rerunTables(d)).toEqual([{ table: 'parcel_buildings', mode: 'drift_declared' }]);
  });

  it('outputs:"none", missing outputs and an empty writes list all yield []', () => {
    expect(rerunTables({ outputs: 'none' })).toEqual([]);
    expect(rerunTables({})).toEqual([]);
    expect(rerunTables(null)).toEqual([]);
    expect(rerunTables(undefined)).toEqual([]);
    expect(rerunTables(descriptor([]))).toEqual([]);
  });

  it('ignores malformed entries without throwing', () => {
    const d = descriptor([null, { table: 'ok_rows', write_discipline: { idempotent_rerun: ZERO_WRITES } }, { write_discipline: {} }]);
    expect(rerunTables(d)).toEqual([{ table: 'ok_rows', mode: 'strict' }]);
  });
});

// ── 3. isPostCapturePath ────────────────────────────────────────────────────
describe('isPostCapturePath', () => {
  it('returns the slug for a POST capture path', () => {
    expect(isPostCapturePath('docs/reports/golden/enrich_parcels/post/sources_run1.json')).toBe('enrich_parcels');
    expect(isPostCapturePath('/abs/repo/docs/reports/golden/compute_centroids/post/sources-full-forced-1.json'))
      .toBe('compute_centroids');
  });

  it('returns null for a PRE capture, an arbitrary path, or non-strings', () => {
    expect(isPostCapturePath('docs/reports/golden/enrich_parcels/pre/sources.json')).toBeNull();
    expect(isPostCapturePath('docs/reports/golden/enrich_parcels/post/nested/x.json')).toBeNull();
    expect(isPostCapturePath('docs/reports/golden/enrich_parcels/post/notes.txt')).toBeNull();
    expect(isPostCapturePath('docs/reports/golden/NotASlug/post/x.json')).toBeNull();
    expect(isPostCapturePath('')).toBeNull();
    expect(isPostCapturePath(undefined as unknown as string)).toBeNull();
  });

  it('normalises Windows backslashes', () => {
    expect(isPostCapturePath('docs\\reports\\golden\\link_massing\\post\\permits.json')).toBe('link_massing');
  });
});

// ── 4. SQL builders ─────────────────────────────────────────────────────────
describe('SQL builders', () => {
  it('COUNT_SQL counts the validated, quoted table', () => {
    expect(COUNT_SQL('parcels')).toBe('SELECT count(*)::bigint AS n FROM "parcels"');
  });

  it('rewrittenSql probes xmin newer than $1 with 32-bit wrap-safe modulo arithmetic', () => {
    const sql = rewrittenSql('parcels');
    expect(sql).toContain('FROM "parcels"');
    expect(sql).toContain('xmin::text::bigint >= 3');
    expect(sql).toContain('(xmin::text::bigint - $1::bigint + 4294967296) % 4294967296) < 2147483648');
    expect(sql).toContain('count(*)::bigint AS n');
  });

  it('TXID_SQL reads txid_current normalised into [0, 2^32)', () => {
    expect(TXID_SQL).toBe('SELECT (txid_current() % 4294967296)::bigint AS lo');
  });

  it('both builders reject an injection attempt instead of interpolating it', () => {
    for (const bad of ['parcels; drop', 'Parcels', '1parcels', 'public.parcels', 'parcels"', 'par cels', '']) {
      expect(() => rewrittenSql(bad), `rewrittenSql(${JSON.stringify(bad)})`).toThrow(/invalid table name/);
      expect(() => COUNT_SQL(bad), `COUNT_SQL(${JSON.stringify(bad)})`).toThrow(/invalid table name/);
    }
  });
});

// ── 5. rerunProofDecision ───────────────────────────────────────────────────
describe('rerunProofDecision', () => {
  const strict = [{ table: 'parcels', mode: 'strict' }];
  const okRun2 = { exit_code: 0, skipped: false };

  it('NOT_APPLICABLE when the descriptor declares no zero_writes target', () => {
    expect(rerunProofDecision({ tables: [], measured: {}, run2: null })).toEqual({
      answer: 'NOT_APPLICABLE',
      rows: [],
      reason: 'no zero_writes target',
    });
  });

  it('PASS on an idempotent rerun (0 rewritten, row delta 0)', () => {
    const out = rerunProofDecision({
      tables: strict,
      measured: { parcels: { rewritten: 0, rows_before: 100, rows_after: 100 } },
      run2: okRun2,
    });
    expect(out.answer).toBe('PASS');
    expect(out.rows).toEqual([{ table: 'parcels', mode: 'strict', answer: 'zero', rewritten: 0, row_delta: 0 }]);
  });

  it('FAIL naming the table and the count when a strict table rewrote 12 rows', () => {
    const out = rerunProofDecision({
      tables: strict,
      measured: { parcels: { rewritten: 12, rows_before: 100, rows_after: 100 } },
      run2: okRun2,
    });
    expect(out.answer).toBe('FAIL');
    expect(out.reason).toContain('parcels');
    expect(out.reason).toContain('12 row(s) rewritten');
    expect(out.rows[0]).toMatchObject({ table: 'parcels', answer: 'rewrote', rewritten: 12, row_delta: 0 });
  });

  it('FAIL on a row delta of -3 with 0 rewritten (a DELETE leaves no rewritten row)', () => {
    const out = rerunProofDecision({
      tables: strict,
      measured: { parcels: { rewritten: 0, rows_before: 100, rows_after: 97 } },
      run2: okRun2,
    });
    expect(out.answer).toBe('FAIL');
    expect(out.reason).toContain('row delta -3');
    expect(out.rows[0]).toMatchObject({ answer: 'rewrote', rewritten: 0, row_delta: -3 });
  });

  it('a drift_declared table is recorded with its counts and never proof — 500 rewritten still PASSes', () => {
    const out = rerunProofDecision({
      tables: [
        { table: 'parcel_buildings', mode: 'drift_declared' },
        { table: 'parcels', mode: 'strict' },
      ],
      measured: {
        parcel_buildings: { rewritten: 500, rows_before: 520492, rows_after: 520492 },
        parcels: { rewritten: 0, rows_before: 486530, rows_after: 486530 },
      },
      run2: okRun2,
    });
    expect(out.answer).toBe('PASS');
    const drift = out.rows.find((r: { table: string }) => r.table === 'parcel_buildings');
    expect(drift).toEqual({
      table: 'parcel_buildings',
      mode: 'drift_declared',
      answer: 'drift_declared',
      rewritten: 500,
      row_delta: 0,
    });
    expect(out.reason).toContain('parcel_buildings');
  });

  it('FAIL when run 2 exited non-zero, naming the exit code', () => {
    const out = rerunProofDecision({ tables: strict, measured: {}, run2: { exit_code: 1 } });
    expect(out.answer).toBe('FAIL');
    expect(out.reason).toContain('1');
    expect(out.rows).toEqual([]);
  });

  it('FAIL when run 2 self-skipped with a non-zero exit', () => {
    const out = rerunProofDecision({ tables: strict, measured: {}, run2: { exit_code: 137, skipped: true } });
    expect(out.answer).toBe('FAIL');
    expect(out.reason).toContain('137');
    expect(out.reason).toContain('skipped');
  });

  it('THROWS on a missing measurement — a gap is never a pass', () => {
    expect(() => rerunProofDecision({ tables: strict, measured: {}, run2: okRun2 }))
      .toThrow(/no measurement for table parcels/);
    expect(() => rerunProofDecision({ tables: strict, measured: { parcels: null }, run2: okRun2 }))
      .toThrow(/no measurement for table parcels/);
  });

  it('THROWS on NaN / Infinity / non-numeric measurements', () => {
    const cases = [
      { rewritten: NaN, rows_before: 100, rows_after: 100 },
      { rewritten: 0, rows_before: Infinity, rows_after: 100 },
      { rewritten: 0, rows_before: 100, rows_after: '100' },
      { rewritten: null, rows_before: 100, rows_after: 100 },
    ];
    for (const measured of cases) {
      expect(() => rerunProofDecision({ tables: strict, measured: { parcels: measured }, run2: okRun2 }))
        .toThrow(/not a finite number/);
    }
  });

  it('every emitted row answer is inside the closed ANSWERS set', () => {
    const out = rerunProofDecision({
      tables: [
        { table: 'a', mode: 'strict' },
        { table: 'b', mode: 'drift_declared' },
      ],
      measured: {
        a: { rewritten: 1, rows_before: 1, rows_after: 1 },
        b: { rewritten: 0, rows_before: 1, rows_after: 1 },
      },
      run2: okRun2,
    });
    for (const row of out.rows) expect(ANSWERS).toContain(row.answer);
  });
});

// ── 6. measureRerun ─────────────────────────────────────────────────────────
describe('measureRerun', () => {
  /** A fake pool recording every query, answering by statement shape. */
  function fakePool(values: { count: number[]; lo: number; rewritten: number[] }) {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    let countIx = 0;
    let rewrittenIx = 0;
    return {
      calls,
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (sql === TXID_SQL) return { rows: [{ lo: String(values.lo) }] };
        if (sql.includes('xmin')) return { rows: [{ n: String(values.rewritten[rewrittenIx++]) }] };
        if (sql.startsWith('SELECT count(*)')) return { rows: [{ n: String(values.count[countIx++]) }] };
        throw new Error(`unexpected SQL: ${sql}`);
      }),
    };
  }

  it('never calls runSecond when there is no zero_writes table to prove', async () => {
    const pool = fakePool({ count: [], lo: 0, rewritten: [] });
    const runSecond = vi.fn(async () => ({ exit_code: 0 }));
    const out = await measureRerun(pool, [], runSecond);
    expect(runSecond).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
    expect(out).toEqual({ measured: {}, run2: null, lo: null });
  });

  it('orders count → txid → runSecond → xmin/count per table, all compared to ONE txid', async () => {
    const pool = fakePool({ count: [100, 486530, 100, 486530], lo: 987654, rewritten: [0, 0] });
    const events: string[] = [];
    pool.calls.push = new Proxy(pool.calls.push, {
      apply: (t, thisArg, args) => {
        events.push(String(args[0].sql));
        return Reflect.apply(t, thisArg, args);
      },
    }) as typeof pool.calls.push;
    const runSecond = vi.fn(async () => {
      events.push('RUN_SECOND');
      return { exit_code: 0, skipped: false };
    });

    const tables = [{ table: 'parcels' }, { table: 'wsib_registry' }];
    const out = await measureRerun(pool, tables, runSecond);

    const kinds = events.map((e) => (e === 'RUN_SECOND' ? e : e === TXID_SQL ? 'txid' : e.includes('xmin') ? 'xmin' : 'count'));
    expect(kinds).toEqual([
      'count', // parcels.rows_before
      'count', // wsib_registry.rows_before
      'txid',
      'RUN_SECOND',
      'xmin', // parcels.rewritten
      'count', // parcels.rows_after
      'xmin', // wsib_registry.rewritten
      'count', // wsib_registry.rows_after
    ]);

    // The txid is read exactly once and every xmin probe is bound to it.
    expect(events.filter((e) => e === TXID_SQL)).toHaveLength(1);
    for (const call of pool.calls.filter((c) => c.sql.includes('xmin'))) {
      expect(call.params).toEqual([987654]);
    }

    expect(out.lo).toBe(987654);
    expect(out.run2).toEqual({ exit_code: 0, skipped: false });
    expect(out.measured).toEqual({
      parcels: { rewritten: 0, rows_before: 100, rows_after: 100 },
      wsib_registry: { rewritten: 0, rows_before: 486530, rows_after: 486530 },
    });
    expect(typeof out.measured.parcels.rewritten).toBe('number');
  });

  it('feeds a rewrote measurement straight into a FAIL decision (end-to-end, no DB)', async () => {
    const pool = fakePool({ count: [100, 100], lo: 5, rewritten: [12] });
    const out = await measureRerun(pool, rerunTables(descriptor([target('parcels', ZERO_WRITES)])), async () => ({
      exit_code: 0,
    }));
    const decision = rerunProofDecision({ tables: rerunTables(descriptor([target('parcels', ZERO_WRITES)])), ...out });
    expect(decision.answer).toBe('FAIL');
    expect(decision.reason).toContain('12 row(s) rewritten');
  });
});
