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

/** The GIT_* slice of the environment (common rule 3 allows no other passthrough). */
function gitEnv(base: NodeJS.Dict<string> = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (k.startsWith('GIT_') && v !== undefined) env[k] = v;
  return env;
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
        env: { ...process.env, ...gitEnv(), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
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
  repo.git(['config', 'commit.gpgsign', 'false']);
  repo.git(['config', 'user.name', 'MB-67']);
  repo.git(['config', 'user.email', 'mb67@example.invalid']);
  repo.git(['config', 'core.hooksPath', empty]);
  return repo;
}
