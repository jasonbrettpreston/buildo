// 🔗 SPEC LINK: docs/specs/02-web-admin/30_app_health_dashboard.md §2.3
//
// Per-tile renderer for the App Health Dashboard. Three render states
// (loading / ok / unavailable) per Spec 30 §2.3. The component is
// SELF-CONTAINED — it receives a TileResult prop, doesn't fetch.
// Polling + data flow lives in the page (/admin/app-health).
//
// Per Spec 33 §3 server-component-first principle, this is a CLIENT
// component because it receives state-derived props from the page's
// polling component. The shell that mounts the grid stays server-rendered.

'use client';

import type { ReactNode } from 'react';
import type { TileResult } from '@/lib/admin/healthSchema';

interface HealthTileProps<T> {
  /** Tile title — short, human-readable. */
  title: string;
  /** Window label (e.g., "24h", "7d"). Rendered subtle, top-right. */
  window: string;
  /** Current tile state. `null` = loading; otherwise discriminated union. */
  state: TileResult<T> | null;
  /** Render function for the `ok` state. Receives the typed payload. */
  renderOk: (payload: T) => ReactNode;
  /**
   * Optional: human-friendly mapping for `unavailable` reasons.
   * Falls back to the raw reason string when the key isn't in the map.
   */
  reasonLabels?: Record<string, string>;
}

const DEFAULT_REASON_LABELS: Record<string, string> = {
  env_missing: 'Not configured',
  rate_limited: 'Rate-limited (back off)',
  upstream_unavailable: 'External API down',
  network_error: 'Network error',
  parse_error: 'Bad response',
  aggregator_threw: 'Internal error',
};

export function HealthTile<T>({
  title,
  window,
  state,
  renderOk,
  reasonLabels,
}: HealthTileProps<T>) {
  // Loading state — null prop means data hasn't resolved yet.
  if (state === null) {
    return (
      <div
        data-testid="health-tile-loading"
        className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      >
        <div className="flex items-start justify-between">
          <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
          <span className="text-xs text-gray-400">{window}</span>
        </div>
        <div className="mt-3 h-8 w-32 animate-pulse rounded bg-gray-100" />
        <div className="mt-2 h-4 w-24 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  // Unavailable state — SaaS API failure, rate-limit, env_missing, etc.
  // Spec 30 §2.3: "muted state per tile, with the reason."
  if (state.status === 'unavailable') {
    const labels = { ...DEFAULT_REASON_LABELS, ...(reasonLabels ?? {}) };
    const reasonLabel = labels[state.reason] ?? state.reason;
    return (
      <div
        data-testid="health-tile-unavailable"
        className="rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-sm"
      >
        <div className="flex items-start justify-between">
          <h3 className="text-sm font-semibold text-gray-500">{title}</h3>
          <span className="text-xs text-gray-400">{window}</span>
        </div>
        <div className="mt-3 text-2xl font-bold text-gray-300">—</div>
        <div className="mt-2 text-xs text-gray-500" title={state.reason}>
          {reasonLabel}
        </div>
      </div>
    );
  }

  // Ok state — render the payload via the caller's render function.
  return (
    <div
      data-testid="health-tile-ok"
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className="text-xs text-gray-400">{window}</span>
      </div>
      <div className="mt-3">{renderOk(state.payload)}</div>
    </div>
  );
}
