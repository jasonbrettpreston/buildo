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
  /** audit_table metric name to use for CircularBadge (overrides funnel matchPct) */
  auditMetric?: string;
}

export const FUNNEL_SOURCES: FunnelSourceConfig[] = [
  // 1. Hub
  { id: 'permits', name: 'Building Permits', statusSlug: 'permits', triggerSlug: 'chain_permits', yieldFields: ['permit_num', 'description', 'est_const_cost'] },
  // 2-5. Classification (derived from permits)
  { id: 'scope', name: 'Scope Classification', statusSlug: 'classify_scope', triggerSlug: 'classify_scope', yieldFields: ['project_type', 'scope_tags'], auditMetric: 'tags_coverage_rate' },
  { id: 'trades_residential', name: 'Trades (Residential)', statusSlug: 'classify_permits', triggerSlug: 'classify_permits', yieldFields: ['permit_trades'], auditMetric: 'classification_coverage' },
  { id: 'trades_commercial', name: 'Trades (Commercial)', statusSlug: 'classify_permits', triggerSlug: 'classify_permits', yieldFields: ['permit_trades'], auditMetric: 'classification_coverage' },
  // 6-8. Entity enrichment
  { id: 'builders', name: 'Entity Extraction', statusSlug: 'builders', triggerSlug: 'builders', yieldFields: ['legal_name', 'phone', 'email', 'website'] },
  { id: 'wsib', name: 'WSIB Registry', statusSlug: 'link_wsib', triggerSlug: 'link_wsib', yieldFields: ['legal_name', 'trade_name', 'mailing_address'], auditMetric: 'link_rate' },
  { id: 'builder_web', name: 'Entity Web Enrichment', statusSlug: 'enrich_wsib_builders', triggerSlug: 'enrich_wsib_builders', yieldFields: ['phone', 'email', 'website'] },
  // 9-13. Spatial & linking
  { id: 'address_matching', name: 'Address Matching', statusSlug: 'geocode_permits', triggerSlug: 'geocode_permits', yieldFields: ['latitude', 'longitude'], auditMetric: 'geocode_coverage' },
  { id: 'parcels', name: 'Lots (Parcels)', statusSlug: 'link_parcels', triggerSlug: 'link_parcels', yieldFields: ['lot_size', 'frontage', 'depth', 'is_irregular'], auditMetric: 'link_rate' },
  { id: 'neighbourhoods', name: 'Neighbourhoods', statusSlug: 'link_neighbourhoods', triggerSlug: 'link_neighbourhoods', yieldFields: ['neighbourhood_id', 'avg_income', 'construction_era'], auditMetric: 'link_rate' },
  { id: 'massing', name: '3D Massing', statusSlug: 'link_massing', triggerSlug: 'link_massing', yieldFields: ['main_bldg_area', 'max_height', 'est_stories'], auditMetric: 'link_rate' },
  { id: 'link_similar', name: 'Similar Permits', statusSlug: 'link_similar', triggerSlug: 'link_similar', yieldFields: ['similar_permit_id'] },
  { id: 'link_coa', name: 'CoA Linking', statusSlug: 'link_coa', triggerSlug: 'link_coa', yieldFields: ['linked_permit_num', 'linked_confidence'] },
  { id: 'coa', name: 'CoA Applications', statusSlug: 'coa', triggerSlug: 'chain_coa', yieldFields: ['decision', 'hearing_date', 'applicant'] },
];

/** Pre-computed lookup: statusSlug → FunnelSourceConfig (O(1) instead of .find()) */
export const FUNNEL_SOURCE_BY_SLUG: Record<string, FunnelSourceConfig> = Object.fromEntries(
  FUNNEL_SOURCES.map(s => [s.statusSlug, s])
);

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

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

function nullPct(total: number, withField: number, denom: number): number {
  return denom > 0 ? Math.round(((denom - withField) / denom) * 1000) / 10 : 0;
}

// ---------------------------------------------------------------------------
// Compute funnel data for a single source
// ---------------------------------------------------------------------------

function resolveLastRun(slug: string, plr: Record<string, PipelineRunInfo>): PipelineRunInfo | undefined {
  // Chain-scoped keys: pipeline_runs stores "chainId:slug" (e.g. "permits:link_similar").
  // A slug may appear in multiple chains (e.g. link_coa in both permits and coa chains).
  // Also check the unscoped key (legacy pre-chain rows) and pick the most recent across all.
  let best: PipelineRunInfo | undefined;

  // Check unscoped key (legacy)
  if (plr[slug]) best = plr[slug];

  // Check all chain-scoped keys and pick the most recent
  for (const key of Object.keys(plr)) {
    if (key.endsWith(`:${slug}`)) {
      const candidate = plr[key];
      if (!candidate) continue;
      if (!best || (candidate.last_run_at && (!best.last_run_at || candidate.last_run_at >= best.last_run_at))) {
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
    let slaHours = 48; // Default: Daily (24h + 24h buffer)
    if (cadence === 'Annual') slaHours = 8760;
    else if (cadence === 'Quarterly') slaHours = 2160;
    else if (cadence === 'Monthly') slaHours = 744;
    else if (cadence === 'Weekly') slaHours = 192;
    if (hoursAgo > slaHours) status = 'stale';
    else if (hoursAgo > slaHours * 0.8) status = 'warning';
    // Ran recently but produced 0 new + 0 updated = warning (data unchanged)
    // Only flag completed runs — running steps haven't reported final counts yet
    // Only apply to loader/primary-data steps — linker/enrichment steps legitimately
    // produce 0 records when no new upstream data was loaded (incremental runs)
    else if (lastRun && lastRun.status === 'completed' && lastRun.records_new != null && lastRun.records_new === 0 && (lastRun.records_updated ?? 0) === 0) {
      const LOADER_SLUGS = ['permits', 'coa', 'address_points', 'parcels', 'massing', 'neighbourhoods', 'load_wsib'];
      if (LOADER_SLUGS.includes(config.statusSlug)) {
        status = 'warning';
      }
    }
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

    case 'scope': {
      const tagged = current.permits_with_detailed_tags ?? 0;
      return {
        config, lastUpdated, status, cadence, lastRunMeta, lastRunRecordsTotal, lastRunRecordsNew,
        baselineTotal: ap, baselineLabel: 'Active Permits',
        targetPool: null, targetPoolLabel: null, baselineNullRates: [],
        matchDenominator: ap, matchDenominatorLabel: 'Active Permits',
        matchCount: current.permits_with_scope, matchPct: pct(current.permits_with_scope, ap),
        matchTiers: [
          { label: 'With Project Type', count: current.permits_with_scope },
          { label: 'With Scope Tags', count: tagged },
          { label: 'Residential', count: current.scope_project_type_breakdown?.residential ?? 0 },
          { label: 'Commercial', count: current.scope_project_type_breakdown?.commercial ?? 0 },
          { label: 'Unclassified', count: ap - current.permits_with_scope },
        ],
        yieldCounts: [
          { field: 'Classified', count: current.permits_with_scope },
          { field: 'Tagged', count: tagged },
        ],
        yieldNullRates: ap > 0 ? [
          { field: 'project_type', pct: pct(ap - current.permits_with_scope, ap) },
          { field: 'scope_tags', pct: pct(ap - tagged, ap) },
        ] : [],
      };
    }

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
}

export const STEP_DESCRIPTIONS: Record<string, StepDescription> = {
  // Ingest
  permits:              { summary: 'Ingests building permit CSV from Toronto Open Data CKAN API', table: 'permits' },
  close_stale_permits:  { summary: 'Detects permits removed from feed and transitions to Pending Closed / Closed', table: 'permits' },
  classify_permit_phase:{ summary: 'Reclassifies pre-issuance permits from Inspection to Examination phase', table: 'permits' },
  coa:                  { summary: 'Ingests Committee of Adjustment applications from CKAN', table: 'coa_applications' },
  builders:             { summary: 'Extracts corporate entity names from permit applicant/builder fields', table: 'entities' },
  address_points:       { summary: 'Loads Toronto address point reference data for geocoding', table: 'address_points' },
  parcels:              { summary: 'Loads Toronto property parcel boundaries and lot dimensions', table: 'parcels' },
  massing:              { summary: 'Loads 3D building massing models from City shapefile', table: 'building_footprints' },
  neighbourhoods:       { summary: 'Loads neighbourhood boundary polygons and demographic data', table: 'neighbourhoods' },
  load_wsib:            { summary: 'Loads WSIB registry snapshot for contractor identity matching', table: 'wsib_registry' },
  // Link & Enrich
  geocode_permits:      { summary: 'Matches permit addresses to address points for lat/lng coordinates', table: 'permits' },
  link_parcels:         { summary: 'Links permits to property parcels via address or spatial match', table: 'permit_parcels' },
  link_neighbourhoods:  { summary: 'Spatially links permits to neighbourhood boundaries', table: 'permits' },
  link_massing:         { summary: 'Links permits to 3D building footprints via parcel intersection', table: 'parcel_buildings' },
  link_coa:             { summary: 'Links CoA applications to building permits by address and ward', table: 'coa_applications' },
  link_wsib:            { summary: 'Matches extracted entities against WSIB registry by name', table: 'entities' },
  enrich_wsib_builders: { summary: 'Web-scrapes contact info for WSIB-matched entities via Serper API', table: 'entities' },
  enrich_named_builders:{ summary: 'Web-scrapes contact info for unmatched entities via Serper API', table: 'entities' },
  enrich_wsib_registry: { summary: 'Enriches WSIB registry entries directly with contact data via Serper API', table: 'wsib_registry' },
  link_similar:         { summary: 'Clusters permits by address proximity to find related applications', table: 'permits' },
  create_pre_permits:   { summary: 'Creates placeholder permit records from eligible CoA applications', table: 'coa_applications' },
  compute_centroids:    { summary: 'Computes geometric centroids for parcel polygons', table: 'parcels' },
  // Classify
  classify_scope:       { summary: 'Classifies project_type and extracts scope_tags for new/changed permits, then propagates BLD scope to companion permits', table: 'permits' },
  classify_permits:     { summary: 'Assigns trade classifications using tag-trade matrix and rules', table: 'permit_trades' },
  classify_lifecycle_phase: { summary: 'Computes lifecycle_phase + lifecycle_stalled for dirty permits and CoA applications. Runs as the final step of permits + coa chains. Uses pg_try_advisory_lock(85) to single-thread concurrent runs.', table: 'permits' },
  compute_timing_calibration_v2: { summary: 'Computes phase-to-phase median lead times from inspection history. Mines sequential passed-stage pairs, maps to lifecycle phases, stores in phase_calibration for the flight tracker.', table: 'phase_calibration' },
  // Compute (lead feed pre-computation)
  compute_cost_estimates:     { summary: 'Pre-computes cost model estimates for all permits (permit-reported or model-based)', table: 'cost_estimates' },
  compute_timing_calibration: { summary: 'Calibrates timing percentiles per permit_type from inspection history', table: 'timing_calibration' },
  // Snapshot
  refresh_snapshot:     { summary: 'Captures current data quality metrics to daily snapshot table', table: 'data_quality_snapshots' },
  // Quality (CQA)
  assert_schema:        { summary: 'Validates upstream CKAN/CSV column headers before ingestion', table: 'pipeline_runs' },
  assert_data_bounds:   { summary: 'Post-ingestion SQL checks for cost outliers, null rates, referential integrity', table: 'pipeline_runs' },
  assert_engine_health:  { summary: 'Engine health checks: dead tuples, index usage, update ping-pong detection', table: 'engine_health_snapshots' },
  assert_network_health: { summary: 'Validates scraper network health: proxy errors, latency, schema drift, WAF traps', table: 'pipeline_runs' },
  assert_staleness:      { summary: 'Detects stale inspection permits not scraped within 14 days', table: 'pipeline_runs' },
  assert_pre_permit_aging: { summary: 'Detects approved+unlinked CoA applications aging past 12/18 months', table: 'pipeline_runs' },
  assert_coa_freshness:    { summary: 'Checks CKAN portal freshness — warns if newest CoA data is >45 days stale', table: 'pipeline_runs' },
  // Deep Scrapes
  inspections:                    { summary: 'Scrapes permit inspection stages from City Application Status portal', table: 'permit_inspections' },
  classify_inspection_status:     { summary: 'Detects stalled permits (10+ months inactive) and classifies enriched_status', table: 'permits' },
  coa_documents:        { summary: 'Downloads Committee of Adjustment plans and decision PDFs from AIC portal', table: 'coa_documents' },
};

// ---------------------------------------------------------------------------
// Pipeline slug → primary DB table mapping (shared between stats API and UI)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Expected behavior ranges — per-step baselines for telemetry labelling
// ---------------------------------------------------------------------------

/** Expected value range as [min, max] inclusive */
type ValueRange = [number, number];

interface ExpectedRanges {
  /** Brief explanation of what this step does and why its numbers look the way they do */
  behavior: string;
  /** Expected PIPELINE_SUMMARY values per run */
  summary?: {
    records_total?: ValueRange;
    records_new?: ValueRange;
    records_updated?: ValueRange;
  };
  /** Expected pg_stats mutation counts per table */
  mutations?: Record<string, {
    ins?: ValueRange;
    upd?: ValueRange;
    del?: ValueRange;
  }>;
  /** Expected T1 row count delta per table */
  row_delta?: Record<string, ValueRange>;
}

/**
 * Returns range status for a given value against an expected range.
 * - 'normal':     value is within [min, max]
 * - 'borderline': value is outside range but within 20% of the nearest boundary
 * - 'anomaly':    value is more than 20% beyond the nearest boundary
 */
export function getRangeStatus(value: number, range: ValueRange): 'normal' | 'borderline' | 'anomaly' {
  const [min, max] = range;
  if (value >= min && value <= max) return 'normal';
  const span = max - min || 1;
  const margin = span * 0.20;
  if (value < min) {
    return value >= min - margin ? 'borderline' : 'anomaly';
  }
  return value <= max + margin ? 'borderline' : 'anomaly';
}

/**
 * Per-step expected behavior ranges, populated from observed pipeline_runs data.
 * Used by TelemetrySection and Last Run tiles to display range indicators.
 *
 * Values reflect steady-state runs (no new upstream data). When upstream data
 * changes (e.g. new permits from City), totals will temporarily spike — that is
 * expected and not an anomaly.
 */
export const STEP_EXPECTED_RANGES: Record<string, ExpectedRanges> = {
  // ── Ingest ──────────────────────────────────────────────────────────────
  permits: {
    behavior: 'Fetches all building permits from CKAN. On steady-state days, 0 new records (hash unchanged). On update days, typically 50-500 new/changed permits.',
    summary: { records_total: [0, 500], records_new: [0, 500], records_updated: [0, 100] },
    mutations: { permits: { ins: [0, 500], upd: [0, 500], del: [0, 0] } },
    row_delta: { permits: [0, 500] },
  },
  coa: {
    behavior: 'Incremental CoA fetch (last 90 days). On steady-state days, 0 new records. On update days, typically 0-100 new applications.',
    summary: { records_total: [0, 200], records_new: [0, 200], records_updated: [0, 50] },
    mutations: { coa_applications: { ins: [0, 200], upd: [0, 200], del: [0, 0] } },
    row_delta: { coa_applications: [0, 200] },
  },
  builders: {
    behavior: 'Extracts entity names from permit applicant/builder fields. Steady-state: 0 new entities unless new permits arrived.',
    summary: { records_total: [3500, 4000], records_new: [0, 50], records_updated: [0, 20] },
    mutations: { entities: { ins: [0, 50], upd: [0, 20], del: [0, 0] } },
    row_delta: { entities: [0, 50] },
  },
  address_points: {
    behavior: 'Loads Toronto address point reference data. Quarterly refresh — typically 0 changes between refreshes.',
    summary: { records_total: [0, 1000], records_new: [0, 1000], records_updated: [0, 100] },
    mutations: { address_points: { ins: [0, 1000], upd: [0, 1000], del: [0, 0] } },
    row_delta: { address_points: [0, 1000] },
  },
  parcels: {
    behavior: 'Loads Toronto property parcels. Quarterly refresh — typically 0 changes between refreshes.',
    summary: { records_total: [0, 1000], records_new: [0, 1000], records_updated: [0, 500] },
    mutations: { parcels: { ins: [0, 1000], upd: [0, 1000], del: [0, 0] } },
    row_delta: { parcels: [0, 1000] },
  },
  massing: {
    behavior: 'Loads 3D building massing models from City shapefile. Quarterly refresh — typically 0 changes between refreshes.',
    summary: { records_total: [0, 1000], records_new: [0, 1000], records_updated: [0, 500] },
    mutations: { building_footprints: { ins: [0, 1000], upd: [0, 1000], del: [0, 0] } },
    row_delta: { building_footprints: [0, 1000] },
  },
  neighbourhoods: {
    behavior: 'Loads 158 neighbourhood boundaries from GeoJSON, then enriches all rows with Census demographics across 8 characteristics. The ~2,054 SQL UPDATEs are normal — each demographic dimension updates all 158 rows individually.',
    summary: { records_total: [155, 165], records_new: [155, 165], records_updated: [20, 50] },
    mutations: { neighbourhoods: { ins: [0, 10], upd: [1800, 2500], del: [0, 0] } },
    row_delta: { neighbourhoods: [0, 10] },
  },
  load_wsib: {
    behavior: 'Loads WSIB registry snapshot. Typically 0 changes unless a new WSIB file is provided.',
    summary: { records_total: [0, 500], records_new: [0, 500], records_updated: [0, 200] },
    mutations: { wsib_registry: { ins: [0, 500], upd: [0, 500], del: [0, 0] } },
    row_delta: { wsib_registry: [0, 500] },
  },

  // ── Link & Enrich ──────────────────────────────────────────────────────
  geocode_permits: {
    behavior: 'Matches permit addresses to address points for lat/lng. Steady-state: 0 geocoded (all already done). After new permits: matches new addresses.',
    summary: { records_total: [0, 500], records_new: [0, 500], records_updated: [0, 100] },
    mutations: { permits: { ins: [0, 0], upd: [0, 500], del: [0, 0] } },
    row_delta: { permits: [0, 0] },
  },
  link_parcels: {
    behavior: 'Links permits to property parcels via address match. Steady-state: 0 linked. After new permits: links new ones.',
    summary: { records_total: [0, 500], records_new: [0, 500], records_updated: [0, 500] },
    mutations: { permit_parcels: { ins: [0, 500], upd: [0, 100], del: [0, 0] } },
    row_delta: { permit_parcels: [0, 500] },
  },
  link_neighbourhoods: {
    behavior: 'Spatially links permits to neighbourhood boundaries. Steady-state: 0 linked. After new permits: links new ones.',
    summary: { records_total: [0, 500], records_new: [0, 500], records_updated: [0, 500] },
    mutations: { permits: { ins: [0, 0], upd: [0, 500], del: [0, 0] } },
    row_delta: { permits: [0, 0] },
  },
  link_massing: {
    behavior: 'Links permits to 3D building footprints via parcel intersection. Steady-state: 0 linked. Uses in-memory grid index for efficiency.',
    summary: { records_total: [0, 500], records_new: [0, 500], records_updated: [0, 500] },
    mutations: { parcel_buildings: { ins: [0, 500], upd: [0, 5000], del: [0, 0] } },
    row_delta: { parcel_buildings: [0, 500] },
  },
  link_coa: {
    behavior: 'Links CoA applications to building permits by address and ward. Typically 0-40 links per run.',
    summary: { records_total: [0, 50], records_new: [0, 50], records_updated: [0, 50] },
    mutations: { coa_applications: { ins: [0, 0], upd: [0, 50], del: [0, 0] } },
    row_delta: { coa_applications: [0, 0] },
  },
  link_wsib: {
    behavior: 'Matches extracted entities against WSIB registry by name. Steady-state: 0 matches. After new entities: fuzzy-matches names.',
    summary: { records_total: [0, 20], records_new: [0, 20], records_updated: [0, 10] },
    mutations: { entities: { ins: [0, 0], upd: [0, 200], del: [0, 0] } },
    row_delta: { entities: [0, 0] },
  },
  enrich_wsib_builders: {
    behavior: 'Web-scrapes contact info for WSIB-matched entities via Serper API. Batch size capped at 50 per run.',
    summary: { records_total: [0, 50], records_new: [0, 50], records_updated: [0, 50] },
    mutations: { entities: { ins: [0, 0], upd: [0, 50], del: [0, 0] } },
  },
  enrich_named_builders: {
    behavior: 'Web-scrapes contact info for unmatched entities via Serper API. Batch size capped at 50 per run.',
    summary: { records_total: [0, 50], records_new: [0, 50], records_updated: [0, 50] },
    mutations: { entities: { ins: [0, 0], upd: [0, 50], del: [0, 0] } },
  },
  enrich_wsib_registry: {
    behavior: 'Enriches WSIB registry entries directly with contact data via Serper API. Prioritizes Large > Medium > Small businesses with trade names.',
    summary: { records_total: [0, 50], records_new: [0, 50], records_updated: [0, 50] },
    mutations: { wsib_registry: { ins: [0, 0], upd: [0, 50], del: [0, 0] } },
  },
  link_similar: {
    behavior: 'Clusters permits by address proximity to find related (companion) applications. Propagates BLD scope to companions. Typically ~10,700 permits updated per run — this is normal whole-table reprocessing.',
    summary: { records_total: [10000, 12000], records_new: [0, 500], records_updated: [10000, 12000] },
    mutations: { permits: { ins: [0, 0], upd: [10000, 12000], del: [0, 0] } },
    row_delta: { permits: [0, 0] },
  },
  compute_centroids: {
    behavior: 'Computes geometric centroids for parcel polygons. Steady-state: 0 computed (all already done).',
    summary: { records_total: [0, 500], records_new: [0, 500], records_updated: [0, 500] },
    mutations: { parcels: { ins: [0, 0], upd: [0, 500], del: [0, 0] } },
    row_delta: { parcels: [0, 0] },
  },
  create_pre_permits: {
    behavior: 'Creates placeholder permit records from eligible CoA applications. Typically ~370 candidates checked, 0 new on steady-state.',
    summary: { records_total: [350, 400], records_new: [0, 20], records_updated: [0, 10] },
  },

  // ── Classify ────────────────────────────────────────────────────────────
  classify_scope: {
    behavior: 'Classifies project_type and extracts scope_tags for new/changed permits. Processes ~10,700 permits per run then propagates BLD scope to companions.',
    summary: { records_total: [10000, 12000], records_new: [0, 500], records_updated: [10000, 12000] },
    mutations: { permits: { ins: [0, 0], upd: [10000, 12000], del: [0, 0] } },
    row_delta: { permits: [0, 0] },
  },
  classify_permits: {
    behavior: 'Assigns trade classifications using tag-trade matrix. Processes ~95,000 permits per run. The high records_updated count is normal — existing classifications are refreshed. The low T2 mutation count vs high summary count is because sub-batch INSERTs use ON CONFLICT.',
    summary: { records_total: [90000, 100000], records_new: [0, 500], records_updated: [90000, 100000] },
    mutations: { permit_trades: { ins: [0, 1000], upd: [0, 710000], del: [0, 0] } },
    row_delta: { permit_trades: [0, 1000] },
  },

  // ── Snapshot & Quality ──────────────────────────────────────────────────
  refresh_snapshot: {
    behavior: 'Captures daily data quality metrics snapshot. Always produces exactly 1 record (upsert on snapshot_date).',
    summary: { records_total: [1, 1], records_new: [1, 1], records_updated: [0, 0] },
    mutations: { data_quality_snapshots: { ins: [0, 1], upd: [0, 1], del: [0, 0] } },
    row_delta: { data_quality_snapshots: [0, 1] },
  },
  assert_engine_health: {
    behavior: 'Queries pg_stat_user_tables for dead tuples, seq scans, and update ping-pong. Auto-VACUUMs tables exceeding 10% dead ratio. Snapshots to engine_health_snapshots.',
    summary: { records_total: [10, 15], records_new: [0, 0], records_updated: [0, 15] },
    mutations: { engine_health_snapshots: { ins: [0, 15], upd: [0, 15], del: [0, 0] } },
    row_delta: { engine_health_snapshots: [0, 15] },
  },
  inspections: {
    behavior: 'Scrapes inspection stages from AIC portal via REST API. Weekly cadence, ~104K target permits across 5 types. Each run processes BATCH_SIZE permits (default 10).',
    summary: { records_total: [1, 500], records_new: [0, 5000], records_updated: [0, 0] },
    mutations: { permit_inspections: { ins: [0, 5000], upd: [0, 5000], del: [0, 0] } },
    row_delta: { permit_inspections: [0, 5000] },
  },
};

export const PIPELINE_TABLE_MAP: Record<string, string> = {
  permits: 'permits', coa: 'coa_applications', builders: 'entities',
  address_points: 'address_points', parcels: 'parcels', massing: 'building_footprints',
  neighbourhoods: 'neighbourhoods', load_wsib: 'wsib_registry',
  geocode_permits: 'permits', link_parcels: 'permit_parcels',
  link_neighbourhoods: 'permits', link_massing: 'parcel_buildings',
  link_coa: 'coa_applications', link_wsib: 'entities',
  enrich_wsib_builders: 'entities', enrich_named_builders: 'entities', enrich_wsib_registry: 'wsib_registry',
  link_similar: 'permits', create_pre_permits: 'coa_applications',
  compute_centroids: 'parcels', classify_scope: 'permits',
  classify_permits: 'permit_trades',
  compute_cost_estimates: 'cost_estimates',
  compute_timing_calibration: 'timing_calibration',
  refresh_snapshot: 'data_quality_snapshots', assert_schema: 'pipeline_runs',
  assert_data_bounds: 'pipeline_runs', assert_engine_health: 'engine_health_snapshots',
  assert_network_health: 'pipeline_runs', assert_staleness: 'pipeline_runs',
  assert_coa_freshness: 'pipeline_runs',
  assert_pre_permit_aging: 'pipeline_runs',
  inspections: 'permit_inspections',
  coa_documents: 'coa_documents',
};
