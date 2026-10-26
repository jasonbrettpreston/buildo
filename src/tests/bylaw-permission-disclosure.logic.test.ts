// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-169 (1) (a set-aside unit attaches the closed disclosure "If {condition}: {effect}.")
// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (the logical row; disclosures are recomputed on read, never stored)
// Handbook: 2026-10-26-batch-m#CHAT-180.L2-G5-DISCLOSURE-ON-READ; CHAT-80.QP (recompute on read); CHAT-77.freeze (the 11 row fields)
//
// G5 (PLAN-scope v3 §6, v4 §6, v5 §6, v6 A4): the permission word's M-169 set-aside disclosures are recomputed on read in
// bylaw-materialize.js logicalRowsOf, keyed by class under permission_disclosures; the {effect} is the archetype's closed vocab phrase.
// Each lock is proven both ways (the twins). G5-p proves C6 moves permitted() only by its new `disclosures: []` key.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .js / .mjs module surface and seed JSON
const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const E = require(path.join(ROOT, 'scripts/analysis/bylaw/evaluate.mjs')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const VO = require(path.join(ROOT, 'scripts/analysis/bylaw/vocab.mjs')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const M = require(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LR = require(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js')) as Json;

const INPUT = read('docs/reference/bylaw-layer2-input.json');
const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const MAP = read('scripts/seeds/bylaw/layer2-map.json');
const SCOPE = read('scripts/seeds/bylaw/layer2-scope.json');
const UD = VOCAB.undetermined_condition_disclosure;
const parcel = (id: number, o: Json = {}): Json => ({
  id, parcel_id: String(1000 + id), zoning_class: 'RD', zoning_zn_string: 'RD (f10.0; a245)', exception_number: null, zoning_overlays: {}, on_policy_road: false, is_corner_lot: false,
  is_through_lot: false, abuts_laneway: false, frontage_m: 10.5, depth_m: 35.2, lot_size_sqm: 369.6, zoning_is_ambiguous: false, in_sixplex_area: false, is_heritage_designated: false, geom_npoints: 5, ...o,
});
const mkEnv = (hooks: Json = {}): Json => M.makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList: ['R', 'RD', 'RS', 'RT', 'RM'], versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version }, hooks });
/** A set-aside in the B disclosure shape (PLAN-scope v3 §6.2): {unit_id, archetype, condition_token, condition_phrase}. */
const D = (unit_id: string, archetype: string): Json => ({ unit_id, archetype, condition_token: 'abuts_named_street', condition_phrase: UD.lot_condition.abuts_named_street });
const withDisclosures = (ds: Json[]): Json => ({ permitted: (lot: Json, bt: string, cands: Json[]) => ({ ...E.permitted(lot, bt, cands, mkEnv().ctx), disclosures: ds }) });
function logical(p: Json, env: Json, mutate: (lot: Json) => Json = (x) => x): Json {
  const out = M.materializeBatch([p], env);
  const dicts = LR.makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts });
  return M.logicalRowsOf(p, mutate(out.rows.lots[0]), dicts, env) as Json;
}

describe('G5: the permission disclosures are recomputed on read (CHAT-180)', () => {
  it('G5-a: two set-asides (reverse order, one repeated) give two closed sentences, sorted and de-duplicated, byte-identical on a second read', () => {
    const env = mkEnv(withDisclosures([D('Z#2', 'PROHIBIT'), D('A#1', 'PERMIT'), D('Z#2', 'PROHIBIT')]));
    const v = logical(parcel(1), env);
    const want = [`If ${UD.lot_condition.abuts_named_street}: this use is also permitted by A#1.`, `If ${UD.lot_condition.abuts_named_street}: this use is not permitted, by Z#2.`];
    for (const c of SCOPE.classes as string[]) expect([c, v.permission_disclosures[c]]).toEqual([c, want]);
    expect(JSON.stringify(logical(parcel(1), env))).toBe(JSON.stringify(v));
  });
  it('G5-b twin: no set-aside gives [] for every class; a gated lot gives null for all five classes', () => {
    const env = mkEnv();
    expect(Object.values(logical(parcel(1), env).permission_disclosures)).toEqual(SCOPE.classes.map(() => []));
    const g = logical(parcel(3, { zoning_is_ambiguous: true }), env);
    expect([g.lot_gate, Object.keys(g.permission_disclosures).sort(), Object.values(g.permission_disclosures)]).toEqual(['ambiguous_zone', [...SCOPE.classes].sort(), SCOPE.classes.map(() => null)]);
  });
  it('G5-c: at equal versions a stored word that differs from the recompute throws PermissionRecomputeDriftError by name; the twin (equal words) does not', () => {
    const env = mkEnv();
    const keys = Object.keys(MAP.permission_image);
    const flip = (lot: Json): Json => ({ ...lot, permitted: lot.permitted.map((c: number, i: number) => (i === 0 ? (c + 1) % keys.length : c)), permitted_text_ids: null });
    expect(() => logical(parcel(1), env, flip)).toThrow(/permission_recompute_drift:1:detached_house/);
    expect(() => logical(parcel(1), env)).not.toThrow();
  });
  it('G5-c2: a stored row from another table / evaluator version throws PermissionRecomputeStaleError (stale, not drift); equal versions do not', () => {
    const env = mkEnv();
    expect(() => logical(parcel(1), env, (lot) => ({ ...lot, evaluator_version: '0'.repeat(64) }))).toThrow(/permission_recompute_stale:[0-9a-f]{8}\/00000000:[0-9a-f]{8}\/[0-9a-f]{8}/);
    expect(() => logical(parcel(1), env, (lot) => ({ ...lot, evaluator_version: '0'.repeat(64) }))).toThrow(M.PermissionRecomputeStaleError);
  });
  it('G5-k: a permitted() result without a disclosures array throws permission_disclosures_missing (the B shape contract); with one it does not', () => {
    const env = mkEnv({ permitted: (lot: Json, bt: string, cands: Json[]) => { const { disclosures: _d, ...rest } = E.permitted(lot, bt, cands, mkEnv().ctx); return rest; } }); // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(() => logical(parcel(1), env)).toThrow(/permission_disclosures_missing:1:detached_house/);
    expect(E.permitted(M.classLotFor(parcel(1), 'principal', 'detached_house', mkEnv()), 'detached_house', E.loadCandidates(M.classLotFor(parcel(1), 'principal', 'detached_house', mkEnv()), INPUT.body.units).candidates, mkEnv().ctx).disclosures).toEqual([]);
  });
  it('G5-d: checkVocab refuses a permission_effect missing PROHIBIT, without {clause}, with two {clause}, with another placeholder, or with an unknown key; the shipped block passes', () => {
    const bad = (pe: Json): string[] => VO.checkPermissionEffect({ undetermined_condition_disclosure: { ...UD, permission_effect: pe } });
    const ok = UD.permission_effect;
    expect(bad({ ...ok, PROHIBIT: undefined })).toEqual(['vocab_permission_effect_missing: PROHIBIT']);
    expect(bad({ ...ok, PERMIT: 'this use is also permitted' })).toEqual(['vocab_permission_effect_placeholder: PERMIT']);
    expect(bad({ ...ok, PERMIT: 'by {clause} and {clause}' })).toEqual(['vocab_permission_effect_placeholder: PERMIT']);
    expect(bad({ ...ok, PERMIT: 'by {clause} if {condition}' })).toEqual(['vocab_permission_effect_placeholder: PERMIT']);
    expect(bad({ ...ok, LIMIT: 'x {clause}' })).toEqual(['vocab_permission_effect_unknown_key: LIMIT']);
    expect([bad(ok), VO.checkVocab(VOCAB).violations]).toEqual([[], []]);
  });
  it('G5-L (disk): the generated evaluator vocab carries undetermined_condition_disclosure.permission_effect, equal to vocab.json', () => {
    expect(INPUT.body.evaluator_vocab.undetermined_condition_disclosure.permission_effect).toEqual(UD.permission_effect);
  });
});

// G5-p (PLAN-scope v6 A4): C6 changes permitted() by its `disclosures` key only. The eval-perf corpus hashed with `disclosures` removed from
// permitted() results ONLY equals the committed g5 pre-registration's golden_from (the C5b literal); every result carries disclosures: [].
const PVOCAB = VOCAB;
const ABS = read('scripts/seeds/bylaw/absence-rulings.json');
const UNITS: Json[] = read('src/tests/fixtures/bylaw/eval-units.json').units.filter((u: Json) => u.candidate);
const VECTORS: Json[] = read('scripts/seeds/bylaw/eval-vectors.json').vectors;
const fx = { scope: 'use', aspect: 'use_permission', attaches_to: null, reason: 'fixture', ruling: 'fixture' };
const EV = { ...VO.evaluatorVocab(PVOCAB), permission_scope: { ...PVOCAB.permission_scope, '600.60.40(1)#(B)': fx, '900.2.10(604)#SSP(A)': fx } };
const C = E.makeContext(EV, { absences: ABS.rulings });
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort(cmp).map((y) => [y, x[y]])) : x));
const noLosers = (x: unknown): unknown => JSON.parse(JSON.stringify(x, (k, v) => (k === 'losers' ? undefined : v)));
function corpusHash(permittedOf: (lot: Json, bt: string, cands: Json[]) => Json): { hash: string; bad: string[] } {
  const lots = [...new Set(VECTORS.map((v) => stable(v.lot)))].sort(cmp).map((s) => JSON.parse(s));
  const targets = Object.keys(PVOCAB.dsl_target).sort(cmp);
  const h = crypto.createHash('sha256'); const bad: string[] = [];
  for (const L of lots) for (const lot of [L, { ...L, building_type: null }, { ...L, flags: {} }, { ...L, building_type: null, flags: {} }]) {
    const cands = E.loadCandidates(lot, UNITS).candidates;
    for (const t of targets) h.update(stable(noLosers(E.effective(lot, t, cands, C))));
    for (const bt of EV.building_type_residential) {
      const p = permittedOf(lot, bt, cands);
      if (!Array.isArray(p.disclosures) || p.disclosures.length) bad.push(`${stable(lot).slice(0, 40)}|${bt}`);
      const { disclosures: _d, ...rest } = p; // eslint-disable-line @typescript-eslint/no-unused-vars
      h.update(stable(noLosers(rest)));
    }
  }
  return { hash: h.digest('hex'), bad };
}
describe('G5-p: permitted() moved only by disclosures: [] (the eval-perf corpus)', () => {
  const pre = read('scripts/analysis/bylaw-validation/layer2-rounds/prereg-g5.json');
  it('with permitted()\'s disclosures removed the corpus hashes to prereg-g5.eval_perf.golden_from, and all 840 results carry disclosures: []', () => {
    const r = corpusHash((lot, bt, cands) => E.permitted(lot, bt, cands, C));
    expect([r.hash, r.bad]).toEqual([pre.eval_perf.golden_from, []]);
  });
  it('twin: a patched permitted() that also flips a winner fails, so the check names a moved result', () => {
    let flipped = 0;
    const r = corpusHash((lot, bt, cands) => { const p = E.permitted(lot, bt, cands, C); if (!flipped) { flipped++; return { ...p, winners: ['FLIP#1'] }; } return p; });
    expect([flipped, r.hash === pre.eval_perf.golden_from]).toEqual([1, false]);
  });
});
