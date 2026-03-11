#!/usr/bin/env node
// Refresh the data quality snapshot by re-running all counting queries
// Usage: node scripts/refresh-snapshot.js

const pipeline = require('./lib/pipeline');

pipeline.run('refresh-snapshot', async (pool) => {
  console.log('Recapturing data quality snapshot...\n');

  // 1. Permit counts
  const permits = await pool.query(
    `SELECT COUNT(*) as total,
            COUNT(*) FILTER (WHERE status IN ('Permit Issued','Revision Issued','Under Review','Inspection')) as active
     FROM permits`
  );
  const total_permits = parseInt(permits.rows[0].total);
  const active_permits = parseInt(permits.rows[0].active);
  console.log(`Permits: ${total_permits} total, ${active_permits} active`);

  // 2. Trade counts (all classifications, not just phase-active)
  const trades = await pool.query(
    `SELECT COUNT(DISTINCT (permit_num, revision_num)) as permits_with_trades,
            COUNT(*) as total_matches,
            AVG(confidence)::NUMERIC(4,3) as avg_confidence,
            COUNT(*) FILTER (WHERE tier = 1) as tier1,
            COUNT(*) FILTER (WHERE tier = 2) as tier2,
            COUNT(*) FILTER (WHERE tier = 3) as tier3
     FROM permit_trades`
  );
  const t = trades.rows[0];

  // 2b. Trade counts by use-type
  const tradeByType = await pool.query(
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
     WHERE p.status IN ('Permit Issued','Revision Issued','Under Review','Inspection')`
  );
  const tt = tradeByType.rows[0];

  // 3. Builder counts
  const builders = await pool.query(
    `SELECT COUNT(*) as total,
            COUNT(*) FILTER (WHERE last_enriched_at IS NOT NULL) as enriched,
            COUNT(*) FILTER (WHERE primary_phone IS NOT NULL) as with_phone,
            COUNT(*) FILTER (WHERE primary_email IS NOT NULL) as with_email,
            COUNT(*) FILTER (WHERE website IS NOT NULL) as with_website,
            COUNT(*) FILTER (WHERE google_place_id IS NOT NULL) as with_google,
            COUNT(*) FILTER (WHERE is_wsib_registered = true) as with_wsib
     FROM entities`
  );
  const b = builders.rows[0];
  const permitsBuilder = await pool.query(
    `SELECT COUNT(*) as count FROM permits WHERE builder_name IS NOT NULL AND builder_name != ''`
  );

  // 4. Parcel counts
  const parcels = await pool.query(
    `SELECT COUNT(DISTINCT (permit_num, revision_num)) as permits_with_parcel,
            COUNT(*) FILTER (WHERE match_type = 'exact_address') as exact_matches,
            COUNT(*) FILTER (WHERE match_type = 'name_only') as name_matches,
            COUNT(*) FILTER (WHERE match_type = 'spatial') as spatial_matches,
            AVG(confidence)::NUMERIC(4,3) as avg_confidence
     FROM permit_parcels`
  );
  const p = parcels.rows[0];

  // 5. Neighbourhood count (FIXED: active only)
  const nhood = await pool.query(
    `SELECT COUNT(*) as count FROM permits
     WHERE neighbourhood_id IS NOT NULL
       AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection')`
  );
  const neighbourhood_count = parseInt(nhood.rows[0].count);
  console.log(`Neighbourhoods (active): ${neighbourhood_count} / ${active_permits} = ${(neighbourhood_count/active_permits*100).toFixed(1)}%`);

  // 6. Geocoding
  const geo = await pool.query(
    `SELECT COUNT(*) as count FROM permits WHERE latitude IS NOT NULL AND longitude IS NOT NULL`
  );

  // 7. CoA counts
  const coa = await pool.query(
    `SELECT COUNT(*) as total,
            COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL) as linked,
            AVG(linked_confidence) FILTER (WHERE linked_permit_num IS NOT NULL)::NUMERIC(4,3) as avg_confidence,
            COUNT(*) FILTER (WHERE linked_confidence >= 0.80) as high_confidence,
            COUNT(*) FILTER (WHERE linked_confidence IS NOT NULL AND linked_confidence < 0.50) as low_confidence
     FROM coa_applications`
  );
  const c = coa.rows[0];
  console.log(`CoA: ${c.total} total, ${c.linked} linked = ${(parseInt(c.linked)/parseInt(c.total)*100).toFixed(1)}%`);

  // 8. Scope counts — active permits with residential/commercial/mixed-use tag
  const scope = await pool.query(
    `SELECT COUNT(*) as count FROM permits
     WHERE ('residential' = ANY(scope_tags) OR 'commercial' = ANY(scope_tags) OR 'mixed-use' = ANY(scope_tags))
       AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection')`
  );
  const scopeBreakdown = await pool.query(
    `SELECT tag, COUNT(*) as count
     FROM (SELECT unnest(scope_tags) as tag FROM permits
           WHERE scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0
             AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection')) sub
     WHERE tag IN ('residential', 'commercial', 'mixed-use')
     GROUP BY tag`
  );
  const breakdown = {};
  for (const r of scopeBreakdown.rows) breakdown[r.tag] = parseInt(r.count);

  // 9. Scope tags counts — active permits only
  const scopeTags = await pool.query(
    `SELECT COUNT(*) as count FROM permits
     WHERE scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0
       AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection')`
  );
  // Detailed tags: active permits with at least one tag beyond residential/commercial
  const detailedTags = await pool.query(
    `SELECT COUNT(*) as count FROM permits
     WHERE scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0
       AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection')
       AND EXISTS (SELECT 1 FROM unnest(scope_tags) AS t WHERE t NOT IN ('residential', 'commercial', 'mixed-use'))`
  );
  const topTags = await pool.query(
    `SELECT tag, COUNT(*) as count
     FROM (SELECT unnest(scope_tags) as tag FROM permits
           WHERE scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0
             AND status IN ('Permit Issued','Revision Issued','Under Review','Inspection')) sub
     WHERE tag NOT IN ('residential', 'commercial', 'mixed-use')
     GROUP BY tag ORDER BY count DESC LIMIT 10`
  );
  const tagsTop = {};
  for (const r of topTags.rows) tagsTop[r.tag] = parseInt(r.count);
  console.log(`Scope tags: ${scopeTags.rows[0].count} total, ${detailedTags.rows[0].count} detailed`);
  console.log(`Top tags: ${Object.entries(tagsTop).slice(0,5).map(([k,v])=>k+':'+v).join(', ')}`);

  // 10. Freshness
  const fresh = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '24 hours') as updated_24h,
            COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '7 days') as updated_7d,
            COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '30 days') as updated_30d
     FROM permits`
  );

  // 11. Last sync
  const sync = await pool.query(
    `SELECT started_at, status FROM sync_runs ORDER BY started_at DESC LIMIT 1`
  );

  // 12. Massing
  let massing = { footprints_total: 0, parcels_with_buildings: 0 };
  try {
    const m = await pool.query(
      `SELECT (SELECT COUNT(*) FROM building_footprints) as footprints_total,
              (SELECT COUNT(DISTINCT parcel_id) FROM parcel_buildings) as parcels_with_buildings`
    );
    massing = { footprints_total: parseInt(m.rows[0].footprints_total), parcels_with_buildings: parseInt(m.rows[0].parcels_with_buildings) };
  } catch (err) { pipeline.log.warn('[refresh-snapshot]', `Massing query failed: ${err.message}`); }

  // 13. Null counts (active permits only)
  const nulls = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE description IS NULL OR description = '') as null_description,
       COUNT(*) FILTER (WHERE builder_name IS NULL OR builder_name = '') as null_builder_name,
       COUNT(*) FILTER (WHERE est_const_cost IS NULL) as null_est_const_cost,
       COUNT(*) FILTER (WHERE street_num IS NULL OR street_num = '') as null_street_num,
       COUNT(*) FILTER (WHERE street_name IS NULL OR street_name = '') as null_street_name,
       COUNT(*) FILTER (WHERE geo_id IS NULL OR geo_id = '') as null_geo_id
     FROM permits
     WHERE status IN ('Permit Issued','Revision Issued','Under Review','Inspection')`
  );
  const n = nulls.rows[0];
  console.log(`Nulls: desc=${n.null_description}, builder=${n.null_builder_name}, cost=${n.null_est_const_cost}`);

  // 14. Violations
  const violations = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE est_const_cost IS NOT NULL AND (est_const_cost < 100 OR est_const_cost > 1000000000)) as cost_oor,
       COUNT(*) FILTER (WHERE issued_date > NOW()) as future_issued,
       COUNT(*) FILTER (WHERE status IS NULL OR status = '') as missing_status
     FROM permits
     WHERE status IN ('Permit Issued','Revision Issued','Under Review','Inspection')`
  );
  const v = violations.rows[0];
  const violations_total = parseInt(v.cost_oor) + parseInt(v.future_issued) + parseInt(v.missing_status);
  console.log(`Violations: cost_oor=${v.cost_oor}, future_issued=${v.future_issued}, missing_status=${v.missing_status}, total=${violations_total}`);

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
    for (const row of schemaCols.rows) schemaColumnCounts[row.table_name] = parseInt(row.col_count);
  } catch (err) { pipeline.log.warn('[refresh-snapshot]', `Schema column count query failed: ${err.message}`); }

  // 16. SLA metrics
  let slaHours = null;
  try {
    const sla = await pool.query(
      `SELECT EXTRACT(EPOCH FROM (NOW() - MAX(first_seen_at))) / 3600 as hours FROM permits`
    );
    slaHours = sla.rows[0]?.hours ? Math.round(parseFloat(sla.rows[0].hours) * 100) / 100 : null;
  } catch (err) { pipeline.log.warn('[refresh-snapshot]', `SLA query failed: ${err.message}`); }

  // UPSERT snapshot
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
        schema_column_counts, sla_permits_ingestion_hours
      ) VALUES (
        CURRENT_DATE,
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54,$55,$56
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
        created_at=NOW()
      RETURNING snapshot_date, permits_with_neighbourhood, active_permits, coa_total, coa_linked, permits_with_scope, permits_with_scope_tags, permits_with_detailed_tags`,
      [
        total_permits, active_permits,
        parseInt(t.permits_with_trades), parseInt(t.total_matches),
        t.avg_confidence ? parseFloat(t.avg_confidence) : null,
        parseInt(t.tier1), parseInt(t.tier2), parseInt(t.tier3),
        parseInt(tt.res_classified), parseInt(tt.res_total),
        parseInt(tt.com_classified), parseInt(tt.com_total),
        parseInt(permitsBuilder.rows[0].count), parseInt(b.total),
        parseInt(b.enriched), parseInt(b.with_phone), parseInt(b.with_email),
        parseInt(b.with_website), parseInt(b.with_google), parseInt(b.with_wsib),
        parseInt(p.permits_with_parcel), parseInt(p.exact_matches),
        parseInt(p.name_matches), parseInt(p.spatial_matches),
        p.avg_confidence ? parseFloat(p.avg_confidence) : null,
        neighbourhood_count,
        parseInt(geo.rows[0].count),
        parseInt(c.total), parseInt(c.linked),
        c.avg_confidence ? parseFloat(c.avg_confidence) : null,
        parseInt(c.high_confidence), parseInt(c.low_confidence),
        parseInt(scope.rows[0].count), JSON.stringify(breakdown),
        parseInt(scopeTags.rows[0].count), parseInt(detailedTags.rows[0].count), JSON.stringify(tagsTop),
        parseInt(fresh.rows[0].updated_24h), parseInt(fresh.rows[0].updated_7d),
        parseInt(fresh.rows[0].updated_30d),
        sync.rows[0]?.started_at || null, sync.rows[0]?.status || null,
        massing.footprints_total, massing.parcels_with_buildings,
        parseInt(n.null_description), parseInt(n.null_builder_name), parseInt(n.null_est_const_cost),
        parseInt(n.null_street_num), parseInt(n.null_street_name), parseInt(n.null_geo_id),
        parseInt(v.cost_oor), parseInt(v.future_issued), parseInt(v.missing_status), violations_total,
        JSON.stringify(schemaColumnCounts), slaHours,
      ]
    );

    const r = result.rows[0];
    console.log(`\nSnapshot upserted for ${r.snapshot_date}:`);
    console.log(`  Neighbourhoods: ${r.permits_with_neighbourhood} / ${r.active_permits} = ${(r.permits_with_neighbourhood/r.active_permits*100).toFixed(1)}%`);
    console.log(`  CoA: ${r.coa_linked} / ${r.coa_total} = ${(r.coa_linked/r.coa_total*100).toFixed(1)}%`);
    console.log(`  Scope Class: ${r.permits_with_scope} classified`);
    console.log(`  Scope Tags: ${r.permits_with_scope_tags} total, ${r.permits_with_detailed_tags} detailed`);
    console.log('\nDone!');
  });

  pipeline.emitSummary({ records_total: 1, records_new: 1, records_updated: 0 });
  pipeline.emitMeta({ "permits": ["*"], "permit_trades": ["*"], "entities": ["*"], "permit_parcels": ["*"], "coa_applications": ["*"], "sync_runs": ["*"], "building_footprints": ["*"], "parcel_buildings": ["*"] }, { "data_quality_snapshots": ["*"] });
});
