// SPEC LINK: .cursor/mcbylaw/phase2-plan-v2.md §A L14 (cell-key.json: dependencies = static closure ∪ the hardened
//            inputs[] — R-DEP; RT-A25), D3 (rows = distinct cell_id × targets); docs/specs/01-pipeline/
//            68_mcbylaw_standard.md §7.6 (the evaluator, inputs[]), §10 (determinism); docs/specs/01-pipeline/
//            124_step_standard_policy.md R-DET
//
// The per-target cell cache (lane EVAL-PERF, 2026-10-14). effective() is evaluated once per (candidate set, target,
// values of the lot inputs the result read); a lot that agrees on every input an earlier evaluation read is served
// that result. Byte-identical by construction IF inputs[] is complete; these locks prove both directions:
//   1. transparency: cached == uncached, byte for byte, over a corpus with hits
//   2. mutation: a key that drops one read input (vars.lot_frontage_m) serves a wrong result — the corpus catches it
//   3. fail-closed: an input path the key cannot value is refused, never skipped
//   4. two candidate sets never share a cell
//   5. the worker pool (eval-parallel.mjs) is byte-identical to one process, results sorted by lot id
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const E = await load('scripts/analysis/bylaw/evaluate.mjs');
const VO = await load('scripts/analysis/bylaw/vocab.mjs');
const CC = await load('scripts/analysis/bylaw/cell-cache.mjs');
const EP = await load('scripts/analysis/bylaw/eval-parallel.mjs');
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const PVOCAB = read('scripts/seeds/bylaw/vocab.json');
const ABS = read('scripts/seeds/bylaw/absence-rulings.json');
const UNITS: Json[] = read('src/tests/fixtures/bylaw/eval-units.json').units.filter((u: Json) => u.candidate);
const VECTORS: Json[] = read('scripts/seeds/bylaw/eval-vectors.json').vectors;
const EV = VO.evaluatorVocab ? VO.evaluatorVocab(PVOCAB) : {};
const CTX_INPUT = { vocab: EV, extra: { absences: ABS.rulings } };
const C: Json = E.makeContext ? E.makeContext(EV, { absences: ABS.rulings }) : {};
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort(cmp).map((y) => [y, x[y]])) : x));
const TARGETS = Object.keys(PVOCAB.dsl_target).sort(cmp);

// 35 distinct eval-vector lots × 8 variants: lots that differ only in inputs some targets do not read (cache hits) and
// in inputs some do (frontage, area, depth, corner, building type, flags)
const BASE_LOTS = [...new Set(VECTORS.map((v) => stable(v.lot)))].sort(cmp).map((s) => JSON.parse(s));
const variants = (L: Json): Json[] => {
  const f = (L.vars || {}).lot_frontage_m ?? 10;
  return [
    L,
    { ...L, vars: { ...L.vars, lot_frontage_m: f * 1.5 } },
    { ...L, vars: { ...L.vars, lot_frontage_m: f * 0.6 } },
    { ...L, vars: { ...L.vars, lot_area_m2: ((L.vars || {}).lot_area_m2 ?? 300) * 2 } },
    { ...L, vars: { ...L.vars, lot_depth_m: ((L.vars || {}).lot_depth_m ?? 30) + 5 } },
    { ...L, flags: { ...L.flags, corner_lot: !(L.flags || {}).corner_lot } },
    { ...L, building_type: null },
    { ...L, flags: {} },
  ];
};
const CORPUS: Json[] = BASE_LOTS.flatMap(variants).map((lot, i) => ({ id: i + 1, lot }));

/** Every (lot, target) result of the corpus, through `eff`. */
const run = (eff: (lot: Json, t: string, cands: Json[]) => Json): string[] => {
  const out: string[] = [];
  for (const { lot } of CORPUS) {
    const cands = E.loadCandidates(lot, UNITS).candidates;
    for (const t of TARGETS) out.push(stable(eff(lot, t, cands)));
  }
  return out;
};
const UNCACHED = E.effective ? run((lot, t, cands) => E.effective(lot, t, cands, C)) : [];

describe('1. transparency: the cell cache is byte-identical to effective()', () => {
  it('280 lots × every target: cached == uncached, with cache hits', () => {
    const cache = CC.makeCellCache({ evaluator: E, ctx: C });
    const got = run((lot, t, cands) => cache.effective(lot, t, cands));
    expect(got.length).toBe(CORPUS.length * TARGETS.length);
    expect(got).toEqual(UNCACHED);
    expect(cache.stats().hits).toBeGreaterThan(CORPUS.length * TARGETS.length / 2);
  }, 120_000);
});

describe('2. mutation: a key missing one read input serves a wrong result, and the corpus catches it', () => {
  it('dropping vars.lot_frontage_m from the key → at least one result differs from effective()', () => {
    const cache = CC.makeCellCache({ evaluator: E, ctx: C, keyInputs: (inputs: string[]) => inputs.filter((x) => x !== 'vars.lot_frontage_m') });
    const got = run((lot, t, cands) => cache.effective(lot, t, cands));
    const differ = got.filter((s, i) => s !== UNCACHED[i]).length;
    expect(differ).toBeGreaterThan(0);
  }, 120_000);
});

describe('3. fail-closed: an input path the key cannot value is refused', () => {
  it('inputValue throws CellCacheError on an unknown path; target.* is derived (not keyed)', () => {
    expect(() => CC.inputValue({ zone: 'RD' }, 'mystery.x')).toThrow(CC.CellCacheError);
    expect(CC.inputValue({ zone: 'RD' }, 'target.height_m')).toBe(null);
    // container absent ≠ value absent (map_area_not_held vs map_value_absent)
    expect(CC.inputValue({}, 'overlays.HT')).not.toBe(CC.inputValue({ overlays: {} }, 'overlays.HT'));
  });
});

describe('4. two candidate sets never share a cell', () => {
  it('the same lot under a candidate set with one more unit is evaluated, not served', () => {
    const lot = BASE_LOTS[0];
    const cands = E.loadCandidates(lot, UNITS).candidates;
    const low = { layer: 'base', archetype: 'LIMIT', bound: 'max', displaces: [], condition: 'none', applies_to: { part: 'whole', refs: [] }, application: { zones: ['any'], building_types: ['any'] }, unit_id: 'CC#low', target: 'height_m', numeric_expression: ['height_m = 1.0 m @low'] };
    const cache = CC.makeCellCache({ evaluator: E, ctx: C });
    const a = cache.effective(lot, 'height_m', cands);
    const b = cache.effective(lot, 'height_m', [...cands, low]);
    expect(stable(a)).toBe(stable(E.effective(lot, 'height_m', cands, C)));
    expect(stable(b)).toBe(stable(E.effective(lot, 'height_m', [...cands, low], C)));
  });
});

describe('5. the worker pool is byte-identical to one process, sorted by lot id', () => {
  it('workerCount = min(cores − 2, 8), never below 1', () => {
    expect([EP.workerCount(12), EP.workerCount(4), EP.workerCount(2), EP.workerCount(1)]).toEqual([8, 2, 1, 1]);
  });
  it('2 workers == in-process, ids ascending, docs equal', async () => {
    const lots = CORPUS.slice(0, 40).reverse(); // input order is not output order
    const args = { lots, units: UNITS, ctxInput: CTX_INPUT, targets: TARGETS };
    const one = await EP.evaluateLots({ ...args, workers: 0 });
    const two = await EP.evaluateLots({ ...args, workers: 2 });
    expect(one.map((r: Json) => r.id)).toEqual([...lots.map((l) => l.id)].sort((a, b) => a - b));
    expect(two).toEqual(one);
    const dig = await EP.evaluateLots({ ...args, workers: 2, digest: true });
    expect(dig).toEqual(one.map((r: Json) => ({ id: r.id, sha256: crypto.createHash('sha256').update(r.doc).digest('hex') })));
    const lot = (CORPUS[0] as Json).lot;
    const doc = JSON.parse(one[0].doc);
    expect(doc.res.height_m).toEqual(JSON.parse(stable(E.effective(lot, 'height_m', E.loadCandidates(lot, UNITS).candidates, C))));
  }, 120_000);
});
