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
  it('L1a: every agreed PERMIT / PROHIBIT unit has exactly one entry and every entry names one (425: 144 use, 281 element)', () => {
    const r = VO.checkPermissionScope(INPUT.body.units, VOCAB);
    expect([r.pass, r.checked, r.violations]).toEqual([true, 425, []]);
    const n = (s: string): number => Object.entries(PS).filter(([k, v]) => k !== '$comment' && (v as Json).scope === s).length;
    expect([n('use'), n('element')]).toEqual([144, 281]);
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
