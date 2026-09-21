// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.9
//
// Phase B B3 — the run-ledger gate's callers, live-DB.
//
// FOLD-V6 (batch-2 row 2.4, 2026-09-21) — compute-parcel-cost-estimates.js is RE-HOMED out of
// this file, the SAME treatment link-wsib.js and link-parcel-addresses.js already got below
// (LW-D16 / LPA-D-class): the frozen shape carries no `main(pool)`/`OWN_SLUGS`/
// `readCostVersionSignals`/`hasRateOrIndexChanged` exports at all any more, and CPCE-A1 RULED
// the gate itself knowingly-retired as a mechanism for this step specifically (`runEnrichPhase`
// has no `ledgerGatedSkip` call and this step has no lineage-stamp column). SIX cases here
// named this caller (not two, as an earlier fold pass under-counted): G5, B-R1, C2, C1, D#2/D-R1,
// D#3. Per-case disposition, verified against the live code, not assumed:
//   G5 (SKIP emits a COMPLETED-shaped summary)         → RETIRED, successor:
//     src/tests/db/compute-parcel-cost-estimates-violations.db.test.ts test 8 (an unchanged
//     re-run's records_updated stays 0 — the observable G5 protected, without a gate to skip).
//   B-R1 (skip row carries null_geom_basis_count/engine_error_count + line_coverage/
//     area_confidence)                                  → RETIRED, successor: …violations.db.test.ts
//     test 18 (post_phase emits the FULL audit table unconditionally, including on 0 writes).
//   C2 (a stale rates_as_of forces a RUN)                → RETIRED, NO SUCCESSOR. With no gate,
//     every invocation IS a run — there is nothing left for a "forces a run" claim to compare
//     against, and none is invented.
//   C1 (readCostVersionSignals returns canonical ISO strings)  → RE-DERIVED in
//     …violations.db.test.ts test 19 (the F9 version stamps, `records_meta.rates_as_of`/
//     `index_updated_at`, still canonical ISO, sourced from `updated_at`).
//   D#2 / D-R1 (a cost_per_sqm edit with as_of_date unchanged forces a RUN)  → RETIRED as a GATE
//     claim (nothing to force any more), but its FENCE survives: the MAX(updated_at)-not-
//     MAX(as_of_date) source is re-derived in test 19 RED-1.
//   D#3 (the index VALUE read atomically with its VERSION)  → RE-DERIVED in test 19 RED-2, with
//     the FOLD-V9(2) amendment stated there: the priced value is now the hoisted
//     `ctx.config.cost_escalation_index`, and the atomic-read fence survives in substance
//     because `readCostContract` still runs inside `pipeline.withAdvisoryLock`.
// The other 3 cases below (W2, the two B-R4 anomaly cases) are UNCHANGED — proven by this same
// file continuing to pass them.
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

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { detectDurationAnomalies } from '@/lib/quality/types';

describe.skipIf(!dbAvailable())('Phase B B3 — run-ledger gate callers (live DB) — W2 + B-R4 only (compute-parcel-cost-estimates re-homed above)', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = getTestPool() as Pool;
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
