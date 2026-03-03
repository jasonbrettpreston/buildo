'use client';

// ---------------------------------------------------------------------------
// Pipeline Registry — single source of truth for all tracked pipelines
// ---------------------------------------------------------------------------

export type PipelineGroup = 'ingest' | 'link' | 'classify' | 'snapshot';

export interface PipelineEntry {
  name: string;
  group: PipelineGroup;
}

export const PIPELINE_REGISTRY: Record<string, PipelineEntry> = {
  // Ingest (7) — load raw data into DB
  permits:            { name: 'Building Permits',      group: 'ingest' },
  coa:                { name: 'CoA Applications',      group: 'ingest' },
  builders:           { name: 'Builder Profiles',      group: 'ingest' },
  address_points:     { name: 'Address Points',        group: 'ingest' },
  parcels:            { name: 'Parcels',               group: 'ingest' },
  massing:            { name: '3D Massing',            group: 'ingest' },
  neighbourhoods:     { name: 'Neighbourhoods',        group: 'ingest' },
  // Link & Enrich (10)
  geocode_permits:    { name: 'Geocode Permits',       group: 'link' },
  link_parcels:       { name: 'Link Parcels',          group: 'link' },
  link_neighbourhoods:{ name: 'Link Neighbourhoods',   group: 'link' },
  link_massing:       { name: 'Link Massing',          group: 'link' },
  link_coa:           { name: 'Link CoA',              group: 'link' },
  enrich_google:      { name: 'Enrich Google Places',  group: 'link' },
  enrich_wsib:        { name: 'Enrich WSIB',           group: 'link' },
  link_similar:       { name: 'Link Similar Permits',  group: 'link' },
  create_pre_permits: { name: 'Create Pre-Permits',    group: 'link' },
  compute_centroids:  { name: 'Compute Centroids',     group: 'link' },
  // Classify (3) — derive fields
  classify_scope_class: { name: 'Scope Class',         group: 'classify' },
  classify_scope_tags:  { name: 'Scope Tags',          group: 'classify' },
  classify_permits:     { name: 'Classify Trades',     group: 'classify' },
  // Snapshot (1) — capture metrics
  refresh_snapshot:   { name: 'Refresh Snapshot',      group: 'snapshot' },
};

export const GROUP_LABELS: Record<PipelineGroup, string> = {
  ingest: 'Ingest',
  link: 'Link',
  classify: 'Classify',
  snapshot: 'Snapshot',
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
}

export const PIPELINE_CHAINS: PipelineChain[] = [
  {
    id: 'permits',
    label: 'Permits Pipeline',
    description: 'Daily — when building permits are loaded',
    steps: [
      { slug: 'permits',              indent: 0 },
      { slug: 'classify_scope_class', indent: 1 },
      { slug: 'classify_scope_tags',  indent: 1 },
      { slug: 'classify_permits',     indent: 1 },
      { slug: 'builders',             indent: 1 },
      { slug: 'enrich_google',        indent: 2 },
      { slug: 'enrich_wsib',          indent: 2 },
      { slug: 'geocode_permits',      indent: 1 },
      { slug: 'link_parcels',         indent: 1 },
      { slug: 'link_neighbourhoods',  indent: 1 },
      { slug: 'link_massing',         indent: 1 },
      { slug: 'link_similar',         indent: 1 },
      { slug: 'link_coa',             indent: 1 },
      { slug: 'refresh_snapshot',     indent: 1 },
    ],
  },
  {
    id: 'coa',
    label: 'CoA Pipeline',
    description: 'Daily — when Committee of Adjustment data is loaded',
    steps: [
      { slug: 'coa',                indent: 0 },
      { slug: 'link_coa',           indent: 1 },
      { slug: 'create_pre_permits', indent: 1 },
      { slug: 'refresh_snapshot',   indent: 1 },
    ],
  },
  {
    id: 'sources',
    label: 'Source Data Updates',
    description: 'Quarterly/Annual — reference data refreshes',
    steps: [
      { slug: 'address_points',      indent: 0 },
      { slug: 'geocode_permits',     indent: 1 },
      { slug: 'parcels',             indent: 0 },
      { slug: 'compute_centroids',   indent: 1 },
      { slug: 'link_parcels',        indent: 1 },
      { slug: 'massing',             indent: 0 },
      { slug: 'link_massing',        indent: 1 },
      { slug: 'neighbourhoods',      indent: 0 },
      { slug: 'link_neighbourhoods', indent: 1 },
      { slug: 'refresh_snapshot',    indent: 1 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Props & helpers
// ---------------------------------------------------------------------------

interface PipelineRunInfo {
  last_run_at: string | null;
  status: string | null;
}

export interface FreshnessTimelineProps {
  pipelineLastRun: Record<string, PipelineRunInfo>;
  runningPipelines: Set<string>;
  onTrigger: (slug: string) => void;
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
    return null; // indent 2 = sub-step, no number
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FreshnessTimeline({ pipelineLastRun, runningPipelines, onTrigger }: FreshnessTimelineProps) {
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

          return (
            <div key={chain.id}>
              {/* Chain header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {chain.label}
                </span>
                <span className="text-[9px] text-gray-300">{chain.description}</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* Chain steps */}
              <div className="space-y-0">
                {chain.steps.map((step, i) => {
                  const entry = PIPELINE_REGISTRY[step.slug];
                  const info = pipelineLastRun[step.slug];
                  const isRunning = runningPipelines.has(step.slug);
                  const dot = getStatusDot(info, isRunning);
                  const stepNum = stepNumbers[i];
                  const isRoot = step.indent === 0;
                  const isSub = step.indent === 2;

                  // Connector line: show for indent 1+ steps, fade at end of group
                  const showConnector = step.indent > 0;
                  const nextStep = chain.steps[i + 1];
                  const isLastInGroup = !nextStep || nextStep.indent === 0;
                  // For indent-2, check if next is also indent-2
                  const isLastSubStep = isSub && (!nextStep || nextStep.indent < 2);

                  return (
                    <div key={`${chain.id}-${step.slug}`} className="flex items-stretch group">
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
                        <div className="shrink-0 flex items-center w-8">
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
                            isRoot
                              ? 'text-gray-800 font-medium w-36'
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

                        {/* Status badge */}
                        {isRunning && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
                            Running
                          </span>
                        )}
                        {!isRunning && info?.status === 'failed' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">
                            Failed
                          </span>
                        )}

                        {/* Timestamp */}
                        <span
                          className="text-[10px] text-gray-500 w-20 text-right shrink-0 tabular-nums"
                          title={formatDate(info?.last_run_at ?? null)}
                        >
                          {timeAgo(info?.last_run_at ?? null)}
                        </span>

                        {/* Run button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); onTrigger(step.slug); }}
                          disabled={isRunning}
                          className={`text-[9px] px-2 py-0.5 rounded border opacity-0 group-hover:opacity-100 transition-opacity ${
                            isRunning
                              ? 'border-blue-200 text-blue-400 cursor-not-allowed'
                              : 'border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                          }`}
                        >
                          Run
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
