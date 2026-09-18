'use strict';
/**
 * assert-parcel-sanity-fields.js — the SINGLE declared source of truth for every
 * `assert_parcel_sanity` check + logic_variables entry: descriptor generation
 * (`scripts/quality/assert-parcel-sanity.descriptor.json`) AND the folded-scan
 * compute module (`scripts/lib/compute/assert-parcel-sanity.js`) both read this
 * ONE module, so the two can never silently drift (Ask A1 precedent —
 * `scripts/lib/assert-data-bounds-fields.js`).
 *
 * Pure data + pure helpers — no I/O, no `pg`, no `ctx`. `applies`/`bad` are
 * FUNCTIONS OF `cfg` (the resolved `ctx.config` object) rather than static
 * strings, because 35 of the 42 checks' magnitudes are now logic variables
 * substituted into the ONE folded scan `runSanity` used to build statically
 * (Ask A1: one folded compute loader, not 42 standalone scans).
 *
 * Ported verbatim from `scripts/analysis/parcel-sanity-audit.js` CHECKS[]/
 * DIST_FIELDS (pre-conversion) per `.cursor/batch2_p1_1_assert_parcel_sanity_active_task.md`
 * §2 (the 35-variable tunables census) and §6 (fences F1-F8).
 *
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 * SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md §2
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5
 */

/** Defence-in-depth: every `cfg` read this module interpolates into SQL text must
 * already be a finite number (config.js's `strict` validation + min/max bounds
 * enforce this before compute ever runs) — this is a second, cheap guard against a
 * malformed value ever reaching a query string. */
function num(v, name) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`assert-parcel-sanity-fields: config value for "${name}" is not a finite number (${JSON.stringify(v)})`);
  }
  return v;
}

// Residential scope + a zone-class bucket used by the zone-aware checks and the
// distribution scan — VERBATIM from parcel-sanity-audit.js.
const RES = `zoning_class IS NOT NULL AND upper(zoning_class) LIKE 'R%'`;
const ZC = `CASE WHEN upper(zoning_class) LIKE 'RD%' THEN 'RD' WHEN upper(zoning_class) LIKE 'RS%' THEN 'RS'
   WHEN upper(zoning_class) LIKE 'RT%' THEN 'RT' WHEN upper(zoning_class) LIKE 'RM%' THEN 'RM'
   WHEN upper(zoning_class) LIKE 'RA%' THEN 'RA' ELSE 'R' END`;
const LOWRISE = `upper(zoning_class) LIKE 'RD%' OR upper(zoning_class) LIKE 'RS%' OR upper(zoning_class) LIKE 'RT%'`;

// P12-A2 accepted-by-id exception lists — descriptor DATA (Ask A2 (a)), never a
// logic variable (config.logic_variables[] is {name,min,max,on_invalid}, numbers
// only). Verbatim from parcel-sanity-audit.js.
const COST_FB_GT15M_LEGIT = [7402, 76620, 240610, 308831, 393793, 393848, 393866, 393872, 393885, 415256, 417357, 430889, 430890, 452644, 452653, 452655, 452677, 452682, 452703, 452936, 452944, 452950, 474449, 476327];
const COST_ADDITION_GT50M_LEGIT = [1096, 3021, 15436, 41830, 48643, 81364, 105495, 105525, 120450, 123813, 133347, 134995, 138167, 162520, 175697, 175909, 179540, 186327, 189058, 207546, 242291, 244885, 257628, 291670, 292205, 300270, 326738, 341581, 347402, 349013, 356988, 361751, 364903, 417376, 425388, 454880, 459774, 467393, 471142, 473844, 482958, 1944521];

// Already-registered, REUSED (Ask A6(a)) — one copy of the policy, parity-locked
// by src/tests/logic-var-parity.logic.test.ts against the resolved config value.
const REUSED_MAX_BUILD_MIN_DIMENSION_M = 'max_build_min_dimension_m';
const REUSED_MISLINK_FOOTPRINT_LOT_TOL = 'mislink_footprint_lot_tol';

// ---------------------------------------------------------------------------
// LOGIC_VAR_DEFS — 35 new (Ask A5: prefix `parcel_sanity_*`, groups `Data Quality
// Thresholds` / `Spatial & Massing`, all on_invalid:"fail" — every one is
// verdict-affecting). Numbers match the plan's tunables census table exactly.
// ---------------------------------------------------------------------------
const LOGIC_VAR_DEFS = [
  { name: 'parcel_sanity_lot_size_min_sqm', default: 40, min: 0, max: 10000, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: residential lot_size_sqm lower bound (sqm). Ported verbatim from the pre-conversion literal (40). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_lot_size_max_sqm', default: 100000, min: 1000, max: 10000000, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: residential lot_size_sqm upper bound (sqm). Ported verbatim from the pre-conversion literal (100000). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_max_build_width_max_m', default: 30, min: 0, max: 500, group: 'Spatial & Massing', description: 'assert_parcel_sanity: max_build_width_m upper bound (m), RC-measured p995 27.2 / max obs 42.66. Ported verbatim from the pre-conversion literal (30). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_max_build_length_max_m', default: 100, min: 0, max: 1000, group: 'Spatial & Massing', description: 'assert_parcel_sanity: max_build_length_m upper bound (m), RC-measured p995 58.9 / max obs 316.23. Ported verbatim from the pre-conversion literal (100). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_lowrise_opt_aor_gfa_max_sqm', default: 2500, min: 0, max: 100000, group: 'Spatial & Massing', description: 'assert_parcel_sanity: lowrise (RD/RS/RT) opt_aor_gfa_sqm upper bound. Ported verbatim from the pre-conversion literal (2500). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_nonlowrise_opt_aor_gfa_max_sqm', default: 3500, min: 0, max: 100000, group: 'Spatial & Massing', description: 'assert_parcel_sanity: non-lowrise opt_aor_gfa_sqm upper bound. Ported verbatim from the pre-conversion literal (3500). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_comp_fsi_p50_max', default: 4.0, min: 0, max: 50, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: comp_fsi_p50 upper bound (INFO-first, 212 standing). Ported verbatim from the pre-conversion literal (4.0). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_comp_fsi_p50_min', default: 0.05, min: 0, max: 5, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: comp_fsi_p50 implausibly-low lower bound. Ported verbatim from the pre-conversion literal (0.05). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_priced_newbuild_min_gfa_sqm', default: 30, min: 0, max: 1000, group: 'Spatial & Massing', description: 'assert_parcel_sanity: priced new-build opt_aor_gfa_sqm lower bound (micro-envelope INFO watch). Ported verbatim from the pre-conversion literal (30). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_lowrise_bylaw_fsi_max', default: 1.5, min: 0, max: 20, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: lowrise bylaw_max_fsi upper bound (FSI-borrow bug watch). Ported verbatim from the pre-conversion literal (1.5). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_bylaw_fsi_max', default: 8, min: 0, max: 50, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: residential bylaw_max_fsi upper bound (corrupt-source watch). Ported verbatim from the pre-conversion literal (8). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_lowrise_coverage_max_pct', default: 50, min: 0, max: 100, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: lowrise bylaw_max_coverage_pct upper bound. Ported verbatim from the pre-conversion literal (50). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_lowrise_bylaw_height_max_m', default: 15, min: 0, max: 200, group: 'Spatial & Massing', description: 'assert_parcel_sanity: lowrise bylaw_max_height_m upper bound (tree-massing watch). Ported verbatim from the pre-conversion literal (15). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_footprint_coverage_max_ratio', default: 0.65, min: 0, max: 2, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: max_buildable_footprint_sqm / lot_size_sqm upper ratio bound. Ported verbatim from the pre-conversion literal (0.65). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_max_build_fsi_max', default: 5, min: 0, max: 50, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: max_build_fsi upper bound (garbage-GFA watch). Ported verbatim from the pre-conversion literal (5). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_coa_fsi_max', default: 5, min: 0, max: 50, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: coa_fsi upper bound (garbage-GFA watch). Ported verbatim from the pre-conversion literal (5). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_lowrise_maxbuild_height_max_m', default: 15, min: 0, max: 200, group: 'Spatial & Massing', description: 'assert_parcel_sanity: lowrise max_build_height_m upper bound (tree-massing / envelope-height watch). Ported verbatim from the pre-conversion literal (15). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_lowrise_maxbuild_stories_max', default: 4, min: 0, max: 100, group: 'Spatial & Massing', description: 'assert_parcel_sanity: lowrise max_build_stories upper bound (over-tall envelope watch). Ported verbatim from the pre-conversion literal (4). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_rd_maxbuild_stories_max', default: 3, min: 0, max: 100, group: 'Spatial & Massing', description: 'assert_parcel_sanity: RD-only max_build_stories upper bound (tighter than the lowrise bound). Ported verbatim from the pre-conversion literal (3). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_height_per_storey_min_m', default: 2.5, min: 0, max: 20, group: 'Spatial & Massing', description: 'assert_parcel_sanity: GATE — bylaw_max_height_m / bylaw_max_stories physical-impossibility floor (the WELD signature). Ported verbatim from the pre-conversion literal (2.5). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_height_per_storey_max_m', default: 5.5, min: 0, max: 50, group: 'Spatial & Massing', description: 'assert_parcel_sanity: bylaw_max_height_m / bylaw_max_stories generous-zoning INFO ceiling (never a bug). Ported verbatim from the pre-conversion literal (5.5). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_opt_storeys_max', default: 12, min: 0, max: 200, group: 'Spatial & Massing', description: 'assert_parcel_sanity: opt_aor_storeys / opt_coa_storeys physical upper bound. Ported verbatim from the pre-conversion literal (12). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_newbuild_cost_per_sqm_min', default: 2000, min: 0, max: 100000, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: cost_fb_total / opt_aor_gfa_sqm rate lower bound (CAD/sqm). Ported verbatim from the pre-conversion literal (2000). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_newbuild_cost_per_sqm_max', default: 12000, min: 0, max: 1000000, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: cost_fb_total / opt_aor_gfa_sqm rate upper bound (CAD/sqm). Ported verbatim from the pre-conversion literal (12000). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_lowrise_cost_fb_max_cad', default: 15000000, min: 0, max: 1e10, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: lowrise cost_fb_total magnitude watch (CAD), COST_FB_GT15M_LEGIT accept-list of 24 ids filters the current investigated population. Ported verbatim from the pre-conversion literal (15000000). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_cost_addition_max_cad', default: 50000000, min: 0, max: 1e10, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: cost_addition_total magnitude watch (CAD), COST_ADDITION_GT50M_LEGIT accept-list of 42 ids filters the current investigated population. Ported verbatim from the pre-conversion literal (50000000). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_dim_lot_tolerance_m', default: 0.01, min: 0, max: 10, group: 'Spatial & Massing', description: 'assert_parcel_sanity: GATE — max_build width/length vs frontage/depth mislink tolerance (m). Ported verbatim from the pre-conversion literal (0.01). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_gfa_coherence_tolerance_sqm', default: 0.5, min: 0, max: 100, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: GATE — opt_aor_gfa_sqm vs opt_coa_gfa_sqm / max_buildable_gfa_sqm coherence tolerance (sqm). Ported verbatim from the pre-conversion literal (0.5). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_cost_coherence_tolerance_cad', default: 1, min: 0, max: 10000, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: GATE — cost_fb_total vs cost_coa_total coherence tolerance (CAD). Ported verbatim from the pre-conversion literal (1). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_greenspace_tolerance_sqm', default: 0.5, min: 0, max: 100, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: existing_greenspace_sqm vs lot_size_sqm coherence tolerance (sqm). Ported verbatim from the pre-conversion literal (0.5). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_realized_fsi_p90_min', default: 0.1, min: 0, max: 10, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: realized_fsi_p90 lower bound. Ported verbatim from the pre-conversion literal (0.1). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_realized_fsi_p90_max', default: 6, min: 0, max: 50, group: 'Data Quality Thresholds', description: 'assert_parcel_sanity: realized_fsi_p90 upper bound. Ported verbatim from the pre-conversion literal (6). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_distribution_percentile', default: 0.99, min: 0.5, max: 0.9999, group: 'Spatial & Massing', description: 'assert_parcel_sanity: per-zone distribution-scan outlier percentile (percentile_cont). Ported verbatim from the pre-conversion literal (0.99). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_distribution_median_multiplier', default: 3, min: 1, max: 100, group: 'Spatial & Massing', description: 'assert_parcel_sanity: per-zone distribution-scan outlier median multiplier (value > multiplier x zone median). Ported verbatim from the pre-conversion literal (3). CONSUMED by assert_parcel_sanity.' },
  { name: 'parcel_sanity_distribution_median_floor', default: 0.0001, min: 0, max: 1, group: 'Spatial & Massing', description: 'assert_parcel_sanity: per-zone distribution-scan zero-median floor (GREATEST(median, floor)). Ported verbatim from the pre-conversion literal (0.0001). CONSUMED by assert_parcel_sanity.' },
];

// ---------------------------------------------------------------------------
// CHECK_DEFS — the 42 BOUND/INVARIANT checks. `applies`/`bad` are (cfg) => sql
// functions; every literal magnitude a logic variable now governs is read from
// `cfg[<name>]` via `num()`. `accept` (an array of numeric parcel ids) is
// descriptor data (Ask A2(a)), spliced verbatim as `id <> ALL(ARRAY[...])`.
// ---------------------------------------------------------------------------
const CHECK_DEFS = [
  // ---- BOUNDS (zone-aware) ----
  { fam: 'BOUND', id: 'lot_size_out_of_range', sev: 'HIGH', gate: false,
    why: 'physical (out-of-range lot, any emit state; Option A retired WF3 Phase 1). Bound: parcel_sanity_lot_size_min_sqm / parcel_sanity_lot_size_max_sqm.',
    applies: () => `lot_size_sqm IS NOT NULL AND feature_type IS DISTINCT FROM 'COMMON' AND feature_type IS DISTINCT FROM 'CONDO'`,
    bad: (cfg) => `lot_size_sqm < ${num(cfg.parcel_sanity_lot_size_min_sqm, 'parcel_sanity_lot_size_min_sqm')} OR lot_size_sqm > ${num(cfg.parcel_sanity_lot_size_max_sqm, 'parcel_sanity_lot_size_max_sqm')}` },
  { fam: 'BOUND', id: 'lot_size_out_of_range_common_condo', sev: 'INFO', gate: false,
    why: 'visibility: COMMON/CONDO out-of-range lots — excluded from the bound by design.',
    applies: () => `lot_size_sqm IS NOT NULL AND (feature_type = 'COMMON' OR feature_type = 'CONDO')`,
    bad: (cfg) => `lot_size_sqm < ${num(cfg.parcel_sanity_lot_size_min_sqm, 'parcel_sanity_lot_size_min_sqm')} OR lot_size_sqm > ${num(cfg.parcel_sanity_lot_size_max_sqm, 'parcel_sanity_lot_size_max_sqm')}` },
  { fam: 'BOUND', id: 'lot_implausible_correctly_excluded', sev: 'INFO', gate: false,
    why: 'visibility: implausible lot -> gated, no cost (not a bug).',
    applies: (cfg) => `lot_size_sqm IS NOT NULL AND (lot_size_sqm < ${num(cfg.parcel_sanity_lot_size_min_sqm, 'parcel_sanity_lot_size_min_sqm')} OR lot_size_sqm > ${num(cfg.parcel_sanity_lot_size_max_sqm, 'parcel_sanity_lot_size_max_sqm')})`,
    bad: () => `max_buildable_footprint_sqm IS NULL` },
  { fam: 'BOUND', id: 'max_build_width_gt_30m', sev: 'MED', gate: false,
    why: 'RC bound (p995 27.2, max obs 42.66).',
    applies: () => `max_build_width_m IS NOT NULL`,
    bad: (cfg) => `max_build_width_m > ${num(cfg.parcel_sanity_max_build_width_max_m, 'parcel_sanity_max_build_width_max_m')}` },
  { fam: 'BOUND', id: 'max_build_length_gt_100m', sev: 'HIGH', gate: false,
    why: 'RC bound (p995 58.9, max obs 316.23).',
    applies: () => `max_build_length_m IS NOT NULL`,
    bad: (cfg) => `max_build_length_m > ${num(cfg.parcel_sanity_max_build_length_max_m, 'parcel_sanity_max_build_length_max_m')}` },
  { fam: 'BOUND', id: 'lowrise_opt_aor_gfa_gt_2500', sev: 'HIGH', gate: false,
    why: 'RC bound (lowrise max obs 1,998.9).',
    applies: () => `(${LOWRISE}) AND opt_aor_gfa_sqm IS NOT NULL`,
    bad: (cfg) => `opt_aor_gfa_sqm > ${num(cfg.parcel_sanity_lowrise_opt_aor_gfa_max_sqm, 'parcel_sanity_lowrise_opt_aor_gfa_max_sqm')}` },
  { fam: 'BOUND', id: 'nonlowrise_opt_aor_gfa_gt_3500', sev: 'HIGH', gate: false,
    why: 'RC bound (catches the 3,843 m2 NON-lowrise outlier a lowrise-only bound misses).',
    applies: () => `NOT (${LOWRISE}) AND opt_aor_gfa_sqm IS NOT NULL`,
    bad: (cfg) => `opt_aor_gfa_sqm > ${num(cfg.parcel_sanity_nonlowrise_opt_aor_gfa_max_sqm, 'parcel_sanity_nonlowrise_opt_aor_gfa_max_sqm')}` },
  { fam: 'BOUND', id: 'comp_fsi_p50_gt_4', sev: 'INFO', gate: false,
    why: 'RC bound; INFO-first (212 standing), promote per Spec 48 3.6.',
    applies: () => `comp_fsi_p50 IS NOT NULL`,
    bad: (cfg) => `comp_fsi_p50 > ${num(cfg.parcel_sanity_comp_fsi_p50_max, 'parcel_sanity_comp_fsi_p50_max')}` },
  { fam: 'BOUND', id: 'priced_newbuild_lt_30sqm', sev: 'INFO', gate: false,
    why: 'RC-A: micro-envelope (<30 sqm opt_aor) carrying a priced new-build menu.',
    applies: () => `cost_fb_total IS NOT NULL AND opt_aor_gfa_sqm IS NOT NULL`,
    bad: (cfg) => `opt_aor_gfa_sqm < ${num(cfg.parcel_sanity_priced_newbuild_min_gfa_sqm, 'parcel_sanity_priced_newbuild_min_gfa_sqm')}` },
  { fam: 'BOUND', id: 'max_build_dim_below_floor', sev: 'HIGH', gate: true,
    why: "D-C clamp: no emitted dim below the viability floor (inert-INFO expected post-fix). Reuses max_build_min_dimension_m (Ask A6(a)) — the same floor enrich-parcels.js's max-build.js clamps to.",
    applies: (cfg) => `(max_build_width_m IS NOT NULL AND max_build_width_m < ${num(cfg.max_build_min_dimension_m, 'max_build_min_dimension_m')}) OR (max_build_length_m IS NOT NULL AND max_build_length_m < ${num(cfg.max_build_min_dimension_m, 'max_build_min_dimension_m')})`,
    bad: () => `TRUE` },
  { fam: 'BOUND', id: 'lowrise_bylaw_fsi_gt_1_5', sev: 'HIGH', gate: false,
    why: 'FSI-borrow bug (RD sliver -> 2.0).',
    applies: () => `(${LOWRISE}) AND bylaw_max_fsi IS NOT NULL`,
    bad: (cfg) => `bylaw_max_fsi > ${num(cfg.parcel_sanity_lowrise_bylaw_fsi_max, 'parcel_sanity_lowrise_bylaw_fsi_max')}` },
  { fam: 'BOUND', id: 'residential_bylaw_fsi_gt_8', sev: 'HIGH', gate: false,
    why: 'corrupt source (FSI 15).',
    applies: () => `bylaw_max_fsi IS NOT NULL`,
    bad: (cfg) => `bylaw_max_fsi > ${num(cfg.parcel_sanity_bylaw_fsi_max, 'parcel_sanity_bylaw_fsi_max')}` },
  { fam: 'BOUND', id: 'lowrise_coverage_gt_50pct', sev: 'MED', gate: false,
    why: 'coverage-uncapped bug (67%).',
    applies: () => `(${LOWRISE}) AND bylaw_max_coverage_pct IS NOT NULL`,
    bad: (cfg) => `bylaw_max_coverage_pct > ${num(cfg.parcel_sanity_lowrise_coverage_max_pct, 'parcel_sanity_lowrise_coverage_max_pct')}` },
  { fam: 'BOUND', id: 'lowrise_height_gt_15m', sev: 'MED', gate: false,
    why: 'tree-massing (95m bungalow).',
    applies: () => `(${LOWRISE}) AND bylaw_max_height_m IS NOT NULL`,
    bad: (cfg) => `bylaw_max_height_m > ${num(cfg.parcel_sanity_lowrise_bylaw_height_max_m, 'parcel_sanity_lowrise_bylaw_height_max_m')}` },
  { fam: 'BOUND', id: 'footprint_coverage_gt_65pct', sev: 'HIGH', gate: false,
    why: 'coverage-uncapped bug.',
    applies: () => `max_buildable_footprint_sqm IS NOT NULL AND lot_size_sqm > 0`,
    bad: (cfg) => `max_buildable_footprint_sqm / lot_size_sqm > ${num(cfg.parcel_sanity_footprint_coverage_max_ratio, 'parcel_sanity_footprint_coverage_max_ratio')}` },
  { fam: 'BOUND', id: 'max_build_fsi_gt_5', sev: 'HIGH', gate: false,
    why: 'garbage GFA (FSI 1042).',
    applies: () => `max_build_fsi IS NOT NULL`,
    bad: (cfg) => `max_build_fsi > ${num(cfg.parcel_sanity_max_build_fsi_max, 'parcel_sanity_max_build_fsi_max')}` },
  { fam: 'BOUND', id: 'coa_fsi_gt_5', sev: 'HIGH', gate: false,
    why: 'garbage GFA.',
    applies: () => `coa_fsi IS NOT NULL`,
    bad: (cfg) => `coa_fsi > ${num(cfg.parcel_sanity_coa_fsi_max, 'parcel_sanity_coa_fsi_max')}` },
  { fam: 'BOUND', id: 'lowrise_maxbuild_height_gt_15m', sev: 'MED', gate: false,
    why: 'tree-massing (envelope height).',
    applies: () => `(${LOWRISE}) AND max_build_height_m IS NOT NULL`,
    bad: (cfg) => `max_build_height_m > ${num(cfg.parcel_sanity_lowrise_maxbuild_height_max_m, 'parcel_sanity_lowrise_maxbuild_height_max_m')}` },
  { fam: 'BOUND', id: 'comp_fsi_p50_implausibly_low', sev: 'INFO', gate: false,
    why: 'comps domain-review (existing vs realized-build?).',
    applies: () => `comp_fsi_p50 IS NOT NULL`,
    bad: (cfg) => `comp_fsi_p50 < ${num(cfg.parcel_sanity_comp_fsi_p50_min, 'parcel_sanity_comp_fsi_p50_min')}` },
  { fam: 'BOUND', id: 'lowrise_maxbuild_stories_gt_4', sev: 'MED', gate: false,
    why: 'over-tall envelope.',
    applies: () => `(${LOWRISE}) AND max_build_stories IS NOT NULL`,
    bad: (cfg) => `max_build_stories > ${num(cfg.parcel_sanity_lowrise_maxbuild_stories_max, 'parcel_sanity_lowrise_maxbuild_stories_max')}` },
  { fam: 'BOUND', id: 'rd_maxbuild_stories_gt_3', sev: 'MED', gate: false,
    why: 'RD detached caps ~3 storeys (tighter than lowrise >4).',
    applies: () => `upper(zoning_class) LIKE 'RD%' AND max_build_stories IS NOT NULL`,
    bad: (cfg) => `max_build_stories > ${num(cfg.parcel_sanity_rd_maxbuild_stories_max, 'parcel_sanity_rd_maxbuild_stories_max')}` },
  { fam: 'BOUND', id: 'maxbuild_stories_basis_existing_retired', sev: 'HIGH', gate: true,
    why: "retired basis value (heritage massing storeys) — regression guard, no magnitude, not a tunable.",
    applies: () => `max_build_stories_basis IS NOT NULL`,
    bad: () => `max_build_stories_basis = 'existing'` },
  { fam: 'BOUND', id: 'bylaw_height_per_storey_impossible', sev: 'HIGH', gate: true,
    why: 'weld: cannot fit the storeys in the height (<2.5 m/storey).',
    applies: () => `bylaw_max_height_m IS NOT NULL AND bylaw_max_stories IS NOT NULL AND bylaw_max_stories > 0`,
    bad: (cfg) => `bylaw_max_height_m / bylaw_max_stories < ${num(cfg.parcel_sanity_height_per_storey_min_m, 'parcel_sanity_height_per_storey_min_m')}` },
  { fam: 'BOUND', id: 'bylaw_height_per_storey_generous', sev: 'INFO', gate: false,
    why: 'visibility: generous height + low storey cap (genuine low-density zoning, not a bug).',
    applies: () => `bylaw_max_height_m IS NOT NULL AND bylaw_max_stories IS NOT NULL AND bylaw_max_stories > 0`,
    bad: (cfg) => `bylaw_max_height_m / bylaw_max_stories > ${num(cfg.parcel_sanity_height_per_storey_max_m, 'parcel_sanity_height_per_storey_max_m')}` },
  { fam: 'BOUND', id: 'opt_storeys_gt_12', sev: 'MED', gate: false,
    why: 'physical.',
    applies: () => `opt_aor_storeys IS NOT NULL OR opt_coa_storeys IS NOT NULL`,
    bad: (cfg) => `opt_aor_storeys > ${num(cfg.parcel_sanity_opt_storeys_max, 'parcel_sanity_opt_storeys_max')} OR opt_coa_storeys > ${num(cfg.parcel_sanity_opt_storeys_max, 'parcel_sanity_opt_storeys_max')}` },
  { fam: 'BOUND', id: 'newbuild_cost_per_sqm_out_of_band', sev: 'MED', gate: false,
    why: 'cost-rate sanity ($186-1115/ft2).',
    applies: () => `cost_fb_total IS NOT NULL AND opt_aor_gfa_sqm > 0`,
    bad: (cfg) => `cost_fb_total / opt_aor_gfa_sqm < ${num(cfg.parcel_sanity_newbuild_cost_per_sqm_min, 'parcel_sanity_newbuild_cost_per_sqm_min')} OR cost_fb_total / opt_aor_gfa_sqm > ${num(cfg.parcel_sanity_newbuild_cost_per_sqm_max, 'parcel_sanity_newbuild_cost_per_sqm_max')}` },
  { fam: 'BOUND', id: 'nulllot_on_gfa_or_cost_bearing', sev: 'MED', gate: false,
    why: 'A1: lot_size NULL on a GFA/cost-bearing parcel (unvalidatable tail) — structural, no magnitude.',
    applies: () => `max_buildable_gfa_sqm IS NOT NULL OR cost_fb_total IS NOT NULL`,
    bad: () => `lot_size_sqm IS NULL` },
  { fam: 'BOUND', id: 'lowrise_cost_fb_gt_15m', sev: 'MED', gate: false,
    why: 'A2: new lowrise >$15M max-build (mislink/poison if not a big lot).',
    applies: () => `(${LOWRISE}) AND cost_fb_total IS NOT NULL`,
    bad: (cfg) => `cost_fb_total > ${num(cfg.parcel_sanity_lowrise_cost_fb_max_cad, 'parcel_sanity_lowrise_cost_fb_max_cad')}`,
    accept: COST_FB_GT15M_LEGIT },
  { fam: 'BOUND', id: 'cost_addition_gt_50m', sev: 'MED', gate: false,
    why: 'A2: new >$50M addition line (huge-lot artifact; watch for new members).',
    applies: () => `cost_addition_total IS NOT NULL`,
    bad: (cfg) => `cost_addition_total > ${num(cfg.parcel_sanity_cost_addition_max_cad, 'parcel_sanity_cost_addition_max_cad')}`,
    accept: COST_ADDITION_GT50M_LEGIT },
  // ---- INVARIANTS (cross-field) — zero-baseline coherence laws are GATED ----
  { fam: 'INVARIANT', id: 'max_build_dim_exceeds_lot_dim', sev: 'HIGH', gate: true,
    why: 'high-side lot bound: width <= frontage, length <= depth (wrong-axis error class).',
    applies: () => `(max_build_width_m IS NOT NULL AND frontage_m IS NOT NULL) OR (max_build_length_m IS NOT NULL AND depth_m IS NOT NULL)`,
    bad: (cfg) => `(max_build_width_m IS NOT NULL AND frontage_m IS NOT NULL AND max_build_width_m > frontage_m + ${num(cfg.parcel_sanity_dim_lot_tolerance_m, 'parcel_sanity_dim_lot_tolerance_m')}) OR (max_build_length_m IS NOT NULL AND depth_m IS NOT NULL AND max_build_length_m > depth_m + ${num(cfg.parcel_sanity_dim_lot_tolerance_m, 'parcel_sanity_dim_lot_tolerance_m')})` },
  { fam: 'INVARIANT', id: 'ravine_constrained_carries_priced_cost', sev: 'HIGH', gate: true,
    why: 'D-C withheld envelope must not be priced (R3-M1 tripwire) — structural, no magnitude.',
    applies: () => `envelope_constraint_reason = 'ravine_constrained'`,
    bad: () => `cost_fb_total IS NOT NULL OR cost_solar_total IS NOT NULL OR opt_aor_gfa_sqm IS NOT NULL OR opt_coa_gfa_sqm IS NOT NULL` },
  { fam: 'INVARIANT', id: 'opt_aor_gfa_gt_opt_coa_gfa', sev: 'HIGH', gate: true,
    why: 'CoA >= as-of-right (coherence).',
    applies: () => `opt_aor_gfa_sqm IS NOT NULL AND opt_coa_gfa_sqm IS NOT NULL`,
    bad: (cfg) => `opt_aor_gfa_sqm > opt_coa_gfa_sqm + ${num(cfg.parcel_sanity_gfa_coherence_tolerance_sqm, 'parcel_sanity_gfa_coherence_tolerance_sqm')}` },
  { fam: 'INVARIANT', id: 'opt_aor_storeys_gt_opt_coa_storeys', sev: 'MED', gate: false,
    why: 'CoA storeys >= as-of-right — structural, no magnitude.',
    applies: () => `opt_aor_storeys IS NOT NULL AND opt_coa_storeys IS NOT NULL`,
    bad: () => `opt_aor_storeys > opt_coa_storeys` },
  { fam: 'INVARIANT', id: 'new_build_cost_gt_coa_build_cost', sev: 'HIGH', gate: true,
    why: 'THE headline bug (new_build > coa_build).',
    applies: () => `cost_fb_total IS NOT NULL AND cost_coa_total IS NOT NULL`,
    bad: (cfg) => `cost_fb_total > cost_coa_total + ${num(cfg.parcel_sanity_cost_coherence_tolerance_cad, 'parcel_sanity_cost_coherence_tolerance_cad')}` },
  { fam: 'INVARIANT', id: 'footprint_gt_lot_x105', sev: 'HIGH', gate: true,
    why: 'footprint <= lot x (1+mislink_footprint_lot_tol) (mislink). Reuses mislink_footprint_lot_tol (Ask A6(a)).',
    applies: () => `max_buildable_footprint_sqm IS NOT NULL AND lot_size_sqm IS NOT NULL`,
    bad: (cfg) => `max_buildable_footprint_sqm > lot_size_sqm * (1 + ${num(cfg.mislink_footprint_lot_tol, 'mislink_footprint_lot_tol')})` },
  { fam: 'INVARIANT', id: 'existing_floor_gt_lot_x105', sev: 'HIGH', gate: true,
    why: 'existing footprint <= lot x (1+mislink_footprint_lot_tol). Reuses mislink_footprint_lot_tol.',
    applies: () => `cur_floor_gfa_sqm IS NOT NULL AND lot_size_sqm IS NOT NULL`,
    bad: (cfg) => `cur_floor_gfa_sqm > lot_size_sqm * (1 + ${num(cfg.mislink_footprint_lot_tol, 'mislink_footprint_lot_tol')})` },
  { fam: 'INVARIANT', id: 'heritage_basis_footprint_gt_lot', sev: 'HIGH', gate: true,
    why: 'heritage freeze == mislink-guard agreement. Reuses mislink_footprint_lot_tol.',
    applies: () => `max_buildable_gfa_basis = 'heritage_existing' AND max_buildable_footprint_sqm IS NOT NULL AND lot_size_sqm IS NOT NULL`,
    bad: (cfg) => `max_buildable_footprint_sqm > lot_size_sqm * (1 + ${num(cfg.mislink_footprint_lot_tol, 'mislink_footprint_lot_tol')})` },
  { fam: 'INVARIANT', id: 'stale_cost_fsi_without_gfa', sev: 'MED', gate: false,
    why: 'stale cost (needs compute_parcel_cost_estimates re-run) — structural, no magnitude.',
    applies: () => `max_build_fsi IS NOT NULL`,
    bad: () => `max_buildable_gfa_sqm IS NULL` },
  { fam: 'INVARIANT', id: 'cost_fb_on_footprint_gt_lot', sev: 'HIGH', gate: true,
    why: 'garbage cost on a mislink not yet cleared. Reuses mislink_footprint_lot_tol.',
    applies: () => `cost_fb_total IS NOT NULL AND max_buildable_footprint_sqm IS NOT NULL AND lot_size_sqm IS NOT NULL`,
    bad: (cfg) => `max_buildable_footprint_sqm > lot_size_sqm * (1 + ${num(cfg.mislink_footprint_lot_tol, 'mislink_footprint_lot_tol')})` },
  { fam: 'INVARIANT', id: 'greenspace_out_of_range', sev: 'MED', gate: false,
    why: '0 <= greenspace <= lot.',
    applies: () => `existing_greenspace_sqm IS NOT NULL AND lot_size_sqm IS NOT NULL`,
    bad: (cfg) => `existing_greenspace_sqm < 0 OR existing_greenspace_sqm > lot_size_sqm + ${num(cfg.parcel_sanity_greenspace_tolerance_sqm, 'parcel_sanity_greenspace_tolerance_sqm')}` },
  { fam: 'INVARIANT', id: 'opt_aor_gfa_gt_max_buildable_gfa', sev: 'HIGH', gate: true,
    why: 'as-of-right <= lot-validated envelope (F2-promoted; dev+cloud measured 0). Shares parcel_sanity_gfa_coherence_tolerance_sqm.',
    applies: () => `opt_aor_gfa_sqm IS NOT NULL AND max_buildable_gfa_sqm IS NOT NULL`,
    bad: (cfg) => `opt_aor_gfa_sqm > max_buildable_gfa_sqm + ${num(cfg.parcel_sanity_gfa_coherence_tolerance_sqm, 'parcel_sanity_gfa_coherence_tolerance_sqm')}` },
  { fam: 'INVARIANT', id: 'realized_fsi_p90_out_of_range', sev: 'MED', gate: false,
    why: 'realized FSI in [0.1, 6].',
    applies: () => `realized_fsi_p90 IS NOT NULL`,
    bad: (cfg) => `realized_fsi_p90 < ${num(cfg.parcel_sanity_realized_fsi_p90_min, 'parcel_sanity_realized_fsi_p90_min')} OR realized_fsi_p90 > ${num(cfg.parcel_sanity_realized_fsi_p90_max, 'parcel_sanity_realized_fsi_p90_max')}` },
];

// DISTRIBUTION: per-zone outliers = value beyond the configured percentile AND
// > the configured multiplier x the zone median. Always INFO — visibility
// signals for human review, never verdict-driving (F4).
const DIST_DEFS = [
  { id: 'bylaw_max_fsi', expr: 'bylaw_max_fsi' },
  { id: 'max_build_fsi', expr: 'max_build_fsi' },
  { id: 'footprint_coverage', expr: 'max_buildable_footprint_sqm / NULLIF(lot_size_sqm,0)' },
  { id: 'max_build_height_m', expr: 'max_build_height_m' },
  { id: 'newbuild_cost_per_sqm', expr: 'cost_fb_total / NULLIF(opt_aor_gfa_sqm,0)' },
  { id: 'opt_aor_gfa_sqm', expr: 'opt_aor_gfa_sqm' },
  { id: 'comp_fsi_p50', expr: 'comp_fsi_p50' },
  { id: 'lot_size_sqm', expr: 'lot_size_sqm' },
];

/** id-safe slug (matches step.schema.json's `^[a-z][a-z0-9_]*$`). */
function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/_+/g, '_');
}

module.exports = {
  RES, ZC, LOWRISE,
  COST_FB_GT15M_LEGIT, COST_ADDITION_GT50M_LEGIT,
  REUSED_MAX_BUILD_MIN_DIMENSION_M, REUSED_MISLINK_FOOTPRINT_LOT_TOL,
  LOGIC_VAR_DEFS, CHECK_DEFS, DIST_DEFS,
  num, slugify,
};
