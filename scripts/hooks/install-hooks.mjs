#!/usr/bin/env node
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AG
//
// WF2 hygiene H6 (2026-09-27). Why this exists: `core.hooksPath=.husky/_` is
// husky-GENERATED and gitignored, and `npm ci --ignore-scripts` never creates it
// — so a FRESH WORKTREE ran NO hooks at all and 21 hookless commits landed
// silently. This script points `core.hooksPath` at the TRACKED `.husky`
// directory (relative, so each worktree resolves its OWN checkout) and verifies
// the four hooks are present, `#!/bin/sh`, and executable IN THE INDEX. It is
// run by `prepare` and by `npm run worktree:setup`; `--verify` fails closed
// (non-zero exitCode) when a hook is missing, non-sh, or not mode 100755.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const HOOKS = ['pre-commit', 'pre-push', 'commit-msg', 'prepare-commit-msg'];
const HOOKS_PATH = '.husky';

function git(args) {
  return spawnSync('git', args, { cwd: process.cwd(), encoding: 'utf8' });
}

function gitOut(args) {
  const r = git(args);
  return r.status === 0 ? (r.stdout ?? '').trim() : null;
}

function fail(name, reason) {
  console.error(`install-hooks: FAIL ${name}: ${reason}`);
  process.exitCode = 1;
}

function main() {
  // 1. Not a git work tree (or git missing) — never fail an `npm install`
  //    outside git. `git rev-parse --is-inside-work-tree` prints "true" only
  //    when cwd is inside a work tree's working directory.
  const inside = gitOut(['rev-parse', '--is-inside-work-tree']);
  if (inside !== 'true') {
    console.log('install-hooks: not a git work tree — skipped');
    return;
  }

  // 2. Point the repo's shared config at the TRACKED directory. Relative, so
  //    it resolves against each worktree's own root, never a shared .husky/_.
  const set = git(['config', 'core.hooksPath', HOOKS_PATH]);
  if (set.status !== 0) {
    console.error(`install-hooks: FAIL core.hooksPath: ${(set.stderr ?? '').trim()}`);
    process.exitCode = 1;
    return;
  }
  console.log(`install-hooks: core.hooksPath = ${HOOKS_PATH}`);

  // 3. Optional verification — the point of the whole script: a tree that
  //    claims hooks but cannot run them must fail CLOSED, not hand off silently.
  if (!process.argv.slice(2).includes('--verify')) return;

  const topLevel = gitOut(['rev-parse', '--show-toplevel']);
  if (!topLevel) {
    fail('core.hooksPath', 'could not resolve --show-toplevel');
    return;
  }

  // The hooksPath itself must read back exactly — a stale `.husky/_` means no
  // hook will ever run.
  const readBack = gitOut(['config', 'core.hooksPath']);
  if (readBack !== HOOKS_PATH) fail('core.hooksPath', `reads back ${readBack ?? '(unset)'}, expected ${HOOKS_PATH}`);

  for (const name of HOOKS) {
    const rel = `${HOOKS_PATH}/${name}`;
    const abs = path.join(topLevel, HOOKS_PATH, name);

    if (!fs.existsSync(abs)) {
      fail(name, 'hook file does not exist');
      continue;
    }

    const firstLine = fs.readFileSync(abs, 'utf8').split('\n', 1)[0];
    if (firstLine !== '#!/bin/sh') fail(name, `first line is not #!/bin/sh (is "${firstLine}")`);

    const staged = gitOut(['ls-files', '-s', '--', rel]);
    // `git ls-files -s` prints "<mode> <object> <stage>\t<path>".
    const mode = staged ? staged.split(/\s+/)[0] : null;
    if (mode !== '100755') fail(name, `not executable in the index (mode ${mode ?? 'untracked'})`);
  }

  if (process.exitCode === 1) return;
  console.log(`install-hooks: verified ${HOOKS.length} hooks`);
}

main();
