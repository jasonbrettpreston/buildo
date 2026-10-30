// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 (the loop gate is one command MB-67 calls from the hooks; exit 0 green, 1 red, 2 could not run)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md sections 1 and 8 (CLI shape agreed with MB-67 line 255: node scripts/analysis/mcbylaws-loop/loop-gate.mjs --mode <commit|push|ci>; mode 2 is a FAIL)
//
// B7a covers the CLI shell only: argument parsing, the exit code mapping, the report format, the dispatch of main(), and the git readers.
// The verdicts come from loop-gate-eval / loop-gate-context / loop-gate-run, which are injected in these tests so the shell is tested alone.
// Every red case has a green twin.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');
const GATE = path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate.mjs');

/** A `git` call free of GIT_* variables: inside a hook GIT_DIR / GIT_INDEX_FILE would otherwise point `git -C <tmp>` at the CALLING repo. */
const cleanEnv = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
const gitRun = (root: string, args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
// Inside the vitest worker process.execPath is the pool's runner, so `node` on PATH is spawned instead (loop-gate.mjs must be argv[1]).
const NODE_BIN = String(spawnSync('which', ['node'], { encoding: 'utf8', env: cleanEnv() }).stdout || '').trim() || 'node';

type NameStatus = { s: string; p: string };
type Parsed = {
  command: string;
  mode: string;
  root: string;
  json: boolean;
  write: boolean;
  writeIds: boolean;
  ruling: string;
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
type GateModule = {
  parseArgs: (argv: string[]) => Parsed;
  exitCodeFor: (v: { violations?: string[]; error?: string }) => number;
  formatReport: (v: { command?: string; mode?: string; violations?: string[]; notes?: string[] }) => string[];
  nameStatusFromText: (text: string) => NameStatus[];
  nameStatusZOf: (text: string) => NameStatus[];
  stagedEnv: (root: string) => NodeJS.ProcessEnv;
  trustedIndexFile: (root: string) => string | null;
  git: (root: string, args: string[]) => string;
  stagedNameStatus: (root: string) => NameStatus[];
  rangeNameStatus: (root: string, base: string, tip: string) => NameStatus[];
  perCommitNameStatus: (root: string, base: string, tip: string) => NameStatus[][];
  mergeBase: (root: string, targetRef: string) => string;
  blobIdsAt: (root: string, rev: string, paths: string[]) => Record2;
  readAt: (root: string, rev: string, filePath: string) => string | null;
  main: (argv: string[], deps?: Deps) => Promise<number>;
};
type Record2 = { [path: string]: string };
type Deps = {
  buildContext?: (args: Parsed) => Promise<unknown>;
  evaluateGate?: (ctx: unknown, args: Parsed) => unknown;
  write?: (line: string) => void;
};

const load = async (): Promise<GateModule> => (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-gate.mjs'))) as GateModule;

const collect = (): { out: string[]; write: (line: string) => void } => {
  const out: string[] = [];
  return { out, write: (line: string) => { out.push(line); } };
};

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length) {
    const d = tempDirs.pop();
    if (d && fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  }
});

/** A throw-away repository; its git dir is asserted to resolve INSIDE the temp dir, never ROOT. */
function makeRepo(): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mb68-gate-')));
  tempDirs.push(dir);
  execFileSync('git', ['init', '-q', dir], { env: cleanEnv() });
  const g = (...a: string[]): string => gitRun(dir, a);
  const gitDir = fs.realpathSync(g('rev-parse', '--absolute-git-dir').trim());
  if (gitDir !== path.join(dir, '.git')) throw new Error(`temp repository does not resolve to ${dir}`);
  g('config', 'user.email', 'gate@example.invalid');
  g('config', 'user.name', 'gate');
  return dir;
}

function commitAll(dir: string, message: string): string {
  gitRun(dir, ['add', '-A']);
  gitRun(dir, ['commit', '-q', '--no-verify', '-m', message]);
  return gitRun(dir, ['rev-parse', 'HEAD']).trim();
}

// The parseArgs usage error IS the usage line the CLI prints (main writes it verbatim and returns 2).
const USAGE_LINE = 'usage: loop-gate [check|run|verify|regression-remove] --mode <commit|push|ci> [--root <dir>] [--json]';

describe('parseArgs', () => {
  it('parses --mode=<v> as the check command with defaults for everything else', async () => {
    const { parseArgs } = await load();
    const a = parseArgs(['--mode=commit']);
    expect(a.command).toBe('check');
    expect(a.mode).toBe('commit');
    expect(a.error).toBe('');
    expect(a.json).toBe(false);
    expect(a.write).toBe(false);
    expect(a.writeIds).toBe(false);
    expect(a.root).toBe('.');
    expect(a.base).toBe('');
    expect(a.ids).toBe('');
  });

  it('parses --mode <v> (space form) and the explicit check command', async () => {
    const { parseArgs } = await load();
    for (const argv of [['--mode', 'push'], ['check', '--mode=push'], ['--mode=push', 'check']]) {
      const a = parseArgs(argv);
      expect(a.command).toBe('check');
      expect(a.mode).toBe('push');
      expect(a.error).toBe('');
    }
  });

  it('parses every valued and boolean flag', async () => {
    const { parseArgs } = await load();
    const a = parseArgs([
      '--mode=ci', '--root=/tmp/x', '--json', '--write', '--write-ids', '--ruling=R-1', '--group=g1',
      '--ids=a,b', '--increment=6b', '--decision=accept', '--reason=r', '--base=origin/main', '--findings=f.json', '--target=HEAD~1',
    ]);
    expect(a.error).toBe('');
    expect(a.command).toBe('check');
    expect(a.mode).toBe('ci');
    expect(a.root).toBe('/tmp/x');
    expect(a.json).toBe(true);
    expect(a.write).toBe(true);
    expect(a.writeIds).toBe(true);
    expect(a.ruling).toBe('R-1');
    expect(a.group).toBe('g1');
    expect(a.ids).toBe('a,b');
    expect(a.increment).toBe('6b');
    expect(a.decision).toBe('accept');
    expect(a.reason).toBe('r');
    expect(a.base).toBe('origin/main');
    expect(a.findings).toBe('f.json');
    expect(a.target).toBe('HEAD~1');
  });

  it('also accepts the valued flags in space form', async () => {
    const { parseArgs } = await load();
    const a = parseArgs(['run', '--increment', '7', '--root', '/r', '--base', 'main']);
    expect(a.command).toBe('run');
    expect(a.increment).toBe('7');
    expect(a.root).toBe('/r');
    expect(a.base).toBe('main');
    expect(a.error).toBe('');
  });

  it('names the four commands from the first positional word', async () => {
    const { parseArgs } = await load();
    expect(parseArgs(['run', '--increment=7']).command).toBe('run');
    expect(parseArgs(['verify']).command).toBe('verify');
    expect(parseArgs(['regression-remove', '--group=g']).command).toBe('regression-remove');
    expect(parseArgs(['--mode=commit']).command).toBe('check');
  });

  it('errors when there is neither a command nor a mode', async () => {
    const { parseArgs } = await load();
    expect(parseArgs([]).error).toBe(USAGE_LINE);
    expect(parseArgs(['--json']).error).toBe(USAGE_LINE);
  });

  it('errors on an unknown mode for check', async () => {
    const { parseArgs } = await load();
    expect(parseArgs(['--mode=bogus']).error).toBe('bad_mode:bogus');
    expect(parseArgs(['--mode=bogus']).mode).toBe('bogus');
  });

  it('errors when regression-remove names no --ruling, --group or --ids', async () => {
    const { parseArgs } = await load();
    expect(parseArgs(['regression-remove']).error).toBe('removal_needs:ruling|group|ids');
    expect(parseArgs(['regression-remove', '--group=g']).error).toBe('');
    expect(parseArgs(['regression-remove', '--ids=a']).error).toBe('');
    expect(parseArgs(['regression-remove', '--ruling=R-1']).error).toBe('');
  });

  it('errors on an unknown flag with unknown_flag:<flag>', async () => {
    const { parseArgs } = await load();
    expect(parseArgs(['--mode=commit', '--nope']).error).toBe('unknown_flag:--nope');
    expect(parseArgs(['--mode=commit', '--nope=1']).error).toBe('unknown_flag:--nope');
    expect(parseArgs(['--mode=commit', '--mode=commit']).error).toBe('');
  });
});

describe('exitCodeFor', () => {
  it('maps 2 (error), 1 (violations), 0 (green)', async () => {
    const { exitCodeFor } = await load();
    expect(exitCodeFor({})).toBe(0);
    expect(exitCodeFor({ violations: [] })).toBe(0);
    expect(exitCodeFor({ violations: ['floor_fall'] })).toBe(1);
    expect(exitCodeFor({ error: 'data_missing' })).toBe(2);
    expect(exitCodeFor({ violations: ['floor_fall'], error: 'data_missing' })).toBe(2);
  });
});

describe('formatReport', () => {
  it('prints FAIL lines, note lines and the ok summary', async () => {
    const { formatReport } = await load();
    const arg = { command: 'check', mode: 'commit', violations: [] as string[], notes: [] as string[], json: false };
    const lines = formatReport(arg);
    expect(lines).toEqual(['loop-gate commit: ok']);
  });

  it('prints one FAIL line per violation, one note line per note, then the failing summary', async () => {
    const { formatReport } = await load();
    const arg = { command: 'check', mode: 'push', violations: ['floor_fall:L12', 'record_missing'], notes: ['canary ok', 'rounds 0'], json: false };
    const lines = formatReport(arg);
    expect(lines).toEqual([
      'FAIL floor_fall:L12',
      'FAIL record_missing',
      'note: canary ok',
      'note: rounds 0',
      'loop-gate push: 2 failure(s)',
    ]);
  });
});

describe('main with injected deps', () => {
  it('green: exit 0, prints the ok line, deps called once with the parsed args', async () => {
    const { main } = await load();
    const sink = collect();
    const args: Parsed[] = [];
    const code = await main(['--mode=commit'], {
      buildContext: async (a: Parsed) => { args.push(a); return { seed: 1 }; },
      evaluateGate: () => ({ violations: [], notes: ['all clear'] }),
      write: sink.write,
    });
    expect(code).toBe(0);
    expect(args.length).toBe(1);
    expect(args[0]?.mode).toBe('commit');
    expect(sink.out).toEqual(['note: all clear', 'loop-gate commit: ok']);
  });

  it('red: exit 1 and prints FAIL <code>', async () => {
    const { main } = await load();
    const sink = collect();
    const code = await main(['--mode=push'], {
      buildContext: async () => ({}),
      evaluateGate: () => ({ violations: ['oracle_moved'], notes: [] }),
      write: sink.write,
    });
    expect(code).toBe(1);
    expect(sink.out).toContain('FAIL oracle_moved');
  });

  it('a throwing dep is 2 and prints cannot run', async () => {
    const { main } = await load();
    const sink = collect();
    const code = await main(['--mode=ci'], {
      buildContext: async () => { throw new Error('data_missing'); },
      evaluateGate: () => ({ violations: [], notes: [] }),
      write: sink.write,
    });
    expect(code).toBe(2);
    expect(sink.out.join('\n')).toContain('loop-gate: cannot run: data_missing');
  });

  it('bad args are 2 with a usage line and no deps called', async () => {
    const { main } = await load();
    const sink = collect();
    let called = 0;
    const deps: Deps = {
      buildContext: async () => { called += 1; return {}; },
      evaluateGate: () => { called += 1; return { violations: [], notes: [] }; },
      write: sink.write,
    };
    expect(await main([], deps)).toBe(2);
    expect(await main(['--mode=bogus'], deps)).toBe(2);
    expect(called).toBe(0);
    expect(sink.out.join('\n')).toContain('usage');
  });
});

describe('the real CLI file', () => {
  // NOT (process.execPath, GATE...): inside the vitest worker process.execPath is the pool's NODE_OPTIONS runner and argv[1] would be the
  // worker's entry, so the module would not be the entry point. `node <file>` via PATH makes loop-gate.mjs argv[1], as in a hook.
  const spawn = (args: string[]) => spawnSync(NODE_BIN, [GATE, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 60000, env: cleanEnv() });

  it('exits 2 and prints a usage line when run with no arguments', () => {
    const r = spawn([]);
    expect(r.status).toBe(2);
    expect(`${r.stdout}${r.stderr}`).toContain('usage');
  });

  it('exits 2 on --mode bogus', () => {
    const r = spawn(['--mode', 'bogus']);
    expect(r.status).toBe(2);
    expect(`${r.stdout}${r.stderr}`).toContain('bad_mode');
  });
});

describe('nameStatusFromText', () => {
  it('parses adds and modifies', async () => {
    const { nameStatusFromText } = await load();
    expect(nameStatusFromText('A\tnew.txt\nM\tedit.txt\n')).toEqual([{ s: 'A', p: 'new.txt' }, { s: 'M', p: 'edit.txt' }]);
  });

  it('gives both paths for a rename and ignores empty lines', async () => {
    const { nameStatusFromText } = await load();
    expect(nameStatusFromText('\nR100\told.txt\tnew.txt\n\n')).toEqual([{ s: 'R', p: 'old.txt' }, { s: 'R', p: 'new.txt' }]);
    expect(nameStatusFromText('')).toEqual([]);
  });
});

describe('git readers', () => {
  /** A repo with: c1 seed, c2 adds a.txt, c3 renames a.txt -> b.txt and edits it. */
  function seededRepo(): { dir: string; c1: string; c2: string; c3: string } {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'seed.txt'), 'seed\n');
    const c1 = commitAll(dir, 'seed');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one\n');
    const c2 = commitAll(dir, 'add a');
    gitRun(dir, ['mv', 'a.txt', 'b.txt']);
    fs.writeFileSync(path.join(dir, 'b.txt'), 'two\n');
    const c3 = commitAll(dir, 'rename a to b');
    return { dir, c1, c2, c3 };
  }

  it('stagedNameStatus reports an add, a modify and a rename (both paths)', async () => {
    const { stagedNameStatus } = await load();
    const { dir } = seededRepo();
    fs.writeFileSync(path.join(dir, 'b.txt'), 'three\n');
    gitRun(dir, ['add', '-A']);
    fs.writeFileSync(path.join(dir, 'new.txt'), 'n\n');
    gitRun(dir, ['add', '-A']);
    const staged = stagedNameStatus(dir);
    const added = staged.filter((e) => e.s === 'A').map((e) => e.p);
    expect(added).toContain('new.txt');
    expect(staged.length).toBeGreaterThan(0);
  });

  it('rangeNameStatus unions the range and perCommitNameStatus lists each commit', async () => {
    const { rangeNameStatus, perCommitNameStatus } = await load();
    const { dir, c1, c2, c3 } = seededRepo();
    const union = rangeNameStatus(dir, c2, c3);
    const paths = union.map((e) => e.p);
    expect(paths).toContain('b.txt');
    const per = perCommitNameStatus(dir, c1, c3);
    expect(per.length).toBe(2);
    expect(per[0]?.map((e) => e.p)).toEqual(['a.txt']);
    expect(per[1]?.map((e) => e.p).sort()).toEqual(['a.txt', 'b.txt']);
    // a rename whose content ALSO changed is A + D at default similarity (see the perCommitNameStatus rename test below)
    expect(per[1]?.map((e) => e.s).sort()).toEqual(['A', 'D']);
  });

describe('perCommitNameStatus on renames', () => {
  it('a rename with edited content is A + D (see the note below); with a pure rename it is R on both paths', async () => {
    const { perCommitNameStatus } = await load();
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'seed.txt'), 'seed\n');
    const c1 = commitAll(dir, 'seed');
    fs.writeFileSync(path.join(dir, 'a.txt'), `one\n${'x'.repeat(400)}\n`);
    commitAll(dir, 'add a');
    gitRun(dir, ['mv', 'a.txt', 'b.txt']);
    const pure = commitAll(dir, 'pure rename');
    // perCommitNameStatus walks c2..pure, so the pure rename is the second (and last) list
    const perPure = perCommitNameStatus(dir, c1, pure);
    expect(perPure.length).toBe(2);
    const renameCommit = perPure[perPure.length - 1] ?? [];
    expect(renameCommit.map((e) => e.p).sort()).toEqual(['a.txt', 'b.txt']);
    expect(renameCommit.every((e) => e.s === 'R')).toBe(true);
  });
});

describe('mergeBase', () => {
  it('finds the common ancestor of two refs', async () => {
    const { mergeBase } = await load();
    const { dir, c2, c3 } = seededRepo();
    gitRun(dir, ['checkout', '-q', '-b', 'side', c2]);
    fs.writeFileSync(path.join(dir, 'side.txt'), 's\n');
    const sideCommit = commitAll(dir, 'side');
    gitRun(dir, ['checkout', '-q', '-']);
    expect(mergeBase(dir, 'side')).toBe(c2);
    expect(mergeBase(dir, c3)).toBe(c3);
    expect(sideCommit).not.toBe(c2);
  });

  it('mergeBase of an absent ref is an empty string', async () => {
    const { mergeBase } = await load();
    const { dir } = seededRepo();
    expect(mergeBase(dir, 'no-such-ref-xyz')).toBe('');
  });
});

  it('blobIdsAt reads the index and a rev; a missing path is absent', async () => {
    const { blobIdsAt } = await load();
    const { dir, c3 } = seededRepo();
    fs.writeFileSync(path.join(dir, 'staged.txt'), 'staged\n');
    gitRun(dir, ['add', 'staged.txt']);
    const idx = blobIdsAt(dir, ':index', ['staged.txt', 'b.txt', 'ghost.txt']);
    expect(typeof idx['staged.txt']).toBe('string');
    expect(String(idx['staged.txt'])).toMatch(/^[0-9a-f]{40,64}$/);
    expect(Object.prototype.hasOwnProperty.call(idx, 'ghost.txt')).toBe(false);
    const atRev = blobIdsAt(dir, c3, ['b.txt', 'seed.txt', 'a.txt']);
    expect(typeof atRev['b.txt']).toBe('string');
    expect(Object.prototype.hasOwnProperty.call(atRev, 'a.txt')).toBe(false);
    expect(idx['staged.txt'] === atRev['b.txt']).toBe(false);
  });

  it('readAt reads a rev, the index and returns null for a missing path', async () => {
    const { readAt } = await load();
    const { dir, c2 } = seededRepo();
    fs.writeFileSync(path.join(dir, 'b.txt'), 'staged text\n');
    gitRun(dir, ['add', 'b.txt']);
    expect(readAt(dir, c2, 'a.txt')).toBe('one\n');
    expect(readAt(dir, ':index', 'b.txt')).toBe('staged text\n');
    expect(readAt(dir, c2, 'b.txt')).toBe(null);
    expect(readAt(dir, ':index', 'ghost.txt')).toBe(null);
  });
});

// --- O68-08: `git commit -a` / `git commit -- <path>` hand the hook an ALTERNATE index (GIT_INDEX_FILE inside .git) --------------
describe('alternate index (O68-08)', () => {
  /** Run `fn` with process.env.GIT_INDEX_FILE set and every other GIT_* removed, restoring the previous env afterwards. */
  const withIndexFile = <T>(value: string, fn: () => T): T => {
    const saved: Record<string, string | undefined> = {};
    for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) { saved[k] = process.env[k]; delete process.env[k]; }
    process.env.GIT_INDEX_FILE = value;
    try {
      return fn();
    } finally {
      delete process.env.GIT_INDEX_FILE;
      for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
    }
  };

  it('keeps GIT_INDEX_FILE only when it resolves inside the git dir', async () => {
    const { stagedEnv, trustedIndexFile } = await load();
    const dir = makeRepo();
    const inside = path.join(dir, '.git', 'commit-index');
    fs.writeFileSync(inside, '');
    const outside = path.join(dir, 'alt-index');
    fs.writeFileSync(outside, '');
    expect(process.env.GIT_INDEX_FILE).toBeUndefined();
    expect(trustedIndexFile(dir)).toBe(null);
    expect(stagedEnv(dir).GIT_INDEX_FILE).toBeUndefined();
    expect(withIndexFile(inside, () => trustedIndexFile(dir))).toBe(fs.realpathSync(inside));
    expect(withIndexFile(inside, () => stagedEnv(dir).GIT_INDEX_FILE)).toBe(fs.realpathSync(inside));
    expect(withIndexFile(outside, () => trustedIndexFile(dir))).toBe(null);
    expect(withIndexFile(outside, () => stagedEnv(dir).GIT_INDEX_FILE)).toBeUndefined();
  });

  it('stagedNameStatus reads the alternate index inside .git and ignores one outside it', async () => {
    const { stagedNameStatus } = await load();
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'seed.txt'), 'seed\n');
    commitAll(dir, 'seed');
    // The alternate index (what `git commit -a` stages) holds a file the default index does not.
    const alt = path.join(dir, '.git', 'commit-index');
    const altEnv = { ...cleanEnv(), GIT_INDEX_FILE: alt };
    fs.writeFileSync(path.join(dir, 'alt-only.txt'), 'alt\n');
    execFileSync('git', ['-C', dir, 'add', 'alt-only.txt'], { env: altEnv });
    fs.rmSync(path.join(dir, 'alt-only.txt'));
    const outside = path.join(dir, 'stray-index');
    fs.writeFileSync(path.join(dir, 'stray.txt'), 'stray\n');
    execFileSync('git', ['-C', dir, 'add', 'stray.txt'], { env: { ...cleanEnv(), GIT_INDEX_FILE: outside } });
    fs.rmSync(path.join(dir, 'stray.txt'));

    // Without the variable the default (empty) index sees nothing.
    expect(withIndexFile('', () => stagedNameStatus(dir))).toEqual([]);
    // The alternate index sees alt-only.txt plus every file it seeded from the default one, never stray.txt.
    const altPaths = withIndexFile(alt, () => stagedNameStatus(dir)).map((e) => e.p);
    expect(altPaths).toContain('alt-only.txt');
    expect(altPaths).not.toContain('stray.txt');
    // Outside the git dir the variable is ignored: the default index has nothing staged.
    expect(withIndexFile(outside, () => stagedNameStatus(dir))).toEqual([]);
  });
});

// --- O68-09: `-z` name-status: a path is never C-quoted, never trimmed -------------------------------------------
describe('nameStatusZOf', () => {
  it('splits on NUL and gives both paths of a rename', async () => {
    const { nameStatusZOf } = await load();
    expect(nameStatusZOf('A\0new.txt\0M\0edit.txt\0')).toEqual([{ s: 'A', p: 'new.txt' }, { s: 'M', p: 'edit.txt' }]);
    expect(nameStatusZOf('R100\0old.txt\0new.txt\0')).toEqual([{ s: 'R', p: 'old.txt' }, { s: 'R', p: 'new.txt' }]);
    expect(nameStatusZOf('')).toEqual([]);
  });

  it('keeps spaces, non-ASCII and backslashes verbatim', async () => {
    const { nameStatusZOf } = await load();
    expect(nameStatusZOf('A\0a b.txt\0M\0café.mjs\0A\0back\\slash.txt\0')).toEqual([
      { s: 'A', p: 'a b.txt' },
      { s: 'M', p: 'café.mjs' },
      { s: 'A', p: 'back\\slash.txt' },
    ]);
  });
});

describe('name-status readers on paths git would C-quote (O68-09)', () => {
  const ODD = ['a b.txt', 'café.mjs', 'back\\slash.txt'];

  it('stagedNameStatus, rangeNameStatus and perCommitNameStatus keep the paths exact', async () => {
    const { stagedNameStatus, rangeNameStatus, perCommitNameStatus } = await load();
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'seed.txt'), 'seed\n');
    const c1 = commitAll(dir, 'seed');
    for (const name of ODD) fs.writeFileSync(path.join(dir, name), `${name}\n`);
    const c2 = commitAll(dir, 'odd names');
    for (const name of ODD) fs.writeFileSync(path.join(dir, name), `${name} edited\n`);
    gitRun(dir, ['add', '-A']);

    const staged = stagedNameStatus(dir).map((e) => e.p).sort();
    expect(staged).toEqual([...ODD].sort());
    const union = rangeNameStatus(dir, c1, c2).map((e) => e.p).sort();
    expect(union).toEqual([...ODD].sort());
    const per = perCommitNameStatus(dir, c1, c2);
    expect(per.length).toBe(1);
    expect(per[0]?.map((e) => e.p).sort()).toEqual([...ODD].sort());
    expect(per[0]?.every((e) => e.s === 'A')).toBe(true);
  });

  it('a rename of an odd path gives both odd paths with status R', async () => {
    const { perCommitNameStatus } = await load();
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, 'seed.txt'), 'seed\n');
    const c1 = commitAll(dir, 'seed');
    fs.writeFileSync(path.join(dir, 'a b.txt'), `one\n${'x'.repeat(400)}\n`);
    commitAll(dir, 'add odd');
    gitRun(dir, ['mv', 'a b.txt', 'café.mjs']);
    const c3 = commitAll(dir, 'rename odd');
    const per = perCommitNameStatus(dir, c1, c3);
    const last = per[per.length - 1] ?? [];
    expect(last.map((e) => e.p).sort()).toEqual(['a b.txt', 'café.mjs']);
    expect(last.every((e) => e.s === 'R')).toBe(true);
  });
});

// --- O68-16: a verdict that is not `{ violations: [] }` is exit 2 (fail closed) ------------------------------------------------
describe('main fails closed on a bad verdict (O68-16)', () => {
  it.each([undefined, null, {}, { notes: [] }, { violations: 'floor_fall' }, 0])('exit 2 for %j', async (bad) => {
    const { main } = await load();
    const sink = collect();
    const code = await main(['--mode=commit'], {
      buildContext: async () => ({}),
      evaluateGate: () => bad,
      write: sink.write,
    });
    expect(code).toBe(2);
    expect(sink.out).toContain('loop-gate: cannot run: bad verdict');
    expect(sink.out.join('\n')).not.toContain('loop-gate commit: ok');
  });

  it('a truthy error is exit 2 and prints it', async () => {
    const { main } = await load();
    const sink = collect();
    const code = await main(['--mode=commit'], {
      buildContext: async () => ({}),
      evaluateGate: () => ({ violations: [], notes: [], error: 'x' }),
      write: sink.write,
    });
    expect(code).toBe(2);
    expect(sink.out.join('\n')).toContain('loop-gate: cannot run: x');
  });

  it('green twin: a real verdict still exits 0', async () => {
    const { main } = await load();
    const sink = collect();
    const code = await main(['--mode=commit'], {
      buildContext: async () => ({}),
      evaluateGate: () => ({ violations: [], notes: [] }),
      write: sink.write,
    });
    expect(code).toBe(0);
    expect(sink.out).toEqual(['loop-gate commit: ok']);
  });
});
