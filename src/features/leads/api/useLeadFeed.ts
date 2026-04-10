'use client';

// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §2.2 + §11 Phase 3 step 2
//
// TanStack Query infinite hook for GET /api/leads/feed. Uses a
// SNAPPED location stored in the Zustand store as the queryKey
// source — NOT the raw `input.lat`/`input.lng` props.
//
// Why: the prior implementation rounded coords to 3 decimals on every
// render. A user walking across an invisible ~110m grid boundary
// (lat 43.1235 → 43.1234) flipped the queryKey, which caused
// TanStack Query to treat the feed as a brand-new infinite query.
// The user's scroll state + all previously-fetched pages vanished
// and they were thrown back to page 1. Gemini's 2026-04-09 deep-dive
// review caught this.
//
// The fix: a single `snappedLocation` field in the Zustand store,
// only updated when the user's REAL position moves more than
// `FORCED_REFETCH_THRESHOLD_M` (500m). The queryKey reads from the
// snap, not the raw input. Sub-threshold movements don't change the
// queryKey at all — infinite scroll is preserved across GPS jitter,
// natural walking drift, and any movement within the 500m window.
//
// Movement detection is a single `useEffect` that advances the snap
// when the threshold is exceeded. That's the ONLY place the snap
// changes during a session. On fresh mount with no persisted snap,
// the effect seeds it from the current input.

import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useLeadFeedState } from '@/features/leads/hooks/useLeadFeedState';
import { DEFAULT_FEED_LIMIT } from '@/features/leads/lib/get-lead-feed';
import { haversineMeters } from '@/features/leads/lib/haversine';
import { captureEvent } from '@/lib/observability/capture';
import {
  isLeadApiError,
  LeadApiClientError,
  type LeadFeedResponse,
} from './types';

/**
 * Legacy constant — kept for the __constants export that
 * `contracts.infra.test.ts` asserts against. The coord_precision is
 * no longer used for queryKey rounding (that was the bug); we keep
 * the constant + the contracts entry so the value stays locked
 * against drift if a future refactor reintroduces any rounding.
 */
const COORD_PRECISION = 1000;

/**
 * Force a SNAP advance when the user's real position moves more than
 * this many metres from the current snapped location. 500m is far
 * enough that the lead set meaningfully changes (new permits enter
 * the 10km radius, old ones leave the edge) but close enough to feel
 * responsive when walking.
 */
const FORCED_REFETCH_THRESHOLD_M = 500;

export interface UseLeadFeedInput {
  trade_slug: string;
  lat: number;
  lng: number;
  radius_km: number;
  limit?: number;
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
    limit: String(input.limit ?? DEFAULT_FEED_LIMIT),
  });
  if (cursor) {
    params.set('cursor_score', String(cursor.cursor_score));
    params.set('cursor_lead_type', cursor.cursor_lead_type);
    params.set('cursor_lead_id', cursor.cursor_lead_id);
  }
  // 3-layer error funnel:
  //   Layer 1: fetch() itself can reject (offline, DNS, CORS). Catch and
  //            convert to LeadApiClientError('NETWORK_ERROR').
  //   Layer 2: res.json() can reject if the server returned non-JSON
  //            (502 HTML error page from a proxy, empty body). Catch too.
  //   Layer 3: Once we have a parsed body, check HTTP status first, then
  //            the envelope shape. A success body (2xx) that parses as a
  //            structured error envelope is a server contract violation
  //            and still throws.
  let res: Response;
  try {
    res = await fetch(`/api/leads/feed?${params.toString()}`, {
      method: 'GET',
      credentials: 'include',
    });
  } catch (err) {
    throw new LeadApiClientError(
      'NETWORK_ERROR',
      err instanceof Error ? err.message : 'Feed request failed',
    );
  }
  let body: unknown;
  try {
    body = (await res.json()) as unknown;
  } catch {
    throw new LeadApiClientError(
      'NETWORK_ERROR',
      `Feed request failed: ${res.status} (non-JSON response)`,
    );
  }
  if (!res.ok) {
    // Phase 3-holistic WF3 Phase C (2026-04-09): surface 401 as a
    // DEDICATED `AUTH_EXPIRED` code distinct from `NETWORK_ERROR`.
    // Pre-fix, a mid-session cookie expiry mapped to the generic
    // NETWORK_ERROR path and the user saw an "unreachable" empty
    // state forever — no prompt to re-login. The consuming LeadFeed
    // component branches on this code to trigger a login redirect.
    // Independent reviewer Phase 3 C1.
    if (res.status === 401) {
      throw new LeadApiClientError(
        'AUTH_EXPIRED',
        'Your session has expired. Please sign in again.',
      );
    }
    const err = isLeadApiError(body)
      ? body.error
      : { code: 'NETWORK_ERROR', message: `Feed request failed: ${res.status}` };
    throw new LeadApiClientError(
      err.code,
      err.message,
      (err as { details?: unknown }).details,
    );
  }
  // Success HTTP status but the body parses as an error envelope → server
  // contract violation. Still throw so the caller sees an error state.
  if (isLeadApiError(body)) {
    throw new LeadApiClientError(
      body.error.code,
      body.error.message,
      body.error.details,
    );
  }
  return body as LeadFeedResponse;
}

/**
 * Infinite-query hook for the lead feed. The queryKey is derived from
 * the SNAPPED location in the Zustand store, not the raw input props.
 * See the file header for the rationale.
 *
 * The single `useEffect` in this file advances the snap when the real
 * position exceeds the 500m threshold. It is NOT a data-fetching
 * effect — fetching is TanStack Query's job. The snap change triggers
 * a natural queryKey change → TanStack fetches the new key.
 */
export function useLeadFeed(input: UseLeadFeedInput) {
  const snappedLocation = useLeadFeedState((s) => s.snappedLocation);
  const setSnappedLocation = useLeadFeedState((s) => s.setSnappedLocation);
  // Gemini 2026-04-09 CRITICAL: without gating on _hasHydrated, the
  // snap-seed effect fires BEFORE the persist middleware finishes
  // rehydrating. It overwrites the persisted snap with the current
  // input coords, wasting a fetch and losing the user's resumed
  // position from the prior session. Gate the effect + the query
  // itself on _hasHydrated to eliminate the race entirely.
  const hasHydrated = useLeadFeedState((s) => s._hasHydrated);

  // Use the snapped location if it exists; otherwise fall back to the
  // raw input on the first render (before the seed effect fires). The
  // fallback means queryKey is always defined even on the first render.
  const snapLat = snappedLocation?.lat ?? input.lat;
  const snapLng = snappedLocation?.lng ?? input.lng;

  const queryKey = [
    'leadFeed',
    {
      trade_slug: input.trade_slug,
      lat: snapLat,
      lng: snapLng,
      radius_km: input.radius_km,
      limit: input.limit ?? DEFAULT_FEED_LIMIT,
    },
  ] as const;

  const query = useInfiniteQuery<LeadFeedResponse, LeadApiClientError>({
    queryKey,
    // Don't fetch until Zustand has rehydrated — otherwise the first
    // render could issue a fetch for the CURRENT location, then
    // rehydration arrives with a different persisted snap, triggering
    // a second fetch and a UI flicker.
    enabled: hasHydrated,
    initialPageParam: undefined as CursorTriple | undefined,
    queryFn: ({ pageParam }) =>
      fetchLeadFeedPage(
        // The fetch uses the SNAPPED coords so the cache and the
        // server-side query agree on what position they're for. If
        // we fetched with raw input but cached with snap, the cached
        // data would claim to represent one position but come from
        // another.
        { ...input, lat: snapLat, lng: snapLng },
        pageParam as CursorTriple | undefined,
      ),
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
    // Consumers enforce the cap in UI by checking allPages.length.
  });

  // Snap advancement effect. This is the ONLY place the snap changes
  // during a session. Four cases:
  //   1. Fresh mount, no persisted snap → seed from input.
  //   2. Fresh mount, persisted snap from a prior session → don't
  //      touch the snap; the user resumes their last feed position.
  //   3. Sub-threshold movement (< 500m) → no-op. queryKey stable.
  //   4. Super-threshold movement (> 500m) → advance the snap.
  //      queryKey changes next render, TanStack naturally fetches the
  //      new key. No invalidateQueries call needed — the key change
  //      IS the invalidation (Gemini 2026-04-09: the previous explicit
  //      invalidateQueries({queryKey: ['leadFeed']}) was redundant and
  //      invalidated unrelated trade/radius entries for other consumers).
  //
  // Gated on `hasHydrated` so this effect doesn't race the persist
  // middleware on mount. Before hydration completes, `snappedLocation`
  // reflects the initial store state (null), not the persisted value
  // — seeding during that window would silently overwrite the user's
  // resumed session position.
  useEffect(() => {
    if (!hasHydrated) return;
    if (snappedLocation === null) {
      setSnappedLocation({ lat: input.lat, lng: input.lng });
      return;
    }
    const moved = haversineMeters(
      snappedLocation.lat,
      snappedLocation.lng,
      input.lat,
      input.lng,
    );
    if (moved > FORCED_REFETCH_THRESHOLD_M) {
      setSnappedLocation({ lat: input.lat, lng: input.lng });
    }
  }, [input.lat, input.lng, snappedLocation, setSnappedLocation, hasHydrated]);

  // Phase 3-vi observability: emit `lead_feed.client_error` whenever
  // the query enters an error state with a typed LeadApiClientError.
  // Pre-fix, 4xx errors (e.g., 400 VALIDATION_FAILED from a stale
  // snap location or a malformed cursor) surfaced in the UI as the
  // 'unreachable' empty state but engineering had no telemetry. The
  // ref-based dedupe (keyed on (code, message)) prevents spamming
  // PostHog when the user is stuck in a sustained error state — the
  // same pattern lead_feed.viewed uses.
  const lastClientErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (!query.isError) {
      lastClientErrorRef.current = null;
      return;
    }
    const err = query.error;
    if (!(err instanceof LeadApiClientError)) return;
    // Phase 3-holistic WF3 Phase E (2026-04-09): dedupe and emit ONLY
    // the bounded `code` string — `err.message` is unbounded (server
    // messages, validation details, JS runtime messages) and blew up
    // PostHog event property cardinality, making the funnel unusable.
    // Independent reviewer Phase 3 I5.
    const key = err.code;
    if (lastClientErrorRef.current === key) return;
    lastClientErrorRef.current = key;
    captureEvent('lead_feed.client_error', {
      code: err.code,
      trade_slug: input.trade_slug,
    });
  }, [query.isError, query.error, input.trade_slug]);

  return query;
}

/**
 * Exported for unit tests only.
 */
export const __constants = {
  COORD_PRECISION,
  FORCED_REFETCH_THRESHOLD_M,
};
