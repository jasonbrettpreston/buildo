// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-MC (PR-79f-1, the oracle-first door; MB-79 (f), 2026-11-03-batch-aw)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-79/f/plan.v9.1.md section 2.3 (diffs, history, authority (a)) and the catch-versus-propagate table (P-18)
// The door's git readers. Every call goes through loop-gate.mjs `git()` / `gitStaged` (64 MB buffer, GIT_* scrubbed; P-17), never
// loop-prereg.mjs gitTemp, and carries `--no-replace-objects` (P-8). Diffs and register reads answer null on failure (named codes
// downstream); log, rev-list, merge-base and a commit that cannot be resolved PROPAGATE (buildContext throws, the gate exits 2).
import { git, gitStaged } from './loop-gate.mjs';

export const REGISTER_PARTS = ['docs/specs/01-pipeline/69a_mcbylaw_register.md', 'docs/specs/01-pipeline/69_mcbylaw_policy.md'];
export const DECISIONS_DIR = 'docs/reports/decisions';
export const ABSENT = 'ABSENT';
const NRO = '--no-replace-objects';
const DIFF_OPTS = ['-U0', '--no-color', '--no-ext-diff', '--no-textconv', '-M'];
const STEM_RE = /^[A-Za-z0-9._-]+$/;

const lines = (text) => String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);
const tryRead = (fn) => {
  try {
    return fn();
  } catch {
    return null;
  }
};

/** The STAGED diff of one path (the hook's trusted index, `gitStaged`), or null when git fails. */
export function stagedDiff(root, p) {
  return tryRead(() => gitStaged(root, [NRO, '--literal-pathspecs', 'diff', '--cached', ...DIFF_OPTS, '--', p]));
}

/** The NET diff of one path over `base..tip`, or null when git fails. */
export function rangeDiff(root, base, tip, p) {
  return tryRead(() => git(root, [NRO, '--literal-pathspecs', 'diff', ...DIFF_OPTS, `${base}..${tip}`, '--', p]));
}

/** The blob of `file` at `rev` (`:index` = the staged copy), or null when it is not there. A bad commit PROPAGATES. */
export function blobAt(root, rev, file) {
  if (rev === ':index') {
    const out = tryRead(() => gitStaged(root, [NRO, '--literal-pathspecs', 'ls-files', '-s', '--', file]));
    const meta = String(out || '').split('\t')[0] || '';
    return meta.trim().split(' ')[1] || null;
  }
  git(root, [NRO, 'rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
  const out = tryRead(() => git(root, [NRO, 'rev-parse', '--verify', '--quiet', `${rev}:${file}`]));
  return out && out.trim() ? out.trim() : null;
}

/** `a` is a strict ancestor of `b` (P-15): exit 0 true, exit 1 false, any other status THROWS. */
export function isStrictAncestor(root, a, b) {
  if (!a || !b || a === b) return false;
  try {
    git(root, [NRO, 'merge-base', '--is-ancestor', a, b]);
    return true;
  } catch (err) {
    if (err && err.status === 1) return false;
    throw err;
  }
}

/** The first parent of `sha`, or null for a root commit. A sha that is not a commit PROPAGATES. */
export function parentOf(root, sha) {
  git(root, [NRO, 'rev-parse', '--verify', '--quiet', `${sha}^{commit}`]);
  const out = tryRead(() => git(root, [NRO, 'rev-parse', '--verify', '--quiet', `${sha}^`]));
  return out && out.trim() ? out.trim() : null;
}

/**
 * The prereg's history (2.3, F-1, F-3, P-16): every commit that touched it, oldest first, by `log --full-history --topo-order --reverse`
 * from `tip`, each with its blob (`ABSENT` where the commit removed the file); the first commit's files; the tip blob (`:index` at commit).
 */
export function preregHistory(root, preregFile, tip, mode) {
  const from = mode === 'commit' ? 'HEAD' : tip;
  const shas = lines(git(root, [NRO, '--literal-pathspecs', 'log', '--full-history', '--topo-order', '--reverse', '--format=%H', from, '--', preregFile]));
  const commits = shas.map((sha, i) => ({
    sha,
    blob: blobAt(root, sha, preregFile) || ABSENT,
    files: i === 0 ? lines(git(root, [NRO, 'show', '--name-only', '--format=', sha])) : [],
  }));
  const tipBlob = blobAt(root, mode === 'commit' ? ':index' : tip, preregFile);
  return { commits, tipBlob };
}

/**
 * The work commits of the range for `_not_before` (P-14): the shas of `rev-list --reverse base..tip`, zipped with the per-commit lists
 * (perCommitNameStatus order, NEVER ctx.commits with its appended union list), each with whether the prereg's first commit is its strict
 * ancestor. At commit time the one work item is the staged change, which descends from the first commit when that is HEAD or HEAD's ancestor.
 */
export function workCommits(root, { mode, base, tip, perCommit, first }) {
  if (!first) return [];
  if (mode === 'commit') {
    const head = git(root, [NRO, 'rev-parse', 'HEAD']).trim();
    const paths = (Array.isArray(perCommit) ? perCommit : []).flat().map((r) => r.p);
    return [{ sha: ':index', paths, descends: head === first || isStrictAncestor(root, first, head) }];
  }
  const shas = lines(git(root, [NRO, 'rev-list', '--reverse', `${base}..${tip}`]));
  const lists = Array.isArray(perCommit) ? perCommit : [];
  return shas.map((sha, i) => ({
    sha,
    paths: (Array.isArray(lists[i]) ? lists[i] : []).map((r) => r.p),
    descends: isStrictAncestor(root, first, sha),
  }));
}

/** The register text (69a + Spec 69) at `rev`, or null when `rev` is null (a root prereg commit) or no part can be read. */
export function registerAt(root, rev) {
  if (!rev) return null;
  const parts = REGISTER_PARTS.map((rel) => tryRead(() => git(root, [NRO, 'show', `${rev}:${rel}`])));
  if (parts.every((p) => p === null)) return null;
  return parts.filter((p) => p !== null).join('\n');
}

/** The decisions logs `docs/reports/decisions/<stem>.json` at `rev`: `{stem: parsed | null}` (null when absent or unparsable). */
export function decisionsAt(root, rev, stems) {
  const out = {};
  for (const stem of [...new Set(Array.isArray(stems) ? stems : [])]) {
    if (!rev || typeof stem !== 'string' || !STEM_RE.test(stem)) {
      out[stem] = null;
      continue;
    }
    const text = tryRead(() => git(root, [NRO, 'show', `${rev}:${DECISIONS_DIR}/${stem}.json`]));
    out[stem] = tryRead(() => (text === null ? null : JSON.parse(text)));
  }
  return out;
}
