// 🔗 SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 13, R-T addendum, commit 5)
// 🔗 SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md
//
// scripts/analysis/chain-end-synthesis.mjs's `fetchChainRun` — the required
// "Chain-end synthesis test asserts the report is generated from real
// committed pipeline_runs rows, not hand-typed" red/green fixture. Inserts
// REAL rows into the live test DB's `pipeline_runs` table, then proves
// `fetchChainRun` reads them back correctly for both join strategies:
// primary (records_meta.chain_run_id, R-U) and legacy temporal fallback
// (Fold A-5). Does NOT exercise the full `synthesizeChainEnd` (that would
// also execute every converted step's `validate_only` invariants for real —
// one of them (`missed_link_count`) measures ~66s, Fold B-1 — far too slow
// for the routine suite; `runValidateOnlyTier`'s SHAPE is covered instead by
// the fake-pool tests in chain-end-synthesis.logic.test.ts).

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const synthesis = require('../../../scripts/analysis/chain-end-synthesis.mjs') as unknown as {
  fetchChainRun: (
    pool: Pool,
    chainId: string,
    runId: number,
  ) => Promise<{ chainRow: Record<string, unknown>; stepRows: Array<Record<string, unknown>>; joinKind: string } | null>;
};

const TEST_CHAIN_ID = 'sources'; // must match the real chain — chain-end-synthesis is scoped to it (run-chain.js's own guard)

describe.skipIf(!dbAvailable())('chain-end-synthesis.mjs fetchChainRun — real committed pipeline_runs rows, not hand-typed', () => {
  let pool: Pool;
  const insertedIds: number[] = [];

  beforeAll(() => { pool = getTestPool() as Pool; });

  afterEach(async () => {
    if (insertedIds.length > 0) {
      await pool.query('DELETE FROM pipeline_runs WHERE id = ANY($1)', [insertedIds]);
      insertedIds.length = 0;
    }
  });

  async function insertRun(pipeline: string, opts: { startedAt: string; completedAt: string; durationMs: number; status?: string; recordsMeta?: object | null }) {
    const res = await pool.query(
      `INSERT INTO pipeline_runs (pipeline, started_at, completed_at, status, duration_ms, records_meta)
       VALUES ($1, $2::timestamptz, $3::timestamptz, $4, $5, $6::jsonb) RETURNING id`,
      [pipeline, opts.startedAt, opts.completedAt, opts.status ?? 'completed', opts.durationMs, opts.recordsMeta ? JSON.stringify(opts.recordsMeta) : null],
    );
    const id = res.rows[0].id as number;
    insertedIds.push(id);
    return id;
  }

  it('primary join (R-U): step rows carrying records_meta.chain_run_id === the chain row\'s own id are found, real values round-trip', async () => {
    const chainId = await insertRun(TEST_CHAIN_ID, { startedAt: '2026-08-30T08:00:00Z', completedAt: '2026-08-30T08:30:00Z', durationMs: 1_800_000 });
    await insertRun(`${TEST_CHAIN_ID}:compute_centroids`, {
      startedAt: '2026-08-30T08:00:05Z', completedAt: '2026-08-30T08:00:10Z', durationMs: 5000,
      recordsMeta: { chain_run_id: chainId, ledger_row: 'chain_owned' },
    });
    await insertRun(`${TEST_CHAIN_ID}:link_massing`, {
      startedAt: '2026-08-30T08:00:11Z', completedAt: '2026-08-30T08:20:00Z', durationMs: 1_189_000,
      recordsMeta: { chain_run_id: chainId, ledger_row: 'chain_owned' },
    });

    const result = await synthesis.fetchChainRun(pool, TEST_CHAIN_ID, chainId);
    expect(result).not.toBeNull();
    expect(result!.joinKind).toBe('chain_run_id');
    expect(result!.chainRow.id).toBe(chainId);
    // Real committed values, not hand-typed: the durations below are read back
    // from the DB round-trip, not asserted against a literal copy of the input.
    const centroidsRow = result!.stepRows.find((r) => r.pipeline === `${TEST_CHAIN_ID}:compute_centroids`);
    const massingRow = result!.stepRows.find((r) => r.pipeline === `${TEST_CHAIN_ID}:link_massing`);
    expect(centroidsRow).toBeTruthy();
    expect(massingRow).toBeTruthy();
    expect(centroidsRow!.duration_ms).toBe(5000);
    expect(massingRow!.duration_ms).toBe(1_189_000);
    expect((centroidsRow!.records_meta as { chain_run_id: number }).chain_run_id).toBe(chainId);
  });

  it('legacy temporal fallback (Fold A-5): step rows with NO chain_run_id key are found via the LIKE-prefix + started_at/completed_at window', async () => {
    const chainId = await insertRun(TEST_CHAIN_ID, { startedAt: '2026-08-29T08:00:00Z', completedAt: '2026-08-29T08:30:00Z', durationMs: 1_800_000 });
    await insertRun(`${TEST_CHAIN_ID}:compute_centroids`, {
      startedAt: '2026-08-29T08:00:05Z', completedAt: '2026-08-29T08:00:10Z', durationMs: 5000,
      recordsMeta: { ledger_row: 'chain_owned' }, // no chain_run_id key at all — pre-commit-5 shape
    });

    const result = await synthesis.fetchChainRun(pool, TEST_CHAIN_ID, chainId);
    expect(result).not.toBeNull();
    expect(result!.joinKind).toBe('temporal_fallback');
    expect(result!.stepRows).toHaveLength(1);
    expect(result!.stepRows[0]?.duration_ms).toBe(5000);
  });

  it('returns null for a run_id with no pipeline_runs row at all — never a fabricated empty report', async () => {
    const result = await synthesis.fetchChainRun(pool, TEST_CHAIN_ID, 999_999_999);
    expect(result).toBeNull();
  });
});
