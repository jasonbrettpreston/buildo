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

// WF2 #4 2026-05-08 — LeadDetailInspector now consumes the LeadInspect shape
// from /api/admin/leads/inspect/:id (Spec 76 §3.5 Cycle 7), not the public
// /api/leads/detail/:id LeadDetail. The 8-panel diagnostic shape is below.
const VALID_LEAD_INSPECT = {
  lead_id: '20-101234--00',
  lead_type: 'permit' as const,
  source: {
    permit_num: '20-101234',
    revision_num: '00',
    permit_type: 'Building Additions/Alterations',
    structure_type: 'Single Family Detached',
    status: 'Permit Issued',
    enriched_status: 'Active Inspection',
    address: {
      street_num: '123',
      street_name: 'Queen',
      street_type: 'St',
      full: '123 Queen St',
    },
    location: { lat: 43.6532, lng: -79.3832 },
    application_date: '2024-01-15',
    issued_date: '2024-04-20',
    completed_date: null,
    work: 'Major reno',
    description: 'Major reno — full second-floor addition + basement underpinning',
    builder_name: 'Acme Construction',
    owner: 'Jane Doe',
    est_const_cost: 250000,
    last_seen_at: '2026-05-08T12:00:00Z',
    first_seen_at: '2024-01-15T09:00:00Z',
  },
  scope: {
    project_type: 'addition',
    scope_tags: ['residential', 'addition'],
  },
  trades: [
    { trade_id: 5, trade_slug: 'framing', confidence: 0.95, is_default_fallback: false },
  ],
  entity: {
    matched: true,
    legal_name: 'Acme Construction',
    name_normalized: 'acme construction',
    wsib_registered: true,
  },
  spatial: {
    parcel: { id: 9999, area_sqm: 450, latitude: 43.65, longitude: -79.38 },
    massing: { area_sqm: 180.5, height_m: 7.5, stories: 2 },
    neighbourhood: {
      id: 100,
      name: 'Queen West',
      avg_household_income: 95000,
      period_of_construction: '1900-1945',
    },
  },
  cost: {
    cost_source: 'permit' as const,
    is_geometric_override: false,
    estimated_cost_total: 250000,
    modeled_gfa_sqm: 180.5,
    trade_contract_values: { framing: 25000 },
    inputs: {
      lot_size_sqm: 450,
      footprint_area_sqm: 180.5,
      height_m: 7.5,
      stories: 2,
      permit_type_allocation_pct: null,
      structure_complexity_factor: null,
      neighbourhood_premium_tier: null,
    },
    liar_gate: {
      modeled_total: 250000,
      reported_total: 250000,
      ratio: 1.0,
      path: 'proportional_slicing' as const,
    },
  },
  lifecycle: {
    phase: 'P9',
    stalled: false,
    classified_at: '2026-05-08T11:00:00Z',
    phase_started_at: '2024-04-20T00:00:00Z',
  },
  forecast: [
    {
      trade_slug: 'framing',
      target_window: 'work' as const,
      urgency: 'imminent',
      predicted_start: '2026-06-15',
      p25_days: 30,
      p75_days: 60,
      opportunity_score: 75,
      trade_slice_dollar: 25000,
    },
  ],
  engagement: { competition_count: 3, saved_by_admin: true },
  updated_at: '2026-05-08T12:00:00Z',
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

describe('<LeadDetailInspector> — fixture parity', () => {
  // Drift guard — if a future amendment to LeadInspectSchema adds/tightens
  // a required field, this test fails so the fixture is updated alongside
  // the schema. Without this, the UI tests would silently pass with stale
  // fixture data while the route's Zod parse would 500 in production.
  // (Worktree-reviewer WF2 #4 finding, confidence 85.)
  it('VALID_LEAD_INSPECT passes LeadInspectSchema — drift guard', async () => {
    const { LeadInspectSchema } = await import('@/lib/admin/lead-schemas');
    expect(() => LeadInspectSchema.parse(VALID_LEAD_INSPECT)).not.toThrow();
  });
});

describe('<LeadDetailInspector> — three render states', () => {
  it('renders idle state when no id is supplied', () => {
    const { Wrapper } = makeWrapper();
    render(<LeadDetailInspector />, { wrapper: Wrapper });
    expect(screen.getByTestId('lead-detail-inspector-idle')).toBeDefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('typing an id and submitting triggers a fetch + renders the 8-panel diagnostic shape', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: VALID_LEAD_INSPECT, error: null, meta: null }),
    );
    const { Wrapper } = makeWrapper();
    render(<LeadDetailInspector />, { wrapper: Wrapper });

    fireEvent.change(screen.getByTestId('lead-detail-inspector-input'), {
      target: { value: '20-101234--00' },
    });
    fireEvent.click(screen.getByTestId('lead-detail-inspector-submit'));

    await waitFor(() => screen.getByTestId('lead-detail-inspector-result'));
    // Structured render shows lead_id + 8 distinct panels per Cycle 7.
    expect(screen.getByText('20-101234--00')).toBeDefined();
    expect(screen.getByTestId('panel-source')).toBeDefined();
    expect(screen.getByTestId('panel-cost')).toBeDefined();
    expect(screen.getByTestId('panel-trades')).toBeDefined();
    expect(screen.getByTestId('panel-spatial')).toBeDefined();
    // Total cost is rendered (the field that was previously mislabeled per user feedback).
    expect(screen.getAllByText('250,000').length).toBeGreaterThan(0);
  });

  it('initialId pre-fills and immediately fetches', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ data: VALID_LEAD_INSPECT, error: null, meta: null }),
    );
    const { Wrapper } = makeWrapper();
    render(<LeadDetailInspector initialId="20-101234--00" />, { wrapper: Wrapper });

    const input = screen.getByTestId('lead-detail-inspector-input') as HTMLInputElement;
    expect(input.value).toBe('20-101234--00');
    await waitFor(() => screen.getByTestId('lead-detail-inspector-result'));
  });
});

describe('<LeadDetailInspector> — error states', () => {
  it('404 → NOT_FOUND panel — admin can inspect any permit, so 404 means absent (Cycle 7)', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, { status: 404 }));
    const { Wrapper } = makeWrapper();
    render(<LeadDetailInspector initialId="missing-permit" />, { wrapper: Wrapper });

    await waitFor(() =>
      screen.getByTestId('lead-detail-inspector-error-not_found'),
    );
    // Cycle 7 amendment: no longer scoped to "permits the admin has saved" —
    // the new admin endpoint bypasses the lead_views.saved=true LATERAL gate.
    expect(screen.getByText(/admin-scoped|genuinely absent/)).toBeDefined();
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
    // Server returned a malformed payload — engagement.competition_count is negative.
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        data: {
          ...VALID_LEAD_INSPECT,
          engagement: { ...VALID_LEAD_INSPECT.engagement, competition_count: -1 },
        },
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
