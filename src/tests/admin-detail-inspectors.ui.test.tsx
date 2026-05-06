// @vitest-environment jsdom
// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 + §3.6
//             docs/specs/02-web-admin/34_web_admin_testing_protocol.md §4.1
//
// UI tests for <LeadDetailInspector> and <FlightJobDetailInspector>.
// Three render states each (idle / loading / result-or-error) + the
// four error variants (NOT_SAVED, INVALID_ID, NETWORK, schema drift).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { LeadDetailInspector } from '@/components/admin/LeadDetailInspector';
import { FlightJobDetailInspector } from '@/components/admin/FlightJobDetailInspector';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

const VALID_LEAD_DETAIL = {
  lead_id: '20-101234--00',
  lead_type: 'permit' as const,
  permit_num: '20-101234',
  revision_num: '00',
  address: '123 Queen St W',
  location: { lat: 43.6532, lng: -79.3832 },
  work_description: 'Major reno',
  applicant: 'Acme Construction',
  lifecycle_phase: 'permit-issued',
  lifecycle_stalled: false,
  target_window: 'work' as const,
  opportunity_score: 0.823,
  competition_count: 3,
  predicted_start: '2026-06-15',
  p25_days: 30,
  p75_days: 60,
  cost: {
    estimated: 250000,
    tier: 'mid',
    range_low: 200000,
    range_high: 300000,
    modeled_gfa_sqm: 180.5,
  },
  neighbourhood: {
    name: 'Queen West',
    avg_household_income: 95000,
    median_household_income: 82000,
    period_of_construction: '1900-1945',
  },
  updated_at: '2026-05-06T12:00:00Z',
  is_saved: true,
};

const VALID_FLIGHT_DETAIL = {
  permit_num: '20-101234',
  revision_num: '00',
  address: '123 Queen St W',
  lifecycle_phase: 'permit-issued',
  lifecycle_stalled: false,
  predicted_start: '2026-06-15',
  p25_days: 30,
  p75_days: 60,
  temporal_group: 'action_required' as const,
  updated_at: '2026-05-06T12:00:00Z',
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
  return { Wrapper };
}

beforeEach(() => {
  mockFetch = vi.fn();
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// LeadDetailInspector
// ===========================================================================

describe('<LeadDetailInspector> — three render states', () => {
  it('renders idle state when no id is supplied', () => {
    const { Wrapper } = makeWrapper();
    render(<LeadDetailInspector />, { wrapper: Wrapper });
    expect(screen.getByTestId('lead-detail-inspector-idle')).toBeDefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('typing an id and submitting triggers a fetch + renders the result', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: VALID_LEAD_DETAIL, error: null, meta: null }),
    );
    const { Wrapper } = makeWrapper();
    render(<LeadDetailInspector />, { wrapper: Wrapper });

    fireEvent.change(screen.getByTestId('lead-detail-inspector-input'), {
      target: { value: '20-101234--00' },
    });
    fireEvent.click(screen.getByTestId('lead-detail-inspector-submit'));

    await waitFor(() => screen.getByTestId('lead-detail-inspector-result'));
    // Structured render shows the lead_id field.
    expect(screen.getByText('20-101234--00')).toBeDefined();
    // Cost estimated localised.
    expect(screen.getByText('250,000')).toBeDefined();
    // Opportunity score formatted to 3 decimals.
    expect(screen.getByText('0.823')).toBeDefined();
  });

  it('initialId pre-fills and immediately fetches', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: VALID_LEAD_DETAIL, error: null, meta: null }),
    );
    const { Wrapper } = makeWrapper();
    render(<LeadDetailInspector initialId="20-101234--00" />, { wrapper: Wrapper });

    const input = screen.getByTestId('lead-detail-inspector-input') as HTMLInputElement;
    expect(input.value).toBe('20-101234--00');
    await waitFor(() => screen.getByTestId('lead-detail-inspector-result'));
  });
});

describe('<LeadDetailInspector> — error states', () => {
  it('404 → NOT_SAVED panel with Spec 91 §4.3.1 recovery copy', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, { status: 404 }));
    const { Wrapper } = makeWrapper();
    render(<LeadDetailInspector initialId="missing-permit" />, { wrapper: Wrapper });

    await waitFor(() =>
      screen.getByTestId('lead-detail-inspector-error-not_saved'),
    );
    expect(screen.getByText(/Search permits/)).toBeDefined();
  });

  it('400 → INVALID_ID panel with serverMessage verbatim', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(
        { error: { code: 'BAD_ID', message: 'lead_id must match the canonical shape' } },
        { status: 400 },
      ),
    );
    const { Wrapper } = makeWrapper();
    render(<LeadDetailInspector initialId="garbage" />, { wrapper: Wrapper });

    await waitFor(() => screen.getByTestId('lead-detail-inspector-error-invalid_id'));
    expect(screen.getByText('lead_id must match the canonical shape')).toBeDefined();
  });

  it('5xx → NETWORK panel', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, { status: 503 }));
    const { Wrapper } = makeWrapper();
    render(<LeadDetailInspector initialId="20-101234--00" />, { wrapper: Wrapper });

    await waitFor(() => screen.getByTestId('lead-detail-inspector-error-network'));
    expect(screen.getByText(/HTTP 503/)).toBeDefined();
  });

  it('schema drift (Zod parse error) renders the parse-error panel with issues', async () => {
    // Server returned a malformed payload — competition_count is negative.
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        data: { ...VALID_LEAD_DETAIL, competition_count: -1 },
        error: null,
        meta: null,
      }),
    );
    const { Wrapper } = makeWrapper();
    render(<LeadDetailInspector initialId="20-101234--00" />, { wrapper: Wrapper });
    await waitFor(() =>
      screen.getByTestId('lead-detail-inspector-parse-error'),
    );
    // The issues list rendering quotes the path "competition_count".
    expect(screen.getByText(/competition_count/)).toBeDefined();
  });
});

// ===========================================================================
// FlightJobDetailInspector
// ===========================================================================

describe('<FlightJobDetailInspector> — three render states', () => {
  it('renders idle state with no initialId', () => {
    const { Wrapper } = makeWrapper();
    render(<FlightJobDetailInspector />, { wrapper: Wrapper });
    expect(screen.getByTestId('flight-job-inspector-idle')).toBeDefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('submit fetches and renders the structured FlightBoardDetail fields', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: VALID_FLIGHT_DETAIL, error: null, meta: null }),
    );
    const { Wrapper } = makeWrapper();
    render(<FlightJobDetailInspector />, { wrapper: Wrapper });
    fireEvent.change(screen.getByTestId('flight-job-inspector-input'), {
      target: { value: '20-101234--00' },
    });
    fireEvent.click(screen.getByTestId('flight-job-inspector-submit'));

    await waitFor(() => screen.getByTestId('flight-job-inspector-result'));
    expect(screen.getByText('20-101234')).toBeDefined();
    expect(screen.getByText('action_required')).toBeDefined();
  });

  it('404 NOT_SAVED renders the same Spec 91 §4.3.1 LATERAL gate recovery panel', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, { status: 404 }));
    const { Wrapper } = makeWrapper();
    render(<FlightJobDetailInspector initialId="missing" />, { wrapper: Wrapper });
    await waitFor(() =>
      screen.getByTestId('flight-job-inspector-error-not_saved'),
    );
  });

  it('schema drift renders the parse-error panel for FlightBoardDetail', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        data: { ...VALID_FLIGHT_DETAIL, temporal_group: 'someday' },
        error: null,
        meta: null,
      }),
    );
    const { Wrapper } = makeWrapper();
    render(<FlightJobDetailInspector initialId="20-101234--00" />, { wrapper: Wrapper });
    await waitFor(() =>
      screen.getByTestId('flight-job-inspector-parse-error'),
    );
    expect(screen.getByText(/temporal_group/)).toBeDefined();
  });
});
