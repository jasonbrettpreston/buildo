// SPEC LINK: docs/specs/03-mobile/94_mobile_onboarding.md §8, §10 Step 2
// Toronto address validation and coordinate snapping utilities.
// Shared by address.tsx and any other screen that captures a home-base location.

export const TORONTO_BOUNDS = {
  latMin: 43.58,
  latMax: 43.86,
  lngMin: -79.64,
  lngMax: -79.12,
} as const;

// 5 representative Toronto neighbourhood centroids for out-of-bounds suggestions.
const TORONTO_CENTROIDS: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Downtown Toronto', lat: 43.6532, lng: -79.3832 },
  { name: 'North York', lat: 43.7615, lng: -79.4111 },
  { name: 'Scarborough', lat: 43.7731, lng: -79.2576 },
  { name: 'Etobicoke', lat: 43.6435, lng: -79.5652 },
  { name: 'East York', lat: 43.6878, lng: -79.3163 },
];

export function isInsideToronto(lat: number, lng: number): boolean {
  return (
    lat >= TORONTO_BOUNDS.latMin &&
    lat <= TORONTO_BOUNDS.latMax &&
    lng >= TORONTO_BOUNDS.lngMin &&
    lng <= TORONTO_BOUNDS.lngMax
  );
}

export function snapToGrid(
  lat: number,
  lng: number,
  gridMeters = 500,
): { lat: number; lng: number } {
  // 1 degree latitude ≈ 111,320m. snap in degree-space; error < 5m across GTA.
  const degPerMeter = 1 / 111_320;
  const snap = gridMeters * degPerMeter;
  const snappedLat = Math.round(lat / snap) * snap;
  const snappedLng = Math.round(lng / snap) * snap;

  // Post-snap re-validation: if snapping pushed the coord outside Toronto bounds
  // (edge case near the boundary), fall back to the pre-snap validated coordinate.
  if (!isInsideToronto(snappedLat, snappedLng)) {
    return { lat, lng };
  }
  return { lat: snappedLat, lng: snappedLng };
}

export function getNearestTorontoCentroid(
  lat: number,
  lng: number,
): { name: string; lat: number; lng: number } {
  // Euclidean distance in degree-space — sufficient precision for Toronto.
  let nearest = TORONTO_CENTROIDS[0];
  let minDist = Infinity;
  for (const centroid of TORONTO_CENTROIDS) {
    const d =
      (centroid.lat - lat) * (centroid.lat - lat) +
      (centroid.lng - lng) * (centroid.lng - lng);
    if (d < minDist) {
      minDist = d;
      nearest = centroid;
    }
  }
  return nearest;
}
