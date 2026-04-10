// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §2.2 + §11 Phase 3 step 2
//
// useLeadFeed hook tests — mocked fetch, no real network. Verifies:
//   - Query key rounds lat/lng to 3 decimals (Layer 1)
//   - Happy path unwraps the envelope and returns data
//   - API error envelope becomes a LeadApiClientError on the error state
//   - Cursor pagination wires next_cursor → getNextPageParam correctly
//
// The 2-layer movement detection effect is hard to test deterministically
// without a full React Testing Library setup for re-renders with different
// props — covered structurally by the __constants export and an inline
// unit on the cursor threshold; full behavior exercised in 3-iv integration.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock captureEvent before importing useLeadFeed so the Phase 3-vi
// observability hook (lead_feed.client_error emit on query error)
// is captured by the spy.
const captureEventMock = vi.fn();
vi.mock('@/lib/observability/capture', () => ({
  captureEvent: (...args: unknown[]) => captureEventMock(...args),
  initObservability: vi.fn(),
}));

import { useLeadFeed, __constants } from '@/features/leads/api/useLeadFeed';
import { useLeadFeedState, DEFAULT_RADIUS_KM } from '@/features/leads/hooks/useLeadFeedState';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrap({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const happyResponse = {
  data: [
    {
      lead_id: '24 101234:01',
      lead_type: 'permit',
      permit_num: '24 101234',
      revision_num: '01',
      status: 'Permit Issued',
      permit_type: 'New Building',
      description: 'test',
      street_num: '100',
      street_name: 'King St W',
      latitude: 43.65,
      longitude: -79.38,
      distance_m: 500,
      proximity_score: 30,
      timing_score: 30,
      value_score: 20,
      opportunity_score: 20,
      relevance_score: 100,
    },
  ],
  error: null,
  meta: { next_cursor: null, count: 1, radius_km: 10 },
};

beforeEach(() => {
  fetchMock.mockReset();
  captureEventMock.mockReset();
  // Reset Zustand store + localStorage between tests so snappedLocation
  // from one test doesn't bleed into the next.
  useLeadFeedState.setState({
    // Seed as hydrated so the hook's enabled gate + snap-seed effect
    // run in tests. The rehydration race is covered by a dedicated
    // test below that explicitly starts with _hasHydrated: false.
    _hasHydrated: true,
    hoveredLeadId: null,
    selectedLeadId: null,
    radiusKm: DEFAULT_RADIUS_KM,
    location: null,
    snappedLocation: null,
  });
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useLeadFeed — constants', () => {
  it('COORD_PRECISION is 1000 (3 decimals ~ 110m grid)', () => {
    expect(__constants.COORD_PRECISION).toBe(1000);
  });

  it('FORCED_REFETCH_THRESHOLD_M is 500', () => {
    expect(__constants.FORCED_REFETCH_THRESHOLD_M).toBe(500);
  });
});

describe('useLeadFeed — happy path', () => {
  it('fetches the first page and returns the data envelope', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => happyResponse,
    } as Response);

    const { result } = renderHook(
      () =>
        useLeadFeed({
          trade_slug: 'plumbing',
          lat: 43.6535,
          lng: -79.3839,
          radius_km: 10,
        }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0]?.data[0]?.lead_id).toBe('24 101234:01');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('/api/leads/feed?');
    expect(calledUrl).toContain('trade_slug=plumbing');
  });

  it('sub-500m movement does NOT change the queryKey or trigger a refetch (Gemini 2026-04-09 fix)', async () => {
    // Gemini deep-dive review caught that pre-fix the queryKey rounded
    // lat/lng to 3 decimals per render. Walking across an invisible
    // ~110m grid boundary (43.1235 → 43.1234) would wipe the infinite
    // scroll cache and throw the user back to page 1. The fix: the
    // queryKey now reads from a SNAPPED location in Zustand that only
    // advances on >500m movement. Sub-threshold movements are no-ops.
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => happyResponse,
    } as Response);

    const Wrap = wrapper();
    const { rerender } = renderHook(
      ({ lat, lng }: { lat: number; lng: number }) =>
        useLeadFeed({
          trade_slug: 'plumbing',
          lat,
          lng,
          radius_km: 10,
        }),
      {
        wrapper: Wrap,
        initialProps: { lat: 43.6535, lng: -79.3839 },
      },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Simulate ~50m of GPS drift (well under 500m threshold).
    // 0.0005° lat ≈ 55m. Snap must NOT advance, fetch count must stay 1.
    rerender({ lat: 43.6540, lng: -79.3839 });
    rerender({ lat: 43.6541, lng: -79.3838 });

    // Give any pending effects a tick to flush.
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Independent review item 6: also assert the snap was NOT advanced.
    // A fetch-count-only assertion could pass spuriously if a future
    // regression advanced the snap but the new key happened to hit the
    // cache. Locking the snap value directly proves sub-500m is a no-op.
    expect(useLeadFeedState.getState().snappedLocation).toEqual({
      lat: 43.6535,
      lng: -79.3839,
    });
  });
});

describe('useLeadFeed — snap anchor regression lock (user review 2026-04-09 "sliding anchor")', () => {
  // The user raised a concern that the snap anchor could be "dragged
  // forward" by infinite-scroll-driven query.isSuccess events,
  // preventing the 500m threshold from ever tripping. This test walks
  // the snap through a 4km journey in 100m steps and asserts:
  //   1. The snap advances at the correct boundaries (>500m from
  //      current snap, NOT >500m from initial position).
  //   2. Scrolling (simulated via repeated rerenders) does NOT update
  //      the snap mid-step.
  //   3. After 4km, the snap has advanced ~7 times (every ~600m),
  //      proving the 500m logic IS tripping.
  //
  // This locks the absence of the sliding-anchor bug. If a future
  // refactor reintroduces a setSnappedLocation call inside a success
  // handler or anywhere outside the threshold check, this test will
  // fail loudly.
  it('snap advances in ~600m chunks across a 4km walk (40 × 100m steps)', async () => {
    useLeadFeedState.setState({
      _hasHydrated: true,
      snappedLocation: null,
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => happyResponse,
    } as Response);

    // 100m of latitude is approximately 0.0009 degrees at Toronto's
    // latitude. We use 0.0009 per step → 40 steps = 0.036 = ~4km.
    const STEP_DEG = 0.0009;
    const startLat = 43.6535;
    const lng = -79.3839;

    const Wrap = wrapper();
    const { rerender } = renderHook(
      ({ lat }: { lat: number }) =>
        useLeadFeed({
          trade_slug: 'plumbing',
          lat,
          lng,
          radius_km: 10,
        }),
      { wrapper: Wrap, initialProps: { lat: startLat } },
    );

    // Track the sequence of snap positions over the walk.
    const snapHistory: number[] = [];
    let prevSnapLat = useLeadFeedState.getState().snappedLocation?.lat;
    if (prevSnapLat !== undefined) snapHistory.push(prevSnapLat);

    for (let step = 1; step <= 40; step++) {
      const newLat = startLat + STEP_DEG * step;
      rerender({ lat: newLat });
      // Let the effect flush
      await new Promise((r) => setTimeout(r, 5));
      const currentSnapLat = useLeadFeedState.getState().snappedLocation?.lat;
      if (currentSnapLat !== undefined && currentSnapLat !== prevSnapLat) {
        snapHistory.push(currentSnapLat);
        prevSnapLat = currentSnapLat;
      }
    }

    // We expect the snap to advance at every >500m boundary. Over a
    // 4km walk that's roughly 6-8 advances (the exact count depends
    // on lat-to-meter conversion at Toronto's latitude). The key
    // assertion is "more than 3 advances and fewer than 15" — proving
    // (a) the snap is firing repeatedly (NOT stuck at the initial
    // anchor), and (b) it's not firing on every step (which would
    // mean the threshold is broken). The seed-from-null counts as
    // the first entry.
    expect(snapHistory.length).toBeGreaterThan(3);
    expect(snapHistory.length).toBeLessThan(15);

    // Each consecutive snap should be >= 500m from its predecessor
    // (the snap can never advance by less than the threshold).
    // Convert lat-deltas back to meters via the inverse of STEP_DEG:
    // 0.0009 deg ≈ 100m, so 0.0045 deg ≈ 500m.
    const MIN_SNAP_DELTA_DEG = 0.0045;
    for (let i = 1; i < snapHistory.length; i++) {
      const a = snapHistory[i - 1];
      const b = snapHistory[i];
      if (a !== undefined && b !== undefined) {
        const delta = Math.abs(b - a);
        expect(delta).toBeGreaterThanOrEqual(MIN_SNAP_DELTA_DEG);
      }
    }
  });

  it('rerendering with the SAME coords does NOT advance the snap (no sliding from no-op renders)', async () => {
    useLeadFeedState.setState({
      _hasHydrated: true,
      snappedLocation: null,
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => happyResponse,
    } as Response);

    const Wrap = wrapper();
    const { rerender } = renderHook(
      ({ lat }: { lat: number }) =>
        useLeadFeed({
          trade_slug: 'plumbing',
          lat,
          lng: -79.3839,
          radius_km: 10,
        }),
      { wrapper: Wrap, initialProps: { lat: 43.6535 } },
    );
    await new Promise((r) => setTimeout(r, 10));
    const initialSnap = useLeadFeedState.getState().snappedLocation;

    // 20 rerenders with the EXACT same coords. Should produce zero snap changes.
    for (let i = 0; i < 20; i++) {
      rerender({ lat: 43.6535 });
    }
    await new Promise((r) => setTimeout(r, 10));
    expect(useLeadFeedState.getState().snappedLocation).toEqual(initialSnap);
  });
});

describe('useLeadFeed — rehydration gate (Gemini 2026-04-09 CRITICAL fix)', () => {
  it('does NOT fetch before the Zustand persist middleware has rehydrated', async () => {
    // Pre-fix: the snap-seed useEffect would fire on mount with
    // snappedLocation=null (initial store state) and overwrite the
    // persisted snap with the current input coords, wasting a fetch
    // for the WRONG location. Now the hook's `enabled` + the effect
    // both gate on _hasHydrated.
    useLeadFeedState.setState({ _hasHydrated: false, snappedLocation: null });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => happyResponse,
    } as Response);

    renderHook(
      () =>
        useLeadFeed({
          trade_slug: 'plumbing',
          lat: 43.65,
          lng: -79.38,
          radius_km: 10,
        }),
      { wrapper: wrapper() },
    );

    // Let any microtasks + effects flush. No fetch should have fired
    // because `enabled: hasHydrated` is still false.
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(0);
    // Snap should also NOT have been seeded yet — the effect's first
    // guard is `if (!hasHydrated) return`.
    expect(useLeadFeedState.getState().snappedLocation).toBeNull();
  });

  it('fetches once hydration completes and seeds the snap from input', async () => {
    useLeadFeedState.setState({ _hasHydrated: false, snappedLocation: null });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => happyResponse,
    } as Response);

    const { rerender } = renderHook(
      () =>
        useLeadFeed({
          trade_slug: 'plumbing',
          lat: 43.65,
          lng: -79.38,
          radius_km: 10,
        }),
      { wrapper: wrapper() },
    );
    expect(fetchMock).toHaveBeenCalledTimes(0);

    // Simulate the persist middleware finishing rehydration.
    useLeadFeedState.getState().setHasHydrated(true);
    rerender();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(useLeadFeedState.getState().snappedLocation).toEqual({
      lat: 43.65,
      lng: -79.38,
    });
  });
});

describe('useLeadFeed — error handling', () => {
  it('surfaces LeadApiClientError when the server returns a structured error envelope', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        data: null,
        error: { code: 'VALIDATION_FAILED', message: 'lat must be finite' },
        meta: null,
      }),
    } as Response);

    const { result } = renderHook(
      () =>
        useLeadFeed({
          trade_slug: 'plumbing',
          lat: Number.NaN,
          lng: -79.38,
          radius_km: 10,
        }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe('VALIDATION_FAILED');
    expect(result.current.error?.message).toBe('lat must be finite');
  });

  it('surfaces NETWORK_ERROR when fetch rejects (offline, DNS, CORS)', async () => {
    // Phase 3-i adversarial review fix: pre-fix, an unhandled fetch
    // rejection would break TanStack Query's error handling. The
    // 3-layer error funnel now catches the reject and converts to
    // a typed LeadApiClientError.
    fetchMock.mockRejectedValueOnce(new Error('Failed to fetch'));
    const { result } = renderHook(
      () =>
        useLeadFeed({
          trade_slug: 'plumbing',
          lat: 43.65,
          lng: -79.38,
          radius_km: 10,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe('NETWORK_ERROR');
  });

  it('surfaces NETWORK_ERROR when res.json() throws (non-JSON body e.g. proxy 502 HTML)', async () => {
    // Phase 3-i adversarial review fix: pre-fix, `await res.json()`
    // on an HTML 502 page would reject with a parse error and
    // propagate as an unhandled rejection. The tightened handler
    // catches the parse failure too.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0');
      },
    } as unknown as Response);
    const { result } = renderHook(
      () =>
        useLeadFeed({
          trade_slug: 'plumbing',
          lat: 43.65,
          lng: -79.38,
          radius_km: 10,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe('NETWORK_ERROR');
  });

  it('surfaces NETWORK_ERROR when server returns non-envelope 500 body', async () => {
    // Pre-fix: `!res.ok || isLeadApiError(body)` would be TRUE
    // (via !res.ok) and the loose error shape would return a
    // generic NETWORK_ERROR — but then the code fell through to
    // `return body as LeadFeedResponse`, which is the actual bug.
    // The rewrite ensures the error branch always throws.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ data: null, error: null, meta: null }),
    } as Response);
    const { result } = renderHook(
      () =>
        useLeadFeed({
          trade_slug: 'plumbing',
          lat: 43.65,
          lng: -79.38,
          radius_km: 10,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe('NETWORK_ERROR');
  });

  it('throws on 2xx response with an error envelope (server contract violation)', async () => {
    // Phase 3-i adversarial review fix: the original code only
    // checked `!res.ok || isLeadApiError(body)` BEFORE returning —
    // the || was inclusive so this case was handled, but the
    // rewrite makes the success-with-error-body case an explicit
    // branch for clarity. Locking the behavior here.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: null,
        error: { code: 'SERVER_LIED', message: 'Contract violation' },
        meta: null,
      }),
    } as Response);
    const { result } = renderHook(
      () =>
        useLeadFeed({
          trade_slug: 'plumbing',
          lat: 43.65,
          lng: -79.38,
          radius_km: 10,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe('SERVER_LIED');
  });
});

describe('useLeadFeed — cursor pagination', () => {
  it('getNextPageParam returns undefined when next_cursor is null', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => happyResponse,
    } as Response);

    const { result } = renderHook(
      () =>
        useLeadFeed({
          trade_slug: 'plumbing',
          lat: 43.65,
          lng: -79.38,
          radius_km: 10,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('hasNextPage is true when the response includes a next_cursor', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...happyResponse,
        meta: {
          next_cursor: { score: 75, lead_type: 'permit', lead_id: '24 999:00' },
          count: 15,
          radius_km: 10,
        },
      }),
    } as Response);

    const { result } = renderHook(
      () =>
        useLeadFeed({
          trade_slug: 'plumbing',
          lat: 43.65,
          lng: -79.38,
          radius_km: 10,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
  });
});

describe('useLeadFeed — client_error observability (Phase 3-vi)', () => {
  it('emits lead_feed.client_error when query enters error state with a typed LeadApiClientError', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        data: null,
        error: { code: 'VALIDATION_FAILED', message: 'lat must be finite' },
        meta: null,
      }),
    } as Response);

    const { result } = renderHook(
      () =>
        useLeadFeed({
          trade_slug: 'plumbing',
          lat: Number.NaN,
          lng: -79.38,
          radius_km: 10,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));

    // The observability hook should have fired with the typed error.
    const calls = captureEventMock.mock.calls.filter(
      (c) => c[0] === 'lead_feed.client_error',
    );
    expect(calls.length).toBeGreaterThan(0);
    // Phase 3-holistic WF3 Phase E: telemetry now omits the unbounded
    // `message` field to keep PostHog property cardinality bounded.
    // The bounded `code` is still present.
    expect(calls[0]?.[1]).toMatchObject({
      code: 'VALIDATION_FAILED',
      trade_slug: 'plumbing',
    });
    expect(calls[0]?.[1]).not.toHaveProperty('message');
  });

  it('does NOT spam events when the SAME query refetches into the same error (sustained error state)', async () => {
    // Independent reviewer caught that the previous test called
    // rerender() with stable props — React skipped the effect
    // entirely so the dedup ref code was never reached. The dedup
    // ref protects against THIS scenario: the same query instance
    // refetches repeatedly (e.g., pull-to-refresh, automatic retry,
    // user retries after offline) and keeps producing the same
    // error code+message. Each refetch produces a NEW query.error
    // object reference, so the effect dep array sees a change, the
    // effect re-runs, and the ref check is what stops the duplicate
    // emit.
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        data: null,
        error: { code: 'VALIDATION_FAILED', message: 'lat must be finite' },
        meta: null,
      }),
    } as Response);

    const { result } = renderHook(
      () =>
        useLeadFeed({
          trade_slug: 'plumbing',
          lat: Number.NaN,
          lng: -79.38,
          radius_km: 10,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    // First emit fires.
    expect(
      captureEventMock.mock.calls.filter((c) => c[0] === 'lead_feed.client_error'),
    ).toHaveLength(1);

    // Refetch the SAME query. TanStack Query produces a new
    // query.error object reference even when the underlying error
    // content is identical. The effect dep array sees the change
    // and re-runs. Without the ref dedup, this would emit again.
    await result.current.refetch();
    await result.current.refetch();
    await result.current.refetch();

    // Still exactly 1 emit — the ref guard suppressed all 3 refetch
    // re-runs because the (code|message) key matches.
    const calls = captureEventMock.mock.calls.filter(
      (c) => c[0] === 'lead_feed.client_error',
    );
    expect(calls).toHaveLength(1);
  });
});
