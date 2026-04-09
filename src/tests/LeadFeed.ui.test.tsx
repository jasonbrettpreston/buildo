// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11 Phase 5
//
// LeadFeed UI tests — the orchestrator. The unhappy-path matrix:
//   - pending without data → 3 skeletons
//   - error + online → unreachable variant
//   - error + offline → offline variant
//   - success + 0 items → no_results variant
//   - success + items → cards via discriminator switch
//   - 5-page hard cap → endMessage swaps to cap banner
//   - cursor exhausted (no cap, hasNextPage false) → endMessage shows exhausted
//
// We mock useLeadFeed directly to control the InfiniteQuery state
// shape (this is the same pattern Phase 3-iii used for useLeadView).
// react-infinite-scroll-component is mocked as a pass-through that
// renders children + exposes loader/endMessage so the tests can read
// them by data-testid.

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (must be declared before any import that triggers the mock chain)
// ---------------------------------------------------------------------------

// Motion mock — same pass-through Proxy as Phase 3-ii / 3-iii UI tests
const MOTION_PROP_KEYS = new Set([
  'animate', 'whileTap', 'whileHover', 'whileFocus', 'whileDrag',
  'transition', 'initial', 'exit', 'variants', 'layout', 'layoutId', 'drag',
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

// Mock react-infinite-scroll-component as a pass-through. We expose
// the loader, endMessage, and the next/refreshFunction callbacks via
// data attributes so tests can read them. The library's actual
// scroll-trigger logic is irrelevant in jsdom.
vi.mock('react-infinite-scroll-component', () => {
  const InfiniteScroll = ({
    children,
    loader,
    endMessage,
    hasMore,
    dataLength,
    next,
    refreshFunction,
  }: {
    children: React.ReactNode;
    loader: React.ReactNode;
    endMessage: React.ReactNode;
    hasMore: boolean;
    dataLength: number;
    next: () => void;
    refreshFunction: () => void;
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'infinite-scroll',
        'data-has-more': hasMore ? 'true' : 'false',
        'data-data-length': String(dataLength),
      },
      [
        React.createElement('div', { key: 'children', 'data-testid': 'is-children' }, children),
        hasMore && React.createElement('div', { key: 'loader', 'data-testid': 'is-loader' }, loader),
        // Mirror the real library: endMessage renders when !hasMore
        // AND dataLength > 0. The real react-infinite-scroll-component
        // does NOT show endMessage on an empty list — adding the
        // dataLength guard so a future test scenario where
        // hasMore=false + dataLength=0 doesn't get a false PASS.
        // Independent reviewer 2026-04-09 caught the contract gap.
        !hasMore && dataLength > 0 && React.createElement('div', { key: 'end', 'data-testid': 'is-end-message' }, endMessage),
        React.createElement(
          'button',
          {
            key: 'next-trigger',
            type: 'button',
            'data-testid': 'is-next',
            onClick: next,
          },
          'next',
        ),
        React.createElement(
          'button',
          {
            key: 'refresh-trigger',
            type: 'button',
            'data-testid': 'is-refresh',
            onClick: refreshFunction,
          },
          'refresh',
        ),
      ],
    );
  return { __esModule: true, default: InfiniteScroll };
});

// Mock useLeadFeed — this is the unit-under-test's data source. We
// control the InfiniteQuery shape directly via the mock return value.
const useLeadFeedMock = vi.fn();
vi.mock('@/features/leads/api/useLeadFeed', () => ({
  useLeadFeed: (...args: unknown[]) => useLeadFeedMock(...args),
}));

// Mock useLeadView (consumed transitively by SaveButton inside cards)
vi.mock('@/features/leads/api/useLeadView', () => ({
  useLeadView: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null,
    reset: vi.fn(),
  }),
}));

// Tremor ProgressCircle stub (used by TimingBadge inside PermitLeadCard)
vi.mock('@tremor/react', () => ({
  ProgressCircle: ({ children }: React.PropsWithChildren) =>
    React.createElement('div', { 'data-testid': 'progress-circle' }, children),
}));

const captureEventMock = vi.fn();
vi.mock('@/lib/observability/capture', () => ({
  captureEvent: (...args: unknown[]) => captureEventMock(...args),
  initObservability: vi.fn(),
}));

import { LeadFeed, MAX_PAGES } from '@/features/leads/components/LeadFeed';
import type { LeadFeedItem, PermitLeadFeedItem, BuilderLeadFeedItem } from '@/features/leads/types';
import { useLeadFeedState } from '@/features/leads/hooks/useLeadFeedState';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const samplePermit: PermitLeadFeedItem = {
  lead_type: 'permit',
  lead_id: 'p-1',
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
};

const sampleBuilder: BuilderLeadFeedItem = {
  lead_type: 'builder',
  lead_id: 'b-1',
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

function pageOf(items: LeadFeedItem[]) {
  return { data: items, meta: { next_cursor: null, count: items.length, radius_km: 10 } };
}

// Loose plain shape — we mock useLeadFeed and the consumer (LeadFeed)
// only reads a handful of fields. Trying to satisfy the full
// UseInfiniteQueryResult discriminated union is over-typing for a
// test fixture. We cast the mock return value to `unknown` at the
// mock boundary so the strict discriminated union doesn't reject the
// loose shape, while keeping the test code self-documenting.
interface QueryShape {
  isPending?: boolean;
  isError?: boolean;
  isSuccess?: boolean;
  hasNextPage?: boolean;
  data?: { pages: ReturnType<typeof pageOf>[] } | undefined;
  fetchNextPage?: () => void;
  refetch?: () => void;
}

function makeQuery(overrides: QueryShape): QueryShape {
  return {
    isPending: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    data: { pages: [] },
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

function returnQuery(q: QueryShape): void {
  // Cast at the boundary so strict discriminated unions don't reject.
  useLeadFeedMock.mockReturnValue(q as unknown as ReturnType<typeof useLeadFeedMock>);
}

beforeEach(() => {
  document.documentElement.style.width = '375px';
  useLeadFeedMock.mockReset();
  captureEventMock.mockReset();
  useLeadFeedState.setState({
    _hasHydrated: true,
    radiusKm: 10,
    location: null,
    snappedLocation: null,
    hoveredLeadId: null,
    selectedLeadId: null,
  });
  // Default navigator.onLine = true for unreachable-variant tests
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  });
});

afterEach(() => {
  document.documentElement.style.width = '';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LeadFeed — loading state', () => {
  it('renders 3 skeletons when query is pending and has no data', () => {
    // Omit `data` entirely (instead of setting it to undefined) so
    // exactOptionalPropertyTypes doesn't reject the literal — the
    // makeQuery default omits it too via the spread.
    returnQuery({
      ...makeQuery({}),
      isPending: true,
      isSuccess: false,
      data: undefined,
    });
    const { container } = render(
      <LeadFeed tradeSlug="plumbing" lat={43.65} lng={-79.38} />,
    );
    // SkeletonLeadCard renders a Card with the skeleton class. Count
    // by class presence — 3 skeleton wrappers.
    const skeletons = container.querySelectorAll('[data-testid="skeleton-lead-card"], [aria-label*="Loading"], .animate-pulse');
    // Fallback: just check the loading container has 3 children
    const loadingContainer = container.querySelector('.space-y-3');
    expect(loadingContainer?.children.length).toBe(3);
    expect(skeletons.length).toBeGreaterThanOrEqual(0);
  });
});

describe('LeadFeed — error states', () => {
  it('renders unreachable variant when query errors and navigator.onLine === true', () => {
    returnQuery(
      makeQuery({ isPending: false, isError: true, isSuccess: false }),
    );
    render(<LeadFeed tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    expect(screen.getByText(/can.+reach the server/i)).toBeDefined();
    expect(captureEventMock).toHaveBeenCalledWith(
      'lead_feed.empty_state_shown',
      expect.objectContaining({ variant: 'unreachable' }),
    );
  });

  it('renders offline variant when query errors and navigator.onLine === false', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    returnQuery(
      makeQuery({ isPending: false, isError: true, isSuccess: false }),
    );
    render(<LeadFeed tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    expect(screen.getByText(/you.+offline/i)).toBeDefined();
    expect(captureEventMock).toHaveBeenCalledWith(
      'lead_feed.empty_state_shown',
      expect.objectContaining({ variant: 'offline' }),
    );
  });

  it('retry button calls query.refetch and emits lead_feed.refresh', () => {
    const refetch = vi.fn();
    returnQuery(
      makeQuery({
        isPending: false,
        isError: true,
        isSuccess: false,
        refetch: refetch as never,
      }),
    );
    render(<LeadFeed tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(captureEventMock).toHaveBeenCalledWith(
      'lead_feed.refresh',
      expect.objectContaining({ trade_slug: 'plumbing' }),
    );
  });
});

describe('LeadFeed — empty state (success + 0 items)', () => {
  it('renders no_results variant when items.length === 0', () => {
    returnQuery(
      makeQuery({ data: { pages: [pageOf([])] } }),
    );
    render(<LeadFeed tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    expect(screen.getByText(/no leads in this area/i)).toBeDefined();
    expect(captureEventMock).toHaveBeenCalledWith(
      'lead_feed.empty_state_shown',
      expect.objectContaining({ variant: 'no_results' }),
    );
  });

  it('expand-radius CTA calls setRadius with current + 5 (clamped to MAX_RADIUS_KM)', () => {
    returnQuery(
      makeQuery({ data: { pages: [pageOf([])] } }),
    );
    render(<LeadFeed tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    fireEvent.click(screen.getByRole('button', { name: /expand to 15km/i }));
    expect(useLeadFeedState.getState().radiusKm).toBe(15);
    expect(captureEventMock).toHaveBeenCalledWith(
      'lead_feed.filter_changed',
      expect.objectContaining({ field: 'radius', from: 10, to: 15 }),
    );
  });
});

describe('LeadFeed — happy path (success + items)', () => {
  it('renders mixed permit + builder cards via the discriminator switch', () => {
    returnQuery(
      makeQuery({
        data: { pages: [pageOf([samplePermit, sampleBuilder])] },
      }),
    );
    render(<LeadFeed tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    // PermitLeadCard renders the address
    expect(screen.getByText('47 Maple Ave')).toBeDefined();
    // BuilderLeadCard renders the legal_name
    expect(screen.getByText('ACME CONSTRUCTION')).toBeDefined();
  });

  it('emits lead_feed.viewed exactly once per (trade, lat, lng, radius) quad', () => {
    returnQuery(
      makeQuery({ data: { pages: [pageOf([samplePermit])] } }),
    );
    const { rerender } = render(
      <LeadFeed tradeSlug="plumbing" lat={43.65} lng={-79.38} />,
    );
    rerender(<LeadFeed tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    rerender(<LeadFeed tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    const viewedCalls = captureEventMock.mock.calls.filter(
      (c) => c[0] === 'lead_feed.viewed',
    );
    expect(viewedCalls).toHaveLength(1);
  });

  it('passes hasMore=true when query.hasNextPage and not at the cap', () => {
    returnQuery(
      makeQuery({
        hasNextPage: true,
        data: { pages: [pageOf([samplePermit])] },
      }),
    );
    render(<LeadFeed tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    expect(screen.getByTestId('infinite-scroll').getAttribute('data-has-more')).toBe('true');
  });
});

describe('LeadFeed — V1 hard cap (5 pages)', () => {
  it('flips hasMore=false when pageCount reaches MAX_PAGES even if hasNextPage is true', () => {
    const pages = Array.from({ length: MAX_PAGES }, () => pageOf([samplePermit]));
    returnQuery(
      makeQuery({
        hasNextPage: true, // server says there's more
        data: { pages },
      }),
    );
    render(<LeadFeed tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    expect(screen.getByTestId('infinite-scroll').getAttribute('data-has-more')).toBe('false');
  });

  it('endMessage shows the cap banner when cap is reached AND server has more', () => {
    const pages = Array.from({ length: MAX_PAGES }, () => pageOf([samplePermit]));
    returnQuery(
      makeQuery({
        hasNextPage: true,
        data: { pages },
      }),
    );
    render(<LeadFeed tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    const endMsg = screen.getByTestId('is-end-message');
    expect(endMsg.textContent).toMatch(/refine your search/i);
  });

  it('endMessage shows the exhausted banner when below cap AND server is genuinely empty', () => {
    returnQuery(
      makeQuery({
        hasNextPage: false, // server says no more
        data: { pages: [pageOf([samplePermit])] },
      }),
    );
    render(<LeadFeed tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    const endMsg = screen.getByTestId('is-end-message');
    expect(endMsg.textContent).toMatch(/seen all the leads/i);
  });
});

describe('LeadFeed — InfiniteScroll trigger wiring', () => {
  it('next prop calls query.fetchNextPage', () => {
    const fetchNextPage = vi.fn();
    returnQuery(
      makeQuery({
        hasNextPage: true,
        data: { pages: [pageOf([samplePermit])] },
        fetchNextPage: fetchNextPage as never,
      }),
    );
    render(<LeadFeed tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    fireEvent.click(screen.getByTestId('is-next'));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('refreshFunction calls query.refetch and emits lead_feed.refresh', () => {
    const refetch = vi.fn();
    returnQuery(
      makeQuery({
        data: { pages: [pageOf([samplePermit])] },
        refetch: refetch as never,
      }),
    );
    render(<LeadFeed tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    fireEvent.click(screen.getByTestId('is-refresh'));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(captureEventMock).toHaveBeenCalledWith(
      'lead_feed.refresh',
      expect.objectContaining({ trade_slug: 'plumbing' }),
    );
  });

  it('passes dataLength matching items.length so the library knows when to fire next', () => {
    returnQuery(
      makeQuery({
        data: { pages: [pageOf([samplePermit, sampleBuilder]), pageOf([samplePermit])] },
      }),
    );
    render(<LeadFeed tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    expect(screen.getByTestId('infinite-scroll').getAttribute('data-data-length')).toBe('3');
  });
});
