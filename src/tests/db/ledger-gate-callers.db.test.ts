// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.9
//
// Phase B B3 — the run-ledger gate WIRED INTO its three callers (link-wsib.js,
// link-parcel-addresses.js, compute-parcel-cost-estimates.js), live-DB. Case
// IDs mirror the B3 grounding fold's red-first table:
//   G5 skip-emits-summary/DS4 (ⓔ child) — for each of the three callers, calling
//     their exported `main(pool)` directly (no child-process spawn needed: main
//     takes an injected pool per the compute-parcel-cost-estimates.js precedent,
//     so this is a REAL run against a REAL testcontainer DB, just without the
//     pipeline.run() pool-lifecycle wrapper) against a seeded SKIP condition
//     must emit a COMPLETED-shaped PIPELINE_SUMMARY (0 counts) + PIPELINE_META —
//     DS4: the summary is what lets run-chain.js mark the step 'completed' so
//     the NEXT evaluation's own-last anchor advances.
//   C1 canonical ISO version keys — readCostVersionSignals returns comparable
//     ISO strings, never the Date.toString() blob that was the only version
//     signal before this change.
//   W2 wsib partial index — migration 243 landed on the live schema.
//
// T2 fixture discipline: these callers hardcode their OWN/UPSTREAM slug sets as
// module constants (the massing-full-gate.js IN-list precedent — NOT a
// violation of "slug sets are always parameters to runLedgerGateDecision",
// which is about the shared library function, not its callers), so the
// fixtures below seed pipeline_runs rows under the REAL slug strings and clean
// up by exact slug list in afterEach (never a LIKE-prefix wildcard, to avoid
// touching any other suite's rows sharing this container).

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const linkWsib = require('../../../scripts/link-wsib.js') as {
  main: (pool: Pool) => Promise<void>;
  OWN_SLUGS: string[];
  UPSTREAM_SLUGS: string[];
  readThresholdVersionSignal: (pool: Pool) => Promise<{ thresholdUpdatedAt: string | null }>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const linkParcelAddresses = require('../../../scripts/link-parcel-addresses.js') as {
  main: (pool: Pool) => Promise<void>;
  OWN_SLUGS: string[];
  UPSTREAM_SLUGS: string[];
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const costEstimates = require('../../../scripts/compute-parcel-cost-estimates.js') as {
  main: (pool: Pool, opts?: { dryRun?: boolean; rowLimit?: number | null }) => Promise<void>;
  readCostVersionSignals: (pool: Pool) => Promise<{ ratesAsOf: string | null; indexUpdatedAt: string | null }>;
  hasRateOrIndexChanged: (meta: Record<string, unknown> | null, signals: { ratesAsOf: string | null; indexUpdatedAt: string | null }) => boolean;
  OWN_SLUGS: string[];
  UPSTREAM_SLUGS: string[];
};

/** Capture every PIPELINE_SUMMARY / PIPELINE_META line emitted to console.log during fn(). */
async function captureEmitted(fn: () => Promise<unknown>): Promise<{ summary: Record<string, unknown> | null; sawMeta: boolean }> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
    if (typeof msg === 'string') lines.push(msg);
  });
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  const summaryLine = lines.filter((l) => l.startsWith('PIPELINE_SUMMARY:')).pop();
  const summary = summaryLine ? (JSON.parse(summaryLine.slice('PIPELINE_SUMMARY:'.length)) as Record<string, unknown>) : null;
  const sawMeta = lines.some((l) => l.startsWith('PIPELINE_META:'));
  return { summary, sawMeta };
}

describe.skipIf(!dbAvailable())('Phase B B3 — run-ledger gate callers (live DB, main(pool) direct)', () => {
  let pool: Pool;

  async function cleanup(slugs: string[]) {
    if (slugs.length === 0) return;
    await pool.query('DELETE FROM pipeline_runs WHERE pipeline = ANY($1::text[])', [slugs]);
  }

  beforeAll(() => {
    pool = getTestPool() as Pool;
  });

  afterEach(async () => {
    await cleanup(linkWsib.OWN_SLUGS);
    await cleanup(linkParcelAddresses.OWN_SLUGS);
    await cleanup(costEstimates.OWN_SLUGS);
  });

  // ---------------------------------------------------------------------
  // G5 — link-wsib.js
  // ---------------------------------------------------------------------
  it('G5 (link-wsib): vacuous SKIP (own completed, zero upstream activity) emits a COMPLETED-shaped summary (DS4)', async () => {
    await pool.query(
      `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at)
       VALUES ($1, 'completed', NOW() - interval '10 minutes', NOW() - interval '9 minutes')`,
      [linkWsib.OWN_SLUGS[0]],
    );
    const { summary, sawMeta } = await captureEmitted(() => linkWsib.main(pool));
    expect(summary).toMatchObject({ records_total: 0, records_new: 0, records_updated: 0 });
    const rows = (summary?.records_meta as { audit_table?: { rows?: Array<{ metric: string; value: unknown }> } })
      ?.audit_table?.rows ?? [];
    expect(rows.some((r) => r.metric === 'status' && r.value === 'SKIPPED')).toBe(true);
    expect(rows.some((r) => r.metric === 'reason' && r.value === 'no_upstream_changes')).toBe(true);
    expect(sawMeta).toBe(true);
  });

  // ---------------------------------------------------------------------
  // Commit A — link-wsib.js gate placement (A-R1/A-R2/A-R3).
  // ---------------------------------------------------------------------
  it('A-R1: SKIP-eligible gate + --dry-run → the tier simulation runs, summary is NOT the SKIPPED shape', async () => {
    await pool.query(
      `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at)
       VALUES ($1, 'completed', NOW() - interval '10 minutes', NOW() - interval '9 minutes')`,
      [linkWsib.OWN_SLUGS[0]],
    );
    const originalArgv = process.argv;
    process.argv = [...originalArgv, '--dry-run'];
    try {
      const { summary } = await captureEmitted(() => linkWsib.main(pool));
      // The SKIP shape names its audit_table 'Link WSIB' with a 'status'/'SKIPPED' row;
      // the real (incl. dry-run) path names it 'WSIB Registry Matching' with tier rows.
      const auditTable = (summary?.records_meta as { audit_table?: { name?: string; rows?: Array<{ metric: string; value: unknown }> } })
        ?.audit_table;
      expect(auditTable?.name).toBe('WSIB Registry Matching');
      expect(auditTable?.rows?.some((r) => r.metric === 'tier_1_trade_matches')).toBe(true);
      expect(auditTable?.rows?.some((r) => r.metric === 'status' && r.value === 'SKIPPED')).toBe(false);
    } finally {
      process.argv = originalArgv;
    }
  }, 30000);

  it('A-R2: an invalid wsib_fuzzy_match_threshold throws even when the gate is SKIP-eligible (validation is not bypassable)', async () => {
    await pool.query(
      `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at)
       VALUES ($1, 'completed', NOW() - interval '10 minutes', NOW() - interval '9 minutes')`,
      [linkWsib.OWN_SLUGS[0]],
    );
    const { rows: prior } = await pool.query(
      `SELECT variable_value FROM logic_variables WHERE variable_key = 'wsib_fuzzy_match_threshold'`,
    );
    await pool.query(
      `INSERT INTO logic_variables (variable_key, variable_value)
       VALUES ('wsib_fuzzy_match_threshold', 5)
       ON CONFLICT (variable_key) DO UPDATE SET variable_value = 5, updated_at = NOW()`,
    );
    try {
      await expect(linkWsib.main(pool)).rejects.toThrow(/logicVars validation failed/);
    } finally {
      if (prior.length > 0) {
        await pool.query(
          `UPDATE logic_variables SET variable_value = $1 WHERE variable_key = 'wsib_fuzzy_match_threshold'`,
          [prior[0].variable_value],
        );
      } else {
        await pool.query(`DELETE FROM logic_variables WHERE variable_key = 'wsib_fuzzy_match_threshold'`);
      }
    }
  }, 30000);

  it('A-R3: wsib_fuzzy_match_threshold.updated_at moving forward forces RUN even though the ledger gate itself would SKIP', async () => {
    const live = await linkWsib.readThresholdVersionSignal(pool);
    await pool.query(
      `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, records_meta)
       VALUES ($1, 'completed', NOW() - interval '10 minutes', NOW() - interval '9 minutes', $2::jsonb)`,
      [linkWsib.OWN_SLUGS[0], JSON.stringify({ threshold_updated_at: '2000-01-01T00:00:00.000Z' })],
    );
    // Bump the threshold's updated_at forward (value unchanged) so ONLY the version
    // signal — not the ledger gate's upstream-activity check — forces the run.
    await pool.query(
      `UPDATE logic_variables SET updated_at = NOW() WHERE variable_key = 'wsib_fuzzy_match_threshold'`,
    );
    const { summary } = await captureEmitted(() => linkWsib.main(pool));
    const auditTable = (summary?.records_meta as { audit_table?: { name?: string } })?.audit_table;
    expect(auditTable?.name).toBe('WSIB Registry Matching');
    expect(live.thresholdUpdatedAt === null || typeof live.thresholdUpdatedAt === 'string').toBe(true);
  }, 30000);

  // ---------------------------------------------------------------------
  // G5 — link-parcel-addresses.js
  // ---------------------------------------------------------------------
  it('G5 (link-parcel-addresses): vacuous SKIP emits a COMPLETED-shaped summary (DS4)', async () => {
    await pool.query(
      `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at)
       VALUES ($1, 'completed', NOW() - interval '10 minutes', NOW() - interval '9 minutes')`,
      [linkParcelAddresses.OWN_SLUGS[0]],
    );
    const { summary, sawMeta } = await captureEmitted(() => linkParcelAddresses.main(pool));
    expect(summary).toMatchObject({ records_total: 0, records_new: 0, records_updated: 0 });
    const rows = (summary?.records_meta as { audit_table?: { rows?: Array<{ metric: string; value: unknown }> } })
      ?.audit_table?.rows ?? [];
    expect(rows.some((r) => r.metric === 'status' && r.value === 'SKIPPED')).toBe(true);
    expect(sawMeta).toBe(true);
  });

  // ---------------------------------------------------------------------
  // G5 + C1 — compute-parcel-cost-estimates.js (needs matching rate/index
  // ISO signals so C2's rateChanged check doesn't override the SKIP).
  // ---------------------------------------------------------------------
  it('G5 (compute-parcel-cost-estimates): SKIP (own completed, zero upstream, matching rate/index ISO keys) emits a COMPLETED-shaped summary (DS4)', async () => {
    const live = await costEstimates.readCostVersionSignals(pool);
    await pool.query(
      `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, records_meta)
       VALUES ($1, 'completed', NOW() - interval '10 minutes', NOW() - interval '9 minutes', $2::jsonb)`,
      [costEstimates.OWN_SLUGS[0], JSON.stringify({ rates_as_of: live.ratesAsOf, index_updated_at: live.indexUpdatedAt })],
    );
    const { summary, sawMeta } = await captureEmitted(() => costEstimates.main(pool));
    expect(summary).toMatchObject({ records_total: 0, records_new: 0, records_updated: 0 });
    expect((summary?.records_meta as Record<string, unknown>)?.rates_as_of).toBe(live.ratesAsOf);
    expect((summary?.records_meta as Record<string, unknown>)?.index_updated_at).toBe(live.indexUpdatedAt);
    const rows = (summary?.records_meta as { audit_table?: { rows?: Array<{ metric: string; value: unknown }> } })
      ?.audit_table?.rows ?? [];
    expect(rows.some((r) => r.metric === 'status' && r.value === 'SKIPPED')).toBe(true);
    expect(rows.some((r) => r.metric === 'reason' && r.value === 'no_upstream_changes')).toBe(true);
    expect(sawMeta).toBe(true);
  });

  // ---------------------------------------------------------------------
  // C2 (behavioral half) — a rate bump forces RUN even though the ledger
  // gate itself would SKIP (zero upstream enrich_parcels activity).
  // ---------------------------------------------------------------------
  it('C2: a stale rates_as_of in ownLastRecordsMeta forces a RUN (computeParcelCostEstimates actually invoked, not skipped)', async () => {
    await pool.query(
      `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, records_meta)
       VALUES ($1, 'completed', NOW() - interval '10 minutes', NOW() - interval '9 minutes', $2::jsonb)`,
      [costEstimates.OWN_SLUGS[0], JSON.stringify({ rates_as_of: '1900-01-01', index_updated_at: null })],
    );
    // rowLimit is intentionally left UNSET — passing one would itself bypass the
    // gate (a separate, deliberate bypass channel), which would prove nothing
    // about the rate signal specifically. This case must prove the RATE signal
    // alone is what forced the run.
    const { summary } = await captureEmitted(() => costEstimates.main(pool));
    // A real (non-skip) run reports the engine's own audit_table (phase 88, name
    // 'Parcel Cost Estimation') with a residential_parcels_examined row — the
    // SKIP shape never has that metric.
    const rows = (summary?.records_meta as { audit_table?: { rows?: Array<{ metric: string }> } })?.audit_table?.rows ?? [];
    expect(rows.some((r) => r.metric === 'residential_parcels_examined')).toBe(true);
  }, 60000);

  // ---------------------------------------------------------------------
  // C1 — canonical ISO version keys (not a Date.toString() blob).
  // ---------------------------------------------------------------------
  it('C1: readCostVersionSignals returns canonical ISO strings, never a Date.toString() blob', async () => {
    await pool.query(
      `INSERT INTO archetype_cost_rates (archetype, cost_per_sqm, cost_adjustment_factor, escalation_index_base, as_of_date)
       VALUES ('__fx_b3_c1__', 1000, 1.0, 1.0, '2026-06-15')
       ON CONFLICT (archetype) DO UPDATE SET as_of_date = EXCLUDED.as_of_date`,
    );
    try {
      const signals = await costEstimates.readCostVersionSignals(pool);
      expect(signals.ratesAsOf).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(signals.ratesAsOf).not.toMatch(/GMT|[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2}/); // no Date.toString() weekday/GMT blob
      if (signals.indexUpdatedAt) {
        expect(signals.indexUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
      }
    } finally {
      await pool.query(`DELETE FROM archetype_cost_rates WHERE archetype = '__fx_b3_c1__'`);
    }
  });

  // ---------------------------------------------------------------------
  // W2 — wsib partial index (migration 243) landed.
  // ---------------------------------------------------------------------
  it('W2: idx_wsib_registry_unlinked exists, scoped to linked_entity_id IS NULL', async () => {
    const { rows } = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'wsib_registry' AND indexname = 'idx_wsib_registry_unlinked'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].indexdef).toMatch(/linked_entity_id IS NULL/);
  });
});
