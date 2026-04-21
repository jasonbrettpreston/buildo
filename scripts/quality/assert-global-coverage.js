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
 * SPEC LINK: docs/specs/pipeline/49_data_completeness_profiling.md
 */
'use strict';

const { z } = require('zod');
const pipeline = require('./../lib/pipeline');
const { loadMarketplaceConfigs, validateLogicVars } = require('./../lib/config-loader');

// Advisory lock ID — unique to this assert script (spec 47 §A.5, ID 111).
const ADVISORY_LOCK_ID = 111;

// Phases excluded from compute-trade-forecasts SOURCE_SQL.
// Must stay in sync with scripts/compute-trade-forecasts.js SKIP_PHASES.
const SKIP_PHASES_SQL = `('P19','P20','O1','O2','O3','P1','P2')`;

const LOGIC_VARS_SCHEMA = z.object({
  profiling_coverage_pass_pct: z.coerce.number().int().min(0).max(100),
  profiling_coverage_warn_pct: z.coerce.number().int().min(0).max(100),
}).refine(
  d => d.profiling_coverage_warn_pct < d.profiling_coverage_pass_pct,
  { message: 'profiling_coverage_warn_pct must be strictly less than profiling_coverage_pass_pct' },
);

pipeline.run('assert-global-coverage', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    const { logicVars } = await loadMarketplaceConfigs(pool, 'assert-global-coverage');
    const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'assert-global-coverage');
    if (!validation.valid) {
      throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
    }

    const passPct = logicVars.profiling_coverage_pass_pct;
    const warnPct = logicVars.profiling_coverage_warn_pct;

    const isCoaChain = process.env.PIPELINE_CHAIN === 'coa';
    pipeline.log.info(
      '[assert-global-coverage]',
      `Chain mode: ${isCoaChain ? 'coa (scoped subset)' : 'permits (full profile)'}`,
      { pass_pct: passPct, warn_pct: warnPct },
    );

    // ── Row builders ──────────────────────────────────────────────────────────

    // Standard coverage: PASS ≥ passPct%, WARN ≥ warnPct%, FAIL below.
    function coverageRow(stepTarget, field, populated, denominator) {
      const pct = (denominator != null && denominator > 0)
        ? Math.round((populated / denominator) * 1000) / 10
        : null;
      const status = pct === null ? 'INFO'
        : pct >= passPct ? 'PASS'
        : pct >= warnPct ? 'WARN'
        : 'FAIL';
      return { step_target: stepTarget, field, populated, denominator, coverage_pct: pct, status };
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
      return { step_target: stepTarget, field, populated, denominator, coverage_pct: pct, status };
    }

    // Informational only — no traffic-light judgment.
    // Used for structural sparsity (est_const_cost) and count-only metrics.
    function infoRow(stepTarget, field, value, denominator = null) {
      return { step_target: stepTarget, field, populated: value, denominator, coverage_pct: null, status: 'INFO' };
    }

    const rows = [];

    if (isCoaChain) {
      // ═══════════════════════════════════════════════════════════
      // CoA chain — scoped subset
      // ═══════════════════════════════════════════════════════════

      // ── CoA applications aggregate ─────────────────────────────
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
          EXTRACT(days FROM NOW() - MAX(last_seen_at))::int                               AS days_since_latest
        FROM coa_applications
      `);
      const coaTotal = parseInt(ca.coa_total, 10) || 0;
      const linkedTotal = parseInt(ca.linked_pop, 10) || 0;
      const lifecyclePhaseTotal = parseInt(ca.lifecycle_phase_pop, 10) || 0;
      // Bug 3: classifier assigns P1/P2 only to unlinked CoA apps — use unlinked count as denom.
      const unlinkedTotal = parseInt(ca.unlinked_total, 10) || 0;
      // F2: use approved_unlinked (actionable denominator) — mirrors permits chain Step 17.
      const approvedUnlinked = parseInt(ca.approved_unlinked, 10) || 0;

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

      // Step: load_coa
      rows.push(coverageRow('CoA Step 2 — load_coa', 'coa_applications.address',            parseInt(ca.address_pop, 10),  coaTotal));
      rows.push(coverageRow('CoA Step 2 — load_coa', 'coa_applications.ward',               parseInt(ca.ward_pop, 10),     coaTotal));
      rows.push(coverageRow('CoA Step 2 — load_coa', 'coa_applications.decision',           parseInt(ca.decision_pop, 10), coaTotal));
      rows.push(coverageRow('CoA Step 2 — load_coa', 'coa_applications.application_number', parseInt(ca.app_num_pop, 10),  coaTotal));

      // Step: assert_coa_freshness
      const daysSince = ca.days_since_latest != null ? parseInt(ca.days_since_latest, 10) : null;
      rows.push(infoRow('CoA Step 3 — assert_coa_freshness', 'coa_applications.days_since_latest', daysSince ?? 0));

      // Step: link_coa
      rows.push(coverageRow('CoA Step 4 — link_coa', 'coa_applications.linked_permit_num', linkedTotal, coaTotal));
      rows.push(coverageRow('CoA Step 4 — link_coa', 'coa_applications.linked_confidence', parseInt(ca.confidence_pop, 10), linkedTotal || null));

      // Step: create_pre_permits
      // F2: denominator = approved CoA apps not yet linked (actionable). Mirrors permits chain Step 17.
      // Ratio can exceed 100% if CoAs get linked after pre-permit creation, but create_pre_permits
      // deactivates pre-permits on linking, so counts converge in practice.
      rows.push(coverageRow('CoA Step 5 — create_pre_permits', 'permits.pre_permit_leads', preTotal, approvedUnlinked || null));

      // Step: assert_pre_permit_aging
      rows.push(infoRow('CoA Step 6 — assert_pre_permit_aging', 'permits.aged_pre_permits_gt18m', parseInt(cm.aged_pre_permits, 10), preTotal));

      // Step: refresh_snapshot
      rows.push(infoRow('CoA Step 7 — refresh_snapshot', 'data_quality_snapshots.today', parseInt(cm.snapshot_today, 10)));

      // Step: assert_data_bounds
      rows.push(infoRow('CoA Step 8 — assert_data_bounds', 'coa_applications.duplicate_pks', parseInt(cm.dup_coa_pks, 10)));

      // Step: assert_engine_health
      rows.push(infoRow('CoA Step 9 — assert_engine_health', 'engine_health_snapshots.today', parseInt(cm.engine_health_today, 10)));

      // Step: classify_lifecycle_phase
      // Bug 3: lifecycle_phase denominator = unlinked CoA apps only (classifier skips linked ones).
      rows.push(coverageRow('CoA Step 10 — classify_lifecycle_phase', 'coa_applications.lifecycle_phase',         lifecyclePhaseTotal,                          unlinkedTotal || null));
      // lifecycle_stalled BOOLEAN NOT NULL DEFAULT false — IS NOT NULL is always vacuous (100%).
      // Show count of actually-stalled classified unlinked apps as an info metric.
      rows.push(infoRow('CoA Step 10 — classify_lifecycle_phase', 'coa_applications.lifecycle_stalled', parseInt(ca.lifecycle_stalled_true_pop, 10), lifecyclePhaseTotal));
      // Bug 3: lifecycle_classified_at denominator = unlinked CoA apps only.
      rows.push(coverageRow('CoA Step 10 — classify_lifecycle_phase', 'coa_applications.lifecycle_classified_at', parseInt(ca.lifecycle_classified_pop, 10),     unlinkedTotal || null));

      // Step: assert_lifecycle_phase_distribution
      rows.push(infoRow('CoA Step 11 — assert_lifecycle_phase_distribution', 'coa_applications.unclassified_count', parseInt(ca.unclassified_count, 10), coaTotal));

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
          COUNT(DISTINCT permit_num) FILTER (WHERE permit_num LIKE 'PRE-%')    AS pre_permit_count
        FROM permits
      `);
      const permitsTotal        = parseInt(pa.permits_total, 10) || 0;
      const geocodedTotal       = parseInt(pa.latitude_pop, 10)  || 0; // permits WHERE latitude IS NOT NULL
      const lifecyclePhaseTotal = parseInt(pa.lifecycle_phase_pop, 10) || 0;
      const staleTotal          = parseInt(pa.stale_total, 10) || 0;

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
      // All columns are NOT NULL in schema — rows serve as integrity sentinels.
      const { rows: [pb] } = await pool.query(`
        SELECT
          COUNT(*)                                                     AS pb_total,
          COUNT(*) FILTER (WHERE is_primary IS NOT NULL)               AS is_primary_pop,
          COUNT(*) FILTER (WHERE structure_type IS NOT NULL)           AS structure_type_pop,
          COUNT(*) FILTER (WHERE match_type IS NOT NULL)               AS match_type_pop,
          COUNT(*) FILTER (WHERE confidence IS NOT NULL)               AS confidence_pop,
          COUNT(*) FILTER (WHERE linked_at IS NOT NULL)                AS linked_at_pop
        FROM parcel_buildings
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
           AND p.phase_started_at IS NOT NULL
           AND p.lifecycle_phase NOT IN ${SKIP_PHASES_SQL}
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

      // Step 4 — classify_permit_phase (Denom A)
      rows.push(coverageRow('Step 4 — classify_permit_phase', 'permits.enriched_status', parseInt(pa.enriched_status_pop, 10), permitsTotal));

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
      rows.push(coverageRow('Step 7 — link_wsib', 'entities.is_wsib_registered',        parseInt(ea.wsib_registered_pop, 10), entitiesTotal));
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

      // Step 17 — create_pre_permits
      // F2: denominator is coa_approved_unlinked (actionable: approved + not yet linked to a real permit).
      // create_pre_permits only creates pre-permits for unlinked CoAs, so this is the correct population.
      // Ratio can theoretically exceed 100% if CoAs are linked after pre-permits are created, but in
      // practice create_pre_permits deactivates pre-permits when CoAs get linked, so counts converge.
      rows.push(coverageRow('Step 17 — create_pre_permits', 'permits.pre_permit_leads', parseInt(pa.pre_permit_count, 10), parseInt(misc.coa_approved_unlinked, 10) || null));

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
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.permits_covered',      parseInt(tfa.forecast_total_permits, 10),      forecastEligible || null));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.predicted_start',      parseInt(tfa.predicted_start_permits, 10),      forecastEligible || null));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.urgency (classified)', parseInt(tfa.urgency_classified_permits, 10),   forecastEligible || null));
      // Denom H (forecast_total rows): row-level field quality.
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.trade_slug',          parseInt(tfa.trade_slug_pop, 10),              forecastTotal || null));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.target_window',       parseInt(tfa.target_window_pop, 10),           forecastTotal || null));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.confidence',          parseInt(tfa.confidence_pop, 10),              forecastTotal || null));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.calibration_method',  parseInt(tfa.calibration_method_pop, 10),      forecastTotal || null));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.sample_size',         parseInt(tfa.sample_size_pop, 10),             forecastTotal || null));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.median_days',         parseInt(tfa.median_days_pop, 10),             forecastTotal || null));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.p25_days',            parseInt(tfa.p25_days_pop, 10),                forecastTotal || null));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.p75_days',            parseInt(tfa.p75_days_pop, 10),                forecastTotal || null));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.opportunity_score',   parseInt(tfa.opportunity_score_pop, 10),        forecastTotal || null));
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
          name: 'Global Data Completeness Profile',
          verdict,
          columns: ['step_target', 'field', 'populated', 'denominator', 'coverage_pct', 'status'],
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
