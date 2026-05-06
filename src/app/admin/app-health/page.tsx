'use client';
/**
 * Admin App Health Dashboard — frontend telemetry triage page.
 *
 * SPEC LINK: docs/specs/02-web-admin/30_app_health_dashboard.md §2.3 + §2.6
 *           docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §3
 *
 * Server-component-first per Spec 33 §3 — but THIS PAGE polls Sentry
 * + PostHog every 60s, so it's a client component shell mounting the
 * polling tiles. The page itself is the smallest client subtree
 * required; the surrounding admin layout (src/app/admin/layout.tsx)
 * stays server-rendered.
 *
 * 5 tiles per Spec 30 §2.2:
 *   - Crash Rate (24h)
 *   - Auth Conversion (7d) — 4 methods
 *   - Lead Save Funnel (7d)
 *   - Paywall Conversion (7d)
 *   - Cache Invalidation (24h)
 *
 * Data flow:
 *   useQuery('admin-app-health') → fetch /api/admin/app-health
 *     → render 5 <HealthTile> instances
 *   staleTime: 60_000 matches the server-side cache TTL.
 */

import { useState } from 'react';
import Link from 'next/link';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HealthTile } from '@/components/admin/HealthTile';
import { useAppHealth } from '@/features/admin-app-health/api/useAppHealth';
import type {
  AuthConversion7dPayload,
  CacheInvalidation24hPayload,
  CrashRate24hPayload,
  LeadSaveFunnel7dPayload,
  PaywallConversion7dPayload,
} from '@/lib/admin/healthSchema';

export default function AppHealthPage() {
  // QueryClient lives PER MOUNT, not at module scope, to avoid cross-mount
  // state sharing under HMR / fast-refresh and to match the App Router
  // recommendation. `useState(() => ...)` ensures one instance per mount.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  App Health
                </h1>
                <p className="text-sm text-gray-500">
                  Frontend telemetry triage — crash rate, funnel
                  conversion, auth method ratios. Drill into Sentry /
                  PostHog for deep analysis.
                </p>
              </div>
              <Link
                href="/admin"
                className="text-sm text-blue-600 hover:underline"
              >
                &larr; Admin
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <AppHealthDashboard />
        </main>
      </div>
    </QueryClientProvider>
  );
}

function AppHealthDashboard() {
  const { data, isLoading, isError } = useAppHealth();

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-800">
          Failed to load App Health data. Check admin auth / network /
          server logs and retry.
        </p>
      </div>
    );
  }

  const tiles = data?.data?.tiles;
  // While loading, all tiles render their loading skeleton.
  const loadingState = isLoading || !tiles;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <HealthTile<CrashRate24hPayload>
        title="Crash Rate"
        window="24h"
        state={loadingState ? null : tiles.crash_rate_24h}
        renderOk={(p) => (
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {(p.rate_per_user * 100).toFixed(3)}%
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {p.affected_users} affected users ·{' '}
              <a
                href={p.sentry_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                View in Sentry &rarr;
              </a>
            </div>
          </div>
        )}
      />

      <HealthTile<AuthConversion7dPayload>
        title="Auth Conversion"
        window="7d"
        state={loadingState ? null : tiles.auth_conversion_7d}
        renderOk={(p) => (
          <div>
            <div className="grid grid-cols-2 gap-2">
              {p.per_method.map((m) => (
                <div key={m.method} className="text-xs">
                  <span className="font-mono text-gray-500">{m.method}</span>{' '}
                  <span className="font-bold text-gray-900">
                    {(m.ratio * 100).toFixed(0)}%
                  </span>
                  <div className="text-gray-400">
                    {m.succeeded}/{m.attempted}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs">
              <a
                href={p.posthog_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                View in PostHog &rarr;
              </a>
            </div>
          </div>
        )}
      />

      <HealthTile<LeadSaveFunnel7dPayload>
        title="Lead Save Funnel"
        window="7d"
        state={loadingState ? null : tiles.lead_save_funnel_7d}
        renderOk={(p) => (
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {(p.ratio * 100).toFixed(1)}%
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {p.saved} saved / {p.viewed} viewed ·{' '}
              <a
                href={p.posthog_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                View in PostHog &rarr;
              </a>
            </div>
          </div>
        )}
      />

      <HealthTile<PaywallConversion7dPayload>
        title="Paywall Conversion"
        window="7d"
        state={loadingState ? null : tiles.paywall_conversion_7d}
        renderOk={(p) => (
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {(p.ratio * 100).toFixed(1)}%
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {p.clicked} clicked / {p.shown} shown ·{' '}
              <a
                href={p.posthog_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                View in PostHog &rarr;
              </a>
            </div>
          </div>
        )}
      />

      <HealthTile<CacheInvalidation24hPayload>
        title="Cache Invalidation"
        window="24h"
        state={loadingState ? null : tiles.cache_invalidation_24h}
        renderOk={(p) => (
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {p.breadcrumb_count.toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              query breadcrumbs ·{' '}
              <a
                href={p.sentry_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                View in Sentry &rarr;
              </a>
            </div>
          </div>
        )}
      />
    </div>
  );
}
