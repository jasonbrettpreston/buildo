// 🔗 SPEC LINK: docs/specs/02-web-admin/30_app_health_dashboard.md §2.2
//
// Process-local cache for the App Health aggregator. EXTRACTED from the
// route file in WF3 (2026-05-06) because Next.js's App Router enforces
// that `route.ts` exports ONLY HTTP method handlers + a fixed config
// allowlist; the previous `__resetAppHealthCacheForTests` test seam
// blocked production builds. This module is NOT a Next.js route file,
// so non-handler exports are allowed here.
//
// The semantics PRESERVED from Cycle 2 Phase 4 (the canonical version):
//   - Minute-boundary expiry (Spec 30 §2.2: "60s in-memory TTL keyed on
//     `snapshot_at` minute boundary"). Aligning to the wall-clock minute
//     means concurrent instances invalidate together and pay one upstream
//     round-trip per minute — a floating window would stagger expirations
//     and double the rate-limit footprint.
//   - Promise-based dog-pile defense. The cache stores the IN-FLIGHT
//     Promise (not the resolved body); concurrent racers find the
//     pending promise and await the same fan-out, so Sentry and PostHog
//     see exactly one upstream request per minute under concurrent load.
//     On rejection, the cache is cleared so the next request retries.
//
// Public surface:
//   - getCachedBody(now) → returns the pending/resolved promise if within
//     TTL, else null
//   - setCachedBody(promise, expiresAt) → writes the cache slot
//   - clearCache() → wipes the slot (used by route's error-recovery path
//     AND by tests)
//   - nextMinuteBoundary(now) → pure helper for computing the expiry

import type { AppHealthResponse } from '@/lib/admin/healthSchema';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  expiresAt: number;
  bodyPromise: Promise<AppHealthResponse>;
}

/** Module-local cache. Single entry — the endpoint takes no params. */
let cache: CacheEntry | null = null;

/**
 * Compute the next minute-boundary expiry. Math.ceil to the next minute
 * so a request landing at e.g. 12:00:42 builds a snapshot that expires
 * at 12:01:00, not 12:01:42. Aligns with wall-clock and `snapshot_at`.
 */
export function nextMinuteBoundary(now: number): number {
  return Math.ceil((now + 1) / CACHE_TTL_MS) * CACHE_TTL_MS;
}

/**
 * Returns the cached body promise if a non-expired entry exists, else
 * null. Caller awaits the returned promise; on rejection the caller is
 * expected to invoke `clearCache()` and fall through to a fresh fan-out.
 */
export function getCachedBody(now: number): Promise<AppHealthResponse> | null {
  if (cache && cache.expiresAt > now) return cache.bodyPromise;
  return null;
}

/**
 * Stores the in-flight promise in the cache slot. Caller is responsible
 * for computing `expiresAt` via `nextMinuteBoundary(Date.now())`.
 */
export function setCachedBody(
  bodyPromise: Promise<AppHealthResponse>,
  expiresAt: number,
): void {
  cache = { bodyPromise, expiresAt };
}

/**
 * Clears the cache slot. Called by the route on error-recovery paths
 * (envelope build threw, cached promise rejected) AND by infra tests
 * to start each test from a clean state without restarting the module
 * graph.
 */
export function clearCache(): void {
  cache = null;
}
