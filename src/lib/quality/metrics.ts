import { query } from '@/lib/db/client';
import type { DataQualitySnapshot } from './types';

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
      permits_with_builder, builders_total, builders_enriched,
      builders_with_phone, builders_with_email, builders_with_website,
      builders_with_google, builders_with_wsib,
      permits_with_parcel, parcel_exact_matches, parcel_name_matches, parcel_spatial_matches, parcel_avg_confidence,
      permits_with_neighbourhood,
      permits_geocoded,
      coa_total, coa_linked, coa_avg_confidence, coa_high_confidence, coa_low_confidence,
      permits_with_scope, scope_project_type_breakdown,
      permits_updated_24h, permits_updated_7d, permits_updated_30d,
      last_sync_at, last_sync_status,
      building_footprints_total, parcels_with_buildings
    ) VALUES (
      CURRENT_DATE,
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
      $31, $32, $33, $34, $35, $36, $37
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

  return {
    current: rows[0] || null,
    trends: rows,
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
  const rows = await query<{
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
     FROM permit_trades
     WHERE is_active = true`
  );
  return {
    permits_with_trades: parseInt(rows[0].permits_with_trades, 10),
    total_matches: parseInt(rows[0].total_matches, 10),
    avg_confidence: rows[0].avg_confidence ? parseFloat(rows[0].avg_confidence) : null,
    tier1: parseInt(rows[0].tier1, 10),
    tier2: parseInt(rows[0].tier2, 10),
    tier3: parseInt(rows[0].tier3, 10),
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
    `SELECT COUNT(*) as count FROM permits WHERE neighbourhood_id IS NOT NULL`
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

async function queryScopeCounts() {
  const [countRows, breakdownRows] = await Promise.all([
    query<{ count: string }>(
      `SELECT COUNT(*) as count FROM permits WHERE project_type IS NOT NULL`
    ),
    query<{ project_type: string; count: string }>(
      `SELECT project_type, COUNT(*) as count
       FROM permits
       WHERE project_type IS NOT NULL
       GROUP BY project_type`
    ),
  ]);

  const breakdown: Record<string, number> = {};
  for (const row of breakdownRows) {
    breakdown[row.project_type] = parseInt(row.count, 10);
  }

  return {
    permits_with_scope: parseInt(countRows[0].count, 10),
    breakdown: Object.keys(breakdown).length > 0 ? breakdown : null,
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
