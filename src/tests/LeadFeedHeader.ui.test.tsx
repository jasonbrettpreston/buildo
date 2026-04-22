// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §4.2
//
// LeadFeedHeader UI tests — covers:
// - sticky position (`sticky top-0 z-20`) not fixed
// - location label fallback (null → "Set location", non-null → "Near you")
// - leadCount readout + singular/plural agreement
// - 44px touch target on the location button
// - filter sheet opens on tap
// - captureEvent fires on open with the correct payload

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist captureEvent mock before module import so the new emit in
// LeadFeedHeader is captured.
const captureEventMock = vi.fn();
vi.mock('@/lib/observability/capture', () => ({
  captureEvent: (...args: unknown[]) => captureEventMock(...args),
  initObservability: vi.fn(),
}));

// Mock vaul — the Drawer is tested in isolation elsewhere; for
// LeadFeedHeader we just need the import to resolve. The mock
// renders a simple `<div>` for Drawer open state so we can assert
// on the open/close prop without exercising real Vaul animation.
vi.mock('vaul', () => {
  const makeForwardingComponent = (tag = 'div', displayName = 'VaulMock') => {
    const Forward = React.forwardRef<
      HTMLDivElement,
      React.PropsWithChildren<Record<string, unknown>>
    >(({ children, ...rest }, ref) =>
      React.createElement(tag, { ref, ...(rest as Record<string, unknown>) }, children as React.ReactNode),
    );
    Forward.displayName = displayName;
    return Forward;
  };
  const Root = ({
    open,
    onOpenChange,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children: React.ReactNode;
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'vaul-root',
        'data-open': open ? 'true' : 'false',
        onClick: () => onOpenChange?.(!open),
      },
      open ? children : null,
    );
  return {
    Drawer: {
      Root,
      Portal: makeForwardingComponent(),
      Overlay: makeForwardingComponent(),
      Content: makeForwardingComponent(),
      Title: makeForwardingComponent('h2'),
      Description: makeForwardingComponent('p'),
      Trigger: makeForwardingComponent('button'),
      Close: makeForwardingComponent('button'),
    },
  };
});

import { LeadFeedHeader } from '@/features/leads/components/LeadFeedHeader';
import { useLeadFeedState } from '@/features/leads/hooks/useLeadFeedState';

beforeEach(() => {
  document.documentElement.style.width = '375px';
  captureEventMock.mockReset();
  useLeadFeedState.setState({
    _hasHydrated: true,
    hoveredLeadId: null,
    selectedLeadId: null,
    radiusKm: 10,
    location: null,
    snappedLocation: null,
  });
});

afterEach(() => {
  document.documentElement.style.width = '';
});

describe('LeadFeedHeader — layout', () => {
  it('renders sticky top-0 z-20 (not fixed) to avoid mobile address-bar bugs', () => {
    const { container } = render(<LeadFeedHeader leadCount={5} />);
    const header = container.querySelector('header');
    expect(header).not.toBeNull();
    expect(header?.className).toContain('sticky');
    expect(header?.className).toContain('top-0');
    expect(header?.className).toContain('z-20');
    expect(header?.className).not.toContain('fixed');
  });

  it('renders the backdrop-blur glass effect', () => {
    const { container } = render(<LeadFeedHeader leadCount={5} />);
    const header = container.querySelector('header');
    expect(header?.className).toContain('backdrop-blur-md');
    expect(header?.className).toContain('bg-feed/80');
  });
});

describe('LeadFeedHeader — location label', () => {
  it('renders "Set location" when Zustand location is null', () => {
    useLeadFeedState.setState({ location: null });
    render(<LeadFeedHeader leadCount={5} />);
    expect(screen.getByText(/Set location · 10km/i)).toBeDefined();
  });

  it('renders "Near you" when Zustand location has coords', () => {
    useLeadFeedState.setState({ location: { lat: 43.65, lng: -79.38 } });
    render(<LeadFeedHeader leadCount={5} />);
    expect(screen.getByText(/Near you · 10km/i)).toBeDefined();
  });

  it('does NOT leak coordinate values into the header text (PII safe)', () => {
    useLeadFeedState.setState({ location: { lat: 43.65, lng: -79.38 } });
    const { container } = render(<LeadFeedHeader leadCount={5} />);
    const headerText = container.querySelector('header')?.textContent ?? '';
    expect(headerText).not.toContain('43.65');
    expect(headerText).not.toContain('-79.38');
  });

  it('reflects the current radiusKm from Zustand', () => {
    useLeadFeedState.setState({ radiusKm: 25 });
    render(<LeadFeedHeader leadCount={5} />);
    expect(screen.getByText(/Set location · 25km/i)).toBeDefined();
  });
});

describe('LeadFeedHeader — lead count readout', () => {
  it('renders singular "lead" when count === 1', () => {
    render(<LeadFeedHeader leadCount={1} />);
    expect(screen.getByText('1 lead')).toBeDefined();
  });

  it('renders plural "leads" when count === 0', () => {
    render(<LeadFeedHeader leadCount={0} />);
    expect(screen.getByText('0 leads')).toBeDefined();
  });

  it('renders plural "leads" for counts > 1', () => {
    render(<LeadFeedHeader leadCount={42} />);
    expect(screen.getByText('42 leads')).toBeDefined();
  });
});

describe('LeadFeedHeader — tap target + accessibility', () => {
  it('location button has min-h-11 (44px touch target)', () => {
    const { container } = render(<LeadFeedHeader leadCount={5} />);
    const button = container.querySelector('button');
    expect(button?.className).toContain('min-h-11');
  });

  it('location button accessible name is derived from visible text (not a generic aria-label override)', () => {
    // Gemini review caught that a static aria-label would HIDE the
    // dynamic location/radius readout from screen readers. The
    // visible text is the accessible name now.
    render(<LeadFeedHeader leadCount={5} />);
    const button = screen.getByRole('button', {
      name: /Set location · 10km/,
    });
    expect(button).toBeDefined();
    // No aria-label override
    expect(button.getAttribute('aria-label')).toBeNull();
  });

  it('location button carries aria-expanded reflecting the sheet state', () => {
    render(<LeadFeedHeader leadCount={5} />);
    const button = screen.getByRole('button', {
      name: /Set location · 10km/,
    });
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('LeadFeedHeader — filter sheet trigger', () => {
  it('opens the filter sheet on tap', () => {
    render(<LeadFeedHeader leadCount={5} />);
    // Before tap: drawer should be closed (vaul mock data-open=false)
    expect(
      document.querySelector('[data-testid="vaul-root"]')?.getAttribute('data-open'),
    ).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: /Set location · 10km|Near you · 10km/ }));

    // After tap: drawer open
    expect(
      document.querySelector('[data-testid="vaul-root"]')?.getAttribute('data-open'),
    ).toBe('true');
  });

  it('emits lead_feed.filter_sheet_opened (dedicated event, NOT filter_changed) on tap', () => {
    // Independent reviewer Item 15: conflating sheet-open with
    // filter-change would pollute PostHog analytics. The header
    // must emit a dedicated event name for the UI navigation.
    render(<LeadFeedHeader leadCount={5} />);
    fireEvent.click(screen.getByRole('button', { name: /Set location · 10km|Near you · 10km/ }));
    expect(captureEventMock).toHaveBeenCalledWith(
      'lead_feed.filter_sheet_opened',
      expect.objectContaining({
        source: 'header_tap',
      }),
    );
    // Verify it did NOT fire the old conflated name
    expect(captureEventMock).not.toHaveBeenCalledWith(
      'lead_feed.filter_changed',
      expect.any(Object),
    );
  });
});
