'use strict';
/**
 * SPEC LINK: docs/specs/00-architecture/08_agents.md §C.4
 *
 * `matchArgv(argv, policy, { repoRoot })` — a pure function (no ledger, no
 * tool-context object) so it is directly unit-testable: given an argv array
 * and the loaded policy, does ANY `bash_allow` entry match it, positionally?
 *
 * Matching rules (§C.4): literal tokens match exactly, by position;
 * `<path>` is one repo-confined, non-secret-denied path, `<path>...` is one
 * or more; `<rev>` matches `^([0-9a-f]{4,40}|HEAD(~[0-9]+)?)$`; `<int>`
 * matches `^[0-9]{1,5}$`; `<range>` matches `^[0-9]+,[0-9]+$`; `<slug>`
 * matches `^[a-z0-9_]+$`; `<validator>` must be a member of `policy.validators`.
 * Any token beginning with `-` that is not accounted for by the matched
 * entry's own `flags` list is `FLAG_NOT_ALLOWED` — never silently ignored.
 */

const { resolveConfinedPath, toRepoRelativePosix, isSecretDenied, PathDeniedError } = require('./exec-path');

const SIMPLE_PLACEHOLDER_PATTERNS = {
  '<rev>': /^([0-9a-f]{4,40}|HEAD(~[0-9]+)?)$/,
  '<int>': /^[0-9]{1,5}$/,
  '<range>': /^[0-9]+,[0-9]+$/,
  '<slug>': /^[a-z0-9_]+$/,
};

function isPlaceholderToken(tok) {
  return typeof tok === 'string' && tok.startsWith('<') && tok.endsWith('>');
}

function isConfinedPath(token, ctx) {
  if (typeof token !== 'string' || token.length === 0 || token.startsWith('-')) {
    return false;
  }
  let absPath;
  try {
    absPath = resolveConfinedPath(ctx.repoRoot, token);
  } catch (err) {
    if (err instanceof PathDeniedError) {
      return false;
    }
    throw err;
  }
  const relPosix = toRepoRelativePosix(ctx.repoRoot, absPath);
  return !isSecretDenied(relPosix, ctx.secretGlobs || []);
}

function matchesPlaceholder(placeholder, token, ctx) {
  if (placeholder === '<path>') {
    return isConfinedPath(token, ctx);
  }
  if (placeholder === '<validator>') {
    return Array.isArray(ctx.validators) && ctx.validators.includes(token);
  }
  const re = SIMPLE_PLACEHOLDER_PATTERNS[placeholder];
  return re ? re.test(token) : false;
}

function buildFlagUnits(flags) {
  const units = [];
  for (let i = 0; i < flags.length; i++) {
    const tok = flags[i];
    const next = flags[i + 1];
    if (!isPlaceholderToken(tok) && isPlaceholderToken(next) && next !== '<path>...') {
      units.push({ kind: 'pair', flag: tok, placeholder: next });
      i++;
    } else {
      units.push({ kind: 'single', token: tok });
    }
  }
  return units;
}

/**
 * matchEntry — returns `{ matched: true }`, `{ matched: false }`, or
 * `{ matched: false, flagNotAllowed: token }` (a POSITIONAL match that then
 * failed on an unrecognised flag — distinguishes FLAG_NOT_ALLOWED from
 * COMMAND_NOT_ALLOWED at the caller).
 */
function matchEntry(argv, entry, ctx) {
  const fixed = entry.argv;
  let ai = 0;
  for (const tok of fixed) {
    if (tok === '<path>...') {
      if (ai >= argv.length || !isConfinedPath(argv[ai], ctx)) {
        return { matched: false };
      }
      let consumed = 0;
      while (ai < argv.length && !argv[ai].startsWith('-')) {
        if (!isConfinedPath(argv[ai], ctx)) {
          return { matched: false };
        }
        ai++;
        consumed++;
      }
      if (consumed === 0) {
        return { matched: false };
      }
      continue;
    }
    if (isPlaceholderToken(tok)) {
      if (ai >= argv.length || !matchesPlaceholder(tok, argv[ai], ctx)) {
        return { matched: false };
      }
      ai++;
      continue;
    }
    if (argv[ai] !== tok) {
      return { matched: false };
    }
    ai++;
  }

  const units = buildFlagUnits(entry.flags || []);
  const hasPathTailUnit = units.some((u) => u.kind === 'single' && u.token === '<path>...');
  let fi = ai;
  while (fi < argv.length) {
    const tok = argv[fi];
    if (!tok.startsWith('-')) {
      if (!hasPathTailUnit || !isConfinedPath(tok, ctx)) {
        return { matched: false, flagNotAllowed: tok };
      }
      fi++;
      continue;
    }
    const single = units.find((u) => u.kind === 'single' && u.token === tok);
    if (single) {
      fi++;
      continue;
    }
    const pair = units.find((u) => u.kind === 'pair' && u.flag === tok);
    if (pair) {
      const value = argv[fi + 1];
      if (value === undefined || !matchesPlaceholder(pair.placeholder, value, ctx)) {
        return { matched: false, flagNotAllowed: tok };
      }
      fi += 2;
      continue;
    }
    return { matched: false, flagNotAllowed: tok };
  }
  return { matched: true };
}

/**
 * matchArgv(argv, policy, { repoRoot }) → `{ allowed: true }` or
 * `{ allowed: false, code: 'COMMAND_NOT_ALLOWED'|'FLAG_NOT_ALLOWED', reason }`.
 */
function matchArgv(argv, policy, { repoRoot } = {}) {
  if (!Array.isArray(argv) || argv.length === 0) {
    return { allowed: false, code: 'COMMAND_NOT_ALLOWED', reason: 'empty argv' };
  }
  if (!repoRoot) {
    throw new Error('matchArgv requires { repoRoot }');
  }
  const allow = (policy && policy.bash_allow) || [];
  const ctx = { repoRoot, validators: (policy && policy.validators) || [], secretGlobs: (policy && policy.secret_read_deny) || [] };

  let bestFlagRejection = null;
  for (const entry of allow) {
    const result = matchEntry(argv, entry, ctx);
    if (result.matched) {
      return { allowed: true };
    }
    if (result.flagNotAllowed && !bestFlagRejection) {
      bestFlagRejection = result.flagNotAllowed;
    }
  }
  if (bestFlagRejection) {
    return { allowed: false, code: 'FLAG_NOT_ALLOWED', reason: `flag not allowed: ${bestFlagRejection}` };
  }
  return { allowed: false, code: 'COMMAND_NOT_ALLOWED', reason: 'argv does not match any allowlist entry' };
}

module.exports = { matchArgv };
