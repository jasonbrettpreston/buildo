/**
 * SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md (owning spec, §3 "Refresh Snapshot")
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 (RECORDER), GAP-2
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 1 nothing hidden, Rule 2
 *            compute is JUST compute, Rule 10 row-derived verdict)
 *
 * Pilot 8 — `refresh_snapshot`'s compute: the WF3-F1 query builders (verbatim, G2's
 * "verbatim" guarantee — 8cc99c78's own 3-part consolidated shape), the read PLAN
 * `runRecorderPhase` executes (Fold B RULING, LG-26), the row-assembly + write-SQL
 * authoring (LG-27's `guarded_upsert`/`set_source:"compute"`), and the pure check
 * observers. NO fs/pg/pipeline require, NO process.argv/process.env, opens NO pool —
 * Rule 2. Every read this file's `buildReads()` declares is executed by THE RUNNER,
 * never by this file — `compute.buildReads()` returns SQL TEXT only.
 *
 * RS-D1 (Finding 4, the phase-ternary defect) is CLOSED structurally, not in this
 * file: the old `chainId === 'sources' ? 13 : chainId === 'coa' ? 7 : 18` ternary
 * (a `process.env` read — itself a Rule-2 violation this conversion retires) is
 * replaced by the descriptor's own `sharing.varies_by_chain.phase` map, read
 * generically by the shared audit-table builder — this file never derives a phase.
 *
 * RS-D2 (Finding 5, Ask 1 — operator ruling FIX) is fixed HERE: `costEst`'s failure
 * path now carries forward the PRIOR `data_quality_snapshots` row's own 4 written
 * columns (mirroring massing/schemaColumnCounts/sla/inspections, which already did
 * this pre-conversion); `coaFunnel`'s failure path carries forward the PRIOR RUN's
 * own reported audit-row values (`prior.audit_table.rows`) — `coaFunnel`'s fields
 * are audit/telemetry only (never written to `data_quality_snapshots`, confirmed:
 * none of its 7 fields appear in the 68-column write list), so "the previous
 * snapshot row" has no matching columns to carry forward from; the last RUN's own
 * reported numbers are the correct, available carry-forward source instead.
 */
'use strict';

const { safeParsePositiveInt, safeParseFloat } = require('../safe-math');

// WF3 F1 (2026-08-15, Spec 118 §1/§7.1): the single source of truth for "an active
// permit" across every consolidated query below. Verbatim-ported from
// scripts/refresh-snapshot.js (pre-conversion) — see that file's own git history
// (8cc99c78) for the full pathology writeup this shape fixes.
//
// THE DECISION RESTS ON THE OBSERVED I/O PATTERN, NOT THE PLANNER'S COST ESTIMATE:
// the pre-fix queries measured a stale correlation statistic that made an
// index-fetch plan look cheapest right up until the heap's physical order stopped
// matching `status` (73% of permits index-fetched, 3min -> 64min). The fix is not
// "make the query faster" but "make the query's SHAPE immune to that statistic" —
// buildPermitsScalarQuery/buildTagBreakdownQuery's missing top-level WHERE forces a
// deterministic Parallel Seq Scan regardless of what pg_stats.correlation says
// today; buildTradeByTypeQuery keeps its JOIN shape unchanged but runs under
// `enable_indexscan = off` (declared as this file's own `guc` field in
// buildReads(), executed by the runner) for the same reason.
const ACTIVE_PERMIT_STATUSES = ['Permit Issued', 'Revision Issued', 'Under Review', 'Inspection', 'Examination'];
const CORE_SCOPE_TAGS = new Set(['residential', 'commercial', 'mixed-use']);

/** T1/T2 — the CoA confidence thresholds (R-G, `on_invalid:"fail"`). */
const T1_VAR = 'snapshot_coa_conf_high';
const T2_VAR = 'coa_match_conf_medium';

const TABLE = 'data_quality_snapshots';

/**
 * ① Consolidates the 10 scalar (non-GROUP-BY) permits.status-scoped aggregate
 * queries into a single no-WHERE pass — verbatim port, unchanged since 8cc99c78.
 * @returns {{ sql: string, params: [string[]] }}
 */
function buildPermitsScalarQuery() {
  return {
    sql: `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = ANY($1)) AS active,
        COUNT(*) FILTER (WHERE builder_name IS NOT NULL AND builder_name != '') AS permits_with_builder,
        COUNT(*) FILTER (WHERE neighbourhood_id IS NOT NULL AND neighbourhood_id != -1 AND status = ANY($1)) AS neighbourhood_count,
        COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) AS geocoded_count,
        COUNT(*) FILTER (WHERE ('residential' = ANY(scope_tags) OR 'commercial' = ANY(scope_tags) OR 'mixed-use' = ANY(scope_tags))
          AND status = ANY($1)) AS scope_count,
        COUNT(*) FILTER (WHERE scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0 AND status = ANY($1)) AS scope_tags_count,
        COUNT(*) FILTER (WHERE scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0 AND status = ANY($1)
          AND EXISTS (SELECT 1 FROM unnest(scope_tags) AS t WHERE t NOT IN ('residential', 'commercial', 'mixed-use'))) AS detailed_tags_count,
        COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '24 hours') AS updated_24h,
        COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '7 days') AS updated_7d,
        COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '30 days') AS updated_30d,
        COUNT(*) FILTER (WHERE (description IS NULL OR description = '') AND status = ANY($1)) AS null_description,
        COUNT(*) FILTER (WHERE (builder_name IS NULL OR builder_name = '') AND status = ANY($1)) AS null_builder_name,
        COUNT(*) FILTER (WHERE est_const_cost IS NULL AND status = ANY($1)) AS null_est_const_cost,
        COUNT(*) FILTER (WHERE (street_num IS NULL OR street_num = '') AND status = ANY($1)) AS null_street_num,
        COUNT(*) FILTER (WHERE (street_name IS NULL OR street_name = '') AND status = ANY($1)) AS null_street_name,
        COUNT(*) FILTER (WHERE (geo_id IS NULL OR geo_id = '') AND status = ANY($1)) AS null_geo_id,
        COUNT(*) FILTER (WHERE est_const_cost IS NOT NULL AND (est_const_cost < 100 OR est_const_cost > 1000000000)
          AND status = ANY($1)) AS cost_oor,
        COUNT(*) FILTER (WHERE issued_date > NOW() AND status = ANY($1)) AS future_issued,
        COUNT(*) FILTER (WHERE (status IS NULL OR status = '') AND status = ANY($1)) AS missing_status
      FROM permits`,
    params: [ACTIVE_PERMIT_STATUSES],
  };
}

/**
 * ② Consolidates the 2 GROUP BY scope_tags queries into a single pass over one
 * CTE — verbatim port, unchanged since 8cc99c78.
 * @returns {{ sql: string, params: [string[]] }}
 */
function buildTagBreakdownQuery() {
  return {
    sql: `WITH tagged AS (
        SELECT unnest(scope_tags) AS tag
        FROM permits
        WHERE scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0
          AND (status = ANY($1)) IS TRUE
      )
      SELECT tag, COUNT(*) AS count
      FROM tagged
      GROUP BY tag
      ORDER BY count DESC`,
    params: [ACTIVE_PERMIT_STATUSES],
  };
}

/**
 * ③ tradeByTypeRes — same JOIN shape as pre-conversion; executed by the runner
 * under `enable_indexscan = off` (declared via this step's own `guc` field in
 * `buildReads()` below, not embedded in this SQL text).
 * @returns {{ sql: string, params: [string[]] }}
 */
function buildTradeByTypeQuery() {
  return {
    sql: `SELECT
        COUNT(DISTINCT p.permit_num) FILTER (
          WHERE 'residential' = ANY(p.scope_tags) AND pt.permit_num IS NOT NULL
        ) as res_classified,
        COUNT(DISTINCT p.permit_num) FILTER (
          WHERE 'residential' = ANY(p.scope_tags)
        ) as res_total,
        COUNT(DISTINCT p.permit_num) FILTER (
          WHERE ('commercial' = ANY(p.scope_tags) OR 'mixed-use' = ANY(p.scope_tags))
            AND pt.permit_num IS NOT NULL
        ) as com_classified,
        COUNT(DISTINCT p.permit_num) FILTER (
          WHERE ('commercial' = ANY(p.scope_tags) OR 'mixed-use' = ANY(p.scope_tags))
        ) as com_total
      FROM permits p
      LEFT JOIN (SELECT DISTINCT permit_num FROM permit_trades) pt
        ON pt.permit_num = p.permit_num
      WHERE p.status = ANY($1)`,
    params: [ACTIVE_PERMIT_STATUSES],
  };
}

/**
 * Splits `buildTagBreakdownQuery()`'s merged rows back into the two shapes the
 * write target's columns expect — verbatim port, unchanged since 8cc99c78.
 * @param {Array<{ tag: string, count: string|number }>} rows
 * @returns {{ breakdown: Record<string, number>, tagsTop: Record<string, number> }}
 */
function splitTagBreakdown(rows) {
  const breakdown = {};
  const tagsTop = {};
  let topCount = 0;
  for (const r of rows) {
    const cnt = safeParsePositiveInt(r.count, 'count');
    if (CORE_SCOPE_TAGS.has(r.tag)) {
      breakdown[r.tag] = cnt;
    } else if (topCount < 10) {
      tagsTop[r.tag] = cnt;
      topCount++;
    }
  }
  return { breakdown, tagsTop };
}

/**
 * THE READ PLAN — `runRecorderPhase` (LG-26) executes every statement here; this
 * function only authors SQL text (Rule 2). `main` runs sequentially on one pinned
 * REPEATABLE READ READ ONLY client (WF3 F1's own point-in-time-consistency
 * guarantee); `optional` runs via plain reads, independently caught, each with a
 * generic prior-row carry-forward on failure (RS-D2).
 * @param {Record<string, number>} config
 */
function buildReads(config) {
  const snapshotCoaConfHigh = config[T1_VAR];
  const coaConfMedium = config[T2_VAR];
  const permitsScalar = buildPermitsScalarQuery();
  const tagBreakdown = buildTagBreakdownQuery();
  const tradeByType = buildTradeByTypeQuery();
  return {
    main: [
      { key: 'permitsScalar', sql: permitsScalar.sql, params: permitsScalar.params },
      {
        key: 'trades',
        sql: `SELECT COUNT(DISTINCT (permit_num, revision_num)) as permits_with_trades,
              COUNT(*) as total_matches,
              AVG(confidence)::NUMERIC(4,3) as avg_confidence,
              COUNT(*) FILTER (WHERE tier = 1) as tier1,
              COUNT(*) FILTER (WHERE tier = 2) as tier2,
              COUNT(*) FILTER (WHERE tier = 3) as tier3
       FROM permit_trades`,
        params: [],
      },
      {
        key: 'tradeByType',
        sql: tradeByType.sql,
        params: tradeByType.params,
        // WF3 F1 ③ — the same JOIN shape, plan-forced immune to the stale
        // correlation statistic by disabling index scans on this ONE query,
        // on the pinned client only, reset immediately after (verbatim shape).
        guc: { set: 'SET enable_indexscan = off', reset: 'RESET enable_indexscan' },
      },
      {
        key: 'builders',
        sql: `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE last_enriched_at IS NOT NULL) as enriched,
              COUNT(*) FILTER (WHERE primary_phone IS NOT NULL) as with_phone,
              COUNT(*) FILTER (WHERE primary_email IS NOT NULL) as with_email,
              COUNT(*) FILTER (WHERE website IS NOT NULL) as with_website,
              COUNT(*) FILTER (WHERE google_place_id IS NOT NULL) as with_google,
              COUNT(*) FILTER (WHERE is_wsib_registered = true) as with_wsib
       FROM entities`,
        params: [],
      },
      {
        // WF1 #parcel-address-bridge Phase 2f.3 (2026-05-23) — exact_matches
        // FILTER rolls up BOTH legacy 'exact_address' AND new
        // 'address_points_exact' rows (94abd192, preserved-in-compute, §2).
        key: 'parcels',
        sql: `SELECT COUNT(DISTINCT (permit_num, revision_num)) as permits_with_parcel,
              COUNT(*) FILTER (WHERE match_type IN ('exact_address', 'address_points_exact')) as exact_matches,
              COUNT(*) FILTER (WHERE match_type = 'name_only') as name_matches,
              COUNT(*) FILTER (WHERE match_type = 'spatial') as spatial_matches,
              AVG(confidence)::NUMERIC(4,3) as avg_confidence
       FROM permit_parcels`,
        params: [],
      },
      {
        key: 'coa',
        sql: `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL) as linked,
              AVG(linked_confidence) FILTER (WHERE linked_permit_num IS NOT NULL)::NUMERIC(4,3) as avg_confidence,
              COUNT(*) FILTER (WHERE linked_confidence >= $1) as high_confidence,
              COUNT(*) FILTER (WHERE linked_confidence IS NOT NULL AND linked_confidence < $2) as low_confidence
       FROM coa_applications`,
        params: [snapshotCoaConfHigh, coaConfMedium],
      },
      { key: 'tagBreakdown', sql: tagBreakdown.sql, params: tagBreakdown.params },
      {
        key: 'sync',
        sql: `SELECT started_at, status FROM sync_runs ORDER BY started_at DESC LIMIT 1`,
        params: [],
      },
    ],
    optional: [
      {
        key: 'massing',
        sql: `SELECT (SELECT COUNT(*) FROM building_footprints) as footprints_total,
              (SELECT COUNT(DISTINCT parcel_id) FROM parcel_buildings) as parcels_with_buildings`,
        params: [],
      },
      {
        key: 'schemaColumnCounts',
        sql: `SELECT table_name, COUNT(*)::text as col_count
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('permits', 'builders', 'coa_applications', 'parcels', 'permit_trades', 'permit_parcels')
       GROUP BY table_name ORDER BY table_name`,
        params: [],
      },
      {
        key: 'sla',
        sql: `SELECT EXTRACT(EPOCH FROM (NOW() - MAX(first_seen_at))) / 3600 as hours FROM permits`,
        params: [],
      },
      {
        key: 'inspections',
        sql: `SELECT
         COUNT(*) as total,
         COUNT(DISTINCT permit_num) as permits_scraped,
         COUNT(*) FILTER (WHERE status = 'Outstanding') as outstanding,
         COUNT(*) FILTER (WHERE status = 'Passed') as passed,
         COUNT(*) FILTER (WHERE status = 'Not Passed') as not_passed
       FROM permit_inspections`,
        params: [],
      },
      {
        // RS-D2 (Ask 1, FIX): on failure, the runner carries forward the PRIOR
        // data_quality_snapshots row's own 4 cost_estimates_* columns — the file's
        // own declared policy (fd14dc53's carry-forward comment), which this block
        // did not previously follow.
        key: 'costEst',
        sql: `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE cost_source = 'permit') as from_permit,
              COUNT(*) FILTER (WHERE cost_source IN ('model', 'geometric',
                'archetype_declared_area', 'archetype_parcel', 'archetype_rate')) as from_model,
              COUNT(*) FILTER (WHERE cost_source LIKE 'archetype\\_%') as from_archetype,
              COUNT(*) FILTER (WHERE estimated_cost IS NULL) as null_cost
       FROM cost_estimates`,
        params: [],
      },
      {
        // RS-D2 (Ask 1, FIX): on failure, the runner carries forward the PRIOR
        // RUN's own reported audit-row values (coaFunnel's fields are audit/
        // telemetry only — never written to data_quality_snapshots — so the
        // previous snapshot ROW has no matching columns; the prior RUN's own
        // records_meta is the correct carry-forward source instead).
        key: 'coaFunnel',
        sql: `WITH base AS (
         SELECT ca.lead_id,
           (ca.lifecycle_group IN ('C1','C2','C3')
             AND ((ca.latitude IS NOT NULL AND ca.longitude IS NOT NULL)
                  OR EXISTS(SELECT 1 FROM lead_parcels lp WHERE lp.lead_id = ca.lead_id))) AS is_open,
           (ca.cost_source = 'archetype_parcel') AS has_cost
         FROM coa_applications ca
       )
       SELECT
         (SELECT COUNT(*) FROM coa_applications) AS s0_total,
         COUNT(*) FILTER (WHERE is_open) AS s1_open,
         COUNT(*) FILTER (WHERE is_open AND has_cost) AS s2_cost,
         COUNT(*) FILTER (WHERE is_open AND has_cost AND EXISTS(
           SELECT 1 FROM trade_forecasts tf WHERE tf.lead_id = base.lead_id
             AND (tf.urgency IS NULL OR tf.urgency <> 'expired'))) AS s3_forecast,
         COUNT(*) FILTER (WHERE is_open AND has_cost AND EXISTS(
           SELECT 1 FROM trade_forecasts tf WHERE tf.lead_id = base.lead_id
             AND tf.opportunity_score IS NOT NULL)) AS s4_score,
         COUNT(*) FILTER (WHERE has_cost) AS priced_total
       FROM base`,
        params: [],
      },
    ],
  };
}

/** `round1` — one-decimal rounding, verbatim helper (matches the pre-conversion script's own log formatting precision). */
function round1(n) {
  return Math.round(n * 10) / 10;
}

/** Reads a metric value out of a prior RUN's own reported `records_meta.audit_table.rows` (RS-D2's coaFunnel carry-forward source). */
function priorAuditMetric(prior, metric) {
  const rows = prior && prior.audit_table && Array.isArray(prior.audit_table.rows) ? prior.audit_table.rows : [];
  const row = rows.find((r) => r.metric === metric);
  return row ? row.value : null;
}

/**
 * Assembles the write target's column values from the collected read results —
 * pure JS, verbatim-ported derivation logic from the pre-conversion script
 * (`:283-500`). `results[key]` is `null` when that optional read failed.
 * @param {Record<string, Array<Record<string, unknown>>|null>} results
 * @param {Record<string, unknown>} prevRow - the write target's own prior row (may be `{}`)
 * @param {{ audit_table?: { rows?: Array<{metric:string, value:unknown}> } }|null} prior - the prior RUN's own records_meta
 * @param {Record<string, number>} config
 */
function buildRow(results, prevRow, prior, config) {
  void config; // thresholds are already baked into the coa query's own bound params
  const s = results.permitsScalar[0];
  const total_permits = safeParsePositiveInt(s.total, 'total');
  const active_permits = safeParsePositiveInt(s.active, 'active');

  const t = results.trades[0];
  const tt = results.tradeByType[0];
  const b = results.builders[0];
  const p = results.parcels[0];

  const neighbourhood_count = safeParsePositiveInt(s.neighbourhood_count, 'neighbourhood_count');
  const c = results.coa[0];
  const { breakdown, tagsTop } = splitTagBreakdown(results.tagBreakdown);
  const scopeTagsCount = safeParsePositiveInt(s.scope_tags_count, 'scope_tags_count');
  const detailedTagsCount = safeParsePositiveInt(s.detailed_tags_count, 'detailed_tags_count');

  const n = {
    null_description: s.null_description, null_builder_name: s.null_builder_name,
    null_est_const_cost: s.null_est_const_cost, null_street_num: s.null_street_num,
    null_street_name: s.null_street_name, null_geo_id: s.null_geo_id,
  };
  const v = { cost_oor: s.cost_oor, future_issued: s.future_issued, missing_status: s.missing_status };
  const violations_total = safeParsePositiveInt(v.cost_oor, 'cost_oor') + safeParsePositiveInt(v.future_issued, 'future_issued') + safeParsePositiveInt(v.missing_status, 'missing_status');

  const sync = (results.sync && results.sync[0]) || {};

  // 12. Massing (may not exist) — carry-forward on failure (unchanged, pre-existing policy).
  let massing = { footprints_total: 0, parcels_with_buildings: 0 };
  const massingFailed = results.massing === null;
  if (!massingFailed) {
    const m = results.massing[0];
    massing = { footprints_total: safeParsePositiveInt(m.footprints_total, 'footprints_total'), parcels_with_buildings: safeParsePositiveInt(m.parcels_with_buildings, 'parcels_with_buildings') };
  } else {
    massing = { footprints_total: prevRow.building_footprints_total || 0, parcels_with_buildings: prevRow.parcels_with_buildings || 0 };
  }

  // 15. Schema column counts — carry-forward on failure (unchanged, pre-existing policy).
  let schemaColumnCounts = {};
  const schemaFailed = results.schemaColumnCounts === null;
  if (!schemaFailed) {
    for (const row of results.schemaColumnCounts) schemaColumnCounts[row.table_name] = safeParsePositiveInt(row.col_count, 'col_count');
  } else {
    schemaColumnCounts = prevRow.schema_column_counts || {};
  }

  // 16. SLA metrics — carry-forward on failure (unchanged, pre-existing policy).
  let slaHours = null;
  const slaFailed = results.sla === null;
  if (!slaFailed) {
    const hours = results.sla[0] && results.sla[0].hours;
    slaHours = hours ? Math.round(safeParseFloat(hours, 'hours') * 100) / 100 : null;
  } else {
    slaHours = prevRow.sla_permits_ingestion_hours || null;
  }

  // 17. Inspection scraping coverage — carry-forward on failure (unchanged, pre-existing policy).
  let insp = { total: 0, permits_scraped: 0, outstanding: 0, passed: 0, not_passed: 0 };
  const inspectionsFailed = results.inspections === null;
  if (!inspectionsFailed) {
    const ir = results.inspections[0];
    insp = {
      total: safeParsePositiveInt(ir.total, 'total'),
      permits_scraped: safeParsePositiveInt(ir.permits_scraped, 'permits_scraped'),
      outstanding: safeParsePositiveInt(ir.outstanding, 'outstanding'),
      passed: safeParsePositiveInt(ir.passed, 'passed'),
      not_passed: safeParsePositiveInt(ir.not_passed, 'not_passed'),
    };
  } else {
    insp = {
      total: prevRow.inspections_total || 0,
      permits_scraped: prevRow.inspections_permits_scraped || 0,
      outstanding: prevRow.inspections_outstanding_count || 0,
      passed: prevRow.inspections_passed_count || 0,
      not_passed: prevRow.inspections_not_passed_count || 0,
    };
  }

  // ── Cost estimates coverage — RS-D2 FIX: carry-forward on failure, matching
  // the other 4 optional blocks' own policy (was: zero default). ─────────────
  let costEst = { total: 0, from_permit: 0, from_model: 0, null_cost: 0 };
  const costEstFailed = results.costEst === null;
  if (!costEstFailed) {
    const cr = results.costEst[0];
    costEst = {
      total: safeParsePositiveInt(cr.total, 'total'),
      from_permit: safeParsePositiveInt(cr.from_permit, 'from_permit'),
      from_model: safeParsePositiveInt(cr.from_model, 'from_model'),
      null_cost: safeParsePositiveInt(cr.null_cost, 'null_cost'),
    };
  } else {
    costEst = {
      total: prevRow.cost_estimates_total || 0,
      from_permit: prevRow.cost_estimates_from_permit || 0,
      from_model: prevRow.cost_estimates_from_model || 0,
      null_cost: prevRow.cost_estimates_null_cost || 0,
    };
  }

  // ── CoA cost coverage + servable-CoA funnel — RS-D2 FIX: carry-forward on
  // failure from the PRIOR RUN's own reported audit values (not a table column
  // — these 7 fields are audit/telemetry only, never written). ───────────────
  let coaFunnel = {
    total: 0, open: 0, cost: 0, forecast: 0, score: 0,
    corpus_cov_pct: null, open_cov_pct: null,
  };
  const coaFunnelFailed = results.coaFunnel === null;
  if (!coaFunnelFailed) {
    const fr = results.coaFunnel[0];
    const total = safeParsePositiveInt(fr.s0_total, 's0_total');
    const open = safeParsePositiveInt(fr.s1_open, 's1_open');
    const cost = safeParsePositiveInt(fr.s2_cost, 's2_cost');
    const priced = safeParsePositiveInt(fr.priced_total, 'priced_total');
    coaFunnel = {
      total,
      open,
      cost,
      forecast: safeParsePositiveInt(fr.s3_forecast, 's3_forecast'),
      score: safeParsePositiveInt(fr.s4_score, 's4_score'),
      corpus_cov_pct: total > 0 ? Math.round((1000 * priced) / total) / 10 : null,
      open_cov_pct: open > 0 ? Math.round((1000 * cost) / open) / 10 : null,
    };
  } else {
    coaFunnel = {
      total: safeParsePositiveInt(priorAuditMetric(prior, 'servable_coa_funnel_total') || 0, 'servable_coa_funnel_total'),
      open: safeParsePositiveInt(priorAuditMetric(prior, 'servable_coa_funnel_geo_open') || 0, 'servable_coa_funnel_geo_open'),
      cost: safeParsePositiveInt(priorAuditMetric(prior, 'servable_coa_funnel_cost') || 0, 'servable_coa_funnel_cost'),
      forecast: safeParsePositiveInt(priorAuditMetric(prior, 'servable_coa_funnel_fresh_forecast') || 0, 'servable_coa_funnel_fresh_forecast'),
      score: safeParsePositiveInt(priorAuditMetric(prior, 'servable_coa_funnel_score') || 0, 'servable_coa_funnel_score'),
      corpus_cov_pct: priorAuditMetric(prior, 'coa_cost_coverage_pct'),
      open_cov_pct: priorAuditMetric(prior, 'coa_cost_coverage_open_pct'),
    };
  }

  // V1 timing_calibration dropped (migration 106). Columns preserved for
  // historical continuity — written as NULL (unchanged, pre-existing policy).
  const timingCal = { total: null, avg_sample: null, freshness_hours: null };

  const row = {
    total_permits, active_permits,
    permits_with_trades: safeParsePositiveInt(t.permits_with_trades, 'permits_with_trades'),
    trade_matches_total: safeParsePositiveInt(t.total_matches, 'total_matches'),
    trade_avg_confidence: t.avg_confidence ? safeParseFloat(t.avg_confidence, 'avg_confidence') : null,
    trade_tier1_count: safeParsePositiveInt(t.tier1, 'tier1'),
    trade_tier2_count: safeParsePositiveInt(t.tier2, 'tier2'),
    trade_tier3_count: safeParsePositiveInt(t.tier3, 'tier3'),
    trade_residential_classified: safeParsePositiveInt(tt.res_classified, 'res_classified'),
    trade_residential_total: safeParsePositiveInt(tt.res_total, 'res_total'),
    trade_commercial_classified: safeParsePositiveInt(tt.com_classified, 'com_classified'),
    trade_commercial_total: safeParsePositiveInt(tt.com_total, 'com_total'),
    permits_with_builder: safeParsePositiveInt(s.permits_with_builder, 'permits_with_builder'),
    builders_total: safeParsePositiveInt(b.total, 'total'),
    builders_enriched: safeParsePositiveInt(b.enriched, 'enriched'),
    builders_with_phone: safeParsePositiveInt(b.with_phone, 'with_phone'),
    builders_with_email: safeParsePositiveInt(b.with_email, 'with_email'),
    builders_with_website: safeParsePositiveInt(b.with_website, 'with_website'),
    builders_with_google: safeParsePositiveInt(b.with_google, 'with_google'),
    builders_with_wsib: safeParsePositiveInt(b.with_wsib, 'with_wsib'),
    permits_with_parcel: safeParsePositiveInt(p.permits_with_parcel, 'permits_with_parcel'),
    parcel_exact_matches: safeParsePositiveInt(p.exact_matches, 'exact_matches'),
    parcel_name_matches: safeParsePositiveInt(p.name_matches, 'name_matches'),
    parcel_spatial_matches: safeParsePositiveInt(p.spatial_matches, 'spatial_matches'),
    parcel_avg_confidence: p.avg_confidence ? safeParseFloat(p.avg_confidence, 'avg_confidence') : null,
    permits_with_neighbourhood: neighbourhood_count,
    permits_geocoded: safeParsePositiveInt(s.geocoded_count, 'geocoded_count'),
    coa_total: safeParsePositiveInt(c.total, 'total'),
    coa_linked: safeParsePositiveInt(c.linked, 'linked'),
    coa_avg_confidence: c.avg_confidence ? safeParseFloat(c.avg_confidence, 'avg_confidence') : null,
    coa_high_confidence: safeParsePositiveInt(c.high_confidence, 'high_confidence'),
    coa_low_confidence: safeParsePositiveInt(c.low_confidence, 'low_confidence'),
    permits_with_scope: safeParsePositiveInt(s.scope_count, 'scope_count'),
    scope_project_type_breakdown: JSON.stringify(breakdown),
    permits_with_scope_tags: scopeTagsCount,
    permits_with_detailed_tags: detailedTagsCount,
    scope_tags_top: JSON.stringify(tagsTop),
    permits_updated_24h: safeParsePositiveInt(s.updated_24h, 'updated_24h'),
    permits_updated_7d: safeParsePositiveInt(s.updated_7d, 'updated_7d'),
    permits_updated_30d: safeParsePositiveInt(s.updated_30d, 'updated_30d'),
    last_sync_at: sync.started_at || null,
    last_sync_status: sync.status || null,
    building_footprints_total: massing.footprints_total,
    parcels_with_buildings: massing.parcels_with_buildings,
    null_description_count: safeParsePositiveInt(n.null_description, 'null_description'),
    null_builder_name_count: safeParsePositiveInt(n.null_builder_name, 'null_builder_name'),
    null_est_const_cost_count: safeParsePositiveInt(n.null_est_const_cost, 'null_est_const_cost'),
    null_street_num_count: safeParsePositiveInt(n.null_street_num, 'null_street_num'),
    null_street_name_count: safeParsePositiveInt(n.null_street_name, 'null_street_name'),
    null_geo_id_count: safeParsePositiveInt(n.null_geo_id, 'null_geo_id'),
    violation_cost_out_of_range: safeParsePositiveInt(v.cost_oor, 'cost_oor'),
    violation_future_issued_date: safeParsePositiveInt(v.future_issued, 'future_issued'),
    violation_missing_status: safeParsePositiveInt(v.missing_status, 'missing_status'),
    violations_total,
    schema_column_counts: JSON.stringify(schemaColumnCounts),
    sla_permits_ingestion_hours: slaHours,
    inspections_total: insp.total,
    inspections_permits_scraped: insp.permits_scraped,
    inspections_outstanding_count: insp.outstanding,
    inspections_passed_count: insp.passed,
    inspections_not_passed_count: insp.not_passed,
    cost_estimates_total: costEst.total,
    cost_estimates_from_permit: costEst.from_permit,
    cost_estimates_from_model: costEst.from_model,
    cost_estimates_null_cost: costEst.null_cost,
    timing_calibration_total: timingCal.total,
    timing_calibration_avg_sample: timingCal.avg_sample,
    timing_calibration_freshness_hours: timingCal.freshness_hours,
  };

  return {
    row,
    matched: {
      neighbourhood_count, active_permits, coa_total: row.coa_total, coa_linked: row.coa_linked,
      permits_with_scope: row.permits_with_scope, permits_with_scope_tags: scopeTagsCount, permits_with_detailed_tags: detailedTagsCount,
      coaFunnel,
      optional_query_failed: [
        massingFailed && 'massing', schemaFailed && 'schemaColumnCounts', slaFailed && 'sla',
        inspectionsFailed && 'inspections', costEstFailed && 'costEst', coaFunnelFailed && 'coaFunnel',
      ].filter(Boolean),
    },
  };
}

/**
 * Authors the whole `INSERT ... ON CONFLICT (snapshot_date) DO UPDATE` statement —
 * pure JS, verbatim-ported SQL text (`:503-626` pre-conversion) — `guard:"none"`
 * per GAP-2 (Rule 9 grandfathered: a metrics-recording row's entire purpose is to
 * differ from the prior value every run, so an IS DISTINCT FROM guard is
 * near-vacuous), `snapshot_date` bound via the SAME server-side `CURRENT_DATE`
 * literal as before, never a JS-computed date value.
 * @param {Record<string, unknown>} row - from `buildRow()`
 * @returns {{ sql: string, params: unknown[] }}
 */
function buildWriteSql(row) {
  const cols = [
    'total_permits', 'active_permits',
    'permits_with_trades', 'trade_matches_total', 'trade_avg_confidence',
    'trade_tier1_count', 'trade_tier2_count', 'trade_tier3_count',
    'trade_residential_classified', 'trade_residential_total',
    'trade_commercial_classified', 'trade_commercial_total',
    'permits_with_builder', 'builders_total', 'builders_enriched',
    'builders_with_phone', 'builders_with_email', 'builders_with_website',
    'builders_with_google', 'builders_with_wsib',
    'permits_with_parcel', 'parcel_exact_matches', 'parcel_name_matches', 'parcel_spatial_matches', 'parcel_avg_confidence',
    'permits_with_neighbourhood',
    'permits_geocoded',
    'coa_total', 'coa_linked', 'coa_avg_confidence', 'coa_high_confidence', 'coa_low_confidence',
    'permits_with_scope', 'scope_project_type_breakdown',
    'permits_with_scope_tags', 'permits_with_detailed_tags', 'scope_tags_top',
    'permits_updated_24h', 'permits_updated_7d', 'permits_updated_30d',
    'last_sync_at', 'last_sync_status',
    'building_footprints_total', 'parcels_with_buildings',
    'null_description_count', 'null_builder_name_count', 'null_est_const_cost_count',
    'null_street_num_count', 'null_street_name_count', 'null_geo_id_count',
    'violation_cost_out_of_range', 'violation_future_issued_date', 'violation_missing_status', 'violations_total',
    'schema_column_counts', 'sla_permits_ingestion_hours',
    'inspections_total', 'inspections_permits_scraped',
    'inspections_outstanding_count', 'inspections_passed_count', 'inspections_not_passed_count',
    'cost_estimates_total', 'cost_estimates_from_permit', 'cost_estimates_from_model', 'cost_estimates_null_cost',
    'timing_calibration_total', 'timing_calibration_avg_sample', 'timing_calibration_freshness_hours',
  ];
  const jsonbCols = new Set(['scope_project_type_breakdown', 'scope_tags_top', 'schema_column_counts']);
  const placeholders = cols.map((c, i) => `$${i + 1}${jsonbCols.has(c) ? '::jsonb' : ''}`);
  const setClause = cols.map((c) => `${c}=EXCLUDED.${c}`).join(', ');
  const sql = `INSERT INTO ${TABLE} (
        snapshot_date,
        ${cols.join(',\n        ')}
      ) VALUES (
        CURRENT_DATE,
        ${placeholders.join(',')}
      )
      ON CONFLICT (snapshot_date) DO UPDATE SET
        ${setClause},
        created_at=NOW()
      RETURNING (xmax::text::int = 0) AS is_insert, snapshot_date;`;
  const params = cols.map((c) => row[c]);
  return { sql, params };
}

// ===========================================================================
// Checks — one function per declared check, in descriptor order, name === id
// ===========================================================================

/** INV-2's own source, INFO — records_total/new/updated xor, mirrors compute_centroids' analogous field_coverage checks. */
function snapshots_created(ctx) {
  const isInsert = ctx.matched && ctx.matched.is_insert;
  ctx.report('snapshots_created', { violations: 0, detail: isInsert ? 1 : 0 });
}

function snapshots_updated(ctx) {
  const isUpdate = ctx.matched && ctx.matched.is_update;
  ctx.report('snapshots_updated', { violations: 0, detail: isUpdate ? 1 : 0 });
}

/** RS-D2's own visibility check (Ask 1 FIX) — WARN whenever any optional query fell back to a carried-forward value this run, nothing-hidden. */
function optional_query_failed(ctx) {
  const failed = (ctx.matched && ctx.matched.optional_query_failed) || [];
  ctx.report('optional_query_failed', { violations: failed.length, detail: failed });
}

function coa_cost_coverage_pct(ctx) {
  const v = ctx.matched && ctx.matched.coaFunnel ? ctx.matched.coaFunnel.corpus_cov_pct : null;
  ctx.report('coa_cost_coverage_pct', { violations: 0, detail: v });
}

function coa_cost_coverage_open_pct(ctx) {
  const v = ctx.matched && ctx.matched.coaFunnel ? ctx.matched.coaFunnel.open_cov_pct : null;
  ctx.report('coa_cost_coverage_open_pct', { violations: 0, detail: v });
}

function servable_coa_funnel_total(ctx) {
  const v = (ctx.matched && ctx.matched.coaFunnel && ctx.matched.coaFunnel.total) || 0;
  ctx.report('servable_coa_funnel_total', { violations: 0, detail: v });
}

function servable_coa_funnel_geo_open(ctx) {
  const v = (ctx.matched && ctx.matched.coaFunnel && ctx.matched.coaFunnel.open) || 0;
  ctx.report('servable_coa_funnel_geo_open', { violations: 0, detail: v });
}

function servable_coa_funnel_cost(ctx) {
  const v = (ctx.matched && ctx.matched.coaFunnel && ctx.matched.coaFunnel.cost) || 0;
  ctx.report('servable_coa_funnel_cost', { violations: 0, detail: v });
}

function servable_coa_funnel_fresh_forecast(ctx) {
  const v = (ctx.matched && ctx.matched.coaFunnel && ctx.matched.coaFunnel.forecast) || 0;
  ctx.report('servable_coa_funnel_fresh_forecast', { violations: 0, detail: v });
}

function servable_coa_funnel_score(ctx) {
  const v = (ctx.matched && ctx.matched.coaFunnel && ctx.matched.coaFunnel.score) || 0;
  ctx.report('servable_coa_funnel_score', { violations: 0, detail: v });
}

// ---- dispatch ----

/** §5.5 (1) — keys are exactly the descriptor's check ids, in declaration order. */
const CHECKS = {
  snapshots_created,
  snapshots_updated,
  optional_query_failed,
  coa_cost_coverage_pct,
  coa_cost_coverage_open_pct,
  servable_coa_funnel_total,
  servable_coa_funnel_geo_open,
  servable_coa_funnel_cost,
  servable_coa_funnel_fresh_forecast,
  servable_coa_funnel_score,
};

/** §5.5 (2) — run the SELECTED checks, and nothing else. Errors land on their own row (never suppress siblings). */
async function compute(ctx) {
  for (const id of ctx.checks) {
    const check = CHECKS[id];
    if (typeof check !== 'function') {
      throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${id}" with no function in the compute dispatch table`);
    }
    try {
      await check(ctx);
    } catch (err) {
      ctx.log.error(`[${ctx.descriptor.identity.name}]`, `FAIL: ${id} — ${err.message}`);
      ctx.report(id, { error: err });
    }
  }
  if (!ctx.matched) return { records_meta: {} };
  return {
    records_meta: {
      duration_ms: ctx.elapsed_ms,
      neighbourhood_count: ctx.matched.neighbourhood_count,
      active_permits: ctx.matched.active_permits,
      // WF3 2026-09-18 (Peel 2.1, review_followups.md:20) — one {key, elapsed_ms, row_count}
      // entry per main read, so a slow read is diagnosable from the persisted run record
      // after the fact, not only distinguishable-from-a-hang while the process is live.
      read_timings: ctx.matched.read_timings,
    },
  };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
module.exports.buildReads = buildReads;
module.exports.buildRow = buildRow;
module.exports.buildWriteSql = buildWriteSql;
module.exports.buildPermitsScalarQuery = buildPermitsScalarQuery;
module.exports.buildTagBreakdownQuery = buildTagBreakdownQuery;
module.exports.buildTradeByTypeQuery = buildTradeByTypeQuery;
module.exports.splitTagBreakdown = splitTagBreakdown;
module.exports.ACTIVE_PERMIT_STATUSES = ACTIVE_PERMIT_STATUSES;
module.exports.TABLE = TABLE;
