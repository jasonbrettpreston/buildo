// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-344 (its Q5 b trigger form and the dated note 2026-11-11: E7, the suite
//            fails closed below 2 units), M-202 (unit caps as stored), M-476 (a later increment's formula is a switched revision)
//
// MB-27 increment 4 · McBylaws queue · lane E · RED FIRST (the parent has no suite type, no units_floor and no increment-4 revision).
// Card ~/Buildo-scratch/mcbylaws/inc4/cards/CARD-E7-UCAP.md: on a lot whose exception caps dwelling units at 1, the house with a
// secondary suite (units 2) never shows a smaller unit count; its units_max refuses with the existing word units_differ_from_phase2
// until the (a)/(b) reading is ruled. Data-driven: the stored cap against the type's units_floor, no exception id in code.
// The vector is sample parcel 20618 (RT, exception 97: "There is a maximum of one dwelling unit per lot as shown on the registered plan").
import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { decodedLots, seeds, META, readJson, req, ROOT, type Json } from './golden25-harness';

const FIX = 'src/tests/fixtures/layer3/increment-4/parcels-rows.json';
const VECTOR = 20618;
let S: Json;
let LOTS: Map<number, Json>;

function unitsMax(typeId: string, s: Json = seeds()): Json {
  const lot = LOTS.get(VECTOR) as Json;
  const bt = (s.buildingTypes.rows as Json[]).find((b) => b.id === typeId) as Json;
  const p = lot.parcel as Json;
  const rows = S.buildParcelRows({
    parcel_id: VECTOR, buildingType: typeId, l2: lot.cells(bt.class), perm: { code: 0, gate: null },
    geometry: { lot_frontage_m: p.frontage_m, lot_depth_m: p.depth_m, lot_area_m2: p.lot_size_sqm }, flags: { corner_lot: p.is_corner_lot === true },
    neighbours: { user: [], neighbours: [], own: null, street: [], zone: [], ring: [], bt_units: bt.units, bt_units_floor: bt.units_floor },
  }, s, META) as Json[];
  return rows.find((r) => r.field_id === 'units_max') as Json;
}

beforeAll(() => {
  S = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
  LOTS = decodedLots(FIX);
});

describe('E7 trigger vector: an exception one-unit cap inside the suite scope', () => {
  it('the stored suite cap on parcel 20618 is 1 unit from 900.5.10(97)(A), and the suite is permitted there', () => {
    const cell = (LOTS.get(VECTOR) as Json).cells('house_with_secondary_suite').dwelling_units_max as Json;
    expect([cell.s, cell.value, cell.clause]).toEqual(['applies', 1, '900.5.10(97)#(97)[SSP](A)']);
  });
  it('the suite units_max is never computed below its units: not_evaluated, units_differ_from_phase2 (the existing word)', () => {
    const r = unitsMax('house_with_secondary_suite');
    expect([r.status, r.value, r.reason]).toEqual(['not_evaluated', null, 'units_differ_from_phase2']);
    expect(readJson('scripts/seeds/bylaw/layer3-catalogue.json').refuse_reasons).toContain('units_differ_from_phase2');
  });
  it('the detached house there keeps its 1 unit, and the houseplex keeps its increment-3 value (the card side finding, not ruled)', () => {
    expect([unitsMax('detached_house').status, unitsMax('detached_house').value]).toEqual(['computed', 1]);
    expect([unitsMax('detached_houseplex').status, unitsMax('detached_houseplex').value]).toEqual(['computed', 1]);
  });
  it('switching the increment-4 revision off reverts to the increment-1 formula (M-476), so the switch is what holds it', () => {
    const s = seeds();
    ((s.switchboard.rows as Json[]).find((r) => r.id === 'formula:units_max:increment_4') as Json).state = 'off';
    expect([unitsMax('house_with_secondary_suite', s).status, unitsMax('house_with_secondary_suite', s).value]).toEqual(['computed', 1]);
  });
  it('the floors are data on the building-types rows: house 1, suite 2 (its units), houseplex held at 1', () => {
    const rows = readJson('scripts/seeds/bylaw/building-types.json').rows as Json[];
    expect(rows.map((b) => [b.id, b.units, b.units_floor])).toEqual([
      ['detached_house', 1, 1], ['detached_houseplex', 4, 1], ['house_with_secondary_suite', 2, 2],
    ]);
  });
});

describe('E7 count (card lock item 2): the refusals are counted in the step records, records_meta units_floor_refusals', () => {
  it('the counted row and word are seed data, and the descriptor emits the count', () => {
    const c = readJson('scripts/seeds/bylaw/building-types.json').units_floor_census as Json;
    expect([c.row, c.reason]).toEqual(['units_max', 'units_differ_from_phase2']);
    const d = readJson('scripts/compute-maxbld-scenarios.descriptor.json');
    expect((d.emits as Json[]).map((e) => e.key)).toContain('units_floor_refusals');
  });
  it('censusOf counts the suite refusal on the vector lot (1) and nothing on the house and houseplex rows there', () => {
    const s = seeds();
    const rows = ['house_with_secondary_suite', 'detached_house', 'detached_houseplex'].map((id) => unitsMax(id, s));
    expect(S.censusOf(rows, {}, s.buildingTypes.units_floor_census).units_floor_refusals).toBe(1);
    expect(S.censusOf(rows.slice(1), {}, s.buildingTypes.units_floor_census).units_floor_refusals).toBe(0);
  });
  it('materializeRows carries the key in its matched census (0 on an empty lot)', () => {
    const s = seeds();
    const out = S.materializeRows([{ parcel_id: 1, cells: [], options: [], lot: { lot_gate: null }, geometry: {}, abutters: [], street: [], zone: [], ring: [] }],
      { lookups: { seeds: s, vocab: s.vocab, layer2Classes: [], permissionKeys: {}, texts: {} } });
    expect(out.matched.units_floor_refusals).toBe(0);
  });
});

describe('E7 scope pin (the M-344 trigger form): a new cap below 2 returns to the operator', () => {
  it('the Layer 2 input keys exactly these 15 exception units with a dwelling-unit cap of 0 or 1', () => {
    const units = readJson('docs/reference/bylaw-layer2-input.json').body.units as Json[] | Record<string, Json>;
    const capped = (Array.isArray(units) ? units : (Object.values(units) as Json[]))
      .filter((u: Json) => u.target === 'dwelling_units_max' && (u.numeric_expression || []).some((e: string) => /= [01] units/.test(e)))
      .map((u: Json) => u.unit_id).sort();
    expect(capped).toEqual([
      '900.4.10(186)#(186)[SSP](A)', '900.5.10(100)#(100)[SSP](A)', '900.5.10(102)#(102)[SSP](A)', '900.5.10(103)#(103)[SSP](A)',
      '900.5.10(109)#(109)[SSP](A)', '900.5.10(112)#(112)[SSP](A)', '900.5.10(125)#(125)[SSP](C)', '900.5.10(126)#(126)[SSP](A)',
      '900.5.10(127)#(127)[SSP](C)', '900.5.10(134)#(134)[SSP](A)', '900.5.10(145)#(145)[SSP](A)', '900.5.10(324)#(324)[SSP](C)',
      '900.5.10(88)#(88)[SSP](C)', '900.5.10(97)#(97)[SSP](A)', '900.5.10(98)#(98)[SSP](A)',
    ]);
  });
});
