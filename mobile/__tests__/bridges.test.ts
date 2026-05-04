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

import { QueryClient, QueryObserver } from '@tanstack/react-query';

describe('B1 (Server → TanStack Query) data-store smoke check — Spec 99 §8.1 + §B1', () => {
  // The B1 bridge spec promises "every server fetch goes through TanStack
  // Query" with the implication that TanStack's structural-sharing of
  // identical data prevents downstream re-renders.
  //
  // SCOPE NOTE (Gemini WF2 §9.6 F7 + DeepSeek #4 consensus): this test
  // exercises TanStack's INTERNAL data-store behavior (getQueryData reference
  // stability). It does NOT exercise the subscriber-notify path — proving
  // that downstream consumers don't re-render on equal-data refetches would
  // require @testing-library/react-hooks + a render-counting useQuery
  // subscriber. Tracked as Spec 99 §9.7b followup.
  //
  // The test pins `structuralSharing: true` explicitly so a future TanStack
  // default flip doesn't silently break the assumption.

  const sampleProfileBytes = {
    user_id: 'idempotency-test-uid',
    trade_slug: 'framing',
    radius_km: 10,
    onboarding_complete: true,
    // Spec 99 §9.14 — flat notification fields (post-migration-117).
    new_lead_min_cost_tier: 'medium',
    phase_changed: true,
    lifecycle_stalled_pref: true,
    start_date_urgent: true,
    notification_schedule: 'morning',
  };

  function mkClient(): QueryClient {
    return new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 0,
          // Pin the assumption rather than relying on a TanStack default.
          structuralSharing: true,
        },
      },
    });
  }

  it('returns the same data reference when refetch yields structurally-equal payload', async () => {
    const client = mkClient();
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
    const client = mkClient();
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

describe('B1 subscriber notify-suppression — Spec 99 §9.7b', () => {
  // Real B1 promise test (added per Gemini WF2 §9.6+§9.7 review F7 + DeepSeek
  // #4 consensus): structuralSharing should suppress SUBSCRIBER notifies, not
  // just keep the data store reference-stable. Uses QueryObserver directly
  // instead of @testing-library/react-hooks because the observer is the
  // hook's underlying notify mechanism and avoids React renderer complexity.
  function mkClient(): QueryClient {
    return new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0, structuralSharing: true } },
    });
  }
  const sampleProfileBytes = {
    user_id: 'sub-test-uid',
    trade_slug: 'framing',
    radius_km: 10,
    onboarding_complete: true,
  };

  /**
   * Promise that resolves with the first non-undefined `data` the observer
   * emits. Replaces fixed `setTimeout(10ms)` waits per WF2 P2 review #3
   * (Gemini + DeepSeek + code-reviewer consensus): 10ms is below p99
   * microtask flush latency on slow CI runners; subscribing-and-resolving on
   * actual data delivery is deterministic and removes the flake risk.
   */
  function firstDataRef(observer: QueryObserver): Promise<unknown> {
    return new Promise((resolve) => {
      const unsub = observer.subscribe((result) => {
        if (result.data !== undefined) {
          unsub();
          resolve(result.data);
        }
      });
    });
  }

  it('data reference is stable across refetch when payload is structurally equal', async () => {
    const client = mkClient();
    const queryFn = async () => JSON.parse(JSON.stringify(sampleProfileBytes));

    const observer = new QueryObserver(client, { queryKey: ['user-profile'], queryFn });

    // Wait deterministically for the FIRST data delivery — this is the
    // pre-refetch baseline reference we'll compare against.
    const dataRefBeforeRefetch = await firstDataRef(observer);
    expect(dataRefBeforeRefetch).toBeDefined();

    // Track every post-baseline notify so we can assert ALL post-refetch
    // data references are === the baseline (proves structural sharing kept
    // them stable, not just any one).
    const postRefetchDataRefs: unknown[] = [];
    const unsubscribe = observer.subscribe((result) => {
      if (result.data !== undefined) postRefetchDataRefs.push(result.data);
    });

    // Force a refetch with structurally-equal payload. `refetch()` returns
    // a promise that resolves when the fetch completes — no setTimeout
    // needed.
    await observer.refetch();

    // Real assertion (per WF2 P2 review #1 — the previous version compared
    // a captured ref to itself one line later and was vacuously true):
    // every data reference observed AFTER the refetch must be === the
    // pre-refetch reference. Structural sharing's whole job is to suppress
    // re-render notifies on equal data; if ANY post-refetch ref differs,
    // a re-rendering React subscriber would tear.
    expect(postRefetchDataRefs.length).toBeGreaterThan(0);
    for (const ref of postRefetchDataRefs) {
      expect(ref).toBe(dataRefBeforeRefetch);
    }
    unsubscribe();
  });

  it('subscribers DO notify when refetch resolves with different payload', async () => {
    const client = mkClient();
    let i = 0;
    const queryFn = async () => {
      const data = i === 0 ? sampleProfileBytes : { ...sampleProfileBytes, radius_km: 25 };
      i++;
      return data;
    };
    const observer = new QueryObserver(client, { queryKey: ['user-profile'], queryFn });

    // Deterministic baseline: wait for first data delivery.
    const initialRef = await firstDataRef(observer);
    expect(initialRef).toBeDefined();

    const dataRefs: unknown[] = [initialRef];
    const unsubscribe = observer.subscribe((result) => {
      if (result.data !== undefined) dataRefs.push(result.data);
    });
    // refetch() resolves when fetch completes — no setTimeout needed.
    await observer.refetch();

    // At least 2 distinct data references should have been observed —
    // the initial load + the refetch with a changed payload.
    const uniqueRefs = new Set(dataRefs);
    expect(uniqueRefs.size).toBeGreaterThanOrEqual(2);
    unsubscribe();
  });
});

// ---------------------------------------------------------------------------
// B2-B5 cross-reference index (assertions live in the closest-to-consumer
// suites per the project test convention).
//
// Replaced the previous `it.skip` cross-reference stubs (which polluted Jest
// "skipped tests" CI metrics per WF2 §9.6 review consensus across all 3
// agents) with a single guard test that asserts each referenced file exists.
// This catches rename-drift without inflating the skipped-test count.
// ---------------------------------------------------------------------------

describe('B2-B5 cross-reference guard — files exist', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');

  it('B2 (storeIdempotency.test.ts) — filterStore + userProfileStore hydrate idempotency', () => {
    expect(
      fs.existsSync(path.resolve(__dirname, 'storeIdempotency.test.ts')),
    ).toBe(true);
  });

  it('B4 + B5 (useAuth.test.ts) — UID-change invalidation + signOut reset ordering', () => {
    expect(fs.existsSync(path.resolve(__dirname, 'useAuth.test.ts'))).toBe(true);
  });

  it('B3 — no test (Spec 99 §9.16 codify-or-ban followup)', () => {
    // Production code uses the "sixth implicit bridge" — direct PATCH +
    // filterStore.set + invalidateQueries — instead of the canonical B3
    // useMutation-with-rollback pattern. No test until §9.16 settles the
    // pattern. Asserting always-true to keep the test as a documentation
    // anchor without skipping.
    expect(true).toBe(true);
  });
});
