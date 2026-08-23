// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-3A (optimal-config enrich pass)
//
// Logic locks for the enrich-parcels optimal-config pass (Spec 78 Phase 3A):
//  - mapRowToEngineInput: DB row → engine input (units, coverage %→frac, boolean flags, storey fallback)
//  - computeOptConfigRow: the 12-value write tuple + the exception_number confidence downgrade
//  - buildNearbyBuildsSummary: headline + basis (neighbourhood vs citywide_fallback), NULL on no norms
//  - the write-column list + the select SQL shape (scopeWhere, citywide CROSS JOIN, eligibility gate)

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ep = require('../../scripts/enrich-parcels.js');

const baseRow = {
  id: 1, lot_size_sqm: '400', frontage_m: '12', depth_m: '35', max_buildable_footprint_sqm: '140',
  max_buildable_gfa_sqm: '300', bylaw_max_fsi: null, bylaw_max_coverage_pct: '35', max_build_stories: 2,
  abuts_laneway: false, zoning_holding: null, is_through_lot: false, is_heritage_designated: false,
  is_in_ravine_protection_area: false, exception_number: null, existing_greenspace_sqm: '150',
  existing_other_structures_sqm: '0', existing_other_structures_count: 0, lot_size_confidence: 'high',
  neighbourhood_id: 5, neighbourhood_name: 'East York', used_citywide: false,
  storeys_p50: 2, storeys_p90: 3, new_builds_5yr: 25, additions_5yr: 88, renos_5yr: 81,
  suites_5yr: 3, demos_5yr: 1, realized_fsi_p50: '0.9', build_ratio_p50: '0.8',
  existing_build_ratio_p25: '0.55', existing_build_ratio_p50: '0.62', coa_approved: 19, coa_refused: 1,
  coa_approval_rate: '0.95', window_start: '2021-06-01', window_end: '2026-06-01', nbn_sample_n: 195,
};

describe('optconfig mapRowToEngineInput', () => {
  it('maps coverage % → fraction, booleans, and the storey fallback to max_build_stories', () => {
    const i = ep.mapRowToEngineInput(baseRow);
    expect(i.lotSizeSqm).toBe(400);
    expect(i.coverageCapFrac).toBeCloseTo(0.35, 5);   // 35 pct → 0.35 frac
    expect(i.fsiCap).toBeNull();
    expect(i.nbhdStoreysP50).toBe(2);
    expect(i.abutsLaneway).toBe(false);
    expect(i.rearBehindMaxM).toBeNull();              // 3A area-only fit
    expect(i.rearYardAreaSqm).toBe(150);              // greenspace proxy
  });

  it("'H' holding → isHolding; through-lot + heritage + ravine flags map through", () => {
    const i = ep.mapRowToEngineInput({ ...baseRow, zoning_holding: 'H', is_through_lot: true, is_heritage_designated: true, is_in_ravine_protection_area: true });
    expect(i.isHolding).toBe(true);
    expect(i.isThroughLot).toBe(true);
    expect(i.isHeritageFreeze).toBe(true);
    expect(i.isRavine).toBe(true);
  });

  it('falls back to max_build_stories when the nbhd storey norm is absent', () => {
    const i = ep.mapRowToEngineInput({ ...baseRow, storeys_p50: null, storeys_p90: null, max_build_stories: 3 });
    expect(i.nbhdStoreysP50).toBe(3);
    expect(i.nbhdStoreysP90).toBe(3);
  });

  it('WF3: maxBuildStories = the max_build_stories column (envelope cap for the as-of-right tier)', () => {
    expect(ep.mapRowToEngineInput(baseRow).maxBuildStories).toBe(2);
  });

  it('WF3: maxBuildStories derives from gfa/footprint ONLY on heritage_existing basis (exact integer)', () => {
    // heritage: max_build_stories NULL, envelope gfa = footprint × frozen storeys (280/140 = 2), basis heritage.
    const i = ep.mapRowToEngineInput({ ...baseRow, max_build_stories: null, max_buildable_gfa_basis: 'heritage_existing', max_buildable_gfa_sqm: '280', max_buildable_footprint_sqm: '140' });
    expect(i.maxBuildStories).toBe(2);
    // NON-heritage basis with null stories + FSI-bound gfa → do NOT derive (engine's fsiCap bounds it;
    // a fractional-ratio storey cap would under-state opt_aor). [Regression Guardian guard]
    expect(ep.mapRowToEngineInput({ ...baseRow, max_build_stories: null, max_buildable_gfa_basis: 'fsi', max_buildable_gfa_sqm: '200', max_buildable_footprint_sqm: '140' }).maxBuildStories).toBeNull();
    // both NULL (no envelope) → null → uncapped.
    expect(ep.mapRowToEngineInput({ ...baseRow, max_build_stories: null, max_buildable_gfa_sqm: null }).maxBuildStories).toBeNull();
  });
});

describe('optconfig computeOptConfigRow', () => {
  it('produces the 12-value tuple [aorStoreys,aorGfa,units,coaStoreys,coaGfa,type,fits,binding,conf,cfg,nearby,id]', () => {
    const row = ep.computeOptConfigRow(baseRow);
    expect(row).toHaveLength(12);
    expect(row[0]).toBe(2);                 // aor storeys (p50)
    expect(row[1]).toBeGreaterThan(100);    // aor gfa (140 footprint × 2)
    expect([1, 2]).toContain(row[2]);       // units
    expect(row[3]).toBe(3);                 // coa storeys (p90)
    expect(row[4]).toBeGreaterThan(row[1]); // coa gfa > aor gfa (storeys up)
    expect(['garden', 'laneway', 'none']).toContain(row[5]);
    expect(typeof row[6]).toBe('boolean');
    expect(row[11]).toBe(baseRow.id);       // id last
    expect(JSON.parse(row[9]).bylaw_version).toBe('569-2013_consolidation_2025');
  });

  it('downgrades high confidence to medium when an exception_number is present (unparsed provision)', () => {
    // high requires fsiCap present + no accessory suspected
    const high = { ...baseRow, bylaw_max_fsi: '1.0', existing_other_structures_count: 0 };
    expect(ep.computeOptConfigRow(high)[8]).toBe('high');
    expect(ep.computeOptConfigRow({ ...high, exception_number: 'X123' })[8]).toBe('medium');
  });

  it('units = 2 when a suite fits, 1 otherwise', () => {
    const row = ep.computeOptConfigRow(baseRow);
    expect(row[2]).toBe(row[6] ? 2 : 1);
  });
});

describe('optconfig buildNearbyBuildsSummary', () => {
  it('builds a headline with the neighbourhood name + 5-yr counts + CoA approval', () => {
    const s = ep.buildNearbyBuildsSummary(baseRow);
    expect(s.basis).toBe('neighbourhood');
    expect(s.headline).toContain('East York');
    expect(s.headline).toContain('25 new builds');
    expect(s.headline).toContain('95% approval');
    expect(s.sample_n).toBe(195);
  });

  it('labels basis citywide_fallback + headline "Citywide" when used_citywide', () => {
    const s = ep.buildNearbyBuildsSummary({ ...baseRow, used_citywide: true });
    expect(s.basis).toBe('citywide_fallback');
    expect(s.headline).toContain('Citywide');
  });

  it('returns null when the parcel has no neighbourhood build-norm row (no sample)', () => {
    expect(ep.buildNearbyBuildsSummary({ ...baseRow, nbn_sample_n: null })).toBeNull();
  });

  // WF3 phase A — typical_fsi fallback + comp_fsi_basis transparency.
  it('typical_fsi = comp_fsi_p50 when present (basis comp) + FSI in headline', () => {
    const s = ep.buildNearbyBuildsSummary({ ...baseRow, comp_fsi_p50: '0.83' });
    expect(s.typical_fsi).toBeCloseTo(0.83, 2);
    expect(s.comp_fsi_basis).toBe('comp');
    expect(s.headline).toContain('~0.83 FSI');
  });

  it('typical_fsi falls back to realized_fsi_p50 when comp_fsi_p50 NULL (basis pocket_realized)', () => {
    const s = ep.buildNearbyBuildsSummary({ ...baseRow, comp_fsi_p50: null }); // realized_fsi_p50 = '0.9'
    expect(s.typical_fsi).toBeCloseTo(0.9, 2);
    expect(s.comp_fsi_basis).toBe('pocket_realized');
    expect(s.headline).toContain('~0.90 FSI');
  });

  it('basis none + no FSI clause when both comp and realized are NULL', () => {
    const s = ep.buildNearbyBuildsSummary({ ...baseRow, comp_fsi_p50: null, realized_fsi_p50: null });
    expect(s.typical_fsi).toBeNull();
    expect(s.comp_fsi_basis).toBe('none');
    expect(s.headline).not.toContain('FSI');
  });
});

describe('optconfig SQL shape', () => {
  it('the write-column list is the 11 §I/§J columns', () => {
    expect(ep.OPTCFG_WRITE_COLS).toHaveLength(11);
    expect(ep.OPTCFG_WRITE_COLS).toContain('optimal_config');
    expect(ep.OPTCFG_WRITE_COLS).toContain('nearby_builds_summary');
  });

  it('select gates on a max-build envelope, uses the P2 3-level family fallback, and honours scopeWhere + incremental', () => {
    const sql = ep.buildOptConfigSelectSql({ full: false, scopeWhere: "p.parcel_id = 'X'" });
    expect(sql).toContain('max_buildable_footprint_sqm IS NOT NULL');
    // P2 family-aware read: pocket-family (nbn) + citywide-family (cwf) + citywide-'all' backstop (cwa).
    expect(sql).toContain('nbn.structure_family =');                                  // pocket-family predicate
    expect(sql).toContain('cwf.structure_family =');                                  // citywide-family predicate
    expect(sql).toContain("neighbourhood_id IS NULL AND structure_family = 'all') cwa"); // citywide 'all' CROSS JOIN
    expect(sql).toContain('COALESCE(nbn.realized_fsi_p90, cwf.realized_fsi_p90, cwa.realized_fsi_p90)'); // 3-level, incl. R2 FSI p90
    expect(sql).toContain("p.parcel_id = 'X'");               // scopeWhere injected
    expect(sql).toContain('opt_config_confidence IS NULL');   // incremental (full=false)
    expect(ep.buildOptConfigSelectSql({ full: true })).not.toContain('opt_config_confidence IS NULL');
  });
});

// D#5 (B3 output-panel remediation) — OPTCFG_GENUINE_COLS + computeAggregateRecordsUpdated.
describe('D#5 — OPTCFG_GENUINE_COLS (nearby_builds_summary excluded from the genuine-change guard)', () => {
  it('is the 9 flat opt_* columns + optimal_config (10 total), NOT nearby_builds_summary', () => {
    expect(ep.OPTCFG_GENUINE_COLS).toHaveLength(10);
    expect(ep.OPTCFG_GENUINE_COLS).toContain('optimal_config');
    expect(ep.OPTCFG_GENUINE_COLS).not.toContain('nearby_builds_summary');
  });

  it('is derived from OPTCFG_WRITE_COLS by exclusion (stays in sync if a column is ever added)', () => {
    const expected = ep.OPTCFG_WRITE_COLS.filter((c: string) => c !== 'nearby_builds_summary');
    expect(ep.OPTCFG_GENUINE_COLS).toEqual(expected);
  });
});

describe('D#5 — computeAggregateRecordsUpdated (distinct-parcels-touched, NOT a naive sum)', () => {
  it('is a union, not a sum: overlapping ids across passes count ONCE', () => {
    const n = ep.computeAggregateRecordsUpdated({
      zoningIds: [1, 2, 3],
      maxBuildIds: [2, 3, 4], // overlaps zoning on 2,3
      existingIds: [3, 4, 5], // overlaps maxBuild on 3,4
      scenarioIds: [5],       // overlaps existing on 5
      optConfigGenuineIds: [1, 6], // overlaps zoning on 1
    });
    // distinct ids: 1,2,3,4,5,6 = 6 — a naive sum would be 3+3+3+1+2 = 12 (2×)
    expect(n).toBe(6);
  });

  it('handles a Set for optConfigGenuineIds (the real call site passes a Set, not an array)', () => {
    const n = ep.computeAggregateRecordsUpdated({
      zoningIds: [], maxBuildIds: [], existingIds: [], scenarioIds: [],
      optConfigGenuineIds: new Set([10, 20, 20]), // Set already de-dupes
    });
    expect(n).toBe(2);
  });

  it('all-empty → 0 (the honest floor: a steady-state re-run reports 0, not 802,075)', () => {
    expect(ep.computeAggregateRecordsUpdated({
      zoningIds: [], maxBuildIds: [], existingIds: [], scenarioIds: [], optConfigGenuineIds: [],
    })).toBe(0);
  });

  it('tolerates missing/undefined arrays (defensive — a pass result shape changing must not throw)', () => {
    expect(ep.computeAggregateRecordsUpdated({})).toBe(0);
  });

  it('comparable_builds is NOT one of the inputs (deliberately excluded — see the function docblock)', () => {
    const src = ep.computeAggregateRecordsUpdated.toString();
    expect(src).not.toMatch(/comp(Result|arableBuilds)Ids/);
  });
});

describe('D#5 — main() wires the aggregate into records_updated (source-scan)', () => {
  // P0b (2026-08-23): these were inline `require('fs')`/`require('path')`,
  // which tripped @typescript-eslint/no-require-imports and made `npm run
  // verify` exit before the test phase. Node builtins, so a plain ESM import
  // at the top of the file is the direct replacement.
  const src = readFileSync(join(process.cwd(), 'scripts/enrich-parcels.js'), 'utf8');

  it('main() calls computeAggregateRecordsUpdated with all four SQL-pass id sets + the optconfig genuine set', () => {
    // The FUNCTION DEFINITION (module scope) appears earlier in the file than
    // its call site inside main() — search from AFTER main()'s declaration.
    const mainIdx = src.indexOf('async function main(pool)');
    expect(mainIdx).toBeGreaterThan(-1);
    const callIdx = src.indexOf('computeAggregateRecordsUpdated({', mainIdx);
    expect(callIdx).toBeGreaterThan(-1);
    const callBlock = src.slice(callIdx, callIdx + 400);
    expect(callBlock).toContain('zoningIds: result.updatedIds');
    expect(callBlock).toContain('maxBuildIds: mbResult.updatedIds');
    expect(callBlock).toContain('existingIds: exResult.updatedIds');
    expect(callBlock).toContain('scenarioIds: exResult.scenarioUpdatedIds');
    expect(callBlock).toContain('optConfigGenuineIds: ocResult.genuineIds');
  });

  it('emitSummary uses the aggregate, not the pass-1-only result.updated', () => {
    expect(src).toMatch(/records_updated:\s*recordsUpdatedAggregate/);
    expect(src).not.toMatch(/records_updated:\s*result\.updated/);
  });

  it('an audit row surfaces the aggregate for operator visibility', () => {
    expect(src).toContain('records_updated_aggregate_distinct_parcels');
  });
});
