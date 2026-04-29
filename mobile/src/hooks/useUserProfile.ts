// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §9 Step 7
// TanStack Query hook that fetches the user profile on app launch.
// On success: hydrates both filterStore (feed-scoped fields) and
// userProfileStore (account-level fields).
// Fast-path: reads MMKV cache synchronously on mount so the feed is
// queryable before the network round-trip completes.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import * as Sentry from '@sentry/react-native';
import { createMMKV } from 'react-native-mmkv';
import { fetchWithAuth, AccountDeletedError, ApiError } from '@/lib/apiClient';
import { UserProfileSchema, type UserProfileType } from '@/lib/userProfile.schema';
import { useFilterStore } from '@/store/filterStore';
import { useUserProfileStore } from '@/store/userProfileStore';
import { useOnboardingStore } from '@/store/onboardingStore';

const profileStorage = createMMKV({ id: 'user-profile-cache' });

function readCachedProfile(): UserProfileType | null {
  try {
    const raw = profileStorage.getString('profile');
    if (!raw) return null;
    const parsed = UserProfileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: UserProfileType): void {
  try {
    profileStorage.set('profile', JSON.stringify(profile));
  } catch {
    /* best-effort */
  }
}

export function clearUserProfileCache(): void {
  try {
    profileStorage.remove('profile');
  } catch {
    /* best-effort */
  }
}

async function fetchProfile(): Promise<UserProfileType> {
  const raw = await fetchWithAuth<{ data: unknown }>('/api/user-profile');
  const parsed = UserProfileSchema.safeParse(raw.data);
  if (!parsed.success) {
    Sentry.captureException(parsed.error, { extra: { context: 'useUserProfile Zod parse' } });
    // Fall back to MMKV cache on parse failure
    const cached = readCachedProfile();
    if (cached) return cached;
    throw new Error('Profile parse failed and no cache available');
  }
  writeCachedProfile(parsed.data);
  return parsed.data;
}

export function useUserProfile(options?: { enabled?: boolean }) {
  const hydrateFilter = useFilterStore((s) => s.hydrate);
  const hydrateUserProfile = useUserProfileStore((s) => s.hydrate);

  // Computed once at hook call time — MMKV read is cheap but not render-safe
  const hasCachedDataRef = useRef<boolean>(readCachedProfile() !== null);

  // Fast-path: synchronously hydrate BOTH stores from MMKV before the query resolves.
  // This collapses skeleton loading time to <300ms on repeat launches.
  useEffect(() => {
    const cached = readCachedProfile();
    if (cached) {
      hydrateFilter(cached);
      hydrateUserProfile(cached);
    }
    // Intentionally run on mount only — stable store refs, MMKV is synchronous
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const query = useQuery({
    queryKey: ['user-profile'],
    queryFn: fetchProfile,
    staleTime: 300_000,
    enabled: options?.enabled ?? true,
    // No retry for deterministic states: 403 (deleted account) and 404 (new user).
    retry: (count, err) =>
      !(err instanceof AccountDeletedError) &&
      !(err instanceof ApiError && err.status === 404) &&
      count < 3,
  });

  useEffect(() => {
    if (query.data) {
      hydrateFilter(query.data);
      hydrateUserProfile(query.data);
      // Keep onboardingStore.isComplete in sync with server truth.
      // Do NOT remove: (onboarding)/_layout.tsx and IncompleteBanner.tsx both
      // read isComplete for routing/display. Removing this bridge would break
      // the onboarding-complete guard and banner on new-device reinstall.
      // Full removal requires migrating those consumers to read server state
      // directly (tracked in review_followups.md — DEFER 2).
      if (query.data.onboarding_complete && !useOnboardingStore.getState().isComplete) {
        useOnboardingStore.getState().markComplete();
      }
    }
  }, [query.data, hydrateFilter, hydrateUserProfile]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    hasCachedData: hasCachedDataRef.current,
  };
}
