// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-MC (PR-79f-1, the oracle-first door; MB-79 (f), recorded 2026-11-03-batch-aw)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-79/f/plan.v9.1.md section 2.3 (the readers) and section 4 T3
// T3 (brief D3): the door's git readers on real throw-away repos. Red first: written before loop-door-git.mjs exists.
// Fixture rule: every repo is made in os.tmpdir(), every GIT_* variable is scrubbed from the child env, nothing is signed and no hook
// runs (-c commit.gpgsign=false -c core.hooksPath=/dev/null), and every repo is removed in afterAll.
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');
const G = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-door-git.mjs'))) as unknown as GitModule;
const D = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-oracle-door.mjs'))) as unknown as {
  movedLines: (diff: string) => { removed: string[]; added: string[]; headers: string[] };
};

type NameStatusRow = { s: string; p: string };
type GitModule = {
  ABSENT: string;
  stagedDiff: (root: string, p: string) => string | null;
  rangeDiff: (root: string, base: string, tip: string, p: string) => string | null;
  blobAt: (root: string, rev: string, file: string) => string | null;
  isStrictAncestor: (root: string, a: string, b: string) => boolean;
  parentOf: (root: string, sha: string) => string | null;
  preregHistory: (root: string, file: string, tip: string, mode: string) => { commits: { sha: string; blob: string; files: string[] }[]; tipBlob: string | null };
  workCommits: (root: string, a: { mode: string; base: string; tip: string; perCommit: NameStatusRow[][]; first: string | null }) => { sha: string; paths: string[]; descends: boolean }[];
  registerAt: (root: string, rev: string | null) => string | null;
  decisionsAt: (root: string, rev: string | null, stems: string[]) => { [stem: string]: unknown };
};

const ORACLE = 'src/tests/bylaw-door.logic.test.ts';
const CODE = 'scripts/seeds/bylaw/code.json';
const PREREG = 'scripts/analysis/bylaw-validation/coa-expected/prereg-MB-18-1.json';
const REG = 'docs/specs/01-pipeline/69a_mcbylaw_register.md';

const cleanEnv = (): NodeJS.ProcessEnv => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
  env.GIT_CONFIG_COUNT = '1';
  env.GIT_CONFIG_KEY_0 = 'core.autocrlf';
  env.GIT_CONFIG_VALUE_0 = 'false';
  return env;
};
const SAFE = ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null'];
const gitQ = (dir: string, args: string[], env: NodeJS.ProcessEnv = cleanEnv()): string =>
  execFileSync('git', [...SAFE, '-C', dir, ...args], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});
function makeRepo(): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mb79f-door-git-')));
  dirs.push(dir);
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { env: cleanEnv() });
  const own = path.join(dir, '.git', 'config');
  if (fs.realpathSync(gitQ(dir, ['rev-parse', '--absolute-git-dir'])) !== path.join(dir, '.git')) throw new Error('temp repo escaped');
  gitQ(dir, ['config', '--file', own, 'user.email', 'door@example.invalid']);
  gitQ(dir, ['config', '--file', own, 'user.name', 'door']);
  return dir;
}
const write = (dir: string, rel: string, text: string): void => {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
const commit = (dir: string, msg: string, date?: string): string => {
  gitQ(dir, ['add', '-A']);
  const env = cleanEnv();
  if (date) {
    env.GIT_AUTHOR_DATE = date;
    env.GIT_COMMITTER_DATE = date;
  }
  execFileSync('git', [...SAFE, '-C', dir, 'commit', '-q', '-m', msg], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  return gitQ(dir, ['rev-parse', 'HEAD']);
};
const oracleText = (v: string, w = '2'): string =>
  ["import { describe, expect, it } from 'vitest';", "describe('d', () => {", "  it('i', () => {", `    expect(x).toBe(${v});`, `    expect(y).toBe(${w});`, '  });', '});', ''].join('\n');

function baseRepo(): { dir: string; base: string } {
  const dir = makeRepo();
  write(dir, ORACLE, oracleText('1'));
  write(dir, CODE, '{"v":1}\n');
  write(dir, REG, '| **M-180** | **r** (`2026-10-30-batch-ai#CHAT-210.MB17-Q1R`) | RATIFIED 2026-10-18 |\n');
  const base = commit(dir, 'base');
  return { dir, base };
}

describe('PR-79f-1 (= R-MC) T3 #1, #2: the diff readers', () => {
  it('#1 the staged reader: an oracle edit staged beside a code file', () => {
    const { dir } = baseRepo();
    write(dir, ORACLE, oracleText('5'));
    write(dir, CODE, '{"v":2}\n');
    gitQ(dir, ['add', '-A']);
    const m = D.movedLines(G.stagedDiff(dir, ORACLE) as string);
    expect(m).toEqual({ removed: ['expect(x).toBe(1);'], added: ['expect(x).toBe(5);'], headers: [] });
  });
  it('#2 the range reader gives the NET diff of a file edited twice', () => {
    const { dir, base } = baseRepo();
    write(dir, ORACLE, oracleText('3'));
    commit(dir, 'one');
    write(dir, ORACLE, oracleText('5'));
    const tip = commit(dir, 'two');
    expect(D.movedLines(G.rangeDiff(dir, base, tip, ORACLE) as string)).toEqual({ removed: ['expect(x).toBe(1);'], added: ['expect(x).toBe(5);'], headers: [] });
  });
  it('#2 a reader that cannot run answers null (oracle_door_diff_unreadable downstream)', () => {
    const { dir, base } = baseRepo();
    expect(G.rangeDiff(dir, base, 'f'.repeat(40), ORACLE)).toBeNull();
  });
});

describe('PR-79f-1 (= R-MC) T3 #3: renames are R in the name-status, so no diff call is made for them', () => {
  it('R100 and R090 show as R', () => {
    const { dir, base } = baseRepo();
    gitQ(dir, ['mv', ORACLE, 'src/tests/bylaw-door2.logic.test.ts']);
    const tip = commit(dir, 'rename');
    const ns = gitQ(dir, ['diff', '--name-status', '-M', `${base}..${tip}`]);
    expect(ns.startsWith('R100')).toBe(true);
    const { dir: d2, base: b2 } = baseRepo();
    gitQ(d2, ['mv', ORACLE, 'src/tests/bylaw-door3.logic.test.ts']);
    write(d2, 'src/tests/bylaw-door3.logic.test.ts', oracleText('1', '3'));
    const t2 = commit(d2, 'rename and edit');
    expect(gitQ(d2, ['diff', '--name-status', '-M', `${b2}..${t2}`])).toMatch(/^R0[89]\d/);
  });
});

describe('PR-79f-1 (= R-MC) T3 #4: the history blob rule (P-16, F-1, F-3)', () => {
  const prereg = (v: string): string => `{"task":"MB-18","increment":"1","v":"${v}"}\n`;
  it('(a) a clean merge of a branch that predates the prereg is clean', () => {
    const { dir, base } = baseRepo();
    gitQ(dir, ['checkout', '-q', '-b', 'side']);
    write(dir, 'side.txt', 's\n');
    commit(dir, 'side');
    gitQ(dir, ['checkout', '-q', 'main']);
    write(dir, PREREG, prereg('X'));
    const p = commit(dir, 'prereg');
    gitQ(dir, ['merge', '-q', '--no-ff', 'side', '-m', 'merge']);
    const h = G.preregHistory(dir, PREREG, 'HEAD', 'push');
    // --full-history also lists the merge (it is TREESAME to one parent only); its blob is the same, so the blob rule calls it clean.
    expect(h.commits[0]?.sha).toBe(p);
    expect(new Set(h.commits.map((c) => c.blob)).size).toBe(1);
    expect(h.tipBlob).toBe(h.commits[0]?.blob);
    void base;
  });
  it('(b) a prereg arriving by merge is clean', () => {
    const { dir } = baseRepo();
    gitQ(dir, ['checkout', '-q', '-b', 'lane']);
    write(dir, PREREG, prereg('X'));
    const p = commit(dir, 'prereg on lane');
    gitQ(dir, ['checkout', '-q', 'main']);
    write(dir, 'm.txt', 'm\n');
    commit(dir, 'main work');
    gitQ(dir, ['merge', '-q', '--no-ff', 'lane', '-m', 'merge lane']);
    const h = G.preregHistory(dir, PREREG, 'HEAD', 'push');
    expect(new Set(h.commits.map((c) => c.blob)).size).toBe(1);
    expect(h.commits[0]?.sha).toBe(p);
    expect(h.commits[0]?.files).toEqual([PREREG]);
  });
  it('(c) an edit and put-back on a side branch is EDITED (two distinct blobs)', () => {
    const { dir } = baseRepo();
    write(dir, PREREG, prereg('X'));
    commit(dir, 'prereg');
    gitQ(dir, ['checkout', '-q', '-b', 'side']);
    write(dir, PREREG, prereg('Y'));
    commit(dir, 'Y');
    write(dir, PREREG, prereg('X'));
    commit(dir, 'back to X');
    gitQ(dir, ['checkout', '-q', 'main']);
    write(dir, 'b.txt', 'b\n');
    commit(dir, 'main other');
    gitQ(dir, ['merge', '-q', '--no-ff', 'side', '-m', 'merge']);
    const h = G.preregHistory(dir, PREREG, 'HEAD', 'push');
    expect(new Set(h.commits.map((c) => c.blob)).size).toBe(2);
  });
  it('(d) a plain edit is EDITED', () => {
    const { dir } = baseRepo();
    write(dir, PREREG, prereg('X'));
    commit(dir, 'prereg');
    write(dir, PREREG, prereg('Y'));
    commit(dir, 'edit');
    const h = G.preregHistory(dir, PREREG, 'HEAD', 'push');
    expect(new Set(h.commits.map((c) => c.blob)).size).toBe(2);
  });
  it('(e) four commits within one second: the first listed commit is the prereg commit (--topo-order)', () => {
    const { dir } = baseRepo();
    const t = '2026-11-03T10:00:00';
    write(dir, PREREG, prereg('X'));
    const p = commit(dir, 'prereg', t);
    gitQ(dir, ['checkout', '-q', '-b', 'side']);
    write(dir, PREREG, prereg('Z'));
    commit(dir, 'side edit', t);
    gitQ(dir, ['checkout', '-q', 'main']);
    write(dir, 'w.txt', 'w\n');
    commit(dir, 'work', t);
    gitQ(dir, ['merge', '-q', '--no-ff', '-X', 'ours', 'side', '-m', 'merge'], (() => {
      const e = cleanEnv();
      e.GIT_AUTHOR_DATE = t;
      e.GIT_COMMITTER_DATE = t;
      return e;
    })());
    const h = G.preregHistory(dir, PREREG, 'HEAD', 'push');
    expect(h.commits[0]?.sha).toBe(p);
  });
  it('(f) a prereg deleted in a later commit is the ABSENT blob (EDITED), not a crash', () => {
    const { dir } = baseRepo();
    write(dir, PREREG, prereg('X'));
    commit(dir, 'prereg');
    fs.rmSync(path.join(dir, PREREG));
    commit(dir, 'delete');
    const h = G.preregHistory(dir, PREREG, 'HEAD', 'push');
    expect(h.commits.map((c) => c.blob)).toContain(G.ABSENT);
    expect(h.tipBlob).toBeNull();
  });
  it('at commit time the tip blob is the staged one', () => {
    const { dir } = baseRepo();
    write(dir, PREREG, prereg('X'));
    commit(dir, 'prereg');
    write(dir, PREREG, prereg('Q'));
    gitQ(dir, ['add', '-A']);
    const h = G.preregHistory(dir, PREREG, 'HEAD', 'commit');
    expect(h.tipBlob).not.toBe(h.commits[0]?.blob);
  });
});

describe('PR-79f-1 (= R-MC) T3 #5, #6: the register at the prereg parent', () => {
  it('#5 a prereg in the root commit has no parent: the register is null', () => {
    const dir = makeRepo();
    write(dir, PREREG, '{}\n');
    const root = commit(dir, 'root');
    expect(G.parentOf(dir, root)).toBeNull();
    expect(G.registerAt(dir, G.parentOf(dir, root))).toBeNull();
  });
  it('#6 a ruling that lands AFTER the prereg commit is not in the register at <prereg>^', () => {
    const { dir } = baseRepo();
    write(dir, PREREG, '{}\n');
    const p = commit(dir, 'prereg');
    write(dir, REG, `${fs.readFileSync(path.join(dir, REG), 'utf8')}| **M-901** | late (\`s#CHAT-901.OK\`) | RULED 2026-10-30 |\n`);
    commit(dir, 'late ruling');
    const reg = G.registerAt(dir, G.parentOf(dir, p));
    expect(reg).toContain('M-180');
    expect(reg).not.toContain('M-901');
  });
  it('decisionsAt reads and parses the log; a missing log is null', () => {
    const { dir } = baseRepo();
    write(dir, 'docs/reports/decisions/2026-10-30-batch-ai.json', '{"decisions":[{"id":"CHAT-210.MB17-Q1R"}]}\n');
    const sha = commit(dir, 'log');
    const out = G.decisionsAt(dir, sha, ['2026-10-30-batch-ai', 'nope']);
    expect(out['2026-10-30-batch-ai']).toEqual({ decisions: [{ id: 'CHAT-210.MB17-Q1R' }] });
    expect(out.nope).toBeNull();
  });
});

describe('PR-79f-1 (= R-MC) T3 #7 to #12: the reader edge cases', () => {
  it('#7 core.autocrlf=true: the file is read as equal after trim', () => {
    const { dir, base } = baseRepo();
    gitQ(dir, ['config', '--file', path.join(dir, '.git', 'config'), 'core.autocrlf', 'true']);
    write(dir, ORACLE, oracleText('5').replace(/\n/g, '\r\n'));
    const tip = commit(dir, 'crlf');
    const m = D.movedLines(G.rangeDiff(dir, base, tip, ORACLE) as string);
    expect(m.removed).toContain('expect(x).toBe(1);');
    expect(m.added).toContain('expect(x).toBe(5);');
  });
  it('#8 scrub: GIT_DIR / GIT_INDEX_FILE of the calling repo do not leak into the read of -C <tmp>', () => {
    const { dir, base } = baseRepo();
    write(dir, ORACLE, oracleText('7'));
    const tip = commit(dir, 'seven');
    const saved = { dir: process.env.GIT_DIR, index: process.env.GIT_INDEX_FILE };
    process.env.GIT_DIR = path.join(ROOT, '.git');
    process.env.GIT_INDEX_FILE = path.join(ROOT, '.git', 'index');
    try {
      expect(D.movedLines(G.rangeDiff(dir, base, tip, ORACLE) as string).added).toEqual(['expect(x).toBe(7);']);
    } finally {
      if (saved.dir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = saved.dir;
      if (saved.index === undefined) delete process.env.GIT_INDEX_FILE;
      else process.env.GIT_INDEX_FILE = saved.index;
    }
  });
  it('#9 a register larger than 1 MB is read at the parent (the 64 MB reader, P-17)', () => {
    const { dir } = baseRepo();
    const big = `${'| **M-1** | x | RULED 2026-01-01 |\n'.repeat(36000)}| **M-180** | end (\`s#CHAT-1.Z\`) | RATIFIED 2026-10-18 |\n`;
    expect(big.length).toBeGreaterThan(1.2e6);
    write(dir, REG, big);
    commit(dir, 'big register');
    write(dir, PREREG, '{}\n');
    const p = commit(dir, 'prereg');
    expect(G.registerAt(dir, G.parentOf(dir, p))?.length).toBe(big.length);
  });
  it('#10 isStrictAncestor: exit 1 is false, a missing object throws', () => {
    const { dir, base } = baseRepo();
    write(dir, 'x.txt', 'x\n');
    const tip = commit(dir, 'x');
    expect(G.isStrictAncestor(dir, base, tip)).toBe(true);
    expect(G.isStrictAncestor(dir, tip, base)).toBe(false);
    expect(G.isStrictAncestor(dir, tip, tip)).toBe(false);
    expect(() => G.isStrictAncestor(dir, 'f'.repeat(40), tip)).toThrow();
  });
  it('#11 a git replace of the prereg\'s first commit does not change the history (--no-replace-objects)', () => {
    const { dir } = baseRepo();
    write(dir, PREREG, '{"v":"X"}\n');
    const p = commit(dir, 'prereg');
    write(dir, 'w.txt', 'w\n');
    commit(dir, 'work');
    const before = G.preregHistory(dir, PREREG, 'HEAD', 'push').commits.map((c) => c.sha);
    const fake = gitQ(dir, ['commit-tree', `${p}^{tree}`, '-m', 'fake root']);
    gitQ(dir, ['replace', p, fake]);
    expect(G.preregHistory(dir, PREREG, 'HEAD', 'push').commits.map((c) => c.sha)).toEqual(before);
  });
  it('#12 a path with [ in its name is read literally (F-6)', () => {
    const { dir, base } = baseRepo();
    write(dir, 'src/tests/a1.txt', 'one\n');
    commit(dir, 'a1');
    write(dir, 'src/tests/a[1].txt', 'bracket\n');
    const tip = commit(dir, 'a[1]');
    const glob = gitQ(dir, ['diff', '--name-only', `${base}..${tip}`, '--', 'src/tests/a[1].txt']);
    expect(glob.split('\n').sort()).toEqual(['src/tests/a1.txt', 'src/tests/a[1].txt']);
    const m = D.movedLines(G.rangeDiff(dir, base, tip, 'src/tests/a[1].txt') as string);
    expect(m.added).toEqual(['bracket']);
  });
  it('workCommits zips rev-list with the per-commit lists and reads descent from the prereg commit', () => {
    const { dir, base } = baseRepo();
    write(dir, ORACLE, oracleText('2'));
    const early = commit(dir, 'early');
    write(dir, PREREG, '{}\n');
    const p = commit(dir, 'prereg');
    write(dir, ORACLE, oracleText('3'));
    const late = commit(dir, 'late');
    const perCommit: NameStatusRow[][] = [[{ s: 'M', p: ORACLE }], [{ s: 'A', p: PREREG }], [{ s: 'M', p: ORACLE }]];
    const w = G.workCommits(dir, { mode: 'push', base, tip: late, perCommit, first: p });
    expect(w).toEqual([
      { sha: early, paths: [ORACLE], descends: false },
      { sha: p, paths: [PREREG], descends: false },
      { sha: late, paths: [ORACLE], descends: true },
    ]);
  });
});
