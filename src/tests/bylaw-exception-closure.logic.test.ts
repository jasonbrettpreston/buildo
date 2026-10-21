// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §2 (134:31, the readers of units: effective(), permitted(), and now exceptionClosure());
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §7.6 (the evaluator stays pure);
//            docs/reports/2026-10-21-layer2-build-plan.md OQ-2 and PIN L2-PREREQ (R-IX)
//
// L2-CLOSURE (M-296): one additive pure export, exceptionClosure(lot, candidates), returns the lot's exception and every
// exception its INCLUDE links reach, in the order the evaluator's own lot gate (ruling (d)) walks them. Layer 2 reads the
// closure through this export instead of reading unit INCLUDE links itself.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const E: Json = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/evaluate.mjs')).href);
const VO: Json = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/vocab.mjs')).href);
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const PVOCAB = read('scripts/seeds/bylaw/vocab.json');
const EV = VO.evaluatorVocab(PVOCAB);
const U = (o: Json): Json => ({ layer: 'base', archetype: 'LIMIT', bound: 'max', displaces: [], condition: 'none', applies_to: { part: 'whole', refs: [] }, application: { zones: ['any'], building_types: ['any'] }, ...o });
const ex = (o: Json): Json => U({ layer: 'exception', ...o });
const inc = (from: string, to: string): Json => ex({ unit_id: `${from}#SSP(C)`, regulation_id: from, exception: from, archetype: 'INCLUDE', include_ref: to, target: 'none', bound: 'none', numeric_expression: 'none' });
const val = (from: string, v: string): Json => ex({ unit_id: `${from}#SSP(A)`, regulation_id: from, exception: from, target: 'height_m', numeric_expression: [`height_m = ${v} m @x`] });
const lot: Json = { zone: 'RD', label: { f: 9 }, overlays: {}, vars: { lot_frontage_m: 9.75, lot_depth_m: 33.56 }, flags: {}, building_type: 'detached_house', exception: null };

describe('L2-CLOSURE: exceptionClosure(lot, candidates)', () => {
  it('is an exported pure function', () => {
    expect(typeof E.exceptionClosure).toBe('function');
  });
  it('a lot with no exception has an empty closure', () => {
    expect(E.exceptionClosure(lot, [inc('X1', 'X2')])).toEqual([]);
  });
  it('lists the lot exception first, then each INCLUDE link in breadth-first order, once', () => {
    const cands = [inc('X1', 'X2'), inc('X1', 'X3'), inc('X2', 'X4'), val('X3', '9.0'), val('X4', '9.5')];
    expect(E.exceptionClosure({ ...lot, exception: 'X1' }, cands)).toEqual(['X1', 'X2', 'X3', 'X4']);
  });
  it('a cycle is walked once, never looped', () => {
    expect(E.exceptionClosure({ ...lot, exception: 'X1' }, [inc('X1', 'X2'), inc('X2', 'X1')])).toEqual(['X1', 'X2']);
  });
  it('an exception with no units still appears (the gate reports it as not authored)', () => {
    expect(E.exceptionClosure({ ...lot, exception: 'X1' }, [inc('X1', 'X9')])).toEqual(['X1', 'X9']);
  });
  it('does not mutate its inputs and gives the same list on a second call', () => {
    const cands = [inc('X1', 'X2'), val('X2', '9.0')];
    const snap = JSON.stringify(cands);
    const a = E.exceptionClosure({ ...lot, exception: 'X1' }, cands);
    expect(E.exceptionClosure({ ...lot, exception: 'X1' }, cands)).toEqual(a);
    expect(JSON.stringify(cands)).toBe(snap);
  });
  it('agrees with the lot gate: the first closure id that is not authored is the one effective() reports', () => {
    const cands = [inc('X1', 'X2'), inc('X2', 'X3'), val('X1', '9.0'), val('X2', '9.0'), val('X3', '9.0')];
    const l = { ...lot, exception: 'X1' };
    const closure: string[] = E.exceptionClosure(l, cands);
    expect(closure).toEqual(['X1', 'X2', 'X3']);
    const authored = { X1: 'authored', X2: 'authored', X3: 'unauthored' };
    const r = E.effective(l, 'height_m', cands, E.makeContext(EV, { authored }));
    expect(r.reason).toBe(`exception_not_authored:${closure.find((id) => authored[id as keyof typeof authored] !== 'authored')}`);
  });
});
