// SPEC LINK: docs/specs/03-mobile/99_mobile_state_architecture.md §4 B1 (query keys)
//            docs/specs/03-mobile/90_mobile_engineering_protocol.md §13 (Zod boundary)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (LIST archetype)
//            Surface S-072 `mobile_tracked_lots` · contract C-039 `contract_parcels_tracked`
//
// TanStack Query hooks for Tracked Lots. Query key `['parcel-tracked']` (Spec 99 §4).
//
// TODO(contract): `/api/parcels/tracked` DOES NOT EXIST YET.
// Neither does the `user_tracked_lots` table it reads. Both are declared in the contract
// descriptor C-039 (`scripts/surfaces/parcel_product/F17/contracts/`) and filed as the Backend
// follow-up — this is the Admin domain and migrations belong to another committer.
//
// So this hook is a FIXTURE-BACKED STUB. It is deliberately shaped so that switching it on is a
// one-function change:
//   * the exported types ARE the contract's declared projection
//   * `TrackedLotsResultSchema` is the boundary parse the real fetch will use, and the fixtures
//     are parsed through it, so a fixture that drifts from the contract fails here first
//   * `isStub` is returned and the screen SHOWS it, so nobody mistakes preview rows for their
//     own tracked lots
//
// It must NOT reuse the lead-gen save machinery (`useSaveLead`, `admin_watchlist`,
// `/api/leads/save`): MaxBLD is its own product and that coupling is exactly what OD5 forbids.

import { useCallback, useMemo } from 'react';
import { z } from 'zod';
import type { TrackedLot } from '@/lib/trackedLots';

/**
 * The contract's projection, as a boundary schema. `.strict()` on the row for the same reason the
 * parcel lookup is strict: an unlisted key is a break, not an extension.
 */
export const TrackedLotSchema = z
  .object({
    parcelId: z.string(),
    address: z.string(),
    maxBuildGfaSqm: z.number().nullable(),
    maxCoaBuildGfaSqm: z.number().nullable(),
    // DERIVED, no backing column today — nullable ON PURPOSE. See mobile/src/lib/trackedLots.ts.
    newNearbyCoaRuling: z.boolean().nullable(),
    jurisdiction: z.string(),
    trackedAt: z.string(),
  })
  .strict();

export const TrackedLotsResultSchema = z
  .object({ lots: z.array(TrackedLotSchema) })
  .strict();

export type TrackedLotsResult = z.infer<typeof TrackedLotsResultSchema>;

/**
 * Preview rows. Chosen to exercise every render branch the screen has, including the one that
 * matters most: a lot whose `newNearbyCoaRuling` is UNKNOWN renders "—", never "NO".
 */
const STUB_FIXTURE: TrackedLotsResult = {
  lots: [
    {
      parcelId: 'PREVIEW-1',
      address: '26 Hurlingham Cres',
      maxBuildGfaSqm: 412,
      maxCoaBuildGfaSqm: 631,
      newNearbyCoaRuling: true,
      jurisdiction: 'TORONTO, ON',
      trackedAt: '2026-09-14T15:04:00.000Z',
    },
    {
      parcelId: 'PREVIEW-2',
      address: '18 Wanless Ave',
      maxBuildGfaSqm: 288,
      maxCoaBuildGfaSqm: 402,
      newNearbyCoaRuling: false,
      jurisdiction: 'TORONTO, ON',
      trackedAt: '2026-09-12T11:20:00.000Z',
    },
    {
      parcelId: 'PREVIEW-3',
      address: '91 Glenforest Rd',
      maxBuildGfaSqm: null,
      // Both the envelope and the ruling are unresolved for this lot — the "—" path.
      maxCoaBuildGfaSqm: null,
      newNearbyCoaRuling: null,
      jurisdiction: 'TORONTO, ON',
      trackedAt: '2026-09-09T08:41:00.000Z',
    },
  ],
};

export type UseTrackedLotsResult = {
  data: TrackedLotsResult | undefined;
  isLoading: boolean;
  error: Error | null;
  /** TRUE while the route does not exist. The screen renders a visible notice when set. */
  isStub: boolean;
};

/**
 * Read the signed-in user's tracked lots.
 *
 * TODO(contract): replace the fixture with
 *   `const raw = await fetchWithAuth<{ data: unknown }>('/api/parcels/tracked')`
 * parsed through `TrackedLotsResultSchema`, wrapped in `useQuery({ queryKey: ['parcel-tracked'] })`
 * with the `shouldRetryParcelLookup` retry policy. Nothing else in this module changes.
 */
export function useTrackedLots(): UseTrackedLotsResult {
  const data = useMemo(() => {
    // Parsed rather than returned raw: the fixtures are held to the same boundary contract as the
    // server will be, so they cannot quietly drift from the declared projection.
    const parsed = TrackedLotsResultSchema.safeParse(STUB_FIXTURE);
    return parsed.success ? parsed.data : { lots: [] };
  }, []);

  return { data, isLoading: false, error: null, isStub: true };
}

export type UseUntrackLotResult = {
  untrack: (parcelId: string) => Promise<void>;
  isStub: boolean;
};

/**
 * Stop tracking a lot.
 *
 * TODO(contract): `DELETE /api/parcels/tracked?parcelId=…`, then invalidate ['parcel-tracked'].
 * Until the route exists this resolves without writing anything — the screen's optimistic removal
 * and its undo are already correct, so wiring the call is the only remaining step.
 */
export function useUntrackLot(): UseUntrackLotResult {
  const untrack = useCallback(async (_parcelId: string): Promise<void> => {
    // Intentionally a no-op while the route does not exist. Not swallowing an error: there is no
    // request to make yet, and pretending to have made one would be the fake.
    return Promise.resolve();
  }, []);
  return { untrack, isStub: true };
}

export type { TrackedLot };
