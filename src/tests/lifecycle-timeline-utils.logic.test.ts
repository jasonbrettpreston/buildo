// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 (Cycle 7 amendment — Lifecycle Timeline panel)
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §5 (Inspector Lifecycle Timeline) + §7 (stall band)
//
// Pure-function tests for the cohort-band classifier consumed by
// LifecycleTimelinePanel.tsx. The classifier converts a per-permit
// (daysInPhase, p25, p75, sample_size) tuple into one of four UI
// states. Separating it from the component keeps the comparison
// logic testable + reusable for any future timeline surface (e.g.
// the mobile flight-center progression bar Cycle 7b).
//
// WF1 #C R4 — Red Light tests (5 assertions). R0 Gemini MED extracted
// this from the component into its own helper so the math + null
// handling is unit-testable.

import { describe, it, expect } from 'vitest';
import { classifyCohortBand } from '@/lib/admin/lifecycle-timeline-utils';

describe('classifyCohortBand — cohort-band classifier (Spec 84 §7 stall band)', () => {
  it("returns 'on-track' when daysInPhase < p25 (fastest quartile)", () => {
    // 10 days in phase vs cohort p25=20 → on-track
    expect(classifyCohortBand(10, 20, 50, 100)).toBe('on-track');
    // Boundary: exactly at p25 is NOT on-track (per the inclusive-amber rule)
    expect(classifyCohortBand(20, 20, 50, 100)).toBe('amber');
  });

  it("returns 'amber' when p25 ≤ daysInPhase ≤ p75 (typical range)", () => {
    expect(classifyCohortBand(35, 20, 50, 100)).toBe('amber');
    expect(classifyCohortBand(50, 20, 50, 100)).toBe('amber'); // exactly p75
  });

  it("returns 'stalled' when daysInPhase > p75 (Spec 84 §7 stall band)", () => {
    expect(classifyCohortBand(60, 20, 50, 100)).toBe('stalled');
    expect(classifyCohortBand(9999, 20, 50, 100)).toBe('stalled');
  });

  it("returns 'no-data' when cohort_sample_size is 0 or any percentile is null", () => {
    // Zero sample
    expect(classifyCohortBand(30, 20, 50, 0)).toBe('no-data');
    // Null p25
    expect(classifyCohortBand(30, null, 50, 100)).toBe('no-data');
    // Null p75
    expect(classifyCohortBand(30, 20, null, 100)).toBe('no-data');
    // Null both
    expect(classifyCohortBand(30, null, null, 100)).toBe('no-data');
  });

  it("returns 'no-data' when daysInPhase itself is null (not just numerically 0)", () => {
    // null daysInPhase → no comparison possible, not stalled-at-zero
    expect(classifyCohortBand(null, 20, 50, 100)).toBe('no-data');
    // Zero days is a real value, not no-data
    expect(classifyCohortBand(0, 20, 50, 100)).toBe('on-track');
  });
});
