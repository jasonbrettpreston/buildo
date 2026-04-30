// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.3 Detailed Investigation View
//
// Published response contract for GET /api/leads/flight-board/detail/:id.
// Returns the same shape as a single FlightBoardItem from the list
// endpoint, with `updated_at` exposed (Spec 77 §3.2 Amber Update Flash).
// Cross-Domain Scenario B — coordinate breaking changes with mobile.

export type FlightBoardTemporalGroup =
  | 'action_required'
  | 'departing_soon'
  | 'on_the_horizon';

export interface FlightBoardDetail {
  permit_num: string;
  revision_num: string;
  address: string;
  lifecycle_phase: string | null;
  lifecycle_stalled: boolean;
  predicted_start: string | null;
  p25_days: number | null;
  p75_days: number | null;
  temporal_group: FlightBoardTemporalGroup;
  /** ISO 8601 timestamp from permits.updated_at — drives the amber update flash. */
  updated_at: string;
}
