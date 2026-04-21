// 🔗 SPEC LINK: docs/specs/product/admin/76_lead_feed_health_dashboard.md §2.3
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ProgressCircle, BarList } from '@tremor/react';
import type {
  LeadFeedHealthResponse,
  TestFeedDebug,
} from '@/lib/admin/lead-feed-health';
import { TRADES } from '@/lib/classification/trades';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 10_000;
const FETCH_TIMEOUT_MS = 10_000;

const DEFAULT_LAT = '43.6532';
const DEFAULT_LNG = '-79.3832';
const DEFAULT_TRADE = 'plumbing';
const DEFAULT_RADIUS = 10;

// ---------------------------------------------------------------------------
// Error extraction helper
// ---------------------------------------------------------------------------
// API routes return errors in two shapes:
//   1. { error: 'string' }                       — health endpoint
//   2. { error: { code, message, details? } }   — test-feed envelope
//
// Without this helper, `new Error(body.error)` on shape 2 produces
// "[object Object]" — exact user-reported bug from WF3 2026-04-10.
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
// Traffic light logic (spec §3.3)
// ---------------------------------------------------------------------------

function getTrafficLight(
  feedReadyPct: number,
  timingFreshnessHours: number | null,
  costCoverageTotal: number,
): { label: string; color: string; bgClass: string } {
  // WF3 2026-04-10 Phase 1: treat `null` timing as stale, not as "never
  // calibrated and therefore fine". Null means the phase_calibration table
  // has never been populated — a failure state that must surface in the
  // traffic light, not hide behind GREEN.
  //
  // Spec 76 §3.3: GREEN requires `timing_freshness_hours < 48` (strict).
  // So the stale boundary must be `>= 48` (inclusive) — exactly 48.0h is
  // stale, not fresh. This also aligns with `getTimingFreshnessClass` below
  // which uses `hours <= 48` for yellow (the badge and traffic light must
  // agree at the boundary). Adversarial review found the pre-fix `> 48`
  // disagreed with the badge at 48.0 exactly.
  const isTimingStale = timingFreshnessHours === null || timingFreshnessHours >= 48;

  if (feedReadyPct < 50 || costCoverageTotal === 0) {
    return { label: 'RED', color: 'red', bgClass: 'bg-red-500' };
  }
  if (feedReadyPct <= 80 || isTimingStale) {
    return { label: 'YELLOW', color: 'yellow', bgClass: 'bg-yellow-500' };
  }
  return { label: 'GREEN', color: 'green', bgClass: 'bg-green-500' };
}

function getTimingFreshnessClass(hours: number | null): string {
  if (hours === null) return 'bg-gray-100 text-gray-600';
  if (hours < 24) return 'bg-green-100 text-green-700';
  if (hours <= 48) return 'bg-yellow-100 text-yellow-700';
  return 'bg-red-100 text-red-700';
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LeadFeedHealthDashboard() {
  const [health, setHealth] = useState<LeadFeedHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Test feed state
  const [tfLat, setTfLat] = useState(DEFAULT_LAT);
  const [tfLng, setTfLng] = useState(DEFAULT_LNG);
  const [tfTrade, setTfTrade] = useState(DEFAULT_TRADE);
  const [tfRadius, setTfRadius] = useState(DEFAULT_RADIUS);
  const [tfLoading, setTfLoading] = useState(false);
  const [tfResult, setTfResult] = useState<{
    data: Array<Record<string, unknown>>;
    meta: { count: number; radius_km: number };
    _debug: TestFeedDebug;
  } | null>(null);
  const [tfError, setTfError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch('/api/admin/leads/health', { signal: ctrl.signal });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(extractErrorMessage(body, `HTTP ${res.status}`));
      }
      const data: LeadFeedHealthResponse = await res.json();
      setHealth(data);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Health data fetch timed out');
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  // Declared BEFORE the useEffect that references it so the code order
  // matches execution order (reviewer-flagged code clarity fix).
  const tfAbortRef = useRef<AbortController | null>(null);

  // Initial fetch + polling
  useEffect(() => {
    fetchHealth();
    pollRef.current = setInterval(fetchHealth, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      tfAbortRef.current?.abort();
    };
  }, [fetchHealth]);

  const runTestFeed = useCallback(async () => {
    // Cancel any in-flight test feed request
    tfAbortRef.current?.abort();
    const ctrl = new AbortController();
    tfAbortRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), 30_000);

    setTfLoading(true);
    setTfError(null);
    setTfResult(null);
    const params = new URLSearchParams({
      lat: tfLat,
      lng: tfLng,
      trade_slug: tfTrade,
      radius_km: String(tfRadius),
    });
    try {
      const res = await fetch(`/api/admin/leads/test-feed?${params}`, { signal: ctrl.signal });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(extractErrorMessage(body, `HTTP ${res.status}`));
      }
      const data = await res.json();
      setTfResult(data);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setTfError('Test feed request timed out (30s)');
      } else {
        setTfError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      clearTimeout(timer);
      setTfLoading(false);
    }
  }, [tfLat, tfLng, tfTrade, tfRadius]);

  // --- Loading state ---
  if (loading) {
    return (
      <div data-testid="dashboard-loading" className="space-y-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
            <div className="h-24 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  // --- Error state ---
  if (error && !health) {
    return (
      <div data-testid="dashboard-error" className="bg-red-50 border border-red-200 rounded-xl p-6">
        <p className="text-sm text-red-700">Failed to load lead feed health: {error}</p>
        <button
          onClick={fetchHealth}
          className="mt-3 text-sm text-red-600 hover:underline min-h-[44px] min-w-[44px]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!health) return null;

  const { readiness, cost_coverage, engagement } = health;
  const traffic = getTrafficLight(readiness.feed_ready_pct, readiness.timing_freshness_hours, cost_coverage.total);
  const timingClass = getTimingFreshnessClass(readiness.timing_freshness_hours);

  const tradeBarData = engagement.top_trades.map((t) => ({
    name: t.trade_slug,
    value: t.views,
  }));

  return (
    <div className="space-y-6">
      {/* Stale data warning */}
      {error && health && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 text-xs text-yellow-700">
          Showing stale data.{' '}
          {lastUpdated && <>Last updated {lastUpdated.toLocaleTimeString()}.</>}{' '}
          Error: {error}
        </div>
      )}

      {/* ================================================================
          Section 1: Feed Readiness Gauge
      ================================================================ */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Feed Readiness</h2>

        <div className="flex flex-col md:flex-row md:items-center gap-6">
          {/* Gauge */}
          <div className="flex flex-col items-center shrink-0">
            <ProgressCircle
              value={readiness.feed_ready_pct}
              color={traffic.color as 'red' | 'yellow' | 'green'}
              size="xl"
            >
              <span className="text-2xl font-bold text-gray-900">
                {readiness.feed_ready_pct}%
              </span>
            </ProgressCircle>

            <div data-testid="traffic-light" className="mt-3 flex items-center gap-2">
              <span className={`inline-block w-3 h-3 rounded-full ${traffic.bgClass}`} />
              <span className="text-sm font-semibold text-gray-700">{traffic.label}</span>
            </div>
          </div>

          {/* Breakdown bar + builder readiness */}
          <div className="flex-1 space-y-4">
            <div data-testid="breakdown-bar" className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Coverage Breakdown (of {formatNumber(readiness.active_permits)} active)</p>
              <div className="space-y-1.5">
                <BreakdownRow label="Geocoded" count={readiness.permits_geocoded} total={readiness.active_permits} color="bg-blue-500" />
                <BreakdownRow label="Classified" count={readiness.permits_classified} total={readiness.active_permits} color="bg-indigo-500" />
                <BreakdownRow label="Cost Estimated" count={readiness.permits_with_cost} total={readiness.active_permits} color="bg-emerald-500" />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Builder Readiness</p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-gray-600">Total: <strong>{formatNumber(readiness.builders_total)}</strong></span>
                <span className="text-gray-600">With Contact: <strong>{formatNumber(readiness.builders_with_contact)}</strong></span>
                <span className="text-gray-600">WSIB: <strong>{formatNumber(readiness.builders_wsib_verified)}</strong></span>
                <span className="text-gray-600 font-medium" data-testid="builders-feed-eligible">Feed-Eligible: <strong className="text-emerald-700">{formatNumber(readiness.builders_feed_eligible)}</strong></span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Feed-Eligible = GTA + enriched + Small/Medium + contact. Only these show up in the builder feed.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================
          Section 1b: Feed-Path Coverage (WF3 2026-04-10)
          Per-pillar coverage matching the actual feed SQL inputs.
          ALL rows use `feed_active_permits` as denominator so percentages
          are directly comparable (reviewer-flagged H1, H3).
      ================================================================ */}
      <div data-testid="feed-path-coverage" className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Feed-Path Coverage</h2>
        <p className="text-xs text-gray-500 mb-4">
          Coverage per scoring pillar as actually used by <code className="font-mono text-[11px]">get-lead-feed.ts</code>. A
          permit must pass ALL hard filters and have data for all 4 pillars to rank well.
          <br />
          Denominator: <strong>{formatNumber(readiness.feed_active_permits)}</strong> non-terminal permits (status NOT IN Cancelled/Revoked/Closed).
        </p>

        <div className="space-y-3">
          <FeedPathRow
            label="Hard Filter: Geocoded"
            sublabel="latitude IS NOT NULL (proxy for location)"
            count={readiness.permits_geocoded}
            total={readiness.feed_active_permits}
            color="bg-blue-500"
          />
          <FeedPathRow
            label="Classification (active + high-conf)"
            sublabel="permit_trades.is_active AND confidence >= 0.5"
            count={readiness.permits_classified_active}
            total={readiness.feed_active_permits}
            color="bg-indigo-500"
          />
          <FeedPathRow
            label="Timing (Feed Path)"
            sublabel="permit_trades.phase ∈ (structural, finishing, early_construction, landscaping)"
            count={readiness.permits_with_phase}
            total={readiness.feed_active_permits}
            color="bg-cyan-500"
          />
          <FeedPathRow
            label="Value (cost tier)"
            sublabel="cost_estimates.estimated_cost IS NOT NULL"
            count={readiness.permits_with_cost}
            total={readiness.feed_active_permits}
            color="bg-emerald-500"
          />
          <FeedPathRow
            label="Neighbourhood (display)"
            sublabel="LEFT JOIN — optional, used for card label"
            count={readiness.permits_with_neighbourhood}
            total={readiness.feed_active_permits}
            color="bg-violet-500"
          />
        </div>

        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Full Intersection</p>
              <p className="text-[10px] text-gray-400">location + active trade + high-conf + non-terminal status</p>
            </div>
            <p className="text-2xl font-bold text-emerald-700 tabular-nums">
              {formatNumber(readiness.permits_feed_eligible)}
            </p>
          </div>
        </div>

        {/* Opportunity status breakdown */}
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Opportunity Pillar (permit status)</p>
          <div data-testid="opportunity-breakdown" className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <OpportunityPill label="Permit Issued" count={readiness.permits_by_opportunity_status.permit_issued} score={20} />
            <OpportunityPill label="Inspection" count={readiness.permits_by_opportunity_status.inspection} score={14} />
            <OpportunityPill label="Application" count={readiness.permits_by_opportunity_status.application} score={10} />
            <OpportunityPill label="Other" count={readiness.permits_by_opportunity_status.other_active} score={0} />
          </div>
        </div>
      </div>

      {/* ================================================================
          Section 2: Cost & Timing Coverage
      ================================================================ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cost coverage — dual denominator (WF3 2026-04-10 Phase 1).
            `coverage_pct_vs_active_permits` is the headline metric for
            "how much of the real permit universe is costed"; `coverage_pct`
            is secondary and measures cache cleanliness. Both are shown so
            operators can spot divergence (e.g., 94% cache + 60% permits
            means the cache is clean but sparse). */}
        <div
          data-testid="cost-coverage-section"
          className="bg-white rounded-xl border border-gray-200 p-4 md:p-6"
        >
          <h2 className="text-lg font-bold text-gray-900 mb-4">Cost Coverage</h2>

          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-1">
            <div>
              <p className="text-3xl font-bold text-gray-900 tabular-nums">
                {cost_coverage.coverage_pct_vs_active_permits}%
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                Permit coverage
              </p>
            </div>
            <div>
              <p className="text-xl font-semibold text-gray-600 tabular-nums">
                {cost_coverage.coverage_pct}%
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                Cache coverage
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            {formatNumber(cost_coverage.total)} estimates in cache
          </p>

          <div className="space-y-2">
            <CostRow label="Permit-Reported" count={cost_coverage.from_permit} total={cost_coverage.total} color="bg-blue-500" />
            <CostRow label="Model-Estimated" count={cost_coverage.from_model} total={cost_coverage.total} color="bg-emerald-500" />
            <CostRow label="Null (no estimate)" count={cost_coverage.null_cost} total={cost_coverage.total} color="bg-gray-300" />
          </div>
        </div>

        {/* Timing calibration — detail-page engine, NOT feed ranking */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Detail-Page Timing Engine</h2>
          <p className="text-[10px] text-gray-400 mb-3">
            Per-permit timing shown on the detail page. <strong>Not used by feed ranking</strong> — the feed uses
            <code className="font-mono"> permit_trades.phase</code> (see Feed-Path Coverage above).
          </p>
          <p className="text-3xl font-bold text-gray-900 mb-1">{readiness.timing_types_calibrated}</p>
          <p className="text-xs text-gray-500 mb-3">permit types in calibration table</p>

          <div className="space-y-2 mb-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Active permits covered:</span>
              <span className="font-semibold tabular-nums" data-testid="timing-coverage">
                {formatNumber(readiness.permits_with_timing_calibration_match)}
                <span className="text-xs text-gray-400 ml-1">
                  ({readiness.active_permits > 0
                    ? ((readiness.permits_with_timing_calibration_match / readiness.active_permits) * 100).toFixed(0)
                    : 0}%)
                </span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Freshness:</span>
            <span
              data-testid="timing-freshness-badge"
              className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${timingClass}`}
            >
              {readiness.timing_freshness_hours !== null
                ? `${readiness.timing_freshness_hours}h ago`
                : 'No data'}
            </span>
          </div>
        </div>
      </div>

      {/* ================================================================
          Section 3: User Engagement
      ================================================================ */}
      <div data-testid="engagement-section" className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">User Engagement (7-day)</h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatBox label="Views Today" value={engagement.views_today} />
          <StatBox label="Views (7d)" value={engagement.views_7d} />
          <StatBox label="Saves (7d)" value={engagement.saves_7d} />
          <StatBox label="Unique Users" value={engagement.unique_users_7d} />
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Avg Competition</p>
            <p className="text-2xl font-bold text-gray-900">{engagement.avg_competition_per_lead}</p>
            <p className="text-xs text-gray-500">saves per lead</p>
          </div>

          {tradeBarData.length > 0 && (
            <div className="flex-1">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Top Trades by Views</p>
              <BarList data={tradeBarData} className="mt-1" />
            </div>
          )}
        </div>
      </div>

      {/* ================================================================
          Section 4: Test Feed Tool
      ================================================================ */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Test Feed Tool</h2>

        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="flex-1">
            <label htmlFor="tf-lat" className="block text-xs text-gray-500 mb-1">Latitude</label>
            <input
              id="tf-lat"
              type="number"
              step="0.0001"
              value={tfLat}
              onChange={(e) => setTfLat(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="tf-lng" className="block text-xs text-gray-500 mb-1">Longitude</label>
            <input
              id="tf-lng"
              type="number"
              step="0.0001"
              value={tfLng}
              onChange={(e) => setTfLng(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="tf-trade" className="block text-xs text-gray-500 mb-1">Trade</label>
            <select
              id="tf-trade"
              value={tfTrade}
              onChange={(e) => setTfTrade(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
            >
              {TRADES.map((t) => (
                <option key={t.slug} value={t.slug}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label htmlFor="tf-radius" className="block text-xs text-gray-500 mb-1">
              Radius: {tfRadius} km
            </label>
            <input
              id="tf-radius"
              type="range"
              min={5}
              max={30}
              value={tfRadius}
              onChange={(e) => setTfRadius(Number(e.target.value))}
              className="w-full min-h-[44px]"
            />
          </div>
        </div>

        <button
          onClick={runTestFeed}
          disabled={tfLoading}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 min-h-[44px] min-w-[44px]"
        >
          {tfLoading ? 'Running...' : 'Run Test'}
        </button>

        {/* Test feed error */}
        {tfError && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {tfError}
          </div>
        )}

        {/* Test feed results */}
        {tfResult && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
              <span>Results: <strong>{tfResult.meta.count}</strong></span>
              <span>Radius: <strong>{tfResult.meta.radius_km} km</strong></span>
            </div>

            {/* Debug panel */}
            <div data-testid="debug-panel" className="bg-gray-50 rounded-lg border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Debug</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-gray-500">Query Time</p>
                  <p className="font-semibold">{tfResult._debug.query_duration_ms}ms</p>
                </div>
                <div>
                  <p className="text-gray-500">Permits</p>
                  <p className="font-semibold">{tfResult._debug.permits_in_results}</p>
                </div>
                <div>
                  <p className="text-gray-500">Builders</p>
                  <p className="font-semibold">{tfResult._debug.builders_in_results}</p>
                </div>
                {tfResult._debug.score_distribution && (
                  <div>
                    <p className="text-gray-500">Score Range</p>
                    <p className="font-semibold">
                      {tfResult._debug.score_distribution.min}–{tfResult._debug.score_distribution.max}
                    </p>
                  </div>
                )}
              </div>

              {tfResult._debug.pillar_averages && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm border-t border-gray-200 pt-3">
                  <div>
                    <p className="text-gray-500">Proximity</p>
                    <p className="font-semibold">{tfResult._debug.pillar_averages.proximity}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Timing</p>
                    <p className="font-semibold">{tfResult._debug.pillar_averages.timing}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Value</p>
                    <p className="font-semibold">{tfResult._debug.pillar_averages.value}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Opportunity</p>
                    <p className="font-semibold">{tfResult._debug.pillar_averages.opportunity}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Result cards */}
            {tfResult.data.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Results</p>
                {tfResult.data.map((item, i) => (
                  <div key={`${String(item.permit_num ?? 'item')}-${i}`} className="bg-gray-50 rounded-lg border border-gray-200 p-3 text-sm">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <span className="text-gray-500">Type: <strong>{String(item.lead_type)}</strong></span>
                      {'permit_num' in item && <span className="text-gray-500">Permit: <strong>{String(item.permit_num)}</strong></span>}
                      {'relevance_score' in item && <span className="text-gray-500">Score: <strong>{String(item.relevance_score)}</strong></span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No results — feed gap for this trade/location.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function BreakdownRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-600 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-600 tabular-nums w-16 text-right">{formatNumber(count)}</span>
    </div>
  );
}

function CostRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-600 w-32 shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-600 tabular-nums w-16 text-right">{formatNumber(count)}</span>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold text-gray-900">{formatNumber(value)}</p>
    </div>
  );
}

function FeedPathRow({
  label,
  sublabel,
  count,
  total,
  color,
}: {
  label: string;
  sublabel: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700">{label}</p>
          <p className="text-[10px] text-gray-400 font-mono truncate">{sublabel}</p>
        </div>
        <p className="text-sm font-semibold text-gray-900 tabular-nums shrink-0">
          {formatNumber(count)}
          <span className="text-xs text-gray-400 ml-1">({pct.toFixed(0)}%)</span>
        </p>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function OpportunityPill({ label, count, score }: { label: string; count: number; score: number }) {
  const scoreColor = score >= 20 ? 'text-emerald-700' : score >= 14 ? 'text-blue-700' : score >= 10 ? 'text-yellow-700' : 'text-gray-500';
  return (
    <div className="bg-gray-50 rounded-md p-2">
      <p className="text-[10px] text-gray-500 truncate">{label}</p>
      <p className="text-base font-bold text-gray-900 tabular-nums">{formatNumber(count)}</p>
      <p className={`text-[10px] font-mono ${scoreColor}`}>+{score} score</p>
    </div>
  );
}
