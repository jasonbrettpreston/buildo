// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 / M-3xx (the loop gate runs the committed set and reports what it saw)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md sections 2, 3, 8 (got_sha G68-11; the producer is spawned, never inlined; per-mode groups)
// Red first. The scorer is spawned only through an injected fake `spawn` (unit tests) or the real one (the 172 test, skipped without the data dir).
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');
const M = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate-run.mjs'));

type Row = {
  notice: string;
  n: number;
  class: string;
  clause_norm: string | null;
  ours: { status: string; value?: unknown; reason?: string | null } | null;
};
type Producer = {
  kind: string;
  data_dir?: string;
  notices?: string;
  parcels?: string;
  plan_facts?: string;
  floors?: string;
  pin?: string;
};
type Group = {
  id: string;
  introduced_in?: string;
  fast?: boolean;
  external?: boolean;
  producer?: Producer | undefined;
};
type Regression = { groups: Group[] };
type CaseOut = { group: string; id: string; status: string; class?: string; value: unknown; reason: unknown; clause: unknown; got_sha: string };
type Call = { cmd: string; args: string[]; env: Record<string, string | undefined> };
type SpawnFn = (cmd: string, args: string[], opts: { env?: Record<string, string | undefined>; maxBuffer?: number }) => unknown;
type Deps = { spawn?: SpawnFn; rowsFor?: unknown };
type RunOut = {
  cases: CaseOut[];
  skipped: number;
  canary: { id: string | null; observed: string };
  report: { violations: string[]; owed: unknown[] };
  counts: { [k: string]: number };
  baseRows: unknown;
  curRows: { group: string; id: string; status: string; clause: unknown }[] | null;
  regenMismatch: string[];
  groups: { id: string; introduced_in?: string | undefined }[];
  floorsOk: boolean;
};

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-loop-gate-run-'));
afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

const DATA_DIR = path.join(TMP, 'coa-data');
const pinFile = path.join(TMP, 'pin.json');
const floorsFile = path.join(TMP, 'floors.json');

const row = (n: number, over: Partial<Row> = {}): Row => ({
  notice: 'A0001/26',
  n,
  class: 'MATCH',
  clause_norm: '10.20.40.40(1)',
  ours: { status: 'value', value: 1.2, reason: null },
  ...over,
});

// A fake spawn: records the call and writes a small scorecard JSON to the --out path, like coa-scorecard.mjs does.
function fakeSpawn(rows: Row[], calls: Call[]): SpawnFn {
  return (cmd, args, opts) => {
    calls.push({ cmd, args, env: opts.env ?? {} });
    const i = args.indexOf('--out');
    const out = args[i + 1] ?? '';
    fs.writeFileSync(out, JSON.stringify({ rows }));
    return Buffer.from('');
  };
}

const group = (over: Partial<Group> = {}): Group => ({
  id: '172',
  introduced_in: '1',
  fast: true,
  external: true,
  producer: {
    kind: 'coa-scorecard',
    data_dir: DATA_DIR,
    notices: 'notices-all2.json',
    parcels: 'parcels-all2.json',
    plan_facts: 'plan-facts',
    floors: floorsFile,
    pin: pinFile,
  },
  ...over,
});

// Groups with no floors and no pin file: the floors helper gets an empty floors file (no lines), so checkPercentFloors is green.
function prepFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(floorsFile, JSON.stringify({ overall: {}, articles: {}, pooled: null }));
  fs.writeFileSync(pinFile, JSON.stringify({ totals: { MATCH: 2 } }));
}
prepFiles();

describe('expandHome', () => {
  it('expands a leading ~ to the home directory', () => {
    expect(M.expandHome('~/Buildo-scratch/coa-data')).toBe(path.join(os.homedir(), 'Buildo-scratch/coa-data'));
    expect(M.expandHome('~')).toBe(os.homedir());
  });
  it('leaves a path without ~ unchanged, and a bare ~ in the middle is not expanded', () => {
    expect(M.expandHome('/abs/path')).toBe('/abs/path');
    expect(M.expandHome('rel/~path')).toBe('rel/~path');
  });
});

describe('casesFromRows: the ids and the computed got_sha (G68-11)', () => {
  const rows = [row(1), row(2, { notice: 'A0002/26', class: 'DIFFER', ours: { status: 'value', value: 1.5, reason: 'ours 1.5 vs City 1.2' } })];

  it('ids are "<group>|<notice>|<n>" (O68-07), the group is kept, and the status is the gate status of the printed class', () => {
    const cases = M.casesFromRows('172', rows) as CaseOut[];
    expect(cases.map((c) => c.id)).toEqual(['172|A0001/26|1', '172|A0002/26|2']);
    expect(cases.map((c) => c.group)).toEqual(['172', '172']);
    // O68-01: the one vocabulary of loop-record, not the printed class itself
    expect(cases.map((c) => c.status)).toEqual(['pass', 'fail']);
    expect(cases.map((c) => c.class)).toEqual(['MATCH', 'DIFFER']);
    expect(cases[0]?.value).toBe(1.2);
    expect(cases[1]?.reason).toBe('ours 1.5 vs City 1.2');
    expect(cases[0]?.clause).toBe('10.20.40.40(1)');
  });

  it('the got_sha is stable across two calls (a rerun gives identical hashes)', () => {
    const a = M.casesFromRows('172', rows) as CaseOut[];
    const b = M.casesFromRows('172', rows) as CaseOut[];
    expect(a.map((c) => c.got_sha)).toEqual(b.map((c) => c.got_sha));
    expect(a.every((c) => /^[0-9a-f]{64}$/.test(c.got_sha))).toBe(true);
    // the hash covers the printed class as well as the value
    const moved = M.casesFromRows('172', [row(1, { class: 'DIFFER' })]) as CaseOut[];
    expect(moved[0]?.got_sha).not.toBe(a[0]?.got_sha);
  });

  it('a changed value changes got_sha', () => {
    const base = M.casesFromRows('172', [row(1)]) as CaseOut[];
    const changed = M.casesFromRows('172', [row(1, { ours: { status: 'value', value: 1.3, reason: null } })]) as CaseOut[];
    expect(changed[0]?.got_sha).not.toBe(base[0]?.got_sha);
  });

  it('a row with no ours is still a case, with a written null value', () => {
    const cases = M.casesFromRows('172', [row(1, { ours: null })]) as CaseOut[];
    expect(cases).toHaveLength(1);
    expect(cases[0]?.value).toBeNull();
    expect(typeof cases[0]?.got_sha).toBe('string');
  });
});

describe('runProducer: spawns the committed scorer (never inlined)', () => {
  it('the argv names root, the expanded data dir, plan facts and an --out under a temp dir; the temp dir is removed', () => {
    const calls: Call[] = [];
    const res = M.runProducer(ROOT, group(), { spawn: fakeSpawn([row(1)], calls) }) as { rows: Row[]; cases: CaseOut[]; scorecard: unknown };
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.cmd).toBe('node');
    const args = call?.args ?? [];
    expect(args[0]).toBe(path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-scorecard.mjs'));
    expect(args).toContain('--root');
    expect(args[args.indexOf('--root') + 1]).toBe(ROOT);
    expect(args).toContain('--notices');
    expect(args[args.indexOf('--notices') + 1]).toBe(path.join(DATA_DIR, 'notices-all2.json'));
    expect(args[args.indexOf('--parcels') + 1]).toBe(path.join(DATA_DIR, 'parcels-all2.json'));
    expect(args[args.indexOf('--plan-facts') + 1]).toBe(path.join(DATA_DIR, 'plan-facts'));
    const out = args[args.indexOf('--out') + 1] ?? '';
    expect(path.isAbsolute(out)).toBe(true);
    expect(fs.existsSync(path.dirname(out))).toBe(false);
    expect(res.rows).toHaveLength(1);
    expect(res.cases[0]?.id).toBe('172|A0001/26|1');
    expect(res.scorecard).toBeTruthy();
  });

  it('the child env drops every GIT_* variable and asks for a large buffer', () => {
    const calls: Call[] = [];
    let maxBuffer = 0;
    const spawn: SpawnFn = (cmd, args, opts) => {
      maxBuffer = opts.maxBuffer ?? 0;
      return fakeSpawn([row(1)], calls)(cmd, args, opts);
    };
    M.runProducer(ROOT, group(), { spawn });
    const env = calls[0]?.env ?? {};
    expect(Object.keys(env).some((k) => k.startsWith('GIT_'))).toBe(false);
    expect(maxBuffer).toBeGreaterThanOrEqual(64 * 1024 * 1024);
  });

  it('a non-zero exit throws (the gate never reads a partial scorecard)', () => {
    const spawn: SpawnFn = () => {
      throw new Error('Command failed: exit 1');
    };
    expect(() => M.runProducer(ROOT, group(), { spawn })).toThrow(/exit 1|failed/i);
  });

  it('an unknown producer kind throws', () => {
    const spawn: SpawnFn = () => Buffer.from('');
    expect(() => M.runProducer(ROOT, group({ producer: { kind: 'other' } }), { spawn })).toThrow(/unknown_producer/);
    expect(() => M.runProducer(ROOT, group({ producer: undefined }), { spawn })).toThrow(/unknown_producer/);
  });

  it('a missing data_dir throws data_missing: <dir>, even before any spawn', () => {
    const calls: Call[] = [];
    expect(() => M.runProducer(ROOT, group({ producer: { kind: 'coa-scorecard', data_dir: path.join(TMP, 'gone') } }), { spawn: fakeSpawn([row(1)], calls) })).toThrow(
      /data_missing/,
    );
    expect(calls).toHaveLength(0);
  });
});

describe('pinMismatch: the committed pin against the rows just scored', () => {
  it('equal totals and row count is green', () => {
    fs.writeFileSync(pinFile, JSON.stringify({ totals: { MATCH: 2, DIFFER: 1 }, variances: 3 }));
    const rows = [row(1), row(2), row(3, { class: 'DIFFER' })];
    expect(M.pinMismatch(group(), rows, ROOT)).toEqual([]);
  });

  it('a total that differs is reported', () => {
    fs.writeFileSync(pinFile, JSON.stringify({ totals: { MATCH: 2, DIFFER: 1 }, variances: 3 }));
    expect(M.pinMismatch(group(), [row(1), row(2), row(3)], ROOT)).toContain('generated_not_regenerable');
  });

  it('a row count that differs is reported', () => {
    fs.writeFileSync(pinFile, JSON.stringify({ totals: { MATCH: 1 }, variances: 5 }));
    expect(M.pinMismatch(group(), [row(1)], ROOT)).toContain('generated_not_regenerable');
  });

  it('a group without a pin has nothing to compare', () => {
    expect(M.pinMismatch(group({ producer: { kind: 'coa-scorecard', data_dir: DATA_DIR } }), [row(1)], ROOT)).toEqual([]);
  });
});

describe('computeRun: the groups a mode runs', () => {
  const twoRows = [row(1), row(2)];

  it('commit runs only the fast groups', () => {
    const calls: Call[] = [];
    const regression: Regression = {
      groups: [group({ id: '172', fast: true }), group({ id: '4d', fast: false, producer: { kind: 'coa-scorecard', data_dir: DATA_DIR } })],
    };
    fs.writeFileSync(pinFile, JSON.stringify({ totals: { MATCH: 2 }, variances: 2 }));
    const run = M.computeRun({ root: ROOT, regression, mode: 'commit', registerText: '', deps: { spawn: fakeSpawn(twoRows, calls) } }) as RunOut | null;
    expect(calls).toHaveLength(1);
    expect(run).toBeTruthy();
    expect(run?.groups.map((g) => g.id)).toEqual(['172', '4d']);
    expect(run?.cases.every((c) => c.group === '172')).toBe(true);
    expect(run?.counts).toEqual({ '172 cases': 2 });
  });

  it('push runs every group', () => {
    const calls: Call[] = [];
    const regression: Regression = {
      // O68-03: a group must say which it is, so the 4d fixture declares "none" (it has no percent floors file)
      groups: [group({ id: '172', fast: true }), group({ id: '4d', fast: false, producer: { kind: 'coa-scorecard', data_dir: DATA_DIR, floors: 'none' } })],
    };
    const run = M.computeRun({ root: ROOT, regression, mode: 'push', registerText: '', deps: { spawn: fakeSpawn(twoRows, calls) } }) as RunOut | null;
    expect(calls).toHaveLength(2);
    expect(run?.cases).toHaveLength(4);
    expect(run?.counts).toEqual({ '172 cases': 2, '4d cases': 2 });
  });

  it('ci skips the external groups and returns null when no group is left', () => {
    const calls: Call[] = [];
    const onlyExternal: Regression = { groups: [group({ id: '172', external: true })] };
    expect(M.computeRun({ root: ROOT, regression: onlyExternal, mode: 'ci', registerText: '', deps: { spawn: fakeSpawn(twoRows, calls) } })).toBeNull();
    expect(calls).toHaveLength(0);
    const mixed: Regression = { groups: [group({ id: '172', external: true }), group({ id: '4d', external: false, producer: { kind: 'coa-scorecard', data_dir: DATA_DIR, floors: 'none' } })] };
    const run = M.computeRun({ root: ROOT, regression: mixed, mode: 'ci', registerText: '', deps: { spawn: fakeSpawn(twoRows, calls) } }) as RunOut | null;
    expect(calls).toHaveLength(1);
    expect(run?.counts).toEqual({ '4d cases': 2 });
  });

  it('returns the run shape evaluateGate reads, with a red canary on a normal run', () => {
    fs.writeFileSync(pinFile, JSON.stringify({ totals: { MATCH: 2 }, variances: 2 }));
    const regression: Regression = { groups: [group()] };
    const run = M.computeRun({ root: ROOT, regression, mode: 'push', registerText: '', deps: { spawn: fakeSpawn(twoRows, []) } }) as RunOut | null;
    expect(run).toBeTruthy();
    if (!run) return;
    expect(run.skipped).toBe(0);
    expect(run.baseRows).toBeNull();
    expect(run.canary.observed).toBe('fail');
    expect(run.canary.id).toBe('172|A0001/26|1');
    expect(run.report.violations).toEqual([]);
    expect(run.report.owed).toEqual([]);
    expect(run.regenMismatch).toEqual([]);
    expect(run.floorsOk).toBe(true);
    expect(run.curRows).toEqual([
      { group: '172', id: '172|A0001/26|1', status: 'MATCH', clause: '10.20.40.40(1)' },
      { group: '172', id: '172|A0001/26|2', status: 'MATCH', clause: '10.20.40.40(1)' },
    ]);
    expect(run.groups).toHaveLength(1);
    expect(run.groups[0]?.id).toBe('172');
  });

  it('a floors violation surfaces as report.violations and floorsOk false', () => {
    // a line named by no register row is a hard FAIL: rows under a floor of 101 % is the fault injected, and the gate says so
    // (its two MATCH rows measure 100 %, below 101 %)
    const regression: Regression = {
      groups: [group({ producer: { kind: 'coa-scorecard', data_dir: DATA_DIR, floors: floorsFile } })],
    };
    fs.writeFileSync(floorsFile, JSON.stringify({ overall: { accuracy: 101 }, articles: {}, pooled: null }));
    const run = M.computeRun({ root: ROOT, regression, mode: 'push', registerText: '', deps: { spawn: fakeSpawn([row(1), row(2)], []) } }) as RunOut | null;
    expect(run?.floorsOk).toBe(false);
    expect(run?.report.violations.some((v) => v.includes('floor_fell:overall accuracy'))).toBe(true);
    // an OWED line is not a violation (M-372), and the owed line is returned so checkOwedRatchet can watch it
    const owedText = [
      '| **M-999** | **OWED to Phase 3: overall accuracy.** | RULED 2026-01-01 OWED to Phase 3 (MB-1) since 2026-01-01 |',
    ].join('\n');
    const owedRun = M.computeRun({ root: ROOT, regression, mode: 'push', registerText: owedText, deps: { spawn: fakeSpawn([row(1), row(2)], []) } }) as RunOut | null;
    expect(owedRun?.floorsOk).toBe(true);
    expect(owedRun?.report.owed).toHaveLength(1);
    fs.writeFileSync(floorsFile, JSON.stringify({ overall: {}, articles: {}, pooled: null }));
  });

  it('a pin mismatch is carried in regenMismatch', () => {
    fs.writeFileSync(pinFile, JSON.stringify({ totals: { MATCH: 99 }, variances: 2 }));
    const regression: Regression = { groups: [group()] };
    const run = M.computeRun({ root: ROOT, regression, mode: 'push', registerText: '', deps: { spawn: fakeSpawn(twoRows, []) } }) as RunOut | null;
    expect(run?.regenMismatch).toEqual(['172 generated_not_regenerable']);
  });
});

describe('computeRun: base rows from a base revision (B1 / plan s7)', () => {
  // The base tree is extracted from the repository itself: a throw-away repo (TMP2, outside this suite's 172 fixture data) whose
  // base commit holds just the scorer's directory and a marker file, so `git archive <baseRev>` gives a tree the fake spawn is
  // asked to score with `--root <that tree>`. The marker is the test's own file, never a directory of this checkout.
  const REPO = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-loop-gate-run-repo-')));
  const MARKER = 'zz-loop-gate-base-marker.txt';
  // the git child env: every GIT_* variable scrubbed (a hook or a CI checkout must not redirect this throw-away repo)
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
  afterAll(() => {
    fs.rmSync(REPO, { recursive: true, force: true });
  });
  const gitRepo = (args: string[]): string =>
    execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
  fs.mkdirSync(path.join(REPO, 'scripts/analysis/bylaw-validation'), { recursive: true });
  // a stand-in for the committed scorer: the real one is never run (the spawn is the fake, which only needs --root and data)
  fs.writeFileSync(path.join(REPO, 'scripts/analysis/bylaw-validation/coa-scorecard.mjs'), '// scorer stand-in\n');
  fs.writeFileSync(path.join(REPO, MARKER), 'base tree only\n');
  execFileSync('git', ['init', '-q', REPO], { env });
  gitRepo(['config', 'user.email', 'run@example.invalid']);
  gitRepo(['config', 'user.name', 'run']);
  gitRepo(['add', '-A']);
  gitRepo(['commit', '-q', '--no-verify', '-m', 'base']);
  // the base rev carries the marker; the live worktree (the revision a base run is NOT) does not
  const BASE_REV = gitRepo(['rev-parse', 'HEAD']).trim();
  fs.rmSync(path.join(REPO, MARKER), { force: true });
  gitRepo(['add', '-A']);
  gitRepo(['commit', '-q', '--no-verify', '-m', 'after the base']);
  expect(fs.existsSync(path.join(REPO, MARKER))).toBe(false);

  type RowOut = { group: string; id: string; status: string; clause: unknown };
  type BaseRun = RunOut & { baseRows: RowOut[] | null; baseRowsError?: string | null };

  // A spawn keyed by the --root it is given: the base tree answers `baseFor`, the live root (the repo itself) answers `curRows`.
  // macOS: os.tmpdir() is `/var/...` but mkdtempSync keeps REPO's realpath (`/private/var/...`), so compare realpaths (falling back to
  // the raw string when the path is already gone, as the base temp tree is when a callback reads it after removal)
  const real = (p: string): string => {
    try {
      return fs.realpathSync(p);
    } catch {
      return p;
    }
  };
  const isLive = (root: string): boolean => real(root) === real(ROOT) || real(root) === real(REPO);
  function rootSpawn(calls: Call[], baseRows: Row[], curRows: Row[], baseFor: (root: string) => Row[] = () => baseRows): SpawnFn {
    return (cmd, args, opts) => {
      calls.push({ cmd, args, env: opts.env ?? {} });
      const root = args[args.indexOf('--root') + 1] ?? '';
      const rows = isLive(root) ? curRows : baseFor(root);
      const out = args[args.indexOf('--out') + 1] ?? '';
      fs.writeFileSync(out, JSON.stringify({ rows }));
      return Buffer.from('');
    };
  }

  // The extracted tree is where the base rows come from: it must be a real archive of the revision, so it carries a file the repo
  // has only at that commit (the fixture's MARKER), and the base spawn must have seen it.
  const SEEN: string[] = [];
  const seenReset = (): void => {
    SEEN.length = 0;
  };
  const baseRow = (n: number, cls = 'MATCH'): Row => row(n, { class: cls });
  // The base rows of the fixture: row 1 DIFFER at the base, MATCH at the live revision (one real move, which the prereg test uses).
  const atBase = (root: string): Row[] => {
    SEEN.push(fs.existsSync(path.join(root, MARKER)) ? 'base-only' : `missing:${root}`);
    return [baseRow(1, 'DIFFER'), baseRow(2)];
  };

  // A baseRev is extracted from the root it is given (`git -C <root> archive`), so a real base tree needs REPO as the root. The
  // live tree is the same repo's worktree: with baseRev the fake must see a --root that is NOT this one (`--root` names the
  // extracted temp tree for the base spawn, and only the bare worktree for the live one).
  const INPUT = { root: REPO, baseRev: BASE_REV };
  const LIVE = (call: Call): string => call.args[call.args.indexOf('--root') + 1] ?? '';

  it('with baseRev the fake sees a --root that is NOT the live root, and baseRows come from that tree', () => {
    seenReset();
    const calls: Call[] = [];
    fs.writeFileSync(pinFile, JSON.stringify({ totals: { MATCH: 2 }, variances: 2 }));
    const regression: Regression = { groups: [group()] };
    const run = M.computeRun({
      ...INPUT,
      regression,
      mode: 'push',
      registerText: '',
      deps: { spawn: rootSpawn(calls, [baseRow(1, 'DIFFER')], [baseRow(1), baseRow(2)], atBase) } as Deps,
    }) as BaseRun | null;
    expect(run).toBeTruthy();
    if (!run) return;
    // two spawns: the extracted base tree (scored first), then the live root
    expect(calls).toHaveLength(2);
    const baseCall = calls.find((call) => LIVE(call) !== REPO);
    const liveCall = calls.find((call) => LIVE(call) === REPO);
    expect(baseCall).toBeTruthy();
    expect(liveCall).toBeTruthy();
    if (!baseCall || !liveCall) return;
    expect(path.isAbsolute(LIVE(baseCall))).toBe(true);
    // the base tree really is the tree of the revision (the marker only that commit has) and its temp dir is gone afterwards; the
    // live root has no marker, so the base spawn scored a tree this checkout does not have
    expect(SEEN).toEqual(['base-only']);
    expect(fs.existsSync(path.join(REPO, MARKER))).toBe(false);
    expect(fs.existsSync(LIVE(baseCall))).toBe(false); // removed after the base spawn
    // the DATA stays the group's external data_dir, for the base run too
    expect(baseCall.args[baseCall.args.indexOf('--notices') + 1]).toBe(path.join(DATA_DIR, 'notices-all2.json'));
    expect(`err=${String(run.baseRowsError)} seen=${SEEN.join('|')}`).toBe('err=null seen=base-only');
    expect(run.baseRows).toEqual([
      { group: '172', id: '172|A0001/26|1', status: 'DIFFER', clause: '10.20.40.40(1)' },
      { group: '172', id: '172|A0001/26|2', status: 'MATCH', clause: '10.20.40.40(1)' },
    ]);
    // the cur rows are the live run's, in the same shape
    expect(run.curRows).toEqual([
      { group: '172', id: '172|A0001/26|1', status: 'MATCH', clause: '10.20.40.40(1)' },
      { group: '172', id: '172|A0001/26|2', status: 'MATCH', clause: '10.20.40.40(1)' },
    ]);
  });

  it('a move between the base and cur rows is unexpected_move to checkPreregMoves, and green when the prereg lists it', async () => {
    const PREREG = await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-prereg.mjs'));
    seenReset();
    const calls: Call[] = [];
    const regression: Regression = { groups: [group()] };
    // base: row 1 DIFFER; cur: row 1 MATCH -> one move DIFFER -> MATCH
    const run = M.computeRun({
      ...INPUT,
      regression,
      mode: 'push',
      registerText: '',
      deps: { spawn: rootSpawn(calls, [baseRow(1)], [baseRow(1), baseRow(2)], atBase) } as Deps,
    }) as BaseRun | null;
    expect(run).toBeTruthy();
    if (!run) return;
    expect(SEEN).toEqual(['base-only']);
    expect(run.baseRows).not.toBeNull();
    type Move = { clause: string; from: string; to: string };
    type Moves = (pre: unknown, base: unknown, cur: unknown) => string[];
    const checkPreregMoves = (PREREG as unknown as { checkPreregMoves: Moves }).checkPreregMoves;
    // the prereg names the group the fixture rows carry: checkPreregMoves keeps only that group's rows (O68-04), so a prereg that
    // left `group` off would fall back to the coa172 default and have no rows to diff at all
    const unlisted = { group: '172', expected_moves: [] as Move[], expected_totals: { MATCH: 2 } };
    // the run's ids are group-qualified (`<group>|<notice>|<n>`, O68-07), while checkPreregMoves' gate form is `<notice>|<n>`: strip the
    // qualifier (the group is already named separately) so the move is keyed by the real notice and item
    const unqualified = (rows: RowOut[] | null): RowOut[] | null =>
      rows === null ? null : rows.map((r) => ({ ...r, id: r.id.split('|').slice(1).join('|') }));
    expect(checkPreregMoves(unlisted, unqualified(run.baseRows), unqualified(run.curRows))).toContain(
      'unexpected_move:A0001/26#1 DIFFER->MATCH',
    );
    // the same move, pre-registered: green (the totals are the cur run's own)
    const listed = { group: '172', expected_moves: [{ clause: '10.20.40.40(1)', from: 'DIFFER', to: 'MATCH' }], expected_totals: { MATCH: 2 } };
    expect(checkPreregMoves(listed, unqualified(run.baseRows), unqualified(run.curRows))).toEqual([]);
    // with no base rows there is nothing to diff: no move is claimed (preregNotes says so instead)
    expect(checkPreregMoves(unlisted, null, unqualified(run.curRows)).filter((m: string) => m.startsWith('unexpected_move:'))).toEqual([]);
  });

  it('an extraction failure gives baseRows null and a baseRowsError, never a throw', () => {
    const calls: Call[] = [];
    const regression: Regression = { groups: [group()] };
    const run = M.computeRun({
      root: REPO,
      baseRev: 'no-such-revision',
      regression,
      mode: 'push',
      registerText: '',
      deps: { spawn: rootSpawn(calls, [baseRow(1)], [baseRow(1)]) },
    }) as BaseRun | null;
    expect(run).toBeTruthy();
    if (!run) return;
    expect(run.baseRows).toBeNull();
    expect(typeof run.baseRowsError).toBe('string');
    expect((run.baseRowsError ?? '').length).toBeGreaterThan(0);
    // only the live run happened
    expect(calls).toHaveLength(1);
  });

  it('without baseRev baseRows stays null and no base tree is extracted', () => {
    const calls: Call[] = [];
    const regression: Regression = { groups: [group()] };
    const run = M.computeRun({ root: REPO, regression, mode: 'push', registerText: '', deps: { spawn: rootSpawn(calls, [baseRow(1)], [baseRow(1)]) } }) as BaseRun | null;
    expect(run?.baseRows).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('the extracted temp dir is removed afterwards', () => {
    const before = new Set(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('mcbylaws-loop-gate-base-')));
    seenReset();
    const calls: Call[] = [];
    const regression: Regression = { groups: [group()] };
    let seen = '';
    M.computeRun({
      ...INPUT,
      regression,
      mode: 'push',
      registerText: '',
      deps: {
        // atBase records what the base tree carries (the marker only the base commit has) into SEEN, so this test checks the same
        // extraction the other base tests do, not just that a callback ran
        spawn: rootSpawn(calls, [baseRow(1)], [baseRow(1)], (root) => {
          seen = root;
          expect(fs.existsSync(root)).toBe(true);
          return atBase(root);
        }),
      },
    });
    expect(seen).not.toBe('');
    expect(SEEN).toEqual(['base-only']);
    expect(fs.existsSync(seen)).toBe(false);
    const after = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('mcbylaws-loop-gate-base-'));
    expect(after.filter((n) => !before.has(n))).toEqual([]);
  });
});

const REAL_DATA = path.join(os.homedir(), 'Buildo-scratch/coa-data');
const have = fs.existsSync(REAL_DATA);

describe.skipIf(!have)('the real 172 group (MB-68 B7d)', () => {
  const regression: Regression = {
    groups: [
      {
        id: '172',
        introduced_in: '1',
        fast: true,
        external: true,
        producer: {
          kind: 'coa-scorecard',
          data_dir: '~/Buildo-scratch/coa-data',
          notices: 'notices-all2.json',
          parcels: 'parcels-all2.json',
          plan_facts: 'plan-facts',
          floors: 'scripts/analysis/bylaw-validation/coa-expected/floors-172.json',
          pin: 'scripts/analysis/bylaw-validation/coa-expected/expected-172.json',
        },
      },
    ],
  };

  it('698 cases with unique ids, the pin regenerated, canary red, floors checked, and a second run hashes identically', () => {
    const first = M.computeRun({ root: ROOT, regression, mode: 'push', registerText: '' }) as RunOut | null;
    expect(first).toBeTruthy();
    if (!first) return;
    expect(first.cases).toHaveLength(698);
    expect(new Set(first.cases.map((c) => c.id)).size).toBe(698);
    // the article 10.5.40 accuracy line is owed (M-372: measured 91.7 % against floor 94 %, the prereg baseline): it is reported in
    // report.owed and is NOT a violation; without the register text the gate cannot know it is owed, so it is a hard FAIL again.
    expect(first.floorsOk).toBe(first.report.violations.length === 0);
    expect(first.report.violations.every((v) => /floor_fell:article 10\.5\.40 accuracy/.test(v))).toBe(true);
    expect(first.regenMismatch).toEqual([]);
    expect(first.canary.observed).toBe('fail');
    const second = M.computeRun({ root: ROOT, regression, mode: 'push', registerText: '' }) as RunOut | null;
    expect(second).toBeTruthy();
    if (!second) return;
    expect(second.cases.map((c) => `${c.id}:${c.got_sha}`)).toEqual(first.cases.map((c) => `${c.id}:${c.got_sha}`));
  }, 60000);
});
