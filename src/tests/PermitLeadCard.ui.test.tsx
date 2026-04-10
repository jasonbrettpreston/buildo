// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §4.4
//
// PermitLeadCard UI tests — covers the unhappy-path matrix from the
// Phase 3-iii standards-compliance section of active_task.md, plus
// telemetry, accessibility, and the conditional rendering rules
// (no zero-height divs, no empty cost rows).

import type { UseMutationResult } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Motion mock — same pass-through Proxy as Phase 3-ii UI tests so the
// jsdom environment doesn't crash on Motion's RAF scheduler.
const MOTION_PROP_KEYS = new Set([
  'animate',
  'whileTap',
  'whileHover',
  'whileFocus',
  'whileDrag',
  'transition',
  'initial',
  'exit',
  'variants',
  'layout',
  'layoutId',
  'drag',
]);
vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: () => {
        return (
          Component: React.ComponentType<React.PropsWithChildren<Record<string, unknown>>>,
        ) => {
          const Forward = React.forwardRef<unknown, Record<string, unknown>>(
            (props, ref) => {
              const rest: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(props)) {
                if (!MOTION_PROP_KEYS.has(k)) rest[k] = v;
              }
              return React.createElement(Component, { ...rest, ref });
            },
          );
          Forward.displayName = 'MockedMotion';
          return Forward;
        };
      },
    },
  ),
  useReducedMotion: () => false,
}));

// Mock useLeadView (consumed transitively by SaveButton inside the card)
const mutateMock = vi.fn();
vi.mock('@/features/leads/api/useLeadView', () => ({
  useLeadView: () =>
    ({
      mutate: mutateMock,
      isPending: false,
      isSuccess: false,
      isError: false,
      data: undefined,
      error: null,
      reset: vi.fn(),
    }) as unknown as UseMutationResult<unknown, unknown, unknown>,
}));

const captureEventMock = vi.fn();
vi.mock('@/lib/observability/capture', () => ({
  captureEvent: (...args: unknown[]) => captureEventMock(...args),
  initObservability: vi.fn(),
}));

// Tremor's ProgressCircle (used by TimingBadge) brings in heavy
// dependencies that crash in jsdom. Stub it.
vi.mock('@tremor/react', () => ({
  ProgressCircle: ({ children }: React.PropsWithChildren) =>
    React.createElement('div', { 'data-testid': 'progress-circle' }, children),
}));

import { PermitLeadCard } from '@/features/leads/components/PermitLeadCard';
import type { PermitLeadFeedItem } from '@/features/leads/types';

const baseLead: PermitLeadFeedItem = {
  lead_type: 'permit',
  lead_id: '24 101234:01',
  permit_num: '24 101234',
  revision_num: '01',
  status: 'Permit Issued',
  permit_type: 'New Building',
  description: 'New SFD',
  street_num: '47',
  street_name: 'Maple Ave',
  latitude: 43.65,
  longitude: -79.38,
  distance_m: 350,
  proximity_score: 30,
  timing_score: 30,
  value_score: 20,
  opportunity_score: 20,
  relevance_score: 100,
  timing_confidence: 'high',
  opportunity_type: 'newbuild',
  timing_display: 'Active build phase',
  neighbourhood_name: 'High Park',
  cost_tier: 'large',
  estimated_cost: 750000,
  is_saved: false,
};

beforeEach(() => {
  document.documentElement.style.width = '375px';
  mutateMock.mockReset();
  captureEventMock.mockReset();
});

afterEach(() => {
  document.documentElement.style.width = '';
});

describe('PermitLeadCard — happy path', () => {
  it('renders address, neighbourhood, distance, cost, and permit_type', () => {
    render(<PermitLeadCard lead={baseLead} tradeSlug="plumbing" />);
    expect(screen.getByText('47 Maple Ave')).toBeDefined();
    expect(screen.getByText('High Park')).toBeDefined();
    expect(screen.getByText('350m')).toBeDefined();
    expect(screen.getByText('$750K')).toBeDefined();
    expect(screen.getByText(/New Building/)).toBeDefined();
  });

  it('exposes the card as role="button" with aria-label', () => {
    render(<PermitLeadCard lead={baseLead} tradeSlug="plumbing" />);
    const card = screen.getByRole('button', { name: /Permit lead.*350m away.*47 Maple Ave/ });
    expect(card).toBeDefined();
    expect(card.getAttribute('aria-pressed')).toBe('false');
    expect(card.getAttribute('tabIndex')).toBe('0');
  });

  it('uses solid border for high confidence', () => {
    const { container } = render(
      <PermitLeadCard lead={baseLead} tradeSlug="plumbing" />,
    );
    expect(container.querySelector('.border-l-solid')).not.toBeNull();
    expect(container.querySelector('.border-l-dashed')).toBeNull();
  });

  it('uses dashed border for medium/low confidence', () => {
    const { container } = render(
      <PermitLeadCard
        lead={{ ...baseLead, timing_confidence: 'medium' }}
        tradeSlug="plumbing"
      />,
    );
    expect(container.querySelector('.border-l-dashed')).not.toBeNull();
  });

  it('passes the timing PILLAR score (0-30), not relevance_score (0-100), to TimingBadge', () => {
    // CRITICAL regression lock — independent reviewer 2026-04-09 caught
    // that an earlier draft passed `Math.round(lead.relevance_score)`
    // (the 0-100 composite) instead of `lead.timing_score` (the 0-30
    // pillar). TimingBadge's bands and ProgressCircle scaling are both
    // calibrated for 0-30, so a high-relevance Distant lead would
    // wrongly render as NOW. This test fixes a low timing_score with
    // a high relevance_score and verifies the badge does NOT show NOW.
    const distantHighScoreLead = {
      ...baseLead,
      timing_score: 5, // Distant band (< 10)
      relevance_score: 85, // High composite — would land in NOW band if mis-passed
    };
    const { container } = render(
      <PermitLeadCard lead={distantHighScoreLead} tradeSlug="plumbing" />,
    );
    // TimingBadge sets a tone wrapper aria-label that includes the
    // band name ("Timing Distant" / "Timing NOW" / etc). The badge
    // also renders the integer score it received in the
    // ProgressCircle slot. Verify both: (a) the band is Distant, NOT
    // NOW, and (b) the rendered score is 5, not 85 — locking the
    // exact field-passing bug.
    expect(screen.getByLabelText(/Timing Distant/i)).toBeDefined();
    expect(screen.queryByLabelText(/Timing NOW/i)).toBeNull();
    // ProgressCircle (mocked) renders the score number as a child
    expect(screen.getByText('5')).toBeDefined();
  });
});

describe('PermitLeadCard — unhappy paths (conditional rendering)', () => {
  it('null street_num + street_name → falls back to permit_type', () => {
    render(
      <PermitLeadCard
        lead={{ ...baseLead, street_num: null, street_name: null }}
        tradeSlug="plumbing"
      />,
    );
    // The h3 contains permit_type, not the address
    const headings = screen.getAllByText('New Building');
    expect(headings.length).toBeGreaterThan(0);
  });

  it('null street_num + street_name + permit_type → "Permit lead" fallback', () => {
    render(
      <PermitLeadCard
        lead={{
          ...baseLead,
          street_num: null,
          street_name: null,
          permit_type: null,
        }}
        tradeSlug="plumbing"
      />,
    );
    expect(screen.getByText('Permit lead')).toBeDefined();
  });

  it('null neighbourhood_name → subline absent (no zero-height div)', () => {
    render(
      <PermitLeadCard
        lead={{ ...baseLead, neighbourhood_name: null }}
        tradeSlug="plumbing"
      />,
    );
    expect(screen.queryByText('High Park')).toBeNull();
  });

  it('null estimated_cost AND null cost_tier → cost row absent', () => {
    render(
      <PermitLeadCard
        lead={{ ...baseLead, estimated_cost: null, cost_tier: null }}
        tradeSlug="plumbing"
      />,
    );
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it('null estimated_cost but tier present → falls back to humanized tier', () => {
    render(
      <PermitLeadCard
        lead={{ ...baseLead, estimated_cost: null, cost_tier: 'medium' }}
        tradeSlug="plumbing"
      />,
    );
    expect(screen.getByText(/Medium project/)).toBeDefined();
  });

  it('null latitude or longitude → Directions button absent', () => {
    render(
      <PermitLeadCard
        lead={{ ...baseLead, latitude: null }}
        tradeSlug="plumbing"
      />,
    );
    expect(screen.queryByRole('link', { name: /directions/i })).toBeNull();
  });

  it('valid lat/lng → Directions link is built and points at Google Maps', () => {
    render(<PermitLeadCard lead={baseLead} tradeSlug="plumbing" />);
    const link = screen.getByRole('link', { name: /directions/i });
    expect(link.getAttribute('href')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=43.65,-79.38',
    );
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
  });
});

describe('PermitLeadCard — telemetry + interaction', () => {
  it('tap on card body fires lead_feed.lead_clicked', () => {
    render(<PermitLeadCard lead={baseLead} tradeSlug="plumbing" />);
    fireEvent.click(screen.getByRole('button', { name: /Permit lead/ }));
    expect(captureEventMock).toHaveBeenCalledWith(
      'lead_feed.lead_clicked',
      expect.objectContaining({
        lead_type: 'permit',
        lead_id: '24 101234:01',
        distance_m: 350,
      }),
    );
  });

  it('Enter key activates the card', () => {
    render(<PermitLeadCard lead={baseLead} tradeSlug="plumbing" />);
    const card = screen.getByRole('button', { name: /Permit lead/ });
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(captureEventMock).toHaveBeenCalledWith(
      'lead_feed.lead_clicked',
      expect.any(Object),
    );
  });

  it('Space key activates the card', () => {
    render(<PermitLeadCard lead={baseLead} tradeSlug="plumbing" />);
    const card = screen.getByRole('button', { name: /Permit lead/ });
    fireEvent.keyDown(card, { key: ' ' });
    expect(captureEventMock).toHaveBeenCalledWith(
      'lead_feed.lead_clicked',
      expect.any(Object),
    );
  });

  it('Directions click fires lead_feed.directions_opened (and stops propagation)', () => {
    render(<PermitLeadCard lead={baseLead} tradeSlug="plumbing" />);
    const link = screen.getByRole('link', { name: /directions/i });
    fireEvent.click(link);
    // The directions event must be present
    const calls = captureEventMock.mock.calls.map((c) => c[0]);
    expect(calls).toContain('lead_feed.directions_opened');
    // The card-clicked event must NOT have fired (stopPropagation)
    expect(calls).not.toContain('lead_feed.lead_clicked');
  });

  it('mouse pointerEnter sets hoveredLeadId; pointerLeave clears it', async () => {
    // The full mouse-vs-touch matrix is hard to exercise in jsdom
    // because pointerType doesn't survive RTL's synthetic event
    // construction reliably. We test the SETTING half: a default
    // pointer event (no explicit pointerType) IS treated as
    // non-touch by `e.pointerType !== 'touch'` and updates hover.
    // The touch-skip half is enforced by the handler's literal
    // `!== 'touch'` guard + the unit-level format.ts tests + visual
    // code review. Self-checklist item 19.
    const { useLeadFeedState } = await import('@/features/leads/hooks/useLeadFeedState');
    useLeadFeedState.setState({ hoveredLeadId: null });
    render(<PermitLeadCard lead={baseLead} tradeSlug="plumbing" />);
    const card = screen.getByRole('button', { name: /Permit lead/ });

    fireEvent.pointerEnter(card);
    expect(useLeadFeedState.getState().hoveredLeadId).toBe('24 101234:01');

    fireEvent.pointerLeave(card);
    expect(useLeadFeedState.getState().hoveredLeadId).toBeNull();
  });
});

describe('PermitLeadCard — is_saved pass-through (Phase 3-vi)', () => {
  it('passes is_saved=false → SaveButton renders unsaved heart', () => {
    render(<PermitLeadCard lead={baseLead} tradeSlug="plumbing" />);
    expect(screen.getByText('Save')).toBeDefined();
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('passes is_saved=true → SaveButton renders saved heart', () => {
    render(
      <PermitLeadCard
        lead={{ ...baseLead, is_saved: true }}
        tradeSlug="plumbing"
      />,
    );
    expect(screen.getByText('Saved')).toBeDefined();
    expect(screen.queryByText(/^Save$/)).toBeNull();
  });

  it('SaveButton aria-pressed reflects is_saved', () => {
    render(
      <PermitLeadCard
        lead={{ ...baseLead, is_saved: true }}
        tradeSlug="plumbing"
      />,
    );
    const saveBtn = screen.getByRole('button', { name: 'Save lead' });
    expect(saveBtn.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('PermitLeadCard — touch targets', () => {
  it('Save button has h-11 class (44px touch target)', () => {
    const { container } = render(
      <PermitLeadCard lead={baseLead} tradeSlug="plumbing" />,
    );
    const buttons = container.querySelectorAll('button');
    // SaveButton + maybe Directions if rendered as button (it's an
    // anchor wrapped via Slot, but Save is a real button).
    expect(buttons.length).toBeGreaterThan(0);
    // The save button must be 44px
    const saveButton = container.querySelector('button[aria-label="Save lead"]');
    expect(saveButton).not.toBeNull();
    expect(saveButton?.className).toMatch(/h-11/);
  });
});
