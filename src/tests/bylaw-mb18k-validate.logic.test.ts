// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-423; docs/reports (MB-18 plan §19, item k, arm L);
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §6.5 (closed vocabularies), §6.4 rule 5
//
// MB-18 item k: the front-averaging fallback data (vocab.fallback_target / vocab.fallback_check) and the validator that
// checks it inside checkVocab. Every defect is reported under the EXISTING reason code vocab_reference_invalid, built as
// [fc.code, <stem>, <name>].join(fc.separator) with fc = vocab.fallback_check, so no new string text is added to the code
// (arm L). V1 / V4 / V5 lock today's behaviour; V2 / V3 are red until the validator and the data exist.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href);
const V = await mod('scripts/analysis/bylaw/validate.mjs');
const VO = await mod('scripts/analysis/bylaw/vocab.mjs');
const AG = await mod('scripts/analysis/bylaw/agree.mjs');
const AU = await mod('scripts/analysis/bylaw/authored.mjs');
const I = V.loadInputs({ root: process.cwd() });
const ag = AG.checkAgree({ shards: AU.loadAuthored(process.cwd()), adjudications: I.adjudications, vocab: I.vocab });

const KEY = 'averaging_distance_m';
const codeOf = (msg: string): string => String(msg).split(':')[0] ?? '';
const cloneVocab = (): Json => structuredClone(I.vocab);
const fc = (): Json => I.vocab.fallback_check;
const stems = (): Json => (I.vocab.fallback_check || {}).stems;
/** The violation the validator must produce for <stem> on the entry named <name>, built from vocab data only. */
const want = (stem: string, name: string): string => [fc().code, stems()[stem], name].join(fc().separator);
const hasCode = (r: Json): boolean => r.pass === false && r.violations.length > 0 && r.violations.every((x: string) => codeOf(x) === 'vocab_reference_invalid');
const data = (o: Json): string[] => Object.keys(o || {}).filter((k) => k !== '$comment');
// a valid entry for KEY, derived from the committed one (or a minimal stand-in while the data is still absent)
const goodEntry = (): Json => structuredClone((I.vocab.fallback_target || {})[KEY] ?? { of: KEY, self: true, layer: 'base', flags: {}, ruling: 'r', trace: 't' });
const withEntry = (fn: (v: Json) => void = () => {}): Json => {
  const v = cloneVocab();
  v.fallback_target = { ...(I.vocab.fallback_target || {}), [KEY]: goodEntry() };
  fn(v);
  return v;
};
const entry = (v: Json): Json => v.fallback_target[KEY];
const spareFlag = (v: Json): string => data(v.lot_condition).find((k) => !Object.hasOwn(entry(v).flags, k)) as string;

describe('V1 good twin (lock, green on base): the committed vocab and an unvalidated fallback pass', () => {
  it('checkVocab(I.vocab).pass is true', () => {
    const r = VO.checkVocab(I.vocab);
    expect(r.violations).toEqual([]);
    expect(r.pass).toBe(true);
  });
  it('an empty fallback_target with no fallback_check passes (nothing to validate)', () => {
    const v = cloneVocab();
    v.fallback_target = {};
    delete v.fallback_check;
    const r = VO.checkVocab(v);
    expect(r.pass).toBe(true);
    expect(r.violations).toEqual([]);
  });
});

describe('V2 negative fixtures (red on base: nothing is validated yet)', () => {
  const FIXTURES: { name: string; vocab: () => Json; stem: string; ref: string }[] = [
    { name: 'of names something that is not a dsl_target', stem: 'bad_of', ref: KEY,
      vocab: () => withEntry((v) => (entry(v).of = 'not_a_dsl_target')) },
    { name: 'self is true but of differs from the key', stem: 'bad_self', ref: KEY,
      vocab: () => withEntry((v) => { entry(v).self = true; entry(v).of = 'not_a_dsl_target'; }) },
    { name: 'self is false and of equals the key', stem: 'bad_self', ref: KEY,
      vocab: () => withEntry((v) => { entry(v).self = false; entry(v).of = KEY; }) },
    { name: 'layer not in fallback_check.layers', stem: 'bad_layer', ref: KEY,
      vocab: () => withEntry((v) => (entry(v).layer = 'zone')) },
    { name: 'flags has two keys', stem: 'bad_flags', ref: KEY,
      vocab: () => withEntry((v) => { const s = spareFlag(v); entry(v).flags = { ...entry(v).flags, [s]: true }; }) },
    { name: 'flags has a key that is not a lot_condition', stem: 'bad_flags', ref: KEY,
      vocab: () => withEntry((v) => (entry(v).flags = { not_a_lot_condition: true })) },
    { name: 'a flag value false', stem: 'bad_flags', ref: KEY,
      vocab: () => withEntry((v) => (entry(v).flags = { corner_lot: false })) },
    { name: 'empty ruling', stem: 'bad_ruling', ref: KEY,
      vocab: () => withEntry((v) => (entry(v).ruling = '')) },
    { name: 'empty trace', stem: 'bad_trace', ref: KEY,
      vocab: () => withEntry((v) => (entry(v).trace = '')) },
    { name: 'self missing', stem: 'bad_self', ref: KEY,
      vocab: () => withEntry((v) => delete entry(v).self) },
    { name: 'of is itself a key of fallback_target while self is false', stem: 'bad_of', ref: KEY,
      vocab: () => withEntry((v) => { entry(v).self = false; entry(v).of = 'height_m'; v.fallback_target.height_m = { ...goodEntry(), of: 'height_m' }; }) },
    { name: 'the entry present but fallback_check deleted', stem: 'bad_check', ref: KEY,
      vocab: () => withEntry((v) => delete v.fallback_check) },
    { name: 'the entry key is not a dsl_target', stem: 'bad_of', ref: 'no_such_target',
      vocab: () => withEntry((v) => { v.fallback_target = { no_such_target: { ...goodEntry(), self: false, of: KEY } }; }) },
    { name: 'fallback_check.code is not a reason code', stem: 'bad_check', ref: KEY,
      vocab: () => withEntry((v) => (v.fallback_check.code = 'not_a_reason_code')) },
    { name: 'fallback_target is not a map', stem: 'bad_check', ref: KEY,
      vocab: () => withEntry((v) => (v.fallback_target = [KEY])) },
    { name: 'the entry present and fallback_check.stems deleted', stem: 'bad_check', ref: KEY,
      vocab: () => withEntry((v) => delete v.fallback_check.stems) },
  ];

  it('there are 16 fixtures', () => {
    expect(FIXTURES.length).toBe(16);
  });

  it('fallback_check declares the seven stems and the reason code it reports under', () => {
    expect(fc().code).toBe('vocab_reference_invalid');
    expect(VO.REASON_CODES).toContain(fc().code);
    for (const s of ['bad_of', 'bad_self', 'bad_layer', 'bad_flags', 'bad_ruling', 'bad_trace', 'bad_check']) expect(stems()[s], s).toEqual(expect.any(String));
  });

  for (const f of FIXTURES) {
    it(`${f.name} fails under vocab_reference_invalid`, () => {
      const r = VO.checkVocab(f.vocab());
      expect(r.pass).toBe(false);
      expect(r.violations.length).toBeGreaterThan(0);
      // the check block itself is gone in these two fixtures, so its code and stems are unknowable: failing closed is the assertion
      if (f.stem === 'bad_check') return;
      expect(hasCode(r)).toBe(true);
      expect(r.violations).toContain(want(f.stem, f.ref));
    });
  }
});

describe('V3 independent structure of the committed fallback data (red until the data exists)', () => {
  it('fallback_check declares code, separator, layers and stems', () => {
    const c = fc();
    expect(typeof c.code).toBe('string');
    expect(typeof c.separator).toBe('string');
    expect(Array.isArray(c.layers) && c.layers.length > 0).toBe(true);
    for (const s of ['bad_of', 'bad_self', 'bad_layer', 'bad_flags', 'bad_ruling', 'bad_trace', 'bad_check']) expect(c.stems, s).toHaveProperty(s);
  });
  it('every fallback layer is a vocab.layer value (the fallback reads a layer fact)', () => {
    for (const l of fc().layers) expect(I.vocab.layer, l).toContain(l);
  });
  it('every entry names a dsl_target, lot_condition flags, a declared layer, and a resolvable unit for the clause it reads (e.of)', () => {
    const targets = data(I.vocab.fallback_target);
    expect(targets.length).toBeGreaterThan(0);
    const units = [...ag.units.values()].map((r: Json) => r.unit);
    for (const key of targets) {
      const e = I.vocab.fallback_target[key] as Json;
      expect(data(I.vocab.dsl_target), `of of ${key}`).toContain(e.of);
      const flags = Object.keys(e.flags || {});
      for (const fl of flags) expect(data(I.vocab.lot_condition), `flag ${fl} of ${key}`).toContain(fl);
      expect(I.vocab.layer, `layer of ${key}`).toContain(e.layer);
      expect(fc().layers, `layer of ${key}`).toContain(e.layer);
      // a resolved unit carries the clause the fallback reads (e.of) in its target list and every flag token in its condition
      const hit = units.some((u: Json) => {
        const t = u?.target;
        const namesKey = Array.isArray(t) ? t.includes(e.of) : t === e.of;
        if (!namesKey) return false;
        const body = JSON.stringify(u?.condition ?? null);
        return flags.every((fl) => body.includes(`"${fl}"`));
      });
      expect(hit, `${key} resolves in an agreed unit with its flag tokens`).toBe(true);
    }
  });
});

describe('V4 selfTest still totals (lock, green on base)', () => {
  it('VO.selfTest().pass is true', () => {
    const r = VO.selfTest();
    expect(r.results.filter((x: Json) => !x.ok)).toEqual([]);
    expect(r.pass).toBe(true);
  });
});

describe('V5 arm L lock (green on base): no string literal in evaluate.mjs / vocab.mjs', () => {
  it('literal-scan --scan reports nothing', () => {
    const res = spawnSync('node', ['scripts/analysis/mcbylaws/literal-scan.mjs', '--scan', 'scripts/analysis/bylaw/evaluate.mjs', 'scripts/analysis/bylaw/vocab.mjs'], { cwd: process.cwd(), encoding: 'utf8' });
    expect(res.stderr).toBe('');
    expect(res.stdout).toBe('');
    expect(res.status).toBe(0);
  });
});
