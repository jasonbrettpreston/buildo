// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (commit gate) — common rule 5, the temp-repo helper
//            every mcbylaws-gate test shares. R-KP: a test can only prove the gate on a repo it fully controls.
//
// A throwaway git repository under os.tmpdir(), isolated from the developer's machine: `git init -q`; user.name,
// user.email and commit.gpgsign=false set LOCALLY; every git call runs with GIT_CONFIG_GLOBAL=/dev/null,
// GIT_CONFIG_NOSYSTEM=1 and core.hooksPath pointing at an empty directory, so no global config (no signing key) and
// no hook ever runs. `cleanup()` removes the directory. Only GIT_* is read for a passthrough of the environment.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * The environment of every fixture git call: NO GIT_* variable of the parent survives (GIT_DIR, GIT_WORK_TREE,
 * GIT_INDEX_FILE and GIT_CONFIG_PARAMETERS would aim a call at the REAL repository -- incident 2026-10-31, a fixture
 * wrote core.hooksPath into the real shared config); the isolation variables below are set instead, and discovery
 * may not climb above the fixture's parent directory.
 */
function isolatedEnv(ceiling: string): NodeJS.ProcessEnv {
  const env = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_') && v !== undefined) env[k] = v;
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_CEILING_DIRECTORIES: ceiling };
}

/**
 * Throws unless `dir` is the work tree of a repository whose git dir sits INSIDE `dir` -- called before any config
 * write, so a write can never land in a repository that is not the fixture's own.
 */
export function assertOwnRepo(dir: string): void {
  const real = fs.realpathSync(dir);
  const r = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: real, encoding: 'utf8', env: isolatedEnv(path.dirname(real)) });
  const gitDir = r.status === 0 ? fs.realpathSync(r.stdout.trim()) : '';
  if (gitDir === '' || !gitDir.startsWith(real + path.sep)) {
    throw new Error(`repo-helper: ${dir} is not its own git repository (git dir "${gitDir}"); refusing to write config`);
  }
}

export interface Repo {
  /** The repository root. */
  dir: string;
  /** The os.tmpdir() fixture the repo sits in (=== dir, kept as its own name). */
  tmp: string;
  /** The empty directory core.hooksPath points at, so no hook runs. */
  empty: string;
  /** `git <args>` in the repo root → trimmed stdout; throws on a non-zero exit. */
  git(args: string[]): string;
  write(rel: string, content: string): void;
  stage(...rel: string[]): void;
  /** `git commit -qm <msg>` (add-all first when the index is empty) → the new sha. */
  commit(msg: string): string;
  cleanup(): void;
}

const configArgs = (repo: Repo): string[] => [
  '-c', `core.hooksPath=${repo.empty}`, '-c', 'commit.gpgsign=false', '-c', 'user.name=MB-67',
  '-c', 'user.email=mb67@example.invalid',
];

export function makeRepo(): Repo {
  // These tests also run inside the commit hook, where git sets GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE: left in place
  // they would send every git call of a test into the REAL worktree (it happened once: test commits landed on the
  // branch). Drop every GIT_* variable from this process before any temp repo is made.
  for (const k of Object.keys(process.env)) if (k.startsWith("GIT_")) delete process.env[k];
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-gate-')));
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbylaws-nohooks-'));
  const repo: Repo = {
    dir,
    tmp: dir,
    empty,
    git(args: string[]): string {
      const r = spawnSync('git', [...configArgs(repo), ...args], {
        cwd: repo.dir,
        encoding: 'utf8',
        env: isolatedEnv(path.dirname(repo.dir)),
        maxBuffer: 64 * 1024 * 1024,
      });
      if (r.error) throw r.error;
      if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed (${r.status}): ${r.stderr}`);
      return r.stdout.trim();
    },
    write(rel: string, content: string): void {
      const abs = path.join(repo.dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    },
    stage(...rel: string[]): void {
      repo.git(['add', '--', ...rel]);
    },
    commit(msg: string): string {
      repo.git(['add', '-A']);
      repo.git(['commit', '-q', '-m', msg]);
      return repo.git(['rev-parse', 'HEAD']);
    },
    cleanup(): void {
      fs.rmSync(repo.dir, { recursive: true, force: true });
      fs.rmSync(repo.empty, { recursive: true, force: true });
    },
  };
  repo.git(['init', '-q']);
  // Every write below goes to the fixture's own config FILE by explicit path, after the guard: it cannot reach another repo.
  assertOwnRepo(dir);
  const own = path.join(dir, '.git', 'config');
  for (const [k, v] of [['commit.gpgsign', 'false'], ['user.name', 'MB-67'], ['user.email', 'mb67@example.invalid'], ['core.hooksPath', empty]] as [string, string][]) {
    repo.git(['config', '--file', own, k, v]);
  }
  return repo;
}
