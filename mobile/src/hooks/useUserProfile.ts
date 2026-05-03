// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §9 Step 7
//             docs/specs/03-mobile/99_mobile_state_architecture.md §9.1 + §B1
// TanStack Query hook that fetches the user profile on app launch.
// On success: hydrates both filterStore (feed-scoped fields) and
// userProfileStore (account-level fields) per Spec 99 §B2.
//
// Persistence: handled exclusively by the TanStack Query persister
// (PersistQueryClientProvider in mobile/app/_layout.tsx, MMKV-backed via
// `mmkvPersister`). Spec 99 §9.1 removed the parallel hand-rolled
// `user-profile-cache` MMKV blob + its readCachedProfile/writeCachedProfile/
// clearUserProfileCache helpers — they were a duplicate persistence layer
// that pre-dated the TanStack persister wiring. Single canonical write path
// now: TanStack auto-persists query.data on mutation; queryClient.clear()
// in signOut (§9.10) purges both in-memory cache AND the persister blob.
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as Sentry from '@sentry/react-native';
import { fetchWithAuth, AccountDeletedError, ApiError } from '@/lib/apiClient';
import { UserProfileSchema, type UserProfileType } from '@/lib/userProfile.schema';
import { useFilterStore } from '@/store/filterStore';
import { useUserProfileStore } from '@/store/userProfileStore';
import { useDepsTracker } from '@/lib/debug/stateDebug';

// Spec 99 §B1 + WF3-§9.1 adversarial review F2 (DeepSeek + code-reviewer +
// Gemini consensus): a deterministic schema-drift error MUST short-circuit
// retries. Previously `throw new Error(...)` was retried 3× under the generic
// retry guard — wasting bandwidth and emitting 3 duplicate Sentry events per
// cold boot during a bad deploy. Sentinel class lets the retry guard skip it.
export class ProfileSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileSchemaError';
  }
}

async function fetchProfile(): Promise<UserProfileType> {
  const raw = await fetchWithAuth<{ data: unknown }>('/api/user-profile');
  const parsed = UserProfileSchema.safeParse(raw.data);
  if (!parsed.success) {
    Sentry.captureException(parsed.error, { extra: { context: 'useUserProfile Zod parse' } });
    // Throw to TanStack's error state — the persister keeps the previous
    // valid `query.data` accessible. Pre-§9.1, this fell back to a parallel
    // MMKV cache; that cache was redundant with the TanStack persister.
    throw new ProfileSchemaError('Profile response failed schema validation');
  }
  return parsed.data;
}

export function useUserProfile(options?: { enabled?: boolean }) {
  const hydrateFilter = useFilterStore((s) => s.hydrate);
  const hydrateUserProfile = useUserProfileStore((s) => s.hydrate);

  const query = useQuery({
    queryKey: ['user-profile'],
    queryFn: fetchProfile,
    staleTime: 300_000,
    enabled: options?.enabled ?? true,
    // No retry for deterministic states: 403 (deleted account), 404 (new user),
    // schema-drift parse failure (retrying won't fix server returning malformed
    // data — wastes bandwidth + emits duplicate Sentry events).
    retry: (count, err) =>
      !(err instanceof AccountDeletedError) &&
      !(err instanceof ApiError && err.status === 404) &&
      !(err instanceof ProfileSchemaError) &&
      count < 3,
  });

  useEffect(() => {
    if (query.data) {
      hydrateFilter(query.data);
      hydrateUserProfile(query.data);
      // Spec 99 §9.2b: the markComplete() bridge that previously kept
      // onboardingStore.isComplete in sync with server truth is REMOVED.
      // Server `profile.onboarding_complete` is now the SOLE source of truth
      // (Spec 99 §3.5). Consumers — IncompleteBanner (§9.2a), AuthGate (§5.3
      // Branch 5), getResumePath fallback — all read server state directly.
    }
  }, [query.data, hydrateFilter, hydrateUserProfile]);
  useDepsTracker('useUserProfile.hydrate', [query.data, hydrateFilter, hydrateUserProfile]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
  };
}
