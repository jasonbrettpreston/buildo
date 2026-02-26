import type { StructureType } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Average floor-to-floor height in metres for story estimation. */
export const STORY_HEIGHT_M = 3.0;

/** Below this area (sqm), accessory is classified as shed. */
export const SHED_THRESHOLD_SQM = 20;

/** 20–60 sqm accessory is classified as garage. */
export const GARAGE_MAX_SQM = 60;

export const SQM_TO_SQFT = 10.7639;
export const M_TO_FT = 3.28084;

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Estimate the number of stories from a building's max height.
 * Returns null for invalid or missing height values.
 */
export function estimateStories(maxHeightM: number | null | undefined): number | null {
  if (maxHeightM == null || maxHeightM <= 0) return null;
  return Math.max(1, Math.round(maxHeightM / STORY_HEIGHT_M));
}

/**
 * Classify a building structure based on its footprint area relative to
 * all other buildings on the same parcel.
 *
 * - The largest building is always classified as 'primary'.
 * - A solo building is always 'primary'.
 * - Accessory structures: <20 sqm = shed, 20–60 sqm = garage, else = other.
 */
export function classifyStructure(
  areaSqm: number,
  allAreas: number[]
): StructureType {
  if (allAreas.length <= 1) return 'primary';

  const maxArea = Math.max(...allAreas);
  if (areaSqm >= maxArea) return 'primary';

  if (areaSqm < SHED_THRESHOLD_SQM) return 'shed';
  if (areaSqm <= GARAGE_MAX_SQM) return 'garage';
  return 'other';
}

/**
 * Ray-casting point-in-polygon test.
 * Point is [lng, lat], ring is array of [lng, lat] (closed polygon).
 * Returns false for null/invalid inputs.
 */
export function pointInPolygon(
  point: [number, number] | null,
  ring: [number, number][] | null
): boolean {
  if (!point || !ring || ring.length < 4) return false;

  const [x, y] = point;
  let inside = false;
  const n = ring.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];

    if (
      (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Compute the area of a polygon ring in square metres using the Shoelace formula.
 * Uses equirectangular projection to local metres (same as parcels/geometry.ts).
 * Returns null for invalid rings (< 4 points including closing point).
 */
export function computeFootprintArea(ring: [number, number][]): number | null {
  if (!ring || ring.length < 4) return null;

  const n = ring.length - 1; // exclude closing point
  if (n < 3) return null;

  // Centroid for local projection
  let cLat = 0;
  let cLng = 0;
  for (let i = 0; i < n; i++) {
    cLng += ring[i][0];
    cLat += ring[i][1];
  }
  cLat /= n;
  cLng /= n;

  const cosLat = Math.cos((cLat * Math.PI) / 180);
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * cosLat;

  // Project to local XY in metres
  const points: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    points.push([
      (ring[i][0] - cLng) * mPerDegLng,
      (ring[i][1] - cLat) * mPerDegLat,
    ]);
  }

  // Shoelace formula
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    sum += points[i][0] * points[j][1] - points[j][0] * points[i][1];
  }

  return Math.abs(sum) / 2;
}

/**
 * Format a height value as "X.X m (Y.Y ft)" or "N/A" if null.
 */
export function formatHeight(meters: number | null | undefined): string {
  if (meters == null) return 'N/A';
  const ft = meters * M_TO_FT;
  return `${meters.toFixed(1)} m (${ft.toFixed(1)} ft)`;
}

/**
 * Format a square footage value as "X,XXX sq ft" or "N/A" if null.
 */
export function formatArea(sqft: number | null | undefined): string {
  if (sqft == null) return 'N/A';
  return `${Math.round(sqft).toLocaleString()} sq ft`;
}

/**
 * Format an estimated stories count as "X storey(s)" or "N/A" if null.
 */
export function formatStories(stories: number | null | undefined): string {
  if (stories == null) return 'N/A';
  return stories === 1 ? '1 storey' : `${stories} storeys`;
}

/**
 * Format a coverage percentage as "X%" or "N/A" if null.
 */
export function formatCoverage(pct: number | null | undefined): string {
  if (pct == null) return 'N/A';
  return `${pct}%`;
}

/**
 * Compute building coverage percentage: building footprint area / lot size * 100.
 * Returns null for invalid inputs. Caps at 100%.
 */
export function computeBuildingCoverage(
  buildingAreaSqft: number | null | undefined,
  lotSizeSqft: number | null | undefined
): number | null {
  if (buildingAreaSqft == null || lotSizeSqft == null) return null;
  if (lotSizeSqft <= 0 || buildingAreaSqft <= 0) return null;
  const pct = (buildingAreaSqft / lotSizeSqft) * 100;
  return Math.min(Math.round(pct * 10) / 10, 100);
}
