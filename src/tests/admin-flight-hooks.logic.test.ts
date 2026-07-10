// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 + §3.6
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §13
//
// Hook tests for the SURVIVING admin-flight-center detail hooks
// (useFlightBoardDetail, useLeadDetail — their routes are unchanged by
// Spec 36). The four consumer-route hooks this file previously locked
// (useAdminFlightBoard / useSavePermit / useUnsavePermit / useSearchPermits)
// were RETIRED by Spec 36 P15-15C [PF-HOOKS] — their replacements
// (useWatchlist / useBulkSaveToWatchlist / useBulkDeleteFromWatchlist /
// useWatchlistSearch) are locked in
// src/tests/admin-watchlist-hooks.logic.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import React from 'react';

import { useFlightBoardDetail, FlightBoardDetailError } from '@/features/admin-flight-center/api/useFlightBoardDetail';
import { useLeadDetail, LeadDetailError } from '@/features/admin-flight-center/api/useLeadDetail';
import type { FlightBoardItem } from '@/lib/admin/lead-schemas';

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
  // between tests. gcTime: Infinity keeps observer-less entries alive
  // long enough for assertions.
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
