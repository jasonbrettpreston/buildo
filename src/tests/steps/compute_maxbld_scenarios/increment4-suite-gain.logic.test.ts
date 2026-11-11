// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-379 (and its dated note 2026-11-11: D-2 a, the generic gain comparison;
//            the invariant row owed to MB-64), M-182(4); docs/specs/01-pipeline/131a_lot_configuration_register.md LC-33;
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.2 item 11, P5.10 (gain_vs_detached_*, gain_reasons)
//
// MB-27 increment 4 · McBylaws queue · lane E · RED FIRST (the parent has no gain rows and no suite type). The LC-33 gain of the house
// with a secondary suite over the detached house, by one generic comparison after the step's per-type loop, declared in data
// (building-types.json `gain`). Oracle: the McProof key ~/Buildo-scratch/mcbylaws/inc4/mcproof/ANSWER-KEY.md section 3.2 (operator
// "yes" on D-0, 2026-11-11), copied below line for line.
import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { goldenLots, parcelInput, seeds, META, req, ROOT, type Json } from './golden25-harness';

const SUITE = 'house_with_secondary_suite';
const HOUSE = 'detached_house';
// case: [gain GFA, gain footprint, gain storeys, gain_reasons]; null = NULL (ANSWER-KEY.md section 3.2)
const KEY: Record<string, [number | null, number | null, number | null, string[] | null]> = {
  A0067: [0, 36.8671, 0, ['coverage_45']],
  A0094: [0, 61.0764, 0, ['coverage_45']],
  A0097: [79.2366, 26.4122, 0, ['coverage_45']],
  A0166: [null, null, null, null],
  A0170: [0, 39.7412, 0, ['coverage_45']],
  A0175: [231.0424, 0, 0, ['fsi_not_applicable']],
  A0179: [0, 0, 0, ['none']],
  A0182: [35.026, 17.513, 0, ['coverage_45']],
  A0193: [389.472, 24.0848, 0, ['coverage_45', 'fsi_not_applicable']],
  A0203: [0, 0, 0, ['none']],
  A0205: [0, 0, 0, ['none']],
  A0229: [0, 0, 0, ['none']],
  A0277: [0, 0, 0, ['none']],
  A0289: [70.588, 0, 0, ['fsi_not_applicable']],
  A0354: [258.2325, 20.6475, 0, ['coverage_45', 'fsi_not_applicable']],
  A0375: [60.29, 0, 0, ['fsi_not_applicable']],
  A0388: [142.326, 0, 0, ['fsi_not_applicable']],
  A0399: [216.294, 0, 0, ['fsi_not_applicable']],
  A0457: [46.414, 0, 0, ['fsi_not_applicable']],
  A0461: [10.386, 0, 0, ['fsi_not_applicable']],
  A0464: [194.062, 0, 0, ['fsi_not_applicable']],
  A0553: [83.8636, 0, 0, ['fsi_not_applicable']],
  A0561: [36.1386, 0, 0, ['fsi_not_applicable']],
  A0562: [190.658, 0, 0, ['fsi_not_applicable']],
  A0578: [161.204, 0, 0, ['fsi_not_applicable']],
};
// case: [suite height, storeys, footprint, headline GFA]; null = not_evaluated (ANSWER-KEY.md section 3.1, the bold suite figures)
const ROWS_KEY: Record<string, [number, number, number, number] | null> = {
  A0067: [9, 2, 228.31, 279], A0094: [9, 2, 229.0365, 254.485], A0097: [9, 3, 187.34, 562.02], A0166: null,
  A0170: [9.5, 3, 200.4314, 243.47], A0175: [11, 4, 98.77, 384.2944], A0179: [9.5, 3, 79.1505, 237.4515], A0182: [10, 2, 208.76, 417.52],
  A0193: [9.5, 3, 217.94, 653.82], A0203: [10, 2, 197.54, 395.08], A0205: [10, 2, 194.31, 388.62], A0229: [10, 2, 249.05, 498.1],
  A0277: [10, 2, 197.37, 394.74], A0289: [11, 3, 88.74, 266.22], A0354: [8.5, 3, 135.15, 405.45], A0375: [13, 4, 54.23, 216.92],
  A0388: [11, 4, 69.36, 269.37], A0399: [9.5, 3, 176.46, 529.38], A0457: [11, 3, 88.57, 265.71], A0461: [11, 3, 88.91, 266.73],
  A0464: [13, 4, 85.51, 342.04], A0553: [11, 4, 60.7743, 237.3616], A0561: [11, 4, 60.69, 235.4686], A0562: [11, 3, 144.67, 434.01],
  A0578: [12, 4, 88.4, 353.6],
};
const FIELDS = ['gain_vs_detached_gfa_sqm', 'gain_vs_detached_footprint_sqm', 'gain_vs_detached_storeys'];

let S: Json;
let LOTS: Map<string, Json>;
/** The closed gain_reasons words of a reasons row (its other flags are the disclosures it inherits, M-386 R3-02). */
const reasonWords = (r: Json): string[] => {
  const decl = seeds().buildingTypes.gain as Json;
  const closed = [...(decl.reasons as Json[]).map((x) => x.reason as string), decl.none_word as string];
  return (r.flags as string[]).filter((f) => closed.includes(f));
};
const bt = (s: Json, id: string) => (s.buildingTypes.rows as Json[]).find((b) => b.id === id) as Json;

/** Both types' rows of one lot, then the generic comparison; `edit` may change the suite input before the run. */
function gains(name: string, edit?: (input: Json) => void, s: Json = seeds()): Json {
  const lot = LOTS.get(name) as Json;
  const perType: Record<string, Json> = {};
  for (const id of [HOUSE, SUITE]) {
    const input = parcelInput(lot, bt(s, id));
    if (id === SUITE && edit) edit(input);
    perType[id] = { input, rows: S.buildParcelRows(input, s, META) };
  }
  return Object.fromEntries((S.gainRows(lot.parcel_id, perType, s, META) as Json[]).map((r) => [r.field_id, r])) as Json;
}

beforeAll(() => {
  S = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
  LOTS = goldenLots();
});

describe('D-2 a: the suite gain on the golden 25 equals the McProof key (25 of 25)', () => {
  it.each(Object.keys(KEY))('%s', (name) => {
    const g = gains(name);
    const [gfa, fp, st, reasons] = KEY[name] as [number | null, number | null, number | null, string[] | null];
    [gfa, fp, st].forEach((want, i) => {
      const row = g[FIELDS[i] as string] as Json;
      expect(row.building_type).toBe(SUITE);
      if (want === null) expect([row.status, row.value]).toEqual(['not_evaluated', null]);
      else {
        expect(row.status).toBe('computed');
        expect(Math.abs((row.value as number) - want)).toBeLessThan(0.01);
      }
    });
    const r = g.gain_reasons as Json;
    if (reasons === null) expect([r.status, r.value]).toEqual(['not_evaluated', null]);
    else expect([r.status, reasonWords(r)]).toEqual(['computed', reasons]);
  });
});

describe('the suite rows on the golden 25 equal the McProof key (section 3.1: H, S, footprint, headline GFA, units 2)', () => {
  it.each(Object.keys(ROWS_KEY))('%s', (name) => {
    const s = seeds();
    const lot = LOTS.get(name) as Json;
    const rows = Object.fromEntries((S.buildParcelRows(parcelInput(lot, bt(s, SUITE)), s, META) as Json[]).map((r) => [r.field_id, r]));
    const want = ROWS_KEY[name] as [number, number, number, number] | null;
    if (want === null) {
      for (const f of ['footprint_max_m2', 'gfa_max_m2']) expect([f, rows[f].status]).toEqual([f, 'not_evaluated']);
      return;
    }
    const got = ['height_max_m', 'storeys_max', 'footprint_max_m2', 'gfa_max_m2'].map((f) => rows[f]);
    got.forEach((r, i) => {
      expect([name, r.field_id, r.status]).toEqual([name, r.field_id, 'computed']);
      expect(Math.abs((r.value as number) - (want[i] as number))).toBeLessThan(0.01);
    });
    expect([rows.units_max.status, rows.units_max.value]).toEqual(['computed', 2]);
  });
});

describe('D-2 a: the comparison is data, keyed by the releasing clause, with the "actually bound" test', () => {
  it('the building-types row names its base type; the compared fields and the clause map are seed data', () => {
    const s = seeds();
    expect(bt(s, SUITE).base_type).toBe(HOUSE);
    expect((s.buildingTypes.gain.fields as Json[]).map((f) => f.row)).toEqual(['gfa_max_m2', 'footprint_max_m2', 'storeys_max']);
    expect((s.buildingTypes.gain.reasons as Json[]).map((r) => [r.clause, r.reason])).toEqual([['x.40.40(1)(C)', 'fsi_not_applicable'], ['x.30.40(1)(D)', 'coverage_45']]);
    expect(s.buildingTypes.gain.fail_reason).toBe('no_producer');
    expect(s.vocab.layer3.field_not_evaluated_reason).toContain('no_producer');
  });
  it('a released cell that does not bind the house is not named (A0097: FSI released but the house GFA was not FSI-bound)', () => {
    const r = gains('A0097').gain_reasons as Json;
    expect(reasonWords(r)).toEqual(['coverage_45']);
    const fsi = (r.trace as Json[]).find((t) => t.id === 'fsi') as Json;
    expect([fsi.clause, fsi.reason, fsi.bound]).toEqual(['10.20.40.40(1)#(1)(C)', 'fsi_not_applicable', false]);
  });
  it('deleting the clause entry from the data fails the reasons closed (the map is read, not coded)', () => {
    const s = seeds();
    s.buildingTypes.gain.reasons = (s.buildingTypes.gain.reasons as Json[]).filter((r) => r.reason !== 'fsi_not_applicable');
    const g = gains('A0175', undefined, s);
    expect([g.gain_reasons.status, g.gain_reasons.reason]).toEqual(['not_evaluated', 'no_producer']);
    expect(g.gain_vs_detached_gfa_sqm.status).toBe('computed');
  });
});

describe('M-379 (the invariant row owed to MB-64): a suite cell outside the closed reason map that differs from the house fails closed', () => {
  it('a differing principal cell with an unmapped clause: gain_reasons not_evaluated, reason no_producer; the numeric gains stay', () => {
    const g = gains('A0203', (input) => { input.l2 = { ...input.l2, height_m: { ...input.l2.height_m, value: 99, clause: '10.20.40.10(1)#(1)(A)-unmapped' } }; });
    expect([g.gain_reasons.status, g.gain_reasons.reason, reasonWords(g.gain_reasons)]).toEqual(['not_evaluated', 'no_producer', []]);
    expect((g.gain_reasons.trace as Json[]).some((t) => t.id === 'height_m' && t.reason === null)).toBe(true);
  });
  it('a differing roof-option cell fails closed too (no clause map for option cells)', () => {
    const g = gains('A0203', (input) => { input.l2Options = { ...input.l2Options, shared: { ...(input.l2Options.shared || {}), pitched_roof_slope_min: { s: 'applies', kind: 'number', value: 9, clause: 'x', reason: null } } }; });
    expect([g.gain_reasons.status, g.gain_reasons.reason]).toEqual(['not_evaluated', 'no_producer']);
  });
});

describe('LC-33: the gain is NULL when either row is not permitted or not computed', () => {
  it('a suite that is not permitted: every gain row not_evaluated, value null', () => {
    const g = gains('A0175', (input) => { input.perm = { code: 1, gate: null, clause: '10.10.20.1(1)' }; });
    for (const f of [...FIELDS, 'gain_reasons']) expect([g[f].status, g[f].value]).toEqual(['not_evaluated', null]);
  });
  it('A0166 (both rows not evaluated): the NULL reason propagates the row reason unchanged', () => {
    const g = gains('A0166');
    expect(g.gain_vs_detached_gfa_sqm.status).toBe('not_evaluated');
    expect(String(g.gain_vs_detached_gfa_sqm.reason)).not.toBe('');
  });
});

describe('the step wiring: oneParcel takes the gain right after its per-type loop', () => {
  it('materializeRows emits the four gain rows of the suite once, after its own rows (and none for the base type)', () => {
    const s = seeds();
    const out = S.materializeRows([{ parcel_id: 1, cells: [], options: [], lot: { lot_gate: null }, geometry: {}, abutters: [], street: [], zone: [], ring: [] }],
      { lookups: { seeds: s, vocab: s.vocab, layer2Classes: [], permissionKeys: {}, texts: {} } });
    const rows = out.rows.e1 as Json[];
    const gainIds = [...FIELDS, 'gain_reasons'];
    expect(rows.filter((r) => gainIds.includes(r.field_id)).map((r) => r.building_type)).toEqual([SUITE, SUITE, SUITE, SUITE]);
    expect(rows.filter((r) => gainIds.includes(r.field_id)).every((r) => r.status === 'not_evaluated' && r.increment === '4')).toBe(true);
    expect(out.matched.flags_missing).toBe(0);
    expect(out.matched.numbers_without_trace).toBe(0);
  });
});
