// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68-2 / M-3xx (R-KI extended: the regression set only ratchets; every case removal names a RATIFIED or RULED ruling, M-343)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md section 3 (the regression set ratchet, G68-01 case_missing, G68-02 ruling lookup)
// Red first: the module is missing when this file is first run. Pure checks return string[] of `code` or `code:detail`.
// The only disk access is the temp directory built by each disk test (removed in afterAll).
import { describe, expect, it, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const M = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-regression.mjs'));

type Pending = { id: string; group: string; reason: string; owner_task: string; since: string };
type Removal = { ruling: string; group: string; ids: string[] };
type Group = {
  id: string;
  introduced_in: string;
  kind: string;
  producer: string;
  fast: boolean;
  external: boolean;
  split: boolean;
  ids_sha256: string;
  ids: string[];
};
type RegressionSet = { groups: Group[]; pending: Pending[]; removals: Removal[] };
type RemoveResult = { set: RegressionSet; violations: string[] };
type ReadText = (p: string) => string;

const RULINGS: Map<string, string> = new Map([
  ['M-322', 'RULED'],
  ['M-310', 'RATIFIED'],
  ['M-300', 'PROPOSED'],
]);

// ---- fixtures -------------------------------------------------------------

const group = (id: string, ids: string[], over: Partial<Group> = {}): Group => ({
  id,
  introduced_in: 'baseline',
  kind: 'bylaw',
  producer: 'coa',
  fast: true,
  external: false,
  split: false,
  ids_sha256: M.idsSha(ids),
  ids: [...ids],
  ...over,
});

const set = (over: Partial<RegressionSet> = {}): RegressionSet => ({
  groups: [group('g-a', ['a1', 'a2', 'a3']), group('g-b', ['b1', 'b2'])],
  pending: [],
  removals: [],
  ...over,
});

const pending = (id: string, grp: string): Pending => ({ id, group: grp, reason: 'flaky', owner_task: 'MB-68', since: '2026-11-01' });

const clone = (s: RegressionSet): RegressionSet => JSON.parse(JSON.stringify(s));

// nx: non-null helper for `noUncheckedIndexedAccess` index access in the tests below.
const nx = <T>(v: T | undefined): T => v as T;

// loadRegression reads through an injected reader; the disk itself is only touched by the temp-dir tests.
const fsReader = (p: string): string => fs.readFileSync(p, 'utf8');

// ---- idsSha ---------------------------------------------------------------

describe('idsSha: the group hash is over the exact id list', () => {
  it('is stable across calls and is 64 hex', () => {
    const a = M.idsSha(['a1', 'a2']);
    expect(a).toBe(M.idsSha(['a1', 'a2']));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is order sensitive: swapped ids hash differently', () => {
    expect(M.idsSha(['a1', 'a2'])).not.toBe(M.idsSha(['a2', 'a1']));
  });
  it('a dropped id hashes differently', () => {
    expect(M.idsSha(['a1', 'a2'])).not.toBe(M.idsSha(['a1']));
  });
});

// ---- checkRegression: internal checks -------------------------------------

describe('checkRegression: internal checks run even with no base', () => {
  it('a set whose hashes match its id lists is green', () => {
    expect(M.checkRegression(null, set(), RULINGS)).toEqual([]);
  });
  it('identical base and cur is green', () => {
    expect(M.checkRegression(set(), set(), RULINGS)).toEqual([]);
  });
  it('an id added in cur is green (the set only refuses to shrink)', () => {
    const cur = set({ groups: [group('g-a', ['a1', 'a2', 'a3', 'a4']), group('g-b', ['b1', 'b2'])] });
    expect(M.checkRegression(set(), cur, RULINGS)).toEqual([]);
  });
  it('a new group in cur is green', () => {
    const cur = set({ groups: [group('g-a', ['a1', 'a2', 'a3']), group('g-b', ['b1', 'b2']), group('g-c', ['c1'])] });
    expect(M.checkRegression(set(), cur, RULINGS)).toEqual([]);
  });
  it('ids edited by hand so the stored hash no longer matches is red', () => {
    const cur = clone(set());
    cur.groups[0]!.ids = ['a1', 'a2'];
    expect(M.checkRegression(null, cur, RULINGS)).toEqual(['ids_sha_mismatch:g-a']);
  });
  it('the same hand edit is green once the hash is recomputed', () => {
    const cur = clone(set());
    cur.groups[0]!.ids = ['a1', 'a2'];
    cur.groups[0]!.ids_sha256 = M.idsSha(cur.groups[0]!.ids);
    expect(M.checkRegression(null, cur, RULINGS)).toEqual([]);
  });
  it('a repeated id inside a group is red and names group and id', () => {
    const cur = clone(set());
    cur.groups[0]!.ids = ['a1', 'a2', 'a2', 'a3'];
    cur.groups[0]!.ids_sha256 = M.idsSha(cur.groups[0]!.ids);
    expect(M.checkRegression(null, cur, RULINGS)).toEqual(['duplicate_id:g-a|a2']);
  });
  it('the same list without the repeat is green', () => {
    const cur = clone(set());
    cur.groups[0]!.ids = ['a1', 'a2', 'a3'];
    expect(M.checkRegression(null, cur, RULINGS)).toEqual([]);
  });
});

// ---- checkRegression: pending --------------------------------------------

describe('checkRegression: a case is active or pending, never both', () => {
  it('a pending id that is not active is green', () => {
    const cur = set({ groups: [group('g-a', ['a1', 'a2'])], pending: [pending('a3', 'g-a')] });
    expect(M.checkRegression(null, cur, RULINGS)).toEqual([]);
  });
  it('a pending id still listed in its group is red', () => {
    const cur = set({ pending: [pending('a2', 'g-a')] });
    expect(M.checkRegression(null, cur, RULINGS)).toEqual(['case_both_active_and_pending:a2']);
  });
  it('the same id pending in another group is not both', () => {
    const cur = set({ pending: [pending('a2', 'g-b')] });
    expect(M.checkRegression(null, cur, RULINGS)).toEqual([]);
  });
  it('moving a base id to pending is a removal: red, and not both-active-and-pending', () => {
    const cur = set({ groups: [group('g-a', ['a1', 'a2']), group('g-b', ['b1', 'b2'])], pending: [pending('a3', 'g-a')] });
    const v = M.checkRegression(set(), cur, RULINGS);
    expect(v).toContain('regression_case_removed:g-a|a3');
    expect(v).toContain('regression_count_fell:g-a');
    expect(v).not.toContain('case_both_active_and_pending:a3');
  });
});

// ---- checkRegression: the ratchet against base ---------------------------

describe('checkRegression: the regression set never shrinks', () => {
  it('an id dropped from a group is red and names group and id', () => {
    const cur = set({ groups: [group('g-a', ['a1', 'a2']), group('g-b', ['b1', 'b2'])] });
    const v = M.checkRegression(set(), cur, RULINGS);
    expect(v).toEqual(['regression_count_fell:g-a', 'regression_case_removed:g-a|a3']);
  });
  it('the same set with the id kept is green', () => {
    expect(M.checkRegression(set(), set(), RULINGS)).toEqual([]);
  });
  it('a whole group dropped from cur is red', () => {
    const cur = set({ groups: [group('g-b', ['b1', 'b2'])] });
    const v = M.checkRegression(set(), cur, RULINGS);
    expect(v).toContain('regression_group_removed:g-a');
  });
  it('a set missing no group is green', () => {
    expect(M.checkRegression(set(), set({ groups: [group('g-a', ['a1', 'a2', 'a3']), group('g-b', ['b1', 'b2'])] }), RULINGS)).toEqual([]);
  });
  it('a count that falls is red even when the hash matches the shorter list', () => {
    const cur = set({ groups: [group('g-a', ['a1']), group('g-b', ['b1', 'b2'])] });
    const v = M.checkRegression(set(), cur, RULINGS);
    expect(v).toEqual(['regression_count_fell:g-a', 'regression_case_removed:g-a|a2', 'regression_case_removed:g-a|a3']);
  });
  it('a count that did not fall and a hash that matches is green', () => {
    const cur = set({ groups: [group('g-a', ['a1', 'a2', 'a3', 'a9']), group('g-b', ['b1', 'b2'])] });
    expect(M.checkRegression(set(), cur, RULINGS)).toEqual([]);
  });
});

// ---- checkRegression: removals are the only door --------------------------

describe('checkRegression: a removal is excused only by an authority ruling', () => {
  const curWithRemoval = (ruling: string): RegressionSet =>
    set({
      groups: [group('g-a', ['a1', 'a2']), group('g-b', ['b1', 'b2'])],
      removals: [{ ruling, group: 'g-a', ids: ['a3'] }],
    });

  it('a removal naming a RULED ruling excuses the dropped id and its count fall', () => {
    expect(M.checkRegression(set(), curWithRemoval('M-322'), RULINGS)).toEqual([]);
  });
  it('a removal naming a RATIFIED ruling is equally authority', () => {
    expect(M.checkRegression(set(), curWithRemoval('M-310'), RULINGS)).toEqual([]);
  });
  it('a removal naming a ruling that is absent from the register is red, and the ids stay removed', () => {
    const v = M.checkRegression(set(), curWithRemoval('RULED-FAKE-999'), RULINGS);
    expect(v).toContain('ruling_not_authority:RULED-FAKE-999');
    expect(v).toContain('regression_case_removed:g-a|a3');
    expect(v).toContain('regression_count_fell:g-a');
  });
  it('a removal naming a PROPOSED ruling is not authority', () => {
    const v = M.checkRegression(set(), curWithRemoval('M-300'), RULINGS);
    expect(v).toContain('ruling_not_authority:M-300');
    expect(v).toContain('regression_case_removed:g-a|a3');
  });
  it('a new removal that names ids which never fell leaves the set green', () => {
    const cur = set({ removals: [{ ruling: 'M-322', group: 'g-a', ids: ['zz-not-there'] }] });
    expect(M.checkRegression(set(), cur, RULINGS)).toEqual([]);
  });
  it('an excused removal does not license a second, unexcused drop: the count and the case both stay red', () => {
    const cur = set({
      groups: [group('g-a', ['a1']), group('g-b', ['b1', 'b2'])],
      removals: [{ ruling: 'M-322', group: 'g-a', ids: ['a3'] }],
    });
    const v = M.checkRegression(set(), cur, RULINGS);
    expect(v).toEqual(['regression_count_fell:g-a', 'regression_case_removed:g-a|a2']);
  });
  it('an excused removal naming two dropped ids keeps the count green', () => {
    const cur = set({
      groups: [group('g-a', ['a1']), group('g-b', ['b1', 'b2'])],
      removals: [{ ruling: 'M-322', group: 'g-a', ids: ['a2', 'a3'] }],
    });
    expect(M.checkRegression(set(), cur, RULINGS)).toEqual([]);
  });
  it('a removal recorded in base does not excuse a further drop in cur', () => {
    const base = set({
      groups: [group('g-a', ['a1', 'a2']), group('g-b', ['b1', 'b2'])],
      removals: [{ ruling: 'M-322', group: 'g-a', ids: ['a3'] }],
    });
    const cur = set({
      groups: [group('g-a', ['a1']), group('g-b', ['b1', 'b2'])],
      removals: [{ ruling: 'M-322', group: 'g-a', ids: ['a3'] }],
    });
    const v = M.checkRegression(base, cur, RULINGS);
    expect(v).toContain('regression_case_removed:g-a|a2');
    expect(v).not.toContain('regression_case_removed:g-a|a3');
  });
  it('a cur whose removals history is shorter than base is red', () => {
    const base = set({
      groups: [group('g-a', ['a1', 'a2']), group('g-b', ['b1', 'b2'])],
      removals: [{ ruling: 'M-322', group: 'g-a', ids: ['a3'] }],
    });
    const cur = set({ groups: [group('g-a', ['a1', 'a2']), group('g-b', ['b1', 'b2'])] });
    expect(M.checkRegression(base, cur, RULINGS)).toContain('removals_history_shortened');
  });
  it('a cur whose removals history equals base is green', () => {
    const base = set({ removals: [{ ruling: 'M-322', group: 'g-a', ids: ['a3'] }] });
    expect(M.checkRegression(base, clone(base), RULINGS)).toEqual([]);
  });
});

// ---- checkCasesPresent (G68-01) -------------------------------------------

describe('checkCasesPresent: every active id has its record case', () => {
  it('every active id recorded is green', () => {
    expect(M.checkCasesPresent(set(), ['a1', 'a2', 'a3', 'b1', 'b2'])).toEqual([]);
  });
  it('a missing case is red and names the id', () => {
    expect(M.checkCasesPresent(set(), ['a1', 'a2', 'a3', 'b1'])).toEqual(['case_missing:b2']);
  });
  it('several missing cases are all named', () => {
    expect(M.checkCasesPresent(set(), [])).toEqual([
      'case_missing:a1',
      'case_missing:a2',
      'case_missing:a3',
      'case_missing:b1',
      'case_missing:b2',
    ]);
  });
});

// ---- removeCases (the only door) ------------------------------------------

describe('removeCases: a removal needs an authority ruling and a known id', () => {
  it('an authority ruling removes the ids, recomputes the hash and appends the removal', () => {
    const base = set();
    const r: RemoveResult = M.removeCases(base, 'g-a', ['a3'], 'M-322', RULINGS);
    expect(r.violations).toEqual([]);
    expect(r.set.groups[0]!.ids).toEqual(['a1', 'a2']);
    expect(r.set.groups[0]!.ids_sha256).toBe(M.idsSha(['a1', 'a2']));
    expect(r.set.removals).toEqual([{ ruling: 'M-322', group: 'g-a', ids: ['a3'] }]);
    expect(M.checkRegression(base, r.set, RULINGS)).toEqual([]);
  });
  it('removeCases does not mutate its input', () => {
    const base = set();
    M.removeCases(base, 'g-a', ['a3'], 'M-322', RULINGS);
    expect(base).toEqual(set());
  });
  it('a ruling that is not authority is refused and returns the set unchanged', () => {
    const base = set();
    const r: RemoveResult = M.removeCases(base, 'g-a', ['a3'], 'RULED-FAKE-999', RULINGS);
    expect(r.violations).toEqual(['ruling_not_authority:RULED-FAKE-999']);
    expect(r.set).toEqual(base);
  });
  it('an id that is not in the group is refused by name', () => {
    const r: RemoveResult = M.removeCases(set(), 'g-a', ['nope'], 'M-322', RULINGS);
    expect(r.violations).toEqual(['remove_unknown_id:nope']);
    expect(r.set).toEqual(set());
  });
});

// ---- load / save round trip ----------------------------------------------

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-loop-regression-'));

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('loadRegression / saveRegression: the set is JSON on disk plus one ids file per group', () => {
  it('save then load round trips the set', () => {
    const original = set({ pending: [pending('b3', 'g-b')] });
    M.saveRegression(tmp, original);
    expect(M.loadRegression(tmp)).toEqual(original);
  });
  it('the ids file is a single-line JSON array with a trailing newline', () => {
    M.saveRegression(tmp, set());
    const text = fs.readFileSync(path.join(tmp, 'mcbylaws/loop/data/ids-g-a.json'), 'utf8');
    expect(text).toBe('["a1","a2","a3"]\n');
    expect(text.trim().split('\n')).toHaveLength(1);
  });
  it('the set file carries no ids array and ends in a newline', () => {
    M.saveRegression(tmp, set());
    const text = fs.readFileSync(path.join(tmp, 'mcbylaws/loop/regression-set.json'), 'utf8');
    const parsed: { groups: Array<Record<string, unknown>> } = JSON.parse(text);
    expect(text.endsWith('\n')).toBe(true);
    expect(parsed.groups[0]).not.toHaveProperty('ids');
  });
  it('a set file without pending or removals loads them as empty arrays', () => {
    const dir = path.join(tmp, 'sparse');
    M.saveRegression(dir, set());
    const file = path.join(dir, 'mcbylaws/loop/regression-set.json');
    const raw: Record<string, unknown> = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete raw.pending;
    delete raw.removals;
    fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
    const loaded: RegressionSet = M.loadRegression(dir);
    expect(loaded.pending).toEqual([]);
    expect(loaded.removals).toEqual([]);
  });
  it('a root with no set file is an error, not an empty set', () => {
    expect(() => M.loadRegression(path.join(tmp, 'no-such-root'))).toThrow(/data_missing/);
  });
  it('a missing ids file is an error naming the path', () => {
    const readText: ReadText = (p: string) => {
      if (p.endsWith('ids-g-b.json')) throw new Error('ENOENT');
      return fsReader(p);
    };
    let caught: unknown = null;
    try {
      M.loadRegression(tmp, readText);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = caught instanceof Error ? caught.message : '';
    expect(message).toMatch(/^data_missing: /);
    expect(message).toContain('ids-g-b.json');
  });
  it('loadRegression reads through the injected reader', () => {
    M.saveRegression(tmp, set());
    let calls = 0;
    const readText: ReadText = (p: string) => {
      calls += 1;
      return fsReader(p);
    };
    const loaded: RegressionSet = M.loadRegression(tmp, readText);
    expect(loaded.groups).toHaveLength(2);
    expect(calls).toBe(3);
  });
});
