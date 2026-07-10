// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §4 + §5
//
// Logic locks for the Flight Center flight-semantics derivations:
//   · computeWatchlistTemporalGroup — the [PF12]/[ORC4] aggregation WRAPPER:
//     lifecycle_stalled wins FIRST, everything else DELEGATES to the
//     UNTOUCHED shared computeTemporalGroup (reuse pin — no fork).
//   · isDelayed — the DELAYED badge derivation (stalled OR past-due
//     aggregated predicted_start; null start is honest not-delayed).
//   · aggregateForecastRows — the client-side mirror of the GET /watchlist
//     SQL aggregation ([PF14] drawer reconcile): earliest predicted_start
//     supplies the window; score is the null-safe MAX.
//   · buildLeadKey coa branch ([ORC5]) — byte-exact `coa:<application_number>`
//     (the trade_forecasts.lead_id join depends on it), permit branch
//     zero-padding preserved, RecordLeadViewInput NOT widened.

import { describe, it, expect } from 'vitest';
import {
  computeWatchlistTemporalGroup,
  isDelayed,
  aggregateForecastRows,
} from '@/lib/admin/watchlist-temporal';
import { computeTemporalGroup } from '@/lib/leads/flight-board-temporal';
import { buildLeadKey } from '@/features/leads/lib/record-lead-view';

const NOW = new Date('2026-07-09T12:00:00Z');

describe('computeWatchlistTemporalGroup — [PF12] wrapper precedence', () => {
  it('stalled + null score → action_required (the divergence the wrapper exists for)', () => {
    const row = { lifecycle_stalled: true, predicted_start: null, opportunity_score: null };
    // The SHARED function demotes null-score rows to on_the_horizon BEFORE
    // its stalled check (WF3-#13 consumer semantics — pinned unchanged):
    expect(computeTemporalGroup(row, NOW)).toBe('on_the_horizon');
    // The admin wrapper puts the DELAYED project where the operator looks:
    expect(computeWatchlistTemporalGroup(row, NOW)).toBe('action_required');
  });

  it('non-stalled rows DELEGATE to the untouched shared function (reuse pin)', () => {
    const cases = [
      { lifecycle_stalled: false, predicted_start: null, opportunity_score: null },
      { lifecycle_stalled: false, predicted_start: '2026-07-01', opportunity_score: 50 },
      { lifecycle_stalled: false, predicted_start: '2026-07-15', opportunity_score: 50 },
      { lifecycle_stalled: false, predicted_start: '2026-09-01', opportunity_score: 50 },
      { lifecycle_stalled: false, predicted_start: '2026-09-01', opportunity_score: 0 },
    ];
    for (const row of cases) {
      expect(computeWatchlistTemporalGroup(row, NOW)).toBe(computeTemporalGroup(row, NOW));
    }
  });

  it('past-due start with a meaningful score → action_required (shared semantics)', () => {
    expect(
      computeWatchlistTemporalGroup(
        { lifecycle_stalled: false, predicted_start: '2026-07-01', opportunity_score: 40 },
        NOW,
      ),
    ).toBe('action_required');
  });

  it('start within 14 days → departing_soon (shared semantics)', () => {
    expect(
      computeWatchlistTemporalGroup(
        { lifecycle_stalled: false, predicted_start: '2026-07-15', opportunity_score: 40 },
        NOW,
      ),
    ).toBe('departing_soon');
  });
});

describe('isDelayed — the DELAYED badge derivation', () => {
  it('stalled → delayed regardless of predicted_start', () => {
    expect(isDelayed({ lifecycle_stalled: true, predicted_start: null }, NOW)).toBe(true);
    expect(isDelayed({ lifecycle_stalled: true, predicted_start: '2027-01-01' }, NOW)).toBe(true);
  });

  it('past-due predicted_start → delayed', () => {
    expect(isDelayed({ lifecycle_stalled: false, predicted_start: '2026-07-01' }, NOW)).toBe(true);
  });

  it('future predicted_start → not delayed', () => {
    expect(isDelayed({ lifecycle_stalled: false, predicted_start: '2026-08-01' }, NOW)).toBe(false);
  });

  it('null predicted_start → NOT delayed (absent-vs-null honesty)', () => {
    expect(isDelayed({ lifecycle_stalled: false, predicted_start: null }, NOW)).toBe(false);
  });
});

describe('aggregateForecastRows — [PF14] reconcile mirror of the list SQL', () => {
  it('earliest predicted_start supplies the p25/p75 window; score is MAX across rows', () => {
    const agg = aggregateForecastRows([
      { predicted_start: '2026-08-01', p25_days: 10, p75_days: 30, opportunity_score: 20 },
      { predicted_start: '2026-06-20', p25_days: 5, p75_days: 16, opportunity_score: 45 },
      { predicted_start: null, p25_days: null, p75_days: null, opportunity_score: 80 },
    ]);
    expect(agg.predicted_start).toBe('2026-06-20');
    expect(agg.p25_days).toBe(5);
    expect(agg.p75_days).toBe(16);
    // MAX includes the start-less row's score — activity gating happened
    // upstream; the score axis is independent of the start axis.
    expect(agg.opportunity_score).toBe(80);
  });

  it('no rows → all-null aggregate', () => {
    expect(aggregateForecastRows([])).toEqual({
      predicted_start: null,
      p25_days: null,
      p75_days: null,
      opportunity_score: null,
    });
  });

  it('score 0 is preserved (null-safe MAX, not falsy-coalesced)', () => {
    const agg = aggregateForecastRows([
      { predicted_start: null, p25_days: null, p75_days: null, opportunity_score: 0 },
    ]);
    expect(agg.opportunity_score).toBe(0);
  });
});

describe('buildLeadKey — coa branch ([ORC5])', () => {
  it('coa key is byte-exact `coa:<application_number>` — no padding, verbatim', () => {
    expect(
      buildLeadKey({ lead_type: 'coa', coa_application_number: 'A0391/25NY' }),
    ).toBe('coa:A0391/25NY');
  });

  it('permit branch keeps the LPAD-parity zero-padding (unchanged fence)', () => {
    expect(
      buildLeadKey({ lead_type: 'permit', permit_num: '20 139047 BLD', revision_num: '0' }),
    ).toBe('permit:20 139047 BLD:00');
    expect(
      buildLeadKey({ lead_type: 'permit', permit_num: 'X', revision_num: '000' }),
    ).toBe('permit:X:00');
  });

  it('builder branch unchanged', () => {
    expect(buildLeadKey({ lead_type: 'builder', entity_id: 42 })).toBe('builder:42');
  });
});
