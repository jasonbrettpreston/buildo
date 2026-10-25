// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (the logical row shape; stored losers become recompute-on-read), §4 (status sets), §7 I9, I14
// Handbook: Spec 132 §core.9 (R-W: compute is pure); operator CHAT-80.QP (option 4: one row per lot, positional arrays in scope-seed order); CHAT-77.freeze
//
// Option 4 (CHAT-80.QP): the pure encode / decode of one lot's results into the lot row's positional arrays (scripts/lib/bylaw-lot-row.js):
// result codes, values, reason / winner / evidence-ref dictionary keys, evidence kinds, and the sparse per-class overrides. The dictionaries are
// closed (unit ids, reason and evidence-ref texts), keyed by a 32-bit hash of their content. RED FIRST: docs/reports/red-evidence/resolve_bylaws/part-e-option4-red.json.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .js module surface
const ROOT = path.resolve(__dirname, '../../../../');
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lr = (): Json => require(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js')) as Json;
const MAP = read('scripts/seeds/bylaw/layer2-map.json');
const PAIRS = [
  { structure: 'principal', target: 'height_m' },
  { structure: 'principal', target: 'fsi' },
  { structure: 'garden_suite', target: 'height_m' },
  { structure: 'laneway_suite', target: 'height_m' },
];
const CLASSES = ['detached_house', 'detached_houseplex'];
const UNIT = 'x.1#a';
const base = (o: Json = {}): Json => ({ status: 'applies', reason: null, value: 10, value_kind: 'number', winner_unit_id: UNIT, winner_layer: 'base', evidence_kind: 'clause', evidence_ref: 'x.1', ...o });
const notEval = (reason: string): Json => ({ status: 'not_evaluated', reason, value: null, value_kind: null, winner_unit_id: null, winner_layer: null, evidence_kind: null, evidence_ref: null });
const unitInfo = { [UNIT]: { regulation_id: 'x.1', layer: 'base' } };

describe('the dictionary key: first four bytes of sha256, a signed 32-bit integer', () => {
  it('hash32 matches the byte rule and stays inside int4', () => {
    for (const t of ['a', 'exception_not_authored:900.3.10(1)', '10.20.40.10(1)#(1)(B)', '']) {
      const h = crypto.createHash('sha256').update(t).digest();
      expect(lr().hash32(t), t).toBe(h.readInt32BE(0));
      expect(Number.isInteger(lr().hash32(t))).toBe(true);
      expect(lr().hash32(t)).toBeGreaterThanOrEqual(-2147483648);
      expect(lr().hash32(t)).toBeLessThanOrEqual(2147483647);
    }
  });
});

describe('result codes: status x value_kind from layer2-map.json, in map order', () => {
  it('applies expands by value_kind; the other statuses stand alone; code 0 is the first', () => {
    expect(lr().resultCodes(MAP)).toEqual(['applies:number', 'applies:unlimited', 'applies:unregulated', 'not_applicable', 'not_evaluated']);
    expect(Object.isFrozen(lr().resultCodes(MAP))).toBe(true);
  });
  it('codeOf and splitCode are inverses; an unknown status or value kind throws (never defaulted)', () => {
    for (const [s, k] of [['applies', 'number'], ['applies', 'unlimited'], ['applies', 'unregulated'], ['not_applicable', null], ['not_evaluated', null]] as Array<[string, string | null]>) {
      expect(lr().splitCode(MAP, lr().codeOf(MAP, s, k))).toEqual({ status: s, value_kind: k });
    }
    expect(() => lr().codeOf(MAP, 'maybe', null)).toThrow(/status/);
    expect(() => lr().codeOf(MAP, 'applies', 'huge')).toThrow(/value_kind/);
    expect(() => lr().splitCode(MAP, 9)).toThrow(/code/);
  });
});

describe('the closed dictionaries: units and texts, keyed by hash32 of their content, fail-loud on a collision', () => {
  it('the same unit or text gets the same key and one row; the unit row carries its regulation id and layer', () => {
    const d = lr().makeDict();
    const k = d.unitKey(UNIT, unitInfo[UNIT]);
    expect(d.unitKey(UNIT, unitInfo[UNIT])).toBe(k);
    expect(k).toBe(lr().hash32(UNIT));
    expect(d.textKey('no_candidate')).toBe(lr().hash32('no_candidate'));
    expect(d.rows().units).toEqual([{ unit_key: k, unit_id: UNIT, regulation_id: 'x.1', layer: 'base' }]);
    expect(d.rows().texts).toEqual([{ text_key: lr().hash32('no_candidate'), text: 'no_candidate' }]);
  });
  it('a seeded dictionary row under the same key with other content is a collision and throws', () => {
    const d = lr().makeDict();
    d.seed({ units: [], texts: [{ text_key: lr().hash32('a'), text: 'not-a' }] });
    expect(() => d.textKey('a')).toThrow(/collision/);
    const e = lr().makeDict();
    e.seed({ units: [{ unit_key: lr().hash32(UNIT), unit_id: 'other', regulation_id: 'x', layer: 'base' }], texts: [] });
    expect(() => e.unitKey(UNIT, unitInfo[UNIT])).toThrow(/collision/);
  });
  it('seeding does not emit rows for entries this batch did not use', () => {
    const d = lr().makeDict();
    d.seed({ units: [{ unit_key: 1, unit_id: 'u', regulation_id: 'r', layer: 'base' }], texts: [{ text_key: 2, text: 't' }] });
    expect(d.rows()).toEqual({ units: [], texts: [] });
  });
});

describe('encodeLotResults / decodeLotResults: positional arrays in pair order, the representative class plus sparse overrides', () => {
  const mk = (byClass: Json): Json => {
    const dict = lr().makeDict();
    const enc = lr().encodeLotResults({ pairs: PAIRS, classes: CLASSES, byClass, map: MAP, dict, unitInfo });
    const dicts = lr().makeDecodeDicts(dict.rows());
    return { dict, enc, dicts, dec: lr().decodeLotResults({ lot: enc, pairs: PAIRS, classes: CLASSES, map: MAP, dicts }) };
  };
  const same = (r: Json): Json[] => PAIRS.map(() => ({ ...r }));

  it('arrays have one slot per pair in scope order: codes always, the rest as typed arrays with null slots', () => {
    const { enc } = mk({ detached_house: [base({ value: 11 }), notEval('no_candidate'), base({ status: 'applies', value: null, value_kind: 'unregulated', winner_unit_id: null, winner_layer: null, evidence_kind: 'label_absent', evidence_ref: 'M-202(3)' }), base({ value: 6.3 })], detached_houseplex: null });
    expect(enc.codes).toEqual([0, 4, 2, 0]);
    expect(enc.numbers).toEqual([11, null, null, 6.3]);
    expect(enc.winner_ids.map((x: number | null) => x === null)).toEqual([false, true, true, false]);
    expect(enc.evidence_kinds).toEqual([MAP.evidence_kind.indexOf('clause'), null, MAP.evidence_kind.indexOf('label_absent'), MAP.evidence_kind.indexOf('clause')]);
    expect(enc.reason_ids[1]).toBe(lr().hash32('no_candidate'));
    expect(enc.reason_ids[0]).toBeNull();
    expect(enc.class_results).toBeNull();
  });

  it('round trip: every class and pair decodes to exactly the 8 stored fields that went in', () => {
    const rep = [base({ value: 11 }), notEval('no_candidate'), base({ value: null, value_kind: 'unlimited', winner_unit_id: null, winner_layer: null, evidence_kind: 'absence', evidence_ref: 'M-54' }), { status: 'not_applicable', reason: 'x.1', value: null, value_kind: null, winner_unit_id: null, winner_layer: null, evidence_kind: null, evidence_ref: null }];
    const { dec } = mk({ detached_house: rep, detached_houseplex: rep });
    for (const cls of CLASSES) PAIRS.forEach((p, i) => expect(dec.find((r: Json) => r.class === cls && r.structure === p.structure && r.target === p.target), `${cls} ${p.target}`).toMatchObject(rep[i] as Json));
  });

  it('a class equal to the representative adds nothing; a differing class stores only its differing pairs, keyed class -> pair index', () => {
    const rep = same(base({ value: 10 }));
    const hp = rep.map((r, i) => (i === 1 ? { ...r, value: 12 } : i === 2 ? notEval('missing_input:proposed_height_m') : r));
    const { enc, dec } = mk({ detached_house: rep, detached_houseplex: hp });
    expect(Object.keys(enc.class_results)).toEqual(['detached_houseplex']);
    expect(Object.keys(enc.class_results.detached_houseplex).sort()).toEqual(['1', '2']);
    expect(dec.find((r: Json) => r.class === 'detached_houseplex' && r.target === 'fsi').value).toBe(12);
    expect(dec.find((r: Json) => r.class === 'detached_houseplex' && r.structure === 'garden_suite').status).toBe('not_evaluated');
    expect(dec.find((r: Json) => r.class === 'detached_houseplex' && r.structure === 'laneway_suite').value).toBe(10);
  });

  it('an all-null typed array is stored as null; the codes array is never null', () => {
    const { enc } = mk({ detached_house: same(notEval('no_candidate')), detached_houseplex: same(notEval('no_candidate')) });
    expect(enc.numbers).toBeNull();
    expect(enc.winner_ids).toBeNull();
    expect(enc.evidence_kinds).toBeNull();
    expect(enc.evidence_ref_ids).toBeNull();
    expect(enc.codes).toEqual([4, 4, 4, 4]);
    expect(enc.reason_ids).toHaveLength(PAIRS.length);
  });

  it('the decoded winner layer comes from the unit dictionary, the evidence ref from the text dictionary', () => {
    const { dec } = mk({ detached_house: same(base()), detached_houseplex: same(base()) });
    expect(dec[0]).toMatchObject({ winner_unit_id: UNIT, winner_layer: 'base', evidence_kind: 'clause', evidence_ref: 'x.1' });
  });

  it('a key missing from the decode dictionaries, or a wrong array length, throws (a missing input is never defaulted)', () => {
    const { enc } = mk({ detached_house: same(base()), detached_houseplex: same(base()) });
    expect(() => lr().decodeLotResults({ lot: enc, pairs: PAIRS, classes: CLASSES, map: MAP, dicts: lr().makeDecodeDicts({ units: [], texts: [] }) })).toThrow(/dictionary/);
    expect(() => lr().decodeLotResults({ lot: { ...enc, codes: [0] }, pairs: PAIRS, classes: CLASSES, map: MAP, dicts: lr().makeDecodeDicts(lr().makeDict().rows()) })).toThrow(/length/);
  });

  it('encoding refuses a class list that is missing a class or a pair list that does not match the results', () => {
    const dict = lr().makeDict();
    expect(() => lr().encodeLotResults({ pairs: PAIRS, classes: CLASSES, byClass: { detached_house: same(base()) }, map: MAP, dict, unitInfo })).toThrow(/class/);
    expect(() => lr().encodeLotResults({ pairs: PAIRS, classes: CLASSES, byClass: { detached_house: [base()], detached_houseplex: [base()] }, map: MAP, dict, unitInfo })).toThrow(/length/);
  });
});

describe('encodePermitted / decodePermitted: permitted()\'s own words per class as two small arrays (R-IT)', () => {
  it('round trips permitted, prohibited with its clause list and not_evaluated with its reason', () => {
    const dict = lr().makeDict();
    const words = { detached_house: { status: 'permitted' }, detached_houseplex: { status: 'prohibited', clause: 'a,b' } };
    const enc = lr().encodePermitted({ classes: CLASSES, words, map: MAP, dict });
    expect(enc.permitted).toHaveLength(2);
    expect(enc.permitted_text_ids[0]).toBeNull();
    expect(lr().decodePermitted({ lot: enc, classes: CLASSES, map: MAP, dicts: lr().makeDecodeDicts(dict.rows()) })).toEqual(words);
    const gated = { detached_house: { status: 'not_evaluated', reason: 'ambiguous_zone' }, detached_houseplex: { status: 'not_evaluated', reason: 'ambiguous_zone' } };
    const enc2 = lr().encodePermitted({ classes: CLASSES, words: gated, map: MAP, dict });
    expect(lr().decodePermitted({ lot: enc2, classes: CLASSES, map: MAP, dicts: lr().makeDecodeDicts(dict.rows()) })).toEqual(gated);
  });
  it('a status outside permission_image throws', () => {
    expect(() => lr().encodePermitted({ classes: ['a'], words: { a: { status: 'maybe' } }, map: MAP, dict: lr().makeDict() })).toThrow(/permission_image/);
  });
});
