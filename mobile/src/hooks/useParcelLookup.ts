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

import { useQuery } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import { fetchWithAuth } from '@/lib/apiClient';
import { AccountDeletedError, ApiError, RateLimitError } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import { ConsumerParcelLookupResultSchema, type ConsumerParcelLookupResult } from '@/lib/schemas';

// Sentinel for deterministic schema-drift failures — short-circuits the retry guard so a
// malformed server response doesn't generate duplicate Sentry events (mirrors useLeadDetail).
export class ParcelLookupSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParcelLookupSchemaError';
  }
}

export async function fetchParcelLookup(
  params: { q: string } | { parcelId: string },
): Promise<ConsumerParcelLookupResult> {
  const qs = 'q' in params
    ? `q=${encodeURIComponent(params.q)}`
    : `parcelId=${encodeURIComponent(params.parcelId)}`;
  const raw = await fetchWithAuth<{ data: unknown }>(`/api/parcels/lookup?${qs}`);
  const parsed = ConsumerParcelLookupResultSchema.safeParse(raw.data);
  if (!parsed.success) {
    Sentry.captureException(parsed.error, { extra: { context: 'useParcelLookup Zod parse' } });
    throw new ParcelLookupSchemaError('Parcel lookup response failed schema validation');
  }
  return parsed.data;
}

// Skip retries for deterministic states: 400 (bad params), 403 (no subscription / deleted),
// 429 (burning retries against the rate-limit compounds the throttle), schema-drift.
export function shouldRetryParcelLookup(failureCount: number, err: unknown): boolean {
  return (
    !(err instanceof AccountDeletedError) &&
    !(err instanceof RateLimitError) &&
    !(err instanceof ApiError && (err.status === 400 || err.status === 403)) &&
    !(err instanceof ParcelLookupSchemaError) &&
    failureCount < 3
  );
}

/**
 * Debounced typeahead search. Fires when the trimmed query is ≥ 3 chars (the server min).
 * The screen owns the ≥400ms debounce (Spec 100 §4); this hook just caches per query string.
 */
export function useParcelSearch(q: string) {
  const trimmed = q.trim();
  const idToken = useAuthStore((s) => s.idToken);
  return useQuery({
    queryKey: ['parcel-search', trimmed],
    queryFn: () => fetchParcelLookup({ q: trimmed }),
    enabled: trimmed.length >= 3 && !!idToken,
    staleTime: 60_000,
    retry: shouldRetryParcelLookup,
  });
}

/**
 * Detail lookup by parcelId. Depends ONLY on `['parcel-lookup', parcelId]` (Spec 100 §4 /
 * fold #9 query-key hygiene) — never on the search query string.
 */
export function useParcelLookup(parcelId: string | undefined) {
  const idToken = useAuthStore((s) => s.idToken);
  return useQuery({
    queryKey: ['parcel-lookup', parcelId],
    queryFn: () => fetchParcelLookup({ parcelId: parcelId! }),
    enabled: !!parcelId && !!idToken,
    staleTime: 60_000,
    retry: shouldRetryParcelLookup,
  });
}
