// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AG
//
// WF2 hygiene H6 (2026-09-27) — hooks run in EVERY worktree. `core.hooksPath`
// used to point at `.husky/_`, a husky-GENERATED, gitignored directory that
// `npm ci --ignore-scripts` never creates; a fresh worktree therefore ran NO
// hooks and every commit landed silently. `scripts/hooks/install-hooks.mjs`
// points the path at the TRACKED `.husky` and verifies the four hooks are
// present, `#!/bin/sh`, and executable in the index. Behavioural, in a
// throwaway repo. Per tasks/lessons.md 2026-09-21 the child env is an
// ALLOWLIST (no GIT_* from the session) and every mutating git call is guarded
// to run only inside the temp repo this test created.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/hooks/install-hooks.mjs');

const ENV_ALLOW = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'];
function childEnv(home: string): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};
  for (const k of ENV_ALLOW) if (process.env[k] !== undefined) env[k] = process.env[k];
  env.HOME = home;
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_AUTHOR_NAME = 'install-hooks-test';
  env.GIT_AUTHOR_EMAIL = 'test@example.invalid';
  env.GIT_COMMITTER_NAME = 'install-hooks-test';
  env.GIT_COMMITTER_EMAIL = 'test@example.invalid';
  return env as NodeJS.ProcessEnv;
}

const HOOK_NAMES = ['pre-commit', 'pre-push', 'commit-msg', 'prepare-commit-msg'];

let repo = '';
let env = {} as NodeJS.ProcessEnv;
function git(...args: string[]) {
  const real = fs.realpathSync(repo);
  if (!real.startsWith(fs.realpathSync(os.tmpdir())) || real === fs.realpathSync(REPO_ROOT)) {
    throw new Error(`refusing git ${args.join(' ')} outside the throwaway repo (${real})`);
  }
  const r = spawnSync('git', args, { cwd: repo, env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function run(...args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: repo, env, encoding: 'utf8' });
}

function writeHook(name: string, body: string) {
  fs.writeFileSync(path.join(repo, '.husky', name), body);
  git('add', `.husky/${name}`);
  git('update-index', '--chmod=+x', `.husky/${name}`);
}

beforeAll(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'install-hooks-'));
  env = childEnv(repo);
  git('init', '-q');
  fs.mkdirSync(path.join(repo, '.husky'));
  for (const name of HOOK_NAMES) writeHook(name, '#!/bin/sh\ntrue\n');
  git('commit', '-q', '-m', 'seed hooks');
});
afterAll(() => {
  if (repo && repo.startsWith(os.tmpdir())) fs.rmSync(repo, { recursive: true, force: true });
});

describe('install-hooks.mjs points core.hooksPath at the TRACKED .husky', () => {
  it('T1: no args, in a git repo with .husky hooks → exit 0, core.hooksPath = .husky', () => {
    const r = run();
    expect(r.status).toBe(0);
    expect(git('config', 'core.hooksPath').trim()).toBe('.husky');
  });

  it('T2: outside a git repo → exit 0, no failure (npm install must not break)', () => {
    const nonRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'install-hooks-nonrepo-'));
    try {
      const r = spawnSync(process.execPath, [SCRIPT], {
        cwd: nonRepo,
        env: childEnv(nonRepo),
        encoding: 'utf8',
      });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('not a git work tree');
    } finally {
      fs.rmSync(nonRepo, { recursive: true, force: true });
    }
  });

  it('T3: --verify with all four hooks present/executable → exit 0', () => {
    const r = run('--verify');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('verified 4 hooks');
  });

  it('T4: --verify after deleting .husky/pre-push → exit 1, names pre-push', () => {
    const saved = fs.readFileSync(path.join(repo, '.husky', 'pre-push'), 'utf8');
    git('rm', '-q', '--cached', '.husky/pre-push');
    fs.rmSync(path.join(repo, '.husky', 'pre-push'));
    try {
      const r = run('--verify');
      expect(r.status).toBe(1);
      expect(r.stdout + r.stderr).toContain('pre-push');
    } finally {
      fs.writeFileSync(path.join(repo, '.husky', 'pre-push'), saved);
      git('add', '.husky/pre-push');
      git('update-index', '--chmod=+x', '.husky/pre-push');
    }
  });

  it('T5: --verify after clearing commit-msg the exec bit → exit 1, names commit-msg + executable', () => {
    git('update-index', '--chmod=-x', '.husky/commit-msg');
    try {
      const r = run('--verify');
      expect(r.status).toBe(1);
      const out = r.stdout + r.stderr;
      expect(out).toContain('commit-msg');
      expect(out).toContain('executable');
    } finally {
      git('update-index', '--chmod=+x', '.husky/commit-msg');
    }
  });

  it('T6: --verify when a hook first line is not #!/bin/sh → exit 1, names it', () => {
    const hookPath = path.join(repo, '.husky', 'pre-commit');
    const saved = fs.readFileSync(hookPath, 'utf8');
    fs.writeFileSync(hookPath, '#!/bin/bash\ntrue\n');
    try {
      const r = run('--verify');
      expect(r.status).toBe(1);
      const out = r.stdout + r.stderr;
      expect(out).toContain('pre-commit');
      expect(out).toContain('#!/bin/sh');
    } finally {
      fs.writeFileSync(hookPath, saved);
    }
  });
});
