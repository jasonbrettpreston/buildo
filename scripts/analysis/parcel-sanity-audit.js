// Parcel plausibility audit (read-only) — a data linter over ALL residential parcels. Turns
// "eyeball a sample, find one bug" into "run it, see every bug ranked". Three check families:
//   BOUNDS      — per-field, ZONE-AWARE range checks (a value wrong only for its zone, e.g. RD FSI 2.0)
//   INVARIANTS  — cross-field relationships that must hold (opt_aor ≤ opt_coa, new_build ≤ coa_build, …)
//   DISTRIBUTION— per-zone outliers (median + robust spread) — catches contamination we haven't named yet
// Each check seeded from a real bug OR a physical/domain law. Dev DB (postgres@localhost:5432/buildo).
// Usage: node scripts/analysis/parcel-sanity-audit.js
'use strict';
const { Pool } = require('pg');

// Residential scope + a zone-class bucket used by the zone-aware checks.
const RES = `zoning_class IS NOT NULL AND upper(zoning_class) LIKE 'R%'`;
const ZC = `CASE WHEN upper(zoning_class) LIKE 'RD%' THEN 'RD' WHEN upper(zoning_class) LIKE 'RS%' THEN 'RS'
   WHEN upper(zoning_class) LIKE 'RT%' THEN 'RT' WHEN upper(zoning_class) LIKE 'RM%' THEN 'RM'
   WHEN upper(zoning_class) LIKE 'RA%' THEN 'RA' ELSE 'R' END`;
const LOWRISE = `upper(zoning_class) LIKE 'RD%' OR upper(zoning_class) LIKE 'RS%' OR upper(zoning_class) LIKE 'RT%'`;

// { family, id, why(seed bug/law), applies (extra population filter), bad (violation predicate), sev }
const CHECKS = [
  // ---- BOUNDS (zone-aware) ----
  { fam: 'BOUND', id: 'lot_size_out_of_range', why: 'physical', applies: `lot_size_sqm IS NOT NULL`, bad: `lot_size_sqm < 40 OR lot_size_sqm > 100000`, sev: 'HIGH' },
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
  { fam: 'BOUND', id: 'opt_storeys_gt_12', why: 'physical', applies: `opt_aor_storeys IS NOT NULL OR opt_coa_storeys IS NOT NULL`, bad: `opt_aor_storeys > 12 OR opt_coa_storeys > 12`, sev: 'MED' },
  { fam: 'BOUND', id: 'newbuild_cost_per_sqm_out_of_band', why: 'cost-rate sanity ($186–1115/ft²)', applies: `cost_fb_total IS NOT NULL AND opt_aor_gfa_sqm > 0`, bad: `cost_fb_total / opt_aor_gfa_sqm < 2000 OR cost_fb_total / opt_aor_gfa_sqm > 12000`, sev: 'MED' },
  // ---- INVARIANTS (cross-field) ----
  { fam: 'INVARIANT', id: 'opt_aor_gfa_gt_opt_coa_gfa', why: 'CoA ≥ as-of-right (coherence)', applies: `opt_aor_gfa_sqm IS NOT NULL AND opt_coa_gfa_sqm IS NOT NULL`, bad: `opt_aor_gfa_sqm > opt_coa_gfa_sqm + 0.5`, sev: 'HIGH' },
  { fam: 'INVARIANT', id: 'opt_aor_storeys_gt_opt_coa_storeys', why: 'CoA storeys ≥ as-of-right', applies: `opt_aor_storeys IS NOT NULL AND opt_coa_storeys IS NOT NULL`, bad: `opt_aor_storeys > opt_coa_storeys`, sev: 'MED' },
  { fam: 'INVARIANT', id: 'new_build_cost_gt_coa_build_cost', why: 'THE headline bug (new_build > coa_build)', applies: `cost_fb_total IS NOT NULL AND cost_coa_total IS NOT NULL`, bad: `cost_fb_total > cost_coa_total + 1`, sev: 'HIGH' },
  // ×1.05 = the mislink tolerance (mislink_footprint_lot_tol) the enrich passes use — a footprint within
  // 5% of the lot is the accepted grandfather band, NOT a mislink (else 194 legit heritage stay flagged).
  { fam: 'INVARIANT', id: 'footprint_gt_lot_x105', why: 'footprint ≤ lot×1.05 (mislink)', applies: `max_buildable_footprint_sqm IS NOT NULL AND lot_size_sqm IS NOT NULL`, bad: `max_buildable_footprint_sqm > lot_size_sqm * 1.05`, sev: 'HIGH' },
  { fam: 'INVARIANT', id: 'existing_floor_gt_lot_x105', why: 'existing footprint ≤ lot×1.05', applies: `cur_floor_gfa_sqm IS NOT NULL AND lot_size_sqm IS NOT NULL`, bad: `cur_floor_gfa_sqm > lot_size_sqm * 1.05`, sev: 'HIGH' },
  // A heritage-freeze basis must never keep a footprint > lot×1.05 (the heritage-mislink WF3 guard).
  { fam: 'INVARIANT', id: 'heritage_basis_footprint_gt_lot', why: 'heritage freeze ⟺ mislink-guard agreement', applies: `max_buildable_gfa_basis = 'heritage_existing' AND max_buildable_footprint_sqm IS NOT NULL AND lot_size_sqm IS NOT NULL`, bad: `max_buildable_footprint_sqm > lot_size_sqm * 1.05`, sev: 'HIGH' },
  // Stale cost after an enrich re-run but BEFORE compute-parcel-cost re-runs (blind-spot A): the FSI
  // scalar (cost-model-written) is present while the envelope GFA (enrich-written) is NULL.
  { fam: 'INVARIANT', id: 'stale_cost_fsi_without_gfa', why: 'stale cost (needs compute-parcel-cost re-run)', applies: `max_build_fsi IS NOT NULL`, bad: `max_buildable_gfa_sqm IS NULL`, sev: 'MED' },
  { fam: 'INVARIANT', id: 'cost_fb_on_footprint_gt_lot', why: 'garbage cost on a mislink not yet cleared', applies: `cost_fb_total IS NOT NULL AND max_buildable_footprint_sqm IS NOT NULL AND lot_size_sqm IS NOT NULL`, bad: `max_buildable_footprint_sqm > lot_size_sqm * 1.05`, sev: 'HIGH' },
  { fam: 'INVARIANT', id: 'greenspace_out_of_range', why: '0 ≤ greenspace ≤ lot', applies: `existing_greenspace_sqm IS NOT NULL AND lot_size_sqm IS NOT NULL`, bad: `existing_greenspace_sqm < 0 OR existing_greenspace_sqm > lot_size_sqm + 0.5`, sev: 'MED' },
  { fam: 'INVARIANT', id: 'opt_aor_gfa_gt_max_buildable_gfa', why: 'as-of-right ≤ lot-validated envelope', applies: `opt_aor_gfa_sqm IS NOT NULL AND max_buildable_gfa_sqm IS NOT NULL`, bad: `opt_aor_gfa_sqm > max_buildable_gfa_sqm + 0.5`, sev: 'MED' },
  { fam: 'INVARIANT', id: 'realized_fsi_p90_out_of_range', why: 'realized FSI ∈ [0.1, 6]', applies: `realized_fsi_p90 IS NOT NULL`, bad: `realized_fsi_p90 < 0.1 OR realized_fsi_p90 > 6`, sev: 'MED' },
];

// DISTRIBUTION: per-zone outliers = value beyond p99 AND > 3× the zone median (contamination clusters).
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

async function runAudit() {
  const pool = new Pool({ host: 'localhost', port: 5432, user: 'postgres', password: 'postgres', database: 'buildo' });
  const total = (await pool.query(`SELECT count(*)::int n FROM parcels WHERE ${RES}`)).rows[0].n;
  console.log(`\n=== PARCEL SANITY AUDIT — ${total.toLocaleString()} residential parcels ===\n`);

  const results = [];
  for (const c of CHECKS) {
    const q = `SELECT count(*) FILTER (WHERE ${c.applies})::int AS pop,
                      count(*) FILTER (WHERE (${c.applies}) AND (${c.bad}))::int AS viol,
                      (array_agg(id) FILTER (WHERE (${c.applies}) AND (${c.bad})))[1:6] AS samples
               FROM parcels WHERE ${RES}`;
    const r = (await pool.query(q)).rows[0];
    results.push({ ...c, pop: r.pop, viol: r.viol, pct: r.pop ? (100 * r.viol / r.pop) : 0, samples: r.samples || [] });
  }

  const dist = [];
  for (const f of DIST_FIELDS) {
    const q = `
      WITH base AS (SELECT id, (${ZC}) AS zc, (${f.expr})::float8 AS f FROM parcels WHERE ${RES} AND (${f.expr}) IS NOT NULL),
      stats AS (SELECT zc, percentile_cont(0.5) WITHIN GROUP (ORDER BY f) AS med,
                       percentile_cont(0.99) WITHIN GROUP (ORDER BY f) AS p99 FROM base GROUP BY zc)
      SELECT count(*)::int AS viol, (array_agg(b.id ORDER BY b.f DESC))[1:6] AS samples,
             round(max(b.f)::numeric, 2) AS worst
      FROM base b JOIN stats s ON s.zc = b.zc
      WHERE b.f > s.p99 AND b.f > 3 * GREATEST(s.med, 0.0001)`;
    const r = (await pool.query(q)).rows[0];
    dist.push({ id: f.id, viol: r.viol, worst: r.worst, samples: r.samples || [] });
  }
  await pool.end();

  const line = (fam, id, viol, pop, pct, sev, extra) =>
    `  [${sev.padEnd(4)}] ${id.padEnd(40)} ${String(viol).padStart(7)} / ${String(pop).padStart(7)} (${pct.toFixed(2).padStart(6)}%)  ${extra}`;

  for (const fam of ['BOUND', 'INVARIANT']) {
    console.log(`── ${fam} ${'─'.repeat(60)}`);
    for (const r of results.filter((x) => x.fam === fam).sort((a, b) => b.viol - a.viol)) {
      const mark = r.viol > 0 ? '⚠' : '·';
      console.log(`${mark} ` + line(fam, r.id, r.viol, r.pop, r.pct, r.sev, r.viol ? `e.g. ${r.samples.join(',')}` : `[${r.why}]`));
    }
    console.log('');
  }
  console.log(`── DISTRIBUTION (per-zone outlier: > p99 AND > 3× zone median) ${'─'.repeat(20)}`);
  for (const d of dist.sort((a, b) => b.viol - a.viol)) {
    const mark = d.viol > 0 ? '⚠' : '·';
    console.log(`${mark}   ${d.id.padEnd(40)} ${String(d.viol).padStart(7)} outliers  worst=${d.worst}  e.g. ${(d.samples || []).join(',')}`);
  }

  const flagged = results.filter((r) => r.viol > 0);
  const totalViol = results.reduce((s, r) => s + r.viol, 0);
  console.log(`\n=== SUMMARY: ${flagged.length}/${results.length} checks tripped · ${totalViol.toLocaleString()} bound/invariant violations · ${dist.filter((d) => d.viol > 0).length}/${dist.length} distribution fields with outliers ===`);
  console.log('Top offenders:');
  for (const r of [...results].sort((a, b) => b.viol - a.viol).slice(0, 8).filter((r) => r.viol > 0)) {
    console.log(`  ${r.viol.toLocaleString().padStart(8)}  ${r.id}  (${r.why})`);
  }
}

module.exports = { CHECKS, DIST_FIELDS, RES, ZC, LOWRISE };

if (require.main === module) {
  runAudit().catch((e) => { console.error(e); process.exit(1); });
}
