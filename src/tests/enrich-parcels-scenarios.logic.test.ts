// SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §6 (Reno/build scenarios + geom_basis + storey-height)
//
// Phase-2 logic locks: SCENARIO_COLS disjointness, the scenario SQL + sibling UPDATE, the
// storey-height use-class CASE, and the archetype geom_basis (B1) dual-path + resolvability.

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mb = require('../../scripts/lib/max-build.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ep = require('../../scripts/enrich-parcels.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const eperm = require('../../scripts/enrich-permits.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const aj = require('../../scripts/lib/archetypes.js');
import { ARCHETYPE_GEOM_BASIS as TS_GEOM_BASIS, ARCHETYPE_BUNDLES as TS_BUNDLES } from '../lib/classification/archetypes';

describe('scenarios — column set (Phase 2 regression lock)', () => {
  it('SCENARIO_COLS is the Phase-2 6 + WF3-A 4 cur-GFA-range superset (deprecated 3 kept in-array, NULL-cleared)', () => {
    expect(mb.SCENARIO_COLS).toEqual([
      'max_newbuild_coa_gfa_sqm', 'cur_basement_gfa_sqm', 'cur_storey_gfa_sqm',
      'cur_interior_reno_gfa_sqm', 'cur_est_kitchen_gfa_sqm', 'cur_est_bath_gfa_sqm',
      'cur_floor_gfa_sqm', 'cur_pot_2story_gfa_sqm', 'cur_pot_3story_gfa_sqm', 'cur_gfa_range_basis',
    ]);
  });

  it('SCENARIO_COLS disjoint from ALL_WRITE_COLS, MAX_BUILD_COLS, EXISTING_COLS, and enrich-permits groups', () => {
    const others = [
      ...ep.ALL_WRITE_COLS, ...mb.MAX_BUILD_COLS, ...mb.EXISTING_COLS,
      ...eperm.MAXBUILD_COLS, ...eperm.EXISTING_STRUCTURE_COLS, ...eperm.CENTRELINE_COLS, ...eperm.HERITAGE_COLS, ...eperm.RAVINE_COLS,
    ];
    expect(mb.SCENARIO_COLS.filter((c: string) => others.includes(c))).toEqual([]);
  });

  it('externalized reno + WF3-A mislink defaults present', () => {
    expect(mb.RENO_COA_UPLIFT_PCT_DEFAULT).toBe(0.05);
    expect(mb.RENO_KITCHEN_GFA_PCT_DEFAULT).toBe(0.15);
    expect(mb.RENO_BATH_GFA_PCT_DEFAULT).toBe(0.07);
    expect(mb.MISLINK_FOOTPRINT_LOT_TOL_DEFAULT).toBe(0.05);
    expect(mb.MISLINK_FLAG_FOOTPRINT_EXCEEDS_LOT).toBe('footprint_exceeds_lot');
  });
});

describe('scenarios — SQL plumbing', () => {
  it('existing-structure SQL: retires height/stories, mislink-guards, emits the cur-GFA range', () => {
    const sql = ep.buildExistingStructureSql({ reno: { coaUplift: 0.05, kitchenPct: 0.15, bathPct: 0.07, mislinkTol: 0.05 } });
    expect(sql).toMatch(/p\.max_buildable_gfa_sqm::numeric AS max_buildable_gfa_sqm, p\.max_build_stories/);
    expect(sql).toMatch(/s\.max_buildable_gfa_sqm \* \(1 \+ 0\.05\)[\s\S]*AS max_newbuild_coa_gfa_sqm/);
    expect(sql).toMatch(/g\.eff_footprint \* 0\.15[\s\S]*AS cur_est_kitchen_gfa_sqm/);
    // WF3-A: existing_stories + existing_height_m are RETIRED → always NULL.
    expect(sql).toMatch(/NULL::integer AS existing_stories/);
    expect(sql).toMatch(/NULL::numeric AS existing_height_m/);
    // WF3-A: deprecated scenario cols NULL-cleared (kept in-array so the SET writes NULL).
    expect(sql).toMatch(/NULL::numeric AS cur_basement_gfa_sqm/);
    expect(sql).toMatch(/NULL::numeric AS cur_storey_gfa_sqm/);
    expect(sql).toMatch(/NULL::numeric AS cur_interior_reno_gfa_sqm/);
    // WF3-A: mislink guard NULLs eff_footprint when footprint > lot×(1+tol); flag records why.
    expect(sql).toMatch(/pr\.p_footprint > s\.lot_size_sqm \* \(1 \+ 0\.05\)\) AS mislink/);
    expect(sql).toMatch(/CASE WHEN m\.mislink THEN NULL ELSE pr\.p_footprint END AS eff_footprint/);
    expect(sql).toMatch(/CASE WHEN m\.mislink THEN 'footprint_exceeds_lot' END AS existing_data_quality_flag/);
    // WF3-A: the cur-GFA range menu — floor / pot_2story / pot_3story (gated >=3) / range_basis.
    expect(sql).toMatch(/g\.eff_footprint IS NOT NULL THEN ROUND\(g\.eff_footprint, 2\) END AS cur_floor_gfa_sqm/);
    expect(sql).toMatch(/g\.eff_footprint \* 2, 2\) END AS cur_pot_2story_gfa_sqm/);
    expect(sql).toMatch(/s\.max_build_stories >= 3 THEN ROUND\(g\.eff_footprint \* 3, 2\) END AS cur_pot_3story_gfa_sqm/);
    expect(sql).toMatch(/WHEN s\.max_build_stories >= 3 THEN '1-3' ELSE '1-2' END\) END AS cur_gfa_range_basis/);
    // existing_gfa_sqm is the forward-compat 2-storey default (footprint × 2), not the old ×stories.
    expect(sql).toMatch(/g\.eff_footprint \* 2, 2\) END AS existing_gfa_sqm/);
  });

  it('sibling buildScenarioUpdateSql guards every SCENARIO_COL, reuses parcel_existing_struct', () => {
    const upd = ep.buildScenarioUpdateSql();
    for (const col of mb.SCENARIO_COLS) expect(upd).toMatch(new RegExp(`p\\.${col} IS DISTINCT FROM e\\.${col}`));
    expect(upd).toMatch(/FROM parcel_existing_struct e/);
  });
});

describe('storey-height refinement (Part C)', () => {
  it('buildStoreyHeightCase: non-residential taller, residential = the externalized base', () => {
    expect(mb.lookupStoreyHeight('RD')).toBe(mb.RESIDENTIAL_STOREY_HEIGHT_M);
    expect(mb.lookupStoreyHeight('CR')).toBe(mb.NONRES_STOREY_HEIGHT_M);
    expect(mb.lookupStoreyHeight('E')).toBe(mb.NONRES_STOREY_HEIGHT_M);
    const sql = mb.buildStoreyHeightCase('zoning_class', 3.0);
    expect(sql).toMatch(/LIKE 'C%'/);
    expect(sql).toMatch(/ELSE 3\.00 END/);
  });

  it('max-build SQL derives max_build_stories via the storey-height CASE + emits max_build_stories_basis', () => {
    const sql = ep.buildMaxBuildSql({ storeyHeight: 3.0 });
    expect(sql).toMatch(/bylaw_max_height_m \/ \(CASE WHEN upper\(zoning_class\)/);
    expect(sql).toMatch(/WHEN bylaw_max_stories IS NOT NULL THEN 'bylaw'[\s\S]*AS max_build_stories_basis/);
  });
});

describe('archetype geom_basis (B1) — dual-path + resolvable', () => {
  it('JS and TS geom_basis maps are identical', () => {
    expect(aj.ARCHETYPE_GEOM_BASIS).toEqual(TS_GEOM_BASIS);
  });

  it('every archetype code has a geom_basis entry (column name or explicit null)', () => {
    for (const code of Object.keys(aj.ARCHETYPE_BUNDLES)) {
      expect(aj.ARCHETYPE_GEOM_BASIS).toHaveProperty(code);
      const v = aj.ARCHETYPE_GEOM_BASIS[code];
      expect(v === null || typeof v === 'string').toBe(true);
    }
    expect(Object.keys(TS_GEOM_BASIS).sort()).toEqual(Object.keys(TS_BUNDLES).sort());
  });

  it('non-null geom_basis values are real scenario/max-build/existing column names', () => {
    const known = new Set([...mb.MAX_BUILD_COLS, ...mb.EXISTING_COLS, ...mb.SCENARIO_COLS]);
    for (const v of Object.values(aj.ARCHETYPE_GEOM_BASIS)) {
      if (v !== null) expect(known.has(v as string), `geom_basis ${v}`).toBe(true);
    }
  });
});

describe('enrich-permits scenario propagation', () => {
  it('SCENARIO_COLS in allWriteCols for both targets + assertScenarioColumns exported', () => {
    expect(eperm.SCENARIO_COLS).toEqual(mb.SCENARIO_COLS);
    for (const t of ['permits', 'coa']) expect(eperm.allWriteCols(t)).toEqual(expect.arrayContaining(mb.SCENARIO_COLS));
    expect(typeof eperm.assertScenarioColumns).toBe('function');
  });

  it('orphan-nullify resets scenario cols to NULL (nullable numerics, generic path)', () => {
    const sql = eperm.buildNullifyOrphansSql({ target: 'permits' });
    for (const col of mb.SCENARIO_COLS) expect(sql).toMatch(new RegExp(`${col} = NULL`));
  });
});
