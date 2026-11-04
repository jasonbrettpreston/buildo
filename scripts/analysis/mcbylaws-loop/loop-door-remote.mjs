// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-MC (PR-79f-1 clause (2), the pushed-ruling condition; O-29 "0-29 yes")
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-79/f/plan.v9.1.md section 2.3 `authority (b)` (X-2, X-3, X-4, grounder R1-1, adversary R1-1)
// authority (b), commit and push modes only (NOT ci): for each ref R under refs/remotes/origin/ (the one push remote, X-2),
// M = merge-base(R, <prereg parent>). An exit 1 (no common ancestor: an orphan or imported ref) SKIPS that ref; any other failure
// PROPAGATES. At each distinct M the register row of a cited id must be RATIFIED/RULED with `#<ref>` in it, and its decisions log
// must hold the decision. The result lists, per `<id>#<ref>`, the {row, decision} of every passing M (the case token is then checked
// against these by loop-door-authority.mjs). A speed bump, not a guarantee: a shell can make a ref under refs/remotes/origin/.
import { git } from './loop-gate.mjs';
import { registerAt, decisionsAt } from './loop-door-git.mjs';
import { rowOf, statusOf, refInRow, stemOf } from './loop-door-authority.mjs';

const NRO = '--no-replace-objects';
const AUTHORITY = new Set(['RATIFIED', 'RULED']);

/** merge-base(R, parent): the sha, or null on exit 1 (no common ancestor); any other failure THROWS (grounder R1-1). */
function mergeBaseOrSkip(root, ref, parent) {
  try {
    return git(root, [NRO, 'merge-base', ref, parent]).trim() || null;
  } catch (err) {
    if (err && err.status === 1) return null;
    throw err;
  }
}

/** The refs of the push remote `origin`, newest commit first (refs/remotes/origin/HEAD, a symbolic ref, is left out). */
function originRefs(root) {
  const out = git(root, [NRO, 'for-each-ref', '--sort=-committerdate', '--format=%(refname)', 'refs/remotes/origin/']);
  return String(out).split('\n').map((s) => s.trim()).filter((r) => r && r !== 'refs/remotes/origin/HEAD');
}

/**
 * `{"<id>#<ref>": [{row, decision}]}` for the given keys `[{id, ref}]`, judged at the merge bases of the origin refs with `parent`.
 * A key with an empty list has no passing M (`oracle_door_ruling_not_pushed`). The walk stops once every key has a passing M.
 */
export function pushedAuthority(root, { parent, keys }) {
  const wanted = (Array.isArray(keys) ? keys : []).filter((k) => k && typeof k.id === 'string' && typeof k.ref === 'string');
  const out = {};
  for (const k of wanted) out[`${k.id}#${k.ref}`] = [];
  if (!parent || !wanted.length) return out;
  const seen = new Set();
  for (const ref of originRefs(root)) {
    const m = mergeBaseOrSkip(root, ref, parent);
    if (!m || seen.has(m)) continue;
    seen.add(m);
    const register = registerAt(root, m);
    if (register === null) continue;
    const rows = wanted.map((k) => ({ k, row: rowOf(register, k.id) }));
    const stems = rows.map(({ k, row }) => (row ? stemOf(row, k.ref) : null)).filter(Boolean);
    const logs = decisionsAt(root, m, stems);
    for (const { k, row } of rows) {
      if (row === null || !AUTHORITY.has(statusOf(register, k.id)) || !refInRow(row, k.ref)) continue;
      const stem = stemOf(row, k.ref);
      const log = stem ? logs[stem] : null;
      const decision = log && Array.isArray(log.decisions) ? log.decisions.find((d) => d && d.id === k.ref) || null : null;
      if (!decision) continue;
      out[`${k.id}#${k.ref}`].push({ row, decision });
    }
    if (wanted.every((k) => out[`${k.id}#${k.ref}`].length > 0)) break;
  }
  return out;
}
