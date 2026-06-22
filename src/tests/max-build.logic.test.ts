// SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §4 (Max-build envelope), MB-1/MB-4
//
// Pure logic tests for scripts/lib/max-build.js — the testable, drift-free seam:
//   MB-1  MAX_BUILD_COLS must stay DISJOINT from enrich-parcels ALL_WRITE_COLS (separate UPDATE pass;
//         protects the migration-165 36-column regression lock + the zoning idempotency fences).
//   MB-4  the setback CASE is GENERATED from SETBACK_DEFAULTS (numbers live in exactly one place).

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mb = require('../../scripts/lib/max-build.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ep = require('../../scripts/enrich-parcels.js');

describe('max-build — constants', () => {
  it('exposes the documented model constants', () => {
    expect(mb.LOT_TOLERANCE).toBe(0.15);
    expect(mb.LOT_MIN_SQM).toBe(50);
    expect(mb.LOT_MAX_SQM).toBe(2000);
    expect(mb.STOREY_HEIGHT_M).toBe(3.0);
    expect(mb.RAVINE_SETBACK_M).toBe(10.0);
    expect(mb.GARDEN_SUITE_MAX_GFA_SQM).toBeGreaterThan(0);
  });
});

describe('max-build — setback table (MB-4)', () => {
  it('every default row carries all 4 dims', () => {
    for (const [zone, row] of Object.entries<Record<string, number>>(mb.SETBACK_DEFAULTS)) {
      for (const dim of mb.SETBACK_DIMS) {
        expect(typeof row[dim], `${zone}.${dim}`).toBe('number');
      }
    }
  });

  it('lookupSetback: longest-prefix wins, falls back to DEFAULT', () => {
    // 'RD' is a longer match than 'R' → its own row, not the generic R row.
    expect(mb.lookupSetback('RD', 'side')).toBe(mb.SETBACK_DEFAULTS.RD.side);
    expect(mb.lookupSetback('RD (x123)', 'front')).toBe(mb.SETBACK_DEFAULTS.RD.front);
    expect(mb.lookupSetback('R', 'side')).toBe(mb.SETBACK_DEFAULTS.R.side);
    // unknown zone → DEFAULT; null/empty → DEFAULT
    expect(mb.lookupSetback('ZZZ', 'rear')).toBe(mb.SETBACK_DEFAULTS.DEFAULT.rear);
    expect(mb.lookupSetback(null, 'front')).toBe(mb.SETBACK_DEFAULTS.DEFAULT.front);
  });

  it('lookupSetback throws on an unknown dim', () => {
    expect(() => mb.lookupSetback('RD', 'diagonal')).toThrow();
  });

  it('buildSetbackCase emits a CASE whose values match lookupSetback (single source)', () => {
    const sql = mb.buildSetbackCase('p.zoning_class', 'side');
    expect(sql).toMatch(/^CASE/);
    expect(sql).toMatch(/ELSE 1\.20\s+END/); // DEFAULT.side = 1.2
    expect(sql).toMatch(/upper\(p\.zoning_class\) LIKE 'RD%' THEN 0\.90/); // RD.side
    // every prefix appears
    for (const p of Object.keys(mb.SETBACK_DEFAULTS).filter((k) => k !== 'DEFAULT')) {
      expect(sql).toContain(`LIKE '${p}%'`);
    }
  });
});

describe('max-build — column arrays (MB-1 regression lock)', () => {
  it('MAX_BUILD_COLS has the 16 documented columns incl. the two NOT-NULL bools', () => {
    expect(mb.MAX_BUILD_COLS).toContain('lot_size_confidence');
    expect(mb.MAX_BUILD_COLS).toContain('max_buildable_footprint_sqm');
    expect(mb.MAX_BUILD_COLS).toContain('max_build_confidence');
    expect(mb.MAX_BUILD_COLS).toContain('envelope_constraint_reason');
    expect(mb.MAX_BUILD_COLS.length).toBe(17); // 16 + max_build_stories_basis (Phase 2 storey-height refinement)
    expect(mb.MAX_BUILD_COLS).toContain('max_build_stories_basis');
    expect(mb.MAX_BUILD_BOOL_COLS).toEqual(['garden_suite_fits', 'envelope_constrained']);
    for (const b of mb.MAX_BUILD_BOOL_COLS) expect(mb.MAX_BUILD_COLS).toContain(b);
  });

  it('MAX_BUILD_COLS is DISJOINT from enrich-parcels ALL_WRITE_COLS (separate pass)', () => {
    const overlap = mb.MAX_BUILD_COLS.filter((c: string) => ep.ALL_WRITE_COLS.includes(c));
    expect(overlap).toEqual([]);
  });

  it('LOT_MAXBUILD_COLS = lot INPUTS + envelope OUTPUTS; lot_size_sqm/frontage/depth present, no dupes', () => {
    expect(mb.LOT_MAXBUILD_COLS).toEqual(expect.arrayContaining(['lot_size_sqm', 'frontage_m', 'depth_m', 'lot_size_confidence']));
    // outputs exclude the two lot-tier inputs (those are in the INPUT set)
    expect(mb.LOT_MAXBUILD_OUTPUT_COLS).not.toContain('lot_size_confidence');
    expect(mb.LOT_MAXBUILD_OUTPUT_COLS).toContain('max_buildable_gfa_sqm');
    // is_through_lot is propagated via CENTRELINE_COLS — must NOT be duplicated here
    expect(mb.LOT_MAXBUILD_COLS).not.toContain('is_through_lot');
    expect(new Set(mb.LOT_MAXBUILD_COLS).size).toBe(mb.LOT_MAXBUILD_COLS.length);
  });
});

describe('max-build — enrich-parcels second-pass SQL plumbing', () => {
  it('buildMaxBuildSql references the zoning feed + lot dims + the massing join', () => {
    const sql = ep.buildMaxBuildSql({});
    expect(sql).toMatch(/CREATE TEMP TABLE parcel_max_build/);
    expect(sql).toMatch(/parcel_buildings pb JOIN building_footprints bf/);
    expect(sql).toMatch(/ST_Buffer\(geom::geography, -\(side_setback \+ ravine_red\)\)/);
    // ravine is a FIXED constant, NOT scaled by ravine_distance_m (Spec 59 L2 / MB-5)
    expect(sql).not.toMatch(/ravine_distance_m\s*\*/);
  });

  it('buildMaxBuildUpdateSql guards every MAX_BUILD_COL with IS DISTINCT FROM (idempotency)', () => {
    const sql = ep.buildMaxBuildUpdateSql();
    for (const col of mb.MAX_BUILD_COLS) {
      expect(sql).toMatch(new RegExp(`p\\.${col} IS DISTINCT FROM e\\.${col}`));
    }
    // must NOT touch zoning columns — it's the second, separate pass
    expect(sql).not.toMatch(/zoning_class = e\./);
  });
});
