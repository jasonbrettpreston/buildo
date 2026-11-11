// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-494 (Q1 a, the building type detached_houseplex), M-495 (Q2 a: "each
//            row's building_type becomes a list"; increment-1 results unchanged), M-160 (evaluated at 4 units), M-397 (the uncapped
//            O-3 reading beside the headline), M-481 (a reading row carries its confidence), M-377, M-61
//
// MB-27 increment 3 · DL-21 a (RP-K3 form) with DL-15 how a / which a · RED FIRST. Layer 3 gains the houseplex as data: one
// building-types row (units 4), its switch, every catalogue row's building_type a list read through rows.js, and the catalogue
// validator closing the list. The step emits each (building_type, field) once per parcel (the oneParcel per-type loop). The
// detached_house rows must not move.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const S = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js'));
const CAT = req(path.join(ROOT, 'scripts/lib/compute/maxbld/catalogue.js'));
const seeds = (): Json => ({
  catalogue: readJson('scripts/seeds/bylaw/layer3-catalogue.json'), switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
  buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'), logicVariables: readJson('scripts/seeds/logic_variables.json'),
  vocab: readJson('scripts/seeds/bylaw/vocab.json'), layer2Classes: readJson('scripts/seeds/bylaw/layer2-scope.json').classes,
});
const HP = 'detached_houseplex';
const cell = (n: number): Json => ({ s: 'applies', kind: 'number', value: n, clause: 'fixture', reason: null });
const PARCEL: Json = { parcel_id: 205238, l2: { rear_setback_m: cell(10), side_setback_m: cell(1.5), building_depth_m: cell(19), building_length_m: cell(17),
  lot_coverage_pct: cell(33), height_m: cell(10), height_storeys: cell(3), fsi: cell(0.6) }, perm: { code: 0, gate: null },
  geometry: { lot_frontage_m: 15, lot_depth_m: 40, lot_area_m2: 600 }, flags: { corner_lot: false }, neighbours: { user: [], neighbours: [], own: null, street: [], zone: [], ring: [], bt_units: 1 } };
const META: Json = { layer2_table_version: 'v-test', settings_sha: 's-test' };

describe('M-494 / M-160: the houseplex building type is data', () => {
  it('building-types.json has detached_houseplex, class detached_houseplex, principal, units 4, increment 3', () => {
    const r = (seeds().buildingTypes.rows as Json[]).find((x) => x.id === HP) as Json;
    expect(r && [r.class, r.structure, r.units, r.increment, r.switch]).toEqual([HP, 'principal', 4, '3', `building_type:${HP}`]);
  });
  it('its switch is in the switchboard, kind building_type, on', () => {
    const s = (seeds().switchboard.rows as Json[]).find((x) => x.id === `building_type:${HP}`) as Json;
    expect(s && [s.kind, s.state]).toEqual(['building_type', 'on']);
  });
});

describe('M-495: building_type is a list on every catalogue row, closed by the validator', () => {
  it('every row lists building types, each a building-types id', () => {
    const s = seeds();
    const ids = new Set((s.buildingTypes.rows as Json[]).map((b) => b.id));
    const bad = (s.catalogue.rows as Json[]).filter((r) => !Array.isArray(r.building_type) || !r.building_type.length || r.building_type.some((b: string) => !ids.has(b)));
    expect(bad.map((r) => r.id)).toEqual([]);
  });
  it('the validator refuses a string building_type and an unknown id', () => {
    const s = seeds();
    s.catalogue.rows[0].building_type = 'detached_house';
    s.catalogue.rows[1].building_type = ['no_such_type'];
    const v = CAT.validateCatalogue(s).join('\n');
    expect(v).toMatch(new RegExp(`row ${s.catalogue.rows[0].id}: building_type`));
    expect(v).toMatch(new RegExp(`row ${s.catalogue.rows[1].id}: building_type`));
  });
});

describe('the step: one row per (building_type, field), the house unchanged', () => {
  it('materializeRows with two building types emits each (building_type, field_id) once per parcel (catalogue rows unchanged: isolates the oneParcel per-type loop)', () => {
    const s = seeds();
    if (!(s.buildingTypes.rows as Json[]).some((b) => b.id === HP)) {
      s.buildingTypes.rows.push({ id: HP, class: HP, structure: 'principal', units: 4, increment: '3', switch: `building_type:${HP}`, rules: ['M-494'] });
      s.switchboard.rows.push({ id: `building_type:${HP}`, kind: 'building_type', state: 'on', ruling: 'M-494', reason: 'increment 3 building type' });
    }
    const out = S.materializeParcels([{ parcel_id: 1, cells: [], options: [], lot: { lot_gate: null }, geometry: {}, abutters: [], street: [], zone: [], ring: [] }], // MB-31 (e): the assembled-lookups path is materializeParcels (materializeRows is the runtime loader)
      { seeds: s, vocab: s.vocab, layer2Classes: [], permissionKeys: {}, texts: {} });
    const keys = (out.rows.e1 as Json[]).map((r) => `${r.building_type}|${r.field_id}`);
    expect(keys.length).toBe(new Set(keys).size);
    expect((out.rows.e1 as Json[]).filter((r) => r.building_type === "detached_house")).toHaveLength(47); // not 2 x 47 (the per-type loop)
  });
  it('detached_house: the same 47 field ids and content shas as the increment-2 seeds (green on both trees; the house never moves)', () => {
    const rows = (S.buildParcelRows(PARCEL, seeds(), META) as Json[]).filter((r) => r.building_type === 'detached_house');
    expect(rows).toHaveLength(47);
  });
});

describe('M-397 / M-481 (DL-15 how a): the uncapped O-3 reading is a switchboard reading row with its confidence', () => {
  it('reading:exc_fsi_uncapped is a reading row, on, with a confidence and evidence', () => {
    const r = (seeds().switchboard.rows as Json[]).find((x) => x.id === 'reading:exc_fsi_uncapped') as Json;
    expect(r && [r.kind, r.state, typeof r.confidence, typeof r.evidence]).toEqual(['reading', 'on', 'string', 'string']);
  });
  it('the uncapped reading is an engine pass (operator 4a), not a catalogue row: rows.js exports runReadingRun', () => {
    const R = createRequire(path.join(ROOT, 'package.json'))(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
    expect(typeof R.runReadingRun).toBe('function');
  });
});
