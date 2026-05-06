// 🔗 SPEC LINK: docs/specs/02-web-admin/30_app_health_dashboard.md §2.2
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5
//             docs/specs/02-web-admin/35_web_admin_state_architecture.md §8.3
//
// TanStack Query hook for the App Health Dashboard. Spec 33 §5 mandates
// "every server read MUST be wrapped in a named hook (`useAdminMarketMetrics`,
// `useAppHealth`, etc.)" — the hook is THE seam, not a convenience.
//
// staleTime + refetchInterval are aligned with the server-side cache TTL
// (Spec 30 §2.2 minute boundary). Polling continues only while the page is
// mounted; TanStack Query handles unmount cleanup.

'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AppHealthResponse } from '@/lib/admin/healthSchema';

const APP_HEALTH_QUERY_KEY = ['admin', 'app-health'] as const;
const POLL_INTERVAL_MS = 60_000;

async function fetchAppHealth(): Promise<AppHealthResponse> {
  const response = await fetch('/api/admin/app-health');
  if (!response.ok) {
    throw new Error(`App Health endpoint returned ${response.status}`);
  }
  return (await response.json()) as AppHealthResponse;
}

/**
 * Polling read of `/api/admin/app-health`. The 60s cadence matches the
 * server-side cache so the page sees a fresh snapshot per minute boundary
 * without hammering Sentry/PostHog.
 */
export function useAppHealth(): UseQueryResult<AppHealthResponse, Error> {
  return useQuery<AppHealthResponse, Error>({
    queryKey: APP_HEALTH_QUERY_KEY,
    queryFn: fetchAppHealth,
    staleTime: POLL_INTERVAL_MS,
    refetchInterval: POLL_INTERVAL_MS,
    retry: 1,
  });
}
