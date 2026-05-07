// 🔗 SPEC LINK: docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.4
//             docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.1
//             docs/specs/03-mobile/91_mobile_lead_feed.md §3.2
//
// Infra tests for POST /api/leads/save. Covers the `{lead_id, lead_type,
// saved}` body contract, lead_id parsing for both permits + builders,
// auth gate, rate limit, content-type guard, and the action translation
// (saved:true → action:'save', saved:false → action:'unsave').

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db/client', () => ({
  pool: { query: vi.fn() },
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
import { recordLeadView } from '@/features/leads/lib/record-lead-view';
import { POST } from '@/app/api/leads/save/route';

const mockedGetUserContext = vi.mocked(getCurrentUserContext);
const mockedWithRateLimit = vi.mocked(withRateLimit);
const mockedRecordLeadView = vi.mocked(recordLeadView);

beforeEach(() => {
  vi.resetAllMocks();
});

function makeRequest(
  body: unknown,
  opts?: { malformed?: boolean; contentType?: string },
): NextRequest {
  const headers = new Map<string, string>([
    ['content-type', opts?.contentType ?? 'application/json'],
  ]);
  return {
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    },
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
  subscription_status: null,
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
// 200 OK — happy paths
// ---------------------------------------------------------------------------

describe('POST /api/leads/save — permit save flow', () => {
  it('parses canonical permit lead_id and dispatches action:save with trade_slug from ctx', async () => {
    setHappyPathMocks(7);
    const res = await POST(
      makeRequest({
        lead_id: '24-101234--01',
        lead_type: 'permit',
        saved: true,
      }),
    );
    expect(res.status).toBe(200);
    expect(mockedRecordLeadView).toHaveBeenCalledWith(
      {
        user_id: 'firebase-uid-abc',
        trade_slug: 'plumbing',
        action: 'save',
        lead_type: 'permit',
        permit_num: '24-101234',
        revision_num: '01',
      },
      expect.anything(),
    );
    const body = (await readJson(res)) as { data: { competition_count: number } };
    expect(body.data.competition_count).toBe(7);
  });

  it('saved:false maps to action:unsave', async () => {
    setHappyPathMocks(2);
    const res = await POST(
      makeRequest({
        lead_id: '24-101234--01',
        lead_type: 'permit',
        saved: false,
      }),
    );
    expect(res.status).toBe(200);
    expect(mockedRecordLeadView).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'unsave' }),
      expect.anything(),
    );
  });

  it('preserves multi-segment permit_num that contains single dashes', async () => {
    // Toronto permit numbers like `24-101234-BLD` carry single dashes;
    // the parser splits on the FIRST `--` only (mirroring parseLeadId).
    setHappyPathMocks();
    await POST(
      makeRequest({
        lead_id: '24-101234-BLD--01',
        lead_type: 'permit',
        saved: true,
      }),
    );
    expect(mockedRecordLeadView).toHaveBeenCalledWith(
      expect.objectContaining({
        permit_num: '24-101234-BLD',
        revision_num: '01',
      }),
      expect.anything(),
    );
  });
});

describe('POST /api/leads/save — builder save flow', () => {
  it('parses `builder-${entity_id}` and dispatches with entity_id', async () => {
    setHappyPathMocks(0);
    const res = await POST(
      makeRequest({
        lead_id: 'builder-9183',
        lead_type: 'builder',
        saved: true,
      }),
    );
    expect(res.status).toBe(200);
    expect(mockedRecordLeadView).toHaveBeenCalledWith(
      {
        user_id: 'firebase-uid-abc',
        trade_slug: 'plumbing',
        action: 'save',
        lead_type: 'builder',
        entity_id: 9183,
      },
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// 400 — body shape + lead_id parsing
// ---------------------------------------------------------------------------

describe('POST /api/leads/save — 400 INVALID_LEAD_ID', () => {
  beforeEach(() => {
    mockedGetUserContext.mockResolvedValue(sampleContext);
    mockedWithRateLimit.mockResolvedValue({ allowed: true, remaining: 59 });
  });

  it('rejects permit lead_id with no `--` separator', async () => {
    const res = await POST(
      makeRequest({
        lead_id: '24-101234-01',
        lead_type: 'permit',
        saved: true,
      }),
    );
    expect(res.status).toBe(400);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_LEAD_ID');
    expect(mockedRecordLeadView).not.toHaveBeenCalled();
  });

  it('rejects permit lead_id with empty permit_num (leading `--`)', async () => {
    const res = await POST(
      makeRequest({
        lead_id: '--01',
        lead_type: 'permit',
        saved: true,
      }),
    );
    expect(res.status).toBe(400);
    expect(mockedRecordLeadView).not.toHaveBeenCalled();
  });

  it('rejects permit lead_id with empty revision_num (trailing `--`)', async () => {
    const res = await POST(
      makeRequest({
        lead_id: '24-101234--',
        lead_type: 'permit',
        saved: true,
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects permit lead_id with multiple `--` separators (ambiguous parse)', async () => {
    // `parseLeadId` (canonical, used for URL-path params) splits on the
    // FIRST `--` and preserves later `--` inside revision_num — fine
    // when the UI controls input. But the open save endpoint enforces
    // uniqueness so a posted `permit--01--extra` is rejected loudly
    // rather than silently slicing into `permit--01` / `extra`.
    const res = await POST(
      makeRequest({
        lead_id: '24-101234--01--garbage',
        lead_type: 'permit',
        saved: true,
      }),
    );
    expect(res.status).toBe(400);
  });

  it('strips surrounding whitespace via `.trim()` on the Zod schema', async () => {
    setHappyPathMocks(0);
    const res = await POST(
      makeRequest({
        lead_id: '  24-101234--01  ',
        lead_type: 'permit',
        saved: true,
      }),
    );
    // Whitespace would otherwise pollute permit_num/revision_num and
    // cause silent DB-lookup failures. `.trim()` on the schema closes
    // the gap before the parser runs.
    expect(res.status).toBe(200);
    expect(mockedRecordLeadView).toHaveBeenCalledWith(
      expect.objectContaining({
        permit_num: '24-101234',
        revision_num: '01',
      }),
      expect.anything(),
    );
  });

  it('rejects builder lead_id without `builder-` prefix', async () => {
    const res = await POST(
      makeRequest({
        lead_id: '9183',
        lead_type: 'builder',
        saved: true,
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects builder lead_id with non-numeric entity_id', async () => {
    const res = await POST(
      makeRequest({
        lead_id: 'builder-abc',
        lead_type: 'builder',
        saved: true,
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects builder lead_id with zero or negative entity_id', async () => {
    const res = await POST(
      makeRequest({
        lead_id: 'builder-0',
        lead_type: 'builder',
        saved: true,
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/leads/save — 400 VALIDATION_FAILED', () => {
  beforeEach(() => {
    mockedGetUserContext.mockResolvedValue(sampleContext);
    mockedWithRateLimit.mockResolvedValue({ allowed: true, remaining: 59 });
  });

  it('rejects body missing required fields', async () => {
    const res = await POST(makeRequest({ lead_id: '24-101234--01' }));
    expect(res.status).toBe(400);
  });

  it('rejects body with unknown field (.strict() guard)', async () => {
    const res = await POST(
      makeRequest({
        lead_id: '24-101234--01',
        lead_type: 'permit',
        saved: true,
        // Non-canonical extra field — strict() must reject so a future
        // mobile bug that adds a typo'd field surfaces as 400 VALIDATION_FAILED.
        savd: false,
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON body with INVALID_JSON code', async () => {
    mockedGetUserContext.mockResolvedValue(sampleContext);
    const res = await POST(makeRequest({}, { malformed: true }));
    expect(res.status).toBe(400);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_JSON');
  });
});

// ---------------------------------------------------------------------------
// Auth + rate limit + content-type
// ---------------------------------------------------------------------------

describe('POST /api/leads/save — auth + rate limit + content-type', () => {
  it('returns 401 when getCurrentUserContext returns null', async () => {
    mockedGetUserContext.mockResolvedValueOnce(null);
    const res = await POST(
      makeRequest({
        lead_id: '24-101234--01',
        lead_type: 'permit',
        saved: true,
      }),
    );
    expect(res.status).toBe(401);
    expect(mockedRecordLeadView).not.toHaveBeenCalled();
  });

  it('returns 415 INVALID_CONTENT_TYPE when content-type is not JSON', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    const res = await POST(
      makeRequest(
        {
          lead_id: '24-101234--01',
          lead_type: 'permit',
          saved: true,
        },
        { contentType: 'text/plain' },
      ),
    );
    expect(res.status).toBe(415);
    expect(mockedRecordLeadView).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limit exceeded', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedWithRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const res = await POST(
      makeRequest({
        lead_id: '24-101234--01',
        lead_type: 'permit',
        saved: true,
      }),
    );
    expect(res.status).toBe(429);
    expect(mockedRecordLeadView).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 500 — internal error path
// ---------------------------------------------------------------------------

describe('POST /api/leads/save — internal error', () => {
  it('returns 500 when recordLeadView returns ok:false', async () => {
    mockedGetUserContext.mockResolvedValueOnce(sampleContext);
    mockedWithRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 59 });
    mockedRecordLeadView.mockResolvedValueOnce({ ok: false, competition_count: 0 });
    const res = await POST(
      makeRequest({
        lead_id: '24-101234--01',
        lead_type: 'permit',
        saved: true,
      }),
    );
    expect(res.status).toBe(500);
  });
});
