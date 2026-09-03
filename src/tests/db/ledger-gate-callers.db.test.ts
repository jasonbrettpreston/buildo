// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.9
//
// Phase B B3 — the run-ledger gate WIRED INTO its one remaining hand-rolled caller
// (compute-parcel-cost-estimates.js), live-DB.
//
// LPA-D-class (2026-08-29, C1 pilot 5 commit 7) — link-parcel-addresses.js's portion
// (the G5 / B-R1 cases below) is RE-HOMED, not deleted: the frozen shape carries no
// gate.skip block at all any more (staleness.ledgerGatedSkip is generic library code,
// scripts/lib/step/index.js runMaterializePhase). The equivalent guarantee (a gated
// skip re-emits a row-derived summary, never a hardcoded 'PASS') is now asserted
// against the DESCRIPTOR/library shape in
// src/tests/steps/link_parcel_addresses/violations.test.ts (the ledgerGatedSkip-wired
// fence lock) rather than by calling the old script's exported main(pool) directly —
// the same treatment link_wsib got at pilot 4 (LW-D16, below this comment).
//
// LW-D16 (2026-08-28, WF3-E) — CORRECTED CLAIM. link-wsib.js's portion was declared
// "RE-HOMED, not deleted (A-5, C1 pilot 4 commit 7)" to
// `src/tests/steps/link_wsib/ledger-gate.db.test.ts` — that file was NEVER CREATED
// (`git log --all` on the path returns nothing; confirmed 2026-08-28). Root cause,
// found the same day: `docs/reports/review_followups.md` (the "assert_current_database
// vs buildo_test" MED item) — every converted step declares
// `database.assert_current_database: "postgres"`, and `assertDbTarget` REFUSES any
// other name, but `setup-testcontainer.ts` always provisions `POSTGRES_DB:
// 'buildo_test'`. A live-DB test calling `pipeline.step(LINK_WSIB, compute).run({pool})`
// against the testcontainer refuses immediately — the re-home was never actually
// buildable, and the comment was left as an aspirational TODO instead of being
// corrected when that was discovered. That gap is unresolved and stays a named
// followup (the MED item above), not fixed here — a test-infrastructure change, not a
// step conversion.
//
// What IS covered, this commit: `staleness.ledgerGatedSkip` — the LG-15 gate
// `runCascadePhase` actually calls for `link_wsib` — never had a direct behavioral
// test at all (live-DB or otherwise); it was only exercised indirectly through the
// converted step's own `violations.test.ts` fixture matrix. Five fake-pool
// (no live DB, no testcontainer) behavioral locks now live in
// `src/tests/step-library.logic.test.ts`'s "LW-D16" describe block, proven red-first:
// bypassed:true never SKIPs even against a matching baseline; a changed
// config_version signal forces skip:false even when the ledger gate alone reads
// skip:true; an absent baseline reads its config signal as fail-safe changed:true;
// `gate.ownLastRecordsMeta` passes a prior run's meta (consecutive_skips, a
// caller-shaped metric row) through unmodified; and a hoisted, out-of-bounds
// `wsib_fuzzy_match_threshold` throws before the gate is ever reached, SKIP-eligible
// or not (config.hoisted_above_gate, §1.2a P4). Case IDs below mirror the B3
// grounding fold's red-first table:
//   G5 skip-emits-summary/DS4 (ⓔ child) — for the one remaining caller, calling
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
const costEstimates = require('../../../scripts/compute-parcel-cost-estimates.js') as {
  main: (pool: Pool, opts?: { dryRun?: boolean; rowLimit?: number | null }) => Promise<void>;
  readCostVersionSignals: (pool: Pool) => Promise<{ ratesAsOf: string | null; indexUpdatedAt: string | null; indexValue: number | null }>;
  hasRateOrIndexChanged: (meta: Record<string, unknown> | null, signals: { ratesAsOf: string | null; indexUpdatedAt: string | null }) => boolean;
  OWN_SLUGS: string[];
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
    await cleanup(costEstimates.OWN_SLUGS);
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

  // D#4 (link-wsib): LINK_WSIB_FORCE_FULL bypass — LW-D16, corrected claim: NOT
  // re-homed (no such file was ever created — see the file header). The bypass
  // half is covered by the fake-pool "bypassed:true never SKIPs" lock in
  // step-library.logic.test.ts's "LW-D16" describe block; a live-DB equivalent
  // stays blocked on the assert_current_database-vs-buildo_test MED followup.
  //
  // D#4 (link-parcel-addresses) — SAME treatment, C1 pilot 5 commit 7, 2026-08-29. The
  // frozen shape carries no exported `main(pool)`/OWN_SLUGS/FORCE_FULL_ENV any more
  // (pipeline.step()'s `run({pool, chainId})` shape only), so this live-DB call site was
  // never re-buildable either. LINK_PARCEL_ADDRESSES_FORCE_FULL's bypass is the SAME
  // generic `staleness.ledgerGatedSkip({bypassed})` path every converted LINK/CASCADE/
  // MATERIALIZE step shares — covered by the fake-pool lock in
  // step-library.logic.test.ts and the step's own descriptor assertion
  // (`d.override.force_full === "LINK_PARCEL_ADDRESSES_FORCE_FULL"`,
  // src/tests/steps/link_parcel_addresses/violations.test.ts).
  //
  // D#6 — UPSTREAM_SLUGS no longer exists as a module export on link-parcel-addresses.js
  // either; the equivalent coverage (deriveLedgerSlugs against the real descriptor) lives
  // in src/tests/link-parcel-addresses-ledger-gate.logic.test.ts.

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
