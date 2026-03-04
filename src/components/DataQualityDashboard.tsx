'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { findSnapshotDaysAgo, trendDelta, SLA_TARGETS } from '@/lib/quality/types';
import { DataSourceCircle } from '@/components/DataSourceCircle';
import { FreshnessTimeline } from '@/components/FreshnessTimeline';
import { ScheduleEditModal } from '@/components/ScheduleEditModal';

// ---------------------------------------------------------------------------
// Pipeline schedule constants (shared with admin page)
// ---------------------------------------------------------------------------

const PIPELINE_SCHEDULES: Record<string, { label: string }> = {
  // Ingest
  permits: { label: 'Daily' },
  coa: { label: 'Daily' },
  builders: { label: 'Daily' },
  address_points: { label: 'Quarterly' },
  parcels: { label: 'Quarterly' },
  massing: { label: 'Quarterly' },
  neighbourhoods: { label: 'Annual' },
  // Link
  geocode_permits: { label: 'Daily' },
  link_parcels: { label: 'Quarterly' },
  link_neighbourhoods: { label: 'Annual' },
  link_massing: { label: 'Quarterly' },
  link_coa: { label: 'Daily' },
  // Enrich
  enrich_google: { label: 'Daily' },
  enrich_wsib: { label: 'Daily' },
  // Classify
  classify_scope_class: { label: 'Daily' },
  classify_scope_tags: { label: 'Daily' },
  classify_permits: { label: 'Daily' },
  // Compute centroids
  compute_centroids: { label: 'Quarterly' },
  // Similar + Pre-permits
  link_similar: { label: 'Daily' },
  create_pre_permits: { label: 'Daily' },
  // Snapshot
  refresh_snapshot: { label: 'Daily' },
  // Quality (CQA)
  assert_schema: { label: 'Daily' },
  assert_data_bounds: { label: 'Daily' },
};

function getNextScheduledDate(slug: string, apiSchedules?: Record<string, { cadence: string }> | null): string {
  const now = new Date();
  // Prefer API schedules, fall back to hardcoded
  const cadence = apiSchedules?.[slug]?.cadence ?? PIPELINE_SCHEDULES[slug]?.label;
  if (!cadence) return 'N/A';

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (cadence === 'Daily') {
    const estHours: Record<string, number> = { permits: 7, coa: 8, builders: 9 };
    const hour = estHours[slug] ?? 7;
    const next = new Date(now);
    next.setUTCHours(hour, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return fmt(next);
  }

  if (cadence === 'Quarterly') {
    const quarterMonths = [0, 3, 6, 9];
    const year = now.getFullYear();
    for (const month of quarterMonths) {
      const d = new Date(year, month, 1);
      if (d > now) return fmt(d);
    }
    return fmt(new Date(year + 1, 0, 1));
  }

  if (cadence === 'Annual') {
    const thisYear = new Date(now.getFullYear(), 0, 1);
    if (thisYear > now) return fmt(thisYear);
    return fmt(new Date(now.getFullYear() + 1, 0, 1));
  }

  return 'N/A';
}

// ---------------------------------------------------------------------------
// Stats types (for pipeline_last_run from /api/admin/stats)
// ---------------------------------------------------------------------------

import type { PipelineRunInfo } from '@/components/FreshnessTimeline';
import type {
  VolumeAnomaly,
  SchemaDriftAlert,
  SystemHealthSummary,
} from '@/lib/quality/types';

interface AdminStats {
  total_permits: number;
  active_permits: number;
  address_points_total: number;
  parcels_total: number;
  building_footprints_total: number;
  parcels_with_massing: number;
  permits_with_massing: number;
  neighbourhoods_total: number;
  coa_upcoming: number;
  newest_permit_date: string | null;
  newest_coa_date: string | null;
  pipeline_last_run: Record<string, PipelineRunInfo>;
  pipeline_schedules: Record<string, { cadence: string; cron_expression: string | null }>;
  [key: string]: unknown;
}

interface ExtendedQualityResponse {
  current: import('@/lib/quality/types').DataQualitySnapshot | null;
  trends: import('@/lib/quality/types').DataQualitySnapshot[];
  lastUpdated: string | null;
  anomalies: VolumeAnomaly[];
  schemaDrift: SchemaDriftAlert[];
  health: SystemHealthSummary;
}

function calcPct(num: number, denom: number): number {
  if (denom === 0) return 0;
  return Math.round((num / denom) * 1000) / 10;
}

function fmtPct(num: number, denom: number): string {
  return `${calcPct(num, denom)}%`;
}

const POLL_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function DataQualityDashboard() {
  const [data, setData] = useState<ExtendedQualityResponse | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningPipelines, setRunningPipelines] = useState<Set<string>>(new Set());
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [scheduleModal, setScheduleModal] = useState<{ pipeline: string; name: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(() => {
    return Promise.all([
      fetch('/api/quality').then((r) => r.json()),
      fetch('/api/admin/stats').then((r) => r.json()),
    ])
      .then(([qualityData, statsData]) => {
        setData(qualityData);
        setStats(statsData);
        return statsData as AdminStats;
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Polling while pipelines are running — also detects chain-spawned running steps
  useEffect(() => {
    if (runningPipelines.size === 0) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(async () => {
      const freshStats = await fetchData();
      if (!freshStats) return;
      setRunningPipelines((prev) => {
        const next = new Set<string>();
        // Keep any user-triggered slugs that are still running
        for (const slug of prev) {
          if (freshStats.pipeline_last_run?.[slug]?.status === 'running') next.add(slug);
        }
        // Also detect any individually-running pipeline steps (e.g. spawned by chain orchestrator)
        for (const [slug, info] of Object.entries(freshStats.pipeline_last_run ?? {})) {
          if (info?.status === 'running') next.add(slug);
        }
        return next;
      });
    }, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [runningPipelines.size, fetchData]);

  const triggerPipeline = useCallback(async (slug: string) => {
    setPipelineError(null);
    setRunningPipelines((prev) => new Set(prev).add(slug));
    try {
      const res = await fetch(`/api/admin/pipelines/${slug}`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body.error || body.message || `Failed with status ${res.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPipelineError(`${slug}: ${msg}`);
      setRunningPipelines((prev) => { const next = new Set(prev); next.delete(slug); return next; });
    }
  }, []);

  const saveSchedule = useCallback(async (pipeline: string, cadence: string) => {
    const res = await fetch('/api/admin/pipelines/schedules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline, cadence }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(body.error || 'Failed to save');
    }
    // Refresh stats to pick up the new schedule
    await fetchData();
  }, [fetchData]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading data quality metrics...</div>;
  }

  const current = data?.current;
  const lastRunAt = (slug: string) => stats?.pipeline_last_run?.[slug]?.last_run_at ?? current?.last_sync_at ?? null;

  // Compute 30-day trend deltas
  const prev = data?.trends ? findSnapshotDaysAgo(data.trends, 30) : null;
  const prevPct = (num: number, denom: number) => prev ? calcPct(num, denom) : null;

  const trendGeo = current && prev
    ? trendDelta(calcPct(current.permits_geocoded, current.active_permits), prevPct(prev.permits_geocoded, prev.active_permits))
    : null;
  const trendParcels = current && prev
    ? trendDelta(calcPct(current.permits_with_parcel, current.active_permits), prevPct(prev.permits_with_parcel, prev.active_permits))
    : null;
  const trendMassing = current && prev && stats
    ? trendDelta(calcPct(stats.permits_with_massing ?? 0, current.active_permits), prevPct(prev.parcels_with_buildings ?? 0, prev.active_permits))
    : null;
  const trendNeighbourhoods = current && prev
    ? trendDelta(calcPct(current.permits_with_neighbourhood, current.active_permits), prevPct(prev.permits_with_neighbourhood, prev.active_permits))
    : null;
  const trendCoa = current && prev
    ? trendDelta(calcPct(current.coa_linked, current.coa_total), prevPct(prev.coa_linked, prev.coa_total))
    : null;
  const trendBuilders = current && prev
    ? trendDelta(calcPct(current.permits_with_builder, current.active_permits), prevPct(prev.permits_with_builder, prev.active_permits))
    : null;
  const trendScopeClass = current && prev
    ? trendDelta(calcPct(current.permits_with_scope, current.active_permits), prevPct(prev.permits_with_scope, prev.active_permits))
    : null;
  const trendScopeTags = current && prev
    ? trendDelta(calcPct(current.permits_with_detailed_tags ?? 0, current.active_permits), prevPct(prev.permits_with_detailed_tags ?? 0, prev.active_permits))
    : null;
  const trendTradesRes = current && prev
    ? trendDelta(calcPct(current.trade_residential_classified ?? 0, current.trade_residential_total ?? 0), prevPct(prev.trade_residential_classified ?? 0, prev.trade_residential_total ?? 0))
    : null;
  const trendTradesCom = current && prev
    ? trendDelta(calcPct(current.trade_commercial_classified ?? 0, current.trade_commercial_total ?? 0), prevPct(prev.trade_commercial_classified ?? 0, prev.trade_commercial_total ?? 0))
    : null;

  return (
    <div className="space-y-8">
      {/* Pipeline error banner */}
      {pipelineError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between">
          <p className="text-sm text-red-700">Pipeline trigger failed: {pipelineError}</p>
          <button onClick={() => setPipelineError(null)} className="text-red-400 hover:text-red-600 text-xs">Dismiss</button>
        </div>
      )}

      {current ? (
        <>
          {/* ============================================================
              Health Banner — System-wide traffic light + quality trends
          ============================================================ */}
          {data?.health && (
            <div className={`rounded-lg border px-4 py-3 ${
              data.health.level === 'green'
                ? 'bg-green-50 border-green-200'
                : data.health.level === 'yellow'
                ? 'bg-yellow-50 border-yellow-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full shrink-0 ${
                  data.health.level === 'green' ? 'bg-green-500'
                    : data.health.level === 'yellow' ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${
                    data.health.level === 'green' ? 'text-green-800'
                      : data.health.level === 'yellow' ? 'text-yellow-800'
                      : 'text-red-800'
                  }`}>
                    {data.health.level === 'green'
                      ? 'All systems healthy'
                      : data.health.level === 'yellow'
                      ? `${data.health.warnings.length} warning${data.health.warnings.length !== 1 ? 's' : ''}`
                      : `${data.health.issues.length} issue${data.health.issues.length !== 1 ? 's' : ''}`}
                  </p>
                  {(data.health.issues.length > 0 || data.health.warnings.length > 0) && (
                    <div className="mt-1 space-y-0.5">
                      {data.health.issues.map((issue, i) => (
                        <p key={`issue-${i}`} className="text-xs text-red-600">{issue}</p>
                      ))}
                      {data.health.warnings.map((warn, i) => (
                        <p key={`warn-${i}`} className="text-xs text-yellow-700">{warn}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Quality trend indicators — 30-day comparisons */}
              {prev && (
                <div className="mt-3 pt-3 border-t border-gray-200/50 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Violations trend */}
                  {(() => {
                    const curV = current.violations_total;
                    const prevV = prev.violations_total ?? 0;
                    const delta = curV - prevV;
                    return (
                      <div className="text-center">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Violations</p>
                        <p className="text-sm font-semibold tabular-nums text-gray-800">{curV.toLocaleString()}</p>
                        <p className={`text-[10px] font-medium tabular-nums ${delta < 0 ? 'text-green-600' : delta > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                          {delta < 0 ? '▼' : delta > 0 ? '▲' : '—'} {delta === 0 ? 'unchanged' : `${delta > 0 ? '+' : ''}${delta} vs 30d`}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Completeness trend (avg null rate across 6 fields) */}
                  {(() => {
                    const nullSum = current.null_description_count + current.null_builder_name_count +
                      current.null_est_const_cost_count + current.null_street_num_count +
                      current.null_street_name_count + current.null_geo_id_count;
                    const curPct = current.active_permits > 0 ? ((1 - nullSum / (current.active_permits * 6)) * 100) : 100;
                    const prevNullSum = (prev.null_description_count ?? 0) + (prev.null_builder_name_count ?? 0) +
                      (prev.null_est_const_cost_count ?? 0) + (prev.null_street_num_count ?? 0) +
                      (prev.null_street_name_count ?? 0) + (prev.null_geo_id_count ?? 0);
                    const prevPctVal = prev.active_permits > 0 ? ((1 - prevNullSum / (prev.active_permits * 6)) * 100) : 100;
                    const delta = Math.round((curPct - prevPctVal) * 10) / 10;
                    return (
                      <div className="text-center">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Completeness</p>
                        <p className="text-sm font-semibold tabular-nums text-gray-800">{curPct.toFixed(1)}%</p>
                        <p className={`text-[10px] font-medium tabular-nums ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                          {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {delta === 0 ? 'unchanged' : `${delta > 0 ? '+' : ''}${delta}pp vs 30d`}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Volume trend (permits updated 24h) */}
                  {(() => {
                    const curVol = current.permits_updated_24h;
                    const prevVol = prev.permits_updated_24h;
                    const delta = curVol - prevVol;
                    const pctChange = prevVol > 0 ? Math.round(((curVol - prevVol) / prevVol) * 100) : 0;
                    return (
                      <div className="text-center">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Volume (24h)</p>
                        <p className="text-sm font-semibold tabular-nums text-gray-800">{curVol.toLocaleString()}</p>
                        <p className={`text-[10px] font-medium tabular-nums ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                          {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {delta === 0 ? 'unchanged' : `${pctChange > 0 ? '+' : ''}${pctChange}% vs 30d`}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Linkage trend (overall enrichment) */}
                  {(() => {
                    const curLinked = current.permits_geocoded + current.permits_with_parcel +
                      current.permits_with_neighbourhood + current.permits_with_trades + current.permits_with_scope;
                    const curPct = current.active_permits > 0 ? (curLinked / (current.active_permits * 5)) * 100 : 0;
                    const prevLinked = prev.permits_geocoded + prev.permits_with_parcel +
                      prev.permits_with_neighbourhood + prev.permits_with_trades + prev.permits_with_scope;
                    const prevPctVal = prev.active_permits > 0 ? (prevLinked / (prev.active_permits * 5)) * 100 : 0;
                    const delta = Math.round((curPct - prevPctVal) * 10) / 10;
                    return (
                      <div className="text-center">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Enrichment</p>
                        <p className="text-sm font-semibold tabular-nums text-gray-800">{curPct.toFixed(1)}%</p>
                        <p className={`text-[10px] font-medium tabular-nums ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                          {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {delta === 0 ? 'unchanged' : `${delta > 0 ? '+' : ''}${delta}pp vs 30d`}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ============================================================
              Section 1: Hub-and-Spoke Data Source Diagram
          ============================================================ */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Data Source Relationships
            </h2>

            {/* Hero: Permits (hub) */}
            <div className="flex justify-center mb-2">
              <div className="w-64">
                <DataSourceCircle
                  name="Building Permits"
                  slug="permits"
                  accuracy={calcPct(current.active_permits, current.total_permits)}
                  count={current.total_permits}
                  total={current.total_permits}
                  lastUpdated={lastRunAt('permits')}
                  nextScheduled={getNextScheduledDate('permits', stats?.pipeline_schedules)}
                  onUpdate={() => triggerPipeline('permits')}
                  updating={runningPipelines.has('permits')}
                  hero
                  newestRecord={stats?.newest_permit_date}
                  tiers={[
                    { label: 'Active permits', value: current.active_permits.toLocaleString() },
                    { label: 'Updated 24h', value: current.permits_updated_24h.toLocaleString() },
                    { label: 'Updated 7d', value: current.permits_updated_7d.toLocaleString() },
                  ]}
                  volumeAnomaly={data?.anomalies?.find((a) => a.source === 'permits') ?? null}
                  schemaDrift={(data?.schemaDrift?.length ?? 0) > 0}
                  violationCount={current.violations_total}
                  nullRates={current.active_permits > 0 ? [
                    { field: 'description', pct: (current.null_description_count / current.active_permits) * 100 },
                    { field: 'builder_name', pct: (current.null_builder_name_count / current.active_permits) * 100 },
                    { field: 'est_const_cost', pct: (current.null_est_const_cost_count / current.active_permits) * 100 },
                    { field: 'street_num', pct: (current.null_street_num_count / current.active_permits) * 100 },
                    { field: 'geo_id', pct: (current.null_geo_id_count / current.active_permits) * 100 },
                  ] : undefined}
                  onScheduleClick={() => setScheduleModal({ pipeline: 'permits', name: 'Building Permits' })}
                />
              </div>
            </div>

            {/* Connector fan-out lines */}
            <div className="flex justify-center">
              <svg width="100%" height="24" className="max-w-4xl" preserveAspectRatio="none">
                <line x1="50%" y1="0" x2="12.5%" y2="24" stroke="#d1d5db" strokeWidth="1" />
                <line x1="50%" y1="0" x2="37.5%" y2="24" stroke="#d1d5db" strokeWidth="1" />
                <line x1="50%" y1="0" x2="62.5%" y2="24" stroke="#d1d5db" strokeWidth="1" />
                <line x1="50%" y1="0" x2="87.5%" y2="24" stroke="#d1d5db" strokeWidth="1" />
              </svg>
            </div>

            {/* Row 1: Enrichment sources (link TO permits) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Address Matching / Geocoding */}
              <DataSourceCircle
                name="Address Matching"
                slug="address_points"
                accuracy={calcPct(current.permits_geocoded, current.active_permits)}
                count={current.permits_geocoded}
                total={current.active_permits}
                lastUpdated={lastRunAt('address_points')}
                nextScheduled={getNextScheduledDate('address_points', stats?.pipeline_schedules)}
                onUpdate={() => triggerPipeline('address_points')}
                updating={runningPipelines.has('address_points')}
                trend={trendGeo}
                relationship="geocodes"
                fields={['latitude', 'longitude']}
                tiers={[
                  { label: 'Address points', value: stats ? stats.address_points_total.toLocaleString() : '—' },
                  { label: 'Permits linked', value: current.permits_geocoded.toLocaleString() },
                  { label: 'Unmatched', value: (current.active_permits - current.permits_geocoded).toLocaleString() },
                ]}
                nullRates={current.active_permits > 0 ? [
                  { field: 'street_num', pct: (current.null_street_num_count / current.active_permits) * 100 },
                  { field: 'street_name', pct: (current.null_street_name_count / current.active_permits) * 100 },
                ] : undefined}
                onScheduleClick={() => setScheduleModal({ pipeline: 'address_points', name: 'Address Matching' })}
              />

              {/* Parcels */}
              <DataSourceCircle
                name="Lots (Parcels)"
                slug="parcels"
                accuracy={calcPct(current.permits_with_parcel, current.active_permits)}
                count={current.permits_with_parcel}
                total={current.active_permits}
                avgConfidence={current.parcel_avg_confidence}
                lastUpdated={lastRunAt('parcels')}
                nextScheduled={getNextScheduledDate('parcels', stats?.pipeline_schedules)}
                onUpdate={() => triggerPipeline('parcels')}
                updating={runningPipelines.has('parcels')}
                trend={trendParcels}
                relationship="links to"
                fields={['lot_size', 'frontage', 'depth', 'is_irregular']}
                tiers={[
                  { label: 'Exact address', value: current.parcel_exact_matches.toLocaleString() },
                  { label: 'Name match', value: current.parcel_name_matches.toLocaleString() },
                  { label: 'Spatial', value: current.parcel_spatial_matches.toLocaleString() },
                  { label: 'Unmatched', value: (current.active_permits - current.permits_with_parcel).toLocaleString() },
                ]}
                onScheduleClick={() => setScheduleModal({ pipeline: 'parcels', name: 'Lots (Parcels)' })}
              />

              {/* 3D Massing */}
              <DataSourceCircle
                name="3D Massing"
                slug="massing"
                accuracy={calcPct(stats?.permits_with_massing ?? 0, current.active_permits)}
                count={stats?.permits_with_massing ?? 0}
                total={current.active_permits}
                lastUpdated={lastRunAt('massing')}
                nextScheduled={getNextScheduledDate('massing', stats?.pipeline_schedules)}
                onUpdate={() => triggerPipeline('massing')}
                updating={runningPipelines.has('massing')}
                trend={trendMassing}
                relationship="enriches"
                fields={['main_bldg_area', 'max_height', 'est_stories', 'accessory_bldgs', 'coverage_%']}
                tiers={[
                  { label: 'Footprints', value: (stats?.building_footprints_total ?? 0).toLocaleString() },
                  { label: 'Parcels w/ bldg', value: (stats?.parcels_with_massing ?? 0).toLocaleString() },
                  { label: 'Unmatched', value: (current.active_permits - (stats?.permits_with_massing ?? 0)).toLocaleString() },
                ]}
                onScheduleClick={() => setScheduleModal({ pipeline: 'massing', name: '3D Massing' })}
              />

              {/* Neighbourhoods */}
              <DataSourceCircle
                name="Neighbourhoods"
                slug="neighbourhoods"
                accuracy={calcPct(current.permits_with_neighbourhood, current.active_permits)}
                count={current.permits_with_neighbourhood}
                total={current.active_permits}
                lastUpdated={lastRunAt('neighbourhoods')}
                nextScheduled={getNextScheduledDate('neighbourhoods', stats?.pipeline_schedules)}
                onUpdate={() => triggerPipeline('neighbourhoods')}
                updating={runningPipelines.has('neighbourhoods')}
                trend={trendNeighbourhoods}
                relationship="classifies"
                fields={['neighbourhood_id', 'avg_income', 'tenure_%', 'construction_era']}
                tiers={[
                  { label: 'Total hoods', value: (stats?.neighbourhoods_total ?? 0).toLocaleString() },
                  { label: 'Unmatched', value: (current.active_permits - current.permits_with_neighbourhood).toLocaleString() },
                ]}
                onScheduleClick={() => setScheduleModal({ pipeline: 'neighbourhoods', name: 'Neighbourhoods' })}
              />
            </div>

            {/* Connector fan-out lines for row 2 */}
            <div className="flex justify-center mt-4">
              <svg width="100%" height="16" className="max-w-4xl" preserveAspectRatio="none">
                <line x1="50%" y1="0" x2="8.3%" y2="16" stroke="#d1d5db" strokeWidth="1" />
                <line x1="50%" y1="0" x2="25%" y2="16" stroke="#d1d5db" strokeWidth="1" />
                <line x1="50%" y1="0" x2="41.7%" y2="16" stroke="#d1d5db" strokeWidth="1" />
                <line x1="50%" y1="0" x2="58.3%" y2="16" stroke="#d1d5db" strokeWidth="1" />
                <line x1="50%" y1="0" x2="75%" y2="16" stroke="#d1d5db" strokeWidth="1" />
                <line x1="50%" y1="0" x2="91.7%" y2="16" stroke="#d1d5db" strokeWidth="1" />
              </svg>
            </div>

            {/* Row 2: Derived / classification sources */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {/* CoA Linked */}
              <DataSourceCircle
                name="CoA Linked"
                slug="coa"
                accuracy={calcPct(current.coa_linked, current.coa_total)}
                count={current.coa_linked}
                total={current.coa_total}
                avgConfidence={current.coa_avg_confidence}
                lastUpdated={lastRunAt('coa')}
                nextScheduled={getNextScheduledDate('coa', stats?.pipeline_schedules)}
                onUpdate={() => triggerPipeline('coa')}
                updating={runningPipelines.has('coa')}
                trend={trendCoa}
                newestRecord={stats?.newest_coa_date}
                relationship="links to"
                fields={['decision', 'hearing_date', 'applicant', 'description', 'sub_type']}
                tiers={[
                  { label: 'Pre-permit files', value: (stats?.coa_upcoming ?? 0).toLocaleString() },
                  { label: 'High conf (>=0.80)', value: current.coa_high_confidence.toLocaleString() },
                  { label: 'Low conf (<0.50)', value: current.coa_low_confidence.toLocaleString() },
                  { label: 'Unlinked', value: (current.coa_total - current.coa_linked).toLocaleString() },
                ]}
                onScheduleClick={() => setScheduleModal({ pipeline: 'coa', name: 'CoA Linked' })}
              />

              {/* Builder Profiles */}
              <DataSourceCircle
                name="Builder Profiles"
                slug="builders"
                accuracy={calcPct(current.permits_with_builder, current.active_permits)}
                count={current.permits_with_builder}
                total={current.active_permits}
                lastUpdated={lastRunAt('builders')}
                nextScheduled={getNextScheduledDate('builders', stats?.pipeline_schedules)}
                onUpdate={() => triggerPipeline('builders')}
                updating={runningPipelines.has('builders')}
                trend={trendBuilders}
                relationship="extracted from"
                fields={['builder_name', 'phone', 'email', 'website']}
                tiers={[
                  { label: '  → Google Places', value: fmtPct(current.builders_with_google, current.builders_total) },
                  { label: '  → WSIB', value: fmtPct(current.builders_with_wsib, current.builders_total) },
                  { label: 'Phone', value: current.builders_with_phone.toLocaleString() },
                  { label: 'Email', value: current.builders_with_email.toLocaleString() },
                  { label: 'Website', value: current.builders_with_website.toLocaleString() },
                ]}
                nullRates={current.builders_total > 0 ? [
                  { field: 'phone', pct: ((current.builders_total - current.builders_with_phone) / current.builders_total) * 100 },
                  { field: 'email', pct: ((current.builders_total - current.builders_with_email) / current.builders_total) * 100 },
                  { field: 'website', pct: ((current.builders_total - current.builders_with_website) / current.builders_total) * 100 },
                ] : undefined}
                onScheduleClick={() => setScheduleModal({ pipeline: 'builders', name: 'Builder Profiles' })}
              />

              {/* Scope Class (residential / commercial / mixed-use) */}
              <DataSourceCircle
                name="Scope Class"
                slug="classify_scope_class"
                accuracy={calcPct(current.permits_with_scope, current.active_permits)}
                count={current.permits_with_scope}
                total={current.active_permits}
                lastUpdated={lastRunAt('classify_scope_class')}
                nextScheduled={getNextScheduledDate('classify_scope_class', stats?.pipeline_schedules)}
                onUpdate={() => triggerPipeline('classify_scope_class')}
                updating={runningPipelines.has('classify_scope_class')}
                trend={trendScopeClass}
                relationship="classifies"
                fields={['scope_tags']}
                tiers={[
                  { label: 'Residential', value: (current.scope_project_type_breakdown?.residential ?? 0).toLocaleString() },
                  { label: 'Commercial', value: (current.scope_project_type_breakdown?.commercial ?? 0).toLocaleString() },
                  { label: 'Mixed-Use', value: (current.scope_project_type_breakdown?.['mixed-use'] ?? 0).toLocaleString() },
                  { label: 'Unclassified', value: (current.active_permits - current.permits_with_scope).toLocaleString() },
                ]}
                onScheduleClick={() => setScheduleModal({ pipeline: 'classify_scope_class', name: 'Scope Class' })}
              />

              {/* Scope Tags (architectural feature tags, excluding use-types) */}
              <DataSourceCircle
                name="Scope Tags"
                slug="classify_scope_tags"
                accuracy={calcPct(current.permits_with_detailed_tags ?? 0, current.active_permits)}
                count={current.permits_with_detailed_tags ?? 0}
                total={current.active_permits}
                lastUpdated={lastRunAt('classify_scope_tags')}
                nextScheduled={getNextScheduledDate('classify_scope_tags', stats?.pipeline_schedules)}
                onUpdate={() => triggerPipeline('classify_scope_tags')}
                updating={runningPipelines.has('classify_scope_tags')}
                trend={trendScopeTags}
                relationship="derived from"
                fields={['scope_tags']}
                tiers={[
                  ...(current.scope_tags_top
                    ? Object.entries(current.scope_tags_top)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 3)
                        .map(([tag, count]) => ({ label: tag, value: count.toLocaleString() }))
                    : []),
                  { label: 'Untagged', value: (current.active_permits - (current.permits_with_detailed_tags ?? 0)).toLocaleString() },
                ]}
                onScheduleClick={() => setScheduleModal({ pipeline: 'classify_scope_tags', name: 'Scope Tags' })}
              />

              {/* Trade Classification — Residential */}
              <DataSourceCircle
                name="Trades (Residential)"
                slug="classify_permits"
                accuracy={calcPct(current.trade_residential_classified ?? 0, current.trade_residential_total ?? 0)}
                count={current.trade_residential_classified ?? 0}
                total={current.trade_residential_total ?? 0}
                lastUpdated={lastRunAt('classify_permits')}
                nextScheduled={getNextScheduledDate('classify_permits', stats?.pipeline_schedules)}
                onUpdate={() => triggerPipeline('classify_permits')}
                updating={runningPipelines.has('classify_permits')}
                trend={trendTradesRes}
                relationship="classifies"
                fields={['permit_trades']}
                tiers={[
                  { label: 'Classified', value: (current.trade_residential_classified ?? 0).toLocaleString() },
                  { label: 'Total residential', value: (current.trade_residential_total ?? 0).toLocaleString() },
                  { label: 'Unclassified', value: ((current.trade_residential_total ?? 0) - (current.trade_residential_classified ?? 0)).toLocaleString() },
                ]}
                onScheduleClick={() => setScheduleModal({ pipeline: 'classify_permits', name: 'Trades (Residential)' })}
              />

              {/* Trade Classification — Commercial / Mixed-Use */}
              <DataSourceCircle
                name="Trades (Commercial)"
                slug="classify_permits"
                accuracy={calcPct(current.trade_commercial_classified ?? 0, current.trade_commercial_total ?? 0)}
                count={current.trade_commercial_classified ?? 0}
                total={current.trade_commercial_total ?? 0}
                lastUpdated={lastRunAt('classify_permits')}
                nextScheduled={getNextScheduledDate('classify_permits', stats?.pipeline_schedules)}
                onUpdate={() => triggerPipeline('classify_permits')}
                updating={runningPipelines.has('classify_permits')}
                trend={trendTradesCom}
                relationship="classifies"
                fields={['permit_trades']}
                tiers={[
                  { label: 'Classified', value: (current.trade_commercial_classified ?? 0).toLocaleString() },
                  { label: 'Total commercial + mixed-use', value: (current.trade_commercial_total ?? 0).toLocaleString() },
                  { label: 'Unclassified', value: ((current.trade_commercial_total ?? 0) - (current.trade_commercial_classified ?? 0)).toLocaleString() },
                ]}
                onScheduleClick={() => setScheduleModal({ pipeline: 'classify_permits', name: 'Trades (Commercial)' })}
              />

              {/* Scope Tags placeholder for 5th column balance — shows overall enrichment */}
              <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center p-4 text-center">
                <div className="w-16 h-16 rounded-full border-4 border-gray-200 flex items-center justify-center mb-2">
                  <span className="text-sm font-bold text-gray-400 tabular-nums">
                    {current.active_permits > 0
                      ? calcPct(
                          current.permits_geocoded +
                          current.permits_with_parcel +
                          current.permits_with_neighbourhood +
                          current.permits_with_trades +
                          current.permits_with_scope,
                          current.active_permits * 5
                        ).toFixed(0)
                      : 0}%
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Overall</p>
                <p className="text-[10px] text-gray-400">Enrichment</p>
              </div>
            </div>
          </div>

          {/* ============================================================
              Section 2: Pipeline Status
          ============================================================ */}
          <FreshnessTimeline
            pipelineLastRun={stats?.pipeline_last_run ?? {}}
            runningPipelines={runningPipelines}
            onTrigger={triggerPipeline}
            slaTargets={SLA_TARGETS}
          />

          {/* Schedule notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-start gap-2">
            <span className="text-blue-500 text-sm mt-0.5">i</span>
            <p className="text-xs text-blue-700">
              <span className="font-medium">Pipeline schedules are editable.</span>{' '}
              Click the &quot;Next&quot; date on any data source to change its cadence (Daily / Quarterly / Annual).
              Pipelines can be triggered manually via &quot;Update Now&quot; or through the timeline chain buttons.
            </p>
          </div>

          {/* Schedule edit modal */}
          {scheduleModal && (
            <ScheduleEditModal
              pipeline={scheduleModal.pipeline}
              pipelineName={scheduleModal.name}
              currentCadence={stats?.pipeline_schedules?.[scheduleModal.pipeline]?.cadence ?? PIPELINE_SCHEDULES[scheduleModal.pipeline]?.label ?? 'Daily'}
              onSave={saveSchedule}
              onClose={() => setScheduleModal(null)}
            />
          )}
        </>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-500">
            No quality snapshots found. Run a pipeline to capture the first snapshot.
          </p>
        </div>
      )}
    </div>
  );
}
