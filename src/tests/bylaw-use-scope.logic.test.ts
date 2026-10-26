// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5 (permitted(): the PERMIT / PROHIBIT precedence rules)
// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-56 (dated note 2026-10-25: the use permission reads only use-scope units), M-321
// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (the stored permission image)
// Handbook: 2026-10-25-batch-g#CHAT-152.L2-USE-SCOPE (A); 2026-10-26-batch-m#CHAT-181.L2-REVIEW-UNITS-ELEMENT
//
// The use-scope lane's locks (PLAN-scope v2 §4-§5, v3 §3 / §8, v5 §5.0, v6; ~/Buildo-scratch/scope/). Each lock is proven both ways:
//   L1a-L1f  vocab.permission_scope: totality against the agreed units, the closed arms, the fields that may reach committed vocab
//   L2       the evaluator vocab carries the block off disk (the F1 allowlist trap)
//   S1       an element-scope unit never decides the use (the dormer PROHIBIT on a real RD lot)
//   S4/S4b   fail closed by name: an undeclared or malformed entry, and a declared-but-empty block
//   R1       the 10 named real lots: production permitted() equals the committed Layer 2 round pre-registrations (read-only rule:
//            the last round with an actual asserts its `to`; a round with a prereg and no actual asserts its `from`; the chain holds)
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs / .js module surface and seed JSON
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

const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const INPUT = read('docs/reference/bylaw-layer2-input.json');
const MAP = read('scripts/seeds/bylaw/layer2-map.json');
const SCOPE = read('scripts/seeds/bylaw/layer2-scope.json');
const R1 = read('src/tests/fixtures/bylaw-use-scope/r1-lots.json');
const ROUNDS = 'scripts/analysis/bylaw-validation/layer2-rounds';
const PS: Json = VOCAB.permission_scope || {};
const entry = (scope: string, aspect: string, extra: Json = {}): Json => ({ scope, aspect, attaches_to: null, reason: 'fixture', ruling: 'fixture', ...extra });

describe('L1: vocab.permission_scope is total and closed (CHAT-152 A, CHAT-181)', () => {
  // the counts are pinned per round where they move: 425 / 144 / 281 after A (actual-l2a units), 419 / 138 / 281 after G3 (G3-e)
  it('L1a: every agreed PERMIT / PROHIBIT unit has exactly one entry and every entry names one', () => {
    const r = VO.checkPermissionScope(INPUT.body.units, VOCAB);
    expect([r.pass, r.violations]).toEqual([true, []]);
    expect(r.checked).toBe(Object.keys(PS).filter((k) => k !== '$comment').length);
  });
  it('L1b: a stale entry and a missing entry are named', () => {
    const extra = { ...VOCAB, permission_scope: { ...PS, 'X#stale': entry('use', 'use_permission') } };
    expect(VO.checkPermissionScope(INPUT.body.units, extra).violations).toEqual(['permission_scope_stale: X#stale']);
    const { ['150.15.30.1(2)#(2)(A)']: _gone, ...rest } = PS; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(VO.checkPermissionScope(INPUT.body.units, { ...VOCAB, permission_scope: rest }).violations).toEqual(['permission_scope_missing: 150.15.30.1(2)#(2)(A)']);
  });
  it('L1c / L1e / L1f: review scope, an unknown aspect, a use entry off use_permission, an unattached element on use_permission, an empty reason, an unknown field: each named', () => {
    const bad = (e: Json): string[] => VO.checkPermissionScopeVocab({ ...VOCAB, permission_scope: { 'X#1': e } });
    expect(bad(entry('review', 'envelope'))).toEqual(['vocab_permission_scope_value: X#1 scope "review"']);
    expect(bad(entry('element', 'wall'))).toEqual(['vocab_permission_scope_aspect: X#1 aspect "wall"']);
    expect(bad(entry('use', 'envelope'))).toEqual(['vocab_permission_scope_use_aspect: X#1 scope use with aspect envelope']);
    expect(bad(entry('element', 'use_permission'))).toEqual(['vocab_permission_scope_use_aspect: X#1 scope element with aspect use_permission']);
    expect(bad(entry('element', 'use_permission', { attaches_to: 'bedrooms' }))).toEqual([]);
    expect(bad(entry('use', 'use_permission', { reason: '' }))).toEqual(['vocab_permission_scope_reason: X#1 reason or ruling is empty']);
    expect(bad(entry('use', 'use_permission', { p_class_risk: 'g3' }))).toEqual(['vocab_permission_scope_field_unknown: X#1 p_class_risk']);
    expect(VO.checkVocab(VOCAB).violations).toEqual([]);
  });
  it('L1d: no element unit displaces a use unit on the real units; a fixture element unit that does is named', () => {
    expect(VO.checkPermissionScope(INPUT.body.units, VOCAB).violations.filter((x: string) => x.startsWith('permission_scope_displaces_use'))).toEqual([]);
    const units = [{ unit_id: 'EL#1', archetype: 'PROHIBIT', displaces: ['US#1'] }, { unit_id: 'US#1', archetype: 'PROHIBIT', displaces: [] }];
    const v = { ...VOCAB, permission_scope: { 'EL#1': entry('element', 'envelope'), 'US#1': entry('use', 'use_permission') } };
    expect(VO.checkPermissionScope(units, v).violations).toEqual(['permission_scope_displaces_use: EL#1 displaces US#1']);
  });
});

describe('L2: the evaluator vocab carries permission_scope off disk (the allowlist line)', () => {
  it('body.evaluator_vocab.permission_scope deep-equals vocab.json; the five ruled rooftop units are element', () => {
    expect(INPUT.body.evaluator_vocab.permission_scope).toEqual(PS);
    for (const id of ['10.10.40.10(8)#(8)(A)', '10.10.40.10(8)#(8)(B)', '10.10.40.10(8)#(8)(C)', '10.5.40.10(3)#(3)(C)', '10.5.40.10(5)#(5)(A)']) expect([id, PS[id] && PS[id].scope]).toEqual([id, 'element']);
  });
});

const env = M.makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList: R1.zone_list, versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });
const rowOf = (pid: string): Json => R1.rows.find((r: Json) => String(r.parcel_id) === pid);

describe('S: an element unit is not a use subject; fail closed by name', () => {
  it('S1: on a real RD lot the dormer PROHIBIT 10.5.40.60(7)(A) (element) neither decides nor changes the detached-house word or winners', () => {
    const L = M.classLotFor(rowOf('5035239'), 'principal', 'detached_house', env);
    const cands = E.loadCandidates(L, INPUT.body.units).candidates;
    const dormer = cands.find((u: Json) => u.unit_id === '10.5.40.60(7)#(7)(A)');
    expect(dormer && PS[dormer.unit_id].scope).toBe('element');
    const strip = (p: Json): Json => ({ status: p.status, reason: p.reason, winners: p.winners });
    expect(strip(E.permitted(L, 'detached_house', cands, env.ctx))).toEqual(strip(E.permitted(L, 'detached_house', cands.filter((u: Json) => u !== dormer), env.ctx)));
    expect(E.permitted(L, 'detached_house', cands, env.ctx).trace.some((t: string) => /PERMIT\/PROHIBIT units are not use subjects \(CHAT-152\)/.test(t))).toBe(true);
  });
  it('S4: a candidate PERMIT / PROHIBIT with no entry, and a malformed entry, throw by name (no permissive default)', () => {
    const L = M.classLotFor(rowOf('5035239'), 'principal', 'detached_house', env);
    const syn = { unit_id: 'SYN#undeclared', regulation_id: 'SYN', archetype: 'PROHIBIT', layer: 'base', target: 'none', bound: 'none', condition: 'none', applies_to: { part: 'whole', refs: [] }, application: { zones: ['RD'], building_types: ['any'], lot_conditions: [], uses: [] }, displaces: [] };
    expect(() => E.permitted(L, 'detached_house', [syn], env.ctx)).toThrow(/permission_scope_unit_undeclared:SYN#undeclared/);
    const C2 = E.makeContext({ ...INPUT.body.evaluator_vocab, permission_scope: { ...PS, 'SYN#undeclared': { scope: 'maybe' } } }, { authored: INPUT.body.authored });
    expect(() => E.permitted(L, 'detached_house', [syn], C2)).toThrow(/permission_scope_value_invalid:SYN#undeclared/);
  });
  it('S4b: a generated evaluator vocab whose permission_scope is removed makes makeContext throw permission_scope_absent', () => {
    expect(() => E.makeContext({ ...INPUT.body.evaluator_vocab, permission_scope: undefined })).toThrow(/permission_scope_absent/);
    expect(() => E.makeContext({ ...INPUT.body.evaluator_vocab, permission_scope: { $comment: 'x' } })).toThrow(/permission_scope_absent/);
  });
});

// ---- R1: the committed Layer 2 round pre-registrations, read-only (PLAN-scope v5 §5.0, v6 F2-r) ----
const ORDER: string[] = read(`${ROUNDS}/order.json`).order;
const has = (f: string): boolean => fs.existsSync(path.join(ROOT, ROUNDS, f));
const prereg = (r: string): Json => read(`${ROUNDS}/prereg-${r}.json`);
/** Production: the tree's own materializeBatch (stored permission image) + uncached permitted() winners, per R1 lot and class. */
function production(): Map<string, Json> {
  const out = M.materializeBatch(R1.rows, env);
  const dicts = LR.makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts });
  const res = new Map<string, Json>();
  for (const lot of out.rows.lots) {
    const row = R1.rows.find((r: Json) => Number(r.id) === Number(lot.parcel_id));
    const words = LR.decodePermitted({ lot, classes: env.classes, map: env.map, dicts });
    for (const cls of env.classes) {
      const w = words[cls];
      const L = M.classLotFor(row, 'principal', cls, env);
      const p = w.status === 'not_evaluated' ? { winners: [] } : E.permitted(L, env.classVectors[cls].building_type, E.loadCandidates(L, INPUT.body.units).candidates, env.ctx);
      res.set(`${row.parcel_id}|${cls}`, { word: w, winners: [...new Set<string>(p.winners || [])].sort() });
    }
  }
  return res;
}
describe('R1: the 10 named real lots equal the committed round pre-registrations (known wrong in law until G3; the RD semi in the G4 sense after)', () => {
  const rounds = ORDER.filter((r) => has(`prereg-${r}.json`));
  const lastActual = [...ORDER].reverse().find((r) => has(`actual-${r}.json`));
  const open = rounds.find((r) => !has(`actual-${r}.json`));
  it('the chain holds: each pre-registration starts where the previous one ends', () => {
    for (let i = 1; i < rounds.length; i++) {
      const prev = prereg(rounds[i - 1] as string); const cur = prereg(rounds[i] as string);
      expect([rounds[i], cur.r1.map((e: Json) => e.from)]).toEqual([rounds[i], prev.r1.map((e: Json) => e.to)]);
      expect([rounds[i], cur.cells.from]).toEqual([rounds[i], prev.cells.to]);
    }
  });
  it.each([...(lastActual ? [[lastActual, 'to']] : []), ...(open ? [[open, 'from']] : [])])('round %s: production equals prereg.r1[].%s on all 50 lot-classes', (r, side) => {
    const got = production();
    const want = prereg(r as string).r1.map((e: Json) => [e.parcel_id, e.class, e[side as string]]);
    expect(want.map(([pid, cls]: string[]) => [pid, cls, got.get(`${pid}|${cls}`)])).toEqual(want);
  }, 60_000);
  it('every committed actual equals its prereg on the compared keys (cells, r1)', () => {
    for (const r of ORDER.filter((x) => has(`actual-${x}.json`))) {
      const a = read(`${ROUNDS}/actual-${r}.json`); const p = prereg(r);
      expect([r, a.to.cells]).toEqual([r, p.cells.to]);
      expect([r, a.from.cells]).toEqual([r, p.cells.from]);
      expect([r, a.to.r1.map((e: Json) => ({ word: e.word, winners: e.winners }))]).toEqual([r, p.r1.map((e: Json) => e.to)]);
    }
  });
});

// ---- G1 (2026-10-26-batch-m#CHAT-178.L2-G1-USE-KEYING-ROUND; Spec 69a M-159(3) + M-244; PLAN-scope v3 §5.1, v4 §5.1, v6) ----
const G1_TOKENS = Object.keys(VOCAB.specific_use || {}).filter((k) => k !== '$comment' && (k === 'school' || /CHAT-178/.test(String((VOCAB.specific_use[k] as Json).ruling || ''))));
const ADJ: Json[] = read('scripts/seeds/bylaw/adjudications.json').adjudications;
const G1_RECORDS = ADJ.filter((a) => a.kind === 'correction' && /^2026-10-26-batch-m#CHAT-178/.test(String(a.rule)));
const unitOf = (id: string): Json => INPUT.body.units.find((u: Json) => u.unit_id === id);
describe('G1: the non-dwelling use clauses are keyed to their specific use (CHAT-178)', () => {
  it('G1-a: 45 records on 44 units, 25 new specific-use tokens (+ school = 26), the four school units untouched, 900.6.10(263)(F) and the CR use lists outside the round', () => {
    expect([G1_RECORDS.length, new Set(G1_RECORDS.map((r) => r.unit)).size, G1_TOKENS.length]).toEqual([45, 44, 26]);
    for (const id of ['900.6.10(263)#(263)[SSP](F)', '40.10.20.10(1)#(1)(A)', '40.10.20.10(1)#(1)(B)']) expect(G1_RECORDS.some((r) => r.unit === id)).toBe(false);
    for (const r of G1_RECORDS) for (const t of (unitOf(r.unit).application.uses as string[])) expect([r.unit, t, G1_TOKENS.includes(t)]).toEqual([r.unit, t, true]);
  });
  it('G1-b: on R1 lot RD 5035239 the correctional group home and seniors community house PROHIBITs are not applicable, by M-159(3)', () => {
    const L = { ...M.classLotFor(rowOf('5035239'), 'principal', 'detached_house', env), building_type: 'detached_house' };
    const rv = (n: string): Json => E.effective(L, n, E.loadCandidates(L, INPUT.body.units).candidates, env.ctx);
    expect(E.applies(L, unitOf('150.15.30.1(2)#(2)(A)'), env.ctx, rv).why).toBe('use correctional_group_home (a specific use the lot does not have, M-159(3))');
    expect(E.applies(L, unitOf('150.30.20.1(1)#(1)(B)'), env.ctx, rv).why).toBe('use seniors_community_house (a specific use the lot does not have, M-159(3))');
  });
  it('G1-c twin: the same lot with uses [correctional_group_home] makes 150.15.30.1(2)(A) apply again, and the house reads prohibited (ruling (a))', () => {
    const L = { ...M.classLotFor(rowOf('5035239'), 'principal', 'detached_house', env), uses: ['correctional_group_home'] };
    const p = E.permitted(L, 'detached_house', E.loadCandidates(L, INPUT.body.units).candidates, env.ctx);
    expect([p.status, p.winners]).toEqual(['prohibited', ['150.15.30.1(2)#(2)(A)']]);
  });
  it('G1-d: every token of a G1 unit is in vocab.uses and vocab.specific_use with a closed disclosure; a disclosure-less entry fails the M-159 regex', () => {
    const re = /^rules for an? .+ on this lot are not part of this answer$/;
    for (const t of G1_TOKENS) expect([t, VOCAB.uses.includes(t), re.test(String((VOCAB.specific_use[t] as Json).disclosure))]).toEqual([t, true, true]);
    expect(re.test(String(undefined))).toBe(false);
  });
  it('G1-e: Layer 2 never sets lot.uses (UNSET_LOT_INPUTS), so the first-token reading of a multi-use unit is unreachable here (CHAT-185 trigger)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect((require(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json).UNSET_LOT_INPUTS).toContain('uses');
  });
  it('G1-g: the round records collide with nothing (checkAgree: no duplicate, superseded or orphan correction) and keep every old evidence key', async () => {
    const V = await import(path.join(ROOT, 'scripts/analysis/bylaw/validate.mjs')); const AU = await import(path.join(ROOT, 'scripts/analysis/bylaw/authored.mjs'));
    const AG = await import(path.join(ROOT, 'scripts/analysis/bylaw/agree.mjs'));
    const I = V.loadInputs({ root: ROOT });
    const ag = AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab });
    expect(ag.violations.filter((x: Json) => /^correction_/.test(String(x.code)))).toEqual([]);
    const byId = new Map(ADJ.map((a) => [a.id, a]));
    for (const r of G1_RECORDS.filter((x) => x.supersedes)) {
      const old = byId.get(r.supersedes) as Json; const oldEv = r.field === 'application' ? (old.value.evidence || {}) : old.value;
      const nowEv = unitOf(r.unit).application.evidence;
      for (const k of Object.keys(oldEv)) expect([r.unit, k, k in nowEv]).toEqual([r.unit, k, true]);
    }
    for (const r of G1_RECORDS) for (const t of (unitOf(r.unit).application.uses as string[])) expect([r.unit, t, typeof unitOf(r.unit).application.evidence[t]]).toEqual([r.unit, t, 'string']);
  }, 120_000);
  it('G1-h: trip-wire, no Chapter 40 unit carries a CHAT-178 token (CHAT-184: the CR use lists are outside the round); a fixture one is named', () => {
    const hits = (units: Json[]): string[] => units.filter((u) => /^40\./.test(u.unit_id) && (u.application.uses || []).some((t: string) => G1_TOKENS.includes(t))).map((u) => u.unit_id);
    expect(hits(INPUT.body.units)).toEqual([]);
    expect(hits([{ unit_id: '40.99.99(1)#fixture', application: { uses: ['office'] } }])).toEqual(['40.99.99(1)#fixture']);
  });
});

// ---- G2 (2026-10-26-batch-m#CHAT-179.L2-G2-LAWFULLY-EXISTING-ROUND; Spec 69a M-158(1); PLAN-scope v3 §5.2, v4 §5.2) ----
const G2_UNITS = ['600.60.40(3)#(3)(D)', '10.5.20.40(6)#whole', '10.10.20.41(6)#whole'];
describe('G2: the conversion clauses carry their lawfully_existing condition (CHAT-179)', () => {
  it('G2-a: the three units carry the condition in both fields with an evidence phrase; production lawfully_existing false sets them aside; the RD semi reads permitted (before G3)', () => {
    for (const id of G2_UNITS) {
      const u = unitOf(id);
      expect([id, u.condition, u.application.lot_conditions.includes('lawfully_existing'), typeof u.application.evidence.lawfully_existing]).toEqual([id, { tokens: ['lawfully_existing'] }, true, 'string']);
    }
    const L = M.classLotFor(rowOf('5035239'), 'principal', 'semi_detached_house', env);
    expect(L.flags.lawfully_existing).toBe(false);
    const rv = (n: string): Json => E.effective(L, n, E.loadCandidates(L, INPUT.body.units).candidates, env.ctx);
    expect(E.applies({ ...L, building_type: 'semi_detached_house' }, unitOf('600.60.40(3)#(3)(D)'), env.ctx, rv).why).toBe('condition lawfully_existing');
  });
  it('G2-b twin: with lawfully_existing true, 600.60.40(3)(D) applies and the RD semi reads prohibited by it', () => {
    const L0 = M.classLotFor(rowOf('5035239'), 'principal', 'semi_detached_house', env);
    const L = { ...L0, flags: { ...L0.flags, lawfully_existing: true } };
    const p = E.permitted(L, 'semi_detached_house', E.loadCandidates(L, INPUT.body.units).candidates, env.ctx);
    expect([p.status, p.winners]).toEqual(['prohibited', ['600.60.40(3)#(3)(D)']]);
  });
});

// ---- G3 (2026-10-26-batch-n#CHAT-182.L2-G3-USE-LIST-KEYING-ROUND; 2026-10-26-batch-o#CHAT-184.L2-CR-USE-LISTS; PLAN-scope v3 §5.3, v4 §5.3, v5 §5.3) ----
const LISTS = ['10.10.20.10(1)#whole', '10.20.20.10(1)#whole', '10.40.20.10(1)#whole', '10.60.20.10(1)#whole', '10.80.20.10(1)#whole', '40.10.20.10(1)#(1)(B)'];
describe('G3: zone use lists defer to the building-type list; suite-subject units bind the suite class (CHAT-182, CHAT-184)', () => {
  it('G3-a: the five zone use lists and the CR "r" list are PROCEDURAL / informational and carry no permission_scope entry; a stale entry left behind is named', () => {
    for (const id of LISTS) expect([id, unitOf(id).archetype, unitOf(id).calculation_handling.status, id in PS]).toEqual([id, 'PROCEDURAL', 'informational', false]);
    const left = { ...VOCAB, permission_scope: { ...PS, '10.20.20.10(1)#whole': entry('use', 'use_permission') } };
    expect(VO.checkPermissionScope(INPUT.body.units, left).violations).toEqual(['permission_scope_stale: 10.20.20.10(1)#whole']);
  });
  it('G3-b (the G4 lock): on R1 lot RD 5035239 the semi-detached house and houseplex read not_evaluated:no_candidate, never prohibited (G4 not ruled)', () => {
    for (const cls of ['semi_detached_house', 'semi_detached_houseplex']) {
      const L = M.classLotFor(rowOf('5035239'), 'principal', cls, env);
      const p = E.permitted(L, env.classVectors[cls].building_type, E.loadCandidates(L, INPUT.body.units).candidates, env.ctx);
      expect([cls, p.status, p.reason]).toEqual([cls, 'not_evaluated', 'no_candidate']);
    }
  });
  it('G3-c twin: with 10.20.20.10(1) a PERMIT again (and declared use) the RD semi reads permitted: the use list was the permitter', () => {
    const L = M.classLotFor(rowOf('5035239'), 'principal', 'semi_detached_house', env);
    const units = INPUT.body.units.map((u: Json) => (u.unit_id === '10.20.20.10(1)#whole' ? { ...u, archetype: 'PERMIT' } : u));
    const C2 = E.makeContext({ ...INPUT.body.evaluator_vocab, permission_scope: { ...PS, '10.20.20.10(1)#whole': entry('use', 'use_permission') } }, { enactments: INPUT.body.enactments, absences: INPUT.body.absences, authored: INPUT.body.authored });
    const p = E.permitted(L, 'semi_detached_house', E.loadCandidates(L, units).candidates, C2);
    expect([p.status, p.winners]).toEqual(['permitted', ['10.20.20.10(1)#whole']]);
  });
  it('G3-d: a suite-subject unit binds only the class with a secondary suite (M-182 form); with its host type it would bind the plain house (twin); 949 / 954 / 956 likewise', () => {
    const lotOf = (pid: string, cls: string): Json => ({ ...M.classLotFor(rowOf(pid), 'principal', cls, env), building_type: env.classVectors[cls].building_type });
    const ok = (L: Json, u: Json): boolean | null => E.applies(L, u, env.ctx, (n: string) => E.effective(L, n, E.loadCandidates(L, INPUT.body.units).candidates, env.ctx)).ok;
    const A = unitOf('150.10.20.1(1)#(1)(A)');
    expect(A.application.building_types).toEqual(['secondary_suite']);
    expect([ok(lotOf('5214404', 'detached_house'), A), ok(lotOf('5214404', 'house_with_secondary_suite'), A)]).toEqual([false, true]);
    expect(ok(lotOf('5214404', 'detached_house'), { ...A, application: { ...A.application, building_types: ['detached_house'] } })).toBe(true);
    for (const id of ['900.2.10(949)#(949)[SSP](F)', '900.2.10(954)#(954)[SSP](F)', '900.2.10(956)#(956)[SSP](F)']) expect([id, unitOf(id).application.building_types]).toEqual([id, ['secondary_suite']]);
  });
  it('G3-e: permission_scope is 419 entries (138 use, 281 element); exactly the six lists left it', () => {
    const n = (s: string): number => Object.values(PS).filter((v) => v && (v as Json).scope === s).length;
    expect([Object.keys(PS).filter((k) => k !== '$comment').length, n('use'), n('element')]).toEqual([419, 138, 281]);
  });
  it('G3-f: feeds.counts equal the pre-registered map after G3 + CHAT-184 (use_permission 248)', () => {
    const c = read('docs/reference/bylaw-provisions.json').feeds.counts;
    expect(['ancillary', 'any', 'principal', 'suite'].map((s) => c[`${s}/use_permission`])).toEqual([9, 67, 150, 22]);
  });
});

// ---- B: M-169 in permitted() (2026-10-25-batch-g#CHAT-152.L2-USE-SCOPE B; Spec 69a M-169(1); PLAN-scope v2 §6, v3 §7, v6) ----
const UD = VOCAB.undetermined_condition_disclosure;
const fixUnit = (unit_id: string, archetype: string, tokens: string[], o: Json = {}): Json => ({ unit_id, regulation_id: unit_id.split('#')[0], archetype, layer: 'base', target: 'none', bound: 'none', condition: { tokens }, applies_to: { part: 'whole', refs: [] }, application: { zones: ['RD'], building_types: ['any'], lot_conditions: tokens, uses: [], evidence: {} }, displaces: [], ...o });
const ctxWith = (ids: string[], extra: Json = {}, ctxExtra: Json = {}): Json => E.makeContext({ ...INPUT.body.evaluator_vocab, permission_scope: { ...PS, ...Object.fromEntries(ids.map((id) => [id, entry('use', 'use_permission')])) }, ...extra }, { enactments: INPUT.body.enactments, absences: INPUT.body.absences, authored: INPUT.body.authored, ...ctxExtra });
const rdHouse = (): Json => M.classLotFor(rowOf('5035239'), 'principal', 'detached_house', env);
const permit = (L: Json, extraUnits: Json[], C: Json, bt = 'detached_house'): Json => E.permitted(L, bt, [...E.loadCandidates(L, INPUT.body.units).candidates, ...extraUnits], C);
describe('B: an undecidable site condition is taken as not holding inside permitted(), and disclosed (M-169(1))', () => {
  it('M1: on an RD lot with no frontage name a use PROHIBIT on abuts_named_street is set aside, with one disclosure; the type PERMIT decides', () => {
    const u = fixUnit('FIX#M1-abuts', 'PROHIBIT', ['abuts_named_street']);
    const p = permit(rdHouse(), [u], ctxWith(['FIX#M1-abuts']));
    expect([p.status, p.winners, p.disclosures]).toEqual(['permitted', ['10.20.20.40(1)#(1)(A)'], [{ unit_id: 'FIX#M1-abuts', archetype: 'PROHIBIT', condition_token: 'abuts_named_street', condition_phrase: UD.lot_condition.abuts_named_street }]]);
  });
  it('M1b: the real 900.3.10(613)(C) on an RD Exception 613 lot (townhouse) is set aside the same way', () => {
    const L = { ...rdHouse(), exception: '900.3.10(613)', building_type: 'townhouse' };
    const C = ctxWith([], {}, { authored: { ...INPUT.body.authored, '900.3.10(613)': 'authored' } });
    const p = E.permitted(L, 'townhouse', E.loadCandidates(L, INPUT.body.units).candidates, C);
    expect(p.disclosures.map((d: Json) => [d.unit_id, d.condition_token])).toEqual([['900.3.10(613)#(613)[SSP](C)', 'abuts_named_street']]);
    expect(p.status).not.toBe('not_evaluated');
  });
  it('M2 / M4: a data-filled flag (corner_lot) and an M-172 design token (all_units_front_street) are never folded: still undecided', () => {
    for (const tok of ['corner_lot', 'all_units_front_street']) {
      const u = fixUnit(`FIX#M2-${tok}`, 'PROHIBIT', [tok]);
      const L = { ...rdHouse(), flags: { ...rdHouse().flags, [tok]: undefined } };
      expect([tok, permit(L, [u], ctxWith([u.unit_id])).reason]).toEqual([tok, `condition_unknown:${tok}`]);
    }
  });
  it('M2b: the named-street truth table through permitted(): no name -> folded; name + hit -> applies; name + miss on an interior lot -> false; name + miss with the corner flag unknown -> undecided (CHAT-100 L-INTERIOR)', () => {
    const u = fixUnit('FIX#NS', 'PROHIBIT', ['abuts_named_street']);
    const ns = { ...INPUT.body.evaluator_vocab.named_street, units: { ...INPUT.body.evaluator_vocab.named_street.units, 'FIX#NS': { streets: ['Baldwin Street'], line: 'any' } } };
    const C = ctxWith(['FIX#NS'], { named_street: ns });
    const lot = (name: string | undefined, flags: Json): Json => ({ ...rdHouse(), [ns.lot_field]: name, flags: { ...rdHouse().flags, ...flags } });
    const row = (name: string | undefined, flags: Json): Json => { const p = permit(lot(name, flags), [u], C); return [p.status, p.reason || null, p.disclosures.length]; };
    expect(row(undefined, {})).toEqual(['permitted', null, 1]);
    expect(row('Baldwin Street', {})).toEqual(['prohibited', null, 0]);
    expect(row('Other Street', { corner_lot: false, through_lot: false })).toEqual(['permitted', null, 0]);
    expect(row('Other Street', { corner_lot: undefined, through_lot: false })).toEqual(['not_evaluated', 'condition_unknown:abuts_named_street', 0]);
  });
  it('M3: permitted() never folds the lot it was given, and effective() answers on the unfolded lot (byte-identical before and after)', () => {
    const L = rdHouse(); const before = JSON.stringify(L); const cands = E.loadCandidates(L, INPUT.body.units).candidates;
    const eff = (): string => JSON.stringify(E.effective(L, 'side_setback_m', cands, env.ctx));
    const e0 = eff(); permit(L, [fixUnit('FIX#M1-abuts', 'PROHIBIT', ['abuts_named_street'])], ctxWith(['FIX#M1-abuts']));
    expect([JSON.stringify(L), eff()]).toEqual([before, e0]);
  });
  it('M5: the fold set is the lot_condition tokens less not_folded_in_permission (M-241) and never a specialised token; a vocab that folds lawfully_existing throws by name', () => {
    const fold = [...env.ctx.permissionFold].sort();
    expect(fold).toEqual(Object.keys(UD.lot_condition).filter((k) => k !== '$comment' && k !== 'ancillary_contains_parking_space').sort());
    expect(fold).toHaveLength(10);
    for (const t of ['ancillary_contains_parking_space', 'lawfully_existing', 'lawfully_existing_status', 'existing_footprint_sqm']) expect([t, fold.includes(t)]).toEqual([t, false]);
    const bad = { ...UD, lot_condition: { ...UD.lot_condition, lawfully_existing: 'x' } };
    expect(() => E.makeContext({ ...INPUT.body.evaluator_vocab, undetermined_condition_disclosure: bad })).toThrow(/permission_fold_specialised:lawfully_existing/);
  });
  it('M6 / M7: disclosures are sorted, de-duplicated and identical on a second call; each has exactly {unit_id, archetype, condition_token, condition_phrase}, the phrase from condition_override else lot_condition', () => {
    const us = [fixUnit('FIX#Z', 'PROHIBIT', ['abuts_named_street']), fixUnit('FIX#A', 'PERMIT', ['shoreline_or_top_of_bank'])];
    const C = ctxWith(['FIX#Z', 'FIX#A']);
    const a = permit(rdHouse(), us, C); const b = permit(rdHouse(), [...us].reverse(), C);
    expect(a.disclosures.map((d: Json) => d.unit_id)).toEqual(['FIX#A', 'FIX#Z']);
    expect(JSON.stringify(a.disclosures)).toBe(JSON.stringify(b.disclosures));
    for (const d of a.disclosures) {
      expect(Object.keys(d).sort()).toEqual(['archetype', 'condition_phrase', 'condition_token', 'unit_id']);
      expect(d.condition_phrase).toBe((UD.condition_override && UD.condition_override[d.unit_id]) || UD.lot_condition[d.condition_token]);
    }
  });
  it('G5-e: end to end, logicalRowsOf on a lot whose use unit is set aside gives one sentence in the CHAT-180 form', () => {
    const u = fixUnit('FIX#M1-abuts', 'PROHIBIT', ['abuts_named_street']);
    const body = { ...INPUT.body, units: [...INPUT.body.units, u], evaluator_vocab: { ...INPUT.body.evaluator_vocab, permission_scope: { ...PS, 'FIX#M1-abuts': entry('use', 'use_permission') } } };
    const env2 = M.makeEnv({ body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList: R1.zone_list, versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });
    const out = M.materializeBatch([rowOf('5035239')], env2);
    const v = M.logicalRowsOf(rowOf('5035239'), out.rows.lots[0], LR.makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts }), env2);
    expect(v.permission_disclosures.detached_house).toEqual([`If ${UD.lot_condition.abuts_named_street}: this use is not permitted, by FIX#M1-abuts.`]);
  }, 60_000);
});
