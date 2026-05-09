// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §5
//
// Pure-function assembly of the inspector's lifecycle.timeline[] panel.
// Combines three inputs into a unified ordered array of phase entries:
//
//   1. permit_phase_transitions ledger rows (historical actuals)
//   2. The current `lifecycle_phase` + `phase_started_at` (in-progress phase)
//   3. STANDARD_PHASE_PATH_BY_PERMIT_TYPE (forward forecast)
//
// Each entry has the same shape regardless of past/present/future, with
// a `status` field discriminating them. Cohort fields (median/p25/p75/n)
// come from the phase_calibration table indexed by phase.
//
// No DB access; no I/O; pure function. Fully unit-testable.

import { phaseName } from '@/lib/classification/phase-names';
import { remainingPhases } from '@/lib/classification/phase-progression';

export interface TransitionRow {
  /** NULL on first transition (entry into the pipeline). */
  from_phase: string | null;
  to_phase: string;
  /** ISO timestamp string. */
  transitioned_at: string;
}

export interface CalibrationRow {
  phase: string;
  median_days: number | null;
  p25_days: number | null;
  p75_days: number | null;
  sample_size: number;
}

export interface TimelineEntry {
  phase: string;
  phase_name: string | null;
  status: 'completed' | 'current' | 'upcoming';
  /** When the phase was entered (ISO). NULL for upcoming entries. */
  entered_at: string | null;
  /** When the phase was exited (ISO). NULL for current + upcoming. */
  exited_at: string | null;
  /**
   * Days the permit spent in this phase. For completed entries: actual
   * delta. For current: NOW - entered_at. For upcoming: cohort_median_days
   * (predicted), or null if no calibration data.
   */
  days_in_phase: number | null;
  cohort_median_days: number | null;
  cohort_p25_days: number | null;
  cohort_p75_days: number | null;
  cohort_sample_size: number;
}

export interface BuildTimelineInput {
  permitType: string | null;
  currentPhase: string | null;
  /** ISO timestamp string when the permit entered its current phase. */
  phaseStartedAt: string | null;
  transitions: readonly TransitionRow[];
  calibrationByPhase: Readonly<Record<string, CalibrationRow>>;
  /** Injected for testability — defaults to new Date() in production callers. */
  now: Date;
}

const MS_PER_DAY = 86_400_000;

/**
 * Round to integer days; returns null if the inputs aren't valid Dates.
 */
function daysBetween(startISO: string, endISO: string | Date): number | null {
  const start = Date.parse(startISO);
  const end = typeof endISO === 'string' ? Date.parse(endISO) : endISO.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  // Math.floor for "days elapsed" semantics: a permit that entered the
  // phase 159.5 days ago has been in-phase for 159 complete days. Round
  // would over-count near-half-day boundaries, distorting the stall metric.
  // Clamp to >=0: a future-dated phaseStartedAt (clock skew or upstream
  // data error) would otherwise produce a negative "days in phase" that
  // breaks stall detection and renders nonsensically in the inspector.
  return Math.max(0, Math.floor((end - start) / MS_PER_DAY));
}

function cohortFor(
  phase: string,
  calibrationByPhase: Readonly<Record<string, CalibrationRow>>,
): Pick<TimelineEntry, 'cohort_median_days' | 'cohort_p25_days' | 'cohort_p75_days' | 'cohort_sample_size'> {
  const c = calibrationByPhase[phase];
  if (!c) {
    return {
      cohort_median_days: null,
      cohort_p25_days: null,
      cohort_p75_days: null,
      cohort_sample_size: 0,
    };
  }
  return {
    cohort_median_days: c.median_days,
    cohort_p25_days: c.p25_days,
    cohort_p75_days: c.p75_days,
    cohort_sample_size: c.sample_size,
  };
}

/**
 * Assemble the lifecycle.timeline[] for a single permit. Returns an empty
 * array when permitType or currentPhase is null (the inspector cannot
 * meaningfully render a timeline without those anchors).
 *
 * Order: completed entries (chronological) → current entry → upcoming
 * entries (canonical Spec 84 §3 order). Each entry carries cohort
 * percentiles when available; null when the phase_calibration table
 * has no row for the (permit_type, phase) bucket.
 */
export function buildTimeline(input: BuildTimelineInput): TimelineEntry[] {
  const { permitType, currentPhase, phaseStartedAt, transitions, calibrationByPhase, now } = input;

  if (permitType == null || currentPhase == null) return [];

  const out: TimelineEntry[] = [];

  // ── Completed entries — every transition row whose to_phase is NOT the
  //    current phase becomes a completed entry. The transition's to_phase
  //    is the phase that was entered; the duration is until the NEXT
  //    transition (or until phaseStartedAt if next transition exits to
  //    the current phase).
  //
  //    We iterate transitions in chronological order and pair each with
  //    the next to compute the duration of the to_phase.
  const sortedTx = [...transitions].sort(
    (a, b) => Date.parse(a.transitioned_at) - Date.parse(b.transitioned_at),
  );

  for (let i = 0; i < sortedTx.length; i++) {
    const tx = sortedTx[i]!;
    const nextTx = sortedTx[i + 1];
    const isLastTransition = nextTx === undefined;

    // The phase represented by THIS transition entry is `tx.to_phase`
    // (the phase that was just entered). It's "completed" if there's a
    // later transition whose from_phase === tx.to_phase, OR if it
    // isn't the current phase. Skip if it equals currentPhase (handled
    // separately as the current entry below).
    if (tx.to_phase === currentPhase && isLastTransition) {
      // This transition is the entry into the current phase — handled below.
      continue;
    }

    // Duration: from this transition's transitioned_at to the next.
    // If this is the last transition AND tx.to_phase !== currentPhase
    // (e.g., terminal phase like P18), we don't have an exit timestamp;
    // duration is null.
    const exitedAt = nextTx?.transitioned_at ?? null;
    const days = exitedAt ? daysBetween(tx.transitioned_at, exitedAt) : null;

    out.push({
      phase: tx.to_phase,
      phase_name: phaseName(tx.to_phase),
      status: 'completed',
      entered_at: tx.transitioned_at,
      exited_at: exitedAt,
      days_in_phase: days,
      ...cohortFor(tx.to_phase, calibrationByPhase),
    });
  }

  // ── Current entry — NOW - phaseStartedAt (or null when phaseStartedAt missing)
  const currentDays = phaseStartedAt ? daysBetween(phaseStartedAt, now) : null;
  out.push({
    phase: currentPhase,
    phase_name: phaseName(currentPhase),
    status: 'current',
    entered_at: phaseStartedAt,
    exited_at: null,
    days_in_phase: currentDays,
    ...cohortFor(currentPhase, calibrationByPhase),
  });

  // ── Upcoming entries — slice from STANDARD_PHASE_PATH after currentPhase.
  //    Each upcoming entry's days_in_phase = cohort_median_days (predicted),
  //    or null when calibration is missing.
  const upcoming = remainingPhases(permitType, currentPhase);
  for (const phase of upcoming) {
    const cohort = cohortFor(phase, calibrationByPhase);
    out.push({
      phase,
      phase_name: phaseName(phase),
      status: 'upcoming',
      entered_at: null,
      exited_at: null,
      days_in_phase: cohort.cohort_median_days,
      ...cohort,
    });
  }

  return out;
}
