'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { findSnapshotDaysAgo, SLA_TARGETS } from '@/lib/quality/types';
import { FreshnessTimeline } from '@/components/FreshnessTimeline';
import { ScheduleEditModal } from '@/components/ScheduleEditModal';
import { computeAllFunnelRows } from '@/lib/admin/funnel';

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
  // Enrich / Link
  load_wsib: { label: 'Quarterly' },
  link_wsib: { label: 'Daily' },
  enrich_wsib_builders: { label: 'Daily' },
  enrich_named_builders: { label: 'Daily' },
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
  // Deep Scrapes (coming soon)
  inspections: { label: 'Continuous' },
  coa_documents: { label: 'Continuous' },
};

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
  wsib_total: number;
  wsib_linked: number;
  wsib_lead_pool: number;
  wsib_with_trade: number;
  pipeline_last_run: Record<string, PipelineRunInfo>;
  pipeline_schedules: Record<string, { cadence: string; cron_expression: string | null; enabled: boolean }>;
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
  // Grace period: keep recently-triggered slugs in runningPipelines even if
  // they haven't appeared in stats yet (belt-and-suspenders for spawn delay).
  const TRIGGER_GRACE_MS = 15_000;
  const triggerTimestamps = useRef<Map<string, number>>(new Map());

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

  // On initial load, seed runningPipelines from DB state so buttons are
  // disabled immediately if a chain is already running in the background.
  useEffect(() => {
    fetchData().then((statsData) => {
      if (!statsData) return;
      const initial = new Set<string>();
      for (const [slug, info] of Object.entries(statsData.pipeline_last_run ?? {})) {
        if (info?.status === 'running') initial.add(slug);
      }
      if (initial.size > 0) setRunningPipelines(initial);
    });
  }, [fetchData]);

  // Polling while pipelines are running — also detects chain-spawned running steps
  useEffect(() => {
    if (runningPipelines.size === 0) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(async () => {
      const freshStats = await fetchData().catch(() => null);
      if (!freshStats) return;
      const now = Date.now();
      setRunningPipelines((prev) => {
        const next = new Set<string>();
        // Keep any user-triggered slugs that are still running OR within grace period
        for (const slug of prev) {
          const info = freshStats.pipeline_last_run?.[slug];
          if (info?.status === 'running') {
            next.add(slug);
          } else {
            // Keep slug if it was triggered recently and hasn't appeared in stats yet
            const triggeredAt = triggerTimestamps.current.get(slug);
            if (triggeredAt && (now - triggeredAt) < TRIGGER_GRACE_MS && !info) {
              next.add(slug);
            }
          }
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
    triggerTimestamps.current.set(slug, Date.now());
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

  const togglePipeline = useCallback(async (slug: string, currentlyDisabled: boolean) => {
    setPipelineError(null);
    try {
      const res = await fetch('/api/admin/pipelines/schedules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline: slug, enabled: currentlyDisabled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body.error || 'Failed to toggle');
      }
      await fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPipelineError(`Toggle ${slug}: ${msg}`);
    }
  }, [fetchData]);

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

  // Compute 30-day trend deltas (for health banner)
  const prev = data?.trends ? findSnapshotDaysAgo(data.trends, 30) : null;

  // Compute funnel data for FreshnessTimeline accordion
  const funnelData = current && stats
    ? computeAllFunnelRows({
        wsib_total: stats.wsib_total ?? 0,
        wsib_linked: stats.wsib_linked ?? 0,
        wsib_lead_pool: stats.wsib_lead_pool ?? 0,
        wsib_with_trade: stats.wsib_with_trade ?? 0,
        address_points_total: stats.address_points_total ?? 0,
        parcels_total: stats.parcels_total ?? 0,
        building_footprints_total: stats.building_footprints_total ?? 0,
        parcels_with_massing: stats.parcels_with_massing ?? 0,
        permits_with_massing: stats.permits_with_massing ?? 0,
        neighbourhoods_total: stats.neighbourhoods_total ?? 0,
        pipeline_last_run: stats.pipeline_last_run ?? {},
        pipeline_schedules: stats.pipeline_schedules,
      }, current)
    : undefined;

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
              Pipeline Status + Enrichment Funnel (merged view)
          ============================================================ */}
          <FreshnessTimeline
            pipelineLastRun={stats?.pipeline_last_run ?? {}}
            runningPipelines={runningPipelines}
            onTrigger={triggerPipeline}
            slaTargets={SLA_TARGETS}
            funnelData={funnelData}
            disabledPipelines={new Set(
              Object.entries(stats?.pipeline_schedules ?? {})
                .filter(([, s]) => s.enabled === false)
                .map(([slug]) => slug)
            )}
            onToggle={togglePipeline}
            triggerError={pipelineError}
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
