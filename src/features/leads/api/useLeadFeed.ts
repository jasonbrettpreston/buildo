'use client';

// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §2.2 + §11 Phase 3 step 2
//
// TanStack Query infinite hook for GET /api/leads/feed. Implements the
// 2-layer location handling from spec 75 §11 Phase 3:
//
//   Layer 1: Round lat/lng to 3 decimals (~110m grid) in the query key
//   so GPS jitter (seconds-scale drift of a stationary user) doesn't
//   create a fresh cache entry on every tick.
//
//   Layer 2: A `useEffect` compares the current lat/lng to the last
//   queried lat/lng via haversine. If the user has moved more than
//   500 metres, invalidate the query so the NEXT render fetches fresh
//   data. Without this, Layer 1's rounding would hide legitimate
//   movement (walking 100m doesn't change rounded coords).
//
// The two layers together: stable cache under jitter + responsive to
// real movement. Either alone is broken (Layer 1 alone: stale data
// after walking; Layer 2 alone: cache thrash from GPS jitter).

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { haversineMeters } from '@/features/leads/hooks/haversine';
import {
  isLeadApiError,
  LeadApiClientError,
  type LeadFeedResponse,
} from './types';

/**
 * Round lat/lng to 3 decimals for query key stability. 3 decimals ~ 110m.
 */
const COORD_PRECISION = 1000;

/**
 * Force a refetch when the user moves further than this many metres
 * since the last successful query. 500m is far enough that the lead
 * set meaningfully changes (new permits enter the 10km radius, old
 * ones leave the edge) but close enough to feel responsive when walking.
 */
const FORCED_REFETCH_THRESHOLD_M = 500;

export interface UseLeadFeedInput {
  trade_slug: string;
  lat: number;
  lng: number;
  radius_km: number;
  limit?: number;
}

function roundCoord(v: number): number {
  return Math.round(v * COORD_PRECISION) / COORD_PRECISION;
}

interface CursorTriple {
  cursor_score: number;
  cursor_lead_type: 'permit' | 'builder';
  cursor_lead_id: string;
}

async function fetchLeadFeedPage(
  input: UseLeadFeedInput,
  cursor: CursorTriple | undefined,
): Promise<LeadFeedResponse> {
  const params = new URLSearchParams({
    trade_slug: input.trade_slug,
    lat: String(input.lat),
    lng: String(input.lng),
    radius_km: String(input.radius_km),
    limit: String(input.limit ?? 15),
  });
  if (cursor) {
    params.set('cursor_score', String(cursor.cursor_score));
    params.set('cursor_lead_type', cursor.cursor_lead_type);
    params.set('cursor_lead_id', cursor.cursor_lead_id);
  }
  const res = await fetch(`/api/leads/feed?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });
  const body = (await res.json()) as unknown;
  if (!res.ok || isLeadApiError(body)) {
    const err = isLeadApiError(body)
      ? body.error
      : { code: 'NETWORK_ERROR', message: `Feed request failed: ${res.status}` };
    throw new LeadApiClientError(err.code, err.message, (err as { details?: unknown }).details);
  }
  return body as LeadFeedResponse;
}

/**
 * Infinite-query hook for the lead feed. Consumers pass the current
 * filter inputs; the hook handles rounding, cursor wiring, and the
 * movement-based cache invalidation.
 *
 * NOTE: the one `useEffect` in this file is for movement detection,
 * NOT for data fetching. Fetching is TanStack Query's job. This is the
 * explicit exception to the standards §12.2 "no useEffect for data
 * fetching" rule — we're reacting to a prop change, not triggering a
 * fetch directly.
 */
export function useLeadFeed(input: UseLeadFeedInput) {
  const roundedLat = roundCoord(input.lat);
  const roundedLng = roundCoord(input.lng);

  const queryKey = [
    'leadFeed',
    {
      trade_slug: input.trade_slug,
      lat: roundedLat,
      lng: roundedLng,
      radius_km: input.radius_km,
      limit: input.limit ?? 15,
    },
  ] as const;

  const queryClient = useQueryClient();
  const lastQueriedRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (lastQueriedRef.current === null) {
      lastQueriedRef.current = { lat: input.lat, lng: input.lng };
      return;
    }
    const moved = haversineMeters(
      lastQueriedRef.current.lat,
      lastQueriedRef.current.lng,
      input.lat,
      input.lng,
    );
    if (moved > FORCED_REFETCH_THRESHOLD_M) {
      lastQueriedRef.current = { lat: input.lat, lng: input.lng };
      // Broaden invalidation to every leadFeed query regardless of the
      // specific (trade_slug, radius, limit) triple — moving >500m
      // makes ALL cached entries for this user's old location stale,
      // not just the current one. This also means the effect's deps
      // are genuinely just (input.lat, input.lng, queryClient) with
      // no queryKey capture, satisfying exhaustive-deps cleanly.
      queryClient.invalidateQueries({ queryKey: ['leadFeed'] });
    }
  }, [input.lat, input.lng, queryClient]);

  return useInfiniteQuery<LeadFeedResponse, LeadApiClientError>({
    queryKey,
    initialPageParam: undefined as CursorTriple | undefined,
    queryFn: ({ pageParam }) => fetchLeadFeedPage(input, pageParam as CursorTriple | undefined),
    getNextPageParam: (lastPage): CursorTriple | undefined => {
      const nc = lastPage.meta.next_cursor;
      if (!nc) return undefined;
      return {
        cursor_score: nc.score,
        cursor_lead_type: nc.lead_type,
        cursor_lead_id: nc.lead_id,
      };
    },
    // V1 hard cap: 5 pages × 15 = 75 cards max (spec 75 §11 Phase 7).
    // Consumers enforce the cap in UI by checking allPages.length; this
    // flag is set via a selector in the consumer if they want to stop
    // early. The query itself doesn't cap pages — TanStack will keep
    // fetching as long as getNextPageParam returns non-undefined.
  });
}

/**
 * Exported for unit tests only.
 */
export const __constants = {
  COORD_PRECISION,
  FORCED_REFETCH_THRESHOLD_M,
};
