// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-378 (one switchboard; every result lists the switches on its
//            path) and its dated amendment Q-CONF a (switchboard confidence, batch part 2), LC-69 / M-392 / M-418
//            (the shape_calibration reading), R3-02 (what a row reads travels with it)
//
// Q-CONF a — the lock of the switchboard confidence, red first.
//   Data: each `reading` row of scripts/seeds/bylaw/switchboard.json carries `confidence` from the closed list
//         high | medium | medium-low | low and a non-empty `evidence` pointer; no other kind carries either field.
//         The increment-2 readings of the confidence register (C1-C7) are reading rows, each with its register confidence;
//         the increment-3 readings (C8 onward) join when their rows are authored (M-481).
//   Result: every result lists each reading switch it rests on (its own setting guards and those of every row it
//         reads), with the switch state and the switchboard's confidence and evidence beside it (queue :11, "Every
//         result says which switches were on"). A caller may override a state, never a confidence.
//   Validation: validateCatalogue refuses a reading row with a missing or unknown confidence, or no evidence.
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const clone = (x: unknown): Json => JSON.parse(JSON.stringify(x));

const CONFIDENCE = ['high', 'medium', 'medium-low', 'low'];
const SHAPE = 'reading:shape_calibration';
/**
 * The increment-2 register readings that become reading rows (CONFIDENCE-REGISTER C1-C7, Q-CONF a). The increment-3
 * readings (C8-C14) join when their rows are authored (M-481; Q14 a). Ids are the build's proposal (build-plan.md, Build B); confidence is the register's.
 */
const READINGS: [string, string, string][] = [
  ['reading:attic_share_over_1_4m', 'C1', 'low'],
  ['reading:flat_roof_despite_releases_wall_pair', 'C2', 'medium'],
  ['reading:r_free_share_setback_union_not_taken', 'C3', 'low'],
  ['reading:r_pitched_cap_whole_roof', 'C4', 'medium'],
  ['reading:rd_flat_roof_exceptions_zone_slope', 'C5', 'medium-low'],
  ['reading:free_share_one_end_block', 'C6', 'medium-low'],
  ['reading:rd_mechanical_attic_note_only', 'C7', 'low'],
];

const loadSeeds = (): Json => ({
  catalogue: readJson('scripts/seeds/bylaw/layer3-catalogue.json'),
  switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
  buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
  logicVariables: readJson('scripts/seeds/logic_variables.json'),
  vocab: readJson('scripts/seeds/bylaw/vocab.json'),
  layer2Classes: readJson('scripts/seeds/bylaw/layer2-scope.json').classes,
});

const cell = (n: number): Json => ({ s: 'applies', kind: 'number', value: n, clause: 'fixture', reason: null });
const baseL2 = (): Json => ({
  rear_setback_m: cell(10), side_setback_m: cell(1.5), building_depth_m: cell(19), building_length_m: cell(17),
  lot_coverage_pct: cell(33), height_storeys: cell(3), height_m: cell(10), fsi: cell(0.6),
});

let SW: Json;
let SEEDS: Json;
let R: Json;
let C: Json;
beforeAll(() => {
  SW = readJson('scripts/seeds/bylaw/switchboard.json');
  SEEDS = loadSeeds();
  R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
  C = req(path.join(ROOT, 'scripts/lib/compute/maxbld/catalogue.js')) as Json;
});
const base = (over: Json = {}): Json => ({
  seeds: SEEDS,
  l2: baseL2(),
  geometry: { lot_frontage_m: 15, lot_depth_m: 40, lot_area_m2: 600 },
  rows: { front_setback_used_m: { value: 6 } },
  flags: { corner_lot: false },
  ...over,
});
const swRow = (id: string): Json => SW.rows.find((r: Json) => r.id === id);
const readingsOf = (out: Json): Json[] => out.switches.filter((s: Json) => s.id.startsWith('reading:'));

describe('Q-CONF a switchboard data', () => {
  it('D1 schema switchboard-v2; every reading row has a closed-list confidence and a non-empty evidence pointer', () => {
    expect(SW.schema).toBe('switchboard-v2');
    const readings = SW.rows.filter((r: Json) => r.kind === 'reading');
    expect(readings.length).toBeGreaterThan(0);
    for (const r of readings) {
      expect([r.id, CONFIDENCE.includes(r.confidence)]).toEqual([r.id, true]);
      expect([r.id, typeof r.evidence === 'string' && r.evidence.trim().length > 0]).toEqual([r.id, true]);
    }
  });

  it('D2 no other kind carries confidence or evidence (confidence is a property of a reading)', () => {
    for (const r of SW.rows.filter((x: Json) => x.kind !== 'reading')) {
      expect([r.id, 'confidence' in r, 'evidence' in r]).toEqual([r.id, false, false]);
    }
  });

  it('D3 every increment-2 register reading C1-C7 is a reading row with the register confidence, its evidence naming the C id', () => {
    for (const [id, cid, conf] of READINGS) {
      const row = swRow(id);
      expect([id, row && row.kind, row && row.confidence]).toEqual([id, 'reading', conf]);
      expect([id, new RegExp(`\\b${cid}\\b`).test(row.evidence)]).toEqual([id, true]);
      expect([id, typeof row.ruling === 'string' && row.ruling.length > 0]).toEqual([id, true]);
    }
  });

  it('D5 only the six increment-3 reading rows cite a register reading of C8 onward: they join when their rows are authored (M-481; DL-21 a move 3, oracle-first door)', () => {
    // MB-27 increment 4 (bylaw-switchboard-confidence D5, D-1 b; Spec 69a M-481 dated note 2026-11-11): reading:suite_fsi_release_848 cites C15 and joins the set
    const SIX = new Set(["reading:rm_houseplex_no_main_wall_limit","reading:exc_fsi_uncapped","reading:x21_x38_take_x1462_reading","reading:houseplex_coa_check_two_cases","reading:circulation_share_operator_value","reading:minimum_unit_size_operator_value","reading:suite_fsi_release_848"]);
    for (const r of SW.rows.filter((x: Json) => x.kind === 'reading')) {
      expect([r.id, /\bC(?:[89]|1\d)\b/.test(String(r.evidence))]).toEqual([r.id, SIX.has(r.id)]);
    }
    expect(SW.rows.filter((x: Json) => x.kind === 'reading')).toHaveLength(READINGS.length + 9); // MB-27 increment 5 (lane B5B-1, FD-4 a): +1 reading:fitted_house_storey_rule (medium; it cites no confidence-register line); was + 8 // +1 increment-4 reading (D-1 b); was + 7
  });

  it('D4 shape_calibration keeps its state and ruling and gains a confidence and evidence', () => {
    const row = swRow(SHAPE);
    expect([row.kind, row.state, row.ruling]).toEqual(['reading', 'off', 'LC-69; M-392; M-418']);
    expect(row.confidence).toBe('low');
    expect(row.evidence).toMatch(/R3-10/);
  });
});

describe('Q-CONF a every result shows confidence beside each reading it rests on', () => {
  it('R1 footprint_max_m2 (switch off by default) lists shape_calibration with its state, confidence and evidence', () => {
    const out = R.runRow('footprint_max_m2', base());
    expect(out.status).toBe('computed');
    const row = swRow(SHAPE);
    expect(readingsOf(out)).toEqual([{ id: SHAPE, state: 'off', confidence: row.confidence, evidence: row.evidence }]);
  });

  it('R2 a caller override changes the state shown, never the confidence (FOOT-17 and the fitted case)', () => {
    const row = swRow(SHAPE);
    const refused = R.runRow('footprint_max_m2', base({ switches: { [SHAPE]: 'on' } }));
    expect(refused.status).toBe('not_evaluated');
    expect(readingsOf(refused)).toEqual([{ id: SHAPE, state: 'on', confidence: row.confidence, evidence: row.evidence }]);
    const fitted = R.runRow('footprint_max_m2', base({ switches: { [SHAPE]: 'on' }, settings: { footprint_shape_factor: { value: 1, provenance: 'fit-1' } } }));
    expect(fitted.status).toBe('computed');
    expect(readingsOf(fitted)).toEqual([{ id: SHAPE, state: 'on', confidence: row.confidence, evidence: row.evidence }]);
  });

  it('R3 a row that reads footprint_max_m2 rests on the same reading and lists it once (gfa_max_m2)', () => {
    // the increment-1 formula under test, pinned off: the fixture carries increment-1 inputs only (operator D-5, the switch-on list)
    const out = R.runRow('gfa_max_m2', base({ switches: { 'formula:gfa_max_m2:increment_2': 'off' } }));
    expect(out.status).toBe('computed');
    expect(readingsOf(out).map((s: Json) => [s.id, s.state, s.confidence])).toEqual([[SHAPE, 'off', swRow(SHAPE).confidence]]);
  });

  it('R4 a row that rests on no reading lists none (height_max_m)', () => {
    const out = R.runRow('height_max_m', base());
    expect(out.status).toBe('computed');
    expect(readingsOf(out)).toEqual([]);
  });

  it('R5 the confidence shown is the switchboard\'s: a changed switchboard confidence changes the result', () => {
    const seeds = clone(SEEDS);
    seeds.switchboard.rows.find((r: Json) => r.id === SHAPE).confidence = 'high';
    const out = R.runRow('footprint_max_m2', base({ seeds }));
    expect(readingsOf(out).map((s: Json) => s.confidence)).toEqual(['high']);
  });

  it('R6 a switch entry of any other kind keeps exactly {id, state}', () => {
    const out = R.runRow('height_max_m', {
      seeds: SEEDS,
      l2: { height_m: { s: 'applies', kind: 'number', value: 9, clause: '10.20.40.10(1)#(1)(A)', reason: null } },
      switches: { 'clause:10.20.40.10(1)#(1)(A)': 'off' },
    });
    expect(out.status).toBe('not_evaluated');
    for (const s of out.switches) expect(Object.keys(s).sort()).toEqual(['id', 'state']);
  });
});

describe('Q-CONF a validation fails closed', () => {
  it('V1 validateCatalogue accepts the seeds as they stand', () => {
    expect(C.validateCatalogue(SEEDS)).toEqual([]);
  });

  it('V2 a reading row with no confidence, an unknown confidence, or no evidence is refused', () => {
    const cases: [string, (r: Json) => void][] = [
      ['no confidence', (r) => { delete r.confidence; }],
      ['unknown confidence', (r) => { r.confidence = 'very-high'; }],
      ['no evidence', (r) => { delete r.evidence; }],
      ['blank evidence', (r) => { r.evidence = ' '; }],
    ];
    for (const [name, mutate] of cases) {
      const seeds = clone(SEEDS);
      mutate(seeds.switchboard.rows.find((r: Json) => r.id === SHAPE));
      const errs = C.validateCatalogue(seeds);
      expect([name, errs.some((e: string) => e.includes(SHAPE) && /confidence|evidence/.test(e))]).toEqual([name, true]);
    }
  });

  it('V3 a confidence on a non-reading row is refused', () => {
    const seeds = clone(SEEDS);
    seeds.switchboard.rows.find((r: Json) => r.id === 'formula:height_max_m').confidence = 'high';
    expect(C.validateCatalogue(seeds).some((e: string) => e.includes('formula:height_max_m') && e.includes('confidence'))).toBe(true);
  });
});

describe('Q-CONF a every path of the runner (panel F3-F6, F9)', () => {
  const probe = (id: string, expression: string, unit: string, extra: Json = {}): Json => ({
    id, building_type: 'detached_house', increment: '1', form: 'expr', unit, envelope: false, expression,
    clauses: ['fixture'], rules: ['M-481'], example_ids: [], switch: 'formula:footprint_max_m2', ...extra,
  });
  const withRows = (...rows: Json[]): Json => {
    const seeds = clone(SEEDS);
    seeds.catalogue.rows = [...seeds.catalogue.rows, ...rows];
    return seeds;
  };
  const shapeEntry = (state: string): Json => ({ id: SHAPE, state, confidence: swRow(SHAPE).confidence, evidence: swRow(SHAPE).evidence });

  it('P1 the not_buildable (envelope) and unit-mismatch returns still list the reading the row rests on', () => {
    const seeds = withRows(
      probe('probe_envelope_m2', 'lv(footprint_shape_factor) × 0 m2', 'm2', { envelope: true }),
      probe('probe_unit_m', 'lv(footprint_shape_factor)', 'm'),
    );
    const env = R.runRow('probe_envelope_m2', base({ seeds }));
    expect([env.status, readingsOf(env)]).toEqual(['not_buildable', [shapeEntry('off')]]);
    const unit = R.runRow('probe_unit_m', base({ seeds }));
    expect([unit.status, unit.reason, readingsOf(unit)]).toEqual(['not_evaluated', 'expression_error:unit_mismatch', [shapeEntry('off')]]);
  });

  it('P2 a setting read that never reached its guard (no stored value) lists no reading', () => {
    const seeds = withRows(probe('probe_ratio', 'lv(footprint_shape_factor)', 'ratio'));
    const out = R.runRow('probe_ratio', base({ seeds, settings: { footprint_shape_factor: { value: null } } }));
    expect(out.status).toBe('not_evaluated');
    expect(readingsOf(out)).toEqual([]);
  });

  it('P3 an injected row and a switched-off formula list no reading (nothing was read)', () => {
    const injected = R.runRow('footprint_max_m2', base({ rows: { front_setback_used_m: { value: 6 }, footprint_max_m2: { value: 5 } } }));
    expect(readingsOf(injected)).toEqual([]);
    const off = R.runRow('footprint_max_m2', base({ switches: { 'formula:footprint_max_m2': 'off' } }));
    expect([off.status, readingsOf(off)]).toEqual(['not_evaluated', []]);
  });

  it('P4 a reading reached twice (its own setting and two reads of a row resting on it) is listed once', () => {
    const seeds = withRows(probe('probe_twice_m2', 'footprint_max_m2 + footprint_max_m2 × lv(footprint_shape_factor)', 'm2'));
    const out = R.runRow('probe_twice_m2', base({ seeds }));
    expect(out.status).toBe('computed');
    expect(readingsOf(out)).toEqual([shapeEntry('off')]);
  });

  it('P5 an unknown name (readName pushes a row-kind trace entry for it) adds no reading and does not throw', () => {
    const seeds = withRows(probe('probe_unknown_m2', 'no_such_name_m2 + lv(footprint_shape_factor) × 0 m2', 'm2'));
    const out = R.runRow('probe_unknown_m2', base({ seeds }));
    expect(out.status).toBe('not_evaluated');
    expect(readingsOf(out)).toEqual([shapeEntry('off')]);
  });

  it('V4 evidence on a non-reading row is refused; a confidence in another case is refused', () => {
    const seeds = clone(SEEDS);
    seeds.switchboard.rows.find((r: Json) => r.id === 'formula:height_max_m').evidence = 'x';
    expect(C.validateCatalogue(seeds).some((e: string) => e.includes('formula:height_max_m') && e.includes('evidence'))).toBe(true);
    const upper = clone(SEEDS);
    upper.switchboard.rows.find((r: Json) => r.id === SHAPE).confidence = 'Low';
    expect(C.validateCatalogue(upper).some((e: string) => e.includes(SHAPE) && e.includes('confidence'))).toBe(true);
  });
});
