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
  profiling_coverage_pass_pct: z.number().int().min(0).max(100),
  profiling_coverage_warn_pct: z.number().int().min(0).max(100),
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
          COUNT(*) FILTER (WHERE address IS NOT NULL)                                     AS address_pop,
          COUNT(*) FILTER (WHERE ward IS NOT NULL)                                        AS ward_pop,
          COUNT(*) FILTER (WHERE decision IS NOT NULL)                                    AS decision_pop,
          COUNT(*) FILTER (WHERE application_number IS NOT NULL)                          AS app_num_pop,
          COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL)                           AS linked_pop,
          COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL AND linked_confidence IS NOT NULL) AS confidence_pop,
          COUNT(*) FILTER (WHERE decision = 'Approved' AND linked_permit_num IS NULL)     AS approved_unlinked,
          COUNT(*) FILTER (WHERE lifecycle_phase IS NOT NULL)                              AS lifecycle_phase_pop,
          COUNT(*) FILTER (WHERE lifecycle_phase IS NOT NULL AND lifecycle_stalled IS NOT NULL) AS lifecycle_stalled_pop,
          COUNT(*) FILTER (WHERE lifecycle_classified_at IS NOT NULL)                     AS lifecycle_classified_pop,
          COUNT(*) FILTER (WHERE lifecycle_phase IS NULL)                                 AS unclassified_count,
          EXTRACT(days FROM NOW() - MAX(created_at))::int                                 AS days_since_latest
        FROM coa_applications
      `);
      const coaTotal = parseInt(ca.coa_total, 10) || 0;
      const linkedTotal = parseInt(ca.linked_pop, 10) || 0;
      const lifecyclePhaseTotal = parseInt(ca.lifecycle_phase_pop, 10) || 0;

      // ── Misc CoA metrics ───────────────────────────────────────
      const { rows: [cm] } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE permit_num LIKE 'PRE-%')                                  AS pre_permit_total,
          COUNT(*) FILTER (WHERE permit_num LIKE 'PRE-%' AND issued_date < NOW() - INTERVAL '18 months') AS aged_pre_permits,
          (SELECT COUNT(*) FROM data_quality_snapshots WHERE snapshot_date = CURRENT_DATE) AS snapshot_today,
          (SELECT COUNT(*) FROM engine_health_snapshots WHERE captured_at > NOW() - INTERVAL '25 hours') AS engine_health_today,
          (SELECT COUNT(*) FROM (
            SELECT application_number, COUNT(*) FROM coa_applications GROUP BY 1 HAVING COUNT(*) > 1
          ) sub)                                                                             AS dup_coa_pks
        FROM permits
      `);
      const preTotal = parseInt(cm.pre_permit_total, 10) || 0;
      const approvedUnlinked = parseInt(ca.approved_unlinked, 10) || 0;

      // Step: assert_schema (CoA)
      const { rows: [csSchema] } = await pool.query(`
        SELECT COUNT(*) AS cols FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'coa_applications'
      `);
      rows.push(infoRow('CoA Step 1 — assert_schema', 'coa_applications.columns_present', parseInt(csSchema.cols, 10)));

      // Step: load_coa
      rows.push(coverageRow('CoA Step 2 — load_coa', 'coa_applications.address', parseInt(ca.address_pop, 10), coaTotal));
      rows.push(coverageRow('CoA Step 2 — load_coa', 'coa_applications.ward', parseInt(ca.ward_pop, 10), coaTotal));
      rows.push(coverageRow('CoA Step 2 — load_coa', 'coa_applications.decision', parseInt(ca.decision_pop, 10), coaTotal));
      rows.push(coverageRow('CoA Step 2 — load_coa', 'coa_applications.application_number', parseInt(ca.app_num_pop, 10), coaTotal));

      // Step: assert_coa_freshness
      const daysSince = ca.days_since_latest != null ? parseInt(ca.days_since_latest, 10) : null;
      rows.push(infoRow('CoA Step 3 — assert_coa_freshness', 'coa_applications.days_since_latest', daysSince ?? 0));

      // Step: link_coa
      rows.push(coverageRow('CoA Step 4 — link_coa', 'coa_applications.linked_permit_num', linkedTotal, coaTotal));
      rows.push(coverageRow('CoA Step 4 — link_coa', 'coa_applications.linked_confidence', parseInt(ca.confidence_pop, 10), linkedTotal));

      // Step: create_pre_permits
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
      rows.push(coverageRow('CoA Step 10 — classify_lifecycle_phase', 'coa_applications.lifecycle_phase', lifecyclePhaseTotal, coaTotal));
      rows.push(coverageRow('CoA Step 10 — classify_lifecycle_phase', 'coa_applications.lifecycle_stalled', parseInt(ca.lifecycle_stalled_pop, 10), lifecyclePhaseTotal));
      rows.push(coverageRow('CoA Step 10 — classify_lifecycle_phase', 'coa_applications.lifecycle_classified_at', parseInt(ca.lifecycle_classified_pop, 10), coaTotal));

      // Step: assert_lifecycle_phase_distribution
      rows.push(infoRow('CoA Step 11 — assert_lifecycle_phase_distribution', 'coa_applications.unclassified_count', parseInt(ca.unclassified_count, 10), coaTotal));

    } else {
      // ═══════════════════════════════════════════════════════════
      // Permits chain — full profile
      // ═══════════════════════════════════════════════════════════

      // ── Permits table aggregate ────────────────────────────────
      // Single query with FILTER expressions for all permits.* fields.
      const { rows: [pa] } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%')                                              AS total,
          -- Step 2 — load_permits
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND description IS NOT NULL)                  AS description_pop,
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND builder_name IS NOT NULL)                 AS builder_name_pop,
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND est_const_cost IS NOT NULL)               AS est_cost_pop,
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND issued_date IS NOT NULL)                  AS issued_date_pop,
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND geo_id IS NOT NULL AND geo_id != '' AND geo_id ~ '^[0-9]+$') AS geo_id_pop,
          -- Step 3 — close_stale_permits
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND status IN ('Pending Closed','Closed'))    AS stale_total,
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND completed_date IS NOT NULL)               AS completed_date_pop,
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%'
            AND status IN ('Pending Closed','Closed') AND completed_date IS NOT NULL)                      AS stale_with_date,
          -- Step 4 — classify_permit_phase
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND enriched_status IS NOT NULL)              AS enriched_status_pop,
          -- Step 5 — classify_scope
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND project_type IS NOT NULL)                 AS project_type_pop,
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND array_length(scope_tags, 1) IS NOT NULL)  AS scope_tags_pop,
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND scope_classified_at IS NOT NULL)          AS scope_classified_pop,
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND scope_source IS NOT NULL)                 AS scope_source_pop,
          -- Step 8 — geocode_permits (denominator = permits with numeric geo_id, mirrors geocode-permits.js line 80-82)
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND geo_id IS NOT NULL AND geo_id != '' AND geo_id ~ '^[0-9]+$') AS geocodeable_total,
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND latitude IS NOT NULL)                     AS lat_pop,
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND longitude IS NOT NULL)                    AS lng_pop,
          -- Step 9 — link_parcels denominator (geocoded real permits)
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND latitude IS NOT NULL)                     AS geocoded_total,
          -- Step 10 — link_neighbourhoods
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%'
            AND neighbourhood_id IS NOT NULL AND neighbourhood_id != -1)                                   AS neighbourhood_pop,
          -- Step 12 — link_similar (proxy: non-BLD permit scope propagation)
          -- Denominator over-counts: only permits with a BLD companion with scope_tags are actually populated.
          -- Coverage % will read conservatively low; this is intentional and expected.
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND permit_type != 'BLD')                     AS non_bld_total,
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND permit_type != 'BLD'
            AND array_length(scope_tags, 1) IS NOT NULL)                                                   AS non_bld_scope_pop,
          -- Step 21 — classify_lifecycle_phase
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND lifecycle_phase IS NOT NULL)              AS lifecycle_phase_pop,
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%'
            AND lifecycle_phase IS NOT NULL AND phase_started_at IS NOT NULL)                              AS phase_started_pop,
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND lifecycle_classified_at IS NOT NULL)      AS lifecycle_classified_pop,
          -- Step 22 — assert_lifecycle_phase_distribution
          COUNT(*) FILTER (WHERE permit_num NOT LIKE 'PRE-%' AND lifecycle_phase IS NULL)                  AS unclassified_count,
          -- PRE-% pre-permit leads (Step 17)
          COUNT(*) FILTER (WHERE permit_num LIKE 'PRE-%')                                                  AS pre_permit_count
        FROM permits
      `);
      const permitsTotal = parseInt(pa.total, 10) || 0;
      const geocodeableTotal = parseInt(pa.geocodeable_total, 10) || 0;
      const geocodedTotal = parseInt(pa.geocoded_total, 10) || 0;
      const lifecyclePhaseTotal = parseInt(pa.lifecycle_phase_pop, 10) || 0;
      const staleTotal = parseInt(pa.stale_total, 10) || 0;

      // ── Entities aggregate ─────────────────────────────────────
      const { rows: [ea] } = await pool.query(`
        SELECT
          COUNT(*)                                                  AS entities_total,
          COUNT(*) FILTER (WHERE primary_phone IS NOT NULL)         AS phone_pop,
          COUNT(*) FILTER (WHERE primary_email IS NOT NULL)         AS email_pop,
          COUNT(*) FILTER (WHERE is_wsib_registered = true)         AS wsib_registered_pop
        FROM entities
      `);
      const entitiesTotal = parseInt(ea.entities_total, 10) || 0;

      // Denominator: distinct non-null builder_names in permits.
      // Numerator: how many of those names actually have a matching entity row
      // (LEFT JOIN to avoid inflating with entities from other sources).
      const { rows: [bnd] } = await pool.query(`
        SELECT
          COUNT(DISTINCT p.builder_name)    AS builder_name_total,
          COUNT(DISTINCT e.name_normalized) AS matched_builder_names
        FROM permits p
        LEFT JOIN entities e ON e.name_normalized = p.builder_name
        WHERE p.builder_name IS NOT NULL AND p.permit_num NOT LIKE 'PRE-%'
      `);
      const builderNameTotal = parseInt(bnd.builder_name_total, 10) || 0;
      const matchedBuilderNames = parseInt(bnd.matched_builder_names, 10) || 0;

      // ── WSIB registry aggregate ────────────────────────────────
      const { rows: [wa] } = await pool.query(`
        SELECT
          COUNT(*)                                                              AS wsib_total,
          COUNT(*) FILTER (WHERE linked_entity_id IS NOT NULL)                  AS linked_pop,
          COUNT(*) FILTER (WHERE linked_entity_id IS NOT NULL
            AND match_confidence IS NOT NULL)                                   AS confidence_pop
        FROM wsib_registry
      `);
      const wsibTotal = parseInt(wa.wsib_total, 10) || 0;

      // ── Cross-table aggregate (sub-selects for per-table counts) ───────────
      const { rows: [misc] } = await pool.query(`
        SELECT
          (SELECT COUNT(DISTINCT permit_num || '--' || revision_num)
             FROM permit_parcels
            WHERE permit_num NOT LIKE 'PRE-%')                                  AS parcels_linked_permits,
          (SELECT COUNT(DISTINCT parcel_id) FROM parcel_buildings)              AS massing_linked_parcels,
          (SELECT COUNT(*) FROM parcels
            WHERE centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL)        AS parcels_with_centroid,
          (SELECT COUNT(DISTINCT permit_num || '--' || revision_num)
             FROM permit_trades
            WHERE is_active = true AND permit_num NOT LIKE 'PRE-%')             AS active_trade_permits,
          (SELECT COUNT(*) FROM cost_estimates
            WHERE permit_num NOT LIKE 'PRE-%' AND estimated_cost IS NOT NULL)  AS est_cost_pop,
          (SELECT COUNT(*) FROM phase_calibration
            WHERE median_days IS NOT NULL)                                      AS calibration_rows,
          (SELECT COUNT(*) FROM coa_applications
            WHERE linked_permit_num IS NOT NULL)                                AS coa_linked_pop,
          (SELECT COUNT(*) FROM coa_applications)                               AS coa_total,
          (SELECT COUNT(*) FROM coa_applications
            WHERE lifecycle_phase IS NOT NULL)                                  AS coa_lifecycle_phase_pop,
          (SELECT COUNT(*) FROM coa_applications
            WHERE decision = 'Approved' AND linked_permit_num IS NULL)          AS coa_approved_unlinked,
          (SELECT COUNT(*) FROM tracked_projects WHERE status != 'archived')    AS tracked_active,
          (SELECT COUNT(*) FROM tracked_projects)                               AS tracked_total,
          (SELECT COUNT(*) FROM lead_analytics)                                 AS lead_analytics_total,
          (SELECT COUNT(*) FROM data_quality_snapshots
            WHERE snapshot_date = CURRENT_DATE)                                 AS snapshot_today,
          (SELECT COUNT(*) FROM engine_health_snapshots
            WHERE captured_at > NOW() - INTERVAL '25 hours')                   AS engine_health_today,
          (SELECT COUNT(*) FROM (
            SELECT permit_num, revision_num FROM permits
             GROUP BY 1, 2 HAVING COUNT(*) > 1
          ) sub)                                                                AS dup_permit_pks
      `);

      // ── Trade forecasts aggregate ──────────────────────────────
      // Denominator mirrors the effective filter of compute-trade-forecasts.js:
      //   JOIN permit_trades pt ON pt.is_active = true
      //   WHERE lifecycle_phase IS NOT NULL
      //     AND phase_started_at IS NOT NULL
      //     AND lifecycle_phase NOT IN SKIP_PHASES  ← applied in JS in source, applied in SQL here
      // PRE-% exclusion is a defensive guard — P1/P2 in SKIP_PHASES already excludes them in practice.
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

      // Forecast output metrics
      const { rows: [tfa] } = await pool.query(`
        SELECT
          COUNT(*)                                                                   AS forecast_total,
          COUNT(*) FILTER (WHERE predicted_start IS NOT NULL)                        AS predicted_start_pop,
          COUNT(*) FILTER (WHERE urgency IS NOT NULL)                                AS urgency_pop,
          -- opportunity_score denominator mirrors compute-opportunity-scores.js WHERE clause exactly
          COUNT(*) FILTER (WHERE urgency IS NULL OR urgency <> 'expired')            AS opp_score_denom,
          COUNT(*) FILTER (WHERE (urgency IS NULL OR urgency <> 'expired')
            AND opportunity_score > 0)                                               AS opp_score_pop
        FROM trade_forecasts
        WHERE permit_num NOT LIKE 'PRE-%'
      `);
      const forecastTotal = parseInt(tfa.forecast_total, 10) || 0;
      const oppScoreDenom = parseInt(tfa.opp_score_denom, 10) || 0;

      // ── Permits columns (Step 1 — assert_schema INFO) ──────────
      const { rows: [pSchema] } = await pool.query(`
        SELECT COUNT(*) AS cols FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'permits'
      `);

      // ═══════════════════════════════════════════════════════════
      // Build rows — permits chain full profile
      // ═══════════════════════════════════════════════════════════

      // Step 1 — assert_schema
      rows.push(infoRow('Step 1 — assert_schema', 'permits.columns_present', parseInt(pSchema.cols, 10)));

      // Step 2 — load_permits
      rows.push(coverageRow('Step 2 — load_permits', 'permits.description',     parseInt(pa.description_pop, 10),  permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.builder_name',    parseInt(pa.builder_name_pop, 10), permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.est_const_cost',  parseInt(pa.est_cost_pop, 10),     permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.issued_date',     parseInt(pa.issued_date_pop, 10),  permitsTotal));
      rows.push(coverageRow('Step 2 — load_permits', 'permits.geo_id',          parseInt(pa.geo_id_pop, 10),       permitsTotal));

      // Step 3 — close_stale_permits
      rows.push(infoRow('Step 3 — close_stale_permits', 'permits.status (stale total)', staleTotal, permitsTotal));
      rows.push(coverageRow('Step 3 — close_stale_permits', 'permits.completed_date', parseInt(pa.stale_with_date, 10), staleTotal));

      // Step 4 — classify_permit_phase
      rows.push(coverageRow('Step 4 — classify_permit_phase', 'permits.enriched_status', parseInt(pa.enriched_status_pop, 10), permitsTotal));

      // Step 5 — classify_scope
      rows.push(coverageRow('Step 5 — classify_scope', 'permits.project_type',      parseInt(pa.project_type_pop, 10),    permitsTotal));
      rows.push(coverageRow('Step 5 — classify_scope', 'permits.scope_tags',         parseInt(pa.scope_tags_pop, 10),       permitsTotal));
      rows.push(coverageRow('Step 5 — classify_scope', 'permits.scope_classified_at', parseInt(pa.scope_classified_pop, 10), permitsTotal));
      rows.push(coverageRow('Step 5 — classify_scope', 'permits.scope_source',       parseInt(pa.scope_source_pop, 10),    permitsTotal));

      // Step 6 — extract_builders
      rows.push(coverageRow('Step 6 — extract_builders', 'entities.name_normalized', matchedBuilderNames, builderNameTotal));
      rows.push(coverageRow('Step 6 — extract_builders', 'entities.primary_phone',   parseInt(ea.phone_pop, 10),          entitiesTotal));
      rows.push(coverageRow('Step 6 — extract_builders', 'entities.primary_email',   parseInt(ea.email_pop, 10),          entitiesTotal));

      // Step 7 — link_wsib
      rows.push(coverageRow('Step 7 — link_wsib', 'entities.is_wsib_registered',       parseInt(ea.wsib_registered_pop, 10), entitiesTotal));
      rows.push(coverageRow('Step 7 — link_wsib', 'wsib_registry.linked_entity_id',    parseInt(wa.linked_pop, 10),          wsibTotal));
      rows.push(coverageRow('Step 7 — link_wsib', 'wsib_registry.match_confidence',    parseInt(wa.confidence_pop, 10),      parseInt(wa.linked_pop, 10) || null));

      // Step 8 — geocode_permits (denominator = permits with valid geo_id)
      rows.push(coverageRow('Step 8 — geocode_permits', 'permits.latitude',  parseInt(pa.lat_pop, 10), geocodeableTotal));
      rows.push(coverageRow('Step 8 — geocode_permits', 'permits.longitude', parseInt(pa.lng_pop, 10), geocodeableTotal));

      // Step 9 — link_parcels (denominator = geocoded real permits)
      rows.push(coverageRow('Step 9 — link_parcels', 'permit_parcels.linked_permits', parseInt(misc.parcels_linked_permits, 10), geocodedTotal));

      // Step 10 — link_neighbourhoods
      rows.push(coverageRow('Step 10 — link_neighbourhoods', 'permits.neighbourhood_id', parseInt(pa.neighbourhood_pop, 10), permitsTotal));

      // Step 11 — link_massing (denominator = parcels with centroid, NOT permits)
      rows.push(coverageRow('Step 11 — link_massing', 'parcel_buildings.linked_parcels', parseInt(misc.massing_linked_parcels, 10), parseInt(misc.parcels_with_centroid, 10) || null));

      // Step 12 — link_similar (proxy: non-BLD permits with scope_tags propagated)
      rows.push(coverageRow('Step 12 — link_similar', 'permits.scope_tags (non-BLD)', parseInt(pa.non_bld_scope_pop, 10), parseInt(pa.non_bld_total, 10) || null));

      // Step 13 — classify_permits
      rows.push(coverageRow('Step 13 — classify_permits', 'permit_trades.active_per_permit', parseInt(misc.active_trade_permits, 10), permitsTotal));

      // Step 14 — compute_cost_estimates
      rows.push(coverageRow('Step 14 — compute_cost_estimates', 'cost_estimates.estimated_cost', parseInt(misc.est_cost_pop, 10), permitsTotal));

      // Step 15 — compute_timing_calibration_v2
      rows.push(infoRow('Step 15 — compute_timing_calibration_v2', 'phase_calibration.rows_with_median', parseInt(misc.calibration_rows, 10)));

      // Step 16 — link_coa
      const coaTotal = parseInt(misc.coa_total, 10) || 0;
      rows.push(coverageRow('Step 16 — link_coa', 'coa_applications.linked_permit_num', parseInt(misc.coa_linked_pop, 10), coaTotal));

      // Step 17 — create_pre_permits
      const approvedUnlinked = parseInt(misc.coa_approved_unlinked, 10) || 0;
      rows.push(coverageRow('Step 17 — create_pre_permits', 'permits.pre_permit_leads', parseInt(pa.pre_permit_count, 10), approvedUnlinked || null));

      // Step 18 — refresh_snapshot
      rows.push(infoRow('Step 18 — refresh_snapshot', 'data_quality_snapshots.today', parseInt(misc.snapshot_today, 10)));

      // Step 19 — assert_data_bounds
      rows.push(infoRow('Step 19 — assert_data_bounds', 'permits.duplicate_pks', parseInt(misc.dup_permit_pks, 10)));

      // Step 20 — assert_engine_health
      rows.push(infoRow('Step 20 — assert_engine_health', 'engine_health_snapshots.today', parseInt(misc.engine_health_today, 10)));

      // Step 21 — classify_lifecycle_phase (permits)
      rows.push(coverageRow('Step 21 — classify_lifecycle_phase', 'permits.lifecycle_phase',         lifecyclePhaseTotal,                                permitsTotal));
      rows.push(coverageRow('Step 21 — classify_lifecycle_phase', 'permits.phase_started_at',         parseInt(pa.phase_started_pop, 10),                 lifecyclePhaseTotal));
      rows.push(coverageRow('Step 21 — classify_lifecycle_phase', 'permits.lifecycle_classified_at',  parseInt(pa.lifecycle_classified_pop, 10),           permitsTotal));
      rows.push(coverageRow('Step 21 — classify_lifecycle_phase', 'coa_applications.lifecycle_phase', parseInt(misc.coa_lifecycle_phase_pop, 10),           coaTotal || null));

      // Step 22 — assert_lifecycle_phase_distribution
      rows.push(infoRow('Step 22 — assert_lifecycle_phase_distribution', 'permits.unclassified_count', parseInt(pa.unclassified_count, 10), permitsTotal));

      // Step 23 — compute_trade_forecasts (denominator mirrors SOURCE_SQL exactly)
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.predicted_start', parseInt(tfa.predicted_start_pop, 10), forecastEligible));
      rows.push(coverageRow('Step 23 — compute_trade_forecasts', 'trade_forecasts.urgency',         parseInt(tfa.urgency_pop, 10),          forecastTotal));

      // Step 24 — compute_opportunity_scores (denominator mirrors compute-opportunity-scores.js WHERE clause)
      rows.push(coverageRow('Step 24 — compute_opportunity_scores', 'trade_forecasts.opportunity_score', parseInt(tfa.opp_score_pop, 10), oppScoreDenom));

      // Step 25 — update_tracked_projects
      const trackedTotal = parseInt(misc.tracked_total, 10) || 0;
      const trackedActive = parseInt(misc.tracked_active, 10) || 0;
      rows.push(infoRow('Step 25 — update_tracked_projects', 'tracked_projects.active',  trackedActive, trackedTotal));
      rows.push(infoRow('Step 25 — update_tracked_projects', 'lead_analytics.rows',      parseInt(misc.lead_analytics_total, 10), trackedActive || null));

      // Step 26 — assert_entity_tracing (INFO: last run verdict from pipeline_runs)
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
