// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §11 + docs/specs/00_engineering_standards.md §4
//
// Rate limiting wrapper. Uses Upstash Redis when env vars are set,
// falls back to an in-memory counter for dev. Fail-closed in production
// on Redis errors, fail-open in development.

import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { logError, logInfo } from '@/lib/logger';

interface RateLimitOptions {
  key: string; // identifier (uid or ip)
  limit: number; // max requests
  windowSec: number; // window length in seconds
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

interface UpstashLimiter {
  limit: (key: string) => Promise<{ success: boolean; remaining: number }>;
}

interface MemBucket {
  count: number;
  expiresAt: number; // epoch ms
}

// Short, irreversible hash for logs — never log raw keys (uid/ip are PII).
function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 12);
}

// In-memory fallback. Map from "key:windowStart" -> { count, expiresAt }.
//
// DEV-ONLY in-memory fallback. Has a small race window under concurrent reads
// of the same bucket (read-modify-write is not atomic); this is acceptable
// because production uses Upstash. Do not use this in serverless/multi-instance
// environments — counts are per-process and easily bypassed by load balancing.
const memCounts = new Map<string, MemBucket>();

function memoryRateLimit(opts: RateLimitOptions): RateLimitResult {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSec / opts.windowSec) * opts.windowSec;
  const bucket = `${opts.key}:${windowStart}`;
  const existing = memCounts.get(bucket);
  const count = (existing?.count ?? 0) + 1;
  const expiresAt = (windowStart + opts.windowSec) * 1000;
  memCounts.set(bucket, { count, expiresAt });
  // GC expired buckets occasionally (dev-only).
  if (memCounts.size > 10_000) {
    const nowMs = Date.now();
    for (const [k, entry] of memCounts) {
      if (nowMs > entry.expiresAt) memCounts.delete(k);
    }
  }
  return { allowed: count <= opts.limit, remaining: Math.max(0, opts.limit - count) };
}

// Per-(limit, windowSec) cache of Upstash limiters. A single global client
// cached on the first caller's options would misreport limits for every other
// endpoint, since the sliding-window config is baked into the limiter.
const upstashCache = new Map<string, UpstashLimiter>();
let upstashConfigured: boolean | null = null;

async function getUpstashClient(opts: RateLimitOptions): Promise<UpstashLimiter | null> {
  if (upstashConfigured === false) return null;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    upstashConfigured = false;
    return null;
  }
  upstashConfigured = true;
  const cacheKey = `${opts.limit}:${opts.windowSec}`;
  const cached = upstashCache.get(cacheKey);
  if (cached) return cached;
  try {
    const ratelimitMod = await import('@upstash/ratelimit');
    const redisMod = await import('@upstash/redis');
    const Ratelimit = ratelimitMod.Ratelimit;
    const Redis = redisMod.Redis;
    const redis = new Redis({ url, token });
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(opts.limit, `${opts.windowSec} s` as `${number} s`),
    }) as unknown as UpstashLimiter;
    upstashCache.set(cacheKey, limiter);
    return limiter;
  } catch (err) {
    logError('[auth/ratelimit]', err, { stage: 'init', key_hash: hashKey(opts.key) });
    return null;
  }
}

export async function withRateLimit(
  _request: NextRequest,
  opts: RateLimitOptions
): Promise<RateLimitResult> {
  const client = await getUpstashClient(opts);
  if (!client) {
    // No Upstash configured. In production this is a misconfig: fall back to
    // in-memory (so we don't fail-closed on dev/test accidentally) but log
    // loudly so ops sees it.
    if (process.env.NODE_ENV === 'production') {
      logError(
        '[auth/ratelimit]',
        new Error(
          'Upstash not configured in production — falling back to in-memory rate limiter (per-instance, easily bypassed)',
        ),
        { stage: 'fallback', key_hash: hashKey(opts.key) },
      );
    }
    return memoryRateLimit(opts);
  }
  try {
    const res = await client.limit(opts.key);
    logInfo('[auth/ratelimit]', res.success ? 'allowed' : 'denied', {
      key_hash: hashKey(opts.key),
      remaining: res.remaining,
    });
    return { allowed: res.success, remaining: res.remaining };
  } catch (err) {
    logError('[auth/ratelimit]', err, { stage: 'limit', key_hash: hashKey(opts.key) });
    // Fail-closed in prod, fail-open in dev
    if (process.env.NODE_ENV === 'production') {
      return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: 0 };
  }
}

// Test-only: reset module state between tests
export function __resetRateLimitState(): void {
  memCounts.clear();
  upstashCache.clear();
  upstashConfigured = null;
}
