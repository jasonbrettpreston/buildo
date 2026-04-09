// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11 Phase 5 step 5
//
// EmptyLeadState UI tests — three-variant discriminator + the
// expand-radius CTA's MAX_RADIUS_KM clamping behavior.

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmptyLeadState } from '@/features/leads/components/EmptyLeadState';

beforeEach(() => {
  document.documentElement.style.width = '375px';
});

afterEach(() => {
  document.documentElement.style.width = '';
});

describe('EmptyLeadState — no_results variant', () => {
  it('renders the no-results message + the expand CTA', () => {
    render(
      <EmptyLeadState
        variant="no_results"
        currentRadiusKm={10}
        maxRadiusKm={50}
        onExpandRadius={vi.fn()}
      />,
    );
    expect(screen.getByText(/no leads in this area/i)).toBeDefined();
    expect(
      screen.getByRole('button', { name: /expand to 15km/i }),
    ).toBeDefined();
  });

  it('calls onExpandRadius with current + 5 when the CTA is clicked', () => {
    const onExpand = vi.fn();
    render(
      <EmptyLeadState
        variant="no_results"
        currentRadiusKm={10}
        maxRadiusKm={50}
        onExpandRadius={onExpand}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /expand to 15km/i }));
    expect(onExpand).toHaveBeenCalledWith(15);
  });

  it('clamps the next radius to maxRadiusKm', () => {
    const onExpand = vi.fn();
    render(
      <EmptyLeadState
        variant="no_results"
        currentRadiusKm={48}
        maxRadiusKm={50}
        onExpandRadius={onExpand}
      />,
    );
    // 48 + 5 = 53, clamped to 50
    fireEvent.click(screen.getByRole('button', { name: /expand to 50km/i }));
    expect(onExpand).toHaveBeenCalledWith(50);
  });

  it('hides the CTA entirely when already at the max radius (no dead button)', () => {
    render(
      <EmptyLeadState
        variant="no_results"
        currentRadiusKm={50}
        maxRadiusKm={50}
        onExpandRadius={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /expand/i })).toBeNull();
    expect(screen.getByText(/maximum 50km/i)).toBeDefined();
  });

  it('exposes the section as role="status" with polite live region', () => {
    const { container } = render(
      <EmptyLeadState
        variant="no_results"
        currentRadiusKm={10}
        maxRadiusKm={50}
        onExpandRadius={vi.fn()}
      />,
    );
    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.getAttribute('aria-live')).toBe('polite');
  });

  it('CTA meets the 44px touch target minimum', () => {
    const { container } = render(
      <EmptyLeadState
        variant="no_results"
        currentRadiusKm={10}
        maxRadiusKm={50}
        onExpandRadius={vi.fn()}
      />,
    );
    const button = container.querySelector('button');
    expect(button?.className).toMatch(/h-12/); // size="lg" = 48px > 44
  });
});

describe('EmptyLeadState — offline variant', () => {
  it('renders the offline message + retry CTA', () => {
    render(
      <EmptyLeadState
        variant="offline"
        currentRadiusKm={10}
        maxRadiusKm={50}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/you.+offline/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /try again/i })).toBeDefined();
  });

  it('calls onRetry when the CTA is clicked', () => {
    const onRetry = vi.fn();
    render(
      <EmptyLeadState
        variant="offline"
        currentRadiusKm={10}
        maxRadiusKm={50}
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('EmptyLeadState — unreachable variant', () => {
  it('renders the unreachable message + retry CTA', () => {
    render(
      <EmptyLeadState
        variant="unreachable"
        currentRadiusKm={10}
        maxRadiusKm={50}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/can.+reach the server/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /try again/i })).toBeDefined();
  });

  it('calls onRetry when the CTA is clicked', () => {
    const onRetry = vi.fn();
    render(
      <EmptyLeadState
        variant="unreachable"
        currentRadiusKm={10}
        maxRadiusKm={50}
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
