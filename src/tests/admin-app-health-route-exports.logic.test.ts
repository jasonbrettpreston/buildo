// 🔗 SPEC LINK: docs/specs/02-web-admin/30_app_health_dashboard.md §2.2
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §3
//
// Regression lock for WF3 (2026-05-06): the App Health route file MUST
// only export the canonical Next.js handler/config names. Any other
// named export (test seams, helpers, etc.) blocks `next build` because
// the App Router's type-checker rejects non-handler exports from
// route.ts files at type-check time.
//
// Cycle 2 Phase 4 added `__resetAppHealthCacheForTests` as a test seam
// directly to route.ts; it worked in dev (lenient type-check) but
// production builds failed. WF3 extracted the cache state to ./cache.ts
// (a non-route module where additional exports are permitted). This
// test pins the canonical export set so future contributors don't
// reintroduce the same regression class.

import { describe, it, expect } from 'vitest';

// Next.js App Router canonical route-file exports. Subset taken from
// the framework's RouteModule type (handlers + config). Any export name
// not in this set will fail `next build`.
const ALLOWED_ROUTE_EXPORTS = new Set([
  // HTTP method handlers
  'GET',
  'POST',
  'PATCH',
  'PUT',
  'DELETE',
  'HEAD',
  'OPTIONS',
  // Config exports
  'config',
  'dynamic',
  'fetchCache',
  'preferredRegion',
  'revalidate',
  'runtime',
  'maxDuration',
  // Default export (rare for route files)
  'default',
]);

describe('App Health route — Next.js export allowlist (WF3 regression lock)', () => {
  it('exports ONLY canonical handler/config names — no test seams or helpers', async () => {
    const routeModule = await import('@/app/api/admin/app-health/route');
    const exportedNames = Object.keys(routeModule);
    const violations = exportedNames.filter(
      (name) => !ALLOWED_ROUTE_EXPORTS.has(name),
    );
    expect(
      violations,
      `Route file must not export non-handler names. ` +
        `Move helpers/state/test-seams to a sibling module (./cache.ts pattern). ` +
        `Violations would block 'next build' at type-check time.`,
    ).toEqual([]);
  });

  it('exports the GET handler', async () => {
    const routeModule = await import('@/app/api/admin/app-health/route');
    expect(typeof routeModule.GET).toBe('function');
  });
});
