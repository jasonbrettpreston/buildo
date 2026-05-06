// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §4.3 + §4.3.1 (API contract)
//             docs/specs/03-mobile/99_mobile_state_architecture.md §B1 (Server → TanStack Query bridge)
//             docs/specs/03-mobile/99_mobile_state_architecture.md §B4 (idToken gate)
//             docs/specs/03-mobile/90_mobile_engineering_protocol.md §11 (Bearer auth)
//             docs/specs/03-mobile/90_mobile_engineering_protocol.md §13 (Zod boundary)
//
// Replaces the pre-Spec-99 `queryClient.getQueryCache().subscribe` cache walk
// in `[lead].tsx` (a §B1 violation) with the canonical `useQuery` pattern.
// Also unblocks cold-boot push deep-link to the detail screen — the cache
// walk would resolve empty when the feed query hadn't loaded yet, leaving
// the user staring at "Lead not found".
//
// Authorization: client-side gate on `idToken` to avoid a cold-boot 401
// before authStore rehydrates the Bearer token (Spec 99 §B4). Server-side
// authorization is enforced by the SQL — endpoint returns 404 when the
// permit row is missing; `is_saved` is scoped to the viewer via lv_self
// LATERAL EXISTS.

import { useQuery } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import { fetchWithAuth } from '@/lib/apiClient';
import { AccountDeletedError, ApiError, RateLimitError } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import { LeadDetailSchema, type LeadDetail } from '@/lib/schemas';

// Sentinel error for deterministic schema-drift failures — short-circuits
// the retry guard so a malformed server response doesn't generate 3×
// duplicate Sentry events per cold boot. Mirrors `useFlightJobDetail`.
export class LeadDetailSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeadDetailSchemaError';
  }
}

export async function fetchLeadDetail(id: string): Promise<LeadDetail> {
  const raw = await fetchWithAuth<{ data: unknown }>(
    `/api/leads/detail/${encodeURIComponent(id)}`,
  );
  const parsed = LeadDetailSchema.safeParse(raw.data);
  if (!parsed.success) {
    Sentry.captureException(parsed.error, {
      extra: { context: 'useLeadDetail Zod parse', id },
    });
    throw new LeadDetailSchemaError(
      'LeadDetail response failed schema validation',
    );
  }
  return parsed.data;
}

// Skip retries for deterministic states: 400 (malformed id), 404 (no
// permit row, or CoA — currently 404 by design per Spec 91 §4.3.1),
// 403 (deleted account), 429 (burning retries against rate-limit
// compounds the throttle), and schema-drift (malformed server response).
// Up to 2 retries (3 total attempts) for transient errors.
export function shouldRetryLeadDetail(failureCount: number, err: unknown): boolean {
  return (
    !(err instanceof AccountDeletedError) &&
    !(err instanceof RateLimitError) &&
    !(err instanceof ApiError && (err.status === 400 || err.status === 404)) &&
    !(err instanceof LeadDetailSchemaError) &&
    failureCount < 3
  );
}

/**
 * Fetch a single lead by id (`${permit_num}--${revision_num}` for permits,
 * `COA-${application_number}` for CoA leads — the latter currently 404s).
 * Gated on `id` presence + `idToken` per Spec 99 §B4.
 *
 * @param id `${permit_num}--${revision_num}` from the deep-link / route param.
 * @param options `enabled` — caller's gating signal.
 */
export function useLeadDetail(
  id: string | undefined,
  options?: { enabled?: boolean },
) {
  const idToken = useAuthStore((s) => s.idToken);
  return useQuery({
    queryKey: ['lead-detail', id],
    queryFn: () => fetchLeadDetail(id!),
    staleTime: 60_000,
    enabled: !!id && !!idToken && (options?.enabled ?? true),
    retry: shouldRetryLeadDetail,
  });
}
