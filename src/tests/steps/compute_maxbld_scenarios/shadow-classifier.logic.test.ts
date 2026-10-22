/**
 * SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-71 (the per-parcel classifier, closed predicate classes), M-65 (3), M-67
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §6.9 (shadow before switch), O-11
 * SPEC LINK: docs/reports/2026-10-20-plan-mcbylaw-phase2-v2.md V-2 row E (the Phase 2 E classes)
 * Handbook:  Spec 133 §m.71 (M-71), §lc.50 (LC-50); Spec 132 §core.9; HELD on P3-Q1 (N6a freeze)
 *
 * P3-12 (PLAN §4; CHAT-73.nohalt), the PURE predicates only: no step-validate arm, no database, no live column is read here.
 * Each parcel x field difference between a legacy enrich_parcels max-build value and the new Layer 3 value is classed into
 * ONE member of a closed set; the residual is `unexplained`; the gate is unexplained = 0 and layer3_defect = 0 (M-71).
 * STRICT RED FIRST: this file ran against the missing module before scripts/lib/maxbld-shadow-classifier.js was written
 * (~/Buildo-scratch/p3build/red-p3-12.txt). A free-text `why` never closes a difference.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CJS surface
const ROOT = path.resolve(__dirname, '../../../../');
const REL = 'scripts/lib/maxbld-shadow-classifier.js';
function mod(): Json {
  expect(fs.existsSync(path.join(ROOT, REL)), `${REL} should exist`).toBe(true);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.join(ROOT, REL)) as Json;
}
const CFG = { tolerance: 1e-6, sliverRel: 0.005, landedF: ['F-2'] };
const diff = (over: Json = {}, facts: Json = {}): Json => ({ field: 'main_gfa_sqm', parcel_id: 1, legacy: 400, next: 450, facts: { ...facts }, ...over });
const cls = (d: Json, cfg: Json = CFG): string => mod().classify(d, cfg);

describe('P3-12: the closed set (M-71 + the Phase 2 V-2 E classes)', () => {
  it('lists the fixed classes and the parameterised forms exactly; every member is a string of a known form', () => {
    const m = mod();
    expect(m.FIXED_CLASSES).toEqual([
      'aggregation_sliver:M-42', 'coa_factor_refit', 'coa_method_unified', 'exception_now_applied', 'layer2_defect', 'layer3_defect', 'scenario_axis_applied', 'unexplained', 'unregulated_vs_default',
    ]);
    expect(m.PARAM_CLASSES).toEqual(['held_F', 'input_fidelity', 'l2_no_value', 'law_vs_code']);
  });
  it('isClosedClass accepts fixed and well-formed parameterised classes, refuses anything else (a free-text why can never be a class)', () => {
    const m = mod();
    for (const c of ['unexplained', 'held_F:F-2', 'input_fidelity:front_setback_est_m', 'l2_no_value:not_evaluated:exception_not_authored', 'law_vs_code:G-CODE-iv-1']) expect(m.isClosedClass(c), c).toBe(true);
    for (const c of ['because I said so', 'held_F:', 'made_up', 'l2_no_value:', '']) expect(m.isClosedClass(c), c).toBe(false);
  });
});

describe('P3-12: no difference is not a difference', () => {
  it('equal within tolerance (or both null) returns null: not classed, not counted', () => {
    expect(cls(diff({ legacy: 100, next: 100 + 1e-9 }))).toBeNull();
    expect(cls(diff({ legacy: null, next: null }))).toBeNull();
  });
});

describe('P3-12: defects first, then the explained classes, the residual last', () => {
  it('layer3_defect: the new row has a failed trust check (counted and gated to 0), whatever else holds', () => {
    expect(cls(diff({}, { layer3Defect: true, coaFactor: 1, aorSqm: 450 }))).toBe('layer3_defect');
  });
  it('layer2_defect: the Layer 2 cell breaks a Layer 2 invariant', () => {
    expect(cls(diff({}, { layer2Defect: true }))).toBe('layer2_defect');
  });
  it('coa_method_unified holds iff the new CoA value equals AOR(s) x factor exactly (M-65 (1))', () => {
    const f = { aorSqm: 400, coaFactor: 1.125 };
    expect(cls(diff({ field: 'coa_gfa_sqm', legacy: 520, next: 450 }, f))).toBe('coa_method_unified');
    expect(cls(diff({ field: 'coa_gfa_sqm', legacy: 520, next: 451 }, f))).toBe('unexplained'); // not exactly AOR x factor
    expect(cls(diff({ field: 'main_gfa_sqm', legacy: 520, next: 450 }, f))).toBe('unexplained'); // only a CoA field
  });
  it('coa_factor_refit: the new value is AOR(s) x the NEW factor of a refit (M-65 (3)); a refit flag with legacy NOT produced by the previous factor is the unified method', () => {
    const f = { aorSqm: 400, coaFactor: 1.125, previousFactor: 1.125, refit: true };
    // legacy 450 = 400 x the previous factor; next 490 = 400 x the new factor
    expect(cls(diff({ field: 'coa_gfa_sqm', legacy: 450, next: 490 }, { ...f, coaFactor: 1.225 }))).toBe('coa_factor_refit');
    expect(cls(diff({ field: 'coa_gfa_sqm', legacy: 520, next: 450 }, f))).toBe('coa_method_unified');
  });
  it('scenario_axis_applied: the legacy column is building-type-blind (S10) and the new scenario is not the base form', () => {
    expect(cls(diff({}, { legacyBlind: true, scenario: 'H' }))).toBe('scenario_axis_applied');
    expect(cls(diff({}, { legacyBlind: true, scenario: 'D' }))).toBe('unexplained');
    expect(cls(diff({}, { legacyBlind: false, scenario: 'H' }))).toBe('unexplained');
  });
  it('l2_no_value:<status>:<reason>: legacy has a number where Layer 2 has none, mapped 1:1 (H8)', () => {
    expect(cls(diff({ next: null }, { newFieldStatus: 'not_evaluated:exception_not_authored' }))).toBe('l2_no_value:not_evaluated:exception_not_authored');
    expect(cls(diff({ next: null }, { newFieldStatus: 'not_applicable:10.5.40.40(1)(C)' }))).toBe('l2_no_value:not_applicable:10.5.40.40(1)(C)');
    expect(cls(diff({ next: null }, {}))).toBe('unexplained');
  });
  it('unregulated_vs_default: legacy used a default where Layer 2 says unregulated or unlimited', () => {
    expect(cls(diff({ next: null }, { newFieldStatus: 'unregulated:10.60.40.30' }))).toBe('unregulated_vs_default');
    expect(cls(diff({ next: null }, { newFieldStatus: 'unlimited:10.5.40.40(1)(C)' }))).toBe('unregulated_vs_default');
  });
  it('exception_now_applied: the new winner comes from an exception layer where legacy used the base', () => {
    expect(cls(diff({}, { winnerLayer: 'exception', legacyLayer: 'base' }))).toBe('exception_now_applied');
    expect(cls(diff({}, { winnerLayer: 'exception', legacyLayer: 'exception' }))).toBe('unexplained');
  });
  it('input_fidelity:<input>: legacy and new read the same input at different fidelity; the first sorted input names the class', () => {
    expect(cls(diff({}, { inputFidelity: ['rear_setback', 'front_setback_est_m'] }))).toBe('input_fidelity:front_setback_est_m');
  });
  it('law_vs_code:<G-CODE id>: legacy code carries a literal that differs from the law, named by its G-CODE id', () => {
    expect(cls(diff({}, { gCodeId: 'G-CODE-iv-1' }))).toBe('law_vs_code:G-CODE-iv-1');
  });
  it('aggregation_sliver:M-42: a relative difference under the sliver bound on an aggregated field', () => {
    expect(cls(diff({ legacy: 1000, next: 1003 }, { aggregated: true }))).toBe('aggregation_sliver:M-42');
    expect(cls(diff({ legacy: 1000, next: 1100 }, { aggregated: true }))).toBe('unexplained');
    expect(cls(diff({ legacy: 1000, next: 1003 }, {}))).toBe('unexplained');
  });
  it('held_F:<F-n>: only for an F item this plan has landed (config.landedF), never otherwise', () => {
    expect(cls(diff({}, { heldF: 'F-2' }))).toBe('held_F:F-2');
    expect(cls(diff({}, { heldF: 'F-4' }))).toBe('unexplained');
  });
  it('the residual is unexplained, and a free-text why never closes a difference', () => {
    expect(cls(diff({}, { why: 'this is fine, trust me' }))).toBe('unexplained');
    expect(cls(diff({ why: 'operator said so' } as Json))).toBe('unexplained');
  });
});

describe('P3-12: totality, determinism, and the gate', () => {
  it('classify is total: every difference gets exactly one member of the closed set, and a set of facts in any key order classes the same', () => {
    const m = mod();
    const samples = [diff(), diff({}, { layer3Defect: true }), diff({ next: null }, { newFieldStatus: 'not_evaluated:x' }), diff({}, { inputFidelity: ['a'] }), diff({}, { gCodeId: 'G-CODE-1' })];
    for (const d of samples) expect(m.isClosedClass(cls(d)), JSON.stringify(d)).toBe(true);
    expect(cls(diff({}, { inputFidelity: ['a'], gCodeId: 'G-CODE-1' }))).toBe(cls(diff({}, { gCodeId: 'G-CODE-1', inputFidelity: ['a'] })));
  });
  it('summarize counts per class with up to 10 sample parcel ids, and the gate passes only at unexplained = 0 and layer3_defect = 0', () => {
    const m = mod();
    const ds = [diff({ parcel_id: 1 }), diff({ parcel_id: 2 }, { heldF: 'F-2' }), diff({ parcel_id: 3 }, { layer3Defect: true }), diff({ parcel_id: 4, legacy: 5, next: 5 })];
    const s = m.summarize(ds, CFG);
    expect(s.total).toBe(3); // the equal pair is not a difference
    expect(s.counts).toEqual({ unexplained: 1, 'held_F:F-2': 1, layer3_defect: 1 });
    expect(s.samples.unexplained).toEqual([1]);
    expect(s.gate).toEqual({ unexplained: 1, layer3_defect: 1, pass: false });
    expect(m.summarize([diff({ parcel_id: 2 }, { heldF: 'F-2' })], CFG).gate.pass).toBe(true);
    const many = Array.from({ length: 25 }, (_, i) => diff({ parcel_id: i + 1 }));
    expect(m.summarize(many, CFG).samples.unexplained).toHaveLength(10);
  });
  it('a missing config or a malformed difference throws (never defaulted)', () => {
    expect(() => mod().classify(diff(), {})).toThrow(/config/);
    expect(() => mod().classify({ field: 'x' }, CFG)).toThrow(/difference/);
  });
  it('is pure: requires nothing and touches no database, file, env, clock or randomness; reads no step-validate or live column', () => {
    const s = fs.readFileSync(path.join(ROOT, REL), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(s).not.toMatch(/require\(|process\.env|Date\.now|new Date|Math\.random|step-validate|enrich_parcels/);
  });
});
