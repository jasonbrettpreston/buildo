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

/**
 * normalizeGlob(glob) — Step 9 panel fold, F-DS7: strips a leading `./`,
 * converts backslashes to forward slashes, and collapses repeated slashes,
 * so `./src/**`, `src\\**` and `src//**` all normalise to the same string
 * before any prefix/anchoring comparison. Pure string transform, no `fs`.
 */
function normalizeGlob(glob) {
  let g = String(glob).split('\\').join('/');
  if (g.startsWith('./')) {
    g = g.slice(2);
  }
  g = g.replace(/\/{2,}/g, '/');
  return g;
}

/**
 * isAnchoredGlob(glob) — Step 9 panel fold, F-II2: a `write_scope` glob is
 * "directory-anchored" iff its FIRST path segment (after normalisation) is a
 * non-empty literal — no leading `*` or `**`. This is what closes the
 * `scopesOverlap` false-positive class where an unanchored glob like `*.md`
 * (whose globPrefix is the empty string) is treated as overlapping every
 * other scope, because `''.startsWith(x)` is only true for `x === ''` while
 * `x.startsWith('')` is ALWAYS true. An unanchored glob (or one that
 * normalises to the empty string, e.g. `.` or `""`) is refused at brief-
 * parse time (`SCOPE_GLOB_UNANCHORED`) rather than patched around here.
 *
 * The literal, bare `**` is the ONE deliberate exception: it is the
 * documented, everywhere-used "the whole repo" scope (§C.6.1: "`**` = any
 * depth"; the default in every test harness's `writeBrief()` and in the
 * runbook's own examples) — an intentional, honest declaration that the
 * task's write_scope really is the entire tree, not an accidental basename
 * glob. Its prefix is ALSO the empty string (same mechanism as `*.md`), so
 * it legitimately "overlaps" every other scope in `scopesOverlap` — that is
 * correct, not a false positive, for a run that truly claims everything.
 * A double-star glob with anything AFTER its slash (matching `foo.ts`
 * anywhere in the tree, say) is NOT exempted: its first segment is `**` too,
 * but it is the `*.md` problem shape, not the deliberate catch-all.
 */
function isAnchoredGlob(glob) {
  const normalized = normalizeGlob(glob);
  if (normalized === '**') {
    return true;
  }
  if (normalized.length === 0) {
    return false;
  }
  const first = normalized.split('/')[0];
  return first.length > 0 && !first.startsWith('*');
}

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

module.exports = { globToRegExp, matchGlob, matchesAnyGlob, normalizeGlob, isAnchoredGlob };
