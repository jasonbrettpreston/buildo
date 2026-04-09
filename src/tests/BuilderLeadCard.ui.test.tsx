// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §4.5
//
// BuilderLeadCard UI tests — covers conditional footer permutations
// (call/website/save), security sanitization (javascript:, dirty
// phone numbers), avatar fallback, and telemetry.

import type { UseMutationResult } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
}));

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

import { BuilderLeadCard } from '@/features/leads/components/BuilderLeadCard';
import type { BuilderLeadFeedItem } from '@/features/leads/types';

const baseLead: BuilderLeadFeedItem = {
  lead_type: 'builder',
  lead_id: '9183',
  entity_id: 9183,
  legal_name: 'ACME CONSTRUCTION',
  business_size: 'Small Business',
  primary_phone: '(416) 555-1234',
  primary_email: null,
  website: 'https://acme.example',
  photo_url: null,
  distance_m: 500,
  proximity_score: 25,
  timing_score: 15,
  value_score: 20,
  opportunity_score: 14,
  relevance_score: 74,
  timing_confidence: 'high',
  opportunity_type: 'builder-led',
  timing_display: 'Active build phase',
  active_permits_nearby: 4,
  avg_project_cost: 425000,
};

beforeEach(() => {
  document.documentElement.style.width = '375px';
  mutateMock.mockReset();
  captureEventMock.mockReset();
});

afterEach(() => {
  document.documentElement.style.width = '';
});

describe('BuilderLeadCard — happy path', () => {
  it('renders name, business size, stats, and footer buttons', () => {
    render(<BuilderLeadCard lead={baseLead} tradeSlug="plumbing" />);
    expect(screen.getByText('ACME CONSTRUCTION')).toBeDefined();
    expect(screen.getByText('Small Business')).toBeDefined();
    expect(screen.getByText(/4 active permits nearby/)).toBeDefined();
    expect(screen.getByText(/Closest: 500m/)).toBeDefined();
    expect(screen.getByText(/Avg: \$425K/)).toBeDefined();
    expect(screen.getByRole('link', { name: /call/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /website/i })).toBeDefined();
  });

  it('exposes role="button" with aria-label', () => {
    render(<BuilderLeadCard lead={baseLead} tradeSlug="plumbing" />);
    const card = screen.getByRole('button', { name: 'Builder lead: ACME CONSTRUCTION' });
    expect(card.getAttribute('aria-pressed')).toBe('false');
    expect(card.getAttribute('tabIndex')).toBe('0');
  });

  it('singularizes "permit" when active_permits_nearby === 1', () => {
    render(
      <BuilderLeadCard
        lead={{ ...baseLead, active_permits_nearby: 1 }}
        tradeSlug="plumbing"
      />,
    );
    expect(screen.getByText(/1 active permit nearby/)).toBeDefined();
  });
});

describe('BuilderLeadCard — avatar fallback', () => {
  it('shows initials when photo_url is null', () => {
    render(<BuilderLeadCard lead={baseLead} tradeSlug="plumbing" />);
    expect(screen.getByText('AC')).toBeDefined();
  });

  it('shows ? when legal_name is empty', () => {
    render(
      <BuilderLeadCard
        lead={{ ...baseLead, legal_name: '' as unknown as string }}
        tradeSlug="plumbing"
      />,
    );
    expect(screen.getByText('?')).toBeDefined();
    expect(screen.getByText('Unknown builder')).toBeDefined();
  });

  it('uses unicode-safe initials for accented names', () => {
    render(
      <BuilderLeadCard
        lead={{ ...baseLead, legal_name: 'Müller Builders' }}
        tradeSlug="plumbing"
      />,
    );
    expect(screen.getByText('MB')).toBeDefined();
  });
});

describe('BuilderLeadCard — conditional footer (security + missing-data)', () => {
  it('null primary_phone → Call button absent', () => {
    render(
      <BuilderLeadCard
        lead={{ ...baseLead, primary_phone: null }}
        tradeSlug="plumbing"
      />,
    );
    expect(screen.queryByRole('link', { name: /call/i })).toBeNull();
    expect(screen.getByRole('link', { name: /website/i })).toBeDefined();
  });

  it('all-letters primary_phone → Call button absent (sanitizeTelHref returns null)', () => {
    render(
      <BuilderLeadCard
        lead={{ ...baseLead, primary_phone: 'CALL US TODAY' }}
        tradeSlug="plumbing"
      />,
    );
    expect(screen.queryByRole('link', { name: /call/i })).toBeNull();
  });

  it('dirty phone (parens, spaces, dashes) is sanitized to digits in tel: href', () => {
    render(<BuilderLeadCard lead={baseLead} tradeSlug="plumbing" />);
    const callLink = screen.getByRole('link', { name: /call/i });
    expect(callLink.getAttribute('href')).toBe('tel:4165551234');
  });

  it('phone with leading + preserves the +', () => {
    render(
      <BuilderLeadCard
        lead={{ ...baseLead, primary_phone: '+1 416 555-1234' }}
        tradeSlug="plumbing"
      />,
    );
    expect(screen.getByRole('link', { name: /call/i }).getAttribute('href')).toBe(
      'tel:+14165551234',
    );
  });

  it('phone with extension drops the extension digits (Gemini 2026-04-09 fix)', () => {
    render(
      <BuilderLeadCard
        lead={{ ...baseLead, primary_phone: '(416) 555-1234 ext 99' }}
        tradeSlug="plumbing"
      />,
    );
    // The href is the main line ONLY — extension digits are stripped,
    // not concatenated. Pre-fix this would have produced 'tel:416555123499'.
    expect(screen.getByRole('link', { name: /call/i }).getAttribute('href')).toBe(
      'tel:4165551234',
    );
  });

  it('null website → Website button absent', () => {
    render(
      <BuilderLeadCard
        lead={{ ...baseLead, website: null }}
        tradeSlug="plumbing"
      />,
    );
    expect(screen.queryByRole('link', { name: /website/i })).toBeNull();
  });

  it('CRITICAL: javascript: website → Website button absent (XSS guard)', () => {
    render(
      <BuilderLeadCard
        lead={{ ...baseLead, website: 'javascript:alert(1)' }}
        tradeSlug="plumbing"
      />,
    );
    expect(screen.queryByRole('link', { name: /website/i })).toBeNull();
  });

  it('CRITICAL: data: website → Website button absent', () => {
    render(
      <BuilderLeadCard
        lead={{
          ...baseLead,
          website: 'data:text/html,<script>alert(1)</script>',
        }}
        tradeSlug="plumbing"
      />,
    );
    expect(screen.queryByRole('link', { name: /website/i })).toBeNull();
  });

  it('Website link has rel="noopener noreferrer" and target="_blank"', () => {
    render(<BuilderLeadCard lead={baseLead} tradeSlug="plumbing" />);
    const link = screen.getByRole('link', { name: /website/i });
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
  });
});

describe('BuilderLeadCard — stats omissions', () => {
  it('null avg_project_cost → stats line omits the avg clause', () => {
    render(
      <BuilderLeadCard
        lead={{ ...baseLead, avg_project_cost: null }}
        tradeSlug="plumbing"
      />,
    );
    expect(screen.queryByText(/Avg:/)).toBeNull();
    expect(screen.getByText(/Closest: 500m/)).toBeDefined();
  });

  it('null business_size → subline absent', () => {
    render(
      <BuilderLeadCard
        lead={{ ...baseLead, business_size: null }}
        tradeSlug="plumbing"
      />,
    );
    expect(screen.queryByText('Small Business')).toBeNull();
  });
});

describe('BuilderLeadCard — telemetry', () => {
  it('card tap fires lead_feed.lead_clicked', () => {
    render(<BuilderLeadCard lead={baseLead} tradeSlug="plumbing" />);
    fireEvent.click(screen.getByRole('button', { name: 'Builder lead: ACME CONSTRUCTION' }));
    expect(captureEventMock).toHaveBeenCalledWith(
      'lead_feed.lead_clicked',
      expect.objectContaining({
        lead_type: 'builder',
        lead_id: '9183',
      }),
    );
  });

  it('Call click fires lead_feed.builder_called and stops propagation', () => {
    render(<BuilderLeadCard lead={baseLead} tradeSlug="plumbing" />);
    fireEvent.click(screen.getByRole('link', { name: /call/i }));
    const calls = captureEventMock.mock.calls.map((c) => c[0]);
    expect(calls).toContain('lead_feed.builder_called');
    expect(calls).not.toContain('lead_feed.lead_clicked');
  });

  it('Website click fires lead_feed.builder_website_opened and stops propagation', () => {
    render(<BuilderLeadCard lead={baseLead} tradeSlug="plumbing" />);
    fireEvent.click(screen.getByRole('link', { name: /website/i }));
    const calls = captureEventMock.mock.calls.map((c) => c[0]);
    expect(calls).toContain('lead_feed.builder_website_opened');
    expect(calls).not.toContain('lead_feed.lead_clicked');
  });
});

describe('BuilderLeadCard — touch targets', () => {
  it('Save button is 44px (h-11)', () => {
    const { container } = render(
      <BuilderLeadCard lead={baseLead} tradeSlug="plumbing" />,
    );
    const saveBtn = container.querySelector('button[aria-label="Save lead"]');
    expect(saveBtn).not.toBeNull();
    expect(saveBtn?.className).toMatch(/h-11/);
  });

  it('Footer with only Save button still hits 44px', () => {
    const { container } = render(
      <BuilderLeadCard
        lead={{ ...baseLead, primary_phone: null, website: null }}
        tradeSlug="plumbing"
      />,
    );
    const saveBtn = container.querySelector('button[aria-label="Save lead"]');
    expect(saveBtn?.className).toMatch(/h-11/);
  });
});
