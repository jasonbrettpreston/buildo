/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §4 (B1-B5 bridge patterns)
//             + §8.1 (idempotency mandate) + §9.7
//
// Bridge idempotency tests per Spec 99 §8.1: "Each bridge in §4 MUST have a
// Jest test asserting that calling it twice with identical input produces
// zero observable mutations on the second call."
//
// This file is the §9.7 INDEX. It contains the B1 test directly + comment
// pointers to the other bridge tests (which already exist in the suites
// closest to their consumer code per the project test convention).
//
// ---------------------------------------------------------------------------
// Bridge coverage map (per Spec 99 §4)
// ---------------------------------------------------------------------------
// B1 (Server → TanStack Query):  this file (TanStack structuralSharing test)
// B2 (TanStack → Zustand hydrate): mobile/__tests__/storeIdempotency.test.ts
//                                  (10 cases — filterStore + userProfileStore)
// B3 (Zustand → Server mutation):  NO TEST — pattern is not yet implemented
//                                  in production code; tracked as Spec §9.16
// B4 (Auth listener → cache invalidation):
//                                  mobile/__tests__/useAuth.test.ts
//                                  (3 cases — cold-boot, token refresh, UID change)
// B5 (Sign-out reset fan-out):    mobile/__tests__/useAuth.test.ts
//                                  (6 cases — order, identity reset, store resets)
// ---------------------------------------------------------------------------

import { QueryClient } from '@tanstack/react-query';

describe('B1 (Server → TanStack Query) idempotency — Spec 99 §8.1 + §B1', () => {
  // The B1 bridge spec promises "every server fetch goes through TanStack
  // Query" with the implication that TanStack's structural-sharing of
  // identical data prevents downstream re-renders. This test verifies the
  // promise: when fetchProfile resolves with structurally-identical data on
  // consecutive calls, query.data stays REFERENCE-stable (no observable
  // change to subscribers, no notify).

  const sampleProfileBytes = {
    user_id: 'idempotency-test-uid',
    trade_slug: 'framing',
    radius_km: 10,
    onboarding_complete: true,
    notification_prefs: {
      new_lead_min_cost_tier: 'medium',
      phase_changed: true,
      lifecycle_stalled: true,
      start_date_urgent: true,
      notification_schedule: 'morning',
    },
  };

  it('returns the same data reference when refetch yields structurally-equal payload', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    });
    let callCount = 0;
    const queryFn = async () => {
      callCount++;
      // Each call returns a FRESH object literal with identical content.
      // Without structural sharing, query.data would be a new reference each time.
      return JSON.parse(JSON.stringify(sampleProfileBytes));
    };
    // First fetch.
    await client.prefetchQuery({ queryKey: ['user-profile'], queryFn });
    const firstData = client.getQueryData(['user-profile']);
    // Second fetch via refetch (forced).
    await client.refetchQueries({ queryKey: ['user-profile'] });
    const secondData = client.getQueryData(['user-profile']);
    expect(callCount).toBe(2);
    // Reference stability: TanStack's structural sharing keeps the SAME
    // reference when content is structurally equal.
    expect(secondData).toBe(firstData);
  });

  it('returns a NEW data reference when refetch yields different payload', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    });
    const responses: Array<typeof sampleProfileBytes> = [
      sampleProfileBytes,
      { ...sampleProfileBytes, radius_km: 25 }, // changed
    ];
    let i = 0;
    const queryFn = async () => responses[i++];
    await client.prefetchQuery({ queryKey: ['user-profile'], queryFn });
    const firstData = client.getQueryData(['user-profile']);
    await client.refetchQueries({ queryKey: ['user-profile'] });
    const secondData = client.getQueryData(['user-profile']);
    // Different content → different reference (genuine update, subscribers notify).
    expect(secondData).not.toBe(firstData);
    expect((secondData as { radius_km: number }).radius_km).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// B2-B5 cross-references (no new tests here — pointing to existing suites)
// ---------------------------------------------------------------------------

describe('B2-B5 idempotency — see existing suites', () => {
  it.skip('B2 idempotency: filterStore.hydrate + userProfileStore.hydrate (see storeIdempotency.test.ts)', () => {
    // Intentionally skipped here — assertions live in
    // mobile/__tests__/storeIdempotency.test.ts (10 cases). This skip exists
    // so a developer searching for "B2 idempotency" finds the pointer.
  });

  it.skip('B4 idempotency: UID-change cache invalidation fires once per uid (see useAuth.test.ts)', () => {
    // See `describe('initFirebaseAuthListener') > 'invalidates user-profile
    // query on first listener fire (cold boot)'` and the same-uid + uid-change
    // sibling tests in mobile/__tests__/useAuth.test.ts.
  });

  it.skip('B5 idempotency: signOut order + reset coverage (see useAuth.test.ts)', () => {
    // See `describe('authStore.signOut')` block in mobile/__tests__/useAuth.test.ts
    // — 6 cases covering ordering vs filterReset, identity reset, paywall clear, etc.
  });

  it.skip('B3 idempotency: NO TEST — pattern not yet implemented (Spec 99 §9.16 followup)', () => {
    // Production code uses the "sixth implicit bridge" — direct PATCH +
    // filterStore.set + invalidateQueries — instead of the canonical B3
    // useMutation-with-rollback pattern. Spec §9.16 tracks codify-or-ban.
    // No test until the pattern is settled.
  });
});
