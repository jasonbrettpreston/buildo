// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (screens + hooks)
//            docs/specs/03-mobile/99_mobile_state_architecture.md §4 B1 (query keys)
//            docs/specs/03-mobile/90_mobile_engineering_protocol.md §13 (Zod boundary)
//
// TanStack Query hooks for the Parcel Cost Tool. Two query keys (Spec 99 §4):
//   ['parcel-search', q]      — debounced typeahead (search screen)
//   ['parcel-lookup', parcelId] — the detail screen (depends ONLY on parcelId, query-key hygiene)
// Both endpoints return the SAME whitelist envelope shape; the hook parses `raw.data` through
// ConsumerParcelLookupResultSchema. A drifted server shape re-throws to the ErrorBoundary; network
// errors (ApiError/RateLimitError/NetworkError) stay in `isError` for inline handling.

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import { fetchWithAuth } from '@/lib/apiClient';
import { AccountDeletedError, ApiError, RateLimitError } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import { boundedWait, SEMI_CONTINUE_WAIT_MS } from '@/lib/semiQuestion';
import searchSlice from '@/generated/surfaces/mobile_parcel_search.json';
import { sliceNumber } from '@/lib/sliceConfig';
import {
  ConsumerParcelLookupResultSchema,
  ParcelToolEntitlementSchema,
  type ConsumerParcelLookupResult,
  type ParcelToolEntitlement,
} from '@/lib/schemas';

// Sentinel for deterministic schema-drift failures — short-circuits the retry guard so a
// malformed server response doesn't generate duplicate Sentry events (mirrors useLeadDetail).
export class ParcelLookupSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParcelLookupSchemaError';
  }
}

export async function fetchParcelLookup(
  // SRCH.SEMI stage 2 (task-319, MF-93; RR-0278): `semi: 'answered'` is the one optional flag the semi question page sends at Continue, so the
  // server counts the lot once its report is produced (contract_parcels_lookup, route.ts). It belongs to the parcelId form only.
  params: { q: string } | { parcelId: string; semi?: 'answered' },
): Promise<ConsumerParcelLookupResult> {
  const qs = 'q' in params
    ? `q=${encodeURIComponent(params.q)}`
    : `parcelId=${encodeURIComponent(params.parcelId)}${params.semi ? `&semi=${params.semi}` : ''}`;
  const raw = await fetchWithAuth<{ data: unknown }>(`/api/parcels/lookup?${qs}`);
  const parsed = ConsumerParcelLookupResultSchema.safeParse(raw.data);
  if (!parsed.success) {
    Sentry.captureException(parsed.error, { extra: { context: 'useParcelLookup Zod parse' } });
    throw new ParcelLookupSchemaError('Parcel lookup response failed schema validation');
  }
  return parsed.data;
}

// FIX.TUNE (task-378; Spec 126 P4, Spec 128 Rule 3): the retry count and the stale times are the search surface's declared config, read from its generated slice.
const LOOKUP_RETRY_MAX = sliceNumber(searchSlice, 'lookup_retry_max');
const LOOKUP_STALE_MS = sliceNumber(searchSlice, 'lookup_stale_ms');
const ENTITLEMENT_STALE_MS = sliceNumber(searchSlice, 'entitlement_stale_ms');
const LOOKUP_MIN_QUERY_LEN = sliceNumber(searchSlice, 'min_query_len');

// Skip retries for deterministic states: 400 (bad params), 403 (no subscription / deleted),
// 429 (burning retries against the rate-limit compounds the throttle), schema-drift.
export function shouldRetryParcelLookup(failureCount: number, err: unknown): boolean {
  return (
    !(err instanceof AccountDeletedError) &&
    !(err instanceof RateLimitError) &&
    !(err instanceof ApiError && (err.status === 400 || err.status === 403)) &&
    !(err instanceof ParcelLookupSchemaError) &&
    failureCount < LOOKUP_RETRY_MAX
  );
}

/**
 * Debounced typeahead search. Fires when the trimmed query is ≥ 3 chars (the server min).
 * The screen owns the ≥400ms debounce (Spec 100 §4); this hook just caches per query string.
 */
export function useParcelSearch(q: string) {
  const trimmed = q.trim();
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['parcel-search', trimmed],
    queryFn: () => fetchParcelLookup({ q: trimmed }),
    enabled: trimmed.length >= LOOKUP_MIN_QUERY_LEN && !!accessToken,
    staleTime: LOOKUP_STALE_MS,
    retry: shouldRetryParcelLookup,
  });
}

/**
 * SRCH.METER-2 (task-360, RR-0278; SE-1, SE-2): the parcelId form of the lookup, carrying the report route's `semi` param to the server as `semi: 'answered'`
 * only when it is exactly the string 'answered' (the server holds an unsure lot's page without it; a stray param asks, never skips: lotForm.ts needsSemiQuestion).
 */
export function parcelLookupParams(parcelId: string, semi?: string): { parcelId: string; semi?: 'answered' } {
  return semi === 'answered' ? { parcelId, semi: 'answered' } : { parcelId };
}

/**
 * Detail lookup by parcelId. Depends ONLY on `['parcel-lookup', parcelId]` (Spec 100 §4 /
 * fold #9 query-key hygiene) — never on the search query string. `semi` is the report route's param (the report screen only); it changes the request,
 * not the key (the semi page stores its answered result under the same key, useSetParcelLookup).
 */
export function useParcelLookup(parcelId: string | undefined, semi?: string) {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['parcel-lookup', parcelId],
    queryFn: () => fetchParcelLookup(parcelLookupParams(parcelId!, semi)),
    enabled: !!parcelId && !!accessToken,
    staleTime: LOOKUP_STALE_MS,
    retry: shouldRetryParcelLookup,
  });
}

/**
 * Store an answered lookup under the report's own cache key. SUITE.FIX-2 (task-353, 2026-11-19): the semi question page (a mount file) used to call
 * useQueryClient itself (9fea46277); a mount may import only framework packages, binding modules and @/hooks/ (bindings.json mount_internal, FE-31 C-2),
 * so the one setQueryData call lives here, the same key as useParcelLookup.
 */
export function useSetParcelLookup() {
  const queryClient = useQueryClient();
  return useCallback(
    (parcelId: string, result: ConsumerParcelLookupResult) => { queryClient.setQueryData(['parcel-lookup', parcelId], result); },
    [queryClient],
  );
}

/**
 * FIX.SEMI (task-373, grounder D5; Spec 99 section 4 B1 99:219 "Every server fetch MUST go through TanStack Query"): the semi question page's Continue lookup,
 * the same lookup with the one flag `semi: 'answered'` (SRCH.SEMI stage 2, task-319), bounded by SEMI_CONTINUE_WAIT_MS (task-361, LX-E1: a lookup that does not
 * settle ends in the page's built error state). The Zod boundary is fetchParcelLookup's own parse.
 */
export function answeredParcelLookup(parcelId: string): Promise<ConsumerParcelLookupResult> {
  return boundedWait(fetchParcelLookup({ parcelId, semi: 'answered' }), SEMI_CONTINUE_WAIT_MS);
}

/**
 * Options of the Continue mutation. retry 0: a failed answer is not re-sent by the library (the page's Try again is the retry). networkMode 'always': the
 * default 'online' pauses a mutation while offline, so the bounded wait would never start and the page would stay busy; offline it must fail at once, as task-361 built it.
 */
export function buildAnswerParcelLookupOptions() {
  return { mutationFn: answeredParcelLookup, retry: 0, networkMode: 'always' } as const;
}

// Callers use mutateAsync inside try/catch (the semi page does): the hook sets no onError.
export function useAnswerParcelLookup() {
  return useMutation(buildAnswerParcelLookupOptions());
}

/**
 * SRCH.A6 (task-320; RR-0307): the caller's plan and this month's report count, read from GET /api/parcels/entitlement (the line "N of M reports left
 * until <date>"). A display, never a gate. Parsed through the Zod boundary like the lookup; a drifted shape is the same ParcelLookupSchemaError. No
 * retry on 401/403/429 or drift (the line is simply absent); never persisted across a restart (mobile/src/lib/persistFilter.ts); re-read on focus.
 */
export async function fetchParcelEntitlement(): Promise<ParcelToolEntitlement> {
  const raw = await fetchWithAuth<{ data: unknown }>('/api/parcels/entitlement');
  const parsed = ParcelToolEntitlementSchema.safeParse(raw.data);
  if (!parsed.success) {
    Sentry.captureException(parsed.error, { extra: { context: 'useParcelEntitlement Zod parse' } });
    throw new ParcelLookupSchemaError('Parcel entitlement response failed schema validation');
  }
  return parsed.data;
}

export function useParcelEntitlement() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['parcel-entitlement'],
    queryFn: fetchParcelEntitlement,
    enabled: !!accessToken,
    staleTime: ENTITLEMENT_STALE_MS,
    retry: shouldRetryParcelLookup,
  });
}
