// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.3.1
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 row "Phase G"
//
// Phase G adds a CoA branch to /api/leads/detail/[id]. Pre-Phase G, CoA URL
// segments (`COA-${application_number}`) returned 404. Post-Phase G, the route
// resolves them via COA_LEAD_DETAIL_SQL + toCoaLeadDetail.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db/client', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('@/lib/auth/get-user-context', () => ({
  getCurrentUserContext: vi.fn(),
}));

import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { pool } from '@/lib/db/client';
import { GET } from '@/app/api/leads/detail/[id]/route';
import { COA_LEAD_DETAIL_SQL, toCoaLeadDetail } from '@/lib/leads/lead-detail-query';

const mockedGetUserContext = vi.mocked(getCurrentUserContext);
const mockedPool = pool as unknown as { query: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.resetAllMocks();
});

function makeRequest(): NextRequest {
  return {
    nextUrl: { pathname: '/api/leads/detail/x' },
    method: 'GET',
  } as unknown as NextRequest;
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

const sampleContext = {
  uid: 'firebase-uid-abc',
  trade_slug: 'plumbing',
  display_name: null,
  subscription_status: null,
};

const sampleCoaRow = {
  application_number: 'A0123-24EYK',
  street_num: '456',
  street_name: 'Spadina Ave',
  work_description: 'Minor variance for rear deck',
  lifecycle_phase: 'P2',
  lifecycle_stalled: false,
  latitude: '43.65',
  longitude: '-79.40',
  updated_at: '2026-05-01T12:00:00.000Z',
  estimated_cost: '125000.00',
  modeled_gfa_sqm: '24.5',
  neighbourhood_name: 'Kensington',
  avg_household_income: 95000,
  median_household_income: 82000,
  period_of_construction: '1961-1980',
  predicted_start: '2026-07-15',
  p25_days: 14,
  p75_days: 45,
  opportunity_score: 62,
  target_window: 'bid' as const,
  competition_count: 2,
  saved: false,
};

async function readJson(res: Response): Promise<unknown> {
  return res.json();
}

// ===========================================================================
// Route dispatch — COA-prefix URL segment hits the CoA branch
// ===========================================================================

describe('GET /api/leads/detail/[id] — CoA branch (Phase G)', () => {
  it('returns 200 + LeadDetail envelope for COA-${application_number} URL', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedPool.query.mockResolvedValueOnce({ rowCount: 1, rows: [sampleCoaRow] });

    const res = await GET(makeRequest(), makeContext('COA-A0123-24EYK'));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { data: Record<string, unknown>; error: null };
    expect(body.error).toBeNull();
    expect(body.data).toMatchObject({
      lead_id: 'COA-A0123-24EYK',
      lead_type: 'coa',
      permit_num: null,
      revision_num: null,
      address: '456 Spadina Ave',
    });
  });

  it('dispatches to COA_LEAD_DETAIL_SQL with [application_number, trade_slug, uid]', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedPool.query.mockResolvedValueOnce({ rowCount: 1, rows: [sampleCoaRow] });

    await GET(makeRequest(), makeContext('COA-A0123-24EYK'));

    expect(mockedPool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM coa_applications ca'),
      ['A0123-24EYK', 'plumbing', 'firebase-uid-abc'],
    );
  });

  it('returns 404 when the CoA application_number does not exist', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedPool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await GET(makeRequest(), makeContext('COA-DOES-NOT-EXIST'));
    expect(res.status).toBe(404);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

// ===========================================================================
// CoA cost envelope (v2-Q3 partial map)
// ===========================================================================

describe('toCoaLeadDetail — cost envelope', () => {
  it('populates estimated + modeled_gfa_sqm; sets tier/range_low/range_high to null', () => {
    const detail = toCoaLeadDetail(sampleCoaRow);
    expect(detail.cost).not.toBeNull();
    expect(detail.cost!.estimated).toBe(125000);
    expect(detail.cost!.modeled_gfa_sqm).toBe(24.5);
    expect(detail.cost!.tier).toBeNull();
    expect(detail.cost!.range_low).toBeNull();
    expect(detail.cost!.range_high).toBeNull();
  });

  it('returns cost: null when BOTH estimated_cost AND modeled_gfa_sqm are null', () => {
    const detail = toCoaLeadDetail({
      ...sampleCoaRow,
      estimated_cost: null,
      modeled_gfa_sqm: null,
    });
    expect(detail.cost).toBeNull();
  });

  it('returns populated cost object when only estimated_cost is set', () => {
    const detail = toCoaLeadDetail({
      ...sampleCoaRow,
      estimated_cost: '50000',
      modeled_gfa_sqm: null,
    });
    expect(detail.cost).not.toBeNull();
    expect(detail.cost!.estimated).toBe(50000);
    expect(detail.cost!.modeled_gfa_sqm).toBeNull();
  });

  it('returns populated cost object when only modeled_gfa_sqm is set', () => {
    const detail = toCoaLeadDetail({
      ...sampleCoaRow,
      estimated_cost: null,
      modeled_gfa_sqm: '18',
    });
    expect(detail.cost).not.toBeNull();
    expect(detail.cost!.estimated).toBeNull();
    expect(detail.cost!.modeled_gfa_sqm).toBe(18);
  });
});

// ===========================================================================
// CoA lead_type discriminator + null permit fields
// ===========================================================================

describe('toCoaLeadDetail — envelope shape', () => {
  it('sets lead_type=coa and nulls permit_num + revision_num', () => {
    const detail = toCoaLeadDetail(sampleCoaRow);
    expect(detail.lead_type).toBe('coa');
    expect(detail.permit_num).toBeNull();
    expect(detail.revision_num).toBeNull();
  });

  it('returns is_saved=true when the row reports saved=true (viewer-scoped LATERAL)', () => {
    const detail = toCoaLeadDetail({ ...sampleCoaRow, saved: true });
    expect(detail.is_saved).toBe(true);
  });

  it('falls back to lead_id when address is unavailable', () => {
    const detail = toCoaLeadDetail({
      ...sampleCoaRow,
      street_num: null,
      street_name: null,
    });
    expect(detail.address).toBe('COA-A0123-24EYK');
  });
});

// ===========================================================================
// COA_LEAD_DETAIL_SQL — substrate guards
// ===========================================================================

describe('COA_LEAD_DETAIL_SQL — SQL contract', () => {
  it('LEFT JOINs neighbourhoods (preserves CoA row when no neighbourhood match)', () => {
    expect(COA_LEAD_DETAIL_SQL).toMatch(/LEFT JOIN neighbourhoods/);
  });

  it('LEFT JOINs trade_forecasts on coa: lead_id pattern', () => {
    expect(COA_LEAD_DETAIL_SQL).toMatch(/tf\.lead_id\s*=\s*\('coa:' \|\| ca\.application_number\)/);
  });

  it('is_saved LATERAL subquery uses AS saved alias (matches permit-side convention)', () => {
    expect(COA_LEAD_DETAIL_SQL).toMatch(/AS saved/);
  });

  it('competition_count excludes the viewer via user_id != $3', () => {
    expect(COA_LEAD_DETAIL_SQL).toMatch(/lv2\.user_id != \$3::text/);
    expect(COA_LEAD_DETAIL_SQL).toMatch(/lv2\.lead_type = 'coa'/);
  });
});
