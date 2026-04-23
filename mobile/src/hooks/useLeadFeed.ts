// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §5 State
// Infinite-scroll lead feed hook backed by TanStack Query.
// Normalises cursor pagination and validates every page through Zod.
import { useInfiniteQuery } from '@tanstack/react-query';
import { ZodError } from 'zod';
import { fetchWithAuth } from '@/lib/apiClient';
import { LeadFeedResultSchema } from '@/lib/schemas';
import type { LeadFeedResult, LeadFeedCursor } from '@/lib/schemas';

interface FeedParams {
  lat: number;
  lng: number;
  tradeSlug: string;
  radiusKm: number;
}

async function fetchPage(
  params: FeedParams,
  cursor: LeadFeedCursor | null,
): Promise<LeadFeedResult> {
  const qs = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
    trade_slug: params.tradeSlug,
    radius_km: String(params.radiusKm),
  });
  if (cursor) {
    qs.set('cursor_score', String(cursor.score));
    qs.set('cursor_lead_type', cursor.lead_type);
    qs.set('cursor_lead_id', cursor.lead_id);
  }
  const raw = await fetchWithAuth<unknown>(`/api/leads/feed?${qs.toString()}`);
  // Zod parse: throws ZodError if the server returns an unexpected shape,
  // which propagates to TanStack Query error state and the ErrorBoundary.
  return LeadFeedResultSchema.parse(raw);
}

export function useLeadFeed(params: FeedParams | null) {
  return useInfiniteQuery({
    queryKey: ['lead-feed', params],
    queryFn: ({ pageParam }) => {
      // Defense-in-depth: enabled guard should prevent this, but a prefetch or
      // explicit refetchQueries call bypasses that check and would hit params!.
      if (!params) {
        return Promise.reject(new Error('useLeadFeed called without params'));
      }
      return fetchPage(params, pageParam as LeadFeedCursor | null);
    },
    initialPageParam: null as LeadFeedCursor | null,
    getNextPageParam: (lastPage) => lastPage.meta.next_cursor,
    enabled: params !== null,
    // Schema drift is a contract bug — re-throw to the ErrorBoundary so engineers
    // see it in dev and Sentry in prod. Network errors stay in isError for inline
    // UX handling (retry / offline banner).
    throwOnError: (err) => err instanceof ZodError,
  });
}
