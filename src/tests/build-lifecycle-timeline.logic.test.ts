// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §5
//
// Pure-function unit tests for src/lib/leads/build-lifecycle-timeline.ts —
// the core of the inspector's lifecycle.timeline[] panel. Assembles the
// completed + current + upcoming phase entries from:
//   - permit_phase_transitions ledger rows
//   - phase_calibration cohort percentiles
//   - permit.permit_type + permit.lifecycle_phase + permit.phase_started_at

import { describe, it, expect } from 'vitest';
import {
  buildTimeline,
  type TransitionRow,
  type CalibrationRow,
} from '@/lib/leads/build-lifecycle-timeline';

const MOCK_NOW = new Date('2026-05-09T12:00:00.000Z');

// Helper to build a calibration map from a flat array.
const calibByPhase = (rows: CalibrationRow[]): Record<string, CalibrationRow> =>
  rows.reduce<Record<string, CalibrationRow>>((acc, r) => { acc[r.phase] = r; return acc; }, {});

describe('buildTimeline — empty/edge cases (WF1 #B 2026-05-09)', () => {
  it('returns empty array when permitType is null', () => {
    const tl = buildTimeline({
      permitType: null,
      currentPhase: 'P7c',
      phaseStartedAt: '2026-01-01T00:00:00.000Z',
      transitions: [],
      calibrationByPhase: {},
      now: MOCK_NOW,
    });
    expect(tl).toEqual([]);
  });

  it('returns empty array when currentPhase is null', () => {
    const tl = buildTimeline({
      permitType: 'New Houses',
      currentPhase: null,
      phaseStartedAt: null,
      transitions: [],
      calibrationByPhase: {},
      now: MOCK_NOW,
    });
    expect(tl).toEqual([]);
  });
});

describe('buildTimeline — completed-only (terminal permit, P18)', () => {
  it('builds completed entries for every transition; no current; no upcoming', () => {
    const transitions: TransitionRow[] = [
      { from_phase: null, to_phase: 'P3', transitioned_at: '2025-01-01T00:00:00.000Z' },
      { from_phase: 'P3', to_phase: 'P6', transitioned_at: '2025-01-15T00:00:00.000Z' },
      { from_phase: 'P6', to_phase: 'P7a', transitioned_at: '2025-02-01T00:00:00.000Z' },
      { from_phase: 'P7a', to_phase: 'P18', transitioned_at: '2025-08-01T00:00:00.000Z' },
    ];
    const tl = buildTimeline({
      permitType: 'New Houses',
      currentPhase: 'P18',
      phaseStartedAt: '2025-08-01T00:00:00.000Z',
      transitions,
      calibrationByPhase: {},
      now: MOCK_NOW,
    });

    // Completed entries: P3 (14d), P6 (17d), P7a (181d). Plus P18 (current).
    // No upcoming because P18 is terminal.
    const completed = tl.filter((e) => e.status === 'completed');
    const current = tl.filter((e) => e.status === 'current');
    const upcoming = tl.filter((e) => e.status === 'upcoming');

    expect(completed.length).toBe(3);
    expect(current.length).toBe(1);
    expect(upcoming.length).toBe(0);

    expect(completed[0]).toMatchObject({ phase: 'P3', days_in_phase: 14 });
    expect(completed[1]).toMatchObject({ phase: 'P6', days_in_phase: 17 });
    expect(completed[2]).toMatchObject({ phase: 'P7a', days_in_phase: 181 });
    expect(current[0]).toMatchObject({ phase: 'P18' });
  });
});

describe('buildTimeline — completed + current + upcoming (the canonical case)', () => {
  it('builds all three sections; days_in_phase computed correctly', () => {
    const transitions: TransitionRow[] = [
      { from_phase: null, to_phase: 'P3', transitioned_at: '2025-01-01T00:00:00.000Z' },
      { from_phase: 'P3', to_phase: 'P6', transitioned_at: '2025-01-15T00:00:00.000Z' },
      { from_phase: 'P6', to_phase: 'P7c', transitioned_at: '2025-12-01T00:00:00.000Z' },
    ];
    const calibrationByPhase = calibByPhase([
      { phase: 'P3', median_days: 12, p25_days: 7, p75_days: 21, sample_size: 1500 },
      { phase: 'P6',        median_days: 30, p25_days: 18, p75_days: 60, sample_size: 1400 },
      { phase: 'P7c',       median_days: 45, p25_days: 22, p75_days: 87, sample_size: 12453 },
      { phase: 'P8',        median_days: 30, p25_days: 15, p75_days: 60, sample_size: 8000 },
      { phase: 'P12',       median_days: 60, p25_days: 30, p75_days: 120, sample_size: 7000 },
      { phase: 'P15',       median_days: 45, p25_days: 20, p75_days: 90, sample_size: 6000 },
      { phase: 'P18',       median_days: 30, p25_days: 10, p75_days: 60, sample_size: 5000 },
    ]);

    const tl = buildTimeline({
      permitType: 'Small Residential Projects',
      currentPhase: 'P7c',
      phaseStartedAt: '2025-12-01T00:00:00.000Z',
      transitions,
      calibrationByPhase,
      now: MOCK_NOW, // 2026-05-09 → 159 days after 2025-12-01
    });

    const completed = tl.filter((e) => e.status === 'completed');
    const current = tl.filter((e) => e.status === 'current');
    const upcoming = tl.filter((e) => e.status === 'upcoming');

    // Completed: P3 (14d), P6 (320d) — P3 → P6 = 14d, P6 → P7c = 320d
    expect(completed.length).toBe(2);
    expect(completed[0]!.phase).toBe('P3');
    expect(completed[0]!.days_in_phase).toBe(14);
    expect(completed[1]!.phase).toBe('P6');
    expect(completed[1]!.days_in_phase).toBe(320);

    // Current: P7c, days_in_phase = 159 (NOW - phase_started_at).
    expect(current.length).toBe(1);
    expect(current[0]!.phase).toBe('P7c');
    expect(current[0]!.days_in_phase).toBe(159);
    expect(current[0]!.cohort_median_days).toBe(45); // from calibration
    expect(current[0]!.cohort_p75_days).toBe(87);

    // Upcoming: P8, P12, P15, P18 (per Small Residential Projects path).
    // Each entry uses cohort_median_days as days_in_phase (predicted).
    expect(upcoming.length).toBe(4);
    expect(upcoming.map((e) => e.phase)).toEqual(['P8', 'P12', 'P15', 'P18']);
    expect(upcoming[0]!.days_in_phase).toBe(30); // P8 median
    expect(upcoming[3]!.days_in_phase).toBe(30); // P18 median
  });
});

describe('buildTimeline — cohort fields populated from calibration map', () => {
  it('uses calibration data when present', () => {
    const tl = buildTimeline({
      permitType: 'New Houses',
      currentPhase: 'P7c',
      phaseStartedAt: '2025-12-01T00:00:00.000Z',
      transitions: [
        { from_phase: null, to_phase: 'P7c', transitioned_at: '2025-12-01T00:00:00.000Z' },
      ],
      calibrationByPhase: calibByPhase([
        { phase: 'P7c', median_days: 45, p25_days: 22, p75_days: 87, sample_size: 12453 },
      ]),
      now: MOCK_NOW,
    });

    const current = tl.find((e) => e.status === 'current')!;
    expect(current.cohort_median_days).toBe(45);
    expect(current.cohort_p25_days).toBe(22);
    expect(current.cohort_p75_days).toBe(87);
    expect(current.cohort_sample_size).toBe(12453);
  });

  it('fills cohort fields with null + 0 sample_size when calibration missing', () => {
    const tl = buildTimeline({
      permitType: 'New Houses',
      currentPhase: 'P7c',
      phaseStartedAt: '2025-12-01T00:00:00.000Z',
      transitions: [
        { from_phase: null, to_phase: 'P7c', transitioned_at: '2025-12-01T00:00:00.000Z' },
      ],
      calibrationByPhase: {},
      now: MOCK_NOW,
    });

    const current = tl.find((e) => e.status === 'current')!;
    expect(current.cohort_median_days).toBeNull();
    expect(current.cohort_p25_days).toBeNull();
    expect(current.cohort_p75_days).toBeNull();
    expect(current.cohort_sample_size).toBe(0);
  });
});

describe('buildTimeline — phase_name field populated from PHASE_NAMES', () => {
  it('every entry has the friendly name from Spec 84 §3', () => {
    const tl = buildTimeline({
      permitType: 'New Houses',
      currentPhase: 'P7c',
      phaseStartedAt: '2025-12-01T00:00:00.000Z',
      transitions: [
        { from_phase: null, to_phase: 'P3', transitioned_at: '2025-01-01T00:00:00.000Z' },
        { from_phase: 'P3', to_phase: 'P7c', transitioned_at: '2025-12-01T00:00:00.000Z' },
      ],
      calibrationByPhase: {},
      now: MOCK_NOW,
    });

    const completed = tl.filter((e) => e.status === 'completed');
    const current = tl.filter((e) => e.status === 'current')[0]!;
    expect(completed[0]!.phase_name).toBe('CoA Approved'); // P3
    expect(current.phase_name).toBe('Issued (Late)'); // P7c
  });
});

describe('buildTimeline — unknown permit_type fallback', () => {
  it('builds completed + current entries from transitions but no upcoming when permit_type unknown', () => {
    const tl = buildTimeline({
      permitType: 'NonexistentPermitType',
      currentPhase: 'P7c',
      phaseStartedAt: '2025-12-01T00:00:00.000Z',
      transitions: [
        { from_phase: null, to_phase: 'P3', transitioned_at: '2025-01-01T00:00:00.000Z' },
        { from_phase: 'P3', to_phase: 'P7c', transitioned_at: '2025-12-01T00:00:00.000Z' },
      ],
      calibrationByPhase: {},
      now: MOCK_NOW,
    });

    const upcoming = tl.filter((e) => e.status === 'upcoming');
    expect(upcoming.length).toBe(0);
    // Completed + current still present
    expect(tl.filter((e) => e.status === 'completed').length).toBe(1);
    expect(tl.filter((e) => e.status === 'current').length).toBe(1);
  });
});
