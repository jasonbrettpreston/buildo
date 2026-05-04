// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §4.B3 + §9.16
//
// Bridge B3 mutation hook for server-canonical filterStore fields. Spec 99
// §3.1 marks `radius_km` (and `location_mode`, `home_base_lat/lng`,
// `supplier_selection`, `default_tab`) as Server-owned with filterStore as
// the local mirror — every change MUST round-trip through `/api/user-profile`
// PATCH per the §4.B3 contract:
//
//   1. Cancel in-flight `['user-profile']` queries so they cannot overwrite
//      the optimistic local set with stale data while the PATCH is in flight.
//   2. Snapshot the previous local value, apply the optimistic local set
//      through filterStore's canonical setter (per §3.1 ownership matrix).
//   3. On PATCH rejection, roll back to the snapshot via the same setter.
//   4. On settle (success or fail), invalidate `['user-profile']` so the
//      next render reads server truth.
//
// §9.16 (2026-05-04) closed the gap where 4 call sites — LeadFilterSheet,
// settings.tsx slider, and the (app)/index.tsx widen-radius shortcuts —
// previously called `setRadiusKm` ALONE with no PATCH. radius changes were
// lost on cold boot and silently drifted on shared devices.
//
// Designed to extend: future server-canonical filterStore fields can be
// added to `ProfilePatch` and to the `onMutate` snapshot/apply branch
// without changing the call sites' invocation shape.
import { useMutation, useQueryClient, type QueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/apiClient';
import { useFilterStore } from '@/store/filterStore';

export interface ProfilePatch {
  radius_km?: number;
}

export interface OptimisticContext {
  prevRadiusKm: number | undefined;
}

/**
 * Pure options-builder for the B3 profile-PATCH mutation. Extracted from the
 * hook so `mobile/__tests__/usePatchProfile.test.ts` can construct a
 * `MutationObserver` directly against a fresh `QueryClient` without spinning
 * up a React renderer. Production code MUST call `usePatchProfile()` (the
 * hook below) — this builder is only exported for tests.
 */
export function buildPatchProfileOptions(
  queryClient: QueryClient,
): UseMutationOptions<unknown, Error, ProfilePatch, OptimisticContext> {
  return {
    mutationFn: (patch: ProfilePatch) =>
      fetchWithAuth('/api/user-profile', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),

    onMutate: async (patch) => {
      // Step 1: cancel in-flight refetches.
      await queryClient.cancelQueries({ queryKey: ['user-profile'] });

      // Step 2: snapshot + optimistic apply via the canonical setter.
      const prevRadiusKm =
        patch.radius_km !== undefined ? useFilterStore.getState().radiusKm : undefined;
      if (patch.radius_km !== undefined) {
        useFilterStore.getState().setRadiusKm(patch.radius_km);
      }

      return { prevRadiusKm };
    },

    onError: (_err, _patch, context) => {
      // Step 3: rollback. Only restore fields that we snapshotted; an
      // undefined snapshot means the corresponding patch field was not
      // sent and must not be touched.
      if (context?.prevRadiusKm !== undefined) {
        useFilterStore.getState().setRadiusKm(context.prevRadiusKm);
      }
    },

    onSettled: () => {
      // Step 4: invalidate so the next render reads server truth. Server
      // also applies the admin `radius_cap_km` cap, so this also corrects
      // any client-side over-cap value the optimistic step may have set.
      void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    },
  };
}

export function usePatchProfile() {
  const queryClient = useQueryClient();
  return useMutation(buildPatchProfileOptions(queryClient));
}
