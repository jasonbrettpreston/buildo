// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §4.10
//
// LeadMapPane UI tests — Phase 6 step 1 + step 2.
//
// We mock @vis.gl/react-google-maps so the tests don't try to load
// the real Google Maps JS API. The mock renders <Map> as a plain div
// with data-testid attributes, and <AdvancedMarker> as a clickable
// div that calls the wired event handlers (onClick, onMouseEnter,
// onMouseLeave) — exactly the contract LeadMapPane depends on.
//
// Step 2 additions: the Map mock now captures `onCameraChanged` and
// `onClick` handlers so tests can simulate pan events and background
// clicks.
//
// useLeadFeed is mocked to return a controllable canned response so
// each test can assert the marker layer reacts to specific lead
// shapes (mixed permit + builder, lat/lng nullness, etc.).

import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captureEventMock = vi.fn();
vi.mock('@/lib/observability/capture', () => ({
  captureEvent: (...args: unknown[]) => captureEventMock(...args),
  initObservability: vi.fn(),
}));

const reduceMotionMock = vi.fn(() => false);
vi.mock('motion/react', () => ({
  useReducedMotion: () => reduceMotionMock(),
}));

// Mock @vis.gl/react-google-maps. APIProvider passes children through.
// Map renders a div + children. AdvancedMarker renders a clickable
// shell that wires onClick / onMouseEnter / onMouseLeave to the
// inner div, with the position serialised into a data attribute so
// tests can correlate.
// Capture the most recent onCameraChanged / onClick handlers passed
// to <Map> so step 2 tests can invoke them programmatically.
let lastMapOnCameraChanged: ((event: unknown) => void) | undefined;
let lastMapOnClick: ((event: unknown) => void) | undefined;
vi.mock('@vis.gl/react-google-maps', () => {
  const APIProvider: React.FC<React.PropsWithChildren<{ apiKey: string }>> = ({
    children,
    apiKey,
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'api-provider', 'data-api-key': apiKey },
      children,
    );
  const Map: React.FC<
    React.PropsWithChildren<{
      defaultCenter?: { lat: number; lng: number };
      defaultZoom?: number;
      mapId?: string;
      onCameraChanged?: (event: unknown) => void;
      onClick?: (event: unknown) => void;
    }>
  > = ({ children, defaultCenter, defaultZoom, mapId, onCameraChanged, onClick }) => {
    // Store callbacks so tests can invoke them.
    lastMapOnCameraChanged = onCameraChanged;
    lastMapOnClick = onClick;
    return React.createElement(
      'div',
      {
        'data-testid': 'map',
        'data-default-center': JSON.stringify(defaultCenter),
        'data-default-zoom': String(defaultZoom ?? ''),
        'data-map-id': mapId ?? '',
      },
      children,
    );
  };
  const AdvancedMarker: React.FC<
    React.PropsWithChildren<{
      position: { lat: number; lng: number };
      onClick?: () => void;
      onMouseEnter?: () => void;
      onMouseLeave?: () => void;
    }>
  > = ({ children, position, onClick, onMouseEnter, onMouseLeave }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'advanced-marker',
        'data-position': JSON.stringify(position),
        onClick,
        onMouseEnter,
        onMouseLeave,
      },
      children,
    );
  return { APIProvider, Map, AdvancedMarker };
});

// Mock useLeadFeed. Each test seeds `mockedFeedResponse` and then
// imports + renders LeadMapPane. The shape mirrors the bits of
// useInfiniteQuery's result that LeadMapPane actually reads.
import type { LeadFeedItem } from '@/features/leads/types';
type MockLeadFeedResult = {
  data: {
    pages: Array<{
      data: LeadFeedItem[];
      meta: { next_cursor: null; count: number; radius_km: number };
      error: null;
    }>;
  } | undefined;
  isSuccess: boolean;
  isError: boolean;
  isPending: boolean;
};
let mockedFeedResponse: MockLeadFeedResult = {
  data: undefined,
  isSuccess: false,
  isError: false,
  isPending: true,
};
vi.mock('@/features/leads/api/useLeadFeed', () => ({
  useLeadFeed: () => mockedFeedResponse,
  FORCED_REFETCH_THRESHOLD_M: 500,
}));

import { LeadMapPane } from '@/features/leads/components/LeadMapPane';
import { useLeadFeedState } from '@/features/leads/hooks/useLeadFeedState';
import type {
  BuilderLeadFeedItem,
  PermitLeadFeedItem,
} from '@/features/leads/types';

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

function builderLead(
  overrides: Partial<BuilderLeadFeedItem> = {},
): BuilderLeadFeedItem {
  return {
    lead_type: 'builder',
    lead_id: '9183',
    entity_id: 9183,
    legal_name: 'ACME CONSTRUCTION',
    business_size: 'Medium Business',
    primary_phone: '4165550100',
    primary_email: null,
    website: 'https://example.test',
    photo_url: null,
    distance_m: 800,
    proximity_score: 25,
    timing_score: 15,
    value_score: 14,
    opportunity_score: 14,
    relevance_score: 68,
    timing_confidence: 'high',
    timing_display: 'Active build phase',
    opportunity_type: 'builder-led',
    is_saved: false,
    active_permits_nearby: 3,
    avg_project_cost: 750_000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  captureEventMock.mockReset();
  reduceMotionMock.mockReturnValue(false);
  lastMapOnCameraChanged = undefined;
  lastMapOnClick = undefined;
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = 'test-key';
  useLeadFeedState.setState({
    _hasHydrated: true,
    hoveredLeadId: null,
    selectedLeadId: null,
    radiusKm: 10,
    location: null,
    snappedLocation: null,
  });
  mockedFeedResponse = {
    data: { pages: [] },
    isSuccess: true,
    isError: false,
    isPending: false,
  };
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
});

describe('LeadMapPane — render', () => {
  it('renders the map container with center derived from props', () => {
    mockedFeedResponse = {
      data: {
        pages: [
          {
            data: [permitLead()],
            meta: { next_cursor: null, count: 1, radius_km: 10 },
            error: null,
          },
        ],
      },
      isSuccess: true,
      isError: false,
      isPending: false,
    };
    const { getByTestId } = render(
      <LeadMapPane tradeSlug="plumbing" lat={43.65} lng={-79.38} />,
    );
    const mapEl = getByTestId('map');
    expect(JSON.parse(mapEl.getAttribute('data-default-center') ?? '{}')).toEqual({
      lat: 43.65,
      lng: -79.38,
    });
    expect(mapEl.getAttribute('data-map-id')).toBe('lead-feed-map');
  });

  it('renders one AdvancedMarker per permit lead with non-null lat/lng', () => {
    mockedFeedResponse = {
      data: {
        pages: [
          {
            data: [permitLead({ lead_id: 'a' }), permitLead({ lead_id: 'b' })],
            meta: { next_cursor: null, count: 2, radius_km: 10 },
            error: null,
          },
        ],
      },
      isSuccess: true,
      isError: false,
      isPending: false,
    };
    const { getAllByTestId } = render(
      <LeadMapPane tradeSlug="plumbing" lat={43.65} lng={-79.38} />,
    );
    expect(getAllByTestId('advanced-marker').length).toBe(2);
  });

  it('skips builder leads (null lat/lng) without crashing', () => {
    mockedFeedResponse = {
      data: {
        pages: [
          {
            data: [
              permitLead({ lead_id: 'permit-x' }),
              builderLead({ lead_id: '9183' }),
            ],
            meta: { next_cursor: null, count: 2, radius_km: 10 },
            error: null,
          },
        ],
      },
      isSuccess: true,
      isError: false,
      isPending: false,
    };
    const { getAllByTestId } = render(
      <LeadMapPane tradeSlug="plumbing" lat={43.65} lng={-79.38} />,
    );
    // Only the permit lead becomes a marker; the builder is filtered.
    expect(getAllByTestId('advanced-marker').length).toBe(1);
  });
});

describe('LeadMapPane — telemetry + interaction', () => {
  beforeEach(() => {
    mockedFeedResponse = {
      data: {
        pages: [
          {
            data: [
              permitLead({ lead_id: 'lead-a' }),
              permitLead({ lead_id: 'lead-b', latitude: 43.66, longitude: -79.39 }),
            ],
            meta: { next_cursor: null, count: 2, radius_km: 10 },
            error: null,
          },
        ],
      },
      isSuccess: true,
      isError: false,
      isPending: false,
    };
  });

  it('marker click writes selectedLeadId to Zustand AND fires lead_feed.map_marker_clicked with position (NOT lead_id)', () => {
    const { getAllByTestId } = render(
      <LeadMapPane tradeSlug="plumbing" lat={43.65} lng={-79.38} />,
    );
    const markers = getAllByTestId('advanced-marker');
    fireEvent.click(markers[1]!);
    expect(useLeadFeedState.getState().selectedLeadId).toBe('lead-b');
    expect(captureEventMock).toHaveBeenCalledWith(
      'lead_feed.map_marker_clicked',
      expect.objectContaining({ lead_type: 'permit', position: 1 }),
    );
    // Defensive: confirm lead_id is NOT a property
    const call = captureEventMock.mock.calls.find(
      (c) => c[0] === 'lead_feed.map_marker_clicked',
    );
    expect(call?.[1]).not.toHaveProperty('lead_id');
  });

  it('marker hover dedupes — second hover on the same marker does NOT re-emit', () => {
    const { getAllByTestId } = render(
      <LeadMapPane tradeSlug="plumbing" lat={43.65} lng={-79.38} />,
    );
    const markers = getAllByTestId('advanced-marker');
    fireEvent.mouseEnter(markers[0]!);
    fireEvent.mouseLeave(markers[0]!);
    fireEvent.mouseEnter(markers[0]!);

    const hoverCalls = captureEventMock.mock.calls.filter(
      (c) => c[0] === 'lead_feed.map_marker_hovered',
    );
    expect(hoverCalls.length).toBe(1);
    expect(hoverCalls[0]?.[1]).toMatchObject({ lead_type: 'permit', position: 0 });

    // A different marker hover SHOULD fire a new event
    fireEvent.mouseEnter(markers[1]!);
    const hoverCallsAfter = captureEventMock.mock.calls.filter(
      (c) => c[0] === 'lead_feed.map_marker_hovered',
    );
    expect(hoverCallsAfter.length).toBe(2);
  });
});

describe('LeadMapPane — fallback', () => {
  it('renders the "Map unavailable" placeholder when NEXT_PUBLIC_GOOGLE_MAPS_KEY is missing', () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    const { getByText, queryByTestId } = render(
      <LeadMapPane tradeSlug="plumbing" lat={43.65} lng={-79.38} />,
    );
    expect(getByText('Map unavailable')).toBeDefined();
    expect(queryByTestId('map')).toBeNull();
    expect(captureEventMock).toHaveBeenCalledWith(
      'lead_feed.map_unavailable',
      expect.objectContaining({ reason: 'missing_api_key' }),
    );
  });
});

// --- Phase 6 step 2: debounced map-pan refetch + click-to-deselect ---

/**
 * Consume the initial-mount camera event that the library auto-fires.
 * Must be called after render() and before simulating user pans,
 * otherwise the first camera event is silently swallowed by the C2
 * initial-fire guard in handleCameraChanged.
 */
function consumeInitialCameraEvent(): void {
  lastMapOnCameraChanged!({
    detail: { center: { lat: 0, lng: 0 }, bounds: {}, zoom: 13, heading: 0, tilt: 0 },
  });
}

describe('LeadMapPane — debounced map-pan refetch (step 2)', () => {
  beforeEach(() => {
    // Seed snappedLocation at (43.65, -79.38) — the "current" position.
    // The pan handler only fires a refetch when the camera center moves
    // >500m from this snap.
    useLeadFeedState.setState({ snappedLocation: { lat: 43.65, lng: -79.38 } });
    mockedFeedResponse = {
      data: {
        pages: [
          {
            data: [permitLead({ lead_id: 'lead-a' })],
            meta: { next_cursor: null, count: 1, radius_km: 10 },
            error: null,
          },
        ],
      },
      isSuccess: true,
      isError: false,
      isPending: false,
    };
  });

  it('skips the initial-mount camera event (library auto-fire) without updating snap', () => {
    render(<LeadMapPane tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    expect(lastMapOnCameraChanged).toBeDefined();

    // First onCameraChanged = initial mount fire. Even with a large
    // delta, it should be ignored.
    lastMapOnCameraChanged!({
      detail: { center: { lat: 44.0, lng: -79.38 }, bounds: {}, zoom: 13, heading: 0, tilt: 0 },
    });
    vi.advanceTimersByTime(500);

    // Snap unchanged — initial event was skipped
    expect(useLeadFeedState.getState().snappedLocation).toEqual({ lat: 43.65, lng: -79.38 });
    const panCalls = captureEventMock.mock.calls.filter(
      (c) => c[0] === 'lead_feed.map_panned',
    );
    expect(panCalls.length).toBe(0);

    // SECOND camera event (real user pan) should work
    lastMapOnCameraChanged!({
      detail: { center: { lat: 43.66, lng: -79.38 }, bounds: {}, zoom: 13, heading: 0, tilt: 0 },
    });
    vi.advanceTimersByTime(500);
    expect(useLeadFeedState.getState().snappedLocation).toEqual({ lat: 43.66, lng: -79.38 });
  });

  it('updates snappedLocation after 500ms debounce when pan exceeds 500m threshold', () => {
    render(<LeadMapPane tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    expect(lastMapOnCameraChanged).toBeDefined();
    consumeInitialCameraEvent();

    // Simulate a pan to a point ~1.1km north (≈ +0.01 lat ≈ 1.11km)
    lastMapOnCameraChanged!({
      detail: { center: { lat: 43.66, lng: -79.38 }, bounds: {}, zoom: 13, heading: 0, tilt: 0 },
    });

    // Before debounce fires, snap should be unchanged
    expect(useLeadFeedState.getState().snappedLocation).toEqual({ lat: 43.65, lng: -79.38 });

    // Advance timers past the 500ms debounce
    vi.advanceTimersByTime(500);

    // After debounce, snap should be updated to the new center
    expect(useLeadFeedState.getState().snappedLocation).toEqual({ lat: 43.66, lng: -79.38 });

    // Telemetry should fire
    expect(captureEventMock).toHaveBeenCalledWith(
      'lead_feed.map_panned',
      expect.objectContaining({ delta_m: expect.any(Number) }),
    );
  });

  it('does NOT update snappedLocation when pan is below 500m threshold', () => {
    render(<LeadMapPane tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    expect(lastMapOnCameraChanged).toBeDefined();
    consumeInitialCameraEvent();

    // Simulate a pan to a point ~110m north (≈ +0.001 lat ≈ 111m)
    lastMapOnCameraChanged!({
      detail: { center: { lat: 43.651, lng: -79.38 }, bounds: {}, zoom: 13, heading: 0, tilt: 0 },
    });

    vi.advanceTimersByTime(500);

    // Snap should remain unchanged — pan was too small
    expect(useLeadFeedState.getState().snappedLocation).toEqual({ lat: 43.65, lng: -79.38 });

    // No pan telemetry
    const panCalls = captureEventMock.mock.calls.filter(
      (c) => c[0] === 'lead_feed.map_panned',
    );
    expect(panCalls.length).toBe(0);
  });

  it('does nothing when snappedLocation is null (pre-seed state)', () => {
    useLeadFeedState.setState({ snappedLocation: null });
    render(<LeadMapPane tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    expect(lastMapOnCameraChanged).toBeDefined();
    consumeInitialCameraEvent();

    // Pan to a point far away — should still be a no-op because snap is null
    lastMapOnCameraChanged!({
      detail: { center: { lat: 43.7, lng: -79.38 }, bounds: {}, zoom: 13, heading: 0, tilt: 0 },
    });
    vi.advanceTimersByTime(500);

    expect(useLeadFeedState.getState().snappedLocation).toBeNull();
    const panCalls = captureEventMock.mock.calls.filter(
      (c) => c[0] === 'lead_feed.map_panned',
    );
    expect(panCalls.length).toBe(0);
  });

  it('debounces multiple rapid pans — only the last one fires', () => {
    render(<LeadMapPane tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    consumeInitialCameraEvent();

    // Three rapid pans, each >500m from the snap
    lastMapOnCameraChanged!({
      detail: { center: { lat: 43.66, lng: -79.38 }, bounds: {}, zoom: 13, heading: 0, tilt: 0 },
    });
    vi.advanceTimersByTime(200);
    lastMapOnCameraChanged!({
      detail: { center: { lat: 43.67, lng: -79.38 }, bounds: {}, zoom: 13, heading: 0, tilt: 0 },
    });
    vi.advanceTimersByTime(200);
    lastMapOnCameraChanged!({
      detail: { center: { lat: 43.68, lng: -79.38 }, bounds: {}, zoom: 13, heading: 0, tilt: 0 },
    });

    // Only after the full 500ms from the LAST pan should it fire
    vi.advanceTimersByTime(500);

    // Snap should be the LAST center, not the first or second
    expect(useLeadFeedState.getState().snappedLocation).toEqual({ lat: 43.68, lng: -79.38 });

    // Only one pan telemetry event (for the last debounced pan)
    const panCalls = captureEventMock.mock.calls.filter(
      (c) => c[0] === 'lead_feed.map_panned',
    );
    expect(panCalls.length).toBe(1);
  });
});

describe('LeadMapPane — click-to-deselect (step 2)', () => {
  beforeEach(() => {
    mockedFeedResponse = {
      data: {
        pages: [
          {
            data: [permitLead({ lead_id: 'lead-a' })],
            meta: { next_cursor: null, count: 1, radius_km: 10 },
            error: null,
          },
        ],
      },
      isSuccess: true,
      isError: false,
      isPending: false,
    };
  });

  it('clicking the map background clears selectedLeadId and fires map_deselected', () => {
    useLeadFeedState.setState({ selectedLeadId: 'lead-a' });
    render(<LeadMapPane tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    expect(lastMapOnClick).toBeDefined();

    // Simulate clicking the map background
    lastMapOnClick!({});

    expect(useLeadFeedState.getState().selectedLeadId).toBeNull();
    expect(captureEventMock).toHaveBeenCalledWith(
      'lead_feed.map_deselected',
      {},
    );
  });

  it('marker click sets the ref guard so handleMapClick does NOT deselect', () => {
    // Simulates the real Google Maps event model where BOTH
    // AdvancedMarker.onClick AND Map.onClick fire on a marker click.
    render(<LeadMapPane tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    const markers = document.querySelectorAll('[data-testid="advanced-marker"]');
    expect(markers.length).toBeGreaterThan(0);
    expect(lastMapOnClick).toBeDefined();

    // 1. Marker click fires first — sets selectedLeadId + ref guard
    fireEvent.click(markers[0]!);
    expect(useLeadFeedState.getState().selectedLeadId).toBe('lead-a');

    // 2. Map click fires second (same dispatch in production)
    lastMapOnClick!({});

    // selectedLeadId must STILL be 'lead-a' — the ref guard prevented
    // the deselect.
    expect(useLeadFeedState.getState().selectedLeadId).toBe('lead-a');

    // No map_deselected telemetry should have fired
    const deselectCalls = captureEventMock.mock.calls.filter(
      (c) => c[0] === 'lead_feed.map_deselected',
    );
    expect(deselectCalls.length).toBe(0);
  });

  it('clicking the map background when nothing is selected is a no-op', () => {
    useLeadFeedState.setState({ selectedLeadId: null });
    render(<LeadMapPane tradeSlug="plumbing" lat={43.65} lng={-79.38} />);
    expect(lastMapOnClick).toBeDefined();

    lastMapOnClick!({});

    // Should NOT fire deselected telemetry — nothing was selected
    const deselectCalls = captureEventMock.mock.calls.filter(
      (c) => c[0] === 'lead_feed.map_deselected',
    );
    expect(deselectCalls.length).toBe(0);
  });
});
