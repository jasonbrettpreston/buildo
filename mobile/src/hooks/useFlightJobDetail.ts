// SPEC LINK: docs/specs/03-mobile/77_mobile_crm_flight_board.md §3.3.1 (API contract)
//             docs/specs/03-mobile/99_mobile_state_architecture.md §B1 (Server → TanStack Query)
//             docs/specs/03-mobile/90_mobile_engineering_protocol.md §11 (Bearer auth)
//
// Cold-boot fallback for /(app)/[flight-job] when push-notification deep-link
// opens the screen with an empty `useFlightBoard()` cache. Calls
// `GET /api/leads/flight-board/detail/:id` per Spec 77 §3.3.1 contract.
//
// Authorization is implicit in the SQL — endpoint returns 404 when the user
// does not have the permit saved (lead_views.user_id = ctx.uid AND saved =
// true AND lead_type = 'permit'). No mobile-side auth check needed.

import { useQuery } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import { fetchWithAuth } from '@/lib/apiClient';
import { AccountDeletedError, ApiError } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import { FlightBoardDetailSchema, type FlightBoardDetail } from '@/lib/schemas';

// Sentinel error for deterministic schema-drift failures — short-circuits the
// retry guard so a malformed server response doesn't generate 3× duplicate
// Sentry events per cold boot. Mirrors `useUserProfile.ts:ProfileSchemaError`.
export class FlightJobDetailSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlightJobDetailSchemaError';
  }
}

export async function fetchFlightJobDetail(id: string): Promise<FlightBoardDetail> {
  const raw = await fetchWithAuth<{ data: unknown }>(
    `/api/leads/flight-board/detail/${encodeURIComponent(id)}`,
  );
  const parsed = FlightBoardDetailSchema.safeParse(raw.data);
  if (!parsed.success) {
    Sentry.captureException(parsed.error, {
      extra: { context: 'useFlightJobDetail Zod parse', id },
    });
    throw new FlightJobDetailSchemaError(
      'FlightBoardDetail response failed schema validation',
    );
  }
  return parsed.data;
}

/**
 * Fetch a single flight-board permit by id when the list cache is empty
 * (cold-boot deep-link case). Gated on `id` presence + `idToken` per Spec 99
 * §B4 + WF3 M1+M2+M3 #4 (idToken gate avoids cold-boot 401 round-trip when
 * authStore rehydrates `user.uid` without `idToken`).
 *
 * @param id `${permit_num}--${revision_num}` from the deep-link route.
 * @param options `enabled` — caller's gating signal (e.g. only enable when
 *   the list cache resolved without a hit).
 */
// Skip retries for deterministic states: 400 (malformed id), 404 (not on
// user's saved board — natural WHERE filter), 403 (deleted account),
// schema-drift (malformed server response). Exported for unit testing.
export function shouldRetryFlightJobDetail(count: number, err: unknown): boolean {
  return (
    !(err instanceof AccountDeletedError) &&
    !(err instanceof ApiError && (err.status === 400 || err.status === 404)) &&
    !(err instanceof FlightJobDetailSchemaError) &&
    count < 3
  );
}

export function useFlightJobDetail(
  id: string | undefined,
  options?: { enabled?: boolean },
) {
  const idToken = useAuthStore((s) => s.idToken);
  return useQuery({
    queryKey: ['flight-job-detail', id],
    queryFn: () => fetchFlightJobDetail(id!),
    staleTime: 60_000,
    enabled: !!id && !!idToken && (options?.enabled ?? true),
    retry: shouldRetryFlightJobDetail,
  });
}
