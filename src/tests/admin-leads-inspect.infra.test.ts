// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5 (Cycle 7)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8 + §13
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §10.3
//
// Infra tests for /api/admin/leads/inspect/:id route handler. Mocks the
// auth helper + the fetchLeadInspect query module; asserts the route's
// orchestration contract: 401 on missing admin auth (Spec 33 §5), 400 on
// malformed id, 404 on permit-not-found and CoA-not-supported, 200 on
// success with a Zod-parseable LeadInspect envelope, 500 sanitized on
// downstream throw (Spec 33 §8).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/verify-admin', () => ({
  verifyAdminAuth: vi.fn(),
}));

vi.mock('@/lib/leads/lead-inspect-query', () => ({
  fetchLeadInspect: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { fetchLeadInspect } from '@/lib/leads/lead-inspect-query';
import { LeadInspectSchema } from '@/lib/admin/lead-schemas';

const mockedVerify = vi.mocked(verifyAdminAuth);
const mockedFetch = vi.mocked(fetchLeadInspect);

function makeRequest(): NextRequest {
  return {
    nextUrl: { pathname: '/api/admin/leads/inspect/24-100000--00' },
    method: 'GET',
    headers: { get: () => null },
  } as unknown as NextRequest;
}

function makeContext(id: string): unknown {
  return { params: Promise.resolve({ id }) };
}

async function readJson(res: Response): Promise<unknown> {
  return res.json();
}

// A minimally-populated LeadInspect that passes the Zod schema. Tests that
// assert "200 with valid shape" use this as the fetchLeadInspect mock return.
const OK_INSPECT = {
  lead_id: '24-100000--00',
  lead_type: 'permit' as const,
  source: {
    permit_num: '24-100000',
    revision_num: '00',
    permit_type: 'New Building',
    structure_type: 'Single Family Detached',
    status: 'Permit Issued',
    enriched_status: 'Active Inspection',
    address: {
      street_num: '123',
      street_name: 'Main',
      street_type: 'St',
      full: '123 Main St',
    },
    location: { lat: 43.65, lng: -79.38 },
    application_date: '2024-01-15',
    issued_date: '2024-04-20',
    completed_date: null,
    work: 'New Building',
    description: 'Construct new 2-storey single-family dwelling',
    builder_name: 'ACME Builders Inc',
    owner: 'Jane Doe',
    est_const_cost: 750000,
    last_seen_at: '2026-05-08T12:00:00Z',
    first_seen_at: '2024-01-15T09:00:00Z',
  },
  scope: {
    project_type: 'new_build',
    scope_tags: ['residential', 'new_build'],
  },
  trades: [
    { trade_id: 5, trade_slug: 'framing', confidence: 0.95, is_default_fallback: false },
    { trade_id: 8, trade_slug: 'plumbing', confidence: 0.55, is_default_fallback: true },
  ],
  entity: {
    matched: true,
    legal_name: 'ACME Builders Inc',
    name_normalized: 'acme builders inc',
    wsib_registered: true,
  },
  spatial: {
    parcel: { id: 9999, area_sqm: 450, latitude: 43.65, longitude: -79.38 },
    massing: { area_sqm: 180, height_m: 7.5, stories: 2 },
    neighbourhood: {
      id: 100,
      name: 'Davenport',
      avg_household_income: 95000,
      period_of_construction: '1970-1990',
    },
  },
  cost: {
    cost_source: 'permit' as const,
    is_geometric_override: false,
    estimated_cost_total: 750000,
    modeled_gfa_sqm: 360,
    trade_contract_values: { framing: 75000, plumbing: 50000 },
    inputs: {
      lot_size_sqm: 450,
      footprint_area_sqm: 180,
      height_m: 7.5,
      stories: 2,
      permit_type_allocation_pct: 0.85,
      structure_complexity_factor: 1.0,
      neighbourhood_premium_tier: 'mid',
    },
    liar_gate: {
      modeled_total: 1100000,
      reported_total: 750000,
      ratio: 0.68,
      path: 'proportional_slicing' as const,
    },
  },
  lifecycle: {
    phase: 'P9',
    phase_name: 'Excavation',
    stalled: false,
    classified_at: '2026-05-08T11:00:00Z',
    phase_started_at: '2024-04-20T00:00:00Z',
    current_phase_days_in: 750,
    predicted_remaining_days: 360,
    predicted_completion_at: '2027-05-04T00:00:00Z',
    timeline: [],
  },
  forecast: [
    {
      trade_slug: 'framing',
      target_window: 'work' as const,
      urgency: 'imminent',
      predicted_start: '2026-06-15',
      p25_days: 30,
      p75_days: 90,
      opportunity_score: 75,
      trade_slice_dollar: 75000,
    },
  ],
  engagement: { competition_count: 3, saved_by_admin: false },
  updated_at: '2026-05-08T12:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Auth gate (Spec 33 §5)
// ===========================================================================

describe('GET /api/admin/leads/inspect/:id — auth gate', () => {
  it('returns 401 when verifyAdminAuth returns null', async () => {
    mockedVerify.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/admin/leads/inspect/[id]/route');
    const res = await GET(makeRequest(), makeContext('24-100000--00'));
    expect(res.status).toBe(401);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
    // Spec 33 §5: no DB query when auth fails.
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('returns 200 when verifyAdminAuth returns admin context + permit found', async () => {
    mockedVerify.mockResolvedValueOnce({ uid: 'admin-1', authMethod: 'session' });
    mockedFetch.mockResolvedValueOnce(OK_INSPECT);
    const { GET } = await import('@/app/api/admin/leads/inspect/[id]/route');
    const res = await GET(makeRequest(), makeContext('24-100000--00'));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { data: unknown };
    // Schema validation — guards against contract drift.
    expect(() => LeadInspectSchema.parse(body.data)).not.toThrow();
  });
});

// ===========================================================================
// Lead-id parsing
// ===========================================================================

describe('GET /api/admin/leads/inspect/:id — lead-id parsing', () => {
  it('returns 400 when lead_id is malformed', async () => {
    mockedVerify.mockResolvedValueOnce({ uid: 'admin-1', authMethod: 'session' });
    const { GET } = await import('@/app/api/admin/leads/inspect/[id]/route');
    const res = await GET(makeRequest(), makeContext('definitely-not-a-valid-id'));
    expect(res.status).toBe(400);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('returns 404 with "not yet supported" for CoA leads', async () => {
    mockedVerify.mockResolvedValueOnce({ uid: 'admin-1', authMethod: 'session' });
    const { GET } = await import('@/app/api/admin/leads/inspect/[id]/route');
    const res = await GET(makeRequest(), makeContext('COA-A0001-2024'));
    expect(res.status).toBe(404);
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Downstream behaviors
// ===========================================================================

describe('GET /api/admin/leads/inspect/:id — fetch + error mapping', () => {
  it('returns 404 when fetchLeadInspect resolves null (permit row absent)', async () => {
    mockedVerify.mockResolvedValueOnce({ uid: 'admin-1', authMethod: 'session' });
    mockedFetch.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/admin/leads/inspect/[id]/route');
    const res = await GET(makeRequest(), makeContext('99-999999--00'));
    expect(res.status).toBe(404);
  });

  it('returns 500 sanitized when fetchLeadInspect throws (Spec 33 §8)', async () => {
    mockedVerify.mockResolvedValueOnce({ uid: 'admin-1', authMethod: 'session' });
    mockedFetch.mockRejectedValueOnce(new Error('synthetic DB failure with secret PII'));
    const { GET } = await import('@/app/api/admin/leads/inspect/[id]/route');
    const res = await GET(makeRequest(), makeContext('24-100000--00'));
    expect(res.status).toBe(500);
    const body = (await readJson(res)) as { error: { message: string } };
    // Sanitized — must NOT leak the raw err.message into the envelope.
    expect(body.error.message).not.toContain('synthetic DB failure with secret PII');
  });

  it('passes adminUid into fetchLeadInspect for admin-scoped engagement', async () => {
    mockedVerify.mockResolvedValueOnce({ uid: 'admin-42', authMethod: 'session' });
    mockedFetch.mockResolvedValueOnce(OK_INSPECT);
    const { GET } = await import('@/app/api/admin/leads/inspect/[id]/route');
    await GET(makeRequest(), makeContext('24-100000--00'));
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        permit_num: '24-100000',
        revision_num: '00',
        adminUid: 'admin-42',
      }),
    );
  });
});

// ===========================================================================
// Schema completeness — regression-lock the field set
// ===========================================================================

describe('LeadInspect schema — 8-panel completeness', () => {
  it('parses a fully-populated LeadInspect (all 8 panels rendered)', () => {
    expect(() => LeadInspectSchema.parse(OK_INSPECT)).not.toThrow();
  });

  it('exposes the four Surgical Triangle inputs the cost panel renders', () => {
    const parsed = LeadInspectSchema.parse(OK_INSPECT);
    expect(parsed.cost?.inputs.lot_size_sqm).toBe(450);
    expect(parsed.cost?.inputs.footprint_area_sqm).toBe(180);
    expect(parsed.cost?.inputs.height_m).toBe(7.5);
    expect(parsed.cost?.inputs.stories).toBe(2);
  });

  it('flags is_default_fallback on confidence === 0.55 (DST/ZARA pattern detector)', () => {
    const parsed = LeadInspectSchema.parse(OK_INSPECT);
    const fallback = parsed.trades.find((t) => t.trade_slug === 'plumbing');
    expect(fallback?.is_default_fallback).toBe(true);
  });

  it('distinguishes total cost from per-trade slice', () => {
    const parsed = LeadInspectSchema.parse(OK_INSPECT);
    // Total
    expect(parsed.cost?.estimated_cost_total).toBe(750000);
    // Per-trade slice (separate field, NOT estimated_cost_total)
    expect(parsed.forecast[0]?.trade_slice_dollar).toBe(75000);
    // The two MUST be different fields with different semantics.
    expect(parsed.cost?.estimated_cost_total).not.toBe(parsed.forecast[0]?.trade_slice_dollar);
  });

  it('exposes the Liar\'s Gate decision tree (Spec 83 §3D)', () => {
    const parsed = LeadInspectSchema.parse(OK_INSPECT);
    expect(parsed.cost?.liar_gate.path).toBe('proportional_slicing');
    expect(parsed.cost?.liar_gate.modeled_total).toBe(1100000);
    expect(parsed.cost?.liar_gate.reported_total).toBe(750000);
  });
});
