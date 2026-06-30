#!/usr/bin/env node
/**
 * Assert Global Coverage — Tier 3 CQA check.
 *
 * Runs at the end of both the permits chain (step 27) and the CoA chain
 * (step 12). Queries field-level coverage for every table/column written
 * by every upstream step, emitting a single columnar audit_table.
 *
 * Chain-aware via PIPELINE_CHAIN env var:
 *   - permits (or unset) → full profile across all 26 upstream steps
 *   - coa → CoA-scoped subset (CoA applications + linked data)
 *
 * Non-halting: WARN/FAIL rows in the audit_table do not throw.
 * Infrastructure failures (DB, Zod) re-throw as intended.
 *
 * records_total is ALWAYS 1 — one audit pass, never a DB entity count.
 *
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
 */
'use strict';

const { z } = require('zod');
const pipeline = require('./../lib/pipeline');
const { SKIP_PHASES_SQL } = require('./../lib/lifecycle-phase');
const { loadMarketplaceConfigs, validateLogicVars } = require('./../lib/config-loader');
const { calibratedStatus } = require('./../lib/coverage-status');
const { resolveAndCountTriple } = require('./../lib/vocab-coverage');
const { COST_PROP_COLS } = require('./../lib/parcel-cost-cols');

// Spec 88 §2.10 — the 15 propagated cost/FSI scalars, as a reusable SELECT fragment of
// `COUNT(*) FILTER (WHERE <col> IS NOT NULL) AS <col>_pop` (same on permits + coa_applications).
const COST_PROP_FILTER_SQL = COST_PROP_COLS.map((c) => `COUNT(*) FILTER (WHERE ${c} IS NOT NULL) AS ${c}_pop`).join(',\n          ');

// Advisory lock ID — unique to this assert script (spec 47 §A.5, ID 111).
const ADVISORY_LOCK_ID = 111;

// SKIP_PHASES_SQL imported from scripts/lib/lifecycle-phase.js — single source of truth.

const LOGIC_VARS_SCHEMA = z.object({
  profiling_coverage_pass_pct: z.coerce.number().int().min(0).max(100),
  profiling_coverage_warn_pct: z.coerce.number().int().min(0).max(100),
  // Vocabulary-coverage thresholds (Spec 49 §3 — the value/vocabulary dimension). Required;
  // .passthrough() still lets other logic_vars flow through, but these are explicitly validated.
  vocab_coverage_pass_pct: z.coerce.number().int().min(0).max(100),
  vocab_coverage_warn_pct: z.coerce.number().int().min(0).max(100),
}).passthrough().refine(
  d => d.profiling_coverage_warn_pct < d.profiling_coverage_pass_pct,
  { message: 'profiling_coverage_warn_pct must be strictly less than profiling_coverage_pass_pct' },
).refine(
  d => d.vocab_coverage_warn_pct < d.vocab_coverage_pass_pct,
  { message: 'vocab_coverage_warn_pct must be strictly less than vocab_coverage_pass_pct' },
);

// Vocabulary-coverage matrix (Spec 49 §3/§4 — the value/vocabulary dimension). Each triple measures
// COUNT(DISTINCT dataTable.dataColumn) PRESENT vs COUNT(DISTINCT vocabTable.vocabColumn) DEFINED —
// catching silent under-emission a field-NULL profiler structurally can't see (a never-emitted
// value has no row to be null). camelCase keys are MANDATORY: the infra-test banned-keys lock is a
// whole-file regex on the abandoned columnar key names (the snake_case populated/denominator set).
const VOCAB_COVERAGE = [
  { stepTarget: 'Step 13 — classify_permits', dataTable: 'permit_trades', dataColumn: 'trade_id', dataFilter: null, vocabTable: 'trades', vocabColumn: 'id', vocabFilter: "kind != 'deprecated'" },
  // Spec 80 §5.B — product vocabulary coverage (permit_products is permits-only; product_groups has no deprecation column → no vocabFilter).
  { stepTarget: 'Step 13 — classify_permits (products)', dataTable: 'permit_products', dataColumn: 'product_id', dataFilter: null, vocabTable: 'product_groups', vocabColumn: 'id', vocabFilter: null },
  { stepTarget: 'CoA Step 7 — classify_coa_trades', dataTable: 'lead_trades', dataColumn: 'trade_id', dataFilter: "lead_id LIKE 'coa:%'", vocabTable: 'trades', vocabColumn: 'id', vocabFilter: "kind != 'deprecated'" },
  // Healthy control — proves green == verified (not merely "ran"). -1 is the "unassigned"
  // neighbourhood sentinel (excluded, mirroring the Step-10 field-coverage row).
  { stepTarget: 'Step 10 — link_neighbourhoods', dataTable: 'permits', dataColumn: 'neighbourhood_id', dataFilter: 'neighbourhood_id <> -1', vocabTable: 'neighbourhoods', vocabColumn: 'id', vocabFilter: null },
];

pipeline.run('assert-global-coverage', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const { logicVars } = await loadMarketplaceConfigs(pool, 'assert-global-coverage');
    const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'assert-global-coverage');
    if (!validation.valid) {
      throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
    }

    const passPct = logicVars.profiling_coverage_pass_pct;
    const warnPct = logicVars.profiling_coverage_warn_pct;
    const vocabPassPct = logicVars.vocab_coverage_pass_pct;
    const vocabWarnPct = logicVars.vocab_coverage_warn_pct;

    const isCoaChain = process.env.PIPELINE_CHAIN === 'coa';
    pipeline.log.info(
      '[assert-global-coverage]',
      `Chain mode: ${isCoaChain ? 'coa (scoped subset)' : 'permits (full profile)'}`,
      { pass_pct: passPct, warn_pct: warnPct },
    );

    // ── Row builders ──────────────────────────────────────────────────────────

    // Standard coverage: PASS ≥ passPct%, WARN ≥ warnPct%, FAIL below.
    // Emits { metric, value, threshold, status } — compatible with SDK auto-inject and admin UI renderer.
    function coverageRow(stepTarget, field, populated, denominator) {
      const pct = (denominator != null && denominator > 0)
        ? Math.round((populated / denominator) * 1000) / 10
        : null;
      const status = pct === null ? 'INFO'
        : pct >= passPct ? 'PASS'
        : pct >= warnPct ? 'WARN'
        : 'FAIL';
      return { metric: `${field} (${stepTarget})`, value: pct !== null ? `${pct}%` : populated, threshold: `>= ${passPct}%`, status };
    }

    // External/scraper-sourced fields: PASS ≥ 10%, WARN ≥ 5%, FAIL below.
    // Applied to fields populated by third-party scrapers (phone, email, website, WSIB).
    function externalRow(stepTarget, field, populated, denominator) {
      const pct = (denominator != null && denominator > 0)
        ? Math.round((populated / denominator) * 1000) / 10
        : null;
      const status = pct === null ? 'INFO'
        : pct >= 10 ? 'PASS'
        : pct >= 5  ? 'WARN'
        : 'FAIL';
      return { metric: `${field} (${stepTarget})`, value: pct !== null ? `${pct}%` : populated, threshold: '>= 10%', status };
    }

    // Calibrated coverage: PASS >= passPct%, WARN >= warnPct%, FAIL below — per-field
    // thresholds passed explicitly (like externalRow's 10/5, blessed by Spec 49 §4).
    // Used by the WF3 #406 gated zoning_class row (DEC-1: 80/75). Status delegated to
    // the pure calibratedStatus helper so the PASS/WARN/FAIL boundary is unit-locked.
    // Params named fieldPassPct/fieldWarnPct (not passPct/warnPct) to avoid shadowing
    // the outer logic_variables-loaded globals — a future caller omitting explicit
    // thresholds should fail loudly, not silently inherit the global gate (review fold).
    function calibratedRow(stepTarget, field, populated, denominator, fieldPassPct, fieldWarnPct) {
      const pct = (denominator != null && denominator > 0)
        ? Math.round((populated / denominator) * 1000) / 10
        : null;
      const status = calibratedStatus(pct, fieldPassPct, fieldWarnPct);
      return { metric: `${field} (${stepTarget})`, value: pct !== null ? `${pct}%` : populated, threshold: `>= ${fieldPassPct}%`, status };
    }

    // Informational only — no traffic-light judgment.
    // Used for structural sparsity (est_const_cost) and count-only metrics.
    function infoRow(stepTarget, field, value, denominator = null) {
      return { metric: `${field} (${stepTarget})`, value, threshold: null, status: 'INFO' };
    }

    // Vocabulary coverage (Spec 49 §3 value/vocabulary dimension): distinct values PRESENT vs
    // the defining vocabulary. PASS >= vocabPassPct%, WARN >= vocabWarnPct%, FAIL below. Same
    // { metric, value, threshold, status } rail as the field-coverage rows.
    function vocabRow(stepTarget, dataColumn, present, vocabSize) {
      if (vocabSize == null || vocabSize === 0) {
        return { metric: `${dataColumn} vocab (${stepTarget})`, value: `${present}/0`, threshold: 'N/A', status: 'INFO' };
      }
      const pct = Math.round((present / vocabSize) * 1000) / 10;
      const status = pct >= vocabPassPct ? 'PASS' : pct >= vocabWarnPct ? 'WARN' : 'FAIL';
      return { metric: `${dataColumn} vocab (${stepTarget})`, value: `${present}/${vocabSize} (${pct}%)`, threshold: `>= ${vocabPassPct}%`, status };
    }

    // Resolve + profile one vocab triple via the shared lib (resolveAndCountTriple — also backs the
    // SDK cov_* primitive). Unresolved (bad identifier / missing column / type mismatch / timeout /
    // query error) → a VISIBLE WARN row (never silent INFO-skip — the transparency principle this
    // feature serves); the lib never throws, so one bad triple never breaks the profile.
    async function profileVocabTriple(t) {
      const result = await resolveAndCountTriple(pool, t, { logWarn: pipeline.log.warn });
      if (result.unresolved) {
        return { metric: `${t.dataColumn} vocab (${t.stepTarget})`, value: `unresolved: ${result.unresolved}`, threshold: 'N/A', status: 'WARN' };
      }
      return vocabRow(t.stepTarget, t.dataColumn, result.present, result.vocab_size);
    }

    const rows = [];

    if (isCoaChain) {
      // ═══════════════════════════════════════════════════════════
      // CoA chain — scoped subset
      // ═══════════════════════════════════════════════════════════

      // ── CoA applications aggregate ─────────────────────────────
      // Pass-2 fold (2026-05-19 Spec 79 §6): added 5 new pop counters for the
      // previously-missing Phase D step coverage (parcel_linked_at, scope_tags,
      // scope_classified_at, trade_classified_at, cost_classified_at, estimated_cost).
      const { rows: [ca] } = await pool.query(`
        SELECT
          COUNT(*)                                                                        AS coa_total,
          COUNT(*) FILTER (WHERE linked_permit_num IS NULL)                               AS unlinked_total,
          COUNT(*) FILTER (WHERE decision = 'Approved')                                   AS approved_total,
          COUNT(*) FILTER (WHERE address IS NOT NULL)                                     AS address_pop,
          COUNT(*) FILTER (WHERE ward IS NOT NULL)                                        AS ward_pop,
          COUNT(*) FILTER (WHERE decision IS NOT NULL)                                    AS decision_pop,
          COUNT(*) FILTER (WHERE application_number IS NOT NULL)                          AS app_num_pop,
          COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL)                           AS linked_pop,
          COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL AND linked_confidence IS NOT NULL) AS confidence_pop,
          COUNT(*) FILTER (WHERE decision = 'Approved' AND linked_permit_num IS NULL)     AS approved_unlinked,
          COUNT(*) FILTER (WHERE lifecycle_phase IS NOT NULL AND linked_permit_num IS NULL)  AS lifecycle_phase_pop,
          COUNT(*) FILTER (WHERE lifecycle_stalled = true AND linked_permit_num IS NULL)   AS lifecycle_stalled_true_pop,
          COUNT(*) FILTER (WHERE lifecycle_classified_at IS NOT NULL AND linked_permit_num IS NULL) AS lifecycle_classified_pop,
          COUNT(*) FILTER (WHERE lifecycle_phase IS NULL)                                 AS unclassified_count,
          -- Pass-2 additions for Steps 4-7 coverage rows:
          COUNT(*) FILTER (WHERE parcel_linked_at IS NOT NULL)                            AS parcel_linked_pop,
          -- neighbourhood_id stamped by link_coa_to_parcels (point-in-polygon on the matched
          -- parcel centroid). CoA uses a NULL sentinel for no-match (link-coa-to-parcels R2.v5
          -- fix #5 — NOT a -1 sentinel, unlike the permits chain), so no -1 exclusion is needed.
          COUNT(*) FILTER (WHERE neighbourhood_id IS NOT NULL)                            AS neighbourhood_id_pop,
          COUNT(*) FILTER (WHERE scope_tags IS NOT NULL)                                  AS scope_tags_pop,
          COUNT(*) FILTER (WHERE structure_type IS NOT NULL)                              AS structure_type_pop,
          COUNT(*) FILTER (WHERE scope_classified_at IS NOT NULL)                         AS scope_classified_pop,
          COUNT(*) FILTER (WHERE trade_classified_at IS NOT NULL)                         AS trade_classified_pop,
          COUNT(*) FILTER (WHERE cost_classified_at IS NOT NULL)                          AS cost_classified_pop,
          COUNT(*) FILTER (WHERE estimated_cost IS NOT NULL)                              AS estimated_cost_pop,
          -- WF3 #406 — enrich_coa_zoning (migration 166) zoning feed coverage:
          COUNT(*) FILTER (WHERE zoning_class IS NOT NULL)                                AS zoning_class_pop,
          COUNT(*) FILTER (WHERE zoning_enriched_at IS NOT NULL)                          AS zoning_enriched_pop,
          COUNT(*) FILTER (WHERE bylaw_max_coverage_pct IS NOT NULL)                      AS bylaw_max_coverage_pct_pop,
          COUNT(*) FILTER (WHERE bylaw_max_fsi IS NOT NULL)                               AS bylaw_max_fsi_pop,
          COUNT(*) FILTER (WHERE bylaw_max_height_m IS NOT NULL)                          AS bylaw_max_height_m_pop,
          COUNT(*) FILTER (WHERE exception_number IS NOT NULL)                            AS exception_number_pop,
          COUNT(*) FILTER (WHERE variance_context IS NOT NULL)                            AS variance_context_pop,
          COUNT(*) FILTER (WHERE zoning_parcel_count IS NOT NULL)                         AS zoning_parcel_count_pop,
          COUNT(*) FILTER (WHERE zoning_dominant_parcel_id IS NOT NULL)                   AS zoning_dominant_parcel_id_pop,
          COUNT(*) FILTER (WHERE zoning_dominant_parcel_method IS NOT NULL)               AS zoning_dominant_parcel_method_pop,
          -- WF2 #415 — enrich_coa_zoning ravine propagation (Spec 59 §8e / migration 169):
          -- is_in_ravine is NOT NULL DEFAULT false (vacuously 100% under IS NOT NULL) — count the
          -- TRUE subset, mirroring lifecycle_stalled; ravine_distance is sparse by design (NULL for
          -- orphans, §11.2) — count non-null. Both surfaced as INFO (not gated). [#415 / Integration]
          COUNT(*) FILTER (WHERE is_in_ravine_protection_area)                            AS in_ravine_pop,
          COUNT(*) FILTER (WHERE ravine_distance_m IS NOT NULL)                           AS ravine_distance_pop,
          -- WF3 #428 — enrich_coa_zoning heritage propagation (Spec 61 §8e / migration 172):
          -- is_heritage_designated is NOT NULL DEFAULT false (vacuously 100% under IS NOT NULL) — count
          -- the TRUE subset; type/date are populated only for designated leads — count non-null. INFO,
          -- pure counts, no denominator (designated ⊄ zoning-enriched → would risk >100%). [#428, mirrors #415]
          COUNT(*) FILTER (WHERE is_heritage_designated)                                  AS heritage_designated_pop,
          COUNT(*) FILTER (WHERE heritage_designation_type IS NOT NULL)                   AS heritage_type_pop,
          COUNT(*) FILTER (WHERE heritage_designation_date IS NOT NULL)                   AS heritage_date_pop,
          -- §8e — enrich_coa_zoning centreline propagation (Spec 62 / migration 176):
          COUNT(*) FILTER (WHERE is_corner_lot)                                           AS corner_lot_pop,
          COUNT(*) FILTER (WHERE is_through_lot)                                          AS through_lot_pop,
          COUNT(*) FILTER (WHERE abuts_laneway)                                           AS abuts_laneway_pop,
          COUNT(*) FILTER (WHERE primary_frontage_street_name IS NOT NULL)                AS frontage_name_pop,
          -- Spec 65 — enrich_coa_zoning max-build propagation (migration 186). All INFO, no
          -- denominator (sparse-by-design; FSI ~5%). Per-output populated counts keep the
          -- footprint/GFA gap visible behind the unified max_build_confidence distribution.
          COUNT(*) FILTER (WHERE lot_size_confidence IS NOT NULL)                         AS lot_size_conf_pop,
          COUNT(*) FILTER (WHERE max_buildable_footprint_sqm IS NOT NULL)                 AS max_footprint_pop,
          COUNT(*) FILTER (WHERE max_buildable_gfa_sqm IS NOT NULL)                       AS max_gfa_pop,
          COUNT(*) FILTER (WHERE max_buildable_gfa_basis = 'fsi')                         AS max_gfa_fsi_pop,
          COUNT(*) FILTER (WHERE max_buildable_gfa_basis = 'coverage_box')                AS max_gfa_cov_pop,
          COUNT(*) FILTER (WHERE max_build_confidence = 'high')                           AS mb_conf_high_pop,
          COUNT(*) FILTER (WHERE max_build_confidence = 'medium')                         AS mb_conf_medium_pop,
          COUNT(*) FILTER (WHERE max_build_confidence = 'low')                            AS mb_conf_low_pop,
          COUNT(*) FILTER (WHERE garden_suite_fits)                                       AS suite_fits_pop,
          COUNT(*) FILTER (WHERE envelope_constrained)                                    AS env_constrained_pop,
          -- Spec 65 Phase 1 — enrich_coa_zoning existing-structure propagation (mig 188). All INFO, no denominator.
          COUNT(*) FILTER (WHERE imagery_roof_footprint_sqm IS NOT NULL)                       AS existing_footprint_pop,
          COUNT(*) FILTER (WHERE imagery_roof_gfa_sqm IS NOT NULL)                             AS existing_gfa_pop,
          COUNT(*) FILTER (WHERE existing_structure_confidence = 'high')                   AS existing_conf_high_pop,
          COUNT(*) FILTER (WHERE existing_structure_confidence = 'low')                    AS existing_conf_low_pop,
          COUNT(*) FILTER (WHERE existing_greenspace_sqm IS NOT NULL)                      AS existing_greenspace_pop,
          -- Spec 65 Phase 2 + WF3-A — enrich_coa_zoning scenario/cur-GFA-range propagation (mig 190/193-194). All INFO, no denominator.
          COUNT(*) FILTER (WHERE max_newbuild_coa_gfa_sqm IS NOT NULL)                     AS scen_coa_pop,
          COUNT(*) FILTER (WHERE cur_floor_gfa_sqm IS NOT NULL)                            AS scen_floor_pop,
          COUNT(*) FILTER (WHERE cur_pot_2story_gfa_sqm IS NOT NULL)                       AS scen_pot2_pop,
          COUNT(*) FILTER (WHERE cur_pot_3story_gfa_sqm IS NOT NULL)                       AS scen_pot3_pop,
          COUNT(*) FILTER (WHERE cur_gfa_range_basis IS NOT NULL)                          AS scen_range_pop,
          COUNT(*) FILTER (WHERE cur_est_kitchen_gfa_sqm IS NOT NULL)                      AS scen_kitchen_pop,
          COUNT(*) FILTER (WHERE cur_est_bath_gfa_sqm IS NOT NULL)                         AS scen_bath_pop,
          -- Spec 65 Phase 3 — enrich_coa_zoning accessory-fit propagation (mig 192). All INFO, no denominator.
          COUNT(*) FILTER (WHERE max_garage_gfa_sqm IS NOT NULL)                           AS garage_fits_pop,
          COUNT(*) FILTER (WHERE garage_permission = 'as_of_right')                        AS garage_aor_pop,
          COUNT(*) FILTER (WHERE garage_permission = 'coa_required')                       AS garage_coa_pop,
          -- Spec 78 §4D — enrich_coa_zoning optimal-config + comp propagation (mig 204). INFO, no denominator.
          COUNT(*) FILTER (WHERE opt_config_confidence IS NOT NULL)                         AS opt_config_pop,
          COUNT(*) FILTER (WHERE comp_count IS NOT NULL)                                    AS comp_pop,
          COUNT(*) FILTER (WHERE rear_suite_type IS NOT NULL)                              AS rear_suite_pop,
          COUNT(*) FILTER (WHERE rear_suite_permission = 'as_of_right')                    AS rear_suite_aor_pop,
          COUNT(*) FILTER (WHERE rear_suite_permission = 'coa_required')                   AS rear_suite_coa_pop,
          -- Spec 88 §2.10 — enrich_coa_zoning parcel-cost propagation (mig 207). INFO, no denominator.
          ${COST_PROP_FILTER_SQL},
          EXTRACT(days FROM NOW() - MAX(last_seen_at))::int                               AS days_since_latest
        FROM coa_applications
      `);

      // ── Cross-table CoA aggregate (Pass-2 fold) ────────────────
      // Counts CoA-side rows on tables written by Phase D / Phase E.3 steps.
      const { rows: [cx] } = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM lead_trades   WHERE lead_id LIKE 'coa:%')                  AS lead_trades_coa_rows,
          (SELECT COUNT(*) FROM lead_products WHERE lead_id LIKE 'coa:%')                  AS lead_products_coa_rows,
          (SELECT COUNT(*) FROM lead_parcels  WHERE lead_id LIKE 'coa:%')                  AS lead_parcels_coa_rows,
          (SELECT COUNT(*) FROM cost_estimates WHERE lead_id LIKE 'coa:%')                 AS cost_estimates_coa_rows,
          -- mig 147 DROP NOT NULL on permit_type: CoA cohorts have permit_type IS NULL
          (SELECT COUNT(*) FROM phase_stay_calibration WHERE permit_type IS NULL)          AS calibration_coa_rows
      `);
      const coaTotal = parseInt(ca.coa_total, 10) || 0;
      const linkedTotal = parseInt(ca.linked_pop, 10) || 0;
      const lifecyclePhaseTotal = parseInt(ca.lifecycle_phase_pop, 10) || 0;
      // Bug 3: classifier assigns P1/P2 only to unlinked CoA apps — use unlinked count as denom.
      const unlinkedTotal = parseInt(ca.unlinked_total, 10) || 0;
      // F2: use approved_unlinked (actionable denominator) — mirrors permits chain Step 17.
      const approvedUnlinked = parseInt(ca.approved_unlinked, 10) || 0;
      // WF3 #406 — enrichment radius: count of CoAs the enrich_coa_zoning step actually
      // wrote a zone for. Used as the INFO denominator context for the sub-fields so a
      // sparse bylaw value reads as "of enriched CoAs", not "of all CoAs" (Gemini LOW).
      const coaZoningEnrichedTotal = parseInt(ca.zoning_enriched_pop, 10) || 0;

      // ── Misc CoA metrics ───────────────────────────────────────
      const { rows: [cm] } = await pool.query(`
        SELECT
          COUNT(DISTINCT permit_num) FILTER (WHERE permit_num LIKE 'PRE-%')                AS pre_permit_total,
          COUNT(*) FILTER (WHERE permit_num LIKE 'PRE-%' AND issued_date < NOW() - INTERVAL '18 months') AS aged_pre_permits,
          (SELECT COUNT(*) FROM data_quality_snapshots WHERE snapshot_date = CURRENT_DATE) AS snapshot_today,
          (SELECT COUNT(*) FROM engine_health_snapshots WHERE captured_at > NOW() - INTERVAL '25 hours') AS engine_health_today,
          (SELECT COUNT(*) FROM (
            SELECT application_number, COUNT(*) FROM coa_applications GROUP BY 1 HAVING COUNT(*) > 1
          ) sub)                                                                             AS dup_coa_pks
        FROM permits
      `);
      const preTotal = parseInt(cm.pre_permit_total, 10) || 0;

      // Step: assert_schema (CoA)
      const { rows: [csSchema] } = await pool.query(`
        SELECT COUNT(*) AS cols FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'coa_applications'
      `);
      rows.push(infoRow('CoA Step 1 — assert_schema', 'coa_applications.columns_present', parseInt(csSchema.cols, 10)));

      // Step 2 — load_coa
      rows.push(coverageRow('CoA Step 2 — load_coa', 'coa_applications.address',            parseInt(ca.address_pop, 10),  coaTotal));
      rows.push(coverageRow('CoA Step 2 — load_coa', 'coa_applications.ward',               parseInt(ca.ward_pop, 10),     coaTotal));
      rows.push(coverageRow('CoA Step 2 — load_coa', 'coa_applications.decision',           parseInt(ca.decision_pop, 10), coaTotal));
      rows.push(coverageRow('CoA Step 2 — load_coa', 'coa_applications.application_number', parseInt(ca.app_num_pop, 10),  coaTotal));

      // Step 3 — assert_coa_freshness
      const daysSince = ca.days_since_latest != null ? parseInt(ca.days_since_latest, 10) : null;
      rows.push(infoRow('CoA Step 3 — assert_coa_freshness', 'coa_applications.days_since_latest', daysSince ?? 0));

      // Step 4 — link_coa_to_parcels (Pass-2 fold: was missing)
      rows.push(coverageRow('CoA Step 4 — link_coa_to_parcels', 'coa_applications.parcel_linked_at', parseInt(ca.parcel_linked_pop, 10), coaTotal));
      rows.push(infoRow('CoA Step 4 — link_coa_to_parcels', 'lead_parcels.coa_rows', parseInt(cx.lead_parcels_coa_rows, 10)));
      // neighbourhood_id is parcel-DERIVED: only the parcel-MATCHED subset can ever receive it,
      // so the denominator is the lead_parcels-matched count (cx.lead_parcels_coa_rows), NOT
      // coaTotal and NOT parcel_linked_pop (parcel_linked_at is a 100% processing watermark
      // stamped on matched AND unmatched CoAs alike — using it would manufacture a false-FAIL).
      // Spec 49 §4: "denominator of CoAs with lead_parcels row — target ≥ 95%".
      rows.push(calibratedRow('CoA Step 4 — link_coa_to_parcels', 'coa_applications.neighbourhood_id', parseInt(ca.neighbourhood_id_pop, 10), parseInt(cx.lead_parcels_coa_rows, 10) || null, 95, 90));

      // Step 4b — enrich_coa_zoning (WF3 #406, Spec 66 WF3 / migration 166).
      // Insert-after label (DEC-2; #405 full renumber deferred). zoning_class is the
      // gated headline (DEC-1: PASS >= 80 / WARN >= 75, restores the regression net
      // F-H12 would otherwise be the only source of). Sub-fields are INFO — sparse
      // cost inputs / co-written provenance, excluded from the verdict cascade
      // (Spec 48 §3.6). Sub-field denominator context = coaZoningEnrichedTotal.
      rows.push(calibratedRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.zoning_class', parseInt(ca.zoning_class_pop, 10), coaTotal, 80, 75));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.zoning_enriched_at',            parseInt(ca.zoning_enriched_pop, 10),            coaZoningEnrichedTotal));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.bylaw_max_coverage_pct',        parseInt(ca.bylaw_max_coverage_pct_pop, 10),     coaZoningEnrichedTotal));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.bylaw_max_fsi',                 parseInt(ca.bylaw_max_fsi_pop, 10),              coaZoningEnrichedTotal));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.bylaw_max_height_m',            parseInt(ca.bylaw_max_height_m_pop, 10),         coaZoningEnrichedTotal));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.exception_number',              parseInt(ca.exception_number_pop, 10),           coaZoningEnrichedTotal));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.variance_context',              parseInt(ca.variance_context_pop, 10),           coaZoningEnrichedTotal));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.zoning_parcel_count',           parseInt(ca.zoning_parcel_count_pop, 10),        coaZoningEnrichedTotal));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.zoning_dominant_parcel_id',     parseInt(ca.zoning_dominant_parcel_id_pop, 10),  coaZoningEnrichedTotal));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.zoning_dominant_parcel_method', parseInt(ca.zoning_dominant_parcel_method_pop, 10), coaZoningEnrichedTotal));
      // WF2 #415 — ravine propagation (Spec 59 §8e). INFO: is_in_ravine is a count of the TRUE
      // subset (the NOT-NULL-DEFAULT-false boolean is vacuously 100% under coverage — count TRUE,
      // never IS NOT NULL); ravine_distance is non-null only for parcel-linked CoAs. Neither is a
      // coverage % — a small geographic subset has no stable population floor to gate against (DEC-B).
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.is_in_ravine_protection_area', parseInt(ca.in_ravine_pop, 10)));
      // Pure count, no denominator — see permits Step 9b ravine_distance note (#415).
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.ravine_distance_m',             parseInt(ca.ravine_distance_pop, 10)));
      // WF3 #428 — heritage propagation (Spec 61 §8e). is_heritage_designated = count of the TRUE subset
      // (FILTER, never IS NOT NULL — vacuous on the NOT-NULL-DEFAULT-false boolean); type/date pure counts,
      // no denominator (designated ⊄ zoning-enriched). All INFO — small geographic subset, never gated.
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.is_heritage_designated',   parseInt(ca.heritage_designated_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.heritage_designation_type', parseInt(ca.heritage_type_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.heritage_designation_date', parseInt(ca.heritage_date_pop, 10)));
      // §8e — centreline propagation (Spec 62 §8e). is_corner_lot/is_through_lot = TRUE-subset counts
      // (FILTER, never IS NOT NULL — vacuous on the NOT-NULL-DEFAULT-false booleans); frontage name =
      // non-null count. All INFO (small geographic subset, never gated) — mirrors ravine/heritage.
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.is_corner_lot',                parseInt(ca.corner_lot_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.is_through_lot',               parseInt(ca.through_lot_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.abuts_laneway',               parseInt(ca.abuts_laneway_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.primary_frontage_street_name', parseInt(ca.frontage_name_pop, 10)));
      // Spec 65 max-build propagation — INFO, no denominator (sparse-by-design; FSI ~5% → never gated).
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.lot_size_confidence',         parseInt(ca.lot_size_conf_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.max_buildable_footprint_sqm', parseInt(ca.max_footprint_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.max_buildable_gfa_sqm',       parseInt(ca.max_gfa_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.max_buildable_gfa_basis_fsi', parseInt(ca.max_gfa_fsi_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.max_buildable_gfa_basis_coverage_box', parseInt(ca.max_gfa_cov_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.max_build_confidence_high',   parseInt(ca.mb_conf_high_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.max_build_confidence_medium', parseInt(ca.mb_conf_medium_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.max_build_confidence_low',    parseInt(ca.mb_conf_low_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.garden_suite_fits',           parseInt(ca.suite_fits_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.envelope_constrained',        parseInt(ca.env_constrained_pop, 10)));
      // Spec 65 Phase 1 existing-structure — INFO, no denominator.
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.imagery_roof_footprint_sqm',      parseInt(ca.existing_footprint_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.imagery_roof_gfa_sqm',            parseInt(ca.existing_gfa_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.existing_structure_confidence_high', parseInt(ca.existing_conf_high_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.existing_structure_confidence_low',  parseInt(ca.existing_conf_low_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.existing_greenspace_sqm',     parseInt(ca.existing_greenspace_pop, 10)));
      // Spec 65 Phase 2 scenario GFAs — INFO, no denominator.
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.max_newbuild_coa_gfa_sqm',  parseInt(ca.scen_coa_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.cur_floor_gfa_sqm',         parseInt(ca.scen_floor_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.cur_pot_2story_gfa_sqm',    parseInt(ca.scen_pot2_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.cur_pot_3story_gfa_sqm',    parseInt(ca.scen_pot3_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.cur_gfa_range_basis',       parseInt(ca.scen_range_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.cur_est_kitchen_gfa_sqm',   parseInt(ca.scen_kitchen_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.cur_est_bath_gfa_sqm',      parseInt(ca.scen_bath_pop, 10)));
      // Spec 65 Phase 3 accessory fit — INFO, no denominator.
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.max_garage_gfa_sqm',        parseInt(ca.garage_fits_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.garage_permission_as_of_right',  parseInt(ca.garage_aor_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.garage_permission_coa_required', parseInt(ca.garage_coa_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.rear_suite_type',           parseInt(ca.rear_suite_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.rear_suite_permission_as_of_right',  parseInt(ca.rear_suite_aor_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.rear_suite_permission_coa_required', parseInt(ca.rear_suite_coa_pop, 10)));
      // Spec 78 §4D optimal-config + comp propagation — INFO.
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.opt_config_confidence', parseInt(ca.opt_config_pop, 10)));
      rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', 'coa_applications.comp_count', parseInt(ca.comp_pop, 10)));
      // Spec 88 §2.10 parcel-cost propagation — INFO, sparse where the CoA is parcel-unlinked.
      for (const c of COST_PROP_COLS) {
        rows.push(infoRow('CoA Step 4b — enrich_coa_zoning', `coa_applications.${c}`, parseInt(ca[`${c}_pop`], 10)));
      }

      // Step 5 — classify_coa_scope (Pass-2 fold: was missing)
      rows.push(coverageRow('CoA Step 5 — classify_coa_scope', 'coa_applications.scope_tags', parseInt(ca.scope_tags_pop, 10), coaTotal));
      rows.push(coverageRow('CoA Step 5 — classify_coa_scope', 'coa_applications.scope_classified_at', parseInt(ca.scope_classified_pop, 10), coaTotal));
      // structure_type is DESCRIPTION-derived (Spec 83 §3.A archetype via classify_coa_scope, NOT
      // parcel_buildings — see Spec 42 §6.6.D correction). Denominator = coaTotal (every CoA with a
      // description is eligible). Calibrated 45/35: the description-only ceiling is ~52% (measured),
      // so the Spec-42 ≥80% target was recalibrated — gating at 80 would be a permanent false-FAIL.
      rows.push(calibratedRow('CoA Step 5 — classify_coa_scope', 'coa_applications.structure_type', parseInt(ca.structure_type_pop, 10), coaTotal, 45, 35));
      // structure_type VOCAB coverage (Spec 49 §3 value dimension) — catches silent under-emission /
      // classifier collapse a field-NULL row can't see. Called INLINE here (NOT the static
      // VOCAB_COVERAGE array, which runs in BOTH chains) so it stays CoA-scoped. vocabFilter excludes
      // only the 2 fallback sentinels ('Other'/'Unknown' — never classify-TO targets, classifier
      // emits null on no-match); the 2 real gaps (Multiple Use/Non Residential, Restaurant Greater
      // Than 30 Seats) STAY in the denominator → 21/23 ≈ 91% PASS. A collapse drops it hard.
      rows.push(await profileVocabTriple({
        stepTarget: 'CoA Step 5 — classify_coa_scope',
        dataTable: 'coa_applications', dataColumn: 'structure_type', dataFilter: "lead_id LIKE 'coa:%'",
        vocabTable: 'scope_intensity_matrix', vocabColumn: 'structure_type', vocabFilter: "structure_type NOT IN ('Other','Unknown')",
      }));

      // Step 6 — classify_coa_trades (Pass-2 fold: was missing)
      rows.push(coverageRow('CoA Step 6 — classify_coa_trades', 'coa_applications.trade_classified_at', parseInt(ca.trade_classified_pop, 10), coaTotal));
      rows.push(infoRow('CoA Step 6 — classify_coa_trades', 'lead_trades.coa_rows', parseInt(cx.lead_trades_coa_rows, 10)));
      rows.push(infoRow('CoA Step 6 — classify_coa_trades', 'lead_products.coa_rows', parseInt(cx.lead_products_coa_rows, 10)));

      // Step 7 — compute_coa_cost_estimates (Pass-2 fold: was missing)
      rows.push(coverageRow('CoA Step 7 — compute_coa_cost_estimates', 'coa_applications.cost_classified_at', parseInt(ca.cost_classified_pop, 10), coaTotal));
      rows.push(coverageRow('CoA Step 7 — compute_coa_cost_estimates', 'coa_applications.estimated_cost', parseInt(ca.estimated_cost_pop, 10), coaTotal));
      rows.push(infoRow('CoA Step 7 — compute_coa_cost_estimates', 'cost_estimates.coa_rows', parseInt(cx.cost_estimates_coa_rows, 10)));

      // Step 8 — link_coa (Pass-2 fold: was labelled "Step 4")
      rows.push(coverageRow('CoA Step 8 — link_coa', 'coa_applications.linked_permit_num', linkedTotal, coaTotal));
      rows.push(coverageRow('CoA Step 8 — link_coa', 'coa_applications.linked_confidence', parseInt(ca.confidence_pop, 10), linkedTotal || null));

      // Phase G (Spec 42 §6.11): create_pre_permits and assert_pre_permit_aging
      // were retired to shims and removed from the CoA chain. Replaced at the
      // assertion layer by the `permits_pre_permit_count == 0` gate in
      // assert-data-bounds.js (both audits). Pre-Pass-2 these were labelled
      // "CoA Step 5" / "CoA Step 6" — those slots are now reused for
      // Phase D (classify_coa_scope) / (classify_coa_trades) per manifest order.

      // Step 9 — refresh_snapshot (Pass-2 fold: was labelled "Step 7")
      rows.push(infoRow('CoA Step 9 — refresh_snapshot', 'data_quality_snapshots.today', parseInt(cm.snapshot_today, 10)));

      // Step 10 — assert_data_bounds (Pass-2 fold: was labelled "Step 8")
      rows.push(infoRow('CoA Step 10 — assert_data_bounds', 'coa_applications.duplicate_pks', parseInt(cm.dup_coa_pks, 10)));

      // Step 11 — assert_engine_health (Pass-2 fold: was labelled "Step 9")
      rows.push(infoRow('CoA Step 11 — assert_engine_health', 'engine_health_snapshots.today', parseInt(cm.engine_health_today, 10)));

      // Step 12 — classify_lifecycle_phase (Pass-2 fold: was labelled "Step 10")
      // Bug 3: lifecycle_phase denominator = unlinked CoA apps only (classifier skips linked ones).
      rows.push(coverageRow('CoA Step 12 — classify_lifecycle_phase', 'coa_applications.lifecycle_phase',         lifecyclePhaseTotal,                          unlinkedTotal || null));
      // lifecycle_stalled BOOLEAN NOT NULL DEFAULT false — IS NOT NULL is always vacuous (100%).
      // Show count of actually-stalled classified unlinked apps as an info metric.
      rows.push(infoRow('CoA Step 12 — classify_lifecycle_phase', 'coa_applications.lifecycle_stalled', parseInt(ca.lifecycle_stalled_true_pop, 10), lifecyclePhaseTotal));
      // Bug 3: lifecycle_classified_at denominator = unlinked CoA apps only.
      rows.push(coverageRow('CoA Step 12 — classify_lifecycle_phase', 'coa_applications.lifecycle_classified_at', parseInt(ca.lifecycle_classified_pop, 10),     unlinkedTotal || null));

      // Step 13 — assert_lifecycle_phase_distribution (Pass-2 fold: was labelled "Step 11")
      rows.push(infoRow('CoA Step 13 — assert_lifecycle_phase_distribution', 'coa_applications.unclassified_count', parseInt(ca.unclassified_count, 10), coaTotal));

      // Step 14 — compute_phase_calibration (Pass-2 fold: was missing)
      // mig 147 DROPped permit_type NOT NULL so CoA-side cohorts have permit_type IS NULL.
      rows.push(infoRow('CoA Step 14 — compute_phase_calibration', 'phase_stay_calibration.coa_rows', parseInt(cx.calibration_coa_rows, 10)));

    } else {
      // ═══════════════════════════════════════════════════════════
      // Permits chain — full profile
      // ═══════════════════════════════════════════════════════════

      // ── pa: Permits aggregate (Denom A — all permits including PRE-%) ──────
      // PRE-% permits total 147 of 244K+ — negligible impact on coverage pct.
      const { rows: [pa] } = await pool.query(`
        SELECT
          COUNT(*) AS permits_total,
          -- Step 2 — load_permits base fields
          COUNT(*) FILTER (WHERE permit_type IS NOT NULL)                      AS permit_type_pop,
          COUNT(*) FILTER (WHERE structure_type IS NOT NULL)                   AS structure_type_pop,
          COUNT(*) FILTER (WHERE work IS NOT NULL)                             AS work_pop,
          COUNT(*) FILTER (WHERE street_num IS NOT NULL)                       AS street_num_pop,
          COUNT(*) FILTER (WHERE street_name IS NOT NULL)                      AS street_name_pop,
          COUNT(*) FILTER (WHERE street_name_normalized IS NOT NULL)           AS street_name_norm_pop,
          COUNT(*) FILTER (WHERE street_type IS NOT NULL)                      AS street_type_pop,
          COUNT(*) FILTER (WHERE street_direction IS NOT NULL)                 AS street_direction_pop,
          COUNT(*) FILTER (WHERE city IS NOT NULL)                             AS city_pop,
          COUNT(*) FILTER (WHERE postal IS NOT NULL)                           AS postal_pop,
          COUNT(*) FILTER (WHERE geo_id IS NOT NULL)                           AS geo_id_pop,
          COUNT(*) FILTER (WHERE building_type IS NOT NULL)                    AS building_type_pop,
          COUNT(*) FILTER (WHERE category IS NOT NULL)                         AS category_pop,
          COUNT(*) FILTER (WHERE application_date IS NOT NULL)                 AS application_date_pop,
          COUNT(*) FILTER (WHERE issued_date IS NOT NULL)                      AS issued_date_pop,
          COUNT(*) FILTER (WHERE completed_date IS NOT NULL)                   AS completed_date_pop,
          COUNT(*) FILTER (WHERE status IS NOT NULL)                           AS status_pop,
          COUNT(*) FILTER (WHERE description IS NOT NULL)                      AS description_pop,
          COUNT(*) FILTER (WHERE est_const_cost IS NOT NULL)                   AS est_const_cost_pop,
          COUNT(*) FILTER (WHERE builder_name IS NOT NULL)                     AS builder_name_pop,
          COUNT(*) FILTER (WHERE owner IS NOT NULL)                            AS owner_pop,
          COUNT(*) FILTER (WHERE dwelling_units_created IS NOT NULL)           AS dwell_created_pop,
          COUNT(*) FILTER (WHERE dwelling_units_lost IS NOT NULL)              AS dwell_lost_pop,
          COUNT(*) FILTER (WHERE ward IS NOT NULL)                             AS ward_pop,
          COUNT(*) FILTER (WHERE council_district IS NOT NULL)                 AS council_district_pop,
          COUNT(*) FILTER (WHERE current_use IS NOT NULL)                      AS current_use_pop,
          COUNT(*) FILTER (WHERE proposed_use IS NOT NULL)                     AS proposed_use_pop,
          COUNT(*) FILTER (WHERE housing_units IS NOT NULL)                    AS housing_units_pop,
          COUNT(*) FILTER (WHERE storeys IS NOT NULL)                          AS storeys_pop,
          COUNT(*) FILTER (WHERE data_hash IS NOT NULL)                        AS data_hash_pop,
          COUNT(*) FILTER (WHERE raw_json IS NOT NULL)                         AS raw_json_pop,
          COUNT(*) FILTER (WHERE last_seen_at IS NOT NULL)                     AS last_seen_at_pop,
          -- Step 4 — classify_permit_phase
          COUNT(*) FILTER (WHERE enriched_status IS NOT NULL)                  AS enriched_status_pop,
          -- Step 5 — classify_scope
          COUNT(*) FILTER (WHERE project_type IS NOT NULL)                     AS project_type_pop,
          COUNT(*) FILTER (WHERE array_length(scope_tags, 1) IS NOT NULL)      AS scope_tags_pop,
          COUNT(*) FILTER (WHERE scope_classified_at IS NOT NULL)              AS scope_classified_pop,
          COUNT(*) FILTER (WHERE scope_source IS NOT NULL)                     AS scope_source_pop,
          -- Step 8 — geocode_permits (Denom A: measured against all permits)
          COUNT(*) FILTER (WHERE latitude IS NOT NULL)                         AS latitude_pop,
          COUNT(*) FILTER (WHERE longitude IS NOT NULL)                        AS longitude_pop,
          COUNT(*) FILTER (WHERE location IS NOT NULL)                         AS location_pop,
          COUNT(*) FILTER (WHERE geocoded_at IS NOT NULL)                      AS geocoded_at_pop,
          -- Step 10 — link_neighbourhoods
          COUNT(*) FILTER (WHERE neighbourhood_id IS NOT NULL
                             AND neighbourhood_id != -1)                       AS neighbourhood_pop,
          -- Step 12 — link_similar (proxy: non-BLD scope propagation)
          -- NULL permit_type rows excluded by != semantics — intentional.
          COUNT(*) FILTER (WHERE permit_type != 'BLD')                         AS non_bld_total,
          COUNT(*) FILTER (WHERE permit_type != 'BLD'
                             AND array_length(scope_tags, 1) IS NOT NULL)      AS non_bld_scope_pop,
          -- Step 21 — classify_lifecycle_phase
          COUNT(*) FILTER (WHERE lifecycle_phase IS NOT NULL)                  AS lifecycle_phase_pop,
          COUNT(*) FILTER (WHERE lifecycle_phase IS NOT NULL
                             AND phase_started_at IS NOT NULL)                 AS phase_started_pop,
          COUNT(*) FILTER (WHERE lifecycle_stalled = true)                     AS lifecycle_stalled_pop,
          COUNT(*) FILTER (WHERE lifecycle_classified_at IS NOT NULL)          AS lifecycle_classified_pop,
          -- Step 22 — assert_lifecycle_phase_distribution
          COUNT(*) FILTER (WHERE lifecycle_phase IS NULL)                      AS unclassified_count,
          -- Step 3 — close_stale_permits
          COUNT(*) FILTER (WHERE status IN ('Pending Closed','Closed'))        AS stale_total,
          COUNT(*) FILTER (WHERE status IN ('Pending Closed','Closed')
                             AND completed_date IS NOT NULL)                   AS stale_with_date,
          -- Step 17 — create_pre_permits (Bug 4: DISTINCT avoids overcounting when revisions exist)
          COUNT(DISTINCT permit_num) FILTER (WHERE permit_num LIKE 'PRE-%')    AS pre_permit_count,
          -- WF3 #406 — enrich_permits (migration 166) zoning feed coverage:
          COUNT(*) FILTER (WHERE zoning_class IS NOT NULL)                     AS zoning_class_pop,
          COUNT(*) FILTER (WHERE zoning_enriched_at IS NOT NULL)               AS zoning_enriched_pop,
          COUNT(*) FILTER (WHERE bylaw_max_coverage_pct IS NOT NULL)           AS bylaw_max_coverage_pct_pop,
          COUNT(*) FILTER (WHERE bylaw_max_fsi IS NOT NULL)                    AS bylaw_max_fsi_pop,
          COUNT(*) FILTER (WHERE bylaw_max_height_m IS NOT NULL)               AS bylaw_max_height_m_pop,
          COUNT(*) FILTER (WHERE exception_number IS NOT NULL)                 AS exception_number_pop,
          COUNT(*) FILTER (WHERE applicable_bylaws IS NOT NULL)                AS applicable_bylaws_pop,
          COUNT(*) FILTER (WHERE overlay_summary IS NOT NULL)                  AS overlay_summary_pop,
          COUNT(*) FILTER (WHERE zoning_parcel_count IS NOT NULL)              AS zoning_parcel_count_pop,
          COUNT(*) FILTER (WHERE zoning_dominant_parcel_id IS NOT NULL)        AS zoning_dominant_parcel_id_pop,
          COUNT(*) FILTER (WHERE zoning_dominant_parcel_method IS NOT NULL)    AS zoning_dominant_parcel_method_pop,
          -- WF2 #415 — enrich_permits ravine propagation (Spec 59 §8e / migration 169):
          -- is_in_ravine is NOT NULL DEFAULT false (vacuously 100% under IS NOT NULL) — count the
          -- TRUE subset, mirroring lifecycle_stalled; ravine_distance is sparse by design (NULL for
          -- orphan permits, §11.2) — count non-null. Both surfaced as INFO (not gated). [#415 / Integration]
          COUNT(*) FILTER (WHERE is_in_ravine_protection_area)                AS in_ravine_pop,
          COUNT(*) FILTER (WHERE ravine_distance_m IS NOT NULL)               AS ravine_distance_pop,
          -- WF3 #428 — enrich_permits heritage propagation (Spec 61 §8e / migration 172). Same shape
          -- as ravine above: count the TRUE boolean subset + non-null type/date. INFO, no denominator.
          COUNT(*) FILTER (WHERE is_heritage_designated)                      AS heritage_designated_pop,
          COUNT(*) FILTER (WHERE heritage_designation_type IS NOT NULL)       AS heritage_type_pop,
          COUNT(*) FILTER (WHERE heritage_designation_date IS NOT NULL)       AS heritage_date_pop,
          -- §8e — enrich_permits centreline propagation (Spec 62 / migration 176):
          COUNT(*) FILTER (WHERE is_corner_lot)                               AS corner_lot_pop,
          COUNT(*) FILTER (WHERE is_through_lot)                              AS through_lot_pop,
          COUNT(*) FILTER (WHERE abuts_laneway)                               AS abuts_laneway_pop,
          COUNT(*) FILTER (WHERE primary_frontage_street_name IS NOT NULL)    AS frontage_name_pop,
          -- Spec 65 — enrich_permits max-build propagation (migration 186). INFO, no denominator.
          COUNT(*) FILTER (WHERE lot_size_confidence IS NOT NULL)             AS lot_size_conf_pop,
          COUNT(*) FILTER (WHERE max_buildable_footprint_sqm IS NOT NULL)     AS max_footprint_pop,
          COUNT(*) FILTER (WHERE max_buildable_gfa_sqm IS NOT NULL)           AS max_gfa_pop,
          COUNT(*) FILTER (WHERE max_buildable_gfa_basis = 'fsi')             AS max_gfa_fsi_pop,
          COUNT(*) FILTER (WHERE max_buildable_gfa_basis = 'coverage_box')    AS max_gfa_cov_pop,
          COUNT(*) FILTER (WHERE max_build_confidence = 'high')               AS mb_conf_high_pop,
          COUNT(*) FILTER (WHERE max_build_confidence = 'medium')             AS mb_conf_medium_pop,
          COUNT(*) FILTER (WHERE max_build_confidence = 'low')                AS mb_conf_low_pop,
          COUNT(*) FILTER (WHERE garden_suite_fits)                           AS suite_fits_pop,
          COUNT(*) FILTER (WHERE envelope_constrained)                        AS env_constrained_pop,
          -- Spec 65 Phase 1 — enrich_permits existing-structure propagation (mig 188). INFO, no denominator.
          COUNT(*) FILTER (WHERE imagery_roof_footprint_sqm IS NOT NULL)          AS existing_footprint_pop,
          COUNT(*) FILTER (WHERE imagery_roof_gfa_sqm IS NOT NULL)                AS existing_gfa_pop,
          COUNT(*) FILTER (WHERE existing_structure_confidence = 'high')      AS existing_conf_high_pop,
          COUNT(*) FILTER (WHERE existing_structure_confidence = 'low')       AS existing_conf_low_pop,
          COUNT(*) FILTER (WHERE existing_greenspace_sqm IS NOT NULL)         AS existing_greenspace_pop,
          -- Spec 65 Phase 2 + WF3-A — enrich_permits scenario/cur-GFA-range propagation (mig 190/193-194). INFO, no denominator.
          COUNT(*) FILTER (WHERE max_newbuild_coa_gfa_sqm IS NOT NULL)        AS scen_coa_pop,
          COUNT(*) FILTER (WHERE cur_floor_gfa_sqm IS NOT NULL)               AS scen_floor_pop,
          COUNT(*) FILTER (WHERE cur_pot_2story_gfa_sqm IS NOT NULL)          AS scen_pot2_pop,
          COUNT(*) FILTER (WHERE cur_pot_3story_gfa_sqm IS NOT NULL)          AS scen_pot3_pop,
          COUNT(*) FILTER (WHERE cur_gfa_range_basis IS NOT NULL)             AS scen_range_pop,
          COUNT(*) FILTER (WHERE cur_est_kitchen_gfa_sqm IS NOT NULL)         AS scen_kitchen_pop,
          COUNT(*) FILTER (WHERE cur_est_bath_gfa_sqm IS NOT NULL)            AS scen_bath_pop,
          -- Spec 65 Phase 3 — enrich_permits accessory-fit propagation (mig 192). INFO, no denominator.
          COUNT(*) FILTER (WHERE max_garage_gfa_sqm IS NOT NULL)              AS garage_fits_pop,
          COUNT(*) FILTER (WHERE garage_permission = 'as_of_right')           AS garage_aor_pop,
          COUNT(*) FILTER (WHERE garage_permission = 'coa_required')          AS garage_coa_pop,
          -- Spec 78 §4D — enrich_permits optimal-config + comp propagation (mig 204). INFO, no denominator.
          COUNT(*) FILTER (WHERE opt_config_confidence IS NOT NULL)           AS opt_config_pop,
          COUNT(*) FILTER (WHERE comp_count IS NOT NULL)                      AS comp_pop,
          COUNT(*) FILTER (WHERE rear_suite_type IS NOT NULL)                 AS rear_suite_pop,
          COUNT(*) FILTER (WHERE rear_suite_permission = 'as_of_right')       AS rear_suite_aor_pop,
          COUNT(*) FILTER (WHERE rear_suite_permission = 'coa_required')      AS rear_suite_coa_pop,
          -- Spec 88 §2.10 — enrich_permits parcel-cost propagation (mig 207). INFO, no denominator.
          ${COST_PROP_FILTER_SQL}
        FROM permits
      `);
      const permitsTotal        = parseInt(pa.permits_total, 10) || 0;
      const geocodedTotal       = parseInt(pa.latitude_pop, 10)  || 0; // permits WHERE latitude IS NOT NULL
      const lifecyclePhaseTotal = parseInt(pa.lifecycle_phase_pop, 10) || 0;
      const staleTotal          = parseInt(pa.stale_total, 10) || 0;
      // WF3 #406 — enrichment radius (count of permits enrich_permits wrote a zone for);
      // INFO denominator context for the zoning sub-fields (Gemini LOW).
      const zoningEnrichedTotal = parseInt(pa.zoning_enriched_pop, 10) || 0;

      // ── ea: Entities aggregate (Denom B) ──────────────────────
      const { rows: [ea] } = await pool.query(`
        SELECT
          COUNT(*)                                                    AS entities_total,
          COUNT(*) FILTER (WHERE legal_name IS NOT NULL)              AS legal_name_pop,
          COUNT(*) FILTER (WHERE name_normalized IS NOT NULL)         AS name_normalized_pop,
          COUNT(*) FILTER (WHERE permit_count IS NOT NULL)            AS permit_count_pop,
          COUNT(*) FILTER (WHERE entity_type IS NOT NULL)             AS entity_type_pop,
          COUNT(*) FILTER (WHERE last_seen_at IS NOT NULL)            AS last_seen_at_pop,
          COUNT(*) FILTER (WHERE is_wsib_registered = true)           AS wsib_registered_pop,
          COUNT(*) FILTER (WHERE primary_phone IS NOT NULL)           AS phone_pop,
          COUNT(*) FILTER (WHERE primary_email IS NOT NULL)           AS email_pop,
          COUNT(*) FILTER (WHERE website IS NOT NULL)                 AS website_pop
        FROM entities
      `);
      const entitiesTotal = parseInt(ea.entities_total, 10) || 0;

      // ── bnd: Builder-to-entity match (JOIN-based, excludes PRE-%) ──────────
      // Numerator: distinct builder_names from permits that have a matching entity row.
      // Denominator: distinct non-null builder_names across non-synthetic permits.
      const { rows: [bnd] } = await pool.query(`
        SELECT
          COUNT(DISTINCT p.builder_name)    AS builder_name_total,
          COUNT(DISTINCT e.name_normalized) AS matched_builder_names
        FROM permits p
        LEFT JOIN entities e ON e.name_normalized = p.builder_name
        WHERE p.builder_name IS NOT NULL AND p.permit_num NOT LIKE 'PRE-%'
      `);
      const builderNameTotal     = parseInt(bnd.builder_name_total, 10) || 0;
      const matchedBuilderNames  = parseInt(bnd.matched_builder_names, 10) || 0;

      // ── wa: WSIB registry aggregate ───────────────────────────
      const { rows: [wa] } = await pool.query(`
        SELECT
          COUNT(*)                                                     AS wsib_total,
          COUNT(*) FILTER (WHERE linked_entity_id IS NOT NULL)         AS linked_pop,
          COUNT(*) FILTER (WHERE linked_entity_id IS NOT NULL
            AND match_confidence IS NOT NULL)                          AS confidence_pop
        FROM wsib_registry
      `);
      const wsibTotal = parseInt(wa.wsib_total, 10) || 0;

      // ── pb: Parcel-buildings aggregate (Denom D) ───────────────
      // All linkage columns are NOT NULL in schema — rows serve as integrity sentinels.
      // WF2 #4 2026-05-08 — added Surgical Triangle INPUT coverage for footprint_area_sqm
      // and max_height_m (the cost model's primary inputs). Without these, an outlier
      // output like the $29M ZARA two-wall-signs estimate gives no upstream signal.
      // Pass-2 fold (2026-05-19): the dims live on `building_footprints` (cols
      // footprint_area_sqm, max_height_m), NOT on `parcel_buildings`. Same drift class
      // as the WF2 #4 fetchLeadInspect bug fixed in commit 73f3ae6 — that fix was
      // applied to the lead inspector but not to this script. JOIN added.
      const { rows: [pb] } = await pool.query(`
        SELECT
          COUNT(*)                                                                  AS pb_total,
          COUNT(*) FILTER (WHERE pb.is_primary IS NOT NULL)                         AS is_primary_pop,
          COUNT(*) FILTER (WHERE pb.structure_type IS NOT NULL)                     AS structure_type_pop,
          COUNT(*) FILTER (WHERE pb.match_type IS NOT NULL)                         AS match_type_pop,
          COUNT(*) FILTER (WHERE pb.confidence IS NOT NULL)                         AS confidence_pop,
          COUNT(*) FILTER (WHERE pb.linked_at IS NOT NULL)                          AS linked_at_pop,
          COUNT(*) FILTER (WHERE bf.footprint_area_sqm IS NOT NULL)                 AS area_sqm_pop,
          COUNT(*) FILTER (WHERE bf.max_height_m IS NOT NULL)                       AS height_m_pop
        FROM parcel_buildings pb
        LEFT JOIN building_footprints bf ON bf.id = pb.building_id
      `);
      const pbTotal = parseInt(pb.pb_total, 10) || 0;

      // ── pt: Permit-trades aggregate (Denom E) ─────────────────
      const { rows: [pt] } = await pool.query(`
        SELECT
          COUNT(*)                                                     AS pt_total,
          COUNT(*) FILTER (WHERE tier IS NOT NULL)                     AS tier_pop,
          COUNT(*) FILTER (WHERE confidence IS NOT NULL)               AS confidence_pop,
          COUNT(*) FILTER (WHERE is_active IS NOT NULL)                AS is_active_pop,
          COUNT(*) FILTER (WHERE phase IS NOT NULL)                    AS phase_pop,
          COUNT(*) FILTER (WHERE lead_score IS NOT NULL)               AS lead_score_pop,
          COUNT(*) FILTER (WHERE classified_at IS NOT NULL)            AS classified_at_pop
        FROM permit_trades
      `);
      const ptTotal = parseInt(pt.pt_total, 10) || 0;

      // ── ce: Cost-estimates aggregate (Denom F) ────────────────
      const { rows: [ce] } = await pool.query(`
        SELECT
          COUNT(*)                                                          AS ce_total,
          COUNT(*) FILTER (WHERE estimated_cost IS NOT NULL)                AS estimated_cost_pop,
          COUNT(*) FILTER (WHERE cost_source IS NOT NULL)                   AS cost_source_pop,
          COUNT(*) FILTER (WHERE cost_tier IS NOT NULL)                     AS cost_tier_pop,
          COUNT(*) FILTER (WHERE cost_range_low IS NOT NULL)                AS cost_range_low_pop,
          COUNT(*) FILTER (WHERE cost_range_high IS NOT NULL)               AS cost_range_high_pop,
          COUNT(*) FILTER (WHERE premium_factor IS NOT NULL)                AS premium_factor_pop,
          COUNT(*) FILTER (WHERE complexity_score IS NOT NULL)              AS complexity_score_pop,
          COUNT(*) FILTER (WHERE model_version IS NOT NULL)                 AS model_version_pop,
          COUNT(*) FILTER (WHERE is_geometric_override IS NOT NULL)         AS is_geometric_override_pop,
          COUNT(*) FILTER (WHERE modeled_gfa_sqm IS NOT NULL)               AS modeled_gfa_sqm_pop,
          COUNT(*) FILTER (WHERE effective_area_sqm IS NOT NULL)            AS effective_area_sqm_pop,
          COUNT(*) FILTER (WHERE trade_contract_values IS NOT NULL)         AS trade_contract_values_pop,
          COUNT(*) FILTER (WHERE computed_at IS NOT NULL)                   AS computed_at_pop
        FROM cost_estimates
      `);
      const ceTotal = parseInt(ce.ce_total, 10) || 0;

      // ── misc: Cross-table sub-selects ─────────────────────────
      const { rows: [misc] } = await pool.query(`
        SELECT
          -- Denom A table-coverage metrics (distinct permit keys)
          (SELECT COUNT(DISTINCT permit_num || '--' || revision_num)
             FROM permit_parcels)                                                            AS permits_with_parcel,
          (SELECT COUNT(DISTINCT permit_num || '--' || revision_num)
             FROM permit_trades WHERE is_active = true)                                     AS permits_with_active_trade,
          (SELECT COUNT(DISTINCT permit_num || '--' || revision_num)
             FROM cost_estimates)                                                            AS permits_with_cost_estimate,
          -- Denom C: geocoded permits that have ≥1 parcel link (all pp cols NOT NULL)
          (SELECT COUNT(DISTINCT pp.permit_num || '--' || pp.revision_num)
             FROM permit_parcels pp
             JOIN permits p ON p.permit_num = pp.permit_num
                           AND p.revision_num = pp.revision_num
            WHERE p.latitude IS NOT NULL)                                                   AS pp_linked_geocoded,
          -- Parcel / massing context
          (SELECT COUNT(DISTINCT parcel_id) FROM parcel_buildings)                          AS massing_linked_parcels,
          (SELECT COUNT(*) FROM parcels
            WHERE centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL)                    AS parcels_with_centroid,
          -- WF2 #4 2026-05-08 — Surgical Triangle INPUT: lot size coverage
          (SELECT COUNT(*) FROM parcels)                                                    AS parcels_total,
          (SELECT COUNT(*) FROM parcels WHERE lot_size_sqm IS NOT NULL)                     AS parcels_with_area,
          -- Timing calibration
          (SELECT COUNT(*) FROM phase_calibration WHERE median_days IS NOT NULL)            AS calibration_rows,
          -- CoA context
          (SELECT COUNT(*) FROM coa_applications WHERE linked_permit_num IS NOT NULL)       AS coa_linked_pop,
          (SELECT COUNT(*) FROM coa_applications)                                           AS coa_total,
          (SELECT COUNT(*) FROM coa_applications WHERE lifecycle_phase IS NOT NULL AND linked_permit_num IS NULL) AS coa_lifecycle_phase_pop,
          (SELECT COUNT(*) FROM coa_applications
            WHERE decision = 'Approved' AND linked_permit_num IS NULL)                      AS coa_approved_unlinked,
          -- Bug 4: stable denominator — all approved CoA apps (not just currently unlinked)
          (SELECT COUNT(*) FROM coa_applications WHERE decision = 'Approved')               AS coa_approved_total,
          -- Bug 3: permits chain Step 21 CoA lifecycle_phase needs unlinked denominator
          (SELECT COUNT(*) FROM coa_applications WHERE linked_permit_num IS NULL)           AS coa_unlinked_total,
          -- User activity
          (SELECT COUNT(*) FROM tracked_projects WHERE status != 'archived')               AS tracked_active,
          (SELECT COUNT(*) FROM tracked_projects)                                           AS tracked_total,
          (SELECT COUNT(*) FROM lead_analytics)                                             AS lead_analytics_total,
          -- Quality / health checks
          (SELECT COUNT(*) FROM data_quality_snapshots
            WHERE snapshot_date = CURRENT_DATE)                                             AS snapshot_today,
          (SELECT COUNT(*) FROM engine_health_snapshots
            WHERE captured_at > NOW() - INTERVAL '25 hours')                               AS engine_health_today,
          (SELECT COUNT(*) FROM (
            SELECT permit_num, revision_num FROM permits
             GROUP BY 1, 2 HAVING COUNT(*) > 1
          ) sub)                                                                            AS dup_permit_pks
      `);

      // ── tfd: Forecast-eligible permits (Denom G) ──────────────
      // Mirrors SOURCE_SQL in compute-trade-forecasts.js exactly.
      const { rows: [tfd] } = await pool.query(`
        SELECT COUNT(DISTINCT p.permit_num || '--' || p.revision_num) AS forecast_eligible_permits
          FROM permits p
          JOIN permit_trades pt ON pt.permit_num = p.permit_num
                               AND pt.revision_num = p.revision_num
                               AND pt.is_active = true
         WHERE p.permit_num NOT LIKE 'PRE-%'
           AND p.lifecycle_phase IS NOT NULL
           AND p.lifecycle_phase NOT IN ${SKIP_PHASES_SQL}
           AND COALESCE(p.phase_started_at, p.issued_date, p.application_date) >= NOW() - INTERVAL '3 years'
      `);
      const forecastEligible = parseInt(tfd.forecast_eligible_permits, 10) || 0;

      // ── tfa: Trade-forecasts aggregate (Denom H) ──────────────
      // predicted_start and urgency use DISTINCT permit counts vs forecastEligible
      // to avoid >100% when multiple trades per permit all have the field set.
      const { rows: [tfa] } = await pool.query(`
        SELECT
          COUNT(*) AS forecast_total,
          -- Permit-level (vs forecastEligible — Denom G)
          COUNT(DISTINCT permit_num || '--' || revision_num)                                           AS forecast_total_permits,
          COUNT(DISTINCT permit_num || '--' || revision_num)
            FILTER (WHERE predicted_start IS NOT NULL)                                                 AS predicted_start_permits,
          COUNT(DISTINCT permit_num || '--' || revision_num)
            FILTER (WHERE urgency IS NOT NULL AND urgency NOT IN ('unknown'))                          AS urgency_classified_permits,
          -- Row-level field quality (vs forecast_total — Denom H)
          COUNT(*) FILTER (WHERE trade_slug IS NOT NULL)                                               AS trade_slug_pop,
          COUNT(*) FILTER (WHERE target_window IS NOT NULL)                                            AS target_window_pop,
          COUNT(*) FILTER (WHERE confidence IS NOT NULL)                                               AS confidence_pop,
          COUNT(*) FILTER (WHERE calibration_method IS NOT NULL)                                       AS calibration_method_pop,
          COUNT(*) FILTER (WHERE sample_size IS NOT NULL)                                              AS sample_size_pop,
          COUNT(*) FILTER (WHERE median_days IS NOT NULL)                                              AS median_days_pop,
          COUNT(*) FILTER (WHERE p25_days IS NOT NULL)                                                 AS p25_days_pop,
          COUNT(*) FILTER (WHERE p75_days IS NOT NULL)                                                 AS p75_days_pop,
          COUNT(*) FILTER (WHERE opportunity_score IS NOT NULL)                                        AS opportunity_score_pop,
          COUNT(*) FILTER (WHERE computed_at IS NOT NULL)                                              AS computed_at_pop,
          -- opportunity_score denominator (mirrors compute-opportunity-scores.js WHERE clause)
          COUNT(*) FILTER (WHERE urgency IS NULL OR urgency <> 'expired')                              AS opp_score_denom,
          COUNT(*) FILTER (WHERE (urgency IS NULL OR urgency <> 'expired') AND opportunity_score > 0)  AS opp_score_pop
        FROM trade_forecasts
        WHERE permit_num NOT LIKE 'PRE-%'
      `);
      const forecastTotal  = parseInt(tfa.forecast_total, 10) || 0;
      const oppScoreDenom  = parseInt(tfa.opp_score_denom, 10) || 0;

      // ── Permits schema INFO ────────────────────────────────────
      const { rows: [pSchema] } = await pool.query(`
        SELECT COUNT(*) AS cols FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'permits'
      `);

      // ═══════════════════════════════════════════════════════════
      // Build rows — permits chain full profile
      // ═══════════════════════════════════════════════════════════

      // Step 1 — assert_schema
      rows.push(infoRow('Step 1 — assert_schema', 'permits.columns_present', parseInt(pSchema.cols, 10)));

      // Step 2 — load_permits (Denom A — all permits)
      rows.push(coverageRow('Step 2 — load_permits', 'permits.permit_type',             parseInt(pa.permit_type_pop, 10),       permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.structure_type',          parseInt(pa.structure_type_pop, 10),    permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.work',                    parseInt(pa.work_pop, 10),              permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.street_num',              parseInt(pa.street_num_pop, 10),        permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.street_name',             parseInt(pa.street_name_pop, 10),       permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.street_name_normalized',  parseInt(pa.street_name_norm_pop, 10),  permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.street_type',             parseInt(pa.street_type_pop, 10),       permitsTotal));
      // Bug 2: street_direction is naturally sparse — most streets lack N/S/E/W designations (~14%).
      rows.push(infoRow(    'Step 2 — load_permits', 'permits.street_direction',        parseInt(pa.street_direction_pop, 10),  permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.city',                    parseInt(pa.city_pop, 10),              permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.postal',                  parseInt(pa.postal_pop, 10),            permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.geo_id',                  parseInt(pa.geo_id_pop, 10),            permitsTotal));
      // Bug 2: building_type and category are naturally sparse in Toronto CKAN data.
      rows.push(infoRow(    'Step 2 — load_permits', 'permits.building_type',           parseInt(pa.building_type_pop, 10),     permitsTotal));
      rows.push(infoRow(    'Step 2 — load_permits', 'permits.category',                parseInt(pa.category_pop, 10),          permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.application_date',        parseInt(pa.application_date_pop, 10),  permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.issued_date',             parseInt(pa.issued_date_pop, 10),       permitsTotal));
      // Bug 1: completed_date is NULL for all active permits — structural sparsity.
      // Step 3 audits it against stale/closed permits with the correct denominator.
      rows.push(infoRow(    'Step 2 — load_permits', 'permits.completed_date',          parseInt(pa.completed_date_pop, 10),    permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.status',                  parseInt(pa.status_pop, 10),            permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.description',             parseInt(pa.description_pop, 10),       permitsTotal));
      // est_const_cost: INFO only — city CKAN structural sparsity, pipeline cannot control.
      rows.push(infoRow(    'Step 2 — load_permits', 'permits.est_const_cost',           parseInt(pa.est_const_cost_pop, 10),   permitsTotal));
      // Bug 2: builder_name and owner are naturally sparse in city permit data.
      rows.push(infoRow(    'Step 2 — load_permits', 'permits.builder_name',             parseInt(pa.builder_name_pop, 10),     permitsTotal));
      rows.push(infoRow(    'Step 2 — load_permits', 'permits.owner',                   parseInt(pa.owner_pop, 10),             permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.dwelling_units_created',  parseInt(pa.dwell_created_pop, 10),    permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.dwelling_units_lost',     parseInt(pa.dwell_lost_pop, 10),        permitsTotal));
      // Bug 2: ward and council_district are naturally sparse (not all Toronto permit types carry them).
      rows.push(infoRow(    'Step 2 — load_permits', 'permits.ward',                    parseInt(pa.ward_pop, 10),              permitsTotal));
      rows.push(infoRow(    'Step 2 — load_permits', 'permits.council_district',        parseInt(pa.council_district_pop, 10),  permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.current_use',             parseInt(pa.current_use_pop, 10),       permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.proposed_use',            parseInt(pa.proposed_use_pop, 10),      permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.housing_units',           parseInt(pa.housing_units_pop, 10),     permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.storeys',                 parseInt(pa.storeys_pop, 10),           permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.data_hash',               parseInt(pa.data_hash_pop, 10),         permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.raw_json',                parseInt(pa.raw_json_pop, 10),          permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.last_seen_at',            parseInt(pa.last_seen_at_pop, 10),      permitsTotal));

      // Step 3 — close_stale_permits
      rows.push(infoRow(    'Step 3 — close_stale_permits', 'permits.status (stale total)', staleTotal, permitsTotal));
      rows.push(coverageRow('Step 3 — close_stale_permits', 'permits.completed_date',        parseInt(pa.stale_with_date, 10), staleTotal || null));

      // Step 4 — classify_permit_phase
      // enriched_status is only populated for permits in active inspection stages
      // (P9–P17). ~12K / 244K = 5.2% against all-permits denominator → false FAIL.
      // infoRow: structural sparsity, not a data quality gap. WF3-B fix.
      rows.push(infoRow('Step 4 — classify_permit_phase', 'permits.enriched_status', parseInt(pa.enriched_status_pop, 10), permitsTotal));

      // Step 5 — classify_scope (Denom A)
      rows.push(coverageRow('Step 5 — classify_scope', 'permits.project_type',        parseInt(pa.project_type_pop, 10),    permitsTotal));
      rows.push(coverageRow('Step 5 — classify_scope', 'permits.scope_tags',           parseInt(pa.scope_tags_pop, 10),       permitsTotal));
      rows.push(coverageRow('Step 5 — classify_scope', 'permits.scope_classified_at',  parseInt(pa.scope_classified_pop, 10), permitsTotal));
      rows.push(coverageRow('Step 5 — classify_scope', 'permits.scope_source',         parseInt(pa.scope_source_pop, 10),    permitsTotal));

      // Step 6 — extract_builders (Denom B — entities)
      // Builder-name match ratio (JOIN-based — excludes entities from non-permit sources).
      rows.push(coverageRow('Step 6 — extract_builders', 'entities.name_normalized (permit builders)', matchedBuilderNames,                    builderNameTotal || null));
      // Entity-level field completeness.
      rows.push(coverageRow('Step 6 — extract_builders', 'entities.legal_name',            parseInt(ea.legal_name_pop, 10),     entitiesTotal));
      rows.push(coverageRow('Step 6 — extract_builders', 'entities.permit_count',          parseInt(ea.permit_count_pop, 10),   entitiesTotal));
      rows.push(coverageRow('Step 6 — extract_builders', 'entities.entity_type',           parseInt(ea.entity_type_pop, 10),    entitiesTotal));
      rows.push(coverageRow('Step 6 — extract_builders', 'entities.last_seen_at',          parseInt(ea.last_seen_at_pop, 10),   entitiesTotal));
      // Scraped contact data — externalRow thresholds (PASS ≥10%, WARN ≥5%).
      rows.push(externalRow('Step 6 — extract_builders', 'entities.primary_phone',         parseInt(ea.phone_pop, 10),          entitiesTotal));
      rows.push(externalRow('Step 6 — extract_builders', 'entities.primary_email',         parseInt(ea.email_pop, 10),          entitiesTotal));
      rows.push(externalRow('Step 6 — extract_builders', 'entities.website',               parseInt(ea.website_pop, 10),        entitiesTotal));

      // Step 7 — link_wsib
      // is_wsib_registered: third-party scraper field, sparse by design (~24%).
      // externalRow: PASS >= 10%, WARN >= 5%, FAIL below. WF3-C fix.
      rows.push(externalRow('Step 7 — link_wsib', 'entities.is_wsib_registered',        parseInt(ea.wsib_registered_pop, 10), entitiesTotal));
      // WSIB registry match rate — externalRow (external data source).
      rows.push(externalRow('Step 7 — link_wsib', 'wsib_registry.linked_entity_id',      parseInt(wa.linked_pop, 10),          wsibTotal || null));
      rows.push(coverageRow('Step 7 — link_wsib', 'wsib_registry.match_confidence',      parseInt(wa.confidence_pop, 10),      parseInt(wa.linked_pop, 10) || null));

      // Step 8 — geocode_permits (Denom A — all permits, not just geocodeable subset)
      rows.push(coverageRow('Step 8 — geocode_permits', 'permits.latitude',    parseInt(pa.latitude_pop, 10),    permitsTotal));
      rows.push(coverageRow('Step 8 — geocode_permits', 'permits.longitude',   parseInt(pa.longitude_pop, 10),   permitsTotal));
      rows.push(coverageRow('Step 8 — geocode_permits', 'permits.location',    parseInt(pa.location_pop, 10),    permitsTotal));
      rows.push(coverageRow('Step 8 — geocode_permits', 'permits.geocoded_at', parseInt(pa.geocoded_at_pop, 10), permitsTotal));

      // Step 9 — link_parcels
      // Denom A: % of all permits with ≥1 parcel link.
      rows.push(coverageRow('Step 9 — link_parcels', 'permit_parcels.permits_linked', parseInt(misc.permits_with_parcel, 10), permitsTotal));
      // Denom C: % of geocoded permits with a parcel link (all pp cols NOT NULL → same value).
      rows.push(coverageRow('Step 9 — link_parcels', 'permit_parcels.match_type (geocoded)',  parseInt(misc.pp_linked_geocoded, 10), geocodedTotal || null));
      rows.push(coverageRow('Step 9 — link_parcels', 'permit_parcels.confidence (geocoded)',  parseInt(misc.pp_linked_geocoded, 10), geocodedTotal || null));
      rows.push(coverageRow('Step 9 — link_parcels', 'permit_parcels.linked_at (geocoded)',   parseInt(misc.pp_linked_geocoded, 10), geocodedTotal || null));
      // WF2 #4 2026-05-08 — Surgical Triangle INPUT: lot size (fallback GFA basis per Spec 83 §3A).
      // Pass-2 fold (2026-05-19): parcels stores area as `lot_size_sqm` (same WF2 #4 drift class as the pb dims).
      rows.push(coverageRow('Step 9 — link_parcels', 'parcels.lot_size_sqm', parseInt(misc.parcels_with_area, 10), parseInt(misc.parcels_total, 10) || null));

      // Step 9b — enrich_permits (WF3 #406, Spec 66 WF3 / migration 166).
      // Insert-after label (DEC-2; #405 full renumber deferred). zoning_class is the
      // gated headline (DEC-1: PASS >= 80 / WARN >= 75 — matches the F-H12 ceiling, so
      // a real drop below 80 WARNs/FAILs the global profile instead of going silent).
      // Sub-fields are INFO — sparse cost inputs (bylaw_max_*) / co-written jsonb +
      // provenance — excluded from the verdict cascade (Spec 48 §3.6). Sub-field
      // denominator context = zoningEnrichedTotal ("of enriched permits", not all).
      rows.push(calibratedRow('Step 9b — enrich_permits', 'permits.zoning_class', parseInt(pa.zoning_class_pop, 10), permitsTotal, 80, 75));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.zoning_enriched_at',            parseInt(pa.zoning_enriched_pop, 10),            zoningEnrichedTotal));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.bylaw_max_coverage_pct',        parseInt(pa.bylaw_max_coverage_pct_pop, 10),     zoningEnrichedTotal));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.bylaw_max_fsi',                 parseInt(pa.bylaw_max_fsi_pop, 10),              zoningEnrichedTotal));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.bylaw_max_height_m',            parseInt(pa.bylaw_max_height_m_pop, 10),         zoningEnrichedTotal));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.exception_number',              parseInt(pa.exception_number_pop, 10),           zoningEnrichedTotal));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.applicable_bylaws',             parseInt(pa.applicable_bylaws_pop, 10),          zoningEnrichedTotal));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.overlay_summary',               parseInt(pa.overlay_summary_pop, 10),            zoningEnrichedTotal));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.zoning_parcel_count',           parseInt(pa.zoning_parcel_count_pop, 10),        zoningEnrichedTotal));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.zoning_dominant_parcel_id',     parseInt(pa.zoning_dominant_parcel_id_pop, 10),  zoningEnrichedTotal));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.zoning_dominant_parcel_method', parseInt(pa.zoning_dominant_parcel_method_pop, 10), zoningEnrichedTotal));
      // WF2 #415 — ravine propagation (Spec 59 §8e). INFO: is_in_ravine is a count of the TRUE
      // subset (the NOT-NULL-DEFAULT-false boolean is vacuously 100% under coverage — count TRUE,
      // never IS NOT NULL); ravine_distance is non-null only for parcel-linked permits. Neither is a
      // coverage % — a small geographic subset has no stable population floor to gate against (DEC-B).
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.is_in_ravine_protection_area', parseInt(pa.in_ravine_pop, 10)));
      // Pure count, no denominator — ravine_distance is populated for the parcel-LINKED set,
      // which is distinct from (and can exceed) the zoning-enriched set, so passing
      // zoningEnrichedTotal would risk a >100% INFO display (Code Reviewer #415). Mirrors the
      // is_in_ravine count above.
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.ravine_distance_m',             parseInt(pa.ravine_distance_pop, 10)));
      // WF3 #428 — heritage propagation (Spec 61 §8e). Same shape as ravine: is_heritage_designated
      // = count of the TRUE subset (FILTER, never IS NOT NULL); type/date pure counts, no denominator.
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.is_heritage_designated',   parseInt(pa.heritage_designated_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.heritage_designation_type', parseInt(pa.heritage_type_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.heritage_designation_date', parseInt(pa.heritage_date_pop, 10)));
      // §8e — centreline propagation (Spec 62 §8e). Same shape as ravine/heritage: is_corner_lot/
      // is_through_lot = TRUE-subset counts (FILTER, never IS NOT NULL); frontage name = non-null count.
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.is_corner_lot',                parseInt(pa.corner_lot_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.is_through_lot',               parseInt(pa.through_lot_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.abuts_laneway',               parseInt(pa.abuts_laneway_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.primary_frontage_street_name', parseInt(pa.frontage_name_pop, 10)));
      // Spec 65 max-build propagation — INFO, no denominator (sparse-by-design; FSI ~5% → never gated).
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.lot_size_confidence',         parseInt(pa.lot_size_conf_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.max_buildable_footprint_sqm', parseInt(pa.max_footprint_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.max_buildable_gfa_sqm',       parseInt(pa.max_gfa_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.max_buildable_gfa_basis_fsi', parseInt(pa.max_gfa_fsi_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.max_buildable_gfa_basis_coverage_box', parseInt(pa.max_gfa_cov_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.max_build_confidence_high',   parseInt(pa.mb_conf_high_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.max_build_confidence_medium', parseInt(pa.mb_conf_medium_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.max_build_confidence_low',    parseInt(pa.mb_conf_low_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.garden_suite_fits',           parseInt(pa.suite_fits_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.envelope_constrained',        parseInt(pa.env_constrained_pop, 10)));
      // Spec 65 Phase 1 existing-structure — INFO, no denominator.
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.imagery_roof_footprint_sqm',      parseInt(pa.existing_footprint_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.imagery_roof_gfa_sqm',            parseInt(pa.existing_gfa_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.existing_structure_confidence_high', parseInt(pa.existing_conf_high_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.existing_structure_confidence_low',  parseInt(pa.existing_conf_low_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.existing_greenspace_sqm',     parseInt(pa.existing_greenspace_pop, 10)));
      // Spec 65 Phase 2 scenario GFAs — INFO, no denominator.
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.max_newbuild_coa_gfa_sqm',  parseInt(pa.scen_coa_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.cur_floor_gfa_sqm',         parseInt(pa.scen_floor_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.cur_pot_2story_gfa_sqm',    parseInt(pa.scen_pot2_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.cur_pot_3story_gfa_sqm',    parseInt(pa.scen_pot3_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.cur_gfa_range_basis',       parseInt(pa.scen_range_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.cur_est_kitchen_gfa_sqm',   parseInt(pa.scen_kitchen_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.cur_est_bath_gfa_sqm',      parseInt(pa.scen_bath_pop, 10)));
      // Spec 65 Phase 3 accessory fit — INFO, no denominator.
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.max_garage_gfa_sqm',        parseInt(pa.garage_fits_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.garage_permission_as_of_right',  parseInt(pa.garage_aor_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.garage_permission_coa_required', parseInt(pa.garage_coa_pop, 10)));
      // Spec 78 §4D optimal-config + comp propagation — INFO.
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.opt_config_confidence', parseInt(pa.opt_config_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.comp_count', parseInt(pa.comp_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.rear_suite_type',           parseInt(pa.rear_suite_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.rear_suite_permission_as_of_right',  parseInt(pa.rear_suite_aor_pop, 10)));
      rows.push(infoRow('Step 9b — enrich_permits', 'permits.rear_suite_permission_coa_required', parseInt(pa.rear_suite_coa_pop, 10)));
      // Spec 88 §2.10 — enrich_permits parcel-cost propagation (mig 207). INFO, no denominator
      // (sparse-by-design — propagated only where a dominant parcel carries a cost menu).
      for (const c of COST_PROP_COLS) {
        rows.push(infoRow('Step 9b — enrich_permits', `permits.${c}`, parseInt(pa[`${c}_pop`], 10)));
      }

      // ── Spec 88 §2.10 — compute_parcel_cost_estimates (sources chain, profiled here).
      // GATED ≥85% of residential parcels WITH a linked building (the ~9% building-less are an
      // exclusion FILTER, not a numerator note — that makes 85% achievable). Building-less parcels
      // still get a lot-driven menu, so the gated denominator is the with-building subset.
      const { rows: [pcm] } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE has_bldg)                                    AS resid_with_bldg,
          COUNT(*) FILTER (WHERE has_bldg AND parcel_cost_menu IS NOT NULL)   AS resid_with_bldg_menu,
          COUNT(*) FILTER (WHERE parcel_cost_menu IS NOT NULL)                AS any_menu,
          COUNT(*)                                                            AS resid_total
        FROM (
          SELECT p.parcel_cost_menu,
                 EXISTS (SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = p.id) AS has_bldg
          FROM parcels p
          WHERE p.zoning_class IS NOT NULL AND upper(p.zoning_class) LIKE 'R%'
        ) q
      `);
      const residWithBldg = parseInt(pcm.resid_with_bldg, 10) || 0;
      rows.push(calibratedRow('Sources — compute_parcel_cost_estimates', 'parcels.parcel_cost_menu (residential w/ building)',
        parseInt(pcm.resid_with_bldg_menu, 10), residWithBldg || null, 85, 80));
      rows.push(infoRow('Sources — compute_parcel_cost_estimates', 'parcels.parcel_cost_menu (any residential)', parseInt(pcm.any_menu, 10)));

      // Step 10 — link_neighbourhoods (Denom A)
      rows.push(coverageRow('Step 10 — link_neighbourhoods', 'permits.neighbourhood_id', parseInt(pa.neighbourhood_pop, 10), permitsTotal));

      // Step 11 — link_massing (Denom D — parcel_buildings)
      // All parcel_buildings columns are NOT NULL — rows serve as integrity sentinels.
      rows.push(infoRow(    'Step 11 — link_massing', 'parcels.with_centroid',           parseInt(misc.parcels_with_centroid, 10)));
      rows.push(infoRow(    'Step 11 — link_massing', 'parcel_buildings.linked_parcels', parseInt(misc.massing_linked_parcels, 10)));
      rows.push(coverageRow('Step 11 — link_massing', 'parcel_buildings.is_primary',     parseInt(pb.is_primary_pop, 10),     pbTotal || null));
      rows.push(coverageRow('Step 11 — link_massing', 'parcel_buildings.structure_type', parseInt(pb.structure_type_pop, 10), pbTotal || null));
      rows.push(coverageRow('Step 11 — link_massing', 'parcel_buildings.match_type',     parseInt(pb.match_type_pop, 10),     pbTotal || null));
      rows.push(coverageRow('Step 11 — link_massing', 'parcel_buildings.confidence',     parseInt(pb.confidence_pop, 10),     pbTotal || null));
      rows.push(coverageRow('Step 11 — link_massing', 'parcel_buildings.linked_at',      parseInt(pb.linked_at_pop, 10),      pbTotal || null));
      // WF2 #4 2026-05-08 — Surgical Triangle INPUTS: footprint area + height (primary GFA basis per Spec 83 §3A).
      // Pass-2 fold (2026-05-19): columns live on building_footprints, not parcel_buildings.
      // Denominator stays pbTotal (parcel_buildings rows joined to bf via building_id).
      rows.push(coverageRow('Step 11 — link_massing', 'building_footprints.footprint_area_sqm', parseInt(pb.area_sqm_pop, 10), pbTotal || null));
      rows.push(coverageRow('Step 11 — link_massing', 'building_footprints.max_height_m',       parseInt(pb.height_m_pop, 10), pbTotal || null));

      // Step 12 — link_similar (proxy: non-BLD permits with scope_tags propagated)
      rows.push(coverageRow('Step 12 — link_similar', 'permits.scope_tags (non-BLD)', parseInt(pa.non_bld_scope_pop, 10), parseInt(pa.non_bld_total, 10) || null));

      // Step 13 — classify_permits (Denom A table coverage + Denom E row quality)
      rows.push(coverageRow('Step 13 — classify_permits', 'permit_trades.permits_with_active_trade', parseInt(misc.permits_with_active_trade, 10), permitsTotal));
      rows.push(coverageRow('Step 13 — classify_permits', 'permit_trades.tier',           parseInt(pt.tier_pop, 10),         ptTotal || null));
      rows.push(coverageRow('Step 13 — classify_permits', 'permit_trades.confidence',     parseInt(pt.confidence_pop, 10),   ptTotal || null));
      rows.push(coverageRow('Step 13 — classify_permits', 'permit_trades.is_active',      parseInt(pt.is_active_pop, 10),    ptTotal || null));
      rows.push(coverageRow('Step 13 — classify_permits', 'permit_trades.phase',          parseInt(pt.phase_pop, 10),        ptTotal || null));
      rows.push(coverageRow('Step 13 — classify_permits', 'permit_trades.lead_score',     parseInt(pt.lead_score_pop, 10),   ptTotal || null));
      rows.push(coverageRow('Step 13 — classify_permits', 'permit_trades.classified_at',  parseInt(pt.classified_at_pop, 10), ptTotal || null));

      // Step 14 — compute_cost_estimates (Denom A table coverage + Denom F row quality)
      rows.push(coverageRow('Step 14 — compute_cost_estimates', 'cost_estimates.permits_covered',       parseInt(misc.permits_with_cost_estimate, 10), permitsTotal));
      rows.push(coverageRow('Step 14 — compute_cost_estimates', 'cost_estimates.estimated_cost',        parseInt(ce.estimated_cost_pop, 10),           ceTotal || null));
      rows.push(coverageRow('Step 14 — compute_cost_estimates', 'cost_estimates.cost_source',           parseInt(ce.cost_source_pop, 10),              ceTotal || null));
      rows.push(coverageRow('Step 14 — compute_cost_estimates', 'cost_estimates.cost_tier',             parseInt(ce.cost_tier_pop, 10),                ceTotal || null));
      rows.push(coverageRow('Step 14 — compute_cost_estimates', 'cost_estimates.cost_range_low',        parseInt(ce.cost_range_low_pop, 10),           ceTotal || null));
      rows.push(coverageRow('Step 14 — compute_cost_estimates', 'cost_estimates.cost_range_high',       parseInt(ce.cost_range_high_pop, 10),          ceTotal || null));
      rows.push(coverageRow('Step 14 — compute_cost_estimates', 'cost_estimates.premium_factor',        parseInt(ce.premium_factor_pop, 10),           ceTotal || null));
      rows.push(coverageRow('Step 14 — compute_cost_estimates', 'cost_estimates.complexity_score',      parseInt(ce.complexity_score_pop, 10),         ceTotal || null));
      rows.push(coverageRow('Step 14 — compute_cost_estimates', 'cost_estimates.model_version',         parseInt(ce.model_version_pop, 10),            ceTotal || null));
      rows.push(coverageRow('Step 14 — compute_cost_estimates', 'cost_estimates.is_geometric_override', parseInt(ce.is_geometric_override_pop, 10),    ceTotal || null));
      rows.push(coverageRow('Step 14 — compute_cost_estimates', 'cost_estimates.modeled_gfa_sqm',       parseInt(ce.modeled_gfa_sqm_pop, 10),          ceTotal || null));
      rows.push(coverageRow('Step 14 — compute_cost_estimates', 'cost_estimates.effective_area_sqm',    parseInt(ce.effective_area_sqm_pop, 10),       ceTotal || null));
      rows.push(coverageRow('Step 14 — compute_cost_estimates', 'cost_estimates.trade_contract_values', parseInt(ce.trade_contract_values_pop, 10),    ceTotal || null));
      rows.push(coverageRow('Step 14 — compute_cost_estimates', 'cost_estimates.computed_at',           parseInt(ce.computed_at_pop, 10),              ceTotal || null));

      // Step 15 — compute_timing_calibration_v2
      rows.push(infoRow('Step 15 — compute_timing_calibration_v2', 'phase_calibration.rows_with_median', parseInt(misc.calibration_rows, 10)));

      // Step 16 — link_coa
      const coaTotal = parseInt(misc.coa_total, 10) || 0;
      rows.push(coverageRow('Step 16 — link_coa', 'coa_applications.linked_permit_num', parseInt(misc.coa_linked_pop, 10), coaTotal || null));

      // Phase G (Spec 42 §6.11): Step 17 (create_pre_permits) coverage row REMOVED.
      // The retired script no longer creates Pre-Permit rows; the `permits.pre_permit_leads`
      // denominator is replaced by the `permits_pre_permit_count == 0` gate in
      // assert-data-bounds.js.

      // Step 18 — refresh_snapshot
      rows.push(infoRow('Step 18 — refresh_snapshot', 'data_quality_snapshots.today', parseInt(misc.snapshot_today, 10)));

      // Step 19 — assert_data_bounds
      rows.push(infoRow('Step 19 — assert_data_bounds', 'permits.duplicate_pks', parseInt(misc.dup_permit_pks, 10)));

      // Step 20 — assert_engine_health
      rows.push(infoRow('Step 20 — assert_engine_health', 'engine_health_snapshots.today', parseInt(misc.engine_health_today, 10)));

      // Step 21 — classify_lifecycle_phase (Denom A)
      rows.push(coverageRow('Step 21 — classify_lifecycle_phase', 'permits.lifecycle_phase',          lifecyclePhaseTotal,                          permitsTotal));
      rows.push(coverageRow('Step 21 — classify_lifecycle_phase', 'permits.phase_started_at',         parseInt(pa.phase_started_pop, 10),           lifecyclePhaseTotal || null));
      // lifecycle_stalled BOOLEAN NOT NULL DEFAULT false — IS NOT NULL is vacuous. Show stalled count as info.
      rows.push(infoRow('Step 21 — classify_lifecycle_phase', 'permits.lifecycle_stalled', parseInt(pa.lifecycle_stalled_pop, 10)));
      rows.push(coverageRow('Step 21 — classify_lifecycle_phase', 'permits.lifecycle_classified_at',  parseInt(pa.lifecycle_classified_pop, 10),     permitsTotal));
      // Bug 3: lifecycle_phase denominator = unlinked CoA apps (classifier only classifies unlinked).
      rows.push(coverageRow('Step 21 — classify_lifecycle_phase', 'coa_applications.lifecycle_phase', parseInt(misc.coa_lifecycle_phase_pop, 10),    parseInt(misc.coa_unlinked_total, 10) || null));

      // Step 22 — assert_lifecycle_phase_distribution
      rows.push(infoRow('Step 22 — assert_lifecycle_phase_distribution', 'permits.unclassified_count', parseInt(pa.unclassified_count, 10), permitsTotal));

      // Step 23 — compute_trade_forecasts
      // Denom G (forecastEligible): DISTINCT permit counts — fixes >100% grain mismatch.
      //
      // WF3 2026-04-22: permit-level coverage rows demoted from coverageRow → infoRow.
      // After the zombie/stall gates added to compute-trade-forecasts.js (stall gate +
      // 180-day grace cutoff), ~64% of technically eligible permits are intentionally
      // excluded. Actual coverage ~36% is the designed outcome, not a data quality gap.
      // Using coverageRow here would produce a permanent FAIL against the global
      // profiling_coverage_pass_pct threshold (~90%). Lowering that global threshold
      // would blind the Denom H row-quality checks (trade_slug, confidence, etc.) that
      // correctly hit 90%+. infoRow removes traffic-light judgment — count still visible.
      rows.push(infoRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.permits_covered',      parseInt(tfa.forecast_total_permits, 10),      forecastEligible || null));
      rows.push(infoRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.predicted_start',      parseInt(tfa.predicted_start_permits, 10),      forecastEligible || null));
      rows.push(infoRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.urgency (classified)', parseInt(tfa.urgency_classified_permits, 10),   forecastEligible || null));
      // Denom H (forecast_total rows): row-level field quality.
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.trade_slug',          parseInt(tfa.trade_slug_pop, 10),              forecastTotal || null));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.target_window',       parseInt(tfa.target_window_pop, 10),           forecastTotal || null));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.confidence',          parseInt(tfa.confidence_pop, 10),              forecastTotal || null));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.calibration_method',  parseInt(tfa.calibration_method_pop, 10),      forecastTotal || null));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.sample_size',         parseInt(tfa.sample_size_pop, 10),             forecastTotal || null));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.median_days',         parseInt(tfa.median_days_pop, 10),             forecastTotal || null));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.p25_days',            parseInt(tfa.p25_days_pop, 10),                forecastTotal || null));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.p75_days',            parseInt(tfa.p75_days_pop, 10),                forecastTotal || null));
      // opportunity_score: use opp_score_pop (non-expired AND >0) so numerator and denominator share the same grain.
      // opportunity_score_pop (IS NOT NULL across all rows) can exceed oppScoreDenom when expired rows have a value → >100%. WF3-A grain fix.
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.opportunity_score',   parseInt(tfa.opp_score_pop, 10),                oppScoreDenom || null));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.computed_at',         parseInt(tfa.computed_at_pop, 10),             forecastTotal || null));

      // Step 24 — compute_opportunity_scores (mirrors compute-opportunity-scores.js WHERE)
      rows.push(coverageRow('Step 24 — compute_opportunity_scores', 'trade_forecasts.opportunity_score (>0)', parseInt(tfa.opp_score_pop, 10), oppScoreDenom || null));

      // Step 25 — update_tracked_projects
      const trackedTotal  = parseInt(misc.tracked_total, 10) || 0;
      const trackedActive = parseInt(misc.tracked_active, 10) || 0;
      rows.push(infoRow('Step 25 — update_tracked_projects', 'tracked_projects.active', trackedActive, trackedTotal));
      rows.push(infoRow('Step 25 — update_tracked_projects', 'lead_analytics.rows',     parseInt(misc.lead_analytics_total, 10), trackedActive || null));

      // Step 26 — assert_entity_tracing (last pipeline_runs verdict)
      const { rows: etRuns } = await pool.query(`
        SELECT records_meta FROM pipeline_runs
         WHERE pipeline = 'assert_entity_tracing'
         ORDER BY started_at DESC LIMIT 1
      `);
      const etVerdict = etRuns[0]?.records_meta?.audit_table?.verdict ?? 'NO_RUN';
      rows.push(infoRow('Step 26 — assert_entity_tracing', 'entity_tracing.last_verdict', etVerdict === 'PASS' ? 1 : 0));
    }

    // ── Vocabulary coverage (Spec 49 §3 value/vocabulary dimension) ─────────
    // Distinct values present vs the defining vocabulary, per triple — catches silent
    // under-emission the field-NULL rows above can't see. Step-attributed via the metric label.
    for (const t of VOCAB_COVERAGE) {
      rows.push(await profileVocabTriple(t));
    }

    // ── Worst status verdict ───────────────────────────────────────────────
    const verdict = rows.some(r => r.status === 'FAIL') ? 'FAIL'
      : rows.some(r => r.status === 'WARN') ? 'WARN'
      : 'PASS';

    if (verdict !== 'PASS') {
      pipeline.log.warn('[assert-global-coverage]', `Coverage verdict: ${verdict}`, {
        fail_count: rows.filter(r => r.status === 'FAIL').length,
        warn_count: rows.filter(r => r.status === 'WARN').length,
      });
    }

    pipeline.emitSummary({
      records_total: 1,
      records_new: 0,
      records_updated: 0,
      records_meta: {
        audit_table: {
          phase: 111,
          name: 'Global Data Completeness Profile',
          verdict,
          rows,
        },
      },
    });

    pipeline.emitMeta({}, {});

  }, { skipEmit: false });

  if (!lockResult.acquired) {
    pipeline.log.info(
      '[assert-global-coverage]',
      `Advisory lock ${ADVISORY_LOCK_ID} held — skipping to avoid duplicate coverage check.`,
    );
    pipeline.emitSummary({
      records_total: 0,
      records_new: 0,
      records_updated: 0,
      records_meta: {
        skipped: true,
        reason: 'lock_held',
        advisory_lock_id: ADVISORY_LOCK_ID,
      },
    });
    pipeline.emitMeta({}, {});
  }
});
