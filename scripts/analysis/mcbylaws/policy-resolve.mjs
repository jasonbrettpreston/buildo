// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (commit gate); plan line 31 rule 2 — "the policy is
//            read from the base". R-LF; arms H, C, P, R, L all classify with this one read.
//
// HOW the gate learns the rules that judge a commit. The policy (`mcbylaws/protected-paths.json`) is read from the BASE
// tree: `HEAD` at commit time, a commit sha at push and CI. A staged or working-tree copy is IGNORED — a commit cannot
// loosen the rules that judge it. When the base tree has NO policy at all, exactly one commit may bootstrap it: the one
// that ADDS the file, judged by its OWN copy, and ONLY when the commit touches nothing else: its whole path set is
// exactly `[POLICY_PATH]` and that entry is an `A` (a bootstrap cannot carry any other change in the same breath).
// Every other case is `cannot-decide` — never a pass, never a throw.

import { readAt } from './git-util.mjs';
import { allPaths } from './name-status.mjs';
import { POLICY_PATH, validatePolicy } from './paths.mjs';

const fail = (error) => ({ ok: false, code: 'cannot-decide', error });

/**
 * PURE: parse and validate one copy of the policy file. A missing, unparsable or invalid copy is an error string.
 * @param {string|null} text
 * @returns {{ok:true, policy:object}|{ok:false, error:string}}
 */
function readPolicyText(text) {
  if (text === null || text === undefined) return { ok: false, error: `${POLICY_PATH}: unreadable` };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `${POLICY_PATH}: invalid JSON` };
  }
  const v = validatePolicy(parsed);
  return v.ok ? { ok: true, policy: v.policy } : { ok: false, error: `${POLICY_PATH}: ${v.error}` };
}

/**
 * The commit's own copy may be judged only when the commit does nothing else: its WHOLE path set is exactly the policy
 * path and that entry is an `A`. Any other change — a Layer 2/3 path or a plain document — is not a bootstrap.
 * @param {Array<{status:string, path:string, oldPath?:string|null}>} entries
 * @returns {string|null} the reason it is not a bootstrap, or null when it is one
 */
function bootstrapBlocker(entries) {
  const adds = entries.some((e) => e && e.status === 'A' && e.path === POLICY_PATH && (e.oldPath ?? null) === null);
  if (!adds) return `no base copy of ${POLICY_PATH} and this commit does not add it`;
  const paths = allPaths(entries);
  if (paths.length !== 1 || paths[0] !== POLICY_PATH) {
    const other = paths.filter((p) => p !== POLICY_PATH);
    return `bootstrap touches ${other.length > 0 ? other[0] : POLICY_PATH} as well as ${POLICY_PATH}`;
  }
  return null;
}

/**
 * Resolve the policy that judges the commit under judgement. Never throws, never passes on an error.
 * @param {string} cwd
 * @param {string} baseRev `HEAD` (commit time) or a commit sha (push, CI)
 * @param {{ownRev?: string, entries?: Array<{status:string, path:string, oldPath:string|null}>}} [opts]
 * @returns {{ok:true, policy:object, source:'base'|'bootstrap'}|{ok:false, code:'cannot-decide', error:string}}
 */
export function resolvePolicy(cwd, baseRev, opts = {}) {
  try {
    const base = readPolicyText(readAt(cwd, baseRev, POLICY_PATH));
    if (base.ok) return { ok: true, policy: base.policy, source: 'base' };
    if (!base.error.endsWith('unreadable')) return fail(base.error);
    // No copy at the base: only the adding commit may judge itself by its own copy.
    if (typeof opts.ownRev !== 'string') return fail(`${base.error}; no bootstrap revision given`);
    if (!Array.isArray(opts.entries)) return fail(`${base.error}; no change list to bootstrap on`);
    const self = readPolicyText(readAt(cwd, opts.ownRev, POLICY_PATH));
    if (!self.ok) return fail(base.error + '; ' + self.error);
    const blocker = bootstrapBlocker(opts.entries);
    return blocker === null ? { ok: true, policy: self.policy, source: 'bootstrap' } : fail(blocker);
  } catch (e) {
    return fail(`policy read failed: ${String(e && e.message ? e.message : e)}`);
  }
}
