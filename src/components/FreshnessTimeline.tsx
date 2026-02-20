'use client';

import type { DataQualitySnapshot } from '@/lib/quality/types';

interface FreshnessTimelineProps {
  snapshot: DataQualitySnapshot;
}

interface DataSourceStatus {
  label: string;
  lastUpdated: string | null;
  isStatic?: boolean;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function getStalenessColor(dateStr: string | null, isStatic?: boolean): string {
  if (isStatic) return 'bg-gray-400';
  if (!dateStr) return 'bg-gray-300';
  const hours = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
  if (hours < 24) return 'bg-green-500';
  if (hours < 72) return 'bg-blue-500';
  if (hours < 168) return 'bg-yellow-500';
  return 'bg-red-500';
}

function isStale(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const days = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  return days > 14;
}

export function FreshnessTimeline({ snapshot }: FreshnessTimelineProps) {
  const sources: DataSourceStatus[] = [
    { label: 'Permits', lastUpdated: snapshot.last_sync_at },
    { label: 'Builders', lastUpdated: snapshot.last_sync_at },
    { label: 'Parcels', lastUpdated: snapshot.last_sync_at },
    { label: 'Neighbourhoods', lastUpdated: null, isStatic: true },
    { label: 'CoA', lastUpdated: snapshot.last_sync_at },
    { label: 'Geocoding', lastUpdated: snapshot.last_sync_at },
  ];

  const stalePct = snapshot.active_permits > 0
    ? Math.round(((snapshot.active_permits - snapshot.permits_updated_30d) / snapshot.active_permits) * 100)
    : 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Data Freshness & Sync
        </h3>
        {snapshot.last_sync_status && (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              snapshot.last_sync_status === 'completed'
                ? 'bg-green-100 text-green-800'
                : snapshot.last_sync_status === 'failed'
                ? 'bg-red-100 text-red-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}
          >
            Last sync: {snapshot.last_sync_status}
          </span>
        )}
      </div>

      {/* Freshness counters */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">
            {snapshot.permits_updated_24h.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500">Updated 24h</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">
            {snapshot.permits_updated_7d.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500">Updated 7d</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">
            {snapshot.permits_updated_30d.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500">Updated 30d</p>
        </div>
      </div>

      {/* Staleness warning */}
      {stalePct > 0 && (
        <div className={`mb-4 px-3 py-2 rounded text-xs ${
          stalePct > 20
            ? 'bg-red-50 text-red-700'
            : stalePct > 5
            ? 'bg-yellow-50 text-yellow-700'
            : 'bg-gray-50 text-gray-600'
        }`}>
          {stalePct}% of active permits not seen in 30+ days
        </div>
      )}

      {/* Data source timeline */}
      <div className="space-y-3">
        {sources.map((src) => (
          <div key={src.label} className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${getStalenessColor(src.lastUpdated, src.isStatic)}`} />
            <span className="text-sm text-gray-700 w-28">{src.label}</span>
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-500 shrink-0">
              {src.isStatic ? 'Static (Census 2021)' : timeAgo(src.lastUpdated)}
              {!src.isStatic && isStale(src.lastUpdated) && ' ⚠'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
