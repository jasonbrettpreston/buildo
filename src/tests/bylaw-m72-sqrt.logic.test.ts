// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-466 (the Layer 3 grammar gains sqrt, the M-377 form of a note on M-72),
//            M-463 (roof thickness measured vertically: depth × √(1 + pitch²)), M-72 (69a:132), M-385 / R3-01, R3-02
//
// MB-27 (sqrt) — the lock of M-466, red first. `sqrt(x)` is a Layer 3 form only (Layer 1 rows may not use it); x must be
// unitless (`ratio`); a unit-bearing argument is expression_error (statically and at run time); a negative argument is
// expression_error; a not_evaluated argument carries its reason; unlimited / unregulated pass through (M-72's table);
// the result unit is ratio, and null when the argument's static unit is null; no new DslError code.
// Worked examples at the exact 0.2572 m (M-462: 38x235 rafter 0.235 + sheathing 0.0095 + ceiling board 0.0127).
import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href);
const r9 = (x: number): number => Math.round(x * 1e9) / 1e9;
const ENV = { round9: r9, eps: 1e-9 };
const L3 = { layer: 'l3' };
const U0 = { lv: {}, l2: {}, names: {}, flags: [] };

let D: Json;
let E: Json;
beforeAll(async () => {
  D = await mod('scripts/analysis/bylaw/dsl.mjs');
  E = await mod('scripts/analysis/bylaw/evaluate-l3.mjs');
});
const run = (src: string, over: Json = {}): Json => E.evaluateL3Source(src, E.makeL3Env({ ...ENV, ...over })).l3;
const staticOf = (src: string): Json => D.staticUnitL3(D.parseExpr(src, L3), U0);

describe('M-466 sqrt: the grammar (Layer 3 only)', () => {
  it('S1 parses in Layer 3 and canonicalises stably (argument order inside + does not matter)', () => {
    const a = D.canonExpr(D.parseExpr('sqrt(1 ratio + 2 ratio × 3 ratio)', L3));
    const b = D.canonExpr(D.parseExpr('sqrt(2 ratio × 3 ratio + 1 ratio)', L3));
    expect(a).toBe(b);
    expect(a.startsWith('sqrt(')).toBe(true);
    expect(D.valueFormOf(D.parseExpr('sqrt(2 ratio)', L3))).toBe('formula');
  });
  it('S2 Layer 1 is unchanged: sqrt is an unknown function there', () => {
    let code: string | null = null;
    try { D.parseStatement('x = sqrt(2 ratio) @(A)'); } catch (e: any) { code = e.code; } // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(code).toBe('unknown_function');
  });
  it('S9 exactly one argument: sqrt() and sqrt(a; b) are syntax errors', () => {
    for (const src of ['sqrt()', 'sqrt(1 ratio; 2 ratio)']) {
      let code: string | null = null;
      try { D.parseExpr(src, L3); } catch (e: any) { code = e.code; } // eslint-disable-line @typescript-eslint/no-explicit-any
      expect([src, code]).toEqual([src, 'syntax']);
    }
  });
  it('S10 no new DslError code; MAX_NEST still bounds a deep sqrt chain', () => {
    expect(D.DSL_ERROR_CODES).toEqual(['syntax', 'bad_literal', 'bad_unit', 'bad_target', 'bad_clause_path', 'unknown_function', 'mixed_and_or', 'band_arm_not_literal', 'min_max_arity', 'duplicate_by_type_key', 'value_form_mixed', 'too_deep']);
    const deep = `${'sqrt('.repeat(D.MAX_NEST + 5)}2 ratio${')'.repeat(D.MAX_NEST + 5)}`;
    let code: string | null = null;
    try { D.parseExpr(deep, L3); } catch (e: any) { code = e.code; } // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(code).toBe('too_deep');
  });
});

describe('M-466 sqrt: the static unit rule', () => {
  it('S3 a ratio argument gives ratio; m × sqrt(ratio) is m', () => {
    expect(staticOf('sqrt(2 ratio)')).toEqual({ unit: 'ratio', errs: [] });
    expect(staticOf('0.2572 m × sqrt(1 ratio + 1 ratio × 1 ratio)')).toEqual({ unit: 'm', errs: [] });
  });
  it('S3 a unit-bearing argument is refused (unit_mismatch)', () => {
    for (const u of ['m', 'm2', 'pct', 'storeys', 'units']) {
      const s = staticOf(`sqrt(2 ${u})`);
      expect([u, s.unit]).toEqual([u, null]);
      expect(s.errs.some((x: string) => x.startsWith('unit_mismatch'))).toBe(true);
    }
  });
  it('S3 (F-13) an argument with a null static unit gives a null unit, never ratio, and no error', () => {
    expect(staticOf('sqrt(unregulated)')).toEqual({ unit: null, errs: [] });
    expect(staticOf('sqrt(unlimited)')).toEqual({ unit: null, errs: [] });
  });
});

describe('M-466 sqrt: run time', () => {
  it('S4 worked examples at the exact 0.2572 m (M-462, M-463)', () => {
    const one = run('sqrt(2 ratio)');
    expect([one.k, one.u, r9(one.v)]).toEqual(['num', 'ratio', 1.414213562]);
    const p1 = run('0.2572 m × sqrt(1 ratio + 1 ratio × 1 ratio)');
    expect([p1.k, p1.u, r9(p1.v)]).toEqual(['num', 'm', 0.363735728]);
    const p53 = run('0.2572 m × sqrt(1 ratio + (5 ratio ÷ 3 ratio) × (5 ratio ÷ 3 ratio))');
    expect([p53.k, p53.u, r9(p53.v)]).toEqual(['num', 'm', 0.499906942]);
  });
  it('S5 a unit-bearing argument is not_evaluated expression_error:unit_mismatch (never 0, never NaN)', () => {
    const v = run('sqrt(2 m)');
    expect([v.k, v.reason, v.v]).toEqual(['ne', 'expression_error:unit_mismatch', undefined]);
  });
  it('S6 a negative argument is expression_error; sqrt(0) is 0', () => {
    const v = run('sqrt(1 ratio − 2 ratio)');
    expect([v.k, v.reason]).toEqual(['ne', 'expression_error:sqrt_negative']);
    const z = run('sqrt(0 ratio)');
    expect([z.k, z.u, z.v]).toEqual(['num', 'ratio', 0]);
  });
  it('S7 a not_evaluated argument carries its reason (R3-01); unlimited and unregulated pass through (M-72)', () => {
    const v = run('sqrt(lv(no_such_setting))');
    expect([v.k, v.reason]).toEqual(['ne', 'expression_error:unknown_variable']);
    expect(run('sqrt(unlimited)').k).toBe('unlimited');
    expect(run('sqrt(unregulated)').k).toBe('unregulated');
  });
  it('S8 flags propagate (R3-02)', () => {
    const v = E.applySqrt(E.num(4, 'ratio', ['f_b', 'f_a']), ENV);
    expect([v.k, v.v, v.u, v.flags]).toEqual(['num', 2, 'ratio', ['f_a', 'f_b']]);
    const bad = E.applySqrt(E.num(4, 'm', ['f_a']), ENV);
    expect([bad.k, bad.reason, bad.flags]).toEqual(['ne', 'expression_error:unit_mismatch', ['f_a']]);
  });
});
