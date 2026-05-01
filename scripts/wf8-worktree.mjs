#!/usr/bin/env node
// SPEC LINK: .claude/workflows.md WF8 — Parallel Worktree Setup
//
// Wraps `git worktree add` for the WF8 protocol:
//   1. Validates pre-flight (clean tree, dest dir absent, branch absent).
//   2. Creates a sibling worktree off `main` on a `wf<N>/<slug>` branch.
//   3. Optionally promotes a queued task to the new worktree's active_task.md.
//   4. Prints the handoff command + teardown reminder.
//
// Usage:
//   npm run wf8 -- --slug=<kebab-case> --wf=<N> [--from=<queued_filename>] [--base=main]

import { execSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs() {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .filter((a) => a.startsWith('--'))
      .map((a) => {
        const [k, ...rest] = a.replace(/^--/, '').split('=');
        return [k, rest.join('=') || true];
      }),
  );
  if (!args.slug || !/^[a-z0-9][a-z0-9-]*$/.test(String(args.slug))) {
    fail('--slug=<kebab-case> required (lowercase alphanumeric + hyphens, must start with letter/digit)');
  }
  if (!args.wf || !/^\d+$/.test(String(args.wf))) {
    fail('--wf=<N> required (numeric workflow ID, e.g. --wf=2)');
  }
  return {
    slug: String(args.slug),
    wf: String(args.wf),
    from: args.from ? String(args.from) : null,
    base: args.base ? String(args.base) : 'main',
  };
}

function fail(msg) {
  console.error(`✗ wf8: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', ...opts }).trim();
}

function shTry(cmd) {
  try {
    return { ok: true, out: sh(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }) };
  } catch (err) {
    return { ok: false, err };
  }
}

function preflight({ slug, wf, from, base }) {
  // Working tree must be clean. Even staged changes block — the new worktree
  // is created from `base`'s commit, not the index, so staged-but-uncommitted
  // work would be lost from the operator's mental model.
  const status = sh('git status --porcelain');
  if (status) {
    console.error('✗ wf8: working tree has uncommitted changes:');
    console.error(status.split('\n').slice(0, 10).map((l) => `    ${l}`).join('\n'));
    console.error('     commit, stash, or clean before WF8.');
    process.exit(1);
  }
  ok('working tree clean');

  // Base branch must exist.
  if (!shTry(`git rev-parse --verify ${base}`).ok) {
    fail(`base branch '${base}' not found (default: main). Override with --base=<branch>.`);
  }
  ok(`base branch '${base}' exists`);

  // New branch must NOT exist.
  const branch = `wf${wf}/${slug}`;
  if (shTry(`git rev-parse --verify ${branch}`).ok) {
    fail(`branch '${branch}' already exists. Pick a different --slug or delete the stale branch first.`);
  }
  ok(`branch '${branch}' available`);

  // Destination dir must NOT exist.
  const destDir = resolve(REPO_ROOT, '..', `buildo-${slug}`);
  if (existsSync(destDir)) {
    fail(`destination '${destDir}' already exists. Pick a different --slug or remove the dir.`);
  }
  ok(`destination '${destDir}' available`);

  // Queued file (if --from given) must exist under .cursor/.
  let fromAbs = null;
  if (from) {
    fromAbs = resolve(REPO_ROOT, '.cursor', basename(from));
    if (!existsSync(fromAbs)) {
      fail(`--from='${from}' resolves to '${fromAbs}' which doesn't exist.`);
    }
    ok(`queued task '${basename(from)}' will be promoted to active`);
  }

  return { branch, destDir, fromAbs };
}

function run() {
  const opts = parseArgs();
  const { branch, destDir, fromAbs } = preflight(opts);

  console.log(`\n→ git worktree add ${destDir} -b ${branch} ${opts.base}`);
  sh(`git worktree add "${destDir}" -b ${branch} ${opts.base}`, { stdio: 'inherit' });
  ok(`worktree created at ${destDir}`);

  if (fromAbs) {
    const target = resolve(destDir, '.cursor', 'active_task.md');
    // The new worktree's .cursor/active_task.md inherited from base. Overwrite
    // by renaming the queued file from the original tree (which removes it
    // from .cursor/queued_*.md naturally).
    renameSync(fromAbs, target);
    ok(`promoted ${basename(fromAbs)} → ${target}`);
  }

  console.log('\n─────────────────────────────────────────────────────');
  console.log('Next steps:');
  console.log(`  cd ${destDir}`);
  console.log(`  claude   # tell it: "WF${opts.wf} continue from active_task.md"`);
  console.log('─────────────────────────────────────────────────────');
  console.log('\nTeardown after merge (do NOT skip):');
  console.log(`  git -C ${REPO_ROOT} worktree remove "${destDir}"`);
  console.log(`  git branch -d ${branch}`);
}

run();
