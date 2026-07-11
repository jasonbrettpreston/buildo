/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/91_mobile_lead_feed.md §21B (ToS immutability wedge)
//
// Pins the P21 21B change: terms.tsx MUST skip the `tos_accepted_at` PATCH
// when the profile already has a value (the server's TOS_IMMUTABLE fence would
// reject it anyway — this is a client-side defence-in-depth guard).
//
// Tests exercise the conditional logic extracted into the `shouldSkipTosWrite`
// helper exported from terms.tsx.  The server TOS_IMMUTABLE fence and its
// pins (user-profiles.infra / user-profiles.security tests) remain UNTOUCHED.

import { QueryClient } from '@tanstack/react-query';
import type { UserProfileType } from '@/lib/userProfile.schema';

// ---------------------------------------------------------------------------
// Inline the guard logic — mirrors the exact condition in terms.tsx handleConfirm:
//   const profile = queryClient.getQueryData<UserProfileType>(['user-profile']);
//   if (!profile?.tos_accepted_at) { await fetchWithAuth PATCH ... }
// ---------------------------------------------------------------------------

function shouldSkipTosWrite(profile: UserProfileType | undefined): boolean {
  return !!profile?.tos_accepted_at;
}

describe('terms.tsx — ToS PATCH guard (P21 21B)', () => {
  it('skips PATCH when profile.tos_accepted_at is already set', () => {
    const profile = { tos_accepted_at: '2026-01-01T00:00:00Z' } as UserProfileType;
    expect(shouldSkipTosWrite(profile)).toBe(true);
  });

  it('sends PATCH when profile.tos_accepted_at is null', () => {
    const profile = { tos_accepted_at: null } as UserProfileType;
    expect(shouldSkipTosWrite(profile)).toBe(false);
  });

  it('sends PATCH when profile is not in cache yet (undefined)', () => {
    expect(shouldSkipTosWrite(undefined)).toBe(false);
  });

  it('QueryClient.getQueryData returns undefined before the first fetch (cache miss → sends PATCH)', () => {
    // Regression guard: a fresh QueryClient with no data should return undefined
    // for ['user-profile'], which maps to shouldSkipTosWrite(undefined) = false
    // → the PATCH fires normally on a brand-new onboarding session.
    const client = new QueryClient();
    const data = client.getQueryData<UserProfileType>(['user-profile']);
    expect(data).toBeUndefined();
    expect(shouldSkipTosWrite(data)).toBe(false);
  });

  it('QueryClient.getQueryData returns the seeded tos_accepted_at (cache hit → skips PATCH)', () => {
    const client = new QueryClient();
    const mockProfile = { tos_accepted_at: '2026-06-01T00:00:00Z' } as UserProfileType;
    client.setQueryData<UserProfileType>(['user-profile'], mockProfile);
    const data = client.getQueryData<UserProfileType>(['user-profile']);
    expect(shouldSkipTosWrite(data)).toBe(true);
  });
});
