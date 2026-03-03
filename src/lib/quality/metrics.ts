import { query } from '@/lib/db/client';
import type { DataQualitySnapshot } from './types';

/**
 * Coerce NUMERIC(4,3) columns from strings (as node-postgres returns them)
 * to proper numbers. Preserves null and already-numeric values.
 */
export function parseSnapshot(raw: DataQualitySnapshot): DataQualitySnapshot {
  return {
    ...raw,
    trade_avg_confidence: raw.trade_avg_confidence != null ? Number(raw.trade_avg_confidence) : null,
    parcel_avg_confidence: raw.parcel_avg_confidence != null ? Number(raw.parcel_avg_confidence) : null,
    coa_avg_confidence: raw.coa_avg_confidence != null ? Number(raw.coa_avg_confidence) : null,
  };
}

/**
 * Capture a full data quality snapshot by running counting queries across
 * all six matching processes. Inserts (or updates) a row in
 * `data_quality_snapshots` for today's date and returns it.
 */
export async function captureDataQualitySnapshot(): Promise<DataQualitySnapshot> {
  // Run all independent queries in parallel
  const [
    permitCounts,
    tradeCounts,
    builderCounts,
    parcelCounts,
    neighbourhoodCount,
    geocodingCount,
    coaCounts,
    scopeCounts,
    freshnessCounts,
    lastSync,
    massingCounts,
  ] = await Promise.all([
    queryPermitCounts(),
    queryTradeCounts(),
    queryBuilderCounts(),
    queryParcelCounts(),
    queryNeighbourhoodCount(),
    queryGeocodingCount(),
    queryCoaCounts(),
    queryScopeCounts(),
    queryFreshnessCounts(),
    queryLastSync(),
    queryMassingCounts(),
  ]);

  const row = {
    total_permits: permitCounts.total,
    active_permits: permitCounts.active,
    permits_with_trades: tradeCounts.permits_with_trades,
    trade_matches_total: tradeCounts.total_matches,
    trade_avg_confidence: tradeCounts.avg_confidence,
    trade_tier1_count: tradeCounts.tier1,
    trade_tier2_count: tradeCounts.tier2,
    trade_tier3_count: tradeCounts.tier3,
    trade_residential_classified: tradeCounts.trade_residential_classified,
    trade_residential_total: tradeCounts.trade_residential_total,
    trade_commercial_classified: tradeCounts.trade_commercial_classified,
    trade_commercial_total: tradeCounts.trade_commercial_total,
    permits_with_builder: builderCounts.permits_with_builder,
    builders_total: builderCounts.total,
    builders_enriched: builderCounts.enriched,
    builders_with_phone: builderCounts.with_phone,
    builders_with_email: builderCounts.with_email,
    builders_with_website: builderCounts.with_website,
    builders_with_google: builderCounts.with_google,
    builders_with_wsib: builderCounts.with_wsib,
    permits_with_parcel: parcelCounts.permits_with_parcel,
    parcel_exact_matches: parcelCounts.exact_matches,
    parcel_name_matches: parcelCounts.name_matches,
    parcel_spatial_matches: parcelCounts.spatial_matches,
    parcel_avg_confidence: parcelCounts.avg_confidence,
    permits_with_neighbourhood: neighbourhoodCount,
    permits_geocoded: geocodingCount,
    coa_total: coaCounts.total,
    coa_linked: coaCounts.linked,
    coa_avg_confidence: coaCounts.avg_confidence,
    coa_high_confidence: coaCounts.high_confidence,
    coa_low_confidence: coaCounts.low_confidence,
    permits_with_scope: scopeCounts.permits_with_scope,
    scope_project_type_breakdown: scopeCounts.breakdown,
    permits_with_scope_tags: scopeCounts.permits_with_scope_tags,
    permits_with_detailed_tags: scopeCounts.permits_with_detailed_tags,
    scope_tags_top: scopeCounts.scope_tags_top,
    permits_updated_24h: freshnessCounts.updated_24h,
    permits_updated_7d: freshnessCounts.updated_7d,
    permits_updated_30d: freshnessCounts.updated_30d,
    last_sync_at: lastSync.last_sync_at,
    last_sync_status: lastSync.last_sync_status,
    building_footprints_total: massingCounts.footprints_total,
    parcels_with_buildings: massingCounts.parcels_with_buildings,
  };

  const result = await query<DataQualitySnapshot>(
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
      building_footprints_total, parcels_with_buildings
    ) VALUES (
      CURRENT_DATE,
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
      $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
      $41, $42, $43, $44
    )
    ON CONFLICT (snapshot_date) DO UPDATE SET
      total_permits = EXCLUDED.total_permits,
      active_permits = EXCLUDED.active_permits,
      permits_with_trades = EXCLUDED.permits_with_trades,
      trade_matches_total = EXCLUDED.trade_matches_total,
      trade_avg_confidence = EXCLUDED.trade_avg_confidence,
      trade_tier1_count = EXCLUDED.trade_tier1_count,
      trade_tier2_count = EXCLUDED.trade_tier2_count,
      trade_tier3_count = EXCLUDED.trade_tier3_count,
      trade_residential_classified = EXCLUDED.trade_residential_classified,
      trade_residential_total = EXCLUDED.trade_residential_total,
      trade_commercial_classified = EXCLUDED.trade_commercial_classified,
      trade_commercial_total = EXCLUDED.trade_commercial_total,
      permits_with_builder = EXCLUDED.permits_with_builder,
      builders_total = EXCLUDED.builders_total,
      builders_enriched = EXCLUDED.builders_enriched,
      builders_with_phone = EXCLUDED.builders_with_phone,
      builders_with_email = EXCLUDED.builders_with_email,
      builders_with_website = EXCLUDED.builders_with_website,
      builders_with_google = EXCLUDED.builders_with_google,
      builders_with_wsib = EXCLUDED.builders_with_wsib,
      permits_with_parcel = EXCLUDED.permits_with_parcel,
      parcel_exact_matches = EXCLUDED.parcel_exact_matches,
      parcel_name_matches = EXCLUDED.parcel_name_matches,
      parcel_spatial_matches = EXCLUDED.parcel_spatial_matches,
      parcel_avg_confidence = EXCLUDED.parcel_avg_confidence,
      permits_with_neighbourhood = EXCLUDED.permits_with_neighbourhood,
      permits_geocoded = EXCLUDED.permits_geocoded,
      coa_total = EXCLUDED.coa_total,
      coa_linked = EXCLUDED.coa_linked,
      coa_avg_confidence = EXCLUDED.coa_avg_confidence,
      coa_high_confidence = EXCLUDED.coa_high_confidence,
      coa_low_confidence = EXCLUDED.coa_low_confidence,
      permits_with_scope = EXCLUDED.permits_with_scope,
      scope_project_type_breakdown = EXCLUDED.scope_project_type_breakdown,
      permits_with_scope_tags = EXCLUDED.permits_with_scope_tags,
      permits_with_detailed_tags = EXCLUDED.permits_with_detailed_tags,
      scope_tags_top = EXCLUDED.scope_tags_top,
      permits_updated_24h = EXCLUDED.permits_updated_24h,
      permits_updated_7d = EXCLUDED.permits_updated_7d,
      permits_updated_30d = EXCLUDED.permits_updated_30d,
      last_sync_at = EXCLUDED.last_sync_at,
      last_sync_status = EXCLUDED.last_sync_status,
      building_footprints_total = EXCLUDED.building_footprints_total,
      parcels_with_buildings = EXCLUDED.parcels_with_buildings,
      created_at = NOW()
    RETURNING *`,
    [
      row.total_permits, row.active_permits,
      row.permits_with_trades, row.trade_matches_total, row.trade_avg_confidence,
      row.trade_tier1_count, row.trade_tier2_count, row.trade_tier3_count,
      row.trade_residential_classified, row.trade_residential_total,
      row.trade_commercial_classified, row.trade_commercial_total,
      row.permits_with_builder, row.builders_total,
      row.builders_enriched, row.builders_with_phone, row.builders_with_email,
      row.builders_with_website, row.builders_with_google, row.builders_with_wsib,
      row.permits_with_parcel, row.parcel_exact_matches, row.parcel_name_matches,
      row.parcel_spatial_matches, row.parcel_avg_confidence,
      row.permits_with_neighbourhood,
      row.permits_geocoded,
      row.coa_total, row.coa_linked, row.coa_avg_confidence,
      row.coa_high_confidence, row.coa_low_confidence,
      row.permits_with_scope, JSON.stringify(row.scope_project_type_breakdown),
      row.permits_with_scope_tags, row.permits_with_detailed_tags, JSON.stringify(row.scope_tags_top),
      row.permits_updated_24h, row.permits_updated_7d, row.permits_updated_30d,
      row.last_sync_at, row.last_sync_status,
      row.building_footprints_total, row.parcels_with_buildings,
    ]
  );

  return result[0];
}

/**
 * Fetch the latest snapshot and the last 30 days of trend data.
 */
export async function getQualityData(): Promise<{
  current: DataQualitySnapshot | null;
  trends: DataQualitySnapshot[];
  lastUpdated: string | null;
}> {
  const rows = await query<DataQualitySnapshot>(
    `SELECT * FROM data_quality_snapshots
     ORDER BY snapshot_date DESC
     LIMIT 30`
  );

  const parsed = rows.map(parseSnapshot);
  return {
    current: parsed[0] || null,
    trends: parsed,
    lastUpdated: rows[0]?.created_at || null,
  };
}

// ---------------------------------------------------------------------------
// Individual counting queries
// ---------------------------------------------------------------------------

async function queryPermitCounts() {
  const rows = await query<{ total: string; active: string }>(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE status IN ('Permit Issued', 'Revision Issued', 'Under Review', 'Inspection')) as active
     FROM permits`
  );
  return {
    total: parseInt(rows[0].total, 10),
    active: parseInt(rows[0].active, 10),
  };
}

async function queryTradeCounts() {
  const [overallRows, byUseTypeRows] = await Promise.all([
    query<{
      permits_with_trades: string;
      total_matches: string;
      avg_confidence: string | null;
      tier1: string;
      tier2: string;
      tier3: string;
    }>(
      `SELECT
         COUNT(DISTINCT (permit_num, revision_num)) as permits_with_trades,
         COUNT(*) as total_matches,
         AVG(confidence)::NUMERIC(4,3) as avg_confidence,
         COUNT(*) FILTER (WHERE tier = 1) as tier1,
         COUNT(*) FILTER (WHERE tier = 2) as tier2,
         COUNT(*) FILTER (WHERE tier = 3) as tier3
       FROM permit_trades`
    ),
    query<{
      res_classified: string;
      res_total: string;
      com_classified: string;
      com_total: string;
    }>(
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
       WHERE p.${ACTIVE_FILTER}`
    ),
  ]);
  return {
    permits_with_trades: parseInt(overallRows[0].permits_with_trades, 10),
    total_matches: parseInt(overallRows[0].total_matches, 10),
    avg_confidence: overallRows[0].avg_confidence ? parseFloat(overallRows[0].avg_confidence) : null,
    tier1: parseInt(overallRows[0].tier1, 10),
    tier2: parseInt(overallRows[0].tier2, 10),
    tier3: parseInt(overallRows[0].tier3, 10),
    trade_residential_classified: parseInt(byUseTypeRows[0].res_classified, 10),
    trade_residential_total: parseInt(byUseTypeRows[0].res_total, 10),
    trade_commercial_classified: parseInt(byUseTypeRows[0].com_classified, 10),
    trade_commercial_total: parseInt(byUseTypeRows[0].com_total, 10),
  };
}

async function queryBuilderCounts() {
  const [builderRows, permitRows] = await Promise.all([
    query<{
      total: string;
      enriched: string;
      with_phone: string;
      with_email: string;
      with_website: string;
      with_google: string;
      with_wsib: string;
    }>(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE enriched_at IS NOT NULL) as enriched,
         COUNT(*) FILTER (WHERE phone IS NOT NULL) as with_phone,
         COUNT(*) FILTER (WHERE email IS NOT NULL) as with_email,
         COUNT(*) FILTER (WHERE website IS NOT NULL) as with_website,
         COUNT(*) FILTER (WHERE google_place_id IS NOT NULL) as with_google,
         COUNT(*) FILTER (WHERE wsib_status IS NOT NULL AND wsib_status != 'unknown') as with_wsib
       FROM builders`
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) as count FROM permits WHERE builder_name IS NOT NULL AND builder_name != ''`
    ),
  ]);
  return {
    total: parseInt(builderRows[0].total, 10),
    enriched: parseInt(builderRows[0].enriched, 10),
    with_phone: parseInt(builderRows[0].with_phone, 10),
    with_email: parseInt(builderRows[0].with_email, 10),
    with_website: parseInt(builderRows[0].with_website, 10),
    with_google: parseInt(builderRows[0].with_google, 10),
    with_wsib: parseInt(builderRows[0].with_wsib, 10),
    permits_with_builder: parseInt(permitRows[0].count, 10),
  };
}

async function queryParcelCounts() {
  const rows = await query<{
    permits_with_parcel: string;
    exact_matches: string;
    name_matches: string;
    spatial_matches: string;
    avg_confidence: string | null;
  }>(
    `SELECT
       COUNT(DISTINCT (permit_num, revision_num)) as permits_with_parcel,
       COUNT(*) FILTER (WHERE match_type = 'exact_address') as exact_matches,
       COUNT(*) FILTER (WHERE match_type = 'name_only') as name_matches,
       COUNT(*) FILTER (WHERE match_type = 'spatial') as spatial_matches,
       AVG(confidence)::NUMERIC(4,3) as avg_confidence
     FROM permit_parcels`
  );
  return {
    permits_with_parcel: parseInt(rows[0].permits_with_parcel, 10),
    exact_matches: parseInt(rows[0].exact_matches, 10),
    name_matches: parseInt(rows[0].name_matches, 10),
    spatial_matches: parseInt(rows[0].spatial_matches, 10),
    avg_confidence: rows[0].avg_confidence ? parseFloat(rows[0].avg_confidence) : null,
  };
}

async function queryNeighbourhoodCount(): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM permits
     WHERE neighbourhood_id IS NOT NULL
       AND status IN ('Permit Issued', 'Revision Issued', 'Under Review', 'Inspection')`
  );
  return parseInt(rows[0].count, 10);
}

async function queryGeocodingCount(): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM permits WHERE latitude IS NOT NULL AND longitude IS NOT NULL`
  );
  return parseInt(rows[0].count, 10);
}

async function queryCoaCounts() {
  const rows = await query<{
    total: string;
    linked: string;
    avg_confidence: string | null;
    high_confidence: string;
    low_confidence: string;
  }>(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL) as linked,
       AVG(linked_confidence) FILTER (WHERE linked_permit_num IS NOT NULL)::NUMERIC(4,3) as avg_confidence,
       COUNT(*) FILTER (WHERE linked_confidence >= 0.80) as high_confidence,
       COUNT(*) FILTER (WHERE linked_confidence IS NOT NULL AND linked_confidence < 0.50) as low_confidence
     FROM coa_applications`
  );
  return {
    total: parseInt(rows[0].total, 10),
    linked: parseInt(rows[0].linked, 10),
    avg_confidence: rows[0].avg_confidence ? parseFloat(rows[0].avg_confidence) : null,
    high_confidence: parseInt(rows[0].high_confidence, 10),
    low_confidence: parseInt(rows[0].low_confidence, 10),
  };
}

const ACTIVE_FILTER = `status IN ('Permit Issued','Revision Issued','Under Review','Inspection')`;

async function queryScopeCounts() {
  const [countRows, breakdownRows, tagCountRows, detailedTagRows, topTagRows] = await Promise.all([
    // Active permits with residential, commercial, or mixed-use tag
    query<{ count: string }>(
      `SELECT COUNT(*) as count FROM permits
       WHERE ('residential' = ANY(scope_tags) OR 'commercial' = ANY(scope_tags) OR 'mixed-use' = ANY(scope_tags))
         AND ${ACTIVE_FILTER}`
    ),
    query<{ tag: string; count: string }>(
      `SELECT tag, COUNT(*) as count
       FROM (SELECT unnest(scope_tags) as tag FROM permits
             WHERE scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0
               AND ${ACTIVE_FILTER}) sub
       WHERE tag IN ('residential', 'commercial', 'mixed-use')
       GROUP BY tag`
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) as count FROM permits
       WHERE scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0
         AND ${ACTIVE_FILTER}`
    ),
    // Active permits with at least one true architectural tag (excluding use-types)
    query<{ count: string }>(
      `SELECT COUNT(*) as count FROM permits
       WHERE scope_tags IS NOT NULL
         AND array_length(scope_tags, 1) > 0
         AND ${ACTIVE_FILTER}
         AND EXISTS (
           SELECT 1 FROM unnest(scope_tags) AS t
           WHERE t NOT IN ('residential', 'commercial', 'mixed-use')
         )`
    ),
    query<{ tag: string; count: string }>(
      `SELECT tag, COUNT(*) as count
       FROM (SELECT unnest(scope_tags) as tag FROM permits
             WHERE scope_tags IS NOT NULL AND array_length(scope_tags, 1) > 0
               AND ${ACTIVE_FILTER}) sub
       WHERE tag NOT IN ('residential', 'commercial', 'mixed-use')
       GROUP BY tag
       ORDER BY count DESC
       LIMIT 10`
    ),
  ]);

  const breakdown: Record<string, number> = {};
  for (const row of breakdownRows) {
    breakdown[row.tag] = parseInt(row.count, 10);
  }

  const tagsTop: Record<string, number> = {};
  for (const row of topTagRows) {
    tagsTop[row.tag] = parseInt(row.count, 10);
  }

  return {
    permits_with_scope: parseInt(countRows[0].count, 10),
    breakdown: Object.keys(breakdown).length > 0 ? breakdown : null,
    permits_with_scope_tags: parseInt(tagCountRows[0].count, 10),
    permits_with_detailed_tags: parseInt(detailedTagRows[0].count, 10),
    scope_tags_top: Object.keys(tagsTop).length > 0 ? tagsTop : null,
  };
}

async function queryFreshnessCounts() {
  const rows = await query<{
    updated_24h: string;
    updated_7d: string;
    updated_30d: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '24 hours') as updated_24h,
       COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '7 days') as updated_7d,
       COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '30 days') as updated_30d
     FROM permits`
  );
  return {
    updated_24h: parseInt(rows[0].updated_24h, 10),
    updated_7d: parseInt(rows[0].updated_7d, 10),
    updated_30d: parseInt(rows[0].updated_30d, 10),
  };
}

async function queryMassingCounts() {
  try {
    const rows = await query<{
      footprints_total: string;
      parcels_with_buildings: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM building_footprints) as footprints_total,
         (SELECT COUNT(DISTINCT parcel_id) FROM parcel_buildings) as parcels_with_buildings`
    );
    return {
      footprints_total: parseInt(rows[0].footprints_total, 10),
      parcels_with_buildings: parseInt(rows[0].parcels_with_buildings, 10),
    };
  } catch {
    // Tables may not exist yet
    return { footprints_total: 0, parcels_with_buildings: 0 };
  }
}

async function queryLastSync() {
  const rows = await query<{
    started_at: string | null;
    status: string | null;
  }>(
    `SELECT started_at, status
     FROM sync_runs
     ORDER BY started_at DESC
     LIMIT 1`
  );
  return {
    last_sync_at: rows[0]?.started_at || null,
    last_sync_status: rows[0]?.status || null,
  };
}
