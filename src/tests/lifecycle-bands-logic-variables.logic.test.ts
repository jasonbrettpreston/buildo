// 🔗 SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §1
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §4
//
// Asserts the seeds JSON (`scripts/seeds/logic_variables.json`) — the
// single source of truth for logic_variables defaults per Spec 86 §1
// — has been updated with the 37 new band/threshold entries. This is
// the second arm of the migration: the SQL migration seeds the live
// DB, the JSON seeds new dev/staging environments via the Control
// Panel re-seed script (src/lib/admin/control-panel.ts:148).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

interface SeedEntry {
  default: number;
  type: 'number';
  description: string;
  min: number;
  max: number;
}

interface SeedFile {
  [key: string]: SeedEntry;
}

const EXPECTED_BAND_PHASES = [
  'p3', 'p4', 'p5', 'p6',
  'p7a', 'p7b', 'p7c', 'p7d',
  'p8', 'p18', 'p19', 'p20',
  'p9_p17_agg',
  'o1', 'o2', 'o3',
  'coa_p1', 'coa_p2',
];

const EXPECTED_THRESHOLD_KEYS = [
  'lifecycle_cross_stalled_threshold',
  'lifecycle_cross_active_inspection_threshold',
  'lifecycle_cross_issued_threshold',
];

describe('logic_variables.json — lifecycle phase bands seed entries (WF2 Spec 47/84/86)', () => {
  let seeds: SeedFile;

  beforeAll(() => {
    const raw = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'),
      'utf-8',
    );
    seeds = JSON.parse(raw) as SeedFile;
  });

  it('contains all 18 band phases × 2 (min/max) = 36 band keys', () => {
    for (const phase of EXPECTED_BAND_PHASES) {
      expect(seeds[`lifecycle_band_${phase}_min`], `missing min for ${phase}`).toBeDefined();
      expect(seeds[`lifecycle_band_${phase}_max`], `missing max for ${phase}`).toBeDefined();
    }
  });

  it('contains all 3 cross-status threshold keys', () => {
    for (const key of EXPECTED_THRESHOLD_KEYS) {
      expect(seeds[key], `missing threshold ${key}`).toBeDefined();
    }
  });

  it('every seed entry has the canonical shape (default/type/description/min/max)', () => {
    const allKeys = [
      ...EXPECTED_BAND_PHASES.flatMap((p) => [`lifecycle_band_${p}_min`, `lifecycle_band_${p}_max`]),
      ...EXPECTED_THRESHOLD_KEYS,
    ];
    for (const key of allKeys) {
      const entry = seeds[key];
      expect(entry, `missing entry for ${key}`).toBeDefined();
      expect(typeof entry!.default).toBe('number');
      expect(entry!.type).toBe('number');
      expect(entry!.description.length).toBeGreaterThan(20); // non-empty + meaningful
      expect(typeof entry!.min).toBe('number');
      expect(typeof entry!.max).toBe('number');
      expect(entry!.min).toBeLessThanOrEqual(entry!.default);
      expect(entry!.default).toBeLessThanOrEqual(entry!.max);
    }
  });

  it('every band has min < max (sanity — DeltaGuardInput needs a non-empty range)', () => {
    for (const phase of EXPECTED_BAND_PHASES) {
      const minEntry = seeds[`lifecycle_band_${phase}_min`];
      const maxEntry = seeds[`lifecycle_band_${phase}_max`];
      expect(minEntry!.default).toBeLessThan(maxEntry!.default);
    }
  });

  it('cross-status thresholds default to non-zero (would otherwise mask real signal)', () => {
    for (const key of EXPECTED_THRESHOLD_KEYS) {
      expect(seeds[key]!.default).toBeGreaterThan(0);
    }
  });
});
