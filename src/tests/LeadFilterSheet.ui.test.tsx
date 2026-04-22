// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §4.3
//
// LeadFilterSheet UI tests — covers the 8 unhappy/happy paths from
// the Phase 3-v plan plus the 4 self-checklist items related to the
// sheet body (deselect guard, parseInt radix, DrawerTitle presence,
// reset-closes-but-radius-doesn't semantics).

import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captureEventMock = vi.fn();
vi.mock('@/lib/observability/capture', () => ({
  captureEvent: (...args: unknown[]) => captureEventMock(...args),
  initObservability: vi.fn(),
}));

// Mock vaul so the sheet's internal Drawer.Root actually renders
// children when open=true. The `data-open` attribute lets us assert
// on the open/close state without exercising real Vaul animation.
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
        'data-on-open-change': onOpenChange ? 'true' : 'false',
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

import { LeadFilterSheet } from '@/features/leads/components/LeadFilterSheet';
import { DEFAULT_RADIUS_KM, useLeadFeedState } from '@/features/leads/hooks/useLeadFeedState';

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

describe('LeadFilterSheet — open / close', () => {
  it('renders nothing when open=false', () => {
    render(<LeadFilterSheet open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText('Filters')).toBeNull();
  });

  it('renders the DrawerTitle "Filters" when open=true (Radix ARIA requirement)', () => {
    render(<LeadFilterSheet open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText('Filters')).toBeDefined();
  });

  it('renders the description copy when open', () => {
    render(<LeadFilterSheet open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText(/adjust your search radius/i)).toBeDefined();
  });
});

describe('LeadFilterSheet — radius ToggleGroup', () => {
  it('renders all 5 radius options (5/10/20/30/50)', () => {
    render(<LeadFilterSheet open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText('5km')).toBeDefined();
    expect(screen.getByText('10km')).toBeDefined();
    expect(screen.getByText('20km')).toBeDefined();
    expect(screen.getByText('30km')).toBeDefined();
    expect(screen.getByText('50km')).toBeDefined();
  });

  it('highlights the currently-selected radius via data-[state=on]', () => {
    useLeadFeedState.setState({ radiusKm: 20 });
    render(<LeadFilterSheet open={true} onOpenChange={vi.fn()} />);
    const active = screen.getByRole('radio', { name: /20 kilometres/i });
    expect(active.getAttribute('data-state')).toBe('on');
  });

  it('changes radius in Zustand when a different option is tapped', () => {
    render(<LeadFilterSheet open={true} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: /30 kilometres/i }));
    expect(useLeadFeedState.getState().radiusKm).toBe(30);
  });

  it('emits lead_feed.filter_changed with from/to/source on radius change', () => {
    useLeadFeedState.setState({ radiusKm: 10 });
    render(<LeadFilterSheet open={true} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: /20 kilometres/i }));
    expect(captureEventMock).toHaveBeenCalledWith(
      'lead_feed.filter_changed',
      expect.objectContaining({
        field: 'radius',
        from: 10,
        to: 20,
        source: 'filter_sheet',
      }),
    );
  });

  it('does NOT auto-close the sheet on radius change (user should be able to preview multiple values)', () => {
    const onOpenChange = vi.fn();
    render(<LeadFilterSheet open={true} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /30 kilometres/i }));
    // onOpenChange(false) should NOT have been called from radius change
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('CRITICAL guard: deselect (onValueChange with empty string) does NOT poison Zustand with NaN', async () => {
    // Radix ToggleGroup fires onValueChange('') when the user taps
    // the currently-selected item. parseInt('', 10) = NaN, which
    // would poison the store and trigger the Zod deadlock fix on
    // next rehydration. The guard in handleRadiusChange must bail
    // on empty string.
    //
    // CRITICAL test-harness note: use `userEvent.click`, NOT
    // `fireEvent.click`. Radix ToggleGroup registers its handlers
    // on `pointerdown` not `click` — `fireEvent.click` does not
    // fire the pointer event sequence, so Radix's internal
    // onValueChange never runs and the guard is never exercised.
    // The test would pass vacuously (radiusKm stays 10 because
    // nothing ran, not because the guard fired). Independent
    // reviewer caught the vacuous pass. `userEvent.click` fires
    // pointerdown → pointerup → click which triggers Radix
    // correctly.
    const user = userEvent.setup();
    useLeadFeedState.setState({ radiusKm: 10 });
    render(<LeadFilterSheet open={true} onOpenChange={vi.fn()} />);

    // Tap the already-selected 10km item — Radix should fire
    // onValueChange('') internally.
    await user.click(screen.getByRole('radio', { name: /10 kilometres/i }));

    // Zustand must still have the valid value, not NaN
    const state = useLeadFeedState.getState();
    expect(state.radiusKm).toBe(10);
    expect(Number.isNaN(state.radiusKm)).toBe(false);
    // No captureEvent should have fired because the guard bailed
    const radiusChanges = captureEventMock.mock.calls.filter(
      (c) =>
        c[0] === 'lead_feed.filter_changed' &&
        (c[1] as { field?: string })?.field === 'radius',
    );
    expect(radiusChanges).toHaveLength(0);
  });
});

describe('LeadFilterSheet — reset CTA (Zod deadlock Layer 3)', () => {
  it('Reset button is present in the footer', () => {
    render(<LeadFilterSheet open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /reset to defaults/i })).toBeDefined();
  });

  it('Reset restores radiusKm to DEFAULT_RADIUS_KM', () => {
    useLeadFeedState.setState({ radiusKm: 50 });
    render(<LeadFilterSheet open={true} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));
    expect(useLeadFeedState.getState().radiusKm).toBe(DEFAULT_RADIUS_KM);
  });

  it('Reset emits filter_changed with field=reset + source=reset_cta', () => {
    useLeadFeedState.setState({ radiusKm: 50 });
    render(<LeadFilterSheet open={true} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));
    expect(captureEventMock).toHaveBeenCalledWith(
      'lead_feed.filter_changed',
      expect.objectContaining({
        field: 'reset',
        from: 50,
        to: DEFAULT_RADIUS_KM,
        source: 'filter_sheet_reset_cta',
      }),
    );
  });

  it('Reset CLOSES the sheet after resetting (terminal action)', () => {
    const onOpenChange = vi.fn();
    render(<LeadFilterSheet open={true} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('LeadFilterSheet — accessibility', () => {
  it('ToggleGroup has the required aria-label', () => {
    // Radix ToggleGroup type="single" renders with role="group", not
    // "radiogroup" — the INDIVIDUAL items get role="radio" but the
    // container is a plain group. Query by aria-label via
    // getByLabelText since we no longer set an id on the group
    // (the htmlFor→ToggleGroup association is invalid HTML — Radix
    // renders as a `<div>` which is not a labelable element).
    const { container } = render(
      <LeadFilterSheet open={true} onOpenChange={vi.fn()} />,
    );
    const group = container.querySelector(
      '[aria-label="Search radius in kilometres"]',
    );
    expect(group).not.toBeNull();
  });

  it('each ToggleGroupItem has a descriptive aria-label', () => {
    render(<LeadFilterSheet open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /5 kilometres/i })).toBeDefined();
    expect(screen.getByRole('radio', { name: /50 kilometres/i })).toBeDefined();
  });

  it('Label "Search radius" is rendered (sighted users see the field name)', () => {
    // We intentionally do NOT use htmlFor→id association here
    // because Radix ToggleGroup renders as a non-labelable `<div>`.
    // The label is purely visual for sighted users; screen readers
    // get the aria-label on the group itself. Independent reviewer
    // Item 12 caught the invalid htmlFor association.
    render(<LeadFilterSheet open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText('Search radius')).toBeDefined();
  });
});
