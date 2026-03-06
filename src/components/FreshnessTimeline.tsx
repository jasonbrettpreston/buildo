'use client';

import { useState } from 'react';
import type { FunnelRowData } from '@/lib/admin/funnel';
import { STEP_DESCRIPTIONS } from '@/lib/admin/funnel';

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
  inspections:        { name: 'Inspection Stages',    group: 'link' },
  coa_documents:      { name: 'CoA Documents',        group: 'link' },
  // Classify (3) — derive fields
  classify_scope_class: { name: 'Scope Class',         group: 'classify' },
  classify_scope_tags:  { name: 'Scope Tags',          group: 'classify' },
  classify_permits:     { name: 'Classify Trades',     group: 'classify' },
  // Snapshot (1) — capture metrics
  refresh_snapshot:   { name: 'Refresh Snapshot',      group: 'snapshot' },
  // Quality (2) — CQA validation
  assert_schema:      { name: 'Schema Validation',    group: 'quality' },
  assert_data_bounds: { name: 'Data Quality Checks',  group: 'quality' },
};

export const GROUP_LABELS: Record<PipelineGroup, string> = {
  ingest: 'Ingest',
  link: 'Link',
  classify: 'Classify',
  snapshot: 'Snapshot',
  quality: 'Quality',
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
  // Group 1: Foundation (periodic reference data)
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
    ],
  },
  // Group 2: Core Ingestion (fast daily)
  {
    id: 'permits',
    label: 'Permits Pipeline',
    description: 'Daily — when building permits are loaded',
    steps: [
      { slug: 'assert_schema',       indent: 0 },
      { slug: 'permits',              indent: 0 },
      { slug: 'classify_scope_class', indent: 1 },
      { slug: 'classify_scope_tags',  indent: 1 },
      { slug: 'classify_permits',     indent: 1 },
      { slug: 'builders',             indent: 1 },
      { slug: 'link_wsib',            indent: 2 },
      { slug: 'geocode_permits',      indent: 1 },
      { slug: 'link_parcels',         indent: 1 },
      { slug: 'link_neighbourhoods',  indent: 1 },
      { slug: 'link_massing',         indent: 1 },
      { slug: 'link_similar',         indent: 1 },
      { slug: 'link_coa',             indent: 1 },
      { slug: 'refresh_snapshot',     indent: 1 },
      { slug: 'assert_data_bounds',   indent: 0 },
    ],
  },
  {
    id: 'coa',
    label: 'CoA Pipeline',
    description: 'Daily — when Committee of Adjustment data is loaded',
    steps: [
      { slug: 'assert_schema',      indent: 0 },
      { slug: 'coa',                indent: 0 },
      { slug: 'link_coa',           indent: 1 },
      { slug: 'create_pre_permits', indent: 1 },
      { slug: 'refresh_snapshot',   indent: 1 },
      { slug: 'assert_data_bounds', indent: 0 },
    ],
  },
  // Group 3: Corporate Entities Enrichment (slow daily scrapes)
  {
    id: 'entities',
    label: 'Corporate Entities Pipeline',
    description: 'Daily — missing contact enrichment via web scraping',
    steps: [
      { slug: 'enrich_wsib_builders',  indent: 0 },
      { slug: 'enrich_named_builders', indent: 0 },
    ],
  },
  // Group 4: Deep Scrapes & Documents (continuous async workers)
  {
    id: 'deep_scrapes',
    label: 'Deep Scrapes & Documents',
    description: 'Continuous — headless browser scraping & document retrieval',
    comingSoon: true,
    steps: [
      { slug: 'inspections',    indent: 0 },
      { slug: 'coa_documents',  indent: 0 },
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

function getStatusDot(info: PipelineRunInfo | undefined, isRunning: boolean): { color: string; label: string } {
  if (isRunning) return { color: 'bg-blue-400 animate-pulse', label: 'Running' };
  if (!info || !info.last_run_at) return { color: 'bg-gray-300', label: 'Never run' };
  if (info.status === 'failed') return { color: 'bg-red-500', label: 'Failed' };

  const hours = (Date.now() - new Date(info.last_run_at).getTime()) / (1000 * 60 * 60);
  if (hours < 24) return { color: 'bg-green-500', label: 'Fresh' };
  if (hours < 72) return { color: 'bg-blue-500', label: 'Recent' };
  if (hours < 168) return { color: 'bg-yellow-500', label: 'Aging' };
  return { color: 'bg-red-500', label: 'Stale' };
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
// Funnel accordion panels (inline, no separate component file)
// ---------------------------------------------------------------------------

function FunnelAllTimePanel({ row }: { row: FunnelRowData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Zone 2: Baseline */}
      <div>
        <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Baseline</h4>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-xs text-gray-600">{row.baselineLabel}</span>
            <span className="text-xs font-semibold text-gray-900 tabular-nums">{row.baselineTotal.toLocaleString()}</span>
          </div>
          {row.targetPool !== null && (
            <div className="flex justify-between">
              <span className="text-xs text-gray-600">{row.targetPoolLabel}</span>
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{row.targetPool.toLocaleString()}</span>
            </div>
          )}
          {row.baselineNullRates.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-200/60">
              <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Null Rates</p>
              {row.baselineNullRates.map((nr) => (
                <div key={nr.field} className="flex justify-between">
                  <span className="text-[11px] text-gray-500">{nr.field}</span>
                  <span className={`text-[11px] font-medium tabular-nums ${nr.pct > 20 ? 'text-red-500' : nr.pct > 5 ? 'text-yellow-600' : 'text-green-600'}`}>{nr.pct}% null</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Zone 3: Intersection */}
      <div>
        <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Intersection</h4>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-xs text-gray-600">{row.matchDenominatorLabel}</span>
            <span className="text-xs font-semibold text-gray-900 tabular-nums">{row.matchDenominator.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-gray-600">Matched</span>
            <span className="text-xs font-semibold text-green-700 tabular-nums">{row.matchCount.toLocaleString()} ({row.matchPct}%)</span>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200/60">
            <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Sub-Tiers</p>
            {row.matchTiers.map((tier) => (
              <div key={tier.label} className="flex justify-between">
                <span className="text-[11px] text-gray-500">{tier.label}</span>
                <span className="text-[11px] font-medium text-gray-700 tabular-nums">{tier.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Zone 4: Yield */}
      <div>
        <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Yield</h4>
        <div className="space-y-1.5">
          {row.yieldCounts.map((y) => (
            <div key={y.field} className="flex justify-between">
              <span className="text-xs text-gray-600">{y.field}</span>
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{y.count.toLocaleString()}</span>
            </div>
          ))}
          {row.yieldNullRates.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-200/60">
              <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Yield Null Rates</p>
              {row.yieldNullRates.map((nr) => (
                <div key={nr.field} className="flex justify-between">
                  <span className="text-[11px] text-gray-500">{nr.field}</span>
                  <span className={`text-[11px] font-medium tabular-nums ${nr.pct > 20 ? 'text-red-500' : nr.pct > 5 ? 'text-yellow-600' : 'text-green-600'}`}>{nr.pct}% null</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FunnelLastRunPanel({ row }: { row: FunnelRowData }) {
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Run Intersection</h4>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-xs text-gray-600">Processed</span>
            <span className="text-xs font-semibold text-gray-900 tabular-nums">{processed.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-gray-600">Matched</span>
            <span className="text-xs font-semibold text-green-700 tabular-nums">{matched.toLocaleString()} ({runPct}%)</span>
          </div>
          {failed > 0 && (
            <div className="flex justify-between">
              <span className="text-xs text-gray-600">Failed</span>
              <span className="text-xs font-semibold text-red-500 tabular-nums">{failed.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>
      {websitesFound != null && (
        <div>
          <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Pipeline Steps</h4>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-xs text-gray-600">1. Entities Searched</span>
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{processed.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-600">2. Websites Found</span>
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{websitesFound.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-600">3. Contacts Extracted</span>
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{matched.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
      <div>
        <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Run Yield</h4>
        {extractedFields ? (
          <div className="space-y-1.5">
            {Object.entries(extractedFields)
              .filter(([, count]) => (count as number) > 0)
              .map(([field, count]) => (
                <div key={field} className="flex justify-between">
                  <span className="text-xs text-gray-600">{field}</span>
                  <span className="text-xs font-semibold text-gray-900 tabular-nums">{(count as number).toLocaleString()}</span>
                </div>
              ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-xs text-gray-600">Records</span>
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{(row.lastRunRecordsTotal ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-gray-600">New/Changed</span>
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{(row.lastRunRecordsNew ?? 0).toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FreshnessTimeline({ pipelineLastRun, runningPipelines, onTrigger, slaTargets, disabledPipelines, onToggle, triggerError, funnelData }: FreshnessTimelineProps) {
  const [errorPopover, setErrorPopover] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const toggleExpand = (key: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allSlugs = Object.keys(PIPELINE_REGISTRY);
  const completedCount = allSlugs.filter((s) => pipelineLastRun[s]?.status === 'completed').length;
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

      {/* Chains */}
      <div className="space-y-5">
        {PIPELINE_CHAINS.map((chain) => {
          const stepNumbers = computeStepNumbers(chain.steps);
          const chainSlug = `chain_${chain.id}`;
          const isChainRunning = runningPipelines.has(chainSlug) ||
            chain.steps.some((s) => runningPipelines.has(s.slug));

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
                  onClick={() => onTrigger(chainSlug)}
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
              </div>

              {/* Chain steps */}
              <div className="space-y-0">
                {chain.steps.map((step, i) => {
                  const entry = PIPELINE_REGISTRY[step.slug];
                  // Use chain-scoped status key (e.g. permits:assert_schema) so
                  // shared steps don't bleed status across unrelated chains.
                  const scopedKey = `${chain.id}:${step.slug}`;
                  const info = pipelineLastRun[scopedKey];
                  const isRunning = runningPipelines.has(scopedKey) || runningPipelines.has(step.slug);
                  const isDisabled = disabledPipelines?.has(step.slug) ?? false;
                  const dot = isDisabled
                    ? { color: 'bg-gray-300', label: 'Disabled' }
                    : getStatusDot(info, isRunning);
                  const stepNum = stepNumbers[i];
                  const isRoot = step.indent === 0;
                  const isSub = step.indent >= 2;
                  const isDeepSub = step.indent >= 3;

                  // Connector line: show for indent 1+ steps, fade at end of group
                  const showConnector = step.indent > 0;
                  const nextStep = chain.steps[i + 1];
                  const isLastInGroup = !nextStep || nextStep.indent === 0;
                  // For indent-2+, check if next is also indent-2+
                  const isLastSubStep = isSub && (!nextStep || nextStep.indent < 2);

                  const funnelRow = funnelData?.[step.slug];
                  const expandKey = `${chain.id}-${step.slug}`;
                  const isExpanded = expandedSteps.has(expandKey);

                  return (
                    <div key={expandKey}>
                    <div className="flex items-stretch group">
                      {/* Vertical connector column */}
                      <div className={`shrink-0 flex flex-col items-center ${isSub ? 'w-5' : 'w-5'}`}>
                        {showConnector ? (
                          <div
                            className={`w-px flex-1 ${
                              (isSub ? isLastSubStep : isLastInGroup)
                                ? 'bg-gradient-to-b from-gray-200 to-transparent'
                                : 'bg-gray-200'
                            }`}
                          />
                        ) : (
                          <div className="flex-1" />
                        )}
                      </div>

                      {/* Extra indent spacer for sub-steps */}
                      {isSub && (
                        <div className={`shrink-0 flex items-center ${isDeepSub ? 'w-14' : 'w-8'}`}>
                          <div className="w-full border-b border-dashed border-gray-300" />
                        </div>
                      )}

                      {/* Row content */}
                      <div className={`flex items-center gap-1.5 flex-1 py-1 ${isRoot ? 'pt-1.5' : ''}`}>
                        {/* Step number */}
                        {stepNum && (
                          <span className={`text-[9px] tabular-nums shrink-0 w-5 text-right ${
                            isRoot ? 'font-semibold text-gray-500' : 'text-gray-400'
                          }`}>
                            {stepNum}.
                          </span>
                        )}

                        {/* Arrow for dependent / sub-dependent steps */}
                        {step.indent >= 1 && (
                          <span className={`text-gray-300 shrink-0 ${isSub ? 'text-[8px] w-3' : 'text-[9px] w-3'}`}>
                            →
                          </span>
                        )}

                        {/* Status dot */}
                        <div className={`w-2 h-2 rounded-full shrink-0 ${dot.color}`} title={dot.label} />

                        {/* Pipeline name */}
                        <span
                          className={`text-xs truncate ${
                            isDisabled
                              ? 'text-gray-300 line-through w-36'
                              : isRoot
                              ? 'text-gray-800 font-medium w-36'
                              : isDeepSub
                              ? 'text-gray-400 w-28 text-[10px]'
                              : isSub
                              ? 'text-gray-500 w-32 text-[11px]'
                              : 'text-gray-600 w-36'
                          }`}
                          title={entry?.name ?? step.slug}
                        >
                          {entry?.name ?? step.slug}
                        </span>

                        {/* Dotted line */}
                        <div className="flex-1 border-b border-dotted border-gray-200" />

                        {/* Funnel match % chip */}
                        {funnelRow && (
                          <span className={`text-[9px] font-semibold tabular-nums px-1.5 py-0.5 rounded shrink-0 ${
                            funnelRow.matchPct >= 90 ? 'bg-green-50 text-green-700' :
                            funnelRow.matchPct >= 70 ? 'bg-blue-50 text-blue-700' :
                            funnelRow.matchPct >= 50 ? 'bg-yellow-50 text-yellow-700' :
                            'bg-red-50 text-red-600'
                          }`}>
                            {funnelRow.matchPct}%
                          </span>
                        )}

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
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
                            Running
                          </span>
                        )}
                        {!isRunning && info?.status === 'failed' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setErrorPopover(errorPopover === step.slug ? null : step.slug);
                            }}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium hover:bg-red-100 relative"
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

                        {/* SLA badge */}
                        {!isRunning && slaTargets && slaTargets[step.slug] && info?.last_run_at && (() => {
                          const hoursSince = (Date.now() - new Date(info.last_run_at).getTime()) / (1000 * 60 * 60);
                          return hoursSince > slaTargets[step.slug] ? (
                            <span className="text-[8px] px-1 py-0.5 rounded bg-red-100 text-red-600 font-semibold shrink-0">SLA</span>
                          ) : null;
                        })()}

                        {/* Timestamp */}
                        <span
                          className="text-[10px] text-gray-500 w-20 text-right shrink-0 tabular-nums"
                          title={formatDate(info?.last_run_at ?? null)}
                        >
                          {timeAgo(info?.last_run_at ?? null)}
                        </span>

                        {/* Run button — hidden for infrastructure steps */}
                        {!NON_TOGGLEABLE_SLUGS.has(step.slug) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onTrigger(step.slug); }}
                            disabled={isRunning || isDisabled}
                            className={`text-[9px] px-2 py-0.5 rounded border ${
                              isRunning
                                ? 'border-blue-200 text-blue-400 cursor-not-allowed'
                                : isDisabled
                                ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                                : 'border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                            }`}
                          >
                            Run
                          </button>
                        )}

                        {/* Toggle switch — hidden for infrastructure steps */}
                        {onToggle && !NON_TOGGLEABLE_SLUGS.has(step.slug) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onToggle(step.slug, isDisabled); }}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                            title={isDisabled ? `Enable ${entry?.name ?? step.slug}` : `Disable ${entry?.name ?? step.slug}`}
                            aria-label={isDisabled ? `Enable ${entry?.name ?? step.slug}` : `Disable ${entry?.name ?? step.slug}`}
                          >
                            <div className={`relative w-7 h-4 rounded-full transition-colors ${isDisabled ? 'bg-gray-300' : 'bg-green-500'}`}>
                              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${isDisabled ? 'left-0.5' : 'left-3.5'}`} />
                            </div>
                          </button>
                        )}

                        {/* Drill-down expand chevron — available for all steps */}
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
                      <div className="ml-10 mb-2 bg-gray-50/80 border border-gray-100 rounded-lg px-4 py-3 space-y-4">
                        {/* Description zone */}
                        {(() => {
                          const desc = STEP_DESCRIPTIONS[step.slug];
                          if (!desc) return null;
                          return (
                            <div>
                              <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Description</h4>
                              <p className="text-xs text-gray-600 mb-2">{desc.summary}</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0.5">
                                {desc.fields.map((f) => (
                                  <div key={f} className="flex items-center gap-1.5">
                                    <span className="w-1 h-1 rounded-full bg-gray-300 shrink-0" />
                                    <span className="text-[11px] text-gray-500 font-mono">{f}</span>
                                  </div>
                                ))}
                              </div>
                              <p className="text-[9px] text-gray-400 mt-1.5">Target table: <span className="font-mono">{desc.table}</span></p>
                            </div>
                          );
                        })()}

                        {/* All Time zone (funnel sources only) */}
                        {funnelRow && (
                          <div>
                            <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">All Time</h4>
                            <FunnelAllTimePanel row={funnelRow} />
                          </div>
                        )}

                        {/* Last Run zone */}
                        {funnelRow ? (
                          <div>
                            <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Last Run</h4>
                            <FunnelLastRunPanel row={funnelRow} />
                          </div>
                        ) : info ? (
                          <div>
                            <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Last Run</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-1.5">
                                <div className="flex justify-between">
                                  <span className="text-xs text-gray-600">Status</span>
                                  <span className={`text-xs font-semibold ${info.status === 'completed' ? 'text-green-700' : info.status === 'failed' ? 'text-red-600' : 'text-gray-500'}`}>
                                    {info.status ?? 'Unknown'}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-xs text-gray-600">Duration</span>
                                  <span className="text-xs font-semibold text-gray-900 tabular-nums">{formatDuration(info.duration_ms)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-xs text-gray-600">Last Run</span>
                                  <span className="text-xs font-medium text-gray-600">{timeAgo(info.last_run_at)}</span>
                                </div>
                              </div>
                              {(info.records_total != null || info.records_new != null) && (
                                <div className="space-y-1.5">
                                  {info.records_total != null && (
                                    <div className="flex justify-between">
                                      <span className="text-xs text-gray-600">Records</span>
                                      <span className="text-xs font-semibold text-gray-900 tabular-nums">{info.records_total.toLocaleString()}</span>
                                    </div>
                                  )}
                                  {info.records_new != null && (
                                    <div className="flex justify-between">
                                      <span className="text-xs text-gray-600">New/Changed</span>
                                      <span className="text-xs font-semibold text-green-700 tabular-nums">{info.records_new.toLocaleString()}</span>
                                    </div>
                                  )}
                                  {info.records_updated != null && info.records_updated > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-xs text-gray-600">Updated</span>
                                      <span className="text-xs font-semibold text-blue-700 tabular-nums">{info.records_updated.toLocaleString()}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic">No run data available yet. Trigger a pipeline run to populate.</p>
                        )}

                        {/* Footer metadata */}
                        {funnelRow && (
                          <div className="pt-2 border-t border-gray-200/60 flex flex-wrap items-center gap-4 text-[10px] text-gray-400">
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
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  );
                })}
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
