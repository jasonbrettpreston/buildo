'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SyncRun, AdminStats, HealthStatus } from '@/lib/admin/types';
import {
  PIPELINE_SCHEDULES,
  STATUS_DOT,
  POLL_INTERVAL_MS,
  getPipelineHealth,
  calcPct,
  formatRelativeTime,
  getNextScheduledDate,
  getLastRunAt,
} from '@/lib/admin/helpers';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningPipelines, setRunningPipelines] = useState<Set<string>>(new Set());
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(() => {
    return Promise.all([
      fetch('/api/sync').then((r) => r.json()),
      fetch('/api/admin/stats').then((r) => r.json()),
    ])
      .then(([syncData, statsData]) => {
        setSyncRuns(syncData.runs || []);
        setStats(statsData);
        return statsData as AdminStats;
      })
      .catch((err) => {
        console.error(err);
        return null;
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Polling: when any pipeline is running, poll for status changes
  useEffect(() => {
    if (runningPipelines.size === 0) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    pollRef.current = setInterval(async () => {
      const freshStats = await fetchData();
      if (!freshStats) return;

      setRunningPipelines((prev) => {
        const next = new Set<string>();
        for (const slug of prev) {
          const status = freshStats.pipeline_last_run?.[slug]?.status;
          if (status === 'running') {
            next.add(slug);
          }
        }
        return next;
      });
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
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
      console.error(`Failed to trigger ${slug}:`, msg);
      setPipelineError(`${slug}: ${msg}`);
      setRunningPipelines((prev) => {
        const next = new Set(prev);
        next.delete(slug);
        return next;
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
              <p className="text-sm text-gray-500">Data Sources & Health Dashboard</p>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="/admin/data-quality"
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                Data Quality
              </a>
              <a
                href="/admin/market-metrics"
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                Market Metrics
              </a>
              <a
                href="/dashboard"
                className="text-sm text-blue-600 hover:underline"
              >
                &larr; Dashboard
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {/* Pipeline trigger error banner */}
        {pipelineError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between">
            <p className="text-sm text-red-700">Pipeline trigger failed: {pipelineError}</p>
            <button
              onClick={() => setPipelineError(null)}
              className="text-red-400 hover:text-red-600 text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ================================================================
            Section 1: Data Health Overview
        ================================================================ */}
        {stats && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Data Health Overview
            </h2>

            {/* Row 1 — Primary Source (hero) */}
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                Primary Source
              </p>
              <HealthCard
                name="Building Permits"
                slug="permits"
                count={stats.total_permits}
                status={getPipelineHealth(stats.total_permits, stats.last_sync_at)}
                lastRunAt={getLastRunAt(stats, 'permits') || stats.last_sync_at}
                schedule={PIPELINE_SCHEDULES.permits}
                detail={`${stats.permits_this_week.toLocaleString()} new this week`}
                onUpdate={() => triggerPipeline('permits')}
                updating={runningPipelines.has('permits')}
                hero
              />
            </div>

            {/* Row 2 — Derived Source (builder profiles) */}
            <div className="mb-3 ml-6 border-l-2 border-gray-200 pl-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                Extracted from permits
              </p>
              <HealthCard
                name="Builder Profiles"
                slug="builders"
                count={stats.total_builders}
                status={stats.total_builders > 0 ? 'green' : 'red'}
                lastRunAt={getLastRunAt(stats, 'builders')}
                schedule={PIPELINE_SCHEDULES.builders}
                detail={`${stats.builders_with_contact.toLocaleString()} with contact info`}
                onUpdate={() => triggerPipeline('builders')}
                updating={runningPipelines.has('builders')}
              />
            </div>

            {/* Row 3 — Independent Enrichment Sources */}
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                Enrichment Sources
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <HealthCard
                  name="Address Points"
                  slug="address_points"
                  count={stats.address_points_total}
                  status={stats.address_points_total >= 500000 ? 'green' : stats.address_points_total > 0 ? 'yellow' : 'red'}
                  lastRunAt={getLastRunAt(stats, 'address_points')}
                  schedule={PIPELINE_SCHEDULES.address_points}
                  detail={`${stats.permits_geocoded.toLocaleString()} permits linked (${calcPct(stats.permits_geocoded, stats.total_permits)}%)`}
                  onUpdate={() => triggerPipeline('address_points')}
                  updating={runningPipelines.has('address_points')}
                />
                <HealthCard
                  name="Property Parcels"
                  slug="parcels"
                  count={stats.parcels_total}
                  status={stats.parcels_total > 0 ? 'green' : 'red'}
                  lastRunAt={getLastRunAt(stats, 'parcels')}
                  schedule={PIPELINE_SCHEDULES.parcels}
                  detail={`${stats.permits_with_parcel.toLocaleString()} permits linked (${calcPct(stats.permits_with_parcel, stats.total_permits)}%)`}
                  onUpdate={() => triggerPipeline('parcels')}
                  updating={runningPipelines.has('parcels')}
                />
                <HealthCard
                  name="3D Massing"
                  slug="massing"
                  count={stats.building_footprints_total}
                  status={stats.building_footprints_total > 0 ? 'green' : 'red'}
                  lastRunAt={getLastRunAt(stats, 'massing')}
                  schedule={PIPELINE_SCHEDULES.massing}
                  detail={`${stats.permits_with_massing.toLocaleString()} permits linked (${calcPct(stats.permits_with_massing, stats.total_permits)}%)`}
                  onUpdate={() => triggerPipeline('massing')}
                  updating={runningPipelines.has('massing')}
                />
                <HealthCard
                  name="Neighbourhoods"
                  slug="neighbourhoods"
                  count={stats.neighbourhoods_total}
                  status={stats.neighbourhoods_total >= 158 ? 'green' : stats.neighbourhoods_total > 0 ? 'yellow' : 'red'}
                  lastRunAt={getLastRunAt(stats, 'neighbourhoods')}
                  schedule={PIPELINE_SCHEDULES.neighbourhoods}
                  detail={`${stats.permits_with_neighbourhood.toLocaleString()} permits linked (${calcPct(stats.permits_with_neighbourhood, stats.total_permits)}%)`}
                  onUpdate={() => triggerPipeline('neighbourhoods')}
                  updating={runningPipelines.has('neighbourhoods')}
                />
              </div>
            </div>

            {/* Row 4 — Daily External Source (CoA) */}
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">
                External Daily Source
              </p>
              <HealthCard
                name="Committee of Adjustment"
                slug="coa"
                count={stats.coa_total}
                status={getPipelineHealth(stats.coa_total, stats.last_sync_at)}
                lastRunAt={getLastRunAt(stats, 'coa')}
                schedule={PIPELINE_SCHEDULES.coa}
                detail={`${stats.coa_upcoming.toLocaleString()} upcoming leads`}
                onUpdate={() => triggerPipeline('coa')}
                updating={runningPipelines.has('coa')}
              />
            </div>
          </div>
        )}

        {/* ================================================================
            Section 2: Active Sync Operations
        ================================================================ */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Active Sync Operations
          </h2>

          {/* CoA & Builder summary cards */}
          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {/* CoA Summary */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">CoA Sync Summary</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stats.coa_total.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Total</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-purple-600">{stats.coa_approved.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Approved</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-600">{stats.coa_linked.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Linked</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-600">
                  Permit Link Rate:{' '}
                  <span className="font-semibold">
                    {calcPct(stats.coa_linked, stats.coa_approved)}%
                  </span>
                  <span className="text-xs text-gray-400 ml-1">
                    ({stats.coa_linked}/{stats.coa_approved} approved)
                  </span>
                </div>
              </div>

              {/* Builder Summary */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Builder Enrichment Summary</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stats.total_builders.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Total</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-600">{stats.permits_with_builder.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Permits w/ Builder</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{stats.builders_with_contact.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">With Contact</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-600">
                  Contact Enrichment Rate:{' '}
                  <span className="font-semibold">
                    {calcPct(stats.builders_with_contact, stats.total_builders)}%
                  </span>
                  <span className="text-xs text-gray-400 ml-1">
                    ({stats.builders_with_contact}/{stats.total_builders} builders)
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Sync history table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Sync History</h3>
            </div>

            {loading ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : syncRuns.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No sync runs yet. Trigger a sync to see data here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">ID</th>
                      <th className="px-4 py-3 text-left">Started</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">New</th>
                      <th className="px-4 py-3 text-right">Updated</th>
                      <th className="px-4 py-3 text-right">Unchanged</th>
                      <th className="px-4 py-3 text-right">Errors</th>
                      <th className="px-4 py-3 text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {syncRuns.map((run) => (
                      <tr key={run.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-gray-500">
                          #{run.id}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {new Date(run.started_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              run.status === 'completed'
                                ? 'bg-green-100 text-green-800'
                                : run.status === 'failed'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {run.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {run.records_total?.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-green-600 font-medium">
                          {run.records_new?.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-blue-600">
                          {run.records_updated?.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {run.records_unchanged?.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-red-600">
                          {run.records_errors || 0}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {run.duration_ms
                            ? `${(run.duration_ms / 1000).toFixed(1)}s`
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Error log */}
          {syncRuns[0]?.error_message && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
              <h3 className="text-sm font-semibold text-red-800 mb-1">
                Last Error
              </h3>
              <pre className="text-xs text-red-700 whitespace-pre-wrap">
                {syncRuns[0].error_message}
              </pre>
            </div>
          )}
        </div>

        {/* ================================================================
            Section 3: Data Quality & Linking Metrics
        ================================================================ */}
        {stats && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Data Quality &amp; Linking Metrics
            </h2>
            <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-5">
              <ProgressMetric
                label="Geocoding Health"
                numerator={stats.permits_geocoded}
                denominator={stats.total_permits}
                detail={`${stats.permits_geocoded.toLocaleString()} / ${stats.total_permits.toLocaleString()} permits geocoded`}
              />
              <ProgressMetric
                label="Builder Identification"
                numerator={stats.permits_with_builder}
                denominator={stats.active_permits}
                detail={`${stats.permits_with_builder.toLocaleString()} / ${stats.active_permits.toLocaleString()} active permits with builder`}
              />
              <ProgressMetric
                label="Builder Contact Enrichment"
                numerator={stats.builders_with_contact}
                denominator={stats.total_builders}
                detail={`${stats.builders_with_contact.toLocaleString()} / ${stats.total_builders.toLocaleString()} builders with phone/email`}
              />
              <ProgressMetric
                label="Trade Classification"
                numerator={stats.permits_classified}
                denominator={stats.total_permits}
                detail={`${stats.permits_classified.toLocaleString()} / ${stats.total_permits.toLocaleString()} permits classified`}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline components
// ---------------------------------------------------------------------------

function HealthCard({
  name,
  count,
  status,
  slug,
  lastRunAt,
  schedule,
  detail,
  onUpdate,
  updating = false,
  hero = false,
}: {
  name: string;
  count: number;
  status: HealthStatus;
  slug: string;
  lastRunAt: string | null;
  schedule: { label: string; intervalDays: number; scheduleNote: string };
  detail: string;
  onUpdate: () => void;
  updating?: boolean;
  hero?: boolean;
}) {
  const nextUpdate = getNextScheduledDate(slug);

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${hero ? 'p-5' : 'p-3'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
            <p className={`font-medium text-gray-700 truncate ${hero ? 'text-sm' : 'text-xs'}`}>
              {name}
            </p>
          </div>
          <p className={`font-bold text-gray-900 ${hero ? 'text-3xl' : 'text-xl'}`}>
            {count.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{detail}</p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="text-xs text-gray-500">
              Last updated: {formatRelativeTime(lastRunAt)}
            </span>
            <span className="text-xs text-gray-400">
              {schedule.scheduleNote}
            </span>
            <span className={`text-xs ${nextUpdate === 'Overdue' ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
              Next: {nextUpdate}
            </span>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate(); }}
          disabled={updating}
          className={`shrink-0 text-xs px-2.5 py-1.5 rounded border transition-colors ${
            updating
              ? 'bg-blue-50 border-blue-200 text-blue-500 cursor-not-allowed animate-pulse'
              : 'border-blue-300 text-blue-600 hover:bg-blue-50 hover:border-blue-400'
          }`}
        >
          {updating ? 'Running...' : 'Update Now'}
        </button>
      </div>
    </div>
  );
}

function ProgressMetric({
  label,
  numerator,
  denominator,
  detail,
}: {
  label: string;
  numerator: number;
  denominator: number;
  detail: string;
}) {
  const pct = denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 10;
  const barColor = pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm font-bold text-gray-900">{pct}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full ${barColor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mt-1">{detail}</p>
    </div>
  );
}
