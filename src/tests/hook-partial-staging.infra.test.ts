// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AG
//
// WF2 "conversion simplification" item 5 — the pre-commit hook tests the INDEX:
// `scripts/hooks/check-partial-staging.sh` blocks a commit whose staged files
// also carry unstaged edits (every later hook check reads the working tree, so
// it would test content that is not being committed — the 2026-09-27 "green
// hook, broken committed blob"). Behavioural, in a throwaway repo, both
// directions. Per tasks/lessons.md 2026-09-21 the child env is an ALLOWLIST
// (no GIT_* from the session) and every mutating git call is guarded to run
// only inside the temp repo this test created.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/hooks/check-partial-staging.sh');
const PRE_COMMIT = fs.readFileSync(path.join(REPO_ROOT, '.husky/pre-commit'), 'utf8');

const ENV_ALLOW = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'];
function childEnv(home: string): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};
  for (const k of ENV_ALLOW) if (process.env[k] !== undefined) env[k] = process.env[k];
  env.HOME = home;
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_AUTHOR_NAME = 'partial-staging-test';
  env.GIT_AUTHOR_EMAIL = 'test@example.invalid';
  env.GIT_COMMITTER_NAME = 'partial-staging-test';
  env.GIT_COMMITTER_EMAIL = 'test@example.invalid';
  return env as NodeJS.ProcessEnv;
}

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
function runCheck() {
  return spawnSync('sh', [SCRIPT], { cwd: repo, env, encoding: 'utf8' });
}
function write(rel: string, text: string) {
  fs.writeFileSync(path.join(repo, rel), text);
}

beforeAll(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'partial-staging-'));
  env = childEnv(repo);
  git('init', '-q');
  git('config', 'core.autocrlf', 'false');
  write('a.txt', 'one\n');
  write('b file.txt', 'one\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'seed');
});
afterAll(() => {
  if (repo && repo.startsWith(os.tmpdir())) fs.rmSync(repo, { recursive: true, force: true });
});

describe('pre-commit tests the index — partial staging is blocked', () => {
  it('GREEN: a fully staged file passes; an unstaged edit to an UNSTAGED file is not this check\'s business', () => {
    write('a.txt', 'two\n');
    git('add', 'a.txt');
    write('b file.txt', 'two\n');
    const r = runCheck();
    expect(r.status).toBe(0);
    git('checkout', '--', 'b file.txt');
    git('reset', '-q');
    git('checkout', '--', 'a.txt');
  });

  it('RED: a staged file that ALSO has unstaged edits blocks, naming the file (spaces intact)', () => {
    write('b file.txt', 'staged\n');
    git('add', 'b file.txt');
    write('b file.txt', 'staged\nand-unstaged\n');
    const r = runCheck();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('BLOCKED');
    expect(r.stdout).toContain('  b file.txt');
  });

  it('the pre-commit hook runs this check FIRST, before any check that reads the working tree', () => {
    const code = PRE_COMMIT.split('\n').filter((l) => !l.trim().startsWith('#') && l.trim() !== '');
    expect(code[0]).toMatch(/^bash scripts\/hooks\/check-partial-staging\.sh && \\$/);
  });
});
