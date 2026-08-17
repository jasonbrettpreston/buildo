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
import { detectDurationAnomalies } from '@/lib/quality/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const linkWsib = require('../../../scripts/link-wsib.js') as {
  main: (pool: Pool) => Promise<void>;
  OWN_SLUGS: string[];
  UPSTREAM_SLUGS: string[];
  readThresholdVersionSignal: (pool: Pool) => Promise<{ thresholdUpdatedAt: string | null }>;
  FORCE_FULL_ENV: string;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const linkParcelAddresses = require('../../../scripts/link-parcel-addresses.js') as {
  main: (pool: Pool) => Promise<void>;
  OWN_SLUGS: string[];
  UPSTREAM_SLUGS: string[];
  FORCE_FULL_ENV: string;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const costEstimates = require('../../../scripts/compute-parcel-cost-estimates.js') as {
  main: (pool: Pool, opts?: { dryRun?: boolean; rowLimit?: number | null }) => Promise<void>;
  readCostVersionSignals: (pool: Pool) => Promise<{ ratesAsOf: string | null; indexUpdatedAt: string | null; indexValue: number | null }>;
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

  // Commit A tests (A-R1/A-R3) need the run to actually REACH the tier-matching
  // code past the (unrelated) `totalUnlinked === 0` vacuous-skip short-circuit —
  // the testcontainer DB's wsib_registry starts empty (it's pipeline-ingested
  // data, not migration-seeded), so a fixture row is required.
  const FX_WSIB_LEGAL_NORM = 'FX B3 COMMIT A TEST CO';
  async function seedUnlinkedWsibRow() {
    await pool.query(
      `INSERT INTO wsib_registry (legal_name, legal_name_normalized, predominant_class, mailing_address)
       VALUES ('FX B3 Commit A Test Co', $1, 'G1', 'FX-B3-ADDR')
       ON CONFLICT (legal_name_normalized, mailing_address) DO UPDATE SET linked_entity_id = NULL`,
      [FX_WSIB_LEGAL_NORM],
    );
  }
  async function cleanupUnlinkedWsibRow() {
    await pool.query(`DELETE FROM wsib_registry WHERE legal_name_normalized = $1`, [FX_WSIB_LEGAL_NORM]);
  }

  beforeAll(() => {
    pool = getTestPool() as Pool;
  });

  afterEach(async () => {
    await cleanup(linkWsib.OWN_SLUGS);
    await cleanup(linkParcelAddresses.OWN_SLUGS);
    await cleanup(costEstimates.OWN_SLUGS);
    await cleanupUnlinkedWsibRow();
  });

  // ---------------------------------------------------------------------
  // G5 — link-wsib.js
  // ---------------------------------------------------------------------
  it('G5 (link-wsib): vacuous SKIP (own completed, zero upstream activity) emits a COMPLETED-shaped summary (DS4)', async () => {
    // Commit A's threshold-version signal is a SECOND, independent skip
    // condition — this fixture must also match the LIVE wsib_fuzzy_match_threshold
    // updated_at (like the cost-estimates G5 test already does for rates_as_of/
    // index_updated_at) so the vacuous-SKIP scenario isn't confounded by it.
    const liveThreshold = await linkWsib.readThresholdVersionSignal(pool);
    await pool.query(
      `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, records_meta)
       VALUES ($1, 'completed', NOW() - interval '10 minutes', NOW() - interval '9 minutes', $2::jsonb)`,
      [linkWsib.OWN_SLUGS[0], JSON.stringify({ threshold_updated_at: liveThreshold.thresholdUpdatedAt })],
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
    await seedUnlinkedWsibRow();
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
    await seedUnlinkedWsibRow();
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
  // Commit B — link-wsib.js skip-path audit rows (B-R1/B-R2/B-R3).
  // ---------------------------------------------------------------------
  it('B-R1 (link-wsib): the skip row carries link_rate from the prior real run, and stamps own_started/last_full_run_at/consecutive_skips', async () => {
    // Match the LIVE threshold signal (same reasoning as the G5 fixture above)
    // so the ledger gate's SKIP isn't overridden by Commit A's threshold check.
    const liveThreshold = await linkWsib.readThresholdVersionSignal(pool);
    const priorMeta = {
      threshold_updated_at: liveThreshold.thresholdUpdatedAt,
      audit_table: { rows: [{ metric: 'link_rate', value: '11.5%', threshold: '>= 5%', status: 'PASS' }] },
    };
    await pool.query(
      `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, records_meta)
       VALUES ($1, 'completed', NOW() - interval '10 minutes', NOW() - interval '9 minutes', $2::jsonb)`,
      [linkWsib.OWN_SLUGS[0], JSON.stringify(priorMeta)],
    );
    const { summary } = await captureEmitted(() => linkWsib.main(pool));
    const meta = summary?.records_meta as { own_started?: string; last_full_run_at?: string; consecutive_skips?: number; audit_table?: { rows?: Array<{ metric: string }> } };
    expect(meta.audit_table?.rows?.some((r) => r.metric === 'link_rate')).toBe(true);
    expect(meta.own_started).toBeTruthy();
    expect(meta.last_full_run_at).toBeTruthy();
    expect(meta.consecutive_skips).toBe(1);
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
  // Commit B — link-parcel-addresses.js skip-path audit rows (B-R1).
  // ---------------------------------------------------------------------
  it('B-R1 (link-parcel-addresses): the skip row carries address_points_with_no_parcel_pct + a FAIL errors gate, and the verdict cascades to FAIL', async () => {
    const priorMeta = {
      audit_table: {
        rows: [
          { metric: 'address_points_with_no_parcel_pct', value: '2.1%', threshold: '< 5%', status: 'PASS' },
          { metric: 'errors', value: 1, threshold: '== 0', status: 'FAIL' },
        ],
      },
    };
    await pool.query(
      `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, records_meta)
       VALUES ($1, 'completed', NOW() - interval '10 minutes', NOW() - interval '9 minutes', $2::jsonb)`,
      [linkParcelAddresses.OWN_SLUGS[0], JSON.stringify(priorMeta)],
    );
    const { summary } = await captureEmitted(() => linkParcelAddresses.main(pool));
    const meta = summary?.records_meta as { audit_table?: { verdict?: string; rows?: Array<{ metric: string }> } };
    expect(meta.audit_table?.rows?.some((r) => r.metric === 'address_points_with_no_parcel_pct')).toBe(true);
    expect(meta.audit_table?.rows?.some((r) => r.metric === 'errors')).toBe(true);
    // the carried FAIL row must propagate — never a bare hardcoded PASS.
    expect(meta.audit_table?.verdict).toBe('FAIL');
  }, 30000);

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
  // Commit B — compute-parcel-cost-estimates.js skip-path audit rows (B-R1).
  // ---------------------------------------------------------------------
  it('B-R1 (compute-parcel-cost-estimates): the skip row carries null_geom_basis_count/engine_error_count + line_coverage/area_confidence top-level keys', async () => {
    const live = await costEstimates.readCostVersionSignals(pool);
    const priorMeta = {
      rates_as_of: live.ratesAsOf,
      index_updated_at: live.indexUpdatedAt,
      line_coverage: { new_build: 500 },
      area_confidence: { high: 300, medium: 150, low: 50 },
      audit_table: {
        rows: [
          { metric: 'null_geom_basis_count', value: 0, threshold: null, status: 'INFO' },
          { metric: 'engine_error_count', value: 0, threshold: '== 0', status: 'PASS' },
        ],
      },
    };
    await pool.query(
      `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, records_meta)
       VALUES ($1, 'completed', NOW() - interval '10 minutes', NOW() - interval '9 minutes', $2::jsonb)`,
      [costEstimates.OWN_SLUGS[0], JSON.stringify(priorMeta)],
    );
    const { summary } = await captureEmitted(() => costEstimates.main(pool));
    const meta = summary?.records_meta as { line_coverage?: unknown; area_confidence?: unknown; audit_table?: { rows?: Array<{ metric: string }> } };
    expect(meta.line_coverage).toEqual({ new_build: 500 });
    expect(meta.area_confidence).toEqual({ high: 300, medium: 150, low: 50 });
    expect(meta.audit_table?.rows?.some((r) => r.metric === 'null_geom_basis_count')).toBe(true);
    expect(meta.audit_table?.rows?.some((r) => r.metric === 'engine_error_count')).toBe(true);
  }, 30000);

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
  // Commit D — version signals (D#2/D#3/D-R1/D-R2/D#6).
  // ---------------------------------------------------------------------
  it('D#2 / D-R1: an archetype cost_per_sqm EDIT (with updated_at bumped, as_of_date UNCHANGED) forces RUN — the business date alone cannot see it', async () => {
    await pool.query(
      `INSERT INTO archetype_cost_rates (archetype, cost_per_sqm, cost_adjustment_factor, escalation_index_base, as_of_date)
       VALUES ('__fx_b3_d2__', 1000, 1.0, 1.0, '2026-06-30')
       ON CONFLICT (archetype) DO UPDATE SET cost_per_sqm = 1000, as_of_date = '2026-06-30'`,
    );
    try {
      const before = await costEstimates.readCostVersionSignals(pool);
      // Seed the gate as SKIP-eligible with the OWN-last run stamped to the PRE-edit signal.
      await pool.query(
        `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, records_meta)
         VALUES ($1, 'completed', NOW() - interval '10 minutes', NOW() - interval '9 minutes', $2::jsonb)`,
        [costEstimates.OWN_SLUGS[0], JSON.stringify({ rates_as_of: before.ratesAsOf, index_updated_at: before.indexUpdatedAt })],
      );
      // A real correction: cost_per_sqm changes, updated_at bumps, as_of_date STAYS 2026-06-30
      // (the business date a genuinely business-date-anchored signal would miss).
      await pool.query(
        `UPDATE archetype_cost_rates SET cost_per_sqm = 1234.56, updated_at = NOW() WHERE archetype = '__fx_b3_d2__'`,
      );
      const after = await costEstimates.readCostVersionSignals(pool);
      expect(after.ratesAsOf).not.toBe(before.ratesAsOf); // MAX(updated_at) moved
      const { summary } = await captureEmitted(() => costEstimates.main(pool));
      const rows = (summary?.records_meta as { audit_table?: { rows?: Array<{ metric: string }> } })?.audit_table?.rows ?? [];
      // A real (non-skip) run reports residential_parcels_examined — the SKIP shape never has it.
      expect(rows.some((r) => r.metric === 'residential_parcels_examined')).toBe(true);
    } finally {
      await pool.query(`DELETE FROM archetype_cost_rates WHERE archetype = '__fx_b3_d2__'`);
    }
  }, 60000);

  it('D#3: readCostVersionSignals reads the escalation index VALUE atomically with its VERSION (one query, both fields present)', async () => {
    const signals = await costEstimates.readCostVersionSignals(pool);
    expect('indexValue' in signals).toBe(true);
    if (signals.indexValue != null) {
      expect(Number.isFinite(signals.indexValue)).toBe(true);
    }
  });

  it('D#4: LINK_WSIB_FORCE_FULL bypasses the gate even when SKIP-eligible', async () => {
    await seedUnlinkedWsibRow();
    await pool.query(
      `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at)
       VALUES ($1, 'completed', NOW() - interval '10 minutes', NOW() - interval '9 minutes')`,
      [linkWsib.OWN_SLUGS[0]],
    );
    const original = process.env[linkWsib.FORCE_FULL_ENV];
    process.env[linkWsib.FORCE_FULL_ENV] = '1';
    try {
      const { summary } = await captureEmitted(() => linkWsib.main(pool));
      const auditTable = (summary?.records_meta as { audit_table?: { name?: string } })?.audit_table;
      expect(auditTable?.name).toBe('WSIB Registry Matching'); // the REAL run's name, not the SKIP shape's 'Link WSIB'
    } finally {
      if (original === undefined) delete process.env[linkWsib.FORCE_FULL_ENV];
      else process.env[linkWsib.FORCE_FULL_ENV] = original;
    }
  }, 30000);

  it('D#4: LINK_PARCEL_ADDRESSES_FORCE_FULL bypasses the gate even when SKIP-eligible', async () => {
    await pool.query(
      `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at)
       VALUES ($1, 'completed', NOW() - interval '10 minutes', NOW() - interval '9 minutes')`,
      [linkParcelAddresses.OWN_SLUGS[0]],
    );
    const original = process.env[linkParcelAddresses.FORCE_FULL_ENV];
    process.env[linkParcelAddresses.FORCE_FULL_ENV] = '1';
    try {
      const { summary } = await captureEmitted(() => linkParcelAddresses.main(pool));
      const rows = (summary?.records_meta as { audit_table?: { rows?: Array<{ metric: string; value: unknown }> } })
        ?.audit_table?.rows ?? [];
      // The SKIP shape's first row is status:'SKIPPED' — a real run never emits it.
      expect(rows.some((r) => r.metric === 'status' && r.value === 'SKIPPED')).toBe(false);
      expect(rows.some((r) => r.metric === 'parcel_link_rate_pct')).toBe(true); // real-run-only metric
    } finally {
      if (original === undefined) delete process.env[linkParcelAddresses.FORCE_FULL_ENV];
      else process.env[linkParcelAddresses.FORCE_FULL_ENV] = original;
    }
  }, 60000);

  it('D#6: UPSTREAM_SLUGS for compute-parcel-cost-estimates includes sources:parcels/load-parcels (lot_size_sqm is a direct cost-engine input)', () => {
    expect(costEstimates.UPSTREAM_SLUGS).toEqual(
      expect.arrayContaining(['sources:parcels', 'parcels', 'load-parcels']),
    );
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

  // ---------------------------------------------------------------------
  // B-R4 — a gated-skip row does not collapse the duration-anomaly baseline
  // (src/app/api/quality/route.ts's records_meta.gated_skip exclusion, feeding
  // src/lib/quality/types.ts#detectDurationAnomalies). Mirrors route.ts's SQL
  // predicate directly against a real DB — the pure function itself cannot
  // distinguish a gate skip from a genuinely fast run once given raw numbers.
  // ---------------------------------------------------------------------
  describe('B-R4 — gated-skip duration exclusion (route.ts query + detectDurationAnomalies)', () => {
    const FX_SLUG = 'FX_B3_duration_baseline';

    afterEach(async () => {
      await pool.query(`DELETE FROM pipeline_runs WHERE pipeline = $1`, [FX_SLUG]);
    });

    async function fetchDurations(): Promise<number[]> {
      const { rows } = await pool.query(
        `SELECT duration_ms FROM (
           SELECT duration_ms, ROW_NUMBER() OVER (ORDER BY started_at DESC) AS rn
           FROM pipeline_runs
           WHERE pipeline = $1 AND status = 'completed' AND duration_ms IS NOT NULL
             AND COALESCE((records_meta->>'gated_skip')::boolean, false) = false
         ) sub WHERE rn <= 8 ORDER BY rn`,
        [FX_SLUG],
      );
      return rows.map((r: { duration_ms: number }) => Number(r.duration_ms));
    }

    it('excludes gated_skip:true rows from the fetched duration history entirely', async () => {
      // 6 real runs at ~50000ms, then a burst of gated skips at ~300ms each.
      for (let i = 0; i < 6; i++) {
        await pool.query(
          `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, duration_ms, records_meta)
           VALUES ($1, 'completed', NOW() - ($2 || ' minutes')::interval, NOW() - ($2 || ' minutes')::interval, 50000, NULL)`,
          [FX_SLUG, String(100 + i * 10)],
        );
      }
      for (let i = 0; i < 5; i++) {
        await pool.query(
          `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, duration_ms, records_meta)
           VALUES ($1, 'completed', NOW() - ($2 || ' minutes')::interval, NOW() - ($2 || ' minutes')::interval, 300, $3::jsonb)`,
          [FX_SLUG, String(10 + i), JSON.stringify({ gated_skip: true })],
        );
      }
      const durations = await fetchDurations();
      expect(durations.every((d) => d === 50000)).toBe(true);
      expect(durations.length).toBe(6);
    }, 30000);

    it('a burst of gated skips followed by a normal-duration run does NOT trip a false-positive anomaly', async () => {
      for (let i = 0; i < 6; i++) {
        await pool.query(
          `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, duration_ms, records_meta)
           VALUES ($1, 'completed', NOW() - ($2 || ' minutes')::interval, NOW() - ($2 || ' minutes')::interval, 50000, NULL)`,
          [FX_SLUG, String(200 + i * 10)],
        );
      }
      for (let i = 0; i < 7; i++) {
        await pool.query(
          `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, duration_ms, records_meta)
           VALUES ($1, 'completed', NOW() - ($2 || ' minutes')::interval, NOW() - ($2 || ' minutes')::interval, 300, $3::jsonb)`,
          [FX_SLUG, String(20 + i), JSON.stringify({ gated_skip: true })],
        );
      }
      // The next run is genuinely normal (50000ms, same as the real baseline) —
      // must NOT be flagged, because the gated-skip burst was excluded upstream.
      await pool.query(
        `INSERT INTO pipeline_runs (pipeline, status, started_at, completed_at, duration_ms, records_meta)
         VALUES ($1, 'completed', NOW() - interval '1 minute', NOW() - interval '1 minute', 50000, NULL)`,
        [FX_SLUG],
      );
      const durations = await fetchDurations();
      const anomalies = detectDurationAnomalies({ [FX_SLUG]: durations });
      expect(anomalies).toEqual([]);
    }, 30000);
  });
});
