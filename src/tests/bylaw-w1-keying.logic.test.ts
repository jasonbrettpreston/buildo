// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stage 5 (two blind briefs per shard, A sealed before B),
//            §6 (clause unit id `regulation_id#clause_path`; Ch.900 `[SSP]` / `[PBS]` path groups);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-15 (wave 1 = the top 220 by INCLUDE-closed lots), M-17;
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-80 (re-key by a new generation, never an edit);
//            .cursor/mcbylaw/phase2-plan-v2.md §D.2 (shard 0 = the E-5 30; ≈ 25 units by lot weight; INCLUDE targets
//            keyed before includers), P2-5; operator 2026-10-14 Q2 (LEAF-CLAUSE grain for Ch.900 SSP/PBS blocks: a group
//            unit is legal only when every leaf shares one archetype, target family and bound; the E-5 30 are re-keyed at
//            leaf grain) and Q3 (wave-1 keying runs through the Phase 1 door before P2-0).
//
// The wave-1 (W1) overlay of the keying harness, pure arm: leaf-grain units, the grain rule for a group unit (both
// directions), and the shard plan (shard 0 = the E-5 30, then ≈ 25-unit shards by lot weight, INCLUDE targets first).
import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module / seed JSON
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const K = await load('scripts/analysis/bylaw/keying.mjs');
const AU = await load('scripts/analysis/bylaw/authored.mjs');
const SPEC68 = fs.readFileSync(path.join(process.cwd(), 'docs/specs/01-pipeline/68_mcbylaw_standard.md'), 'utf8');
const VOCAB = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/seeds/bylaw/vocab.json'), 'utf8'));
const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * A minimal Ch.900 slice: `spec` = {regulation_id: [[path, text], …]} in by-law order; leaves (paths no other path
 * extends) become slice units carrying their ancestors' text as context (slice.mjs unitsOf shape).
 */
function exceptionSlice(spec: Record<string, [string, string][]>) {
  const rows: Json[] = [];
  const units: Json[] = [];
  for (const [rid, cl] of Object.entries(spec)) {
    const m = /^900\.(\d)\.10\((\d+)\)$/.exec(rid);
    const page = `ch900_${m![1]}`;
    const clauses = cl.map(([p, text]) => ({ path: p, text }));
    const verbatim = cl.map((c) => c[1]).join(' ');
    rows.push({ regulation_id: rid, page, article: `900.${m![1]}.10`, section: `900.${m![1]}`, article_title: 'Exceptions for RM Zone', kind: 'regulation', clauses, verbatim, sha256: sha(verbatim), refs: [], literals: [], tags: [] });
    for (const c of clauses) {
      if (clauses.some((x) => x !== c && K.isAncestorPath(c.path, x.path))) continue;
      const context = clauses.filter((x) => K.isAncestorPath(x.path, c.path)).map((x) => x.text);
      units.push({ unit_id: `${rid}#${c.path}`, regulation_id: rid, page, clause_path: c.path, context, text: c.text, sha256: sha([...context, c.text].join(' ')), origin: 'clause' });
    }
  }
  return { rows, units };
}
const rm = (n: number, extra: [string, string][] = []): [string, string][] => [
  [`(${n})`, `(${n}) Exception RM ${n} The lands are subject to the following Site Specific Provisions:`],
  [`(${n})[SSP]`, 'Site Specific Provisions:'],
  [`(${n})[SSP](A)`, '(A) The minimum lot area is:'],
  [`(${n})[SSP](A)(i)`, '(i) 465 square metres for a detached house;'],
  [`(${n})[SSP](A)(ii)`, '(ii) 665 square metres for a semi-detached house;'],
  [`(${n})[SSP](B)`, '(B) The maximum height is 9.5 metres;'],
  ...extra,
];
const SL = () =>
  exceptionSlice({
    '900.6.10(18)': rm(18, [[`(18)[PBS]`, 'Prevailing By-laws and Prevailing Sections:'], [`(18)[PBS](A)`, '(A) (None Apply)']]),
    '900.6.10(20)': rm(20),
    '900.6.10(30)': rm(30, [[`(30)[SSP](C)`, '(C) The lands must comply with Exception RM 20;']]),
    '900.3.10(5)': rm(5),
    '900.3.10(7)': rm(7, [
      [`(7)[SSP](C)`, '(C) The minimum lot frontage is:'],
      [`(7)[SSP](C)(i)`, '(i) 12.0 metres;'],
      [`(7)[SSP](C)(ii)`, '(ii) 15.0 metres;'],
      [`(7)[SSP](C)(iii)`, '(iii) 18.0 metres;'],
    ]),
  });
const ids = (sl: Json) => new Set(sl.rows.map((r: Json) => r.regulation_id));
/** The wave ranking as the CLI builds it from k7.mjs rankExceptions: rank order, INCLUDE-closed lots, INCLUDE edges. */
const RANKING = [
  { regulation_id: '900.3.10(5)', rank: 1, closed_lots: 900, includes: [] },
  { regulation_id: '900.6.10(30)', rank: 2, closed_lots: 800, includes: ['900.6.10(20)'] }, // includer ranked ABOVE its target (forced, to test the hoist)
  { regulation_id: '900.6.10(18)', rank: 3, closed_lots: 700, includes: [] },
  { regulation_id: '900.3.10(7)', rank: 4, closed_lots: 600, includes: [] },
  { regulation_id: '900.6.10(20)', rank: 5, closed_lots: 500, includes: [] },
];
const plan = (over: Json = {}) => K.planWave1({ slice: SL(), inScopeIds: ids(SL()), ranking: RANKING, e5Ids: ['900.6.10(18)'], maxUnits: 4, ...over });
const uids = (s: Json) => s.units.map((u: Json) => u.unit_id);

describe('leaf grain (operator Q2 2026-10-14): one unit per leaf clause of the row', () => {
  it('leafUnits = the slice leaf units of the row, in by-law order, pinned by the G-SHAPE unit sha', () => {
    const sl = SL();
    const idx = AU.buildIndex(sl);
    const us = K.leafUnits({ row: sl.rows[0], index: idx, slice: sl });
    expect(us.map((u: Json) => u.unit_id)).toEqual(['900.6.10(18)#(18)[SSP](A)(i)', '900.6.10(18)#(18)[SSP](A)(ii)', '900.6.10(18)#(18)[SSP](B)', '900.6.10(18)#(18)[PBS](A)']);
    for (const u of us) expect(u.sha256).toBe(AU.unitView(idx, u.unit_id).sha256);
    // the block grain the E-5 plan used ((18)[SSP] as ONE unit) is not what the leaf planner emits
    expect(us.map((u: Json) => u.unit_id)).not.toContain('900.6.10(18)#(18)[SSP]');
  });

  it('a leaf unit brief carries its lead-in ("The minimum lot area is:") as DATA context', () => {
    const p = plan();
    const s0 = p.shards.find((s: Json) => s.wave_shard === 0);
    const b = K.buildBriefs({ shard: s0, slice: SL(), vocab: VOCAB, specText: SPEC68, batch: 'W1' });
    expect(b.a.text).toContain('#### unit 900.6.10(18)#(18)[SSP](A)(i)');
    expect(b.a.text.split('#### unit 900.6.10(18)#(18)[SSP](A)(i)')[1]).toContain('(A) The minimum lot area is:');
    expect(b.b.text).toContain('Keying conventions — RATIFIED');
  });
});

describe('the grain rule for a group unit — locked both directions', () => {
  const leaf = (p: string, archetype: string, target: string | string[], bound: string) => ({ unit_id: `900.6.10(18)#(18)[SSP]${p}`, archetype, target, bound });
  it('a uniform group (one archetype, target family and bound) is ALLOWED and keyed as one unit at the group path', () => {
    const g = { regulation_id: '900.6.10(18)', clause_path: '(18)[SSP](A)', leaves: [leaf('(A)(i)', 'LIMIT', 'required_lot_area_m2', 'min'), leaf('(A)(ii)', 'LIMIT', 'required_lot_area_m2', 'min')] };
    expect(K.checkGrainGroup(g)).toEqual({ ok: true });
    const sl = SL();
    const idx = AU.buildIndex(sl);
    const us = K.leafUnits({ row: sl.rows[0], index: idx, slice: sl, groups: [g] });
    expect(us.map((u: Json) => u.unit_id)).toEqual(['900.6.10(18)#(18)[SSP](A)', '900.6.10(18)#(18)[SSP](B)', '900.6.10(18)#(18)[PBS](A)']);
    expect(us[0].sha256).toBe(AU.unitView(idx, '900.6.10(18)#(18)[SSP](A)').sha256);
    // a target LIST is one family when the sets are equal, whatever the order
    expect(K.checkGrainGroup({ ...g, leaves: [leaf('(A)(i)', 'LIMIT', ['height_m', 'height_storeys'], 'max'), leaf('(A)(ii)', 'LIMIT', ['height_storeys', 'height_m'], 'max')] }).ok).toBe(true);
  });

  it('a MIXED-BOUND group (the E-5 [SSP] defect: min lot area + max height) is REFUSED, as is a mixed target or archetype', () => {
    const mixedBound = { regulation_id: '900.6.10(18)', clause_path: '(18)[SSP]', leaves: [leaf('(A)(i)', 'LIMIT', 'required_lot_area_m2', 'min'), leaf('(A)(ii)', 'LIMIT', 'required_lot_area_m2', 'min'), leaf('(B)', 'LIMIT', 'required_lot_area_m2', 'max')] };
    expect(K.checkGrainGroup(mixedBound)).toMatchObject({ ok: false, code: 'grain_group_mixed' });
    const sl = SL();
    const idx = AU.buildIndex(sl);
    expect(() => K.leafUnits({ row: sl.rows[0], index: idx, slice: sl, groups: [mixedBound] })).toThrow(/grain_group_mixed/);
    const mixedTarget = { ...mixedBound, leaves: [leaf('(A)(i)', 'LIMIT', 'required_lot_area_m2', 'min'), leaf('(A)(ii)', 'LIMIT', 'required_lot_area_m2', 'min'), leaf('(B)', 'LIMIT', 'height_m', 'min')] };
    expect(K.checkGrainGroup(mixedTarget)).toMatchObject({ ok: false, code: 'grain_group_mixed' });
    const mixedArch = { ...mixedBound, leaves: [leaf('(A)(i)', 'LIMIT', 'required_lot_area_m2', 'min'), leaf('(A)(ii)', 'PERMIT', 'required_lot_area_m2', 'min')] };
    expect(K.checkGrainGroup(mixedArch)).toMatchObject({ ok: false, code: 'grain_group_mixed' });
  });

  it('a group must declare EXACTLY the leaves under its path, at a non-leaf clause of the row (fail closed)', () => {
    const sl = SL();
    const idx = AU.buildIndex(sl);
    const one = { regulation_id: '900.6.10(18)', clause_path: '(18)[SSP](A)', leaves: [leaf('(A)(i)', 'LIMIT', 'required_lot_area_m2', 'min')] };
    expect(() => K.leafUnits({ row: sl.rows[0], index: idx, slice: sl, groups: [one] })).toThrow(/grain_group_incomplete/);
    const stray = { ...one, leaves: [...one.leaves, leaf('(A)(ii)', 'LIMIT', 'required_lot_area_m2', 'min'), leaf('(B)', 'LIMIT', 'required_lot_area_m2', 'min')] };
    expect(() => K.leafUnits({ row: sl.rows[0], index: idx, slice: sl, groups: [stray] })).toThrow(/grain_group_incomplete/);
    const onLeaf = { regulation_id: '900.6.10(18)', clause_path: '(18)[SSP](B)', leaves: [leaf('(B)', 'LIMIT', 'height_m', 'max')] };
    expect(() => K.leafUnits({ row: sl.rows[0], index: idx, slice: sl, groups: [onLeaf] })).toThrow(/grain_group_not_ancestor/);
    expect(K.checkGrainGroup({ regulation_id: 'x', clause_path: '(1)', leaves: [] })).toMatchObject({ ok: false, code: 'grain_group_incomplete' });
  });
});

describe('lead-in groups (orchestrator 2026-10-14 Q-A = a, under the Q2 grain rule): declared mechanically, then grain-checked', () => {
  const row = (lead: string, arms: string[]) => {
    const sl = exceptionSlice({ '900.6.10(40)': [['(40)', '(40) Exception RM 40'], ['(40)[SSP]', 'Site Specific Provisions:'], ['(40)[SSP](A)', lead], ...arms.map((t, i): [string, string] => [`(40)[SSP](A)(${['i', 'ii', 'iii'][i]})`, t])] });
    return { sl, groups: K.leadInGroups({ row: sl.rows[0], slice: sl, vocab: VOCAB }) };
  };
  it('a "(A) The minimum lot area is: (i) …; (ii) …" lead-in is declared one LIMIT group (target, bound) and plans as ONE unit', () => {
    const { sl, groups } = row('(A) The minimum lot area is:', ['(i) 465 square metres for a detached house;', '(ii) 665 square metres for a semi-detached house;']);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ regulation_id: '900.6.10(40)', clause_path: '(40)[SSP](A)' });
    expect(new Set(groups[0].leaves.map((l: Json) => `${l.archetype}|${l.target}|${l.bound}`))).toEqual(new Set(['LIMIT|required_lot_area_m2|min']));
    const us = K.leafUnits({ row: sl.rows[0], index: AU.buildIndex(sl), slice: sl, groups });
    expect(us.map((u: Json) => u.unit_id)).toEqual(['900.6.10(40)#(40)[SSP](A)']);
  });
  it('no group (leaf grain stays) when any one condition fails — each case differs from the grouped one in ONE thing', () => {
    const D = '(i) 465 square metres for a detached house;';
    const S = '(ii) 665 square metres for a semi-detached house;';
    expect(row('(A) The minimum lot area is:', [D, S]).groups).toHaveLength(1); // the control
    expect(row('(A) The minimum and maximum lot area is:', [D, S]).groups).toEqual([]); // two bound words
    expect(row('(A) The minimum number of trees is:', ['(i) 2 for a detached house;', '(ii) 3 for a triplex;']).groups).toEqual([]); // no dsl_target
    expect(row('(A) The minimum lot area is:', [D, '(ii) a maximum of 665 square metres for a semi-detached house;']).groups).toEqual([]); // arm's own bound word
    expect(row('(A) The minimum lot area is:', [D, '(ii) as shown on Diagram 1;']).groups).toEqual([]); // arm points elsewhere
    expect(row('(A) The minimum lot area is:', [D]).groups).toEqual([]); // one arm only
    expect(row('(A) The minimum lot area is 465 square metres, and', [D, S]).groups).toEqual([]); // no ":" lead-in
    // the 900.3.10(309)[SSP](C) shape: arms name different lot lines (front vs side) — not a by-type list
    expect(row('(A) The minimum building setback from a lot line is:', ['(i) 9.0 metres for a front lot line;', '(ii) 5.7 metres for a side lot line;']).groups).toEqual([]);
    // the 900.6.10(23)[SSP](D)(iii) shape: one arm adds a lot condition (a corner lot abutting a street)
    expect(row('(A) The minimum side yard setback is:', ['(i) 0.6 metres for a detached house,', '(ii) 1.5 metres from a side lot line abutting a street for a detached house on a corner lot.']).groups).toEqual([]);
  });
});

describe('planWave1 — shard 0 = the E-5 set at leaf grain, then ≈ maxUnits shards by lot weight, INCLUDE targets first', () => {
  it('every wave-1 leaf unit is planned exactly once; shard 0 holds exactly the E-5 rows; shards stay on one page and ≤ maxUnits', () => {
    const p = plan();
    const sl = SL();
    const all = p.shards.flatMap(uids);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(sl.units.map((u: Json) => u.unit_id).sort());
    const s0 = p.shards.filter((s: Json) => s.wave_shard === 0);
    expect([...new Set(s0.flatMap((s: Json) => s.regulation_ids))]).toEqual(['900.6.10(18)']);
    for (const s of p.shards) {
      expect(new Set(s.units.map((u: Json) => sl.rows.find((r: Json) => r.regulation_id === u.regulation_id)?.page))).toEqual(new Set([s.page]));
      if (!s.row_chunk) expect(s.units.length).toBeLessThanOrEqual(4);
    }
    expect(p.totals).toMatchObject({ exceptions: 5, units: sl.units.length, shard0_units: 4 });
    expect(p.batch).toBe('W1');
    expect(p.grain).toBe('leaf');
  });

  it('shards ≥ 1 are numbered in lot-weight order; an INCLUDE target is keyed in an earlier (or the same) shard than its includer', () => {
    const p = plan();
    const order = p.shards.filter((s: Json) => s.wave_shard > 0).map((s: Json) => [s.wave_shard, s.regulation_ids]);
    // 900.3.10(5) (rank 1) first; 900.6.10(20) is hoisted ahead of its includer 900.6.10(30) despite rank 5 > 2
    expect(order[0]).toEqual([1, ['900.3.10(5)']]);
    const shardOf = (rid: string) => p.shards.find((s: Json) => s.regulation_ids.includes(rid)).wave_shard;
    expect(shardOf('900.6.10(20)')).toBeLessThanOrEqual(shardOf('900.6.10(30)'));
    const ws = p.shards.map((s: Json) => s.wave_shard);
    expect(ws).toEqual([...ws].sort((a: number, b: number) => a - b));
    expect(p.include).toMatchObject({ edges: 1, outside_wave: [] });
  });

  it('an exception over maxUnits is cut at its lettered-clause boundaries (a by_type list is never split) into row_chunk shards', () => {
    const p = plan({ maxUnits: 3 });
    const parts = p.shards.filter((s: Json) => s.regulation_ids.includes('900.3.10(7)'));
    expect(parts.length).toBe(2);
    expect(parts.map(uids)).toEqual([
      ['900.3.10(7)#(7)[SSP](A)(i)', '900.3.10(7)#(7)[SSP](A)(ii)', '900.3.10(7)#(7)[SSP](B)'],
      ['900.3.10(7)#(7)[SSP](C)(i)', '900.3.10(7)#(7)[SSP](C)(ii)', '900.3.10(7)#(7)[SSP](C)(iii)'],
    ]);
    expect(parts[1].row_chunk).toMatchObject({ index: 2, count: 2 });
  });

  it('deterministic: the same inputs plan byte-identically whatever the slice row order; keys are unique and path-safe', () => {
    const a = plan();
    const sl = SL();
    sl.rows.reverse();
    sl.units.reverse();
    const b = K.planWave1({ slice: sl, inScopeIds: ids(sl), ranking: RANKING, e5Ids: ['900.6.10(18)'], maxUnits: 4 });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    const keys = a.shards.map((s: Json) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^ch900_[2-6]\/900\.[2-6]\.10\.w1-s\d{2}(\.p\d{2})?(\.c\d+)?$/);
  });

  it('fails closed: an unknown / out-of-scope member, an E-5 id outside the wave, and planBatch on W1', () => {
    expect(() => plan({ ranking: [...RANKING, { regulation_id: '900.6.10(99)', rank: 6, closed_lots: 1, includes: [] }] })).toThrow(/w1_member_unknown/);
    const sl = SL();
    const scope = ids(sl);
    scope.delete('900.3.10(5)');
    expect(() => plan({ inScopeIds: scope })).toThrow(/w1_member_unknown/);
    expect(() => plan({ e5Ids: ['900.6.10(77)'] })).toThrow(/w1_e5_not_in_wave/);
    expect(() => K.planBatch({ slice: SL(), inScopeIds: ids(SL()), batch: 'W1' })).toThrow(/batch_planner/);
    expect(K.OVERLAY_BATCHES.map((b: Json) => b.id)).toContain('W1');
  });
});

describe('supersession grain refinement (proposed Spec 69a R3; orchestrator 2026-10-14 Q-B = y) — locked both directions', () => {
  const shard = (key: string, ids: string[]) => ({ key, a: { units: ids.map((unit_id) => ({ unit_id })) }, b: { units: ids.map((unit_id) => ({ unit_id })) } });
  const E5 = shard('ch900_6/900.6.10', ['900.6.10(18)#(18)[SSP]', '900.6.10(18)#(18)[PBS]', '900.6.10(20)#(20)[SSP]']);
  it('a leaf (or a lead-in group) keyed in ANOTHER shard supersedes its coarser ancestor unit; the whole old shard once every unit is refined', () => {
    const W = shard('ch900_6/900.6.10.w1-s00.p03', ['900.6.10(18)#(18)[SSP](A)', '900.6.10(18)#(18)[SSP](B)', '900.6.10(18)#(18)[PBS](A)']);
    const sup = AU.supersession([E5, W]);
    expect([...sup.superseded.get('ch900_6/900.6.10')].sort()).toEqual(['900.6.10(18)#(18)[PBS]', '900.6.10(18)#(18)[SSP]']);
    expect(sup.superseded.has(W.key)).toBe(false);
    expect(sup.whole.has('ch900_6/900.6.10')).toBe(false); // (20)[SSP] is not refined yet
    const W2 = shard('ch900_6/900.6.10.w1-s01', ['900.6.10(20)#(20)[SSP](A)(i)']);
    expect(AU.supersession([E5, W, W2]).whole.has('ch900_6/900.6.10')).toBe(true);
  });
  it('a NON-ancestor is never superseded: a sibling, a segment-prefix lookalike ((1) vs (10)), another row, a .b-only descendant', () => {
    const sib = shard('p/x.w1-s02', ['900.6.10(18)#(18)[SSP](B)']);
    const old = shard('p/x', ['900.6.10(18)#(18)[SSP](A)', '900.6.10(1)#(1)[SSP]', '900.6.10(20)#(20)[SSP]']);
    const look = shard('p/x.w1-s03', ['900.6.10(10)#(10)[SSP](A)', '900.6.10(18)#(18)[SSP](A)']);
    const bOnly = { key: 'p/x.w1-s04', a: null, b: { units: [{ unit_id: '900.6.10(20)#(20)[SSP](A)' }] } };
    const sup = AU.supersession([old, sib, look, bOnly]);
    expect(sup.superseded.has('p/x')).toBe(false); // (18)[SSP](A) equal-path in another key is not a descendant; (1) ≠ ancestor of (10); bOnly has no .a
  });
});

// ---- W1 drafts in the global gates (E-LAND 2026-10-14: G-SHAPE "keyed in two shards", G-AGREE correction_orphan on
// the E-5 corrections, queue adjudication_orphan on Phase 1). Every gate reads ONE supersession view.
const AG = await load('scripts/analysis/bylaw/agree.mjs');
const U = (unit_id: string, archetype = 'PROCEDURAL') => ({ unit_id, archetype, target: 'none', bound: 'none', numeric_expression: 'none' });
const sealed = (key: string, seal: number, a: Json[], b: Json[] = a, rows: Json = {}) => ({ key, a: { units: a, rows }, b: { units: b }, prov: { a_seal: { seal_id: seal, sha256: 'x' }, keyers: { a: { id: 'keyer-a:claude' }, b: { id: 'keyer-b:deepseek' } } } });

describe('supersession — the SAME unit re-keyed at a finer pass in another shard (newer A seal wins); both directions', () => {
  it('a unit keyed by an older-sealed E-5 shard and a newer-sealed W1 shard: the E-5 copy is superseded; the W1 copy is read', () => {
    const e5 = sealed('ch900_6/900.6.10', 300, [U('900.6.10(22)#(22)[PBS]')]);
    const w1 = sealed('ch900_6/900.6.10.w1-s00.p03', 379, [U('900.6.10(22)#(22)[PBS]')]);
    const sup = AU.supersession([e5, w1]);
    expect([...(sup.superseded.get(e5.key) || [])]).toEqual(['900.6.10(22)#(22)[PBS]']);
    expect(sup.superseded.has(w1.key)).toBe(false);
    // order of the seals decides, not the key
    const sup2 = AU.supersession([{ ...e5, prov: { ...e5.prov, a_seal: { seal_id: 400, sha256: 'x' } } }, w1]);
    expect(sup2.superseded.has(e5.key)).toBe(false);
    expect([...(sup2.superseded.get(w1.key) || [])]).toEqual(['900.6.10(22)#(22)[PBS]']);
  });
  it('an UNSEALED duplicate is never resolved (G-SHAPE still reports "keyed in shards")', () => {
    const a = { key: 'p/x', a: { units: [U('900.6.10(22)#(22)[PBS]')] }, b: null };
    const b = { key: 'p/y', a: { units: [U('900.6.10(22)#(22)[PBS]')] }, b: null };
    expect(AU.supersession([a, b]).superseded.size).toBe(0);
  });
  it('rowsSuperseded: a shard\'s row fields are retired once every unit it keyed for that row is superseded — never before', () => {
    const e5 = sealed('ch900_6/900.6.10', 300, [U('900.6.10(18)#(18)[SSP]'), U('900.6.10(18)#(18)[PBS]')], undefined, { '900.6.10(18)': { explanation: 'old' } });
    const half = sealed('ch900_6/900.6.10.w1-s00.p03', 379, [U('900.6.10(18)#(18)[SSP](A)')], undefined, { '900.6.10(18)': { explanation: 'new' } });
    expect(AU.supersession([e5, half]).rowsSuperseded.get(e5.key)).toBeUndefined();
    const full = sealed('ch900_6/900.6.10.w1-s00.p03', 379, [U('900.6.10(18)#(18)[SSP](A)'), U('900.6.10(18)#(18)[PBS](A)')], undefined, { '900.6.10(18)': { explanation: 'new' } });
    expect([...AU.supersession([e5, full]).rowsSuperseded.get(e5.key)]).toEqual(['900.6.10(18)']);
  });
});

describe('G-AGREE: a correction on a SUPERSEDED unit is retired by supersession (M-80 adjudications_superseded precedent), not an orphan', () => {
  const cor = (unit: string) => ({ id: `COR-${unit}/archetype`, kind: 'correction', unit, field: 'archetype', value: 'PERMIT', rule: 'M-75', reason: 'x', adjudicator: 'operator', adjudicated_on: '2026-10-14' });
  it('superseded unit → counted adjudications_superseded, no correction_orphan', () => {
    const e5 = sealed('ch900_6/900.6.10', 300, [U('900.6.10(18)#(18)[SSP]')]);
    const w1 = sealed('ch900_6/900.6.10.w1-s00.p03', 379, [U('900.6.10(18)#(18)[SSP](A)')], [U('900.6.10(18)#(18)[SSP](A)', 'LIMIT')]);
    const r = AG.checkAgree({ shards: [e5, w1], adjudications: { adjudications: [cor('900.6.10(18)#(18)[SSP]')] }, vocab: VOCAB });
    expect(r.violations.filter((x: Json) => x.code === 'correction_orphan')).toEqual([]);
    expect(r.counts.adjudications_superseded).toBe(1);
  });
  it('a correction on a unit that is NOT superseded and not agreed is still a correction_orphan (not weakened)', () => {
    const w1 = sealed('ch900_6/900.6.10.w1-s00.p03', 379, [U('900.6.10(18)#(18)[SSP](A)')], [U('900.6.10(18)#(18)[SSP](A)', 'LIMIT')]);
    const r = AG.checkAgree({ shards: [w1], adjudications: { adjudications: [cor('900.6.10(18)#(18)[SSP](A)')] }, vocab: VOCAB });
    expect(r.violations.map((x: Json) => x.code)).toContain('correction_orphan');
  });
});

describe('keying-cli queue scope: G-AGREE runs over EVERY shard; only the queue items are the batch\'s', () => {
  const adj = (unit: string) => ({ id: `ADJ-disagreement-${unit}-archetype`, kind: 'disagreement', unit, field: 'archetype', decision: 'a', adjudicator: 'operator', adjudicated_on: '2026-10-14', reason: 'x' });
  const p1 = sealed('ch1_20/1.20.2.10', 5, [U('1.20.2.10(1)#(1)(A)', 'LIMIT')], [U('1.20.2.10(1)#(1)(A)', 'PERMIT')]);
  const w1 = sealed('ch900_6/900.6.10.w1-s00.p03', 379, [U('900.6.10(18)#(18)[SSP](A)')]);
  it('a Phase 1 adjudication outside the batch is NOT an orphan of the batch queue (the 931-line false positive)', () => {
    const r = K.batchAgree({ diskShards: [p1, w1], batchKeys: [w1.key], adjudications: { adjudications: [adj('1.20.2.10(1)#(1)(A)')] }, vocab: VOCAB });
    expect(r.agree.violations.filter((x: Json) => /orphan/.test(x.code))).toEqual([]);
    expect(r.batchShards.map((s: Json) => s.key)).toEqual([w1.key]);
    expect(r.batch).toMatchObject({ units_agreed: 1, units_pending: 0 });
  });
  it('an adjudication on a BATCH unit with no open disagreement is still an adjudication_orphan', () => {
    const r = K.batchAgree({ diskShards: [p1, w1], batchKeys: [w1.key], adjudications: { adjudications: [adj('1.20.2.10(1)#(1)(A)'), adj('900.6.10(18)#(18)[SSP](A)')] }, vocab: VOCAB });
    expect(r.agree.violations.filter((x: Json) => x.code === 'adjudication_orphan').map((x: Json) => x.id)).toEqual(['ADJ-disagreement-900.6.10(18)#(18)[SSP](A)-archetype']);
  });
});

describe('G-CLAUSE: a Ch.900 unit need not account for its OWN exception header id (orchestrator 2026-10-14 Q-E = b, narrow)', () => {
  const CL = load('scripts/analysis/bylaw/clause.mjs');
  const row = (rid: string, verbatim: string) => ({ regulation_id: rid, verbatim, clauses: [{ path: `(${/\((\d+)\)$/.exec(rid)![1]})` }] });
  const lit = (verbatim: string, raw: string, from = 0) => {
    const start = verbatim.indexOf(raw, from);
    return { raw, value: Number(raw), unit: null, start, end: start + raw.length, clause_path: '(296)' };
  };
  const V = '(296) Exception R 296 The lands are subject to the following; 296 square metres; see Exception R 297';
  it('the "(N) Exception <ZONE> N" header number of the SAME exception is exempt', async () => {
    const C = await CL;
    expect(C.isOwnExceptionHeader(row('900.2.10(296)', V), lit(V, '296', 6))).toBe(true); // the slicer's literal starts after the "(296)" label (start 18, measured)
  });
  it('NOT exempt: the same number later in the body, another exception\'s number, a non-Ch.900 row', async () => {
    const C = await CL;
    expect(C.isOwnExceptionHeader(row('900.2.10(296)', V), lit(V, '296', 20))).toBe(false); // "296 square metres" in the body
    expect(C.isOwnExceptionHeader(row('900.2.10(296)', V), lit(V, '297'))).toBe(false); // another exception's number
    const W = '(296) Exception R 297 The lands';
    expect(C.isOwnExceptionHeader(row('900.2.10(296)', W), lit(W, '297'))).toBe(false); // header names a different number
    const P = '(296) Exception R 296 x';
    expect(C.isOwnExceptionHeader({ ...row('900.2.10(296)', P), regulation_id: '10.20.40.10(296)' }, lit(P, '296', 6))).toBe(false); // not a Ch.900 exception row
    expect(C.isOwnExceptionHeader(row('900.2.10(296)', V), { ...lit(V, '296', 6), clause_path: '(296)[SSP](A)' })).toBe(false); // not the root clause
  });
});

describe('Q-F (a): a drafted shard keeps its lead-in groups and chunking as first planned (mirrors M2); both directions', () => {
  const FR = (n: number): [string, string][] => [
    [`(${n})`, `(${n}) Exception RM ${n} The lands are subject to the following Site Specific Provisions:`],
    [`(${n})[SSP]`, 'Site Specific Provisions:'],
    [`(${n})[SSP](A)`, '(A) The minimum street frontage is:'],
    [`(${n})[SSP](A)(i)`, '(i) 12.0 metres for a detached house;'],
    [`(${n})[SSP](A)(ii)`, '(ii) 18.0 metres for a semi-detached house;'],
  ];
  const sl = () => exceptionSlice({ '900.6.10(50)': FR(50), '900.6.10(60)': FR(60) });
  const ranking = [
    { regulation_id: '900.6.10(50)', rank: 1, closed_lots: 900, includes: [] },
    { regulation_id: '900.6.10(60)', rank: 2, closed_lots: 800, includes: [] },
  ];
  // (CHAT-76.R8-5 made 'minimum frontage' a real licence, so the fixture uses a still-unlicensed phrase: 'minimum street frontage') vocab v2 adds a phrasing-variant licence (M-132 / M-134 style) that makes "(A) The minimum street frontage is:" a lead-in group
  const V2 = JSON.parse(JSON.stringify(VOCAB));
  V2.dsl_target.required_lot_frontage_m.patterns = [...V2.dsl_target.required_lot_frontage_m.patterns, 'minimum street frontage'];
  const firstPlan = () => {
    const s = sl();
    const groups = K.wave1Groups({ ranking, slice: s, vocab: VOCAB, priorSeed: null, hasDrafts: () => false });
    const plan = K.planWave1({ slice: s, inScopeIds: ids(s), ranking, groups, maxUnits: 2 });
    return K.wave1Seed({ plan, ranking, adoptionId: 'x', census: { adoption_id: 'x' }, groups });
  };
  it('under the first vocab neither row groups; each shard holds one row (two leaves)', () => {
    const seed = firstPlan();
    expect(seed.lead_in_groups).toEqual([]);
    expect(seed.shards.map((x: Json) => [x.key, x.unit_ids.length])).toEqual([['ch900_6/900.6.10.w1-s01', 2], ['ch900_6/900.6.10.w1-s02', 2]]);
  });
  it('vocab grows: the DRAFTED shard (s01) keeps its first-planned units; the UNDRAFTED shard (s02) picks up the new group', () => {
    const prior = firstPlan();
    const s = sl();
    const drafted = (k: string) => k === 'ch900_6/900.6.10.w1-s01';
    const groups = K.wave1Groups({ ranking, slice: s, vocab: V2, priorSeed: prior, hasDrafts: drafted });
    expect(groups.map((g: Json) => `${g.regulation_id}#${g.clause_path}`)).toEqual(['900.6.10(60)#(60)[SSP](A)']);
    const plan = K.planWave1({ slice: s, inScopeIds: ids(s), ranking, groups, maxUnits: 2, drafted: prior.shards.filter((x: Json) => drafted(x.key)) });
    expect(plan.shards.find((x: Json) => x.key.endsWith('s01')).units.map((u: Json) => u.unit_id)).toEqual(prior.shards[0].unit_ids);
    expect(plan.shards.find((x: Json) => x.regulation_ids.includes('900.6.10(60)')).units.map((u: Json) => u.unit_id)).toEqual(['900.6.10(60)#(60)[SSP](A)']);
    // nothing drafted → both rows group (the new vocab applies everywhere)
    expect(K.wave1Groups({ ranking, slice: s, vocab: V2, priorSeed: prior, hasDrafts: () => false })).toHaveLength(2);
  });
  it('a drafted shard whose first-planned units would move is refused (w1_drafted_shard_moved), never silently re-chunked', () => {
    const prior = firstPlan();
    const s = sl();
    const groups = K.wave1Groups({ ranking, slice: s, vocab: V2, priorSeed: prior, hasDrafts: () => false }); // NOT frozen
    expect(() => K.planWave1({ slice: s, inScopeIds: ids(s), ranking, groups, maxUnits: 2, drafted: [prior.shards[0]] })).toThrow(/w1_drafted_shard_moved/);
  });
});
