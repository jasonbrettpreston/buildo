// SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §5 (Existing structure — Phase 1)
//
// Logic locks for the existing-structure third pass:
//   - EXISTING_COLS is the 10-column set, DISJOINT from the zoning ALL_WRITE_COLS, the max-build
//     MAX_BUILD_COLS, AND every enrich-permits column-group const (separate idempotent UPDATE).
//   - buildExistingStructureSql uses the separate prim/allb CTEs (NOT the max-build massing CTE),
//     oriented-envelope dims in metres, and NO ST_Union (greenspace = lot − footprint − other).
//   - the UPDATE guards every EXISTING_COL with IS DISTINCT FROM and never touches zoning/max-build.

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mb = require('../../scripts/lib/max-build.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ep = require('../../scripts/enrich-parcels.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const eperm = require('../../scripts/enrich-permits.js');

describe('existing-structure — column set (Phase 1 regression lock)', () => {
  it('EXISTING_COLS is the 10 documented columns incl. the confidence flag', () => {
    expect(mb.EXISTING_COLS).toEqual([
      'existing_footprint_sqm', 'existing_stories', 'existing_height_m', 'existing_gfa_sqm',
      'existing_width_m', 'existing_length_m', 'existing_structure_confidence',
      'existing_other_structures_count', 'existing_other_structures_sqm', 'existing_greenspace_sqm',
    ]);
    expect(mb.EXISTING_COLS.length).toBe(10);
  });

  it('EXISTING_COLS is DISJOINT from ALL_WRITE_COLS, MAX_BUILD_COLS, and the enrich-permits col groups', () => {
    const others = [
      ...ep.ALL_WRITE_COLS, ...mb.MAX_BUILD_COLS,
      ...eperm.MAXBUILD_COLS, ...eperm.CENTRELINE_COLS, ...eperm.HERITAGE_COLS, ...eperm.RAVINE_COLS,
    ];
    const overlap = mb.EXISTING_COLS.filter((c: string) => others.includes(c));
    expect(overlap).toEqual([]);
  });

  it('EXISTING_STRUCTURE_COLS (enrich-permits) === EXISTING_COLS, present in allWriteCols for both targets', () => {
    expect(eperm.EXISTING_STRUCTURE_COLS).toEqual(mb.EXISTING_COLS);
    for (const t of ['permits', 'coa']) {
      expect(eperm.allWriteCols(t)).toEqual(expect.arrayContaining(mb.EXISTING_COLS));
    }
  });

  it('orphan-nullify resets every existing_* col to NULL (nullable TEXT/numeric — generic path, no NOT-NULL bools)', () => {
    for (const t of ['permits', 'coa']) {
      const sql = eperm.buildNullifyOrphansSql({ target: t });
      for (const col of mb.EXISTING_COLS) {
        expect(sql, `${t}/${col}`).toMatch(new RegExp(`${col} = NULL`));
        expect(sql, `${t}/${col} must not false-reset`).not.toMatch(new RegExp(`${col} = false`));
      }
    }
  });

  it('confidence threshold constant cleanly splits centroid (0.95) from nearest (0.60)', () => {
    expect(mb.EXISTING_CONFIDENCE_HIGH_MIN).toBe(0.90);
    expect(0.95 >= mb.EXISTING_CONFIDENCE_HIGH_MIN).toBe(true);
    expect(0.60 >= mb.EXISTING_CONFIDENCE_HIGH_MIN).toBe(false);
  });
});

describe('existing-structure — SQL plumbing (separate pass)', () => {
  const sql = ep.buildExistingStructureSql({});

  it('uses the separate prim/allb CTEs + oriented envelope, NOT ST_Union, NOT the max-build massing CTE', () => {
    expect(sql).toMatch(/CREATE TEMP TABLE parcel_existing_struct/);
    expect(sql).toMatch(/prim AS \([\s\S]*WHERE pb\.is_primary = true/);
    expect(sql).toMatch(/allb AS \([\s\S]*FILTER \(WHERE NOT pb\.is_primary\)/);
    expect(sql).toMatch(/ST_OrientedEnvelope/);
    expect(sql).not.toMatch(/ST_Union/);          // greenspace via subtraction, not union (perf)
    expect(sql).not.toMatch(/parcel_max_build e/); // doesn't reuse the max-build temp table for output
  });

  it('measures envelope dims in metres (::geography at the point level) + floors GFA stories at 1', () => {
    expect(sql).toMatch(/ST_PointN\(ST_ExteriorRing[\s\S]*::geography/);
    expect(sql).toMatch(/GREATEST\(1, COALESCE\(pr\.p_stories, 1\)\)/);
    expect(sql).toMatch(/ST_Dimension\(pr\.p_geom\) = 2/); // areal-geom guard
  });

  it('confidence flag derives from numeric pb.confidence (>= threshold → high)', () => {
    expect(sql).toMatch(/pr\.link_confidence >= 0\.9/);
  });

  it('the UPDATE guards every EXISTING_COL with IS DISTINCT FROM and does not touch zoning/max-build cols', () => {
    const upd = ep.buildExistingStructureUpdateSql();
    for (const col of mb.EXISTING_COLS) {
      expect(upd).toMatch(new RegExp(`p\\.${col} IS DISTINCT FROM e\\.${col}`));
    }
    expect(upd).toMatch(/FROM parcel_existing_struct e/);
    expect(upd).not.toMatch(/zoning_class = e\./);
    expect(upd).not.toMatch(/max_buildable_gfa_sqm = e\./);
  });
});
