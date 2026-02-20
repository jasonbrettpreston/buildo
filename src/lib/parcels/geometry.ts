import type { LotDimensions } from './types';

export const SQM_TO_SQFT = 10.7639;
export const M_TO_FT = 3.28084;

/**
 * Parse a STATEDAREA string like "17366.998291 sq.m" into square meters.
 * Returns null if unparseable.
 */
export function parseStatedArea(raw: string | null | undefined): number | null {
  if (!raw || !raw.trim()) return null;

  const match = raw.trim().match(/^([\d.]+)\s*sq\.m/i);
  if (!match) return null;

  const value = parseFloat(match[1]);
  if (isNaN(value) || value <= 0) return null;

  return value;
}

/**
 * Convert square meters to square feet.
 */
export function sqmToSqft(sqm: number): number {
  return sqm * SQM_TO_SQFT;
}

/**
 * Convert meters to feet.
 */
export function mToFt(m: number): number {
  return m * M_TO_FT;
}

/**
 * Haversine distance between two [lng, lat] points in meters.
 */
function haversineDistance(
  p1: [number, number],
  p2: [number, number]
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const lat1 = toRad(p1[1]);
  const lat2 = toRad(p2[1]);
  const dLat = toRad(p2[1] - p1[1]);
  const dLng = toRad(p2[0] - p1[0]);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Extract the outer ring coordinates from a GeoJSON geometry.
 * Supports Polygon and MultiPolygon (uses first polygon).
 */
function extractRing(
  geometry: Record<string, unknown>
): [number, number][] | null {
  if (!geometry || !geometry.type || !geometry.coordinates) return null;

  const type = geometry.type as string;
  const coords = geometry.coordinates as unknown;

  if (type === 'Polygon') {
    const rings = coords as [number, number][][];
    return rings[0] || null;
  }

  if (type === 'MultiPolygon') {
    const polys = coords as [number, number][][][];
    return polys[0]?.[0] || null;
  }

  return null;
}

/**
 * Compute the minimum bounding rectangle of a set of 2D points using
 * rotating calipers on the convex hull edges.
 *
 * Returns {width, height} in meters where width <= height.
 * The shorter side is taken as frontage, the longer as depth.
 */
function minimumBoundingRect(
  ring: [number, number][]
): { width: number; height: number } | null {
  if (!ring || ring.length < 4) return null; // need at least 3 unique points + closing

  // Use a simplified approach: project to local meters, then compute MBR
  // Centroid for local projection
  let cLat = 0;
  let cLng = 0;
  const n = ring.length - 1; // exclude closing point
  for (let i = 0; i < n; i++) {
    cLng += ring[i][0];
    cLat += ring[i][1];
  }
  cLat /= n;
  cLng /= n;

  // Project to local XY in meters (equirectangular approximation)
  const cosLat = Math.cos((cLat * Math.PI) / 180);
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * cosLat;

  const points: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    points.push([
      (ring[i][0] - cLng) * mPerDegLng,
      (ring[i][1] - cLat) * mPerDegLat,
    ]);
  }

  // Rotating calipers: try each edge angle
  let minArea = Infinity;
  let bestW = 0;
  let bestH = 0;

  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const dx = points[j][0] - points[i][0];
    const dy = points[j][1] - points[i][1];
    const angle = Math.atan2(dy, dx);
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const [px, py] of points) {
      const rx = px * cos - py * sin;
      const ry = px * sin + py * cos;
      if (rx < minX) minX = rx;
      if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry;
      if (ry > maxY) maxY = ry;
    }

    const w = maxX - minX;
    const h = maxY - minY;
    const area = w * h;
    if (area < minArea) {
      minArea = area;
      bestW = Math.min(w, h);
      bestH = Math.max(w, h);
    }
  }

  if (bestW <= 0 || bestH <= 0) return null;

  return { width: bestW, height: bestH };
}

/**
 * Estimate lot frontage and depth from a GeoJSON polygon geometry.
 *
 * Uses the minimum bounding rectangle: shorter side = frontage, longer = depth.
 * Returns null if geometry is invalid or too small.
 */
export function estimateLotDimensions(
  geometry: Record<string, unknown> | null | undefined
): LotDimensions | null {
  if (!geometry) return null;

  const ring = extractRing(geometry);
  if (!ring) return null;

  const mbr = minimumBoundingRect(ring);
  if (!mbr) return null;

  // Sanity check: reject unreasonably small lots (< 1m either dimension)
  if (mbr.width < 1 || mbr.height < 1) return null;

  return {
    frontage_m: Math.round(mbr.width * 100) / 100,
    depth_m: Math.round(mbr.height * 100) / 100,
  };
}
