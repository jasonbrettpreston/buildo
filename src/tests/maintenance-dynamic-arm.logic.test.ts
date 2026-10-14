// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-CG — S2 F3-3, one dead-ratio measurement)
//
// `execution.maintenance` (EP-D17, WF3) has TWO arms and exactly ONE dead-tuple
// measurement shared by both (R-CG). The STATIC arm names a fixed `table`; the DYNAMIC
// arm (`select:"dead_tuple_ratio"`, Spec 124 S2 F3-3) names a `limit_from_config` logic
// variable and selects its targets at run time — every public table with `n_live_tup > 0`
// whose dead-tuple ratio STRICTLY exceeds that variable — writing ONE
// `sys_maintenance_selected_<op>` evidence row for the selection, EVEN when nothing is
// selected (a zero-selected run and a "the measurement never happened" run must never
// read alike). These are fixture-level (no DB): a fake pool/client records the SQL the
// seam issues, so the selection, the threshold gate, and the per-target statement are
// asserted rather than inferred.
//
// Case (6) pins the loud-failure rule: a statement failure is a WARN row whose note says
// FAILED — never a silently-swallowed maintenance no-op.

import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { deadTupleRatio, runMaintenance } = require('../../scripts/lib/step/plausibility.js') as {
  deadTupleRatio: (live: unknown, dead: unknown) => number;
  runMaintenance: (
    pool: unknown,
    maintenance: unknown,
    config: Record<string, unknown>,
    opts?: { log?: { warn: (tag: string, msg: string) => void; info?: (tag: string, msg: string) => void }; tag?: string },
  ) => Promise<Array<{ metric: string; value: unknown; threshold: unknown; status: string; note: string }>>;
};

const TAG = '[maintenance]';

/**
 * A fake pg pool: `pool.query()` answers the catalog measurement with STAT_ROWS,
 * and `pool.connect()` hands back a single autocommit client that records every SQL
 * string it is handed (SET statement_timeout + the VACUUM/ANALYZE itself).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function fakePool(STAT_ROWS: unknown[], opts: { vacuumRejects?: boolean } = {}) {
  const client: any = {
    queries: [] as string[],
    query: vi.fn(async (s: string) => {
      client.queries.push(s);
      if (opts.vacuumRejects && s.includes('VACUUM')) throw new Error('canceling statement due to statement timeout');
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = {
    query: vi.fn(async (_sql: string) => ({ rows: STAT_ROWS })),
    connect: vi.fn(async () => client),
  };
  return { pool, client };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function fakeLog() {
  return { warn: vi.fn(), info: vi.fn() };
}

describe('deadTupleRatio — the ONE dead-tuple measurement (R-CG)', () => {
  it('is dead / (live + dead), 4 decimals, and 0 when both are 0', () => {
    expect(deadTupleRatio(90, 10)).toBe(0.1);
    expect(deadTupleRatio(0, 0)).toBe(0);
    expect(deadTupleRatio(100, 0)).toBe(0);
    expect(deadTupleRatio(1, 3)).toBe(0.75);
  });

  it('coerces string catalog counters the same way (n_live_tup::bigint arrives as text)', () => {
    expect(deadTupleRatio('90', '10')).toBe(0.1);
  });
});

describe('runMaintenance — the DYNAMIC arm (select:"dead_tuple_ratio", R-CG)', () => {
  const ENTRY = {
    operation: 'vacuum_analyze',
    select: 'dead_tuple_ratio',
    limit_from_config: 'x_max',
    why: {},
  };

  it('selects every public table whose ratio STRICTLY exceeds the variable, one row per target', async () => {
    const STAT_ROWS = [
      { relname: 'a', live: '90', dead: '10' }, // 0.1 — not > 0.1
      { relname: 'b', live: '80', dead: '20' }, // 0.2 — > 0.1
      { relname: 'c', live: '0', dead: '5' },   // n_live_tup = 0 — never a target
    ];
    const { pool, client } = fakePool(STAT_ROWS);
    const log = fakeLog();

    const rows = await runMaintenance(pool, [ENTRY], { x_max: 0.1 }, { log, tag: TAG });

    // ONE selection row + ONE statement row for the single selected table.
    expect(rows.length).toBe(2);

    expect(rows[0]).toMatchObject({
      metric: 'sys_maintenance_selected_vacuum_analyze',
      value: 1,
      threshold: 0.1,
      status: 'INFO',
    });
    expect(rows[1]!.metric).toBe('sys_maintenance_b_vacuum_analyze');
    expect(rows[1]!.status).toBe('INFO');

    expect(client.queries).toContain('VACUUM (ANALYZE) "b"');
    expect(client.queries.some((s: string) => /SET statement_timeout = 900000/.test(s))).toBe(true);
    // 'a' is exactly AT the threshold (0.1 is not > 0.1); 'c' has no live tuples.
    expect(client.queries.some((s: string) => s.includes('"a"'))).toBe(false);
    expect(client.queries.some((s: string) => s.includes('"c"'))).toBe(false);

    expect(log.info).toHaveBeenCalledTimes(1);
  });

  it('writes exactly ONE green row when nothing is selected, and takes no client', async () => {
    const STAT_ROWS = [
      { relname: 'a', live: '90', dead: '10' }, // 0.1
      { relname: 'b', live: '80', dead: '20' }, // 0.2
    ];
    const { pool } = fakePool(STAT_ROWS);
    const log = fakeLog();

    const rows = await runMaintenance(pool, [ENTRY], { x_max: 0.5 }, { log, tag: TAG });

    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      metric: 'sys_maintenance_selected_vacuum_analyze',
      value: 0,
      threshold: 0.5,
      status: 'INFO',
    });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('a failed selector measurement is a loud WARN row, never a silent green', async () => {
    const { pool } = fakePool([]);
    pool.query.mockRejectedValueOnce(new Error('catalog read blew up'));
    const log = fakeLog();

    const rows = await runMaintenance(pool, [ENTRY], { x_max: 0.1 }, { log, tag: TAG });

    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ value: null, status: 'WARN' });
    expect(log.warn).toHaveBeenCalled();
  });

  it('an undeclared limit_from_config variable is a WARN row and never measures', async () => {
    const { pool } = fakePool([{ relname: 'b', live: '80', dead: '20' }]);
    const log = fakeLog();

    const rows = await runMaintenance(pool, [ENTRY], {}, { log, tag: TAG });

    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ threshold: null, status: 'WARN' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('a statement failure WARNs THAT table row and says FAILED', async () => {
    const STAT_ROWS = [{ relname: 'b', live: '80', dead: '20' }];
    const { pool } = fakePool(STAT_ROWS, { vacuumRejects: true });
    const log = fakeLog();

    const rows = await runMaintenance(pool, [ENTRY], { x_max: 0.1 }, { log, tag: TAG });

    expect(rows.length).toBe(2);
    expect(rows[0]!.status).toBe('INFO'); // the selection itself still measured fine
    expect(rows[1]!.metric).toBe('sys_maintenance_b_vacuum_analyze');
    expect(rows[1]!.status).toBe('WARN');
    expect(rows[1]!.note).toContain('FAILED');
    expect(log.warn).toHaveBeenCalled();
  });
});

describe('runMaintenance — the STATIC arm still works (one measurement, two consumers)', () => {
  it('runs the declared operation on the fixed table when its ratio exceeds its own tunable', async () => {
    const { pool, client } = fakePool([{ live: '60', dead: '40' }]);
    const log = fakeLog();

    const rows = await runMaintenance(
      pool,
      [{ operation: 'vacuum_analyze', table: 'parcels', owned_by: 'self', why: {} }],
      { parcels_dead_tuple_ratio_warn_max: 0.3 },
      { log, tag: TAG },
    );

    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      metric: 'sys_maintenance_parcels_vacuum_analyze',
      value: 0.4,
      status: 'INFO',
    });
    expect(client.queries).toContain('VACUUM (ANALYZE) "parcels"');
  });
});

describe('runMaintenance — the declared "none"', () => {
  it('is an empty row list, and touches nothing', async () => {
    const { pool } = fakePool([]);
    const rows = await runMaintenance(pool, 'none', {});
    expect(rows).toEqual([]);
  });
});
