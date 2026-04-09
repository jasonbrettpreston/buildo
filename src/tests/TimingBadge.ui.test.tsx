// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §4.6
//
// TimingBadge UI tests — 375px viewport, 4 score-band tones,
// confidence "est." visibility, a11y label correctness, edge cases
// at band boundaries (25 = NOW, 24 = Soon, 20 = Soon, 19 = Upcoming,
// 10 = Upcoming, 9 = Future, 0 = Future).

import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  TimingBadge,
  getTimingTone,
} from '@/features/leads/components/badges/TimingBadge';

beforeEach(() => {
  document.documentElement.style.width = '375px';
});

afterEach(() => {
  document.documentElement.style.width = '';
});

describe('getTimingTone — score-band boundaries (spec 74 §Timing)', () => {
  it('score 25 (exact boundary) → NOW amber', () => {
    const tone = getTimingTone(25);
    expect(tone.label).toBe('NOW');
    expect(tone.tremorColor).toBe('amber');
    expect(tone.bg).toBe('bg-amber-hardhat');
  });

  it('score 24 (just below NOW) → Soon emerald', () => {
    expect(getTimingTone(24).label).toBe('Soon');
  });

  it('score 20 (exact Soon boundary) → Soon emerald', () => {
    const tone = getTimingTone(20);
    expect(tone.label).toBe('Soon');
    expect(tone.tremorColor).toBe('emerald');
  });

  it('score 19 (just below Soon) → Upcoming blue', () => {
    expect(getTimingTone(19).label).toBe('Upcoming');
  });

  it('score 10 (exact Upcoming boundary) → Upcoming blue', () => {
    const tone = getTimingTone(10);
    expect(tone.label).toBe('Upcoming');
    expect(tone.tremorColor).toBe('blue');
  });

  it('score 9 (just below Upcoming) → Future gray', () => {
    expect(getTimingTone(9).label).toBe('Future');
  });

  it('score 0 (floor) → Future gray', () => {
    const tone = getTimingTone(0);
    expect(tone.label).toBe('Future');
    expect(tone.tremorColor).toBe('gray');
  });

  it('score 100 (ceiling) → NOW amber', () => {
    expect(getTimingTone(100).label).toBe('NOW');
  });

  it('every tone has contrasting text color against its background (WCAG sanity)', () => {
    // Amber + emerald backgrounds → dark text (neutral-900)
    expect(getTimingTone(25).text).toBe('text-neutral-900');
    expect(getTimingTone(20).text).toBe('text-neutral-900');
    // Blue + gray backgrounds → light text (neutral-100)
    expect(getTimingTone(10).text).toBe('text-neutral-100');
    expect(getTimingTone(0).text).toBe('text-neutral-100');
  });
});

describe('TimingBadge — render behavior', () => {
  it('renders the display string', () => {
    render(<TimingBadge display="Need now" score={28} confidence="high" />);
    expect(screen.getByText('Need now')).toBeDefined();
  });

  it('renders the score in the progress circle', () => {
    render(<TimingBadge display="Soon" score={22} confidence="medium" />);
    expect(screen.getByText('22')).toBeDefined();
  });

  it('shows the "est." tag when confidence is NOT high (medium)', () => {
    render(<TimingBadge display="2-4 weeks" score={22} confidence="medium" />);
    expect(screen.getByText('est.')).toBeDefined();
  });

  it('shows the "est." tag when confidence is low', () => {
    render(<TimingBadge display="Estimated" score={15} confidence="low" />);
    expect(screen.getByText('est.')).toBeDefined();
  });

  it('HIDES the "est." tag when confidence is high', () => {
    render(<TimingBadge display="Need now" score={28} confidence="high" />);
    expect(screen.queryByText('est.')).toBeNull();
  });

  it('aria-label includes tone label + display + confidence + score', () => {
    render(<TimingBadge display="2-4 weeks" score={22} confidence="medium" />);
    // Phase 3-ii adversarial review: role switched from "group" to
    // "img" because Biome's a11y rule prefers semantic elements for
    // role="group" — img is the WAI-ARIA idiom for composite visual
    // indicators announced as a single unit.
    const label = screen.getByRole('img').getAttribute('aria-label');
    expect(label).toContain('Soon');
    expect(label).toContain('2-4 weeks');
    expect(label).toContain('medium');
    expect(label).toContain('22');
  });

  it('wraps long display strings with truncate (layout overflow defense)', () => {
    const longDisplay = 'Trade needed within 6-8 weeks per Tier 2 calibration heuristic';
    const { container } = render(
      <TimingBadge display={longDisplay} score={18} confidence="medium" />,
    );
    const span = container.querySelector('.truncate');
    expect(span).not.toBeNull();
  });

  it('pill container has min-h-11 (44px) for visual accessibility', () => {
    const { container } = render(
      <TimingBadge display="Soon" score={22} confidence="high" />,
    );
    expect(container.querySelector('.min-h-11')).not.toBeNull();
  });
});
