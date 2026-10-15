// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BZ G1, Rule 10, R-BG (iv) / R-CB
// SPEC LINK: docs/specs/01-pipeline/58_zoning_load.md §9 (the frozen consumer-protocol block)
//
// S1-P-8a — DB-tier behavioural lock for enrich_parcels' TWO `readZoningContract` producer reads.
//
// WHY THIS FILE EXISTS (operator rule 2026-10-01: a test must EXECUTE what it protects): the
// #12c probe and the #12d layers read are now `ctx.producer` reads — i.e. `readRunHistory` SQL
// (`status = ANY($2)`, `jsonb_typeof(records_meta -> $N) = 'object'`, `ORDER BY completed_at DESC,
// id DESC`) inside an in-txn `BEGIN/ROLLBACK`, so the SELECT itself is the thing under test.
//
// What it proves, case by case:
//   (1) FALLBACK KEPT (operator 2026-10-13, "reverse", Fold 1 item 7): a NEWER completed run that
//       does NOT carry `zoning_layers_loaded` does NOT win — the newest run that CARRIES the key
//       (`metaObject`) is the contract source, even when it is older. (Measured 6/6 load_zoning runs
//       complete WITH the key, so the fallback is a safety net, not the normal path.)
//   (2) no run carries the key → the read is MISSING and the DECLARED pin (not a throw) halts the run
//       before any phase: `measureProducerPins(client, descriptor).halt === true`.
//   (3) R-BG (iv) / R-CB: the read's status set is the library BASELINE set, so a
//       `completed_with_warnings` run carrying the key IS admissible (the deleted bare
//       `status = 'completed'` probe was NOT — it silently skipped a warn-completed load).
//   (4) the #12c probe still HALTS on a `failed` run (the named residual throw: a pin reads
//       `records_meta` stamps only, so "the newest run, whatever its status, failed" is not a pin);
//       a failed run OLDER than a completed one does not halt.
//
// FIXTURE DISCIPLINE: the pipeline slug is the REAL `sources:load_zoning` the production SQL matches,
// and the fixtures land inside a dedicated PoolClient under BEGIN/ROLLBACK — nothing outside the
// transaction is mutated, no cleanup DELETE is needed, and the per-case `completed_at` windows are
// DISJOINT across tests (a case's failed/probe row can never leak into another case's window).
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const compute = require('../../../scripts/lib/compute/enrich-parcels.js');
const { makeProducer } = require('../../../scripts/lib/step/producer.js');
const { measureProducerPins } = require('../../../scripts/lib/step/index.js');
const { slugForms } = require('../../../scripts/lib/ledger.js');
/* eslint-enable @typescript-eslint/no-require-imports */

// The ledger spelling the compute asks for (`ZONING_PRODUCER_STEP`); the descriptor's pins use it
// too — asserted below so a rename cannot drift the fixture away from production.
const STEP = 'load_zoning';
const PRODUCER_NAME = 'sources:load_zoning';
const DESCRIPTOR = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../scripts/enrich-parcels.descriptor.json'), 'utf8'));

/** The R-BG (iv) marker row: a write_skipped_pre_write_warn run is NOT a baseline (the library default excludes it). */
const MARKED_ROWS = [{ metric: 'write_skipped_pre_write_warn', value: true }];

// ---------------------------------------------------------------------------
// Fixture windows — DISJOINT per case (see the header note). `probeAt` is the #12c probe's key
// (`started_at`), always <= its own run's `completedAt`.
// ---------------------------------------------------------------------------
const W1 = {
  old:    { start: '2026-10-13T01:01:00Z', done: '2026-10-13T01:01:01Z' },
  newerNoKey: { start: '2026-10-13T01:02:00Z', done: '2026-10-13T01:02:01Z' },
  probeAt: '2026-10-13T01:02:00Z', // the newest load_zoning run in this window (completed, no key)
};
const W2 = {
  noKey: { start: '2026-10-13T02:01:00Z', done: '2026-10-13T02:01:01Z' },
  probeAt: '2026-10-13T02:01:00Z',
};
const W3 = {
  old:  { start: '2026-10-13T03:01:00Z', done: '2026-10-13T03:01:01Z' },
  cww:  { start: '2026-10-13T03:02:00Z', done: '2026-10-13T03:02:01Z' },
  skipped: { start: '2026-10-13T03:03:00Z', done: '2026-10-13T03:03:01Z' },
  probeAt: '2026-10-13T03:02:00Z', // the cww run — the newest TERMINAL row in this window
};
const W4 = {
  failedOld: { start: '2026-10-13T04:01:00Z', done: '2026-10-13T04:01:01Z' },
  old:       { start: '2026-10-13T04:02:00Z', done: '2026-10-13T04:02:01Z' },
  probeAt: '2026-10-13T04:02:00Z', // the completed row — newest TERMINAL (the failed one is older)
};
const W5 = {
  old:    { start: '2026-10-13T05:01:00Z', done: '2026-10-13T05:01:01Z' },
  failed: { start: '2026-10-13T05:02:00Z', done: '2026-10-13T05:02:01Z' },
  probeAt: '2026-10-13T05:02:00Z', // the failed row
};

interface RunSeed {
  status: string;
  startAt: string;
  completedAt: string;
  recordsMeta: object | null;
}

/** Insert one `pipeline_runs` row under the REAL producer slug, with EXPLICIT timestamps. */
async function insertRun(client: PoolClient, seed: RunSeed): Promise<number> {
  const { rows } = await client.query(
    `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, records_meta)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [PRODUCER_NAME, seed.status, seed.startAt, seed.completedAt, seed.recordsMeta === null ? null : JSON.stringify(seed.recordsMeta)],
  );
  return rows[0].id as number;
}

/** Run `body` inside a BEGIN/ROLLBACK transaction on a dedicated client — the fixture is hermetic. */
async function inRolledBackTxn(pool: Pool, body: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Hermetic against suite order: enrich-parcels-incremental.db.test.ts seeds a PERSISTENT
    // `sources:load_zoning` completed run at NOW() (its "harmless baseline"), which is newer than
    // this file's fixed 2026-10-13 windows and wins every newest-run read. Hide every load_zoning
    // run — bare and chain-prefixed slug forms — inside this transaction (no FK references
    // pipeline_runs; the ROLLBACK restores them).
    await client.query(
      `DELETE FROM pipeline_runs WHERE pipeline = ANY($1) OR split_part(pipeline, ':', 2) = ANY($1)`,
      [slugForms(STEP)],
    );
    await body(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

const ctxFor = (client: PoolClient) => ({
  pool: client,
  producer: makeProducer({ pool: client, chains: ['sources'] }),
});

/**
 * The `readZoningChange` result for this txn: its producer arm is pinned to the load_zoning row that
 * STARTED at `probeAt` (the last probe row this test inserted), so no absolute-clock assumption is
 * baked into the assertion (the `own_last` arm is empty in the txn, so the result is `changed:false`
 * until a load at/after the probe row's own `started_at` exists — the probe row's is `probeAt`).
 */
const changeAt = (probeAt: string) => ({
  changed: false,
  producer_run_id: null,
  producer_completed_at: null,
  own_last_run_id: null,
  own_last_started_at: null,
  read_at: new Date(probeAt),
});

describe.skipIf(!dbAvailable())('enrich_parcels readZoningContract — S1-P-8a live-DB producer reads', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = getTestPool() as Pool;
  });

  it('seeds by exactly the slugForms of the descriptor chain (fixture pinned to production)', () => {
    // Not a DB assertion — it pins the fixture to the production name set.
    expect(slugForms(STEP, ['sources'])).toEqual(['sources:load_zoning', 'load_zoning', 'load-zoning']);
    expect(slugForms(STEP, ['sources'])).toContain(PRODUCER_NAME);
    expect(compute.ZONING_PRODUCER_STEP).toBeUndefined(); // private (not exported): the descriptor is the declaration
    const basePin = DESCRIPTOR.staleness.pins.find((p: { stamp?: string }) => p.stamp === 'records_meta.zoning_layers_loaded.base');
    expect(basePin).toMatchObject({ step: STEP, op: 'true', meta_object: 'zoning_layers_loaded' });
  });

  // ── 1 ────────────────────────────────────────────────────────────────────────────────────────
  it('1 — FALLBACK KEPT: the newest run CARRYING the key wins over a newer run without it', async () => {
    await inRolledBackTxn(pool, async (client) => {
      const old = await insertRun(client, {
        status: 'completed',
        startAt: W1.old.start,
        completedAt: W1.old.done,
        recordsMeta: { zoning_layers_loaded: { base: true, v: 'old' } },
      });
      await insertRun(client, {
        status: 'completed',
        startAt: W1.newerNoKey.start,
        completedAt: W1.newerNoKey.done,
        recordsMeta: { something_else: 1 }, // complete run, key NOT carried
      });

      const producer = makeProducer({ pool: client, chains: ['sources'] });
      const res = await producer(STEP, { metaObject: 'zoning_layers_loaded' });
      expect(res.reason).toBe('FOUND');
      expect(res.sid).toBe(old);
      expect(res.records_meta.zoning_layers_loaded.v).toBe('old');
    });
  });

  // ── 2 ────────────────────────────────────────────────────────────────────────────────────────
  it('2 — no run carries the key → MISSING, and the DECLARED pin halts before any phase', async () => {
    await inRolledBackTxn(pool, async (client) => {
      await insertRun(client, {
        status: 'completed',
        startAt: W2.noKey.start,
        completedAt: W2.noKey.done,
        recordsMeta: { something_else: 1 },
      });

      const res = await ctxFor(client).producer(STEP, { metaObject: 'zoning_layers_loaded' });
      expect(res.reason).toBe('MISSING');
      expect(res.records_meta).toBeNull();

      const measured = await measureProducerPins(client, DESCRIPTOR);
      expect(measured.halt).toBe(true);
      const row = measured.rows.find((r: { pin_id?: string }) => r.pin_id === 'load_zoning.records_meta.zoning_layers_loaded.base');
      expect(row, 'the declared base-layer pin must produce a row').toBeDefined();
      expect(row.result).toBe('MISSING');
      expect(row.status).toBe('FAIL');
    });
  });

  // ── 3 ────────────────────────────────────────────────────────────────────────────────────────
  it('3 — R-BG (iv)/R-CB: a completed_with_warnings run carrying the key IS the baseline (the old completed-only probe was not)', async () => {
    await inRolledBackTxn(pool, async (client) => {
      await insertRun(client, {
        status: 'completed',
        startAt: W3.old.start,
        completedAt: W3.old.done,
        recordsMeta: { zoning_layers_loaded: { base: true, v: 'old' } },
      });
      await insertRun(client, {
        status: 'completed_with_warnings',
        startAt: W3.cww.start,
        completedAt: W3.cww.done,
        recordsMeta: { zoning_layers_loaded: { base: true, v: 'cww' } },
      });
      // R-BG (iv): a `skipped` run carrying the key is NOT a baseline, and is NOT terminal either —
      // it must not be picked by the layers read nor by the probe.
      await insertRun(client, {
        status: 'skipped',
        startAt: W3.skipped.start,
        completedAt: W3.skipped.done,
        recordsMeta: { zoning_layers_loaded: { base: false, v: 'skipped' } },
      });

      const ctx = ctxFor(client);
      const res = await ctx.producer(STEP, { metaObject: 'zoning_layers_loaded' });
      expect(res.reason).toBe('FOUND');
      expect(res.status).toBe('completed_with_warnings');
      expect(res.records_meta.zoning_layers_loaded.v).toBe('cww');

      // H5 retarget: since S1-P, readZoningChange reads its own baseline through ctx.producer, not
      // pool.query, so the old pool stub no longer reached it, and the result tracked the live
      // ledger. Pin the enrich_parcels baseline after every possible zoning load (far future): with
      // no load inside the window, changed:false holds hermetically. All other reads stay real.
      const hermetic = {
        ...ctx,
        producer: (step: string, opts?: object) => (step === 'enrich_parcels'
          ? Promise.resolve({ reason: 'FOUND', sid: null, status: 'completed', started_at: new Date('2099-01-01T00:00:00Z'), rows: [] })
          : ctx.producer(step, opts)),
      };
      const contract = await compute.readZoningContract(hermetic);
      expect(contract.layers.v).toBe('cww');
      expect(contract.partial).toBe(false);
      expect(contract.zoning_change.changed).toBe(false);
    });
  });

  // ── 4 ────────────────────────────────────────────────────────────────────────────────────────
  it('4 — the #12c probe HALTS on a newest failed run; a FAILED run older than a completed one does not', async () => {
    // (a) FAILED is the newest terminal run → the named residual HALT.
    await inRolledBackTxn(pool, async (client) => {
      await insertRun(client, {
        status: 'completed',
        startAt: W5.old.start,
        completedAt: W5.old.done,
        recordsMeta: { zoning_layers_loaded: { base: true, v: 'old' } },
      });
      await insertRun(client, {
        status: 'failed',
        startAt: W5.failed.start,
        completedAt: W5.failed.done,
        recordsMeta: { zoning_layers_loaded: { base: true, v: 'failed' } },
      });

      await expect(compute.readZoningContract(ctxFor(client))).rejects.toThrow(/latest .* FAILED/);
    });

    // (b) the failed run is OLDER than a completed one → the hook RESOLVES.
    await inRolledBackTxn(pool, async (client) => {
      await insertRun(client, {
        status: 'failed',
        startAt: W4.failedOld.start,
        completedAt: W4.failedOld.done,
        recordsMeta: { zoning_layers_loaded: { base: true, v: 'failed-old' } },
      });
      await insertRun(client, {
        status: 'completed',
        startAt: W4.old.start,
        completedAt: W4.old.done,
        recordsMeta: { zoning_layers_loaded: { base: true, v: 'old' } },
      });

      const contract = await compute.readZoningContract({ ...ctxFor(client), pool: { query: async () => ({ rows: [changeAt(W4.probeAt)] }) } });
      expect(contract.layers.v).toBe('old');
      expect(contract.baseCommittedAfterOverlayFailed).toBe(false);
    });
  });

  // ── 5 ────────────────────────────────────────────────────────────────────────────────────────
  it('5 — the layers read is the BASELINE set: a R-BG (iv) marked run carrying the key is not selected', async () => {
    await inRolledBackTxn(pool, async (client) => {
      const old = await insertRun(client, {
        status: 'completed',
        startAt: '2026-10-13T06:01:00Z',
        completedAt: '2026-10-13T06:01:01Z',
        recordsMeta: { zoning_layers_loaded: { base: true, v: 'old' } },
      });
      await insertRun(client, {
        status: 'completed',
        startAt: '2026-10-13T06:02:00Z',
        completedAt: '2026-10-13T06:02:01Z',
        recordsMeta: { audit_table: { rows: MARKED_ROWS }, zoning_layers_loaded: { base: false, v: 'marked' } },
      });

      const res = await ctxFor(client).producer(STEP, { metaObject: 'zoning_layers_loaded' });
      expect(res.sid).toBe(old);
      expect(res.records_meta.zoning_layers_loaded.v).toBe('old');
    });
  });
});
