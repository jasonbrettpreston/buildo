// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §4.5
//
// OpportunityBadge UI tests — render all 4 opportunity types, verify
// aria-label correctness, verify lookup table completeness, 375px
// viewport.

import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  OpportunityBadge,
  __opportunityLookup,
  type OpportunityType,
} from '@/features/leads/components/badges/OpportunityBadge';

beforeEach(() => {
  document.documentElement.style.width = '375px';
});

afterEach(() => {
  document.documentElement.style.width = '';
});

describe('OpportunityBadge — lookup table invariants', () => {
  it('lookup table has exactly 4 entries (spec 74 §Opportunity)', () => {
    expect(Object.keys(__opportunityLookup)).toHaveLength(4);
  });

  it('every entry has label + bg + text + Icon', () => {
    for (const [key, meta] of Object.entries(__opportunityLookup)) {
      expect(meta.label, `${key}.label`).toBeDefined();
      expect(meta.bg, `${key}.bg`).toMatch(/^bg-/);
      expect(meta.text, `${key}.text`).toMatch(/^text-/);
      expect(meta.Icon, `${key}.Icon`).toBeDefined();
    }
  });

  it('homeowner tone uses amber-hardhat (highest action signal per spec 74)', () => {
    expect(__opportunityLookup.homeowner.bg).toBe('bg-amber-hardhat');
    expect(__opportunityLookup.homeowner.text).toBe('text-neutral-900');
  });

  it('newbuild tone uses green-safety', () => {
    expect(__opportunityLookup.newbuild.bg).toBe('bg-green-safety');
  });

  it('builder-led + unknown tones are muted gray (lower attention)', () => {
    expect(__opportunityLookup['builder-led'].bg).toMatch(/neutral/);
    expect(__opportunityLookup.unknown.bg).toMatch(/neutral/);
  });
});

describe('OpportunityBadge — render', () => {
  const types: OpportunityType[] = ['homeowner', 'newbuild', 'builder-led', 'unknown'];

  it.each(types)('renders "%s" without crashing', (type) => {
    render(<OpportunityBadge type={type} />);
    const badge = screen.getByRole('img');
    expect(badge).toBeDefined();
  });

  it('renders the label text for each type', () => {
    for (const type of types) {
      const { unmount } = render(<OpportunityBadge type={type} />);
      expect(screen.getByText(__opportunityLookup[type].label)).toBeDefined();
      unmount();
    }
  });

  it('aria-label reflects the human-readable opportunity label', () => {
    render(<OpportunityBadge type="homeowner" />);
    const badge = screen.getByRole('img');
    expect(badge.getAttribute('aria-label')).toBe('Opportunity: Homeowner');
  });

  it('aria-label for builder-led uses the spec 74 label casing', () => {
    render(<OpportunityBadge type="builder-led" />);
    expect(
      screen.getByRole('img').getAttribute('aria-label'),
    ).toBe('Opportunity: Builder-led');
  });

  it('contains an inline svg icon (decorative, aria-hidden)', () => {
    const { container } = render(<OpportunityBadge type="homeowner" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('unknown fallback renders muted gray without crash', () => {
    render(<OpportunityBadge type="unknown" />);
    expect(screen.getByText('Unknown')).toBeDefined();
  });

  it('min-h-8 is applied (presentational badge, NOT a touch target)', () => {
    const { container } = render(<OpportunityBadge type="homeowner" />);
    expect(container.querySelector('.min-h-8')).not.toBeNull();
  });
});
