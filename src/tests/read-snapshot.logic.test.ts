// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-CA(i); R-CH ctx.readSnapshot)
//
// `ctx.readSnapshot(fn)` is the runner-owned READ ONLY snapshot: the compute hands over a
// reader function and receives a `client` that is already inside `BEGIN TRANSACTION READ
// ONLY`, bounded by the descriptor's DECLARED statement timeout. These are fixture-level
// (no DB): a fake pool/client records the SQL the seam issues, so the sequence — BEGIN,
// optional SET LOCAL, the compute's own queries, ROLLBACK, release — is asserted rather
// than inferred. Case (c) pins the loud-missing-input rule: an unresolvable bound must not
// open a silent no-timeout snapshot.

import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { makeReadSnapshot } = require('../../scripts/lib/step/read-snapshot.js') as {
  makeReadSnapshot: (deps: {
    pool: { connect: () => Promise<unknown> };
    descriptor: { identity: { name: string }; execution?: { statement_timeout_minutes_from_config?: unknown } };
    config: Record<string, unknown>;
    tag: string;
  }) => (fn: (client: unknown) => Promise<unknown>) => Promise<unknown>;
};

const TAG = '[refresh_snapshot]';

/** A fake pg pool whose single client records every SQL string it is handed. */
function fakePool() {
  const calls: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      calls.push(sql);
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn(async () => client) };
  return { pool, client, calls };
}

describe('ctx.readSnapshot — the runner-owned READ ONLY snapshot (R-CH)', () => {
  it('wraps fn in one READ ONLY txn, applies the declared bound, then ROLLBACKs and releases', async () => {
    const { pool, client, calls } = fakePool();
    const readSnapshot = makeReadSnapshot({
      pool,
      descriptor: {
        identity: { name: 'refresh_snapshot' },
        execution: { statement_timeout_minutes_from_config: 'v' },
      },
      config: { v: 0.25 },
      tag: TAG,
    });

    const result = await readSnapshot(async (c) => {
      await (c as { query: (sql: string) => Promise<unknown> }).query('SELECT 1 FROM parcels');
      await (c as { query: (sql: string) => Promise<unknown> }).query('SELECT count(*) FROM parcels');
      return 'the-fn-value';
    });

    // The fn's own return value crosses the seam untouched.
    expect(result).toBe('the-fn-value');
    expect(calls).toEqual([
      'BEGIN TRANSACTION READ ONLY',
      'SET LOCAL statement_timeout = 15000',
      'SELECT 1 FROM parcels',
      'SELECT count(*) FROM parcels',
      'ROLLBACK',
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('issues no SET LOCAL when the descriptor declares no statement-timeout config key', async () => {
    const { pool, client, calls } = fakePool();
    const readSnapshot = makeReadSnapshot({
      pool,
      descriptor: { identity: { name: 'refresh_snapshot' } },
      config: { v: 0.25 },
      tag: TAG,
    });

    await readSnapshot(async (c) => (c as { query: (sql: string) => Promise<unknown> }).query('SELECT 1'));

    expect(calls.some((sql) => /SET LOCAL/.test(sql))).toBe(false);
    expect(calls).toEqual(['BEGIN TRANSACTION READ ONLY', 'SELECT 1', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('refuses loudly when the declared key resolves to nothing — and takes no client (never a leak)', async () => {
    const { pool, calls } = fakePool();
    const readSnapshot = makeReadSnapshot({
      pool,
      descriptor: {
        identity: { name: 'refresh_snapshot' },
        execution: { statement_timeout_minutes_from_config: 'v' },
      },
      config: {}, // 'v' declared but absent — a missing input is loud, never a no-timeout
      tag: TAG,
    });

    await expect(readSnapshot(async () => 'never')).rejects.toThrow(/statement_timeout_minutes_from_config/);
    await expect(readSnapshot(async () => 'never')).rejects.toThrow(/"v"/);

    // The bound is resolved BEFORE connect: no client is taken, so none can leak.
    expect(pool.connect).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('propagates the fn error, ROLLBACKs, and still releases the client', async () => {
    const { pool, client, calls } = fakePool();
    const readSnapshot = makeReadSnapshot({
      pool,
      descriptor: {
        identity: { name: 'refresh_snapshot' },
        execution: { statement_timeout_minutes_from_config: 'v' },
      },
      config: { v: 1 },
      tag: TAG,
    });

    await expect(
      readSnapshot(async () => {
        throw new Error('compute blew up mid-snapshot');
      }),
    ).rejects.toThrow('compute blew up mid-snapshot');

    expect(calls).toEqual([
      'BEGIN TRANSACTION READ ONLY',
      'SET LOCAL statement_timeout = 60000',
      'ROLLBACK',
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
