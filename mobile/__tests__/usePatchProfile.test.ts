/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §4.B3 + §9.16
//
// Lifecycle tests for the B3 mutation hook `usePatchProfile`. Tests run
// against `MutationObserver` directly (no React renderer) by passing the
// pure options-builder `buildPatchProfileOptions` a fresh `QueryClient`.
//
// The 4 contract obligations from Spec 99 §4.B3:
//  (1) Optimistic local set fires BEFORE the server PATCH completes.
//  (2) Rollback restores the snapshot on PATCH rejection.
//  (3) `onSettled` invalidates `['user-profile']` after success or fail.
//  (4) `onMutate` cancels in-flight `['user-profile']` queries so a
//      concurrent refetch cannot overwrite the optimistic local set with
//      stale data.

// Mock fetchWithAuth BEFORE importing the hook so jest's hoisting picks
// up the inline jest.fn() (avoids the closure-capture pitfall flagged in
// past adversarial reviews).
jest.mock('@/lib/apiClient', () => ({
  fetchWithAuth: jest.fn(),
}));

// Mock react-native-mmkv so the filterStore module loads under jest-node.
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: () => null,
    set: () => undefined,
    remove: () => undefined,
  }),
}));

import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/apiClient';
import { useFilterStore } from '@/store/filterStore';
import { buildPatchProfileOptions, type ProfilePatch } from '@/hooks/usePatchProfile';

const mockFetch = fetchWithAuth as jest.MockedFunction<typeof fetchWithAuth>;

function mkClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
}

describe('usePatchProfile / buildPatchProfileOptions — Spec 99 §4.B3 + §9.16', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    useFilterStore.getState().reset();
    // Set a baseline radius the test can roll back to.
    useFilterStore.getState().setRadiusKm(15);
  });

  it('(1) optimistic local set fires before the server PATCH completes', async () => {
    let resolveFetch!: (value: unknown) => void;
    mockFetch.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const client = mkClient();
    const observer = new MutationObserver(client, buildPatchProfileOptions(client));

    const mutationPromise = observer.mutate({ radius_km: 35 } as ProfilePatch);
    // Flush microtasks so `onMutate` (which awaits `cancelQueries` and
    // then the snapshot+apply) completes before we check the optimistic
    // value. WF2 §9.16 review #1: multi-tick `Promise.resolve()` chain
    // instead of `setImmediate` — `setImmediate` runs in the Node "check"
    // phase (a macrotask), so it works today only because TanStack Query
    // v5's `MutationObserver.mutate` keeps `onMutate` in microtask scope.
    // A future TanStack scheduler change to a macrotask boundary would
    // make `setImmediate` race with `onMutate`. The microtask chain stays
    // correct as long as TanStack remains in microtask scope (the
    // weaker assumption).
    for (let i = 0; i < 5; i++) await Promise.resolve();

    // Local set already applied; PATCH still in flight.
    expect(useFilterStore.getState().radiusKm).toBe(35);

    resolveFetch({ ok: true });
    await mutationPromise;
  });

  it('(2) rollback restores the snapshot on PATCH rejection', async () => {
    mockFetch.mockRejectedValueOnce(new Error('500 Internal Server Error'));

    const client = mkClient();
    const observer = new MutationObserver(client, buildPatchProfileOptions(client));

    // mutate returns a promise that rejects on error — swallow it and
    // assert the post-rollback state.
    await observer.mutate({ radius_km: 50 } as ProfilePatch).catch(() => undefined);

    expect(useFilterStore.getState().radiusKm).toBe(15);
  });

  it('(3) onSettled invalidates the user-profile query (success path)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const client = mkClient();
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    const observer = new MutationObserver(client, buildPatchProfileOptions(client));

    await observer.mutate({ radius_km: 25 } as ProfilePatch);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['user-profile'] });
  });

  it('(3b) onSettled invalidates the user-profile query (error path too)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'));

    const client = mkClient();
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    const observer = new MutationObserver(client, buildPatchProfileOptions(client));

    await observer.mutate({ radius_km: 30 } as ProfilePatch).catch(() => undefined);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['user-profile'] });
  });

  it('(4) onMutate cancels in-flight user-profile queries', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const client = mkClient();
    const cancelSpy = jest.spyOn(client, 'cancelQueries');
    const observer = new MutationObserver(client, buildPatchProfileOptions(client));

    await observer.mutate({ radius_km: 40 } as ProfilePatch);

    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: ['user-profile'] });
  });

  it('does NOT touch radiusKm when the patch omits radius_km', async () => {
    // Snapshot comparison: an empty patch (no fields) must not cause a
    // local mutation OR a rollback. Pre-mutation radius is preserved.
    mockFetch.mockResolvedValueOnce({ ok: true });
    useFilterStore.getState().setRadiusKm(22);

    const client = mkClient();
    const observer = new MutationObserver(client, buildPatchProfileOptions(client));

    await observer.mutate({} as ProfilePatch);

    expect(useFilterStore.getState().radiusKm).toBe(22);
  });
});
