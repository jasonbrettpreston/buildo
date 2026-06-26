// SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md §7 (Garage + rear-suite accessory fit)
//
// Phase-3 logic locks: column-set membership/disjointness, the garage + per-type laneway/garden +
// unified rear-suite SQL (emit-gating, strict laneway⊕garden exclusion, greenspace-driven *_permission),
// abuts_laneway centreline wiring (incl. #431-FU guard preservation + COALESCE-false), geom_basis
// GAR/LANE value-pin + dual-path, propagation + orphan-nullify, and the externalized-constant sync.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mb = require('../../scripts/lib/max-build.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ep = require('../../scripts/enrich-parcels.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const eperm = require('../../scripts/enrich-permits.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ec = require('../../scripts/enrich-centreline.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const aj = require('../../scripts/lib/archetypes.js');
import { ARCHETYPE_GEOM_BASIS as TS_GEOM_BASIS } from '../lib/classification/archetypes';

const ACCESSORY_COLS = [
  'max_garage_gfa_sqm', 'garage_capacity_cars', 'garage_constraint_reason', 'garage_permission',
  'max_laneway_suite_gfa_sqm', 'max_rear_suite_gfa_sqm', 'rear_suite_type', 'rear_suite_permission',
];

describe('accessory — column sets (Phase 3 regression lock)', () => {
  it('the 8 accessory cols ride MAX_BUILD_COLS; none is a new NN-bool', () => {
    for (const c of ACCESSORY_COLS) expect(mb.MAX_BUILD_COLS).toContain(c);
    // permissions are nullable TEXT, not bools; WF3-C2 added market_exceeds_bylaw as the 3rd NN-bool.
    expect(mb.MAX_BUILD_BOOL_COLS).toEqual(['garden_suite_fits', 'envelope_constrained', 'market_exceeds_bylaw']);
    // they auto-ride the propagation set (dominant-parcel outputs).
    for (const c of ACCESSORY_COLS) expect(mb.LOT_MAXBUILD_COLS).toContain(c);
  });

  it('abuts_laneway joins CENTRELINE_COLS (not MAX_BUILD_COLS) — written by the centreline pass', () => {
    expect(eperm.CENTRELINE_COLS).toContain('abuts_laneway');
    expect(mb.MAX_BUILD_COLS).not.toContain('abuts_laneway');
  });
});

describe('accessory — buildMaxBuildSql SQL plumbing', () => {
  const sql = ep.buildMaxBuildSql({});
  it('reads abuts_laneway + a TOTAL (all-buildings) existing footprint in-pass', () => {
    expect(sql).toMatch(/COALESCE\(p\.abuts_laneway, false\) AS abuts_laneway/);
    expect(sql).toMatch(/SUM\(bf\.footprint_area_sqm\)::numeric AS existing_total_footprint_sqm/);
    // heritage freeze still uses the PRIMARY-filtered footprint.
    expect(sql).toMatch(/SUM\(bf\.footprint_area_sqm\) FILTER \(WHERE pb\.is_primary\)::numeric AS existing_footprint_sqm/);
  });

  it('garage + rear-suite are emit-gated and reference the accessory CTEs', () => {
    expect(sql).toMatch(/accessory AS \(/);
    expect(sql).toMatch(/accessory2 AS \(/);
    expect(sql).toMatch(/FROM accessory2;/);
    // emit-gate present on both fits (mirrors garden-suite COALESCE(emit AND ...)).
    expect(sql).toMatch(/COALESCE\(emit AND NOT heritage AND NOT is_in_ravine_protection_area\s+AND lot_size_sqm >=/);
    expect(sql).toMatch(/COALESCE\(a\.emit AND NOT a\.heritage[\s\S]*AS garage_fits/);
  });

  it('rear_suite_type is STRICT laneway⊕garden — NO garden on a lane-abutting lot', () => {
    expect(sql).toMatch(/WHEN a\.abuts_laneway AND a\.laneway_fits THEN 'laneway'/);
    expect(sql).toMatch(/WHEN NOT a\.abuts_laneway AND a\.garden_fits THEN 'garden'/);
  });

  it('*_permission is greenspace-driven (min_soft_landscaping_pct × lot) → as_of_right / coa_required / not_permitted', () => {
    expect(sql).toMatch(/'as_of_right'/);
    expect(sql).toMatch(/'coa_required'/);
    expect(sql).toMatch(/'not_permitted'/);
    expect(sql).toMatch(/AS garage_permission/);
    expect(sql).toMatch(/AS rear_suite_permission/);
    // suite footprint = GFA / storeys (ground coverage, not GFA) for the greenspace test.
    expect(sql).toMatch(/max_laneway_suite_gfa_sqm \/ \d/);
  });

  it('garage_constraint_reason is an ordered ELSE chain mirroring envelope_constraint_reason precedence', () => {
    expect(sql).toMatch(/WHEN garage_fits THEN NULL[\s\S]*WHEN NOT emit THEN 'low_lot_confidence'[\s\S]*WHEN heritage THEN 'heritage'[\s\S]*WHEN is_in_ravine_protection_area THEN 'ravine'[\s\S]*'lot_too_small'[\s\S]*'no_rear_yard'/);
  });

  // WF3 Phase-0 (garage one-car floor): a garage was offered when rear_yard_area >= 18, but the buildable
  // garage is only ~30% of the rear yard → an 18-61 m² yard yielded a 5-18 m² garage = 0 cars but
  // garage_permission='as_of_right' (46,598 phantom garages: 39 & 45 Derwyn). Gate now requires the
  // buildable garage GFA to hold >=1 car: LEAST(max, covPct*rear) >= GREATEST(garageMinFootprint, carFootprint).
  it('garage gate requires the buildable garage to hold >=1 car (no phantom 0-car as_of_right)', () => {
    // the one-car floor is the GREATEST of the (tunable) min footprint and the structural car footprint,
    // so the logicVar cannot undercut it.
    expect(sql).toMatch(/LEAST\([\d.]+::numeric, [\d.]+::numeric \* a\.rear_yard_area\)\s*>=\s*GREATEST\([\d.]+::numeric, [\d.]+::numeric\)/);
    // the old phantom-garage gate (bare rear_yard_area >= min) is gone from garage_fits AND the reason chain.
    expect(sql).not.toMatch(/a\.rear_yard_area >= [\d.]+, false\) AS garage_fits/);
    expect(sql).not.toMatch(/WHEN rear_yard_area < [\d.]+ THEN 'no_rear_yard'/);
    // carFootprint (structural one-car size) must appear in the floor — guarantees floor(gfa/carFootprint) >= 1.
    expect(mb.CAR_FOOTPRINT_SQM).toBeGreaterThanOrEqual(18);
    expect(sql).toMatch(new RegExp(`GREATEST\\([\\d.]+::numeric, ${mb.CAR_FOOTPRINT_SQM}::numeric\\)`));
  });

  it('externalized garden-suite constants flow from acc (logic-vars), default-byte-stable', () => {
    const def = ep.buildMaxBuildSql({});
    const overridden = ep.buildMaxBuildSql({ acc: { gardenMaxGfa: 99 } });
    expect(def).toMatch(/round\(60::numeric, 2\) END AS max_garden_suite_gfa_sqm/);
    expect(overridden).toMatch(/round\(99::numeric, 2\) END AS max_garden_suite_gfa_sqm/);
  });
});

describe('accessory — abuts_laneway centreline wiring (Spec 62 #431-FU2)', () => {
  it('BUILD_TEMP_SQL adds a parcel_lane bool_or + COALESCE-false in the final SELECT', () => {
    expect(ec.BUILD_TEMP_SQL).toMatch(/bool_or\(seg_is_lane\) AS abuts_laneway/);
    expect(ec.BUILD_TEMP_SQL).toMatch(/COALESCE\(pl\.abuts_laneway, false\)\s+AS new_abuts_laneway/);
  });
  it('UPDATE_SQL writes abuts_laneway with an IS DISTINCT FROM guard', () => {
    expect(ec.UPDATE_SQL).toMatch(/abuts_laneway\s*=\s*e\.new_abuts_laneway/);
    expect(ec.UPDATE_SQL).toMatch(/p\.abuts_laneway\s+IS DISTINCT FROM e\.new_abuts_laneway/);
  });
  it('preserves the #431-FU laneway-exclusion guards on corner + through (both CTEs)', () => {
    const m = ec.BUILD_TEMP_SQL.match(/NOT c1_is_lane AND NOT c2_is_lane/g) || [];
    expect(m.length).toBe(2); // one in parcel_corner_pairs, one in parcel_parallel_pairs
  });
});

describe('accessory — geom_basis (GAR/LANE) value-pin + dual-path', () => {
  it('GAR → max_garage_gfa_sqm, LANE → max_rear_suite_gfa_sqm (the remap)', () => {
    expect(aj.ARCHETYPE_GEOM_BASIS.GAR).toBe('max_garage_gfa_sqm');
    expect(aj.ARCHETYPE_GEOM_BASIS.LANE).toBe('max_rear_suite_gfa_sqm');
  });
  it('JS and TS geom_basis maps are identical; every non-null value is a real max-build/existing/scenario col', () => {
    expect(aj.ARCHETYPE_GEOM_BASIS).toEqual(TS_GEOM_BASIS);
    const known = new Set([...mb.MAX_BUILD_COLS, ...mb.EXISTING_COLS, ...mb.SCENARIO_COLS]);
    for (const v of Object.values(aj.ARCHETYPE_GEOM_BASIS)) {
      if (v !== null) expect(known.has(v as string), `geom_basis ${v}`).toBe(true);
    }
  });
});

describe('accessory — propagation + orphan-nullify', () => {
  it('the 8 accessory cols are in allWriteCols for both targets', () => {
    for (const t of ['permits', 'coa']) expect(eperm.allWriteCols(t)).toEqual(expect.arrayContaining(ACCESSORY_COLS));
  });
  it('nullable accessory cols → generic =NULL orphan path; abuts_laneway → explicit =false', () => {
    const sql = eperm.buildNullifyOrphansSql({ target: 'permits' });
    for (const c of ACCESSORY_COLS) expect(sql).toMatch(new RegExp(`${c} = NULL`));
    expect(sql).toMatch(/abuts_laneway = false/);
    expect(sql).not.toMatch(/abuts_laneway = NULL/);
  });
});

describe('accessory — externalized garden-suite two-source sync (Guardian)', () => {
  it('logic_variables.json defaults === the JS constant fallbacks', () => {
    const json = JSON.parse(readFileSync(resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf8'));
    expect(json.garden_suite_min_lot_sqm.default).toBe(mb.GARDEN_SUITE_MIN_LOT_SQM);
    expect(json.garden_suite_min_rear_yard_m.default).toBe(mb.GARDEN_SUITE_MIN_REAR_YARD_M);
    expect(json.garden_suite_max_gfa_sqm.default).toBe(mb.GARDEN_SUITE_MAX_GFA_SQM);
    expect(json.garage_max_gfa_sqm.default).toBe(mb.GARAGE_MAX_GFA_SQM);
    expect(json.min_soft_landscaping_pct.default).toBe(mb.MIN_SOFT_LANDSCAPING_PCT);
  });
});
