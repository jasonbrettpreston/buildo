// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-3C (comparable-builds pass)
//
// Logic locks for the enrich-parcels comparable-builds SQL builders (Spec 78 Phase 3C):
//  - candidate set starts from the FILTERED permit set (not a parcels-driven scan), pre-aggregates CoA
//  - the kNN UPDATE: GiST over-fetch → zoning + lot/frontage ±20% post-filter → top-N by similarity
//  - over-capture exclusion (build_ratio > 1.1) from comp_build_ratio_p50, not from the evidence array
//  - subjects are scoped at the SOURCE (not just the final UPDATE) + incremental guard

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ep = require('../../scripts/enrich-parcels.js');

describe('comps candidate-set SQL', () => {
  const sql = ep.buildCompCandidatesSql();
  it('starts from the filtered permit set (recent new_build/addition), not a parcels scan', () => {
    expect(sql).toMatch(/FROM permits pr/);
    expect(sql).toContain("project_type IN ('new_build','addition')");
    expect(sql).toContain("interval '5 years'");
    // principal permit per parcel via DISTINCT ON, then JOIN parcels (small-set-driven)
    expect(sql).toMatch(/DISTINCT ON \(pr\.zoning_dominant_parcel_id\)/);
    expect(sql).toMatch(/JOIN parcels pa ON pa\.id = r\.pid/);
  });
  it('pre-aggregates the CoA decision (no per-candidate correlated LATERAL)', () => {
    expect(sql).toMatch(/DISTINCT ON \(zoning_dominant_parcel_id\)/);
    expect(sql).not.toMatch(/LEFT JOIN LATERAL[\s\S]*coa_applications/);
  });
  it('build_ratio = imagery roof footprint ÷ max-build; geom GiST index for the kNN', () => {
    expect(sql).toContain('imagery_roof_footprint_sqm / pa.max_buildable_footprint_sqm');
    expect(sql).toContain('USING gist (geom)');
  });
});

describe('comps kNN UPDATE SQL', () => {
  it('over-fetches the 50 nearest (GiST kNN) then post-filters zoning + lot/frontage ±20%', () => {
    const sql = ep.buildComparableBuildsUpdateSql({ full: true });
    expect(sql).toMatch(/ORDER BY c\.geom <-> s\.geom\s+LIMIT 50/);
    expect(sql).toContain('near.zoning_class = s.zoning_class');
    expect(sql).toContain('near.lot_size_sqm BETWEEN s.lot_size_sqm * 0.8 AND s.lot_size_sqm * 1.2');
    expect(sql).toMatch(/LIMIT 10/); // top-N kept
  });
  it('excludes over-captured comps (build_ratio > 1.1) from the p50 only', () => {
    const sql = ep.buildComparableBuildsUpdateSql({ full: true });
    expect(sql).toMatch(/FILTER \(WHERE m\.build_ratio IS NOT NULL AND m\.build_ratio <= 1\.1\)/);
    // build_ratio still flows into the evidence array (not filtered out of jsonb_agg)
    expect(sql).toMatch(/'build_ratio', m\.build_ratio/);
  });
  it('scopes the SUBJECTS at source (not just the final UPDATE) + incremental guard', () => {
    const full = ep.buildComparableBuildsUpdateSql({ full: true, scopeWhere: "sp.parcel_id = 'X'" });
    expect(full).toContain('FROM parcels sp');
    expect(full).toContain("sp.parcel_id = 'X'");
    expect(full).not.toContain('sp.comp_count IS NULL'); // full = no incremental guard
    const incr = ep.buildComparableBuildsUpdateSql({ full: false });
    expect(incr).toContain('sp.comp_count IS NULL');
  });
  it('exposes the comp write-column set', () => {
    expect(ep.COMP_WRITE_COLS).toEqual(['comparable_builds', 'comp_count', 'comp_dominant_build', 'comp_build_ratio_p50', 'comp_fsi_p50']);
  });
});
