import type { FunnelRowData, StepDescription } from '@/lib/admin/funnel';
import { getRangeStatus, STEP_EXPECTED_RANGES } from '@/lib/admin/funnel';

// ---------------------------------------------------------------------------
// Funnel accordion sub-components — extracted from FreshnessTimeline.tsx
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// T5: Sparkline — inline SVG for historical run trends
// ---------------------------------------------------------------------------

export interface SparklineRun {
  duration_ms: number | null;
  status: string;
}

/**
 * Tiny inline SVG sparkline (40×16px) showing duration trend for last N runs.
 * Green dots = completed, red dots = failed. Hidden on mobile.
 */
export function Sparkline({ runs }: { runs: SparklineRun[] }) {
  if (!runs || runs.length < 2) return null;
  const w = 40;
  const h = 16;
  const pad = 2;
  const ordered = [...runs].reverse(); // oldest first (runs is DESC from API)
  const durations = ordered.map((r) => r.duration_ms ?? 0);
  const max = Math.max(...durations, 1);
  const points = durations.map((d, i) => ({
    x: pad + (i / (durations.length - 1)) * (w - pad * 2),
    y: pad + (1 - d / max) * (h - pad * 2),
    failed: ordered[i]?.status === 'failed',
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <svg width={w} height={h} className="hidden md:inline-block shrink-0" aria-label="Run history sparkline">
      <path d={pathD} fill="none" stroke="#9ca3af" strokeWidth={1} />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.5} fill={p.failed ? '#ef4444' : '#22c55e'} />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// T1/T2/T4: Telemetry section for DataFlowTile drill-down
// ---------------------------------------------------------------------------

export interface TelemetryData {
  counts?: Record<string, { before: number; after: number; delta: number }>;
  pg_stats?: Record<string, { ins: number; upd: number; del: number }>;
  null_fills?: Record<string, Record<string, { before: number; after: number; filled: number }>>;
  engine?: Record<string, { n_live_tup: number; n_dead_tup: number; dead_ratio: number; seq_scan: number; idx_scan: number; seq_ratio: number }>;
}

/** Small inline range badge — green/yellow/red based on expected range */
function RangeBadge({ value, range }: { value: number; range?: [number, number] }) {
  if (!range) return null;
  const status = getRangeStatus(value, range);
  if (status === 'normal') return <span className="text-[7px] px-1 py-0.5 rounded bg-green-50 text-green-600 font-medium" title={`Expected: ${range[0].toLocaleString()}–${range[1].toLocaleString()}`}>{'\u2713'}</span>;
  if (status === 'borderline') return <span className="text-[7px] px-1 py-0.5 rounded bg-yellow-50 text-yellow-600 font-medium" title={`Expected: ${range[0].toLocaleString()}–${range[1].toLocaleString()}`}>{'\u26A0'}</span>;
  return <span className="text-[7px] px-1 py-0.5 rounded bg-red-50 text-red-600 font-medium" title={`Expected: ${range[0].toLocaleString()}–${range[1].toLocaleString()}`}>{'\u2717'}</span>;
}

/** Renders T1/T2/T4/T6 telemetry inline — displayed in Performance Metrics section after audit table */
export function TelemetrySection({ telemetry, stepSlug }: { telemetry: TelemetryData; stepSlug?: string }) {
  const tables = Object.keys(telemetry.counts ?? {});
  if (tables.length === 0) return null;

  const expected = stepSlug ? STEP_EXPECTED_RANGES[stepSlug] : undefined;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
      <h5 className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">DB State Changes</h5>
      <p className="text-[8px] text-gray-400 leading-snug">Observed database mutations from PostgreSQL stats counters (pg_stat_user_tables). These are raw SQL operation counts, not logical record counts.</p>
      {expected?.behavior && (
        <p className="text-[8px] text-violet-500 leading-snug italic">{expected.behavior}</p>
      )}
      {tables.map((table) => {
        const count = telemetry.counts?.[table];
        const stats = telemetry.pg_stats?.[table];
        const fills = telemetry.null_fills?.[table];
        const engine = telemetry.engine?.[table];
        const mutRanges = expected?.mutations?.[table];
        const deltaRange = expected?.row_delta?.[table];

        return (
          <div key={table} className="space-y-1">
            <span className="text-[10px] font-mono text-gray-600 font-medium">{table}</span>
            <div className="flex flex-wrap gap-2 items-center">
              {/* T1: Row count delta */}
              {count && (
                <span className="text-[9px] tabular-nums text-gray-500">
                  {count.before.toLocaleString()} → {count.after.toLocaleString()}{' '}
                  <span className={count.delta > 0 ? 'text-green-600 font-medium' : count.delta < 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>
                    ({count.delta > 0 ? '+' : ''}{count.delta.toLocaleString()})
                  </span>
                  <RangeBadge value={count.delta} range={deltaRange} />
                </span>
              )}
              {/* T2: pg_stat mutation badges */}
              {stats && (stats.ins > 0 || stats.upd > 0 || stats.del > 0) && (
                <span className="flex gap-1">
                  {stats.ins > 0 && <span className="text-[8px] px-1 py-0.5 rounded bg-green-100 text-green-700 font-medium tabular-nums">SQL Inserts: {stats.ins.toLocaleString()} <RangeBadge value={stats.ins} range={mutRanges?.ins} /></span>}
                  {stats.upd > 0 && <span className="text-[8px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 font-medium tabular-nums">SQL Updates: {stats.upd.toLocaleString()} <RangeBadge value={stats.upd} range={mutRanges?.upd} /></span>}
                  {stats.del > 0 && <span className="text-[8px] px-1 py-0.5 rounded bg-red-100 text-red-700 font-medium tabular-nums">SQL Deletes: {stats.del.toLocaleString()} <RangeBadge value={stats.del} range={mutRanges?.del} /></span>}
                </span>
              )}
            </div>
            {/* T4: NULL fill audit */}
            {fills && Object.keys(fills).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(fills).map(([col, f]) => {
                  const beforePct = count && count.before > 0 ? ((f.before / count.before) * 100).toFixed(1) : '?';
                  const afterPct = count && count.after > 0 ? ((f.after / count.after) * 100).toFixed(1) : '?';
                  return (
                    <span key={col} className="text-[9px] text-gray-500 tabular-nums">
                      <span className="font-mono text-gray-600">{col}</span>: {beforePct}% null → {afterPct}% null
                      {f.filled > 0 && <span className="text-green-600 font-medium"> ({f.filled} filled)</span>}
                    </span>
                  );
                })}
              </div>
            )}
            {/* T6: Engine health badges */}
            {engine && (
              <div className="flex flex-wrap gap-2">
                <span className={`text-[8px] px-1 py-0.5 rounded font-medium tabular-nums ${engine.dead_ratio > 0.10 && engine.n_live_tup >= 1000 ? 'bg-amber-100 text-amber-700' : 'bg-gray-50 text-gray-500'}`}>
                  Dead: {(engine.dead_ratio * 100).toFixed(1)}%
                </span>
                {engine.n_live_tup >= 10000 && (
                  <span className={`text-[8px] px-1 py-0.5 rounded font-medium tabular-nums ${engine.seq_ratio > 0.80 ? 'bg-amber-100 text-amber-700' : 'bg-gray-50 text-gray-500'}`}>
                    Seq: {(engine.seq_ratio * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CircularBadge
// ---------------------------------------------------------------------------

export function CircularBadge({ pct }: { pct: number }) {
  const r = 10;
  const circ = 2 * Math.PI * r;
  const filled = (Math.min(pct, 100) / 100) * circ;
  const stroke = pct >= 90 ? 'stroke-green-500' : pct >= 70 ? 'stroke-blue-500' : pct >= 50 ? 'stroke-yellow-500' : 'stroke-red-500';
  const text = pct >= 90 ? 'text-green-700' : pct >= 70 ? 'text-blue-700' : pct >= 50 ? 'text-yellow-700' : 'text-red-600';
  return (
    <div className="circular-badge relative w-7 h-7 shrink-0" title={`${pct}% matched`}>
      <svg viewBox="0 0 24 24" className="w-7 h-7">
        <circle cx="12" cy="12" r={r} fill="none" className="stroke-gray-200" strokeWidth="2.5" />
        <circle cx="12" cy="12" r={r} fill="none" className={stroke} strokeWidth="2.5"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-[8px] font-bold tabular-nums ${text}`}>
        {pct}
      </span>
    </div>
  );
}

function MetricRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="text-xs text-gray-500 min-w-[80px]">{label}</span>
      <span className={`text-xs font-semibold tabular-nums text-right ${className ?? 'text-gray-900'}`}>{value}</span>
    </div>
  );
}

export function FunnelAllTimePanel({ row }: { row: FunnelRowData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {/* Zone 2: Baseline */}
      <div className="nested-tile bg-gray-50 border border-gray-100 rounded-md p-3">
        <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Baseline</h4>
        <MetricRow label={row.baselineLabel} value={row.baselineTotal.toLocaleString()} />
        {row.targetPool !== null && (
          <MetricRow label={row.targetPoolLabel!} value={row.targetPool.toLocaleString()} />
        )}
        {row.baselineNullRates.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200/60">
            <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Null Rates</p>
            {row.baselineNullRates.map((nr) => (
              <MetricRow
                key={nr.field}
                label={nr.field}
                value={`${nr.pct}% null`}
                className={nr.pct > 20 ? 'text-red-500' : nr.pct > 5 ? 'text-yellow-600' : 'text-green-600'}
              />
            ))}
          </div>
        )}
      </div>
      {/* Zone 3: Intersection */}
      <div className="nested-tile bg-gray-50 border border-gray-100 rounded-md p-3">
        <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Intersection</h4>
        <MetricRow label={row.matchDenominatorLabel} value={row.matchDenominator.toLocaleString()} />
        <MetricRow label="Matched" value={`${row.matchCount.toLocaleString()} (${row.matchPct}%)`} className="text-green-700" />
        {row.matchTiers.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200/60">
            <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Sub-Tiers</p>
            {row.matchTiers.map((tier) => (
              <MetricRow key={tier.label} label={tier.label} value={tier.count.toLocaleString()} className="text-gray-700" />
            ))}
          </div>
        )}
      </div>
      {/* Zone 4: Yield */}
      <div className="nested-tile bg-gray-50 border border-gray-100 rounded-md p-3">
        <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Yield</h4>
        {row.yieldCounts.map((y) => (
          <MetricRow key={y.field} label={y.field} value={y.count.toLocaleString()} />
        ))}
        {row.yieldNullRates.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200/60">
            <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Null Rates</p>
            {row.yieldNullRates.map((nr) => (
              <MetricRow
                key={nr.field}
                label={nr.field}
                value={`${nr.pct}% null`}
                className={nr.pct > 20 ? 'text-red-500' : nr.pct > 5 ? 'text-yellow-600' : 'text-green-600'}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const INTERSECTION_LABELS: Record<string, { processedLabel: string; matchedLabel: string }> = {
  geocode_permits:      { processedLabel: 'To Geocode',   matchedLabel: 'Geocoded' },
  link_parcels:         { processedLabel: 'Unlinked',     matchedLabel: 'Linked' },
  link_neighbourhoods:  { processedLabel: 'Unlinked',     matchedLabel: 'Linked' },
  link_massing:         { processedLabel: 'Parcels',      matchedLabel: 'Linked' },
  link_coa:             { processedLabel: 'Applications', matchedLabel: 'Linked' },
  link_wsib:            { processedLabel: 'Unlinked',     matchedLabel: 'Linked' },
  link_similar:         { processedLabel: 'Companions',   matchedLabel: 'Propagated' },
  classify_scope:       { processedLabel: 'To Classify',  matchedLabel: 'Classified' },
  classify_permits:     { processedLabel: 'To Classify',  matchedLabel: 'Classified' },
  builders:             { processedLabel: 'Permits',      matchedLabel: 'Extracted' },
  permits:              { processedLabel: 'Fetched',      matchedLabel: 'New/Changed' },
  coa:                  { processedLabel: 'Fetched',      matchedLabel: 'New/Changed' },
};

export function FunnelLastRunPanel({ row }: { row: FunnelRowData }) {
  const meta = row.lastRunMeta;
  if (!meta && row.lastRunRecordsTotal == null) {
    return <p className="text-xs text-gray-400 italic py-2">No run data available yet. Trigger a pipeline run to populate.</p>;
  }

  const processed = (meta?.processed as number) ?? row.lastRunRecordsTotal ?? 0;
  const matched = (meta?.matched as number) ?? row.lastRunRecordsNew ?? 0;
  const failed = (meta?.failed as number) ?? 0;
  const websitesFound = (meta?.websites_found as number) ?? null;
  const extractedFields = (meta?.extracted_fields as Record<string, number>) ?? null;
  const runPct = processed > 0 ? Math.round((matched / processed) * 1000) / 10 : 0;
  const labels = INTERSECTION_LABELS[row.config.statusSlug] ?? { processedLabel: 'Processed', matchedLabel: 'Matched' };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="nested-tile bg-gray-50 border border-gray-100 rounded-md p-3">
        <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Run Baseline</h4>
        <MetricRow label="Records" value={(row.lastRunRecordsTotal ?? 0).toLocaleString()} />
      </div>
      <div className="nested-tile bg-gray-50 border border-gray-100 rounded-md p-3">
        <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Run Intersection</h4>
        {websitesFound != null ? (
          <>
            <MetricRow label="1. Searched" value={processed.toLocaleString()} />
            <MetricRow label="2. Websites" value={websitesFound.toLocaleString()} />
            <MetricRow label="3. Extracted" value={matched.toLocaleString()} />
          </>
        ) : (
          <>
            <MetricRow label={labels.processedLabel} value={processed.toLocaleString()} />
            <MetricRow label={labels.matchedLabel} value={`${matched.toLocaleString()} (${runPct}%)`} className="text-green-700" />
            {failed > 0 && (
              <MetricRow label="Failed" value={failed.toLocaleString()} className="text-red-500" />
            )}
          </>
        )}
      </div>
      <div className="nested-tile bg-gray-50 border border-gray-100 rounded-md p-3">
        <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Run Yield</h4>
        {extractedFields ? (
          <>
            {Object.entries(extractedFields)
              .filter(([, count]) => (count as number) > 0)
              .map(([field, count]) => (
                <MetricRow key={field} label={field} value={(count as number).toLocaleString()} />
              ))}
          </>
        ) : (
          <>
            <MetricRow label="Records" value={(row.lastRunRecordsTotal ?? 0).toLocaleString()} />
            <MetricRow label="New/Changed" value={(row.lastRunRecordsNew ?? 0).toLocaleString()} />
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data Flow Tile — source → target visualization for pipeline descriptions
// ---------------------------------------------------------------------------

function ColGrid({ cols, highlights }: { cols: string[]; highlights?: Set<string> | null }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-0">
      {cols.map((c) => {
        const lit = !highlights || highlights.has(c);
        return (
          <div key={c} className="flex items-center gap-1.5">
            <span className={`w-1 h-1 rounded-full shrink-0 ${lit ? 'bg-emerald-400' : 'bg-gray-200'}`} />
            <span className={`text-[11px] font-mono ${lit ? 'text-gray-700 font-medium' : 'text-gray-300'}`}>{c}</span>
          </div>
        );
      })}
    </div>
  );
}

function TableCard({ tableName, cols, highlights, label }: {
  tableName: string; cols: string[]; highlights?: Set<string> | null; label: string;
}) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-md p-2.5 flex-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
        <span className="text-[10px] font-mono text-gray-600 font-medium">{tableName}</span>
        <span className="text-[8px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5 ml-auto">Live DB Schema</span>
      </div>
      {cols.length > 0 ? <ColGrid cols={cols} highlights={highlights} /> : (
        <p className="text-[10px] text-gray-400 italic">Schema not available</p>
      )}
    </div>
  );
}

function ExternalBadge({ label, cols }: { label: string; cols?: string[] }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2 flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-semibold text-blue-400 uppercase tracking-wider">Source</span>
        <span className="text-[11px] font-medium text-blue-700">{label}</span>
      </div>
      {cols && cols.length > 0 && cols[0] !== '*' && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {cols.map((c) => (
            <span key={c} className="text-[10px] font-mono text-blue-600 bg-white border border-blue-100 rounded px-1.5 py-0.5">{c}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Renders exact columns from live pipeline_meta — no fallback to full schema */
function LiveColumnCard({ tableName, cols, label, color }: {
  tableName: string; cols: string[]; label: string; color: 'blue' | 'emerald';
}) {
  const isWildcard = cols.length === 1 && cols[0] === '*';
  const bgCls = color === 'blue' ? 'bg-blue-50 border-blue-200' : 'bg-emerald-50 border-emerald-200';
  const labelCls = color === 'blue' ? 'text-blue-400' : 'text-emerald-400';
  const nameCls = color === 'blue' ? 'text-blue-600' : 'text-emerald-600';
  const chipCls = color === 'blue'
    ? 'text-blue-700 bg-white border-blue-100'
    : 'text-emerald-700 bg-white border-emerald-100';

  return (
    <div className={`${bgCls} border rounded-md p-2.5`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`text-[9px] font-semibold ${labelCls} uppercase tracking-wider`}>{label}</span>
        <span className={`text-[10px] font-mono ${nameCls} font-medium`}>{tableName}</span>
      </div>
      {isWildcard ? (
        <span className="text-[10px] text-gray-400 italic">All columns</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {cols.map((c) => (
            <span key={c} className={`text-[10px] font-mono ${chipCls} border rounded px-1.5 py-0.5`}>{c}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Pipeline metadata from script-emitted PIPELINE_META stdout line */
export interface PipelineMeta {
  reads?: Record<string, string[]>;
  writes?: Record<string, string[]>;
}

export function DataFlowTile({ desc, dbSchemaMap, pipelineMeta }: {
  desc: StepDescription; dbSchemaMap?: Record<string, string[]>; pipelineMeta?: PipelineMeta | null;
}) {
  // Live pipeline_meta is the single source of truth for reads/writes.
  // It comes from PIPELINE_META emitted by each script and stored in
  // pipeline_runs.records_meta.pipeline_meta after every run.
  const hasLiveMeta = !!(pipelineMeta?.reads || pipelineMeta?.writes);
  const isExternal = (s: string) => !dbSchemaMap?.[s];

  if (!hasLiveMeta) {
    // Never-run fallback: show full table schema from information_schema
    const targetCols = dbSchemaMap?.[desc.table] ?? [];
    return (
      <div className="accordion-tile bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Data Flow</h4>
          <span className="text-[8px] font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded px-1 py-0.5">Awaiting First Run</span>
        </div>
        <p className="text-xs text-gray-600 mb-3">{desc.summary}</p>
        {targetCols.length > 0 ? (
          <TableCard tableName={desc.table} cols={targetCols} highlights={null} label="Target Table" />
        ) : (
          <p className="text-[10px] text-gray-400 italic">Run this pipeline to see exact data flow</p>
        )}
      </div>
    );
  }

  // Live data flow from pipeline_meta
  const readTables = Object.keys(pipelineMeta!.reads ?? {});
  const writeTables = Object.keys(pipelineMeta!.writes ?? {});

  return (
    <div className="accordion-tile bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Data Flow</h4>
        <span className="text-[8px] font-medium text-violet-600 bg-violet-50 border border-violet-200 rounded px-1 py-0.5">Live Meta</span>
      </div>
      <p className="text-xs text-gray-600 mb-3">{desc.summary}</p>

      <div className="flex flex-col md:flex-row items-stretch gap-2">
        {/* Read sources */}
        <div className={`flex flex-col gap-2 ${readTables.length > 0 ? 'flex-1 min-w-0' : ''}`}>
          {readTables.map((table) => {
            const cols = pipelineMeta!.reads![table];
            return isExternal(table)
              ? <div key={table}><ExternalBadge label={table} cols={cols} /></div>
              : <div key={table}>
                  <LiveColumnCard tableName={table} cols={cols} label="Reads" color="blue" />
                </div>;
          })}
        </div>
        {/* Arrow */}
        {readTables.length > 0 && writeTables.length > 0 && (
          <div className="flex items-center justify-center py-1 md:py-0 md:px-1">
            <span className="text-gray-300 text-lg font-bold rotate-90 md:rotate-0">{'\u2192'}</span>
          </div>
        )}
        {/* Write targets */}
        <div className={`flex flex-col gap-2 ${writeTables.length > 0 ? 'flex-1 min-w-0' : ''}`}>
          {writeTables.map((table) => {
            const cols = pipelineMeta!.writes![table];
            return (
              <div key={table}>
                <LiveColumnCard tableName={table} cols={cols} label="Writes" color="emerald" />
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
