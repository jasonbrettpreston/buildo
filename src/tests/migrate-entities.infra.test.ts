// SPEC LINK: docs/specs/pipeline/47_pipeline_script_protocol.md §7.6
//
// Regression lock: scripts/backfill/migrate-entities.js must wrap its 4
// sequential INSERT statements in a single transaction. Partial failure
// (e.g. step 3 throws) must roll back steps 1–2 — no orphaned entity rows
// without entity_projects join rows.
import { describe, it, expect, vi } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { run } = require('../../scripts/backfill/migrate-entities.js') as { run: (opts?: unknown) => Promise<void> };

// ── Mock helpers ─────────────────────────────────────────────────────────────

function makeClient(opts?: { throwOnInsertCall?: number }) {
  let insertCallCount = 0;
  const queryLog: string[] = [];

  const client = {
    query: vi.fn(async (sql: string) => {
      const normalized = (typeof sql === 'string' ? sql : '').replace(/\s+/g, ' ').trim().slice(0, 60);
      queryLog.push(normalized);
      const isInsert = /^INSERT/i.test(normalized);
      if (isInsert) {
        insertCallCount++;
        if (opts?.throwOnInsertCall != null && insertCallCount === opts.throwOnInsertCall) {
          throw new Error(`Injected failure on INSERT call ${insertCallCount}`);
        }
      }
      return { rowCount: 1, rows: [] };
    }),
    release: vi.fn(),
    queryLog,
  };
  return client;
}

function makePipeline(client: ReturnType<typeof makeClient>) {
  let rolledBack = false;
  let committed = false;

  const pl = {
    withTransaction: vi.fn(async (_pool: unknown, fn: (c: typeof client) => Promise<unknown>) => {
      try {
        const result = await fn(client);
        committed = true;
        return result;
      } catch {
        rolledBack = true;
        return undefined; // swallow — outer run() catch handles logging
      }
    }),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    get _committed() { return committed; },
    get _rolledBack() { return rolledBack; },
  };
  return pl;
}

function makePool(client: ReturnType<typeof makeClient>) {
  return {
    connect: vi.fn(async () => client),
    end: vi.fn(async () => {}),
    query: vi.fn(async () => ({ rowCount: 0, rows: [] })),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('migrate-entities.js — transaction atomicity (§7.6)', () => {
  it('passes all 4 INSERTs through the transaction client', async () => {
    const client = makeClient();
    const pool = makePool(client);
    const pl = makePipeline(client);

    await run({ pool, _pipeline: pl });

    // withTransaction must have been called once
    expect(pl.withTransaction).toHaveBeenCalledOnce();
    // All 4 INSERTs must have gone through the client
    const inserts = client.queryLog.filter((q) => /^INSERT/i.test(q));
    expect(inserts).toHaveLength(4);
    // Transaction committed successfully
    expect(pl._committed).toBe(true);
    expect(pl._rolledBack).toBe(false);
  });

  it('rolls back all writes when step 3 (3rd INSERT) throws — no orphaned entities', async () => {
    // Throw on the 3rd INSERT (step 3 = CoA applicants → entities)
    const client = makeClient({ throwOnInsertCall: 3 });
    const pool = makePool(client);
    const pl = makePipeline(client);

    await run({ pool, _pipeline: pl });

    // Transaction must have been rolled back
    expect(pl._rolledBack).toBe(true);
    expect(pl._committed).toBe(false);

    // Step 4 (Applicant INSERT) must NOT have executed
    const step4 = client.queryLog.filter((q) => q.includes('Applicant'));
    expect(step4).toHaveLength(0);

    // Steps 1 and 2 completed; step 3 started (query logged) then threw.
    // Step 4 never started — so 3 INSERT attempts total, not 4.
    const inserts = client.queryLog.filter((q) => /^INSERT/i.test(q));
    expect(inserts).toHaveLength(3);
  });
});
