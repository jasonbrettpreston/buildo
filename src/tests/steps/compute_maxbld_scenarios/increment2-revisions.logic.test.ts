// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-476, M-458, M-475, M-487 (MB-27 increment 2; queue :11 "Off always wins")
//
// MB-27 · McBylaws queue · lane K · stage 6. RED FIRST: the runner has no `revisions` (an increment-1 row carrying its
// increment-2 formula behind its own switch), so a switched-off increment-2 formula cannot revert to the increment-1
// formula (M-476) and an increment-2 row with no increment-1 formula cannot be left out when switched off (M-476 dated
// note, D3 a). Worked examples: STS-2, STS-7 (M-458, R3-01), REG-11 (M-476), ROOF-24 (D3 a).
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const clone = (x: unknown): Json => JSON.parse(JSON.stringify(x));

const loadSeeds = (): Json => ({
  catalogue: readJson('scripts/seeds/bylaw/layer3-catalogue.json'),
  switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
  buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
  logicVariables: readJson('scripts/seeds/logic_variables.json'),
  vocab: readJson('scripts/seeds/bylaw/vocab.json'),
  layer2Classes: readJson('scripts/seeds/bylaw/layer2-scope.json').classes,
  layer2Options: readJson('scripts/seeds/bylaw/layer2-scope.json').options, // operator "a" on Q-A: R3-11 extended fails closed without the declared scope
});
const num = (value: number, clause = 'c'): Json => ({ s: 'applies', kind: 'number', value, clause });
const UNREG: Json = { s: 'applies', kind: 'unregulated', value: null, clause: null };

/** A0375 (R corner, no street-side article) after the reload M-475 owes: the street side stored unregulated by absence. */
const a0375 = (street: Json): Json => ({
  l2: { side_setback_m: num(0.45, '10.10.40.70(4)#(4)(A)'), side_setback_street_m: street },
  geometry: { lot_frontage_m: 4.99, lot_depth_m: 31.38, lot_area_m2: 156.63 },
  flags: { corner_lot: true },
});

describe('MB-27 increment 2: revisions and the switchboard (M-476, M-458)', () => {
  let R: Json;
  let C: Json;
  let SEEDS: Json;
  beforeAll(() => {
    R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    C = req(path.join(ROOT, 'scripts/lib/compute/maxbld/catalogue.js')) as Json;
    SEEDS = loadSeeds();
  });

  it('V1 the two increment-1 rows with an increment-2 formula carry it as one revision behind its own switch; ids stay unique', () => {
    const ids = SEEDS.catalogue.rows.map((r: Json) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const revised = SEEDS.catalogue.rows.filter((r: Json) => Array.isArray(r.revisions)).map((r: Json) => r.id);
    expect(revised).toEqual(['buildable_width_m', 'gfa_max_m2']);
    for (const id of revised) {
      const row = SEEDS.catalogue.rows.find((r: Json) => r.id === id);
      expect(row.increment).toBe('1');
      expect(row.revisions).toHaveLength(1);
      expect(row.revisions[0].increment).toBe('2');
      expect(row.revisions[0].switch).toBe(`formula:${id}:increment_2`);
      expect(SEEDS.switchboard.rows.map((s: Json) => s.id)).toContain(row.revisions[0].switch);
    }
  });

  it('V2 validateCatalogue reads a revision: an unknown switch, a parse error or an unknown row in it is a violation', () => {
    const s = clone(SEEDS);
    const row = s.catalogue.rows.find((r: Json) => r.id === 'buildable_width_m');
    row.revisions[0].switch = 'formula:no_such_switch';
    row.revisions[0].expression = 'lot_frontage_m − no_such_row';
    const v = C.validateCatalogue(s, ['1', '2']).join('\n');
    expect(v).toContain('row buildable_width_m revision 2: switch formula:no_such_switch is not in the switchboard');
    expect(v).toContain('row buildable_width_m revision 2: no_such_row resolves to nothing');
    row.revisions[0].expression = 'lot_frontage_m −';
    expect(C.validateCatalogue(s, ['1', '2']).join('\n')).toContain('row buildable_width_m revision 2: parse_error');
  });

  it('V3 the row order puts a revised row after every row its revision reads', () => {
    const order: string[] = C.topoOrder(SEEDS.catalogue);
    for (const dep of ['gfa_flat_m2', 'gfa_pitched_a_m2', 'gfa_pitched_b_m2']) expect(order.indexOf('gfa_max_m2')).toBeGreaterThan(order.indexOf(dep));
  });

  it('STS-2 (M-458) the revision on: a corner lot whose street side is stored unregulated reads the side yard, 4.99 − 0.45 − 0.45 = 4.09 m', () => {
    const out = R.runRow('buildable_width_m', { ...a0375(UNREG), seeds: SEEDS });
    expect(out.status).toBe('computed');
    expect(out.value).toBeCloseTo(4.09, 9);
    expect(out.switches).toContainEqual({ id: 'formula:buildable_width_m:increment_2', state: 'on' });
  });

  it('M-476 the revision off: the increment-1 formula is read (the street side itself, unregulated, so no width) and the switch is listed as off', () => {
    const out = R.runRow('buildable_width_m', { ...a0375(UNREG), seeds: SEEDS, switches: { 'formula:buildable_width_m:increment_2': 'off' } });
    expect(out.status).toBe('unregulated');
    expect(out.value).toBeNull();
    expect(out.switches).toContainEqual({ id: 'formula:buildable_width_m:increment_2', state: 'off' });
  });

  it('queue :11 off always wins: the increment-1 switch off refuses the row even with its revision on', () => {
    const out = R.runRow('buildable_width_m', { ...a0375(UNREG), seeds: SEEDS, switches: { 'formula:buildable_width_m': 'off' } });
    expect(out.status).toBe('not_evaluated');
    expect(out.reason).toBe('switched_off:formula:buildable_width_m');
  });

  it('STS-7 (R3-01) a street side stored not_evaluated for another reason is never the side yard: the reason is carried', () => {
    const out = R.runRow('buildable_width_m', { ...a0375({ s: 'not_evaluated', kind: null, value: null, clause: null, reason: 'condition_unknown:x' }), seeds: SEEDS });
    expect(out.status).toBe('not_evaluated');
    expect(out.reason).toBe('condition_unknown:x');
  });

  it('M-475 a stored no_candidate is not unregulated: the revision keeps it not evaluated (STS-2 before the reload)', () => {
    const out = R.runRow('buildable_width_m', { ...a0375({ s: 'not_evaluated', kind: null, value: null, clause: null, reason: 'no_candidate' }), seeds: SEEDS });
    expect(out.status).toBe('not_evaluated');
    expect(out.reason).toBe('no_candidate');
  });

  it('REG-11 (M-476) gfa_max_m2 with its increment-2 switch off is the increment-1 value 3 × 79.1505 = 237.4515, the switch listed as off', () => {
    const rows = { footprint_max_m2: { value: 79.1505 }, storeys_max: { value: 3 } };
    const l2 = { fsi: { s: 'applies', kind: 'unlimited', value: null, clause: '10.80.40.40(1)#(1)(B)' } };
    const out = R.runRow('gfa_max_m2', { seeds: SEEDS, rows, l2, geometry: { lot_area_m2: 318.4 }, switches: { 'formula:gfa_max_m2:increment_2': 'off' } });
    expect(out.status).toBe('computed');
    expect(out.value).toBeCloseTo(237.4515, 9);
    expect(out.switches).toContainEqual({ id: 'formula:gfa_max_m2:increment_2', state: 'off' });
  });

  it('ROOF-24 (D3 a) gfa_pitched_m2 switched off is not shown by runAllRows, and the headline, which reads the arm rows, is unchanged', () => {
    const rows = {
      footprint_max_m2: { value: 100 }, storeys_max: { value: 3 },
      gfa_flat_m2: { value: 250 }, gfa_pitched_a_m2: { value: 280 }, gfa_pitched_b_m2: { value: 260 },
    };
    const l2 = { fsi: { s: 'applies', kind: 'unlimited', value: null, clause: 'c' } };
    const geometry = { lot_area_m2: 400 };
    const head2 = { 'formula:gfa_max_m2:increment_2': 'on', 'formula:gfa_flat_m2': 'on', 'formula:gfa_pitched_a_m2': 'on', 'formula:gfa_pitched_b_m2': 'on' };
    const on = R.runAllRows({ seeds: SEEDS, rows, l2, geometry, switches: head2 });
    const off = R.runAllRows({ seeds: SEEDS, rows, l2, geometry, switches: { ...head2, 'formula:gfa_pitched_m2': 'off' } });
    expect(on.map((r: Json) => r.row)).toContain('gfa_pitched_m2');
    expect(off.map((r: Json) => r.row)).not.toContain('gfa_pitched_m2');
    const head = (list: Json[]): Json => list.find((r: Json) => r.row === 'gfa_max_m2') as Json;
    expect([head(off).status, head(off).value, head(off).flags]).toEqual([head(on).status, head(on).value, head(on).flags]);
    expect(head(off).value).toBe(280);
    expect(head(off).flags).toContain('headline:gfa_pitched_a_m2');
  });

  it('D3 a an increment-1 row switched off is still shown (not_evaluated, switched_off): only rows with no increment-1 formula are left out', () => {
    const off = R.runAllRows({ seeds: SEEDS, rows: { footprint_max_m2: { value: 1 } }, switches: { 'formula:height_max_m': 'off' } });
    const h = off.find((r: Json) => r.row === 'height_max_m');
    expect(h && h.reason).toBe('switched_off:formula:height_max_m');
  });
});

/** P3's vocab.design_options.roof_form (M-465), the shape R1 validates against (values[].option). */
const ROOF_FORM = { token: 'flat_or_shallow_roof', values: [{ option: 'flat_or_shallow_roof', holds: true }, { option: 'pitched', holds: false }] };
const withOptions = (s: Json): Json => { const c = clone(s); c.vocab.design_options = { roof_form: ROOF_FORM }; return c; };
const optionViolations = (list: string[]): string[] => list.filter((v) => v.includes('design_option'));

describe('MB-27 R1: design_option tags on the catalogue rows (plan-reader-and-mech.md 1.4; operator "Q-r1 a")', () => {
  let C: Json;
  let SEEDS: Json;
  beforeAll(() => {
    C = req(path.join(ROOT, 'scripts/lib/compute/maxbld/catalogue.js')) as Json;
    SEEDS = loadSeeds();
  });

  it('R1-1 the flat run rows are setback_plate_m2 and gfa_flat_m2; the pitched run rows are the arm, attic, pitched GFA and mechanical rows; the rest carry no option', () => {
    const tag = (id: string): string | null => { const r = SEEDS.catalogue.rows.find((x: Json) => x.id === id); return r && r.design_option ? r.design_option.roof_form : null; };
    expect(SEEDS.catalogue.rows.filter((r: Json) => tag(r.id) === 'flat_or_shallow_roof').map((r: Json) => r.id)).toEqual(['setback_plate_m2', 'gfa_flat_m2']);
    for (const id of ['roof_pitch_a', 'half_span_b_m', 'roof_assembly_depth_a_m', 'roof_vertical_thickness_b_m', 'attic_counted_floor_a_m2', 'gfa_pitched_a_m2', 'gfa_pitched_b_m2', 'gfa_pitched_m2', 'mechanical_attic_outside_gfa_b_m2', 'total_floor_area_pitched_a_m2']) expect(tag(id), id).toBe('pitched');
    for (const id of ['storeys_max', 'footprint_max_m2', 'wall_storeys', 'storeys_above_wall', 'attic_eave_clearance_m', 'front_rear_wall_width_m', 'gfa_max_m2', 'buildable_width_m']) expect(tag(id), id).toBeNull();
    for (const r of SEEDS.catalogue.rows) if (r.increment === '1') expect(r.design_option, r.id).toBeUndefined();
  });

  it('R1-2 (OR-9) with the design options declared, the tags raise no violation', () => {
    expect(optionViolations(C.validateCatalogue(withOptions(SEEDS), ['1', '2']))).toEqual([]);
  });

  it('R1-3 (OR-9) an unknown option key or value is a violation', () => {
    const s = withOptions(SEEDS);
    s.catalogue.rows.find((r: Json) => r.id === 'gfa_flat_m2').design_option = { roof_form: 'mansard' };
    s.catalogue.rows.find((r: Json) => r.id === 'setback_plate_m2').design_option = { roof_colour: 'flat_or_shallow_roof' };
    const v = optionViolations(C.validateCatalogue(s, ['1', '2']));
    expect(v).toContain('row gfa_flat_m2: design_option roof_form value mansard is not an option of vocab.design_options.roof_form');
    expect(v).toContain('row setback_plate_m2: design_option key roof_colour is not a vocab.design_options key');
  });

  it('R1-4 fail closed: with no vocab.design_options every tag is a violation, and a tag must be an object of one key', () => {
    const s = clone(SEEDS);
    delete s.vocab.design_options;
    expect(optionViolations(C.validateCatalogue(s, ['1', '2'])).length).toBe(SEEDS.catalogue.rows.filter((r: Json) => r.design_option).length);
    const t2 = withOptions(SEEDS);
    t2.catalogue.rows.find((r: Json) => r.id === 'gfa_flat_m2').design_option = 'flat_or_shallow_roof';
    expect(optionViolations(C.validateCatalogue(t2, ['1', '2']))).toContain('row gfa_flat_m2: design_option must be an object of exactly one vocab.design_options key');
  });
});

describe('MB-27 Q-DEFAULT (operator "Q-default a"): the increment-2 headline revision and the rows it reads, switched on (the switch-on, D-5)', () => {
  let R: Json;
  let SEEDS: Json;
  beforeAll(() => {
    R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    SEEDS = loadSeeds();
  });

  // MB-27 switch-on (operator D-5, "all recommended"): QD-1 and QD-2 become the switch-on locks (Q-default a: "switched on, by one
  // data change with its own prereg, after the axis night and the Layer 3 reader (R2) land")
  it('QD-1 the only off switch is reading:shape_calibration: the four Q-DEFAULT switches are on as seeded', () => {
    const off = SEEDS.switchboard.rows.filter((r: Json) => r.state === 'off').map((r: Json) => r.id).sort();
    expect(off).toEqual(['reading:shape_calibration']);
  });

  it('QD-2 with the board as seeded, gfa_max_m2 is the increment-2 headline (equal to the four switches set on), and the three GFA form rows are shown', () => {
    const rows = { footprint_max_m2: { value: 79.1505 }, storeys_max: { value: 3 } };
    const base = { seeds: SEEDS, rows, l2: { fsi: { s: 'applies', kind: 'unlimited', value: null, clause: 'c' } }, geometry: { lot_area_m2: 300 } };
    const out = R.runAllRows(base);
    const ids = out.map((r: Json) => r.row);
    for (const id of ['gfa_flat_m2', 'gfa_pitched_a_m2', 'gfa_pitched_b_m2']) expect(ids, id).toContain(id);
    const pm = out.find((r: Json) => r.row === 'gfa_pitched_m2');
    expect(String(pm && pm.reason)).not.toMatch(/^switched_off:/);
    const head = out.find((r: Json) => r.row === 'gfa_max_m2');
    expect(head.switches).toContainEqual({ id: 'formula:gfa_max_m2:increment_2', state: 'on' });
    const ON = { 'formula:gfa_max_m2:increment_2': 'on', 'formula:gfa_flat_m2': 'on', 'formula:gfa_pitched_a_m2': 'on', 'formula:gfa_pitched_b_m2': 'on' };
    expect(head).toEqual(R.runAllRows({ ...base, switches: ON }).find((r: Json) => r.row === 'gfa_max_m2'));
  });
});

describe('MB-27 slot 61 (operator "Q-T61 (a)"): the pitched form is offered where the threshold is unregulated or not_applicable', () => {
  // Operator answer Q-T61 (2026-11-04): "(a) Offer the pitched form in both cases (recommended). approved" (inc2/open-questions.md):
  // "both arms read if(regulated(pitched_roof_slope_min) and roof_pitch_x < l2(pitched_roof_slope_min); refuse(pitched_form_not_offered); …).
  // Where a threshold exists it still refuses below it (M-461)." Inputs from lane R2's OR-8 (ii), (iii).
  let R: Json;
  let SEEDS: Json;
  beforeAll(() => {
    R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    SEEDS = loadSeeds();
    SEEDS.vocab.dsl_target.pitched_roof_slope_min = SEEDS.vocab.dsl_target.pitched_roof_slope_min || { unit: 'ratio' }; // P3 adds it
  });
  const ON = { 'formula:gfa_max_m2:increment_2': 'on', 'formula:gfa_flat_m2': 'on', 'formula:gfa_pitched_a_m2': 'on', 'formula:gfa_pitched_b_m2': 'on' };
  const arm = (threshold: Json): Json => ({
    seeds: SEEDS, switches: ON, geometry: { lot_area_m2: 500 },
    l2: { pitched_roof_slope_min: threshold, fsi: { s: 'applies', kind: 'unlimited', value: null, clause: 'c' } },
    rows: { roof_pitch_a: { value: 0.5 }, roof_pitch_b: { value: 0.5 }, wall_storeys: { value: 2 }, storeys_max: { value: 2 }, footprint_max_m2: { value: 100 } },
  });
  const num = (v: number): Json => ({ s: 'applies', kind: 'number', value: v, clause: 'c' });
  const CASES: [string, Json][] = [
    ['unregulated (RT, ABS-8; OR-8 (ii))', { s: 'applies', kind: 'unregulated', value: null, clause: null }],
    ['not_applicable (by subject; OR-8 (iii))', { s: 'not_applicable', clause: 'subject clause' }],
  ];
  for (const [label, cell] of CASES) {
    it(`T61 ${label}: both arms compute, 2 × 100 = 200, the same as the arm with no minimum`, () => {
      for (const id of ['gfa_pitched_a_m2', 'gfa_pitched_b_m2']) {
        const out = R.runRow(id, arm(cell));
        expect([id, out.status, out.reason, out.value]).toEqual([id, 'computed', null, 200]);
        expect(R.runRow(id, arm(num(0))).value).toBe(200);
      }
    });
    it(`T61 ${label}, even at a pitch of 0.05 (no threshold binds, so nothing refuses it)`, () => {
      const low = arm(cell);
      low.rows = { ...low.rows, roof_pitch_a: { value: 0.05 } };
      expect([R.runRow('gfa_pitched_a_m2', low).status, R.runRow('gfa_pitched_a_m2', low).value]).toEqual(['computed', 200]);
    });
  }
  it('T61 a stored threshold still decides (M-461): 0.05 < 0.1 is refused pitched_form_not_offered; 0.5 ≥ 0.1 is offered, 2 × 100', () => {
    const refused = arm(num(0.1));
    refused.rows = { ...refused.rows, roof_pitch_a: { value: 0.05 } };
    expect(R.runRow('gfa_pitched_a_m2', refused).reason).toBe('pitched_form_not_offered');
    const offered = R.runRow('gfa_pitched_a_m2', arm(num(0.1)));
    expect([offered.status, offered.value]).toEqual(['computed', 200]);
  });
  it('T61 R3-01: an undecided threshold (not_evaluated) stays undecided, never offered and never refused', () => {
    const out = R.runRow('gfa_pitched_a_m2', arm({ s: 'not_evaluated', kind: null, value: null, clause: null, reason: 'condition_unknown:x' }));
    expect([out.status, out.value]).toEqual(['not_evaluated', null]);
    expect(out.reason).not.toBe('pitched_form_not_offered');
  });
});

describe('MB-27 Q-MECH0 (operator "a"): no FSI cap gives not_evaluated:no_permitted_gfa_base, never zero (M-472; ATTIC-22, ATTIC-23)', () => {
  // Operator answer Q-MECH0 (2026-11-04): "a" (inc2/open-questions.md): "no counted attic gives 0; an FSI cap gives "mechanical
  // area: not yet stored" until the increment-3 night (Q-M1 b+); no FSI cap gives not_evaluated:no_permitted_gfa_base, disclosed
  // "not applied" (M-472 "disclosed, not applied, never zero"; ATTIC-22, ATTIC-23)".
  let R: Json;
  let SEEDS: Json;
  beforeAll(() => {
    R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    SEEDS = loadSeeds();
    // lane MK keys these two Layer 1 targets before this commit (Q-M1 b+); no-ops once vocab.json declares them
    SEEDS.vocab.dsl_target.mechanical_attic_share_pct = SEEDS.vocab.dsl_target.mechanical_attic_share_pct || { unit: 'pct' };
    SEEDS.vocab.dsl_target.mechanical_attic_area_max_m2 = SEEDS.vocab.dsl_target.mechanical_attic_area_max_m2 || { unit: 'm2' };
  });
  const UNLIM: Json = { s: 'applies', kind: 'unlimited', value: null, clause: 'c' };
  const mech = (fsi: Json, counted: number): Json => ({
    seeds: SEEDS, geometry: { lot_area_m2: 600 }, l2: { fsi },
    rows: { attic_counted_a_m2: { value: counted }, attic_counted_b_m2: { value: counted } },
  });
  it('the reason word is declared in the closed list (the M-428 form)', () => {
    expect(SEEDS.catalogue.refuse_reasons).toContain('no_permitted_gfa_base');
  });
  for (const k of ['a', 'b']) {
    it(`ATTIC-23 arm ${k}: no FSI cap and a counted attic: not_evaluated:no_permitted_gfa_base, never 0`, () => {
      const out = R.runRow(`mechanical_attic_outside_gfa_${k}_m2`, mech(UNLIM, 55.405));
      expect([out.status, out.reason, out.value]).toEqual(['not_evaluated', 'no_permitted_gfa_base', null]);
    });
    it(`ATTIC-22 arm ${k}: no counted attic gives 0 (M-229 (3)), with or without an FSI cap`, () => {
      for (const fsi of [UNLIM, { s: 'applies', kind: 'number', value: 0.6, clause: 'c' }]) {
        const out = R.runRow(`mechanical_attic_outside_gfa_${k}_m2`, mech(fsi, 0));
        expect([out.status, out.value]).toEqual(['computed', 0]);
      }
    });
    it(`Q-M1 b+ arm ${k}: an FSI cap with the targets not yet stored is not_evaluated missing_input:absent_target ("not yet stored")`, () => {
      const out = R.runRow(`mechanical_attic_outside_gfa_${k}_m2`, mech({ s: 'applies', kind: 'number', value: 0.6, clause: 'c' }, 55.405));
      expect([out.status, out.reason]).toEqual(['not_evaluated', 'missing_input:absent_target']);
    });
  }
  it('the total floor area line carries the same reason on a no-FSI lot (shown only where an FSI cap exists, M-472)', () => {
    const inp = mech(UNLIM, 55.405);
    inp.rows = { ...inp.rows, gfa_pitched_a_m2: { value: 237.4515 } };
    inp.switches = { 'formula:gfa_pitched_a_m2': 'on' }; // off by "Q-default a"; off would win (Q-K1 (a)), so the arm is switched on here
    const out = R.runRow('total_floor_area_pitched_a_m2', inp);
    expect([out.status, out.reason]).toEqual(['not_evaluated', 'no_permitted_gfa_base']);
  });
});
