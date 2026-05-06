// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.3 Detailed Investigation View
//
// Published response contract for GET /api/leads/detail/:id. The Expo
// app consumes this shape via mobile/src/lib/schemas.ts; any breaking
// change here MUST be coordinated with the mobile repo (Cross-Domain
// Scenario B per .claude/domain-crossdomain.md).

export interface LeadDetailCost {
  estimated: number | null;
  tier: string | null;
  range_low: number | null;
  range_high: number | null;
  modeled_gfa_sqm: number | null;
}

export interface LeadDetailNeighbourhood {
  name: string | null;
  avg_household_income: number | null;
  median_household_income: number | null;
  period_of_construction: string | null;
}

export interface LeadDetailLocation {
  lat: number;
  lng: number;
}

export interface LeadDetail {
  /** `${permit_num}--${revision_num}` for permit leads or `COA-${application_number}` for CoA leads. */
  lead_id: string;
  lead_type: 'permit' | 'coa';
  permit_num: string | null;
  revision_num: string | null;
  /** Composed `${street_num} ${street_name}`. Falls back to lead_id when both pieces are NULL. */
  address: string;
  location: LeadDetailLocation | null;
  work_description: string | null;
  /**
   * Best-effort applicant/builder string. Currently null pending the
   * builders join helper (Spec 91 §4.3 "if unmasked"). Reserved here
   * so the mobile client can render the field without a follow-up
   * contract change.
   */
  applicant: string | null;
  lifecycle_phase: string | null;
  lifecycle_stalled: boolean;
  /** `'bid'` for early-phase opportunities, `'work'` for rescue missions, null when no trade forecast exists. */
  target_window: 'bid' | 'work' | null;
  opportunity_score: number | null;
  /** Number of distinct users who have saved this permit (lead_views.saved=true). Always non-negative. */
  competition_count: number;
  predicted_start: string | null;
  p25_days: number | null;
  p75_days: number | null;
  cost: LeadDetailCost | null;
  neighbourhood: LeadDetailNeighbourhood | null;
  /** ISO 8601 timestamp from permits.updated_at — reflects the last change to the source row. */
  updated_at: string;
  /**
   * Per-user save state (`lead_views.saved=true AND user_id=ctx.uid`).
   * Always non-null — the EXISTS subquery returns boolean.
   * Mobile SaveButton renders the optimistic-fill heart from this field
   * on cold-boot deep-link (no feed cache to fall back to).
   */
  is_saved: boolean;
}
