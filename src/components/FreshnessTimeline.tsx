'use client';

import { useState, useEffect, useRef } from 'react';
import type { FunnelRowData } from '@/lib/admin/funnel';
import { FUNNEL_SOURCE_BY_SLUG, STEP_DESCRIPTIONS, PIPELINE_TABLE_MAP, STEP_EXPECTED_RANGES, getRangeStatus } from '@/lib/admin/funnel';
import { CircularBadge, DataFlowTile, TelemetrySection, Sparkline, type SparklineRun, type TelemetryData } from './funnel/FunnelPanels';

// ---------------------------------------------------------------------------
// Pipeline Registry — single source of truth for all tracked pipelines
// ---------------------------------------------------------------------------

export type PipelineGroup = 'ingest' | 'link' | 'classify' | 'snapshot' | 'quality';

export interface PipelineEntry {
  name: string;
  group: PipelineGroup;
}

export const PIPELINE_REGISTRY: Record<string, PipelineEntry> = {
  // Ingest (7) — load raw data into DB
  permits:            { name: 'Building Permits',      group: 'ingest' },
  close_stale_permits:{ name: 'Close Stale Permits',   group: 'ingest' },
  classify_permit_phase:{ name: 'Classify Permit Phase', group: 'ingest' },
  coa:                { name: 'CoA Applications',      group: 'ingest' },
  builders:           { name: 'Extract Entities',       group: 'ingest' },
  address_points:     { name: 'Address Points',        group: 'ingest' },
  parcels:            { name: 'Parcels',               group: 'ingest' },
  massing:            { name: '3D Massing',            group: 'ingest' },
  neighbourhoods:     { name: 'Neighbourhoods',        group: 'ingest' },
  // Link & Enrich (12)
  geocode_permits:    { name: 'Geocode Permits',       group: 'link' },
  link_parcels:       { name: 'Link Parcels',          group: 'link' },
  link_neighbourhoods:{ name: 'Link Neighbourhoods',   group: 'link' },
  link_massing:       { name: 'Link Massing',          group: 'link' },
  link_coa:           { name: 'Link CoA',              group: 'link' },
  enrich_wsib_builders: { name: 'Enrich WSIB Matched',   group: 'link' },
  enrich_named_builders:{ name: 'Enrich Web Entities',   group: 'link' },
  load_wsib:          { name: 'Load WSIB Registry',    group: 'ingest' },
  link_wsib:          { name: 'Link WSIB',             group: 'link' },
  link_similar:       { name: 'Link Similar Permits',  group: 'link' },
  create_pre_permits: { name: 'Create Pre-Permits',    group: 'link' },
  compute_centroids:  { name: 'Compute Centroids',     group: 'link' },
  // Scrape (1) — external portal data
  inspections:                  { name: 'Inspection Stages',             group: 'link' },
  classify_inspection_status:   { name: 'Classify Inspection Status',    group: 'classify' },
  coa_documents:                { name: 'CoA Documents',                 group: 'link' },
  // Classify (3) — derive fields
  classify_scope:       { name: 'Scope Classification', group: 'classify' },
  classify_permits:     { name: 'Classify Trades',     group: 'classify' },
  // Snapshot (1) — capture metrics
  refresh_snapshot:   { name: 'Refresh Snapshot',      group: 'snapshot' },
  // Quality (6) — CQA validation
  assert_schema:              { name: 'Schema Validation',      group: 'quality' },
  assert_data_bounds:         { name: 'Data Quality Checks',    group: 'quality' },
  assert_engine_health:       { name: 'Engine Health',           group: 'quality' },
  assert_network_health:      { name: 'Network Health',          group: 'quality' },
  assert_staleness:           { name: 'Staleness Monitor',       group: 'quality' },
  assert_pre_permit_aging:    { name: 'Pre-Permit Aging',        group: 'quality' },
  assert_coa_freshness:       { name: 'Source Freshness',         group: 'quality' },
};

// ---------------------------------------------------------------------------
// Pipeline Chains — dependency-ordered execution sequences
// indent: 0 = root trigger, 1 = main step, 2 = sub-dependency
// ---------------------------------------------------------------------------

export interface ChainStep {
  slug: string;
  indent: number;
}

export interface PipelineChain {
  id: string;
  label: string;
  description: string;
  steps: ChainStep[];
  comingSoon?: boolean;
}

export const PIPELINE_CHAINS: PipelineChain[] = [
  // Group 1: Core Ingestion (fast daily)
  {
    id: 'permits',
    label: 'Permits Pipeline',
    description: 'Daily — when building permits are loaded',
    steps: [
      { slug: 'assert_schema',       indent: 0 },
      { slug: 'permits',              indent: 0 },
      { slug: 'close_stale_permits',  indent: 0 },
      { slug: 'classify_permit_phase', indent: 0 },
      { slug: 'classify_scope',       indent: 1 },
      { slug: 'builders',             indent: 1 },
      { slug: 'link_wsib',            indent: 1 },
      { slug: 'geocode_permits',      indent: 1 },
      { slug: 'link_parcels',         indent: 1 },
      { slug: 'link_neighbourhoods',  indent: 1 },
      { slug: 'link_massing',         indent: 1 },
      { slug: 'link_similar',         indent: 1 },
      { slug: 'classify_permits',     indent: 1 },
      { slug: 'link_coa',             indent: 1 },
      { slug: 'create_pre_permits',   indent: 1 },
      { slug: 'refresh_snapshot',     indent: 1 },
      { slug: 'assert_data_bounds',   indent: 0 },
      { slug: 'assert_engine_health', indent: 0 },
    ],
  },
  {
    id: 'coa',
    label: 'CoA Pipeline',
    description: 'Daily — when Committee of Adjustment data is loaded',
    steps: [
      { slug: 'assert_schema',           indent: 0 },
      { slug: 'coa',                     indent: 0 },
      { slug: 'assert_coa_freshness',   indent: 0 },
      { slug: 'link_coa',                indent: 1 },
      { slug: 'create_pre_permits',      indent: 1 },
      { slug: 'assert_pre_permit_aging', indent: 0 },
      { slug: 'refresh_snapshot',         indent: 1 },
      { slug: 'assert_data_bounds',       indent: 0 },
      { slug: 'assert_engine_health',     indent: 0 },
    ],
  },
  // Group 2: Corporate Entities Enrichment (slow daily scrapes)
  {
    id: 'entities',
    label: 'Corporate Entities Pipeline',
    description: 'Daily — missing contact enrichment via web scraping',
    steps: [
      { slug: 'enrich_wsib_builders',  indent: 0 },
      { slug: 'enrich_named_builders', indent: 0 },
    ],
  },
  // Group 3: Foundation (periodic reference data)
  {
    id: 'sources',
    label: 'Source Data Updates',
    description: 'Quarterly/Annual — reference data refreshes',
    steps: [
      { slug: 'assert_schema',       indent: 0 },
      { slug: 'address_points',      indent: 0 },
      { slug: 'geocode_permits',     indent: 1 },
      { slug: 'parcels',             indent: 0 },
      { slug: 'compute_centroids',   indent: 1 },
      { slug: 'link_parcels',        indent: 1 },
      { slug: 'massing',             indent: 0 },
      { slug: 'link_massing',        indent: 1 },
      { slug: 'neighbourhoods',      indent: 0 },
      { slug: 'link_neighbourhoods', indent: 1 },
      { slug: 'load_wsib',           indent: 0 },
      { slug: 'link_wsib',           indent: 1 },
      { slug: 'refresh_snapshot',    indent: 1 },
      { slug: 'assert_data_bounds',  indent: 0 },
      { slug: 'assert_engine_health', indent: 0 },
    ],
  },
  // Group 4: Deep Scrapes & Documents (continuous async workers)
  {
    id: 'deep_scrapes',
    label: 'Deep Scrapes',
    description: 'Weekly — AIC portal inspection scraping via REST API',
    steps: [
      { slug: 'inspections',                  indent: 0 },
      { slug: 'classify_inspection_status',  indent: 0 },
      { slug: 'assert_network_health',       indent: 0 },
      { slug: 'refresh_snapshot',      indent: 1 },
      { slug: 'assert_data_bounds',    indent: 0 },
      { slug: 'assert_engine_health',  indent: 0 },
      { slug: 'assert_staleness',      indent: 0 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Infrastructure steps — no individual Run button or toggle switch.
// These always run as part of a chain and cannot be disabled.
// ---------------------------------------------------------------------------

export const NON_TOGGLEABLE_SLUGS = new Set([
  'assert_schema',
  'assert_data_bounds',
  'assert_engine_health',
  'assert_pre_permit_aging',
  'assert_coa_freshness',
  'refresh_snapshot',
]);

// ---------------------------------------------------------------------------
// Props & helpers
// ---------------------------------------------------------------------------

export interface PipelineRunInfo {
  last_run_at: string | null;
  status: string | null;
  duration_ms?: number | null;
  error_message?: string | null;
  records_total?: number | null;
  records_new?: number | null;
  records_updated?: number | null;
  records_meta?: Record<string, unknown> | null;
}

export interface FreshnessTimelineProps {
  pipelineLastRun: Record<string, PipelineRunInfo>;
  runningPipelines: Set<string>;
  onTrigger: (slug: string) => void;
  slaTargets?: Record<string, number>;
  disabledPipelines?: Set<string>;
  onToggle?: (slug: string, enabled: boolean) => void;
  triggerError?: string | null;
  /** Pre-computed funnel data keyed by pipeline statusSlug */
  funnelData?: Record<string, FunnelRowData>;
  onCancel?: (slug: string) => void;
  /** Live DB schema map: table_name → column_name[] from information_schema */
  dbSchemaMap?: Record<string, string[]>;
  /** T3: Fast approximate row counts from pg_class.reltuples */
  liveTableCounts?: Record<string, number>;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never run';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

/**
 * Raw DB Transparency: status dot maps 1:1 to pipeline_runs.status,
 * with audit_table.verdict override for completed steps.
 * A step that completed (exit 0) but has verdict=FAIL shows red, WARN shows amber.
 */
function getStatusDot(info: PipelineRunInfo | undefined, isRunning: boolean): { color: string; label: string } {
  if (isRunning) return { color: 'bg-blue-50 tile-flash-running', label: 'Running' };
  if (!info || !info.last_run_at) return { color: '', label: 'Never run' };
  if (info.status === 'failed') return { color: 'bg-red-50', label: 'Failed' };
  if (info.status === 'completed_with_errors') return { color: 'bg-red-50', label: 'Errors' };
  if (info.status === 'completed_with_warnings') return { color: 'bg-amber-50', label: 'Warnings' };
  if (info.status === 'skipped') return { color: 'bg-gray-50', label: 'Skipped' };
  if (info.status === 'cancelled') return { color: 'bg-gray-50', label: 'Cancelled' };
  if (info.status === 'completed') {
    // Override tile color when audit verdict disagrees with process exit code
    const verdict = (info.records_meta as Record<string, unknown> | null)
      ?.audit_table as { verdict?: string } | undefined;
    if (verdict?.verdict === 'FAIL') return { color: 'bg-red-50', label: 'Failed' };
    if (verdict?.verdict === 'WARN') return { color: 'bg-amber-50', label: 'Warnings' };
    return { color: 'bg-green-50', label: 'Completed' };
  }
  return { color: '', label: info.status ?? 'Unknown' };
}

/**
 * Freshness badge — separate from status, based on time since last_run_at.
 * Returns null if no run data or if running.
 */
function getFreshnessBadge(info: PipelineRunInfo | undefined, isRunning: boolean): { text: string; cls: string } | null {
  if (isRunning || !info?.last_run_at) return null;
  const hours = (Date.now() - new Date(info.last_run_at).getTime()) / (1000 * 60 * 60);
  if (hours < 24) return { text: 'Fresh', cls: 'text-green-600 bg-green-50 border-green-200' };
  if (hours < 72) return { text: 'Recent', cls: 'text-green-600 bg-green-50 border-green-200' };
  if (hours < 168) return { text: 'Aging', cls: 'text-yellow-600 bg-yellow-50 border-yellow-200' };
  return { text: 'Overdue', cls: 'text-purple-600 bg-purple-50 border-purple-200' };
}

/** Compact number formatter: 1234 → 1.2K, 1234567 → 1.2M */
function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

/**
 * Compute step numbers for a chain. indent 0 and 1 get incrementing numbers.
 * indent 2 steps are un-numbered sub-dependencies.
 */
function computeStepNumbers(steps: ChainStep[]): (string | null)[] {
  let num = 0;
  return steps.map((step) => {
    if (step.indent <= 1) {
      num++;
      return `${num}`;
    }
    return null; // indent 2+ = sub-step, no number
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FreshnessTimeline({ pipelineLastRun, runningPipelines, onTrigger, slaTargets, disabledPipelines, onToggle, triggerError, funnelData, onCancel, dbSchemaMap, liveTableCounts }: FreshnessTimelineProps) {
  const [errorPopover, setErrorPopover] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  // Bug Fix 1: optimisticToggles for immediate visual feedback on toggle click
  const [optimisticToggles, setOptimisticToggles] = useState<Map<string, boolean>>(new Map());
  // Bug Fix 2: per-step runError tracking
  const [runError, setRunError] = useState<string | null>(null);
  // Track chains where cancel has been requested (shows "Stopping..." until polling clears)
  const [cancellingChains, setCancellingChains] = useState<Set<string>>(new Set());
  // T5 Sparkline: cached history runs per pipeline slug (lazy-loaded on accordion expand)
  const sparklineCache = useRef<Map<string, SparklineRun[]>>(new Map());
  const toggleExpand = (key: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    // T5: Lazy-load sparkline history on first expand
    const slug = key.substring(key.indexOf('-') + 1); // expandKey = chainId-stepSlug
    if (!sparklineCache.current.has(slug)) {
      fetch(`/api/admin/pipelines/history?slug=${encodeURIComponent(slug)}&limit=10`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.runs) {
            sparklineCache.current.set(slug, data.runs);
            // Force re-render so sparkline appears
            setExpandedSteps((prev) => new Set(prev));
          }
        })
        .catch((e) => { console.warn('[sparkline]', e); });
    }
  };

  // Optimistic toggle — flip local state immediately, auto-clear after API round-trip
  const handleToggle = (slug: string, currentlyDisabled: boolean) => {
    setOptimisticToggles((prev) => {
      const next = new Map(prev);
      next.set(slug, currentlyDisabled); // currentlyDisabled = desired new enabled state
      return next;
    });
    // Clear optimistic entry after 8s — must survive cold-start API latency + two poll cycles (5s each)
    const prev = optimisticTimerRef.current.get(slug);
    if (prev) clearTimeout(prev);
    optimisticTimerRef.current.set(
      slug,
      setTimeout(() => {
        setOptimisticToggles((p) => {
          const n = new Map(p);
          n.delete(slug);
          return n;
        });
        optimisticTimerRef.current.delete(slug);
      }, 8000)
    );
    onToggle?.(slug, currentlyDisabled);
  };

  // Resolve effective disabled state: optimistic override > prop
  const isEffectivelyDisabled = (slug: string): boolean => {
    if (optimisticToggles.has(slug)) return !optimisticToggles.get(slug)!;
    return disabledPipelines?.has(slug) ?? false;
  };

  // Clear optimistic overrides after a timeout — by then the API has refreshed the prop
  const optimisticTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      for (const t of optimisticTimerRef.current.values()) clearTimeout(t);
    };
  }, []);

  // Clear "Stopping..." state once the chain is no longer in runningPipelines
  useEffect(() => {
    if (cancellingChains.size === 0) return;
    setCancellingChains((prev) => {
      const next = new Set<string>();
      for (const slug of prev) {
        if (runningPipelines.has(slug)) next.add(slug);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [runningPipelines, cancellingChains.size]);

  // Bug Fix 2: Safe run with async error feedback
  const handleRun = async (slug: string) => {
    setRunError(null);
    try {
      await onTrigger(slug);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRunError(`${slug}: ${msg}`);
    }
  };

  const allSlugs = Object.keys(PIPELINE_REGISTRY);
  const completedCount = allSlugs.filter((s) => {
    const st = pipelineLastRun[s]?.status;
    return st === 'completed' || st === 'completed_with_warnings' || st === 'completed_with_errors';
  }).length;
  const failedCount = allSlugs.filter((s) => pipelineLastRun[s]?.status === 'failed').length;
  const neverRunCount = allSlugs.filter((s) => !pipelineLastRun[s]?.last_run_at).length;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Pipeline Status
        </h3>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            {completedCount} OK
          </span>
          {failedCount > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              {failedCount} failed
            </span>
          )}
          {neverRunCount > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
              {neverRunCount} pending
            </span>
          )}
          <span className="text-gray-400">{allSlugs.length} total</span>
        </div>
      </div>

      {/* Run error inline banner */}
      {runError && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center justify-between">
          <p className="text-[10px] text-amber-700 font-medium">Run failed: {runError}</p>
          <button onClick={() => setRunError(null)} className="text-amber-400 hover:text-amber-600 text-xs">Dismiss</button>
        </div>
      )}

      {/* Chains */}
      <div className="space-y-5">
        {PIPELINE_CHAINS.map((chain) => {
          const stepNumbers = computeStepNumbers(chain.steps);
          const chainSlug = `chain_${chain.id}`;
          const isChainRunning = runningPipelines.has(chainSlug);

          // Disable Run All if chain is coming soon or all toggleable steps are disabled
          const toggleableSteps = chain.steps.filter((s) => !NON_TOGGLEABLE_SLUGS.has(s.slug));
          const allStepsDisabled = toggleableSteps.length > 0 &&
            toggleableSteps.every((s) => disabledPipelines?.has(s.slug));
          const runAllDisabled = isChainRunning || !!chain.comingSoon || allStepsDisabled;
          const runAllLabel = chain.comingSoon
            ? 'Coming Soon'
            : allStepsDisabled
            ? 'All Steps Disabled'
            : isChainRunning
            ? 'Running...'
            : 'Run All';

          return (
            <div key={chain.id}>
              {/* Chain header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {chain.label}
                </span>
                <span className="text-[9px] text-gray-300">{chain.description}</span>
                <div className="flex-1 h-px bg-gray-100" />
                <button
                  onClick={() => handleRun(chainSlug)}
                  disabled={runAllDisabled}
                  className={`text-[9px] px-2.5 py-1 rounded border min-h-[44px] ${
                    isChainRunning
                      ? 'border-blue-200 text-blue-400 bg-blue-50 cursor-not-allowed'
                      : runAllDisabled
                      ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
                      : 'border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700'
                  }`}
                >
                  {runAllLabel}
                </button>
                {isChainRunning && onCancel && (
                  <button
                    onClick={() => {
                      setCancellingChains((prev) => new Set(prev).add(chainSlug));
                      onCancel(chainSlug);
                    }}
                    disabled={cancellingChains.has(chainSlug)}
                    className={`text-[9px] px-2.5 py-1 rounded border min-h-[44px] ${
                      cancellingChains.has(chainSlug)
                        ? 'border-gray-300 text-gray-400 bg-gray-50 cursor-not-allowed'
                        : 'border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700'
                    }`}
                  >
                    {cancellingChains.has(chainSlug) ? 'Stopping...' : 'Stop'}
                  </button>
                )}
              </div>

              {/* T3: Live DB state bar — approximate row counts for chain tables */}
              {liveTableCounts && Object.keys(liveTableCounts).length > 0 && (() => {
                // Collect unique target tables for this chain's steps
                const chainTables = new Set<string>();
                // Use shared constant — see src/lib/admin/funnel.ts
                for (const step of chain.steps) {
                  const table = PIPELINE_TABLE_MAP[step.slug];
                  if (table && liveTableCounts[table] != null) chainTables.add(table);
                }
                if (chainTables.size === 0) return null;
                return (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1.5 px-1">
                    {[...chainTables].map((t) => (
                      <span key={t} className="text-[9px] text-gray-400 tabular-nums">
                        <span className="text-gray-500 font-medium">{t}</span>{' '}
                        {compactNum(liveTableCounts[t])}
                      </span>
                    ))}
                  </div>
                );
              })()}

              {/* Chain Completion Report — aggregated DB impact + per-step summary */}
              {(() => {
                const chainInfo = pipelineLastRun[chainSlug];
                const chainDone = chainInfo?.status === 'completed' || chainInfo?.status === 'completed_with_warnings' || chainInfo?.status === 'completed_with_errors';
                if (!chainInfo || !chainDone || isChainRunning) return null;
                const chainStartMs = chainInfo.last_run_at ? new Date(chainInfo.last_run_at).getTime() : 0;
                // Aggregate T2 pg_stats for legacy badge fallback (chains without audit_tables)
                let totalIns = 0;
                let totalUpd = 0;
                // Build per-step summary data
                const stepRows: { label: string; slug: string; ranThisChain: boolean; duration_ms: number | null; verdict: string | null }[] = [];
                for (const step of chain.steps) {
                  const scopedKey = `${chain.id}:${step.slug}`;
                  const stepInfo = pipelineLastRun[scopedKey];
                  const stepStartMs = stepInfo?.last_run_at ? new Date(stepInfo.last_run_at).getTime() : 0;
                  const ranThisChain = stepStartMs >= chainStartMs && chainStartMs > 0;
                  const auditVerdict = ranThisChain
                    ? ((stepInfo?.records_meta as Record<string, unknown>)?.audit_table as { verdict?: string } | undefined)?.verdict ?? null
                    : null;
                  stepRows.push({
                    label: PIPELINE_REGISTRY[step.slug]?.name ?? step.slug,
                    slug: step.slug,
                    ranThisChain,
                    duration_ms: ranThisChain ? (stepInfo?.duration_ms ?? null) : null,
                    verdict: auditVerdict,
                  });
                  const telemetry = (stepInfo?.records_meta as Record<string, unknown>)?.telemetry as TelemetryData | undefined;
                  if (telemetry?.pg_stats) {
                    for (const stats of Object.values(telemetry.pg_stats)) {
                      totalIns += stats.ins ?? 0;
                      totalUpd += stats.upd ?? 0;
                    }
                  }
                }
                return (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-2">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="text-[10px] font-semibold text-green-700 uppercase tracking-wider">
                        {chain.label} Completed
                      </span>
                      <span className="text-[10px] tabular-nums text-gray-600">
                        {formatDuration(chainInfo.duration_ms)}
                      </span>
                      {/* Audit verdict summary — show worst verdict across all steps */}
                      {(() => {
                        const verdicts = stepRows.map(s => s.verdict).filter(Boolean) as string[];
                        if (verdicts.length === 0) {
                          // No audit_tables — fall back to legacy badges
                          return <>
                            {totalIns > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium tabular-nums">+{totalIns.toLocaleString()} inserted</span>}
                            {totalUpd > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium tabular-nums">{totalUpd.toLocaleString()} updated</span>}
                          </>;
                        }
                        const hasFail = verdicts.includes('FAIL');
                        const hasWarn = verdicts.includes('WARN');
                        const label = hasFail ? 'FAIL' : hasWarn ? 'WARN' : 'PASS';
                        const cls = hasFail ? 'bg-red-100 text-red-700' : hasWarn ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700';
                        return <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${cls}`}>{label}</span>;
                      })()}
                    </div>
                    {/* Per-step breakdown */}
                    <div className="mt-2 flex flex-col gap-0.5">
                      {stepRows.map((s, i) => (
                        <div key={s.slug} className="flex items-center gap-2 text-[9px] tabular-nums">
                          <span className="text-gray-400 w-3 text-right">{i + 1}</span>
                          {s.ranThisChain ? (
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              s.verdict === 'FAIL' ? 'bg-red-500'
                              : s.verdict === 'WARN' ? 'bg-amber-500'
                              : 'bg-green-500'
                            }`} />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                          )}
                          <span className={`flex-1 min-w-0 truncate ${s.ranThisChain ? 'text-gray-700' : 'text-gray-400'}`}>
                            {s.label}
                          </span>
                          {s.ranThisChain ? (
                            <>
                              {s.verdict ? (
                                <span className={`text-[8px] px-1 py-0.5 rounded font-semibold ${
                                  s.verdict === 'PASS' ? 'bg-green-50 text-green-600' :
                                  s.verdict === 'WARN' ? 'bg-yellow-50 text-yellow-600' :
                                  s.verdict === 'FAIL' ? 'bg-red-50 text-red-600' :
                                  'text-gray-400'
                                }`}>{s.verdict}</span>
                              ) : (
                                <span className="text-gray-400">&mdash;</span>
                              )}
                              <span className="text-gray-400 w-12 text-right">{formatDuration(s.duration_ms)}</span>
                            </>
                          ) : (
                            <span className="text-gray-400 italic">Skipped</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Chain steps — each pipeline gets its own tile */}
              <div className="space-y-2">
                {(() => {
                  // Chain start time — used to distinguish "completed in THIS run" vs stale previous-run data.
                  // If chain is running but last_run_at hasn't appeared in polling yet, use
                  // current time so all prior steps are treated as stale (pending).
                  const chainInfo = pipelineLastRun[chainSlug];
                  const chainStartedAt = chainInfo?.last_run_at
                    ? new Date(chainInfo.last_run_at).getTime()
                    : (isChainRunning ? Date.now() : 0);

                  return chain.steps.map((step, i) => {
                  const entry = PIPELINE_REGISTRY[step.slug];
                  // Use chain-scoped status key (e.g. permits:assert_schema) so
                  // shared steps don't bleed status across unrelated chains.
                  const scopedKey = `${chain.id}:${step.slug}`;
                  const info = pipelineLastRun[scopedKey];
                  const isRunning = runningPipelines.has(scopedKey);
                  const isDisabled = isEffectivelyDisabled(step.slug);
                  // When the parent chain is running but this step hasn't started yet,
                  // show "Pending" instead of stale last-run status (fixes green-stays-green).
                  // A step is only "done in this run" if its last_run_at >= the chain's
                  // start time. Otherwise the completed/failed status is from a previous run.
                  const stepRanAt = info?.last_run_at ? new Date(info.last_run_at).getTime() : 0;
                  const stepDoneThisRun = (info?.status === 'completed' || info?.status === 'completed_with_warnings' || info?.status === 'completed_with_errors' || info?.status === 'failed') && stepRanAt >= chainStartedAt;
                  const isPending = isChainRunning && !isRunning && !stepDoneThisRun;
                  const stepGroup = PIPELINE_REGISTRY[step.slug]?.group;
                  const dot = isDisabled
                    ? { color: '', label: 'Disabled' }
                    : isPending
                    ? { color: '', label: 'Pending' }
                    : getStatusDot(info, isRunning);
                  const freshness = isDisabled || isPending ? null : getFreshnessBadge(info, isRunning);
                  const stepNum = stepNumbers[i];
                  const isRoot = step.indent === 0;

                  const funnelRow = funnelData?.[step.slug];
                  const expandKey = `${chain.id}-${step.slug}`;
                  const isExpanded = expandedSteps.has(expandKey);

                  // Full-tile status coloring — direct from DB status + audit verdict
                  const tileFlash = dot.label === 'Failed'
                    ? 'tile-flash-stale border-red-400'
                    : dot.label === 'Warnings'
                    ? 'border-yellow-400'
                    : dot.label === 'Running'
                    ? 'tile-flash-running border-blue-300'
                    : freshness?.text === 'Aging'
                    ? 'tile-flash-warning border-yellow-400'
                    : freshness?.text === 'Overdue'
                    ? 'tile-flash-overdue border-purple-400'
                    : '';

                  // Status background — full tile coloring replaces status dots
                  const statusBg = dot.color;

                  // Parent-child indentation: entire tile box shifts right
                  const indentCls = step.indent === 1 ? 'ml-6' : step.indent >= 2 ? 'ml-12' : '';
                  const borderCls = tileFlash || 'border-gray-200';

                  return (
                    <div key={expandKey} className={`pipeline-tile group border rounded-lg ${indentCls} ${statusBg} ${borderCls} ${isDisabled ? 'opacity-60' : ''}`}>

                      {/* Row content — mobile-first: wraps on small screens, inline on md+ */}
                      <div className="flex flex-wrap md:flex-nowrap items-center gap-2 px-3 py-2">
                        {/* Primary zone: step number badge + name */}
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Bold step number badge */}
                          {stepNum && (
                            <span className="text-[10px] font-bold tabular-nums shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 text-gray-700">
                              {stepNum}
                            </span>
                          )}

                          {/* Pipeline name */}
                          <span
                            className={`text-xs truncate ${
                              isDisabled
                                ? 'text-gray-300 line-through'
                                : isRoot
                                ? 'text-gray-800 font-medium'
                                : step.indent >= 2
                                ? 'text-gray-400 text-[10px]'
                                : 'text-gray-600'
                            }`}
                            title={entry?.name ?? step.slug}
                          >
                            {entry?.name ?? step.slug}
                          </span>

                          {/* Circular percentage badge — prefer audit_table metric over funnel matchPct */}
                          {funnelRow && (() => {
                            const funnelSrc = FUNNEL_SOURCE_BY_SLUG[step.slug];
                            if (funnelSrc?.auditMetric && info?.records_meta) {
                              const at = (info.records_meta as Record<string, unknown>)?.audit_table as
                                { rows?: Array<{ metric: string; value: unknown }> } | undefined;
                              const row = at?.rows?.find(r => r.metric === funnelSrc.auditMetric);
                              if (row?.value != null) {
                                const parsed = parseFloat(String(row.value).replace('%', ''));
                                if (!isNaN(parsed)) return <CircularBadge pct={parsed} />;
                              }
                            }
                            return <CircularBadge pct={funnelRow.matchPct} />;
                          })()}
                        </div>

                        {/* Flexible spacer */}
                        <div className="flex-1 hidden md:block" />

                        {/* Right-aligned telemetry column */}
                        <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">

                          {/* Records summary */}
                          {!isRunning && info?.records_total != null && info.records_total > 0 && (
                            <span className="text-[9px] text-gray-400 tabular-nums shrink-0" title={`${info.records_total} total / ${info.records_new ?? 0} new / ${info.records_updated ?? 0} updated`}>
                              {info.records_total.toLocaleString()}
                              {(info.records_new ?? 0) > 0 && <span className="text-green-500"> +{info.records_new}</span>}
                            </span>
                          )}

                          {/* Duration */}
                          {!isRunning && info?.duration_ms != null && (
                            <span className="text-[9px] text-gray-400 tabular-nums shrink-0">
                              {formatDuration(info.duration_ms)}
                            </span>
                          )}

                          {/* Status badge */}
                          {isRunning && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">
                              Running
                            </span>
                          )}
                          {!isRunning && info?.status === 'failed' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setErrorPopover(errorPopover === step.slug ? null : step.slug);
                              }}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium hover:bg-red-200 relative"
                            >
                              Failed
                              {errorPopover === step.slug && info.error_message && (
                                <div className="absolute z-20 right-0 top-6 w-72 bg-white border border-red-200 rounded-lg shadow-lg p-3 text-left">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-semibold text-red-700">Error Details</span>
                                    <button onClick={(ev) => { ev.stopPropagation(); setErrorPopover(null); }} className="text-gray-400 hover:text-gray-600 text-xs">&times;</button>
                                  </div>
                                  <pre className="text-[9px] text-gray-600 whitespace-pre-wrap break-words max-h-40 overflow-y-auto font-mono">{info.error_message}</pre>
                                </div>
                              )}
                            </button>
                          )}

                          {/* Freshness badge — decoupled from status dot */}
                          {freshness && (
                            <span className={`text-[8px] px-1 py-0.5 rounded border font-medium shrink-0 ${freshness.cls}`}>
                              {freshness.text}
                            </span>
                          )}

                          {/* T5 Sparkline — last 10 runs trend (hidden on mobile) */}
                          {!isRunning && sparklineCache.current.has(step.slug) && (
                            <Sparkline runs={sparklineCache.current.get(step.slug)!} />
                          )}

                          {/* SLA badge */}
                          {!isRunning && slaTargets && slaTargets[step.slug] && info?.last_run_at && (() => {
                            const hoursSince = (Date.now() - new Date(info.last_run_at).getTime()) / (1000 * 60 * 60);
                            return hoursSince > slaTargets[step.slug] ? (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-red-100 text-red-600 font-semibold shrink-0">SLA</span>
                            ) : null;
                          })()}

                          {/* Update status with clock icon (update-status) */}
                          <span
                            className="update-status flex items-center gap-1 text-[10px] text-gray-500 shrink-0 tabular-nums"
                            title={formatDate(info?.last_run_at ?? null)}
                          >
                            <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {timeAgo(info?.last_run_at ?? null)}
                          </span>

                          {/* Hover-hidden controls: visible on mobile, fade-in on desktop hover */}
                          <div className="flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            {/* Run button — hidden for infrastructure steps */}
                            {!NON_TOGGLEABLE_SLUGS.has(step.slug) && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRun(step.slug); }}
                                disabled={isRunning || isDisabled}
                                className={`text-[9px] px-2.5 py-1 rounded border min-h-[44px] ${
                                  isRunning
                                    ? 'border-blue-200 text-blue-400 cursor-not-allowed'
                                    : isDisabled
                                    ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                                    : 'border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                                }`}
                              >
                                <span className="hidden md:inline">Run</span>
                                <span className="md:hidden">&#9654;</span>
                              </button>
                            )}

                            {/* Toggle switch — hidden for infrastructure steps */}
                            {onToggle && !NON_TOGGLEABLE_SLUGS.has(step.slug) && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleToggle(step.slug, isDisabled); }}
                                className="min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                                title={isDisabled ? `Enable ${entry?.name ?? step.slug}` : `Disable ${entry?.name ?? step.slug}`}
                                aria-label={isDisabled ? `Enable ${entry?.name ?? step.slug}` : `Disable ${entry?.name ?? step.slug}`}
                              >
                                <div className={`relative w-7 h-4 rounded-full transition-colors ${isDisabled ? 'bg-gray-300' : 'bg-green-500'}`}>
                                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${isDisabled ? 'left-0.5' : 'left-3.5'}`} />
                                </div>
                              </button>
                            )}
                          </div>

                          {/* Drill-down expand chevron — always visible */}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleExpand(expandKey); }}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                            title={isExpanded ? 'Collapse details' : 'Expand details'}
                            aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                          >
                            <svg
                              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      </div>

                    {/* Universal drill-down accordion panel */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-3">
                        {/* Universal status summary — always visible for every step */}
                        <div className="drilldown-status-bar flex flex-wrap items-center gap-4 text-xs py-1">
                          <span className="flex items-center gap-1.5">
                            <span className={`inline-block w-2 h-2 rounded-full ${
                              (() => {
                                if (!info) return 'bg-gray-300';
                                // Override with audit verdict when step completed
                                if (info.status === 'completed') {
                                  const v = (info.records_meta as Record<string, unknown> | null)
                                    ?.audit_table as { verdict?: string } | undefined;
                                  if (v?.verdict === 'FAIL') return 'bg-red-500';
                                  if (v?.verdict === 'WARN') return 'bg-amber-500';
                                  return 'bg-green-500';
                                }
                                if (info.status === 'completed_with_warnings') return 'bg-amber-500';
                                if (info.status === 'completed_with_errors') return 'bg-red-500';
                                if (info.status === 'failed') return 'bg-red-500';
                                if (info.status === 'running') return 'bg-blue-500';
                                if (info.status === 'skipped') return 'bg-gray-400';
                                if (info.status === 'cancelled') return 'bg-orange-400';
                                return 'bg-gray-400';
                              })()
                            }`} />
                            <span className={`font-semibold ${
                              !info ? 'text-gray-400'
                              : info.status === 'completed' ? 'text-green-700'
                              : info.status === 'completed_with_warnings' ? 'text-amber-700'
                              : info.status === 'completed_with_errors' ? 'text-red-600'
                              : info.status === 'failed' ? 'text-red-600'
                              : info.status === 'running' ? 'text-blue-600'
                              : info.status === 'skipped' ? 'text-gray-500'
                              : info.status === 'cancelled' ? 'text-orange-600'
                              : 'text-gray-500'
                            }`}>
                              {info?.status ?? 'Never run'}
                            </span>
                          </span>
                          {info?.last_run_at && (
                            <span className="text-gray-500">{timeAgo(info.last_run_at)}</span>
                          )}
                          {info?.duration_ms != null && (
                            <span className="text-gray-400 tabular-nums">{formatDuration(info.duration_ms)}</span>
                          )}
                          {info?.error_message && (
                            <span className="text-red-500 text-[10px] truncate max-w-[300px]" title={info.error_message}>
                              {info.error_message}
                            </span>
                          )}
                        </div>

                        {/* Description tile — source → target data flow + telemetry */}
                        {STEP_DESCRIPTIONS[step.slug] && (
                          <DataFlowTile
                            desc={STEP_DESCRIPTIONS[step.slug]}
                            dbSchemaMap={dbSchemaMap}
                            // SAFETY: records_meta is JSONB (Record<string, unknown> | null), pipeline_meta is a known sub-key
                            pipelineMeta={(info?.records_meta as Record<string, unknown>)?.pipeline_meta as import('./funnel/FunnelPanels').PipelineMeta | undefined}
                          />
                        )}

                        {/* Performance Metrics tile (non-funnel steps) — self-reported PIPELINE_SUMMARY values */}
                        {!funnelRow && (() => {
                          const stepExpected = STEP_EXPECTED_RANGES[step.slug];
                          const summaryRanges = stepExpected?.summary;
                          const rangeBadge = (value: number, range?: [number, number]) => {
                            if (!range) return null;
                            const status = getRangeStatus(value, range);
                            const cls = status === 'normal' ? 'bg-green-50 text-green-600' : status === 'borderline' ? 'bg-yellow-50 text-yellow-600' : 'bg-red-50 text-red-600';
                            const icon = status === 'normal' ? '\u2713' : status === 'borderline' ? '\u26A0' : '\u2717';
                            return <span className={`text-[7px] px-1 py-0.5 rounded font-medium ml-1 ${cls}`} title={`Expected: ${range[0].toLocaleString()}–${range[1].toLocaleString()}`}>{icon}</span>;
                          };
                          return (
                          <div className="accordion-tile bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                            <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Performance Metrics</h4>
                            {stepExpected?.behavior && (
                              <p className="text-[8px] text-violet-500 leading-snug italic mb-2">{stepExpected.behavior}</p>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              {info?.error_message && (
                                <div>
                                  <span className="text-xs text-gray-600">Error</span>
                                  <pre className="text-[9px] text-red-600 whitespace-pre-wrap break-words max-h-24 overflow-y-auto font-mono mt-0.5">{info.error_message}</pre>
                                </div>
                              )}
                              {/* Hide records_total/records_new when audit_table present (redundant), or for quality/snapshot steps */}
                              {info && stepGroup !== 'quality' && stepGroup !== 'snapshot' && !((info.records_meta as Record<string, unknown> | null)?.audit_table) && (info.records_total != null || info.records_new != null) && (
                                <div className="space-y-1.5">
                                  {info.records_total != null && (
                                    <div className="flex justify-between items-center">
                                      <span className="text-xs text-gray-600">Total Processed</span>
                                      <span className="text-xs font-semibold text-gray-900 tabular-nums">{info.records_total.toLocaleString()}{rangeBadge(info.records_total, summaryRanges?.records_total)}</span>
                                    </div>
                                  )}
                                  {info.records_new != null && (
                                    <div>
                                      <div className="flex justify-between items-center">
                                        <span className="text-xs text-gray-600">New / Changed</span>
                                        <span className="text-xs font-semibold text-green-700 tabular-nums">{info.records_new.toLocaleString()}{rangeBadge(info.records_new, summaryRanges?.records_new)}</span>
                                      </div>
                                      {info.records_new === 0 && info.records_total != null && info.records_total > 0 && (
                                        <p className="text-[9px] text-gray-400 mt-0.5">No changes — source data unchanged since last run</p>
                                      )}
                                    </div>
                                  )}
                                  {info.records_updated != null && info.records_updated > 0 && (
                                    <div className="flex justify-between items-center">
                                      <span className="text-xs text-gray-600">Updated</span>
                                      <span className="text-xs font-semibold text-blue-700 tabular-nums">{info.records_updated.toLocaleString()}{rangeBadge(info.records_updated, summaryRanges?.records_updated)}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* records_meta — CQA check results and other structured metadata */}
                              {/* Verdict banner: show STEP FAILED when status is failed but no records_meta */}
                              {(stepGroup === 'quality') && info?.status === 'failed' && (!info?.records_meta || typeof info.records_meta !== 'object') && (
                                <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs font-semibold bg-red-50 text-red-700">
                                  <span>{'\u2718'}</span>
                                  <span>STEP FAILED</span>
                                </div>
                              )}
                              {info?.records_meta && typeof info.records_meta === 'object' && (() => {
                                const meta = info.records_meta as Record<string, unknown>;
                                const failed = (meta.checks_failed as number) ?? 0;
                                const warned = (meta.checks_warned as number) ?? 0;
                                const errCount = (typeof meta.errors === 'number' ? meta.errors : Array.isArray(meta.errors) ? (meta.errors as string[]).length : 0);
                                const hasFailures = failed > 0 || errCount > 0 || info?.status === 'failed';
                                const warningsList: string[] = Array.isArray(meta.warnings) ? meta.warnings as string[] : [];
                                const errorsList: string[] = Array.isArray(meta.errors) ? meta.errors as string[] : [];
                                const hasAuditTable = !!(meta.audit_table && typeof meta.audit_table === 'object');
                                return (
                                  <div className="space-y-1.5">
                                    {/* Old CQA verdict/scalars — hidden when audit_table replaces them */}
                                    {!hasAuditTable && <>
                                    {/* Verdict banner for CQA steps */}
                                    {(stepGroup === 'quality') && (
                                      <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs font-semibold ${
                                        hasFailures ? 'bg-red-50 text-red-700' : warned > 0 ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700'
                                      }`}>
                                        <span>{hasFailures ? '\u2718' : '\u2714'}</span>
                                        <span>{hasFailures ? `FAILED \u2014 ${failed + errCount} check${(failed + errCount) !== 1 ? 's' : ''} failed` : warned > 0 ? `PASSED with ${warned} warning${warned !== 1 ? 's' : ''}` : 'ALL CHECKS PASSED'}</span>
                                      </div>
                                    )}
                                    {/* Individual error details */}
                                    {errorsList.length > 0 && (
                                      <div className="space-y-1">
                                        {errorsList.map((err, i) => (
                                          <div key={`err-${i}`} className="flex items-start gap-1.5 px-2 py-1 rounded bg-red-50 text-red-700">
                                            <span className="text-[10px] mt-0.5 shrink-0">{'\u2718'}</span>
                                            <span className="text-[10px] break-words">{err}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {/* Individual warning details */}
                                    {warningsList.length > 0 && (
                                      <div className="space-y-1">
                                        {warningsList.map((w: string, i: number) => (
                                          <div key={`warn-${i}`} className="flex items-start gap-1.5 px-2 py-1 rounded bg-amber-50 text-amber-700">
                                            <span className="text-[10px] mt-0.5 shrink-0">{'\u26A0'}</span>
                                            <span className="text-[10px] break-words">{w}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {/* Scalar metadata (counts, labels) */}
                                    {Object.entries(meta)
                                      .filter(([k, v]) => v != null && v !== undefined && k !== 'pipeline_meta' && k !== 'warnings' && k !== 'errors' && k !== 'engine_health' && k !== 'audit_table' && typeof v !== 'object')
                                      .map(([key, value]) => (
                                        <div key={key} className="flex justify-between">
                                          <span className="text-xs text-gray-600">{key.replace(/_/g, ' ')}</span>
                                          <span className={`text-xs font-semibold tabular-nums ${
                                            key.includes('failed') && (value as number) > 0 ? 'text-red-600'
                                            : key.includes('warned') && (value as number) > 0 ? 'text-yellow-600'
                                            : 'text-gray-900'
                                          }`}>
                                            {String(value)}
                                          </span>
                                        </div>
                                      ))}
                                    </>}
                                    {/* Engine health compact table (for assert_engine_health) — hidden when audit_table present */}
                                    {!hasAuditTable && Array.isArray(meta.engine_health) && (meta.engine_health as Array<Record<string, unknown>>).length > 0 && (
                                      <div className="mt-2">
                                        <h5 className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Engine Health</h5>
                                        <div className="overflow-x-auto">
                                          <table className="w-full text-[10px] tabular-nums">
                                            <thead>
                                              <tr className="text-gray-500 text-left">
                                                <th className="pr-2 py-0.5 font-medium">Table</th>
                                                <th className="px-2 py-0.5 font-medium text-right">Live</th>
                                                <th className="px-2 py-0.5 font-medium text-right">Dead %</th>
                                                <th className="px-2 py-0.5 font-medium text-right">Seq %</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {(meta.engine_health as Array<{table_name: string; n_live_tup: number; dead_ratio: number; seq_ratio: number; n_dead_tup: number}>).map((t) => (
                                                <tr key={t.table_name} className="border-t border-gray-50">
                                                  <td className="pr-2 py-0.5 font-mono text-gray-700">{t.table_name}</td>
                                                  <td className="px-2 py-0.5 text-right text-gray-600">{t.n_live_tup.toLocaleString()}</td>
                                                  <td className={`px-2 py-0.5 text-right font-medium ${t.dead_ratio > 0.10 ? 'text-amber-700' : 'text-gray-500'}`}>
                                                    {(t.dead_ratio * 100).toFixed(1)}%
                                                  </td>
                                                  <td className={`px-2 py-0.5 text-right font-medium ${t.n_live_tup >= 10000 && t.seq_ratio > 0.80 ? 'text-amber-700' : 'text-gray-500'}`}>
                                                    {(t.seq_ratio * 100).toFixed(1)}%
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )}
                                    {/* Audit table — chain-aware, single audit_table key per step */}
                                    {!!(meta.audit_table && typeof meta.audit_table === 'object') && (() => {
                                      const atRaw = meta.audit_table; const atIdx = 0;
                                      if (!atRaw || typeof atRaw !== 'object') return null;
                                      const at = atRaw as { phase: number; name: string; verdict: string; rows: Array<{ metric: string; value: unknown; threshold: string | null; status: string }> };
                                      const verdictColor = at.verdict === 'PASS' ? 'bg-green-50 text-green-700 border-green-200'
                                        : at.verdict === 'FAIL' ? 'bg-red-50 text-red-700 border-red-200'
                                        : at.verdict === 'WARN' ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                        : 'bg-gray-50 text-gray-500 border-gray-200';
                                      const statusIcon = (s: string) => s === 'PASS' ? '\u2714' : s === 'FAIL' ? '\u2718' : s === 'WARN' ? '\u26A0' : s === 'SKIP' ? '\u2014' : '\u2022';
                                      const statusColor = (s: string) => s === 'PASS' ? 'text-green-600' : s === 'FAIL' ? 'text-red-600' : s === 'WARN' ? 'text-yellow-600' : 'text-gray-400';
                                      const infoRows = at.rows.filter((r) => r.metric === 'reason' || r.metric === 'instructions');
                                      const metricRows = at.rows.filter((r) => r.metric !== 'reason' && r.metric !== 'instructions');
                                      return (
                                        <div key={`audit-${atIdx}`} className="mt-2">
                                          <div className="flex items-center gap-2 mb-1">
                                            <h5 className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Phase {at.phase}: {at.name}</h5>
                                            <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded border ${verdictColor}`}>{at.verdict}</span>
                                          </div>
                                          {infoRows.length > 0 && (
                                            <div className="space-y-1 mb-2">
                                              {infoRows.map((r) => (
                                                <div key={r.metric} className={`flex items-start gap-2 px-2.5 py-1.5 rounded text-[10px] ${
                                                  r.metric === 'instructions' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-50 text-gray-600'
                                                }`}>
                                                  <span className="shrink-0 mt-0.5">{r.metric === 'instructions' ? '\u2139' : '\u25B8'}</span>
                                                  <span className="break-words">{String(r.value)}</span>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                          {metricRows.length > 0 && (
                                          <div className="overflow-x-auto">
                                            <table className="w-full text-[10px] tabular-nums">
                                              <thead>
                                                <tr className="text-gray-500 text-left">
                                                  <th className="pr-2 py-0.5 font-medium">Metric</th>
                                                  <th className="px-2 py-0.5 font-medium text-right">Value</th>
                                                  <th className="px-2 py-0.5 font-medium text-right">Threshold</th>
                                                  <th className="px-2 py-0.5 font-medium text-center">Status</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {metricRows.map((r) => (
                                                  <tr key={r.metric} className="border-t border-gray-50">
                                                    <td className="pr-2 py-0.5 font-mono text-gray-700">{r.metric}</td>
                                                    <td className="px-2 py-0.5 text-right text-gray-900 font-medium">{r.value === null ? '\u2014' : typeof r.value === 'boolean' ? String(r.value) : typeof r.value === 'number' ? r.value.toLocaleString() : String(r.value)}</td>
                                                    <td className="px-2 py-0.5 text-right text-gray-400">{r.threshold ?? '\u2014'}</td>
                                                    <td className={`px-2 py-0.5 text-center font-semibold ${statusColor(r.status)}`}>{statusIcon(r.status)}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                          )}
                                        </div>
                                      );
                                    })()}
                                    {/* DB State Changes — telemetry rendered after audit table */}
                                    {(() => {
                                      const telemetry = (info?.records_meta as Record<string, unknown>)?.telemetry as TelemetryData | undefined;
                                      if (!telemetry) return null;
                                      return <TelemetrySection telemetry={telemetry} stepSlug={step.slug} />;
                                    })()}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                          );
                        })()}

                        {/* Audit table for funnel steps — Performance Metrics is hidden by !funnelRow, so render separately */}
                        {funnelRow && info?.records_meta && typeof info.records_meta === 'object' && (() => {
                          const meta = info.records_meta as Record<string, unknown>;
                          const tables = [meta.audit_table].filter(Boolean);
                          if (tables.length === 0) return null;
                          const statusIcon = (s: string) => s === 'PASS' ? '\u2714' : s === 'FAIL' ? '\u2718' : s === 'WARN' ? '\u26A0' : s === 'SKIP' ? '\u2014' : '\u2022';
                          const statusColor = (s: string) => s === 'PASS' ? 'text-green-600' : s === 'FAIL' ? 'text-red-600' : s === 'WARN' ? 'text-yellow-600' : 'text-gray-400';
                          return (
                            <div className="accordion-tile bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                              <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Performance Metrics</h4>
                              {tables.map((atRaw, atIdx) => {
                                if (!atRaw || typeof atRaw !== 'object') return null;
                                const at = atRaw as { phase: number; name: string; verdict: string; rows: Array<{ metric: string; value: unknown; threshold: string | null; status: string }> };
                                const verdictColor = at.verdict === 'PASS' ? 'bg-green-50 text-green-700 border-green-200'
                                  : at.verdict === 'FAIL' ? 'bg-red-50 text-red-700 border-red-200'
                                  : at.verdict === 'WARN' ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                  : 'bg-gray-50 text-gray-500 border-gray-200';
                                const funnelInfoRows = at.rows.filter((r) => r.metric === 'reason' || r.metric === 'instructions');
                                const funnelMetricRows = at.rows.filter((r) => r.metric !== 'reason' && r.metric !== 'instructions');
                                return (
                                  <div key={`funnel-audit-${atIdx}`} className="mt-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <h5 className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Phase {at.phase}: {at.name}</h5>
                                      <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded border ${verdictColor}`}>{at.verdict}</span>
                                    </div>
                                    {funnelInfoRows.length > 0 && (
                                      <div className="space-y-1 mb-2">
                                        {funnelInfoRows.map((r) => (
                                          <div key={r.metric} className={`flex items-start gap-2 px-2.5 py-1.5 rounded text-[10px] ${
                                            r.metric === 'instructions' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-50 text-gray-600'
                                          }`}>
                                            <span className="shrink-0 mt-0.5">{r.metric === 'instructions' ? '\u2139' : '\u25B8'}</span>
                                            <span className="break-words">{String(r.value)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {funnelMetricRows.length > 0 && (
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-[10px] tabular-nums">
                                        <thead><tr className="text-gray-500 text-left">
                                          <th className="pr-2 py-0.5 font-medium">Metric</th>
                                          <th className="px-2 py-0.5 font-medium text-right">Value</th>
                                          <th className="px-2 py-0.5 font-medium text-right">Threshold</th>
                                          <th className="px-2 py-0.5 font-medium text-center">Status</th>
                                        </tr></thead>
                                        <tbody>
                                          {funnelMetricRows.map((r) => (
                                            <tr key={r.metric} className="border-t border-gray-50">
                                              <td className="pr-2 py-0.5 font-mono text-gray-700">{r.metric}</td>
                                              <td className="px-2 py-0.5 text-right text-gray-900 font-medium">{r.value === null ? '\u2014' : typeof r.value === 'boolean' ? String(r.value) : typeof r.value === 'number' ? r.value.toLocaleString() : String(r.value)}</td>
                                              <td className="px-2 py-0.5 text-right text-gray-400">{r.threshold ?? '\u2014'}</td>
                                              <td className={`px-2 py-0.5 text-center font-semibold ${statusColor(r.status)}`}>{statusIcon(r.status)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    )}
                                  </div>
                                );
                              })}
                              {/* DB State Changes — telemetry rendered after audit table */}
                              {(() => {
                                const telemetry = (info?.records_meta as Record<string, unknown>)?.telemetry as TelemetryData | undefined;
                                if (!telemetry) return null;
                                return <TelemetrySection telemetry={telemetry} stepSlug={step.slug} />;
                              })()}
                            </div>
                          );
                        })()}

                        {/* Footer metadata */}
                        <div className="drilldown-footer pt-2 border-t border-gray-200/60 flex flex-wrap items-center gap-4 text-[10px] text-gray-400">
                          {funnelRow ? (
                            <>
                              <span>Schedule: <span className="text-gray-600 font-medium">{funnelRow.cadence}</span></span>
                              <span>Last run: <span className="text-gray-600 font-medium">{timeAgo(funnelRow.lastUpdated)}</span></span>
                              {funnelRow.lastUpdated && (
                                <span>
                                  Status:{' '}
                                  <span className={`font-medium ${
                                    funnelRow.status === 'healthy' ? 'text-green-600' :
                                    funnelRow.status === 'warning' ? 'text-yellow-600' : 'text-red-500'
                                  }`}>
                                    {funnelRow.status === 'healthy' ? 'Healthy' : funnelRow.status === 'warning' ? 'Warning' : 'Stale'}
                                  </span>
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <span>Last run: <span className="text-gray-600 font-medium">{info?.last_run_at ? timeAgo(info.last_run_at) : 'Never'}</span></span>
                              <span>
                                Status:{' '}
                                <span className={`font-medium ${
                                  !info || !info.status ? 'text-gray-400' :
                                  info.status === 'completed' ? 'text-green-600' :
                                  info.status === 'failed' ? 'text-red-500' :
                                  info.status === 'running' ? 'text-blue-600' :
                                  info.status === 'skipped' ? 'text-gray-500' :
                                  info.status === 'cancelled' ? 'text-orange-500' : 'text-gray-500'
                                }`}>
                                  {info?.status ? info.status.charAt(0).toUpperCase() + info.status.slice(1) : 'Never run'}
                                </span>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    </div>
                  );
                }); })()}
              </div>

              {/* Chain error summary — last failure in this chain */}
              {(() => {
                const failedSteps = chain.steps
                  .map((s) => ({ slug: s.slug, info: pipelineLastRun[`${chain.id}:${s.slug}`] }))
                  .filter((s) => s.info?.status === 'failed' && s.info.error_message);
                const lastFailure = failedSteps[failedSteps.length - 1];
                if (!lastFailure) return null;
                const failEntry = PIPELINE_REGISTRY[lastFailure.slug];
                return (
                  <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                      <span className="text-[10px] font-semibold text-red-700">
                        Last failure: {failEntry?.name ?? lastFailure.slug}
                      </span>
                    </div>
                    <pre className="text-[9px] text-red-600 whitespace-pre-wrap break-words max-h-32 overflow-y-auto font-mono">
                      {lastFailure.info!.error_message}
                    </pre>
                  </div>
                );
              })()}

              {/* Inline trigger error — 409 conflict or other trigger failures */}
              {triggerError && triggerError.startsWith(`chain_${chain.id}:`) && (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-amber-700 font-medium">
                    {triggerError.replace(`chain_${chain.id}: `, '')}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
