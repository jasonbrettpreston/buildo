// SPEC LINK: 69a M-158; MB-18 plan section 4 (T-d). LOCK: green on the base.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs'; import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ROOT = process.cwd();
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rb = (): Json => require(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json;
const AS = await mod('scripts/analysis/bylaw-validation/assembly.mjs');
const { E, units, C } = await AS.loadRealLotAssembly(ROOT);
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);
const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const MAP = read('scripts/seeds/bylaw/layer2-map.json');
const SCOPE = read('scripts/seeds/bylaw/layer2-scope.json');
const ENV = (): Json => ({
  vocabZones: VOCAB.zone, labelLetters: Object.keys(VOCAB.label_letter), exceptionChapter: VOCAB.exception_chapter,
  sentinel: MAP.exception_number_sentinel, mapAreas: SCOPE.map_areas, designDefaults: { heritage_property: false },
});
const row = (o: Json = {}): Json => ({
  id: 7, parcel_id: '5195536', zoning_class: 'RD', zoning_zn_string: 'RD (f15.0; a557)', exception_number: -1,
  zoning_overlays: {}, on_policy_road: false, is_corner_lot: false, is_through_lot: false, abuts_laneway: false,
  frontage_m: 9, depth_m: 40, lot_size_sqm: 200, zoning_is_ambiguous: false, in_sixplex_area: false,
  is_heritage_designated: false, geom_npoints: 5, ...o,
});
const lotOf = (exception: string | null = null): Json => ({
  zone: 'RD', label: { f: 15, a: 557 }, overlays: {}, map_areas: [], building_type: 'detached_house', exception,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, major_street: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false },
  vars: { lot_frontage_m: 9, lot_depth_m: 40, lot_area_m2: 200 },
});

describe('MB-18 d / Layer 2 keeps the existing-lot minimum a requirement, not a verdict (M-158)', () => {
  it('reports the label minimum as a value measured off the existing lot', () => {
    const r = eff(lotOf(), 'required_lot_frontage_m');
    expect(r.status).toBe('value');
    expect(r.value).toBe(15);
    expect(r.winner).toBe('10.20.30.20(1)#(1)(A)');
  });
  it('emits no gate for an existing lot below the label minimum', () => {
    const b = rb().buildLotVector(row(), ENV());
    expect(b.gates).toEqual([]);
    expect(b.lot.label).toEqual({ f: 15, a: 557 });
  });
  it('keeps the minimum absent from the layer-2 scope and lot_gate vocabulary', () => {
    const scope = fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/layer2-scope.json'), 'utf8');
    expect(scope).not.toContain('required_lot_frontage_m');
    expect(scope).not.toContain('required_lot_area_m2');
    const gate: string[] = MAP.lot_gate;
    expect(gate).toHaveLength(6);
    gate.forEach((g) => {
      expect(g).not.toContain('minimum');
      expect(g).not.toContain('frontage');
      expect(g).not.toContain('area');
    });
  });
  it('leaves a carve-out exception unevaluated rather than below-minimum', () => {
    const r = eff(lotOf('900.3.10(155)'), 'required_lot_frontage_m');
    expect(r.status).toBe('not_evaluated');
    expect(r.value).toBeNull();
    expect(r.reason).toBe('existing_building_facts:lot_frontage_m');
  });
});
