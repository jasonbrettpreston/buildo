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

  it('side_count (WF3-B party-wall): RD/RM 2, RS 1 (one party wall), RT 0 (interior), DEFAULT 2', () => {
    expect(mb.lookupSideCount('RD')).toBe(2);
    expect(mb.lookupSideCount('RM')).toBe(2);
    expect(mb.lookupSideCount('R')).toBe(2);
    expect(mb.lookupSideCount('RS')).toBe(1);
    expect(mb.lookupSideCount('RT')).toBe(0);
    expect(mb.lookupSideCount('RT (x9)')).toBe(0); // longest-prefix match
    expect(mb.lookupSideCount('ZZZ')).toBe(2);     // DEFAULT
    expect(mb.lookupSideCount(null)).toBe(2);
    // every SETBACK_DEFAULTS row carries side_count
    for (const [zone, row] of Object.entries<Record<string, number>>(mb.SETBACK_DEFAULTS)) {
      expect(typeof row.side_count, `${zone}.side_count`).toBe('number');
    }
  });

  it('buildSideCountCase emits a CASE matching lookupSideCount (single source)', () => {
    const sql = mb.buildSideCountCase('p.zoning_class');
    expect(sql).toMatch(/^CASE/);
    expect(sql).toMatch(/ELSE 2\s+END/); // DEFAULT.side_count = 2
    expect(sql).toMatch(/LIKE 'RS%' THEN 1/);
    expect(sql).toMatch(/LIKE 'RT%' THEN 0/);
  });

  // WF3 — zone-default lot coverage (fills a NULL bylaw_max_coverage_pct in the footprint LEAST).
  it('lookupCoverage: empirical zone defaults, longest-prefix, RA→R, NULL→DEFAULT', () => {
    expect(mb.lookupCoverage('RD')).toBe(33);
    expect(mb.lookupCoverage('RS')).toBe(33);
    expect(mb.lookupCoverage('RT')).toBe(33);
    expect(mb.lookupCoverage('RM')).toBe(30);
    expect(mb.lookupCoverage('RA')).toBe(35);          // no RA key → resolves to R:35 via prefix
    expect(mb.lookupCoverage('R')).toBe(35);
    expect(mb.lookupCoverage('RD (x123)')).toBe(33);   // longest-prefix
    expect(mb.lookupCoverage('CR')).toBe(75);          // commercial permissive
    expect(mb.lookupCoverage('ZZZ')).toBe(mb.COVERAGE_DEFAULTS.DEFAULT);
    expect(mb.lookupCoverage(null)).toBe(mb.COVERAGE_DEFAULTS.DEFAULT);
  });

  it('COVERAGE_DEFAULTS key set matches SETBACK_DEFAULTS (parity — no RA, none missing)', () => {
    const covKeys = Object.keys(mb.COVERAGE_DEFAULTS).sort();
    const sbKeys = Object.keys(mb.SETBACK_DEFAULTS).sort();
    expect(covKeys).toEqual(sbKeys);
  });

  it('buildCoverageCase emits a CASE whose values match lookupCoverage (single source, percent)', () => {
    const sql = mb.buildCoverageCase('zoning_class');
    expect(sql).toMatch(/^CASE/);
    expect(sql).toMatch(/ELSE 50\.00\s+END/);                       // DEFAULT = 50
    expect(sql).toMatch(/upper\(zoning_class\) LIKE 'RD%' THEN 33\.00/); // RD = 33
    expect(sql).toMatch(/LIKE 'RM%' THEN 30\.00/);                  // RM = 30
    // JS↔SQL parity: every emitted THEN value equals lookupCoverage for that prefix.
    for (const p of Object.keys(mb.COVERAGE_DEFAULTS).filter((k) => k !== 'DEFAULT')) {
      expect(sql).toContain(`LIKE '${p}%' THEN ${mb.lookupCoverage(p).toFixed(2)}`);
    }
  });
});

describe('max-build — column arrays (MB-1 regression lock)', () => {
  it('MAX_BUILD_COLS has the 29 documented columns incl. the three NOT-NULL bools', () => {
    expect(mb.MAX_BUILD_COLS).toContain('lot_size_confidence');
    expect(mb.MAX_BUILD_COLS).toContain('max_buildable_footprint_sqm');
    expect(mb.MAX_BUILD_COLS).toContain('max_build_confidence');
    expect(mb.MAX_BUILD_COLS).toContain('envelope_constraint_reason');
    // 17 (Phase 2) + 8 Phase-3 accessory + 4 WF3-C2 (pocket-aggressive/hotspot/nbhd-id/premium).
    expect(mb.MAX_BUILD_COLS.length).toBe(29);
    expect(mb.MAX_BUILD_COLS).toContain('max_build_stories_basis');
    for (const c of ['max_garage_gfa_sqm', 'garage_capacity_cars', 'garage_constraint_reason', 'garage_permission',
      'max_laneway_suite_gfa_sqm', 'max_rear_suite_gfa_sqm', 'rear_suite_type', 'rear_suite_permission',
      'max_build_stories_aggressive', 'market_exceeds_bylaw', 'neighbourhood_id', 'neighbourhood_cost_premium']) {
      expect(mb.MAX_BUILD_COLS).toContain(c);
    }
    // WF3-C2 added market_exceeds_bylaw as the third NN-bool.
    expect(mb.MAX_BUILD_BOOL_COLS).toEqual(['garden_suite_fits', 'envelope_constrained', 'market_exceeds_bylaw']);
    for (const b of mb.MAX_BUILD_BOOL_COLS) expect(mb.MAX_BUILD_COLS).toContain(b);
    // WF3-C2: neighbourhood_id is parcel-only — NOT propagated (permits/coa have their own).
    expect(mb.LOT_MAXBUILD_OUTPUT_COLS).not.toContain('neighbourhood_id');
    expect(mb.LOT_MAXBUILD_OUTPUT_COLS).toContain('neighbourhood_cost_premium');
  });

  it('buildPremiumCase parity with lookupPremium / computePremiumFactor (income-tier model)', () => {
    // The generated SQL CASE must match the JS tier lookup exactly (half-open [min,max), NULL→1.0).
    for (const income of [null, 0, 59999, 60000, 60001, 99999, 100000, 150000, 199999, 200000, 500000]) {
      const expected = mb.lookupPremium(income);
      expect(typeof expected).toBe('number');
    }
    // boundary values land in the UPPER tier (>= min, < max)
    expect(mb.lookupPremium(60000)).toBe(1.15);   // not 1.00
    expect(mb.lookupPremium(59999)).toBe(1.00);
    expect(mb.lookupPremium(200000)).toBe(1.85);  // open-top
    expect(mb.lookupPremium(null)).toBe(1.0);
    expect(mb.lookupPremium(NaN)).toBe(1.0);
    // the SQL CASE encodes the same brackets + NULL→1.00
    const sql = mb.buildPremiumCase('inc');
    expect(sql).toMatch(/WHEN inc IS NULL THEN 1\.00/);
    expect(sql).toMatch(/WHEN inc >= 60000 AND inc < 100000 THEN 1\.15/);
    expect(sql).toMatch(/WHEN inc >= 200000 THEN 1\.85/);
    expect(sql).toMatch(/ELSE 1\.00/);
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

describe('computeCurGfaRange (WF3-A current-building GFA menu)', () => {
  it('pocket tops at 2 storeys → 1-2 range, no 3-storey option', () => {
    expect(mb.computeCurGfaRange(100, 2)).toEqual({
      cur_floor_gfa_sqm: 100, cur_pot_2story_gfa_sqm: 200, cur_pot_3story_gfa_sqm: null, cur_gfa_range_basis: '1-2',
    });
  });

  it('pocket supports 3 storeys → 1-3 range, 3-storey option emitted', () => {
    expect(mb.computeCurGfaRange(100, 3)).toEqual({
      cur_floor_gfa_sqm: 100, cur_pot_2story_gfa_sqm: 200, cur_pot_3story_gfa_sqm: 300, cur_gfa_range_basis: '1-3',
    });
    // higher pockets still cap the current-building menu at 3 (max_build_stories>=3 gate)
    expect(mb.computeCurGfaRange(100, 5).cur_gfa_range_basis).toBe('1-3');
  });

  it('range_basis is ASCII hyphen, never an en-dash', () => {
    expect(mb.computeCurGfaRange(100, 2).cur_gfa_range_basis).toBe('1-2');
    expect(mb.computeCurGfaRange(100, 3).cur_gfa_range_basis).toBe('1-3');
  });

  it('NULL footprint OR NULL max_build_stories → all NULL (range_basis NULL, not 1-2)', () => {
    expect(mb.computeCurGfaRange(null, 2)).toEqual({
      cur_floor_gfa_sqm: null, cur_pot_2story_gfa_sqm: null, cur_pot_3story_gfa_sqm: null, cur_gfa_range_basis: null,
    });
    expect(mb.computeCurGfaRange(100, null).cur_gfa_range_basis).toBeNull();
  });

  it('rounds to 2 dp like the SQL ROUND(...,2)', () => {
    expect(mb.computeCurGfaRange(33.337, 2).cur_floor_gfa_sqm).toBe(33.34);
    expect(mb.computeCurGfaRange(33.337, 2).cur_pot_2story_gfa_sqm).toBe(66.67);
  });
});

describe('max-build — enrich-parcels second-pass SQL plumbing', () => {
  it('buildMaxBuildSql references the zoning feed + lot dims + the massing join', () => {
    const sql = ep.buildMaxBuildSql({});
    expect(sql).toMatch(/CREATE TEMP TABLE parcel_max_build/);
    expect(sql).toMatch(/parcel_buildings pb JOIN building_footprints bf/);
    // WF3-B: buffer side inset is party-wall-scaled (side_count/2.0); ravine_red still added separately.
    expect(sql).toMatch(/ST_Buffer\(geom::geography, -\(side_setback \* side_count \/ 2\.0 \+ ravine_red\)\)/);
    // width_raw uses the party-wall side_count, not a flat 2× (attached fix)
    expect(sql).toMatch(/frontage_m - side_count \* side_setback/);
    // footprint_calc still cross-checks box_area (KEPT — the front/rear depth guard; review CRITICAL)
    expect(sql).toMatch(/LEAST\(buffer_area, box_area, coverage_cap\)/);
    // WF3: coverage_cap fills a NULL bylaw coverage with the zone default (anchored to the exact
    // expression — a loose /COALESCE.*coverage_cap/ would also match unrelated COALESCEs in the blob).
    expect(sql).toMatch(/COALESCE\(bylaw_max_coverage_pct,/);
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
