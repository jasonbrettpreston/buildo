'use strict';
/**
 * SPEC LINK: docs/specs/00-architecture/08_agents.md §C.6.1
 *
 * A minimal, PURE glob matcher for `write_scope` globs (F13/§C.6): `**` = any
 * depth, `*` = within one path segment, everything else literal. Forward-
 * slash normalised so it works identically on a Windows-style `\` path or a
 * repo-relative POSIX path. Deliberately separate from
 * `scripts/lib/exec-path.js`'s own glob translator (used for `secret_read_deny`
 * / the self-protection denylist) rather than shared — this module has no
 * `fs` dependency at all, so it stays trivially unit-testable and has no
 * coupling to path-confinement logic.
 */

function globToRegExp(glob) {
  const normalized = String(glob).split('\\').join('/');
  let re = '';
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (c === '*' && normalized[i + 1] === '*') {
      i++;
      if (normalized[i + 1] === '/') {
        re += '(?:.*/)?';
        i++;
      } else {
        re += '.*';
      }
    } else if (c === '*') {
      re += '[^/]*';
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

/**
 * matchGlob(glob, relPosixPath) — true iff `relPosixPath` matches `glob`.
 * Both arguments are normalised to forward slashes first.
 */
function matchGlob(glob, relPath) {
  const normalizedPath = String(relPath).split('\\').join('/');
  return globToRegExp(glob).test(normalizedPath);
}

/**
 * matchesAnyGlob(globs, relPosixPath) — true iff at least one glob in the
 * array matches. An empty/missing glob list matches nothing (fail closed —
 * callers that mean "no restriction" must check `globs.length === 0`
 * themselves, this function never treats "no globs" as "everything").
 */
function matchesAnyGlob(globs, relPath) {
  if (!Array.isArray(globs) || globs.length === 0) {
    return false;
  }
  return globs.some((g) => matchGlob(g, relPath));
}

module.exports = { globToRegExp, matchGlob, matchesAnyGlob };
