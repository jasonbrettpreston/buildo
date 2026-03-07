'use client';

import { useEffect, useState, useCallback } from 'react';

interface KPI {
  ref_month: string;
  permits_mtd: number;
  permits_yoy: number;
  value_mtd: number;
  value_yoy: number;
  top_builder: { name: string; count: number } | null;
}

interface ActivityRow {
  month: string;
  small_residential: number;
  new_houses: number;
  additions_alterations: number;
  new_building: number;
  plumbing: number;
  hvac: number;
  drain: number;
  demolition: number;
  other: number;
  total_value: number;
}

interface TradeRow {
  name: string;
  slug: string;
  color: string;
  lead_count: number;
  lead_count_yoy: number;
}

interface ResComRow {
  month: string;
  residential: number;
  commercial: number;
  other: number;
  residential_yoy: number;
  commercial_yoy: number;
}

interface ScopeTagRow {
  tag: string;
  permit_count: number;
  permit_count_yoy: number;
}

interface WealthTierNeighbourhood {
  name: string;
  permit_count: number;
  total_value: number;
  avg_income: number;
}

interface WealthTierGroup {
  tier: string;
  label: string;
  permit_count: number;
  total_value: number;
  permit_count_yoy: number;
  total_value_yoy: number;
  top_neighbourhoods: WealthTierNeighbourhood[];
}

interface MarketMetricsData {
  kpi: KPI;
  activity: ActivityRow[];
  trades: TradeRow[];
  residential_vs_commercial: ResComRow[];
  scope_tags: { residential: ScopeTagRow[]; commercial: ScopeTagRow[] };
  neighbourhoods: WealthTierGroup[];
}

function formatCurrency(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

function trendPct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function TrendArrow({ pct, label }: { pct: number; label: string }) {
  if (pct === 0) return <span className="text-gray-400 text-sm">-- <span className="text-xs">{label}</span></span>;
  const up = pct > 0;
  return (
    <span className={`text-sm font-medium ${up ? 'text-green-600' : 'text-red-600'}`}>
      {up ? '\u25B2' : '\u25BC'} {Math.abs(pct)}%
      <span className="text-xs text-gray-400 ml-1 font-normal">{label}</span>
    </span>
  );
}

function monthLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ── KPI Row ───────────────────────────────────────────────────────

function KPIRow({ kpi }: { kpi: KPI }) {
  const refLabel = new Date(kpi.ref_month + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-white rounded-lg border p-5">
        <p className="text-sm text-gray-500">Permits Issued ({refLabel})</p>
        <p className="text-3xl font-bold text-gray-900 mt-1">{kpi.permits_mtd.toLocaleString()}</p>
        <TrendArrow pct={trendPct(kpi.permits_mtd, kpi.permits_yoy)} label="vs same month last year" />
      </div>
      <div className="bg-white rounded-lg border p-5">
        <p className="text-sm text-gray-500">Construction Value ({refLabel})</p>
        <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(kpi.value_mtd)}</p>
        <TrendArrow pct={trendPct(kpi.value_mtd, kpi.value_yoy)} label="vs same month last year" />
      </div>
      <div className="bg-white rounded-lg border p-5">
        <p className="text-sm text-gray-500">Top Builder ({refLabel})</p>
        {kpi.top_builder ? (
          <>
            <p className="text-lg font-bold text-gray-900 mt-1 truncate">{kpi.top_builder.name}</p>
            <p className="text-sm text-gray-500">{kpi.top_builder.count} permits</p>
          </>
        ) : (
          <p className="text-lg text-gray-400 mt-1">No data</p>
        )}
      </div>
    </div>
  );
}

// ── Stacked Bar Chart (Activity by Permit Type) ─────────────────

const ACTIVITY_CATEGORIES = [
  { key: 'small_residential', label: 'Small Residential', color: '#3B82F6' },
  { key: 'new_houses', label: 'New Houses', color: '#2563EB' },
  { key: 'additions_alterations', label: 'Additions/Alterations', color: '#14B8A6' },
  { key: 'new_building', label: 'New Building', color: '#8B5CF6' },
  { key: 'plumbing', label: 'Plumbing', color: '#1E90FF' },
  { key: 'hvac', label: 'HVAC', color: '#F97316' },
  { key: 'drain', label: 'Drain', color: '#6366F1' },
  { key: 'demolition', label: 'Demolition', color: '#DC143C' },
  { key: 'other', label: 'Other', color: '#9CA3AF' },
] as const;

function ActivityChart({ data }: { data: ActivityRow[] }) {
  if (!data.length) return <p className="text-gray-400">No data</p>;

  const maxTotal = Math.max(
    ...data.map((d) =>
      ACTIVITY_CATEGORIES.reduce((sum, c) => sum + (d[c.key as keyof ActivityRow] as number), 0)
    ),
    1
  );
  const barW = Math.floor(600 / data.length) - 4;
  const chartH = 220;

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-gray-500">
        {ACTIVITY_CATEGORIES.map((c) => (
          <span key={c.key} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: c.color }} />
            {c.label}
          </span>
        ))}
      </div>
      <svg width="100%" viewBox={`0 0 ${data.length * (barW + 4)} ${chartH + 24}`} className="overflow-visible">
        {data.map((d, i) => {
          let y = chartH;
          return (
            <g key={d.month} transform={`translate(${i * (barW + 4)}, 0)`}>
              {ACTIVITY_CATEGORIES.map((c) => {
                const val = d[c.key as keyof ActivityRow] as number;
                const h = (val / maxTotal) * chartH;
                y -= h;
                return (
                  <rect key={c.key} x={0} y={y} width={barW} height={h} fill={c.color} rx={1}>
                    <title>{c.label}: {val.toLocaleString()}</title>
                  </rect>
                );
              })}
              <text x={barW / 2} y={chartH + 14} textAnchor="middle" className="text-[9px] fill-gray-400">
                {monthLabel(d.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Grouped Bar Chart (Res vs Com) ──────────────────────────────

function ResComChart({ data }: { data: ResComRow[] }) {
  if (!data.length) return <p className="text-gray-400">No data</p>;
  const max = Math.max(...data.flatMap((d) => [d.residential, d.commercial, d.residential_yoy, d.commercial_yoy]), 1);
  const groupW = Math.floor(600 / data.length) - 4;
  const barW = Math.floor(groupW / 2) - 1;
  const chartH = 180;

  return (
    <div>
      <div className="flex gap-4 mb-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-blue-500" /> Residential</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-purple-500" /> Commercial</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-gray-500" /> YoY target</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${data.length * (groupW + 4)} ${chartH + 24}`} className="overflow-visible">
        {data.map((d, i) => {
          const rH = (d.residential / max) * chartH;
          const cH = (d.commercial / max) * chartH;
          const rYoyY = chartH - (d.residential_yoy / max) * chartH;
          const cYoyY = chartH - (d.commercial_yoy / max) * chartH;
          return (
            <g key={d.month} transform={`translate(${i * (groupW + 4)}, 0)`}>
              {/* Current bars */}
              <rect x={0} y={chartH - rH} width={barW} height={rH} fill="#3B82F6" rx={2}>
                <title>Residential: {d.residential.toLocaleString()}</title>
              </rect>
              <rect x={barW + 2} y={chartH - cH} width={barW} height={cH} fill="#8B5CF6" rx={2}>
                <title>Commercial: {d.commercial.toLocaleString()}</title>
              </rect>
              {/* YoY target lines — always visible regardless of bar height */}
              {d.residential_yoy > 0 && (
                <line x1={0} y1={rYoyY} x2={barW} y2={rYoyY} stroke="#1E3A5F" strokeWidth={2} strokeDasharray="4,2">
                  <title>Residential YoY: {d.residential_yoy.toLocaleString()}</title>
                </line>
              )}
              {d.commercial_yoy > 0 && (
                <line x1={barW + 2} y1={cYoyY} x2={barW + 2 + barW} y2={cYoyY} stroke="#4C1D95" strokeWidth={2} strokeDasharray="4,2">
                  <title>Commercial YoY: {d.commercial_yoy.toLocaleString()}</title>
                </line>
              )}
              <text x={groupW / 2} y={chartH + 14} textAnchor="middle" className="text-[9px] fill-gray-400">
                {monthLabel(d.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Trades with YoY ─────────────────────────────────────────────

function TradesChart({ trades }: { trades: TradeRow[] }) {
  const maxVal = Math.max(...trades.map((t) => Math.max(t.lead_count, t.lead_count_yoy)), 1);

  return (
    <div className="space-y-2">
      {trades.map((t) => {
        const pct = trendPct(t.lead_count, t.lead_count_yoy);
        return (
          <div key={t.slug} className="flex items-center gap-2 text-sm">
            <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
            <span className="w-36 truncate text-gray-700">{t.name}</span>
            <div className="flex-1 bg-gray-100 rounded h-5 overflow-hidden relative">
              <div
                className="h-full rounded opacity-30 absolute top-0 left-0"
                style={{ width: `${(t.lead_count_yoy / maxVal) * 100}%`, backgroundColor: t.color }}
              />
              <div
                className="h-full rounded relative z-10"
                style={{ width: `${(t.lead_count / maxVal) * 100}%`, backgroundColor: t.color }}
              />
            </div>
            <span className="w-14 text-right text-gray-700 tabular-nums font-medium">{t.lead_count.toLocaleString()}</span>
            <span className="w-20 text-right">
              {pct !== 0 ? (
                <span className={`text-xs font-medium ${pct > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {pct > 0 ? '\u25B2' : '\u25BC'} {Math.abs(pct)}%
                </span>
              ) : (
                <span className="text-xs text-gray-400">--</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Scope Tags with YoY (segmented) ────────────────────────────

function ScopeTagsSection({ title, tags, color }: { title: string; tags: ScopeTagRow[]; color: string }) {
  if (!tags.length) return <p className="text-gray-400">No {title.toLowerCase()} tags this month</p>;
  const maxVal = Math.max(...tags.map((t) => Math.max(t.permit_count, t.permit_count_yoy)), 1);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      <div className="space-y-1.5">
        {tags.map((t) => {
          const pct = trendPct(t.permit_count, t.permit_count_yoy);
          return (
            <div key={t.tag} className="flex items-center gap-2 text-sm">
              <span className="w-44 truncate text-gray-600 font-mono text-xs">{t.tag}</span>
              <div className="flex-1 bg-gray-100 rounded h-4 overflow-hidden relative">
                <div
                  className="h-full rounded opacity-25 absolute top-0 left-0"
                  style={{ width: `${(t.permit_count_yoy / maxVal) * 100}%`, backgroundColor: color }}
                />
                <div
                  className="h-full rounded relative z-10"
                  style={{ width: `${(t.permit_count / maxVal) * 100}%`, backgroundColor: color }}
                />
              </div>
              <span className="w-10 text-right text-gray-600 tabular-nums text-xs">{t.permit_count}</span>
              <span className="w-16 text-right">
                {pct !== 0 ? (
                  <span className={`text-xs ${pct > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {pct > 0 ? '\u25B2' : '\u25BC'}{Math.abs(pct)}%
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">--</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 mt-1">Faded bar = same month last year</p>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────

export default function MarketMetricsPage() {
  const [data, setData] = useState<MarketMetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/market-metrics');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Market Metrics</h1>
              <p className="text-sm text-gray-500">Construction trends, lead volumes &amp; geographic patterns</p>
            </div>
            <a href="/admin" className="text-sm text-blue-600 hover:underline">&larr; Admin</a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {loading && <p className="text-gray-500">Loading market metrics...</p>}
        {error && <p className="text-red-600">Error: {error}</p>}

        {data && (() => {
          const refLabel = new Date(data.kpi.ref_month + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          return (
          <>
            {/* Section 1: KPI Row */}
            <KPIRow kpi={data.kpi} />

            {/* Section 2: Activity by Permit Type */}
            <section className="bg-white rounded-lg border p-5">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Activity by Permit Type (12 months)</h2>
              <p className="text-xs text-gray-400 mb-4">Small Res, New Houses, Additions/Alterations, New Building, Plumbing, HVAC, Drain, Demolition, Other</p>
              <ActivityChart data={data.activity} />
            </section>

            {/* Section 3: Residential vs Commercial */}
            <section className="bg-white rounded-lg border p-5">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Residential vs Commercial (12 months)</h2>
              <ResComChart data={data.residential_vs_commercial} />
            </section>

            {/* Section 4: Leads by Trade — all 20 trades with YoY */}
            <section className="bg-white rounded-lg border p-5">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Leads by Trade ({refLabel})</h2>
              <p className="text-xs text-gray-400 mb-4">All 20 trades — includes all classified trades (not just active phase). Faded bar = same month last year.</p>
              <TradesChart trades={data.trades} />
            </section>

            {/* Section 5: Scope Tags — Residential */}
            <section className="bg-white rounded-lg border p-5">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Scope Tags ({refLabel} vs Year Ago)</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <ScopeTagsSection title="Residential" tags={data.scope_tags.residential} color="#3B82F6" />
                <ScopeTagsSection title="Commercial" tags={data.scope_tags.commercial} color="#8B5CF6" />
              </div>
            </section>

            {/* Section 6: Neighbourhood Wealth Tiers */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Residential Permits by Income Tier (30 days)</h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {data.neighbourhoods.map((g) => {
                  const borderColor = g.tier === 'high' ? 'border-l-emerald-500'
                    : g.tier === 'middle' ? 'border-l-blue-500'
                    : 'border-l-amber-500';
                  return (
                    <div key={g.tier} className={`bg-white rounded-lg border border-l-4 ${borderColor} p-5`}>
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">{g.label}</h3>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-gray-500">Permits</p>
                          <p className="text-2xl font-bold text-gray-900">{g.permit_count.toLocaleString()}</p>
                          <TrendArrow pct={trendPct(g.permit_count, g.permit_count_yoy)} label="YoY" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Value</p>
                          <p className="text-2xl font-bold text-gray-900">{formatCurrency(g.total_value)}</p>
                          <TrendArrow pct={trendPct(g.total_value, g.total_value_yoy)} label="YoY" />
                        </div>
                      </div>
                      {g.top_neighbourhoods.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">Top neighbourhoods</p>
                          <div className="space-y-1">
                            {g.top_neighbourhoods.map((n, i) => (
                              <div key={n.name} className="flex items-center text-xs gap-1.5">
                                <span className="text-gray-400 w-4 text-right">{i + 1}.</span>
                                <span className="text-gray-700 truncate flex-1">{n.name}</span>
                                <span className="text-gray-500 tabular-nums">{n.permit_count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </>
          );
        })()}
      </main>
    </div>
  );
}
