// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.2
//
// Pure logic tests for computeTemporalGroup (src/lib/leads/flight-board-temporal.ts).
//
// Covers:
//   - The 3 existing temporal buckets (action_required / departing_soon /
//     on_the_horizon) based on lifecycle_stalled + predicted_start.
//   - The WF3 #13 Finding F demotion contract: score=NULL or score≤0
//     forces on_the_horizon regardless of other inputs, preventing
//     meaningless leads from piling up at the top of the Flight Board.

import { describe, it, expect } from 'vitest';
import { computeTemporalGroup } from '@/lib/leads/flight-board-temporal';

const NOW = new Date('2026-05-22T12:00:00Z');

describe('computeTemporalGroup — existing temporal contract (score>0)', () => {
  it('stalled + meaningful score → action_required', () => {
    expect(
      computeTemporalGroup(
        { lifecycle_stalled: true, predicted_start: null, opportunity_score: 42 },
        NOW,
      ),
    ).toBe('action_required');
  });

  it('past predicted_start + meaningful score → action_required', () => {
    expect(
      computeTemporalGroup(
        { lifecycle_stalled: false, predicted_start: '2026-05-01', opportunity_score: 42 },
        NOW,
      ),
    ).toBe('action_required');
  });

  it('within 14 days + meaningful score → departing_soon', () => {
    expect(
      computeTemporalGroup(
        { lifecycle_stalled: false, predicted_start: '2026-05-30', opportunity_score: 42 },
        NOW,
      ),
    ).toBe('departing_soon');
  });

  it('beyond 14 days + meaningful score → on_the_horizon', () => {
    expect(
      computeTemporalGroup(
        { lifecycle_stalled: false, predicted_start: '2026-12-01', opportunity_score: 42 },
        NOW,
      ),
    ).toBe('on_the_horizon');
  });

  it('null predicted_start + meaningful score → on_the_horizon', () => {
    expect(
      computeTemporalGroup(
        { lifecycle_stalled: false, predicted_start: null, opportunity_score: 42 },
        NOW,
      ),
    ).toBe('on_the_horizon');
  });
});

describe('computeTemporalGroup — WF3 #13 Finding F demotion (score=NULL or score≤0)', () => {
  it('Demotion: score=NULL + past predicted_start → on_the_horizon (was action_required pre-fix)', () => {
    // The canonical Finding F case. Plumbing permit after Finding D safe-skip
    // has no cost estimate → null opportunity_score → demoted out of the
    // action_required bucket despite past predicted_start.
    expect(
      computeTemporalGroup(
        { lifecycle_stalled: false, predicted_start: '2026-05-01', opportunity_score: null },
        NOW,
      ),
    ).toBe('on_the_horizon');
  });

  it('Demotion: score=0 + past predicted_start → on_the_horizon (was action_required pre-fix)', () => {
    // Real 0 from the formula (heavy competition + low trade value). Same
    // demotion semantic as NULL — both are meaningless for action_required.
    expect(
      computeTemporalGroup(
        { lifecycle_stalled: false, predicted_start: '2026-05-01', opportunity_score: 0 },
        NOW,
      ),
    ).toBe('on_the_horizon');
  });

  it('Demotion overrides stalled: score=NULL + lifecycle_stalled=true → on_the_horizon', () => {
    // The demotion rule fires BEFORE the lifecycle_stalled check, so
    // stalled+meaningless leads also drop to horizon. Defensible: a stalled
    // meaningless lead is still meaningless — the operator gains nothing
    // from seeing it at the top of action_required.
    expect(
      computeTemporalGroup(
        { lifecycle_stalled: true, predicted_start: null, opportunity_score: null },
        NOW,
      ),
    ).toBe('on_the_horizon');
  });

  it('Demotion fires on score=0 even with future predicted_start (any bucket → horizon)', () => {
    // Demotion is unconditional on score; doesn't care about predicted_start.
    // A score=0 lead 14 days from "departing" still gets demoted because the
    // operator has no opportunity signal to act on.
    expect(
      computeTemporalGroup(
        { lifecycle_stalled: false, predicted_start: '2026-05-30', opportunity_score: 0 },
        NOW,
      ),
    ).toBe('on_the_horizon');
  });

  it('Regression lock: score=1 (just above demotion threshold) + past predicted_start → action_required', () => {
    // The threshold is `<= 0`. score=1 is the smallest "meaningful" value.
    // Verifies the boundary isn't inadvertently widened to `<= 1`.
    expect(
      computeTemporalGroup(
        { lifecycle_stalled: false, predicted_start: '2026-05-01', opportunity_score: 1 },
        NOW,
      ),
    ).toBe('action_required');
  });

  it('Regression lock: negative score (defensive) → on_the_horizon', () => {
    // computeOpportunityScores clamps to [0, 100] so negative shouldn't occur
    // in production, but defense-in-depth: any non-positive score demotes.
    expect(
      computeTemporalGroup(
        { lifecycle_stalled: false, predicted_start: '2026-05-01', opportunity_score: -5 },
        NOW,
      ),
    ).toBe('on_the_horizon');
  });
});
