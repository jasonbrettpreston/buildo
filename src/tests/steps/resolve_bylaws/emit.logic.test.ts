// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §4 (the lock is total in both directions, R-EMIT; prerequisites line 121);
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-232 (Spec 133 §m.232: "Its lock is total in both directions over
//            the strings the evaluator actually emits (R-EMIT)"); docs/reports/2026-10-20-plan-mcbylaw-phase2-v2.md L13 R-EMIT
//            (RT-A6e): "static extraction of every ne( / NE_RESULT(-style literal + a runtime wrapper asserting membership"
//
// R-EMIT: the codes the evaluator RETURNS (extracted statically from evaluate.mjs, then observed at runtime) equal its
// exported NOT_EVALUATED_CODES, which layer2-map.logic.test.ts locks to layer2-map.json reason_code. A code returned but
// unlisted, or listed but never returned, is RED.
//
// RED FIRST: see docs/reports/red-evidence/resolve_bylaws/r-emit-red.json.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs surface
const ROOT = path.resolve(__dirname, '../../../../');
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const E = await mod('scripts/analysis/bylaw/evaluate.mjs');
const SRC = fs.readFileSync(path.join(ROOT, 'scripts/analysis/bylaw/evaluate.mjs'), 'utf8');
const V = await mod('scripts/analysis/bylaw/validate.mjs');
const AU = await mod('scripts/analysis/bylaw/authored.mjs');
const AG = await mod('scripts/analysis/bylaw/agree.mjs');
const XR = await mod('scripts/analysis/bylaw/xref.mjs');
const VO = await mod('scripts/analysis/bylaw/vocab.mjs');
const I = V.loadInputs({ root: ROOT });
const ag = AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab });
const index = AU.buildIndex(I.slice);
const DSL = await mod('scripts/analysis/bylaw/dsl.mjs');
const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();

/** The first argument text of every `name(` call (to its first top-level comma or the closing paren). */
const firstArgs = (name: string, src: string): string[] => {
  const out: string[] = [];
  const re = new RegExp(`(?<![\\w$])(?<![\\w$)\\]]\\.)${name}\\(`, 'g');
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 0; let i = m.index + m[0].length; const start = i;
    for (; i < src.length; i++) {
      const c = src[i]!;
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
      else if (c === ',' && depth === 0) break;
    }
    out.push(src.slice(start, i));
  }
  return out;
};
/** `ne('code', …)` / `NE_RESULT('code:detail', …)` literals; the `${v.value}_in_arithmetic` family expands to its two members. */
const staticEmitted = (src: string): string[] => {
  const codes: string[] = [];
  for (const arg of [...firstArgs('ne', src), ...firstArgs('NE_RESULT', src)]) {
    if (/^`\$\{[^}]+\}_in_arithmetic`$/.test(arg.trim())) { codes.push('unlimited_in_arithmetic', 'unregulated_in_arithmetic'); continue; }
    for (const lit of arg.matchAll(/(['`])([a-z][a-z_0-9]*)(?::[^'`]*)?\1|`([a-z][a-z_0-9]*)(?::[^`]*)?`/g)) codes.push((lit[2] ?? lit[3])!);
  }
  // reasons carried as strings out of applies() / evCond(): `unknown = unknown || '<code>…'` and the bare-literal forms
  for (const m of src.matchAll(/unknown = (?:unknown \|\| )?(?:\(C\.userInputs\.has\([^)]*\) \? )?[`'"]([a-z_]+)/g)) codes.push(m[1]!);
  for (const m of src.matchAll(/[`'"](condition_unknown|needs_user_input):\$\{/g)) codes.push(m[1]!);
  return sorted(codes);
};

describe('R-EMIT: the statically extracted returned reasons equal NOT_EVALUATED_CODES, both ways (Spec 134:59, M-232)', () => {
  it('the extractor catches its patterns (no vacuous regex)', () => {
    expect(staticEmitted("const a = ne('x_y', 1); NE_RESULT(`z_w:${q}`, {}); return ne(`${v.value}_in_arithmetic`);")).toEqual(['unlimited_in_arithmetic', 'unregulated_in_arithmetic', 'x_y', 'z_w']);
    expect(staticEmitted("unknown = unknown || 'named_lots_only';")).toEqual(['named_lots_only']);
    expect(staticEmitted("return ne(env.C ? 'a_b' : 'c_d', t);")).toEqual(['a_b', 'c_d']);
  });

  it('every code the evaluator returns is in NOT_EVALUATED_CODES', () => {
    const unlisted = staticEmitted(SRC).filter((c) => !E.NOT_EVALUATED_CODES.includes(c));
    expect(unlisted, 'returned but not in NOT_EVALUATED_CODES').toEqual([]);
  });

  it('every code in NOT_EVALUATED_CODES is returned somewhere', () => {
    const emitted = new Set(staticEmitted(SRC));
    const dead = E.NOT_EVALUATED_CODES.filter((c: string) => !emitted.has(c));
    expect(dead, 'listed but never returned').toEqual([]);
  });
});

// The runtime half: the production path (as bylaw-evaluator-fixes.logic.test.ts builds it), every residential zone and
// building type, every target, on a lot that carries few inputs so that many reasons fire. Each not_evaluated reason
// returned is a listed code AND one the static extraction found (so the extractor cannot miss a returned string).
describe('R-EMIT runtime wrapper: every reason effective() and permitted() return is a listed, statically extracted code', () => {
  const units: Json[] = [...AG.agreedUnits(ag).values()]
    .map((u: Json): Json => AU.withGeneratedFields(u))
    .map((u: Json) => { const d = XR.displacesOf(index, u.unit_id, I.vocab, null); return { ...u, displaces: d.targets.map((t: Json) => t.id), displaces_optional: d.optional_variation }; });
  const C = E.makeContext(VO.evaluatorVocab(I.vocab), { absences: I.absences });
  const stmtTargets = (u: Json): string[] => { const raw = u.numeric_expression; const l = raw === 'none' || raw == null ? [] : Array.isArray(raw) ? raw : [raw]; return l.flatMap((x: string) => { try { return [DSL.parseStatement(x).target as string]; } catch { return []; } }); };
  const targets = sorted(units.flatMap(stmtTargets));
  const lots = ['R', 'RD', 'RS', 'RT', 'RM', 'XX'].flatMap((zone) => [
    { zone, label: { f: 12 }, overlays: {}, map_areas: [], flags: {}, vars: {} },
    { zone, label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: 'detached_house', flags: { corner_lot: false }, vars: { lot_frontage_m: 12, lot_depth_m: 40 } },
    { zone, building_type: 'detached_house' },
  ]);
  const reasons = new Set<string>();
  const collect = (r: Json): void => {
    if (r && r.status === 'not_evaluated' && r.reason) reasons.add(E.reasonCode(r.reason));
    if (r && r.per_type) for (const p of Object.values(r.per_type) as Json[]) collect(p);
  };
  for (const l of lots) {
    const cands = E.loadCandidates(l, units).candidates;
    for (const t of targets) collect(E.effective(l, t, cands, C));
    for (const bt of ['detached_house', 'detached_houseplex', 'semi_detached_house']) collect(E.permitted(l, bt, cands, C));
  }
  it('the sweep reaches reasons at all (not vacuous)', () => {
    expect(reasons.size).toBeGreaterThanOrEqual(5);
  });
  it('each returned reason code is listed and was found by the static extraction', () => {
    const stat = new Set(staticEmitted(SRC));
    for (const c of reasons) {
      expect(E.NOT_EVALUATED_CODES, `returned ${c}`).toContain(c);
      expect([...stat], `returned ${c}`).toContain(c);
    }
  });
});
