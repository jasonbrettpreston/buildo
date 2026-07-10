// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §4
//
// Thin AGGREGATION WRAPPER over the shared `computeTemporalGroup` for the
// admin Flight Center watchlist ([ORC4] + [PF12]).
//
// Why a wrapper and not an edit to the shared function:
// `computeTemporalGroup` (flight-board-temporal.ts) buckets null/≤0-score
// rows `on_the_horizon` BEFORE its stalled check — the deliberate WF3-#13
// Finding F demotion the CONSUMER flight-board depends on. For the admin
// watchlist a DELAYED project must never hide in `on_the_horizon` just
// because its scores are null, so the wrapper checks `lifecycle_stalled`
// FIRST and only then delegates to the UNTOUCHED shared function. Zero
// consumer-behavior change; the shared function is not forked or edited.
//
// The inputs are the PROJECT-LEVEL aggregates (Spec 36 §4.5): the caller
// supplies the earliest active-trade `predicted_start` (MIN across the
// lead's forecast rows gated `is_active = true`) and the max opportunity
// score across the lead's scored trades (null-safe).

import {
  computeTemporalGroup,
  type TemporalGroup,
} from '@/lib/leads/flight-board-temporal';

export interface WatchlistTemporalInputs {
  lifecycle_stalled: boolean;
  /** Earliest active-trade predicted_start across the lead's forecasts (ISO date) — null when no forecast exists. */
  predicted_start: string | null;
  /** MAX(opportunity_score) across the lead's active-trade forecasts — null when unscored. */
  opportunity_score: number | null;
}

/**
 * Watchlist temporal grouping: stalled → action_required FIRST ([PF12]),
 * then the untouched shared `computeTemporalGroup` for everything else.
 */
export function computeWatchlistTemporalGroup(
  row: WatchlistTemporalInputs,
  now: Date,
): TemporalGroup {
  if (row.lifecycle_stalled) return 'action_required';
  return computeTemporalGroup(row, now);
}

/**
 * The DELAYED badge derivation (Spec 36 §4.5): there is NO stored `delayed`
 * column — DELAYED = `lifecycle_stalled` (project-level, present on BOTH
 * permits and coa_applications [ORC6]) OR a past-due aggregated
 * `predicted_start`. A null predicted_start is NOT delayed — absent-vs-null
 * honesty (we do not know the urgency yet).
 */
export function isDelayed(
  row: Pick<WatchlistTemporalInputs, 'lifecycle_stalled' | 'predicted_start'>,
  now: Date,
): boolean {
  if (row.lifecycle_stalled) return true;
  if (!row.predicted_start) return false;
  return new Date(row.predicted_start).getTime() <= now.getTime();
}

export interface ForecastRowLike {
  predicted_start: string | null;
  p25_days: number | null;
  p75_days: number | null;
  opportunity_score: number | null;
}

export interface AggregatedForecast {
  /** Earliest non-null predicted_start (ISO date) — null when none. */
  predicted_start: string | null;
  /** p25/p75 window of the EARLIEST forecast row (the one supplying predicted_start). */
  p25_days: number | null;
  p75_days: number | null;
  /** MAX(opportunity_score) across all rows, null-safe. */
  opportunity_score: number | null;
}

/**
 * Client-side mirror of the GET /watchlist SQL aggregation ([PF14] drawer
 * reconcile): earliest predicted_start supplies the window; the score is the
 * null-safe MAX across rows. Used by the drawer header to RECONCILE its
 * initialData (the cached watchlist row) against the useLeadInspect
 * forecast panel once it resolves — header and panels converge on the same
 * snapshot.
 */
export function aggregateForecastRows(rows: ForecastRowLike[]): AggregatedForecast {
  let earliest: ForecastRowLike | null = null;
  let maxScore: number | null = null;
  for (const row of rows) {
    if (row.predicted_start != null) {
      if (earliest === null || row.predicted_start < (earliest.predicted_start as string)) {
        earliest = row;
      }
    }
    if (row.opportunity_score != null) {
      maxScore = maxScore == null ? row.opportunity_score : Math.max(maxScore, row.opportunity_score);
    }
  }
  return {
    predicted_start: earliest?.predicted_start ?? null,
    p25_days: earliest?.p25_days ?? null,
    p75_days: earliest?.p75_days ?? null,
    opportunity_score: maxScore,
  };
}
