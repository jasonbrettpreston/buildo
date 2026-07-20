// SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §8.3
// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §4
//
// Logic-layer lock for the shared chain-concurrency query helper
// (scripts/lib/chain-concurrency.js) — the SINGLE source of the
// "isChainRunning" exact query Spec 113 §8.3 pins. Both
// scripts/check-chain-running.js (GitHub Actions guard step) and the
// demoted scripts/local-cron.js import this helper; this test locks the
// query text + param shape + return contract they both depend on staying
// byte-identical, against a mocked pool (no DB).

import { describe, it, expect, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const chainConcurrency = require('../../scripts/lib/chain-concurrency.js') as {
  isChainRunning: (
    pool: { query: (...args: unknown[]) => Promise<{ rows: unknown[] }> },
    chainId: string
  ) => Promise<{ running: boolean; row: { id: number; started_at: string } | null }>;
  findStaleRunningRow: (
    pool: { query: (...args: unknown[]) => Promise<{ rows: unknown[] }> },
    chainId: string
  ) => Promise<{ id: number; started_at: string } | null>;
};

function mockPool(rows: unknown[]) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

describe('chain-concurrency — isChainRunning', () => {
  it('prefixes the chain id with chain_ and queries the exact 12h-TTL contract', async () => {
    const pool = mockPool([]);
    await chainConcurrency.isChainRunning(pool, 'permits');
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(['chain_permits']);
    expect(sql).toMatch(/pipeline = \$1 AND status = 'running'/);
    expect(sql).toMatch(/started_at > NOW\(\) - INTERVAL '12 hours'/);
    expect(sql).toMatch(/LIMIT 1/);
  });

  it('returns running=false, row=null when no row matches', async () => {
    const pool = mockPool([]);
    const result = await chainConcurrency.isChainRunning(pool, 'coa');
    expect(result).toEqual({ running: false, row: null });
  });

  it('returns running=true with the matched row when a row exists', async () => {
    const row = { id: 42, started_at: '2026-07-20T10:00:00Z' };
    const pool = mockPool([row]);
    const result = await chainConcurrency.isChainRunning(pool, 'coa');
    expect(result).toEqual({ running: true, row });
  });
});

describe('chain-concurrency — findStaleRunningRow', () => {
  it('queries the STALE side (<=, not >) of the same 12h boundary', async () => {
    const pool = mockPool([]);
    await chainConcurrency.findStaleRunningRow(pool, 'sources');
    const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(['chain_sources']);
    expect(sql).toMatch(/pipeline = \$1 AND status = 'running'/);
    expect(sql).toMatch(/started_at <= NOW\(\) - INTERVAL '12 hours'/);
  });

  it('returns null when no stale row exists', async () => {
    const pool = mockPool([]);
    const result = await chainConcurrency.findStaleRunningRow(pool, 'entities');
    expect(result).toBeNull();
  });

  it('returns the stale row when one exists', async () => {
    const row = { id: 7, started_at: '2026-07-01T00:00:00Z' };
    const pool = mockPool([row]);
    const result = await chainConcurrency.findStaleRunningRow(pool, 'entities');
    expect(result).toEqual(row);
  });
});
