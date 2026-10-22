/**
 * SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §6.4 (M-65 CoA axis), §Phase-5 P5.10a (CoA tier), INV-23
 * SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md m.65 (M-65), lc.60 (LC-60 u unfitted at release), lc.49 (LC-49)
 * SPEC LINK: docs/specs/01-pipeline/132_step_standard_handbook.md core.9 (compute purity)
 *
 * P3-5 (PLAN §4; operator CHAT-70.4): the pure CoA-tier module for compute_maxbld_scenarios.
 * CoA(s) = AOR(s) x u_form(s); a form with no fitted u is `not_evaluated:coa_factor_unfitted:<form>`, never borrowed
 * (M-65 rule 2; LC-60: unfitted at the first release). The CoA tier stands apart (INV-23). Pure, no DB, no step.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CJS surface
const ROOT = path.resolve(__dirname, '../../../../');
const REL = 'scripts/lib/maxbld-coa-tier.js';
function mod(): Json {
  expect(fs.existsSync(path.join(ROOT, REL)), `${REL} should exist`).toBe(true);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.join(ROOT, REL)) as Json;
}
const VOCAB = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/vocab.json'), 'utf8')) as Json;
const SPEC78 = fs.readFileSync(path.join(ROOT, 'docs/specs/01-pipeline/78_optimal_lot_configuration.md'), 'utf8');

const BOUNDS = { min: 1.0, max: 1.5 };
const FIT = { lv_id: 'u_single', value: 1.14, version: 'fit-test-1', fit_basis: { n: 10 } };
const factors = (o: Json = {}): Json => ({ single: FIT, ...o });
const row = (o: Json = {}): Json => ({ scenario: 'D', mainGfaSqm: 200, hasSuite: false, suiteGfaSqm: null, ...o });

describe('P3-5: form map (M-65 rule 2; Spec 78 P5.10a table)', () => {
  it('maps each principal scenario to its form and gives the renovations and the suite add-on none', () => {
    const m = mod();
    expect(m.FORM_OF_SCENARIO).toEqual({ D: 'single', 2: 'single_suite', H: 'multiplex', S: 'multiplex' });
    expect(m.formOf('RA')).toBeNull();
    expect(m.formOf('RI')).toBeNull();
    expect(m.formOf('RB')).toBeNull();
  });

  it('the forms and the scenario table agree with Spec 78 (text lock: each pair appears in the P5.10a table)', () => {
    expect(SPEC78).toContain('| `detached_house` | `single` |');
    expect(SPEC78).toContain('| `house_with_secondary_suite` | `single_suite` |');
    expect(SPEC78).toContain('| `detached_houseplex`, `semi_detached_houseplex` | `multiplex`');
  });
});

describe('P3-5: unfitted at release (LC-60) and never borrowed (M-65 rule 2)', () => {
  it('with no factors at all, every principal scenario is not_evaluated:coa_factor_unfitted:<form> and carries no number', () => {
    const m = mod();
    for (const [s, form] of [['D', 'single'], ['2', 'single_suite'], ['H', 'multiplex'], ['S', 'multiplex']]) {
      const r = m.coaTier(row({ scenario: s }), {}, BOUNDS);
      expect(r.coa_status, s).toBe(`not_evaluated:coa_factor_unfitted:${form}`);
      expect(r.coa_form, s).toBe(form);
      expect(r.coa_factor).toBeNull();
      expect(r.coa_gfa_sqm).toBeNull();
      expect(r.coa_increment_sqm).toBeNull();
    }
  });

  it('a fitted form does not lend its factor to another form (single_suite stays unfitted)', () => {
    const r = mod().coaTier(row({ scenario: '2' }), factors(), BOUNDS);
    expect(r.coa_status).toBe('not_evaluated:coa_factor_unfitted:single_suite');
    expect(r.coa_gfa_sqm).toBeNull();
  });

  it('the reason is a member of the closed vocab list, and the status prefix is the Spec 68 written form', () => {
    expect(VOCAB.layer3.scenario_not_evaluated_reason).toContain(mod().UNFITTED_REASON);
    expect(mod().UNFITTED_REASON).toBe('coa_factor_unfitted');
  });
});

describe('P3-5: a fitted form (M-65 method, INV-23)', () => {
  it('coa_gfa_sqm = main_gfa_sqm x u; the increment is the difference; the factor object is carried whole', () => {
    const r = mod().coaTier(row({ mainGfaSqm: 200 }), factors(), BOUNDS);
    expect(r.coa_status).toBe('applies');
    expect(r.coa_form).toBe('single');
    expect(r.coa_gfa_sqm).toBeCloseTo(228, 9);
    expect(r.coa_increment_sqm).toBeCloseTo(28, 9);
    expect(r.coa_factor).toEqual(FIT);
  });

  it('a factor outside the declared bounds is a defect, not an answer (throws; the bounds come in, never a literal)', () => {
    const m = mod();
    expect(() => m.coaTier(row(), factors({ single: { ...FIT, value: 1.6 } }), BOUNDS)).toThrow(/bounds/);
    expect(() => m.coaTier(row(), factors({ single: { ...FIT, value: 0.9 } }), BOUNDS)).toThrow(/bounds/);
    expect(() => m.coaTier(row(), factors(), undefined)).toThrow(/bounds/);
  });

  it('a missing main_gfa_sqm on a fitted form is a missing input and throws (never defaulted)', () => {
    expect(() => mod().coaTier(row({ mainGfaSqm: null }), factors(), BOUNDS)).toThrow(/mainGfaSqm/);
  });

  it('INV-23: the result holds only coa_* and suite_coa_* fields (nothing an as-of-right field could read)', () => {
    const r = mod().coaTier(row(), factors(), BOUNDS);
    for (const k of Object.keys(r)) expect(k, k).toMatch(/^(coa_|suite_coa_)/);
    expect(Object.keys(r).sort()).toEqual([
      'coa_factor', 'coa_form', 'coa_gfa_sqm', 'coa_increment_sqm', 'coa_status',
      'suite_coa_gfa_sqm', 'suite_coa_increment_sqm', 'suite_coa_status',
    ]);
  });
});

describe('P3-5: renovations and the rear suite (LC-49, amended by Q-4)', () => {
  it('a renovation row has no form: coa_status = not_applicable:no_coa_form, every number NULL, even with factors', () => {
    for (const s of ['RA', 'RI', 'RB']) {
      const r = mod().coaTier(row({ scenario: s, hasSuite: true, suiteGfaSqm: 30 }), factors(), BOUNDS);
      expect(r.coa_status, s).toBe('not_applicable:no_coa_form');
      expect(r.coa_form).toBeNull();
      expect(r.coa_gfa_sqm).toBeNull();
      expect(r.coa_increment_sqm).toBeNull();
    }
  });

  it('a lot with no rear suite: suite_coa_status = not_applicable:no_suite, NULL numbers', () => {
    const r = mod().coaTier(row({ hasSuite: false }), factors(), BOUNDS);
    expect(r.suite_coa_status).toBe('not_applicable:no_suite');
    expect(r.suite_coa_gfa_sqm).toBeNull();
    expect(r.suite_coa_increment_sqm).toBeNull();
  });

  it('a rear suite with no suite cohort fitted is not_evaluated:coa_factor_unfitted:suite (never borrowed from single)', () => {
    const r = mod().coaTier(row({ hasSuite: true, suiteGfaSqm: 30 }), factors(), BOUNDS);
    expect(r.suite_coa_status).toBe('not_evaluated:coa_factor_unfitted:suite');
    expect(r.suite_coa_gfa_sqm).toBeNull();
    expect(r.coa_status).toBe('applies');
  });

  it('a calibrated suite factor gives suite_coa_gfa_sqm = suite_gfa_sqm x u_suite and its increment', () => {
    const r = mod().coaTier(row({ hasSuite: true, suiteGfaSqm: 30 }), factors({ suite: { lv_id: 'u_suite', value: 1.2, version: 'v', fit_basis: {} } }), BOUNDS);
    expect(r.suite_coa_status).toBe('applies');
    expect(r.suite_coa_gfa_sqm).toBeCloseTo(36, 9);
    expect(r.suite_coa_increment_sqm).toBeCloseTo(6, 9);
  });
});

describe('P3-5: the coa_not_evaluated counter (Spec 78 P5.11 counters; by reason)', () => {
  it('counts main and suite statuses by their closed reason, ignoring applies and not_applicable', () => {
    const m = mod();
    const rows = [
      m.coaTier(row({ scenario: 'D' }), {}, BOUNDS),
      m.coaTier(row({ scenario: '2', hasSuite: true, suiteGfaSqm: 30 }), {}, BOUNDS),
      m.coaTier(row({ scenario: 'RA' }), {}, BOUNDS),
      m.coaTier(row({ scenario: 'D' }), factors(), BOUNDS),
    ];
    expect(m.countCoaNotEvaluated(rows)).toEqual({ 'coa_factor_unfitted:single': 1, 'coa_factor_unfitted:single_suite': 1, 'coa_factor_unfitted:suite': 1 });
  });
});

describe('P3-5: purity (Spec 132 core.9)', () => {
  it('the module requires nothing and touches no fs, pg, env, clock or randomness', () => {
    const src = fs.readFileSync(path.join(ROOT, REL), 'utf8');
    expect(src).not.toMatch(/require\(/);
    expect(src).not.toMatch(/process\.env|Date\.now|new Date|Math\.random|\bfs\b|\bpg\b/);
  });
});
