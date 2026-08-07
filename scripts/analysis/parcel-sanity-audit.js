// Parcel plausibility audit (read-only) — a data linter over ALL residential parcels. Turns
// "eyeball a sample, find one bug" into "run it, see every bug ranked". Three check families:
//   BOUNDS      — per-field, ZONE-AWARE range checks (a value wrong only for its zone, e.g. RD FSI 2.0)
//   INVARIANTS  — cross-field relationships that must hold (opt_aor ≤ opt_coa, new_build ≤ coa_build, …)
//   DISTRIBUTION— per-zone outliers (median + robust spread) — catches contamination we haven't named yet
// Each check seeded from a real bug OR a physical/domain law.
// Target DB: DATABASE_URL when set (cloud-capable, TLS via ssl-config), else the Docker dev DB
// (postgres@localhost:5432/buildo). The graded target is always logged (C6).
// Usage: node scripts/analysis/parcel-sanity-audit.js
//        DATABASE_URL=<cloud-url> node -r dotenv/config scripts/analysis/parcel-sanity-audit.js
//
// WF2: exports `runSanity(pool)` — a SINGLE-SCAN fold of all BOUND/INVARIANT checks + parallel DISTRIBUTION
// queries (77s → ~12-15s) — consumed by the `assert_parcel_sanity` pipeline step (scripts/quality/). Each
// CHECK carries `gate: true` iff it is a ZERO-BASELINE physical-impossibility/mislink/retired invariant
// whose reappearance is a definite regression → the step FAIL-gates the chain on it (Spec 48 §3.6).
'use strict';
const { Pool } = require('pg');
const { resolveSslConfig } = require('../lib/ssl-config');

// CLI pool factory (P4-F0 fold C6, Reality-Check): the entrypoints used a
// HARDCODED localhost:5432 dev-DB pool — pointed "at cloud" they silently
// graded the local DB while claiming to check cloud (the exact blind spot the
// F0 output review hit). Now DATABASE_URL wins when set (with ssl-config's
// host-aware TLS — cloud targets get CA-pinned verify-full), falling back to
// the historical Docker dev-DB default, and ALWAYS logs which DB it is
// grading — the silence was the bug, not just the target.
function makeCliPool(label) {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString && connectionString.trim()) {
    const redacted = connectionString.replace(/:\/\/([^:@/]+):[^@]+@/, '://$1:***@');
    console.log(`[${label}] grading DATABASE_URL target: ${redacted}`);
    return new Pool({ connectionString, ssl: resolveSslConfig({ connectionString }) });
  }
  console.log(`[${label}] DATABASE_URL not set — grading the default local dev DB (localhost:5432/buildo)`);
  return new Pool({ host: 'localhost', port: 5432, user: 'postgres', password: 'postgres', database: 'buildo' });
}

// Residential scope + a zone-class bucket used by the zone-aware checks.
const RES = `zoning_class IS NOT NULL AND upper(zoning_class) LIKE 'R%'`;
const ZC = `CASE WHEN upper(zoning_class) LIKE 'RD%' THEN 'RD' WHEN upper(zoning_class) LIKE 'RS%' THEN 'RS'
   WHEN upper(zoning_class) LIKE 'RT%' THEN 'RT' WHEN upper(zoning_class) LIKE 'RM%' THEN 'RM'
   WHEN upper(zoning_class) LIKE 'RA%' THEN 'RA' ELSE 'R' END`;
const LOWRISE = `upper(zoning_class) LIKE 'RD%' OR upper(zoning_class) LIKE 'RS%' OR upper(zoning_class) LIKE 'RT%'`;
// WF3 Phase 1 D-C — the max-build viability floor. This audit is a sync-require CLI with no config
// path (CF-3/SF-F5), so the logic_variable max_build_min_dimension_m is PINNED here as a literal and
// parity-locked against the seed JSON + migration 239 + max-build.js default by
// src/tests/logic-var-parity.logic.test.ts — the audit and the engine can never silently disagree.
const MAX_BUILD_MIN_DIMENSION_M = 3.0;

// ── P12-A2: magnitude accepted-by-id exception lists ────────────────────────
// A CHECK may carry `accept: [id,…]` — the CURRENT population of a magnitude
// BOUND that we investigated and found LEGIT (not a bug). The count then filters
// those ids OUT, so the check reads 0 until a NEW parcel crosses the threshold —
// which flags distinctly (WARN) as a regression signal (a fresh mislink or data
// poison). Post-A1 (NULL-lot backfill + max-build re-derive + cost re-run,
// 2026-07-08) the mislink class is 0 and the $667M NULL-lot cost_addition monster
// is gone (capped to ≤$117.7M once its lot was backfilled).
//
// COST_FB_GT15M_LEGIT: 24 lowrise (RD/RS/RT) parcels modeling a >$15M max-build —
// all large-lot detached (1,400–2,000 m² lots, FSI ~1.0, footprint ≈33% of lot,
// no mislink). The cost is the internally-consistent opportunity-menu maximum, not
// a mispriced build (Spec 83 §3-ARCHETYPE semantic pin).
const COST_FB_GT15M_LEGIT = [7402,76620,240610,308831,393793,393848,393866,393872,393885,415256,417357,430889,430890,452644,452653,452655,452677,452682,452703,452936,452944,452950,474449,476327];
// COST_ADDITION_GT50M_LEGIT: 42 huge-lot parcels (25K–88K m² — estates /
// institutional / assembled lots) whose per-sqm addition rate × the large area
// yields a >$50M line. No mislink; the magnitude is the lot area, not a bug.
const COST_ADDITION_GT50M_LEGIT = [1096,3021,15436,41830,48643,81364,105495,105525,120450,123813,133347,134995,138167,162520,175697,175909,179540,186327,189058,207546,242291,244885,257628,291670,292205,300270,326738,341581,347402,349013,356988,361751,364903,417376,425388,454880,459774,467393,471142,473844,482958,1944521];

// { family, id, why(seed bug/law), applies (extra population filter), bad (violation predicate), sev,
//   gate? (true = a ZERO-BASELINE invariant; a non-zero count FAIL-gates the pipeline chain) }
const CHECKS = [
  // ---- BOUNDS (zone-aware) ----
  // Scoped to BUILDABLE parcels: an implausible lot is only a BUG if it leaked into a build. The 3,260
  // out-of-range parcels are all real COMMON/CONDO (tiny slivers / oversized parks) with an accurate
  // lot_size (= geom) that the pipeline ALREADY gates (LOT_MIN/MAX → low confidence → no envelope/cost).
  { fam: 'BOUND', id: 'lot_size_out_of_range_on_buildable', why: 'physical (bad lot leaked into a build)', applies: `lot_size_sqm IS NOT NULL AND max_buildable_footprint_sqm IS NOT NULL`, bad: `lot_size_sqm < 40 OR lot_size_sqm > 100000`, sev: 'HIGH' },
  // Visibility (INFO, don't-hide): implausible lots the pipeline CORRECTLY excluded from the cost model.
  { fam: 'BOUND', id: 'lot_implausible_correctly_excluded', why: 'visibility: implausible lot → gated, no cost (not a bug)', applies: `lot_size_sqm IS NOT NULL AND (lot_size_sqm < 40 OR lot_size_sqm > 100000)`, bad: `max_buildable_footprint_sqm IS NULL`, sev: 'INFO' },
  { fam: 'BOUND', id: 'lowrise_bylaw_fsi_gt_1_5', why: 'FSI-borrow bug (RD sliver→2.0)', applies: `(${LOWRISE}) AND bylaw_max_fsi IS NOT NULL`, bad: `bylaw_max_fsi > 1.5`, sev: 'HIGH' },
  { fam: 'BOUND', id: 'residential_bylaw_fsi_gt_8', why: 'corrupt source (FSI 15)', applies: `bylaw_max_fsi IS NOT NULL`, bad: `bylaw_max_fsi > 8`, sev: 'HIGH' },
  // LOWRISE-only: RA/RM apartment zones legitimately reach 80% coverage (was a false positive on RA).
  { fam: 'BOUND', id: 'lowrise_coverage_gt_50pct', why: 'coverage-uncapped bug (67%)', applies: `(${LOWRISE}) AND bylaw_max_coverage_pct IS NOT NULL`, bad: `bylaw_max_coverage_pct > 50`, sev: 'MED' },
  { fam: 'BOUND', id: 'lowrise_height_gt_15m', why: 'tree-massing (95 m bungalow)', applies: `(${LOWRISE}) AND bylaw_max_height_m IS NOT NULL`, bad: `bylaw_max_height_m > 15`, sev: 'MED' },
  { fam: 'BOUND', id: 'footprint_coverage_gt_65pct', why: 'coverage-uncapped bug', applies: `max_buildable_footprint_sqm IS NOT NULL AND lot_size_sqm > 0`, bad: `max_buildable_footprint_sqm / lot_size_sqm > 0.65`, sev: 'HIGH' },
  { fam: 'BOUND', id: 'max_build_fsi_gt_5', why: 'garbage GFA (FSI 1042)', applies: `max_build_fsi IS NOT NULL`, bad: `max_build_fsi > 5`, sev: 'HIGH' },
  { fam: 'BOUND', id: 'coa_fsi_gt_5', why: 'garbage GFA', applies: `coa_fsi IS NOT NULL`, bad: `coa_fsi > 5`, sev: 'HIGH' },
  // NB: existing_height_m/existing_stories are NULL across the DB — re-targeted to the POPULATED
  // envelope-height field (the tree-massing contamination lands in max_build_height_m, not existing_*).
  { fam: 'BOUND', id: 'lowrise_maxbuild_height_gt_15m', why: 'tree-massing (envelope height)', applies: `(${LOWRISE}) AND max_build_height_m IS NOT NULL`, bad: `max_build_height_m > 15`, sev: 'MED' },
  { fam: 'BOUND', id: 'comp_fsi_p50_implausibly_low', why: 'comps domain-review (existing vs realized-build?)', applies: `comp_fsi_p50 IS NOT NULL`, bad: `comp_fsi_p50 < 0.05`, sev: 'INFO' },
  { fam: 'BOUND', id: 'lowrise_maxbuild_stories_gt_4', why: 'over-tall envelope', applies: `(${LOWRISE}) AND max_build_stories IS NOT NULL`, bad: `max_build_stories > 4`, sev: 'MED' },
  // Zone-aware tighter bound: RD (detached) physically caps ~3 storeys. The >4 lowrise check above misses
  // RD contamination that lands at exactly 4 (and the 3–4 band a flat >4 can't see) — this RD-specific >3
  // bound would have caught the tree-massing heritage contamination earlier. [Reality-Check WF3 2026-07-02]
  { fam: 'BOUND', id: 'rd_maxbuild_stories_gt_3', why: 'RD detached caps ~3 storeys (tighter than lowrise >4)', applies: `upper(zoning_class) LIKE 'RD%' AND max_build_stories IS NOT NULL`, bad: `max_build_stories > 3`, sev: 'MED' },
  // Regression guard at the DATA layer: `max_build_stories_basis='existing'` was RETIRED (WF3 2026-07-02 —
  // heritage storeys no longer read the tree-contaminated massing estimated_stories). Any reappearance means
  // the old heritage-freeze logic was re-wired in. GATE: zero-baseline, a reappearance is a definite regression.
  { fam: 'BOUND', id: 'maxbuild_stories_basis_existing_retired', why: 'retired basis value (heritage massing storeys)', applies: `max_build_stories_basis IS NOT NULL`, bad: `max_build_stories_basis = 'existing'`, sev: 'HIGH', gate: true },
  // WF3 phase C: the height-overlay m/storey signal is ASYMMETRIC. Too-LOW (< 2.5 m/storey) is physically
  // impossible — you cannot fit N storeys in H metres — the signature of a WELD (height from one overlay,
  // storeys spilled from an edge-touching mid-rise). GATE: zero-baseline physical impossibility.
  // Too-HIGH is NOT a bug: a generous height cap + conservative storey cap (11.5 m / 2 st) is genuine → INFO.
  { fam: 'BOUND', id: 'bylaw_height_per_storey_impossible', why: 'weld: cannot fit the storeys in the height (<2.5 m/storey)', applies: `bylaw_max_height_m IS NOT NULL AND bylaw_max_stories IS NOT NULL AND bylaw_max_stories > 0`, bad: `bylaw_max_height_m / bylaw_max_stories < 2.5`, sev: 'HIGH', gate: true },
  { fam: 'BOUND', id: 'bylaw_height_per_storey_generous', why: 'visibility: generous height + low storey cap (genuine low-density zoning, not a bug)', applies: `bylaw_max_height_m IS NOT NULL AND bylaw_max_stories IS NOT NULL AND bylaw_max_stories > 0`, bad: `bylaw_max_height_m / bylaw_max_stories > 5.5`, sev: 'INFO' },
  { fam: 'BOUND', id: 'opt_storeys_gt_12', why: 'physical', applies: `opt_aor_storeys IS NOT NULL OR opt_coa_storeys IS NOT NULL`, bad: `opt_aor_storeys > 12 OR opt_coa_storeys > 12`, sev: 'MED' },
  { fam: 'BOUND', id: 'newbuild_cost_per_sqm_out_of_band', why: 'cost-rate sanity ($186–1115/ft²)', applies: `cost_fb_total IS NOT NULL AND opt_aor_gfa_sqm > 0`, bad: `cost_fb_total / opt_aor_gfa_sqm < 2000 OR cost_fb_total / opt_aor_gfa_sqm > 12000`, sev: 'MED' },
  // P12-A1.5: NULL-lot family tripwire. lot_size_sqm feeds the LIVE cost-model T1
  // FSI gate + fallback GFA; a GFA/cost-bearing parcel with NULL lot silently
  // skipped those paths (the invisible tail A1 fixed). Post-backfill = 0; a new
  // NULL here is a load regression (STATEDAREA absent AND geom absent/invalid).
  { fam: 'BOUND', id: 'nulllot_on_gfa_or_cost_bearing', why: 'A1: lot_size NULL on a GFA/cost-bearing parcel (unvalidatable tail)', applies: `max_buildable_gfa_sqm IS NOT NULL OR cost_fb_total IS NOT NULL`, bad: `lot_size_sqm IS NULL`, sev: 'MED' },
  // P12-A2: magnitude exception-list watches (COMPLEMENTARY to the per-sqm band
  // above — these bound the ABSOLUTE total). Current members accepted (large-lot
  // legit, investigated 2026-07-08); a NEW member crossing the line → WARN.
  { fam: 'BOUND', id: 'lowrise_cost_fb_gt_15m', why: 'A2: new lowrise >$15M max-build (mislink/poison if not a big lot)', applies: `(${LOWRISE}) AND cost_fb_total IS NOT NULL`, bad: `cost_fb_total > 15000000`, sev: 'MED', accept: COST_FB_GT15M_LEGIT },
  { fam: 'BOUND', id: 'cost_addition_gt_50m', why: 'A2: new >$50M addition line (huge-lot artifact; watch for new members)', applies: `cost_addition_total IS NOT NULL`, bad: `cost_addition_total > 50000000`, sev: 'MED', accept: COST_ADDITION_GT50M_LEGIT },
  // ---- INVARIANTS (cross-field) — the zero-baseline coherence laws are GATED ----
  { fam: 'INVARIANT', id: 'opt_aor_gfa_gt_opt_coa_gfa', why: 'CoA ≥ as-of-right (coherence)', applies: `opt_aor_gfa_sqm IS NOT NULL AND opt_coa_gfa_sqm IS NOT NULL`, bad: `opt_aor_gfa_sqm > opt_coa_gfa_sqm + 0.5`, sev: 'HIGH', gate: true },
  { fam: 'INVARIANT', id: 'opt_aor_storeys_gt_opt_coa_storeys', why: 'CoA storeys ≥ as-of-right', applies: `opt_aor_storeys IS NOT NULL AND opt_coa_storeys IS NOT NULL`, bad: `opt_aor_storeys > opt_coa_storeys`, sev: 'MED' },
  { fam: 'INVARIANT', id: 'new_build_cost_gt_coa_build_cost', why: 'THE headline bug (new_build > coa_build)', applies: `cost_fb_total IS NOT NULL AND cost_coa_total IS NOT NULL`, bad: `cost_fb_total > cost_coa_total + 1`, sev: 'HIGH', gate: true },
  // ×1.05 = the mislink tolerance (mislink_footprint_lot_tol) the enrich passes use — a footprint within
  // 5% of the lot is the accepted grandfather band, NOT a mislink (else 194 legit heritage stay flagged).
  { fam: 'INVARIANT', id: 'footprint_gt_lot_x105', why: 'footprint ≤ lot×1.05 (mislink)', applies: `max_buildable_footprint_sqm IS NOT NULL AND lot_size_sqm IS NOT NULL`, bad: `max_buildable_footprint_sqm > lot_size_sqm * 1.05`, sev: 'HIGH', gate: true },
  { fam: 'INVARIANT', id: 'existing_floor_gt_lot_x105', why: 'existing footprint ≤ lot×1.05', applies: `cur_floor_gfa_sqm IS NOT NULL AND lot_size_sqm IS NOT NULL`, bad: `cur_floor_gfa_sqm > lot_size_sqm * 1.05`, sev: 'HIGH', gate: true },
  // A heritage-freeze basis must never keep a footprint > lot×1.05 (the heritage-mislink WF3 guard).
  { fam: 'INVARIANT', id: 'heritage_basis_footprint_gt_lot', why: 'heritage freeze ⟺ mislink-guard agreement', applies: `max_buildable_gfa_basis = 'heritage_existing' AND max_buildable_footprint_sqm IS NOT NULL AND lot_size_sqm IS NOT NULL`, bad: `max_buildable_footprint_sqm > lot_size_sqm * 1.05`, sev: 'HIGH', gate: true },
  // Stale cost after an enrich re-run but BEFORE compute-parcel-cost re-runs (blind-spot A): the FSI
  // scalar (cost-model-written) is present while the envelope GFA (enrich-written) is NULL.
  { fam: 'INVARIANT', id: 'stale_cost_fsi_without_gfa', why: 'stale cost (needs compute-parcel-cost re-run)', applies: `max_build_fsi IS NOT NULL`, bad: `max_buildable_gfa_sqm IS NULL`, sev: 'MED' },
  { fam: 'INVARIANT', id: 'cost_fb_on_footprint_gt_lot', why: 'garbage cost on a mislink not yet cleared', applies: `cost_fb_total IS NOT NULL AND max_buildable_footprint_sqm IS NOT NULL AND lot_size_sqm IS NOT NULL`, bad: `max_buildable_footprint_sqm > lot_size_sqm * 1.05`, sev: 'HIGH', gate: true },
  { fam: 'INVARIANT', id: 'greenspace_out_of_range', why: '0 ≤ greenspace ≤ lot', applies: `existing_greenspace_sqm IS NOT NULL AND lot_size_sqm IS NOT NULL`, bad: `existing_greenspace_sqm < 0 OR existing_greenspace_sqm > lot_size_sqm + 0.5`, sev: 'MED' },
  { fam: 'INVARIANT', id: 'opt_aor_gfa_gt_max_buildable_gfa', why: 'as-of-right ≤ lot-validated envelope', applies: `opt_aor_gfa_sqm IS NOT NULL AND max_buildable_gfa_sqm IS NOT NULL`, bad: `opt_aor_gfa_sqm > max_buildable_gfa_sqm + 0.5`, sev: 'MED' },
  { fam: 'INVARIANT', id: 'realized_fsi_p90_out_of_range', why: 'realized FSI ∈ [0.1, 6]', applies: `realized_fsi_p90 IS NOT NULL`, bad: `realized_fsi_p90 < 0.1 OR realized_fsi_p90 > 6`, sev: 'MED' },
];

// DISTRIBUTION: per-zone outliers = value beyond p99 AND > 3× the zone median (contamination clusters).
// Always INFO — outliers fluctuate on a 437K set; a WARN here would be a permanent chain WARN (statistical
// noise), so they are visibility signals for human review, never verdict-driving.
const DIST_FIELDS = [
  { id: 'bylaw_max_fsi', expr: 'bylaw_max_fsi' },
  { id: 'max_build_fsi', expr: 'max_build_fsi' },
  { id: 'footprint_coverage', expr: 'max_buildable_footprint_sqm / NULLIF(lot_size_sqm,0)' },
  { id: 'max_build_height_m', expr: 'max_build_height_m' },
  { id: 'newbuild_cost_per_sqm', expr: 'cost_fb_total / NULLIF(opt_aor_gfa_sqm,0)' },
  { id: 'opt_aor_gfa_sqm', expr: 'opt_aor_gfa_sqm' },
  { id: 'comp_fsi_p50', expr: 'comp_fsi_p50' },
  { id: 'lot_size_sqm', expr: 'lot_size_sqm' },
];

// sev/gate → audit-row status (Spec 48 §3.6, data-driven — NO per-check-id branching):
//   gated + violated → FAIL · INFO check → INFO (visibility) · violated → WARN · else PASS.
function statusFor(check, viol) {
  return check.gate && viol > 0 ? 'FAIL' : check.sev === 'INFO' ? 'INFO' : viol > 0 ? 'WARN' : 'PASS';
}

// Row-derived verdict cascade (Spec 48 §3.6) — co-located with the sanity policy so the pipeline step
// imports it rather than adding a 5th copy of the generic helper.
function verdictCascade(rows) {
  return rows.some((r) => r.status === 'FAIL') ? 'FAIL'
    : rows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';
}

// runSanity(pool) — the OPTIMIZED sweep the pipeline step consumes. ONE scan folds every BOUND/INVARIANT
// check into `count(*) FILTER (...)` columns (was 29 sequential scans); the 8 per-zone DISTRIBUTION
// percentile queries run in parallel. Returns { total, results, dist } — pure data, no console output.
// `samples:true` (the standalone eyeball) adds an `array_agg` of ≤6 example ids per check — expensive
// (~2x the scan), so the PIPELINE step calls with samples:false (counts only → ~14s, no sample ids needed
// in the audit_table rows).
async function runSanity(pool, { samples = false } = {}) {
  const cols = CHECKS.map((c) => {
    // P12-A2: accepted-by-id exception list. The violation predicate excludes the
    // documented current population so the count reads 0 until a NEW parcel crosses
    // the threshold (which then flags distinctly). Numeric-literal ids only (no
    // interpolation risk); empty/absent `accept` → the raw predicate unchanged.
    const bad = (Array.isArray(c.accept) && c.accept.length)
      ? `(${c.bad}) AND id <> ALL(ARRAY[${c.accept.map(Number).join(',')}]::int[])`
      : c.bad;
    const base = `count(*) FILTER (WHERE (${c.applies}) AND (${bad}))::int AS "v_${c.id}",
     count(*) FILTER (WHERE ${c.applies})::int AS "p_${c.id}"`;
    return samples
      ? `${base},\n     (array_agg(id ORDER BY id) FILTER (WHERE (${c.applies}) AND (${bad})))[1:6] AS "s_${c.id}"`
      : base;
  }).join(',\n');
  const row = (await pool.query(`SELECT count(*)::int AS total,\n${cols}\nFROM parcels WHERE ${RES}`)).rows[0];
  const total = row.total;
  const results = CHECKS.map((c) => {
    const viol = row[`v_${c.id}`], pop = row[`p_${c.id}`];
    return { ...c, pop, viol, pct: pop ? (100 * viol / pop) : 0, samples: row[`s_${c.id}`] || [], status: statusFor(c, viol) };
  });

  const distQ = (f) => `
    WITH base AS (SELECT id, (${ZC}) AS zc, (${f.expr})::float8 AS f FROM parcels WHERE ${RES} AND (${f.expr}) IS NOT NULL),
    stats AS (SELECT zc, percentile_cont(0.5) WITHIN GROUP (ORDER BY f) AS med,
                     percentile_cont(0.99) WITHIN GROUP (ORDER BY f) AS p99 FROM base GROUP BY zc)
    SELECT count(*)::int AS viol, (array_agg(b.id ORDER BY b.f DESC, b.id))[1:6] AS samples,
           round(max(b.f)::numeric, 2) AS worst
    FROM base b JOIN stats s ON s.zc = b.zc
    WHERE b.f > s.p99 AND b.f > 3 * GREATEST(s.med, 0.0001)`;
  const dist = await Promise.all(DIST_FIELDS.map(async (f) => {
    const r = (await pool.query(distQ(f))).rows[0];
    return { id: f.id, viol: r.viol, worst: r.worst, samples: r.samples || [] };
  }));

  return { total, results, dist };
}

async function runAudit() {
  const pool = makeCliPool('parcel-sanity-audit');
  const { total, results, dist } = await runSanity(pool, { samples: true });
  await pool.end();
  console.log(`\n=== PARCEL SANITY AUDIT — ${total.toLocaleString()} residential parcels ===\n`);

  const line = (id, viol, pop, pct, sev, extra) =>
    `  [${sev.padEnd(4)}] ${id.padEnd(40)} ${String(viol).padStart(7)} / ${String(pop).padStart(7)} (${pct.toFixed(2).padStart(6)}%)  ${extra}`;

  for (const fam of ['BOUND', 'INVARIANT']) {
    console.log(`── ${fam} ${'─'.repeat(60)}`);
    for (const r of results.filter((x) => x.fam === fam).sort((a, b) => b.viol - a.viol)) {
      const mark = r.status === 'FAIL' ? '✗' : r.viol > 0 ? '⚠' : '·';
      console.log(`${mark} ` + line(r.id, r.viol, r.pop, r.pct, r.sev, r.viol ? `e.g. ${r.samples.join(',')}${r.gate ? '  [GATE]' : ''}` : `[${r.why}]`));
    }
    console.log('');
  }
  console.log(`── DISTRIBUTION (per-zone outlier: > p99 AND > 3× zone median, INFO-only) ${'─'.repeat(12)}`);
  for (const d of dist.sort((a, b) => b.viol - a.viol)) {
    const mark = d.viol > 0 ? '⚠' : '·';
    console.log(`${mark}   ${d.id.padEnd(40)} ${String(d.viol).padStart(7)} outliers  worst=${d.worst}  e.g. ${(d.samples || []).join(',')}`);
  }

  const flagged = results.filter((r) => r.viol > 0);
  const failing = results.filter((r) => r.status === 'FAIL');
  // "Violations" = real problems (HIGH/MED). INFO rows are visibility counts (e.g. correctly-gated
  // parcels), NOT violations — reported separately so the headline number isn't inflated by non-bugs.
  const totalViol = results.filter((r) => r.sev !== 'INFO').reduce((s, r) => s + r.viol, 0);
  const infoViz = results.filter((r) => r.sev === 'INFO' && r.viol > 0).reduce((s, r) => s + r.viol, 0);
  console.log(`\n=== SUMMARY: ${flagged.length}/${results.length} checks tripped · ${failing.length} FAIL-GATED · ${totalViol.toLocaleString()} HIGH/MED violations (+ ${infoViz.toLocaleString()} INFO visibility) · ${dist.filter((d) => d.viol > 0).length}/${dist.length} distribution fields with outliers ===`);
  console.log('Top offenders (HIGH/MED only):');
  for (const r of results.filter((r) => r.sev !== 'INFO' && r.viol > 0).sort((a, b) => b.viol - a.viol).slice(0, 8)) {
    console.log(`  ${r.viol.toLocaleString().padStart(8)}  ${r.id}  (${r.why})${r.gate ? '  [GATE→FAIL]' : ''}`);
  }
}

module.exports = { CHECKS, DIST_FIELDS, RES, ZC, LOWRISE, MAX_BUILD_MIN_DIMENSION_M, runSanity, statusFor, verdictCascade, makeCliPool };

if (require.main === module) {
  runAudit().catch((e) => { console.error(e); process.exit(1); });
}
