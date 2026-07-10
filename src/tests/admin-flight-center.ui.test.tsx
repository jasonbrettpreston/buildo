// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §4 + §5
//             docs/specs/02-web-admin/34_web_admin_testing_protocol.md §4.1
//
// UI test for the standalone Flight Center Tool (Spec 36 — rewritten off the
// Spec 76 §3.4 prototype). Asserts: skeleton → 3 temporal sections, card
// placement, expected-start formatting, STALLED badge, empty/error states,
// search modal open + hint, bulk-select → confirm dialog → optimistic delete,
// drawer with the PROMINENT flight-semantics header (DELAYED badge +
// EXPECTED START [PF14] initialData path), and the [PF10] no-auto-eviction
// posture (a lifecycle-advanced row still renders).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { FlightCenterTool } from '@/components/admin/FlightCenterTool';
import { useFlightCenterStore } from '@/features/admin-flight-center/store/useFlightCenterStore';
import type { WatchlistItem } from '@/lib/admin/watchlist-schemas';

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

// The drawer's diagnostic panels (LeadDetailInspector) read next/navigation
// (useRouter/useSearchParams) — out of scope for this component test; the
// flight-semantics HEADER is the Spec 36 surface under test.
vi.mock('@/components/admin/LeadDetailInspector', () => ({
  LeadDetailInspector: ({ initialId }: { initialId?: string | null }) => (
    <div data-testid="lead-detail-inspector-mock" data-initial-id={initialId ?? ''} />
  ),
}));

const ITEM_ACTION: WatchlistItem = {
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

const ITEM_DEPARTING: WatchlistItem = {
  id: 2,
  lead_type: 'permit',
  lead_key: 'permit:20-555000:00',
  permit_num: '20-555000',
  revision_num: '00',
  coa_application_number: null,
  address: '500 King St E',
  lifecycle_phase: 'P5',
  lifecycle_stalled: true,
  predicted_start: '2026-07-20',
  p25_days: 45,
  p75_days: 90,
  opportunity_score: 55,
  temporal_group: 'departing_soon',
  saved_at: '2026-07-01T13:00:00Z',
};

// A CoA on the horizon — also stands in for the [PF10] check: lifecycle
// P20 (advanced/terminal) yet still on the board.
const ITEM_HORIZON_COA: WatchlistItem = {
  id: 3,
  lead_type: 'coa',
  lead_key: 'coa:A0123/24TEY',
  permit_num: null,
  revision_num: null,
  coa_application_number: 'A0123/24TEY',
  address: '99 Front St',
  lifecycle_phase: 'P20',
  lifecycle_stalled: false,
  predicted_start: null,
  p25_days: null,
  p75_days: null,
  opportunity_score: null,
  temporal_group: 'on_the_horizon',
  saved_at: '2026-07-01T14:00:00Z',
};

let mockFetch: ReturnType<typeof vi.fn>;

function mockJsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

function boardEnvelope(items: WatchlistItem[], total = items.length) {
  return {
    data: items,
    error: null,
    meta: { total, limit: 50, offset: 0 },
  };
}

/** URL-dispatching fetch mock: board reads resolve; inspect reads hang (the
 *  header must render from initialData [PF14]); DELETE resolves. */
function installFetchDispatch(items: WatchlistItem[]) {
  mockFetch.mockImplementation((url: string, init?: { method?: string }) => {
    const method = init?.method ?? 'GET';
    if (typeof url === 'string' && url.startsWith('/api/admin/leads/watchlist?')) {
      return Promise.resolve(mockJsonResponse(boardEnvelope(items)));
    }
    if (typeof url === 'string' && url.startsWith('/api/admin/leads/watchlist') && method === 'DELETE') {
      return Promise.resolve(mockJsonResponse({ data: { deleted: 1 }, error: null, meta: null }));
    }
    if (typeof url === 'string' && url.startsWith('/api/admin/leads/inspect/')) {
      return new Promise(() => {}); // pending forever — initialData path
    }
    return Promise.resolve(mockJsonResponse({}, { status: 404 }));
  });
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
  // The Zustand store is module-scoped — reset between tests so selection /
  // drawer state never leaks (Spec 35 §B5 reset used as the test hygiene).
  useFlightCenterStore.getState().reset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('<FlightCenterTool> — Spec 36 board grouping', () => {
  it('renders the skeleton, then the 3 temporal sections', async () => {
    installFetchDispatch([ITEM_ACTION, ITEM_DEPARTING, ITEM_HORIZON_COA]);
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });

    expect(screen.getByTestId('flight-center-loading')).toBeDefined();

    await waitFor(() =>
      expect(screen.getByTestId('flight-center-section-action_required')).toBeDefined(),
    );
    expect(screen.getByTestId('flight-center-section-departing_soon')).toBeDefined();
    expect(screen.getByTestId('flight-center-section-on_the_horizon')).toBeDefined();
  });

  it('places each card in its temporal section — including the coa card ([PF10]: terminal P20 still renders)', async () => {
    installFetchDispatch([ITEM_ACTION, ITEM_DEPARTING, ITEM_HORIZON_COA]);
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-card-20-101234--00'));

    const actionSection = screen.getByTestId('flight-center-section-action_required');
    const departingSection = screen.getByTestId('flight-center-section-departing_soon');
    const horizonSection = screen.getByTestId('flight-center-section-on_the_horizon');

    expect(within(actionSection).getByTestId('flight-center-card-20-101234--00')).toBeDefined();
    expect(within(departingSection).getByTestId('flight-center-card-20-555000--00')).toBeDefined();
    // The coa card renders under its COA- segment id, terminal lifecycle and all.
    expect(
      within(horizonSection).getByTestId('flight-center-card-COA-A0123/24TEY'),
    ).toBeDefined();
  });

  it('formats expected start (predicted_start + p25/p75 window) on each card', async () => {
    installFetchDispatch([ITEM_ACTION]);
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-card-20-101234--00'));

    expect(
      screen.getByText(/Expected 2026-06-15 \(p25 30d \/ p75 60d\)/),
    ).toBeDefined();
  });

  it('falls back to "No prediction yet" when predicted_start is null', async () => {
    installFetchDispatch([ITEM_HORIZON_COA]);
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-card-COA-A0123/24TEY'));
    expect(screen.getByText('No prediction yet')).toBeDefined();
  });

  it('shows STALLED badge when lifecycle_stalled is true', async () => {
    installFetchDispatch([ITEM_DEPARTING]);
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-card-20-555000--00'));
    expect(screen.getByText('STALLED')).toBeDefined();
  });

  it('shows the empty state when the watchlist has no rows', async () => {
    installFetchDispatch([]);
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-empty'));
    const empty = screen.getByTestId('flight-center-empty');
    expect(within(empty).getByText(/Find projects/)).toBeDefined();
  });

  it('shows error state with retry on fetch failure', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({}, { status: 500 }));
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-error'));
    expect(screen.getByText(/Retry/)).toBeDefined();
  });
});

describe('<FlightCenterTool> — search modal (req 2)', () => {
  it('Find projects button opens the modal with the 2+ char hint', async () => {
    installFetchDispatch([]);
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-empty'));

    expect(screen.queryByTestId('search-permits-modal')).toBeNull();
    fireEvent.click(screen.getByTestId('flight-center-search-trigger'));
    expect(screen.getByTestId('search-permits-modal')).toBeDefined();
    expect(screen.getByTestId('search-permits-hint')).toBeDefined();
  });
});

describe('<FlightCenterTool> — bulk select → confirm → delete (req 3)', () => {
  it('checkbox select enables bulk delete; confirm dialog fires the DELETE and removes the card', async () => {
    installFetchDispatch([ITEM_ACTION, ITEM_DEPARTING]);
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-card-20-101234--00'));

    // Disabled until something is selected.
    const bulkButton = screen.getByTestId('flight-center-bulk-delete') as HTMLButtonElement;
    expect(bulkButton.disabled).toBe(true);

    fireEvent.click(screen.getByTestId('flight-center-check-1'));
    expect((screen.getByTestId('flight-center-bulk-delete') as HTMLButtonElement).disabled).toBe(false);

    // Confirm-on-destructive (Spec 33 §14): the dialog, never confirm().
    fireEvent.click(screen.getByTestId('flight-center-bulk-delete'));
    expect(screen.getByTestId('flight-center-delete-confirm')).toBeDefined();

    fireEvent.click(screen.getByTestId('flight-center-delete-confirm-button'));

    // Optimistic removal (§B3) — the card disappears without a refetch.
    await waitFor(() =>
      expect(screen.queryByTestId('flight-center-card-20-101234--00')).toBeNull(),
    );
    // The DELETE hit the admin route with the selected id.
    const deleteCall = mockFetch.mock.calls.find(
      (c) => (c[1] as { method?: string } | undefined)?.method === 'DELETE',
    );
    expect(deleteCall?.[0]).toBe('/api/admin/leads/watchlist');
    const body = JSON.parse((deleteCall?.[1] as { body: string }).body) as { ids: number[] };
    expect(body.ids).toEqual([1]);
  });

  it('select-page selects every visible row', async () => {
    installFetchDispatch([ITEM_ACTION, ITEM_DEPARTING, ITEM_HORIZON_COA]);
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-card-20-101234--00'));

    fireEvent.click(screen.getByTestId('flight-center-select-all'));
    expect(screen.getByText(/Delete selected \(3\)/)).toBeDefined();
  });
});

describe('<FlightCenterTool> — detail drawer (req 4, [PF14])', () => {
  it('clicking a card opens the drawer with the flight-semantics header from the cached row', async () => {
    // ITEM_DEPARTING is stalled → DELAYED badge from initialData, before
    // the (never-resolving) inspect fetch returns.
    installFetchDispatch([ITEM_DEPARTING]);
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-card-20-555000--00'));

    expect(screen.queryByTestId('flight-center-inspector-drawer')).toBeNull();
    fireEvent.click(screen.getByLabelText(/Inspect 500 King St E/i));

    const drawer = screen.getByTestId('flight-center-inspector-drawer');
    expect(drawer).toBeDefined();
    // PROMINENT header: DELAYED badge + expected start + temporal chip.
    expect(within(drawer).getByTestId('flight-center-delayed-badge')).toBeDefined();
    expect(within(drawer).getByTestId('flight-center-expected-start').textContent).toMatch(
      /Expected 2026-07-20/,
    );
    expect(within(drawer).getByTestId('flight-center-temporal-chip')).toBeDefined();
    // The all-info panels mount below with the segment id pre-filled.
    expect(
      within(drawer).getByTestId('lead-detail-inspector-mock').getAttribute('data-initial-id'),
    ).toBe('20-555000--00');
  });

  it('clicking the drawer backdrop closes it', async () => {
    installFetchDispatch([ITEM_ACTION]);
    const { Wrapper } = makeWrapper();
    render(<FlightCenterTool />, { wrapper: Wrapper });
    await waitFor(() => screen.getByTestId('flight-center-card-20-101234--00'));
    fireEvent.click(screen.getByLabelText(/Inspect 123 Queen St W/i));

    const drawer = screen.getByTestId('flight-center-inspector-drawer');
    fireEvent.click(drawer); // backdrop click — drawer is e.target
    await waitFor(() =>
      expect(screen.queryByTestId('flight-center-inspector-drawer')).toBeNull(),
    );
  });
});
