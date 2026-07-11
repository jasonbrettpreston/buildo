// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.2 Main Flight Board View
//
// P22 exit battery — LIST route (src/app/api/leads/flight-board/route.ts).
//
// Tests:
//   - Auth: 401 when getCurrentUserContext returns null
//   - Auto-archive filter (:94-98): permits whose lifecycle_phase has
//     advanced past the viewer's trade work_phase are excluded
//   - Group-order sort (:111-119): action_required → departing_soon →
//     on_the_horizon; within each group, ascending predicted_start
//     (null floats to bottom)
//   - Null-score demotion at route level (computeTemporalGroup called
//     with NULL opportunity_score → on_the_horizon regardless of
//     predicted_start position)
//   - 500 sanitized: internal DB error does not leak to caller

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
import { GET } from '@/app/api/leads/flight-board/route';

const mockedGetUserContext = vi.mocked(getCurrentUserContext);
const mockedPool = pool as unknown as { query: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.resetAllMocks();
});

function makeRequest(search = ''): NextRequest {
  return {
    nextUrl: {
      pathname: '/api/leads/flight-board',
      searchParams: new URLSearchParams(search),
    },
    method: 'GET',
  } as unknown as NextRequest;
}

// ---------------------------------------------------------------------------
// Shared fixture rows
// ---------------------------------------------------------------------------

// Stalled + meaningful score → action_required (stays in list; past work_phase P12)
const stalledWithinPhase = {
  permit_num: 'P22I-001',
  revision_num: '00',
  address: '100 Main St',
  lifecycle_phase: 'P10',          // PHASE_INDEX['P10'] = 13 ≤ 15 (plumbing P12) → kept
  lifecycle_stalled: true,
  predicted_start: '2099-01-01',   // Far-future so test is stable as wall-clock advances
  p25_days: 20,
  p75_days: 60,
  opportunity_score: 50,
  updated_at: '2026-07-10T10:00:00.000Z',
};

// Departing soon: within 14 days
const departingSoon = {
  ...stalledWithinPhase,
  permit_num: 'P22I-002',
  lifecycle_stalled: false,
  predicted_start: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  opportunity_score: 30,
};

// On the horizon: far-future date
const onHorizonNormal = {
  ...stalledWithinPhase,
  permit_num: 'P22I-003',
  lifecycle_stalled: false,
  predicted_start: '2099-06-01',
  opportunity_score: 20,
};

// Null-score: no forecast row → LEFT JOIN gives null → demoted to on_the_horizon
const nullScoreRow = {
  ...stalledWithinPhase,
  permit_num: 'P22I-004',
  lifecycle_stalled: false,
  predicted_start: '2026-01-01',   // Past date — would be action_required WITHOUT demotion
  opportunity_score: null,
};

// Auto-archive candidate: lifecycle_phase past plumbing work_phase (P12)
// PHASE_INDEX['P13'] = 16 > 15 → filtered out for plumbing viewer
const pastWorkPhase = {
  ...stalledWithinPhase,
  permit_num: 'P22I-005',
  lifecycle_phase: 'P13',
  lifecycle_stalled: false,
  predicted_start: null,
  opportunity_score: 40,
};

// At-work-phase: lifecycle_phase exactly equal to work_phase (P12) → kept
const atWorkPhase = {
  ...stalledWithinPhase,
  permit_num: 'P22I-006',
  lifecycle_phase: 'P12',
  lifecycle_stalled: false,
  predicted_start: '2099-03-01',
  opportunity_score: 25,
};

const plumbingContext = {
  uid: 'p22-test-uid',
  trade_slug: 'plumbing',          // work_phase = P12 (PHASE_INDEX = 15) per TRADE_TARGET_PHASE
  primary_trade_slug: 'plumbing',
  trade_slugs: ['plumbing'],
  display_name: null,
  subscription_status: null,
};

async function readJson(res: Response): Promise<unknown> {
  return res.json();
}

// ---------------------------------------------------------------------------
// 401 unauthenticated
// ---------------------------------------------------------------------------

describe('GET /api/leads/flight-board — 401', () => {
  it('returns 401 when no user context resolves', async () => {
    mockedGetUserContext.mockResolvedValueOnce(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Auto-archive filter (route.ts :94-98)
// ---------------------------------------------------------------------------

describe('GET /api/leads/flight-board — auto-archive filter', () => {
  it('excludes permits whose lifecycle_phase EXCEEDS the trade work_phase', async () => {
    // lifecycle_phase='P13' → PHASE_INDEX 16 > 15 (plumbing P12) → filtered out
    mockedGetUserContext.mockResolvedValueOnce(plumbingContext);
    mockedPool.query.mockResolvedValueOnce({ rows: [pastWorkPhase] });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });

  it('retains permits at exactly the trade work_phase', async () => {
    // lifecycle_phase='P12' → PHASE_INDEX 15 = 15 (plumbing) → kept
    mockedGetUserContext.mockResolvedValueOnce(plumbingContext);
    mockedPool.query.mockResolvedValueOnce({ rows: [atWorkPhase] });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { data: Array<{ permit_num: string }> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.permit_num).toBe('P22I-006');
  });

  it('retains permits with null lifecycle_phase (not yet classified)', async () => {
    // lifecycle_phase=null → the filter returns true → kept
    mockedGetUserContext.mockResolvedValueOnce(plumbingContext);
    const nullPhaseRow = { ...stalledWithinPhase, permit_num: 'P22I-007', lifecycle_phase: null };
    mockedPool.query.mockResolvedValueOnce({ rows: [nullPhaseRow] });

    const res = await GET(makeRequest());
    const body = (await readJson(res)) as { data: Array<{ permit_num: string }> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.permit_num).toBe('P22I-007');
  });
});

// ---------------------------------------------------------------------------
// Group-order sort (route.ts :111-119)
// ---------------------------------------------------------------------------

describe('GET /api/leads/flight-board — group-order sort', () => {
  it('orders action_required before departing_soon before on_the_horizon', async () => {
    // Seed rows in reverse group order so a pass-through sort would fail.
    // onHorizonNormal → on_the_horizon
    // departingSoon   → departing_soon
    // stalledWithinPhase → action_required (stalled + positive score)
    mockedGetUserContext.mockResolvedValueOnce(plumbingContext);
    mockedPool.query.mockResolvedValueOnce({
      rows: [onHorizonNormal, departingSoon, stalledWithinPhase],
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      data: Array<{ permit_num: string; temporal_group: string }>;
    };

    expect(body.data).toHaveLength(3);
    expect(body.data[0]?.temporal_group).toBe('action_required');
    expect(body.data[0]?.permit_num).toBe('P22I-001');
    expect(body.data[1]?.temporal_group).toBe('departing_soon');
    expect(body.data[1]?.permit_num).toBe('P22I-002');
    expect(body.data[2]?.temporal_group).toBe('on_the_horizon');
    expect(body.data[2]?.permit_num).toBe('P22I-003');
  });

  it('sorts ascending predicted_start within a group; null floats to bottom', async () => {
    // Two on-the-horizon rows (both have null/positive score, far-future dates):
    //   early: 2099-01-01, late: 2099-12-31, nullDate: null
    const early = { ...onHorizonNormal, permit_num: 'P22I-EARLY', predicted_start: '2099-01-01' };
    const late = { ...onHorizonNormal, permit_num: 'P22I-LATE', predicted_start: '2099-12-31' };
    const nullDate = { ...onHorizonNormal, permit_num: 'P22I-NULL', predicted_start: null };

    mockedGetUserContext.mockResolvedValueOnce(plumbingContext);
    mockedPool.query.mockResolvedValueOnce({ rows: [nullDate, late, early] });

    const res = await GET(makeRequest());
    const body = (await readJson(res)) as { data: Array<{ permit_num: string }> };

    expect(body.data[0]?.permit_num).toBe('P22I-EARLY');
    expect(body.data[1]?.permit_num).toBe('P22I-LATE');
    expect(body.data[2]?.permit_num).toBe('P22I-NULL');
  });
});

// ---------------------------------------------------------------------------
// Null-score demotion (computeTemporalGroup via route.ts :108)
// ---------------------------------------------------------------------------

describe('GET /api/leads/flight-board — null-score demotion (WF3 #13 Finding F)', () => {
  it('demotes row with null opportunity_score to on_the_horizon even when past predicted_start', async () => {
    // Without the demotion rule, a row with past predicted_start AND no score
    // would land in action_required — cluttering the operator's top queue.
    // The demotion fires BEFORE the lifecycle_stalled check (per flight-board-temporal.ts:56).
    mockedGetUserContext.mockResolvedValueOnce(plumbingContext);
    mockedPool.query.mockResolvedValueOnce({ rows: [nullScoreRow] });

    const res = await GET(makeRequest());
    const body = (await readJson(res)) as {
      data: Array<{ permit_num: string; temporal_group: string }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.temporal_group).toBe('on_the_horizon');
  });

  it('demotes stalled + null-score row to on_the_horizon (score check fires first)', async () => {
    // Stalled + meaningful score → action_required.
    // Stalled + null score → on_the_horizon (score gate fires first per :56-58).
    const stalledNullScore = { ...nullScoreRow, permit_num: 'P22I-STL-NULL', lifecycle_stalled: true };
    mockedGetUserContext.mockResolvedValueOnce(plumbingContext);
    mockedPool.query.mockResolvedValueOnce({ rows: [stalledNullScore] });

    const res = await GET(makeRequest());
    const body = (await readJson(res)) as { data: Array<{ temporal_group: string }> };
    expect(body.data[0]?.temporal_group).toBe('on_the_horizon');
  });
});

// ---------------------------------------------------------------------------
// 500 leak prevention
// ---------------------------------------------------------------------------

describe('GET /api/leads/flight-board — 500', () => {
  it('returns sanitized 500 when the pool throws', async () => {
    mockedGetUserContext.mockResolvedValueOnce(plumbingContext);
    mockedPool.query.mockRejectedValueOnce(new Error('DB connection refused SECRET_CONN_INFO'));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain('SECRET_CONN_INFO');
  });
});

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

describe('GET /api/leads/flight-board — response shape', () => {
  it('returns envelope { data: [...], error: null } with all expected fields', async () => {
    mockedGetUserContext.mockResolvedValueOnce(plumbingContext);
    mockedPool.query.mockResolvedValueOnce({ rows: [stalledWithinPhase] });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      data: Array<Record<string, unknown>>;
      error: null;
    };
    expect(body.error).toBeNull();
    const item = body.data[0];
    expect(item).toBeDefined();
    expect(typeof item?.['permit_num']).toBe('string');
    expect(typeof item?.['revision_num']).toBe('string');
    expect(typeof item?.['address']).toBe('string');
    expect(typeof item?.['temporal_group']).toBe('string');
    // temporal_group must be one of the three valid values
    expect(['action_required', 'departing_soon', 'on_the_horizon']).toContain(
      item?.['temporal_group'],
    );
    // updated_at must be present
    expect(item?.['updated_at']).toBe('2026-07-10T10:00:00.000Z');
  });
});
