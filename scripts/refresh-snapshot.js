#!/usr/bin/env node
// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
// SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md
// Refresh the data quality snapshot by re-running all counting queries
// Usage: node scripts/refresh-snapshot.js

const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const { safeParsePositiveInt, safeParseFloat } = require('./lib/safe-math');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');
const TAG = '[refresh-snapshot]';

const LOGIC_VARS_SCHEMA = z.object({
  snapshot_coa_conf_high:  z.coerce.number().finite().positive().max(1),
  coa_match_conf_medium:   z.coerce.number().finite().positive().max(1),
}).passthrough();

const ADVISORY_LOCK_ID = 40;

// WF3 F1 (2026-08-15, Spec 118 §1/§7.1): the single source of truth for "an active
// permit" across every consolidated query below. Was repeated as a literal IN-list in
// 9 separate query strings pre-fix — one shared constant so the definition can never
// drift between them.
const ACTIVE_PERMIT_STATUSES = ['Permit Issued', 'Revision Issued', 'Under Review', 'Inspection', 'Examination'];
const CORE_SCOPE_TAGS = new Set(['residential', 'commercial', 'mixed-use']);

// ---------------------------------------------------------------------------
// WF3 F1 — the refresh_snapshot pathology fix (Spec 118 §1, §7.1; measured
// 2026-08-14: this script's stats queries index-fetched 187,187 rows = 73% of
// permits via idx_permits_status, 3min -> 64min once the week's mass-UPDATE
// traffic destroyed the heap's physical correlation with status order).
//
// THE DECISION RESTS ON THE OBSERVED I/O PATTERN, NOT THE PLANNER'S COST ESTIMATE:
// the planner costs the index-fetch plan CHEAPEST under a stale correlation
// statistic (0.586, live-measured) — it looks like the right plan right up until
// the heap's physical order stops matching `status`. The fix is
// not "make the query faster" but "make the query's SHAPE immune to that
// statistic": a single no-WHERE pass forces a deterministic Parallel Seq Scan
// (EXPLAIN cost 153,220) regardless of what pg_stats.correlation says today.
//
// Grounded 2026-08-15 (WF3 GROUNDING FOLDED): candidate shapes were MEASURED,
// not guessed — a hashed-subplan rewrite was REFUTED (cost 10.2e9) and a
// single-column covering index collapses daily under this table's write
// pattern. The winner is a THREE-PART battery covering all 9 pathological
// status-scoped queries (+1 already-FILTER-shaped query folded in for free):
//   ① buildPermitsScalarQuery  — 10 scalar permits aggregates -> ONE no-WHERE
//      FILTER pass (permitsRes, permitsBuilderRes, nhoodRes, geoRes, scopeRes,
//      scopeTagsRes, detailedTagsRes, freshRes, nullsRes, violationsRes).
//   ② buildTagBreakdownQuery  — the 2 GROUP BY scope_tags queries (topTagsRes,
//      scopeBreakdownRes) -> ONE pass; `(status = ANY($1)) IS TRUE` defeats the
//      planner's ability to satisfy the boolean-wrapped predicate via an index
//      scan the way a bare IN-list/= ANY() invites.
//   ③ tradeByTypeRes keeps its existing JOIN shape (a rewrite risked wrong
//      answers on the DISTINCT aggregates) but runs under session-scoped
//      `SET enable_indexscan = off` on the script's own pinned REPEATABLE READ
//      client, forcing a correlation-immune Bitmap Heap plan; `RESET` restores
//      normal planning for every query after it on the same connection.
//
// Exported so src/tests/refresh-snapshot-query-consolidation.logic.test.ts can
// pin the adopted shape and src/tests/db/refresh-snapshot-consolidation.db.test.ts
// can prove old-vs-new VALUE EQUIVALENCE on a seeded fixture — the numbers into
// data_quality_snapshots must be identical, only the query shape changed.
// ---------------------------------------------------------------------------

/**
 * ① Consolidates the 10 scalar (non-GROUP-BY) permits.status-scoped aggregate
 * queries into a single no-WHERE pass. Every status-scoped metric embeds
 * `status = ANY($1)` in its OWN FILTER clause (mirroring each original query's
 * WHERE) rather than at the top level — the missing top-level WHERE is what
 * removes the planner's incentive to satisfy the query via idx_permits_status.
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
 * ② Consolidates the 2 GROUP BY scope_tags queries (top non-core tags,
 * core-3 breakdown) into a single pass over one CTE. `(status = ANY($1)) IS
 * TRUE` — not a bare `= ANY()` — is the index-defeat idiom: a boolean
 * expression wrapped in `IS TRUE` cannot be satisfied by a plain btree scan
 * on `status` the way an unwrapped predicate can, and it stays NULL-safe.
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
 * ③ tradeByTypeRes — SAME join shape as before (a rewrite risked wrong answers
 * on its DISTINCT-permit aggregates); the fix is executing it under
 * `enable_indexscan = off` (caller's responsibility — see snapClient usage
 * below), not the query text.
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
 * Splits buildTagBreakdownQuery()'s merged rows back into the two shapes the
 * rest of the script (and the data_quality_snapshots columns) expect: the
 * core-3 `scope_project_type_breakdown` map (unordered, all present-or-absent)
 * and the top-10 non-core `scope_tags_top` map, in the SAME count-DESC order
 * the old separate `ORDER BY count DESC LIMIT 10` query produced (sorting a
 * superset by one key preserves the relative order of any subset).
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

async function runRefreshSnapshot(pool) {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
  const t0 = Date.now();
  pipeline.log.info(TAG, 'Recapturing data quality snapshot...');

  const { logicVars } = await loadMarketplaceConfigs(pool, 'refresh-snapshot');
  const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'refresh-snapshot');
  if (!validation.valid) throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
  const snapshotCoaConfHigh = logicVars.snapshot_coa_conf_high;
  const coaConfMedium       = logicVars.coa_match_conf_medium;

  // All queries run sequentially on a single REPEATABLE READ client.
  // This guarantees point-in-time consistency (no "torn snapshot" from concurrent writes)
  // and uses only 1 connection (prevents pool starvation from 18 simultaneous queries).
  const snapClient = await pool.connect();
  await snapClient.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

  // Declare query results in outer scope so they're accessible after the try/finally
  let permitsScalarRes, tradesRes, tradeByTypeRes, buildersRes, parcelsRes;
  let coaRes, tagBreakdownRes, syncRes;

  try {
    // WF3 F1 ① — 10 scalar permits aggregates, ONE no-WHERE pass (see the block
    // comment above buildPermitsScalarQuery for why the missing WHERE is the fix).
    const permitsScalarQuery = buildPermitsScalarQuery();
    permitsScalarRes = await snapClient.query(permitsScalarQuery.sql, permitsScalarQuery.params);

    tradesRes = await snapClient.query(
      `SELECT COUNT(DISTINCT (permit_num, revision_num)) as permits_with_trades,
              COUNT(*) as total_matches,
              AVG(confidence)::NUMERIC(4,3) as avg_confidence,
              COUNT(*) FILTER (WHERE tier = 1) as tier1,
              COUNT(*) FILTER (WHERE tier = 2) as tier2,
              COUNT(*) FILTER (WHERE tier = 3) as tier3
       FROM permit_trades`
    );

    // WF3 F1 ③ — same join shape, executed under enable_indexscan=off on this
    // pinned client so the plan can't fall back to a status-index fetch on the
    // permits side of the join; RESET immediately after so every other query on
    // this connection (there are none left this run, but the guard is cheap and
    // future-proof) plans normally.
    const tradeByTypeQuery = buildTradeByTypeQuery();
    await snapClient.query('SET enable_indexscan = off');
    try {
      tradeByTypeRes = await snapClient.query(tradeByTypeQuery.sql, tradeByTypeQuery.params);
    } finally {
      await snapClient.query('RESET enable_indexscan');
    }

    buildersRes = await snapClient.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE last_enriched_at IS NOT NULL) as enriched,
              COUNT(*) FILTER (WHERE primary_phone IS NOT NULL) as with_phone,
              COUNT(*) FILTER (WHERE primary_email IS NOT NULL) as with_email,
              COUNT(*) FILTER (WHERE website IS NOT NULL) as with_website,
              COUNT(*) FILTER (WHERE google_place_id IS NOT NULL) as with_google,
              COUNT(*) FILTER (WHERE is_wsib_registered = true) as with_wsib
       FROM entities`
    );
    // WF1 #parcel-address-bridge Phase 2f.3 (2026-05-23) — exact_matches
    // FILTER expanded to roll up BOTH legacy 'exact_address' AND new
    // 'address_points_exact' rows per F17 preservation (mirrors the
    // src/lib/quality/metrics.ts fix). data_quality_snapshots.parcel_exact_matches
    // stays semantically "all Tier-1 exact matches" — bridge-path migration
    // progress is observable via link-parcels audit_table tier_1_via_bridge.
    parcelsRes = await snapClient.query(
      `SELECT COUNT(DISTINCT (permit_num, revision_num)) as permits_with_parcel,
              COUNT(*) FILTER (WHERE match_type IN ('exact_address', 'address_points_exact')) as exact_matches,
              COUNT(*) FILTER (WHERE match_type = 'name_only') as name_matches,
              COUNT(*) FILTER (WHERE match_type = 'spatial') as spatial_matches,
              AVG(confidence)::NUMERIC(4,3) as avg_confidence
       FROM permit_parcels`
    );
    coaRes = await snapClient.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL) as linked,
              AVG(linked_confidence) FILTER (WHERE linked_permit_num IS NOT NULL)::NUMERIC(4,3) as avg_confidence,
              COUNT(*) FILTER (WHERE linked_confidence >= $1) as high_confidence,
              COUNT(*) FILTER (WHERE linked_confidence IS NOT NULL AND linked_confidence < $2) as low_confidence
       FROM coa_applications`,
      [snapshotCoaConfHigh, coaConfMedium]
    );

    // WF3 F1 ② — the 2 GROUP BY scope_tags queries, ONE pass.
    const tagBreakdownQuery = buildTagBreakdownQuery();
    tagBreakdownRes = await snapClient.query(tagBreakdownQuery.sql, tagBreakdownQuery.params);

    syncRes = await snapClient.query(
      `SELECT started_at, status FROM sync_runs ORDER BY started_at DESC LIMIT 1`
    );

    await snapClient.query('COMMIT');
  } finally {
    snapClient.release();
  }

  // Extract results — declared in outer scope so pipeline.withTransaction can access them
  const s = permitsScalarRes.rows[0];
  const total_permits = safeParsePositiveInt(s.total, 'total');
  const active_permits = safeParsePositiveInt(s.active, 'active');
  pipeline.log.info(TAG, `Permits: ${total_permits} total, ${active_permits} active`);

  const t = tradesRes.rows[0];
  const tt = tradeByTypeRes.rows[0];

  const b = buildersRes.rows[0];

  const p = parcelsRes.rows[0];

  const neighbourhood_count = safeParsePositiveInt(s.neighbourhood_count, 'neighbourhood_count');
  pipeline.log.info(TAG, `Neighbourhoods (active): ${neighbourhood_count} / ${active_permits} = ${active_permits > 0 ? (neighbourhood_count/active_permits*100).toFixed(1) : '0.0'}%`);

  const c = coaRes.rows[0];
  const coaTotal = safeParsePositiveInt(c.total, 'total');
  pipeline.log.info(TAG, `CoA: ${c.total} total, ${c.linked} linked = ${coaTotal > 0 ? (safeParsePositiveInt(c.linked, 'linked')/coaTotal*100).toFixed(1) : '0.0'}%`);

  const { breakdown, tagsTop } = splitTagBreakdown(tagBreakdownRes.rows);
  const scopeTagsCount = safeParsePositiveInt(s.scope_tags_count, 'scope_tags_count');
  const detailedTagsCount = safeParsePositiveInt(s.detailed_tags_count, 'detailed_tags_count');
  pipeline.log.info(TAG, `Scope tags: ${scopeTagsCount} total, ${detailedTagsCount} detailed`);
  pipeline.log.info(TAG, `Top tags: ${Object.entries(tagsTop).slice(0,5).map(([k,v])=>k+':'+v).join(', ')}`);

  const n = {
    null_description: s.null_description, null_builder_name: s.null_builder_name,
    null_est_const_cost: s.null_est_const_cost, null_street_num: s.null_street_num,
    null_street_name: s.null_street_name, null_geo_id: s.null_geo_id,
  };
  pipeline.log.info(TAG, `Nulls: desc=${n.null_description}, builder=${n.null_builder_name}, cost=${n.null_est_const_cost}`);

  const v = { cost_oor: s.cost_oor, future_issued: s.future_issued, missing_status: s.missing_status };
  const violations_total = safeParsePositiveInt(v.cost_oor, 'cost_oor') + safeParsePositiveInt(v.future_issued, 'future_issued') + safeParsePositiveInt(v.missing_status, 'missing_status');
  pipeline.log.info(TAG, `Violations: cost_oor=${v.cost_oor}, future_issued=${v.future_issued}, missing_status=${v.missing_status}, total=${violations_total}`);

  // Optional queries: on failure, carry forward previous snapshot values
  // instead of defaulting to 0 (which would destroy dashboard trend lines).
  let prevSnapshot = null;
  async function getPrevSnapshot() {
    if (prevSnapshot !== null) return prevSnapshot;
    try {
      const prev = await pool.query(
        `SELECT * FROM data_quality_snapshots ORDER BY snapshot_date DESC LIMIT 1`
      );
      prevSnapshot = prev.rows[0] || {};
    } catch { prevSnapshot = {}; }
    return prevSnapshot;
  }

  // 12. Massing (may not exist)
  let massing = { footprints_total: 0, parcels_with_buildings: 0 };
  try {
    const m = await pool.query(
      `SELECT (SELECT COUNT(*) FROM building_footprints) as footprints_total,
              (SELECT COUNT(DISTINCT parcel_id) FROM parcel_buildings) as parcels_with_buildings`
    );
    massing = { footprints_total: safeParsePositiveInt(m.rows[0].footprints_total, 'footprints_total'), parcels_with_buildings: safeParsePositiveInt(m.rows[0].parcels_with_buildings, 'parcels_with_buildings') };
  } catch (err) {
    pipeline.log.warn(TAG, `Massing query failed — carrying forward previous snapshot: ${err.message}`);
    const prev = await getPrevSnapshot();
    massing = { footprints_total: prev.building_footprints_total || 0, parcels_with_buildings: prev.parcels_with_buildings || 0 };
  }

  // 15. Schema column counts
  let schemaColumnCounts = {};
  try {
    const schemaCols = await pool.query(
      `SELECT table_name, COUNT(*)::text as col_count
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('permits', 'builders', 'coa_applications', 'parcels', 'permit_trades', 'permit_parcels')
       GROUP BY table_name ORDER BY table_name`
    );
    for (const row of schemaCols.rows) schemaColumnCounts[row.table_name] = safeParsePositiveInt(row.col_count, 'col_count');
  } catch (err) {
    pipeline.log.warn(TAG, `Schema column count query failed — carrying forward: ${err.message}`);
    const prev = await getPrevSnapshot();
    schemaColumnCounts = prev.schema_column_counts || {};
  }

  // 16. SLA metrics
  let slaHours = null;
  try {
    const sla = await pool.query(
      `SELECT EXTRACT(EPOCH FROM (NOW() - MAX(first_seen_at))) / 3600 as hours FROM permits`
    );
    slaHours = sla.rows[0]?.hours ? Math.round(safeParseFloat(sla.rows[0].hours, 'hours') * 100) / 100 : null;
  } catch (err) {
    pipeline.log.warn(TAG, `SLA query failed — carrying forward: ${err.message}`);
    const prev = await getPrevSnapshot();
    slaHours = prev.sla_permits_ingestion_hours || null;
  }

  // 17. Inspection scraping coverage
  let insp = { total: 0, permits_scraped: 0, outstanding: 0, passed: 0, not_passed: 0 };
  try {
    const inspResult = await pool.query(
      `SELECT
         COUNT(*) as total,
         COUNT(DISTINCT permit_num) as permits_scraped,
         COUNT(*) FILTER (WHERE status = 'Outstanding') as outstanding,
         COUNT(*) FILTER (WHERE status = 'Passed') as passed,
         COUNT(*) FILTER (WHERE status = 'Not Passed') as not_passed
       FROM permit_inspections`
    );
    const ir = inspResult.rows[0];
    insp = {
      total: safeParsePositiveInt(ir.total, 'total'),
      permits_scraped: safeParsePositiveInt(ir.permits_scraped, 'permits_scraped'),
      outstanding: safeParsePositiveInt(ir.outstanding, 'outstanding'),
      passed: safeParsePositiveInt(ir.passed, 'passed'),
      not_passed: safeParsePositiveInt(ir.not_passed, 'not_passed'),
    };
    pipeline.log.info(TAG, `Inspections: ${insp.total} stages, ${insp.permits_scraped} permits, ${insp.outstanding} outstanding, ${insp.passed} passed, ${insp.not_passed} not passed`);
  } catch (err) {
    pipeline.log.warn(TAG, `Inspection query failed — carrying forward: ${err.message}`);
    const prev = await getPrevSnapshot();
    insp = {
      total: prev.inspections_total || 0,
      permits_scraped: prev.inspections_permits_scraped || 0,
      outstanding: prev.inspections_outstanding_count || 0,
      passed: prev.inspections_passed_count || 0,
      not_passed: prev.inspections_not_passed_count || 0,
    };
  }

  // ── Cost estimates coverage ──
  // WF2 §3-ARCHETYPE (2026-07-06): the archetype ladder writes three new
  // provenances (archetype_declared_area / archetype_parcel / archetype_rate)
  // that carry ~83% of priced rows. The snapshot has no dedicated column for
  // them (no second migration, per the Phase D plan), so they fold into the
  // `from_model` bucket — semantically correct: every archetype price IS a
  // modeled (non-applicant-declared) cost. Legacy 'geometric' likewise folds in.
  // This keeps the invariant total = from_permit + from_model + null_cost intact
  // instead of silently dropping the archetype rows. The archetype sub-count is
  // surfaced in the INFO log for operators.
  let costEst = { total: 0, from_permit: 0, from_model: 0, null_cost: 0 };
  try {
    const costRes = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE cost_source = 'permit') as from_permit,
              COUNT(*) FILTER (WHERE cost_source IN ('model', 'geometric',
                'archetype_declared_area', 'archetype_parcel', 'archetype_rate')) as from_model,
              COUNT(*) FILTER (WHERE cost_source LIKE 'archetype\\_%') as from_archetype,
              COUNT(*) FILTER (WHERE estimated_cost IS NULL) as null_cost
       FROM cost_estimates`
    );
    const cr = costRes.rows[0];
    costEst = {
      total: safeParsePositiveInt(cr.total, 'total'),
      from_permit: safeParsePositiveInt(cr.from_permit, 'from_permit'),
      from_model: safeParsePositiveInt(cr.from_model, 'from_model'),
      null_cost: safeParsePositiveInt(cr.null_cost, 'null_cost'),
    };
    const fromArchetype = safeParsePositiveInt(cr.from_archetype, 'from_archetype');
    pipeline.log.info(TAG, `Cost Estimates: ${costEst.total} total (${costEst.from_permit} permit, ${costEst.from_model} model incl. ${fromArchetype} archetype, ${costEst.null_cost} null)`);
  } catch (err) {
    pipeline.log.warn(TAG, `Cost estimates query failed — zeroes: ${err.message}`);
  }

  // ── CoA cost coverage + servable-CoA funnel (WF2 P5, 2026-07-06) ──────────
  // INFO-only audit rows (they inform, they don't gate the traffic light yet).
  // coa_cost_coverage_pct = priced CoAs (cost_source='archetype_parcel') / total.
  // Servable funnel: total → geo+non-terminal(C1-C3) → +cost → +fresh-forecast
  // → +score. Row-derived, Spec-48 conformant. Baseline: 33,280→3,200→1,585→1,421.
  let coaFunnel = {
    total: 0, open: 0, cost: 0, forecast: 0, score: 0,
    corpus_cov_pct: null, open_cov_pct: null,
  };
  try {
    const funnelRes = await pool.query(
      `WITH base AS (
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
    );
    const fr = funnelRes.rows[0];
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
    pipeline.log.info(TAG, `CoA cost coverage: corpus ${coaFunnel.corpus_cov_pct}% (${priced}/${total}), open ${coaFunnel.open_cov_pct}% (${cost}/${open}); servable funnel ${total}→${open}→${cost}→${coaFunnel.forecast}→${coaFunnel.score}`);
  } catch (err) {
    pipeline.log.warn(TAG, `CoA cost-coverage/funnel query failed — zeroes: ${err.message}`);
  }

  // V1 timing_calibration dropped (migration 106). Columns preserved in
  // data_quality_snapshots for historical continuity — written as NULL.
  const timingCal = { total: null, avg_sample: null, freshness_hours: null };

  // UPSERT snapshot
  let isNew, isUpdate;
  await pipeline.withTransaction(pool, async (client) => {
    const result = await client.query(
      `INSERT INTO data_quality_snapshots (
        snapshot_date,
        total_permits, active_permits,
        permits_with_trades, trade_matches_total, trade_avg_confidence,
        trade_tier1_count, trade_tier2_count, trade_tier3_count,
        trade_residential_classified, trade_residential_total,
        trade_commercial_classified, trade_commercial_total,
        permits_with_builder, builders_total, builders_enriched,
        builders_with_phone, builders_with_email, builders_with_website,
        builders_with_google, builders_with_wsib,
        permits_with_parcel, parcel_exact_matches, parcel_name_matches, parcel_spatial_matches, parcel_avg_confidence,
        permits_with_neighbourhood,
        permits_geocoded,
        coa_total, coa_linked, coa_avg_confidence, coa_high_confidence, coa_low_confidence,
        permits_with_scope, scope_project_type_breakdown,
        permits_with_scope_tags, permits_with_detailed_tags, scope_tags_top,
        permits_updated_24h, permits_updated_7d, permits_updated_30d,
        last_sync_at, last_sync_status,
        building_footprints_total, parcels_with_buildings,
        null_description_count, null_builder_name_count, null_est_const_cost_count,
        null_street_num_count, null_street_name_count, null_geo_id_count,
        violation_cost_out_of_range, violation_future_issued_date, violation_missing_status, violations_total,
        schema_column_counts, sla_permits_ingestion_hours,
        inspections_total, inspections_permits_scraped,
        inspections_outstanding_count, inspections_passed_count, inspections_not_passed_count,
        cost_estimates_total, cost_estimates_from_permit, cost_estimates_from_model, cost_estimates_null_cost,
        timing_calibration_total, timing_calibration_avg_sample, timing_calibration_freshness_hours
      ) VALUES (
        CURRENT_DATE,
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34::jsonb,$35,$36,$37::jsonb,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54,$55::jsonb,$56,$57,$58,$59,$60,$61,$62,$63,$64,$65,$66,$67,$68
      )
      ON CONFLICT (snapshot_date) DO UPDATE SET
        total_permits=EXCLUDED.total_permits, active_permits=EXCLUDED.active_permits,
        permits_with_trades=EXCLUDED.permits_with_trades, trade_matches_total=EXCLUDED.trade_matches_total,
        trade_avg_confidence=EXCLUDED.trade_avg_confidence,
        trade_tier1_count=EXCLUDED.trade_tier1_count, trade_tier2_count=EXCLUDED.trade_tier2_count,
        trade_tier3_count=EXCLUDED.trade_tier3_count,
        trade_residential_classified=EXCLUDED.trade_residential_classified,
        trade_residential_total=EXCLUDED.trade_residential_total,
        trade_commercial_classified=EXCLUDED.trade_commercial_classified,
        trade_commercial_total=EXCLUDED.trade_commercial_total,
        permits_with_builder=EXCLUDED.permits_with_builder, builders_total=EXCLUDED.builders_total,
        builders_enriched=EXCLUDED.builders_enriched,
        builders_with_phone=EXCLUDED.builders_with_phone, builders_with_email=EXCLUDED.builders_with_email,
        builders_with_website=EXCLUDED.builders_with_website,
        builders_with_google=EXCLUDED.builders_with_google, builders_with_wsib=EXCLUDED.builders_with_wsib,
        permits_with_parcel=EXCLUDED.permits_with_parcel, parcel_exact_matches=EXCLUDED.parcel_exact_matches,
        parcel_name_matches=EXCLUDED.parcel_name_matches, parcel_spatial_matches=EXCLUDED.parcel_spatial_matches,
        parcel_avg_confidence=EXCLUDED.parcel_avg_confidence,
        permits_with_neighbourhood=EXCLUDED.permits_with_neighbourhood,
        permits_geocoded=EXCLUDED.permits_geocoded,
        coa_total=EXCLUDED.coa_total, coa_linked=EXCLUDED.coa_linked,
        coa_avg_confidence=EXCLUDED.coa_avg_confidence,
        coa_high_confidence=EXCLUDED.coa_high_confidence, coa_low_confidence=EXCLUDED.coa_low_confidence,
        permits_with_scope=EXCLUDED.permits_with_scope,
        scope_project_type_breakdown=EXCLUDED.scope_project_type_breakdown,
        permits_with_scope_tags=EXCLUDED.permits_with_scope_tags,
        permits_with_detailed_tags=EXCLUDED.permits_with_detailed_tags,
        scope_tags_top=EXCLUDED.scope_tags_top,
        permits_updated_24h=EXCLUDED.permits_updated_24h, permits_updated_7d=EXCLUDED.permits_updated_7d,
        permits_updated_30d=EXCLUDED.permits_updated_30d,
        last_sync_at=EXCLUDED.last_sync_at, last_sync_status=EXCLUDED.last_sync_status,
        building_footprints_total=EXCLUDED.building_footprints_total,
        parcels_with_buildings=EXCLUDED.parcels_with_buildings,
        null_description_count=EXCLUDED.null_description_count,
        null_builder_name_count=EXCLUDED.null_builder_name_count,
        null_est_const_cost_count=EXCLUDED.null_est_const_cost_count,
        null_street_num_count=EXCLUDED.null_street_num_count,
        null_street_name_count=EXCLUDED.null_street_name_count,
        null_geo_id_count=EXCLUDED.null_geo_id_count,
        violation_cost_out_of_range=EXCLUDED.violation_cost_out_of_range,
        violation_future_issued_date=EXCLUDED.violation_future_issued_date,
        violation_missing_status=EXCLUDED.violation_missing_status,
        violations_total=EXCLUDED.violations_total,
        schema_column_counts=EXCLUDED.schema_column_counts,
        sla_permits_ingestion_hours=EXCLUDED.sla_permits_ingestion_hours,
        inspections_total=EXCLUDED.inspections_total,
        inspections_permits_scraped=EXCLUDED.inspections_permits_scraped,
        inspections_outstanding_count=EXCLUDED.inspections_outstanding_count,
        inspections_passed_count=EXCLUDED.inspections_passed_count,
        inspections_not_passed_count=EXCLUDED.inspections_not_passed_count,
        cost_estimates_total=EXCLUDED.cost_estimates_total,
        cost_estimates_from_permit=EXCLUDED.cost_estimates_from_permit,
        cost_estimates_from_model=EXCLUDED.cost_estimates_from_model,
        cost_estimates_null_cost=EXCLUDED.cost_estimates_null_cost,
        timing_calibration_total=EXCLUDED.timing_calibration_total,
        timing_calibration_avg_sample=EXCLUDED.timing_calibration_avg_sample,
        timing_calibration_freshness_hours=EXCLUDED.timing_calibration_freshness_hours,
        created_at=NOW()
      RETURNING (xmax::text::int = 0) AS is_insert, snapshot_date, permits_with_neighbourhood, active_permits, coa_total, coa_linked, permits_with_scope, permits_with_scope_tags, permits_with_detailed_tags`,
      [
        total_permits, active_permits,
        safeParsePositiveInt(t.permits_with_trades, 'permits_with_trades'), safeParsePositiveInt(t.total_matches, 'total_matches'),
        t.avg_confidence ? safeParseFloat(t.avg_confidence, 'avg_confidence') : null,
        safeParsePositiveInt(t.tier1, 'tier1'), safeParsePositiveInt(t.tier2, 'tier2'), safeParsePositiveInt(t.tier3, 'tier3'),
        safeParsePositiveInt(tt.res_classified, 'res_classified'), safeParsePositiveInt(tt.res_total, 'res_total'),
        safeParsePositiveInt(tt.com_classified, 'com_classified'), safeParsePositiveInt(tt.com_total, 'com_total'),
        safeParsePositiveInt(s.permits_with_builder, 'permits_with_builder'), safeParsePositiveInt(b.total, 'total'),
        safeParsePositiveInt(b.enriched, 'enriched'), safeParsePositiveInt(b.with_phone, 'with_phone'), safeParsePositiveInt(b.with_email, 'with_email'),
        safeParsePositiveInt(b.with_website, 'with_website'), safeParsePositiveInt(b.with_google, 'with_google'), safeParsePositiveInt(b.with_wsib, 'with_wsib'),
        safeParsePositiveInt(p.permits_with_parcel, 'permits_with_parcel'), safeParsePositiveInt(p.exact_matches, 'exact_matches'),
        safeParsePositiveInt(p.name_matches, 'name_matches'), safeParsePositiveInt(p.spatial_matches, 'spatial_matches'),
        p.avg_confidence ? safeParseFloat(p.avg_confidence, 'avg_confidence') : null,
        neighbourhood_count,
        safeParsePositiveInt(s.geocoded_count, 'geocoded_count'),
        safeParsePositiveInt(c.total, 'total'), safeParsePositiveInt(c.linked, 'linked'),
        c.avg_confidence ? safeParseFloat(c.avg_confidence, 'avg_confidence') : null,
        safeParsePositiveInt(c.high_confidence, 'high_confidence'), safeParsePositiveInt(c.low_confidence, 'low_confidence'),
        safeParsePositiveInt(s.scope_count, 'scope_count'), JSON.stringify(breakdown),
        scopeTagsCount, detailedTagsCount, JSON.stringify(tagsTop),
        safeParsePositiveInt(s.updated_24h, 'updated_24h'), safeParsePositiveInt(s.updated_7d, 'updated_7d'),
        safeParsePositiveInt(s.updated_30d, 'updated_30d'),
        syncRes.rows[0]?.started_at || null, syncRes.rows[0]?.status || null,
        massing.footprints_total, massing.parcels_with_buildings,
        safeParsePositiveInt(n.null_description, 'null_description'), safeParsePositiveInt(n.null_builder_name, 'null_builder_name'), safeParsePositiveInt(n.null_est_const_cost, 'null_est_const_cost'),
        safeParsePositiveInt(n.null_street_num, 'null_street_num'), safeParsePositiveInt(n.null_street_name, 'null_street_name'), safeParsePositiveInt(n.null_geo_id, 'null_geo_id'),
        safeParsePositiveInt(v.cost_oor, 'cost_oor'), safeParsePositiveInt(v.future_issued, 'future_issued'), safeParsePositiveInt(v.missing_status, 'missing_status'), violations_total,
        JSON.stringify(schemaColumnCounts), slaHours,
        insp.total, insp.permits_scraped, insp.outstanding, insp.passed, insp.not_passed,
        costEst.total, costEst.from_permit, costEst.from_model, costEst.null_cost,
        timingCal.total, timingCal.avg_sample, timingCal.freshness_hours,
      ]
    );

    const r = result.rows[0];
    isNew = r.is_insert ? 1 : 0;
    isUpdate = r.is_insert ? 0 : 1;
    pipeline.log.info(TAG, `Snapshot ${r.is_insert ? 'inserted' : 'updated'} for ${r.snapshot_date}:`);
    pipeline.log.info(TAG, `  Neighbourhoods: ${r.permits_with_neighbourhood} / ${r.active_permits} = ${(r.permits_with_neighbourhood/r.active_permits*100).toFixed(1)}%`);
    pipeline.log.info(TAG, `  CoA: ${r.coa_linked} / ${r.coa_total} = ${(r.coa_linked/r.coa_total*100).toFixed(1)}%`);
    pipeline.log.info(TAG, `  Scope Class: ${r.permits_with_scope} classified`);
    pipeline.log.info(TAG, `  Scope Tags: ${r.permits_with_scope_tags} total, ${r.permits_with_detailed_tags} detailed`);
  });

  const duration_ms = Date.now() - t0;
  pipeline.log.info(TAG, `Done in ${duration_ms}ms`);

  // Chain-aware phase number
  const chainId = process.env.PIPELINE_CHAIN || null;
  const snapshotPhase = chainId === 'sources' ? 13 : chainId === 'coa' ? 7 : 18;
  pipeline.emitSummary({
    records_total: 1, records_new: isNew, records_updated: isUpdate,
    records_meta: {
      duration_ms,
      audit_table: {
        phase: snapshotPhase,
        name: 'Refresh Snapshot',
        verdict: 'PASS',
        rows: [
          { metric: 'snapshots_created', value: isNew, threshold: null, status: 'INFO' },
          { metric: 'snapshots_updated', value: isUpdate, threshold: null, status: 'INFO' },
          // CoA cost coverage + servable-CoA funnel (WF2 P5) — INFO (inform, don't gate yet).
          { metric: 'coa_cost_coverage_pct', value: coaFunnel.corpus_cov_pct, threshold: null, status: 'INFO' },
          { metric: 'coa_cost_coverage_open_pct', value: coaFunnel.open_cov_pct, threshold: null, status: 'INFO' },
          { metric: 'servable_coa_funnel_total', value: coaFunnel.total, threshold: null, status: 'INFO' },
          { metric: 'servable_coa_funnel_geo_open', value: coaFunnel.open, threshold: null, status: 'INFO' },
          { metric: 'servable_coa_funnel_cost', value: coaFunnel.cost, threshold: null, status: 'INFO' },
          { metric: 'servable_coa_funnel_fresh_forecast', value: coaFunnel.forecast, threshold: null, status: 'INFO' },
          { metric: 'servable_coa_funnel_score', value: coaFunnel.score, threshold: null, status: 'INFO' },
        ],
      },
    },
  });
  pipeline.emitMeta({ "permits": ["*"], "permit_trades": ["*"], "entities": ["*"], "permit_parcels": ["*"], "coa_applications": ["*"], "sync_runs": ["*"], "building_footprints": ["*"], "parcel_buildings": ["*"], "permit_inspections": ["*"], "cost_estimates": ["cost_source", "estimated_cost"], "lead_parcels": ["lead_id"], "trade_forecasts": ["lead_id", "urgency", "opportunity_score"] }, { "data_quality_snapshots": ["*"] });
  }); // withAdvisoryLock

  if (!lockResult.acquired) return;
}

// WF3 F1 (2026-08-15) — guard the CLI body so this module is safe to `require()`
// from a test process (C1 precedent, assert-lifecycle-phase-distribution.js):
// without it, requiring refresh-snapshot.js to reach the exported query builders
// below would immediately try to create a real DB pool and run the script.
if (require.main === module) {
  pipeline.run('refresh-snapshot', runRefreshSnapshot);
}

module.exports = {
  ACTIVE_PERMIT_STATUSES,
  buildPermitsScalarQuery,
  buildTagBreakdownQuery,
  buildTradeByTypeQuery,
  splitTagBreakdown,
};
