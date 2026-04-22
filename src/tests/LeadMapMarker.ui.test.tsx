// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §4.10

import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

// useReducedMotion is mocked at the module level. Default returns
// false; individual tests reassign via vi.mocked() before render.
const reduceMotionMock = vi.fn(() => false);
vi.mock('motion/react', () => ({
  useReducedMotion: () => reduceMotionMock(),
}));

import { LeadMapMarker } from '@/features/leads/components/LeadMapMarker';
import type { PermitLeadFeedItem } from '@/features/leads/types';

function permitLead(
  overrides: Partial<PermitLeadFeedItem> = {},
): PermitLeadFeedItem {
  return {
    lead_type: 'permit',
    lead_id: '24 999100:00',
    permit_num: '24 999100',
    revision_num: '00',
    status: 'Permit Issued',
    permit_type: 'TEST',
    description: null,
    street_num: '123',
    street_name: 'King St W',
    latitude: 43.65,
    longitude: -79.38,
    distance_m: 250,
    proximity_score: 30,
    timing_score: 30,
    value_score: 16,
    opportunity_score: 20,
    relevance_score: 96,
    timing_confidence: 'high',
    timing_display: 'Active build phase',
    opportunity_type: 'newbuild',
    is_saved: false,
    neighbourhood_name: 'King West',
    cost_tier: 'major',
    estimated_cost: 1_500_000,
    lifecycle_phase: 'P7a',
    lifecycle_stalled: false,
    ...overrides,
  };
}

describe('LeadMapMarker — render', () => {
  it('renders inactive without active styling classes', () => {
    reduceMotionMock.mockReturnValue(false);
    const { container } = render(
      <LeadMapMarker lead={permitLead()} active={false} />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.getAttribute('data-active')).toBe('false');
    expect(el.className).not.toContain('scale-110');
    expect(el.className).not.toContain('ring-2');
  });

  it('renders active with scale + ring when motion is allowed', () => {
    reduceMotionMock.mockReturnValue(false);
    const { container } = render(
      <LeadMapMarker lead={permitLead()} active={true} />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute('data-active')).toBe('true');
    expect(el.className).toContain('scale-110');
    expect(el.className).toContain('ring-2');
  });

  it('drops the scale transform when prefers-reduced-motion is set', () => {
    reduceMotionMock.mockReturnValue(true);
    const { container } = render(
      <LeadMapMarker lead={permitLead()} active={true} />,
    );
    const el = container.firstChild as HTMLElement;
    // Active state still visible via the ring (non-motion) but no
    // scale transform.
    expect(el.className).toContain('ring-2');
    expect(el.className).not.toContain('scale-110');
    expect(el.className).not.toContain('transition-transform');
  });

  it('reflects the cost tier in data-cost-tier and aria-label', () => {
    reduceMotionMock.mockReturnValue(false);
    const { container, rerender } = render(
      <LeadMapMarker lead={permitLead({ cost_tier: 'mega' })} active={false} />,
    );
    let el = container.firstChild as HTMLElement;
    expect(el.getAttribute('data-cost-tier')).toBe('mega');
    expect(el.getAttribute('aria-label')).toBe('Permit lead, mega cost');
    expect(el.textContent).toBe('$$$$');

    rerender(
      <LeadMapMarker lead={permitLead({ cost_tier: 'small' })} active={false} />,
    );
    el = container.firstChild as HTMLElement;
    expect(el.getAttribute('data-cost-tier')).toBe('small');
    expect(el.getAttribute('aria-label')).toBe('Permit lead, small cost');

    rerender(
      <LeadMapMarker lead={permitLead({ cost_tier: null })} active={false} />,
    );
    el = container.firstChild as HTMLElement;
    expect(el.getAttribute('data-cost-tier')).toBe('unknown');
    expect(el.getAttribute('aria-label')).toBe('Permit lead');
  });
});
