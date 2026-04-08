// 🔗 SPEC LINK: docs/specs/product/future/70_lead_feed.md §API Endpoints
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db/client', () => ({
  pool: {} as unknown,
}));

vi.mock('@/lib/auth/get-user-context', () => ({
  getCurrentUserContext: vi.fn(),
}));

vi.mock('@/lib/auth/rate-limit', () => ({
  withRateLimit: vi.fn(),
}));

vi.mock('@/features/leads/lib/record-lead-view', () => ({
  recordLeadView: vi.fn(),
}));

vi.mock('@/features/leads/api/request-logging', () => ({
  logRequestComplete: vi.fn(),
}));

import { getCurrentUserContext } from '@/lib/auth/get-user-context';
import { withRateLimit } from '@/lib/auth/rate-limit';
import { logRequestComplete } from '@/features/leads/api/request-logging';
import { recordLeadView } from '@/features/leads/lib/record-lead-view';
import { POST } from '@/app/api/leads/view/route';

const mockedGetUserContext = vi.mocked(getCurrentUserContext);
const mockedWithRateLimit = vi.mocked(withRateLimit);
const mockedRecordLeadView = vi.mocked(recordLeadView);
const mockedLogRequestComplete = vi.mocked(logRequestComplete);

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown, opts?: { malformed?: boolean }): NextRequest {
  // Minimal NextRequest stand-in. Only `.json()` is consumed by the route.
  return {
    json: async () => {
      if (opts?.malformed) throw new SyntaxError('Unexpected token');
      return body;
    },
  } as unknown as NextRequest;
}

const sampleContext = {
  uid: 'firebase-uid-abc',
  trade_slug: 'plumbing',
  display_name: null,
};

const validPermitBody = {
  trade_slug: 'plumbing',
  action: 'view' as const,
  lead_type: 'permit' as const,
  permit_num: '24 101234',
  revision_num: '01',
};

const validBuilderBody = {
  trade_slug: 'plumbing',
  action: 'save' as const,
  lead_type: 'builder' as const,
  entity_id: 9183,
};

function setHappyPathMocks(competition_count = 3) {
  mockedGetUserContext.mockResolvedValueOnce(sampleContext);
  mockedWithRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 59 });
  mockedRecordLeadView.mockResolvedValueOnce({ ok: true, competition_count });
}

async function readJson(res: Response): Promise<unknown> {
  return res.json();
}

// ---------------------------------------------------------------------------
// 200 OK happy paths
// ---------------------------------------------------------------------------

describe('POST /api/leads/view — 200 happy paths', () => {
  it('returns 200 with competition_count for permit view', async () => {
    setHappyPathMocks(7);
    const res = await POST(makeRequest(validPermitBody));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { data: { competition_count: number }; error: unknown };
    expect(body.data.competition_count).toBe(7);
    expect(body.error).toBeNull();
  });

  it('returns 200 for builder save', async () => {
    setHappyPathMocks(2);
    const res = await POST(makeRequest(validBuilderBody));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { data: { competition_count: number } };
    expect(body.data.competition_count).toBe(2);
  });

  it('returns 200 for unsave action (permit)', async () => {
    setHappyPathMocks();
    const res = await POST(
      makeRequest({ ...validPermitBody, action: 'unsave' }),
    );
    expect(res.status).toBe(200);
  });

  it('returns 200 for unsave action (builder) — symmetry with permit', async () => {
    setHappyPathMocks();
    const res = await POST(
      makeRequest({ ...validBuilderBody, action: 'unsave' }),
    );
    expect(res.status).toBe(200);
  });

  it('200 response envelope includes meta: null (envelope contract)', async () => {
    setHappyPathMocks();
    const res = await POST(makeRequest(validPermitBody));
    const body = (await readJson(res)) as { data: unknown; error: unknown; meta: unknown };
    expect(body.meta).toBeNull();
    expect(body.error).toBeNull();
  });

  it('passes uid from auth context to recordLeadView (body has no user_id field — strict schema)', async () => {
    setHappyPathMocks();
    await POST(makeRequest(validPermitBody));
    const call = mockedRecordLeadView.mock.calls[0];
    expect(call?.[0].user_id).toBe('firebase-uid-abc');
  });

  it('logRequestComplete is called with all observability fields on 200', async () => {
    setHappyPathMocks(4);
    await POST(makeRequest(validPermitBody));
    expect(mockedLogRequestComplete).toHaveBeenCalledTimes(1);
    const call = mockedLogRequestComplete.mock.calls[0];
    expect(call?.[0]).toBe('[api/leads/view]');
    const ctx = call?.[1] as Record<string, unknown>;
    expect(ctx).toHaveProperty('user_id', 'firebase-uid-abc');
    expect(ctx).toHaveProperty('trade_slug', 'plumbing');
    expect(ctx).toHaveProperty('action', 'view');
    expect(ctx).toHaveProperty('lead_type', 'permit');
    expect(ctx).toHaveProperty('competition_count', 4);
  });

  it('logRequestComplete captures action/lead_type for builder save (variant coverage)', async () => {
    setHappyPathMocks(1);
    await POST(makeRequest(validBuilderBody));
    const ctx = mockedLogRequestComplete.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(ctx).toHaveProperty('action', 'save');
    expect(ctx).toHaveProperty('lead_type', 'builder');
  });

  it('does NOT call logRequestComplete on error paths', async () => {
    mockedGetUserContext.mockResolvedValueOnce(null);
    await POST(makeRequest(validPermitBody));
    expect(mockedLogRequestComplete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 400 — malformed JSON / validation
// ---------------------------------------------------------------------------

describe('POST /api/leads/view — 400 Body parsing', () => {
  it('returns 400 INVALID_JSON when body is not valid JSON', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await POST(makeRequest(null, { malformed: true }));
    expect(res.status).toBe(400);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_JSON');
  });

  it('returns 400 VALIDATION_FAILED when body is null', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await POST(makeRequest(null));
    expect(res.status).toBe(400);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 400 VALIDATION_FAILED when body is an empty object', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/leads/view — 400 Validation', () => {
  it('returns 400 when permit body has entity_id (strict XOR)', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await POST(
      makeRequest({ ...validPermitBody, entity_id: 9183 }),
    );
    expect(res.status).toBe(400);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 400 when builder body has permit_num (strict XOR)', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await POST(
      makeRequest({ ...validBuilderBody, permit_num: '24 101234' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid action', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await POST(
      makeRequest({ ...validPermitBody, action: 'click' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when permit body missing revision_num', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const { revision_num: _r, ...partial } = validPermitBody;
    const res = await POST(makeRequest(partial));
    expect(res.status).toBe(400);
  });

  it('returns 400 when body has unknown top-level key (.strict() rejection)', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await POST(
      makeRequest({ ...validPermitBody, unexpected_field: 'should be rejected' }),
    );
    expect(res.status).toBe(400);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 400 when entity_id exceeds INT max', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await POST(
      makeRequest({ ...validBuilderBody, entity_id: 2147483648 }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 (not 400) for unauthenticated request with malformed body (auth gate first)', async () => {
    mockedGetUserContext.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(null, { malformed: true }));
    expect(res.status).toBe(401);
  });

  it('does not call recordLeadView on 400', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    await POST(makeRequest({}));
    expect(mockedRecordLeadView).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 401 Unauthorized
// ---------------------------------------------------------------------------

describe('POST /api/leads/view — 401 Unauthorized', () => {
  it('returns 401 UNAUTHORIZED when getCurrentUserContext returns null', async () => {
    mockedGetUserContext.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(validPermitBody));
    expect(res.status).toBe(401);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('does not call recordLeadView on 401', async () => {
    mockedGetUserContext.mockResolvedValueOnce(null);
    await POST(makeRequest(validPermitBody));
    expect(mockedRecordLeadView).not.toHaveBeenCalled();
  });

  it('does not call withRateLimit on 401', async () => {
    mockedGetUserContext.mockResolvedValueOnce(null);
    await POST(makeRequest(validPermitBody));
    expect(mockedWithRateLimit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 403 Forbidden
// ---------------------------------------------------------------------------

describe('POST /api/leads/view — 403 Forbidden', () => {
  it('returns 403 when body trade_slug differs from profile trade', async () => {
    mockedGetUserContext.mockResolvedValueOnce({
      uid: 'u1',
      trade_slug: 'electrical',
      display_name: null,
    });
    const res = await POST(makeRequest(validPermitBody)); // trade_slug = plumbing
    expect(res.status).toBe(403);
    const body = (await readJson(res)) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('FORBIDDEN_TRADE_MISMATCH');
    expect(body.error.message).toContain('plumbing');
    expect(body.error.message).toContain('electrical');
  });

  it('does not call recordLeadView on 403', async () => {
    mockedGetUserContext.mockResolvedValueOnce({
      uid: 'u1',
      trade_slug: 'electrical',
      display_name: null,
    });
    await POST(makeRequest(validPermitBody));
    expect(mockedRecordLeadView).not.toHaveBeenCalled();
  });

  it('does not call withRateLimit on 403 (trade check first)', async () => {
    mockedGetUserContext.mockResolvedValueOnce({
      uid: 'u1',
      trade_slug: 'electrical',
      display_name: null,
    });
    await POST(makeRequest(validPermitBody));
    expect(mockedWithRateLimit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 429 Rate limited
// ---------------------------------------------------------------------------

describe('POST /api/leads/view — 429 Rate Limited', () => {
  it('returns 429 RATE_LIMITED when withRateLimit denies', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedWithRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const res = await POST(makeRequest(validPermitBody));
    expect(res.status).toBe(429);
    const body = (await readJson(res)) as { error: { code: string; details?: { remaining: number } } };
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.details).toEqual({ remaining: 0 });
  });

  it('429 response includes Retry-After header', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedWithRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const res = await POST(makeRequest(validPermitBody));
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('does not call recordLeadView on 429', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedWithRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    await POST(makeRequest(validPermitBody));
    expect(mockedRecordLeadView).not.toHaveBeenCalled();
  });

  it('rate limit key is leads-view:{uid} with limit=60 (per-endpoint bucket)', async () => {
    setHappyPathMocks();
    await POST(makeRequest(validPermitBody));
    const call = mockedWithRateLimit.mock.calls[0];
    expect(call?.[1].key).toBe('leads-view:firebase-uid-abc');
    expect(call?.[1].limit).toBe(60);
    expect(call?.[1].windowSec).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// 500 Internal error
// ---------------------------------------------------------------------------

describe('POST /api/leads/view — 500 Internal Error', () => {
  it('returns 500 INTERNAL_ERROR when recordLeadView returns ok:false', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedWithRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 59 });
    mockedRecordLeadView.mockResolvedValueOnce({ ok: false, competition_count: 0 });
    const res = await POST(makeRequest(validPermitBody));
    expect(res.status).toBe(500);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('returns 500 when recordLeadView throws (regression — never-throws contract)', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedWithRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 59 });
    mockedRecordLeadView.mockRejectedValueOnce(new Error('boom'));
    const res = await POST(makeRequest(validPermitBody));
    expect(res.status).toBe(500);
  });

  it('returns 500 when getCurrentUserContext throws', async () => {
    mockedGetUserContext.mockRejectedValueOnce(new Error('auth crashed'));
    const res = await POST(makeRequest(validPermitBody));
    expect(res.status).toBe(500);
  });

  it('returns 500 when withRateLimit throws', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedWithRateLimit.mockRejectedValueOnce(new Error('upstash down'));
    const res = await POST(makeRequest(validPermitBody));
    expect(res.status).toBe(500);
  });

  it('does not call logRequestComplete when recordLeadView returns ok:false', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedWithRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 59 });
    mockedRecordLeadView.mockResolvedValueOnce({ ok: false, competition_count: 0 });
    await POST(makeRequest(validPermitBody));
    expect(mockedLogRequestComplete).not.toHaveBeenCalled();
  });
});
