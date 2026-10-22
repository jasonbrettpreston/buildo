/**
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.1-P5.4, P5.6, P5.10, P5.10a, P5.11, P5.14
 * SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (the rows read), docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-JA
 * Handbook:  Spec 132 §materializer.1 (R-EH), §core.9 (R-W compute purity), §x-stages.2 (R-EQ: commit 2 = compute + runner); HELD on P3-Q1 / P3-Q15
 *
 * P3-8 step commit 2 (DRAFT, HELD on P3-Q1 / P3-Q15): scripts/lib/compute/compute-maxbld-scenarios.js orchestrates the pure Phase 3
 * modules over a batch of parcels: the Layer 2 option-4 lot rows (CHAT-80.QP, R-JR; view bylaw_resolution_results) through the ONE accessor (fromLogicalRows), P5.2 main building, P5.4 houseplex units,
 * the P5.10a CoA tier, the P5.6/P5.7 renovation results, the P5.1 scenario status and the P3-6 lineage. The rear suite (P5.5, P3-3)
 * has no module yet and is NOT built here: its columns stay NULL and are named in NOT_POPULATED.
 * Fixtures are shaped like the source statement's rows: the lot, its permitted words (positional, decoded here like logicalRowsOf) and the decoded
 * view rows (one per class x structure x target; losers, inputs_used and disclosures are recomputed on read by Layer 2 and arrive null).
 * STRICT RED FIRST: ran against the missing module (~/Buildo-scratch/p3build/red-p3-8.txt).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CJS surface
const ROOT = path.resolve(__dirname, '../../../../');
const REL = 'scripts/lib/compute/compute-maxbld-scenarios.js';
function mod(): Json {
  expect(fs.existsSync(path.join(ROOT, REL)), `${REL} should exist`).toBe(true);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.join(ROOT, REL)) as Json;
}
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Json;
const SCOPE: Json = { ...readJson('scripts/seeds/bylaw/layer2-scope.json'), classes: ['detached_house', 'detached_houseplex', 'semi_detached_houseplex', 'semi_detached_house', 'house_with_secondary_suite'] };
const LINEAGE = readJson('docs/reference/maxbld-field-lineage.json');
/** The Spec 78 P5.11 check ids and the declared emits, in order. The step-commit-1 red suite (violations.test.ts) locks them against the descriptor. */
const CHECK_IDS = ['scenarios_scanned', 'scenario_totality', 'headline_unique', 'suite_lt_main', 'fsi_consistent', 'coverage_consistent', 'units_within_cap', 'renovation_columns_scoped', 'trust_level_computed', 'coa_apart', 'not_evaluated_share_pct'];
const EMIT_KEYS = ['scenarios_scanned', 'rows', 'rows_not_evaluated', 'rows_retracted'];
const DESC: Json = { identity: { name: 'compute_maxbld_scenarios' }, emits: EMIT_KEYS.map((key) => ({ key, type: 'number', consumers: [] })), checks: CHECK_IDS.map((id) => ({ id })) };
const PERSISTED: string[] = (LINEAGE.fields as Json[]).filter((f) => f.persisted !== false).map((f) => f.field);
const PAIRS: Array<{ structure: string; target: string }> = (SCOPE.structures as string[]).flatMap((s) => (SCOPE.targets[s] as string[]).map((t) => ({ structure: s, target: t })));

// ---- fixtures: a lot as the source statement returns it ---------------------------------------------------------------
const hex = (i: number): string => (i + 1).toString(16).padStart(64, '0');
const L2 = readJson('docs/reference/bylaw-layer2-input.json');
/** A REAL Layer 2 unit id for a target (RD zone first), so the amendment index covers every cited unit. */
const uid = (target: string): string => {
  const us = L2.body.units as Json[];
  // five P5.2 targets (the share and attic-clearance numbers) have no unit of that target in the Layer 2 input (see REPORT): fixtures cite a real height unit
  const hit = us.find((u) => u.target === target && (u.application?.zones ?? []).includes('RD')) ?? us.find((u) => u.target === target) ?? us.find((u) => u.target === 'height_m' && (u.application?.zones ?? []).includes('RD'));
  expect(hit, `a Layer 2 unit for ${target}`).toBeTruthy();
  return hit!.unit_id as string;
};
const appv = (value: number, target: string): Json => ({ status: 'applies', value, value_kind: 'number', winner_unit_id: uid(target), winner_layer: 'base', evidence_kind: 'clause', evidence_ref: uid(target), inputs_used: [], losers: [], disclosure_set_id: null });
const unl = (clause: string): Json => ({ status: 'applies', value: null, value_kind: 'unlimited', winner_unit_id: null, evidence_kind: 'clause', evidence_ref: clause, inputs_used: [], losers: [] });
const na = (clause: string): Json => ({ status: 'not_applicable', reason: clause, inputs_used: [], losers: [] });
/** The clean RD-like lot of the P3-2 vectors: Wd 8 x L 20 plate, H 10, Hw 7.5. */
const PRINCIPAL: Record<string, Json> = {
  front_setback_m: appv(5, 'front_setback_m'), rear_setback_m: appv(5, 'rear_setback_m'), side_setback_m: appv(1, 'side_setback_m'),
  height_m: appv(10, 'height_m'), main_wall_height_m: appv(7.5, 'main_wall_height_m'), height_storeys: na('10.20.40.10(3)'),
  fsi: unl('10.20.40.40(1)(C)'), lot_coverage_pct: unl('10.20.30.40(1)'), building_depth_m: unl('10.20.40.30(1)'), building_length_m: unl('10.20.40.20(1)'),
  roof_slope_max: na('10.20.40.10(4)'), upper_storey_setback_m: appv(1.4, 'upper_storey_setback_m'), element_width_pct: appv(40, 'element_width_pct'),
  main_wall_side_share_pct: appv(70, 'main_wall_side_share_pct'), main_wall_front_rear_share_pct: appv(50, 'main_wall_front_rear_share_pct'),
  attic_counted_clearance_m: appv(1.4, 'attic_counted_clearance_m'), attic_qualifying_clearance_m: appv(2, 'attic_qualifying_clearance_m'),
  attic_qualifying_share_pct: appv(80, 'attic_qualifying_share_pct'), attic_qualifying_area_m2: appv(10, 'attic_qualifying_area_m2'), dwelling_units_max: unl('10.20.40.1(3)'),
};
function lotRow(over: Json = {}, principal: Record<string, Json> = PRINCIPAL): Json {
  const rows: Json[] = [];
  for (const cls of SCOPE.classes as string[]) {
    for (const p of PAIRS) {
      const base: Json = (p.structure === 'principal' && principal[p.target]) || na(`${p.target}#na`);
      const { inputs_used: _i, losers: _l, disclosure_set_id: _d, ...cols } = base; // the view carries the eight stored fields only
      rows.push({ class: cls, structure: p.structure, target: p.target, reason: null, value: null, value_kind: null, winner_unit_id: null, winner_layer: null, evidence_kind: null, evidence_ref: null, ...cols });
    }
  }
  return {
    id: 101, lot_gate: null, permitted: (SCOPE.classes as string[]).map(() => 0), permitted_texts: (SCOPE.classes as string[]).map(() => null),
    layer2_table_version: 'a'.repeat(64), evaluator_version: 'b'.repeat(64),
    lot_size_sqm: 300, frontage_m: 10, depth_m: 30, zoning_class: 'RD', zoning_holding: false, semi_half: false,
    is_heritage_designated: false, is_in_ravine_protection_area: false, existing_width_m: null, existing_length_m: null, existing_confidence: null,
    rows,
    ...over,
  };
}
const CONFIG: Json = {
  compute_maxbld_scenarios_storey_height_m: 3, compute_maxbld_scenarios_roof_pitch: 1, compute_maxbld_scenarios_roof_assembly_depth_m: 0.3,
  compute_maxbld_scenarios_basement_livable_share: 1, compute_maxbld_scenarios_circulation_share: 0.1, compute_maxbld_scenarios_unit_min_interior_sqm: 30,
  compute_maxbld_scenarios_first_floor_elevation_m: 0, compute_maxbld_scenarios_min_dimension_m: 3, compute_maxbld_scenarios_lot_viability_margin_m: 0.5,
  compute_maxbld_scenarios_existing_confidence_min: 0.6, compute_maxbld_scenarios_trust_high_min_pass_pct: 100,
  compute_maxbld_scenarios_not_evaluated_max_pct: 100, compute_maxbld_scenarios_batch_size: 500, compute_maxbld_scenarios_houseplex_min_units: 2,
};
const RUN_AT = '2026-10-22T12:00:00.000Z';
const run = (rows: Json[], config: Json = CONFIG): Json => mod().materializeRows(rows, { config, run_at: RUN_AT, scope: SCOPE, currentTableVersion: 'a'.repeat(64) });
const byScenario = (out: Json, parcel = 101): Record<string, Json> => Object.fromEntries((out.rows.e2 as Json[]).filter((r) => r.parcel_id === parcel).map((r) => [r.scenario, r]));

describe('P3-8: the source statement (R-EH (a))', () => {
  it('pages the Layer 2 lots by parcel id and reads their decoded results from the option-4 view (CHAT-80.QP, R-JR), and only reads', () => {
    const s = mod().buildSourceSql({}, CONFIG, {});
    expect(s.batch_sql).toMatch(/FROM bylaw_resolution_lots/);
    expect(s.batch_sql).toMatch(/bylaw_resolution_results/);
    expect(s.batch_sql).not.toMatch(/bylaw_resolution_(profiles|cells|signatures|disclosure_sets)/); // form C is gone
    expect(s.batch_sql).not.toMatch(/pointers|generate_series|substring/i);
    expect(s.batch_sql).toMatch(/ORDER BY[^;]*parcel_id/);
    expect(s.batch_sql).toMatch(/LIMIT \$2/);
    expect(s.batch_binds).toEqual(['last_key', 'batch_size']);
    expect(`${s.count_sql} ${s.batch_sql}`).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER)\b/i);
  });
  it('the compute knows no stored form: no form C name appears in its code, and no profile or cell table in its declared relations', () => {
    const s = fs.readFileSync(path.join(ROOT, REL), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(s).not.toMatch(/fromCellRows|entriesFromPointers|pointers_hex|cellsById|disclosureSets|collapsed_into|(?<!permitted_)by_class/);
    expect(JSON.stringify(mod().DECLARED)).not.toMatch(/profiles|cells/);
  });
});

describe('P3-8: materializeRows over a clean permitted lot', () => {
  it('writes one row per produced scenario (S needs semi_half; RF needs a basement), keyed (parcel_id, scenario), and retracts the batch\'s parcel ids first', () => {
    const out = run([lotRow()]);
    expect(Object.keys(byScenario(out)).sort()).toEqual(['detached_house', 'detached_houseplex', 'house_with_secondary_suite', 'renovation_addition', 'renovation_basement', 'renovation_envelope_expansion', 'renovation_interior']);
    expect(out.replace_keys.e1).toEqual([101]);
    expect(Object.keys(out.rows)).toEqual(['e2']);
  });

  it('every row carries exactly the persisted lineage fields, nulls included (INV-24 both ways)', () => {
    for (const r of run([lotRow()]).rows.e2 as Json[]) expect(Object.keys(r).sort()).toEqual([...PERSISTED].sort());
  });

  it('the detached_house row: the P3-2 vector 478.08 (pitched headline via the front/rear pair), statuses through layer2-map, units 1', () => {
    const d = byScenario(run([lotRow()])).detached_house as Json;
    expect(d.scenario_status).toBe('permitted');
    expect(d.building_class).toBe('detached_house');
    expect(d.main_gfa_sqm).toBeCloseTo(478.08, 9);
    expect(d.main_footprint_sqm).toBeCloseTo(160, 9);
    expect(d.roof_form_headline).toBe('pitched_attic');
    expect(d.gfa_flat_sqm).toBeCloseTo(457.6, 9);
    expect(d.main_storeys).toBe(3);
    expect(d.dwelling_units).toBe(1);
    expect(d.total_gfa_sqm).toBeCloseTo(478.08, 9);
    expect(d.main_side_setbacks_m).toEqual({ side_1: 1, side_2: 1, street_side: null, beyond_17m: null });
    expect(d.fsi_status).toBe('unlimited:10.20.40.40(1)(C)');
    expect(d.storeys_status).toBe('not_applicable:10.20.40.10(3)');
    expect(d.height_status).toBe('computed');
    expect(d.basement_livable_sqm).toBeCloseTo(160, 9);
    expect(d.first_floor_elevation_m).toBe(0);
    expect(d.is_headline).toBeDefined();
  });

  it('the detached_houseplex row counts units through P5.4 (4 floors with the basement, cap 4) and the house_with_secondary_suite row has 2 (O-9)', () => {
    const o = byScenario(run([lotRow()]));
    expect(o.detached_houseplex!.dwelling_units).toBe(4);
    expect(o.detached_houseplex!.unit_breakdown).toHaveLength(4);
    expect(o.detached_houseplex!.avg_unit_gfa_sqm).toBeGreaterThan(0);
    expect(o.house_with_secondary_suite!.dwelling_units).toBe(2);
  });

  it('exactly one is_headline row: the permitted new-build row with the largest total_gfa_sqm (tie: catalogue order); never a renovation row', () => {
    const rows = (run([lotRow()]).rows.e2 as Json[]).filter((r) => r.parcel_id === 101);
    const heads = rows.filter((r) => r.is_headline);
    expect(heads).toHaveLength(1);
    const best = rows.filter((r) => ['detached_house', 'detached_houseplex', 'house_with_secondary_suite'].includes(r.scenario) && r.scenario_status === 'permitted').sort((a, b) => b.total_gfa_sqm - a.total_gfa_sqm)[0];
    expect(heads[0]!.scenario).toBe(best!.scenario);
    for (const r of rows.filter((x) => x.scenario.startsWith('renovation'))) expect(r.is_headline).toBe(false);
  });

  it('the CoA tier is unfitted at release (LC-60) and apart from the as-of-right numbers (INV-23)', () => {
    const d = byScenario(run([lotRow()])).detached_house as Json;
    expect(d.coa_status).toBe('not_evaluated:coa_factor_unfitted:single');
    expect(d.coa_gfa_sqm).toBeNull();
    expect(d.coa_form).toBe('single');
    expect(d.trust_checks.checks['INV-23']).toBe('pass');
  });

  it('lineage: cited clauses are the winner unit ids used (sorted), citations carry the amendment status, trust is computed from the row\'s own checks', () => {
    const d = byScenario(run([lotRow()])).detached_house as Json;
    expect(d.cited_clauses).toEqual([...d.cited_clauses].sort());
    expect(d.cited_clauses).toContain(uid('height_m'));
    expect(d.field_citations.main_height_m.map((c: Json) => c.unit_id)).toContain(uid('height_m'));
    expect(d.field_citations.main_height_m[0]).toHaveProperty('amendment_status');
    expect(['high', 'disclosed', 'low', 'not_evaluated']).toContain(d.row_trust_level);
    expect(d.trust_checks.checks['INV-7']).toBe('n/a');
    expect(d.disclosures).toEqual([...d.disclosures].sort());
    expect(d.disclosures).toContain('roof_form_alternate');
  });

  it('run lineage: the Layer 2 table and evaluator versions come from the lot row; computed_at is the run clock passed in; code_version is the module\'s own', () => {
    const d = byScenario(run([lotRow()])).detached_house as Json;
    expect(d.layer2_table_version).toBe('a'.repeat(64));
    expect(d.evaluator_version).toBe('b'.repeat(64));
    expect(d.computed_at).toBe(RUN_AT);
    expect(d.code_version).toBe(mod().CODE_VERSION);
  });
});

describe('P3-8: gates, holding zone and renovation', () => {
  it('a Layer 2 lot gate gives not_evaluated:<gate> on every row, no numbers, a disclosure, trust not_evaluated', () => {
    const out = run([lotRow({ lot_gate: 'exception_not_authored', permitted: CONFIG_CLASSES().map(() => 2), permitted_texts: CONFIG_CLASSES().map(() => 'exception_not_authored') })]);
    for (const r of out.rows.e2 as Json[]) {
      expect(r.scenario_status).toBe('not_evaluated:exception_not_authored');
      expect(r.main_gfa_sqm).toBeNull();
      expect(r.disclosures).toContain('exception_not_authored');
      expect(r.gate_flags).toContain('exception_not_authored');
      expect(r.row_trust_level).toBe('not_evaluated');
    }
  });

  it('a holding zone makes the new-build rows not_permitted:holding_zone and computes the renovation rows with the disclosure (LC-12)', () => {
    const o = byScenario(run([lotRow({ zoning_holding: true, existing_width_m: 8, existing_length_m: 10 })]));
    expect(o.detached_house!.scenario_status).toBe('not_permitted:holding_zone');
    expect(o.detached_house!.main_gfa_sqm).toBeNull();
    expect(o.renovation_addition!.scenario_status).toBe('permitted');
    expect(o.renovation_addition!.disclosures).toContain('holding_zone');
  });

  it('a renovation with no existing-house input is not_evaluated:no_existing_house with the renovation columns NULL (INV-20)', () => {
    const r = byScenario(run([lotRow()])).renovation_addition as Json;
    expect(r.scenario_status).toBe('not_evaluated:no_existing_house');
    expect(r.existing_footprint_sqm).toBeNull();
    expect(r.addition_back_gfa_sqm).toBeNull();
  });

  it('with an estimated existing house the renovation rows compute; existing_storeys stays NULL (O-13) and the storeys-dependent fields carry the closed reason in field_status', () => {
    const o = byScenario(run([lotRow({ existing_width_m: 8, existing_length_m: 10, existing_confidence: 0.9 })]));
    const ra = o.renovation_addition as Json;
    expect(ra.scenario_status).toBe('permitted');
    expect(ra.existing_footprint_sqm).toBe(80);
    expect(ra.existing_storeys).toBeNull();
    expect(ra.existing_source).toBe('estimated');
    expect(ra.existing_low_confidence).toBe(false);
    expect(ra.renovation_envelope_footprint_sqm).toBeCloseTo(160, 9);
    expect(ra.addition_back_footprint_sqm).toBe(80);
    expect(ra.addition_back_gfa_sqm).toBe(240);
    expect(ra.addition_up_gfa_sqm).toBeNull();
    expect(ra.field_status.addition_up_gfa_sqm).toBe('not_evaluated:needs_user_input:existing_storeys');
    expect(ra.total_gfa_sqm).toBeNull();
    expect(ra.disclosures).toContain('existing_storeys_needed');
    expect((o.renovation_basement as Json).basement_livable_gain_sqm).toBe(80);
    expect((o.renovation_envelope_expansion as Json).renovation_envelope_gfa_sqm).toBeCloseTo(478.08, 9);
  });

  it('low confidence is derived from existing_confidence_min; a missing confidence reads as 0 (no primary building linked)', () => {
    const ra = byScenario(run([lotRow({ existing_width_m: 8, existing_length_m: 10, existing_confidence: null })])).renovation_addition as Json;
    expect(ra.existing_confidence).toBeNull();
    expect(ra.existing_low_confidence).toBe(true);
    expect(ra.disclosures).toContain('existing_low_confidence');
  });

  it('S exists only where semi_half holds; RF only where the owner says a basement exists (never from the pipeline)', () => {
    const o = byScenario(run([lotRow({ semi_half: true })]));
    expect(o.semi_detached_houseplex).toBeDefined();
    expect(o.renovation_basement_finish).toBeUndefined();
  });
});

function CONFIG_CLASSES(): string[] { return SCOPE.classes as string[]; }

describe('P3-8: determinism, errors, and the batch', () => {
  it('is deterministic, re-entrant, does not mutate its input, and orders rows by (parcel_id, scenario catalogue order)', () => {
    const rows = [lotRow({ id: 202 }), lotRow({ id: 101 })];
    const before = JSON.stringify(rows);
    const a = run(rows);
    expect(JSON.stringify(rows)).toBe(before);
    expect(run(rows)).toEqual(a);
    const ids = (a.rows.e2 as Json[]).map((r) => r.parcel_id);
    expect(ids).toEqual([...ids].sort((x, y) => x - y));
    expect(a.replace_keys.e1).toEqual([101, 202]);
  });

  it('a missing logic variable or a lot missing a required column throws (never defaulted)', () => {
    expect(() => run([lotRow()], { ...CONFIG, compute_maxbld_scenarios_roof_pitch: undefined })).toThrow(/compute_maxbld_scenarios_roof_pitch/);
    expect(() => run([lotRow({ lot_size_sqm: undefined })])).toThrow(/lot_size_sqm/);
  });

  it('matched carries the run tallies the checks read', () => {
    const m = run([lotRow(), lotRow({ id: 102, lot_gate: 'ambiguous_zone' })]).matched;
    expect(m.parcels).toBe(2);
    expect(m.rows).toBe(14);
    expect(m.rows_not_evaluated).toBeGreaterThanOrEqual(7);
    expect(m.not_evaluated_by_reason.ambiguous_zone).toBe(7);
    expect(m.rows_retracted).toBe(2);
  });
});

describe('P3-8: NOT_POPULATED is the explicit ratchet of columns no module writes yet', () => {
  it('names only persisted fields; every other persisted field is populated in some row of a rich fixture', () => {
    const np: string[] = mod().NOT_POPULATED;
    for (const f of np) expect(PERSISTED, f).toContain(f);
    const rich = run([lotRow({ existing_width_m: 8, existing_length_m: 10, existing_confidence: 0.9 }), lotRow({ id: 103, semi_half: true, zoning_holding: true }), lotRow({ id: 104 }, { ...PRINCIPAL, building_depth_m: appv(14, 'building_depth_m'), building_length_m: appv(15, 'building_length_m') })]).rows.e2 as Json[];
    const seen = new Set<string>();
    for (const r of rich) for (const [k, v] of Object.entries(r)) if (v !== null && v !== undefined) seen.add(k);
    const never = PERSISTED.filter((f) => !seen.has(f)).sort();
    const design: string[] = mod().NULL_BY_DESIGN;
    expect(design.filter((x) => np.includes(x))).toEqual([]); // the two lists are disjoint
    expect(never).toEqual([...np, ...design].sort());
  });
  it('the rear suite (P5.5, P3-3) is named as not built: every suite_ column is NOT_POPULATED', () => {
    const np: string[] = mod().NOT_POPULATED;
    for (const f of PERSISTED.filter((x) => x.startsWith('suite_') && !x.startsWith('suite_coa'))) expect(np, f).toContain(f);
    expect(mod().REAR_SUITE).toBe('not_built');
  });
});

describe('P3-8: the checks and the runner contract', () => {
  it('the dispatch table keys are exactly the descriptor check ids, in declaration order (Spec 122 §5.5 (1))', () => {
    expect(Object.keys(mod().checks)).toEqual((DESC.checks as Json[]).map((c) => c.id));
  });

  it('compute(ctx) runs each selected check over ctx.matched and returns the declared emits as records_meta', async () => {
    const seen: Json = {};
    const m = run([lotRow()]).matched;
    const ctx = {
      descriptor: DESC, checks: (DESC.checks as Json[]).map((c) => c.id), matched: mod().finalizeMatched(m, { config: CONFIG, post: {}, count: { parcels_scanned: 1 } }),
      report: (id: string, v: Json) => { seen[id] = v; }, log: { error: () => undefined },
    };
    const res = await mod().compute(ctx);
    expect(Object.keys(seen)).toEqual((DESC.checks as Json[]).map((c) => c.id));
    for (const id of ['scenario_totality', 'headline_unique', 'fsi_consistent', 'coverage_consistent', 'units_within_cap', 'renovation_columns_scoped', 'trust_level_computed', 'coa_apart']) expect(seen[id].violations, id).toBe(0);
    expect(res.records_meta.rows).toBe(7);
    expect(Object.keys(res.records_meta).sort()).toEqual((DESC.emits as Json[]).map((e) => e.key).filter((k: string) => res.records_meta[k] !== undefined).sort());
  });

  it('scenario_totality fails a parcel with no detached_house row, headline_unique fails two headlines', () => {
    const m = mod().tally([{ parcel_id: 1, scenario: 'detached_houseplex', is_headline: true, trust_checks: { checks: {} }, row_trust_level: 'not_evaluated', scenario_status: 'not_evaluated:x' }, { parcel_id: 2, scenario: 'detached_house', is_headline: true, trust_checks: { checks: {} }, scenario_status: 'permitted' }, { parcel_id: 2, scenario: 'detached_houseplex', is_headline: true, trust_checks: { checks: {} }, scenario_status: 'permitted' }]);
    expect(m.scenario_totality).toBe(1);
    expect(m.headline_unique).toBe(1);
  });

  it('finalizeMatched derives not_evaluated_share_pct; buildPostSql is read-only', () => {
    const f = mod().finalizeMatched({ rows: 10, rows_not_evaluated: 3, parcels: 2, violations: {} }, { config: CONFIG, post: {}, count: { parcels_scanned: 2 } });
    expect(f.not_evaluated_share_pct).toBe(30);
    const p = mod().buildPostSql({}, CONFIG);
    expect(p.post_sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER)\b/i);
  });
});

describe('P3-8: compute purity (Spec 132 core.9; gate E)', () => {
  it('requires only declared static data and the pure Phase 3 libraries; no database, file, env, clock or randomness in code', () => {
    const s = fs.readFileSync(path.join(ROOT, REL), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(s).not.toMatch(/process\.env|Date\.now|new Date|Math\.random|require\('(fs|node:fs|pg|child_process|node:crypto)'\)|require\('\.\.\/pipeline'\)|require\('\.\.\/step/);
    const reqs = [...s.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1] as string);
    for (const r of reqs) expect(r, r).toMatch(/^(\.\.\/|\.\.\/\.\.\/|\.\.\/\.\.\/\.\.\/)/);
  });
});

describe('P3-8: the compute gates see this module clean (Spec 124 R-BZ/R-CA gates G0..G4; gate E)', () => {
  const gate = async (rel: string): Promise<Json> => (await import(pathToFileURL(path.join(ROOT, rel)).href)) as Json;
  it('G0 closure: the module is a compute entry whose dependencies are in the closure, and the verdict is PASS', async () => {
    const m = await gate('scripts/analysis/gates/compute-closure.mjs');
    const c = m.computeClosure({ repoRoot: ROOT });
    expect(JSON.stringify(c.modules)).toContain('maxbld-main-building.js'); // the entry's dependencies (the entry itself is not listed)
    expect(m.verdict(c)).toBe('PASS');
  });
  it('gate E (compute-literals): no hard-coded tunable or shape violation in this module', () => {
    const out = execFileSync('node', ['scripts/analysis/gates/compute-literals.mjs', '--list'], { cwd: ROOT, encoding: 'utf8' });
    expect(out).not.toContain('compute-maxbld-scenarios');
  });
});

describe('P3-Q8 (EVE.P3-Q8): the minimum houseplex unit count is a pinned logic variable, not a registry proposal', () => {
  it('reads compute_maxbld_scenarios_houseplex_min_units; a missing variable throws; a higher floor makes a houseplex not_buildable:800.50(181)', () => {
    expect(() => run([lotRow()], { ...CONFIG, compute_maxbld_scenarios_houseplex_min_units: undefined })).toThrow(/houseplex_min_units/);
    const o = byScenario(run([lotRow()], { ...CONFIG, compute_maxbld_scenarios_houseplex_min_units: 5 }));
    expect(o.detached_houseplex!.scenario_status).toBe('not_buildable:800.50(181)'); // 4 units < 5
    expect(byScenario(run([lotRow()])).detached_houseplex!.dwelling_units).toBe(4); // floor 2: the 4 units stand
  });
  it('the registry no longer carries a proposed value for it; the arm reports it sourced from the seed migration', () => {
    const reg = readJson('scripts/analysis/phase3/phase3-literals.json');
    const e = (reg.literals as Json[]).find((l) => l.module_input === 'caps.minUnits')!;
    expect(e.proposed_value).toBeUndefined();
    expect(String(e.source)).toContain('compute_maxbld_scenarios_houseplex_min_units');
  });
  it('migration 283 seeds it in the P3-1 (R-CV) form with default 2, and says it is pinned (min = max)', () => {
    const sql = fs.readFileSync(path.join(ROOT, 'migrations/283_compute_maxbld_scenarios_logic_variables.sql'), 'utf8');
    const m = /\('compute_maxbld_scenarios_houseplex_min_units',\s*2,\s*'([^']*(?:''[^']*)*)'\)/.exec(sql);
    expect(m, 'seed row').not.toBeNull();
    expect(m![1]).toMatch(/Pinned min = max/);
    expect(m![1]).toMatch(/800\.50\(181\)/);
  });
});

describe('P3-8 fix: dwelling_units for the new-build scenarios D and 2 come from the scenario class definition (vocab scenario_class_units, M-160)', () => {
  it('D and 2 carry house_units of detached_house and house_with_secondary_suite, and no count is typed in the module', () => {
    const units = readJson('scripts/seeds/bylaw/vocab.json').scenario_class_units as Json;
    const o = byScenario(run([lotRow()]));
    expect(o.detached_house!.dwelling_units).toBe(units.detached_house.house_units);
    expect(o.house_with_secondary_suite!.dwelling_units).toBe(units.house_with_secondary_suite.house_units);
    const s = fs.readFileSync(path.join(ROOT, REL), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(s).not.toMatch(/dwelling_units\s*=\s*[0-9]/);
    expect(s).toContain('scenario_class_units');
  });
});

describe('P3-8 fix: gate E / purity G2 is reproducible from commits (the module declares its own relations)', () => {
  const scan = async (src: string): Promise<Json[]> => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cmpurity-'));
    fs.mkdirSync(path.join(tmp, 'scripts/lib/compute'), { recursive: true });
    fs.writeFileSync(path.join(tmp, REL), src);
    const m = (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/gates/compute-purity.mjs')).href)) as Json;
    return (await m.scanPurity({ repoRoot: tmp, files: [REL] })) as Json[];
  };
  it('exports a DECLARED {reads, writes} literal naming exactly the relations its SQL touches', () => {
    const d = mod().DECLARED as Json;
    expect([...d.reads].sort()).toEqual(['bylaw_resolution_lots', 'bylaw_resolution_results', 'bylaw_resolution_texts', 'parcel_maxbld_scenarios', 'parcels']);
    expect(d.writes).toEqual(['parcel_maxbld_scenarios']);
  });
  it('with NO sibling descriptor, G1..G4 report zero sites over the module as committed (the descriptor draft is not needed)', async () => {
    expect((await scan(fs.readFileSync(path.join(ROOT, REL), 'utf8'))).map((s) => `${s.code}@${s.line}`)).toEqual([]);
  });
  it('and G2 actually runs on it: dropping a relation from DECLARED yields a compute-undeclared-relation site', async () => {
    const src = fs.readFileSync(path.join(ROOT, REL), 'utf8').replace("'bylaw_resolution_texts', ", '');
    const sites = await scan(src);
    expect(sites.some((s) => /undeclared/.test(String(s.code)) || /undeclared/.test(String(s.rule)))).toBe(true);
  });
});
