// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-423, M-75; MB-18 (k). Plan section 16 / 19 (averaging_distance_m).
// Red-first tests: the averaging distance is read off its own unit (10.5.40.70(1)#(1)(A), 15.0 m) through the
// vocab.fallback_target hook, on the base layer with the lot's exception cleared, after the normal fail-closed lot gate.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href);
const V = await mod('scripts/analysis/bylaw/validate.mjs');
const AU = await mod('scripts/analysis/bylaw/authored.mjs');
const AG = await mod('scripts/analysis/bylaw/agree.mjs');
const XR = await mod('scripts/analysis/bylaw/xref.mjs');
const E = await mod('scripts/analysis/bylaw/evaluate.mjs');
const VO = await mod('scripts/analysis/bylaw/vocab.mjs');
const I = V.loadInputs({ root: process.cwd() });
const ag = AG.checkAgree({ shards: AU.loadAuthored(process.cwd()), adjudications: I.adjudications, vocab: I.vocab });
const index = AU.buildIndex(I.slice);
const units: Json[] = [...AG.agreedUnits(ag).values()]
  .map((u: Json): Json => AU.withGeneratedFields(u))
  .map((u: Json) => { const d = XR.displacesOf(index, u.unit_id, I.vocab, null); return { ...u, displaces: d.targets.map((t: Json) => t.id), displaces_optional: d.optional_variation }; });
const C = E.makeContext(VO.evaluatorVocab(I.vocab), { absences: I.absences });
const unitOf = (id: string): Json => {
  const r = ag.units.get(id);
  if (!r) throw new Error(`no unit ${id}`);
  return r.unit;
};
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8'));

const ZONES = ['R', 'RD', 'RS', 'RT', 'RM'];
const UNIT_A = '10.5.40.70(1)#(1)(A)';
// a lot as Layer 3 would hand it over: site facts not holding (M-169), design choices set explicitly per test
const lot = (zone: string, buildingType: string, extra: Json = {}): Json => ({
  zone, label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: buildingType,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false, ...(extra.flags ?? {}) },
  vars: { lot_frontage_m: 12, lot_depth_m: 40, proposed_height_m: 4, distance_to_residential_m: 5, ...(extra.vars ?? {}) },
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'flags' && k !== 'vars')),
});
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);
const cands = (l: Json): Json[] => E.loadCandidates(l, units).candidates;
const isSortedUnique = (xs: string[]): boolean => xs.every((x, i) => i === 0 || x > (xs[i - 1] as string));
const FLAGS = [undefined, true, false];
// exception ids (900.x.10(n)) taken from the resolved unit ids; a lot names the exception, not the unit
const EXC_IDS: string[] = [...new Set([...ag.units.keys()].map((k: string) => k.split('#')[0] ?? '').filter((k: string) => /^900\.\d+\.10\(\d+\)$/.test(k)))].sort();

describe('MB-18 k — G1 vocab: the target is bounded max, the fallback maps exist and are consistent', () => {
  it('averaging_distance_m is unit m, bound max; fallback_target holds it (sorted, unique) with the M-423 record', () => {
    const t = I.vocab.dsl_target.averaging_distance_m;
    expect([t.unit, t.bound]).toEqual(['m', 'max']);
    const keys: string[] = Object.keys(I.vocab.fallback_target);
    expect(keys).toContain('averaging_distance_m');
    expect(isSortedUnique(keys)).toBe(true);
    const f = I.vocab.fallback_target.averaging_distance_m;
    expect(Object.keys(f).sort()).toEqual(['flags', 'layer', 'of', 'ruling', 'self', 'trace']);
    expect([f.of, f.self, f.layer, f.ruling]).toEqual(['averaging_distance_m', true, 'base', 'M-423']);
    expect(typeof f.trace === 'string' && f.trace.length > 0).toBe(true);
    expect(f.flags.one_abutting_building_within_15_m).toBe(true);
  });
  it('fallback_check is the closed vocab_reference_invalid gate for the layers the map uses', () => {
    const k = I.vocab.fallback_check;
    expect([k.code, k.separator, k.layers.includes('base')]).toEqual(['vocab_reference_invalid', ':', true]);
    expect(k.layers).toContain(I.vocab.fallback_target.averaging_distance_m.layer);
    const stems = Object.values(k.stems) as string[];
    expect(stems.length).toBeGreaterThan(0);
    for (const s of stems) expect(typeof s === 'string' && /^[a-z0-9_. ]+$/.test(s)).toBe(true);
  });
});

describe('MB-18 k — G2 unit shape: the averaging distance is expressed on (A), unchanged on (B)', () => {
  it('(1)(A) carries both targets and the 15.0 m expression, and no longer leaves the 15.0 metres literal unexpressed', () => {
    const u = unitOf(UNIT_A);
    expect(u.target).toEqual(['front_setback_m', 'averaging_distance_m']);
    expect(u.numeric_expression).toContain('averaging_distance_m = 15.0 m @(1)(A)');
    expect(u.literals_not_expressed.map((l: Json) => l.literal)).not.toContain('15.0 metres');
    expect(u.literals_not_expressed.map((l: Json) => l.literal)).toContain('one');
  });
  it('(1)(B) still limits the front setback only and still lists the 15.0 metres literal', () => {
    const u = unitOf('10.5.40.70(1)#(1)(B)');
    expect([u.target].flat()).toEqual(['front_setback_m']);
    expect(u.literals_not_expressed.map((l: Json) => l.literal)).toContain('15.0 metres');
  });
  it('adjudications: the superseded record stays and a ~s1 correction supersedes it', () => {
    const adj: Json[] = read('scripts/seeds/bylaw/adjudications.json').adjudications;
    const oldId = 'COR-10.5.40.70(1)#(1)(A)/literals_not_expressed';
    expect(adj.some((x) => x.id === oldId)).toBe(true);
    const sup = adj.filter((x) => x.supersedes === oldId);
    expect(sup.length).toBeGreaterThan(0);
    for (const r of sup) expect(String(r.id).endsWith('~s1')).toBe(true);
  });
});

describe('MB-18 k — G3 value matrix: the lot reads its own 15.0 m on the base layer', () => {
  it('every zone x residential type x token flag reads value 15 from unit (A)', () => {
    let n = 0;
    for (const z of ZONES) for (const bt of C.residentialTypes) for (const f of FLAGS) {
      const l = lot(z, bt, { flags: { front_averaging_not_applicable: true, one_abutting_building_within_15_m: f } });
      const r = eff(l, 'averaging_distance_m');
      expect([z, bt, String(f), r.status, r.value, r.winner]).toEqual([z, bt, String(f), 'value', 15, UNIT_A]);
      n += 1;
    }
    expect(n).toBe(ZONES.length * C.residentialTypes.length * FLAGS.length);
  });
  it('an authored exception lot still reads 15; a refused exception lot is gated for averaging_distance_m too', () => {
    // an exception the lot gate lets through (listed as authored in the context): the base-layer read still gives 15
    const CA = E.makeContext(VO.evaluatorVocab(I.vocab), { absences: I.absences, authored: { '900.3.10(155)': 'authored' } });
    const la = lot('RD', 'detached_house', { exception: '900.3.10(155)' });
    const authored = E.effective(la, 'averaging_distance_m', cands(la), CA);
    expect([authored.status, authored.value, authored.winner]).toEqual(['value', 15, UNIT_A]);
    const refused = EXC_IDS
      .map((e) => ({ e, r: eff(lot('RD', 'detached_house', { exception: e, flags: { front_averaging_not_applicable: true } }), 'front_setback_m') }))
      .filter(({ r }) => typeof r.reason === 'string' && r.reason.startsWith('exception_not_authored'));
    expect(refused.length).toBeGreaterThan(0);
    const ex = (refused[0] as { e: string }).e;
    const gated = eff(lot('RD', 'detached_house', { exception: ex, flags: { front_averaging_not_applicable: true } }), 'averaging_distance_m');
    expect([gated.status, gated.reason]).toEqual(['not_evaluated', `exception_not_authored:${ex}`]);
  });
});

describe('MB-18 k — G4 memo isolation: the fallback never leaks into the front setback read', () => {
  it('front_setback_m is condition_unknown before, after and around an averaging_distance_m read, twice each', () => {
    const l = lot('RD', 'detached_house', { flags: { front_averaging_not_applicable: undefined } });
    const runOrder = (order: 'alone' | 'after' | 'before'): Json => {
      if (order === 'alone') return eff(l, 'front_setback_m');
      if (order === 'after') { eff(l, 'averaging_distance_m'); return eff(l, 'front_setback_m'); }
      const first = eff(l, 'front_setback_m'); eff(l, 'averaging_distance_m'); return first;
    };
    for (const order of ['alone', 'after', 'before'] as const) for (let i = 0; i < 2; i++) {
      const r = runOrder(order);
      expect([order, r.status, r.reason]).toEqual([order, 'not_evaluated', 'condition_unknown:front_averaging_not_applicable']);
    }
    const three = (['alone', 'after', 'before'] as const).map(runOrder);
    expect(three[1]).toEqual(three[0]);
    expect(three[2]).toEqual(three[0]);
    const a1 = eff(l, 'averaging_distance_m'); const a2 = eff(l, 'averaging_distance_m');
    expect(a2).toEqual(a1);
    // one shared _env memo across the reads (the nested fallback read must not write into it)
    const env = { memo: new Map() }; const cs = cands(l);
    const x1 = E.effective(l, 'averaging_distance_m', cs, C, env);
    const x2 = E.effective(l, 'front_setback_m', cs, C, env);
    expect([x1.status, x1.value, x2.status, x2.reason]).toEqual(['value', 15, 'not_evaluated', 'condition_unknown:front_averaging_not_applicable']);
  });
});

describe('MB-18 k — G5 regression lock (green on base): cutting the target off (A) changes no other answer', () => {
  it('every other target reads the same on the trimmed unit set', () => {
    const unitsTrim: Json[] = units.map((u: Json) => (u.unit_id === UNIT_A
      ? { ...JSON.parse(JSON.stringify(u)), target: ['front_setback_m'] }
      : u));
    const C0 = E.makeContext(VO.evaluatorVocab({ ...I.vocab, fallback_target: {} }), { absences: I.absences }); // hook off = the pre-change behaviour
    const TARGETS = ['front_setback_m', 'rear_setback_m', 'side_setback_m', 'height_m', 'lot_coverage_pct'];
    let n = 0;
    for (const z of ZONES) for (const bt of C.residentialTypes) for (const fa of [true, undefined]) for (const f of FLAGS) {
      const l = lot(z, bt, { flags: { front_averaging_not_applicable: fa, one_abutting_building_within_15_m: f } });
      const c = cands(l);
      for (const t of TARGETS) {
        expect([z, bt, String(fa), String(f), t, JSON.stringify(E.effective(l, t, c, C))])
          .toEqual([z, bt, String(fa), String(f), t, JSON.stringify(E.effective(l, t, E.loadCandidates(l, unitsTrim).candidates, C0))]);
        n += 1;
      }
    }
    expect(n).toBe(ZONES.length * C.residentialTypes.length * 2 * FLAGS.length * TARGETS.length);
  });
});

describe('MB-18 k — G6 hook off when the fallback map is empty', () => {
  it('an empty fallback_target leaves averaging_distance_m undecided on the unknown token', () => {
    const C0 = E.makeContext(VO.evaluatorVocab({ ...I.vocab, fallback_target: {} }), { absences: I.absences });
    const l = lot('RD', 'detached_house', { flags: { front_averaging_not_applicable: true, one_abutting_building_within_15_m: undefined } });
    const r = E.effective(l, 'averaging_distance_m', E.loadCandidates(l, units).candidates, C0);
    expect(r.status).toBe('not_evaluated');
    expect(String(r.reason)).toContain('condition_unknown');
  });
});

describe('MB-18 k — G7 noFallback turns the hook off', () => {
  it('with noFallback the unknown token is undecided; the gate reason is the same with and without it', () => {
    const l = lot('RD', 'detached_house', { flags: { front_averaging_not_applicable: true, one_abutting_building_within_15_m: undefined } });
    const r = E.effective(l, 'averaging_distance_m', cands(l), C, { noFallback: true });
    expect(r.status).toBe('not_evaluated');
    expect(String(r.reason)).toContain('condition_unknown');
    const ex = EXC_IDS
      .find((e) => { const r = eff(lot('RD', 'detached_house', { exception: e }), 'front_setback_m').reason; return typeof r === 'string' && r.startsWith('exception_not_authored'); });
    expect(ex).toBeTruthy();
    const g = lot('RD', 'detached_house', { exception: ex, flags: { front_averaging_not_applicable: true } });
    const on = E.effective(g, 'averaging_distance_m', cands(g), C);
    const off = E.effective(g, 'averaging_distance_m', cands(g), C, { noFallback: true });
    expect([on.status, off.status]).toEqual(['not_evaluated', 'not_evaluated']);
    expect(String(on.reason).startsWith('exception_not_authored')).toBe(true);
    expect(off.reason).toBe(on.reason);
  });
});

describe('MB-18 k — G8 a lot whose units do not key the target keeps its plain answer, byte for byte', () => {
  it('with unit (A) removed (nothing keys the target), the hook changes nothing against an empty fallback map', () => {
    const unitsTrim: Json[] = units.filter((u: Json) => u.unit_id !== UNIT_A);
    const C0 = E.makeContext(VO.evaluatorVocab({ ...I.vocab, fallback_target: {} }), { absences: I.absences });
    let n = 0;
    for (const z of ZONES) for (const bt of C.residentialTypes) for (const f of FLAGS) {
      const l = lot(z, bt, { flags: { front_averaging_not_applicable: true, one_abutting_building_within_15_m: f } });
      const c = E.loadCandidates(l, unitsTrim).candidates;
      expect([z, bt, String(f), JSON.stringify(E.effective(l, 'averaging_distance_m', c, C))]).toEqual([z, bt, String(f), JSON.stringify(E.effective(l, 'averaging_distance_m', c, C0))]);
      n += 1;
    }
    expect(n).toBe(ZONES.length * C.residentialTypes.length * FLAGS.length);
  });
});
