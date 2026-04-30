// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.3 Detailed Investigation View

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
import { GET } from '@/app/api/leads/flight-board/detail/[id]/route';

const mockedGetUserContext = vi.mocked(getCurrentUserContext);
const mockedPool = pool as unknown as { query: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.resetAllMocks();
});

function makeRequest(): NextRequest {
  return {
    nextUrl: { pathname: '/api/leads/flight-board/detail/x' },
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

const stalledRow = {
  permit_num: '24 101234',
  revision_num: '01',
  address: '123 Main St',
  lifecycle_phase: 'P12',
  lifecycle_stalled: true,
  predicted_start: '2026-04-01',
  p25_days: 30,
  p75_days: 60,
  updated_at: '2026-04-29T10:00:00.000Z',
};

const upcomingRow = {
  ...stalledRow,
  lifecycle_stalled: false,
  // Far-future date so the `temporal_group` test stays stable as wall-clock
  // time advances. computeTemporalGroup is called with `new Date()` (not a
  // mocked clock) so a near-term date would silently flip from
  // 'on_the_horizon' to 'action_required' once the date passed.
  predicted_start: '2099-01-01',
};

async function readJson(res: Response): Promise<unknown> {
  return res.json();
}

// ---------------------------------------------------------------------------
// 200 happy paths
// ---------------------------------------------------------------------------

describe('GET /api/leads/flight-board/detail/[id] — 200', () => {
  it('returns the FlightBoardDetail envelope including updated_at', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedPool.query.mockResolvedValueOnce({ rowCount: 1, rows: [stalledRow] });

    const res = await GET(makeRequest(), makeContext('24 101234--01'));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { data: Record<string, unknown>; error: null };
    expect(body.error).toBeNull();
    expect(body.data).toMatchObject({
      permit_num: '24 101234',
      revision_num: '01',
      address: '123 Main St',
      lifecycle_phase: 'P12',
      lifecycle_stalled: true,
      updated_at: '2026-04-29T10:00:00.000Z',
    });
  });

  it('classifies stalled rows as action_required', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedPool.query.mockResolvedValueOnce({ rowCount: 1, rows: [stalledRow] });

    const res = await GET(makeRequest(), makeContext('24 101234--01'));
    const body = (await readJson(res)) as { data: { temporal_group: string } };
    expect(body.data.temporal_group).toBe('action_required');
  });

  it('falls back to lead_id when address is empty', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedPool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ ...stalledRow, address: '' }],
    });

    const res = await GET(makeRequest(), makeContext('24 101234--01'));
    const body = (await readJson(res)) as { data: { address: string } };
    expect(body.data.address).toBe('24 101234--01');
  });

  it('passes user_id, permit_num, revision_num, trade_slug to the SQL query', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedPool.query.mockResolvedValueOnce({ rowCount: 1, rows: [upcomingRow] });

    await GET(makeRequest(), makeContext('24 101234--01'));
    const callArgs = mockedPool.query.mock.calls[0];
    expect(callArgs).toBeDefined();
    expect(callArgs?.[1]).toEqual([
      'firebase-uid-abc',
      '24 101234',
      '01',
      'plumbing',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 400 invalid id
// ---------------------------------------------------------------------------

describe('GET /api/leads/flight-board/detail/[id] — 400', () => {
  it('rejects empty id', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await GET(makeRequest(), makeContext(''));
    expect(res.status).toBe(400);
  });

  it('rejects CoA ids — flight board only tracks permits', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await GET(makeRequest(), makeContext('COA-A0123/24EYK'));
    expect(res.status).toBe(400);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_LEAD_ID');
    expect(mockedPool.query).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 401 unauthenticated
// ---------------------------------------------------------------------------

describe('GET /api/leads/flight-board/detail/[id] — 401', () => {
  it('returns 401 when no user context resolves', async () => {
    mockedGetUserContext.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(), makeContext('24 101234--01'));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 404 not on board
// ---------------------------------------------------------------------------

describe('GET /api/leads/flight-board/detail/[id] — 404', () => {
  it('returns 404 when the user has not saved this permit', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedPool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await GET(makeRequest(), makeContext('24 101234--01'));
    expect(res.status).toBe(404);
    const body = (await readJson(res)) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Job not on your flight board');
  });
});

// ---------------------------------------------------------------------------
// 500 leak prevention
// ---------------------------------------------------------------------------

describe('GET /api/leads/flight-board/detail/[id] — 500', () => {
  it('returns sanitized 500 when the pool throws', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedPool.query.mockRejectedValueOnce(
      new Error('connection terminated SECRET_DETAIL_X9'),
    );

    const res = await GET(makeRequest(), makeContext('24 101234--01'));
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain('SECRET_DETAIL_X9');
  });
});
