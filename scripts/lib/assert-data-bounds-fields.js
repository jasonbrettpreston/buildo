'use strict';
/**
 * assert-data-bounds-fields.js — the SINGLE declared source of truth for every
 * `assert_data_bounds` check + logic_variables entry: descriptor generation
 * (`scripts/quality/assert-data-bounds.descriptor.json`) AND the compute dispatch
 * table (`scripts/lib/compute/assert-data-bounds.js`) both read this ONE module,
 * so the two can never silently drift (Ask A1 precedent —
 * `scripts/lib/assert-global-coverage-fields.js`).
 *
 * Pure data + pure helpers — no I/O, no `pg`, no `ctx`. Safe to `require()` from a
 * compute module (Spec 122 §5.5 (3) — a pure `scripts/lib/` leaf is allowed).
 *
 * SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §4 (Data bounds)
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 * SPEC LINK: docs/specs/01-pipeline/30_pipeline_architecture.md §5.4.1
 *
 * Ported verbatim from `scripts/quality/assert-data-bounds.js` (pre-conversion,
 * 1,055 L) per `docs/reports/2026-09-12-batch1-i2-assert-data-bounds-assessment.md`
 * §2.3 (the 49-row census) and §2.4 (the Spec 123 §7.1 adjudication — 18 new
 * logic_variables + 1 knowingly-retired, `.cursor/batch1_i2_assert_data_bounds_active_task.md`).
 *
 * ── FOUR NAMED, DECLARED CONVERSION CONSEQUENCES (Spec 123 §3.1 — none silent) ──
 *
 *  (1) `identity.display_name` is ONE string for every chain (step.schema.json's
 *      own contract: "the human-readable name emitted in records_meta.audit_table.name").
 *      Pre-conversion, the 4 chain-scoped audit tables carried 4 DIFFERENT `name`
 *      values: permits 'Data Quality Checks', coa 'CoA Data Quality', sources
 *      'Sources Data Quality', deep_scrapes 'Data Quality'. The shared library's
 *      `buildAuditTable` (`scripts/lib/step/verdict.js:427`) has no per-chain name
 *      map — only `sharing.varies_by_chain.phase` is a map; `audit_table` there is
 *      a bare `enum:["one","per_chain"]` (step.schema.json:1710), not name data.
 *      No `scripts/lib/step/**`/`step.schema.json` edit is authorized this commit
 *      (Operating Boundaries, library-owned). RESOLVED: one shared display_name,
 *      `'Data Quality Checks'` — matches the permits chain (unchanged) and
 *      `src/lib/quality/types.ts:634`'s own `'Data Quality Checks'` label. The coa/
 *      sources/deep_scrapes chains' `records_meta.audit_table.name` text changes
 *      (a COSMETIC-ONLY consequence: no code greps for the 3 retired literal
 *      strings outside tests — `FreshnessTimeline.tsx:1222/:1299` renders
 *      `at.name` verbatim, no branch on its value).
 *
 *  (2) `permits_pre_permit_count` (IL-3, `adec1f68`) is TWO independent checks per
 *      the operator's ACCEPT ruling (§2.4), never collapsed to one
 *      `chains:["permits","coa"]` row (unlike WSIB/IL-4). A descriptor `checks[]`
 *      id must be unique (it is also the compute dispatch-table key) — the coa-
 *      scoped site is declared under a DIFFERENT id,
 *      `coa_permits_pre_permit_count` (same SQL, same threshold, same severity),
 *      rather than sharing the permits-scoped site's literal metric name. The
 *      coa-chain audit row's `metric` therefore reads
 *      `coa_permits_pre_permit_count`, not `permits_pre_permit_count` — cosmetic
 *      only (Rule-3/verdict-identical), never verdict-affecting.
 *
 *  (3) Two WARN-only checks that were pre-conversion "warnings[]-only, no audit
 *      row at all" (`cost_estimates` null-rate and min-tier-count, `:868`/`:872`)
 *      are DECLARED as real `checks[]` entries here
 *      (`cost_estimates_null_rate`/`cost_estimates_min_tiers`) so their two
 *      logic_variables (`cost_est_null_rate_warn_pct`/`cost_est_min_tiers`, both
 *      pre-existing) are honestly `CONSUMED by assert_data_bounds` with a visible
 *      row, not merely referenced inside an un-audited `warnings.push`. A Nothing-
 *      Hidden addition (2 new visible audit rows), never a removal.
 *
 *  (4) `inspection_ancient_dates_count_warn_max` (item 18, report §2.4) is
 *      DECLARED (Rule 3, the test suite's 26-name list) but genuinely NOT bound
 *      via `limit_from_config` — re-reading the pre-conversion `checkInsp` helper
 *      (`:741-745`) this session found its `threshold` PARAMETER is DISPLAY TEXT
 *      ONLY: the actual status is `value > 0 ? level : 'PASS'` for every one of
 *      its 12 call sites, including `ancient_dates`'s own `'<= 5'` label — the "5"
 *      was NEVER compared against anything at runtime. Wiring the new var into a
 *      real 5-tolerant bound would be a BEHAVIOUR CHANGE mid-conversion (forbidden,
 *      Spec 123 §1.1/KFM3); the check stays `viol == 0` (value > 0 → WARN,
 *      verbatim). Filed as ADB-D7 (`docs/reports/defect-ledger.md`, OPEN · PIN) —
 *      not fixed here.
 */

/** id-safe slug: lowercase, non [a-z0-9] runs -> '_', trim/collapse. Matches step.schema.json's `^[a-z][a-z0-9_]*$`. */
function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

// ---------------------------------------------------------------------------
// P13-1 magnitude-gate accepted-by-id allowlist (IL-6, `e99ae61a`). VERBATIM
// port of `COST_MAG_ACCEPT` — an AUDITED EXCEPTION LIST (declared `accept_list`,
// not a logic var; Rule 3 draws the same carve-out IL-6/parcel-sanity-audit.js's
// `<> ALL(ARRAY[...])` precedent already established for a Rule-3-exempt constant).
// 3 genuine large multi-unit developments investigated 2026-07-09, all
// cost_source='archetype_rate' (the lot-validated ladder, not the mislinked-
// massing tail): '04 202812 BLD' 8-block/222-unit rowhousing $104M;
// '07 129713 BLD' 187 stacked townhomes $99.9M; '06 196930 BLD' 72 stacked
// townhomes $53.4M.
// ---------------------------------------------------------------------------
const COST_MAG_ACCEPT = ['04 202812 BLD', '07 129713 BLD', '06 196930 BLD'];

// ---------------------------------------------------------------------------
// LOGIC_VAR_DEFS — 8 pre-existing (live) + 18 newly-adjudicated (report §2.4,
// commit-7 §"Tunables to declare"). All verdict-affecting (or, for
// inspection_ancient_dates_count_warn_max, declared per Rule 3's registration
// requirement though not yet wired — see consequence (4) above) -> on_invalid: "fail".
// `calibration_freshness_warn_hours` is KNOWINGLY-RETIRED FROM THIS STEP (ADB-D5,
// zero runtime consumption in assert-data-bounds.js since migration 106) — absent
// from this list, but NOT deleted from scripts/seeds/logic_variables.json: a
// repo-wide grep this commit found it is STILL a live, genuine consumer —
// scripts/compute-phase-calibration.js's own LOGIC_VARS_SCHEMA (a DIFFERENT step,
// unrelated timing_calibration staleness), locked by
// src/tests/compute-phase-calibration.infra.test.ts:68. Per the executor brief's
// explicit STOP rule ("if anything else consumes it, STOP and report instead of
// deleting"), the seed row stays, its description gets a note explaining the
// partial retirement, and this is reported as a deviation rather than silently
// either deleting or keeping the row unexplained.
// ---------------------------------------------------------------------------
const LOGIC_VAR_DEFS = [
  // ── 8 pre-existing (live), unchanged defaults ──────────────────────────────
  { name: 'cost_outlier_ceiling_cad', default: 2000000000, min: 1000000, max: 10000000000, group: 'Data Quality Thresholds', description: 'assert-data-bounds: est_const_cost outlier ceiling (CAD) — negative or above this value flags cost_outliers.' },
  { name: 'desc_null_rate_warn_pct', default: 5, min: 1, max: 100, group: 'Data Quality Thresholds', description: 'assert-data-bounds: permits.description null-rate (last 24h) WARN floor.' },
  { name: 'builder_null_rate_warn_pct', default: 95, min: 1, max: 100, group: 'Data Quality Thresholds', description: 'assert-data-bounds: permits.builder_name null-rate (last 24h) WARN floor (f238b814).' },
  { name: 'cost_est_null_rate_warn_pct', default: 80, min: 1, max: 100, group: 'Data Quality Thresholds', description: 'assert-data-bounds: cost_estimates.estimated_cost null-rate WARN floor.' },
  { name: 'cost_est_min_tiers', default: 2, min: 1, max: 20, group: 'Data Quality Thresholds', description: 'assert-data-bounds: minimum distinct cost_estimates.cost_tier values expected.' },
  { name: 'coa_forward_link_sub085_warn_pct', default: 59, min: 1, max: 100, group: 'CoA Gates & Staleness', description: 'assert-data-bounds: CoA forward-link sub-0.85-confidence share WARN ceiling (P12-B2 regression watch).' },
  { name: 'cost_est_legacy_cost_ceiling_cad', default: 50000000, min: 1000000, max: 2000000000, group: 'Cost Tuning', description: 'assert-data-bounds: P13-1 legacy cost_estimates.estimated_cost magnitude-gate ceiling (CAD).' },
  { name: 'cost_est_legacy_gfa_ceiling_sqm', default: 50000, min: 10000, max: 5000000, group: 'Cost Tuning', description: 'assert-data-bounds: P13-1 legacy cost_estimates.modeled_gfa_sqm magnitude-gate ceiling (sqm).' },
  // ── 18 new (report §2.4 adjudication) ──────────────────────────────────────
  { name: 'cost_outlier_count_warn_max', default: 20, min: 1, max: 100000, group: 'Data Quality Thresholds', description: 'assert-data-bounds: permits cost-outlier row-count WARN ceiling (IL-2, f238b814 — 16-permit baseline, C4 panel A1 2026-08-13 re-review).' },
  { name: 'sources_address_points_floor', default: 500000, min: 1, max: 5000000, group: 'Sources Catastrophic-Load Floors', description: 'assert-data-bounds: address_points row-count FAIL floor (IL-8, 1f8ca38a — ~95% of live 525K).' },
  { name: 'sources_parcels_floor', default: 460000, min: 1, max: 5000000, group: 'Sources Catastrophic-Load Floors', description: 'assert-data-bounds: parcels row-count FAIL floor (IL-8, 1f8ca38a — ~95% of live 486K).' },
  { name: 'sources_building_footprints_floor', default: 400000, min: 1, max: 5000000, group: 'Sources Catastrophic-Load Floors', description: 'assert-data-bounds: building_footprints row-count FAIL floor (IL-8, 1f8ca38a — ~95% of live 427K).' },
  { name: 'sources_neighbourhoods_floor', default: 158, min: 1, max: 1000, group: 'Sources Catastrophic-Load Floors', description: 'assert-data-bounds: neighbourhoods row-count FAIL floor (IL-9, e3dad53d/b4e3d56e).' },
  { name: 'sources_ravines_floor', default: 500, min: 1, max: 100000, group: 'Sources Catastrophic-Load Floors', description: 'assert-data-bounds: ravines row-count FAIL floor (IL-10, 1ceebd17, Spec 59 §8c — ~854 expected; does-not-exist deploy-order guarded, migration 167).' },
  { name: 'sources_heritage_properties_floor', default: 8000, min: 1, max: 100000, group: 'Sources Catastrophic-Load Floors', description: 'assert-data-bounds: heritage_properties row-count FAIL floor (IL-10, 169f22af, Spec 61 §8c; migration 170 deploy-order guarded).' },
  { name: 'sources_heritage_districts_floor', default: 20, min: 1, max: 1000, group: 'Sources Catastrophic-Load Floors', description: 'assert-data-bounds: heritage_districts row-count FAIL floor (IL-10, 169f22af, Spec 61 §8c; migration 170 deploy-order guarded).' },
  { name: 'sources_centreline_floor', default: 40000, min: 1, max: 500000, group: 'Sources Catastrophic-Load Floors', description: 'assert-data-bounds: toronto_centreline row-count FAIL floor (IL-10, f6047e89, Spec 62 §8c; migration 173 deploy-order guarded).' },
  { name: 'coa_null_address_count_warn_max', default: 10, min: 1, max: 100000, group: 'CoA Gates & Staleness', description: 'assert-data-bounds: coa_applications.address null/empty row-count WARN ceiling.' },
  { name: 'coa_ancient_hearing_count_warn_max', default: 5, min: 1, max: 100000, group: 'CoA Gates & Staleness', description: 'assert-data-bounds: coa_applications.hearing_date < 2010-01-01 row-count WARN ceiling.' },
  { name: 'coa_future_hearing_window_years', default: 2, min: 1, max: 20, group: 'CoA Gates & Staleness', description: 'assert-data-bounds: coa_applications.hearing_date future-bound window (years) — FAIL if any hearing exceeds CURRENT_DATE + this many years.' },
  { name: 'coa_cost_gt_threshold_cad', default: 10000000, min: 1000000, max: 500000000, group: 'CoA Gates & Staleness', description: 'assert-data-bounds: coa_applications.estimated_cost magnitude-watch threshold (CAD), P12-C2 (c53f60a8).' },
  { name: 'coa_cost_gt_threshold_warn_max', default: 80, min: 1, max: 100000, group: 'CoA Gates & Staleness', description: 'assert-data-bounds: row-count WARN ceiling for coa_estimated_cost_gt10m (c53f60a8 — baseline ~64 archetype-parcel envelope tail).' },
  { name: 'coa_fsi_gt_threshold', default: 5, min: 1, max: 50, group: 'CoA Gates & Staleness', description: 'assert-data-bounds: coa_applications.coa_fsi magnitude-watch threshold (c53f60a8 — max observed ~3.15).' },
  { name: 'coa_gfa_over_lot_multiple', default: 3, min: 1, max: 20, group: 'CoA Gates & Staleness', description: 'assert-data-bounds: coa_applications.max_buildable_gfa_sqm-over-lot_size_sqm multiple watch (c53f60a8).' },
  { name: 'coa_gfa_over_lot_warn_max', default: 45, min: 1, max: 100000, group: 'CoA Gates & Staleness', description: 'assert-data-bounds: row-count WARN ceiling for coa_maxbuild_gfa_gt3lot (c53f60a8 — baseline ~29 oversized-envelope).' },
  { name: 'inspection_ancient_dates_count_warn_max', default: 5, min: 1, max: 100000, group: 'Data Quality Thresholds', description: 'assert-data-bounds: DECLARED per Rule 3 (report §2.4 item 18) but NOT YET WIRED to a real bound — the pre-conversion checkInsp() helper only ever compares value > 0 for ancient_dates; its displayed "<= 5" threshold was never a live comparison. See ADB-D7 (defect-ledger.md), fix-after.' },
];

// ---------------------------------------------------------------------------
// CHECK_DEFS — the census (report §2.3, 49 distinct metrics) + 2 declared
// warnings-only checks promoted to visible rows (consequence 3) + 1 split id
// (consequence 2) = 52 checks.
//
// Fields:
//   id       - unique, `^[a-z][a-z0-9_]*$`, also the compute dispatch-table key
//   chains   - array of chain slugs this check is scored under
//   severity - 'FAIL' | 'WARN' (declared checks[].severity)
//   kind     - dispatch discriminator for the compute evaluator (see compute file)
//   loader   - which memoized branch loader supplies the observation
//   field    - dotted path into the loader's returned object
//   cfgVar   - logic_variables name this check's bound substitutes (or null)
//   fence    - commit sha this check preserves (or null), for `why`
//   whyText  - one-line why, appended to the fence citation
// ---------------------------------------------------------------------------
const CHECK_DEFS = [
  // ── permits (11) ──────────────────────────────────────────────────────────
  { id: 'cost_outliers', chains: ['permits'], severity: 'WARN', kind: 'boolcfg_ge', loader: 'permits', field: 'costOutliers', cfgVar: 'cost_outlier_count_warn_max', fence: 'f238b814', whyText: 'Cost-outlier row-count WARN ceiling — the C4 panel A1 (2026-08-13) re-review kept the >= 20 baseline; any change must cite git log -L on this check per Spec 30 §5.4.1.' },
  { id: 'null_descriptions_24h', chains: ['permits'], severity: 'WARN', kind: 'pctmax_cfg', loader: 'permits', field: 'descPct', cfgVar: 'desc_null_rate_warn_pct', fence: '4f6114ce', whyText: 'permits.description null-rate over the last 24h (recentTotal>0-gated in the pre-conversion source; SKIP-safe here — reports value:0 when no recent rows, never omitted).' },
  { id: 'null_builders_24h', chains: ['permits'], severity: 'WARN', kind: 'pctmax_cfg', loader: 'permits', field: 'builderPct', cfgVar: 'builder_null_rate_warn_pct', fence: '4f6114ce', whyText: 'permits.builder_name null-rate over the last 24h, same SKIP-safe gating as null_descriptions_24h.' },
  { id: 'null_status_24h', chains: ['permits'], severity: 'WARN', kind: 'raw0', loader: 'permits', field: 'statusNull', cfgVar: null, fence: null, whyText: 'permits.status NULL count over the last 24h, same SKIP-safe gating.' },
  { id: 'orphaned_permit_trades', chains: ['permits'], severity: 'FAIL', kind: 'raw0', loader: 'permits', field: 'orphanTrades', cfgVar: null, fence: null, whyText: 'permit_trades rows with no matching (permit_num, revision_num) in permits — referential-integrity invariant, not a tunable.' },
  { id: 'orphaned_permit_parcels', chains: ['permits'], severity: 'FAIL', kind: 'raw0', loader: 'permits', field: 'orphanParcels', cfgVar: null, fence: null, whyText: 'permit_parcels rows with no matching (permit_num, revision_num) in permits — referential-integrity invariant.' },
  { id: 'duplicate_pk_groups', chains: ['permits'], severity: 'FAIL', kind: 'raw0', loader: 'permits', field: 'dupes', cfgVar: null, fence: null, whyText: 'Duplicate (permit_num, revision_num) groups in permits — PK-uniqueness invariant.' },
  { id: 'permits_pre_permit_count', chains: ['permits'], severity: 'FAIL', kind: 'raw0', loader: 'permits', field: 'prePermitCount', cfgVar: null, fence: 'adec1f68', whyText: 'Phase G (Spec 42 §6.11) Pre-Permit retirement residue, permits-branch site. IL-3 ACCEPT: preserved as an INDEPENDENT check from the coa-branch site (coa_permits_pre_permit_count) — disjoint runPermitChecks/runCoaChecks guards preclude a single shared variable (defense-in-depth, v2-Q2).' },
  { id: 'cost_estimate_over_ceiling', chains: ['permits'], severity: 'WARN', kind: 'raw0', loader: 'costmag', field: 'costMagCount', cfgVar: null, fence: 'e99ae61a', whyText: `P13-1 legacy cost_estimates.estimated_cost magnitude gate (> cost_est_legacy_cost_ceiling_cad, AND permit_num <> ALL(COST_MAG_ACCEPT)). Accept-list (audited exception, not a threshold): ${COST_MAG_ACCEPT.join(', ')} — investigated 2026-07-09, all cost_source='archetype_rate' genuine multi-unit developments.` },
  { id: 'modeled_gfa_over_ceiling', chains: ['permits'], severity: 'WARN', kind: 'raw0', loader: 'costmag', field: 'gfaMagCount', cfgVar: null, fence: 'e99ae61a', whyText: `P13-1 legacy cost_estimates.modeled_gfa_sqm magnitude gate (priced rows only, > cost_est_legacy_gfa_ceiling_sqm, AND permit_num <> ALL(COST_MAG_ACCEPT)). Accept-list: ${COST_MAG_ACCEPT.join(', ')}.` },
  { id: 'ghost_permits_30d', chains: ['permits'], severity: 'WARN', kind: 'raw0', loader: 'ghost', field: 'ghostCount', cfgVar: null, fence: 'ea087109', whyText: "Permits not seen (last_seen_at) in 30+ days, EXCLUDING terminal lifecycle_phase IN ('P19','P20') — ea087109 baseline: pre-fix 8,683 false positives (all P19/P20), true non-terminal ghost count in prod 0. Non-fatal on query error (last_seen_at column may not exist) — reports a SKIP row, never omitted." },
  // ── permits: 2 warnings-only checks promoted to visible rows (consequence 3) ──
  { id: 'cost_estimates_null_rate', chains: ['permits'], severity: 'WARN', kind: 'pctmax_cfg', loader: 'costest', field: 'nullPct', cfgVar: 'cost_est_null_rate_warn_pct', fence: null, whyText: 'cost_estimates.estimated_cost NULL rate. Pre-conversion: warnings[]-only, no audit_table row — promoted to a visible row so cost_est_null_rate_warn_pct is honestly CONSUMED (Nothing Hidden), never a verdict change.' },
  { id: 'cost_estimates_min_tiers', chains: ['permits'], severity: 'WARN', kind: 'floor_min', loader: 'costest', field: 'tierCount', cfgVar: 'cost_est_min_tiers', fence: null, whyText: 'Distinct cost_estimates.cost_tier count. Pre-conversion: warnings[]-only, no audit_table row — promoted to a visible row so cost_est_min_tiers is honestly CONSUMED, never a verdict change.' },

  // ── coa (9) ──────────────────────────────────────────────────────────────
  { id: 'orphan_link_count', chains: ['coa'], severity: 'FAIL', kind: 'raw0', loader: 'coa', field: 'orphanCoa', cfgVar: null, fence: null, whyText: 'coa_applications.linked_permit_num with no matching permits row — referential-integrity invariant.' },
  { id: 'coa_forward_link_sub085_pct', chains: ['coa'], severity: 'WARN', kind: 'pctmax_cfg', loader: 'coa', field: 'coaSub085', cfgVar: 'coa_forward_link_sub085_warn_pct', fence: null, whyText: 'P12-B2: CoA forward-link sub-0.85-confidence share — regression watch on link-quality degradation (baseline ~54%).' },
  { id: 'null_address', chains: ['coa'], severity: 'WARN', kind: 'boolcfg_ge', loader: 'coa', field: 'nullAddress', cfgVar: 'coa_null_address_count_warn_max', fence: null, whyText: 'coa_applications.address NULL/empty row-count WARN ceiling.' },
  { id: 'null_app_num', chains: ['coa'], severity: 'FAIL', kind: 'raw0', loader: 'coa', field: 'nullAppNum', cfgVar: null, fence: null, whyText: 'coa_applications.application_number NULL/empty — referential invariant.' },
  { id: 'future_hearing', chains: ['coa'], severity: 'FAIL', kind: 'raw0', loader: 'coa', field: 'futureHearing', cfgVar: null, fence: null, whyText: 'coa_applications.hearing_date beyond CURRENT_DATE + coa_future_hearing_window_years (bound as a SQL interval parameter, not a verdict threshold) — invariant, always 0 expected.' },
  { id: 'ancient_hearing', chains: ['coa'], severity: 'WARN', kind: 'boolcfg_ge', loader: 'coa', field: 'ancientHearing', cfgVar: 'coa_ancient_hearing_count_warn_max', fence: null, whyText: 'coa_applications.hearing_date before 2010-01-01 row-count WARN ceiling.' },
  { id: 'coa_estimated_cost_gt10m', chains: ['coa'], severity: 'WARN', kind: 'ceiling_max', loader: 'coa', field: 'coaCostGt10m', cfgVar: 'coa_cost_gt_threshold_warn_max', fence: 'c53f60a8', whyText: `P12-C2: coa_applications.estimated_cost > coa_cost_gt_threshold_cad row-count WARN ceiling — archetype_parcel opportunity-menu modeling artifact on oversized opt-envelopes, not an applicant declaration (Spec 76/83, baseline ~64 rows).` },
  { id: 'coa_app_fsi_gt5', chains: ['coa'], severity: 'WARN', kind: 'raw0', loader: 'coa', field: 'coaAppFsiGt5', cfgVar: null, fence: 'c53f60a8', whyText: 'coa_applications.coa_fsi > coa_fsi_gt_threshold (SQL-bound) — model/propagation regression watch, max observed ~3.15.' },
  { id: 'coa_maxbuild_gfa_gt3lot', chains: ['coa'], severity: 'WARN', kind: 'ceiling_max', loader: 'coa', field: 'coaGfaGt3Lot', cfgVar: 'coa_gfa_over_lot_warn_max', fence: 'c53f60a8', whyText: 'coa_applications.max_buildable_gfa_sqm > coa_gfa_over_lot_multiple x lot_size_sqm row-count WARN ceiling — baseline ~29 oversized-envelope rows.' },
  { id: 'coa_permits_pre_permit_count', chains: ['coa'], severity: 'FAIL', kind: 'raw0', loader: 'coa', field: 'coaPrePermitCount', cfgVar: null, fence: 'adec1f68', whyText: 'Phase G (Spec 42 §6.11) Pre-Permit retirement residue, coa-branch site — SAME SQL as permits_pre_permit_count. IL-3 ACCEPT, declared as an independent id (consequence 2): a descriptor checks[] id is also the compute dispatch key, so the two disjoint-guard sites cannot literally share one id the way the pre-conversion audit rows shared one metric string.' },

  // ── sources (13) ─────────────────────────────────────────────────────────
  { id: 'address_points_count', chains: ['sources'], severity: 'FAIL', kind: 'floor_min', loader: 'sources', field: 'apCount', cfgVar: 'sources_address_points_floor', fence: '1f8ca38a', whyText: 'Catastrophic-load floor — a truncated/partial load fails while ordinary quarter-over-quarter growth does not.' },
  { id: 'address_point_dupes', chains: ['sources'], severity: 'FAIL', kind: 'raw0', loader: 'sources', field: 'apDupes', cfgVar: null, fence: null, whyText: 'Duplicate address_points.address_point_id groups — PK-uniqueness invariant.' },
  { id: 'parcels_count', chains: ['sources'], severity: 'FAIL', kind: 'floor_min', loader: 'sources', field: 'parcelCount', cfgVar: 'sources_parcels_floor', fence: '1f8ca38a', whyText: 'Catastrophic-load floor, same reasoning as address_points_count.' },
  { id: 'parcel_dupes', chains: ['sources'], severity: 'FAIL', kind: 'raw0', loader: 'sources', field: 'parcelDupes', cfgVar: null, fence: null, whyText: 'Duplicate parcels.parcel_id groups — PK-uniqueness invariant.' },
  { id: 'parcel_lot_outliers', chains: ['sources'], severity: 'WARN', kind: 'raw0', loader: 'sources', field: 'lotOutliers', cfgVar: null, fence: null, whyText: 'parcels.lot_size_sqm outside (0, 1,000,000] — documented residual (Spec 43 §6.7-A), kept WARN (the enrich/cost pipeline already gates these out via LOT_MIN/MAX): a genuine load corruption would move the core-count floors above, not this handful of outliers.' },
  { id: 'building_footprints_count', chains: ['sources'], severity: 'FAIL', kind: 'floor_min', loader: 'sources', field: 'bfCount', cfgVar: 'sources_building_footprints_floor', fence: '1f8ca38a', whyText: 'Catastrophic-load floor, same reasoning as address_points_count.' },
  { id: 'building_height_outliers', chains: ['sources'], severity: 'WARN', kind: 'raw0', loader: 'sources', field: 'heightOutliers', cfgVar: null, fence: null, whyText: 'building_footprints.max_height_m negative or > 500m.' },
  { id: 'neighbourhoods_count', chains: ['sources'], severity: 'FAIL', kind: 'floor_min', loader: 'sources', field: 'nhoodCount', cfgVar: 'sources_neighbourhoods_floor', fence: 'e3dad53d', whyText: 'Fixed real-world cardinality floor (158 Toronto neighbourhoods) — IL-9 CHANGE-TO logic var: Rule 3 draws no exemption for "unlikely to change," only for ==0/small-integer invariants and audited exception lists.' },
  { id: 'neighbourhood_dupes', chains: ['sources'], severity: 'FAIL', kind: 'raw0', loader: 'sources', field: 'nhoodDupes', cfgVar: null, fence: null, whyText: 'Duplicate neighbourhoods.neighbourhood_id groups — PK-uniqueness invariant.' },
  { id: 'ravines_count', chains: ['sources'], severity: 'FAIL', kind: 'floor_min', loader: 'sources', field: 'ravinesCount', cfgVar: 'sources_ravines_floor', fence: '1ceebd17', whyText: 'Catastrophic-load floor (Spec 59 §8c, ~854 expected). IL-10 SPLIT: the numeric floor is a logic var; the deploy-order does-not-exist guard (migration 167) stays a declared guard on this check, never folded into the bound — reports a SKIP row (never omitted) when the table does not yet exist.' },
  { id: 'heritage_properties_count', chains: ['sources'], severity: 'FAIL', kind: 'floor_min', loader: 'sources', field: 'heritagePropsCount', cfgVar: 'sources_heritage_properties_floor', fence: '169f22af', whyText: 'Catastrophic-load floor (Spec 61 §8c). IL-10 SPLIT, migration 170 deploy-order guard, SKIP-safe.' },
  { id: 'heritage_districts_count', chains: ['sources'], severity: 'FAIL', kind: 'floor_min', loader: 'sources', field: 'heritageDistrictsCount', cfgVar: 'sources_heritage_districts_floor', fence: '169f22af', whyText: 'Catastrophic-load floor (Spec 61 §8c). IL-10 SPLIT, migration 170 deploy-order guard, SKIP-safe.' },
  { id: 'toronto_centreline_count', chains: ['sources'], severity: 'FAIL', kind: 'floor_min', loader: 'sources', field: 'centrelineCount', cfgVar: 'sources_centreline_floor', fence: 'f6047e89', whyText: 'Catastrophic-load floor (Spec 62 §8c). IL-10 SPLIT, migration 173 deploy-order guard, SKIP-safe.' },

  // ── wsib (4, shared permits+sources — IL-4) ─────────────────────────────
  { id: 'wsib_no_legal_name', chains: ['permits', 'sources'], severity: 'FAIL', kind: 'raw0', loader: 'wsib', field: 'wsibNoName', cfgVar: null, fence: '326bb847', whyText: 'wsib_registry.legal_name NULL/empty — IL-4 ACCEPT, one check group authored once, chains:["permits","sources"] (mirrors assert_global_coverage\'s own multi-chain array shape, step.schema.json:685-691). SKIP-safe (reports a benign row) when wsib_registry is empty/missing.' },
  { id: 'wsib_no_g_class', chains: ['permits', 'sources'], severity: 'FAIL', kind: 'raw0', loader: 'wsib', field: 'wsibNonG', cfgVar: null, fence: '326bb847', whyText: 'wsib_registry with no G-prefixed predominant_class/subclass — IL-4.' },
  { id: 'wsib_invalid_naics', chains: ['permits', 'sources'], severity: 'WARN', kind: 'raw0', loader: 'wsib', field: 'wsibBadNaics', cfgVar: null, fence: '326bb847', whyText: 'wsib_registry.naics_code non-numeric — IL-4.' },
  { id: 'wsib_orphaned_links', chains: ['permits', 'sources'], severity: 'FAIL', kind: 'raw0', loader: 'wsib', field: 'wsibOrphan', cfgVar: null, fence: '326bb847', whyText: 'wsib_registry.linked_entity_id with no matching entities row — IL-4.' },

  // ── inspection / deep_scrapes (12) — checkInsp() call sites, verbatim ─────
  // (all 12: status = value > 0 ? level : 'PASS'; the displayed pre-conversion
  // threshold string was NEVER itself compared — see consequence 4 above)
  { id: 'null_permit_num', chains: ['deep_scrapes'], severity: 'FAIL', kind: 'raw0', loader: 'inspection', field: 'nullPermitNum', cfgVar: null, fence: null, whyText: 'permit_inspections.permit_num NULL/empty.' },
  { id: 'null_stage_name', chains: ['deep_scrapes'], severity: 'FAIL', kind: 'raw0', loader: 'inspection', field: 'nullStageName', cfgVar: null, fence: null, whyText: 'permit_inspections.stage_name NULL/empty.' },
  { id: 'null_status', chains: ['deep_scrapes'], severity: 'FAIL', kind: 'raw0', loader: 'inspection', field: 'nullStatus', cfgVar: null, fence: null, whyText: 'permit_inspections.status NULL/empty.' },
  { id: 'null_scraped_at', chains: ['deep_scrapes'], severity: 'FAIL', kind: 'raw0', loader: 'inspection', field: 'nullScrapedAt', cfgVar: null, fence: null, whyText: 'permit_inspections.scraped_at NULL.' },
  { id: 'orphan_inspections', chains: ['deep_scrapes'], severity: 'FAIL', kind: 'raw0', loader: 'inspection', field: 'orphanInsp', cfgVar: null, fence: null, whyText: 'permit_inspections.permit_num with no matching permits row.' },
  { id: 'invalid_status', chains: ['deep_scrapes'], severity: 'FAIL', kind: 'raw0', loader: 'inspection', field: 'badStatus', cfgVar: null, fence: null, whyText: "permit_inspections.status outside the 4-member enum ('Outstanding','Passed','Not Passed','Partial')." },
  { id: 'outstanding_with_date', chains: ['deep_scrapes'], severity: 'WARN', kind: 'raw0', loader: 'inspection', field: 'outstandingWithDate', cfgVar: null, fence: null, whyText: "permit_inspections rows with status='Outstanding' AND a non-null inspection_date." },
  { id: 'completed_without_date', chains: ['deep_scrapes'], severity: 'WARN', kind: 'raw0', loader: 'inspection', field: 'completedNoDate', cfgVar: null, fence: null, whyText: "permit_inspections rows with status!='Outstanding' AND a null inspection_date." },
  { id: 'duplicate_stages', chains: ['deep_scrapes'], severity: 'FAIL', kind: 'raw0', loader: 'inspection', field: 'inspDupes', cfgVar: null, fence: null, whyText: 'Duplicate (permit_num, stage_name) groups — composite-key uniqueness invariant.' },
  { id: 'future_dates', chains: ['deep_scrapes'], severity: 'FAIL', kind: 'raw0', loader: 'inspection', field: 'futureDates', cfgVar: null, fence: null, whyText: 'permit_inspections.inspection_date after CURRENT_DATE.' },
  { id: 'ancient_dates', chains: ['deep_scrapes'], severity: 'WARN', kind: 'raw0', loader: 'inspection', field: 'ancientDates', cfgVar: null, fence: null, whyText: "permit_inspections.inspection_date before 2020-01-01. Displays inspection_ancient_dates_count_warn_max in this check's detail for operator visibility, but the bound itself stays value > 0 (consequence 4 — checkInsp() never compared the pre-conversion '<= 5' label against anything; wiring a real >5 tolerance now would be an undeclared behaviour change). ADB-D7, defect-ledger.md, OPEN · PIN." },
  { id: 'date_before_permit_year', chains: ['deep_scrapes'], severity: 'FAIL', kind: 'raw0', loader: 'inspection', field: 'dateBeforePermit', cfgVar: null, fence: null, whyText: "permit_inspections.inspection_date year precedes the permit_num's 2-digit year prefix." },
];

module.exports = { CHECK_DEFS, LOGIC_VAR_DEFS, COST_MAG_ACCEPT, slugify };
