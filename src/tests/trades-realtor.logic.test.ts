// 🔗 SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §1.3 + §3.5
//             docs/specs/03-mobile/95_mobile_user_profiles.md §2.5.1
//
// Logic tests asserting the realtor persona is wired into the canonical
// trade catalog AND the lifecycle phase calibration. Cycle 7 wire-up.
//
// `TRADES` (src/lib/classification/trades.ts) is the canonical client-side
// list — Spec 91 §1.3 promises a row for each persona's `trade_slug`.
// `TRADE_TARGET_PHASE_FALLBACK` (src/lib/classification/lifecycle-phase.ts)
// is the per-trade `(bid_phase, work_phase)` calibration that drives the
// flight-board temporal grouping + the lead-feed scoring.
//
// Realtor calibration (Cycle 7 product call):
//   - bid_phase: 'P1'  — earliest visibility (intake; pre-issuance)
//   - work_phase: 'P19' — latest stage (winddown, ≈ predicted occupancy)
// Honors Spec 91 §1.2 algorithmic invariant: persona-specific behavior is
// expressed via DB calibration only, NEVER algorithm branching.

import { describe, it, expect } from 'vitest';
import { TRADES, getTradeBySlug } from '@/lib/classification/trades';
import { TRADE_TARGET_PHASE_FALLBACK, TRADE_TARGET_PHASE } from '@/lib/classification/lifecycle-phase';

describe('TRADES — realtor persona row (Cycle 7)', () => {
  it('contains a realtor entry with the canonical shape', () => {
    const realtor = getTradeBySlug('realtor');
    expect(realtor).toBeDefined();
  });

  it('realtor entry has id 33 and sort_order 33 (33rd canonical trade)', () => {
    const realtor = getTradeBySlug('realtor');
    expect(realtor?.id).toBe(33);
    expect(realtor?.sort_order).toBe(33);
  });

  it('realtor entry has a non-empty human-readable name', () => {
    const realtor = getTradeBySlug('realtor');
    expect(realtor?.name).toBeTruthy();
    expect(realtor?.name).toMatch(/real estate/i);
  });

  it('realtor entry has icon + color set (mobile trade picker requires them)', () => {
    const realtor = getTradeBySlug('realtor');
    expect(realtor?.icon).toBeTruthy();
    expect(realtor?.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('TRADES list contains exactly 33 entries after Cycle 7 wire-up', () => {
    // Pre-Cycle-7: 32 construction trades. Post-Cycle-7: 32 + realtor = 33.
    expect(TRADES.length).toBe(33);
  });

  it('realtor slug does not collide with any existing construction trade slug', () => {
    const realtorEntries = TRADES.filter((t) => t.slug === 'realtor');
    expect(realtorEntries.length).toBe(1);
  });
});

describe('TRADE_TARGET_PHASE_FALLBACK — realtor calibration (Cycle 7)', () => {
  it('contains a realtor entry', () => {
    expect(TRADE_TARGET_PHASE_FALLBACK['realtor']).toBeDefined();
  });

  it('realtor bid_phase is P1 (earliest visibility — intake)', () => {
    expect(TRADE_TARGET_PHASE_FALLBACK['realtor']?.bid_phase).toBe('P1');
  });

  it('realtor work_phase is P19 (latest stage — winddown, ≈ predicted occupancy)', () => {
    expect(TRADE_TARGET_PHASE_FALLBACK['realtor']?.work_phase).toBe('P19');
  });

  it('TRADE_TARGET_PHASE alias exposes the same realtor row', () => {
    expect(TRADE_TARGET_PHASE['realtor']).toEqual(TRADE_TARGET_PHASE_FALLBACK['realtor']);
  });
});

describe('Spec 91 §1.2 algorithmic invariant — realtor stays persona-agnostic at the algorithm layer', () => {
  it('realtor uses the same TradeTarget shape as construction trades (no special-cased fields)', () => {
    const realtor = TRADE_TARGET_PHASE_FALLBACK['realtor'];
    const plumbing = TRADE_TARGET_PHASE_FALLBACK['plumbing'];
    expect(realtor).toBeDefined();
    expect(plumbing).toBeDefined();
    // Both have exactly the same keys — realtor is NOT a special-shape entry.
    expect(Object.keys(realtor!).sort()).toEqual(Object.keys(plumbing!).sort());
  });
});
