// 🔗 SPEC LINK: docs/specs/02-web-admin/30_app_health_dashboard.md §2.2 + §2.6
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §8.2 + §8.3
//
// Infra tests for /api/admin/app-health route handler. Mocks the auth
// helper + per-client wrappers; asserts the aggregator's orchestration
// contract: 401 on missing auth (Spec 35 §8.2), Zod boundary on response
// (Spec 35 §8.3), per-tile error isolation (Spec 30 §2.6), 60s cache.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/verify-admin', () => ({
  verifyAdminAuth: vi.fn(),
}));

vi.mock('@/lib/admin/sentry-client', () => ({
  getCrashRate24h: vi.fn(),
  getBreadcrumbCount24h: vi.fn(),
}));

vi.mock('@/lib/admin/posthog-client', () => ({
  getLeadSaveFunnel7d: vi.fn(),
  getPaywallConversion7d: vi.fn(),
  getAuthMethodFunnel7d: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import {
  getCrashRate24h,
  getBreadcrumbCount24h,
} from '@/lib/admin/sentry-client';
import {
  getLeadSaveFunnel7d,
  getPaywallConversion7d,
  getAuthMethodFunnel7d,
} from '@/lib/admin/posthog-client';

const mockedVerify = vi.mocked(verifyAdminAuth);
const mockedGetCrashRate = vi.mocked(getCrashRate24h);
const mockedGetBreadcrumbCount = vi.mocked(getBreadcrumbCount24h);
const mockedGetLeadSave = vi.mocked(getLeadSaveFunnel7d);
const mockedGetPaywall = vi.mocked(getPaywallConversion7d);
const mockedGetAuth = vi.mocked(getAuthMethodFunnel7d);

function makeRequest(): NextRequest {
  return {
    nextUrl: { pathname: '/api/admin/app-health' },
    method: 'GET',
    headers: { get: () => null },
  } as unknown as NextRequest;
}

async function readJson(res: Response): Promise<unknown> {
  return res.json();
}

const OK_CRASH = {
  status: 'ok' as const,
  payload: {
    rate_per_user: 0.001,
    affected_users: 5,
    sentry_link: 'https://sentry.io/issues/',
  },
};

const OK_BREADCRUMB = {
  status: 'ok' as const,
  payload: {
    breadcrumb_count: 42,
    sentry_link: 'https://sentry.io/issues/',
  },
};

const OK_AUTH = {
  status: 'ok' as const,
  payload: {
    per_method: [
      { method: 'apple' as const, attempted: 100, succeeded: 90, ratio: 0.9 },
      { method: 'google' as const, attempted: 50, succeeded: 45, ratio: 0.9 },
      { method: 'email' as const, attempted: 25, succeeded: 24, ratio: 0.96 },
      { method: 'phone' as const, attempted: 10, succeeded: 9, ratio: 0.9 },
    ],
    posthog_link: 'https://us.posthog.com/projects/',
  },
};

const OK_LEAD_SAVE = {
  status: 'ok' as const,
  payload: {
    viewed: 100,
    saved: 25,
    ratio: 0.25,
    posthog_link: 'https://us.posthog.com/projects/',
  },
};

const OK_PAYWALL = {
  status: 'ok' as const,
  payload: {
    shown: 50,
    clicked: 7,
    ratio: 0.14,
    posthog_link: 'https://us.posthog.com/projects/',
  },
};

beforeEach(async () => {
  vi.clearAllMocks();
  // Reset the aggregator's process-local cache between tests so each
  // test starts from a cold state.
  const { __resetAppHealthCacheForTests } = await import(
    '@/app/api/admin/app-health/route'
  );
  __resetAppHealthCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// Auth gate (Spec 35 §8.2)
// ===========================================================================

describe('GET /api/admin/app-health — auth gate', () => {
  it('returns 401 when verifyAdminAuth returns null', async () => {
    mockedVerify.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/admin/app-health/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
    // Spec 33 §5: no external API call when auth fails.
    expect(mockedGetCrashRate).not.toHaveBeenCalled();
    expect(mockedGetLeadSave).not.toHaveBeenCalled();
  });

  it('returns 200 when verifyAdminAuth returns admin context', async () => {
    mockedVerify.mockResolvedValueOnce({
      uid: 'admin-1',
      authMethod: 'session',
    });
    mockedGetCrashRate.mockResolvedValueOnce(OK_CRASH);
    mockedGetBreadcrumbCount.mockResolvedValueOnce(OK_BREADCRUMB);
    mockedGetAuth.mockResolvedValueOnce(OK_AUTH);
    mockedGetLeadSave.mockResolvedValueOnce(OK_LEAD_SAVE);
    mockedGetPaywall.mockResolvedValueOnce(OK_PAYWALL);
    const { GET } = await import('@/app/api/admin/app-health/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// Per-tile error isolation (Spec 30 §2.6)
// ===========================================================================

describe('GET /api/admin/app-health — per-tile error isolation', () => {
  it('one tile unavailable does NOT poison others (partial-failure isolation)', async () => {
    mockedVerify.mockResolvedValue({
      uid: 'admin-1',
      authMethod: 'session',
    });
    // Sentry rate-limited; PostHog tiles all OK.
    mockedGetCrashRate.mockResolvedValueOnce({
      status: 'unavailable',
      reason: 'rate_limited',
    });
    mockedGetBreadcrumbCount.mockResolvedValueOnce(OK_BREADCRUMB);
    mockedGetAuth.mockResolvedValueOnce(OK_AUTH);
    mockedGetLeadSave.mockResolvedValueOnce(OK_LEAD_SAVE);
    mockedGetPaywall.mockResolvedValueOnce(OK_PAYWALL);

    const { GET } = await import('@/app/api/admin/app-health/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      data: {
        tiles: {
          crash_rate_24h: { status: string; reason?: string };
          lead_save_funnel_7d: { status: string };
        };
      };
    };
    expect(body.data.tiles.crash_rate_24h.status).toBe('unavailable');
    expect(body.data.tiles.crash_rate_24h.reason).toBe('rate_limited');
    expect(body.data.tiles.lead_save_funnel_7d.status).toBe('ok');
  });

  it('all tiles unavailable still returns 200 with envelope (graceful degradation)', async () => {
    mockedVerify.mockResolvedValue({
      uid: 'admin-1',
      authMethod: 'session',
    });
    const allUnavail = { status: 'unavailable' as const, reason: 'env_missing' };
    mockedGetCrashRate.mockResolvedValueOnce(allUnavail);
    mockedGetBreadcrumbCount.mockResolvedValueOnce(allUnavail);
    mockedGetAuth.mockResolvedValueOnce(allUnavail);
    mockedGetLeadSave.mockResolvedValueOnce(allUnavail);
    mockedGetPaywall.mockResolvedValueOnce(allUnavail);

    const { GET } = await import('@/app/api/admin/app-health/route');
    const res = await GET(makeRequest());
    // Spec 30 §2.6: page renders muted state per tile, NOT a full-page error.
    // Aggregator MUST return 200 even when every tile is unavailable.
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { data: { tiles: Record<string, { status: string }> } };
    Object.values(body.data.tiles).forEach((tile) => {
      expect(tile.status).toBe('unavailable');
    });
  });

  it('client method throwing unexpectedly maps to status:unavailable, reason:aggregator_threw', async () => {
    mockedVerify.mockResolvedValue({
      uid: 'admin-1',
      authMethod: 'session',
    });
    // getCrashRate24h THROWS instead of returning a TileResult.
    // The settle() wrapper in the route converts this into the
    // canonical unavailable shape.
    mockedGetCrashRate.mockRejectedValueOnce(new Error('unexpected throw'));
    mockedGetBreadcrumbCount.mockResolvedValueOnce(OK_BREADCRUMB);
    mockedGetAuth.mockResolvedValueOnce(OK_AUTH);
    mockedGetLeadSave.mockResolvedValueOnce(OK_LEAD_SAVE);
    mockedGetPaywall.mockResolvedValueOnce(OK_PAYWALL);

    const { GET } = await import('@/app/api/admin/app-health/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      data: { tiles: { crash_rate_24h: { status: string; reason?: string } } };
    };
    expect(body.data.tiles.crash_rate_24h.status).toBe('unavailable');
    expect(body.data.tiles.crash_rate_24h.reason).toBe('aggregator_threw');
  });
});

// ===========================================================================
// Zod response boundary (Spec 35 §8.3)
// ===========================================================================

describe('GET /api/admin/app-health — Zod response boundary', () => {
  it('returns 200 with envelope when all tiles match schema', async () => {
    mockedVerify.mockResolvedValue({
      uid: 'admin-1',
      authMethod: 'session',
    });
    mockedGetCrashRate.mockResolvedValueOnce(OK_CRASH);
    mockedGetBreadcrumbCount.mockResolvedValueOnce(OK_BREADCRUMB);
    mockedGetAuth.mockResolvedValueOnce(OK_AUTH);
    mockedGetLeadSave.mockResolvedValueOnce(OK_LEAD_SAVE);
    mockedGetPaywall.mockResolvedValueOnce(OK_PAYWALL);

    const { GET } = await import('@/app/api/admin/app-health/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { data: { snapshot_at: string } };
    expect(body.data.snapshot_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns 500 when a tile payload violates the Zod schema (defensive guard)', async () => {
    mockedVerify.mockResolvedValue({
      uid: 'admin-1',
      authMethod: 'session',
    });
    // Inject a malformed payload — rate_per_user > 1 violates the
    // bounded validator. Aggregator's Zod parse must catch this and
    // 500 with INTERNAL_ERROR.
    // Cast to any — the malformed payload (rate_per_user > 1) is the
    // entire point of this test; bypass TS so the runtime Zod check is
    // exercised against an out-of-bounds shape.
    mockedGetCrashRate.mockResolvedValueOnce({
      status: 'ok',
      payload: { rate_per_user: 1.5, affected_users: 0, sentry_link: 'https://sentry.io/' },
    } as never);
    mockedGetBreadcrumbCount.mockResolvedValueOnce(OK_BREADCRUMB);
    mockedGetAuth.mockResolvedValueOnce(OK_AUTH);
    mockedGetLeadSave.mockResolvedValueOnce(OK_LEAD_SAVE);
    mockedGetPaywall.mockResolvedValueOnce(OK_PAYWALL);

    const { GET } = await import('@/app/api/admin/app-health/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const body = (await readJson(res)) as { error: { code: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});

// ===========================================================================
// Cache (Spec 30 §2.2)
// ===========================================================================

describe('GET /api/admin/app-health — 60s in-memory cache', () => {
  it('second call within TTL serves from cache (no second SaaS fan-out)', async () => {
    mockedVerify.mockResolvedValue({
      uid: 'admin-1',
      authMethod: 'session',
    });
    mockedGetCrashRate.mockResolvedValueOnce(OK_CRASH);
    mockedGetBreadcrumbCount.mockResolvedValueOnce(OK_BREADCRUMB);
    mockedGetAuth.mockResolvedValueOnce(OK_AUTH);
    mockedGetLeadSave.mockResolvedValueOnce(OK_LEAD_SAVE);
    mockedGetPaywall.mockResolvedValueOnce(OK_PAYWALL);

    const { GET } = await import('@/app/api/admin/app-health/route');
    const first = await GET(makeRequest());
    expect(first.status).toBe(200);
    expect(mockedGetCrashRate).toHaveBeenCalledTimes(1);

    // Second call: WITHIN TTL → cache hit. No new client calls.
    const second = await GET(makeRequest());
    expect(second.status).toBe(200);
    expect(mockedGetCrashRate).toHaveBeenCalledTimes(1); // STILL 1
    expect(mockedGetLeadSave).toHaveBeenCalledTimes(1);
  });

  it('call after TTL expires triggers fresh SaaS fan-out', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-06T12:00:00Z'));

    mockedVerify.mockResolvedValue({
      uid: 'admin-1',
      authMethod: 'session',
    });
    // Two rounds of OK responses — one for the first call, one for after TTL.
    mockedGetCrashRate.mockResolvedValue(OK_CRASH);
    mockedGetBreadcrumbCount.mockResolvedValue(OK_BREADCRUMB);
    mockedGetAuth.mockResolvedValue(OK_AUTH);
    mockedGetLeadSave.mockResolvedValue(OK_LEAD_SAVE);
    mockedGetPaywall.mockResolvedValue(OK_PAYWALL);

    const { GET } = await import('@/app/api/admin/app-health/route');
    await GET(makeRequest());
    expect(mockedGetCrashRate).toHaveBeenCalledTimes(1);

    // Advance past 60s TTL.
    vi.advanceTimersByTime(61_000);

    await GET(makeRequest());
    expect(mockedGetCrashRate).toHaveBeenCalledTimes(2);
  });

  it('concurrent cache misses share ONE fan-out (dog-pile defense)', async () => {
    // Spec 30 §2.2 cache exists specifically because Sentry/PostHog have
    // rate limits. Two simultaneous requests landing on a cold cache MUST
    // collapse onto the same in-flight Promise — otherwise the cache fails
    // its primary purpose under concurrent load.
    mockedVerify.mockResolvedValue({
      uid: 'admin-1',
      authMethod: 'session',
    });
    // The first crash query is held open by an external deferred. The
    // second incoming request must arrive WHILE the first fan-out is
    // still pending, so the cache stores a Promise (not a resolved body)
    // and the second request awaits the same Promise.
    let resolveCrash: ((v: typeof OK_CRASH) => void) | undefined;
    const crashDeferred = new Promise<typeof OK_CRASH>((r) => {
      resolveCrash = r;
    });
    mockedGetCrashRate.mockReturnValueOnce(crashDeferred);
    mockedGetBreadcrumbCount.mockResolvedValue(OK_BREADCRUMB);
    mockedGetAuth.mockResolvedValue(OK_AUTH);
    mockedGetLeadSave.mockResolvedValue(OK_LEAD_SAVE);
    mockedGetPaywall.mockResolvedValue(OK_PAYWALL);

    const { GET } = await import('@/app/api/admin/app-health/route');
    // Fire both requests; the first lands cold, stores the pending
    // promise, awaits the fan-out. The second lands while the cache
    // entry is a pending Promise — must collapse onto the same fan-out.
    const p1 = GET(makeRequest());
    // Yield enough microtask ticks for p1 to: (a) await verifyAdminAuth
    // (mocked, microtask), (b) populate the cache slot with the pending
    // bodyPromise, (c) launch the parallel fan-out (mockedGetCrashRate
    // returns the held deferred). Three awaits is enough on Node 20.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const p2 = GET(makeRequest());

    resolveCrash!(OK_CRASH);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    // Sentry/PostHog upstream MUST see exactly ONE call each, not two.
    expect(mockedGetCrashRate).toHaveBeenCalledTimes(1);
    expect(mockedGetLeadSave).toHaveBeenCalledTimes(1);
    expect(mockedGetPaywall).toHaveBeenCalledTimes(1);
    expect(mockedGetAuth).toHaveBeenCalledTimes(1);
    expect(mockedGetBreadcrumbCount).toHaveBeenCalledTimes(1);
  });

  it('cache TTL aligns to the next minute boundary, not a floating 60s window', async () => {
    // Spec 30 §2.2: "60s in-memory TTL keyed on snapshot_at minute boundary".
    // A request landing at HH:MM:42 builds a snapshot that expires at
    // HH:MM+1:00, NOT at HH:MM+1:42. Aligning to the wall-clock minute
    // means concurrent instances invalidate together and pay one upstream
    // round-trip per minute — a floating window staggers expirations
    // across instances and doubles rate-limit footprint.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-06T12:00:42Z'));

    mockedVerify.mockResolvedValue({
      uid: 'admin-1',
      authMethod: 'session',
    });
    mockedGetCrashRate.mockResolvedValue(OK_CRASH);
    mockedGetBreadcrumbCount.mockResolvedValue(OK_BREADCRUMB);
    mockedGetAuth.mockResolvedValue(OK_AUTH);
    mockedGetLeadSave.mockResolvedValue(OK_LEAD_SAVE);
    mockedGetPaywall.mockResolvedValue(OK_PAYWALL);

    const { GET } = await import('@/app/api/admin/app-health/route');
    await GET(makeRequest());
    expect(mockedGetCrashRate).toHaveBeenCalledTimes(1);

    // 17 seconds later (12:00:59) — STILL within the same minute, so
    // cache hit. A floating 60s window would still be hot here too, so
    // this case alone doesn't distinguish the two. The next case does.
    vi.advanceTimersByTime(17_000);
    await GET(makeRequest());
    expect(mockedGetCrashRate).toHaveBeenCalledTimes(1);

    // Advance to 12:01:00 — the next minute boundary. Minute-boundary
    // TTL fires here (18 seconds after the original request, NOT 60).
    // A floating-window TTL would still be hot until 12:01:42.
    vi.advanceTimersByTime(1_000);
    await GET(makeRequest());
    expect(mockedGetCrashRate).toHaveBeenCalledTimes(2);
  });
});
