// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §2 (the lot vector; a missing input is never defaulted), §4 (the lot gates),
//            §7 I5 / I10; docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-IV (one pure lot-vector builder), R-IQ (one lot gate,
//            the sentinel and the mismatch rule); docs/reports/2026-10-20-plan-mcbylaw-phase2-v2.md D7 (R-LABEL, P2:204)
// Handbook: Spec 132 §core.9 (R-W, R-BZ: compute is pure); Spec 133 §m.232 (the Layer 2 status set), §m.233 (v1 structures)
//
// R-LABEL and the R-IV lot-vector builder, pure, in scripts/lib/bylaw-resolution.js (the library the compute module requires).
// RED FIRST (Spec 124 R-BA, R-DK item 4): run against the tree before parseZoneLabel / buildLotVector existed, recorded as
// docs/reports/red-evidence/resolve_bylaws/step-red.json; committed as plain `it` with the code that turns them green (the
// accepted precedent: the pre-commit hook blocks committed red tests).

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .js module surface
const ROOT = path.resolve(__dirname, '../../../../');
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rb = (): Json => require(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const golden = (): Json => require(path.join(ROOT, 'scripts/analysis/bylaw-validation/pull-golden-lots.cjs')) as Json;

const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const MAP = read('scripts/seeds/bylaw/layer2-map.json');
const SCOPE = read('scripts/seeds/bylaw/layer2-scope.json');
const LETTERS = Object.keys(VOCAB.label_letter);
const ENV = (): Json => ({
  vocabZones: VOCAB.zone,
  labelLetters: LETTERS,
  exceptionChapter: VOCAB.exception_chapter,
  sentinel: MAP.exception_number_sentinel,
  mapAreas: SCOPE.map_areas,
  designDefaults: { heritage_property: false },
});

/** A parcels row as the step's source SQL selects it (a RD lot with a label and an exception). */
const row = (o: Json = {}): Json => ({
  id: 7, parcel_id: '5195536', zoning_class: 'RD', zoning_zn_string: 'RD (f10.0; a245) (x940)', exception_number: 940,
  zoning_overlays: { height_overlay: { applied: true, height_max_m: 11, stories: 3 }, lot_coverage_overlay: { applied: true, coverage_max_pct: 33 } },
  on_policy_road: false, is_corner_lot: true, is_through_lot: false, abuts_laneway: false, frontage_m: 10.5, depth_m: 35.2, lot_size_sqm: 369.6,
  zoning_is_ambiguous: false, in_sixplex_area: false, is_heritage_designated: false, geom_npoints: 5, ...o,
});

describe('R-LABEL: the label parser is total over vocab label_letter, numbers and the H holding token (P2:204)', () => {
  it('parses every label shape the live R/RD/RS/RT/RM parcels carry (shapes measured 2026-10-22)', () => {
    const cases: Array<[string, Json]> = [
      ['RD (f10.0; a245) (x940)', { zone: 'RD', label: { f: 10, a: 245 }, labelX: 940 }],
      ['R (d0.35) (x216)', { zone: 'R', label: { d: 0.35 }, labelX: 216 }],
      ['RD (x100)', { zone: 'RD', label: {}, labelX: 100 }],
      ['RM (f12.0; u4; d0.8) (x124)', { zone: 'RM', label: { f: 12, u: 4, d: 0.8 }, labelX: 124 }],
      ['RM (au119.0) (x450)', { zone: 'RM', label: { au: 119 }, labelX: 450 }],
      ['RT', { zone: 'RT', label: {}, labelX: null }],
      ['RS (f18.0; a555)', { zone: 'RS', label: { f: 18, a: 555 }, labelX: null }],
    ];
    for (const [zn, want] of cases) {
      const p = rb().parseZoneLabel(zn, LETTERS);
      expect(p, zn).toMatchObject({ ok: true, holding: false, ...want });
    }
  });

  it('H is a declared holding token, alone or as a part; it is not a label letter', () => {
    expect(rb().parseZoneLabel('RD (f10.0) (H)', LETTERS)).toMatchObject({ ok: true, holding: true, label: { f: 10 } });
    expect(rb().parseZoneLabel('RD (f10.0; H)', LETTERS)).toMatchObject({ ok: true, holding: true, label: { f: 10 } });
  });

  it('anything else is not ok (label_unparsed): an unknown letter, a repeat, a bad number, junk, empty, null', () => {
    for (const zn of ['RD (z5)', 'RD (f10; f11)', 'RD (f)', 'RD (f10.0.1)', 'RD ((f10)', 'RD f10', '(f10)', '', '   ', 'RD (f10) (x1) (x2)', 'RD (x1; f10)'] as Array<string | null>) {
      expect(rb().parseZoneLabel(zn, LETTERS).ok, JSON.stringify(zn)).toBe(false);
    }
    expect(rb().parseZoneLabel(null, LETTERS).ok).toBe(false);
    expect(rb().parseZoneLabel(undefined, LETTERS).ok).toBe(false);
  });

  it('never throws on a string and agrees with the golden-lot puller on every label it parses', () => {
    for (const zn of ['RD (f10.0; a245) (x940)', 'RM (f12.0; u4; d0.8) (x124)', 'R (d0.35)', 'RS (f18.0; a555)']) {
      expect(rb().parseZoneLabel(zn, LETTERS).label).toEqual(golden().parseLabel(zn));
    }
  });
});

describe('R-IV: buildLotVector — one pure builder, a missing input is never defaulted (Spec 134 §2, I10)', () => {
  it('builds the golden-lot vector shape from a parcels row (parity with pull-golden-lots rowToLot on every shared field)', () => {
    const r = row();
    const want = golden().rowToLot({ ...r, frontage_m: r.frontage_m, depth_m: r.depth_m, lot_size_sqm: r.lot_size_sqm, npts: 5, address_number: '1', linear_name_full: 'A ST' }, [], null).lot;
    const { lot, gates, inputs_defaulted } = rb().buildLotVector(r, ENV());
    expect(gates).toEqual([]);
    expect(inputs_defaulted).toBe(0);
    for (const k of ['zone', 'zone_label', 'label', 'overlays', 'vars', 'flags', 'exception']) expect(lot[k], k).toEqual(want[k]);
    expect(lot.parcel_id).toBe('5195536');
  });

  it('the exception id is 900.<chapter>.10(<n>) from vocab data; null and the sentinel give none', () => {
    expect(rb().buildLotVector(row({ exception_number: 940 }), ENV()).lot.exception).toBe(`900.${VOCAB.exception_chapter.RD}.10(940)`);
    expect(rb().buildLotVector(row({ exception_number: null, zoning_zn_string: 'RD (f10.0; a245)' }), ENV()).lot.exception).toBeNull();
    expect(rb().buildLotVector(row({ exception_number: -1, zoning_zn_string: 'RD (f10.0; a245)' }), ENV()).lot.exception).toBeNull();
  });

  it('R-IQ: a real exception number with no (xN), or (xN) differing from it, is label_exception_mismatch; the sentinel base-resolves', () => {
    expect(rb().buildLotVector(row({ zoning_zn_string: 'RD (f10.0; a245)', exception_number: 940 }), ENV()).gates).toEqual(['label_exception_mismatch']);
    expect(rb().buildLotVector(row({ exception_number: 941 }), ENV()).gates).toEqual(['label_exception_mismatch']);
    expect(rb().buildLotVector(row({ zoning_zn_string: 'RD (f10.0; a245)', exception_number: -1 }), ENV()).gates).toEqual([]);
    expect(rb().buildLotVector(row({ zoning_zn_string: 'RD (f10.0; a245) (x5)', exception_number: null }), ENV()).gates).toEqual(['label_exception_mismatch']);
  });

  it('fires each parcel-derived gate (the map lot_gate set) and never invents one', () => {
    const g = (o: Json) => rb().buildLotVector(row(o), ENV()).gates;
    expect(g({ zoning_is_ambiguous: true })).toContain('ambiguous_zone');
    expect(g({ zoning_class: 'CR', zoning_zn_string: 'CR (x1)', exception_number: 1 })).toContain('no_569_2013_zone');
    expect(g({ zoning_zn_string: 'RD (zz9) (x940)' })).toContain('label_unparsed');
    for (const col of ['frontage_m', 'depth_m', 'lot_size_sqm']) expect(g({ [col]: null }), col).toEqual(['lot_metric_missing']);
    for (const fired of [g({ zoning_is_ambiguous: true }), g({ frontage_m: null })]) for (const x of fired) expect(MAP.lot_gate).toContain(x);
    // exception_not_authored is decided from the INCLUDE closure (M-231), never by the builder
    expect(g({})).not.toContain('exception_not_authored');
  });

  it('a missing metric is not defaulted to 0: the vector keeps null and the gate fires', () => {
    const { lot, gates } = rb().buildLotVector(row({ frontage_m: null }), ENV());
    expect(gates).toContain('lot_metric_missing');
    expect(lot.vars.lot_frontage_m).toBeNull();
  });

  it('map membership comes from the scope seed: in_sixplex_area true/false/null -> [ref] / [] / absent (null is unknown, never false)', () => {
    const ref = SCOPE.map_areas.in_sixplex_area;
    expect(typeof ref).toBe('string');
    expect(rb().buildLotVector(row({ in_sixplex_area: true }), ENV()).lot.map_areas).toEqual([ref]);
    expect(rb().buildLotVector(row({ in_sixplex_area: false }), ENV()).lot.map_areas).toEqual([]);
    expect('map_areas' in rb().buildLotVector(row({ in_sixplex_area: null }), ENV()).lot).toBe(false);
  });

  it('heritage and no_rear_lot_line flags follow the golden-lot puller (4 vertices means no rear lot line)', () => {
    expect(rb().buildLotVector(row({ is_heritage_designated: true }), ENV()).lot.flags.heritage_property).toBe(true);
    expect(rb().buildLotVector(row({ geom_npoints: 4 }), ENV()).lot.flags.no_rear_lot_line).toBe(true);
    expect('no_rear_lot_line' in rb().buildLotVector(row({ geom_npoints: 5 }), ENV()).lot.flags).toBe(false);
  });

  it('is pure: the same row twice gives equal vectors and the row is not mutated', () => {
    const r = row();
    const copy = JSON.stringify(r);
    expect(rb().buildLotVector(r, ENV())).toEqual(rb().buildLotVector(r, ENV()));
    expect(JSON.stringify(r)).toBe(copy);
  });
});

describe('R-IR / R-IS: the class lot — a structure evaluated under a class (Spec 134 §2, §6)', () => {
  const base = (): Json => rb().buildLotVector(row(), ENV()).lot;
  it('layer2-scope.json declares the v1 classes (the five P5.1 classes), each a vocab scenario_class_units entry', () => {
    expect(SCOPE.classes).toEqual(['detached_house', 'detached_houseplex', 'semi_detached_houseplex', 'semi_detached_house', 'house_with_secondary_suite']);
    for (const c of SCOPE.classes) expect(Object.keys(VOCAB.scenario_class_units)).toContain(c);
  });

  it('the principal structure takes the class vector: building_type, dwelling_units = house_units (evaluated_at for a range), suite flags', () => {
    const lot = rb().classLot(base(), { structure: 'principal', classKey: 'detached_houseplex', vector: VOCAB.scenario_class_units.detached_houseplex });
    expect(lot.building_type).toBe('detached_houseplex');
    expect(lot.vars.dwelling_units).toBe(4);
    const sec = rb().classLot(base(), { structure: 'principal', classKey: 'house_with_secondary_suite', vector: VOCAB.scenario_class_units.house_with_secondary_suite });
    expect(sec.building_type).toBe('detached_house');
    expect(sec.vars.dwelling_units).toBe(2);
    expect(sec.flags.has_secondary_suite).toBe(true);
  });

  it('a suite structure keeps the class context and sets its own building_type; one dwelling unit', () => {
    const lot = rb().classLot(base(), { structure: 'garden_suite', classKey: 'detached_house', vector: VOCAB.scenario_class_units.detached_house });
    expect(lot.building_type).toBe('garden_suite');
    expect(lot.vars.dwelling_units).toBe(1);
  });

  it('does not mutate the base vector, and an undeclared structure throws', () => {
    const b = base();
    const copy = JSON.stringify(b);
    rb().classLot(b, { structure: 'principal', classKey: 'detached_house', vector: VOCAB.scenario_class_units.detached_house });
    expect(JSON.stringify(b)).toBe(copy);
    expect(() => rb().classLot(b, { structure: 'ancillary', classKey: 'detached_house', vector: VOCAB.scenario_class_units.detached_house })).toThrow(/structure/);
  });
});
