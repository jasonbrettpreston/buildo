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
  permits_propagated: number;
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

function resolveLastRun(slug: string, plr: Record<string, PipelineRunInfo>): PipelineRunInfo | undefined {
  if (plr[slug]) return plr[slug];
  // Chain-scoped keys: pipeline_runs stores "chainId:slug" (e.g. "permits:link_similar").
  // A slug may appear in multiple chains (e.g. link_coa in both permits and coa chains),
  // so pick the most recent run across all matching scoped keys.
  let best: PipelineRunInfo | undefined;
  for (const key of Object.keys(plr)) {
    if (key.endsWith(`:${slug}`)) {
      const candidate = plr[key];
      if (!best || (candidate.last_run_at && (!best.last_run_at || candidate.last_run_at > best.last_run_at))) {
        best = candidate;
      }
    }
  }
  return best;
}

export function computeRowData(
  config: FunnelSourceConfig,
  stats: FunnelStats,
  current: DataQualitySnapshot
): FunnelRowData {
  const lastRun = resolveLastRun(config.statusSlug, stats.pipeline_last_run);
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
        yieldNullRates: ap > 0 ? [
          { field: 'scope_class', pct: pct(ap - current.permits_with_scope, ap) },
        ] : [],
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
        yieldNullRates: ap > 0 ? [
          { field: 'scope_tags', pct: pct(ap - (current.permits_with_detailed_tags ?? 0), ap) },
        ] : [],
      };

    case 'trades_residential': {
      const resTotal = current.trade_residential_total ?? 0;
      const resClassified = current.trade_residential_classified ?? 0;
      return {
        config, lastUpdated, status, cadence, lastRunMeta, lastRunRecordsTotal, lastRunRecordsNew,
        baselineTotal: resTotal,
        baselineLabel: 'Residential Permits',
        targetPool: null, targetPoolLabel: null, baselineNullRates: [],
        matchDenominator: resTotal,
        matchDenominatorLabel: 'Residential Permits',
        matchCount: resClassified,
        matchPct: pct(resClassified, resTotal),
        matchTiers: [
          { label: 'Classified', count: resClassified },
          { label: 'Unclassified', count: resTotal - resClassified },
        ],
        yieldCounts: [
          { field: 'Trade Matches', count: resClassified },
        ],
        yieldNullRates: resTotal > 0 ? [
          { field: 'permit_trades', pct: pct(resTotal - resClassified, resTotal) },
        ] : [],
      };
    }

    case 'trades_commercial': {
      const comTotal = current.trade_commercial_total ?? 0;
      const comClassified = current.trade_commercial_classified ?? 0;
      return {
        config, lastUpdated, status, cadence, lastRunMeta, lastRunRecordsTotal, lastRunRecordsNew,
        baselineTotal: comTotal,
        baselineLabel: 'Commercial + Mixed Permits',
        targetPool: null, targetPoolLabel: null, baselineNullRates: [],
        matchDenominator: comTotal,
        matchDenominatorLabel: 'Commercial + Mixed Permits',
        matchCount: comClassified,
        matchPct: pct(comClassified, comTotal),
        matchTiers: [
          { label: 'Classified', count: comClassified },
          { label: 'Unclassified', count: comTotal - comClassified },
        ],
        yieldCounts: [
          { field: 'Trade Matches', count: comClassified },
        ],
        yieldNullRates: comTotal > 0 ? [
          { field: 'permit_trades', pct: pct(comTotal - comClassified, comTotal) },
        ] : [],
      };
    }

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
        yieldNullRates: ap > 0 ? [
          { field: 'parcel_link', pct: pct(ap - current.permits_with_parcel, ap) },
        ] : [],
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
        yieldNullRates: ap > 0 ? [
          { field: 'neighbourhood_id', pct: pct(ap - current.permits_with_neighbourhood, ap) },
        ] : [],
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
        yieldNullRates: ap > 0 ? [
          { field: 'massing_link', pct: pct(ap - pm, ap) },
        ] : [],
      };
    }

    case 'link_similar': {
      // link_similar propagates scope tags from BLD permits to companion permits
      // (PLB, MS, DM etc.). Baseline is the DB count of permits with propagated
      // tags — this persists across runs (not just last-run output).
      const propagated = stats.permits_propagated;
      const lsNew = lastRunRecordsNew ?? 0;
      return {
        config, lastUpdated, status, cadence, lastRunMeta, lastRunRecordsTotal, lastRunRecordsNew,
        baselineTotal: ap, baselineLabel: 'Active Permits',
        targetPool: propagated, targetPoolLabel: 'Companion Permits',
        baselineNullRates: [],
        matchDenominator: ap, matchDenominatorLabel: 'Active Permits',
        matchCount: propagated, matchPct: pct(propagated, ap),
        matchTiers: [
          { label: 'Tags Propagated', count: propagated },
          ...(lsNew > 0 ? [{ label: 'DM Tags Fixed', count: lsNew }] : []),
        ],
        yieldCounts: [
          { field: 'Scope Propagated', count: propagated },
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
  table: string;
  /** Where this step reads from — DB table names or external labels like "CKAN API" */
  sources: string[];
  /** Specific columns written to target table. Omit for full-table ingest steps. */
  writes?: string[];
}

export const STEP_DESCRIPTIONS: Record<string, StepDescription> = {
  // Ingest — full table writes, no `writes` needed
  permits:              { summary: 'Ingests building permit CSV from Toronto Open Data CKAN API', table: 'permits', sources: ['CKAN API'] },
  coa:                  { summary: 'Ingests Committee of Adjustment applications from CKAN', table: 'coa_applications', sources: ['CKAN API'] },
  builders:             { summary: 'Extracts corporate entity names from permit applicant/builder fields', table: 'entities', sources: ['permits'], writes: ['legal_name', 'name_normalized', 'permit_count'] },
  address_points:       { summary: 'Loads Toronto address point reference data for geocoding', table: 'address_points', sources: ['CKAN API'] },
  parcels:              { summary: 'Loads Toronto property parcel boundaries and lot dimensions', table: 'parcels', sources: ['CKAN API'] },
  massing:              { summary: 'Loads 3D building massing models from City shapefile', table: 'building_footprints', sources: ['City Shapefile'] },
  neighbourhoods:       { summary: 'Loads neighbourhood boundary polygons and demographic data', table: 'neighbourhoods', sources: ['City GeoJSON'] },
  load_wsib:            { summary: 'Loads WSIB registry snapshot for contractor identity matching', table: 'wsib_registry', sources: ['WSIB CSV'] },
  // Link & Enrich — narrow writes on shared tables
  geocode_permits:      { summary: 'Matches permit addresses to address points for lat/lng coordinates', table: 'permits', sources: ['address_points'], writes: ['latitude', 'longitude', 'geocoded_at'] },
  link_parcels:         { summary: 'Links permits to property parcels via address or spatial match', table: 'permit_parcels', sources: ['permits', 'parcels'] },
  link_neighbourhoods:  { summary: 'Spatially links permits to neighbourhood boundaries', table: 'permits', sources: ['neighbourhoods'], writes: ['neighbourhood_id'] },
  link_massing:         { summary: 'Links permits to 3D building footprints via parcel intersection', table: 'parcel_buildings', sources: ['permit_parcels', 'building_footprints'] },
  link_coa:             { summary: 'Links CoA applications to building permits by address and ward', table: 'coa_applications', sources: ['permits', 'coa_applications'], writes: ['linked_permit_num', 'linked_confidence', 'last_seen_at'] },
  link_wsib:            { summary: 'Matches extracted entities against WSIB registry by name', table: 'entities', sources: ['wsib_registry'], writes: ['is_wsib_registered'] },
  enrich_wsib_builders: { summary: 'Web-scrapes contact info for WSIB-matched entities via Serper API', table: 'entities', sources: ['Serper API'], writes: ['primary_phone', 'primary_email', 'website', 'last_enriched_at'] },
  enrich_named_builders:{ summary: 'Web-scrapes contact info for unmatched entities via Serper API', table: 'entities', sources: ['Serper API'], writes: ['primary_phone', 'primary_email', 'website', 'last_enriched_at'] },
  link_similar:         { summary: 'Clusters permits by address proximity to find related applications', table: 'permits', sources: ['permits'], writes: ['scope_tags', 'project_type', 'scope_classified_at', 'scope_source'] },
  create_pre_permits:   { summary: 'Creates placeholder permit records from eligible CoA applications', table: 'coa_applications', sources: ['coa_applications'] },
  compute_centroids:    { summary: 'Computes geometric centroids for parcel polygons', table: 'parcels', sources: ['parcels'], writes: ['centroid_lat', 'centroid_lng'] },
  // Classify — narrow writes on permits or dedicated table
  classify_scope_class: { summary: 'Classifies permits into project types (residential/commercial/mixed)', table: 'permits', sources: ['permits'], writes: ['project_type', 'scope_classified_at', 'scope_source'] },
  classify_scope_tags:  { summary: 'Extracts detailed work scope tags from permit descriptions', table: 'permits', sources: ['permits'], writes: ['scope_tags', 'scope_classified_at', 'scope_source'] },
  classify_permits:     { summary: 'Assigns trade classifications using tag-trade matrix and rules', table: 'permit_trades', sources: ['permits'] },
  // Snapshot
  refresh_snapshot:     { summary: 'Captures current data quality metrics to daily snapshot table', table: 'data_quality_snapshots', sources: ['permits', 'entities', 'parcels'] },
  // Quality (CQA)
  assert_schema:        { summary: 'Validates upstream CKAN/CSV column headers before ingestion', table: 'pipeline_runs', sources: ['CKAN API'] },
  assert_data_bounds:   { summary: 'Post-ingestion SQL checks for cost outliers, null rates, referential integrity', table: 'pipeline_runs', sources: ['permits', 'parcels', 'address_points'] },
  // Deep Scrapes (coming soon)
  inspections:          { summary: 'Scrapes permit inspection stages from City Application Status portal', table: 'permit_inspections', sources: ['City Portal'] },
  coa_documents:        { summary: 'Downloads Committee of Adjustment plans and decision PDFs from AIC portal', table: 'coa_documents', sources: ['AIC Portal'] },
};
