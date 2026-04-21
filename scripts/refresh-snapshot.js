#!/usr/bin/env node
// SPEC LINK: docs/specs/pipeline/41_chain_permits.md
// SPEC LINK: docs/specs/pipeline/42_chain_coa.md
// SPEC LINK: docs/specs/pipeline/43_chain_sources.md
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

pipeline.run('refresh-snapshot', async (pool) => {
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
  let permitsRes, tradesRes, tradeByTypeRes, buildersRes, permitsBuilderRes, parcelsRes, nhoodRes, geoRes;
  let coaRes, scopeRes, scopeTagsRes, detailedTagsRes, topTagsRes, scopeBreakdownRes;
  let freshRes, syncRes, nullsRes, violationsRes;

  try {
    permitsRes = await snapClient.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')) as active
       FROM permits`
    );
    tradesRes = await snapClient.query(
      `SELECT COUNT(DISTINCT (permit_num, revision_num)) as permits_with_trades,
              COUNT(*) as total_matches,
              AVG(confidence)::NUMERIC(4,3) as avg_confidence,
              COUNT(*) FILTER (WHERE tier = 1) as tier1,
              COUNT(*) FILTER (WHERE tier = 2) as tier2,
              COUNT(*) FILTER (WHERE tier = 3) as tier3
       FROM permit_trades`
    );
    tradeByTypeRes = await snapClient.query(
      `SELECT
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
       WHERE p.status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')`
    );
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
    permitsBuilderRes = await snapClient.query(
      `SELECT COUNT(*) as count FROM permits WHERE builder_name IS NOT NULL AND builder_name != ''`
    );
    parcelsRes = await snapClient.query(
      `SELECT COUNT(DISTINCT (permit_num, revision_num)) as permits_with_parcel,
              COUNT(*) FILTER (WHERE match_type = 'exact_address') as exact_matches,
              COUNT(*) FILTER (WHERE match_type = 'name_only') as name_matches,
              COUNT(*) FILTER (WHERE match_type = 'spatial') as spatial_matches,
              AVG(confidence)::NUMERIC(4,3) as avg_confidence
       FROM permit_parcels`
    );
    nhoodRes = await snapClient.query(
      `SELECT COUNT(*) as count FROM permits
       WHERE neighbourhood_id IS NOT NULL AND neighbourhood_id != -1
         AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')`
    );
    geoRes = await snapClient.query(
      `SELECT COUNT(*) as count FROM permits WHERE latitude IS NOT NULL AND longitude IS NOT NULL`
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
    scopeRes = await snapClient.query(
      `SELECT COUNT(*) as count FROM permits
       WHERE ('residential' = ANY(scope_tags) OR 'commercial' = ANY(scope_tags) OR 'mixed-use' = ANY(scope_tags))
         AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')`
    );
    scopeTagsRes = await snapClient.query(
      `SELECT COUNT(*) as count FROM permits
       WHERE scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0
         AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')`
    );
    detailedTagsRes = await snapClient.query(
      `SELECT COUNT(*) as count FROM permits
       WHERE scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0
         AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')
         AND EXISTS (SELECT 1 FROM unnest(scope_tags) AS t WHERE t NOT IN ('residential', 'commercial', 'mixed-use'))`
    );
    topTagsRes = await snapClient.query(
      `SELECT tag, COUNT(*) as count
       FROM (SELECT unnest(scope_tags) as tag FROM permits
             WHERE scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0
               AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')) sub
       WHERE tag NOT IN ('residential', 'commercial', 'mixed-use')
       GROUP BY tag ORDER BY count DESC LIMIT 10`
    );
    scopeBreakdownRes = await snapClient.query(
      `SELECT tag, COUNT(*) as count
       FROM (SELECT unnest(scope_tags) as tag FROM permits
             WHERE scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0
               AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')) sub
       WHERE tag IN ('residential', 'commercial', 'mixed-use')
       GROUP BY tag`
    );
    freshRes = await snapClient.query(
      `SELECT COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '24 hours') as updated_24h,
              COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '7 days') as updated_7d,
              COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '30 days') as updated_30d
       FROM permits`
    );
    syncRes = await snapClient.query(
      `SELECT started_at, status FROM sync_runs ORDER BY started_at DESC LIMIT 1`
    );
    nullsRes = await snapClient.query(
      `SELECT
         COUNT(*) FILTER (WHERE description IS NULL OR description = '') as null_description,
         COUNT(*) FILTER (WHERE builder_name IS NULL OR builder_name = '') as null_builder_name,
         COUNT(*) FILTER (WHERE est_const_cost IS NULL) as null_est_const_cost,
         COUNT(*) FILTER (WHERE street_num IS NULL OR street_num = '') as null_street_num,
         COUNT(*) FILTER (WHERE street_name IS NULL OR street_name = '') as null_street_name,
         COUNT(*) FILTER (WHERE geo_id IS NULL OR geo_id = '') as null_geo_id
       FROM permits
       WHERE status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')`
    );
    violationsRes = await snapClient.query(
      `SELECT
         COUNT(*) FILTER (WHERE est_const_cost IS NOT NULL AND (est_const_cost < 100 OR est_const_cost > 1000000000)) as cost_oor,
         COUNT(*) FILTER (WHERE issued_date > NOW()) as future_issued,
         COUNT(*) FILTER (WHERE status IS NULL OR status = '') as missing_status
       FROM permits
       WHERE status IN ('Permit Issued','Revision Issued','Under Review','Inspection','Examination')`
    );

    await snapClient.query('COMMIT');
  } finally {
    snapClient.release();
  }

  // Extract results — declared in outer scope so pipeline.withTransaction can access them
  const total_permits = safeParsePositiveInt(permitsRes.rows[0].total, 'total');
  const active_permits = safeParsePositiveInt(permitsRes.rows[0].active, 'active');
  pipeline.log.info(TAG, `Permits: ${total_permits} total, ${active_permits} active`);

  const t = tradesRes.rows[0];
  const tt = tradeByTypeRes.rows[0];

  const b = buildersRes.rows[0];

  const p = parcelsRes.rows[0];

  const neighbourhood_count = safeParsePositiveInt(nhoodRes.rows[0].count, 'count');
  pipeline.log.info(TAG, `Neighbourhoods (active): ${neighbourhood_count} / ${active_permits} = ${active_permits > 0 ? (neighbourhood_count/active_permits*100).toFixed(1) : '0.0'}%`);

  const c = coaRes.rows[0];
  const coaTotal = safeParsePositiveInt(c.total, 'total');
  pipeline.log.info(TAG, `CoA: ${c.total} total, ${c.linked} linked = ${coaTotal > 0 ? (safeParsePositiveInt(c.linked, 'linked')/coaTotal*100).toFixed(1) : '0.0'}%`);

  const breakdown = {};
  for (const r of scopeBreakdownRes.rows) breakdown[r.tag] = safeParsePositiveInt(r.count, 'count');

  const tagsTop = {};
  for (const r of topTagsRes.rows) tagsTop[r.tag] = safeParsePositiveInt(r.count, 'count');
  pipeline.log.info(TAG, `Scope tags: ${scopeTagsRes.rows[0].count} total, ${detailedTagsRes.rows[0].count} detailed`);
  pipeline.log.info(TAG, `Top tags: ${Object.entries(tagsTop).slice(0,5).map(([k,v])=>k+':'+v).join(', ')}`);

  const n = nullsRes.rows[0];
  pipeline.log.info(TAG, `Nulls: desc=${n.null_description}, builder=${n.null_builder_name}, cost=${n.null_est_const_cost}`);

  const v = violationsRes.rows[0];
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
  let costEst = { total: 0, from_permit: 0, from_model: 0, null_cost: 0 };
  try {
    const costRes = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE cost_source = 'permit') as from_permit,
              COUNT(*) FILTER (WHERE cost_source = 'model') as from_model,
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
    pipeline.log.info(TAG, `Cost Estimates: ${costEst.total} total (${costEst.from_permit} permit, ${costEst.from_model} model, ${costEst.null_cost} null)`);
  } catch (err) {
    pipeline.log.warn(TAG, `Cost estimates query failed — zeroes: ${err.message}`);
  }

  // ── Timing calibration coverage ──
  let timingCal = { total: 0, avg_sample: 0, freshness_hours: null };
  try {
    const timingRes = await pool.query(
      `SELECT COUNT(*) as total,
              COALESCE(ROUND(AVG(sample_size))::int, 0) as avg_sample,
              ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(computed_at))) / 3600.0, 1) as freshness_hours
       FROM timing_calibration`
    );
    const tr = timingRes.rows[0];
    timingCal = {
      total: safeParsePositiveInt(tr.total, 'total'),
      avg_sample: safeParsePositiveInt(tr.avg_sample, 'avg_sample'),
      freshness_hours: tr.freshness_hours !== null ? safeParseFloat(tr.freshness_hours, 'freshness_hours') : null,
    };
    pipeline.log.info(TAG, `Timing Calibration: ${timingCal.total} permit_types, avg sample=${timingCal.avg_sample}, freshness=${timingCal.freshness_hours}h`);
  } catch (err) {
    pipeline.log.warn(TAG, `Timing calibration query failed — zeroes: ${err.message}`);
  }

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
        safeParsePositiveInt(permitsBuilderRes.rows[0].count, 'count'), safeParsePositiveInt(b.total, 'total'),
        safeParsePositiveInt(b.enriched, 'enriched'), safeParsePositiveInt(b.with_phone, 'with_phone'), safeParsePositiveInt(b.with_email, 'with_email'),
        safeParsePositiveInt(b.with_website, 'with_website'), safeParsePositiveInt(b.with_google, 'with_google'), safeParsePositiveInt(b.with_wsib, 'with_wsib'),
        safeParsePositiveInt(p.permits_with_parcel, 'permits_with_parcel'), safeParsePositiveInt(p.exact_matches, 'exact_matches'),
        safeParsePositiveInt(p.name_matches, 'name_matches'), safeParsePositiveInt(p.spatial_matches, 'spatial_matches'),
        p.avg_confidence ? safeParseFloat(p.avg_confidence, 'avg_confidence') : null,
        neighbourhood_count,
        safeParsePositiveInt(geoRes.rows[0].count, 'count'),
        safeParsePositiveInt(c.total, 'total'), safeParsePositiveInt(c.linked, 'linked'),
        c.avg_confidence ? safeParseFloat(c.avg_confidence, 'avg_confidence') : null,
        safeParsePositiveInt(c.high_confidence, 'high_confidence'), safeParsePositiveInt(c.low_confidence, 'low_confidence'),
        safeParsePositiveInt(scopeRes.rows[0].count, 'count'), JSON.stringify(breakdown),
        safeParsePositiveInt(scopeTagsRes.rows[0].count, 'count'), safeParsePositiveInt(detailedTagsRes.rows[0].count, 'count'), JSON.stringify(tagsTop),
        safeParsePositiveInt(freshRes.rows[0].updated_24h, 'updated_24h'), safeParsePositiveInt(freshRes.rows[0].updated_7d, 'updated_7d'),
        safeParsePositiveInt(freshRes.rows[0].updated_30d, 'updated_30d'),
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
        ],
      },
    },
  });
  pipeline.emitMeta({ "permits": ["*"], "permit_trades": ["*"], "entities": ["*"], "permit_parcels": ["*"], "coa_applications": ["*"], "sync_runs": ["*"], "building_footprints": ["*"], "parcel_buildings": ["*"], "permit_inspections": ["*"], "cost_estimates": ["cost_source", "estimated_cost"], "timing_calibration": ["computed_at", "sample_size"] }, { "data_quality_snapshots": ["*"] });
  }); // withAdvisoryLock

  if (!lockResult.acquired) return;
});
