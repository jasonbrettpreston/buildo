'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { SLA_TARGETS, CADENCE_THRESHOLDS_MS } from '@/lib/quality/types';
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
  classify_scope: { label: 'Daily' },
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
  db_schema_map?: Record<string, string[]>;
  live_table_counts?: Record<string, number>;
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
const FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// HealthBanner — extracted, memoized component
// ---------------------------------------------------------------------------

interface HealthBannerProps {
  pipelineLastRun: Record<string, import('@/components/FreshnessTimeline').PipelineRunInfo>;
}

const HealthBanner = React.memo(function HealthBanner({
  pipelineLastRun,
}: HealthBannerProps) {
  const CHAINS: { id: string; label: string; cadence: string; rootSlug: string }[] = [
    { id: 'permits', label: 'Permits', cadence: 'Daily', rootSlug: 'permits' },
    { id: 'coa', label: 'CoA', cadence: 'Daily', rootSlug: 'coa' },
    { id: 'entities', label: 'Entities', cadence: 'Daily', rootSlug: 'enrich_wsib_builders' },
    { id: 'sources', label: 'Sources', cadence: 'Quarterly', rootSlug: 'address_points' },
    { id: 'deep_scrapes', label: 'Deep Scrapes', cadence: 'Weekly', rootSlug: 'inspections' },
  ];

  const now = Date.now();

  // Derive chain verdict from status + step_verdicts in records_meta
  function getChainVerdict(info: typeof pipelineLastRun[string] | undefined): { label: string; cls: string } {
    if (!info?.last_run_at) return { label: '—', cls: 'text-gray-400 bg-gray-50 border-gray-200' };
    if (info.status === 'running') return { label: 'RUNNING', cls: 'text-blue-600 bg-blue-50 border-blue-200' };
    if (info.status === 'failed') return { label: 'FAIL', cls: 'text-red-700 bg-red-50 border-red-200' };
    if (info.status === 'completed_with_errors') return { label: 'FAIL', cls: 'text-red-700 bg-red-50 border-red-200' };
    if (info.status === 'completed_with_warnings') return { label: 'WARN', cls: 'text-yellow-700 bg-yellow-50 border-yellow-200' };
    return { label: 'PASS', cls: 'text-green-700 bg-green-50 border-green-200' };
  }

  function getRecordsSummary(info: typeof pipelineLastRun[string] | undefined): string {
    if (!info?.last_run_at) return '';
    if (info.status === 'running') return '';
    const n = info.records_new ?? 0;
    if (n > 0) return `${n.toLocaleString()} new`;
    return 'No changes';
  }

  return (
    <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {pipelineLastRun && (
        <div className="px-4 py-3">
          <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 md:grid md:grid-cols-5 md:overflow-visible -mx-1 px-1 pb-1">
            {CHAINS.map((c) => {
              const chainInfo = pipelineLastRun[`chain_${c.id}`];
              const rootInfo = pipelineLastRun[c.rootSlug];
              const info = chainInfo ?? rootInfo;
              const verdict = getChainVerdict(info);
              const records = getRecordsSummary(info);
              let scheduleStatus: string;
              let scheduleColor: string;
              let dotColor: string;
              if (!info?.last_run_at) {
                scheduleStatus = 'Never run'; scheduleColor = 'text-gray-400'; dotColor = 'bg-gray-300';
              } else if (info.status === 'running') {
                scheduleStatus = 'Running'; scheduleColor = 'text-blue-600'; dotColor = 'bg-blue-500';
              } else {
                const elapsed = now - new Date(info.last_run_at).getTime();
                const threshold = CADENCE_THRESHOLDS_MS[c.cadence] ?? CADENCE_THRESHOLDS_MS.Daily;
                if (elapsed > threshold * 2) {
                  scheduleStatus = 'Overdue'; scheduleColor = 'text-red-600'; dotColor = 'bg-red-500';
                } else if (elapsed > threshold) {
                  scheduleStatus = 'Needs run'; scheduleColor = 'text-yellow-600'; dotColor = 'bg-yellow-500';
                } else {
                  scheduleStatus = 'On schedule'; scheduleColor = 'text-green-600'; dotColor = 'bg-green-500';
                }
              }
              const lastRun = info?.last_run_at
                ? new Date(info.last_run_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Never';
              return (
                <div key={c.id} className="text-center min-w-[120px] snap-center shrink-0 md:min-w-0 md:shrink">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">{c.label}</p>
                  <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border mt-1 ${verdict.cls}`}>{verdict.label}</span>
                  {records && <p className="text-[10px] text-gray-500 mt-0.5">{records}</p>}
                  <div className="flex items-center justify-center gap-1.5 mt-1">
                    <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
                    <p className={`text-sm font-semibold ${scheduleColor}`}>{scheduleStatus}</p>
                  </div>
                  <p className="text-[10px] text-gray-400 tabular-nums">{lastRun}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function DataQualityDashboard() {
  const [data, setData] = useState<ExtendedQualityResponse | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningPipelines, setRunningPipelines] = useState<Set<string>>(new Set());
  const [pipelineErrors, setPipelineErrors] = useState<string[]>([]);
  const [scheduleModal, setScheduleModal] = useState<{ pipeline: string; name: string } | null>(null);
  const [dismissedNotice, setDismissedNotice] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  // Grace period: keep recently-triggered slugs in runningPipelines even if
  // they haven't appeared in stats yet (belt-and-suspenders for spawn delay).
  const TRIGGER_GRACE_MS = 15_000;
  const triggerTimestamps = useRef<Map<string, number>>(new Map());

  const fetchData = useCallback(() => {
    // Separate abort controllers so a slow /api/quality doesn't kill /api/admin/stats
    const qualityCtrl = new AbortController();
    const statsCtrl = new AbortController();
    const qualityTimer = setTimeout(() => qualityCtrl.abort(), FETCH_TIMEOUT_MS);
    const statsTimer = setTimeout(() => statsCtrl.abort(), FETCH_TIMEOUT_MS);

    const qualityPromise = fetch('/api/quality', { signal: qualityCtrl.signal })
      .then((r) => r.json())
      .then((qualityData) => { setData(qualityData); })
      .catch((err) => {
        const msg = err instanceof Error && err.name === 'AbortError'
          ? 'Quality data fetch timed out'
          : (err instanceof Error ? err.message : String(err));
        setPipelineErrors((prev) => prev.includes(msg) ? prev : [...prev, msg]);
      })
      .finally(() => clearTimeout(qualityTimer));

    const statsPromise = fetch('/api/admin/stats', { signal: statsCtrl.signal })
      .then((r) => r.json())
      .then((statsData) => {
        setStats(statsData);
        setPipelineErrors([]); // Auto-clear errors on successful fetch
        return statsData as AdminStats;
      })
      .catch((err) => {
        const msg = err instanceof Error && err.name === 'AbortError'
          ? 'Stats fetch timed out'
          : (err instanceof Error ? err.message : String(err));
        setPipelineErrors((prev) => prev.includes(msg) ? prev : [...prev, msg]);
        return undefined;
      })
      .finally(() => clearTimeout(statsTimer));

    return Promise.all([qualityPromise, statsPromise])
      .then(([, statsData]) => statsData as AdminStats | undefined)
      .finally(() => setLoading(false));
  }, []);

  // On initial load, seed runningPipelines from DB state so buttons are
  // disabled immediately if a chain is already running in the background.
  // If full stats times out, fall back to the lightweight /api/admin/pipelines/status
  // endpoint so pipeline_last_run is always populated (B15).
  useEffect(() => {
    fetchData().then(async (statsData) => {
      // If stats timed out, seed pipeline_last_run from lightweight endpoint
      if (!statsData) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
          const res = await fetch('/api/admin/pipelines/status', { signal: ctrl.signal });
          clearTimeout(timer);
          const fallback: { pipeline_last_run: Record<string, PipelineRunInfo> } = await res.json();
          if (fallback?.pipeline_last_run) {
            setStats((prev) => ({
              ...(prev ?? {} as AdminStats),
              pipeline_last_run: fallback.pipeline_last_run,
            }));
            // Seed running pipelines from fallback data
            const initial = new Set<string>();
            for (const [slug, info] of Object.entries(fallback.pipeline_last_run)) {
              if (info?.status === 'running') initial.add(slug);
            }
            if (initial.size > 0) setRunningPipelines(initial);
          }
        } catch {
          // Lightweight endpoint also failed — no pipeline data available
        }
        return;
      }
      const initial = new Set<string>();
      for (const [slug, info] of Object.entries(statsData.pipeline_last_run ?? {})) {
        if (info?.status === 'running') initial.add(slug);
      }
      if (initial.size > 0) setRunningPipelines(initial);
    });
  }, [fetchData]);

  // Polling while pipelines are running — uses lightweight status endpoint
  // instead of full fetchData() (which times out under pipeline load).
  useEffect(() => {
    if (runningPipelines.size === 0) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(async () => {
      // Use lightweight endpoint — single fast query on pipeline_runs only
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let freshStatus: { pipeline_last_run: Record<string, PipelineRunInfo> } | null = null;
      try {
        const res = await fetch('/api/admin/pipelines/status', { signal: controller.signal });
        freshStatus = await res.json();
      } catch {
        // Timeout or network error — skip this poll cycle
      } finally {
        clearTimeout(timeoutId);
      }
      if (!freshStatus) return;

      // Merge fresh pipeline_last_run into stats so FreshnessTimeline re-renders.
      // B15: handle null prev (stats timed out on initial load) by creating a shell object.
      setStats((prev) => ({
        ...(prev ?? {} as AdminStats),
        pipeline_last_run: freshStatus!.pipeline_last_run,
      }));

      const now = Date.now();
      setRunningPipelines((prev) => {
        const next = new Set<string>();
        // Keep any user-triggered slugs that are still running OR within grace period
        for (const slug of prev) {
          const info = freshStatus!.pipeline_last_run?.[slug];
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
        for (const [slug, info] of Object.entries(freshStatus!.pipeline_last_run ?? {})) {
          if (info?.status === 'running') next.add(slug);
        }
        // If all pipelines finished, trigger a full fetchData() refresh
        if (next.size === 0 && prev.size > 0) {
          fetchData();
        }
        return next;
      });
    }, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [runningPipelines.size, fetchData]);

  const triggerPipeline = useCallback(async (slug: string) => {
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
      setPipelineErrors((prev) => [...prev, `${slug}: ${msg}`]);
      setRunningPipelines((prev) => { const next = new Set(prev); next.delete(slug); return next; });
    }
  }, []);

  const cancelPipeline = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`/api/admin/pipelines/${slug}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body.error || body.message || `Failed with status ${res.status}`);
      }
      // Don't remove from runningPipelines here — let polling detect the
      // cancelled status naturally. This keeps the Stop button visible and
      // shows "Stopping..." until the process actually terminates.
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPipelineErrors((prev) => [...prev, `Cancel ${slug}: ${msg}`]);
    }
  }, []);

  const togglePipeline = useCallback(async (slug: string, currentlyDisabled: boolean) => {
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
      setPipelineErrors((prev) => [...prev, `Toggle ${slug}: ${msg}`]);
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

  const current = data?.current;

  // Memoize funnel computation — only recomputes when stats or snapshot changes
  const funnelData = useMemo(() => {
    if (!current || !stats) return undefined;
    return computeAllFunnelRows({
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
      permits_propagated: (stats.permits_propagated as number) ?? 0,
      pipeline_last_run: stats.pipeline_last_run ?? {},
      pipeline_schedules: stats.pipeline_schedules,
    }, current);
  }, [stats, current]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading data quality metrics...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Pipeline error banner */}
      {pipelineErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start justify-between gap-2">
          <div className="space-y-0.5 flex-1">
            {pipelineErrors.map((err, i) => (
              <p key={i} className="text-sm text-red-700">Pipeline error: {err}</p>
            ))}
          </div>
          <button onClick={() => setPipelineErrors([])} className="text-red-400 hover:text-red-600 text-xs shrink-0">Dismiss</button>
        </div>
      )}

      {current ? (
        <>
          {/* Health Banner — per-chain verdicts + schedule status */}
          {stats?.pipeline_last_run && (
            <HealthBanner
              pipelineLastRun={stats.pipeline_last_run}
            />
          )}

          {/* ============================================================
              Pipeline Status + Enrichment Funnel (merged view)
          ============================================================ */}
          <div ref={timelineRef}>
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
            triggerError={pipelineErrors.length > 0 ? pipelineErrors.join('; ') : null}
            onCancel={cancelPipeline}
            dbSchemaMap={stats?.db_schema_map}
            liveTableCounts={stats?.live_table_counts}
          />
          </div>

          {/* Dismissible schedule notice */}
          {!dismissedNotice && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-start gap-2">
              <span className="text-blue-500 text-sm mt-0.5">i</span>
              <p className="text-xs text-blue-700 flex-1">
                <span className="font-medium">Pipeline schedules are editable.</span>{' '}
                Click the &quot;Next&quot; date on any data source to change its cadence (Daily / Quarterly / Annual).
                Pipelines can be triggered manually via &quot;Update Now&quot; or through the timeline chain buttons.
              </p>
              <button
                onClick={() => setDismissedNotice(true)}
                className="text-blue-400 hover:text-blue-600 text-xs shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

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
