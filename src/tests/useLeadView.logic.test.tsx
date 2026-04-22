// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §2.3
//
// useLeadView mutation hook tests. Verifies the happy path + error path
// + that save/unsave invalidates the savedLeads query slice. Uses a real
// QueryClient per test so we can observe invalidation effects.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLeadView } from '@/features/leads/api/useLeadView';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function makeWrapper(client: QueryClient) {
  return function Wrap({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useLeadView — happy path', () => {
  it('POSTs to /api/leads/view and returns the competition_count', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { competition_count: 7 },
        error: null,
        meta: null,
      }),
    } as Response);

    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const { result } = renderHook(() => useLeadView(), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate({
      action: 'view',
      lead_type: 'permit',
      trade_slug: 'plumbing',
      permit_num: '24 101234',
      revision_num: '01',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data.competition_count).toBe(7);

    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe('/api/leads/view');
    expect(call?.[1]?.method).toBe('POST');
    const parsedBody = JSON.parse(String(call?.[1]?.body));
    expect(parsedBody.action).toBe('view');
    expect(parsedBody.lead_type).toBe('permit');
  });

  it('invalidates savedLeads queries on save action', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { competition_count: 3 },
        error: null,
        meta: null,
      }),
    } as Response);

    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useLeadView(), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate({
      action: 'save',
      lead_type: 'permit',
      trade_slug: 'plumbing',
      permit_num: '24 101234',
      revision_num: '01',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['savedLeads'],
      exact: false,
    });
  });

  it('does NOT invalidate savedLeads on view action (view is a telemetry-only event)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { competition_count: 5 },
        error: null,
        meta: null,
      }),
    } as Response);

    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useLeadView(), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate({
      action: 'view',
      lead_type: 'permit',
      trade_slug: 'plumbing',
      permit_num: '24 101234',
      revision_num: '01',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useLeadView — error handling', () => {
  it('surfaces LeadApiClientError on rate limit 429', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        data: null,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
        },
        meta: null,
      }),
    } as Response);

    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const { result } = renderHook(() => useLeadView(), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate({
      action: 'save',
      lead_type: 'permit',
      trade_slug: 'plumbing',
      permit_num: '24 101234',
      revision_num: '01',
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe('RATE_LIMITED');
  });
});
