// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.2 (Feed Browser)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8 + §9
//             docs/specs/02-web-admin/36_flight_center_tool.md §2 (admin_watchlist save target)
'use client';

import React, { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { TestFeedDebug } from '@/lib/admin/test-feed-utils';
import { TRADES } from '@/lib/classification/trades';
import {
  feedLeadIdToCanonical,
  leadIdToInspectorSegment,
} from '@/lib/admin/lead-id-inspector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LeadTypeFilter = 'all' | 'permit' | 'coa';

interface TestFeedResult {
  data: Array<Record<string, unknown>>;
  meta: { count: number; radius_km: number };
  _debug: TestFeedDebug;
}

// ---------------------------------------------------------------------------
// Error extraction helper
// ---------------------------------------------------------------------------
// API returns errors in two shapes:
//   1. { error: 'string' }
//   2. { error: { code, message, details? } }
function extractErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error: unknown }).error;
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object' && 'message' in err) {
      const msg = (err as { message: unknown }).message;
      if (typeof msg === 'string') return msg;
    }
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Row-field accessors — the feed envelope is a discriminated union on
// `lead_type`; we read defensively (every tier nullable) so a malformed row
// degrades a single cell rather than crashing the table.
// ---------------------------------------------------------------------------

function str(item: Record<string, unknown>, key: string): string | null {
  const v = item[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function num(item: Record<string, unknown>, key: string): number | null {
  const v = item[key];
  return typeof v === 'number' ? v : null;
}

function rowAddress(item: Record<string, unknown>): string {
  const parts = [str(item, 'street_num'), str(item, 'street_name')].filter(
    (p): p is string => p != null,
  );
  return parts.length > 0 ? parts.join(' ') : '—';
}

/** Canonical DB lead_id (`permit:NUM:REV` / `coa:APP`) for save + inspect. */
function canonicalKey(item: Record<string, unknown>): string | null {
  const leadType = str(item, 'lead_type');
  const leadId = str(item, 'lead_id');
  if (leadType == null || leadId == null) return null;
  return feedLeadIdToCanonical(leadType, leadId);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TestFeedTool() {
  const [lat, setLat] = useState('43.6532');
  const [lng, setLng] = useState('-79.3832');
  const [trade, setTrade] = useState('plumbing');
  const [radius, setRadius] = useState(10);
  const [leadType, setLeadType] = useState<LeadTypeFilter>('all');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestFeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Saved-state read from admin_watchlist (Spec 36 persistence) — the feed's
  // own is_saved is hardwired false for the synthetic admin-test user_id and
  // predates the watchlist tool, so it is NOT authoritative here.
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // The scoping context that produced the CURRENT result set (frozen at query
  // time so it can't drift from the live form inputs).
  const [scope, setScope] = useState<{ trade: string; lat: string; lng: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const runQuery = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), 30_000);

    setLoading(true);
    setError(null);
    setResult(null);
    setSavedKeys(new Set());

    const params = new URLSearchParams({
      lat,
      lng,
      trade_slug: trade,
      radius_km: String(radius),
      lead_type: leadType,
    });

    try {
      const res = await fetch(`/api/admin/leads/test-feed?${params}`, {
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(extractErrorMessage(body, `HTTP ${res.status}`));
      }
      const data: TestFeedResult = await res.json();
      setResult(data);
      setScope({ trade, lat, lng });

      // Reconcile saved-state from admin_watchlist. Best-effort + isolated:
      // a watchlist read failure must NOT blank the freshly-loaded feed, so
      // it is swallowed (savedKeys stays empty).
      try {
        const wlRes = await fetch('/api/admin/leads/watchlist', {
          signal: ctrl.signal,
        });
        if (wlRes.ok) {
          const wlBody = (await wlRes.json()) as { data?: Array<{ lead_key?: unknown }> };
          const keys = new Set<string>();
          for (const row of wlBody.data ?? []) {
            if (typeof row.lead_key === 'string') keys.add(row.lead_key);
          }
          setSavedKeys(keys);
        }
      } catch {
        // saved-state is advisory; ignore.
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Request timed out (30s)');
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, [lat, lng, trade, radius, leadType]);

  const handleSave = useCallback(
    async (item: Record<string, unknown>) => {
      const key = canonicalKey(item);
      if (key == null) return;
      const itemLeadType = str(item, 'lead_type');

      // Build the WatchlistSaveItem for the EXISTING bulk-save route.
      let saveItem: Record<string, unknown> | null = null;
      if (itemLeadType === 'permit') {
        const permitNum = str(item, 'permit_num');
        const revisionNum = str(item, 'revision_num');
        if (permitNum == null || revisionNum == null) {
          toast.error('Cannot save — permit is missing a revision number');
          return;
        }
        saveItem = {
          lead_type: 'permit',
          permit_num: permitNum,
          revision_num: revisionNum,
          address: rowAddress(item) === '—' ? undefined : rowAddress(item),
        };
      } else if (itemLeadType === 'coa') {
        const appNum = str(item, 'application_number');
        if (appNum == null) {
          toast.error('Cannot save — CoA is missing an application number');
          return;
        }
        saveItem = {
          lead_type: 'coa',
          coa_application_number: appNum,
          address: rowAddress(item) === '—' ? undefined : rowAddress(item),
        };
      } else {
        // Builders are not persistable to admin_watchlist (permit/coa only).
        return;
      }

      setSavingKey(key);
      try {
        const res = await fetch('/api/admin/leads/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [saveItem] }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(extractErrorMessage(body, `HTTP ${res.status}`));
        }
        // Idempotent ON CONFLICT DO NOTHING — added OR skipped_existing both
        // mean "now on the board".
        setSavedKeys((prev) => new Set(prev).add(key));
        toast.success('Saved to watchlist');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSavingKey(null);
      }
    },
    [],
  );

  const tradeName = TRADES.find((t) => t.slug === scope?.trade)?.name ?? scope?.trade ?? '';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
      {/* Input form */}
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <div className="flex-1">
          <label htmlFor="tf-lat" className="block text-xs text-gray-500 mb-1">
            Latitude
          </label>
          <input
            id="tf-lat"
            type="number"
            step="0.0001"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
          />
        </div>

        <div className="flex-1">
          <label htmlFor="tf-lng" className="block text-xs text-gray-500 mb-1">
            Longitude
          </label>
          <input
            id="tf-lng"
            type="number"
            step="0.0001"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
          />
        </div>

        <div className="flex-1">
          <label htmlFor="tf-trade" className="block text-xs text-gray-500 mb-1">
            Trade
          </label>
          <select
            id="tf-trade"
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
          >
            {TRADES.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label htmlFor="tf-lead-type" className="block text-xs text-gray-500 mb-1">
            Lead type
          </label>
          <select
            id="tf-lead-type"
            value={leadType}
            onChange={(e) => setLeadType(e.target.value as LeadTypeFilter)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
          >
            <option value="all">All (permit + builder + CoA)</option>
            <option value="permit">Permit only</option>
            <option value="coa">CoA only</option>
          </select>
        </div>

        <div className="flex-1">
          <label htmlFor="tf-radius" className="block text-xs text-gray-500 mb-1">
            Radius: {radius} km
          </label>
          <input
            id="tf-radius"
            type="range"
            min={5}
            max={30}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-full min-h-[44px]"
          />
        </div>
      </div>

      <button
        onClick={runQuery}
        disabled={loading}
        className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 min-h-[44px] min-w-[44px]"
      >
        {loading ? 'Running...' : 'Run Test Query'}
      </button>

      {/* Error */}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 font-mono break-all">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-6 space-y-4">
          {/* Scoping statement — this browse view is a SINGLE-trade, single-point
              geographic simulation, NOT the full corpus. State it explicitly so
              an operator never mistakes an empty/partial result for a data gap. */}
          <p
            data-testid="feed-browser-scope"
            className="text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2"
          >
            Viewing as <strong>{tradeName}</strong> @{' '}
            <strong>
              {scope?.lat}, {scope?.lng}
            </strong>{' '}
            within <strong>{result.meta.radius_km} km</strong> — single-trade + single-point
            scope (not the full lead corpus).
          </p>

          {/* Summary */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
            <span>
              Results: <strong>{result.meta.count}</strong>
            </span>
            <span>
              Radius: <strong>{result.meta.radius_km} km</strong>
            </span>
          </div>

          {/* Debug panel */}
          <div
            data-testid="debug-panel"
            className="bg-gray-50 rounded-lg border border-gray-200 p-4"
          >
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">
              Debug
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-gray-500">Query Time</p>
                <p className="font-semibold">
                  {result._debug.query_duration_ms}ms
                </p>
              </div>
              <div>
                <p className="text-gray-500">Permits</p>
                <p className="font-semibold">
                  {result._debug.permits_in_results}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Builders</p>
                <p className="font-semibold">
                  {result._debug.builders_in_results}
                </p>
              </div>
              {result._debug.score_distribution && (
                <div>
                  <p className="text-gray-500">Score Range</p>
                  <p className="font-semibold">
                    {result._debug.score_distribution.min}–
                    {result._debug.score_distribution.max}
                  </p>
                </div>
              )}
            </div>

            {result._debug.pillar_averages && (
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm border-t border-gray-200 pt-3">
                <div>
                  <p className="text-gray-500">Proximity avg</p>
                  <p className="font-semibold">
                    {result._debug.pillar_averages.proximity}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Timing avg</p>
                  <p className="font-semibold">
                    {result._debug.pillar_averages.timing}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Value avg</p>
                  <p className="font-semibold">
                    {result._debug.pillar_averages.value}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Opportunity avg</p>
                  <p className="font-semibold">
                    {result._debug.pillar_averages.opportunity}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Lead list — dense table (Spec 33 §9) */}
          {result.data.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                Results
              </p>
              <div className="max-h-96 overflow-y-auto overflow-x-auto">
                <table
                  data-testid="feed-browser-table"
                  className="min-w-full text-sm"
                >
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Type</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">ID</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Address</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500">Score</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.data.map((item, i) => {
                      const leadTypeVal = str(item, 'lead_type') ?? 'permit';
                      const permitNum = str(item, 'permit_num');
                      const appNum = str(item, 'application_number');
                      const idLabel = permitNum ?? appNum ?? str(item, 'lead_id') ?? '—';
                      const score = num(item, 'relevance_score');
                      const key = canonicalKey(item);
                      const segment = key ? leadIdToInspectorSegment(key) : null;
                      const isSaved = key != null && savedKeys.has(key);
                      const canSave = leadTypeVal === 'permit' || leadTypeVal === 'coa';
                      const rowKey = key ?? `${idLabel}-${i}`;
                      return (
                        <tr
                          key={rowKey}
                          data-testid={`feed-browser-row-${i}`}
                          className="bg-white"
                        >
                          <td className="px-2 py-1.5">
                            <span
                              className={`inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                                leadTypeVal === 'coa'
                                  ? 'bg-purple-100 text-purple-700'
                                  : leadTypeVal === 'builder'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {leadTypeVal}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 font-mono text-gray-900">{idLabel}</td>
                          <td className="px-2 py-1.5 text-gray-700">{rowAddress(item)}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-gray-700">
                            {score ?? '—'}
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center justify-end gap-2">
                              {segment && (
                                <Link
                                  href={`/admin/lead-feed/inspector?id=${encodeURIComponent(segment)}&tab=lead`}
                                  data-testid={`feed-browser-inspect-${i}`}
                                  className="text-xs text-blue-600 hover:underline"
                                >
                                  Inspect →
                                </Link>
                              )}
                              {canSave &&
                                (isSaved ? (
                                  <span
                                    data-testid={`feed-browser-saved-${i}`}
                                    className="text-xs text-green-700 font-medium"
                                  >
                                    ✓ Saved
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleSave(item)}
                                    disabled={savingKey === key}
                                    data-testid={`feed-browser-save-${i}`}
                                    className="text-xs text-blue-600 hover:underline disabled:opacity-50 min-h-[44px]"
                                  >
                                    {savingKey === key ? 'Saving…' : 'Save'}
                                  </button>
                                ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              No results — feed gap for this trade/location.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
