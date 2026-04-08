// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §11 Phase 1
import { describe, it, expect } from 'vitest';
import {
  metersFromKilometers,
  kilometersFromMeters,
  formatDistanceForDisplay,
  DEFAULT_RADIUS_KM,
  MAX_RADIUS_KM,
} from '@/features/leads/lib/distance';

describe('distance helpers', () => {
  describe('unit conversion', () => {
    it('converts km to meters', () => {
      expect(metersFromKilometers(10)).toBe(10000);
      expect(metersFromKilometers(0.5)).toBe(500);
      expect(metersFromKilometers(0)).toBe(0);
    });

    it('converts meters to km', () => {
      expect(kilometersFromMeters(1000)).toBe(1);
      expect(kilometersFromMeters(500)).toBe(0.5);
      expect(kilometersFromMeters(0)).toBe(0);
    });

    it('round-trips km → m → km', () => {
      expect(kilometersFromMeters(metersFromKilometers(7.25))).toBeCloseTo(7.25);
    });
  });

  describe('formatDistanceForDisplay', () => {
    it('formats zero as 0m', () => {
      expect(formatDistanceForDisplay(0)).toBe('0m');
    });

    it('formats sub-kilometer distances as whole meters', () => {
      expect(formatDistanceForDisplay(450)).toBe('450m');
      expect(formatDistanceForDisplay(999)).toBe('999m');
    });

    it('formats 1-10 km with one decimal', () => {
      expect(formatDistanceForDisplay(1000)).toBe('1.0km');
      expect(formatDistanceForDisplay(1234)).toBe('1.2km');
      expect(formatDistanceForDisplay(9999)).toBe('10.0km');
    });

    it('formats distances ≥10km as whole kilometers', () => {
      expect(formatDistanceForDisplay(10000)).toBe('10km');
      expect(formatDistanceForDisplay(12345)).toBe('12km');
      expect(formatDistanceForDisplay(50000)).toBe('50km');
    });
  });

  describe('constants', () => {
    it('exports DEFAULT_RADIUS_KM = 10', () => {
      expect(DEFAULT_RADIUS_KM).toBe(10);
    });

    it('exports MAX_RADIUS_KM = 50 (spec 70 Zod cap)', () => {
      expect(MAX_RADIUS_KM).toBe(50);
    });
  });
});
