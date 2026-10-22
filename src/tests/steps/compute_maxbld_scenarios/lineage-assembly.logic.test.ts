/**
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.10 (cited_clauses, field_citations, disclosures,
 *            trust_checks, row_trust_level), P5.12, P5.14 (trust model, missing-data register), P5.15 (INV-16, INV-17, INV-22)
 * Handbook:  Spec 133 §m.188 (M-188 part 6, Layer 3 lineage), §m.240 (M-240); Spec 132 §core.9; HELD on P3-Q1 (N6a freeze)
 *
 * P3-6 (PLAN §4; CHAT-73.nohalt): the pure lineage assembly over the P3-2..P3-5 modules. STRICT RED FIRST: this file was
 * committed-in-working-tree and run against the missing module before scripts/lib/maxbld-lineage.js was written
 * (~/Buildo-scratch/p3build/red-p3-6.txt).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CJS surface
const ROOT = path.resolve(__dirname, '../../../../');
const REL = 'scripts/lib/maxbld-lineage.js';
function mod(): Json {
  expect(fs.existsSync(path.join(ROOT, REL)), `${REL} should exist`).toBe(true);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.join(ROOT, REL)) as Json;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const VIEWMOD = require(path.join(ROOT, 'scripts/lib/maxbld-layer2-view.js')) as Json;
const VOCAB = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/vocab.json'), 'utf8')) as Json;
const LINEAGE = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reference/maxbld-field-lineage.json'), 'utf8')) as Json;
const CODES: string[] = VOCAB.disclosure_code;

const res = (target: string, unit: string, over: Json = {}): Json =>
  ({ class: 'detached_house', structure: 'principal', target, status: 'applies', value: 1, value_kind: 'number', winner_unit_id: unit, evidence_kind: 'clause', evidence_ref: unit, ...over });
const VIEW = VIEWMOD.fromLogicalRows({
  lot_gate: null, permitted_by_class: { detached_house: { status: 'permitted' } },
  rows: [res('fsi', '10.20.40.40(1)#(1)(C)'), res('height_m', '10.20.40.10(1)#(1)(A)'), res('height_storeys', '', { status: 'not_applicable', value: null, value_kind: null, winner_unit_id: null, reason: '10.20.40.10(3)' }),
    res('lot_coverage_pct', '10.20.30.40(1)#(1)(A)'), res('main_wall_height_m', '10.20.40.10(2)#(2)')],
});

describe('P3-6: cited_clauses and field_citations (P5.10; INV-16, INV-17)', () => {
  it('citedClauses = the winner unit ids of the results used, sorted and unique, nulls skipped', () => {
    const used = [VIEW.result('detached_house', 'principal', 'height_m'), VIEW.result('detached_house', 'principal', 'fsi'), VIEW.result('detached_house', 'principal', 'height_storeys'), VIEW.result('detached_house', 'principal', 'fsi')];
    expect(mod().citedClauses(used)).toEqual(['10.20.40.10(1)#(1)(A)', '10.20.40.40(1)#(1)(C)']);
  });

  it('an empty set gives an empty list (allowed only when not_evaluated)', () => {
    expect(mod().citedClauses([])).toEqual([]);
  });

  it('fieldCitations keys each field by the Layer 2 targets the lineage registry names for it, with the unit amendment status', () => {
    const lineage = { fields: [{ field: 'main_gfa_sqm', keyed: { layer2_targets: ['fsi', 'height_m', 'height_storeys'] } }, { field: 'main_height_m', keyed: { layer2_targets: ['height_m'] } }] };
    const amend = { '10.20.40.40(1)#(1)(C)': 'in_force', '10.20.40.10(1)#(1)(A)': 'not_verified' };
    const out = mod().fieldCitations({ view: VIEW, cls: 'detached_house', lineage, fields: ['main_gfa_sqm', 'main_height_m'], amendment: amend });
    expect(out.main_gfa_sqm).toEqual([{ unit_id: '10.20.40.10(1)#(1)(A)', amendment_status: 'not_verified' }, { unit_id: '10.20.40.40(1)#(1)(C)', amendment_status: 'in_force' }]);
    expect(out.main_height_m).toEqual([{ unit_id: '10.20.40.10(1)#(1)(A)', amendment_status: 'not_verified' }]);
  });

  it('a unit with no amendment status is a missing input and throws (never defaulted)', () => {
    const lineage = { fields: [{ field: 'main_height_m', keyed: { layer2_targets: ['height_m'] } }] };
    expect(() => mod().fieldCitations({ view: VIEW, cls: 'detached_house', lineage, fields: ['main_height_m'], amendment: {} })).toThrow(/amendment/);
  });

  it('a field not in the lineage registry throws', () => {
    expect(() => mod().fieldCitations({ view: VIEW, cls: 'detached_house', lineage: { fields: [] }, fields: ['nope'], amendment: {} })).toThrow(/lineage/);
  });

  it('works over the real lineage registry: every P5.10 field the modules write has a registry entry', () => {
    const names = new Set(LINEAGE.fields.map((f: Json) => f.field));
    for (const f of ['main_gfa_sqm', 'main_footprint_sqm', 'dwelling_units', 'unit_breakdown', 'coa_gfa_sqm']) expect(names.has(f), f).toBe(true);
  });

  it('buildAmendmentIndex maps a unit to its worst amendment status (in_force < partially_in_force < not_verified; none for an unamended unit)', () => {
    const prov = {
      amendment_statuses: { A: 'in_force', B: 'partially_in_force', C: 'not_verified' },
      rows: [
        { regulation_id: 'r1', units: [{ unit_id: 'r1#u' }], amendments: [{ bylaw: 'A' }] },
        { regulation_id: 'r2', units: [{ unit_id: 'r2#u' }], amendments: [{ bylaw: 'A' }, { bylaw: 'B' }] },
        { regulation_id: 'r3', units: [{ unit_id: 'r3#u' }], amendments: [{ bylaw: 'A' }, { bylaw: 'C' }] },
        { regulation_id: 'r4', units: [{ unit_id: 'r4#u' }], amendments: [] },
      ],
    };
    expect(mod().buildAmendmentIndex(prov)).toEqual({ 'r1#u': 'in_force', 'r2#u': 'partially_in_force', 'r3#u': 'not_verified', 'r4#u': 'none' });
  });
});

describe('P3-6: disclosures (P5.12; INV-21)', () => {
  it('= the row\'s P5.12 codes + the carried Layer 2 disclosures, sorted and unique', () => {
    const d = mod().assembleDisclosures({ codes: ['roof_form_alternate', 'attic_outside_gfa'], carried: ['z_carried', 'attic_outside_gfa'], registered: CODES });
    expect(d).toEqual(['attic_outside_gfa', 'roof_form_alternate', 'z_carried']);
  });
  it('an unregistered P5.12 code throws (the set is closed in vocab.json)', () => {
    expect(() => mod().assembleDisclosures({ codes: ['made_up_code'], carried: [], registered: CODES })).toThrow(/not a registered/);
  });
  it('maps every gate_flags value to its disclosure code, all registered', () => {
    const m = mod();
    for (const flag of m.GATE_FLAGS) expect(CODES, flag).toContain(m.GATE_DISCLOSURE[flag]);
  });
});

describe('P3-6: the missing-data register touching a row (P5.14 ML-1..ML-13)', () => {
  it('maps disclosure codes to the register ids they touch, and every mapped code is registered', () => {
    const m = mod();
    for (const c of Object.keys(m.DISCLOSURE_TO_ML)) expect(CODES, c).toContain(c);
    expect(m.registerItems(['front_yard_averaging', 'triangular_lot', 'existing_estimated', 'exception_not_authored', 'roof_form_alternate'])).toEqual(['ML-10', 'ML-12', 'ML-5', 'ML-7']);
    expect(m.registerItems([])).toEqual([]);
  });
});

// ---- trust checks and the row trust level -------------------------------------------------------------------------------
const GOOD_MAIN = { status: 'computed', main_footprint_sqm: 160, main_gfa_sqm: 478.08, main_storeys: 3, main_height_m: 10, main_front_setback_m: 5, main_rear_setback_m: 5, main_side_setbacks_m: [1, 1] };
const ROW = (over: Json = {}): Json => ({
  scenario: 'D', scenario_status: 'permitted', main: GOOD_MAIN, units: null, suite_gfa_sqm: 0, total_gfa_sqm: 478.08, renovation: null,
  coa: { coa_form: 'single', coa_factor: null, coa_gfa_sqm: null, coa_increment_sqm: null, coa_status: 'not_evaluated:coa_factor_unfitted:single', suite_coa_gfa_sqm: null, suite_coa_increment_sqm: null, suite_coa_status: 'not_applicable:no_suite' },
  gate_flags: [], disclosures: [], cited_clauses: ['10.20.40.10(1)#(1)(A)'], existing_storeys: null,
  ...over,
});
const CTX = (over: Json = {}): Json => ({
  lotAreaSqm: 300,
  layer2: { fsi: { status: 'applies', value: 2.0 }, lot_coverage_pct: { status: 'applies', value: 60 }, height_m: { status: 'applies', value: 10 }, height_storeys: { status: 'not_applicable' }, front_setback_m: { status: 'applies', value: 5 }, rear_setback_m: { status: 'applies', value: 5 }, side_setback_m: { status: 'applies', value: 1 } },
  provisionUnits: new Set(['10.20.40.10(1)#(1)(A)']),
  caps: { minUnits: 2, houseplexCap: 4 }, circulationShare: 0.1, plateSumSqm: 0, tableVersion: 'tv1', currentTableVersion: 'tv1',
  ...over,
});
const CFG = { trustHighMinPassPct: 100 };
const checks = (row: Json, ctx: Json = CTX()): Json => mod().trustChecks(row, ctx);

describe('P3-6: trust_checks (P5.15 row-level invariants)', () => {
  it('lists every row-level invariant id with pass | fail | n/a | not_assessed, so a reader can re-derive the level', () => {
    const c = checks(ROW());
    expect(Object.keys(c.checks)).toEqual(mod().ROW_INVARIANTS);
    for (const v of Object.values(c.checks)) expect(['pass', 'fail', 'n/a', 'not_assessed']).toContain(v);
  });

  it('INV-1 identity: new build total = main + suite; a broken total fails', () => {
    expect(checks(ROW()).checks['INV-1']).toBe('pass');
    expect(checks(ROW({ total_gfa_sqm: 500 })).checks['INV-1']).toBe('fail');
  });
  it('INV-7 FSI: main_gfa <= fsi x lot where fsi applies; n/a where it does not', () => {
    expect(checks(ROW()).checks['INV-7']).toBe('pass'); // 478.08 <= 600
    expect(checks(ROW(), CTX({ lotAreaSqm: 200 })).checks['INV-7']).toBe('fail'); // 478.08 > 400
    expect(checks(ROW(), CTX({ layer2: { ...CTX().layer2, fsi: { status: 'not_applicable' } } })).checks['INV-7']).toBe('n/a');
  });
  it('INV-8 coverage: footprint <= coverage x lot where coverage applies', () => {
    expect(checks(ROW()).checks['INV-8']).toBe('pass'); // 160 <= 180
    expect(checks(ROW({ main: { ...GOOD_MAIN, main_footprint_sqm: 190 } })).checks['INV-8']).toBe('fail');
  });
  it('INV-9 setbacks: every setback used >= the Layer 2 minimum', () => {
    expect(checks(ROW()).checks['INV-9']).toBe('pass');
    expect(checks(ROW({ main: { ...GOOD_MAIN, main_rear_setback_m: 4 } })).checks['INV-9']).toBe('fail');
  });
  it('INV-10 height and storeys: main_height <= height_m; storeys <= height_storeys unless not_applicable', () => {
    expect(checks(ROW()).checks['INV-10']).toBe('pass');
    expect(checks(ROW({ main: { ...GOOD_MAIN, main_height_m: 11 } })).checks['INV-10']).toBe('fail');
    expect(checks(ROW(), CTX({ layer2: { ...CTX().layer2, height_storeys: { status: 'applies', value: 2 } } })).checks['INV-10']).toBe('fail');
  });
  it('INV-11 units: 2 <= units <= cap on H and S; n/a on D', () => {
    const u = (n: number): Json => ({ status: 'computed', dwelling_units: n, unit_breakdown: [3, 2, 1, 0].map((floor) => ({ floor, interior_area_sqm: 90, in_gfa: floor > 0 })) });
    expect(checks(ROW({ scenario: 'H', units: u(3) })).checks['INV-11']).toBe('pass');
    expect(checks(ROW({ scenario: 'H', units: u(5) })).checks['INV-11']).toBe('fail');
    expect(checks(ROW({ scenario: 'H', units: u(1) })).checks['INV-11']).toBe('fail');
    expect(checks(ROW()).checks['INV-11']).toBe('n/a');
  });
  it('INV-12 unit area: sum of unit interior <= plates x (1 - circulation)', () => {
    const u = (a: number): Json => ({ status: 'computed', dwelling_units: 2, unit_breakdown: [{ floor: 1, interior_area_sqm: a, in_gfa: true }] });
    expect(checks(ROW({ scenario: 'H', units: u(90) }), CTX({ plateSumSqm: 100 })).checks['INV-12']).toBe('pass');
    expect(checks(ROW({ scenario: 'H', units: u(95) }), CTX({ plateSumSqm: 100 })).checks['INV-12']).toBe('fail');
  });
  it('INV-16 cited clauses all exist in bylaw-provisions', () => {
    expect(checks(ROW()).checks['INV-16']).toBe('pass');
    expect(checks(ROW({ cited_clauses: ['no.such#unit'] })).checks['INV-16']).toBe('fail');
  });
  it('INV-20 renovation columns scoped: NULL unless renovation; existing_storeys NULL on a pipeline row', () => {
    expect(checks(ROW()).checks['INV-20']).toBe('pass');
    expect(checks(ROW({ renovation: { addition: {} } })).checks['INV-20']).toBe('fail');
    expect(checks(ROW({ existing_storeys: 2 })).checks['INV-20']).toBe('fail');
  });
  it('INV-21 gates: holding => new-build not_permitted:holding_zone; every gate flag has its disclosure code', () => {
    expect(checks(ROW({ gate_flags: ['holding_zone'], scenario_status: 'not_permitted:holding_zone', disclosures: ['holding_zone'] })).checks['INV-21']).toBe('pass');
    expect(checks(ROW({ gate_flags: ['holding_zone'], scenario_status: 'permitted', disclosures: ['holding_zone'] })).checks['INV-21']).toBe('fail');
    expect(checks(ROW({ gate_flags: ['heritage_designated'], disclosures: [] })).checks['INV-21']).toBe('fail');
  });
  it('INV-23 CoA apart: only coa_* fields, and coa_gfa = main_gfa x u or NULL with a reason', () => {
    expect(checks(ROW()).checks['INV-23']).toBe('pass');
    const fitted = { ...ROW().coa, coa_factor: { value: 1.1 }, coa_gfa_sqm: 525.888, coa_increment_sqm: 47.808, coa_status: 'applies' };
    expect(checks(ROW({ coa: fitted })).checks['INV-23']).toBe('pass');
    expect(checks(ROW({ coa: { ...fitted, coa_gfa_sqm: 600 } })).checks['INV-23']).toBe('fail');
    expect(checks(ROW({ coa: { ...ROW().coa, coa_gfa_sqm: null, coa_status: 'applies' } })).checks['INV-23']).toBe('fail');
  });
  it('invariants that need modules or other rows not yet built are not_assessed (never silently n/a): INV-2, INV-3, INV-4, INV-5, INV-6, INV-13, INV-14, INV-15', () => {
    const c = checks(ROW()).checks;
    for (const id of ['INV-2', 'INV-3', 'INV-4', 'INV-5', 'INV-6', 'INV-13', 'INV-14', 'INV-15']) expect(c[id], id).toBe('not_assessed');
  });
  it('INV-22 is the level recomputation: trustLevelMatches is true only when the stored level equals the computed one', () => {
    const m = mod();
    const row = ROW();
    const level = m.rowTrustLevel({ scenario_status: row.scenario_status, ...checks(row), gateFlags: [], estimateInputs: [], totalGfaTiers: ['bylaw_derived'], tableVersion: 'tv1', currentTableVersion: 'tv1' }, CFG);
    expect(m.trustLevelMatches({ stored: level, scenario_status: row.scenario_status, ...checks(row), gateFlags: [], estimateInputs: [], totalGfaTiers: ['bylaw_derived'], tableVersion: 'tv1', currentTableVersion: 'tv1' }, CFG)).toBe(true);
    expect(m.trustLevelMatches({ stored: 'high', scenario_status: row.scenario_status, ...checks(row), gateFlags: [], estimateInputs: [], totalGfaTiers: ['bylaw_derived'], tableVersion: 'tv1', currentTableVersion: 'tv1' }, CFG)).toBe(level !== 'high' ? false : true);
  });
});

describe('P3-6: row_trust_level (P5.14 levels, computed never asserted)', () => {
  const all = (v: string): Json => Object.fromEntries(mod().ROW_INVARIANTS.map((id: string) => [id, v]));
  const base = (over: Json = {}): Json => ({ scenario_status: 'permitted', checks: all('pass'), register: [], gateFlags: [], estimateInputs: [], totalGfaTiers: ['bylaw_derived'], tableVersion: 'tv1', currentTableVersion: 'tv1', ...over });
  const lvl = (o: Json = {}, cfg: Json = CFG): string => mod().rowTrustLevel(base(o), cfg);

  it('1 not_evaluated: scenario_status not_evaluated:* wins over everything', () => {
    expect(lvl({ scenario_status: 'not_evaluated:ambiguous_zone', checks: all('fail') })).toBe('not_evaluated');
  });
  it('2 low: any failed invariant; a figure in total_gfa reading an estimate or user_input field; a stale Layer 2 table_version', () => {
    expect(lvl({ checks: { ...all('pass'), 'INV-7': 'fail' } })).toBe('low');
    expect(lvl({ totalGfaTiers: ['bylaw_derived', 'estimate'] })).toBe('low');
    expect(lvl({ totalGfaTiers: ['user_input'] })).toBe('low');
    expect(lvl({ tableVersion: 'old' })).toBe('low');
  });
  it('3 disclosed: all pass but an estimate-tier input decided the answer, a gate flag holds, or a register item touches the row', () => {
    expect(lvl({ estimateInputs: ['front_averaging'] })).toBe('disclosed');
    expect(lvl({ gateFlags: ['heritage_designated'] })).toBe('disclosed');
    expect(lvl({ register: ['ML-10'] })).toBe('disclosed');
  });
  it('4 high: every applicable invariant passes, bylaw_derived figures only, nothing touches the row; n/a checks do not count against it', () => {
    expect(lvl()).toBe('high');
    expect(lvl({ checks: { ...all('pass'), 'INV-11': 'n/a' } })).toBe('high');
  });
  it('an invariant not yet assessed holds the row below high (pass share < trust_high_min_pass_pct)', () => {
    expect(lvl({ checks: { ...all('pass'), 'INV-13': 'not_assessed' } })).toBe('disclosed');
    expect(lvl({ checks: { ...all('pass'), 'INV-13': 'not_assessed' } }, { trustHighMinPassPct: 90 })).toBe('high');
  });
  it('the CoA fields never raise or lower the level (no coa input exists in the computation)', () => {
    const src = fs.readFileSync(path.join(ROOT, REL), 'utf8');
    const body = src.slice(src.indexOf('function rowTrustLevel'), src.indexOf('function trustLevelMatches'));
    expect(body).not.toMatch(/coa/i);
  });
  it('a missing config or an unknown check value throws', () => {
    expect(() => mod().rowTrustLevel(base(), {})).toThrow(/trustHighMinPassPct/);
    expect(() => mod().rowTrustLevel(base({ checks: { 'INV-1': 'maybe' } }), CFG)).toThrow(/check value/);
  });
});

describe('P3-6: assembleLineage over the row (all five lineage fields at once)', () => {
  it('returns cited_clauses, field_citations, disclosures, trust_checks, row_trust_level; trust_checks lists the register ids touching the row', () => {
    const lineage = { fields: [{ field: 'main_height_m', keyed: { layer2_targets: ['height_m'] } }] };
    const out = mod().assembleLineage({
      row: ROW({ disclosures: [] }), ctx: CTX(), view: VIEW, cls: 'detached_house', lineage, fields: ['main_height_m'],
      amendment: { '10.20.40.10(1)#(1)(A)': 'in_force' }, usedResults: [VIEW.result('detached_house', 'principal', 'height_m')],
      codes: ['holding_zone'], carried: [], registered: CODES, estimateInputs: [], totalGfaTiers: ['bylaw_derived'], config: CFG,
    });
    expect(Object.keys(out).sort()).toEqual(['cited_clauses', 'disclosures', 'field_citations', 'row_trust_level', 'trust_checks']);
    expect(out.cited_clauses).toEqual(['10.20.40.10(1)#(1)(A)']);
    expect(out.disclosures).toEqual(['holding_zone']);
    expect(out.trust_checks.register).toEqual([]);
    expect(Object.keys(out.trust_checks.checks)).toEqual(mod().ROW_INVARIANTS);
    expect(['not_evaluated', 'low', 'disclosed', 'high']).toContain(out.row_trust_level);
  });
});

describe('P3-6: purity (Spec 132 core.9)', () => {
  it('requires nothing but sibling pure libraries and touches no database, file, env, clock or randomness', () => {
    const s = fs.readFileSync(path.join(ROOT, REL), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(s).not.toMatch(/process\.env|Date\.now|new Date|Math\.random|require\('(fs|node:fs|pg|child_process|node:crypto)'\)/);
  });
});
