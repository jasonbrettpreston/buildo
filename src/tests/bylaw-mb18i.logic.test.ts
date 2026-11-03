// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-406 (the 2013-lot assumption is a site fact: recorded,
// disclosed, inputs_defaulted 0), M-361 (Q2, the frontage half); M-158 (existing-lot minimums stay verdict-layer); MB-18 (i).
// Red first (engine brief I-A, hand-corrected): T-i1, T-i3, T-i4, T-i5, T-i8, T-i11 fail on the base; T-i2, T-i9, T-i10 are locks.
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
const VO = await mod('scripts/analysis/bylaw/vocab.mjs');
const { E, units, C } = await AS.loadRealLotAssembly(ROOT);
const effIn = (ctx: Json, l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, ctx);
const eff = (l: Json, t: string): Json => effIn(C, l, t);
const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const MAP = read('scripts/seeds/bylaw/layer2-map.json');
const SCOPE = read('scripts/seeds/bylaw/layer2-scope.json');
const ID = 'lot_unchanged_since_enactment';
const ENTRY = (VOCAB.existing_assumption || {})[ID] as Json;
const ENV = (): Json => ({
  vocabZones: VOCAB.zone, labelLetters: Object.keys(VOCAB.label_letter), exceptionChapter: VOCAB.exception_chapter,
  sentinel: MAP.exception_number_sentinel, mapAreas: SCOPE.map_areas, designDefaults: { heritage_property: false },
  existingAssumption: VOCAB.existing_assumption,
});
const row = (o: Json = {}): Json => ({
  id: 7, parcel_id: '5195536', zoning_class: 'RD', zoning_zn_string: 'RD (f15.0; a557)', exception_number: -1,
  zoning_overlays: {}, on_policy_road: false, is_corner_lot: false, is_through_lot: false, abuts_laneway: false,
  frontage_m: 9, depth_m: 40, lot_size_sqm: 200, zoning_is_ambiguous: false, in_sixplex_area: false,
  is_heritage_designated: false, geom_npoints: 5, ...o,
});
// parcel 205238 (82 Kelsonia, x155, frontage 15.23): the exception makes the three targets read existing(lot_frontage_m; enacted(569-2013))
const P205238 = (o: Json = {}): Json => row({ parcel_id: '205238', zoning_zn_string: 'RD (f15.0; a557) (x155)', exception_number: 155, frontage_m: 15.23, depth_m: 38.08, lot_size_sqm: 580.13, ...o });
const TARGETS = ['required_lot_frontage_m', 'building_depth_m', 'building_length_m'];
const houseplex = (l: Json): Json => ({ ...l, building_type: 'detached_houseplex' });
const assumedLot = (): Json => houseplex(rb().buildLotVector(P205238(), ENV()).lot);
const strictLot = (): Json => { const { assumptions: _a, ...rest } = assumedLot(); return rest; }; // eslint-disable-line @typescript-eslint/no-unused-vars
/** The closed sentence the result must carry: the entry's sentence with {bound} {target} {value} {unit} filled from the result. */
const fill = (r: Json, target: string): string => String(ENTRY.sentence).replace(/\{(\w+)\}/g, (_m: string, k: string) => String({ bound: r.bound, target, value: r.value, unit: r.unit }[k as 'bound']));
const sentences = (r: Json): string[] => (r.disclosures || []).filter((d: unknown) => typeof d === 'string' && d.startsWith('If the lot has changed since'));

describe('MB-18 i / the 2013-lot assumption is a recorded site fact (M-406)', () => {
  it('T-i1 (red): parcel 205238 (x155) reads its held frontage into three targets and discloses it once each', () => {
    const b = rb().buildLotVector(P205238(), ENV());
    const lot = houseplex(b.lot);
    expect(b.gates).toEqual([]);
    expect(b.inputs_defaulted).toBe(0);
    expect(lot.assumptions).toEqual([ID]);
    expect('existing' in lot).toBe(false);
    const want: Array<[string, number, string | null]> = [['required_lot_frontage_m', 15.23, null], ['building_depth_m', 19, '10.20.40.30(1)#whole'], ['building_length_m', 17, '10.20.40.20(1)#whole']];
    for (const [t, value, winner] of want) {
      const r = eff(lot, t);
      expect([t, r.status, r.value]).toEqual([t, 'value', value]);
      if (winner) expect([t, r.winner]).toEqual([t, winner]);
      expect([t, sentences(r)]).toEqual([t, [fill(r, t)]]);
      expect(r.inputs).toContain(ENTRY.assumption_read);
      expect([t, sentences(r)[0]?.includes('{')]).toEqual([t, false]);
    }
    // the sentence is on exactly the value results whose inputs show the assumed read, once, and on no other target (side_setback_m reads the required frontage too: plan v2.2 F-3)
    for (const t of SCOPE.targets.principal as string[]) {
      const r = eff(lot, t);
      const used = (r.inputs || []).includes(ENTRY.assumption_read) && r.value !== null && r.value !== undefined;
      expect([t, sentences(r).length]).toEqual([t, used ? 1 : 0]);
    }
  });

  it('T-i2 (lock, green on base): the same lot WITHOUT the assumption stays not_evaluated and discloses nothing', () => {
    const lot = strictLot();
    expect('assumptions' in lot).toBe(false);
    for (const t of TARGETS) {
      const r = eff(lot, t);
      expect([t, r.status, r.reason]).toEqual([t, 'not_evaluated', 'existing_building_facts:lot_frontage_m']);
      expect([t, sentences(r)]).toEqual([t, []]);
    }
  });

  it('T-i3 (red): the entry is checked for the variable and the enactment; any other read stays not_evaluated', () => {
    const lot = assumedLot();
    const under = (over: Json): Json => ({ ...C, existingAssumption: { [ID]: { ...ENTRY, ...over } } });
    expect(effIn(under({}), lot, 'required_lot_frontage_m').status).toBe('value');
    for (const over of [{ var: 'lot_area_m2' }, { enactment: '000-0000' }]) {
      for (const t of TARGETS) {
        const r = effIn(under(over), lot, t);
        expect([JSON.stringify(over), t, r.status, r.reason]).toEqual([JSON.stringify(over), t, 'not_evaluated', 'existing_building_facts:lot_frontage_m']);
      }
    }
    const none = effIn({ ...C, existingAssumption: {} }, lot, 'required_lot_frontage_m');
    expect([none.status, none.reason]).toEqual(['not_evaluated', 'existing_building_facts:lot_frontage_m']);
  });

  it('T-i12 (red): the cell cache never serves a strict result to an assumed lot, in either order (R-IN)', async () => {
    const CC = await mod('scripts/analysis/bylaw/cell-cache.mjs');
    const strict = strictLot(); const assumed = assumedLot();
    const cands = E.loadCandidates(assumed, units).candidates;
    for (const order of [[strict, assumed], [assumed, strict]]) {
      const cache = CC.makeCellCache({ evaluator: E, ctx: C });
      const got = order.map((l) => { const r = cache.effective(l, 'building_depth_m', cands); return [r.status, r.value]; });
      expect(got).toEqual(order.map((l) => ((l as Json).assumptions ? ['value', 19] : ['not_evaluated', null])));
    }
  });

  it('T-i4 (red): the helper reads the env list; the scorer shares it', () => {
    expect(rb().assumptionsOf(ENV())).toEqual([ID]);
    expect(rb().assumptionsOf({})).toEqual([]);
    expect('assumptions' in rb().buildLotVector(row(), { ...ENV(), existingAssumption: undefined }).lot).toBe(false);
    const src = fs.readFileSync(path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-scorecard.mjs'), 'utf8');
    expect(src.includes('assumptionsOf(')).toBe(true); // the scorer is a script and cannot be imported; the 8 moves of the prereg prove the path
  });

  it('T-i5 (red): the entry is total and checkVocab rejects each defect under the existing code', () => {
    for (const f of ['var', 'enactment', 'reads', 'assumption_read', 'invalid_reason', 'trace', 'separator', 'sentence', 'ruling']) expect([f, typeof ENTRY[f] === 'string' && ENTRY[f].length > 0]).toEqual([f, true]);
    expect(VOCAB.not_evaluated_reason).toContain(ENTRY.invalid_reason);
    const found = [...String(ENTRY.sentence).matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    expect([...found].sort()).toEqual([...ENTRY.placeholders].sort());
    expect(VO.checkVocab(VOCAB).pass).toBe(true);
    // the three couplings checkVocab cannot see: the runtime read marker is keyed by the cell cache, the placeholders are fillable, the read is a unit-matched input
    expect(read('scripts/seeds/bylaw/cell-key-whole.json').paths).toContain(ENTRY.assumption_read);
    expect(ENTRY.placeholders.every((p: string) => ['bound', 'target', 'value', 'unit'].includes(p))).toBe(true);
    expect(VOCAB.dsl_input[ENTRY.reads]?.unit).toBe(VOCAB.dsl_input[ENTRY.var]?.unit);
    const clone = (fn: (e: Json) => void): Json => { const v = structuredClone(VOCAB); fn(v.existing_assumption[ID]); return v; };
    const bads = [
      clone((e) => { delete e.sentence; }),
      clone((e) => { e.invalid_reason = 'not_a_closed_code'; }),
      clone((e) => { e.placeholders = e.placeholders.slice(1); }),
      clone((e) => { e.ruling = ''; }),
    ];
    for (const v of bads) {
      const r = VO.checkVocab(v);
      expect(r.pass).toBe(false);
      expect(r.violations.length).toBeGreaterThan(0);
      for (const x of r.violations) expect(String(x).split(':')[0]).toBe('vocab_reference_invalid');
    }
  });

  it('T-i8 (red): a frontage that is not a finite number above 0 is a missing input, never assumed', () => {
    for (const bad of [null, 0, 'x', -3]) {
      const lot = { ...assumedLot(), vars: { ...assumedLot().vars, lot_frontage_m: bad } };
      const r = eff(lot, 'required_lot_frontage_m');
      expect([String(bad), r.status, r.reason]).toEqual([String(bad), 'not_evaluated', 'missing_input:lot_frontage_m']);
    }
    expect(rb().buildLotVector(P205238({ frontage_m: null }), ENV()).gates).toEqual(['lot_metric_missing']);
  });

  it('T-i9 (lock): no unit reads lot_frontage_m at an explicit date today, so the date scope is vacuous; the day one appears this fails', () => {
    const dated = units.filter((u: Json) => /existing\(lot_frontage_m;\s*\d{4}-\d{2}-\d{2}\)/.test(JSON.stringify(u.numeric_expression ?? '')));
    expect(dated.map((u: Json) => u.unit_id)).toEqual([]);
    const enacted = units.filter((u: Json) => /existing\(lot_frontage_m;\s*enacted\(569-2013\)\)/.test(JSON.stringify(u.numeric_expression ?? '')));
    expect(enacted.length).toBeGreaterThan(0);
  });

  it('T-i10 (lock, green on base): the assumption never sets lawfully_existing (M-158)', () => {
    expect(rb().buildLotVector(P205238(), ENV()).lot.flags.lawfully_existing).toBe(false);
    expect(rb().buildLotVector(row(), ENV()).lot.flags.lawfully_existing).toBe(false);
  });

  it('T-i11 (red): a lot with existing undefined and the assumption present takes the assumed branch without throwing', () => {
    const lot = { ...assumedLot(), existing: undefined };
    expect(() => eff(lot, 'required_lot_frontage_m')).not.toThrow();
    const r = eff(lot, 'required_lot_frontage_m');
    expect([r.status, r.value]).toEqual(['value', 15.23]);
  });
});
