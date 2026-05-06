// 🔗 SPEC LINK: docs/specs/02-web-admin/30_app_health_dashboard.md §2.2 + §2.6
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §13
//
// Logic tests for the App Health Dashboard external-API client wrappers
// (sentry-client + posthog-client) and the Zod boundary schema. Each
// client is exercised at the fetch boundary via a mocked global fetch.
//
// Coverage focus per Spec 30 §2.6: per-tile error isolation, graceful
// degradation on rate-limit / 5xx / network failure, env-var gating.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

const ORIGINAL_ENV = { ...process.env };
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env = {
    ...ORIGINAL_ENV,
    SENTRY_API_TOKEN: 'test-sentry-token',
    SENTRY_ORG_SLUG: 'test-org',
    SENTRY_MOBILE_PROJECT_SLUG: 'test-mobile',
    POSTHOG_API_KEY: 'test-ph-key',
    POSTHOG_PROJECT_ID: 'test-ph-proj',
  };
  mockFetch = vi.fn();
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// ===========================================================================
// healthSchema — Zod boundary
// ===========================================================================

describe('healthSchema — TileResult discriminated union', () => {
  it('parses an ok TileResult', async () => {
    const { tileResultSchema, CrashRate24hPayloadSchema } = await import(
      '@/lib/admin/healthSchema'
    );
    const schema = tileResultSchema(CrashRate24hPayloadSchema);
    const parsed = schema.safeParse({
      status: 'ok',
      payload: {
        rate_per_user: 0.001,
        affected_users: 12,
        sentry_link: 'https://sentry.io/issues/',
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('parses an unavailable TileResult with a reason', async () => {
    const { tileResultSchema, CrashRate24hPayloadSchema } = await import(
      '@/lib/admin/healthSchema'
    );
    const schema = tileResultSchema(CrashRate24hPayloadSchema);
    const parsed = schema.safeParse({
      status: 'unavailable',
      reason: 'rate_limited',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a TileResult missing status discriminator', async () => {
    const { tileResultSchema, CrashRate24hPayloadSchema } = await import(
      '@/lib/admin/healthSchema'
    );
    const schema = tileResultSchema(CrashRate24hPayloadSchema);
    const parsed = schema.safeParse({ payload: {} });
    expect(parsed.success).toBe(false);
  });

  it('rejects an ok TileResult with an out-of-bounds rate_per_user', async () => {
    const { CrashRate24hPayloadSchema } = await import(
      '@/lib/admin/healthSchema'
    );
    // rate is 0..1; 1.5 must fail.
    const parsed = CrashRate24hPayloadSchema.safeParse({
      rate_per_user: 1.5,
      affected_users: 0,
      sentry_link: 'https://sentry.io/issues/',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a sentry_link that is not a URL', async () => {
    const { CrashRate24hPayloadSchema } = await import(
      '@/lib/admin/healthSchema'
    );
    const parsed = CrashRate24hPayloadSchema.safeParse({
      rate_per_user: 0,
      affected_users: 0,
      sentry_link: 'not-a-url',
    });
    expect(parsed.success).toBe(false);
  });
});

// ===========================================================================
// sentry-client — getCrashRate24h
// ===========================================================================

describe('sentry-client.getCrashRate24h', () => {
  it('returns ok with computed rate_per_user when both queries succeed', async () => {
    // Two parallel fetches: crash count + DAU. Mock both 200 responses.
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            groups: [{ by: {}, totals: { 'count()': 5 } }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            groups: [{ by: {}, totals: { 'count_unique(user)': 1000 } }],
          }),
      });
    const { getCrashRate24h } = await import('@/lib/admin/sentry-client');
    const result = await getCrashRate24h();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.payload.rate_per_user).toBeCloseTo(0.005, 4);
      expect(result.payload.affected_users).toBe(5);
      expect(result.payload.sentry_link).toMatch(/^https:\/\/sentry\.io/);
    }
  });

  it('returns rate_per_user = 0 when DAU is zero (no div/0)', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ groups: [{ by: {}, totals: { 'count()': 0 } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            groups: [{ by: {}, totals: { 'count_unique(user)': 0 } }],
          }),
      });
    const { getCrashRate24h } = await import('@/lib/admin/sentry-client');
    const result = await getCrashRate24h();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.payload.rate_per_user).toBe(0);
    }
  });

  it('returns unavailable env_missing when SENTRY_API_TOKEN unset', async () => {
    delete process.env.SENTRY_API_TOKEN;
    vi.resetModules();
    const { getCrashRate24h } = await import('@/lib/admin/sentry-client');
    const result = await getCrashRate24h();
    expect(result).toEqual({ status: 'unavailable', reason: 'env_missing' });
    // Sentry MUST NOT be called when env is unset (no fetch at all).
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns unavailable rate_limited on 429 from Sentry', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    const { getCrashRate24h } = await import('@/lib/admin/sentry-client');
    const result = await getCrashRate24h();
    expect(result).toEqual({ status: 'unavailable', reason: 'rate_limited' });
  });

  it('returns unavailable upstream_unavailable on 5xx from Sentry', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    const { getCrashRate24h } = await import('@/lib/admin/sentry-client');
    const result = await getCrashRate24h();
    expect(result).toEqual({ status: 'unavailable', reason: 'upstream_unavailable' });
  });

  it('returns unavailable network_error when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ETIMEDOUT'));
    const { getCrashRate24h } = await import('@/lib/admin/sentry-client');
    const result = await getCrashRate24h();
    expect(result).toEqual({ status: 'unavailable', reason: 'network_error' });
  });

  it('emits Sentry breadcrumb on each REST call (Spec 30 §2.6 self-observability)', async () => {
    const Sentry = await import('@sentry/nextjs');
    const breadcrumbSpy = vi.mocked(Sentry.addBreadcrumb);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ groups: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ groups: [] }),
      });
    const { getCrashRate24h } = await import('@/lib/admin/sentry-client');
    await getCrashRate24h();
    // Two parallel fetches → two breadcrumbs.
    expect(breadcrumbSpy).toHaveBeenCalledTimes(2);
    const firstCall = breadcrumbSpy.mock.calls[0]?.[0];
    expect(firstCall).toMatchObject({
      category: 'app_health',
      message: 'sentry_api_call',
    });
    expect(firstCall?.data).toHaveProperty('duration_ms');
    expect(firstCall?.data).toHaveProperty('status');
  });
});

// ===========================================================================
// posthog-client — funnel queries
// ===========================================================================

describe('posthog-client.getLeadSaveFunnel7d', () => {
  it('returns ok with computed ratio when query succeeds', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: [[100, 25]] }),
    });
    const { getLeadSaveFunnel7d } = await import('@/lib/admin/posthog-client');
    const result = await getLeadSaveFunnel7d();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.payload.viewed).toBe(100);
      expect(result.payload.saved).toBe(25);
      expect(result.payload.ratio).toBeCloseTo(0.25, 4);
    }
  });

  it('returns ratio = 0 when viewed is zero (no div/0)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: [[0, 0]] }),
    });
    const { getLeadSaveFunnel7d } = await import('@/lib/admin/posthog-client');
    const result = await getLeadSaveFunnel7d();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.payload.ratio).toBe(0);
    }
  });

  it('returns unavailable env_missing when POSTHOG_API_KEY unset', async () => {
    delete process.env.POSTHOG_API_KEY;
    vi.resetModules();
    const { getLeadSaveFunnel7d } = await import('@/lib/admin/posthog-client');
    const result = await getLeadSaveFunnel7d();
    expect(result).toEqual({ status: 'unavailable', reason: 'env_missing' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns unavailable env_missing when POSTHOG_PROJECT_ID unset', async () => {
    delete process.env.POSTHOG_PROJECT_ID;
    vi.resetModules();
    const { getLeadSaveFunnel7d } = await import('@/lib/admin/posthog-client');
    const result = await getLeadSaveFunnel7d();
    expect(result).toEqual({ status: 'unavailable', reason: 'env_missing' });
  });
});

describe('posthog-client.getAuthMethodFunnel7d', () => {
  it('synthesizes all 4 methods even when PostHog returns a subset', async () => {
    // PostHog returns rows only for methods with events; the wrapper
    // MUST fill in zero rows for methods absent from the response.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          results: [
            ['apple', 100, 90],
            ['email', 50, 48],
          ],
        }),
    });
    const { getAuthMethodFunnel7d } = await import('@/lib/admin/posthog-client');
    const result = await getAuthMethodFunnel7d();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      const methods = result.payload.per_method.map((m) => m.method);
      expect(methods).toEqual(['apple', 'google', 'email', 'phone']);
      const apple = result.payload.per_method.find((m) => m.method === 'apple');
      expect(apple).toMatchObject({ attempted: 100, succeeded: 90 });
      expect(apple?.ratio).toBeCloseTo(0.9, 4);
      const google = result.payload.per_method.find((m) => m.method === 'google');
      expect(google).toMatchObject({ attempted: 0, succeeded: 0, ratio: 0 });
    }
  });

  it('returns unavailable rate_limited on 429', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    const { getAuthMethodFunnel7d } = await import('@/lib/admin/posthog-client');
    const result = await getAuthMethodFunnel7d();
    expect(result).toEqual({ status: 'unavailable', reason: 'rate_limited' });
  });

  it('emits Sentry breadcrumb on each PostHog call (Spec 30 §2.6)', async () => {
    const Sentry = await import('@sentry/nextjs');
    const breadcrumbSpy = vi.mocked(Sentry.addBreadcrumb);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: [] }),
    });
    const { getAuthMethodFunnel7d } = await import('@/lib/admin/posthog-client');
    await getAuthMethodFunnel7d();
    expect(breadcrumbSpy).toHaveBeenCalledTimes(1);
    expect(breadcrumbSpy.mock.calls[0]?.[0]).toMatchObject({
      category: 'app_health',
      message: 'posthog_api_call',
    });
  });
});
