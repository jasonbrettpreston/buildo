// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (row shape, value_kind), §5 (the unauthored-exception
//            gate), §7 I3 / I4 / I10; docs/specs/01-pipeline/69a_mcbylaw_register.md M-231 (operator approved
//            2026-10-20, 2026-10-20-scenario-build-rulings#R-4); M-232 (the Layer 2 status set)
//
// Slice (a) of the Layer 2 build plan (docs/reports/2026-10-21-layer2-build-plan.md §4, §7): the pure resolution
// functions that Spec 134 and the recorded rulings fully settle, built ahead of commit ① on fixtures (the node N6a
// form, Spec 134 §9). Anything still open (the closure source, the scope file, the gate order, the status columns:
// plan §6 OQ-2, OQ-8, OQ-6, OQ-4) is an INPUT of these functions, never decided here.
//
// RED FIRST: committed as it.fails at 027e5f72, before the module existed (gate K artifact
// docs/reports/red-evidence/resolve_bylaws/slice-a-red.json, 18 red at ee5ed572); the implementation commit flips
// every case to it (flipped with the implementation).

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .js / .mjs module surface
const ROOT = path.resolve(__dirname, '../../../../');
// A library the compute module will require (as compute modules require ../zoning-precedence), not the compute module
// itself: a file in scripts/lib/compute/ must pair with a manifest step (step-conformance §5.5), and the step is not
// registered before ① (Spec 134 §9). First committed at scripts/lib/compute/resolve-bylaws.js (f973687a).
const COMPUTE = 'scripts/lib/bylaw-resolution.js';
function rb(): Json {
  expect(fs.existsSync(path.join(ROOT, COMPUTE)), `${COMPUTE} should exist`).toBe(true);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.join(ROOT, COMPUTE)) as Json;
}
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const E = await load('scripts/analysis/bylaw/evaluate.mjs');
const VO = await load('scripts/analysis/bylaw/vocab.mjs');
const PVOCAB = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/vocab.json'), 'utf8')) as Json;
const ctx = (extra: Json = {}): Json => E.makeContext(VO.evaluatorVocab(PVOCAB), extra);

// Synthetic fixtures (the bylaw-rulings.logic.test.ts form): ids are test tokens, never a real exception.
const U = (o: Json): Json => ({ layer: 'base', archetype: 'LIMIT', bound: 'max', displaces: [], condition: 'none', applies_to: { part: 'whole', refs: [] }, application: { zones: ['any'], building_types: ['any'] }, ...o });
const rdLot: Json = { zone: 'RD', label: { f: 9, a: 280, d: 0.45 }, overlays: { HT: 8.5 }, vars: { lot_frontage_m: 9.75, lot_depth_m: 33.56, lot_area_m2: 327.12 }, flags: { corner_lot: false, major_street: false, through_lot: false }, building_type: 'detached_house', exception: null };
const height = U({ unit_id: '10.20.40.10(1)#(B)', regulation_id: '10.20.40.10(1)', target: 'height_m', numeric_expression: ['height_m = 10.0 m @(1)(B)'] });
const front = U({ unit_id: '10.20.40.70(1)#whole', regulation_id: '10.20.40.70(1)', target: 'front_setback_m', bound: 'min', numeric_expression: ['front_setback_m = 6.0 m @(1)'] });
const exq = U({ unit_id: 'EXQ#SSP(A)', regulation_id: 'EXQ', layer: 'exception', exception: 'EXQ', target: 'front_setback_m', bound: 'min', numeric_expression: ['front_setback_m = 7.5 m @SSP(A)'] });
const UNITS = [height, front, exq];

const SCOPE = [
  { target: 'height_m', structure: 'principal' },
  { target: 'front_setback_m', structure: 'principal' },
  { target: 'height_m', structure: 'garden_suite' },
];

describe('M-231: the lot-wide unauthored-exception gate (Spec 134 §5)', () => {
  it('a lot with no exception (an empty closure) is not gated', () => {
    expect(rb().unauthoredException([], {})).toBeNull();
  });

  it('a fully authored closure is not gated, in either authored form', () => {
    expect(rb().unauthoredException(['EXA', 'EXB'], { EXA: 'authored', EXB: { status: 'authored' } })).toBeNull();
  });

  it('the lot own exception missing from the authored map gates the lot with its id', () => {
    expect(rb().unauthoredException(['EXA'], {})).toBe('EXA');
  });

  it('a partial exception is not fully authored, even for the targets it lists', () => {
    expect(rb().unauthoredException(['EXQ'], { EXQ: { status: 'partial', targets: ['front_setback_m', 'height_m'] } })).toBe('EXQ');
  });

  it('an authored exception that INCLUDEs an unauthored one gates with the included id', () => {
    expect(rb().unauthoredException(['EXA', 'EXB'], { EXA: 'authored' })).toBe('EXB');
  });

  it('the first unauthored id in closure order is reported', () => {
    expect(rb().unauthoredException(['EXA', 'EXB', 'EXC'], { EXA: 'authored' })).toBe('EXB');
    expect(rb().unauthoredException(['EXC', 'EXB', 'EXA'], { EXA: 'authored' })).toBe('EXC');
  });

  it('a missing closure or authored map throws, never defaulted (I10)', () => {
    expect(() => rb().unauthoredException(undefined, {})).toThrow(/closure/);
    expect(() => rb().unauthoredException(['EXA'], undefined)).toThrow(/authored/);
    expect(() => rb().unauthoredException(['EXA'], null)).toThrow(/authored/);
  });

  it('the gate status is not_evaluated:exception_not_authored:<id>, an evaluator closed code', () => {
    expect(E.NOT_EVALUATED_CODES).toContain('exception_not_authored');
    expect(rb().exceptionGateStatus(['EXA', 'EXB'], { EXA: 'authored' })).toBe('not_evaluated:exception_not_authored:EXB');
    expect(rb().exceptionGateStatus(['EXA'], { EXA: 'authored' })).toBeNull();
    expect(rb().exceptionGateStatus([], {})).toBeNull();
  });
});

describe('M-231: written per target (gatedRows)', () => {
  it('one row per declared target and structure, each with the gate status and no winner', () => {
    const status = 'not_evaluated:exception_not_authored:EXQ';
    expect(rb().gatedRows(SCOPE, status)).toEqual(SCOPE.map((s) => ({ target: s.target, structure: s.structure, status, winner_unit_id: null })));
  });

  it('a duplicate scope entry throws (I1 counts exactly)', () => {
    expect(() => rb().gatedRows([...SCOPE, { target: 'height_m', structure: 'principal' }], 'not_evaluated:x')).toThrow(/duplicate/);
  });

  it('a scope entry without a target or a structure throws', () => {
    expect(() => rb().gatedRows([{ target: 'height_m' }], 'not_evaluated:x')).toThrow(/structure/);
    expect(() => rb().gatedRows([{ structure: 'principal' }], 'not_evaluated:x')).toThrow(/target/);
  });

  it('a gate status outside the not_evaluated form is refused (I3: a gated row has a closed reason)', () => {
    expect(() => rb().gatedRows(SCOPE, null)).toThrow(/status/);
    expect(() => rb().gatedRows(SCOPE, 'applies')).toThrow(/status/);
  });
});

describe('M-231: the gate fires before effective() (resolveLot)', () => {
  it('a gated lot never calls the resolver', () => {
    let calls = 0;
    const rows = rb().resolveLot({ scope: SCOPE, gateStatus: 'not_evaluated:exception_not_authored:EXQ', resolveOne: () => { calls += 1; return {}; } });
    expect(calls).toBe(0);
    expect(rows.map((r: Json) => r.status)).toEqual(SCOPE.map(() => 'not_evaluated:exception_not_authored:EXQ'));
  });

  it('an ungated lot resolves every scope entry once, in scope order', () => {
    const seen: string[] = [];
    const rows = rb().resolveLot({ scope: SCOPE, gateStatus: null, resolveOne: (s: Json) => { seen.push(`${s.target}|${s.structure}`); return { ...s, status: 'applies' }; } });
    expect(seen).toEqual(SCOPE.map((s) => `${s.target}|${s.structure}`));
    expect(rows).toHaveLength(SCOPE.length);
  });

  it('the A14 case with the real evaluator: a partial exception resolves its listed target in effective(), Layer 2 still gates every target', () => {
    const lot = { ...rdLot, exception: 'EXQ' };
    const authored = { EXQ: { status: 'partial', targets: ['front_setback_m'] } };
    const C = ctx({ authored });
    const eff = (target: string): Json => E.effective(lot, target, E.loadCandidates(lot, UNITS).candidates, C);
    // the evaluator's own gate is per target (ruling (d)): the listed target resolves from the exception
    expect([eff('front_setback_m').status, eff('front_setback_m').value]).toEqual(['value', 7.5]);
    // Layer 2's gate is lot-wide (M-231): no winner on any target, the evaluator is never reached
    const gateStatus = rb().exceptionGateStatus(['EXQ'], authored);
    let calls = 0;
    const rows = rb().resolveLot({ scope: SCOPE, gateStatus, resolveOne: (s: Json) => { calls += 1; return eff(s.target); } });
    expect(calls).toBe(0);
    expect(rows.every((r: Json) => r.status === 'not_evaluated:exception_not_authored:EXQ' && r.winner_unit_id === null)).toBe(true);
  });
});

describe('Spec 134 §3: value_kind', () => {
  it('a finite number is number; the two terminal strings map to themselves', () => {
    expect([rb().valueKindOf(0), rb().valueKindOf(7.5), rb().valueKindOf('unlimited'), rb().valueKindOf('unregulated')]).toEqual(['number', 'number', 'unlimited', 'unregulated']);
  });

  it('anything else throws, never guessed', () => {
    for (const v of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, '7.5', 'none', {}]) expect(() => rb().valueKindOf(v), String(v)).toThrow(/value_kind/);
  });
});

describe('purity (Spec 132 §1 compute purity; gate E at ①)', () => {
  it('the compute module requires nothing and reads no environment, clock or randomness', () => {
    const src = fs.readFileSync(path.join(ROOT, COMPUTE), 'utf8');
    expect(src).not.toMatch(/\brequire\(/);
    expect(src).not.toMatch(/\bprocess\./);
    expect(src).not.toMatch(/\bDate\b|Math\.random/);
  });
});
