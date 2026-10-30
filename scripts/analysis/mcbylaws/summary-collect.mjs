// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (commit gate); plan section 4, arm S (S3, S7, S8,
//            S10); R-KY (the pre-push summary), R-KL (worktree report at pre-push), R-LD (layer 2/3 scope),
//            R-LF (range = what git hands on stdin, policy = the BASE copy).
//
// HOW the summary gets its facts. `collectRef` describes ONE pushed ref the way `buildSummary` reads it: the range
// (base = the remote sha, or the merge-base against the default branch when the ref is new), the commits oldest
// first with their task, their rule ids, their Layer 2/3 scope and their panel column (arm P's rules: R-LE(a) exempt,
// a valid record, a missing one, an invalid one), the joined numstat/name-status change list, and where APPROVED
// moves. The other exports count what the operator must be
// shown (held patches, worktrees, pending files). No environment variable is read: `~` expands through `os.homedir()`.
// Fail closed: any git error, an unparsable stream or an unresolvable base is `{error: ...}` / null /
// `{kind:'unknown'}` — the caller prints UNKNOWN, never a pass — and an empty parse is never "nothing to check".

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { git, commitsInRange, changesOfCommit, listTracked } from './git-util.mjs';
import { parseNameStatusZ, allPaths } from './name-status.mjs';
import { classify } from './paths.mjs';
import { parseMessage } from './cite-parse.mjs';
import { panelForPaths } from './panel.mjs';

const ZERO = '0'.repeat(40);
const EMPTY = { commits: [], changes: [], approvedChange: null, approvedSince: null };
const fail = (what) => ({ error: what });
const expand = (p, home) => (p === '~' ? home : String(p).startsWith('~/') ? path.join(home, p.slice(2)) : p);

/** The rule ids a commit's paths fall under (empty = the commit touches nothing protected). */
function rulesOf(policy, paths) {
  const rules = new Set();
  for (const p of paths) {
    const c = classify(policy, p);
    if (c.layer23) rules.add('R-LD');
    if (c.protected) rules.add('R-KP');
    if (c.literalScope) rules.add('L10');
    if (c.literalExempt) rules.add('L11');
  }
  return [...rules].sort();
}

/**
 * The panel column is closed to `true` / `false` (MISSING) / `'exempt'` / `'invalid'`: anything arm P cannot name (no
 * task trailer, an unreadable record, a throw) is a MISSING record, never a pass and never `null`.
 */
function closedPanel(value) {
  return value === true || value === 'exempt' || value === 'invalid' ? value : false;
}

/** One commit's summary row; null when a stream cannot be read (fail closed). */
function commitRow(cwd, sha, policy) {
  const meta = git(cwd, ['show', '-s', '--format=%s%x00%B', sha]);
  const raw = changesOfCommit(cwd, sha);
  if (meta.status !== 0 || raw === null) return null;
  const entries = parseNameStatusZ(raw);
  if (entries === null) return null;
  const [subject, message] = meta.stdout.split('\0');
  const task = parseMessage(message || '').task;
  const paths = allPaths(entries);
  const layer23Paths = paths.filter((p) => classify(policy, p).layer23);
  const layer23 = layer23Paths.length > 0;
  // Arm S / S7: the column follows arm P's rules; a commit that is not Layer 2/3 keeps `true`.
  const panel = layer23
    ? closedPanel(panelForPaths({ cwd, ownRev: sha, task, layer23Paths, message: message || '' }))
    : true;
  return { sha, subject: subject || '', task, rules: rulesOf(policy, paths), layer23, panel };
}

/** `git diff --numstat` joined with `--name-status`, both `-z -M`; null when either stream is unreadable. */
function changesInRange(cwd, base, tip) {
  const num = git(cwd, ['diff', '--numstat', '-z', '-M', base, tip]);
  const ns = git(cwd, ['diff-tree', '-r', '-z', '-M', '--no-commit-id', '--name-status', base, tip]);
  if (num.status !== 0 || ns.status !== 0) return null;
  const entries = parseNameStatusZ(ns.stdout);
  if (entries === null) return null;
  const counts = new Map();
  const fields = num.stdout === '' ? [] : num.stdout.replace(/\0$/, '').split('\0');
  for (let i = 0; i < fields.length;) {
    const m = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(fields[i]);
    if (!m) return null;
    const added = m[1] === '-' ? 0 : Number(m[1]);
    const deleted = m[2] === '-' ? 0 : Number(m[2]);
    // A NUL in the path field means git emitted old and new path as their own fields: consume both.
    const two = m[3] === '';
    for (const p of two ? [fields[i + 1] ?? '', fields[i + 2] ?? ''] : [m[3]]) counts.set(p, { added, deleted });
    i += two ? 3 : 1;
  }
  return entries.map((e) => ({
    status: e.status, path: e.path, oldPath: e.oldPath,
    ...(counts.get(e.path) || { added: 0, deleted: 0 }),
  }));
}

function approvedFacts(cwd, tip, shas) {
  let approvedChange = null;
  for (const sha of shas) {
    const raw = changesOfCommit(cwd, sha);
    const entries = raw === null ? null : parseNameStatusZ(raw);
    if (entries === null) return fail('approved');
    if (entries.some((e) => [e.path, e.oldPath].includes('mcbylaws/APPROVED'))) {
      const subj = git(cwd, ['show', '-s', '--format=%s', sha]);
      if (subj.status !== 0) return fail('approved');
      approvedChange = { sha, subject: subj.stdout.trim() };
      break;
    }
  }
  const last = git(cwd, ['log', '-1', '--format=%h%x00%cs', '--diff-filter=A', tip, '--', 'mcbylaws/APPROVED']);
  if (last.status !== 0) return fail('approved-since');
  const [shortSha, date] = last.stdout.trim().split('\0');
  const approvedSince = shortSha ? { sha: shortSha, date: date || '' } : null;
  return { approvedChange, approvedSince };
}

/**
 * The `refs[i]` object `buildSummary` takes. Never throws: an unreadable fact is `{error: '<what>'}`.
 * @param {{cwd:string, ref:string, localSha:string, remoteSha:string, policy:object, defaultBase:string}} args
 */
export function collectRef({ cwd, ref, localSha, remoteSha, policy, defaultBase }) {
  try {
    if (typeof localSha !== 'string' || localSha === '') return fail('local-sha');
    const kind = String(ref || '').startsWith('refs/tags/') ? 'tag' : localSha === ZERO ? 'delete' : 'branch';
    // A delete or a tag carries no range to read: the shape is still the one `buildSummary` indexes.
    if (kind !== 'branch') return { ...EMPTY, kind, ref, base: null };
    let base = remoteSha;
    if (!remoteSha || remoteSha === ZERO) {
      const mb = git(cwd, ['merge-base', localSha, defaultBase]);
      if (mb.status !== 0) return { kind: 'unknown' };
      base = mb.stdout.trim();
    }
    const shas = commitsInRange(cwd, base, localSha);
    if (shas === null) return fail('range');
    const commits = [];
    for (const sha of shas) {
      const row = commitRow(cwd, sha, policy);
      if (row === null) return fail('commit');
      commits.push(row);
    }
    const changes = changesInRange(cwd, base, localSha);
    if (changes === null) return fail('changes');
    const facts = approvedFacts(cwd, localSha, shas);
    if (facts.error) return facts;
    return { kind, ref, base, commits, changes, ...facts };
  } catch {
    return fail('collect');
  }
}

/**
 * Held patches on disk: regular `.patch` files under each `held_dirs` entry.
 * @returns {{count:number, dirs:number}}
 */
export function heldCount(policy) {
  let count = 0;
  let dirs = 0;
  for (const entry of policy?.held_dirs || []) {
    const dir = expand(entry, os.homedir());
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    dirs += 1;
    for (const n of names) {
      try { if (n.endsWith('.patch') && fs.statSync(path.join(dir, n)).isFile()) count += 1; } catch { /* gone */ }
    }
  }
  return { count, dirs };
}

/**
 * The directories a worktree glob names, RELATIVE to `home`, kept when each holds a `.git` entry (a FILE in a linked
 * worktree, a directory in a clone). Only the last segment may carry a `*`; any other glob is skipped.
 */
function worktreeDirs(globs, home) {
  const found = new Map();
  for (const glob of globs || []) {
    const seg = path.basename(glob);
    const star = seg.indexOf('*');
    if (star >= 0 && star !== seg.lastIndexOf('*')) continue;
    const prefix = star >= 0 ? seg.slice(0, star) : seg;
    let names;
    try { names = fs.readdirSync(home); } catch { continue; }
    for (const n of names) {
      if (!n.startsWith(prefix)) continue;
      try {
        const dir = fs.realpathSync(path.join(home, n));
        if (!fs.statSync(dir).isDirectory()) continue;
        if (!fs.existsSync(path.join(dir, '.git'))) continue;
        found.set(dir, dir);
      } catch { /* gone */ }
    }
  }
  return [...found.values()];
}

/**
 * R-KL: how many McBylaws worktrees exist, how many are dirty, how many hold unpushed commits (DIRTY → REVIEW).
 * @param {{worktrees?:string[]}} policy @param {string} [home] the directory the worktree globs are relative to
 */
export function worktreeScan(policy, home = os.homedir()) {
  const dirs = worktreeDirs(policy?.worktrees, home);
  let dirty = 0;
  let unpushed = 0;
  for (const dir of dirs) {
    const st = git(dir, ['status', '--porcelain']);
    if (st.status !== 0) return fail('worktree-status');
    if (st.stdout.trim() !== '') dirty += 1;
    const n = git(dir, ['rev-list', '--count', 'HEAD', '--not', '--remotes']);
    if (n.status !== 0) return fail('worktree-unpushed');
    unpushed += Number(n.stdout.trim()) || 0;
  }
  return { count: dirs.length, dirty, unpushed };
}

/**
 * MB-68 owns the `pending/` directory; the summary only counts the tracked files under it.
 * @returns {number|null} null when the tree cannot be read (fail closed)
 */
export function pendingCount(cwd, rev) {
  const tracked = listTracked(cwd, rev);
  if (tracked === null) return null;
  return tracked.filter((p) => p.split('/').includes('pending')).length;
}
