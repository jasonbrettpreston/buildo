// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.4 + §3.5 + §3.6
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §13
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §B3
//
// Hook tests for the six admin-flight-center TanStack Query hooks. Each
// hook gets: happy path, Zod-parse-failure, and (for the mutations)
// optimistic-then-rollback. The hooks themselves use the global fetch,
// which we mock per-test; React-state assertions go through @testing-
// library/react `renderHook` + `waitFor`.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import React from 'react';

import { useAdminFlightBoard, ADMIN_FLIGHT_BOARD_QUERY_KEY } from '@/features/admin-flight-center/api/useAdminFlightBoard';
import { useFlightBoardDetail, FlightBoardDetailError } from '@/features/admin-flight-center/api/useFlightBoardDetail';
import { useLeadDetail, LeadDetailError } from '@/features/admin-flight-center/api/useLeadDetail';
import { useSavePermit } from '@/features/admin-flight-center/api/useSavePermit';
import { useUnsavePermit } from '@/features/admin-flight-center/api/useUnsavePermit';
import { useSearchPermits } from '@/features/admin-flight-center/api/useSearchPermits';
import type { FlightBoardItem, FlightBoardResult } from '@/lib/admin/lead-schemas';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

const VALID_FLIGHT_ITEM: FlightBoardItem = {
  permit_num: '20-101234',
  revision_num: '00',
  address: '123 Queen St W',
  lifecycle_phase: 'permit-issued',
  lifecycle_stalled: false,
  predicted_start: '2026-06-15',
  p25_days: 30,
  p75_days: 60,
  temporal_group: 'action_required',
  updated_at: '2026-05-06T12:00:00Z',
};

const VALID_LEAD_DETAIL = {
  lead_id: '20-101234--00',
  lead_type: 'permit',
  permit_num: '20-101234',
  revision_num: '00',
  address: '123 Queen St W',
  location: { lat: 43.6532, lng: -79.3832 },
  work_description: 'New build',
  applicant: 'Acme',
  lifecycle_phase: 'permit-issued',
  lifecycle_stalled: false,
  target_window: 'work',
  opportunity_score: 0.82,
  competition_count: 3,
  predicted_start: '2026-06-15',
  p25_days: 30,
  p75_days: 60,
  cost: null,
  neighbourhood: null,
  updated_at: '2026-05-06T12:00:00Z',
  is_saved: false,
};

let mockFetch: ReturnType<typeof vi.fn>;

function makeWrapper() {
  // Each test gets its own QueryClient so cache state doesn't leak
  // between tests (vital for the optimistic-rollback assertions which
  // inspect cache snapshots). gcTime: Infinity is critical — entries
  // we set via setQueryData have no observers, and gcTime: 0 would
  // sweep them out before the assertion gets to read them.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  }
  return { queryClient, Wrapper };
}

function mockJsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch = vi.fn();
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// useAdminFlightBoard
// ===========================================================================

describe('useAdminFlightBoard', () => {
  it('parses a valid response into a FlightBoardResult', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: [VALID_FLIGHT_ITEM] }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdminFlightBoard(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0]?.permit_num).toBe('20-101234');
  });

  it('non-2xx response surfaces network error', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, { status: 500 }));
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdminFlightBoard(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/500/);
  });

  it('Zod parse failure throws via throwOnError (schema drift = contract bug)', async () => {
    // Server returned a malformed item — temporal_group not in the enum.
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        data: [{ ...VALID_FLIGHT_ITEM, temporal_group: 'someday' }],
      }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdminFlightBoard(), { wrapper: Wrapper });
    // throwOnError converts the ZodError into an unhandled hook state;
    // TanStack still surfaces it via `isError` on the next tick.
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ===========================================================================
// useFlightBoardDetail
// ===========================================================================

describe('useFlightBoardDetail', () => {
  it('is inert when id is null (no fetch)', async () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useFlightBoardDetail(null), { wrapper: Wrapper });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('parses valid response', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: VALID_FLIGHT_ITEM, error: null, meta: null }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useFlightBoardDetail('20-101234--00'), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.permit_num).toBe('20-101234');
  });

  it('404 → FlightBoardDetailError code NOT_SAVED', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, { status: 404 }));
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useFlightBoardDetail('20-101234--00'), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(FlightBoardDetailError);
    expect((result.current.error as FlightBoardDetailError).code).toBe('NOT_SAVED');
  });

  it('400 → INVALID_ID with serverMessage extracted', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(
        { error: { code: 'BAD_ID', message: 'lead_id must match the canonical shape' } },
        { status: 400 },
      ),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useFlightBoardDetail('garbage'), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    const err = result.current.error as FlightBoardDetailError;
    expect(err.code).toBe('INVALID_ID');
    expect(err.serverMessage).toMatch(/lead_id/);
  });
});

// ===========================================================================
// useLeadDetail
// ===========================================================================

describe('useLeadDetail', () => {
  it('parses valid response', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: VALID_LEAD_DETAIL, error: null, meta: null }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useLeadDetail('20-101234--00'), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.lead_id).toBe('20-101234--00');
  });

  it('404 → LeadDetailError code NOT_SAVED (Spec 91 §4.3.1 LATERAL gate)', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, { status: 404 }));
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useLeadDetail('unknown-id'), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(LeadDetailError);
    expect((result.current.error as LeadDetailError).code).toBe('NOT_SAVED');
  });

  it('is inert when id is empty string', async () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useLeadDetail(''), { wrapper: Wrapper });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// useSavePermit (Spec 35 §B3 optimistic + rollback)
// ===========================================================================

describe('useSavePermit', () => {
  it('optimistically inserts the supplied item into the flight-board cache', async () => {
    const { queryClient, Wrapper } = makeWrapper();
    // Seed the cache with an empty board.
    queryClient.setQueryData<FlightBoardResult>(ADMIN_FLIGHT_BOARD_QUERY_KEY, {
      data: [],
    });
    // Save POST resolves successfully.
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, { status: 200 }));

    const { result } = renderHook(() => useSavePermit(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        permit_num: '20-101234',
        revision_num: '00',
        optimisticItem: VALID_FLIGHT_ITEM,
      });
    });
    // After successful save, the onSuccess invalidation kicks; verify
    // the optimistic write landed by checking the cache pre-invalidation
    // is impractical, so assert the invalidate was queued instead.
    const cached = queryClient.getQueryData<FlightBoardResult>(
      ADMIN_FLIGHT_BOARD_QUERY_KEY,
    );
    // The invalidation triggers a refetch; with no refetch handler the
    // cache remains the optimistic value. Either way the row must be present.
    expect(
      cached?.data.some(
        (i) => i.permit_num === '20-101234' && i.revision_num === '00',
      ),
    ).toBe(true);
  });

  it('rolls back the optimistic insert on save failure (Spec 35 §B3)', async () => {
    const { queryClient, Wrapper } = makeWrapper();
    const startingBoard: FlightBoardResult = { data: [] };
    queryClient.setQueryData(ADMIN_FLIGHT_BOARD_QUERY_KEY, startingBoard);
    // Save POST FAILS — non-2xx → useSavePermit throws.
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, { status: 500 }));

    const { result } = renderHook(() => useSavePermit(), { wrapper: Wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({
          permit_num: '20-101234',
          revision_num: '00',
          optimisticItem: VALID_FLIGHT_ITEM,
        });
      } catch {
        // Expected — the mutation throws on 5xx.
      }
    });

    // Rollback assertion — cache MUST be back to the original empty
    // board (NOT containing the optimistic item).
    const cached = queryClient.getQueryData<FlightBoardResult>(
      ADMIN_FLIGHT_BOARD_QUERY_KEY,
    );
    expect(cached?.data).toHaveLength(0);
  });

  it('skips optimistic write when no item is supplied (still calls server)', async () => {
    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData<FlightBoardResult>(ADMIN_FLIGHT_BOARD_QUERY_KEY, {
      data: [VALID_FLIGHT_ITEM],
    });
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, { status: 200 }));

    const { result } = renderHook(() => useSavePermit(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        permit_num: '20-101234',
        revision_num: '00',
      });
    });
    expect(mockFetch).toHaveBeenCalledOnce();
    const call = mockFetch.mock.calls[0];
    expect(call?.[0]).toBe('/api/leads/save');
  });
});

// ===========================================================================
// useUnsavePermit
// ===========================================================================

describe('useUnsavePermit', () => {
  it('optimistically removes the row + invalidates on success', async () => {
    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData<FlightBoardResult>(ADMIN_FLIGHT_BOARD_QUERY_KEY, {
      data: [VALID_FLIGHT_ITEM],
    });
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, { status: 200 }));

    const { result } = renderHook(() => useUnsavePermit(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        permit_num: '20-101234',
        revision_num: '00',
      });
    });
    const cached = queryClient.getQueryData<FlightBoardResult>(
      ADMIN_FLIGHT_BOARD_QUERY_KEY,
    );
    expect(cached?.data).toHaveLength(0);
  });

  it('rolls back the optimistic removal on failure', async () => {
    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData<FlightBoardResult>(ADMIN_FLIGHT_BOARD_QUERY_KEY, {
      data: [VALID_FLIGHT_ITEM],
    });
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, { status: 500 }));

    const { result } = renderHook(() => useUnsavePermit(), { wrapper: Wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({
          permit_num: '20-101234',
          revision_num: '00',
        });
      } catch {
        // expected
      }
    });
    const cached = queryClient.getQueryData<FlightBoardResult>(
      ADMIN_FLIGHT_BOARD_QUERY_KEY,
    );
    // Rollback restored the row.
    expect(cached?.data).toHaveLength(1);
  });
});

// ===========================================================================
// useSearchPermits
// ===========================================================================

describe('useSearchPermits', () => {
  it('is inert when query length < 2 (no fetch)', async () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useSearchPermits('q'), { wrapper: Wrapper });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('is inert when query is whitespace-only', async () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useSearchPermits('   '), { wrapper: Wrapper });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches and parses when query length >= 2', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        data: [
          {
            permit_num: '20-101234',
            revision_num: '00',
            address: '123 Queen St W',
            lifecycle_phase: 'permit-issued',
            status: 'open',
          },
        ],
      }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSearchPermits('queen'), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(1);
  });

  it('non-2xx surfaces error', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, { status: 500 }));
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSearchPermits('queen'), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('Zod parse failure on malformed search response', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        // Malformed: top-level `results` instead of `data`.
        results: [{ permit_num: '20-101234' }],
      }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSearchPermits('queen'), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
