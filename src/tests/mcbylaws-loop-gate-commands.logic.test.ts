// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68-1 (a loop record is written only by this tool), PR-68-8 (the canary is never stored), M-343 (a removal needs a RATIFIED or RULED ruling)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md sections 2, 3, 8 (run --write / --write-ids, verify --json, regression-remove: the three commands of the loop gate)
//
// Every fixture is a throw-away git repo in a temp dir; every command takes its `deps` injected so no scorer is spawned and no real git is read
// unless the test says so. Every red case has a green twin.
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');
const M = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate-run.mjs'));
const R = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-record.mjs'));
const REG = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-regression.mjs'));
const F = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-floors.mjs'));

type CaseOut = { group: string; id: string; status: string; value: unknown; reason: unknown; clause: unknown; got_sha: string };
type RunOut = {
  ranGroups?: string[] | undefined;
  cases: CaseOut[];
  skipped: number;
  canary: { id: string | null; observed: string };
  report: { violations: string[]; owed: unknown[] };
  counts: { [k: string]: number };
  baseRows: unknown;
  curRows: { group: string; id: string; status: string; clause: unknown }[];
  regenMismatch: string[];
  inputsFresh?: Record<string, string>;
  groups: { id: string; introduced_in?: string | undefined }[];
  floorsOk: boolean;
};
type Parsed = {
  command: string;
  mode: string;
  root: string;
  json: boolean;
  write: boolean;
  writeIds: boolean;
  ruling: string;
  owedRuling: string;
  group: string;
  ids: string;
  increment: string;
  decision: string;
  reason: string;
  base: string;
  findings: string;
  target: string;
  error: string;
};
type Deps = {
  git?: (args: string[]) => string;
  computeRun?: (args: { root: string; regression: unknown; mode: string; registerText: string }) => RunOut | null;
  now?: () => string;
  rulings?: Map<string, string>;
  blobIdsAt?: (root: string, rev: string, paths: string[]) => Record<string, string>;
  readAt?: (root: string, rev: string, filePath: string) => string | null;
  write?: (line: string) => void;
};type Verdict = { violations: string[]; notes?: string[]; report?: unknown; error?: string };
type RunCommand = (parsed: Parsed, write: (line: string) => void, deps?: Deps) => Verdict | Promise<Verdict>;
type VerifyCommand = (parsed: Parsed, write: (line: string) => void, deps?: Deps) => Verdict | Promise<Verdict>;
type RemoveCommand = (parsed: Parsed, write: (line: string) => void, deps?: Deps) => Verdict | Promise<Verdict>;
type VerifyEntry = {
  record: string;
  increment: string;
  round: number | null;
  decision: string;
  bound_ok: boolean;
  increment_green: boolean | null;
  canary_ok: boolean | null;
  red_twins_ok: boolean | null;
  rounds_since_thresholds: number | null;
  cases: { id: string; status: string; record_says: string | null; artifact: string | null }[];
};

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-loop-gate-commands-'));
afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

const cleanEnv = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
const gitRun = (root: string, args: string[]): string =>
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] });

const writeFileAt = (root: string, rel: string, text: string): void => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const readJsonAt = (root: string, rel: string): unknown => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

const GROUP = 'g1';
const IDS_REL = `mcbylaws/loop/data/ids-${GROUP}.json`;
const SET_REL = 'mcbylaws/loop/regression-set.json';

// O68-07: every id is group-qualified, `<group>|<notice>|<n>`.
const qid = (id: string): string => `${GROUP}|${id}`;
// a raw list read back from disk, typed as the id list it is
const idsOf = (value: unknown): string[] => value as string[];

// A throw-away repo: one classified code file (layer23), one ids file and the regression set holding those ids, committed.
function makeRepo(name: string): string {
  const root = fs.mkdtempSync(path.join(TMP, `${name}-`));
  gitRun(root, ['init', '-q', '-b', 'main']);
  gitRun(root, ['config', 'user.email', 'gate@example.test']);
  gitRun(root, ['config', 'user.name', 'loop gate test']);
  writeFileAt(root, 'scripts/analysis/bylaw/evaluator.mjs', 'export const one = 1;\n');
  writeFileAt(root, IDS_REL, JSON.stringify([qid('A0001|1')]) + '\n');
  writeFileAt(root, SET_REL, JSON.stringify({ schema: 'regression-v1', groups: [{ id: GROUP, introduced_in: '1', external: true }], pending: [], removals: [] }, null, 2) + '\n');
  gitRun(root, ['add', '-A']);
  gitRun(root, ['commit', '-q', '-m', 'fixture']);
  return root;
}

const parsedFor = (root: string, over: Partial<Parsed> = {}): Parsed => ({
  command: 'run', mode: '', root, json: false, write: false, writeIds: false, ruling: '', owedRuling: '', group: '', ids: '',
  increment: '', decision: '', reason: '', base: '', findings: '', target: '', error: '', ...over,
});

const scorerCase = (id: string, status: string, got_sha: string): CaseOut => ({ group: GROUP, id, status, value: null, reason: null, clause: null, got_sha });

// A small run of three cases of group g1 with a red canary: MATCH (pass), DIFFER (fail), NO ANSWER (fail).
function fakeRun(over: Partial<RunOut> = {}): RunOut {
  return {
    cases: [
      scorerCase(qid('A0001|1'), 'MATCH', 'a'.repeat(64)),
      scorerCase(qid('A0002|1'), 'DIFFER', 'b'.repeat(64)),
      scorerCase(qid('A0003|1'), 'NO ANSWER', 'c'.repeat(64)),
    ],
    skipped: 0,
    canary: { id: qid('A0001|1'), observed: 'fail' },
    report: { violations: [], owed: [] },
    counts: { [`${GROUP} cases`]: 3 },
    baseRows: null,
    curRows: [],
    regenMismatch: [],
    groups: [{ id: GROUP, introduced_in: '1' }],
    // the shape computeRun really returns: a run is floors-ok exactly when its report holds no violation
    floorsOk: true,
    ...over,
    // derived, never set on its own: floorsOk follows report.violations, in the fixture as in computeRun
    ...(over.report ? { floorsOk: (over.report.violations ?? []).length === 0 } : {}),
  };
}

const fakeComputeRun = (run: RunOut | null) => (): RunOut | null => run;

// The `git ls-files` reader the command uses by default: a real git call, scrubbed of GIT_*.
const realGit = (root: string) => (args: string[]): string => gitRun(root, args);

const lines: string[] = [];
const capture = (): ((line: string) => void) => (line: string) => {
  lines.push(line);
};
const resetLines = (): void => {
  lines.length = 0;
};

const runCmd = M.runCommand as RunCommand;
const verifyCmd = M.verifyCommand as VerifyCommand;
const removeCmd = M.removeCommand as RemoveCommand;
const floorsWriteCmd = (): ((parsed: Parsed, write: (line: string) => void, deps?: Deps) => Verdict | Promise<Verdict>) => {
  const fn = (M as unknown as { floorsWriteCommand?: (parsed: Parsed, write: (line: string) => void, deps?: Deps) => Verdict | Promise<Verdict> }).floorsWriteCommand;
  expect(typeof fn).toBe('function');
  if (typeof fn !== 'function') throw new Error('floorsWriteCommand is not exported');
  return fn;
};

describe('runCommand --write-ids: the ids are written by the tool, never typed (PR-68-1)', () => {
  it('rewrites the ids file and ids_sha256 from the run case ids (group-qualified), and prints the change', async () => {
    const root = makeRepo('write-ids');
    resetLines();
    const before = readJsonAt(root, IDS_REL) as string[];
    expect(before).toEqual([qid('A0001|1')]);
    const res = await runCmd(parsedFor(root, { writeIds: true }), capture(), { computeRun: fakeComputeRun(fakeRun()) });
    expect(res.violations).toEqual([]);
    const ids = readJsonAt(root, IDS_REL) as string[];
    expect(ids).toEqual([qid('A0001|1'), qid('A0002|1'), qid('A0003|1')]);
    expect(ids.every((id) => id.startsWith(`${GROUP}|`))).toBe(true);
    const set = readJsonAt(root, SET_REL) as { groups: { id: string; ids_sha256?: string }[] };
    expect(set.groups[0]?.ids_sha256).toBe(REG.idsSha(ids));
    expect(set.groups.every((g) => !('ids' in g))).toBe(true);
    expect(lines.join('\n')).toContain(IDS_REL);
    // no record is written by --write-ids
    expect(fs.existsSync(path.join(root, 'docs/reports/loop-records'))).toBe(false);
  });

  it('a run whose ids match the saved ones changes nothing and says so', async () => {
    const root = makeRepo('write-ids-same');
    resetLines();
    const run = fakeRun({ cases: [scorerCase(qid('A0001|1'), 'MATCH', 'a'.repeat(64))] });
    const res = await runCmd(parsedFor(root, { writeIds: true }), capture(), { computeRun: fakeComputeRun(run) });
    expect(res.violations).toEqual([]);
    expect(readJsonAt(root, IDS_REL)).toEqual([qid('A0001|1')]);
    expect(lines.join('\n')).toMatch(/unchanged/);
  });

  it('two groups whose cases share notice|n write two different, group-qualified ids (O68-07)', async () => {
    const root = makeRepo('write-ids-groups');
    resetLines();
    writeFileAt(root, 'mcbylaws/loop/data/ids-g2.json', JSON.stringify(['g2|A0001|1']) + '\n');
    writeFileAt(root, SET_REL, JSON.stringify({ schema: 'regression-v1', groups: [{ id: GROUP, introduced_in: '1', external: true }, { id: 'g2', introduced_in: '1', external: true }], pending: [], removals: [] }, null, 2) + '\n');
    // both groups score the same notice|n, so their ids differ only by the group prefix
    const shared = scorerCase(qid('A0001|1'), 'MATCH', 'a'.repeat(64));
    const twice = fakeRun({
      cases: [shared, { ...shared, group: 'g2', id: 'g2|A0001|1' }],
      groups: [{ id: GROUP, introduced_in: '1' }, { id: 'g2', introduced_in: '1' }],
    });
    const res = await runCmd(parsedFor(root, { writeIds: true }), capture(), { computeRun: fakeComputeRun(twice) });
    expect(res.violations).toEqual([]);
    const one = readJsonAt(root, IDS_REL) as string[];
    const two = readJsonAt(root, 'mcbylaws/loop/data/ids-g2.json') as string[];
    expect(one).toEqual([qid('A0001|1')]);
    expect(two).toEqual(['g2|A0001|1']);
    expect(one[0]).not.toBe(two[0]);
  });
});

describe('runCommand --write: the record is written by this tool (PR-68-1)', () => {
  it('writes docs/reports/loop-records/<inc>/round-01.json, a second call round-02.json', async () => {
    const root = makeRepo('write-record');
    resetLines();
    const deps: Deps = { computeRun: fakeComputeRun(fakeRun()), git: realGit(root) };
    const first = await runCmd(parsedFor(root, { write: true, increment: '1', decision: 'revert', reason: 'round one: two cases still differ from the City' }), capture(), deps);
    expect(first.violations).toEqual([]);
    const one = 'docs/reports/loop-records/1/round-01.json';
    expect(fs.existsSync(path.join(root, one))).toBe(true);
    expect(lines.join('\n')).toContain(one);
    const second = await runCmd(parsedFor(root, { write: true, increment: '1', decision: 'revert', reason: 'round two: still two cases differ from the City' }), capture(), deps);
    expect(second.violations).toEqual([]);
    const two = 'docs/reports/loop-records/1/round-02.json';
    expect(fs.existsSync(path.join(root, two))).toBe(true);
    expect((readJsonAt(root, two) as { round: number }).round).toBe(2);
    // the first round is untouched (records are add-only)
    expect((readJsonAt(root, one) as { round: number }).round).toBe(1);
  });

  it('the file passes checkRecordShape, stores no derived value, and binds the classified files', async () => {
    const root = makeRepo('write-shape');
    resetLines();
    const res = await runCmd(parsedFor(root, { write: true, increment: '1', decision: 'revert', reason: 'round one: two cases still differ from the City' }), capture(), {
      computeRun: fakeComputeRun(fakeRun()),
      git: realGit(root),
    });
    expect(res.violations).toEqual([]);
    const rel = 'docs/reports/loop-records/1/round-01.json';
    const rec = readJsonAt(root, rel) as { schema: string; inputs: Record<string, string>; cases: { id: string; status: string; got_sha: string }[]; accepted_findings: unknown[] };
    expect(R.checkRecordShape(rec)).toEqual([]);
    expect(rec.schema).toBe('loop-record-v1');
    // no derived field leaks into the record (the canary is never stored, PR-68-8)
    for (const key of R.TRIMMED_FIELDS) expect(Object.keys(rec)).not.toContain(key);
    expect(JSON.stringify(rec)).not.toContain('canary');
    // the classified layer23 file is bound by its index blob id; an unclassified file is not
    expect(rec.inputs['scripts/analysis/bylaw/evaluator.mjs']).toBe(gitRun(root, ['rev-parse', ':scripts/analysis/bylaw/evaluator.mjs']).trim());
    expect(Object.keys(rec.inputs)).not.toContain(SET_REL);
    expect(rec.cases.map((c) => c.id)).toEqual([qid('A0001|1'), qid('A0002|1'), qid('A0003|1')]);
    // the binding is checkBound-green on the tree it was written on
    expect(rec.accepted_findings).toEqual([]);
  });

  it('maps the scorer class to the record status, and only a FAILING case named in an accepted finding is accepted', async () => {
    const root = makeRepo('write-status');
    resetLines();
    // the ids file of the fixture group holds exactly the ten cases this run scores, so the run covers the set it records
    const classes = ['MATCH', 'ANSWERED', 'BY-LAW CHANGED', 'NOT SCORABLE', 'DATA', 'DIFFER', 'NO ANSWER', 'NOT MODELLED', 'OWED', 'SOMETHING ELSE'];
    const cases = classes.map((c, i) => scorerCase(qid(`A000${i + 1}|1`), c, String(i).repeat(64)));
    writeFileAt(root, IDS_REL, JSON.stringify(cases.map((c) => c.id)) + '\n');
    const findings = path.join(TMP, 'findings-status.json');
    // a finding on the SECOND case (ANSWERED, a pass) and one on the sixth (DIFFER, a fail): only the failing one is excused
    fs.writeFileSync(findings, JSON.stringify([
      { case: qid('A0002|1'), finding_id: 'M-330', reason: 'a finding on a passing case leaves the case as it passes' },
      { case: qid('A0006|1'), finding_id: 'M-322', reason: 'the City figure is a typo in the parcel file, verified against the by-law copy' },
    ]));
    const run = fakeRun({ cases, report: { violations: ['floor_fell:article 10.20.40.40 accuracy 50 < 100'], owed: [] } });
    const res = await runCmd(parsedFor(root, { write: true, increment: '1', decision: 'revert', reason: 'round one: the statuses are mapped', findings }), capture(), {
      computeRun: fakeComputeRun(run),
      git: realGit(root),
    });
    expect(res.violations).toEqual([]);
    const rec = readJsonAt(root, 'docs/reports/loop-records/1/round-01.json') as { cases: { id: string; status: string }[]; accepted_findings: unknown[] };
    // A0002|1 (ANSWERED, pass) stays pass although a finding names it; A0006|1 (DIFFER, fail) becomes accepted;
    // SOMETHING ELSE is outside the vocabulary and stays pending
    expect(rec.cases.map((c) => c.status)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass', 'accepted', 'fail', 'fail', 'fail', 'pending']);
    // the run's own object is not mutated by the record: it still carries the printed class
    expect(run.cases.map((c) => c.status)).toEqual(classes);
    // every recorded status is one of the four of the vocabulary, never a printed class
    expect(rec.cases.every((c) => ['pass', 'fail', 'accepted', 'pending'].includes(c.status))).toBe(true);
    expect(rec.cases[0]?.id).toBe(qid('A0001|1'));
    expect(rec.accepted_findings).toHaveLength(2);
  });

  it('missing --increment / --decision / --reason refuses and writes nothing', async () => {
    const root = makeRepo('write-missing');
    resetLines();
    for (const over of [{ decision: 'revert', reason: 'a reason long enough to pass' }, { increment: '1', reason: 'a reason long enough to pass' }, { increment: '1', decision: 'revert' }]) {
      const res = await runCmd(parsedFor(root, { write: true, ...over }), capture(), { computeRun: fakeComputeRun(fakeRun()), git: realGit(root) });
      expect(res.violations).toEqual(['run_needs_increment_decision_reason']);
    }
    expect(fs.existsSync(path.join(root, 'docs/reports/loop-records'))).toBe(false);
  });

  it('refuses a run that does not cover all groups', async () => {
    const root = makeRepo('run-refuse');
    resetLines();
    for (const run of [null, fakeRun({ groups: [{ id: GROUP, introduced_in: '1' }, { id: 'g2', introduced_in: '2' }] })]) {
      const res = await runCmd(parsedFor(root, { write: true, increment: '1', decision: 'revert', reason: 'a reason long enough to pass' }), capture(), {
        computeRun: fakeComputeRun(run),
        git: realGit(root),
      });
      expect(res.violations).toEqual(['run_needs_mode_push_or_full']);
    }
  });

  it('the record binds the input blobs of the index, so checkBound reads them green on the tree it was written on', async () => {
    const root = makeRepo('write-rerun');
    resetLines();
    const res = await runCmd(parsedFor(root, { write: true, increment: '1', decision: 'revert', reason: 'round one: two cases still differ from the City' }), capture(), {
      computeRun: fakeComputeRun(fakeRun()),
      git: realGit(root),
    });
    expect(res.violations).toEqual([]);
    const rec = readJsonAt(root, 'docs/reports/loop-records/1/round-01.json') as { inputs: Record<string, string> };
    const paths = Object.keys(rec.inputs);
    expect(paths.length).toBeGreaterThan(0);
    const blobs: Record<string, string> = {};
    for (const p of paths) blobs[p] = gitRun(root, ['rev-parse', `:${p}`]).trim();
    expect(R.checkBound({ inputs: rec.inputs, treeBlobs: blobs })).toEqual([]);
  });

  it('without --write or --write-ids: a dry run that prints the case counts and returns no violations', async () => {
    const root = makeRepo('run-dry');
    resetLines();
    const res = await runCmd(parsedFor(root, {}), capture(), { computeRun: fakeComputeRun(fakeRun()), git: realGit(root) });
    expect(res.violations).toEqual([]);
    expect(lines.join('\n')).toContain('3');
    expect(fs.existsSync(path.join(root, 'docs/reports/loop-records'))).toBe(false);
  });
});

describe('verifyCommand: derived values are computed here, never read from the record', () => {
  const writeRecord = (root: string, rel: string, rec: Record<string, unknown>): void => {
    writeFileAt(root, rel, JSON.stringify(R.bindRecord(rec), null, 2) + '\n');
  };

  it('prints one parseable JSON document with the named keys, a bound flag, the artifact of each case and the rounds since thresholds', async () => {
    const root = makeRepo('verify');
    resetLines();
    const boundFile = 'scripts/analysis/bylaw/evaluator.mjs';
    const blob = gitRun(root, ['rev-parse', `:${boundFile}`]).trim();
    writeRecord(root, 'docs/reports/loop-records/1/round-01.json', {
      schema: 'loop-record-v1', increment: '1', round: 1, decision: 'accept', reason: 'the increment is green: every case of the group passes',
      accepted_findings: [], cases: [{ id: qid('A0001|1'), status: 'pass', got_sha: 'a'.repeat(64) }], inputs: { [boundFile]: blob },
    });
    const res = await verifyCmd(parsedFor(root, { command: 'verify', json: true }), capture(), { computeRun: fakeComputeRun(fakeRun({ cases: [scorerCase(qid('A0001|1'), 'MATCH', 'a'.repeat(64))] })) });
    expect(res.violations).toEqual([]);
    expect(lines).toHaveLength(1);
    const out = JSON.parse(lines[0] ?? '') as VerifyEntry[];
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(1);
    const entry = out[0];
    expect(entry?.record).toBe('docs/reports/loop-records/1/round-01.json');
    expect(entry?.increment).toBe('1');
    expect(entry?.decision).toBe('accept');
    expect(entry?.bound_ok).toBe(true);
    expect(entry?.increment_green).toBe(true);
    expect(entry?.canary_ok).toBe(true);
    expect(entry?.red_twins_ok).toBe(true);
    expect(entry?.rounds_since_thresholds).toBe(0);
    // O68-10: the fresh run says pass and the record says pass, so there is no record_says beside the status
    expect(entry?.cases).toEqual([{ id: qid('A0001|1'), status: 'pass', record_says: null, artifact: IDS_REL }]);
  });

  it('a record whose bound file changed on disk reads bound_ok: false (the blob from the index no longer matches)', async () => {
    const root = makeRepo('verify-stale');
    resetLines();
    writeRecord(root, 'docs/reports/loop-records/1/round-01.json', {
      schema: 'loop-record-v1', increment: '1', round: 1, decision: 'revert', reason: 'round one: two cases still differ from the City',
      inputs: { 'scripts/analysis/bylaw/evaluator.mjs': 'f'.repeat(40) },
    });
    await verifyCmd(parsedFor(root, { command: 'verify', json: true }), capture(), { computeRun: fakeComputeRun(fakeRun()) });
    const out = JSON.parse(lines[0] ?? '') as VerifyEntry[];
    expect(out[0]?.bound_ok).toBe(false);
  });

  it('an accept record after other rounds reports rounds_since_thresholds > 0, and only the latest record of each increment', async () => {
    const root = makeRepo('verify-rounds');
    resetLines();
    // an accept is an increment whose cases are all green (pass / accepted): the record of round 1 of increment 1 accepted the group;
    // the round 2 of increment 2 has not reached a threshold since, so two rounds follow the last green accept.
    const base = {
      schema: 'loop-record-v1', accepted_findings: [], inputs: {},
    };
    const green = [{ id: 'A0001|1', status: 'pass', got_sha: 'a'.repeat(64) }];
    const red = [{ id: 'A0001|1', status: 'fail', got_sha: 'a'.repeat(64) }];
    writeRecord(root, 'docs/reports/loop-records/1/round-01.json', { ...base, increment: '1', round: 1, decision: 'accept', reason: 'the increment is green: every case of the group passes', cases: green });
    writeRecord(root, 'docs/reports/loop-records/2/round-01.json', { ...base, increment: '2', round: 1, decision: 'revert', reason: 'round one: a case still differs from the City', cases: red });
    writeRecord(root, 'docs/reports/loop-records/2/round-02.json', { ...base, increment: '2', round: 2, decision: 'revert', reason: 'round two: a case still differs from the City', cases: red });
    // a fresh push-mode run whose in-scope cases are green (the fixture run: MATCH passes, the two failing cases are of the same group and
    // would block green — so the run here reports only its green case, the accepted one of the group)
    const greenRun = fakeRun({ cases: [scorerCase('A0001|1', 'MATCH', 'a'.repeat(64))] });
    await verifyCmd(parsedFor(root, { command: 'verify', json: true }), capture(), { computeRun: fakeComputeRun(greenRun) });
    const out = JSON.parse(lines[0] ?? '') as VerifyEntry[];
    // only the latest record of each increment is printed
    expect(out.map((e) => e.increment)).toEqual(['1', '2']);
    // the history runs oldest first: the last green record is at index 0 and two rounds follow it
    const two = out.find((e) => e.increment === '2');
    expect(two?.record).toBe('docs/reports/loop-records/2/round-02.json');
    expect(two?.rounds_since_thresholds).toBe(2);
    // increment green and the canary are computed only for the current (latest) increment
    const one = out.find((e) => e.increment === '1');
    expect(one?.increment_green).toBeNull();
    expect(one?.canary_ok).toBeNull();
    expect(one?.red_twins_ok).toBeNull();
    expect(two?.increment_green).toBe(true);
    expect(two?.canary_ok).toBe(true);
    expect(two?.red_twins_ok).toBe(true);
    // a run that still has a failing case makes the current increment not green
    resetLines();
    await verifyCmd(parsedFor(root, { command: 'verify', json: true }), capture(), { computeRun: fakeComputeRun(fakeRun()) });
    const redRun = JSON.parse(lines[0] ?? '') as VerifyEntry[];
    expect(redRun.find((e) => e.increment === '2')?.increment_green).toBe(false);
    expect(redRun.find((e) => e.increment === '2')?.rounds_since_thresholds).toBe(2);
  });

  it('O68-10: the case status is the FRESH run status, never the record: a hand-set pass over a failing run reads fail, with record_says', async () => {
    const root = makeRepo('verify-fresh');
    resetLines();
    // a record whose three cases are ALL hand-set to pass (and bound so the shape holds): the record claims a green round
    const claimed = [qid('A0001|1'), qid('A0002|1'), qid('A0003|1')].map((id) => ({ id, status: 'pass', got_sha: 'a'.repeat(64) }));
    writeRecord(root, 'docs/reports/loop-records/1/round-01.json', {
      schema: 'loop-record-v1', increment: '1', round: 1, decision: 'accept', reason: 'the record claims every case of the group passes',
      accepted_findings: [], cases: claimed, inputs: {},
    });
    // the fresh run disagrees: MATCH (pass), DIFFER (fail), NO ANSWER (fail)
    await verifyCmd(parsedFor(root, { command: 'verify', json: true }), capture(), { computeRun: fakeComputeRun(fakeRun()) });
    const out = JSON.parse(lines[0] ?? '') as VerifyEntry[];
    const cases = out[0]?.cases ?? [];
    // red first: the status is read off the fresh run, so the two failing cases do NOT read the record's pass
    expect(cases.map((c) => c.status)).toEqual(['pass', 'fail', 'fail']);
    expect(cases.map((c) => c.id)).toEqual([qid('A0001|1'), qid('A0002|1'), qid('A0003|1')]);
    // the record's claim rides beside it only where it differs: a green twin shows record_says null on the agreeing case
    expect(cases.map((c) => c.record_says)).toEqual([null, 'pass', 'pass']);
    // the increment is not green: the fresh run carries failing cases
    expect(out[0]?.increment_green).toBe(false);
  });

  it('without --json prints a one-line summary and no JSON', async () => {    const root = makeRepo('verify-summary');
    resetLines();
    await verifyCmd(parsedFor(root, { command: 'verify' }), capture(), { computeRun: fakeComputeRun(fakeRun()) });
    expect(lines).toHaveLength(1);
    expect(() => JSON.parse(lines[0] ?? 'x')).toThrow();
    expect(lines[0]).toMatch(/no records|0 record/);
  });
});

describe('removeCommand: the only door for dropping a regression id (M-343)', () => {
  it('a ruling that is not authority is refused and leaves the files unchanged', async () => {
    const root = makeRepo('remove-refused');
    resetLines();
    const before = fs.readFileSync(path.join(root, SET_REL), 'utf8');
    const res = await removeCmd(parsedFor(root, { command: 'regression-remove', ruling: 'M-999', group: GROUP, ids: qid('A0001|1') }), capture(), {
      rulings: new Map([['M-999', 'PROPOSED']]),
    });
    expect(res.violations).toEqual(['ruling_not_authority:M-999']);
    expect(fs.readFileSync(path.join(root, SET_REL), 'utf8')).toBe(before);
    expect(idsOf(readJsonAt(root, IDS_REL))).toEqual([qid('A0001|1')]);
  });

  it('an authority ruling (M-322) removes the id, rehashes the group and records the removal', async () => {
    const root = makeRepo('remove-authority');
    resetLines();
    const res = await removeCmd(parsedFor(root, { command: 'regression-remove', ruling: 'M-322', group: GROUP, ids: qid('A0001|1') }), capture(), {
      rulings: new Map([['M-322', 'RATIFIED']]),
    });
    expect(res.violations).toEqual([]);
    expect(idsOf(readJsonAt(root, IDS_REL))).toEqual([]);
    const set = readJsonAt(root, SET_REL) as { groups: { id: string; ids_sha256?: string }[]; removals: { ruling: string; group: string; ids: string[] }[] };
    expect(set.groups[0]?.ids_sha256).toBe(REG.idsSha([]));
    expect(set.removals).toEqual([{ ruling: 'M-322', group: GROUP, ids: [qid('A0001|1')] }]);
    expect(lines.join('\n')).toContain('M-322');
    // the ratchet accepts the removal under the authority ruling
    expect(REG.checkRegression(readJsonAt(root, SET_REL) as unknown, readJsonAt(root, SET_REL) as unknown, new Map())).toEqual([]);
  });

  it('an id that is not active is refused with remove_unknown_id', async () => {
    const root = makeRepo('remove-unknown');
    resetLines();
    const res = await removeCmd(parsedFor(root, { command: 'regression-remove', ruling: 'M-322', group: GROUP, ids: qid('A9999|1') }), capture(), {
      rulings: new Map([['M-322', 'RULED']]),
    });
    expect(res.violations).toEqual([`remove_unknown_id:${qid('A9999|1')}`]);
    expect(idsOf(readJsonAt(root, IDS_REL))).toEqual([qid('A0001|1')]);
  });
});

describe('floorsWriteCommand: round-0 count floors are generated from the run, through the door (M-330, M-322, M-372)', () => {
  const FLOORS_REL = 'mcbylaws/loop/floors-172.json';
  const OWED_LINE = 'article 10.5.40 accuracy';
  // The generated file is exactly what the RUN says, never a typed constant: two groups' counts and one OWED baseline.
  const generatedRun = (): RunOut => ({
    ...fakeRun(),
    counts: { 'g1 cases': 3, 'g2 cases': 2 },
    report: { violations: [], owed: [{ line: OWED_LINE, measured: 91.6667, floor: 94 }] },
    // the run's cases cover every group it declares, as a real push run's do
    cases: [scorerCase(qid('A0001|1'), 'MATCH', 'a'.repeat(64)), { ...scorerCase(qid('B0001|1'), 'MATCH', 'b'.repeat(64)), group: 'g2' }],
    groups: [{ id: 'g1', introduced_in: '1' }, { id: 'g2', introduced_in: '1' }],
    // a real push run runs EVERY group, so it says so (coversAllGroups reads cases + groups)
    ranGroups: ['g1', 'g2'],
  });
  const RULING = 'M-330';
  const OWED_RULING = 'M-372';
  const authority = (): Map<string, string> => new Map([[RULING, 'RULED'], [OWED_RULING, 'RULED']]);
  type FloorsFile = { schema: string; lines: Record<string, number>; owed_baseline: Record<string, number>; rulings: { ruling: string; lines: { line: string; from: number | null; to: number }[] }[] };

  it('writes lines, owed_baseline and the ruling history from the run itself', async () => {
    const root = makeRepo('floors-write');
    resetLines();
    // the set the run is the push run OF: both groups of the generated run are declared and run
    writeFileAt(root, SET_REL, JSON.stringify({ schema: 'regression-v1', groups: [{ id: 'g1', introduced_in: '1', external: true }, { id: 'g2', introduced_in: '1', external: true }], pending: [], removals: [] }, null, 2) + '\n');
    writeFileAt(root, 'mcbylaws/loop/data/ids-g2.json', JSON.stringify([qid('B0001|1')]) + '\n');
    const res = await floorsWriteCmd()(parsedFor(root, { command: 'floors-write', ruling: RULING, owedRuling: OWED_RULING }), capture(), {
      computeRun: fakeComputeRun(generatedRun()),
      rulings: authority(),
    });
    expect(res.violations).toEqual([]);
    expect(fs.existsSync(path.join(root, FLOORS_REL))).toBe(true);
    const file = readJsonAt(root, FLOORS_REL) as FloorsFile;
    expect(file.schema).toBe('loop-floors-v1');
    // the counts EQUAL the injected run (a run of another shape writes other lines: nothing is typed into the module)
    expect(file.lines).toEqual({ 'g1 cases': 3, 'g2 cases': 2 });
    // the OWED baseline is recorded at the scorer's printed precision (91.6667 prints 91.7)
    expect(file.owed_baseline).toEqual({ [OWED_LINE]: 91.7 });
    // one entry per line set, each carrying its own ruling and the exact line it set
    expect(file.rulings).toHaveLength(3);
    expect(file.rulings.filter((e) => e.ruling === RULING).map((e) => e.lines[0]?.line).sort()).toEqual(['g1 cases', 'g2 cases']);
    expect(file.rulings.find((e) => e.ruling === OWED_RULING)?.lines[0]).toEqual({ line: `owed_baseline ${OWED_LINE}`, from: null, to: 91.7 });
    // the file through the door: flattenFloors exposes every line and the baseline, and the set's own history is not shortened
    expect(F.flattenFloors(file)).toEqual({ 'g1 cases': 3, 'g2 cases': 2, [`owed_baseline ${OWED_LINE}`]: 91.7 });
    expect(F.checkFloorEdit(file, file, authority())).toEqual([]);
    expect(lines.join('\n')).toContain(FLOORS_REL);
    // the injected run is not mutated
    expect(generatedRun().counts).toEqual({ 'g1 cases': 3, 'g2 cases': 2 });
  });

  it('a ruling that is not authority writes nothing and names the ruling', async () => {
    const root = makeRepo('floors-write-forged');
    resetLines();
    writeFileAt(root, SET_REL, JSON.stringify({ schema: 'regression-v1', groups: [{ id: 'g1', introduced_in: '1', external: true }, { id: 'g2', introduced_in: '1', external: true }], pending: [], removals: [] }, null, 2) + '\n');
    writeFileAt(root, 'mcbylaws/loop/data/ids-g2.json', JSON.stringify([qid('B0001|1')]) + '\n');
    const res = await floorsWriteCmd()(parsedFor(root, { command: 'floors-write', ruling: 'M-999', owedRuling: OWED_RULING }), capture(), {
      computeRun: fakeComputeRun(generatedRun()),
      rulings: new Map([[RULING, 'RULED'], [OWED_RULING, 'RULED'], ['M-999', 'PROPOSED']]),
    });
    expect(res.violations).toEqual(['ruling_not_authority:M-999']);
    expect(fs.existsSync(path.join(root, FLOORS_REL))).toBe(false);
    // the owed ruling is refused on its own too (the counts pass their door, the baseline does not)
    const res2 = await floorsWriteCmd()(parsedFor(root, { command: 'floors-write', ruling: RULING, owedRuling: 'M-999' }), capture(), {
      computeRun: fakeComputeRun(generatedRun()),
      rulings: new Map([[RULING, 'RULED'], ['M-999', 'PROPOSED']]),
    });
    expect(res2.violations).toEqual(['ruling_not_authority:M-999']);
    expect(fs.existsSync(path.join(root, FLOORS_REL))).toBe(false);
  });

  it('an existing floors file refuses: later changes go through the door functions', async () => {
    const root = makeRepo('floors-write-exists');
    resetLines();
    writeFileAt(root, FLOORS_REL, JSON.stringify({ schema: 'loop-floors-v1', lines: { 'g1 cases': 1 }, owed_baseline: {}, rulings: [] }, null, 2) + '\n');
    const before = fs.readFileSync(path.join(root, FLOORS_REL), 'utf8');
    const res = await floorsWriteCmd()(parsedFor(root, { command: 'floors-write', ruling: RULING, owedRuling: OWED_RULING }), capture(), {
      computeRun: fakeComputeRun(generatedRun()),
      rulings: authority(),
    });
    expect(res.violations).toEqual(['floors_file_exists']);
    expect(fs.readFileSync(path.join(root, FLOORS_REL), 'utf8')).toBe(before);
  });

  it('missing --ruling or --owed-ruling refuses and writes nothing', async () => {
    const root = makeRepo('floors-write-missing');
    resetLines();
    // each case omits exactly one flag, and the module names that one (floors_write_needs:<name>, the run command's shape)
    for (const [over, missing] of [[{ owedRuling: OWED_RULING }, 'ruling'], [{ ruling: RULING }, 'owed-ruling']] as const) {
      const res = await floorsWriteCmd()(parsedFor(root, { command: 'floors-write', ...over }), capture(), {
        computeRun: fakeComputeRun(generatedRun()),
        rulings: authority(),
      });
      expect(res.violations).toEqual([`floors_write_needs:${missing}`]);
    }
    expect(fs.existsSync(path.join(root, FLOORS_REL))).toBe(false);
  });
});

describe('the appended exports do not touch the existing ones', () => {
  it('computeRun, casesFromRows, groupsForMode and the record helpers still exist', () => {
    expect(typeof M.computeRun).toBe('function');
    expect(typeof M.casesFromRows).toBe('function');
    expect(typeof M.groupsForMode).toBe('function');
    expect(typeof M.runProducer).toBe('function');
    expect(typeof F.checkCountFloors).toBe('function');
  });
});
