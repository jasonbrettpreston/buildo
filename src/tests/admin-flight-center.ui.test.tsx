// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.4 + §3.6
//             docs/specs/02-web-admin/34_web_admin_testing_protocol.md §4.1
//
// UI test for the Flight Center Tool. Asserts: 3 temporal sections
// render, predicted_start ± p25/p75 string formatting, search modal
// open/close, save flow + optimistic update, tap-card → drawer with
// inspector pre-filled.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { FlightCenterTool } from '@/components/admin/FlightCenterTool';
import type { FlightBoardItem } from '@/lib/admin/lead-schemas';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

const ITEM_ACTION: FlightBoardItem = {
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

const ITEM_DEPARTING: FlightBoardItem = {
  permit_num: '20-555000',
  revision_num: '00',
  address: '500 King St E',
  lifecycle_phase: 'plan-review',
  lifecycle_stalled: true,
  predicted_start: '2026-07-01',
  p25_days: 45,
  p75_days: 90,
  temporal_group: 'departing_soon',
  updated_at: '2026-05-06T13:00:00Z',
};

const ITEM_HORIZON: FlightBoardItem = {
  permit_num: '20-999111',
  revision_num: '00',
  address: '99 Front St',
  lifecycle_phase: null,
  lifecycle_stalled: false,
  predicted_start: null,
  p25_days: null,
  p75_days: null,
  temporal_group: 'on_the_horizon',
  updated_at: '2026-05-06T14:00:00Z',
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

beforeEach(() => {
  mockFetch = vi.fn();
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('<FlightCenterTool> — Spec 76 §3.4 board grouping', () => {
  it('renders the loading state, then the 3 temporal sections', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        data: [ITEM_ACTION, ITEM_DEPARTING, ITEM_HORIZON],
      }),
    );
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });

    expect(screen.getByTestId('flight-center-loading')).toBeDefined();

    await waitFor(() =>
      expect(screen.getByTestId('flight-center-section-action_required')).toBeDefined(),
    );
    expect(screen.getByTestId('flight-center-section-departing_soon')).toBeDefined();
    expect(screen.getByTestId('flight-center-section-on_the_horizon')).toBeDefined();
  });

  it('places each card in the correct temporal section', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        data: [ITEM_ACTION, ITEM_DEPARTING, ITEM_HORIZON],
      }),
    );
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-card-20-101234--00'));

    const actionSection = screen.getByTestId('flight-center-section-action_required');
    const departingSection = screen.getByTestId('flight-center-section-departing_soon');
    const horizonSection = screen.getByTestId('flight-center-section-on_the_horizon');

    expect(within(actionSection).getByTestId('flight-center-card-20-101234--00')).toBeDefined();
    expect(within(departingSection).getByTestId('flight-center-card-20-555000--00')).toBeDefined();
    expect(within(horizonSection).getByTestId('flight-center-card-20-999111--00')).toBeDefined();
  });

  it('formats predicted_start ± p25/p75 (Spec 77 §3.3.1) on each card', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: [ITEM_ACTION] }),
    );
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-card-20-101234--00'));

    expect(
      screen.getByText(/Predicted 2026-06-15 \(p25 30d \/ p75 60d\)/),
    ).toBeDefined();
  });

  it('falls back to "No prediction yet" when predicted_start is null', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: [ITEM_HORIZON] }),
    );
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-card-20-999111--00'));
    expect(screen.getByText('No prediction yet')).toBeDefined();
  });

  it('shows STALLED badge when lifecycle_stalled is true', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: [ITEM_DEPARTING] }),
    );
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-card-20-555000--00'));
    expect(screen.getByText('STALLED')).toBeDefined();
  });

  it('shows the empty state when the board has no permits', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ data: [] }));
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-empty'));
    // The empty-state message references "Search permits" (the action),
    // and the header button is also labeled "Search permits". Match
    // the empty-state copy specifically via its data-testid scope.
    const empty = screen.getByTestId('flight-center-empty');
    expect(within(empty).getByText(/Search permits/)).toBeDefined();
  });

  it('shows error state with retry on fetch failure', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, { status: 500 }));
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-error'));
    expect(screen.getByText(/Retry/)).toBeDefined();
  });
});

describe('<FlightCenterTool> — Spec 77 §3.1 search → claim flow', () => {
  it('Search permits button opens the modal', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ data: [] }));
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-empty'));

    expect(screen.queryByTestId('search-permits-modal')).toBeNull();
    fireEvent.click(screen.getByTestId('flight-center-search-trigger'));
    expect(screen.getByTestId('search-permits-modal')).toBeDefined();
  });

  it('search input shows "Type 2+ characters" hint when query < 2 chars', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ data: [] }));
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-empty'));
    fireEvent.click(screen.getByTestId('flight-center-search-trigger'));

    expect(screen.getByTestId('search-permits-hint')).toBeDefined();
  });
});

describe('<FlightCenterTool> — Spec 76 §3.4 tap-card drawer', () => {
  it('clicking a card opens the inspector drawer with the card id pre-filled', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: [ITEM_ACTION] }),
    );
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-card-20-101234--00'));

    expect(screen.queryByTestId('flight-center-inspector-drawer')).toBeNull();
    // Click the inspect button (the wrapping button in the card body).
    fireEvent.click(
      screen.getByLabelText(/Inspect 123 Queen St W/i),
    );
    const drawer = screen.getByTestId('flight-center-inspector-drawer');
    expect(drawer).toBeDefined();
    // The inspector inside the drawer should have the id pre-filled in
    // its input AND should already have triggered the detail fetch.
    const inspectorInput = within(drawer).getByTestId(
      'flight-job-inspector-input',
    ) as HTMLInputElement;
    expect(inspectorInput.value).toBe('20-101234--00');
  });

  it('clicking the drawer backdrop closes the drawer', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: [ITEM_ACTION] }),
    );
    // The drawer's inspector immediately fires a detail fetch on mount.
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: ITEM_ACTION, error: null, meta: null }),
    );
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-card-20-101234--00'));
    fireEvent.click(screen.getByLabelText(/Inspect 123 Queen St W/i));

    const drawer = screen.getByTestId('flight-center-inspector-drawer');
    fireEvent.click(drawer); // Backdrop click — drawer is e.target.
    await waitFor(() =>
      expect(screen.queryByTestId('flight-center-inspector-drawer')).toBeNull(),
    );
  });
});

describe('<FlightCenterTool> — Unsave flow', () => {
  it('clicking Unsave optimistically removes the card', async () => {
    // Initial board fetch.
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: [ITEM_ACTION] }),
    );
    // POST /api/leads/save with saved:false.
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, { status: 200 }));
    // Refetch after invalidation — board is now empty.
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ data: [] }));

    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-card-20-101234--00'));

    fireEvent.click(screen.getByTestId('flight-center-unsave-20-101234--00'));

    // After the mutation, the card is gone (optimistic + invalidation).
    await waitFor(() =>
      expect(screen.queryByTestId('flight-center-card-20-101234--00')).toBeNull(),
    );
  });
});
