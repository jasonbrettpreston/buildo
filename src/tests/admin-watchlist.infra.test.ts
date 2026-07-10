// 🔗 SPEC LINK: docs/specs/02-web-admin/36_flight_center_tool.md §2 + §3 + §5
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8 + §13
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §8.2 + §8.3 + §8.4
//
// Infra tests for the Flight Center watchlist routes (mocked pool +
// verifyAdminAuth). Asserts:
//   §8.2 auth gates — 401 unauth; [PF1] 403 on admin_key MUTATIONS (reads
//     stay 200); dev_bypass writes permitted; 200 on session.
//   §8.3 Zod boundary — bad offset/short q → 400; junk lead_type items land
//     in failed[] WITHOUT rejecting the batch ([PF5]); empty ids → 400.
//   §8.4 telemetry — breadcrumb + track fire BEFORE the INSERT/DELETE.
//   Source-shape locks — verifyAdminAuth FIRST (before params/pool),
//     withApiEnvelope on every export, no template-literal value
//     interpolation in the SQL (parameterized only).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/verify-admin', () => ({
  verifyAdminAuth: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock('@/lib/admin/analytics', () => ({
  track: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

import * as Sentry from '@sentry/nextjs';
import { verifyAdminAuth, type AdminContext } from '@/lib/auth/verify-admin';
import { pool } from '@/lib/db/client';
import { track } from '@/lib/admin/analytics';
import { GET, POST, DELETE } from '@/app/api/admin/leads/watchlist/route';
import { GET as SEARCH_GET } from '@/app/api/admin/leads/watchlist/search/route';

const mockedVerify = vi.mocked(verifyAdminAuth);
const mockedQuery = vi.mocked(pool.query);

const SESSION_CTX: AdminContext = { uid: 'admin-uid-1', authMethod: 'session' };
const ADMIN_KEY_CTX: AdminContext = { uid: 'admin-key', authMethod: 'admin_key' };
const DEV_CTX: AdminContext = { uid: 'dev-user', authMethod: 'dev_bypass' };

function makeRequest(opts: {
  method?: string;
  search?: string;
  body?: unknown;
  pathname?: string;
} = {}): NextRequest {
  const method = opts.method ?? 'GET';
  const pathname = opts.pathname ?? '/api/admin/leads/watchlist';
  return {
    method,
    nextUrl: {
      pathname,
      searchParams: new URLSearchParams(opts.search ?? ''),
    },
    headers: { get: () => null },
    json: async () => {
      if (opts.body === undefined) throw new Error('no body');
      return opts.body;
    },
  } as unknown as NextRequest;
}

const WATCHLIST_ROW = {
  id: 1,
  lead_type: 'permit',
  lead_key: 'permit:20-1:00',
  permit_num: '20-1',
  revision_num: '00',
  coa_application_number: null,
  address: '1 Front St',
  lifecycle_phase: 'P12',
  lifecycle_stalled: false,
  predicted_start: '2026-06-20',
  p25_days: 5,
  p75_days: 16,
  opportunity_score: 45,
  saved_at: '2026-07-01T12:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// §8.2 auth gates
// ===========================================================================

describe('watchlist routes — auth gates (§8.2 + [PF1])', () => {
  it('GET → 401 when verifyAdminAuth returns null', async () => {
    mockedVerify.mockResolvedValueOnce(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('POST → 401 when unauth; DELETE → 401 when unauth', async () => {
    mockedVerify.mockResolvedValueOnce(null);
    expect((await POST(makeRequest({ method: 'POST', body: { items: [] } }))).status).toBe(401);
    mockedVerify.mockResolvedValueOnce(null);
    expect((await DELETE(makeRequest({ method: 'DELETE', body: { ids: [1] } }))).status).toBe(401);
  });

  it('[PF1] POST/DELETE → 403 on admin_key auth (CI keys have no personal watchlist)', async () => {
    mockedVerify.mockResolvedValueOnce(ADMIN_KEY_CTX);
    const postRes = await POST(
      makeRequest({ method: 'POST', body: { items: [{ lead_type: 'permit', permit_num: 'X', revision_num: '00' }] } }),
    );
    expect(postRes.status).toBe(403);

    mockedVerify.mockResolvedValueOnce(ADMIN_KEY_CTX);
    const delRes = await DELETE(makeRequest({ method: 'DELETE', body: { ids: [1] } }));
    expect(delRes.status).toBe(403);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('[PF1] GET stays 200 on admin_key auth (reads allowed on all three modes)', async () => {
    mockedVerify.mockResolvedValueOnce(ADMIN_KEY_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 } as never);
    const res = await GET(makeRequest({ search: 'offset=0' }));
    expect(res.status).toBe(200);
  });

  it('[PF1] dev_bypass writes are permitted (dev-local sentinel rows)', async () => {
    mockedVerify.mockResolvedValueOnce(DEV_CTX);
    mockedQuery.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 } as never);
    const res = await POST(
      makeRequest({ method: 'POST', body: { items: [{ lead_type: 'permit', permit_num: 'X', revision_num: '00' }] } }),
    );
    expect(res.status).toBe(200);
  });

  it('session GET → 200 with {data, meta} envelope', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery
      .mockResolvedValueOnce({ rows: [WATCHLIST_ROW], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1 } as never);
    const res = await GET(makeRequest({ search: 'offset=0' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ temporal_group: string }>;
      meta: { total: number; limit: number; offset: number };
    };
    expect(body.data).toHaveLength(1);
    // temporal_group computed server-side via the wrapper.
    expect(['action_required', 'departing_soon', 'on_the_horizon']).toContain(
      body.data[0]?.temporal_group,
    );
    expect(body.meta).toEqual({ total: 1, limit: 50, offset: 0 });
  });
});

// ===========================================================================
// §8.3 Zod boundary
// ===========================================================================

describe('watchlist routes — Zod boundary (§8.3)', () => {
  it('GET with junk offset → 400', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    const res = await GET(makeRequest({ search: 'offset=-5' }));
    expect(res.status).toBe(400);
  });

  it('POST with a non-array items → 400', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    const res = await POST(makeRequest({ method: 'POST', body: { items: 'nope' } }));
    expect(res.status).toBe(400);
  });

  it('POST with an empty items array → 400', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    const res = await POST(makeRequest({ method: 'POST', body: { items: [] } }));
    expect(res.status).toBe(400);
  });

  it('[PF5] one junk item lands in failed[] — the batch is NOT rejected', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 } as never);
    const res = await POST(
      makeRequest({
        method: 'POST',
        body: {
          items: [
            { lead_type: 'permit', permit_num: '20-1', revision_num: '00' },
            { lead_type: 'builder', entity_id: 5 }, // junk lead_type for the watchlist
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { added: number; skipped_existing: number; failed: Array<{ index: number }> };
    };
    expect(body.data.added).toBe(1);
    expect(body.data.failed).toHaveLength(1);
    expect(body.data.failed[0]?.index).toBe(1);
  });

  it('POST derives added vs skipped_existing from the RETURNING rowcount', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    // 2 valid items, but ON CONFLICT DO NOTHING only returned 1 id.
    mockedQuery.mockResolvedValueOnce({ rows: [{ id: 7 }], rowCount: 1 } as never);
    const res = await POST(
      makeRequest({
        method: 'POST',
        body: {
          items: [
            { lead_type: 'permit', permit_num: '20-1', revision_num: '00' },
            { lead_type: 'coa', coa_application_number: 'A1/25' },
          ],
        },
      }),
    );
    const body = (await res.json()) as { data: { added: number; skipped_existing: number } };
    expect(body.data.added).toBe(1);
    expect(body.data.skipped_existing).toBe(1);
  });

  it('DELETE with empty ids → 400; with junk ids → 400', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    expect((await DELETE(makeRequest({ method: 'DELETE', body: { ids: [] } }))).status).toBe(400);
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    expect((await DELETE(makeRequest({ method: 'DELETE', body: { ids: ['x'] } }))).status).toBe(400);
  });

  it('search: short q → 400; miss → 200 empty (a miss is a result, not an error)', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    expect((await SEARCH_GET(makeRequest({ search: 'q=a', pathname: '/api/admin/leads/watchlist/search' }))).status).toBe(400);

    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    const res = await SEARCH_GET(
      makeRequest({ search: 'q=nowhere', pathname: '/api/admin/leads/watchlist/search' }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
  });

  it('search builds the canonical lead_key via buildLeadKey (zero-padded rev)', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery.mockResolvedValueOnce({
      rows: [
        {
          lead_type: 'permit',
          permit_num: '20-1',
          revision_num: '0', // historical bare-zero drift
          coa_application_number: null,
          address: '1 Front St',
          lifecycle_phase: null,
        },
      ],
      rowCount: 1,
    } as never);
    const res = await SEARCH_GET(
      makeRequest({ search: 'q=front', pathname: '/api/admin/leads/watchlist/search' }),
    );
    const body = (await res.json()) as { data: Array<{ lead_key: string }> };
    expect(body.data[0]?.lead_key).toBe('permit:20-1:00');
  });
});

// ===========================================================================
// §8.4 telemetry ordering
// ===========================================================================

describe('watchlist mutations — telemetry BEFORE the write (§8.4)', () => {
  it('POST: breadcrumb + track fire before pool.query', async () => {
    const order: string[] = [];
    vi.mocked(Sentry.addBreadcrumb).mockImplementation(() => {
      order.push('breadcrumb');
      return undefined as never;
    });
    vi.mocked(track).mockImplementation(async () => {
      order.push('track');
    });
    mockedQuery.mockImplementation((async () => {
      order.push('query');
      return { rows: [{ id: 1 }], rowCount: 1 };
    }) as never);
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);

    await POST(
      makeRequest({
        method: 'POST',
        body: { items: [{ lead_type: 'permit', permit_num: '20-1', revision_num: '00' }] },
      }),
    );
    expect(order.indexOf('breadcrumb')).toBeLessThan(order.indexOf('query'));
    expect(order.indexOf('track')).toBeLessThan(order.indexOf('query'));
  });

  it('track receives a HASHED uid, never the raw admin uid (Spec 35 §7.3)', async () => {
    mockedVerify.mockResolvedValueOnce(SESSION_CTX);
    mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    await DELETE(makeRequest({ method: 'DELETE', body: { ids: [1] } }));
    const [distinctId, eventName] = vi.mocked(track).mock.calls[0] ?? [];
    expect(eventName).toBe('admin_action_performed');
    expect(distinctId).not.toBe(SESSION_CTX.uid);
    expect(distinctId).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ===========================================================================
// Source-shape locks
// ===========================================================================

describe('watchlist routes — source-shape locks', () => {
  const routeSrc = fs.readFileSync(
    path.resolve(__dirname, '..', 'app', 'api', 'admin', 'leads', 'watchlist', 'route.ts'),
    'utf8',
  );
  const searchSrc = fs.readFileSync(
    path.resolve(__dirname, '..', 'app', 'api', 'admin', 'leads', 'watchlist', 'search', 'route.ts'),
    'utf8',
  );

  it('verifyAdminAuth is called before any pool access in every handler', () => {
    for (const src of [routeSrc, searchSrc]) {
      const handlers = src.split(/export const (?:GET|POST|DELETE)/).slice(1);
      for (const handler of handlers) {
        const authIdx = handler.indexOf('verifyAdminAuth(request)');
        const poolIdx = handler.indexOf('pool.query');
        expect(authIdx).toBeGreaterThan(-1);
        if (poolIdx !== -1) expect(authIdx).toBeLessThan(poolIdx);
      }
    }
  });

  it('every exported handler is wrapped in withApiEnvelope', () => {
    expect(routeSrc.match(/export const (GET|POST|DELETE) = withApiEnvelope\(/g)).toHaveLength(3);
    expect(searchSrc.match(/export const GET = withApiEnvelope\(/g)).toHaveLength(1);
  });

  it('SQL template literals contain NO ${} value interpolation (parameterized only)', () => {
    for (const src of [routeSrc, searchSrc]) {
      for (const m of src.matchAll(/const \w+_SQL = `([\s\S]*?)`;/g)) {
        expect(m[1]).not.toContain('${');
      }
    }
  });

  it('[PF10] the list SQL carries NO lifecycle-vs-work-phase auto-archive filter', () => {
    // The consumer flight-board filters rows past the trade's work_phase;
    // the watchlist must NOT (no-auto-eviction contract, Spec 36 §4a).
    expect(routeSrc).not.toMatch(/work_phase|PHASE_INDEX|workPhaseIdx/);
  });
});
