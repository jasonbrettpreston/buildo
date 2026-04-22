// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §4.8
//
// SkeletonLeadCard UI tests — 375px mobile viewport, accessibility
// semantics, dimension invariants that must match PermitLeadCard
// (3-iii) to prevent CLS on the skeleton → card transition.

import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SkeletonLeadCard } from '@/features/leads/components/SkeletonLeadCard';

beforeEach(() => {
  // Mobile-first viewport (spec 74 + standards §1.1)
  document.documentElement.style.width = '375px';
});

afterEach(() => {
  document.documentElement.style.width = '';
});

describe('SkeletonLeadCard', () => {
  it('renders without props', () => {
    const { container } = render(<SkeletonLeadCard />);
    expect(container.firstChild).toBeDefined();
  });

  it('carries role="status" + aria-busy="true" so screen readers announce loading', () => {
    render(<SkeletonLeadCard />);
    const status = screen.getByRole('status', { name: /loading lead card/i });
    expect(status).toBeDefined();
    expect(status.getAttribute('aria-busy')).toBe('true');
  });

  it('has a single aria-labelled region so the skeleton blocks are not enumerated', () => {
    render(<SkeletonLeadCard />);
    // The wrapper has aria-label; individual Skeleton blocks carry
    // aria-hidden so the screen reader sees only one labelled element
    // and doesn't read "in progress" 8 times.
    const labelled = screen.getAllByLabelText(/loading lead card/i);
    expect(labelled).toHaveLength(1);
  });

  it('includes a 44px timing badge placeholder to match the real card layout (prevents CLS)', () => {
    const { container } = render(<SkeletonLeadCard />);
    // The timing badge placeholder must match TimingBadge's 44px min-h.
    // Assert via class name presence — the Tailwind h-11 utility is
    // exactly 44px (2.75rem × 16px base).
    const h11Block = container.querySelector('.h-11');
    expect(h11Block).not.toBeNull();
  });

  it('includes a thumbnail placeholder with 80×60 dimensions (matches PermitLeadCard)', () => {
    const { container } = render(<SkeletonLeadCard />);
    // w-20 = 80px, h-[60px] = 60px (arbitrary value because Tailwind
    // has no h-15 in the default spacing scale).
    const thumbnail = container.querySelector('.w-20');
    expect(thumbnail).not.toBeNull();
    expect(container.querySelector('.h-\\[60px\\]')).not.toBeNull();
  });

  it('has the spec 74 border-l-4 placeholder with default future (gray) tone', () => {
    const { container } = render(<SkeletonLeadCard />);
    expect(container.querySelector('.border-l-4')).not.toBeNull();
    expect(container.querySelector('.border-l-neutral-700')).not.toBeNull();
  });

  it('accepts a tone prop and applies the matching border color (prevents flash on swap)', () => {
    const { container, rerender } = render(<SkeletonLeadCard tone="now" />);
    expect(container.querySelector('.border-l-amber-hardhat')).not.toBeNull();
    rerender(<SkeletonLeadCard tone="soon" />);
    expect(container.querySelector('.border-l-green-safety')).not.toBeNull();
    rerender(<SkeletonLeadCard tone="upcoming" />);
    expect(container.querySelector('.border-l-blue-blueprint')).not.toBeNull();
  });

  it('inner Skeleton blocks do NOT have role="status" (outer wrapper owns the live region)', () => {
    render(<SkeletonLeadCard />);
    // The single status element is the outer Card wrapper.
    const statusElements = screen.getAllByRole('status');
    expect(statusElements).toHaveLength(1);
  });

  it('contains no interactive elements (skeleton is purely presentational)', () => {
    const { container } = render(<SkeletonLeadCard />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('a').length).toBe(0);
    expect(container.querySelectorAll('input').length).toBe(0);
  });
});
