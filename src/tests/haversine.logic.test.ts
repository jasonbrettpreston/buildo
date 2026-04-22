// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §11 Phase 3 step 2
//
// Unit tests for the frontend-only haversine helper. This helper is
// deliberately constrained (used only for movement-detection cache
// invalidation; see the file header warning). Tests lock both the
// mathematical correctness AND the properties that make it safe for
// the 500m threshold decision.

import { describe, expect, it } from 'vitest';
import { haversineMeters } from '@/features/leads/lib/haversine';

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters(43.65, -79.38, 43.65, -79.38)).toBe(0);
  });

  it('is symmetric (A→B == B→A)', () => {
    const ab = haversineMeters(43.65, -79.38, 43.67, -79.36);
    const ba = haversineMeters(43.67, -79.36, 43.65, -79.38);
    expect(Math.abs(ab - ba)).toBeLessThan(1e-9);
  });

  it('measures ~1.5km between Toronto City Hall and Union Station (known landmarks)', () => {
    // City Hall: 43.6535, -79.3839
    // Union Station: 43.6453, -79.3806
    // Actual: ~950m
    const d = haversineMeters(43.6535, -79.3839, 43.6453, -79.3806);
    expect(d).toBeGreaterThan(800);
    expect(d).toBeLessThan(1100);
  });

  it('detects sub-kilometre moves correctly at the 500m threshold', () => {
    // Start at a fixed point, move ~0.005 degrees north (~555m at Toronto latitude)
    const d = haversineMeters(43.65, -79.38, 43.655, -79.38);
    expect(d).toBeGreaterThan(500);
    expect(d).toBeLessThan(600);
  });

  it('returns sub-500m for a 0.003 degree move (~333m)', () => {
    const d = haversineMeters(43.65, -79.38, 43.653, -79.38);
    expect(d).toBeLessThan(500);
    expect(d).toBeGreaterThan(250);
  });

  it('handles the longitude convergence near the equator', () => {
    // At the equator, 1 degree lng ~ 111 km. At Toronto latitude (43.65),
    // 1 degree lng ~ 80 km. The helper must account for cos(lat).
    const dEq = haversineMeters(0, 0, 0, 1);
    const dTor = haversineMeters(43.65, -79.38, 43.65, -78.38);
    expect(dEq).toBeGreaterThan(dTor);
    // At 43.65 latitude, 1 degree lng is cos(43.65 rad) ≈ 0.723 of a degree at the equator
    expect(dTor / dEq).toBeCloseTo(Math.cos((43.65 * Math.PI) / 180), 1);
  });

  it('is always non-negative', () => {
    expect(haversineMeters(0, 0, 0, 0)).toBeGreaterThanOrEqual(0);
    expect(haversineMeters(43.65, -79.38, -33.87, 151.21)).toBeGreaterThan(0);
  });
});
