// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 Cycle 7 (Lifecycle Timeline panel)
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §5 (Inspector Lifecycle Timeline)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §3 (Client Component) + §9 (a11y)
//
// LifecycleTimelinePanel — the admin Lead Detail Inspector's top-of-page
// chevron-progression view of a permit's lifecycle. Consumes the
// WF1 #B `lifecycle.timeline[]` data layer (one entry per past/current/
// upcoming phase with cohort percentile comparison).
//
// Cycle 7 user direction (2026-05-09 plan-lock):
//   - Place at TOP of the detail panel, above the existing 8-panel grid.
//   - No icons per phase — chevron arrows separate stages.
//   - Show uncompleted stages with estimated days from cohort_median_days.
//
// Visual contract (R0 Gemini hardening 2026-05-11):
//   - Cohort-band pill carries text + aria-label (not color alone).
//   - Tooltips via native `title` attribute (keyboard + screen-reader
//     accessible without Radix Tooltip dependency).
//   - Scrollable container has tabindex + aria-label for keyboard nav.
//   - Loading state: skeleton placeholders matching chevron shape.

'use client';

import React from 'react';
import type { LeadInspectTimelineEntry } from '@/lib/admin/lead-schemas';
import { classifyCohortBand, type CohortBand } from '@/lib/admin/lifecycle-timeline-utils';

// R8 Gemini CRITICAL — hoisted to module scope to avoid re-creating the
// Set on every render. Spec 84 §3 enumerates terminal lifecycle phases;
// matches the constant in `src/lib/classification/phase-progression.ts:88`.
const TERMINAL_PHASES: ReadonlySet<string> = new Set(['P18', 'P19', 'P20', 'O3']);

// R8 Gemini MED — extracted from inline magic number. Spec 84 §7 stall-
// band semantics flag cohorts with fewer than 30 samples as "unreliable"
// so the admin UI surfaces an info marker rather than implying certainty.
const COHORT_MINIMUM_RELIABLE_SAMPLE_SIZE = 30;

// Inline icons — Spec 33 §4 mandates `lucide-react` but the package isn't
// installed yet (no admin component has needed icons before). Inline SVGs
// avoid adding a runtime dependency from this WF; switching to lucide-react
// is a future Spec-33-conformance WF when other admin surfaces need icons.
function ChevronRightIcon() {
  return (
    <svg
      data-testid="timeline-chevron"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-slate-400"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

interface Props {
  /** The lifecycle.timeline[] array from the LeadInspect.lifecycle payload. */
  timeline: readonly LeadInspectTimelineEntry[] | undefined;
  /** When true and `timeline` is absent, render a skeleton row. */
  loading?: boolean;
  /**
   * Optional permit_type — used only to disambiguate the off-canonical-
   * path marker tooltip. The off-path detection itself happens upstream
   * in build-lifecycle-timeline.ts (returns no upcoming entries).
   */
  permitType?: string | null;
}

const BAND_STYLES: Record<CohortBand, { bg: string; text: string; label: string }> = {
  'on-track': { bg: 'bg-emerald-100', text: 'text-emerald-900', label: 'ON TRACK' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-900', label: 'TRENDING SLOW' },
  stalled: { bg: 'bg-rose-100', text: 'text-rose-900', label: 'STALLED' },
  'no-data': { bg: 'bg-slate-100', text: 'text-slate-700', label: 'NO COHORT DATA' },
};

function CohortPill({ band }: { band: CohortBand }) {
  const styles = BAND_STYLES[band];
  return (
    <span
      // R8 Gemini LOW — use the user-facing label in aria-label rather
      // than the internal band key so screen-reader output matches the
      // visible text ("on track" / "trending slow" / "stalled" / "no
      // cohort data") not the implementation detail ("on-track" / "amber").
      aria-label={`cohort status: ${styles.label.toLowerCase()}`}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles.bg} ${styles.text}`}
    >
      {styles.label}
    </span>
  );
}

function UnreliableMarker({ sampleSize }: { sampleSize: number }) {
  return (
    <span
      data-testid="cohort-unreliable-marker"
      // R8 worktree BUG 2 — tabIndex={0} so keyboard users can Tab to the
      // marker; the `title` attribute renders as a native tooltip on focus
      // as well as on hover. Without tabIndex the title text is reachable
      // only by mouse/pointer, violating Spec 33 §9 keyboard-nav mandate.
      tabIndex={0}
      role="img"
      aria-label={`Cohort sample ${sampleSize} — calibration is unreliable (Spec 84 §7)`}
      title={`Cohort sample ${sampleSize} — calibration is unreliable (Spec 84 §7)`}
      className="inline-flex h-11 w-11 cursor-default items-center justify-center text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300"
    >
      <InfoIcon />
    </span>
  );
}

function EntryCard({ entry }: { entry: LeadInspectTimelineEntry }) {
  const band = classifyCohortBand(
    entry.days_in_phase,
    entry.cohort_p25_days,
    entry.cohort_p75_days,
    entry.cohort_sample_size,
  );
  const showUnreliable =
    entry.cohort_sample_size > 0 && entry.cohort_sample_size < COHORT_MINIMUM_RELIABLE_SAMPLE_SIZE;
  const phaseLabel = entry.phase_name ?? entry.phase;

  let daysIndicator: React.ReactNode = null;
  if (entry.status === 'completed') {
    daysIndicator = entry.days_in_phase != null ? `${entry.days_in_phase}d` : null;
  } else if (entry.status === 'current') {
    daysIndicator =
      entry.days_in_phase != null ? `${entry.days_in_phase}d in progress` : 'in progress';
  } else {
    // upcoming
    daysIndicator =
      entry.cohort_median_days != null ? `~${entry.cohort_median_days}d` : null;
  }

  const cohortRange =
    entry.cohort_p25_days != null && entry.cohort_p75_days != null
      ? `(typical: ${entry.cohort_p25_days}-${entry.cohort_p75_days}d${
          entry.cohort_sample_size > 0 ? `, n=${entry.cohort_sample_size}` : ''
        })`
      : null;

  const statusBg =
    entry.status === 'current'
      ? 'bg-white border-slate-300 shadow-sm'
      : entry.status === 'completed'
        ? 'bg-slate-50 border-slate-200'
        : 'bg-slate-50/50 border-slate-200 opacity-70';

  return (
    <div
      className={`flex shrink-0 flex-col gap-1 rounded-md border px-3 py-2 ${statusBg}`}
      data-status={entry.status}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-900">{phaseLabel}</span>
        {entry.status === 'current' && <CohortPill band={band} />}
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-600">
        {daysIndicator != null && <span>{daysIndicator}</span>}
        {cohortRange != null && entry.status !== 'current' && (
          <span className="text-slate-500">{cohortRange}</span>
        )}
        {showUnreliable && <UnreliableMarker sampleSize={entry.cohort_sample_size} />}
      </div>
    </div>
  );
}

function Chevron() {
  return <ChevronRightIcon />;
}

function LoadingSkeleton() {
  // Three placeholder entries separated by chevrons — matches resolved-
  // content shape (R0 Gemini MED: no spinner, no blank canvas).
  return (
    <div
      data-testid="timeline-skeleton"
      className="flex items-stretch gap-2 overflow-x-auto py-3"
      role="status"
      aria-label="Loading lifecycle timeline"
    >
      {[0, 1, 2].map((i) => (
        <React.Fragment key={i}>
          {i > 0 && <Chevron />}
          <div
            data-testid="timeline-skeleton-placeholder"
            className="h-12 w-24 shrink-0 animate-pulse rounded-md bg-slate-200"
          />
        </React.Fragment>
      ))}
    </div>
  );
}

export function LifecycleTimelinePanel({ timeline, loading, permitType }: Props) {
  // R8 Gemini HIGH — loading state must be independent of whether stale
  // data is present. The previous guard `loading && (timeline == null ||
  // .length === 0)` would skip the skeleton when a parent re-fetch handed
  // us stale data alongside loading=true, producing a content pop on
  // resolution. Early-return on loading regardless of timeline shape.
  if (loading) {
    return <LoadingSkeleton />;
  }

  if (timeline == null || timeline.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Lifecycle data unavailable for this permit.
      </div>
    );
  }

  // Split by status for region-specific rendering. The data layer already
  // sorts: completed (chronological) → current → upcoming (canonical).
  const completed = timeline.filter((t) => t.status === 'completed');
  const current = timeline.filter((t) => t.status === 'current');
  const upcoming = timeline.filter((t) => t.status === 'upcoming');

  // Off-canonical-path detection: there's a current entry but no upcoming
  // entries — and the current phase isn't terminal (P18/P19/P20/O3). The
  // data layer drops upcoming entries when `remainingPhases()` returns []
  // for either off-path or terminal reasons. Distinguish: terminal phases
  // are explicitly excluded from the canonical happy path.
  const currentEntry = current[0];
  const isOffPath =
    upcoming.length === 0 &&
    currentEntry != null &&
    !TERMINAL_PHASES.has(currentEntry.phase);

  return (
    <div
      data-testid="timeline-scroll-container"
      tabIndex={0}
      aria-label={`Lifecycle timeline (scrollable; ${timeline.length} ${
        timeline.length === 1 ? 'entry' : 'entries'
      })`}
      className="flex items-stretch gap-2 overflow-x-auto py-3 focus:outline-none focus:ring-2 focus:ring-slate-300"
    >
      {/* Completed region */}
      {completed.map((entry, i) => (
        <React.Fragment key={`completed-${entry.phase}-${i}`}>
          {i > 0 && <Chevron />}
          <EntryCard entry={entry} />
        </React.Fragment>
      ))}

      {/* Chevron between completed and current */}
      {completed.length > 0 && currentEntry && <Chevron />}

      {/* Current region */}
      {currentEntry && <EntryCard entry={currentEntry} />}

      {/* Off-canonical-path marker — the permit's current phase isn't in
          the canonical STANDARD_PHASE_PATH_BY_PERMIT_TYPE for its permit
          type, so the data layer correctly emitted no upcoming entries.
          R8 DeepSeek MED — dropped 84-W11 reference (that bug is about
          P3/P4/P5 ID collisions in CoA vs Permits, NOT off-path
          detection). Tooltip now references Spec 84 §3 progression. */}
      {isOffPath && (
        <span
          tabIndex={0}
          aria-label={`Off canonical path for ${permitType ?? 'this permit type'}`}
          title={`This permit's current phase isn't in the standard progression for ${
            permitType ?? 'this permit type'
          }. See Spec 84 §3 canonical phase paths.`}
          className="inline-flex items-center px-2 text-xs italic text-zinc-500 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          off canonical path
        </span>
      )}

      {/* Upcoming region — chevron before upcoming connects from either
          the current entry OR (R8 DeepSeek LOW edge case) the last
          completed entry when no current is present in the data. */}
      {upcoming.length > 0 && (
        <>
          {(currentEntry || completed.length > 0) && <Chevron />}
          <div data-testid="timeline-upcoming-region" className="contents">
            {upcoming.map((entry, i) => (
              <React.Fragment key={`upcoming-${entry.phase}-${i}`}>
                {i > 0 && <Chevron />}
                <EntryCard entry={entry} />
              </React.Fragment>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
