// SPEC LINK: docs/specs/pipeline/47_pipeline_script_protocol.md §7.6
//
// Regression lock: scripts/geocode-permits.js must wrap both its UPDATEs
// (main geocode + zombie cleanup) in a single transaction. If the zombie
// cleanup fails, the main geocode UPDATE must be rolled back so dashboard
// reads never see coordinates that disagree with the zombie-cleanup state.
import { describe, it, expect, vi } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { geocodePermits } = require('../../scripts/geocode-permits.js') as {
  geocodePermits: (pool: unknown, pl: unknown) => Promise<void>;
};

// ── Mock helpers ─────────────────────────────────────────────────────────────

const STAT_ROW = { count: '100', total: '100', already_geocoded: '80', has_geo_id: '95', to_geocode: '15', geocoded: '95', has_geo_id_no_match: '5', no_geo_id: '5' };

function makePool(opts?: { throwOnUpdateCall?: number }) {
  let updateCallCount = 0;
  const queryLog: string[] = [];

  return {
    query: vi.fn(async (sql: string) => {
      const norm = (typeof sql === 'string' ? sql : '').replace(/\s+/g, ' ').trim().slice(0, 60);
      queryLog.push(norm);
      const isUpdate = /^UPDATE/i.test(norm);
      if (isUpdate) {
        updateCallCount++;
        if (opts?.throwOnUpdateCall != null && updateCallCount === opts.throwOnUpdateCall) {
          throw new Error(`Injected failure on UPDATE call ${updateCallCount}`);
        }
      }
      if (norm.startsWith('SELECT NOW')) return { rows: [{ now: new Date() }], rowCount: 1 };
      if (norm.startsWith('SELECT COUNT')) return { rows: [STAT_ROW], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }),
    queryLog,
  };
}

function makePipeline(pool: ReturnType<typeof makePool>) {
  let rolledBack = false;
  let committed = false;

  const client = pool; // same mock, transaction tracked separately

  return {
    withTransaction: vi.fn(async (_pool: unknown, fn: (c: typeof pool) => Promise<unknown>) => {
      try {
        const result = await fn(client);
        committed = true;
        return result;
      } catch {
        rolledBack = true;
        return undefined;
      }
    }),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    emitSummary: vi.fn(),
    emitMeta: vi.fn(),
    get _committed() { return committed; },
    get _rolledBack() { return rolledBack; },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('geocode-permits.js — paired UPDATE atomicity (§7.6)', () => {
  it('routes both UPDATEs through the transaction client', async () => {
    const pool = makePool();
    const pl = makePipeline(pool);

    await geocodePermits(pool, pl);

    expect(pl.withTransaction).toHaveBeenCalledOnce();
    const updates = pool.queryLog.filter((q) => /^UPDATE/i.test(q));
    expect(updates).toHaveLength(2);
    expect(pl._committed).toBe(true);
    expect(pl._rolledBack).toBe(false);
  });

  it('rolls back main geocode UPDATE when zombie cleanup (2nd UPDATE) throws', async () => {
    const pool = makePool({ throwOnUpdateCall: 2 });
    const pl = makePipeline(pool);

    await geocodePermits(pool, pl);

    expect(pl._rolledBack).toBe(true);
    expect(pl._committed).toBe(false);

    // Only the 1st UPDATE (main geocode) ran; 2nd threw before completing
    const updates = pool.queryLog.filter((q) => /^UPDATE/i.test(q));
    expect(updates).toHaveLength(2); // 2nd was started but threw
  });
});
