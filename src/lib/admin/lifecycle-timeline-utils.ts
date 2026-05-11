// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 Cycle 7 (Lifecycle Timeline panel)
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §5 + §7 (stall band)
//
// Pure helpers for LifecycleTimelinePanel. Kept in lib/ (not co-located
// with the component) so the logic can be unit-tested without a render
// harness AND reused by the future mobile flight-center progression bar
// surface (Cycle 7b).
//
// `classifyCohortBand` converts a per-permit (daysInPhase, p25, p75,
// sample_size) tuple into one of four cohort-band states the UI consumes
// to render the colored status pill. Extracted from inline JSX per R0
// Gemini MED (rendering logic needs a testable home).

export type CohortBand = 'on-track' | 'amber' | 'stalled' | 'no-data';

/**
 * Classify a permit's current days-in-phase against the cohort percentile
 * band per Spec 84 §7. Inputs may be null when calibration data is
 * absent (the cohort fields default to null for permit_types not yet
 * covered by `phase_stay_calibration`).
 *
 * Branches:
 *  - sample_size === 0 OR p25/p75 is null OR daysInPhase is null → 'no-data'
 *  - daysInPhase < p25                                            → 'on-track'
 *  - p25 ≤ daysInPhase ≤ p75                                      → 'amber'
 *  - daysInPhase > p75                                            → 'stalled'  (Spec 84 §7 stall band)
 *
 * Note: daysInPhase === 0 is treated as 'on-track' (valid measurement),
 * NOT as 'no-data'. Only null is no-data.
 */
export function classifyCohortBand(
  daysInPhase: number | null | undefined,
  p25Days: number | null | undefined,
  p75Days: number | null | undefined,
  sampleSize: number,
): CohortBand {
  if (sampleSize === 0 || p25Days == null || p75Days == null || daysInPhase == null) {
    return 'no-data';
  }
  if (daysInPhase < p25Days) return 'on-track';
  if (daysInPhase > p75Days) return 'stalled';
  return 'amber';
}
