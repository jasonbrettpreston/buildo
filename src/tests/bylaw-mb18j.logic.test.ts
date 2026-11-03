// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-245; MB-18 (j). Plan section 8.2 / 19.
// Red-first tests: front_setback_fallback_m is the 6.0 m zone value read on the base layer (M-245): the lot gate runs for
// front_setback_m on the FULL list, then front_setback_m is read with the exception cleared and
// front_averaging_not_applicable held true, so no zone floor ever sits under the averaged yard. J8 is the lock that
// already passes (emptying fallback_target moves no front_setback_m answer).
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
const units: Json[] = [...AG.agreedUnits(ag).values()].map((u: Json): Json => AU.withGeneratedFields(u)).map((u: Json) => { const d = XR.displacesOf(index, u.unit_id, I.vocab, null); return { ...u, displaces: d.targets.map((t: Json) => t.id), displaces_optional: d.optional_variation }; });
const C = E.makeContext(VO.evaluatorVocab(I.vocab), { absences: I.absences });
const unitOf = (id: string): Json => { const r = ag.units.get(id); if (!r) throw new Error(`no unit ${id}`); return r.unit; };
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8'));

const ZONES = ['R', 'RD', 'RS', 'RT', 'RM'];
const TARGET = 'front_setback_fallback_m';
const WHOLE = /^10\.(10|20|40|60|80)\.40\.70\(1\)#whole$/;
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
const EXC_IDS: string[] = [...new Set([...ag.units.keys()].map((k: string) => k.split('#')[0] ?? '').filter((k: string) => /^900\.\d+\.10\(\d+\)$/.test(k)))].sort();
// the engine types behind the five stored classes (detached/semi-detached house and houseplex); the other two types wait on major_street
const HOUSE_TYPES = ['detached_house', 'detached_houseplex', 'semi_detached_house', 'semi_detached_houseplex'];
const UNDECIDED = { front_averaging_not_applicable: undefined }; // averaging applicability unknown to the lot
const AVG_TOKENS = ['one_abutting_building_within_15_m', 'two_abutting_buildings_within_15_m'];
const noAvgTokens = (l: Json): boolean => AVG_TOKENS.every((k) => (l.flags as Json)[k] === undefined);
const ctxWith = (authored: Json): Json => E.makeContext(VO.evaluatorVocab(I.vocab), { absences: I.absences, authored });

describe('MB-18 j — J1 data (red): the fallback target, its entry, the scope position and the lineage key', () => {
  it('front_setback_fallback_m is a dsl_target (m, envelope, min) and fallback_target holds EXACTLY two keys', () => {
    const t = I.vocab.dsl_target[TARGET];
    expect([t.unit, t.aspect, t.bound]).toEqual(['m', 'envelope', 'min']);
    const keys: string[] = Object.keys(I.vocab.fallback_target);
    expect(keys).toEqual(['averaging_distance_m', TARGET]); // the exact-set lock (item k asserts containment only)
    expect(isSortedUnique(keys)).toBe(true);
  });
  it('the entry reads front_setback_m on the base layer (self false, token held true) under M-245', () => {
    const f = I.vocab.fallback_target[TARGET];
    expect(Object.keys(f).sort()).toEqual(['flags', 'layer', 'of', 'ruling', 'self', 'trace']);
    expect([f.of, f.self, f.layer, f.ruling]).toEqual(['front_setback_m', false, 'base', 'M-245']);
    expect(f.flags.front_averaging_not_applicable).toBe(true);
    expect(typeof f.trace === 'string' && f.trace.length > 0).toBe(true);
  });
  it('layer2-scope principal lists it at position 12 (index 11) and stays sorted', () => {
    const scope = read('scripts/seeds/bylaw/layer2-scope.json');
    const principal: string[] = scope.targets.principal;
    expect(principal.indexOf(TARGET)).toBe(11);
    expect(principal.length).toBe(26);
    expect(isSortedUnique(principal)).toBe(true);
    expect(principal).toContain('front_setback_m');
  });
  it('the lineage field main_front_setback_m keys the target in keyed.layer2_targets', () => {
    const fields: Json[] = read('docs/reference/maxbld-field-lineage.json').fields;
    const f = fields.find((x) => x.field === 'main_front_setback_m') as Json;
    expect(f).toBeTruthy();
    expect(f.keyed.layer2_targets).toContain('front_setback_m');
    expect(f.keyed.layer2_targets).toContain(TARGET);
  });
});

describe('MB-18 j — J2 matrix (red): undecided averaging still answers the 6.0 m zone value', () => {
  it('every zone x residential type reads front_setback_m gated and the fallback as the 6.0 m zone value', () => {
    let n = 0;
    for (const z of ZONES) for (const bt of C.residentialTypes) {
      const l = lot(z, bt, { flags: UNDECIDED });
      expect([z, bt, noAvgTokens(l)]).toEqual([z, bt, true]);
      const direct = eff(l, 'front_setback_m');
      expect([z, bt, direct.status, direct.reason]).toEqual([z, bt, 'not_evaluated', 'condition_unknown:front_averaging_not_applicable']);
      const fb = eff(l, TARGET);
      if (HOUSE_TYPES.includes(bt)) {
        expect([z, bt, fb.status, fb.value]).toEqual([z, bt, 'value', 6]);
        expect([z, bt, WHOLE.test(String(fb.winner))]).toEqual([z, bt, true]);
      } else {
        // apartment_building and townhouse: the base unit x.40.70(5)/(7) waits on the undecided major_street fact (R3-01: undecided is never read as absent); no stored class is one of these types
        expect([z, bt, fb.status, fb.reason]).toEqual([z, bt, 'not_evaluated', 'condition_unknown:major_street']);
      }
      n += 1;
    }
    expect(n).toBe(ZONES.length * C.residentialTypes.length);
  });
});

describe('MB-18 j — J3 averaging applies (red on the fallback half): the averaged yard, never the 6.0 m floor', () => {
  it('a neighbour at 4.5 m gives front_setback_m 4.5 while the fallback stays the plain 6.0 m zone value', () => {
    const l = lot('RD', 'detached_house', {
      flags: { front_averaging_not_applicable: false, one_abutting_building_within_15_m: true, two_abutting_buildings_within_15_m: false },
      vars: { abutting_front_setback_m: 4.5 },
    });
    const direct = eff(l, 'front_setback_m');
    expect([direct.status, direct.value, direct.winner]).toEqual(['value', 4.5, '10.5.40.70(1)#(1)(A)']);
    const fb = eff(l, TARGET);
    expect([fb.status, fb.value]).toEqual(['value', 6]);
    expect(WHOLE.test(String(fb.winner))).toBe(true);
  });
});

describe('MB-18 j — J4 exceptions (red): the gate runs for front_setback_m, the read on the base layer', () => {
  it('(a) an authored exception lot reads the 6.0 m zone value on a base unit', () => {
    const CA = ctxWith({ '900.3.10(155)': 'authored' });
    const l = lot('RD', 'detached_house', { exception: '900.3.10(155)' });
    const r = E.effective(l, TARGET, cands(l), CA);
    expect([r.status, r.value]).toEqual(['value', 6]);
    expect(WHOLE.test(String(r.winner))).toBe(true);
  });
  it('(b) a refused exception lot is not evaluated with the same reason as front_setback_m', () => {
    const refused = EXC_IDS
      .map((e) => ({ e, r: eff(lot('RD', 'detached_house', { exception: e, flags: { front_averaging_not_applicable: true } }), 'front_setback_m') }))
      .filter(({ r }) => typeof r.reason === 'string' && r.reason.startsWith('exception_not_authored'));
    expect(refused.length).toBeGreaterThan(0);
    const ex = (refused[0] as { e: string }).e;
    const l = lot('RD', 'detached_house', { exception: ex, flags: { front_averaging_not_applicable: true } });
    const fb = eff(l, TARGET);
    expect([fb.status, fb.reason]).toEqual(['not_evaluated', `exception_not_authored:${ex}`]);
    expect(fb.reason).toBe(eff(l, 'front_setback_m').reason);
  });
  it('(c) a partial naming only the fallback key stays gated (the gate runs for the target read)', () => {
    const CP = ctxWith({ '900.3.10(155)': { status: 'partial', targets: [TARGET] } });
    const l = lot('RD', 'detached_house', { exception: '900.3.10(155)' });
    const r = E.effective(l, TARGET, cands(l), CP);
    expect(r.status).toBe('not_evaluated');
    expect(String(r.reason).startsWith('exception_not_authored')).toBe(true);
  });
  it('(d) a partial naming front_setback_m lets the fallback read its 6.0 m', () => {
    const CP = ctxWith({ '900.3.10(155)': { status: 'partial', targets: ['front_setback_m'] } });
    const l = lot('RD', 'detached_house', { exception: '900.3.10(155)' });
    const r = E.effective(l, TARGET, cands(l), CP);
    expect([r.status, r.value]).toEqual(['value', 6]);
    expect(WHOLE.test(String(r.winner))).toBe(true);
  });
});

describe('MB-18 j — J5 an exception that keys front_setback_m (red): the fallback stays the zone value', () => {
  it('900.3.10(70) authored: the fallback is 6 from a base unit, not the exception value', () => {
    const CA = ctxWith({ '900.3.10(70)': 'authored' });
    const l = lot('RD', 'detached_house', { exception: '900.3.10(70)', flags: { front_averaging_not_applicable: false } });
    const r = E.effective(l, TARGET, cands(l), CA);
    expect([r.status, r.value]).toEqual(['value', 6]);
    expect(WHOLE.test(String(r.winner))).toBe(true);
    expect(r.winner).not.toContain('900.3.10(70)');
  });
});

describe('MB-18 j — J6 memo isolation (red on the fallback half): a fallback read never moves the direct read', () => {
  it('with one shared env memo the front setback stays gated and both fallback reads are deep-equal', () => {
    const l = lot('RD', 'detached_house', { flags: UNDECIDED });
    const cs = cands(l); const env = { memo: new Map() }; const alone = eff(l, 'front_setback_m');
    const f1 = E.effective(l, TARGET, cs, C, env); const mid = E.effective(l, 'front_setback_m', cs, C, env); const f2 = E.effective(l, TARGET, cs, C, env);
    expect([mid.status, mid.reason]).toEqual(['not_evaluated', 'condition_unknown:front_averaging_not_applicable']);
    expect([mid, f1.status, f1.value]).toEqual([alone, 'value', 6]);
    expect(f2).toEqual(f1);
  });
});

describe('MB-18 j — J7 no gate bypass (red on the first expectation): noFallback leaves every gate in place', () => {
  it('an ordinary lot is no_candidate without the hook; a refused lot keeps the exception reason', () => {
    const l = lot('RD', 'detached_house', { flags: { front_averaging_not_applicable: true } });
    const r = E.effective(l, TARGET, cands(l), C, { noFallback: true });
    expect([r.status, r.reason]).toEqual(['not_evaluated', 'no_candidate']);
    const ex = EXC_IDS.find((e) => { const q = eff(lot('RD', 'detached_house', { exception: e, flags: { front_averaging_not_applicable: true } }), 'front_setback_m').reason; return typeof q === 'string' && q.startsWith('exception_not_authored'); });
    expect(ex).toBeTruthy();
    const g = lot('RD', 'detached_house', { exception: ex, flags: { front_averaging_not_applicable: true } });
    const on = E.effective(g, TARGET, cands(g), C);
    const off = E.effective(g, TARGET, cands(g), C, { noFallback: true });
    expect([on.status, off.status]).toEqual(['not_evaluated', 'not_evaluated']);
    expect(String(on.reason).startsWith('exception_not_authored')).toBe(true);
    expect(off.reason).toBe(on.reason);
  });
});

describe('MB-18 j — J8 the other zero-move lock (green on base): emptying the fallback map moves nothing', () => {
  it('every front_setback_m answer over zones x types x token flags is byte-identical with fallback_target {}', () => {
    const C0 = E.makeContext(VO.evaluatorVocab({ ...I.vocab, fallback_target: {} }), { absences: I.absences });
    let n = 0;
    for (const z of ZONES) for (const bt of C.residentialTypes) for (const f of FLAGS) {
      const l = lot(z, bt, { flags: { front_averaging_not_applicable: f } });
      const c = E.loadCandidates(l, units).candidates;
      expect([z, bt, String(f), JSON.stringify(E.effective(l, 'front_setback_m', c, C))])
        .toEqual([z, bt, String(f), JSON.stringify(E.effective(l, 'front_setback_m', c, C0))]);
      n += 1;
    }
    expect(n).toBe(ZONES.length * C.residentialTypes.length * FLAGS.length);
    expect(unitOf('10.5.40.70(1)#(1)(A)').unit_id).toBe('10.5.40.70(1)#(1)(A)');
  });
});
