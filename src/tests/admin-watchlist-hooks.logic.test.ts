// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §2 + §5
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §13
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §7.1 + §8.1 + §8.4
//
// Hook locks for the four Spec 36 watchlist hooks [PF-HOOKS]:
//   useWatchlist — URL pin + {data, meta} Zod parse + drift → isError.
//   useWatchlistSearch — 2-char gate + URL pin + parse.
//   useBulkSaveToWatchlist — telemetry (breadcrumb + captureEvent) BEFORE the
//     network call (§8.4); [PF5] response counts surfaced; board invalidation.
//   useBulkDeleteFromWatchlist — §8.1 B3 optimistic removal + ROLLBACK on
//     error across cached pages; telemetry-before-network.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/lib/observability/capture', () => ({
  captureEvent: vi.fn(),
}));

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import * as Sentry from '@sentry/nextjs';
import { toast } from 'sonner';
import { captureEvent } from '@/lib/observability/capture';
import { useWatchlist, WATCHLIST_BOARD_QUERY_KEY } from '@/features/admin-flight-center/api/useWatchlist';
import { useWatchlistSearch } from '@/features/admin-flight-center/api/useWatchlistSearch';
import { useBulkSaveToWatchlist } from '@/features/admin-flight-center/api/useBulkSaveToWatchlist';
import { useBulkDeleteFromWatchlist } from '@/features/admin-flight-center/api/useBulkDeleteFromWatchlist';
import type { WatchlistItem, WatchlistResult } from '@/lib/admin/watchlist-schemas';

const VALID_ITEM: WatchlistItem = {
  id: 1,
  lead_type: 'permit',
  lead_key: 'permit:20-101234:00',
  permit_num: '20-101234',
  revision_num: '00',
  coa_application_number: null,
  address: '123 Queen St W',
  lifecycle_phase: 'P12',
  lifecycle_stalled: false,
  predicted_start: '2026-06-15',
  p25_days: 30,
  p75_days: 60,
  opportunity_score: 42,
  temporal_group: 'action_required',
  saved_at: '2026-07-01T12:00:00Z',
};

let mockFetch: ReturnType<typeof vi.fn>;

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
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
// useWatchlist
// ===========================================================================

describe('useWatchlist', () => {
  it('fetches the admin watchlist route with the offset and parses {data, meta}', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        data: [VALID_ITEM],
        error: null,
        meta: { total: 120, limit: 50, offset: 50 },
      }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useWatchlist(50), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith('/api/admin/leads/watchlist?offset=50');
    expect(result.current.data?.data[0]?.lead_key).toBe('permit:20-101234:00');
    expect(result.current.data?.meta.total).toBe(120);
  });

  it('Zod parse failure (schema drift) surfaces as isError', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        data: [{ ...VALID_ITEM, temporal_group: 'someday' }],
        error: null,
        meta: { total: 1, limit: 50, offset: 0 },
      }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useWatchlist(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('missing meta (envelope drift) also fails the parse', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ data: [VALID_ITEM], error: null, meta: null }));
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useWatchlist(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ===========================================================================
// useWatchlistSearch
// ===========================================================================

describe('useWatchlistSearch', () => {
  it('is inert below 2 chars / whitespace-only', async () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useWatchlistSearch('q'), { wrapper: Wrapper });
    renderHook(() => useWatchlistSearch('   '), { wrapper: Wrapper });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches the ADMIN search route (not the consumer /api/leads/search) and parses', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        data: [
          {
            lead_type: 'coa',
            lead_key: 'coa:A0391/25NY',
            permit_num: null,
            revision_num: null,
            coa_application_number: 'A0391/25NY',
            address: '20 Hazelglen Ave',
            lifecycle_phase: 'P20',
          },
        ],
        error: null,
        meta: null,
      }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useWatchlistSearch('hazelglen'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/leads/watchlist/search?q=hazelglen',
    );
    expect(result.current.data?.data[0]?.lead_key).toBe('coa:A0391/25NY');
  });

  it('malformed response → isError', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ results: [] }));
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useWatchlistSearch('queen'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ===========================================================================
// useBulkSaveToWatchlist
// ===========================================================================

describe('useBulkSaveToWatchlist', () => {
  it('POSTs items to the admin route and surfaces the [PF5] counts in a toast', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        data: { added: 2, skipped_existing: 1, failed: [] },
        error: null,
        meta: null,
      }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useBulkSaveToWatchlist(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        items: [
          { lead_type: 'permit', permit_num: '20-1', revision_num: '00', address: '1 Front St' },
          { lead_type: 'coa', coa_application_number: 'A1/25', address: '2 Front St' },
          { lead_type: 'permit', permit_num: '20-2', revision_num: '00' },
        ],
      });
    });
    const [url, init] = mockFetch.mock.calls[0] ?? [];
    expect(url).toBe('/api/admin/leads/watchlist');
    expect((init as { method: string }).method).toBe('POST');
    const body = JSON.parse((init as { body: string }).body) as { items: unknown[] };
    expect(body.items).toHaveLength(3);
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      expect.stringMatching(/2 added.*1 already watched/),
    );
  });

  it('§8.4 — breadcrumb + captureEvent fire BEFORE the network call', async () => {
    const order: string[] = [];
    vi.mocked(Sentry.addBreadcrumb).mockImplementation(() => {
      order.push('breadcrumb');
      return undefined as never;
    });
    vi.mocked(captureEvent).mockImplementation(() => {
      order.push('capture');
    });
    mockFetch.mockImplementation(() => {
      order.push('network');
      return Promise.resolve(
        mockJsonResponse({ data: { added: 1, skipped_existing: 0, failed: [] }, error: null, meta: null }),
      );
    });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useBulkSaveToWatchlist(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        items: [{ lead_type: 'permit', permit_num: '20-1', revision_num: '00' }],
      });
    });
    expect(order.indexOf('breadcrumb')).toBeLessThan(order.indexOf('network'));
    expect(order.indexOf('capture')).toBeLessThan(order.indexOf('network'));
    expect(vi.mocked(Sentry.addBreadcrumb)).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'admin_action', message: 'watchlist_bulk_save' }),
    );
  });

  it('single-item save reports action watchlist_save (not bulk)', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: { added: 1, skipped_existing: 0, failed: [] }, error: null, meta: null }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useBulkSaveToWatchlist(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        items: [{ lead_type: 'permit', permit_num: '20-1', revision_num: '00' }],
      });
    });
    expect(vi.mocked(captureEvent)).toHaveBeenCalledWith('admin_action_performed', {
      action: 'watchlist_save',
      target: 'admin_watchlist',
    });
  });

  it('failure → error toast + logError, board still invalidated (onSettled)', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, { status: 500 }));
    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useBulkSaveToWatchlist(), { wrapper: Wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({
          items: [{ lead_type: 'permit', permit_num: '20-1', revision_num: '00' }],
        });
      } catch {
        // expected — non-2xx throws
      }
    });
    expect(vi.mocked(toast.error)).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: WATCHLIST_BOARD_QUERY_KEY });
  });
});

// ===========================================================================
// useBulkDeleteFromWatchlist (§8.1 B3 — optimistic + rollback)
// ===========================================================================

describe('useBulkDeleteFromWatchlist', () => {
  function seedBoardPage(queryClient: QueryClient): WatchlistResult {
    const page: WatchlistResult = {
      data: [VALID_ITEM, { ...VALID_ITEM, id: 2, lead_key: 'permit:20-2:00', permit_num: '20-2' }],
      meta: { total: 2, limit: 50, offset: 0 },
    };
    queryClient.setQueryData([...WATCHLIST_BOARD_QUERY_KEY, 0], page);
    return page;
  }

  it('optimistically removes the ids from every cached page + decrements total', async () => {
    const { queryClient, Wrapper } = makeWrapper();
    seedBoardPage(queryClient);
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: { deleted: 1 }, error: null, meta: null }),
    );
    const { result } = renderHook(() => useBulkDeleteFromWatchlist(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ ids: [1] });
    });
    const cached = queryClient.getQueryData<WatchlistResult>([...WATCHLIST_BOARD_QUERY_KEY, 0]);
    expect(cached?.data.map((i) => i.id)).toEqual([2]);
    expect(cached?.meta.total).toBe(1);
  });

  it('ROLLS BACK the optimistic removal on failure (§8.1 B3)', async () => {
    const { queryClient, Wrapper } = makeWrapper();
    const original = seedBoardPage(queryClient);
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, { status: 500 }));
    const { result } = renderHook(() => useBulkDeleteFromWatchlist(), { wrapper: Wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ ids: [1] });
      } catch {
        // expected
      }
    });
    const cached = queryClient.getQueryData<WatchlistResult>([...WATCHLIST_BOARD_QUERY_KEY, 0]);
    expect(cached?.data).toHaveLength(2);
    expect(cached?.meta.total).toBe(original.meta.total);
    expect(vi.mocked(toast.error)).toHaveBeenCalled();
  });

  it('§8.4 — breadcrumb + captureEvent fire BEFORE the network call', async () => {
    const order: string[] = [];
    vi.mocked(Sentry.addBreadcrumb).mockImplementation(() => {
      order.push('breadcrumb');
      return undefined as never;
    });
    vi.mocked(captureEvent).mockImplementation(() => {
      order.push('capture');
    });
    mockFetch.mockImplementation(() => {
      order.push('network');
      return Promise.resolve(mockJsonResponse({ data: { deleted: 1 }, error: null, meta: null }));
    });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useBulkDeleteFromWatchlist(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ ids: [1] });
    });
    expect(order.indexOf('breadcrumb')).toBeLessThan(order.indexOf('network'));
    expect(order.indexOf('capture')).toBeLessThan(order.indexOf('network'));
    expect(vi.mocked(captureEvent)).toHaveBeenCalledWith('admin_action_performed', {
      action: 'watchlist_bulk_delete',
      target: 'admin_watchlist',
    });
  });

  it('sends DELETE with the ids body to the admin route', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: { deleted: 2 }, error: null, meta: null }),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useBulkDeleteFromWatchlist(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ ids: [4, 9] });
    });
    const [url, init] = mockFetch.mock.calls[0] ?? [];
    expect(url).toBe('/api/admin/leads/watchlist');
    expect((init as { method: string }).method).toBe('DELETE');
    expect(JSON.parse((init as { body: string }).body)).toEqual({ ids: [4, 9] });
  });
});
