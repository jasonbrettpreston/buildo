/**
 * Enrichment Funnel — pure computation logic for pipeline step metrics.
 *
 * Extracted from EnrichmentFunnel.tsx so FreshnessTimeline can render
 * funnel accordions inline and tests can import without React.
 *
 * SPEC LINK: docs/specs/28_data_quality_dashboard.md
 */

import type { DataQualitySnapshot } from '@/lib/quality/types';
import type { PipelineRunInfo } from '@/components/FreshnessTimeline';

// ---------------------------------------------------------------------------
// Funnel source configuration — ordered to match pipeline chain execution
// ---------------------------------------------------------------------------

export interface FunnelSourceConfig {
  id: string;
  name: string;
  statusSlug: string;
  triggerSlug: string;
  yieldFields: string[];
}

export const FUNNEL_SOURCES: FunnelSourceConfig[] = [
  // 1. Hub
  { id: 'permits', name: 'Building Permits', statusSlug: 'permits', triggerSlug: 'chain_permits', yieldFields: ['permit_num', 'description', 'est_const_cost'] },
  // 2-5. Classification (derived from permits)
  { id: 'scope_class', name: 'Scope Class', statusSlug: 'classify_scope_class', triggerSlug: 'classify_scope_class', yieldFields: ['scope_class'] },
  { id: 'scope_tags', name: 'Scope Tags', statusSlug: 'classify_scope_tags', triggerSlug: 'classify_scope_tags', yieldFields: ['scope_tags'] },
  { id: 'trades_residential', name: 'Trades (Residential)', statusSlug: 'classify_permits', triggerSlug: 'classify_permits', yieldFields: ['permit_trades'] },
  { id: 'trades_commercial', name: 'Trades (Commercial)', statusSlug: 'classify_permits', triggerSlug: 'classify_permits', yieldFields: ['permit_trades'] },
  // 6-8. Entity enrichment
  { id: 'builders', name: 'Entity Extraction', statusSlug: 'builders', triggerSlug: 'builders', yieldFields: ['legal_name', 'phone', 'email', 'website'] },
  { id: 'wsib', name: 'WSIB Registry', statusSlug: 'link_wsib', triggerSlug: 'link_wsib', yieldFields: ['legal_name', 'trade_name', 'mailing_address'] },
  { id: 'builder_web', name: 'Entity Web Enrichment', statusSlug: 'enrich_wsib_builders', triggerSlug: 'enrich_wsib_builders', yieldFields: ['phone', 'email', 'website'] },
  // 9-13. Spatial & linking
  { id: 'address_matching', name: 'Address Matching', statusSlug: 'geocode_permits', triggerSlug: 'geocode_permits', yieldFields: ['latitude', 'longitude'] },
  { id: 'parcels', name: 'Lots (Parcels)', statusSlug: 'link_parcels', triggerSlug: 'link_parcels', yieldFields: ['lot_size', 'frontage', 'depth', 'is_irregular'] },
  { id: 'neighbourhoods', name: 'Neighbourhoods', statusSlug: 'link_neighbourhoods', triggerSlug: 'link_neighbourhoods', yieldFields: ['neighbourhood_id', 'avg_income', 'construction_era'] },
  { id: 'massing', name: '3D Massing', statusSlug: 'link_massing', triggerSlug: 'link_massing', yieldFields: ['main_bldg_area', 'max_height', 'est_stories'] },
  { id: 'link_similar', name: 'Similar Permits', statusSlug: 'link_similar', triggerSlug: 'link_similar', yieldFields: ['similar_permit_id'] },
  { id: 'link_coa', name: 'CoA Linking', statusSlug: 'link_coa', triggerSlug: 'link_coa', yieldFields: ['linked_permit_num', 'linked_confidence'] },
  { id: 'coa', name: 'CoA Applications', statusSlug: 'coa', triggerSlug: 'chain_coa', yieldFields: ['decision', 'hearing_date', 'applicant'] },
];

// ---------------------------------------------------------------------------
// Funnel row data — computed per source
// ---------------------------------------------------------------------------

export interface FunnelRowData {
  config: FunnelSourceConfig;
  // Zone 1: Metadata
  lastUpdated: string | null;
  status: 'healthy' | 'warning' | 'stale';
  cadence: string;
  // Zone 2: Baseline
  baselineTotal: number;
  baselineLabel: string;
  targetPool: number | null;
  targetPoolLabel: string | null;
  baselineNullRates: { field: string; pct: number }[];
  // Zone 3: Intersection (All Time)
  matchDenominator: number;
  matchDenominatorLabel: string;
  matchCount: number;
  matchPct: number;
  matchTiers: { label: string; count: number }[];
  // Zone 4: Yield (All Time)
  yieldCounts: { field: string; count: number }[];
  yieldNullRates: { field: string; pct: number }[];
  // Last Run data (from records_meta)
  lastRunMeta: Record<string, unknown> | null;
  lastRunRecordsTotal: number | null;
  lastRunRecordsNew: number | null;
}

// ---------------------------------------------------------------------------
// Stats interface (subset of AdminStats needed for funnel computation)
// ---------------------------------------------------------------------------

export interface FunnelStats {
  wsib_total: number;
  wsib_linked: number;
  wsib_lead_pool: number;
  wsib_with_trade: number;
  address_points_total: number;
  parcels_total: number;
  building_footprints_total: number;
  parcels_with_massing: number;
  permits_with_massing: number;
  neighbourhoods_total: number;
  pipeline_last_run: Record<string, PipelineRunInfo>;
  pipeline_schedules?: Record<string, { cadence: string }> | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

function nullPct(total: number, withField: number, denom: number): number {
  return denom > 0 ? Math.round(((denom - withField) / denom) * 1000) / 10 : 0;
}

// ---------------------------------------------------------------------------
// Compute funnel data for a single source
// ---------------------------------------------------------------------------

export function computeRowData(
  config: FunnelSourceConfig,
  stats: FunnelStats,
  current: DataQualitySnapshot
): FunnelRowData {
  const lastRun = stats.pipeline_last_run[config.statusSlug];
  const lastUpdated = lastRun?.last_run_at ?? null;
  const cadence = stats.pipeline_schedules?.[config.statusSlug]?.cadence ?? 'Daily';

  let status: 'healthy' | 'warning' | 'stale' = 'healthy';
  if (lastUpdated) {
    const hoursAgo = (Date.now() - new Date(lastUpdated).getTime()) / 3600000;
    const slaHours = cadence === 'Annual' ? 8760 : cadence === 'Quarterly' ? 2160 : 48;
    if (hoursAgo > slaHours) status = 'stale';
    else if (hoursAgo > slaHours * 0.8) status = 'warning';
  } else {
    status = 'stale';
  }

  const lastRunMeta = (lastRun?.records_meta as Record<string, unknown>) ?? null;
  const lastRunRecordsTotal = lastRun?.records_total ?? null;
  const lastRunRecordsNew = lastRun?.records_new ?? null;

  const ap = current.active_permits;
  const bt = current.builders_total;

  switch (config.id) {
    case 'permits':
      return {
        config, lastUpdated, status, cadence, lastRunMeta, lastRunRecordsTotal, lastRunRecordsNew,
        baselineTotal: current.total_permits,
        baselineLabel: 'Total Permits',
        targetPool: ap, targetPoolLabel: 'Active Permits',
        baselineNullRates: ap > 0 ? [
          { field: 'description', pct: pct(current.null_description_count, ap) },
          { field: 'builder_name', pct: pct(current.null_builder_name_count, ap) },
          { field: 'est_const_cost', pct: pct(current.null_est_const_cost_count, ap) },
        ] : [],
        matchDenominator: current.total_permits, matchDenominatorLabel: 'Total Permits',
        matchCount: ap, matchPct: pct(ap, current.total_permits),
        matchTiers: [
          { label: 'Active', count: ap },
          { label: 'Updated 24h', count: current.permits_updated_24h },
          { label: 'Updated 7d', count: current.permits_updated_7d },
        ],
        yieldCounts: [
          { field: 'Active', count: ap },
          { field: 'Geocoded', count: current.permits_geocoded },
          { field: 'Classified', count: current.permits_with_trades },
        ],
        yieldNullRates: [],
      };

    case 'scope_class':
      return {
        config, lastUpdated, status, cadence, lastRunMeta, lastRunRecordsTotal, lastRunRecordsNew,
        baselineTotal: ap, baselineLabel: 'Active Permits',
        targetPool: null, targetPoolLabel: null, baselineNullRates: [],
        matchDenominator: ap, matchDenominatorLabel: 'Active Permits',
        matchCount: current.permits_with_scope, matchPct: pct(current.permits_with_scope, ap),
        matchTiers: [
          { label: 'Residential', count: current.scope_project_type_breakdown?.residential ?? 0 },
          { label: 'Commercial', count: current.scope_project_type_breakdown?.commercial ?? 0 },
          { label: 'Mixed-Use', count: current.scope_project_type_breakdown?.['mixed-use'] ?? 0 },
          { label: 'Unclassified', count: ap - current.permits_with_scope },
        ],
        yieldCounts: [
          { field: 'Classified', count: current.permits_with_scope },
        ],
        yieldNullRates: [],
      };

    case 'scope_tags':
      return {
        config, lastUpdated, status, cadence, lastRunMeta, lastRunRecordsTotal, lastRunRecordsNew,
        baselineTotal: ap, baselineLabel: 'Active Permits',
        targetPool: null, targetPoolLabel: null, baselineNullRates: [],
        matchDenominator: ap, matchDenominatorLabel: 'Active Permits',
        matchCount: current.permits_with_detailed_tags ?? 0,
        matchPct: pct(current.permits_with_detailed_tags ?? 0, ap),
        matchTiers: [
          ...(current.scope_tags_top
            ? Object.entries(current.scope_tags_top)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .slice(0, 4)
                .map(([tag, count]) => ({ label: tag, count: count as number }))
            : []),
          { label: 'Untagged', count: ap - (current.permits_with_detailed_tags ?? 0) },
        ],
        yieldCounts: [
          { field: 'Tagged', count: current.permits_with_detailed_tags ?? 0 },
        ],
        yieldNullRates: [],
      };

    case 'trades_residential':
      return {
        config, lastUpdated, status, cadence, lastRunMeta, lastRunRecordsTotal, lastRunRecordsNew,
        baselineTotal: current.trade_residential_total ?? 0,
        baselineLabel: 'Residential Permits',
        targetPool: null, targetPoolLabel: null, baselineNullRates: [],
        matchDenominator: current.trade_residential_total ?? 0,
        matchDenominatorLabel: 'Residential Permits',
        matchCount: current.trade_residential_classified ?? 0,
        matchPct: pct(current.trade_residential_classified ?? 0, current.trade_residential_total ?? 0),
        matchTiers: [
          { label: 'Classified', count: current.trade_residential_classified ?? 0 },
          { label: 'Unclassified', count: (current.trade_residential_total ?? 0) - (current.trade_residential_classified ?? 0) },
        ],
        yieldCounts: [
          { field: 'Trade Matches', count: current.trade_residential_classified ?? 0 },
        ],
        yieldNullRates: [],
      };

    case 'trades_commercial':
      return {
        config, lastUpdated, status, cadence, lastRunMeta, lastRunRecordsTotal, lastRunRecordsNew,
        baselineTotal: current.trade_commercial_total ?? 0,
        baselineLabel: 'Commercial + Mixed Permits',
        targetPool: null, targetPoolLabel: null, baselineNullRates: [],
        matchDenominator: current.trade_commercial_total ?? 0,
        matchDenominatorLabel: 'Commercial + Mixed Permits',
        matchCount: current.trade_commercial_classified ?? 0,
        matchPct: pct(current.trade_commercial_classified ?? 0, current.trade_commercial_total ?? 0),
        matchTiers: [
          { label: 'Classified', count: current.trade_commercial_classified ?? 0 },
          { label: 'Unclassified', count: (current.trade_commercial_total ?? 0) - (current.trade_commercial_classified ?? 0) },
        ],
        yieldCounts: [
          { field: 'Trade Matches', count: current.trade_commercial_classified ?? 0 },
        ],
        yieldNullRates: [],
      };

    case 'builders':
      return {
        config, lastUpdated, status, cadence, lastRunMeta, lastRunRecordsTotal, lastRunRecordsNew,
        baselineTotal: ap, baselineLabel: 'Active Permits',
        targetPool: null, targetPoolLabel: null, baselineNullRates: [],
        matchDenominator: ap, matchDenominatorLabel: 'Active Permits',
        matchCount: current.permits_with_builder, matchPct: pct(current.permits_with_builder, ap),
        matchTiers: [
          { label: 'With Builder Name', count: current.permits_with_builder },
          { label: 'No Builder', count: ap - current.permits_with_builder },
        ],
        yieldCounts: [
          { field: 'Total Entities', count: bt },
          { field: 'Enriched', count: current.builders_enriched },
        ],
        yieldNullRates: [],
      };

    case 'wsib':
      return {
        config, lastUpdated, status, cadence, lastRunMeta, lastRunRecordsTotal, lastRunRecordsNew,
        baselineTotal: stats.wsib_total, baselineLabel: 'WSIB Registry Records',
        targetPool: stats.wsib_with_trade, targetPoolLabel: 'With Trade Name',
        baselineNullRates: [],
        matchDenominator: bt, matchDenominatorLabel: 'Total Entities',
        matchCount: stats.wsib_linked, matchPct: pct(stats.wsib_linked, bt),
        matchTiers: [
          { label: 'WSIB Matched', count: stats.wsib_linked },
          { label: 'Unmatched', count: bt - stats.wsib_linked },
        ],
        yieldCounts: [
          { field: 'Matched Entities', count: stats.wsib_linked },
          { field: 'Lead Pool', count: stats.wsib_lead_pool },
        ],
        yieldNullRates: [],
      };

    case 'builder_web': {
      const webMeta = (stats.pipeline_last_run['enrich_wsib_builders']?.records_meta as Record<string, unknown>) ?? lastRunMeta;
      return {
        config, lastUpdated, status, cadence,
        lastRunMeta: webMeta,
        lastRunRecordsTotal: stats.pipeline_last_run['enrich_wsib_builders']?.records_total ?? lastRunRecordsTotal,
        lastRunRecordsNew: stats.pipeline_last_run['enrich_wsib_builders']?.records_new ?? lastRunRecordsNew,
        baselineTotal: bt, baselineLabel: 'Total Entities',
        targetPool: current.builders_enriched, targetPoolLabel: 'Enriched',
        baselineNullRates: bt > 0 ? [
          { field: 'phone', pct: nullPct(bt, current.builders_with_phone, bt) },
          { field: 'email', pct: nullPct(bt, current.builders_with_email, bt) },
          { field: 'website', pct: nullPct(bt, current.builders_with_website, bt) },
        ] : [],
        matchDenominator: bt, matchDenominatorLabel: 'Total Entities',
        matchCount: current.builders_enriched, matchPct: pct(current.builders_enriched, bt),
        matchTiers: [
          { label: 'WSIB Matched Search', count: current.builders_with_wsib },
          { label: 'Google/Web Search', count: current.builders_with_google },
          { label: 'Unenriched', count: bt - current.builders_enriched },
        ],
        yieldCounts: [
          { field: 'Phone', count: current.builders_with_phone },
          { field: 'Email', count: current.builders_with_email },
          { field: 'Website', count: current.builders_with_website },
        ],
        yieldNullRates: bt > 0 ? [
          { field: 'phone', pct: nullPct(bt, current.builders_with_phone, bt) },
          { field: 'email', pct: nullPct(bt, current.builders_with_email, bt) },
          { field: 'website', pct: nullPct(bt, current.builders_with_website, bt) },
        ] : [],
      };
    }

    case 'address_matching':
      return {
        config, lastUpdated, status, cadence, lastRunMeta, lastRunRecordsTotal, lastRunRecordsNew,
        baselineTotal: stats.address_points_total, baselineLabel: 'Address Points',
        targetPool: null, targetPoolLabel: null,
        baselineNullRates: ap > 0 ? [
          { field: 'street_num', pct: pct(current.null_street_num_count, ap) },
          { field: 'street_name', pct: pct(current.null_street_name_count, ap) },
        ] : [],
        matchDenominator: ap, matchDenominatorLabel: 'Active Permits',
        matchCount: current.permits_geocoded, matchPct: pct(current.permits_geocoded, ap),
        matchTiers: [
          { label: 'Geocoded', count: current.permits_geocoded },
          { label: 'Unmatched', count: ap - current.permits_geocoded },
        ],
        yieldCounts: [
          { field: 'Lat/Lng', count: current.permits_geocoded },
        ],
        yieldNullRates: ap > 0 ? [
          { field: 'coordinates', pct: pct(ap - current.permits_geocoded, ap) },
        ] : [],
      };

    case 'parcels':
      return {
        config, lastUpdated, status, cadence, lastRunMeta, lastRunRecordsTotal, lastRunRecordsNew,
        baselineTotal: stats.parcels_total, baselineLabel: 'Parcels',
        targetPool: null, targetPoolLabel: null, baselineNullRates: [],
        matchDenominator: ap, matchDenominatorLabel: 'Active Permits',
        matchCount: current.permits_with_parcel, matchPct: pct(current.permits_with_parcel, ap),
        matchTiers: [
          { label: 'Exact Address', count: current.parcel_exact_matches },
          { label: 'Name Match', count: current.parcel_name_matches },
          { label: 'Spatial', count: current.parcel_spatial_matches },
          { label: 'Unmatched', count: ap - current.permits_with_parcel },
        ],
        yieldCounts: [
          { field: 'Lot Size', count: current.permits_with_parcel },
          { field: 'Frontage', count: current.permits_with_parcel },
        ],
        yieldNullRates: [],
      };

    case 'neighbourhoods':
      return {
        config, lastUpdated, status, cadence, lastRunMeta, lastRunRecordsTotal, lastRunRecordsNew,
        baselineTotal: stats.neighbourhoods_total, baselineLabel: 'Neighbourhoods',
        targetPool: null, targetPoolLabel: null, baselineNullRates: [],
        matchDenominator: ap, matchDenominatorLabel: 'Active Permits',
        matchCount: current.permits_with_neighbourhood, matchPct: pct(current.permits_with_neighbourhood, ap),
        matchTiers: [
          { label: 'Spatially Linked', count: current.permits_with_neighbourhood },
          { label: 'Unmatched', count: ap - current.permits_with_neighbourhood },
        ],
        yieldCounts: [
          { field: 'Neighbourhood ID', count: current.permits_with_neighbourhood },
        ],
        yieldNullRates: [],
      };

    case 'massing': {
      const pm = stats.permits_with_massing ?? 0;
      return {
        config, lastUpdated, status, cadence, lastRunMeta, lastRunRecordsTotal, lastRunRecordsNew,
        baselineTotal: stats.building_footprints_total, baselineLabel: 'Building Footprints',
        targetPool: stats.parcels_with_massing, targetPoolLabel: 'Parcels w/ Buildings',
        baselineNullRates: [],
        matchDenominator: ap, matchDenominatorLabel: 'Active Permits',
        matchCount: pm, matchPct: pct(pm, ap),
        matchTiers: [
          { label: 'Linked via Parcel', count: pm },
          { label: 'Unmatched', count: ap - pm },
        ],
        yieldCounts: [
          { field: 'Building Area', count: pm },
          { field: 'Max Height', count: pm },
          { field: 'Est Stories', count: pm },
        ],
        yieldNullRates: [],
      };
    }

    case 'link_similar': {
      const lsTotal = lastRunRecordsTotal ?? 0;
      const lsNew = lastRunRecordsNew ?? 0;
      return {
        config, lastUpdated, status, cadence, lastRunMeta, lastRunRecordsTotal, lastRunRecordsNew,
        baselineTotal: ap, baselineLabel: 'Active Permits',
        targetPool: null, targetPoolLabel: null, baselineNullRates: [],
        matchDenominator: ap, matchDenominatorLabel: 'Active Permits',
        matchCount: lsTotal, matchPct: pct(lsTotal, ap),
        matchTiers: [
          { label: 'Propagated', count: lsTotal },
          { label: 'New Links', count: lsNew },
        ],
        yieldCounts: [
          { field: 'Scope Propagated', count: lsTotal },
        ],
        yieldNullRates: [],
      };
    }

    case 'link_coa':
      return {
        config, lastUpdated, status, cadence, lastRunMeta, lastRunRecordsTotal, lastRunRecordsNew,
        baselineTotal: current.coa_total, baselineLabel: 'CoA Applications',
        targetPool: null, targetPoolLabel: null, baselineNullRates: [],
        matchDenominator: current.coa_total, matchDenominatorLabel: 'CoA Applications',
        matchCount: current.coa_linked, matchPct: pct(current.coa_linked, current.coa_total),
        matchTiers: [
          { label: 'High Conf (>=0.80)', count: current.coa_high_confidence },
          { label: 'Low Conf (<0.50)', count: current.coa_low_confidence },
          { label: 'Unlinked', count: current.coa_total - current.coa_linked },
        ],
        yieldCounts: [
          { field: 'Linked', count: current.coa_linked },
        ],
        yieldNullRates: [],
      };

    case 'coa': {
      const ct = current.coa_total;
      return {
        config, lastUpdated, status, cadence, lastRunMeta, lastRunRecordsTotal, lastRunRecordsNew,
        baselineTotal: ct, baselineLabel: 'CoA Applications',
        targetPool: null, targetPoolLabel: null, baselineNullRates: [],
        matchDenominator: ct, matchDenominatorLabel: 'CoA Applications',
        matchCount: current.coa_linked, matchPct: pct(current.coa_linked, ct),
        matchTiers: [
          { label: 'High Conf (>=0.80)', count: current.coa_high_confidence },
          { label: 'Low Conf (<0.50)', count: current.coa_low_confidence },
          { label: 'Unlinked', count: ct - current.coa_linked },
        ],
        yieldCounts: [
          { field: 'Decision', count: current.coa_linked },
          { field: 'Hearing Date', count: current.coa_linked },
          { field: 'Applicant', count: current.coa_linked },
        ],
        yieldNullRates: [],
      };
    }

    default:
      throw new Error(`Unknown funnel source: ${config.id}`);
  }
}

// ---------------------------------------------------------------------------
// Compute all funnel rows, keyed by statusSlug for FreshnessTimeline lookup
// ---------------------------------------------------------------------------

export function computeAllFunnelRows(
  stats: FunnelStats,
  current: DataQualitySnapshot
): Record<string, FunnelRowData> {
  const result: Record<string, FunnelRowData> = {};
  for (const config of FUNNEL_SOURCES) {
    const row = computeRowData(config, stats, current);
    result[config.statusSlug] = row;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Step descriptions — universal drill-down metadata for ALL pipeline steps
// ---------------------------------------------------------------------------

export interface StepDescription {
  summary: string;
  fields: string[];
  table: string;
}

export const STEP_DESCRIPTIONS: Record<string, StepDescription> = {
  // Ingest
  permits:              { summary: 'Ingests building permit CSV from Toronto Open Data CKAN API', fields: ['permit_num', 'revision_num', 'permit_type', 'description', 'est_const_cost', 'issued_date', 'status'], table: 'permits' },
  coa:                  { summary: 'Ingests Committee of Adjustment applications from CKAN', fields: ['application_number', 'hearing_date', 'decision', 'ward', 'address'], table: 'coa_applications' },
  builders:             { summary: 'Extracts corporate entity names from permit applicant/builder fields', fields: ['legal_name', 'phone', 'email', 'website'], table: 'entities' },
  address_points:       { summary: 'Loads Toronto address point reference data for geocoding', fields: ['address_id', 'street_num', 'street_name', 'latitude', 'longitude'], table: 'address_points' },
  parcels:              { summary: 'Loads Toronto property parcel boundaries and lot dimensions', fields: ['parcel_id', 'lot_size', 'frontage', 'depth', 'geom'], table: 'parcels' },
  massing:              { summary: 'Loads 3D building massing models from City shapefile', fields: ['footprint_id', 'main_bldg_area', 'max_height', 'est_stories'], table: 'building_footprints' },
  neighbourhoods:       { summary: 'Loads neighbourhood boundary polygons and demographic data', fields: ['neighbourhood_id', 'name', 'avg_income', 'geom'], table: 'neighbourhoods' },
  load_wsib:            { summary: 'Loads WSIB registry snapshot for contractor identity matching', fields: ['legal_name', 'trade_name', 'mailing_address', 'naics_code'], table: 'wsib_registry' },
  // Link & Enrich
  geocode_permits:      { summary: 'Matches permit addresses to address points for lat/lng coordinates', fields: ['latitude', 'longitude', 'geo_id'], table: 'permits' },
  link_parcels:         { summary: 'Links permits to property parcels via address or spatial match', fields: ['parcel_id', 'lot_size', 'frontage', 'depth'], table: 'permit_parcels' },
  link_neighbourhoods:  { summary: 'Spatially links permits to neighbourhood boundaries', fields: ['neighbourhood_id'], table: 'permits' },
  link_massing:         { summary: 'Links permits to 3D building footprints via parcel intersection', fields: ['main_bldg_area', 'max_height', 'est_stories'], table: 'permits' },
  link_coa:             { summary: 'Links CoA applications to building permits by address and ward', fields: ['linked_permit_num', 'linked_confidence'], table: 'coa_applications' },
  link_wsib:            { summary: 'Matches extracted entities against WSIB registry by name', fields: ['wsib_id', 'trade_name', 'mailing_address'], table: 'entities' },
  enrich_wsib_builders: { summary: 'Web-scrapes contact info for WSIB-matched entities via Serper API', fields: ['phone', 'email', 'website'], table: 'entities' },
  enrich_named_builders:{ summary: 'Web-scrapes contact info for unmatched entities via Serper API', fields: ['phone', 'email', 'website'], table: 'entities' },
  link_similar:         { summary: 'Clusters permits by address proximity to find related applications', fields: ['similar_permit_id'], table: 'permits' },
  create_pre_permits:   { summary: 'Creates placeholder permit records from eligible CoA applications', fields: ['permit_num', 'source', 'status'], table: 'permits' },
  compute_centroids:    { summary: 'Computes geometric centroids for parcel polygons', fields: ['centroid_lat', 'centroid_lng'], table: 'parcels' },
  // Classify
  classify_scope_class: { summary: 'Classifies permits into project types (residential/commercial/mixed)', fields: ['scope_class', 'project_type'], table: 'permits' },
  classify_scope_tags:  { summary: 'Extracts detailed work scope tags from permit descriptions', fields: ['scope_tags'], table: 'permits' },
  classify_permits:     { summary: 'Assigns trade classifications using tag-trade matrix and rules', fields: ['permit_trades'], table: 'permit_trades' },
  // Snapshot
  refresh_snapshot:     { summary: 'Captures current data quality metrics to daily snapshot table', fields: ['active_permits', 'permits_geocoded', 'permits_with_trades', 'violations_total'], table: 'data_quality_snapshots' },
  // Quality (CQA)
  assert_schema:        { summary: 'Validates upstream CKAN/CSV column headers before ingestion', fields: ['column_count', 'missing_headers', 'type_mismatches'], table: 'pipeline_runs' },
  assert_data_bounds:   { summary: 'Post-ingestion SQL checks for cost outliers, null rates, referential integrity', fields: ['cost_outliers', 'null_rate_violations', 'referential_audits'], table: 'pipeline_runs' },
  // Deep Scrapes (coming soon)
  inspections:          { summary: 'Scrapes permit inspection stages from City Application Status portal', fields: ['inspection_type', 'inspection_date', 'result'], table: 'permit_inspections' },
  coa_documents:        { summary: 'Downloads Committee of Adjustment plans and decision PDFs from AIC portal', fields: ['document_url', 'document_type'], table: 'coa_documents' },
};
