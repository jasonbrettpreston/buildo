// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.2
'use client';

import React, { useState, useCallback, useRef } from 'react';
import type { TestFeedDebug } from '@/lib/admin/test-feed-utils';
import { TRADES } from '@/lib/classification/trades';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
// Component
// ---------------------------------------------------------------------------

export function TestFeedTool() {
  const [lat, setLat] = useState('43.6532');
  const [lng, setLng] = useState('-79.3832');
  const [trade, setTrade] = useState('plumbing');
  const [radius, setRadius] = useState(10);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestFeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const runQuery = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), 30_000);

    setLoading(true);
    setError(null);
    setResult(null);

    const params = new URLSearchParams({
      lat,
      lng,
      trade_slug: trade,
      radius_km: String(radius),
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
  }, [lat, lng, trade, radius]);

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

          {/* Lead list */}
          {result.data.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                Results
              </p>
              <div className="max-h-96 overflow-y-auto space-y-1.5">
                {result.data.map((item, i) => (
                  <div
                    key={`${String(item.permit_num ?? 'item')}-${i}`}
                    className="bg-gray-50 rounded-lg border border-gray-200 p-3 text-sm"
                  >
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <span className="text-gray-500">
                        Type: <strong>{String(item.lead_type)}</strong>
                      </span>
                      {'permit_num' in item && (
                        <span className="text-gray-500">
                          Permit: <strong>{String(item.permit_num)}</strong>
                        </span>
                      )}
                      {'relevance_score' in item && (
                        <span className="text-gray-500">
                          Score:{' '}
                          <strong>{String(item.relevance_score)}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
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
