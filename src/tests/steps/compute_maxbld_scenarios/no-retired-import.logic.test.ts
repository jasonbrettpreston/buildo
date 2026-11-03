// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377 (MB-31 Layer 3 step; plan sections 5, 7)
//
// MB-31 · E31-01 oracle-only brief B0e (part 2 of 2). RED FIRST: none of the seven MB-31 product files exists yet.
//   R-KJ / L31-10 no retired engine import: no product file names a retired engine, layout or view; the 22 retired
//        `compute_maxbld_scenarios_*` variables are absent from `config.logic_variables`, present (by name) in
//        `config.retired` in the `retiredVarRow` shape, and named nowhere in product code.
//   Q3 (operator 2026-11-02, CARD-mb31-reads-binding.answered.md:41): compute_maxbld_scenarios_batch_size
//        is live (R-DE (i), batch_size_from_config), so the retired count is 22, not 23.
// Every product file is read as TEXT and never executed.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON surface
const ROOT = process.cwd();
const DESCRIPTOR = 'scripts/compute-maxbld-scenarios.descriptor.json';
const PRODUCT_FILES = [
  'scripts/analysis/bylaw/evaluate-l3.mjs',
  'scripts/lib/compute/compute-maxbld-scenarios.js',
  'scripts/lib/compute/maxbld/catalogue.js',
  'scripts/lib/compute/maxbld/rows.js',
  'scripts/lib/compute/maxbld/neighbour-facts.js',
  'scripts/lib/compute/maxbld/layer2-cells.js',
  'scripts/compute-maxbld-scenarios.js',
];
const RETIRED_WORDS = [
  'max-build',
  'renovation-shared',
  'front-averaging',
  'p3engine',
  'runMaxbldScenarios',
  'dumpall',
  'maxbld-layer2-view',
];
const RETIRED_SPECIFIER = /(require\(|from\s+)['"][^'"]*\/maxbld-[^'"]*['"]/;
const RETIRED_VARS = [
  'compute_maxbld_scenarios_basement_livable_share',
  'compute_maxbld_scenarios_circulation_share',
  'compute_maxbld_scenarios_coxwell_generous_reading',
  'compute_maxbld_scenarios_depth_search_step_m',
  'compute_maxbld_scenarios_existing_confidence_min',
  'compute_maxbld_scenarios_existing_shared_footprint_penalty',
  'compute_maxbld_scenarios_first_floor_elevation_m',
  'compute_maxbld_scenarios_houseplex_min_units',
  'compute_maxbld_scenarios_lane_buffer_m',
  'compute_maxbld_scenarios_lot_max_sqm',
  'compute_maxbld_scenarios_lot_min_sqm',
  'compute_maxbld_scenarios_lot_viability_margin_m',
  'compute_maxbld_scenarios_min_dimension_m',
  'compute_maxbld_scenarios_not_evaluated_max_pct',
  'compute_maxbld_scenarios_roof_assembly_depth_m',
  'compute_maxbld_scenarios_roof_pitch',
  'compute_maxbld_scenarios_storey_height_m',
  'compute_maxbld_scenarios_suite_gfa_strict_margin_sqm',
  'compute_maxbld_scenarios_suite_weight',
  'compute_maxbld_scenarios_triangle_simplify_tol_m',
  'compute_maxbld_scenarios_trust_high_min_pass_pct',
  'compute_maxbld_scenarios_unit_min_interior_sqm',
];
const LIVE_VARS = [
  'compute_maxbld_scenarios_population_parcel_ids',
  'fya_placeholder_ring_depth',
  'fya_placeholder_ring_min_n',
];

const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const descriptor = (): Json => JSON.parse(read(DESCRIPTOR));

describe('MB-31 no retired engine import, R-KJ / L31-10', () => {
  it('names no retired engine, layout or view in any product file', () => {
    const hits: string[] = [];
    for (const file of PRODUCT_FILES) {
      const src = read(file);
      if (RETIRED_SPECIFIER.test(src)) hits.push(`${file}: retired specifier`);
      for (const word of RETIRED_WORDS) {
        if (src.includes(word)) hits.push(`${file}: ${word}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('holds exactly the 22 retired variable names', () => {
    expect(new Set(RETIRED_VARS).size).toBe(22);
    expect(RETIRED_VARS.every((n) => n.startsWith('compute_maxbld_scenarios_'))).toBe(true);
  });

  it('drops every retired variable from config.logic_variables', () => {
    const names = (descriptor().config.logic_variables as Json[]).map((v) => String(v.name));
    expect(names.filter((n) => RETIRED_VARS.includes(n))).toEqual([]);
  });

  it('lists every retired variable in config.retired, by name', () => {
    const retired = descriptor().config.retired as Json[];
    expect(Array.isArray(retired)).toBe(true);
    const listed = retired.map((e) => String(e.name));
    expect([...listed].sort()).toEqual([...RETIRED_VARS].sort());
    const shape = retired.map(
      (e) =>
        ['name', 'since', 'why', 'ledger'].filter((k) => k in e).length +
        (e.why !== null && typeof e.why === 'object' && 'text' in e.why && 'liveness' in e.why ? 1 : 0),
    );
    expect(shape.every((n) => n === 5)).toBe(true);
    expect(retired.some((e) => 'present' in e)).toBe(false);
  });

  it('names no retired variable in product code', () => {
    const hits: string[] = [];
    for (const file of PRODUCT_FILES) {
      const src = read(file);
      for (const name of RETIRED_VARS) {
        if (src.includes(name)) hits.push(`${file}: ${name}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('keeps the live variables the step still reads', () => {
    const names = (descriptor().config.logic_variables as Json[]).map((v) => String(v.name));
    for (const name of LIVE_VARS) expect(names).toContain(name);
  });
});
