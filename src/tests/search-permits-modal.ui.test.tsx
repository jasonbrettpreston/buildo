// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §4 + §5
//             docs/specs/02-web-admin/34_web_admin_testing_protocol.md §4.1
//
// UI test for the rewritten SearchPermitsModal (Spec 36 [PF-HOOKS] — admin
// watchlist search + bulk save). Asserts the search states (idle hint /
// loading / empty / results), the per-row Add + bulk Add-all actions posting
// to the ADMIN route, the CoA badge on coa hits, and a 768px responsive
// smoke (Spec 33 §2 tablet floor).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { SearchPermitsModal } from '@/components/admin/SearchPermitsModal';
import { useFlightCenterStore } from '@/features/admin-flight-center/store/useFlightCenterStore';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock('@/lib/observability/capture', () => ({
  captureEvent: vi.fn(),
}));

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

const PERMIT_HIT = {
  lead_type: 'permit',
  lead_key: 'permit:25 117083 PLB:00',
  permit_num: '25 117083 PLB',
  revision_num: '00',
  coa_application_number: null,
  address: '20 HAZELGLEN',
  lifecycle_phase: 'P7c',
};

const COA_HIT = {
  lead_type: 'coa',
  lead_key: 'coa:A0391/25NY',
  permit_num: null,
  revision_num: null,
  coa_application_number: 'A0391/25NY',
  address: '20 HAZELGLEN AVE',
  lifecycle_phase: 'P20',
};

let mockFetch: ReturnType<typeof vi.fn>;

function mockJsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { queryClient, Wrapper };
}

/** Type into the search box and let the 300ms debounce fire. */
async function typeAndDebounce(value: string) {
  fireEvent.change(screen.getByTestId('search-permits-input'), { target: { value } });
  await new Promise((r) => setTimeout(r, 350));
}

beforeEach(() => {
  mockFetch = vi.fn();
  global.fetch = mockFetch as unknown as typeof fetch;
  useFlightCenterStore.getState().reset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('<SearchPermitsModal> — search states', () => {
  it('idle: shows the 2+ chars hint, no fetch', async () => {
    const { Wrapper } = makeWrapper();
    render(<SearchPermitsModal isOpen onClose={() => {}} />, { wrapper: Wrapper });
    expect(screen.getByTestId('search-permits-hint')).toBeDefined();
    await new Promise((r) => setTimeout(r, 350));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('results: renders permit AND coa hits (CoA badge) from the admin route', async () => {
    mockFetch.mockResolvedValue(
      mockJsonResponse({ data: [PERMIT_HIT, COA_HIT], error: null, meta: null }),
    );
    const { Wrapper } = makeWrapper();
    render(<SearchPermitsModal isOpen onClose={() => {}} />, { wrapper: Wrapper });
    await typeAndDebounce('hazelglen');
    await waitFor(() =>
      expect(screen.getByTestId('search-permits-claim-25 117083 PLB')).toBeDefined(),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/admin/leads/watchlist/search?q=hazelglen',
    );
    expect(screen.getByTestId('search-permits-claim-A0391/25NY')).toBeDefined();
    expect(screen.getByText('CoA')).toBeDefined();
  });

  it('empty: no-match renders the empty message (a miss is a result)', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ data: [], error: null, meta: null }));
    const { Wrapper } = makeWrapper();
    render(<SearchPermitsModal isOpen onClose={() => {}} />, { wrapper: Wrapper });
    await typeAndDebounce('zzzz');
    await waitFor(() => expect(screen.getByTestId('search-permits-empty')).toBeDefined());
  });

  it('error: failed search renders the inline error', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({}, { status: 500 }));
    const { Wrapper } = makeWrapper();
    render(<SearchPermitsModal isOpen onClose={() => {}} />, { wrapper: Wrapper });
    await typeAndDebounce('queen');
    await waitFor(() => expect(screen.getByTestId('search-permits-error')).toBeDefined());
  });
});

describe('<SearchPermitsModal> — save actions (req 2 + 3)', () => {
  it('per-row Add posts ONE item (with the address snapshot) to the bulk route', async () => {
    mockFetch
      .mockResolvedValueOnce(mockJsonResponse({ data: [PERMIT_HIT], error: null, meta: null }))
      .mockResolvedValueOnce(
        mockJsonResponse({ data: { added: 1, skipped_existing: 0, failed: [] }, error: null, meta: null }),
      )
      // onSettled board invalidation refetch (may or may not fire — tolerate).
      .mockResolvedValue(mockJsonResponse({ data: [], error: null, meta: { total: 0, limit: 50, offset: 0 } }));
    const { Wrapper } = makeWrapper();
    render(<SearchPermitsModal isOpen onClose={() => {}} />, { wrapper: Wrapper });
    await typeAndDebounce('hazelglen');
    await waitFor(() =>
      expect(screen.getByTestId('search-permits-claim-25 117083 PLB')).toBeDefined(),
    );

    fireEvent.click(screen.getByTestId('search-permits-claim-25 117083 PLB'));

    await waitFor(() => {
      const post = mockFetch.mock.calls.find(
        (c) => (c[1] as { method?: string } | undefined)?.method === 'POST',
      );
      expect(post?.[0]).toBe('/api/admin/leads/watchlist');
      const body = JSON.parse((post?.[1] as { body: string }).body) as { items: Array<Record<string, unknown>> };
      expect(body.items).toEqual([
        {
          lead_type: 'permit',
          permit_num: '25 117083 PLB',
          revision_num: '00',
          address: '20 HAZELGLEN',
        },
      ]);
    });
  });

  it('Add all shown posts EVERY result in one bulk body', async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse({ data: [PERMIT_HIT, COA_HIT], error: null, meta: null }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({ data: { added: 2, skipped_existing: 0, failed: [] }, error: null, meta: null }),
      )
      .mockResolvedValue(mockJsonResponse({ data: [], error: null, meta: { total: 0, limit: 50, offset: 0 } }));
    const { Wrapper } = makeWrapper();
    render(<SearchPermitsModal isOpen onClose={() => {}} />, { wrapper: Wrapper });
    await typeAndDebounce('hazelglen');
    await waitFor(() => expect(screen.getByTestId('search-permits-add-all')).toBeDefined());

    fireEvent.click(screen.getByTestId('search-permits-add-all'));

    await waitFor(() => {
      const post = mockFetch.mock.calls.find(
        (c) => (c[1] as { method?: string } | undefined)?.method === 'POST',
      );
      const body = JSON.parse((post?.[1] as { body: string }).body) as { items: unknown[] };
      expect(body.items).toHaveLength(2);
    });
  });
});

describe('<SearchPermitsModal> — 768px responsive smoke (Spec 33 §2)', () => {
  it('renders and stays interactive at the tablet floor viewport', async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 768 });
    window.dispatchEvent(new Event('resize'));
    try {
      mockFetch.mockResolvedValue(mockJsonResponse({ data: [], error: null, meta: null }));
      const { Wrapper } = makeWrapper();
      render(<SearchPermitsModal isOpen onClose={() => {}} />, { wrapper: Wrapper });
      expect(screen.getByTestId('search-permits-modal')).toBeDefined();
      fireEvent.change(screen.getByTestId('search-permits-input'), {
        target: { value: 'qu' },
      });
      expect((screen.getByTestId('search-permits-input') as HTMLInputElement).value).toBe('qu');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    }
  });
});
