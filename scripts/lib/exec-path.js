'use strict';
/**
 * SPEC LINK: docs/specs/00-architecture/08_agents.md §C.1.3, §C.1.5
 *
 * Path confinement (§C.1.3) and the secret-read-deny glob matcher (§C.1.5),
 * shared by every tool handler in scripts/lib/exec-tools.js and by the
 * run_bash_command argv matcher (scripts/lib/exec-policy-match.js). One
 * definition of "is this path inside the repo" and "is this path a secret",
 * required by more than one of those consumers.
 */

const fs = require('fs');
const path = require('path');

class PathDeniedError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PathDeniedError';
    this.code = code;
  }
}

/**
 * resolveConfinedPath(repoRoot, inputPath) — §C.1.3: resolve via
 * `fs.realpathSync` on the DEEPEST EXISTING ancestor (so a symlink/junction
 * escape is caught even for a not-yet-existing target, e.g. a new file to
 * write), then assert the result lies under the repo root's own realpath.
 * Throws `PathDeniedError('PATH_OUTSIDE_REPO')` on escape. Returns the
 * absolute, ancestor-realpath-resolved path (NOT necessarily realpath'd all
 * the way down — the leaf itself may not exist yet).
 */
function resolveConfinedPath(repoRoot, inputPath) {
  if (typeof inputPath !== 'string' || inputPath.length === 0 || inputPath.includes('\0')) {
    throw new PathDeniedError('PATH_OUTSIDE_REPO', 'empty or invalid path argument');
  }
  const candidate = path.isAbsolute(inputPath) ? path.normalize(inputPath) : path.resolve(repoRoot, inputPath);

  let ancestor = candidate;
  while (!fs.existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) {
      break; // reached filesystem root without finding anything that exists
    }
    ancestor = parent;
  }

  let realAncestor;
  try {
    realAncestor = fs.realpathSync(ancestor);
  } catch (err) {
    throw new PathDeniedError('PATH_OUTSIDE_REPO', `unable to resolve path: ${err.message}`);
  }
  const suffix = path.relative(ancestor, candidate);
  const resolved = suffix ? path.join(realAncestor, suffix) : realAncestor;

  const realRepoRoot = fs.realpathSync(repoRoot);
  const isInside = resolved === realRepoRoot || resolved.startsWith(realRepoRoot + path.sep);
  if (!isInside) {
    throw new PathDeniedError('PATH_OUTSIDE_REPO', `path escapes repo root: ${inputPath}`);
  }
  return resolved;
}

/**
 * toRepoRelativePosix — the ledger and the secret-glob matcher both want a
 * forward-slash, repo-relative path regardless of OS.
 */
function toRepoRelativePosix(repoRoot, absPath) {
  const realRepoRoot = fs.realpathSync(repoRoot);
  const rel = path.relative(realRepoRoot, absPath);
  return rel.split(path.sep).join('/');
}

/**
 * globToRegExp — minimal glob translator covering exactly the shapes used
 * in policy globs: literal segments, `*` (no `/`), and `**` (zero or more
 * path segments, only meaningful adjacent to `/`).
 */
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') {
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
 * isSecretDenied(relPosixPath, globs) — §C.1.5's `secret_read_deny` list. A
 * pattern with no `/` matches against the basename only (`*.key` denies a
 * key file anywhere in the tree); a pattern with `/` matches the full
 * repo-relative path.
 */
function isSecretDenied(relPosixPath, globs) {
  if (!Array.isArray(globs) || globs.length === 0) {
    return false;
  }
  const base = relPosixPath.split('/').pop();
  return globs.some((pattern) => {
    const re = globToRegExp(pattern);
    return pattern.includes('/') ? re.test(relPosixPath) : re.test(base);
  });
}

module.exports = {
  resolveConfinedPath,
  toRepoRelativePosix,
  isSecretDenied,
  globToRegExp,
  PathDeniedError,
};
