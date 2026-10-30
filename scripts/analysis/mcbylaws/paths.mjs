// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md R-KP (protected paths), R-LD (layer 2/3 scope);
//            plan section 3 (MB-67): mcbylaws/protected-paths.json, glob semantics, dead-glob lint (H7, L10, G67-10c/E9)
//
// PURE: no git, no fs. The gate reads the BASE copy of the policy file and asks this module what it says.
// `validatePolicy` fails closed: a malformed or partial policy is never read as an empty (permissive) one.

export const POLICY_PATH = 'mcbylaws/protected-paths.json';

const GLOB_LISTS = ['pending_globs', 'layer23', 'protected', 'literal_scope', 'literal_exempt'];
const STRING_LISTS = ['held_dirs', 'worktrees'];
const REQUIRED = [...GLOB_LISTS, ...STRING_LISTS, 'held_limit', 'boot1', 'external_arms'];

const isStr = (s) => typeof s === 'string' && s.length > 0 && !s.includes('\0');
const bad = (error) => ({ ok: false, error });
const badKey = (key) => bad(`${key}: must be ${key === 'held_limit' ? 'a positive integer' : 'valid'}`);

/** A glob is invalid when empty, ends with `/`, or contains a backslash. */
const validGlob = (g) => isStr(g) && !g.endsWith('/') && !g.includes('\\');

function checkKey(key, v) {
  if (GLOB_LISTS.includes(key)) return Array.isArray(v) && v.every(validGlob) ? null : key;
  if (STRING_LISTS.includes(key)) return Array.isArray(v) && v.every(isStr) ? null : key;
  if (key === 'held_limit') return Number.isInteger(v) && v > 0 ? null : key;
  if (key === 'boot1') {
    const ok = v && typeof v === 'object' && !Array.isArray(v)
      && Array.isArray(v.tasks) && v.tasks.every(isStr)
      && Array.isArray(v.exempt_ids) && v.exempt_ids.every(isStr);
    return ok ? null : key;
  }
  if (key === 'external_arms') {
    const ok = Array.isArray(v) && v.every((a) => a && typeof a === 'object'
      && isStr(a.id) && typeof a.required === 'boolean');
    return ok ? null : key;
  }
  return key;
}

/**
 * @param {unknown} obj a parsed policy file
 * @returns {{ok:true, policy:object}|{ok:false, error:string}}
 */
export function validatePolicy(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return bad('policy: must be an object');
  for (const key of REQUIRED) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) return bad(`${key}: missing`);
    const why = checkKey(key, obj[key]);
    if (why) return badKey(why);
  }
  return { ok: true, policy: obj };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Anchored RegExp for one glob. `**\/` matches zero or more leading directories; a trailing `/**`
 * matches one or more segments; `*` any run without `/`; `?` one character without `/`; rest literal.
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  let re = '';
  let rest = String(glob);
  while (rest.length > 0) {
    if (rest.startsWith('**/')) {
      re += '(?:[^/]+/)*';
      rest = rest.slice(3);
    } else if (rest === '/**') {
      re += '/.+';
      rest = '';
    } else if (rest.startsWith('**')) {
      re += '.*';
      rest = rest.slice(2);
    } else if (rest[0] === '*') {
      re += '[^/]*';
      rest = rest.slice(1);
    } else if (rest[0] === '?') {
      re += '[^/]';
      rest = rest.slice(1);
    } else {
      re += escapeRe(rest[0]);
      rest = rest.slice(1);
    }
  }
  return new RegExp(`^${re}$`);
}

/** @param {string[]} globs @param {string} p */
export function matchesAny(globs, p) {
  return (globs || []).some((g) => globToRegExp(g).test(p));
}

/**
 * @param {object} policy a validated policy
 * @param {string} p a repo-relative path
 * @returns {{layer23:boolean, protected:boolean, literalExempt:boolean, literalScope:boolean}}
 */
export function classify(policy, p) {
  return {
    layer23: matchesAny(policy.layer23, p),
    protected: matchesAny(policy.protected, p),
    literalExempt: matchesAny(policy.literal_exempt, p),
    literalScope: matchesAny(policy.literal_scope, p),
  };
}

/**
 * Every `layer23` / `literal_scope` glob that matches no tracked path and is NOT pending (H7, L10, E9).
 * @param {object} policy a validated policy
 * @param {string[]} tracked repo-relative tracked paths
 * @returns {Array<{list:string, glob:string}>}
 */
export function deadGlobs(policy, tracked) {
  const pending = policy.pending_globs || [];
  const out = [];
  for (const list of ['layer23', 'literal_scope']) {
    for (const glob of policy[list] || []) {
      if (pending.includes(glob)) continue;
      if ((tracked || []).some((p) => globToRegExp(glob).test(p))) continue;
      out.push({ list, glob });
    }
  }
  return out;
}
