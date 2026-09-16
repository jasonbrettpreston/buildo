// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-3A (optimal-config enrich pass)
//
// Logic locks for the enrich-parcels optimal-config pass (Spec 78 Phase 3A):
//  - mapRowToEngineInput: DB row → engine input (units, coverage %→frac, boolean flags, storey fallback)
//  - computeOptConfigRow: the 12-value write tuple + the exception_number confidence downgrade
//  - buildNearbyBuildsSummary: headline + basis (neighbourhood vs citywide_fallback), NULL on no norms
//  - the write-column list + the select SQL shape (scopeWhere, citywide CROSS JOIN, eligibility gate)

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ep = require('../../scripts/lib/compute/enrich-parcels.js');

const baseRow = {
  id: 1, lot_size_sqm: '400', frontage_m: '12', depth_m: '35', max_buildable_footprint_sqm: '140',
  max_buildable_gfa_sqm: '300', bylaw_max_fsi: null, bylaw_max_coverage_pct: '35', max_build_stories: 2,
  abuts_laneway: false, zoning_holding: null, is_through_lot: false, is_heritage_designated: false,
  is_in_ravine_protection_area: false, exception_number: null, existing_greenspace_sqm: '150',
  existing_other_structures_sqm: '0', existing_other_structures_count: 0, lot_size_confidence: 'high',
  neighbourhood_id: 5, neighbourhood_name: 'East York', used_citywide: false,
  storeys_p50: 2, storeys_p90: 3, new_builds_5yr: 25, additions_5yr: 88, renos_5yr: 81,
  suites_5yr: 3, demos_5yr: 1, realized_fsi_p50: '0.9', build_ratio_p50: '0.8',
  existing_build_ratio_p25: '0.55', existing_build_ratio_p50: '0.62', coa_approved: 19, coa_refused: 1,
  coa_approval_rate: '0.95', window_start: '2021-06-01', window_end: '2026-06-01', nbn_sample_n: 195,
};

describe('optconfig mapRowToEngineInput', () => {
  it('maps coverage % → fraction, booleans, and the storey fallback to max_build_stories', () => {
    const i = ep.mapRowToEngineInput(baseRow);
    expect(i.lotSizeSqm).toBe(400);
    expect(i.coverageCapFrac).toBeCloseTo(0.35, 5);   // 35 pct → 0.35 frac
    expect(i.fsiCap).toBeNull();
    expect(i.nbhdStoreysP50).toBe(2);
    expect(i.abutsLaneway).toBe(false);
    expect(i.rearBehindMaxM).toBeNull();              // 3A area-only fit
    expect(i.rearYardAreaSqm).toBe(150);              // greenspace proxy
  });

  it("'H' holding → isHolding; through-lot + heritage + ravine flags map through", () => {
    const i = ep.mapRowToEngineInput({ ...baseRow, zoning_holding: 'H', is_through_lot: true, is_heritage_designated: true, is_in_ravine_protection_area: true });
    expect(i.isHolding).toBe(true);
    expect(i.isThroughLot).toBe(true);
    expect(i.isHeritageFreeze).toBe(true);
    expect(i.isRavine).toBe(true);
  });

  it('falls back to max_build_stories when the nbhd storey norm is absent', () => {
    const i = ep.mapRowToEngineInput({ ...baseRow, storeys_p50: null, storeys_p90: null, max_build_stories: 3 });
    expect(i.nbhdStoreysP50).toBe(3);
    expect(i.nbhdStoreysP90).toBe(3);
  });

  it('WF3: maxBuildStories = the max_build_stories column (envelope cap for the as-of-right tier)', () => {
    expect(ep.mapRowToEngineInput(baseRow).maxBuildStories).toBe(2);
  });

  it('WF3: maxBuildStories derives from gfa/footprint ONLY on heritage_existing basis (exact integer)', () => {
    // heritage: max_build_stories NULL, envelope gfa = footprint × frozen storeys (280/140 = 2), basis heritage.
    const i = ep.mapRowToEngineInput({ ...baseRow, max_build_stories: null, max_buildable_gfa_basis: 'heritage_existing', max_buildable_gfa_sqm: '280', max_buildable_footprint_sqm: '140' });
    expect(i.maxBuildStories).toBe(2);
    // NON-heritage basis with null stories + FSI-bound gfa → do NOT derive (engine's fsiCap bounds it;
    // a fractional-ratio storey cap would under-state opt_aor). [Regression Guardian guard]
    expect(ep.mapRowToEngineInput({ ...baseRow, max_build_stories: null, max_buildable_gfa_basis: 'fsi', max_buildable_gfa_sqm: '200', max_buildable_footprint_sqm: '140' }).maxBuildStories).toBeNull();
    // both NULL (no envelope) → null → uncapped.
    expect(ep.mapRowToEngineInput({ ...baseRow, max_build_stories: null, max_buildable_gfa_sqm: null }).maxBuildStories).toBeNull();
  });
});

describe('optconfig computeOptConfigRow', () => {
  it('produces the 12-value tuple [aorStoreys,aorGfa,units,coaStoreys,coaGfa,type,fits,binding,conf,cfg,nearby,id]', () => {
    const row = ep.computeOptConfigRow(baseRow);
    expect(row).toHaveLength(12);
    expect(row[0]).toBe(2);                 // aor storeys (p50)
    expect(row[1]).toBeGreaterThan(100);    // aor gfa (140 footprint × 2)
    expect([1, 2]).toContain(row[2]);       // units
    expect(row[3]).toBe(3);                 // coa storeys (p90)
    expect(row[4]).toBeGreaterThan(row[1]); // coa gfa > aor gfa (storeys up)
    expect(['garden', 'laneway', 'none']).toContain(row[5]);
    expect(typeof row[6]).toBe('boolean');
    expect(row[11]).toBe(baseRow.id);       // id last
    expect(JSON.parse(row[9]).bylaw_version).toBe('569-2013_consolidation_2025');
  });

  it('downgrades high confidence to medium when an exception_number is present (unparsed provision)', () => {
    // high requires fsiCap present + no accessory suspected
    const high = { ...baseRow, bylaw_max_fsi: '1.0', existing_other_structures_count: 0 };
    expect(ep.computeOptConfigRow(high)[8]).toBe('high');
    expect(ep.computeOptConfigRow({ ...high, exception_number: 'X123' })[8]).toBe('medium');
  });

  it('units = 2 when a suite fits, 1 otherwise', () => {
    const row = ep.computeOptConfigRow(baseRow);
    expect(row[2]).toBe(row[6] ? 2 : 1);
  });
});

describe('optconfig buildNearbyBuildsSummary', () => {
  it('builds a headline with the neighbourhood name + 5-yr counts + CoA approval', () => {
    const s = ep.buildNearbyBuildsSummary(baseRow);
    expect(s.basis).toBe('neighbourhood');
    expect(s.headline).toContain('East York');
    expect(s.headline).toContain('25 new builds');
    expect(s.headline).toContain('95% approval');
    expect(s.sample_n).toBe(195);
  });

  it('labels basis citywide_fallback + headline "Citywide" when used_citywide', () => {
    const s = ep.buildNearbyBuildsSummary({ ...baseRow, used_citywide: true });
    expect(s.basis).toBe('citywide_fallback');
    expect(s.headline).toContain('Citywide');
  });

  it('returns null when the parcel has no neighbourhood build-norm row (no sample)', () => {
    expect(ep.buildNearbyBuildsSummary({ ...baseRow, nbn_sample_n: null })).toBeNull();
  });

  // WF3 phase A — typical_fsi fallback + comp_fsi_basis transparency.
  it('typical_fsi = comp_fsi_p50 when present (basis comp) + FSI in headline', () => {
    const s = ep.buildNearbyBuildsSummary({ ...baseRow, comp_fsi_p50: '0.83' });
    expect(s.typical_fsi).toBeCloseTo(0.83, 2);
    expect(s.comp_fsi_basis).toBe('comp');
    expect(s.headline).toContain('~0.83 FSI');
  });

  it('typical_fsi falls back to realized_fsi_p50 when comp_fsi_p50 NULL (basis pocket_realized)', () => {
    const s = ep.buildNearbyBuildsSummary({ ...baseRow, comp_fsi_p50: null }); // realized_fsi_p50 = '0.9'
    expect(s.typical_fsi).toBeCloseTo(0.9, 2);
    expect(s.comp_fsi_basis).toBe('pocket_realized');
    expect(s.headline).toContain('~0.90 FSI');
  });

  it('basis none + no FSI clause when both comp and realized are NULL', () => {
    const s = ep.buildNearbyBuildsSummary({ ...baseRow, comp_fsi_p50: null, realized_fsi_p50: null });
    expect(s.typical_fsi).toBeNull();
    expect(s.comp_fsi_basis).toBe('none');
    expect(s.headline).not.toContain('FSI');
  });
});

describe('optconfig SQL shape', () => {
  it('the write-column list is the 11 §I/§J columns', () => {
    expect(ep.OPTCFG_WRITE_COLS).toHaveLength(11);
    expect(ep.OPTCFG_WRITE_COLS).toContain('optimal_config');
    expect(ep.OPTCFG_WRITE_COLS).toContain('nearby_builds_summary');
  });

  it('select gates on a max-build envelope, uses the P2 3-level family fallback, and honours scopeWhere + incremental', () => {
    const sql = ep.buildOptConfigSelectSql({ full: false, scopeWhere: "p.parcel_id = 'X'" });
    expect(sql).toContain('max_buildable_footprint_sqm IS NOT NULL');
    // P2 family-aware read: pocket-family (nbn) + citywide-family (cwf) + citywide-'all' backstop (cwa).
    expect(sql).toContain('nbn.structure_family =');                                  // pocket-family predicate
    expect(sql).toContain('cwf.structure_family =');                                  // citywide-family predicate
    expect(sql).toContain("neighbourhood_id IS NULL AND structure_family = 'all') cwa"); // citywide 'all' CROSS JOIN
    expect(sql).toContain('COALESCE(nbn.realized_fsi_p90, cwf.realized_fsi_p90, cwa.realized_fsi_p90)'); // 3-level, incl. R2 FSI p90
    expect(sql).toContain("p.parcel_id = 'X'");               // scopeWhere injected
    expect(sql).toContain('opt_config_confidence IS NULL');   // incremental (full=false)
    expect(ep.buildOptConfigSelectSql({ full: true })).not.toContain('opt_config_confidence IS NULL');
  });
});

// D#5 (B3 output-panel remediation) — OPTCFG_GENUINE_COLS + computeAggregateRecordsUpdated.
describe('D#5 — OPTCFG_GENUINE_COLS (nearby_builds_summary excluded from the genuine-change guard)', () => {
  it('is the 9 flat opt_* columns + optimal_config (10 total), NOT nearby_builds_summary', () => {
    expect(ep.OPTCFG_GENUINE_COLS).toHaveLength(10);
    expect(ep.OPTCFG_GENUINE_COLS).toContain('optimal_config');
    expect(ep.OPTCFG_GENUINE_COLS).not.toContain('nearby_builds_summary');
  });

  it('is derived from OPTCFG_WRITE_COLS by exclusion (stays in sync if a column is ever added)', () => {
    const expected = ep.OPTCFG_WRITE_COLS.filter((c: string) => c !== 'nearby_builds_summary');
    expect(ep.OPTCFG_GENUINE_COLS).toEqual(expected);
  });
});

describe('D#5 — computeAggregateRecordsUpdated (distinct-parcels-touched, NOT a naive sum)', () => {
  it('is a union, not a sum: overlapping ids across passes count ONCE', () => {
    const n = ep.computeAggregateRecordsUpdated({
      zoningIds: [1, 2, 3],
      maxBuildIds: [2, 3, 4], // overlaps zoning on 2,3
      existingIds: [3, 4, 5], // overlaps maxBuild on 3,4
      scenarioIds: [5],       // overlaps existing on 5
      optConfigGenuineIds: [1, 6], // overlaps zoning on 1
    });
    // distinct ids: 1,2,3,4,5,6 = 6 — a naive sum would be 3+3+3+1+2 = 12 (2×)
    expect(n).toBe(6);
  });

  it('handles a Set for optConfigGenuineIds (the real call site passes a Set, not an array)', () => {
    const n = ep.computeAggregateRecordsUpdated({
      zoningIds: [], maxBuildIds: [], existingIds: [], scenarioIds: [],
      optConfigGenuineIds: new Set([10, 20, 20]), // Set already de-dupes
    });
    expect(n).toBe(2);
  });

  it('all-empty → 0 (the honest floor: a steady-state re-run reports 0, not 802,075)', () => {
    expect(ep.computeAggregateRecordsUpdated({
      zoningIds: [], maxBuildIds: [], existingIds: [], scenarioIds: [], optConfigGenuineIds: [],
    })).toBe(0);
  });

  it('tolerates missing/undefined arrays (defensive — a pass result shape changing must not throw)', () => {
    expect(ep.computeAggregateRecordsUpdated({})).toBe(0);
  });

  it('comparable_builds is NOT one of the inputs (deliberately excluded — see the function docblock)', () => {
    const src = ep.computeAggregateRecordsUpdated.toString();
    expect(src).not.toMatch(/comp(Result|arableBuilds)Ids/);
  });
});

// The following describe blocks were RETIRED at pilot 9 commit 7e/2 (2026-09-07, ENRICHER
// thin-shell conversion) — each tested a mechanism the conversion structurally replaced, not
// merely relocated:
//   - "D#5 — main() wires the aggregate into records_updated" and "WF3 cloud-parity FIX 3.2b"
//     (both source-scanned scripts/enrich-parcels.js's own main()/LOGIC_VARS_SCHEMA text) — main()
//     and the per-step hand-rolled Zod schema no longer exist; the generic config.logic_variables[]
//     + resolveConfig mechanism (Rule 1) is what replaced them, covered by the fast invariants
//     (step-validate.mjs invariant #2/#8) and violations.test.ts's "P4 declared-tunables ⊆
//     registry" test.
//   - "WF3 cloud-parity FIX 3 remediation" and "WF3 enrich_parcels stall commit 3" (both called
//     the legacy enrichOptimalConfig(pool, {heartbeatMinutes, pipelineRunId}) — heartbeat/stall
//     diagnostics EMBEDDED inside the pass function itself) — the conversion GENERALIZED this into
//     standalone scripts/lib/step/index.js exports (recordHeartbeat/captureStallDiagnostic/
//     startStallTicker, LG-28) called by runEnrichPhase around EVERY phase, not pass-5-only. The
//     SAME behaviours (heartbeat fires log+DB update on tick, stall diagnostic captures
//     pg_stat_activity after silence, swallows errors, no-ops when runId null) are now proven
//     against the real exported functions in src/tests/step-library.logic.test.ts's own
//     "recordHeartbeat / captureStallDiagnostic / startStallTicker (LG-28, fake pool)" block, and
//     the LOUD 57014/55P03 rethrow + heartbeat-issued-per-shared-phase behaviours are proven
//     against the real runEnrichPhase in src/tests/steps/enrich_parcels/violations.test.ts.

// ---------------------------------------------------------------------------
// EP-PASS3-BACKLOG (WF3, .cursor/wf3_enrich_parcels_pass3_backlog_active_task.md C1,
// 2026-09-15) — `enrich_parcels_pass3_scope` had no expiry. Both the own-run stamp and the
// EP-D10 prune are the LAST things pass 5 does, so a run killed INSIDE pass 5 adds a full
// ~443,023-row cohort that no later run ever retires: measured on cloud 2026-09-15,
// 886,046 rows across 2 cohorts, 100% unconsumed, nothing ever consumed. `retireStaleScope`
// puts a floor under that, at STEP START, applying the ruling EP-D14's own one-off
// (`scripts/one-time/wf3-prune-pass3-scope.js`) already made and a human already executed
// once by hand — an unconsumed row from a terminal prior run is STALE, not pending
// recovery, and deleting it is byte-identical to the legacy per-parcel loop's output.
//
// Fences preserved (Regression Guardian §3, stated for each):
//   1. `run_id <> $1` — THIS run's own rows (including a parcel that threw in THIS run's
//      own stream, the `errorIds` fence at enrich-parcels.js:1509/1684) are NEVER touched.
//   2. The F3 refusal of the one-off script — retirement is skipped outright while ANY
//      OTHER `enrich_parcels` `pipeline_runs` row reads `running`. Encoded in SQL rather
//      than in a human's head; `r.id <> ownRunId` is load-bearing, because THIS run's own
//      ledger row is itself `running` for its entire lifetime.
//   3. The EP-D10 end-of-pass-5 prune (`consumed_at IS NOT NULL`) is untouched and cannot
//      double-count: this DELETE is `consumed_at IS NULL`-only — the two are disjoint.
// ---------------------------------------------------------------------------
describe('retireStaleScope (EP-PASS3-BACKLOG) — the step-start stale-cohort floor', () => {
  interface FakeClientOpts { liveEnrichRun?: boolean; backlogRows?: number; backlogCohorts?: number }

  /**
   * Models the DELETE's own `NOT EXISTS` guard in JS so the predicate is proven, not
   * merely grepped: the fixture decides whether a live foreign `enrich_parcels` run
   * exists and answers the single retirement statement accordingly.
   */
  function fakeClient(opts: FakeClientOpts = {}) {
    const sql: string[] = [];
    const params: unknown[][] = [];
    const cohort = { rows: opts.backlogRows ?? 443023, cohorts: opts.backlogCohorts ?? 1 };
    return {
      sql,
      params,
      query: async (text: string, values?: unknown[]) => {
        sql.push(text);
        params.push(values ?? []);
        if (/backlog_rows/.test(text)) {
          return { rows: [{ backlog_rows: cohort.rows, backlog_cohorts: cohort.cohorts }] };
        }
        if (/DELETE FROM enrich_parcels_pass3_scope/.test(text)) {
          const blocked = opts.liveEnrichRun === true;
          return { rows: [{ retired_rows: blocked ? 0 : cohort.rows, retired_cohorts: blocked ? 0 : cohort.cohorts }] };
        }
        return { rows: [] };
      },
    };
  }

  const baseOpts = { runId: 1789480558, ownRunId: 4911, retireAfterHours: 24, now: new Date('2026-09-15T18:10:00.000Z') };

  it('(a) a foreign unconsumed cohort older than the tunable, with NO live enrich_parcels run, is retired — and the counts are row-derived, never inferred', async () => {
    const client = fakeClient({ liveEnrichRun: false });
    const res = await ep.retireStaleScope(client, baseOpts);
    expect(res.retired_rows).toBe(443023);
    expect(res.retired_cohorts).toBe(1);
    // §4 Reality-Check reconciliation: the pre-DELETE observation is taken FIRST, so
    // `retired + surviving = backlog_at_start` is checkable from the audit rows alone.
    expect(res.backlog_rows).toBe(443023);
    const del = client.sql.find((s) => /DELETE FROM enrich_parcels_pass3_scope/.test(s))!;
    expect(del, 'the DELETE must be issued').toBeTruthy();
    // Fence 1 — this run's own rows are excluded by run_id, unconditionally.
    expect(del).toMatch(/run_id\s*<>\s*\$1/);
    // Fence 3 — unconsumed-only; the EP-D10 prune owns the consumed half.
    expect(del).toMatch(/consumed_at IS NULL/);
    expect(del).not.toMatch(/consumed_at IS NOT NULL/);
    // The age bound is derived in SQL from TWO BOUND PARAMETERS — the runner's injected DB
    // clock minus the tunable. Never `new Date(...)` in compute (Rule 2 / §5.5's
    // compute-no-wall-clock rule, enforced by step-conformance.infra.test.ts), and never a
    // `now() - interval '24 hours'` literal, which would make the admin logic variable inert
    // (Rule 3). Both halves must be parameters; neither may be a literal.
    expect(del).toMatch(/created_at\s*<\s*\(\$2::timestamptz\s*-\s*\(\$4::numeric\s*\*\s*interval '1 hour'\)\)/);
    expect(del, 'no bare now() — the clock is injected, never read inside compute').not.toMatch(/\bnow\(\)/);
    // The ONLY interval literal permitted is the unit multiplier `interval '1 hour'`; a
    // literal window (`interval '24 hours'`) would make the admin logic variable inert.
    expect(del.match(/interval '[^']*'/g), 'the only interval literal may be the unit multiplier').toEqual(["interval '1 hour'"]);
    const delParams = client.params[client.sql.indexOf(del)]!;
    expect(delParams[0]).toBe(1789480558);
    expect(delParams[1], 'the injected DB clock, passed through verbatim').toEqual(new Date('2026-09-15T18:10:00.000Z'));
    expect(delParams[2]).toBe(4911);
    expect(delParams[3], 'the tunable, as a bound parameter').toBe(24);
  });

  it('(b) the SAME cohort with a live foreign enrich_parcels running row retires ZERO rows — the one-off script F3 refusal, encoded in SQL', async () => {
    const client = fakeClient({ liveEnrichRun: true });
    const res = await ep.retireStaleScope(client, baseOpts);
    expect(res.retired_rows).toBe(0);
    expect(res.retired_cohorts).toBe(0);
    // The backlog is still OBSERVED (and therefore still reported) even when nothing is
    // retired — a blocked retirement must not also blind the run to the backlog.
    expect(res.backlog_rows).toBe(443023);
    const del = client.sql.find((s) => /DELETE FROM enrich_parcels_pass3_scope/.test(s))!;
    expect(del).toMatch(/NOT EXISTS/);
    expect(del).toMatch(/pipeline_runs/);
    expect(del).toMatch(/status\s*=\s*'running'/);
    // Fence 2's load-bearing half: THIS run's own ledger row reads `running` for its whole
    // lifetime, so without this exclusion the guard would ALWAYS block and the retirement
    // would be dead code that no test not modelling the ledger could ever catch.
    expect(del, 'the guard must exclude the running step OWN ledger row').toMatch(/r\.id\s*<>\s*\$3/);
  });

  it('(c) the window reaches the DELETE as the TUNABLE\'s own value, so a cohort YOUNGER than it cannot match — 12 h binds 12, not the 24 h default', async () => {
    const client = fakeClient();
    await ep.retireStaleScope(client, { ...baseOpts, retireAfterHours: 12 });
    const idx = client.sql.findIndex((s) => /DELETE FROM enrich_parcels_pass3_scope/.test(s));
    expect(client.params[idx]![3]).toBe(12);
    expect(client.params[idx]![1], 'the clock half is unchanged — only the window moved').toEqual(new Date('2026-09-15T18:10:00.000Z'));
  });

  it('(g) an absent/invalid retention window THROWS, naming the logic variable (LM-D15 — a declared var with no row is a hard stop, never a silent default)', async () => {
    const client = fakeClient();
    await expect(ep.retireStaleScope(client, { ...baseOpts, retireAfterHours: undefined }))
      .rejects.toThrow(/enrich_parcels_scope_retire_after_hours/);
    await expect(ep.retireStaleScope(client, { ...baseOpts, retireAfterHours: 0 }))
      .rejects.toThrow(/enrich_parcels_scope_retire_after_hours/);
    expect(client.sql.some((s) => /DELETE/.test(s)), 'nothing may be deleted on a bad window').toBe(false);
  });

  it('RED against monotonic growth — the retirement is the ONLY mechanism that removes an unconsumed row; the EP-D10 prune (consumed_at IS NOT NULL) provably cannot reach one', async () => {
    const client = fakeClient();
    await ep.retireStaleScope(client, baseOpts);
    const del = client.sql.find((s) => /DELETE FROM enrich_parcels_pass3_scope/.test(s))!;
    // The two DELETEs partition the table on `consumed_at` — proven by predicate, not prose.
    expect(/consumed_at IS NULL/.test(del) && !/consumed_at IS NOT NULL/.test(del)).toBe(true);
    const epSrc = fs.readFileSync(path.join(__dirname, '../../scripts/lib/compute/enrich-parcels.js'), 'utf8');
    const deletes = epSrc.split('DELETE FROM enrich_parcels_pass3_scope').slice(1).map((s) => s.slice(0, 200));
    expect(deletes.length, 'exactly two DELETEs against the scope table: the EP-D10 consumed prune and this retirement').toBe(2);
    expect(deletes.filter((d) => /consumed_at IS NOT NULL/.test(d)).length, 'the EP-D10 prune reaches ONLY consumed rows').toBe(1);
    expect(deletes.filter((d) => /consumed_at IS NULL/.test(d) && !/consumed_at IS NOT NULL/.test(d)).length, 'the retirement reaches ONLY unconsumed rows').toBe(1);
  });
});
