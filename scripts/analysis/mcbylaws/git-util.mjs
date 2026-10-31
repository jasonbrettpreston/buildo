// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (commit gate); plan §B1c — the git readers.
//            R-KP (keep the pass honest) and R-LF (landed-fact witnesses).
//
// HOW the gate reads a commit. Every export is synchronous, runs `git` in a given work tree, and NEVER throws: a
// spawn that fails is `{status: -1}`, a read that git refuses is `null` / `false`. Absence is therefore always
// distinguishable from an error only by re-asking a question git answers — the callers that judge a failure turn
// `null` into a failure line (rule 3, fail closed); an empty parse is never "nothing to check".
// Every path list or change stream is read with `-z`, so a path containing a newline (or any byte) survives intact.

import { spawnSync } from 'node:child_process';

/** 64 MB: a commit gate reads one diff at a time; a larger stream is a bug, not a fact to truncate. */
const MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Run `git <args>` in `cwd`. Never throws: a spawn error (git missing, cwd gone) is `status: -1`.
 * `input` is written to stdin (the `git show --stdin` style callers need).
 * @param {string} cwd
 * @param {string[]} args
 * @param {{input?: string}} [opts]
 * @returns {{status: number, stdout: string, stderr: string}}
 */
export function git(cwd, args, opts = {}) {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    ...(opts.input === undefined ? {} : { input: opts.input }),
  });
  if (r.error) return { status: -1, stdout: '', stderr: String(r.error.message || r.error) };
  return { status: r.status === null ? -1 : r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

const ok = (r) => r.status === 0;

/**
 * True only when `git cat-file -e <rev>:<relPath>` exits 0. ANY non-zero exit (including 128 for a rev or path
 * that does not exist) is false — never an exception.
 */
export function pathExistsAt(cwd, rev, relPath) {
  return ok(git(cwd, ['cat-file', '-e', `${rev}:${relPath}`]));
}

/**
 * The content of `relPath` at `rev`. `rev === ''` reads the INDEX (`git show :<relPath>`), any other rev reads that
 * commit's tree. Non-zero exit → null (the path or the rev does not exist there).
 * @returns {string|null}
 */
export function readAt(cwd, rev, relPath) {
  const r = rev === '' ? git(cwd, ['show', `:${relPath}`]) : git(cwd, ['show', `${rev}:${relPath}`]);
  return ok(r) ? r.stdout : null;
}

/** Split a `-z` stream into its NUL-terminated entries, dropping only the trailing empty piece. */
const splitNul = (s) => (s === '' ? [] : s.replace(/\0$/, '').split('\0'));

/**
 * Every tracked path at `rev`, in git's order. `rev === ''` lists the INDEX (`git ls-files -z`). Non-zero exit → null.
 * @returns {string[]|null}
 */
export function listTracked(cwd, rev) {
  const r = rev === ''
    ? git(cwd, ['ls-files', '-z'])
    : git(cwd, ['ls-tree', '-r', '-z', '--name-only', rev]);
  return ok(r) ? splitNul(r.stdout) : null;
}

/**
 * The non-merge commits in `<base>..<tip>`, OLDEST first. Non-zero exit → null.
 * @returns {string[]|null}
 */
export function commitsInRange(cwd, base, tip) {
  const r = git(cwd, ['rev-list', '--no-merges', '--reverse', `${base}..${tip}`]);
  return ok(r) ? r.stdout.split('\n').filter(Boolean) : null;
}

/**
 * One commit's raw `--name-status -z` stream (`--root` makes the root commit a change of `A` rows; `--no-commit-id`
 * drops the sha header). Non-zero exit → null.
 * @returns {string|null}
 */
export function changesOfCommit(cwd, sha) {
  const r = git(cwd, ['diff-tree', '-r', '-z', '-M', '--name-status', '--no-commit-id', '--root', sha]);
  return ok(r) ? r.stdout : null;
}

/** The raw `--name-status -z` stream of the index against HEAD (rename detection on). Non-zero exit → null. */
export function stagedChanges(cwd) {
  const r = git(cwd, ['diff', '--cached', '--name-status', '-z', '-M']);
  return ok(r) ? r.stdout : null;
}

/**
 * `<sha>^` (the form git resolves to a commit's first parent) when the commit HAS a parent, else null — the root
 * commit and an unknown sha both give null. `<sha>^` is returned rather than the parent sha so callers can address
 * parent-side trees and ranges without a second resolve.
 * @returns {string|null}
 */
export function parentOf(cwd, sha) {
  return ok(git(cwd, ['rev-parse', '--verify', '--quiet', `${sha}^`])) ? `${sha}^` : null;
}
