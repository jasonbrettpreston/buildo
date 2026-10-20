// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5 (precedence; undecided conditions resolved by
//            enumeration), §7.6 (the evaluator), §10 (determinism); docs/specs/01-pipeline/69_mcbylaw_policy.md M-50,
//            M-60; docs/specs/01-pipeline/124_step_standard_policy.md R-DET
//
// McBylaw evaluator PERFORMANCE refactor (lane EVAL-PERF, 2026-10-14). P2-0 measured 1.3–2.0 s per lot against the
// k3_b budget (≤ ~4 ms/lot). The profile put ~73% of the time in nested target resolution (a condition or expression
// that reads another target re-ran effective() for it once per undecided world × unit × building-type scenario).
// The refactor memoizes within ONE top-level effective() call and hoists per-(candidates, target) work. It must not
// change any output byte:
//   1. a nested target is resolved once per (depth, scenario) inside one top-level call (red before the memo)
//   2. nothing is cached across top-level calls on the lot (a changed lot gives a fresh answer)
//   3. a candidates array changed between calls gives a fresh answer (no stale per-array cache)
//   4. equivalence: the fixture corpus (35 eval-vector lots × 4 variants × 58 targets + permitted()) hashes to the
//      value the pre-refactor evaluator produced (golden captured from bd332ec8's evaluate.mjs). Re-pinned 2026-10-16 for
//      the 57th target `aggregate_side_setback_m` (Spec 69a M-130) only: over the original 56 targets the hash is unchanged
//      (0b693318…), proven by hashing the new tree against main's target list. Re-pinned again for the 58th target
//      `ancillary_coverage_pct` (M-179(1)) only: over the prior 57 targets the hash is unchanged (aae25981…).
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
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const PVOCAB = read('scripts/seeds/bylaw/vocab.json');
const ABS = read('scripts/seeds/bylaw/absence-rulings.json');
const UNITS: Json[] = read('src/tests/fixtures/bylaw/eval-units.json').units.filter((u: Json) => u.candidate);
const VECTORS: Json[] = read('scripts/seeds/bylaw/eval-vectors.json').vectors;
const EV = VO.evaluatorVocab ? VO.evaluatorVocab(PVOCAB) : {};
const C: Json = E.makeContext ? E.makeContext(EV, { absences: ABS.rulings }) : {};
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort(cmp).map((y) => [y, x[y]])) : x));
const U = (o: Json): Json => ({ layer: 'base', archetype: 'LIMIT', bound: 'max', displaces: [], condition: 'none', applies_to: { part: 'whole', refs: [] }, application: { zones: ['RD'], building_types: ['any'] }, ...o });
const rdLot: Json = { zone: 'RD', label: { f: 9, a: 280, d: 0.45 }, overlays: { HT: 8.5 }, vars: { lot_frontage_m: 9.75, lot_depth_m: 33.56, lot_area_m2: 327.12 }, flags: {}, building_type: 'detached_house', exception: null };

// four undecided height units (flags not held) whose expression reads the target required_lot_frontage_m, which a
// DEFINE unit derives from the lot frontage, plus one unconditional unit: 2^4 worlds, every world agrees
const FLAGS = ['corner_lot', 'through_lot', 'major_street', 'flanking_lot'];
const nestedUnits = (): Json[] => [
  U({ unit_id: 'N#def', archetype: 'DEFINE', bound: 'none', target: 'required_lot_frontage_m', numeric_expression: ['required_lot_frontage_m = lot_frontage_m @def'] }),
  U({ unit_id: 'N#base', target: 'height_m', numeric_expression: ['height_m = required_lot_frontage_m @base'] }),
  ...FLAGS.map((f, i) => U({ unit_id: `N#(${i})`, target: 'height_m', condition: { tokens: [f], if: 'none' }, numeric_expression: [`height_m = required_lot_frontage_m @(${i})`] })),
];
/** The lot with lot.vars wrapped so every read of `lot_frontage_m` is counted. */
const countingLot = (): { lot: Json; reads: () => number } => {
  let n = 0;
  const vars = new Proxy({ ...rdLot.vars }, { get: (o, k) => { if (k === 'lot_frontage_m') n++; return (o as Json)[k as string]; } });
  return { lot: { ...rdLot, vars }, reads: () => n };
};

describe('1. a nested target is resolved once per (depth, scenario) inside one top-level call', () => {
  it('2^4 undecided worlds reading required_lot_frontage_m read the lot frontage once, and the value stands', () => {
    const { lot, reads } = countingLot();
    const r = E.effective(lot, 'height_m', nestedUnits(), C);
    expect(r.status).toBe('value');
    expect(r.value).toBe(9.75);
    expect(reads()).toBe(1);
  });
});

describe('2. nothing is cached across top-level calls', () => {
  it('the same lot object, changed between calls, gives the new answer', () => {
    const lot: Json = { ...rdLot, vars: { ...rdLot.vars } };
    const units = nestedUnits();
    expect(E.effective(lot, 'height_m', units, C).value).toBe(9.75);
    lot.vars.lot_frontage_m = 12;
    expect(E.effective(lot, 'height_m', units, C).value).toBe(12);
  });
});

describe('3. a candidates array changed between calls gives a fresh answer', () => {
  it('pushing a lower height unit onto the same array changes the result', () => {
    const lot: Json = { ...rdLot, flags: { corner_lot: true, through_lot: true, major_street: true, flanking_lot: true } };
    const cands = nestedUnits();
    expect(E.effective(lot, 'height_m', cands, C).value).toBe(9.75);
    cands.push(U({ unit_id: 'N#low', target: 'height_m', numeric_expression: ['height_m = 7.0 m @low'] }));
    expect(E.effective(lot, 'height_m', cands, C).value).toBe(7);
    cands.pop();
    expect(E.effective(lot, 'height_m', cands, C).value).toBe(9.75);
  });
});

describe('4. equivalence: the fixture corpus is byte-identical to the pre-refactor evaluator', () => {
  it('35 eval-vector lots × 4 variants × every target + permitted() hash to the bd332ec8 golden', () => {
    const lots = [...new Set(VECTORS.map((v) => stable(v.lot)))].sort(cmp).map((s) => JSON.parse(s));
    const targets = Object.keys(PVOCAB.dsl_target).sort(cmp);
    const h = crypto.createHash('sha256');
    for (const L of lots) {
      for (const lot of [L, { ...L, building_type: null }, { ...L, flags: {} }, { ...L, building_type: null, flags: {} }]) {
        const cands = E.loadCandidates(lot, UNITS).candidates;
        for (const t of targets) h.update(stable(E.effective(lot, t, cands, C)));
        for (const bt of EV.building_type_residential) h.update(stable(E.permitted(lot, bt, cands, C)));
      }
    }
    expect(lots.length).toBe(35);
    // re-pinned 2026-10-18 (by-law evaluator-fix lane, Spec 69a M-217..M-222): the only result change over this corpus is
    // dwelling_units_max no_candidate → unregulated on the 140 lot×variant cells with no 'u' label (M-220 / M-202(3));
    // the other byte changes are inputs[] gaining building_type (the M-219 Article-scope read). Measured against
    // ca3bcf0e by a full per-cell diff, nothing else moved.
    // re-pinned 2026-10-19 (M-183 + M-174(4) on (E)): no top-level status or value moved over this corpus; only the
    // M-50 per_type label of the houseplex cells (not_evaluated:no_candidate → not_applicable:<x.40.40(1)(C) /
    // x.40.10(3)(C) DISAPPLY>, 116 cells) and the M-60 "resolutions disagree" trace listings. Full per-cell diff vs c37dd492.
    // re-pinned 2026-10-19 (Q-M218, M-223(3)): the corpus iterates every dsl_target, and upper_storey_setback_m is new;
    // its 140 cells are not_evaluated:no_candidate (the fixture units predate the step-back keying). With that target
    // left out the hash is the previous pin 2ed7dfff…d466 exactly, so no existing cell moved.
    // re-pinned 2026-10-19 (validation fixes, operator Q2; Spec 69a M-205(2)): deep_side_setback_m is a new dsl_target, so
    // the corpus gains its cells; with it left out the hash is the previous pin 690439ff…557c exactly, so no existing cell
    // moved (the fixture units carry no displaces_optional, so the Q1 rule-2 change cannot reach them).
    // re-pinned 2026-10-20 (O-7 / M-223(3), bylaw fix lane): roof_slope_max is a new dsl_target; its 140 cells are
    // not_evaluated:no_candidate (the fixture units predate the keying). With it left out the hash is the previous pin
    // 2e16556b…b491 exactly, so no existing cell moved.
    // re-pinned 2026-10-20 (CHAT-7 / M-198(4), bylaw fix lane 2): upper_side_setback_m is a new dsl_target; its 140 cells
    // are not_evaluated:no_candidate (the fixture units predate the keying). With it left out the hash is the previous pin
    // 8c8eca03…a8b6 exactly, so no existing cell moved.
    expect(h.digest('hex')).toBe('e957100cb282644e7690542f94bf093f8a8369a0b0697ac27dfef94369c4f5fc');
  }, 60_000);
});
