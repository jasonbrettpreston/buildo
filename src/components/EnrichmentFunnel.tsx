'use client';

import { useState } from 'react';
import type { DataQualitySnapshot } from '@/lib/quality/types';
import type { PipelineRunInfo } from '@/components/FreshnessTimeline';

// ---------------------------------------------------------------------------
// Funnel source configuration — exported for testing
// Ordered to match permits pipeline chain execution order
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
  // 6-8. Builder enrichment
  { id: 'builders', name: 'Builder Profiles', statusSlug: 'builders', triggerSlug: 'builders', yieldFields: ['builder_name', 'phone', 'email', 'website'] },
  { id: 'wsib', name: 'WSIB Registry', statusSlug: 'link_wsib', triggerSlug: 'link_wsib', yieldFields: ['legal_name', 'trade_name', 'mailing_address'] },
  { id: 'builder_web', name: 'Builder Web Profiles', statusSlug: 'enrich_wsib_builders', triggerSlug: 'enrich_wsib_builders', yieldFields: ['phone', 'email', 'website'] },
  // 9-13. Spatial & linking
  { id: 'address_matching', name: 'Address Matching', statusSlug: 'geocode_permits', triggerSlug: 'geocode_permits', yieldFields: ['latitude', 'longitude'] },
  { id: 'parcels', name: 'Lots (Parcels)', statusSlug: 'link_parcels', triggerSlug: 'link_parcels', yieldFields: ['lot_size', 'frontage', 'depth', 'is_irregular'] },
  { id: 'neighbourhoods', name: 'Neighbourhoods', statusSlug: 'link_neighbourhoods', triggerSlug: 'link_neighbourhoods', yieldFields: ['neighbourhood_id', 'avg_income', 'construction_era'] },
  { id: 'massing', name: '3D Massing', statusSlug: 'link_massing', triggerSlug: 'link_massing', yieldFields: ['main_bldg_area', 'max_height', 'est_stories'] },
  { id: 'coa', name: 'CoA Applications', statusSlug: 'coa', triggerSlug: 'chain_coa', yieldFields: ['decision', 'hearing_date', 'applicant'] },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FunnelStats {
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

interface EnrichmentFunnelProps {
  stats: FunnelStats;
  current: DataQualitySnapshot;
  onTrigger: (slug: string) => void;
  runningPipelines: Set<string>;
}

// ---------------------------------------------------------------------------
// Data computation per source
// ---------------------------------------------------------------------------

interface FunnelRowData {
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

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

function nullPct(total: number, withField: number, denom: number): number {
  return denom > 0 ? Math.round(((denom - withField) / denom) * 1000) / 10 : 0;
}

function computeRowData(
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
                .sort(([, a], [, b]) => b - a)
                .slice(0, 4)
                .map(([tag, count]) => ({ label: tag, count }))
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
          { field: 'Total Builders', count: bt },
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
        matchDenominator: bt, matchDenominatorLabel: 'Total Builders',
        matchCount: stats.wsib_linked, matchPct: pct(stats.wsib_linked, bt),
        matchTiers: [
          { label: 'WSIB Matched', count: stats.wsib_linked },
          { label: 'Unmatched', count: bt - stats.wsib_linked },
        ],
        yieldCounts: [
          { field: 'Matched Builders', count: stats.wsib_linked },
          { field: 'Lead Pool', count: stats.wsib_lead_pool },
        ],
        yieldNullRates: [],
      };

    case 'builder_web': {
      // Use enrich_wsib_builders OR enrich_named_builders meta (prefer wsib)
      const webMeta = (stats.pipeline_last_run['enrich_wsib_builders']?.records_meta as Record<string, unknown>) ?? lastRunMeta;
      return {
        config, lastUpdated, status, cadence,
        lastRunMeta: webMeta,
        lastRunRecordsTotal: stats.pipeline_last_run['enrich_wsib_builders']?.records_total ?? lastRunRecordsTotal,
        lastRunRecordsNew: stats.pipeline_last_run['enrich_wsib_builders']?.records_new ?? lastRunRecordsNew,
        baselineTotal: bt, baselineLabel: 'Total Builders',
        targetPool: current.builders_enriched, targetPoolLabel: 'Enriched',
        baselineNullRates: bt > 0 ? [
          { field: 'phone', pct: nullPct(bt, current.builders_with_phone, bt) },
          { field: 'email', pct: nullPct(bt, current.builders_with_email, bt) },
          { field: 'website', pct: nullPct(bt, current.builders_with_website, bt) },
        ] : [],
        matchDenominator: bt, matchDenominatorLabel: 'Total Builders',
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
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const ms = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function statusDot(s: 'healthy' | 'warning' | 'stale'): string {
  if (s === 'healthy') return 'bg-green-500';
  if (s === 'warning') return 'bg-yellow-500';
  return 'bg-red-500';
}

// ---------------------------------------------------------------------------
// Last Run Zone — extracts from records_meta
// ---------------------------------------------------------------------------

function LastRunView({ row }: { row: FunnelRowData }) {
  const meta = row.lastRunMeta;

  if (!meta && row.lastRunRecordsTotal == null) {
    return (
      <p className="text-xs text-gray-400 italic py-2">No run data available yet. Trigger a pipeline run to populate.</p>
    );
  }

  const processed = (meta?.processed as number) ?? row.lastRunRecordsTotal ?? 0;
  const matched = (meta?.matched as number) ?? row.lastRunRecordsNew ?? 0;
  const failed = (meta?.failed as number) ?? 0;
  const websitesFound = (meta?.websites_found as number) ?? null;
  const extractedFields = (meta?.extracted_fields as Record<string, number>) ?? null;
  const runPct = processed > 0 ? Math.round((matched / processed) * 1000) / 10 : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Run Intersection */}
      <div>
        <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Run Intersection
        </h4>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-xs text-gray-600">Processed</span>
            <span className="text-xs font-semibold text-gray-900 tabular-nums">{processed.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-gray-600">Matched</span>
            <span className="text-xs font-semibold text-green-700 tabular-nums">{matched.toLocaleString()} ({runPct}%)</span>
          </div>
          {failed > 0 && (
            <div className="flex justify-between">
              <span className="text-xs text-gray-600">Failed</span>
              <span className="text-xs font-semibold text-red-500 tabular-nums">{failed.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Multi-step tracking (if available) */}
      {websitesFound != null && (
        <div>
          <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Pipeline Steps
          </h4>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-xs text-gray-600">1. Builders Searched</span>
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{processed.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-600">2. Websites Found</span>
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{websitesFound.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-600">3. Contacts Extracted</span>
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{matched.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Run Yield */}
      <div>
        <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Run Yield
        </h4>
        {extractedFields ? (
          <div className="space-y-1.5">
            {Object.entries(extractedFields)
              .filter(([, count]) => (count as number) > 0)
              .map(([field, count]) => (
                <div key={field} className="flex justify-between">
                  <span className="text-xs text-gray-600">{field}</span>
                  <span className="text-xs font-semibold text-gray-900 tabular-nums">{(count as number).toLocaleString()}</span>
                </div>
              ))}
            {Object.values(extractedFields).every((c) => (c as number) === 0) && (
              <p className="text-xs text-gray-400 italic">No fields extracted this run</p>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-xs text-gray-600">Records</span>
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{(row.lastRunRecordsTotal ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-600">New/Changed</span>
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{(row.lastRunRecordsNew ?? 0).toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// All Time Zone — existing snapshot data
// ---------------------------------------------------------------------------

function AllTimeView({ row }: { row: FunnelRowData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Zone 2: Baseline */}
      <div>
        <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Baseline (External Data)
        </h4>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-xs text-gray-600">{row.baselineLabel}</span>
            <span className="text-xs font-semibold text-gray-900 tabular-nums">{row.baselineTotal.toLocaleString()}</span>
          </div>
          {row.targetPool !== null && (
            <div className="flex justify-between">
              <span className="text-xs text-gray-600">{row.targetPoolLabel}</span>
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{row.targetPool.toLocaleString()}</span>
            </div>
          )}
          {row.baselineNullRates.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-200/60">
              <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Null Rates</p>
              {row.baselineNullRates.map((nr) => (
                <div key={nr.field} className="flex justify-between">
                  <span className="text-[11px] text-gray-500">{nr.field}</span>
                  <span className={`text-[11px] font-medium tabular-nums ${
                    nr.pct > 20 ? 'text-red-500' : nr.pct > 5 ? 'text-yellow-600' : 'text-green-600'
                  }`}>{nr.pct}% null</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Zone 3: Intersection */}
      <div>
        <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Intersection (Matching)
        </h4>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-xs text-gray-600">{row.matchDenominatorLabel}</span>
            <span className="text-xs font-semibold text-gray-900 tabular-nums">{row.matchDenominator.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-gray-600">Matched</span>
            <span className="text-xs font-semibold text-green-700 tabular-nums">{row.matchCount.toLocaleString()} ({row.matchPct}%)</span>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200/60">
            <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Sub-Tiers</p>
            {row.matchTiers.map((tier) => (
              <div key={tier.label} className="flex justify-between">
                <span className="text-[11px] text-gray-500">{tier.label}</span>
                <span className="text-[11px] font-medium text-gray-700 tabular-nums">{tier.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Zone 4: Yield */}
      <div>
        <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Extracted Yield
        </h4>
        <div className="space-y-1.5">
          {row.yieldCounts.map((y) => (
            <div key={y.field} className="flex justify-between">
              <span className="text-xs text-gray-600">{y.field}</span>
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{y.count.toLocaleString()}</span>
            </div>
          ))}
          {row.yieldNullRates.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-200/60">
              <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Yield Null Rates</p>
              {row.yieldNullRates.map((nr) => (
                <div key={nr.field} className="flex justify-between">
                  <span className="text-[11px] text-gray-500">{nr.field}</span>
                  <span className={`text-[11px] font-medium tabular-nums ${
                    nr.pct > 20 ? 'text-red-500' : nr.pct > 5 ? 'text-yellow-600' : 'text-green-600'
                  }`}>{nr.pct}% null</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FunnelRow component
// ---------------------------------------------------------------------------

function FunnelRow({ row, viewMode, onTrigger, isRunning }: {
  row: FunnelRowData;
  viewMode: 'all_time' | 'last_run';
  onTrigger: (slug: string) => void;
  isRunning: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Collapsed header */}
      <div className="flex items-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left min-w-0"
        >
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot(row.status)}`} />

          <div className="min-w-0 flex-shrink-0 w-44">
            <p className="text-sm font-medium text-gray-900 truncate">{row.config.name}</p>
            <p className="text-[10px] text-gray-400">Updated {timeAgo(row.lastUpdated)}</p>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    row.matchPct >= 90 ? 'bg-green-500' :
                    row.matchPct >= 70 ? 'bg-blue-500' :
                    row.matchPct >= 50 ? 'bg-yellow-500' : 'bg-red-400'
                  }`}
                  style={{ width: `${Math.min(row.matchPct, 100)}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-gray-700 tabular-nums w-12 text-right">{row.matchPct}%</span>
            </div>
          </div>

          <div className="hidden sm:flex gap-3 shrink-0">
            {row.yieldCounts.slice(0, 3).map((y) => (
              <div key={y.field} className="text-center">
                <p className="text-xs font-semibold text-gray-800 tabular-nums">{y.count.toLocaleString()}</p>
                <p className="text-[9px] text-gray-400 uppercase tracking-wider">{y.field}</p>
              </div>
            ))}
          </div>

          <svg
            className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Update Now button */}
        <button
          onClick={() => onTrigger(row.config.triggerSlug)}
          disabled={isRunning}
          className="px-3 py-3 border-l border-gray-200 hover:bg-blue-50 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          title={isRunning ? 'Running...' : 'Update Now'}
        >
          {isRunning ? (
            <svg className="w-4 h-4 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-gray-400 hover:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-4">
          {viewMode === 'all_time' ? <AllTimeView row={row} /> : <LastRunView row={row} />}

          {/* Zone 1: Metadata footer */}
          <div className="mt-3 pt-3 border-t border-gray-200/60 flex items-center gap-4 text-[10px] text-gray-400">
            <span>Schedule: <span className="text-gray-600 font-medium">{row.cadence}</span></span>
            <span>Last run: <span className="text-gray-600 font-medium">{timeAgo(row.lastUpdated)}</span></span>
            {row.lastUpdated && (
              <span>
                Status:{' '}
                <span className={`font-medium ${
                  row.status === 'healthy' ? 'text-green-600' :
                  row.status === 'warning' ? 'text-yellow-600' : 'text-red-500'
                }`}>
                  {row.status === 'healthy' ? 'Healthy' : row.status === 'warning' ? 'Warning' : 'Stale'}
                </span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EnrichmentFunnel component
// ---------------------------------------------------------------------------

export function EnrichmentFunnel({ stats, current, onTrigger, runningPipelines }: EnrichmentFunnelProps) {
  const [viewMode, setViewMode] = useState<'all_time' | 'last_run'>('all_time');
  const rows = FUNNEL_SOURCES.map((config) => computeRowData(config, stats, current));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Enrichment Funnel
        </h2>
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('all_time')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'all_time'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            All Time
          </button>
          <button
            onClick={() => setViewMode('last_run')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'last_run'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Last Run
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <FunnelRow
            key={row.config.id}
            row={row}
            viewMode={viewMode}
            onTrigger={onTrigger}
            isRunning={runningPipelines.has(row.config.triggerSlug) || runningPipelines.has(row.config.statusSlug)}
          />
        ))}
      </div>
    </div>
  );
}
