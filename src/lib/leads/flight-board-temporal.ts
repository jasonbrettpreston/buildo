// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.2 Main Flight Board View
//
// Temporal grouping for flight-board cards. Shared between
// /api/leads/flight-board (list) and /api/leads/flight-board/detail/:id
// (single item) so both endpoints classify the same row identically.

export type TemporalGroup =
  | 'action_required'
  | 'departing_soon'
  | 'on_the_horizon';

interface TemporalInputs {
  lifecycle_stalled: boolean;
  predicted_start: string | null;
}

/**
 * Classify a flight-board row by urgency. Stalled permits always head
 * the action_required bucket; otherwise the bucket is determined by
 * how many days until predicted_start (≤ 0 = past-due, ≤ 14 =
 * departing soon, else horizon). A null predicted_start places the
 * row on the horizon — we don't know the urgency yet.
 */
export function computeTemporalGroup(
  row: TemporalInputs,
  now: Date,
): TemporalGroup {
  if (row.lifecycle_stalled) return 'action_required';
  if (!row.predicted_start) return 'on_the_horizon';
  const start = new Date(row.predicted_start);
  const diffDays = (start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 0) return 'action_required';
  if (diffDays <= 14) return 'departing_soon';
  return 'on_the_horizon';
}
