// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11 Phase 1
//
// Distance helpers for the lead feed. Actual distance math happens in SQL
// via PostGIS `ST_Distance` / `<->` KNN operator — these helpers exist only
// for unit conversion and display formatting. There is NO JS haversine in
// this codebase (spec 75 forbids it).

/** Default radius if the client doesn't specify one. Spec 70 §API Endpoints. */
export const DEFAULT_RADIUS_KM = 10;

/** Hard cap enforced by Zod on `/api/leads/feed` params — prevents DoS via massive spatial scans. Spec 70 §API Endpoints. */
export const MAX_RADIUS_KM = 50;

export function metersFromKilometers(km: number): number {
  return km * 1000;
}

export function kilometersFromMeters(meters: number): number {
  return meters / 1000;
}

/**
 * Format a distance for display on a lead card.
 *   0         → "0m"
 *   <1000m    → "450m"
 *   1000-9999 → "1.0km" / "9.9km" (one decimal)
 *   ≥10000    → "10km" / "50km" (whole kilometers)
 */
export function formatDistanceForDisplay(meters: number): string {
  // Defensive: reject non-finite and negative inputs. Returns a neutral
  // placeholder rather than "-500m" or "NaNkm" which would leak to the UI.
  if (!Number.isFinite(meters) || meters < 0) return '—';
  // Floor sub-kilometer values so 999.9 → "999m" not "1000m" (which would
  // shadow the 1.0km format for the very next input).
  if (meters < 1000) return `${Math.floor(meters)}m`;
  const km = meters / 1000;
  if (km >= 10) return `${Math.round(km)}km`;
  return `${km.toFixed(1)}km`;
}
