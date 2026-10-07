// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.3
// SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §3.2b (run-status vocabulary: `captured`)
//
// WF3 capture-ledger gap (.cursor/wf3_capture_ledger_gap_active_task.md): pure locks L1, L2, L2b,
// L4, L8 over `scripts/analysis/capture-ledger.js`. A capture used to write real data with NO
// pipeline_runs row (in-chain the step never owns one; a legacy standalone step writes none). The
// recorder writes ONE row per spawned run, status `captured` (never a baseline, always upstream
// activity), or STAMPS the row the step wrote itself in a standalone run. Fake pool; no DB.
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Loaded lazily so each lock reds on its own while the module does not exist (gate K evidence).
const L = () => require('../../scripts/analysis/capture-ledger.js');

const T0 = '2026-10-06T10:00:00.000Z';
const T1 = '2026-10-06T10:00:05.000Z';
const MID = '2026-10-06T10:00:01.000Z';
const CTX = { slug: 'refresh_snapshot', harness: 'scripts/analysis/capture-step-golden.js', out: 'x.json', git_head: 'abc', worktree_dirty: false, descriptor: null };

function entry(over: Record<string, unknown> = {}) {
  return {
    run: 1, kind: 'pre', chain: 'sources', maxIdBefore: 100, started_at: T0, completed_at: T1,
    child: {
      exit_code: 0, signal: null, stderr: '',
      summary: { records_total: 5, records_new: 1, records_updated: 2, records_meta: { audit_table: { verdict: 'PASS', rows: [] }, ledger_row: 'chain_owned' } },
      meta: [{ reads: ['a'] }, { writes: ['b'] }],
    },
    ...over,
  };
}

const isInsert = (sql: string) => /INSERT INTO pipeline_runs/.test(sql);
const isOwnLookup = (sql: string) => /^SELECT id, pipeline/.test(sql.trim());

/** A fake pg pool: records every query; `own` = rows returned by the own-row lookup. */
function fakePool({ own = [] as unknown[], failOn = null as RegExp | null } = {}) {
  const calls: Array<{ sql: string; params?: unknown[] | undefined }> = [];
  let nextId = 500;
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (failOn && failOn.test(sql)) throw new Error('boom: ' + sql.slice(0, 30));
      if (isOwnLookup(sql)) return { rows: own };
      if (isInsert(sql)) return { rows: [{ id: nextId++ }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn(async () => client), end: vi.fn(async () => {}), query: client.query };
  return { pool, client, calls };
}

describe('L1: harnessRunRow writes status `captured`, the bare slug, verbatim counters and a closed child_status', () => {
  it('always writes status captured and the bare slug, never <chain>:<slug>', () => {
    const row = L().harnessRunRow(entry(), CTX);
    expect(row.status).toBe('captured');
    expect(L().CAPTURED).toBe('captured');
    expect(row.pipeline).toBe('refresh_snapshot');
  });

  it('copies counters verbatim and NULLs them (never 0) when there is no summary', () => {
    const row = L().harnessRunRow(entry(), CTX);
    expect([row.records_total, row.records_new, row.records_updated]).toEqual([5, 1, 2]);
    const bare = L().harnessRunRow(entry({ child: { exit_code: 0, signal: null, stderr: '', summary: null, meta: [] } }), CTX);
    expect([bare.records_total, bare.records_new, bare.records_updated]).toEqual([null, null, null]);
  });

  it('records_meta = child records_meta + last PIPELINE_META + the capture stamp', () => {
    const row = L().harnessRunRow(entry(), CTX);
    expect(row.records_meta.audit_table).toEqual({ verdict: 'PASS', rows: [] });
    expect(row.records_meta.pipeline_meta).toEqual({ writes: ['b'] });
    expect(row.records_meta.capture).toMatchObject({ recorded_by: 'harness', child_status: 'completed', exit_code: 0, chain: 'sources', run: 1, kind: 'pre', out: 'x.json', git_head: 'abc', worktree_dirty: false });
    expect(row.duration_ms).toBe(5000);
    expect(row.error_message).toBeNull();
  });

  it('child_status: a non-zero exit or a signal is failed (with an error_message); never crashed/running/captured', () => {
    const failed = L().harnessRunRow(entry({ child: { exit_code: 1, signal: null, stderr: 'line1\nERR: x', summary: null, meta: [] } }), CTX);
    expect(failed.status).toBe('captured');
    expect(failed.records_meta.capture.child_status).toBe('failed');
    expect(failed.error_message).toContain('ERR: x');
    const signalled = L().harnessRunRow(entry({ child: { exit_code: null, signal: 'SIGINT', stderr: '', summary: null, meta: [] } }), CTX);
    expect(signalled.records_meta.capture.child_status).toBe('failed');
    expect(L().CHILD_STATUSES).not.toContain('crashed');
    expect(L().CHILD_STATUSES).not.toContain('running');
    expect(L().CHILD_STATUSES).not.toContain('captured');
    expect(L().CHILD_STATUSES).toContain('self_skipped');
  });

  it('child_status: the descriptor terminal the child stamped, when it names a known status', () => {
    const descriptor = { terminals: [{ id: 'recorded_with_warnings', status: 'completed_with_warnings' }, { id: 'bogus', status: 'not_a_status' }] };
    const warned = entry({ child: { exit_code: 0, signal: null, stderr: '', summary: { records_meta: { terminal: 'recorded_with_warnings' } }, meta: [] } });
    expect(L().harnessRunRow(warned, { ...CTX, descriptor }).records_meta.capture.child_status).toBe('completed_with_warnings');
    const bogus = entry({ child: { exit_code: 0, signal: null, stderr: '', summary: { records_meta: { terminal: 'bogus' } }, meta: [] } });
    expect(L().harnessRunRow(bogus, { ...CTX, descriptor }).records_meta.capture.child_status).toBe('completed');
  });

  it('captureKind and sessionEntry: closed kinds; the entry carries the window and the parsed markers', () => {
    expect(L().captureKind({ out: 'docs/reports/golden/x/post/sources.json', isPost: true, traceOnly: false })).toBe('post');
    expect(L().captureKind({ out: 'docs\\reports\\golden\\x\\pre\\sources.json', isPost: false, traceOnly: false })).toBe('pre');
    expect(L().captureKind({ out: 'docs/reports/golden/x/post/sources.json', isPost: false, traceOnly: true })).toBe('trace_only');
    expect(L().captureKind({ out: null, isPost: false, traceOnly: false })).toBe('adhoc');
    const e = L().sessionEntry({ run: 2, kind: 'post', chain: 'none', win: { maxIdBefore: 7, started_at: T0 }, completed_at: T1, child: { exit_code: 0, signal: null, stdout: 'x', stderr: 'e' }, markers: { summary: { records_total: 1 }, meta: [{ a: 1 }] } });
    expect(e).toEqual({ run: 2, kind: 'post', chain: 'none', maxIdBefore: 7, started_at: T0, completed_at: T1, child: { exit_code: 0, signal: null, stderr: 'e', summary: { records_total: 1 }, meta: [{ a: 1 }] } });
  });
});

describe('resolveLedgerSlug refuses a contradiction, an unresolved slug and an ambiguous manifest', () => {
  const manifest = { scripts: { refresh_snapshot: { file: 'scripts/refresh-snapshot.js' }, enrich_permits: { file: 'scripts/enrich-permits.js' }, enrich_coa_zoning: { file: 'scripts/enrich-permits.js' } } };
  it('manifest, descriptor and override agree -> the slug', () => {
    expect(L().resolveLedgerSlug({ stepRel: 'scripts/refresh-snapshot.js', manifest, descriptor: { identity: { name: 'refresh_snapshot' } }, override: null })).toBe('refresh_snapshot');
    expect(L().resolveLedgerSlug({ stepRel: 'scripts\\refresh-snapshot.js', manifest, descriptor: null, override: null })).toBe('refresh_snapshot');
    expect(L().resolveLedgerSlug({ stepRel: 'scripts/enrich-permits.js', manifest, descriptor: null, override: 'enrich_coa_zoning' })).toBe('enrich_coa_zoning');
    expect(L().resolveLedgerSlug({ stepRel: '../legacy/x.js', manifest, descriptor: null, override: 'compute_parcel_cost_estimates' })).toBe('compute_parcel_cost_estimates');
  });
  it('throws on a contradiction, on nothing, and on an ambiguous manifest with no override', () => {
    expect(() => L().resolveLedgerSlug({ stepRel: 'scripts/refresh-snapshot.js', manifest, descriptor: { identity: { name: 'other' } }, override: null })).toThrow(/contradiction/);
    expect(() => L().resolveLedgerSlug({ stepRel: 'scripts/refresh-snapshot.js', manifest, descriptor: null, override: 'other' })).toThrow(/contradiction/);
    expect(() => L().resolveLedgerSlug({ stepRel: 'scripts/nope.js', manifest, descriptor: null, override: null })).toThrow(/no ledger slug/);
    expect(() => L().resolveLedgerSlug({ stepRel: 'scripts/enrich-permits.js', manifest, descriptor: null, override: null })).toThrow(/ambiguous/);
  });
});

describe('L2 / L2b: in-chain INSERTs and never window-matches; a standalone run stamps the row the step wrote', () => {
  it('in-chain: 1 INSERT and no own-row lookup at all (a concurrent run-chain row can never be claimed)', async () => {
    const { pool, calls } = fakePool({ own: [{ id: 101, pipeline: 'refresh_snapshot', started_at: MID, records_meta: { ledger_row: 'owned' } }] });
    const rows = await L().flushSession([entry()], { pool, ctx: CTX });
    expect(rows).toEqual([{ id: 500, recorded_by: 'harness' }]);
    expect(calls.filter((c) => isInsert(c.sql))).toHaveLength(1);
    expect(calls.some((c) => isOwnLookup(c.sql))).toBe(false);
    const ins = calls.find((c) => isInsert(c.sql))!;
    expect(ins.params![0]).toBe('refresh_snapshot');
    expect(ins.params![1]).toBe('captured');
    expect(ins.sql).toMatch(/records_total, records_new, records_updated/); // explicit columns: the DB default 0 never substitutes
    expect(ins.sql).toMatch(/\$9::jsonb/);
  });

  it('standalone converted: the step-owned row is STAMPED (::jsonb, status untouched), 0 INSERT', async () => {
    const { pool, calls } = fakePool({ own: [{ id: 101, pipeline: 'refresh_snapshot', started_at: MID, records_meta: { ledger_row: 'owned' } }] });
    const rows = await L().flushSession([entry({ chain: 'none' })], { pool, ctx: CTX });
    expect(rows).toEqual([{ id: 101, recorded_by: 'step' }]);
    expect(calls.filter((c) => isInsert(c.sql))).toHaveLength(0);
    const upd = calls.find((c) => /UPDATE pipeline_runs/.test(c.sql))!;
    expect(upd.sql).toMatch(/jsonb_build_object\('capture', \$2::jsonb\)/);
    expect(upd.sql).not.toMatch(/status/); // never re-statused: EC-D10's ruling stands
    expect(JSON.parse(upd.params![1] as string)).toMatchObject({ recorded_by: 'step', run: 1 });
  });

  it('standalone legacy step that writes no row of its own: 1 INSERT', async () => {
    const { pool, calls } = fakePool({ own: [] });
    await L().flushSession([entry({ chain: 'none' })], { pool, ctx: CTX });
    expect(calls.filter((c) => isInsert(c.sql))).toHaveLength(1);
  });

  it('standalone: a single in-window row WITHOUT ledger_row (a legacy self-INSERT, or a crashed child\'s running row) is stamped, not duplicated', async () => {
    for (const records_meta of [null, { verdict: 'PASS' }]) {
      const { pool, calls } = fakePool({ own: [{ id: 103, pipeline: 'refresh_snapshot', started_at: MID, records_meta }] });
      expect(await L().flushSession([entry({ chain: 'none' })], { pool, ctx: CTX })).toEqual([{ id: 103, recorded_by: 'step' }]);
      expect(calls.filter((c) => isInsert(c.sql))).toHaveLength(0);
    }
  });

  it('several in-window rows: the single owned one wins; otherwise throw and roll back', async () => {
    const mixed = [{ id: 101, pipeline: 'refresh_snapshot', started_at: MID, records_meta: null }, { id: 102, pipeline: 'refresh_snapshot', started_at: MID, records_meta: { ledger_row: 'owned' } }];
    expect(L().ownRowFor({ rows: mixed, slug: 'refresh_snapshot', entry: entry({ chain: 'none' }) })).toBe(102);
    const own = [101, 102].map((id) => ({ id, pipeline: 'refresh_snapshot', started_at: MID, records_meta: { ledger_row: 'owned' } }));
    const { pool, calls } = fakePool({ own });
    await expect(L().flushSession([entry({ chain: 'none' })], { pool, ctx: CTX })).rejects.toThrow(/2 refresh_snapshot rows/);
    expect(calls.map((c) => c.sql)).toContain('ROLLBACK');
    expect(calls.map((c) => c.sql)).not.toContain('COMMIT');
  });

  it('L2b: run 1 and run 2 each resolve against their OWN maxIdBefore and window', () => {
    const r1 = entry({ chain: 'none', run: 1, maxIdBefore: 100, started_at: T0, completed_at: T1 });
    const r2 = entry({ chain: 'none', run: 2, maxIdBefore: 110, started_at: '2026-10-06T10:00:10.000Z', completed_at: '2026-10-06T10:00:15.000Z' });
    const rows = [
      { id: 105, pipeline: 'refresh_snapshot', started_at: MID, records_meta: { ledger_row: 'owned' } },
      { id: 111, pipeline: 'refresh_snapshot', started_at: '2026-10-06T10:00:11.000Z', records_meta: { ledger_row: 'owned' } },
      { id: 112, pipeline: 'sources:refresh_snapshot', started_at: '2026-10-06T10:00:11.000Z', records_meta: null },
    ];
    expect(L().ownRowFor({ rows, slug: 'refresh_snapshot', entry: r1 })).toBe(105);
    expect(L().ownRowFor({ rows, slug: 'refresh_snapshot', entry: r2 })).toBe(111);
    expect(L().ownRowFor({ rows, slug: 'refresh_snapshot', entry: { ...r2, chain: 'sources' } })).toBeNull();
  });
});

describe('L4: flushSession is a pool-free no-op when empty, memoised, and one transaction', () => {
  it('an empty session never creates a pool', async () => {
    const createPool = vi.fn();
    expect(await L().flushSession([], { createPool, ctx: CTX })).toEqual([]);
    expect(createPool).not.toHaveBeenCalled();
  });

  it('a second call is a no-op (the error-path finally can never double-insert)', async () => {
    const { pool, calls } = fakePool();
    const session: unknown[] = [entry(), entry({ run: 2 })];
    await L().flushSession(session, { pool, ctx: CTX });
    const n = calls.length;
    await L().flushSession(session, { pool, ctx: CTX });
    expect(calls.length).toBe(n);
    expect(calls.filter((c) => isInsert(c.sql))).toHaveLength(2);
    expect(calls[0]!.sql).toBe('BEGIN');
    expect(calls[calls.length - 1]!.sql).toBe('COMMIT');
  });

  it('two CONCURRENT calls share one transaction (a signal during the explicit flush cannot double-insert)', async () => {
    const { pool, calls } = fakePool();
    const session: unknown[] = [entry()];
    const [a, b] = await Promise.all([L().flushSession(session, { pool, ctx: CTX }), L().flushSession(session, { pool, ctx: CTX })]);
    expect(a).toEqual(b);
    expect(calls.filter((c) => isInsert(c.sql))).toHaveLength(1);
    expect(pool.connect).toHaveBeenCalledTimes(1);
  });

  it('a mid-flush failure rolls the WHOLE transaction back and throws', async () => {
    const { pool, calls, client } = fakePool({ failOn: /INSERT INTO pipeline_runs/ });
    await expect(L().flushSession([entry(), entry({ run: 2 })], { pool, ctx: CTX })).rejects.toThrow(/boom/);
    expect(calls.map((c) => c.sql)).toContain('ROLLBACK');
    expect(calls.map((c) => c.sql)).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('a pool it created itself is ended; an injected pool is not', async () => {
    const own = fakePool();
    await L().flushSession([entry()], { createPool: () => own.pool, ctx: CTX });
    expect(own.pool.end).toHaveBeenCalledTimes(1);
    const injected = fakePool();
    await L().flushSession([entry()], { pool: injected.pool, ctx: CTX });
    expect(injected.pool.end).not.toHaveBeenCalled();
  });

  it('flushAfterError: the error path records; a flush failure is logged, never thrown; no session is a no-op', async () => {
    const flush = vi.fn(async () => [{ id: 1, recorded_by: 'harness' }]);
    expect(await L().flushAfterError(flush, () => {})).toEqual([{ id: 1, recorded_by: 'harness' }]);
    const log = vi.fn();
    expect(await L().flushAfterError(async () => { throw new Error('flush db down'); }, log)).toBeNull();
    expect(log.mock.calls[0]![0]).toContain('flush db down');
    expect(await L().flushAfterError(null, log)).toBeNull();
  });
});

describe('L8: the SIGINT/SIGTERM latch keeps the harness alive until the interrupted run is recorded', () => {
  it('L8: a signal between runs latches (no flush, no exit); the error path then records run 1 once', async () => {
    const src = new EventEmitter();
    const { pool, calls } = fakePool();
    const session: unknown[] = [entry()];
    const reraise = vi.fn();
    const flush = () => L().flushSession(session, { pool, ctx: CTX });
    const latch = L().installSignalLatch({ signalSource: src, flush, reraise, log: () => {} });
    src.emit('SIGINT');
    expect(latch.latched()).toBe('SIGINT');
    expect(reraise).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0); // the first signal never writes
    await L().flushAfterError(flush, () => {});
    expect(calls.filter((c) => isInsert(c.sql))).toHaveLength(1);
    latch.dispose();
    expect(src.listenerCount('SIGINT')).toBe(0);
    expect(src.listenerCount('SIGTERM')).toBe(0);
  });

  it('L8b: a signal MID-SPAWN records that run exactly once (latch while in flight; the run is appended after the child exits)', async () => {
    const src = new EventEmitter();
    const { pool, calls } = fakePool();
    const session: unknown[] = [];
    const flush = () => L().flushSession(session, { pool, ctx: CTX });
    const latch = L().installSignalLatch({ signalSource: src, flush, reraise: vi.fn(), log: () => {} });
    src.emit('SIGINT'); // child still running: session is empty, nothing is flushed
    expect(calls).toHaveLength(0);
    session.push(entry({ child: { exit_code: null, signal: 'SIGINT', stderr: '', summary: null, meta: [] } })); // the child exits on the same console signal
    await L().flushAfterError(flush, () => {});
    await flush();
    const inserts = calls.filter((c) => isInsert(c.sql));
    expect(inserts).toHaveLength(1);
    expect(JSON.parse(inserts[0]!.params![8] as string).capture.child_status).toBe('failed');
    latch.dispose();
  });

  it('a second signal flushes what the session holds, then re-raises', async () => {
    const src = new EventEmitter();
    const { pool, calls } = fakePool();
    const session: unknown[] = [entry()];
    const reraise = vi.fn();
    L().installSignalLatch({ signalSource: src, flush: () => L().flushSession(session, { pool, ctx: CTX }), reraise, log: () => {} });
    src.emit('SIGTERM');
    src.emit('SIGTERM');
    await vi.waitFor(() => expect(reraise).toHaveBeenCalledWith('SIGTERM'));
    expect(calls.filter((c) => isInsert(c.sql))).toHaveLength(1);
  });
});

describe('OUTPUT-roster #1/#2: a failed clock read never drops a run; a lock skip is self_skipped', () => {
  it('#1 closeWindow never rejects: a failed clock read is logged, returns null, and the entry is still pushed', async () => {
    const log = vi.fn();
    const pool = { query: vi.fn(async () => { throw new Error('conn reset'); }) };
    const session: unknown[] = [];
    session.push(L().sessionEntry({ run: 1, kind: 'pre', chain: 'sources', win: { maxIdBefore: 1, started_at: T0 }, completed_at: await L().closeWindow(pool, log), child: { exit_code: 0, signal: null }, markers: { summary: null, meta: [] } }));
    expect(session).toHaveLength(1);
    expect((session[0] as { completed_at: unknown }).completed_at).toBeNull();
    expect(log.mock.calls[0]![0]).toContain('conn reset');
  });

  it('#1 a NULL completed_at is stamped now() by the INSERT (source-version reads NULL as infinity)', async () => {
    expect(L().INSERT_SQL).toMatch(/COALESCE\(\$4, now\(\)\)/);
    const { pool, calls } = fakePool();
    await L().flushSession([entry({ completed_at: null })], { pool, ctx: CTX });
    const ins = calls.find((c) => isInsert(c.sql))!;
    expect(ins.params![3]).toBeNull();
    expect(ins.params![4]).toBeNull();
  });

  it('#2 records_meta.skipped === true is self_skipped; a known terminal and a non-zero exit still win', () => {
    const child = (exit_code: number, records_meta: Record<string, unknown>) => ({ exit_code, signal: null, stderr: '', summary: { records_meta }, meta: [] });
    expect(L().harnessRunRow(entry({ child: child(0, { skipped: true, reason: 'advisory_lock_held_elsewhere' }) }), CTX).records_meta.capture.child_status).toBe('self_skipped');
    const descriptor = { terminals: [{ id: 'recorded', status: 'completed' }] };
    expect(L().harnessRunRow(entry({ child: child(0, { skipped: true, terminal: 'recorded' }) }), { ...CTX, descriptor }).records_meta.capture.child_status).toBe('completed');
    expect(L().harnessRunRow(entry({ child: child(1, { skipped: true }) }), CTX).records_meta.capture.child_status).toBe('failed');
  });
});
