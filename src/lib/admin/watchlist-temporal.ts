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
