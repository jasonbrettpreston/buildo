// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockLimit = vi.fn();
const mockRatelimitCtor = vi.fn().mockImplementation(() => ({ limit: mockLimit }));
const slidingWindow = vi.fn().mockReturnValue({ kind: 'sliding' });

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(mockRatelimitCtor, { slidingWindow }),
}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

const fakeRequest = {} as unknown as NextRequest;

describe('withRateLimit — in-memory fallback', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const mod = await import('@/lib/auth/rate-limit');
    mod.__resetRateLimitState();
  });

  it('uses memory fallback when env vars missing — first call allowed', async () => {
    const { withRateLimit } = await import('@/lib/auth/rate-limit');
    const res = await withRateLimit(fakeRequest, { key: 'k1', limit: 3, windowSec: 60 });
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(2);
  });

  it('memory: denies once over limit', async () => {
    const { withRateLimit } = await import('@/lib/auth/rate-limit');
    const opts = { key: 'k2', limit: 2, windowSec: 60 };
    const r1 = await withRateLimit(fakeRequest, opts);
    const r2 = await withRateLimit(fakeRequest, opts);
    const r3 = await withRateLimit(fakeRequest, opts);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);
  });

  it('memory: remaining decrements correctly', async () => {
    const { withRateLimit } = await import('@/lib/auth/rate-limit');
    const opts = { key: 'k3', limit: 5, windowSec: 60 };
    const r1 = await withRateLimit(fakeRequest, opts);
    const r2 = await withRateLimit(fakeRequest, opts);
    expect(r1.remaining).toBe(4);
    expect(r2.remaining).toBe(3);
  });

  it('logs error and falls back to memory when Upstash missing in production', async () => {
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    const logger = await import('@/lib/logger');
    const { withRateLimit, __resetRateLimitState } = await import('@/lib/auth/rate-limit');
    __resetRateLimitState();
    const res = await withRateLimit(fakeRequest, { key: 'prodk', limit: 3, windowSec: 60 });
    expect(res.allowed).toBe(true); // memory fallback still allows first request
    expect(logger.logError).toHaveBeenCalled();
    (process.env as Record<string, string>).NODE_ENV = prev ?? 'test';
  });
});

describe('withRateLimit — Upstash backend', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
  });

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('returns allowed=true on success', async () => {
    mockLimit.mockResolvedValueOnce({ success: true, remaining: 9 });
    const { withRateLimit, __resetRateLimitState } = await import('@/lib/auth/rate-limit');
    __resetRateLimitState();
    const res = await withRateLimit(fakeRequest, { key: 'u1', limit: 10, windowSec: 60 });
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(9);
  });

  it('returns allowed=false when limiter denies', async () => {
    mockLimit.mockResolvedValueOnce({ success: false, remaining: 0 });
    const { withRateLimit, __resetRateLimitState } = await import('@/lib/auth/rate-limit');
    __resetRateLimitState();
    const res = await withRateLimit(fakeRequest, { key: 'u2', limit: 10, windowSec: 60 });
    expect(res.allowed).toBe(false);
  });

  it('fail-closed in production when limiter throws', async () => {
    mockLimit.mockRejectedValueOnce(new Error('redis down'));
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    const { withRateLimit, __resetRateLimitState } = await import('@/lib/auth/rate-limit');
    __resetRateLimitState();
    const res = await withRateLimit(fakeRequest, { key: 'u3', limit: 10, windowSec: 60 });
    expect(res.allowed).toBe(false);
    (process.env as Record<string, string>).NODE_ENV = prev ?? 'test';
  });

  it('builds a separate Upstash limiter per (limit, windowSec)', async () => {
    mockLimit.mockResolvedValue({ success: true, remaining: 1 });
    const { withRateLimit, __resetRateLimitState } = await import('@/lib/auth/rate-limit');
    __resetRateLimitState();
    mockRatelimitCtor.mockClear();
    await withRateLimit(fakeRequest, { key: 'a', limit: 10, windowSec: 60 });
    await withRateLimit(fakeRequest, { key: 'a', limit: 10, windowSec: 60 }); // cache hit
    await withRateLimit(fakeRequest, { key: 'a', limit: 5, windowSec: 60 }); // different limit → new limiter
    await withRateLimit(fakeRequest, { key: 'a', limit: 10, windowSec: 120 }); // different window → new limiter
    expect(mockRatelimitCtor).toHaveBeenCalledTimes(3);
  });

  it('fail-open in development when limiter throws', async () => {
    mockLimit.mockRejectedValueOnce(new Error('redis down'));
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'development';
    const { withRateLimit, __resetRateLimitState } = await import('@/lib/auth/rate-limit');
    __resetRateLimitState();
    const res = await withRateLimit(fakeRequest, { key: 'u4', limit: 10, windowSec: 60 });
    expect(res.allowed).toBe(true);
    (process.env as Record<string, string>).NODE_ENV = prev ?? 'test';
  });
});
