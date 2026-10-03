// SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §3.9 (the §9 / DEC-E contract read protocol)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BG (iv) (write_skipped_pre_write_warn is a preserve-and-WARN run, never a baseline)
//
// enrich_centreline EC-D10 — DB-tier behavioural lock for the two contract reads.
//
// WHY THIS FILE EXISTS (operator rule 2026-10-01: a test must EXECUTE what it protects;
// Spec 124 R-BG (iv)): `scripts/lib/compute/enrich-centreline.js`'s `readLastEnrichedVersion`
// (~:315, the SELF read of `sources:enrich_centreline`) and `readCentrelineContract`
// (~:362, the PRODUCER read of `sources:load_centreline`) both select a prior run with
//
//   status IN ('completed','completed_with_warnings')
//   AND NOT COALESCE(records_meta->'audit_table'->'rows'
//                    @> '[{"metric":"write_skipped_pre_write_warn"}]'::jsonb, false)
//   ORDER BY completed_at DESC LIMIT 1
//
// The existing fast test (src/tests/enrich-centreline.logic.test.ts) MIRRORS that selection in
// JavaScript — so the REAL Postgres selection, including the jsonb `@>` containment predicate
// (the R-BG (iv) skip_write marker) and the `completed_at DESC` ordering, has never executed.
// This file runs the REAL exported functions against a REAL Postgres, so the SQL itself is the
// thing under test.
//
// FIXTURE DISCIPLINE: unlike the ledger-gate file, the pipeline slugs here are NOT parameters —
// they are the HARDCODED `sources:load_centreline` / `sources:enrich_centreline` names the
// production SQL matches (`PRODUCER_FORMS` / `SELF_FORMS`). Seeding rows under those real names
// permanently would touch live ledger rows, so every case runs inside a BEGIN/ROLLBACK-wrapped
// PoolClient and the compute functions are handed THAT CLIENT (both read functions only call
// `pool.query`, verified — a PoolClient satisfies the call). ROLLBACK restores the table exactly:
// nothing outside the transaction is mutated, no real row is ever read as a fixture, and no
// cleanup DELETE is needed. (This is the BEGIN/ROLLBACK isolation pattern already used by
// src/tests/db/compute-parcel-cost-estimates-violations.db.test.ts and enrich-ravines.skip.db.test.ts.)
import { describe, it, expect, beforeAll } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const compute = require('../../../scripts/lib/compute/enrich-centreline.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { slugForms } = require('../../../scripts/lib/ledger.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { preWriteSkipRows } = require('../../../scripts/lib/step/index.js');

// The real exported name lists the SQL matches — seeded rows use exactly these, and this file
// asserts they still equal the ledger's own slugForms expansion, so a future rename cannot drift
// the fixture away from production.
const PRODUCER_FORMS: string[] = compute.PRODUCER_FORMS;
const SELF_FORMS: string[] = compute.SELF_FORMS;
const PRODUCER_NAME = 'sources:load_centreline';
const SELF_NAME = 'sources:enrich_centreline';

// Fixture-unique version strings — a real ledger row can never carry one, so accidental equality
// with live data is impossible (this is what keeps the ROLLBACK-scoped fixture hermetic).
const V1 = 'ECD10-FX-v1';
const V2 = 'ECD10-FX-v2';
const V3 = 'ECD10-FX-v3';
const V4 = 'ECD10-FX-v4';

const NOW = new Date('2026-10-01T12:00:00.000Z');
const T1 = new Date('2026-10-01T12:01:00.000Z');
const T2 = new Date('2026-10-01T12:02:00.000Z');
const T3 = new Date('2026-10-01T12:03:00.000Z');
const T4 = new Date('2026-10-01T12:04:00.000Z');

/** The R-BG (iv) marker row, built from the REAL exported renderer (never hand-rolled). */
const MARKED_ROWS = preWriteSkipRows([{ writeSkippedPreWriteWarn: true, failedPreWriteWarn: ['x'] }]);

const PRODUCER_META = (version: string) => ({
  centreline_load: {
    spec_version: compute.SPEC_VERSION,
    features_inserted: 42,
    source_dataset_version: version,
  },
});
const SELF_META = (version: string) => ({
  centreline_enrich: { source_dataset_version: version },
});
/** A run whose audit table carries the skip_write WARN row — preserve-and-WARN, an empty source. */
const MARKED_META = { audit_table: { rows: MARKED_ROWS } };

interface RunSeed {
  pipeline: string;
  status: string;
  completedAt: Date;
  recordsMeta: object;
  startedAt?: Date;
}

/** Insert one ledger run using the reference file's explicit-timestamp discipline. */
async function insertRun(queryable: Pool | PoolClient, seed: RunSeed): Promise<void> {
  const { pipeline, status, completedAt, recordsMeta, startedAt = NOW } = seed;
  await queryable.query(
    `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, records_meta)
     VALUES ($1,$2,$3,$4,$5)`,
    [pipeline, status, startedAt, completedAt, JSON.stringify(recordsMeta)],
  );
}

/** Run `body` inside a BEGIN/ROLLBACK transaction on a dedicated client — the fixture is hermetic. */
async function inRolledBackTxn(pool: Pool, body: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await body(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

describe.skipIf(!dbAvailable())('enrich_centreline contract reads — EC-D10 live-DB baseline selection', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = getTestPool() as Pool;
  });

  it('seeds by exactly the real name lists (PRODUCER_FORMS / SELF_FORMS === slugForms of the chain names)', () => {
    // Not a DB assertion — it pins the fixture to the production name set. If the compute ever
    // changes the forms without the ledger, this file must be revisited, not silently pass.
    expect(PRODUCER_FORMS).toEqual(slugForms('load_centreline', ['sources']));
    expect(SELF_FORMS).toEqual(slugForms('enrich_centreline', ['sources']));
    expect(PRODUCER_FORMS).toContain('sources:load_centreline');
    expect(SELF_FORMS).toContain('sources:enrich_centreline');
  });

  // ── 1 ────────────────────────────────────────────────────────────────────────────────────────
  it('1 — a completed_with_warnings run NEWER than the completed run IS the baseline (both reads)', async () => {
    await inRolledBackTxn(pool, async (client) => {
      // Producer: completed@T1 (V1) then completed_with_warnings@T2 (V2) ⇒ V2.
      await insertRun(client, { pipeline: PRODUCER_NAME, status: 'completed', completedAt: T1, recordsMeta: PRODUCER_META(V1) });
      await insertRun(client, { pipeline: PRODUCER_NAME, status: 'completed_with_warnings', completedAt: T2, recordsMeta: PRODUCER_META(V2) });
      // Self: same pattern, distinct versions ⇒ lastVersion is the T2 value.
      await insertRun(client, { pipeline: SELF_NAME, status: 'completed', completedAt: T1, recordsMeta: SELF_META(V1) });
      await insertRun(client, { pipeline: SELF_NAME, status: 'completed_with_warnings', completedAt: T2, recordsMeta: SELF_META(V2) });

      const contract = await compute.readCentrelineContract(client);
      expect(contract.sourceDatasetVersion).toBe(V2);

      const lastVersion = await compute.readLastEnrichedVersion(client);
      expect(lastVersion).toBe(V2);
    });
  });

  // ── 2 ────────────────────────────────────────────────────────────────────────────────────────
  it('2 — a MARKED (skip_write WARN) run is never selected, whatever its status (both reads)', async () => {
    await inRolledBackTxn(pool, async (client) => {
      // completed@T1 (V1) is the only unmarked success; the two NEWER rows both carry the marker.
      await insertRun(client, { pipeline: PRODUCER_NAME, status: 'completed', completedAt: T1, recordsMeta: PRODUCER_META(V1) });
      await insertRun(client, { pipeline: PRODUCER_NAME, status: 'completed', completedAt: T3, recordsMeta: { ...MARKED_META, ...PRODUCER_META(V3) } });
      await insertRun(client, { pipeline: PRODUCER_NAME, status: 'completed_with_warnings', completedAt: T4, recordsMeta: { ...MARKED_META, ...PRODUCER_META(V4) } });
      await insertRun(client, { pipeline: SELF_NAME, status: 'completed', completedAt: T1, recordsMeta: SELF_META(V1) });
      await insertRun(client, { pipeline: SELF_NAME, status: 'completed', completedAt: T3, recordsMeta: { ...MARKED_META, ...SELF_META(V3) } });
      await insertRun(client, { pipeline: SELF_NAME, status: 'completed_with_warnings', completedAt: T4, recordsMeta: { ...MARKED_META, ...SELF_META(V4) } });

      const contract = await compute.readCentrelineContract(client);
      expect(contract.sourceDatasetVersion).toBe(V1);

      const lastVersion = await compute.readLastEnrichedVersion(client);
      expect(lastVersion).toBe(V1);
    });
  });

  // ── 3 ────────────────────────────────────────────────────────────────────────────────────────
  it('3 — completed_with_errors / failed / running are never selected (both reads)', async () => {
    await inRolledBackTxn(pool, async (client) => {
      // The only admissible success is completed@T1 (V1); each non-success status is NEWER.
      await insertRun(client, { pipeline: PRODUCER_NAME, status: 'completed', completedAt: T1, recordsMeta: PRODUCER_META(V1) });
      await insertRun(client, { pipeline: PRODUCER_NAME, status: 'completed_with_errors', completedAt: T2, recordsMeta: PRODUCER_META(V2) });
      await insertRun(client, { pipeline: PRODUCER_NAME, status: 'failed', completedAt: T3, recordsMeta: PRODUCER_META(V3) });
      await insertRun(client, { pipeline: PRODUCER_NAME, status: 'running', completedAt: T4, recordsMeta: PRODUCER_META(V4) });
      await insertRun(client, { pipeline: SELF_NAME, status: 'completed', completedAt: T1, recordsMeta: SELF_META(V1) });
      await insertRun(client, { pipeline: SELF_NAME, status: 'completed_with_errors', completedAt: T2, recordsMeta: SELF_META(V2) });
      await insertRun(client, { pipeline: SELF_NAME, status: 'failed', completedAt: T3, recordsMeta: SELF_META(V3) });
      await insertRun(client, { pipeline: SELF_NAME, status: 'running', completedAt: T4, recordsMeta: SELF_META(V4) });

      const contract = await compute.readCentrelineContract(client);
      expect(contract.sourceDatasetVersion).toBe(V1);

      const lastVersion = await compute.readLastEnrichedVersion(client);
      expect(lastVersion).toBe(V1);
    });
  });
});
