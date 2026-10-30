// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 / G68-03, PR-68-8, PR-68-10 (a round's accept/revert carries findings from the register, an empty run and a green-canary are refused, the canary is run by the gate and never stored)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md sections 2, 5, 6 (decision record, run honesty, rounds since thresholds)
// Red first. Pure functions return string[] of violation codes (empty = green); a code with a detail is `code:detail`.
import { describe, expect, it } from 'vitest';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const M = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-decide.mjs'));

type Rulings = Map<string, string>;
type Finding = { case?: string; finding_id?: unknown; reason?: string };
type CaseEntry = { id: string; status: string };
type Rec = {
  decision?: string | undefined;
  reason?: string | undefined;
  cases?: CaseEntry[] | undefined;
  accepted_findings?: Finding[] | undefined;
};
type RunCase = { id: string; status: string; got_sha?: string | null };
type Canary = { id: string; observed: string };
type Run = {
  declaredIds: string[];
  cases: RunCase[];
  skipped?: number | undefined;
  canary?: Canary | null | undefined;
};
type CanaryCase = { id: string; expected: unknown; got: string };
type Compare = (expected: unknown, got: string) => string;
type LoopRecord = { decision: string; green: boolean };

const LONG = 'this reason is long enough';
const RULINGS: Rulings = new Map<string, string>([
  ['M-322', 'RATIFIED'],
  ['M-323', 'RULED'],
  ['M-400', 'DRAFT'],
]);

const rec = (over: Partial<Rec>): Rec => ({
  decision: 'accept',
  reason: LONG,
  cases: [{ id: 'c-1', status: 'pass' }],
  accepted_findings: [],
  ...over,
});

const run = (over: Partial<Run>): Run => ({
  declaredIds: ['c-1'],
  cases: [{ id: 'c-1', status: 'pass', got_sha: 'a1b2' }],
  skipped: 0,
  canary: { id: 'c-canary', observed: 'fail' },
  ...over,
});

describe('checkDecision: accept / revert and the findings it carries', () => {
  it('a plain accept with a 20+ character reason and no findings is green', () => {
    expect(M.checkDecision(rec({}), RULINGS)).toEqual([]);
  });
  it('a decision that is neither accept nor revert is refused', () => {
    expect(M.checkDecision(rec({ decision: 'maybe' }), RULINGS)).toContain('decision_missing');
    expect(M.checkDecision(rec({ decision: undefined }), RULINGS)).toContain('decision_missing');
  });
  it('an accept whose reason is shorter than 20 characters after trim is refused', () => {
    expect(M.checkDecision(rec({ reason: '  too short  ' }), RULINGS)).toContain('accept_without_reason');
    expect(M.checkDecision(rec({ reason: undefined }), RULINGS)).toContain('accept_without_reason');
  });
  it('a reason of exactly 20 characters after trim is accepted', () => {
    expect(M.checkDecision(rec({ reason: ` ${'x'.repeat(20)} ` }), RULINGS)).toEqual([]);
  });
  it('a revert needs no reason rule', () => {
    expect(M.checkDecision(rec({ decision: 'revert', reason: undefined }), RULINGS)).toEqual([]);
  });

  // The executed hole: finding_id "zzz" with reason "k" must be red.
  it('the executed hole: finding_id zzz with reason k is red on both counts', () => {
    const v = M.checkDecision(
      rec({ accepted_findings: [{ case: 'c-1', finding_id: 'zzz', reason: 'k' }] }),
      RULINGS,
    );
    expect(v).toContain('finding_reason_short:c-1');
    expect(v).toContain('finding_id_not_in_register:c-1');
  });
  it('finding_id M-322 with a 20+ character reason, the same finding under a real card id, is green', () => {
    const v = M.checkDecision(
      rec({ accepted_findings: [{ case: 'c-1', finding_id: 'M-322', reason: LONG }] }),
      RULINGS,
    );
    expect(v).toEqual([]);
  });
  it('a finding with no case is refused', () => {
    const v = M.checkDecision(
      rec({ accepted_findings: [{ finding_id: 'M-322', reason: LONG }] }),
      RULINGS,
    );
    expect(v).toContain('finding_case_missing');
  });
  it('an M-<digits> id whose rulings status is not authority is not a register row', () => {
    expect(
      M.checkDecision(rec({ accepted_findings: [{ case: 'c-1', finding_id: 'M-400', reason: LONG }] }), RULINGS),
    ).toContain('finding_id_not_in_register:c-1');
  });
  it('an M-<digits> id absent from the rulings is not in the register', () => {
    const v = M.checkDecision(
      rec({ accepted_findings: [{ case: 'c-1', finding_id: 'M-999', reason: LONG }] }),
      RULINGS,
    );
    expect(v).toContain('finding_id_not_in_register:c-1');
  });
  it('a card id that cardExists confirms is in the register', () => {
    const cardExists = (id: string): boolean => id === 'MB-77';
    const v = M.checkDecision(
      rec({ accepted_findings: [{ case: 'c-1', finding_id: 'MB-77', reason: LONG }] }),
      RULINGS,
      cardExists,
    );
    expect(v).toEqual([]);
  });
  it('a card id cardExists does not confirm is not in the register', () => {
    const cardExists = (id: string): boolean => id === 'MB-77';
    const v = M.checkDecision(
      rec({ accepted_findings: [{ case: 'c-1', finding_id: 'MB-78', reason: LONG }] }),
      RULINGS,
      cardExists,
    );
    expect(v).toContain('finding_id_not_in_register:c-1');
  });
  it('accepting with a failing case names the case', () => {
    const v = M.checkDecision(rec({ cases: [{ id: 'c-9', status: 'fail' }] }), RULINGS);
    expect(v).toContain('accept_with_failing_case:c-9');
  });
  it('accepting with only passing cases does not raise the failing-case code', () => {
    const v = M.checkDecision(rec({ cases: [{ id: 'c-9', status: 'pass' }] }), RULINGS);
    expect(v).toEqual([]);
  });
  it('an accepted case with no matching finding is refused', () => {
    const v = M.checkDecision(rec({ cases: [{ id: 'c-5', status: 'accepted' }] }), RULINGS);
    expect(v).toContain('accepted_case_without_finding:c-5');
  });
  it('an accepted case backed by a finding is green', () => {
    const v = M.checkDecision(
      rec({
        cases: [{ id: 'c-5', status: 'accepted' }],
        accepted_findings: [{ case: 'c-5', finding_id: 'M-323', reason: LONG }],
      }),
      RULINGS,
    );
    expect(v).toEqual([]);
  });

  // O68-12: an accepted finding must be bound to a case OF THIS RECORD.
  it('a finding whose case is not one of the record cases is finding_case_unknown (red)', () => {
    const v = M.checkDecision(
      rec({
        cases: [{ id: 'c-5', status: 'accepted' }],
        accepted_findings: [{ case: 'c-404', finding_id: 'M-323', reason: LONG }],
      }),
      RULINGS,
    );
    expect(v).toContain('finding_case_unknown:c-404');
    // the accepted case it was meant to cover is still unbacked
    expect(v).toContain('accepted_case_without_finding:c-5');
  });
  it('the green twin: a finding naming a record case raises no finding_case_unknown', () => {
    const v = M.checkDecision(
      rec({
        cases: [{ id: 'c-5', status: 'accepted' }],
        accepted_findings: [{ case: 'c-5', finding_id: 'M-323', reason: LONG }],
      }),
      RULINGS,
    );
    expect(v.filter((x: string) => x.startsWith('finding_case_unknown'))).toEqual([]);
  });
  it('a case-less finding raises finding_case_missing and a dangling-colon-free id line, never finding_case_unknown', () => {
    const v = M.checkDecision(
      rec({ accepted_findings: [{ finding_id: 'zzz', reason: LONG }] }),
      RULINGS,
    );
    expect(v).toContain('finding_case_missing');
    expect(v).toContain('finding_id_not_in_register');
    expect(v).not.toContain('finding_id_not_in_register:');
    expect(v.filter((x: string) => x.startsWith('finding_case_unknown'))).toEqual([]);
  });
});

describe('checkRun: no empty runs, no skips, no green-looking canary', () => {
  it('a declared, fully computed, unskipped run with a red canary is green', () => {
    expect(M.checkRun(run({}))).toEqual([]);
  });
  it('a run that declares nothing is refused', () => {
    expect(M.checkRun(run({ declaredIds: [], cases: [], canary: { id: 'c-canary', observed: 'fail' } }))).toContain(
      'empty_set',
    );
  });
  it('running fewer cases than declared names the missing count', () => {
    const v = M.checkRun(run({ declaredIds: ['c-1', 'c-2'], cases: [{ id: 'c-1', status: 'pass', got_sha: 'a' }] }));
    expect(v).toContain('ran_fewer_than_declared:1');
  });
  it('running every declared case raises neither the count code nor case_missing', () => {
    const v = M.checkRun(
      run({
        declaredIds: ['c-1', 'c-2'],
        cases: [
          { id: 'c-1', status: 'pass', got_sha: 'a' },
          { id: 'c-2', status: 'fail', got_sha: 'b' },
        ],
      }),
    );
    expect(v).toEqual([]);
  });
  it('a declared id with no case raises neither the count code nor case_missing for the ids that did run', () => {
    const v = M.checkRun(
      run({
        declaredIds: ['c-1', 'c-2'],
        cases: [
          { id: 'c-1', status: 'pass', got_sha: 'a' },
          { id: 'c-2', status: 'pass', got_sha: 'b' },
        ],
      }),
    );
    expect(v).not.toContain('case_missing:c-1');
  });
  it('case_missing names the id that has no case', () => {
    const v = M.checkRun(
      run({
        declaredIds: ['c-1', 'c-2'],
        cases: [
          { id: 'c-1', status: 'pass', got_sha: 'a' },
          { id: 'c-x', status: 'pass', got_sha: 'b' },
        ],
      }),
    );
    expect(v).toContain('case_missing:c-2');
  });
  it('a skipped count is refused', () => {
    expect(M.checkRun(run({ skipped: 2 }))).toContain('cases_skipped:2');
  });
  it('a case whose status is skipped counts toward the skip code', () => {
    const v = M.checkRun(run({ cases: [{ id: 'c-1', status: 'skipped' }] }));
    expect(v.some((c: string) => c.startsWith('cases_skipped:'))).toBe(true);
  });
  it('no skips raises no skip code', () => {
    expect(M.checkRun(run({ skipped: 0 }))).not.toContain('cases_skipped:0');
  });
  it('a canary that stayed green is refused', () => {
    expect(M.checkRun(run({ canary: { id: 'c-canary', observed: 'pass' } }))).toContain('canary_not_red');
  });
  it('a missing canary is refused', () => {
    expect(M.checkRun(run({ canary: null }))).toContain('canary_not_red');
    expect(M.checkRun(run({ canary: undefined }))).toContain('canary_not_red');
  });
  it('a case that is not pending without a computed value is named', () => {
    const v = M.checkRun(run({ cases: [{ id: 'c-1', status: 'pass' }] }));
    expect(v).toContain('case_without_computed_value:c-1');
  });
  it('a pending case needs no computed value', () => {
    const v = M.checkRun(run({ cases: [{ id: 'c-1', status: 'pending' }] }));
    expect(v).toEqual([]);
  });
});

describe('mutateExpected: one mutation per value type', () => {
  it('a number is incremented', () => {
    expect(M.mutateExpected(2)).toBe(3);
  });
  it('a string gains a tilde', () => {
    expect(M.mutateExpected('abc')).toBe('abc~');
  });
  it('a boolean is flipped', () => {
    expect(M.mutateExpected(true)).toBe(false);
    expect(M.mutateExpected(false)).toBe(true);
  });
  it('null and undefined become the canary marker', () => {
    expect(M.mutateExpected(null)).toBe('canary');
    expect(M.mutateExpected(undefined)).toBe('canary');
  });
  it('an array is copied with element 0 mutated', () => {
    const src: unknown[] = [1, 2];
    const out = M.mutateExpected(src);
    expect(out).toEqual([2, 2]);
    expect(src).toEqual([1, 2]);
  });
  it('an empty array becomes the canary array', () => {
    expect(M.mutateExpected([])).toEqual(['canary']);
  });
  it('an object is copied with its first key (sorted) mutated', () => {
    const src: Record<string, unknown> = { b: 2, a: 1 };
    const out = M.mutateExpected(src);
    expect(out).toEqual({ a: 2, b: 2 });
    expect(src).toEqual({ b: 2, a: 1 });
  });
  it('an empty object becomes the canary marker, so the canary never compares it to itself unchanged (O68-20)', () => {
    const src: Record<string, unknown> = {};
    expect(M.mutateExpected(src)).toEqual({ __canary__: true });
    expect(src).toEqual({});
  });
});

describe('runCanary: the gate runs it, it is never stored', () => {
  const strict: Compare = (expected, got) => (expected === got ? 'pass' : 'fail');
  it('a passing case whose expected value was mutated observes fail', () => {
    const cases: CanaryCase[] = [{ id: 'c-1', expected: 'abc', got: 'abc' }];
    expect(M.runCanary(cases, strict)).toEqual({ id: 'c-1', observed: 'fail' });
  });
  it('a compare that ignores its expected value leaves the canary green', () => {
    const lax: Compare = (_expected, got) => (got === 'abc' ? 'pass' : 'fail');
    const cases: CanaryCase[] = [{ id: 'c-1', expected: 'abc', got: 'abc' }];
    expect(M.runCanary(cases, lax)).toEqual({ id: 'c-1', observed: 'pass' });
  });
  it('the first passing case is the one used', () => {
    const cases: CanaryCase[] = [
      { id: 'c-0', expected: 'x', got: 'nope' },
      { id: 'c-1', expected: 'abc', got: 'abc' },
      { id: 'c-2', expected: 'def', got: 'def' },
    ];
    expect(M.runCanary(cases, strict)).toEqual({ id: 'c-1', observed: 'fail' });
  });
  it('no passing case observes none', () => {
    const cases: CanaryCase[] = [{ id: 'c-1', expected: 'abc', got: 'zzz' }];
    expect(M.runCanary(cases, strict)).toEqual({ id: null, observed: 'none' });
  });
  it('an empty case list observes none', () => {
    expect(M.runCanary([], strict)).toEqual({ id: null, observed: 'none' });
  });
  // O68-20: the canary picks the first case whose mutated value DIFFERS from the original (by the run's own canon compare),
  // not merely the first case that passes: a case whose expected value cannot be mutated would always read green.
  it('the first case whose expected value {} still mutates gives observed fail (O68-20)', () => {
    const can: Compare = (expected, got) => (JSON.stringify(expected) === got ? 'pass' : 'fail');
    const cases: CanaryCase[] = [{ id: 'c-0', expected: {}, got: '{}' }];
    expect(M.runCanary(cases, can)).toEqual({ id: 'c-0', observed: 'fail' });
    expect(M.runCanary(cases, strict)).toEqual({ id: null, observed: 'none' });
  });
  it('a first case that passes but cannot be mutated is skipped for the next one that can (O68-20)', () => {
    const can: Compare = (expected, got) => (JSON.stringify(expected) === got ? 'pass' : 'fail');
    const mk = (s: string): unknown => JSON.parse(s);
    const cases: CanaryCase[] = [
      { id: 'c-0', expected: mk('{"a":{"b":{}}}'), got: '{"a":{"b":{}}}' }, // passes, but canon({a:{b:{}}}) can still differ: mutated differs
      { id: 'c-1', expected: mk('{"a":1}'), got: '{"a":1}' },
    ];
    const out = M.runCanary(cases, can);
    expect(out.observed).toBe('fail');
    expect(['c-0', 'c-1']).toContain(out.id);
  });
  it('a compare whose canon ignores the mutation skips to a case it does catch, and all-ignoring observes pass (O68-20)', () => {
    // canon drops the `__canary__` key and the trailing tilde: the first case's mutation is invisible, the second is not
    const partial: Compare = (expected, got) => {
      const seen = JSON.parse(got);
      const strip = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(strip);
        if (v !== null && typeof v === 'object') {
          const o: Record<string, unknown> = {};
          for (const k of Object.keys(v as Record<string, unknown>).sort()) if (k !== '__canary__') o[k] = strip((v as Record<string, unknown>)[k]);
          return o;
        }
        return typeof v === 'string' ? v.replace(/~$/, '') : v;
      };
      return JSON.stringify(strip(expected)) === JSON.stringify(seen) ? 'pass' : 'fail';
    };
    const cases: CanaryCase[] = [
      { id: 'c-0', expected: {}, got: '{}' },
      { id: 'c-1', expected: 41, got: '41' },
    ];
    expect(M.runCanary(cases, partial)).toEqual({ id: 'c-1', observed: 'fail' });
    const blind: Compare = () => 'pass';
    expect(M.runCanary(cases, blind)).toEqual({ id: 'c-0', observed: 'pass' }); // no mutation is caught: the canary stays green, so the gate is red
  });
});

describe('roundsSinceThresholds: records after the last accept + green', () => {
  it('counts nothing when the last record is an accept that is green', () => {
    const records: LoopRecord[] = [
      { decision: 'revert', green: false },
      { decision: 'accept', green: true },
    ];
    expect(M.roundsSinceThresholds(records)).toBe(0);
  });
  it('a revert in the middle does not reset the count, accepts before it stay behind', () => {
    const records: LoopRecord[] = [
      { decision: 'accept', green: true },
      { decision: 'revert', green: false },
      { decision: 'accept', green: false },
    ];
    expect(M.roundsSinceThresholds(records)).toBe(2);
  });
  it('counts every record when there is no accept + green', () => {
    const records: LoopRecord[] = [
      { decision: 'accept', green: false },
      { decision: 'revert', green: false },
    ];
    expect(M.roundsSinceThresholds(records)).toBe(2);
  });
  it('an empty history counts nothing', () => {
    expect(M.roundsSinceThresholds([])).toBe(0);
  });
});
