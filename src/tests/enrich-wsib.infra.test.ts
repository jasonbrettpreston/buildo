// SPEC LINK: docs/specs/pipeline/47_pipeline_script_protocol.md §7.6
//
// Regression lock: scripts/enrich-wsib.js must wrap both its cleanup UPDATEs
// (email scrub + website scrub) in a single transaction. If the website scrub
// fails, the email scrub must be rolled back so wsib_registry rows never have
// a partial cleanup state (email cleared but garbage website persisted).
import { describe, it, expect, vi } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runAutoCleanup } = require('../../scripts/enrich-wsib.js') as {
  runAutoCleanup: (pool: unknown, opts?: unknown) => Promise<number>;
};

// ── Mock helpers ─────────────────────────────────────────────────────────────

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
      return { rows: [{ id: 1 }], rowCount: 1 };
    }),
    queryLog,
  };
}

function makePipeline(pool: ReturnType<typeof makePool>) {
  let rolledBack = false;
  let committed = false;

  const client = pool; // same mock; transaction tracking is separate

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
    get _committed() { return committed; },
    get _rolledBack() { return rolledBack; },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('enrich-wsib.js — cleanup UPDATE atomicity (§7.6)', () => {
  it('routes both cleanup UPDATEs through the transaction client', async () => {
    const pool = makePool();
    const pl = makePipeline(pool);

    const count = await runAutoCleanup(pool, pl);

    expect(pl.withTransaction).toHaveBeenCalledOnce();
    const updates = pool.queryLog.filter((q) => /^UPDATE/i.test(q));
    expect(updates).toHaveLength(2);
    expect(pl._committed).toBe(true);
    expect(pl._rolledBack).toBe(false);
    expect(count).toBeGreaterThan(0); // both UPDATEs returned rows
  });

  it('rolls back email cleanup when website cleanup (2nd UPDATE) throws', async () => {
    const pool = makePool({ throwOnUpdateCall: 2 });
    const pl = makePipeline(pool);

    const count = await runAutoCleanup(pool, pl);

    expect(pl._rolledBack).toBe(true);
    expect(pl._committed).toBe(false);
    expect(count).toBe(0); // partial cleanup not reported
  });
});
