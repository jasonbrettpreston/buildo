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
  // WF3 #13 Pass-2.5 Finding F (2026-05-22) — `opportunity_score` from
  // trade_forecasts. NULL means "no cost data" per Spec 81 §3 (distinct
  // from a real 0 — but both are equally meaningless for action_required
  // bucketing). When null or ≤ 0, the row is demoted to on_the_horizon
  // regardless of predicted_start position; meaningless leads should not
  // pile up at the top of the Flight Board.
  opportunity_score: number | null;
}

/**
 * Classify a flight-board row by urgency.
 *
 * **Demotion rule (WF3 #13 Finding F):** rows with no meaningful opportunity
 * signal (`opportunity_score == null || opportunity_score <= 0`) are demoted
 * to `on_the_horizon` regardless of `predicted_start` position. The §7a
 * Inspector spot-check (2026-05-20) found these leads pile up in the
 * `action_required` bucket — the most prominent slot — because past-
 * `predicted_start` rows are temporally bucketed there. After Finding D's
 * matrix-miss safe-skip, many plumbing/mech permits have null cost
 * estimates → null opportunity_score → displayed as 0 by the feed's
 * COALESCE, creating noise at the top of the operator's action queue.
 * The demotion preserves their visibility in the Flight Board (they
 * still appear in `on_the_horizon`) without giving them top billing.
 *
 * Stalled+meaningless leads also demote (a stalled meaningless lead is
 * still meaningless) — the score check fires before the lifecycle_stalled
 * check.
 *
 * For meaningful leads: stalled permits head the action_required bucket;
 * otherwise the bucket is determined by days until predicted_start
 * (≤ 0 = past-due → action_required, ≤ 14 = departing_soon, else horizon).
 * A null predicted_start places the row on the horizon — we don't know
 * the urgency yet.
 */
export function computeTemporalGroup(
  row: TemporalInputs,
  now: Date,
): TemporalGroup {
  // WF3 #13 Finding F demotion: meaningless leads (no cost data → null
  // score, OR genuinely-computed 0 from heavy-competition decay) drop
  // out of the action_required + departing_soon buckets entirely.
  if (row.opportunity_score == null || row.opportunity_score <= 0) {
    return 'on_the_horizon';
  }
  if (row.lifecycle_stalled) return 'action_required';
  if (!row.predicted_start) return 'on_the_horizon';
  const start = new Date(row.predicted_start);
  const diffDays = (start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 0) return 'action_required';
  if (diffDays <= 14) return 'departing_soon';
  return 'on_the_horizon';
}
