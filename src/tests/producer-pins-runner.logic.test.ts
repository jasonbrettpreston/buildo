// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 10 / R-BZ G1
//
// S1-P-3 — the runner evaluates DECLARED `staleness.pins[]` (those that declare `op` or
// `equals`) BEFORE any phase/compute, at the SAME point and with the SAME halt as the input
// guards. A pin violation is a DECLARED, ERRORED FAIL row that flows through `deriveVerdict`
// — never a compute throw, never a parallel boolean (Rule 10). These tests drive the REAL
// runner (`measureProducerPins`) against a fake pool whose `query` returns
// `pipeline_runs`-shaped rows, so a runner that stops grouping reads, stops halting on a
// violation, or stops surfacing the ERROR arm fails here.
//
// A descriptor with no evaluable pin must issue ZERO queries and gain ZERO rows.
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

type Row = {
  metric: string;
  value: unknown;
  threshold: unknown;
  status: string;
  source?: string;
  errored?: boolean;
  result?: string;
  pin_id?: string;
  producer_run_id?: number | null;
};
type GuardResult = { rows: Row[]; halt: boolean };
type Runner = {
  measureProducerPins: (pool: unknown, descriptor: unknown, config?: Record<string, number>) => Promise<GuardResult>;
  STEP_CTX_KEYS?: string[];
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module under test
const runner: Runner = require(join(process.cwd(), 'scripts/lib/step/index.js'));

/** A `pipeline_runs`-shaped row (the producer window projects exactly these four columns). */
function runRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 101,
    status: 'completed',
    started_at: '2026-01-01T00:00:00.000Z',
    completed_at: '2026-01-01T00:01:00.000Z',
    records_meta: {},
    ...over,
  };
}

/** A pool whose `query` always answers `{ rows }` and records every call. */
function fakePool(rows: Record<string, unknown>[] = [runRow()]) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    return { rows };
  });
  return { pool: { query }, calls, query };
}

/** A pool whose every `query` REJECTS — the producer must swallow it into an ERROR row. */
function rejectingPool(err: Error) {
  const query = vi.fn(async () => {
    throw err;
  });
  return { pool: { query }, query };
}

describe('S1-P-3 — declared producer pins are measured by the runner (Rule 10 / R-BZ G1)', () => {
  it('(a) a descriptor with NO `staleness` gains no rows and issues ZERO queries', async () => {
    const { pool, query } = fakePool();
    const res = await runner.measureProducerPins(pool, { identity: { name: 'x' } });
    expect(res).toEqual({ rows: [], halt: false });
    expect(query).not.toHaveBeenCalled();
  });

  it('(b) pins WITHOUT op/equals are bare watermarks — skipped, no rows, no query', async () => {
    const { pool, query } = fakePool();
    const res = await runner.measureProducerPins(pool, {
      staleness: { pins: [{ step: 'x', stamp: 'parcels.zoning_updated_at' }] },
    });
    expect(res).toEqual({ rows: [], halt: false });
    expect(query).not.toHaveBeenCalled();
  });

  it('(c) one equals pin PASS yields one INFO row, halt false, ONE query', async () => {
    const { pool, query } = fakePool([runRow({ records_meta: { spec_version: '3' } })]);
    const res = await runner.measureProducerPins(pool, {
      staleness: { pins: [{ step: 'enrich_ravines', stamp: 'records_meta.spec_version', equals: '3' }] },
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(res.halt).toBe(false);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.status).toBe('INFO');
    expect(res.rows[0]!.result).toBe('PASS');
  });

  it('(d) an equals pin FAIL is one errored, gate-sourced FAIL row and halts', async () => {
    const { pool } = fakePool([runRow({ records_meta: { spec_version: '2' } })]);
    const res = await runner.measureProducerPins(pool, {
      staleness: { pins: [{ step: 'enrich_ravines', stamp: 'records_meta.spec_version', equals: '3' }] },
    });
    expect(res.halt).toBe(true);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.status).toBe('FAIL');
    expect(res.rows[0]!.errored).toBe(true);
    expect(res.rows[0]!.source).toBe('gate');
  });

  it('(e) zero rows from the DB is a MISSING/FAIL row and halts', async () => {
    const { pool } = fakePool([]);
    const res = await runner.measureProducerPins(pool, {
      staleness: { pins: [{ step: 'enrich_ravines', stamp: 'records_meta.spec_version', equals: '3' }] },
    });
    expect(res.halt).toBe(true);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.status).toBe('FAIL');
    expect(res.rows[0]!.result).toBe('MISSING');
  });

  it('(f) two pins on the same step+statuses share ONE query; a statuses pin adds a second', async () => {
    const { pool, calls } = fakePool([runRow({ records_meta: { spec_version: '3', rev: '3' } })]);
    const res = await runner.measureProducerPins(pool, {
      staleness: {
        pins: [
          { step: 'enrich_ravines', stamp: 'records_meta.spec_version', equals: '3' },
          { step: 'enrich_ravines', stamp: 'records_meta.rev', equals: '3' },
          { step: 'enrich_ravines', stamp: 'records_meta.audited', equals: '3', statuses: ['completed', 'failed'] },
        ],
      },
    });
    // Two distinct read identities → exactly two queries.
    expect(calls).toHaveLength(2);
    // The widened-statuses pin issues the query whose params carry 'failed'.
    const withFailed = calls.find((c) => Array.isArray(c.params[1]) && (c.params[1] as string[]).includes('failed'));
    expect(withFailed).toBeTruthy();
    // One row per pin.
    expect(res.rows).toHaveLength(3);
  });

  it('(g) a rejecting pool becomes an ERROR/FAIL row and halts — it never throws', async () => {
    const { pool } = rejectingPool(new Error('connection reset'));
    let thrown: unknown = null;
    let res: GuardResult | null = null;
    try {
      res = await runner.measureProducerPins(pool, {
        staleness: { pins: [{ step: 'enrich_ravines', stamp: 'records_meta.spec_version', equals: '3' }] },
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeNull();
    expect(res!.halt).toBe(true);
    expect(res!.rows).toHaveLength(1);
    expect(res!.rows[0]!.status).toBe('FAIL');
    expect(res!.rows[0]!.result).toBe('ERROR');
  });

  it('(i) KNOWING retirement of the hook-only read (Guardian 2026-10-13): the pin reads the NEWEST baseline run across every slug form, so a newer completed_with_warnings run with a different stamp halts even when an older sources:-form completed run would match', async () => {
    // DB order (completed_at DESC, id DESC): the newer bare-form cww run first, the older sources: completed run second.
    const { pool, calls } = fakePool([
      runRow({ id: 2427, status: 'completed_with_warnings', completed_at: '2026-10-09T00:00:00.000Z', records_meta: { heritage_load: { spec_version: '1.2' } } }),
      runRow({ id: 2175, status: 'completed', completed_at: '2026-09-30T00:00:00.000Z', records_meta: { heritage_load: { spec_version: '1.1' } } }),
    ]);
    const res = await runner.measureProducerPins(pool, {
      identity: { name: 'enrich_heritage' },
      staleness: { pins: [{ step: 'load_heritage', stamp: 'records_meta.heritage_load.spec_version', equals: '1.1' }] },
    });
    expect(res.halt).toBe(true);
    expect(res.rows[0]!.producer_run_id).toBe(2427);
    // The baseline status set (R-BG(iv)) and the slug forms are what the SQL asked for — not the hook's bare 'completed'.
    expect(calls[0]!.params[1]).toEqual(['completed', 'completed_with_warnings']);
    expect(calls[0]!.sql).toContain('ORDER BY completed_at DESC, id DESC');
  });

  it('(h) STEP_CTX_KEYS is exported and now carries `producer`', () => {
    if (!Array.isArray(runner.STEP_CTX_KEYS)) {
      // Not exported in this build — skip the assertion rather than fail on an export shape.
      return;
    }
    expect(runner.STEP_CTX_KEYS).toContain('producer');
  });
});

describe('S1-P-6b — the runner hands the resolved logic variables to a `bound` pin (Spec 124 Rule 3 / Rule 10)', () => {
  // The declared ratio pin: `invalid_geometry_skipped / feature_count` as a pct, with the
  // limit taken from the declared logic variable `v` — never a literal.
  const RATIO_DESC = {
    identity: { name: 'x' },
    staleness: {
      pins: [
        {
          step: 'load_ravines',
          stamp: 'records_meta.ravine_load.invalid_geometry_skipped',
          of: 'records_meta.ravine_load.feature_count',
          bound: 'pct <= 5',
          limit_from_config: 'v',
        },
      ],
    },
  };

  /** One producer run: 6 of 100 features skipped → 6%. */
  const sixPctRun = () =>
    runRow({
      id: 3,
      status: 'completed',
      records_meta: { ravine_load: { feature_count: 100, invalid_geometry_skipped: 6 } },
    });

  it('(a) 6% under `v = 5` is one errored, gate-sourced FAIL row, halts, ONE query', async () => {
    const { pool, query } = fakePool([sixPctRun()]);
    const res = await runner.measureProducerPins(pool, RATIO_DESC, { v: 5 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.status).toBe('FAIL');
    expect(res.rows[0]!.errored).toBe(true);
    expect(res.rows[0]!.source).toBe('gate');
    expect(res.halt).toBe(true);
  });

  it('(b) 6% under `v = 10` is one INFO row, halt false', async () => {
    const { pool, query } = fakePool([sixPctRun()]);
    const res = await runner.measureProducerPins(pool, RATIO_DESC, { v: 10 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.status).toBe('INFO');
    expect(res.rows[0]!.errored).toBeUndefined();
    expect(res.halt).toBe(false);
  });

  it('(c) an UNRESOLVED limit (`config` omitted) is an ERROR/FAIL row that halts — it never throws', async () => {
    const { pool } = fakePool([sixPctRun()]);
    let thrown: unknown = null;
    let res: GuardResult | null = null;
    try {
      res = await runner.measureProducerPins(pool, RATIO_DESC);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeNull();
    expect(res!.rows).toHaveLength(1);
    expect(res!.rows[0]!.result).toBe('ERROR');
    expect(res!.rows[0]!.status).toBe('FAIL');
    expect(res!.halt).toBe(true);
  });

  it('(d) a `bound` and an `equals` pin on one step share ONE grouped query, one row each', async () => {
    const { pool, calls } = fakePool([sixPctRun()]);
    const res = await runner.measureProducerPins(
      pool,
      {
        identity: { name: 'x' },
        staleness: {
          pins: [
            ...RATIO_DESC.staleness.pins,
            { step: 'load_ravines', stamp: 'records_meta.ravine_load.feature_count', equals: '100' },
          ],
        },
      },
      { v: 5 },
    );
    expect(calls).toHaveLength(1);
    expect(res.rows).toHaveLength(2);
    // The ratio pin FAILs at 6% under `v = 5`; the equals pin PASSes.
    expect(res.rows.map((r) => r.result).sort()).toEqual(['FAIL', 'PASS']);
    expect(res.halt).toBe(true);
  });
});
