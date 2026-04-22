// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §11 Phase 3 step 2
//
// ⚠️  FRONTEND-ONLY DISTANCE DELTA — DO NOT USE FOR DISPLAYED DISTANCES.
//
// Spec 75 and CLAUDE.md Backend Mode rule 9 forbid JS haversine in the
// permit distance pipeline — permit-to-user distance is computed in SQL
// via PostGIS `<->` KNN operator (geography cast, see migration 067).
// This helper exists for ONE purpose: the `useLeadFeed` hook's 2-layer
// location handling (spec 75 §11 Phase 3 step 2), which needs to detect
// when the user has moved far enough to warrant a cache invalidation.
//
// The decision to refetch is NOT the same as the decision to display
// a distance. Rounding a displayed distance would be wrong; rounding a
// "has the user moved" threshold is the whole point.
//
// If you find yourself wanting to import this elsewhere: STOP. Use the
// `distance_m` field returned by the feed API, which comes from PostGIS
// via the Phase 1 lib layer.

const EARTH_RADIUS_M = 6_371_000;

/**
 * Great-circle distance in metres between two lat/lng pairs.
 * Pure function; deterministic; no trig library dependency.
 *
 * Accuracy: ~0.5% worst case across the Toronto metro area. Good
 * enough for the 500m cache-invalidation threshold.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}
