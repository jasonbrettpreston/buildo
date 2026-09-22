'use strict';
/**
 * SPEC LINK: docs/specs/00-architecture/08_agents.md §C.1, §C.2
 *
 * The engine's tool dispatch table. `createTools({ repoRoot, policy, ledger,
 * runState })` returns `{ schemas, dispatch(name, args) }`:
 *   - `schemas` is the OpenAI/DeepSeek `tools` array (function-calling shape)
 *     derived from the same JSON Schemas used to validate incoming calls —
 *     one definition, two consumers.
 *   - `dispatch(name, args)` validates the call against §C.2 BEFORE any
 *     handler runs (§C.1.10, fail-closed on a malformed call: unknown tool
 *     name, `additionalProperties:false` violation, missing required field,
 *     or a wrong-typed field all throw `MalformedToolCallError` synchronously
 *     — the loop in scripts/deepseek-exec.js turns that into an `error`
 *     ledger record and aborts the run WITHOUT the handler ever executing).
 *
 * Commit 2 shipped every tool as a schema-validated stub returning
 * `{ ok:false, error:{ code:'NOT_IMPLEMENTED' } }`. Commit 3 added real
 * `read_file`/`grep_files` handlers, both path-confined (§C.1.3) and
 * secret-fenced (§C.1.5's `secret_read_deny`), populating `runState.readState`
 * for §C.1.6's read-before-write tracking. Commit 4 (this file's current
 * state) adds `write_file`/`edit_file` (both gated by the same read-before-
 * write + staleness check) and `run_bash_command` (argv-form only, matched
 * against `scripts/lib/exec-policy.json` via `scripts/lib/exec-policy-match.js`,
 * spawnSync-free). All five mutating tools carry a pre/post worktree capture
 * (`scripts/lib/exec-worktree.js`, §C.3/F10) on their ledger record. Phase 2
 * commit 10 adds the self-protection denylist (commit 7), secret fences
 * (commit 8), the Windows cmd.exe route hardening (commit 6) and, finally,
 * `git_commit` itself — the ONLY sanctioned commit path (§C.1.8): enumerated
 * `paths` gated on PATH_NOT_LEDGERED (each must be a successful write_file/
 * edit_file target this run, tracked at `runState.writtenPaths`), a refused-
 * flags list (`--no-verify` etc., never stripped-and-retried), and a
 * single-committer advisory lock held for the commit's duration. Phase 3
 * commit 11 (F14) adds `checkClaudeOnly` — `exec-policy.json`'s new
 * `claude_only_globs` list, gating write_file/edit_file/git_commit.paths
 * right after the C.6.2 reserved-registries check, blocked code
 * `PATH_CLAUDE_ONLY`.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');
const { resolveConfinedPath, toRepoRelativePosix, isSecretDenied, PathDeniedError } = require('./exec-path');
const { scrubbedEnv } = require('./exec-env');
const { redact } = require('./exec-ledger');
const { captureWorktree } = require('./exec-worktree');
const { matchArgv } = require('./exec-policy-match');
const { matchesAnyGlob } = require('./exec-glob');

class MalformedToolCallError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MalformedToolCallError';
  }
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function pathFault(err) {
  if (err instanceof PathDeniedError) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  throw err;
}

// §C.1.4 (G10, F11) — the engine's own source, policy and the repo's own
// gate infrastructure are unwritable, uneditable and un-`bash`-reachable. A
// FROZEN constant in the TOOL LAYER, never policy data the model could edit
// (exec-policy.json is itself on this list). Reads remain allowed (§C.1.4:
// "Reads of these remain allowed except where C.1.5 denies them") — this
// list gates write_file/edit_file/git_commit.paths and bash argv only.
const SELF_PROTECT_DENYLIST = Object.freeze([
  'scripts/deepseek-exec.js',
  'scripts/lib/exec-tools.js',
  'scripts/lib/exec-ledger.js',
  'scripts/lib/exec-policy.json',
  '.husky/**',
  '.git/**',
  'package.json',
  'package-lock.json',
  'eslint.config.mjs',
  'vitest.config.ts',
  'tsconfig.json',
  'src/tests/hooks-composition.infra.test.ts',
  'src/tests/agent-roster.infra.test.ts',
  'src/tests/deepseek-exec*.test.ts',
]);

// The ledger directory resolves at RUNTIME (outside the repo by design, F11)
// so it cannot be a static repo-relative glob; it is checked separately by
// absolute-path prefix, in addition to the static list above.
function isSelfProtectedRelPath(relPosixPath) {
  return isSecretDenied(relPosixPath, SELF_PROTECT_DENYLIST);
}

function realLedgerDirOf(ledgerDirAbs) {
  if (!ledgerDirAbs) {
    return null;
  }
  try {
    return fs.realpathSync(ledgerDirAbs);
  } catch {
    return path.resolve(ledgerDirAbs); // ledger dir may not exist yet in a given test
  }
}

function isUnderLedgerDir(absPath, ledgerDirAbs) {
  const realLedgerDir = realLedgerDirOf(ledgerDirAbs);
  if (!realLedgerDir) {
    return false;
  }
  return absPath === realLedgerDir || absPath.startsWith(realLedgerDir + path.sep);
}

// A bash argv token pointing at the ledger dir is checked WITHOUT going
// through resolveConfinedPath first — the ledger dir lives OUTSIDE the repo
// by design (F11), so §C.1.3 confinement would already reject it, but with
// the generic COMMAND_NOT_ALLOWED/FLAG_NOT_ALLOWED an allowlist mismatch
// produces, not the more specific PATH_DENIED this fence exists to report.
function bashTokenResolvesUnderLedgerDir(repoRoot, tok, ledgerDirAbs) {
  const realLedgerDir = realLedgerDirOf(ledgerDirAbs);
  if (!realLedgerDir) {
    return false;
  }
  const candidate = path.isAbsolute(tok) ? path.normalize(tok) : path.resolve(repoRoot, tok);
  let real;
  try {
    real = fs.realpathSync(candidate);
  } catch {
    real = candidate;
  }
  return real === realLedgerDir || real.startsWith(realLedgerDir + path.sep)
    || candidate === realLedgerDir || candidate.startsWith(realLedgerDir + path.sep);
}

/**
 * bashSelfProtectionBlock(argv, ctx) — §C.1.4 scan over every non-flag argv
 * token: does it resolve to a self-protected repo file, or into the ledger
 * directory? Runs BEFORE matchArgv (invariant order: confinement/self-
 * protection, §C.1.3/§C.1.4, precede the allowlist, §C.1.7) so a self-
 * protection breach is reported as PATH_DENIED, not an allowlist mismatch.
 */
function bashSelfProtectionBlock(argv, ctx) {
  const { repoRoot } = ctx;
  const ledgerDirAbs = ctx.ledger && ctx.ledger.path ? path.dirname(ctx.ledger.path) : null;
  for (const tok of argv) {
    if (typeof tok !== 'string' || tok.length === 0 || tok.startsWith('-')) {
      continue;
    }
    if (bashTokenResolvesUnderLedgerDir(repoRoot, tok, ledgerDirAbs)) {
      return { ok: false, error: { code: 'PATH_DENIED', message: 'self-protection: the run ledger directory is unreachable by any tool' } };
    }
    let absPath;
    try {
      absPath = resolveConfinedPath(repoRoot, tok);
    } catch {
      continue; // outside the repo and not the ledger dir — §C.1.3 confinement handles this at match time
    }
    const relPosix = toRepoRelativePosix(repoRoot, absPath);
    if (isSelfProtectedRelPath(relPosix)) {
      return { ok: false, error: { code: 'PATH_DENIED', message: `self-protection: ${relPosix} is part of the engine's own gate infrastructure` } };
    }
  }
  return null;
}

/**
 * checkSelfProtection(absPath, relPosix, ctx) — §C.1.4, invariant order
 * position 4 (immediately after path confinement, position 3, and before
 * every other fence). Returns a blocked toolResult or `null`.
 */
function checkSelfProtection(absPath, relPosix, ctx) {
  if (isSelfProtectedRelPath(relPosix)) {
    return { ok: false, error: { code: 'PATH_DENIED', message: `self-protection: ${relPosix} is part of the engine's own gate infrastructure and cannot be written` } };
  }
  const ledgerDirAbs = ctx.ledger && ctx.ledger.path ? path.dirname(ctx.ledger.path) : null;
  if (isUnderLedgerDir(absPath, ledgerDirAbs)) {
    return { ok: false, error: { code: 'PATH_DENIED', message: 'self-protection: the run ledger directory is unreachable by any tool' } };
  }
  return null;
}

// §C.6.2 (F13, commit 10b) — orchestrator-only registries. A write here is
// PATH_RESERVED even when the brief's write_scope names the file: scope
// cannot widen past policy. Evaluated BEFORE write_scope (§C.6 evaluation
// order: confinement -> self-protection -> C.6.2 reserved -> C.6.1 scope ->
// secrets -> read-state) — a scope of `scripts/**` does not rescue a write
// to `scripts/manifest.json`.
function checkRegistryReserved(relPosix, ctx) {
  const reserved = (ctx.policy && ctx.policy.registry_reserved) || [];
  if (reserved.includes(relPosix)) {
    return { ok: false, error: { code: 'PATH_RESERVED', message: `${relPosix} is an orchestrator-only registry; the engine ships code and tests, the landing commit performs registry edits` } };
  }
  return null;
}

// F14 (commit 11) — `claude_only_globs`: money/auth/PII/migrations paths are
// never engine-writable, regardless of provider or the brief's write_scope
// (the §B money/auth/PII/migrations downgrade, enforced here as
// PATH_CLAUDE_ONLY rather than left to brief discipline alone). Evaluated
// right after C.6.2's reserved-registries check and BEFORE C.6.1's write
// scope (§C.6 evaluation order) — a scope of `migrations/**` does not rescue
// a write to `migrations/0001_add_col.sql`, mirroring checkRegistryReserved.
function checkClaudeOnly(relPosix, ctx) {
  const globs = (ctx.policy && ctx.policy.claude_only_globs) || [];
  if (matchesAnyGlob(globs, relPosix)) {
    return { ok: false, error: { code: 'PATH_CLAUDE_ONLY', message: `${relPosix} is money/auth/PII/migrations-classed (§B) — Claude-only, never engine-writable` } };
  }
  return null;
}

// §C.6.1 (F13, commit 10b) — the brief's declared write_scope. `ctx.writeScope`
// is populated from the brief's front matter (scripts/lib/exec-brief.js) at
// `runEngine` startup; an empty scope for provider `deepseek` downgrades the
// run to `claude` before `run_start` (§B — commit 11 folded the old
// NO_WRITE_SCOPE terminal refusal into that downgrade), so by the time this
// runs, a non-empty scope is guaranteed — but this function still fails
// closed (denies) on an empty scope defensively, belt-and-braces, rather
// than assuming that invariant holds.
function checkWriteScope(relPosix, ctx) {
  const scope = ctx.writeScope;
  if (!Array.isArray(scope) || scope.length === 0) {
    return { ok: false, error: { code: 'PATH_OUT_OF_SCOPE', message: `${relPosix}: no write_scope declared` } };
  }
  if (!matchesAnyGlob(scope, relPosix)) {
    return { ok: false, error: { code: 'PATH_OUT_OF_SCOPE', message: `${relPosix} does not match the declared write_scope (${scope.join(', ')})` } };
  }
  return null;
}

// §C.2 — the closed v1 tool-call contract. `parameters` is a JSON Schema
// with `additionalProperties: false`; `validateArgs` below enforces it.
const TOOL_SCHEMAS = {
  read_file: {
    description: 'Read a window of an existing file under the repo root.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'reason'],
      properties: {
        path: { type: 'string' },
        offset: { type: 'integer', minimum: 1 },
        limit: { type: 'integer', minimum: 1 },
        reason: { type: 'string' },
      },
    },
  },
  grep_files: {
    description: 'Search tracked (and untracked, not-ignored) files with an ERE pattern via git grep.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['pattern', 'reason'],
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string' },
        glob: { type: 'string' },
        max_results: { type: 'integer', minimum: 1 },
        reason: { type: 'string' },
      },
    },
  },
  write_file: {
    description: 'Overwrite (or create) a file under the repo root. Read-before-write applies to existing files.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'content', 'reason'],
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        reason: { type: 'string' },
      },
    },
  },
  edit_file: {
    description: 'Exact-string replace inside a previously read file.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'old_string', 'new_string', 'reason'],
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string', minLength: 1 },
        new_string: { type: 'string' },
        replace_all: { type: 'boolean' },
        reason: { type: 'string' },
      },
    },
  },
  run_bash_command: {
    description: 'Run an allowlisted, read-only argv command (never a shell string) at the repo root.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['argv', 'reason'],
      properties: {
        argv: { type: 'array', items: { type: 'string' }, minItems: 1 },
        timeout_ms: { type: 'integer', minimum: 1 },
        reason: { type: 'string' },
      },
    },
  },
  git_commit: {
    description: 'Stage exactly the enumerated, previously-ledgered paths and commit through the husky hooks.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['message', 'paths', 'reason'],
      properties: {
        message: { type: 'string' },
        paths: { type: 'array', items: { type: 'string' }, minItems: 1 },
        args: { type: 'array', items: { type: 'string' } },
        reason: { type: 'string' },
      },
    },
  },
};

function buildOpenAiSchemas() {
  return Object.keys(TOOL_SCHEMAS).map((name) => ({
    type: 'function',
    function: {
      name,
      description: TOOL_SCHEMAS[name].description,
      parameters: TOOL_SCHEMAS[name].parameters,
    },
  }));
}

function validateType(propSchema, value, keyPath) {
  switch (propSchema.type) {
    case 'string':
      if (typeof value !== 'string') {
        throw new MalformedToolCallError(`"${keyPath}" must be a string`);
      }
      // Step 9 panel fold, F-DS11 — `minLength` on a string property (used by
      // edit_file's `old_string`, §C.2): an empty old_string has undefined
      // match semantics (every character boundary "matches"), so it is
      // rejected here, before the handler ever runs, rather than reaching
      // editFileHandler's occurrence-counting logic at all.
      if (propSchema.minLength !== undefined && value.length < propSchema.minLength) {
        throw new MalformedToolCallError(`"${keyPath}" must be at least ${propSchema.minLength} character(s)`);
      }
      return;
    case 'integer':
      if (!Number.isInteger(value)) {
        throw new MalformedToolCallError(`"${keyPath}" must be an integer`);
      }
      if (propSchema.minimum !== undefined && value < propSchema.minimum) {
        throw new MalformedToolCallError(`"${keyPath}" must be >= ${propSchema.minimum}`);
      }
      return;
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new MalformedToolCallError(`"${keyPath}" must be a boolean`);
      }
      return;
    case 'array':
      if (!Array.isArray(value)) {
        throw new MalformedToolCallError(`"${keyPath}" must be an array`);
      }
      if (propSchema.minItems !== undefined && value.length < propSchema.minItems) {
        throw new MalformedToolCallError(`"${keyPath}" must have at least ${propSchema.minItems} item(s)`);
      }
      if (propSchema.items) {
        value.forEach((item, i) => validateType(propSchema.items, item, `${keyPath}[${i}]`));
      }
      return;
    default:
      // Step 9 panel fold, F-DS16 — an unrecognised `propSchema.type` is a
      // BUG IN TOOL_SCHEMAS itself (a schema-authoring error), never a valid
      // "no constraint" no-op. Failing open here would silently admit ANY
      // value for a property whose type was mistyped/misspelled in this
      // file. This throws a plain Error (not MalformedToolCallError) because
      // it is our own programmer error, not a bad model call.
      throw new Error(`exec-tools.js: TOOL_SCHEMAS has an unrecognised property type "${propSchema.type}" at "${keyPath}" — a schema-authoring bug, not a bad tool call`);
  }
}

/**
 * validateArgs — throws MalformedToolCallError (never returns false); the
 * caller (dispatch, or a loop that wants to pre-validate) treats a throw as
 * the §C.1.10 fail-closed signal.
 */
function validateArgs(name, args) {
  const schema = TOOL_SCHEMAS[name];
  if (!schema) {
    throw new MalformedToolCallError(`unknown tool "${name}"`);
  }
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    throw new MalformedToolCallError(`${name}: arguments must be a JSON object`);
  }
  const props = schema.parameters.properties || {};
  const required = schema.parameters.required || [];
  for (const key of required) {
    if (!(key in args)) {
      throw new MalformedToolCallError(`${name}: missing required argument "${key}"`);
    }
  }
  for (const key of Object.keys(args)) {
    if (!(key in props)) {
      throw new MalformedToolCallError(`${name}: unexpected argument "${key}" (additionalProperties: false)`);
    }
    validateType(props[key], args[key], key);
  }
  if (typeof args.reason !== 'string' || args.reason.length === 0) {
    throw new MalformedToolCallError(`${name}: "reason" must be a non-empty string`);
  }
}

function clampInt(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * §C.1.6 read-before-write + staleness, shared by write_file and edit_file.
 * Returns `null` when the check passes, or a blocked toolResult otherwise.
 * A file that does not yet exist needs no prior read (write_file may create
 * it); edit_file has nothing to edit in that case, so it is treated as
 * NOT_READ too (its own error-code column has no NOT_FOUND).
 */
function checkReadBeforeWrite(absPath, relPosix, runState, requireExisting) {
  const existedBefore = fs.existsSync(absPath);
  const recorded = runState.readState[absPath];
  if (!existedBefore) {
    if (requireExisting) {
      return { ok: false, error: { code: 'NOT_READ', message: `edit_file requires a prior read_file of an existing file: ${relPosix}` } };
    }
    return null; // creating a brand-new file needs no prior read
  }
  if (!recorded) {
    return { ok: false, error: { code: 'NOT_READ', message: `no prior read_file of ${relPosix} this run` } };
  }
  const currentStat = fs.statSync(absPath);
  const currentSha256 = sha256Hex(fs.readFileSync(absPath));
  if (currentSha256 !== recorded.sha256 || currentStat.mtimeMs !== recorded.mtime_ms) {
    return { ok: false, error: { code: 'STALE', message: `${relPosix} changed since it was last read this run` } };
  }
  return null;
}

// §C.2 write_file — full overwrite; read-before-write + staleness (§C.1.6)
// gate an EXISTING file, a new file needs no prior read. Pre/post worktree
// capture (§C.3, F10) brackets the actual fs.writeFileSync call.
async function writeFileHandler(args, ctx) {
  const { repoRoot, policy, runState } = ctx;
  const limits = (policy && policy.limits) || {};
  // §C.3 — pre/post is present on EVERY write_file tool_call record,
  // blocked or not, so a fence refusal still proves zero worktree delta.
  const pre = captureWorktree(repoRoot);

  let absPath;
  try {
    absPath = resolveConfinedPath(repoRoot, args.path);
  } catch (err) {
    return { toolResult: pathFault(err), pre, post: captureWorktree(repoRoot) };
  }
  const relPosix = toRepoRelativePosix(repoRoot, absPath);

  const selfProtectBlock = checkSelfProtection(absPath, relPosix, ctx);
  if (selfProtectBlock) {
    return { toolResult: selfProtectBlock, pre, post: captureWorktree(repoRoot) };
  }

  // §C.6 evaluation order: reserved registries (C.6.2) -> claude_only_globs
  // (F14) -> write scope (C.6.1).
  const reservedBlock = checkRegistryReserved(relPosix, ctx);
  if (reservedBlock) {
    return { toolResult: reservedBlock, pre, post: captureWorktree(repoRoot) };
  }
  const claudeOnlyBlock = checkClaudeOnly(relPosix, ctx);
  if (claudeOnlyBlock) {
    return { toolResult: claudeOnlyBlock, pre, post: captureWorktree(repoRoot) };
  }
  const scopeBlock = checkWriteScope(relPosix, ctx);
  if (scopeBlock) {
    return { toolResult: scopeBlock, pre, post: captureWorktree(repoRoot) };
  }

  // §C.1.5 (G5, commit 8) — a secret-denied path is never WRITTEN either,
  // not only read: evaluated at invariant position 5, after self-protection
  // (4) and before read-before-write (6).
  if (isSecretDenied(relPosix, (policy && policy.secret_read_deny) || [])) {
    return {
      toolResult: { ok: false, error: { code: 'SECRET_DENIED', message: `write denied: ${relPosix}` } },
      pre,
      post: captureWorktree(repoRoot),
    };
  }

  const blocked = checkReadBeforeWrite(absPath, relPosix, runState, false);
  if (blocked) {
    return { toolResult: blocked, pre, post: captureWorktree(repoRoot) };
  }
  const bytes = Buffer.byteLength(args.content, 'utf8');
  if (limits.write_max_bytes && bytes > limits.write_max_bytes) {
    return {
      toolResult: { ok: false, error: { code: 'TOO_LARGE', message: `${relPosix} write is ${bytes} bytes, over the ${limits.write_max_bytes}-byte cap` } },
      pre,
      post: captureWorktree(repoRoot),
    };
  }

  const created = !fs.existsSync(absPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, args.content, 'utf8');
  const post = captureWorktree(repoRoot);

  const newStat = fs.statSync(absPath);
  const sha256 = sha256Hex(fs.readFileSync(absPath));
  runState.readState[absPath] = { sha256, mtime_ms: newStat.mtimeMs };
  // §C.1.8 — git_commit.paths must be the target of a successful write_file/
  // edit_file earlier in the run; this Set is that record.
  if (runState.writtenPaths) {
    runState.writtenPaths.add(absPath);
  }

  return { toolResult: { ok: true, path: relPosix, bytes, sha256, created }, pre, post };
}

// §C.2 edit_file — exact-string replace inside a file read earlier this run.
async function editFileHandler(args, ctx) {
  const { repoRoot, policy, runState } = ctx;
  // §C.3 — pre/post is present on EVERY edit_file tool_call record.
  const pre = captureWorktree(repoRoot);

  let absPath;
  try {
    absPath = resolveConfinedPath(repoRoot, args.path);
  } catch (err) {
    return { toolResult: pathFault(err), pre, post: captureWorktree(repoRoot) };
  }
  const relPosix = toRepoRelativePosix(repoRoot, absPath);

  const selfProtectBlock = checkSelfProtection(absPath, relPosix, ctx);
  if (selfProtectBlock) {
    return { toolResult: selfProtectBlock, pre, post: captureWorktree(repoRoot) };
  }

  const reservedBlock = checkRegistryReserved(relPosix, ctx);
  if (reservedBlock) {
    return { toolResult: reservedBlock, pre, post: captureWorktree(repoRoot) };
  }
  const claudeOnlyBlock = checkClaudeOnly(relPosix, ctx);
  if (claudeOnlyBlock) {
    return { toolResult: claudeOnlyBlock, pre, post: captureWorktree(repoRoot) };
  }
  const scopeBlock = checkWriteScope(relPosix, ctx);
  if (scopeBlock) {
    return { toolResult: scopeBlock, pre, post: captureWorktree(repoRoot) };
  }

  // §C.1.5 (G5, commit 8) — a secret-denied path is never edited either.
  if (isSecretDenied(relPosix, (policy && policy.secret_read_deny) || [])) {
    return {
      toolResult: { ok: false, error: { code: 'SECRET_DENIED', message: `edit denied: ${relPosix}` } },
      pre,
      post: captureWorktree(repoRoot),
    };
  }

  const blocked = checkReadBeforeWrite(absPath, relPosix, runState, true);
  if (blocked) {
    return { toolResult: blocked, pre, post: captureWorktree(repoRoot) };
  }

  const original = fs.readFileSync(absPath, 'utf8');
  const occurrences = original.split(args.old_string).length - 1;
  if (occurrences === 0) {
    return { toolResult: { ok: false, error: { code: 'NO_MATCH', message: `old_string not found in ${relPosix}` } }, pre, post: captureWorktree(repoRoot) };
  }
  if (occurrences > 1 && !args.replace_all) {
    return {
      toolResult: { ok: false, error: { code: 'AMBIGUOUS_MATCH', message: `old_string matches ${occurrences} locations in ${relPosix}; pass replace_all or a more specific old_string` } },
      pre,
      post: captureWorktree(repoRoot),
    };
  }

  const replacements = args.replace_all ? occurrences : 1;
  // Step 9 panel fold, F-DS10 — `String.prototype.replace(searchString,
  // replacementString)` interprets `$&`/`$'`/`` $` ``/`$1`… patterns in the
  // REPLACEMENT even when the search value is a plain string, not a regex.
  // A `new_string` containing a literal `$'` (or similar) would silently
  // splice in a slice of the original file rather than being inserted
  // verbatim. A FUNCTION replacer disables all `$`-pattern interpretation
  // (its return value is always used literally). The `replace_all` path
  // above (`.split().join()`) was already magic-free.
  const updated = args.replace_all
    ? original.split(args.old_string).join(args.new_string)
    : original.replace(args.old_string, () => args.new_string);

  fs.writeFileSync(absPath, updated, 'utf8');
  const post = captureWorktree(repoRoot);

  const newStat = fs.statSync(absPath);
  const sha256 = sha256Hex(fs.readFileSync(absPath));
  runState.readState[absPath] = { sha256, mtime_ms: newStat.mtimeMs };
  if (runState.writtenPaths) {
    runState.writtenPaths.add(absPath);
  }

  return { toolResult: { ok: true, path: relPosix, replacements, sha256 }, pre, post };
}

// §C.4 Windows cmd.exe route hardening (SUB-ENG-1 commit 6). Any argv token
// containing a cmd.exe metacharacter, or beginning with '/', is refused
// BEFORE a process is ever spawned — a defense-in-depth guard kept even
// though `resolveNpmCliEntry` below normally avoids the cmd.exe route
// entirely (Windows can spawn a plain .js file with `node`, shell:false,
// with no shim in between).
const UNSAFE_CMD_TOKEN_RE = /[&|<>^%!"\r\n]/;

function hasUnsafeCmdToken(argv) {
  return argv.some((tok) => typeof tok === 'string' && (UNSAFE_CMD_TOKEN_RE.test(tok) || tok.startsWith('/')));
}

// Windows cannot spawn `npm`/`npx` (.cmd shims) with shell:false — Node core
// has no non-shell path to a .cmd file. `resolveNpmCliEntry` finds the real
// `npm-cli.js`/`npx-cli.js` script bundled next to the running Node binary
// (the same layout `node_modules/npm/bin/*` uses in every npm distribution)
// so the call can be routed as `node <cli.js> <rest>` with shell:false,
// exactly like any other argv — no cmd.exe metacharacter parsing at all on
// that path. Falls back to the cmd.exe route only when that file cannot be
// found on this host.
function resolveNpmCliEntry(bin) {
  const cliFile = bin === 'npm' ? 'npm-cli.js' : 'npx-cli.js';
  const candidate = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', cliFile);
  try {
    return fs.existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

// Every token reaching the cmd.exe fallback below has ALREADY passed
// matchArgv's strict per-token validation (literal policy tokens or a value
// matching a closed regex/path-confinement check) AND hasUnsafeCmdToken
// (checked by the caller before this function runs), so there is no
// free-form string here for cmd.exe's own tokenizer to exploit; routing
// exactly {npm, npx} through `cmd.exe /d /s /c <argv>` on Windows only
// (git/node/npx-resolved-binaries below are spawned directly) is the
// narrowest fix for a real Node/Windows limitation, not a general shell.
function spawnAllowlisted(argv, opts) {
  if (process.platform === 'win32' && (argv[0] === 'npm' || argv[0] === 'npx')) {
    const cliPath = resolveNpmCliEntry(argv[0]);
    if (cliPath) {
      return spawn(process.execPath, [cliPath, ...argv.slice(1)], { ...opts, shell: false });
    }
    return spawn('cmd.exe', ['/d', '/s', '/c', ...argv], { ...opts, windowsHide: true });
  }
  return spawn(argv[0], argv.slice(1), { ...opts, shell: false });
}

function runProcess(argv, { cwd, env, timeoutMs, outputCapBytes }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let child;
    try {
      child = spawnAllowlisted(argv, { cwd, env });
    } catch (err) {
      resolve({ exitCode: null, stdout: '', stderr: err.message, truncated: false, timedOut: false, durationMs: Date.now() - startedAt });
      return;
    }
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const capture = (chunk, which) => {
      const bytesSoFar = which === 'out' ? stdoutBytes : stderrBytes;
      if (bytesSoFar >= outputCapBytes) {
        truncated = true;
        return;
      }
      const remaining = outputCapBytes - bytesSoFar;
      const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
      if (chunk.length > remaining) {
        truncated = true;
      }
      if (which === 'out') {
        stdout += slice.toString('utf8');
        stdoutBytes += slice.length;
      } else {
        stderr += slice.toString('utf8');
        stderrBytes += slice.length;
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      // §C.1.9 (G6, commit 9) — "a bash command exceeding its timeout is
      // killed, and the child is gone afterwards." The npm/npx route (commit
      // 6) spawns `node <npm-cli.js> run <script>`, which npm then re-spawns
      // as a NESTED child of its own — a plain SIGTERM/kill on OUR direct
      // child leaves that grandchild running on Windows, where terminating a
      // parent process does not tear down its process tree. `taskkill /T /F`
      // kills the whole tree; POSIX gets a direct SIGKILL (SIGTERM is not
      // guaranteed to stop a process ignoring it, and this budget fence needs
      // a deterministic kill, not a polite request).
      try {
        if (process.platform === 'win32' && child.pid) {
          spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          child.kill('SIGKILL');
        }
      } catch {
        // process may already be gone
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk) => capture(chunk, 'out'));
    child.stderr.on('data', (chunk) => capture(chunk, 'err'));
    child.on('error', (err) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr: stderr ? `${stderr}\n${err.message}` : err.message, truncated, timedOut, durationMs: Date.now() - startedAt });
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, truncated, timedOut, durationMs: Date.now() - startedAt });
    });
  });
}

// §C.2 run_bash_command — argv-form only, deny-by-default via matchArgv
// (§C.4), spawnSync-free (child_process.spawn), env scrubbed of GIT_*/
// DEEPSEEK_*, output capped, per-call timeout. Pre/post capture brackets
// the ENTIRE handler (including a blocked call) so a fence refusal still
// proves zero worktree delta.
async function runBashCommandHandler(args, ctx) {
  const { repoRoot, policy } = ctx;
  const limits = (policy && policy.limits) || {};
  const pre = captureWorktree(repoRoot);

  // §C.1.4 (G10) — self-protection is checked BEFORE the allowlist (§C.1.3
  // confinement / §C.1.4 self-protection precede §C.1.7's "read-only bash by
  // construction" in the invariant order).
  const selfProtectBlock = bashSelfProtectionBlock(args.argv, ctx);
  if (selfProtectBlock) {
    const post = captureWorktree(repoRoot);
    return { toolResult: selfProtectBlock, pre, post };
  }

  const match = matchArgv(args.argv, policy, { repoRoot });
  if (!match.allowed) {
    const post = captureWorktree(repoRoot);
    return { toolResult: { ok: false, error: { code: match.code, message: match.reason } }, pre, post };
  }

  // §1.4 Windows cmd.exe route hardening — checked even for an argv that just
  // passed the allowlist, because `npm`/`npx` may still fall back to the
  // cmd.exe route on a host where resolveNpmCliEntry finds nothing.
  if (process.platform === 'win32' && (args.argv[0] === 'npm' || args.argv[0] === 'npx') && hasUnsafeCmdToken(args.argv)) {
    const post = captureWorktree(repoRoot);
    return {
      toolResult: { ok: false, error: { code: 'ARGV_UNSAFE_TOKEN', message: `unsafe token for the cmd.exe route: ${args.argv.join(' ')}` } },
      pre,
      post,
    };
  }

  const requested = args.timeout_ms || limits.timeout_ms || 600000;
  const timeoutMs = clampInt(requested, 1, limits.timeout_ceiling_ms || 1200000);
  const outputCapBytes = limits.bash_output_bytes || 65536;
  const env = scrubbedEnv(['DEEPSEEK_']);

  const result = await runProcess(args.argv, { cwd: repoRoot, env, timeoutMs, outputCapBytes });
  const post = captureWorktree(repoRoot);

  if (result.timedOut) {
    return { toolResult: { ok: false, error: { code: 'TIMEOUT', message: `command exceeded ${timeoutMs}ms: ${args.argv.join(' ')}` } }, pre, post };
  }
  return {
    toolResult: {
      ok: true,
      exit_code: result.exitCode,
      stdout: redact(result.stdout),
      stderr: redact(result.stderr),
      truncated: result.truncated,
      duration_ms: result.durationMs,
    },
    pre,
    post,
  };
}

// Step 9 panel fold, F-DS8 — maps a raw Node fs error code (thrown by a
// handler, e.g. an mkdirSync/writeFileSync/readFileSync/statSync TOCTOU race
// that slips past this tool's own inline checks) to a structured tool-result
// code, so the engine loop never sees an uncaught exception from a handler.
// Returns `null` for anything not in this short list — the dispatch-level
// catch-all below falls back to the generic `HANDLER_FAULT` in that case.
function mapFsErrorCode(err) {
  if (!err || typeof err.code !== 'string') {
    return null;
  }
  switch (err.code) {
    case 'ENOENT':
      return 'NOT_FOUND';
    case 'EACCES':
    case 'EPERM':
      return 'PERMISSION_DENIED';
    case 'EISDIR':
      return 'IS_DIRECTORY';
    default:
      return null;
  }
}

// §C.2 read_file. Content is windowed by (offset, limit) — 1-based line
// numbers — but sha256/mtime_ms are ALWAYS of the whole file, because §C.1.6
// re-checks those exact values against a later write/edit of the same path.
async function readFileHandler(args, ctx) {
  const { repoRoot, policy, runState } = ctx;
  const limits = (policy && policy.limits) || {};
  let absPath;
  try {
    absPath = resolveConfinedPath(repoRoot, args.path);
  } catch (err) {
    return { toolResult: pathFault(err) };
  }
  const relPosix = toRepoRelativePosix(repoRoot, absPath);
  if (isSecretDenied(relPosix, (policy && policy.secret_read_deny) || [])) {
    return { toolResult: { ok: false, error: { code: 'SECRET_DENIED', message: `read denied: ${relPosix}` } } };
  }
  let stat;
  try {
    stat = fs.statSync(absPath);
  } catch {
    return { toolResult: { ok: false, error: { code: 'NOT_FOUND', message: `no such file: ${relPosix}` } } };
  }
  if (stat.isDirectory()) {
    return { toolResult: { ok: false, error: { code: 'IS_DIRECTORY', message: `is a directory: ${relPosix}` } } };
  }
  if (limits.read_max_bytes && stat.size > limits.read_max_bytes) {
    return { toolResult: { ok: false, error: { code: 'TOO_LARGE', message: `${relPosix} is ${stat.size} bytes, over the ${limits.read_max_bytes}-byte read cap` } } };
  }

  const buf = fs.readFileSync(absPath);
  const wholeFileSha256 = sha256Hex(buf);
  const content = buf.toString('utf8');
  const lines = content.split('\n');
  const offset = args.offset && args.offset > 0 ? args.offset : 1;
  const limit = args.limit && args.limit > 0 ? args.limit : lines.length;
  const windowLines = lines.slice(offset - 1, offset - 1 + limit);
  const truncated = offset > 1 || offset - 1 + limit < lines.length;

  runState.readState[absPath] = { sha256: wholeFileSha256, mtime_ms: stat.mtimeMs };

  return {
    toolResult: {
      ok: true,
      path: relPosix,
      content: windowLines.join('\n'),
      sha256: wholeFileSha256,
      mtime_ms: stat.mtimeMs,
      lines_total: lines.length,
      truncated,
    },
  };
}

function parseGitGrepLine(line) {
  const match = /^(.*?):(\d+):(.*)$/.exec(line);
  if (!match) {
    return null;
  }
  return { path: match[1], line: Number(match[2]), text: match[3] };
}

// §C.2 grep_files. Implemented over `git grep -n -I -E --untracked`;
// matches under a §C.1.5 secret glob are dropped, every `text` is redacted
// (the ledger/prompt redact() is shared, not re-implemented here).
async function grepFilesHandler(args, ctx) {
  const { repoRoot, policy } = ctx;
  const limits = (policy && policy.limits) || {};
  try {
    void new RegExp(args.pattern);
  } catch (err) {
    return { toolResult: { ok: false, error: { code: 'BAD_PATTERN', message: `invalid pattern: ${err.message}` } } };
  }

  const argv = ['grep', '-n', '-I', '-E', '--untracked', '-e', args.pattern];
  const pathspecs = [];
  if (args.path) {
    let absPath;
    try {
      absPath = resolveConfinedPath(repoRoot, args.path);
    } catch (err) {
      return { toolResult: pathFault(err) };
    }
    pathspecs.push(toRepoRelativePosix(repoRoot, absPath) || '.');
  }
  if (args.glob) {
    pathspecs.push(args.glob);
  }
  if (pathspecs.length > 0) {
    argv.push('--', ...pathspecs);
  }

  // Step 9 panel fold, F-DS12 — a timeout + a bounded maxBuffer (previously
  // absent: an unbounded `git grep` had no time limit and Node's own 1 MiB
  // default buffer would ENOBUFS on a legitimately large result set instead
  // of reporting a specific, recoverable code).
  const grepLimits = { timeout: (policy && policy.limits && policy.limits.timeout_ms) || 600000, maxBuffer: SPAWN_MAX_BUFFER_BYTES };
  const result = spawnSync('git', argv, { cwd: repoRoot, env: scrubbedEnv(), encoding: 'utf8', shell: false, ...grepLimits });
  if (result.error) {
    const failure = classifySpawnFailure(result, { code: 'BAD_PATTERN', message: `git grep failed to start: ${result.error.message}` });
    return { toolResult: { ok: false, error: failure } };
  }
  // git grep exits 1 when there are zero matches — not a fault.
  if (result.status !== 0 && result.status !== 1) {
    return { toolResult: { ok: false, error: { code: 'BAD_PATTERN', message: `git grep exited ${result.status}: ${redact(result.stderr || '')}` } } };
  }

  const secretGlobs = (policy && policy.secret_read_deny) || [];
  const rawLines = (result.stdout || '').split('\n').filter(Boolean);
  const allMatches = [];
  for (const line of rawLines) {
    const parsed = parseGitGrepLine(line);
    if (!parsed) {
      continue;
    }
    if (isSecretDenied(parsed.path.split('\\').join('/'), secretGlobs)) {
      continue;
    }
    allMatches.push({ path: parsed.path, line: parsed.line, text: redact(parsed.text) });
  }
  const cap = Math.min(args.max_results || 200, limits.grep_max_results || 1000);
  const truncated = allMatches.length > cap;

  return { toolResult: { ok: true, matches: allMatches.slice(0, cap), truncated } };
}

function tailBytes(str, capBytes) {
  const buf = Buffer.from(str || '', 'utf8');
  return buf.length > capBytes ? buf.subarray(buf.length - capBytes).toString('utf8') : (str || '');
}

// Step 9 panel fold, F-DS12 — a `spawnSync` whose output exceeds `maxBuffer`
// sets `result.error.code === 'ENOBUFS'` (the process itself may have run to
// completion; only the CAPTURE overflowed) — this must surface as the
// specific, recoverable `OUTPUT_TOO_LARGE`, not the generic fallback code a
// caller would otherwise report for "spawn produced a non-zero/failed
// result". `fallback` is `{ code, message }` for every other failure shape.
function classifySpawnFailure(result, fallback) {
  if (result && result.error && result.error.code === 'ENOBUFS') {
    return { code: 'OUTPUT_TOO_LARGE', message: `output exceeded the buffer cap: ${fallback.message}` };
  }
  return fallback;
}

const SPAWN_MAX_BUFFER_BYTES = 16 * 1024 * 1024; // 16 MiB — F-DS12

// §C.6.4 (F13, commit 10b) — the committer lock is keyed PER WORKTREE, so
// engines in different worktrees commit independently (a global
// `committer.lock`, commit 10's original name, would have serialised commits
// across every worktree on the machine). `repoRoot`'s realpath, not its raw
// string, so two paths to the same worktree (a symlinked mount, a differently-
// cased drive letter) hash identically.
function committerLockFileName(repoRoot) {
  const real = fs.realpathSync(repoRoot);
  const hash = crypto.createHash('sha256').update(real).digest('hex').slice(0, 12);
  return `committer-${hash}.lock`;
}

// §C.1.8 — the single-committer advisory lock. `lockPath` is a parameter
// (not hardcoded) so commit 10b can key it per worktree
// (`committer-<hash>.lock`) without changing this function's contract.
//
// Step 9 panel fold, F-DS4 — `process.kill(pid, 0)` throws EPERM when the
// pid EXISTS but this process lacks permission to signal it, and ESRCH when
// it genuinely does not exist; only the latter means "dead". Duplicated from
// exec-claims.js's own `isPidAlive` deliberately (§C.1.8's committer lock and
// §C.6.3's claims registry are two independently-testable modules; folding
// them into one shared import was judged not worth the coupling for a
// three-line function) — both copies now carry the identical fix.
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return Boolean(err && err.code === 'EPERM');
  }
}

const COMMITTER_LOCK_STALE_MS = 30000;

// Step 9 panel fold, F-DS5 — reclaim is pid-liveness-first (ESRCH), never
// mtime alone; mtime is used ONLY as a fallback when the lock file's `pid`
// field cannot be read at all (the file exists but is unparsable, or the pid
// field is missing/non-numeric) — never as the primary signal.
function acquireCommitterLock(lockPath, payload) {
  const line = JSON.stringify(payload);
  try {
    const fd = fs.openSync(lockPath, 'wx'); // O_CREAT | O_EXCL | O_WRONLY
    fs.writeSync(fd, line);
    fs.closeSync(fd);
    return true;
  } catch (err) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return false; // unreadable/corrupt lock — fail closed as BUSY (no pid to check, no safe mtime signal on an unparsable file)
  }
  const holderPid = existing && typeof existing.pid === 'number' ? existing.pid : null;
  let reclaimable;
  if (holderPid !== null) {
    reclaimable = !isPidAlive(holderPid);
  } else {
    try {
      const stat = fs.statSync(lockPath);
      reclaimable = Date.now() - stat.mtimeMs > COMMITTER_LOCK_STALE_MS;
    } catch {
      reclaimable = false;
    }
  }
  if (!reclaimable) {
    return false;
  }
  try {
    fs.unlinkSync(lockPath);
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeSync(fd, line);
    fs.closeSync(fd);
    return true;
  } catch {
    return false; // lost the reclaim race — fail closed as BUSY
  }
}

// Step 9 panel fold, F-DS5 — unlinks the lock file ONLY if its contents
// still carry OUR OWN `run_id`. Without this check, a lock that was already
// reclaimed from under us (e.g. this process hung long enough to be judged
// stale, and another engine took over) would have its NEW rightful holder's
// lock deleted by our own late, unconditional release — the exact bug this
// fold closes.
function releaseCommitterLock(lockPath, runId) {
  try {
    const existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (existing && existing.run_id !== (runId || 'unknown')) {
      return; // not ours (reclaimed from under us) — never delete another holder's lock
    }
  } catch {
    // unreadable/missing — best-effort release proceeds (nothing to protect)
  }
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // best-effort release; a missing lock file at release time is not itself a fault
  }
}

// §C.2 git_commit — the ONLY sanctioned commit path (§C.1.8). Stages exactly
// the enumerated, previously-ledgered `paths`, then commits through the
// husky hooks with the engine's own author/committer identity. Invariant
// order mirrors write_file/edit_file: confinement (3) → self-protection (4)
// → secret-deny (5) → PATH_NOT_LEDGERED (this tool's own §C.1.8 gate) →
// single-committer lock → the actual git operations.
async function gitCommitHandler(args, ctx) {
  const { repoRoot, policy, runState, ledger, runId, model } = ctx;
  const pre = captureWorktree(repoRoot);

  // Step 9 panel fold, F-DS3 — git accepts unambiguous long-option
  // abbreviations (`--amen` resolves to `--amend`), so an exact-match refusal
  // Set is bypassable by construction. The v1 fix is not a bigger denylist:
  // `git_commit.args` is now a RESERVED field — ANY non-empty value is
  // refused, closing the whole abbreviation class rather than chasing it.
  if (Array.isArray(args.args) && args.args.length > 0) {
    return {
      toolResult: { ok: false, error: { code: 'FLAG_REFUSED', message: `git_commit.args is reserved in v1; any value is refused: ${args.args.join(', ')}` } },
      pre,
      post: captureWorktree(repoRoot),
    };
  }

  // Step 9 panel fold, F-II4 — the commit message's first line is validated
  // against the husky commit-msg hook's own pattern (scripts/hooks/validate-
  // commit-msg.sh) BEFORE any git call, so a malformed message is refused
  // here with a specific code rather than surfacing later as an opaque
  // HOOK_FAILED from the hook itself. `policy.commit_message_pattern` is
  // required policy shape (F-DS9); its absence is an engine-level fault, not
  // reachable here — loadPolicy() would already have thrown POLICY_INVALID.
  const messagePattern = new RegExp(policy.commit_message_pattern);
  const messageFirstLine = String(args.message || '').split(/\r?\n/)[0];
  if (!messagePattern.test(messageFirstLine)) {
    return {
      toolResult: { ok: false, error: { code: 'MESSAGE_FORMAT', message: `commit message first line does not match the required pattern: ${messageFirstLine}` } },
      pre,
      post: captureWorktree(repoRoot),
    };
  }

  const relPaths = [];
  for (const p of args.paths) {
    let absPath;
    try {
      absPath = resolveConfinedPath(repoRoot, p);
    } catch (err) {
      return { toolResult: pathFault(err), pre, post: captureWorktree(repoRoot) };
    }
    const relPosix = toRepoRelativePosix(repoRoot, absPath);

    const selfProtectBlock = checkSelfProtection(absPath, relPosix, ctx);
    if (selfProtectBlock) {
      return { toolResult: selfProtectBlock, pre, post: captureWorktree(repoRoot) };
    }
    const reservedBlock = checkRegistryReserved(relPosix, ctx);
    if (reservedBlock) {
      return { toolResult: reservedBlock, pre, post: captureWorktree(repoRoot) };
    }
    const claudeOnlyBlock = checkClaudeOnly(relPosix, ctx);
    if (claudeOnlyBlock) {
      return { toolResult: claudeOnlyBlock, pre, post: captureWorktree(repoRoot) };
    }
    const scopeBlock = checkWriteScope(relPosix, ctx);
    if (scopeBlock) {
      return { toolResult: scopeBlock, pre, post: captureWorktree(repoRoot) };
    }
    if (isSecretDenied(relPosix, (policy && policy.secret_read_deny) || [])) {
      return {
        toolResult: { ok: false, error: { code: 'SECRET_DENIED', message: `commit denied: ${relPosix}` } },
        pre,
        post: captureWorktree(repoRoot),
      };
    }
    const ledgered = runState.writtenPaths && runState.writtenPaths.has(absPath);
    if (!ledgered) {
      return {
        toolResult: { ok: false, error: { code: 'PATH_NOT_LEDGERED', message: `${relPosix} was not the target of a successful write_file/edit_file this run` } },
        pre,
        post: captureWorktree(repoRoot),
      };
    }
    relPaths.push(relPosix);
  }

  const ledgerDirAbs = ledger && ledger.path ? path.dirname(ledger.path) : null;
  const lockPath = ctx.committerLockPath || (ledgerDirAbs ? path.join(ledgerDirAbs, committerLockFileName(repoRoot)) : null);
  if (!lockPath) {
    return { toolResult: { ok: false, error: { code: 'COMMITTER_BUSY', message: 'no ledger directory to key the committer lock against' } }, pre, post: captureWorktree(repoRoot) };
  }
  const lockPayload = { pid: process.pid, run_id: runId || 'unknown', repo_root: repoRoot, ts: new Date().toISOString() };
  if (!acquireCommitterLock(lockPath, lockPayload)) {
    return { toolResult: { ok: false, error: { code: 'COMMITTER_BUSY', message: 'another commit is in progress in this worktree' } }, pre, post: captureWorktree(repoRoot) };
  }

  try {
    const authorName = process.env.EXEC_GIT_AUTHOR_NAME || 'deepseek-exec';
    const authorEmail = process.env.EXEC_GIT_AUTHOR_EMAIL || 'deepseek-exec@buildo.invalid';
    // §C.2 — "env scrubbed of every GIT_* variable EXCEPT the four author/
    // committer vars, which the engine sets explicitly." Step 9 panel fold,
    // F-II6: ALSO scrub DEEPSEEK_* — the husky hooks this spawns (typecheck/
    // lint/vitest child processes) have no legitimate reason to inherit
    // DEEPSEEK_API_KEY, and every other git-shelling call in this file
    // already scrubs it (run_bash_command, grep_files) — this was the one
    // gap.
    const env = {
      ...scrubbedEnv(['DEEPSEEK_']),
      GIT_AUTHOR_NAME: authorName,
      GIT_AUTHOR_EMAIL: authorEmail,
      GIT_COMMITTER_NAME: authorName,
      GIT_COMMITTER_EMAIL: authorEmail,
    };
    const spawnLimits = { timeout: (policy && policy.limits && policy.limits.timeout_ms) || 600000, maxBuffer: SPAWN_MAX_BUFFER_BYTES };

    // Step 9 panel fold, F-II1 (CRITICAL) — the index must be EMPTY before
    // we stage anything of our own: pre-staged stray content (a crash
    // between a previous add/commit, or anything else) would otherwise be
    // silently swept into THIS commit even though it was never ledgered this
    // run. Refuse rather than reset someone else's staged work.
    const beforeAdd = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: repoRoot, env, encoding: 'utf8', shell: false, ...spawnLimits });
    const strayStaged = (beforeAdd.stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (strayStaged.length > 0) {
      const post = captureWorktree(repoRoot);
      return {
        toolResult: { ok: false, error: { code: 'INDEX_DIRTY', message: `the index already has staged content before this commit; refusing to touch it: ${strayStaged.join(', ')}` } },
        pre,
        post,
      };
    }

    const addResult = spawnSync('git', ['add', '--', ...relPaths], { cwd: repoRoot, env, encoding: 'utf8', shell: false, ...spawnLimits });
    if (addResult.error || addResult.status !== 0) {
      const post = captureWorktree(repoRoot);
      const failure = classifySpawnFailure(addResult, { code: 'HOOK_FAILED', message: `git add failed (exit ${addResult.status}): ${tailBytes((addResult.stderr || '') + (addResult.stdout || ''), 65536)}` });
      return { toolResult: { ok: false, error: failure }, pre, post };
    }

    // Step 9 panel fold, F-II1 — after our OWN `git add`, the staged set must
    // equal `relPaths` EXACTLY. Anything else (a hook side-effect, a race)
    // is undone with a targeted `git reset -- <paths>` — touching only what
    // WE just staged, never anyone else's index state.
    const afterAdd = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: repoRoot, env, encoding: 'utf8', shell: false, ...spawnLimits });
    const stagedNow = (afterAdd.stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).sort();
    const expected = [...relPaths].sort();
    const stageMismatch = stagedNow.length !== expected.length || stagedNow.some((p, i) => p !== expected[i]);
    if (stageMismatch) {
      spawnSync('git', ['reset', '-q', '--', ...relPaths], { cwd: repoRoot, env, encoding: 'utf8', shell: false, ...spawnLimits });
      const post = captureWorktree(repoRoot);
      return {
        toolResult: { ok: false, error: { code: 'STAGE_MISMATCH', message: `staged set after "git add" (${stagedNow.join(', ') || '<empty>'}) does not match the requested paths (${expected.join(', ')}); the add was undone` } },
        pre,
        post,
      };
    }

    const trailer = `Executed-By: deepseek-exec ${model || 'unknown'} run=${runId || 'unknown'}`;
    const fullMessage = `${args.message}\n\n${trailer}\n`;
    // args.args is guaranteed empty here — any non-empty value was already
    // refused above (F-DS3) — so the commit argv never carries model-
    // supplied flags at all.
    const commitArgv = ['commit', '-m', fullMessage];
    const commitResult = spawnSync('git', commitArgv, { cwd: repoRoot, env, encoding: 'utf8', shell: false, ...spawnLimits });
    const post = captureWorktree(repoRoot);
    if (commitResult.error || commitResult.status !== 0) {
      const failure = classifySpawnFailure(commitResult, { code: 'HOOK_FAILED', message: `git commit failed (exit ${commitResult.status}): ${tailBytes((commitResult.stdout || '') + (commitResult.stderr || ''), 65536)}` });
      return { toolResult: { ok: false, error: failure }, pre, post };
    }

    return { toolResult: { ok: true, sha: post.head_sha, files: relPaths }, pre, post };
  } finally {
    releaseCommitterLock(lockPath, runId);
  }
}

/**
 * createTools({ repoRoot, policy, ledger, runState, runId, model }) —
 * `runState` is the per-run mutable state bag (§C.1.6 read-before-write
 * tracking lives at `runState.readState[absPath] = { sha256, mtime_ms }`;
 * §C.1.8's `git_commit` PATH_NOT_LEDGERED check lives at
 * `runState.writtenPaths`, a Set of absolute paths, both populated by
 * write_file/edit_file on success). `runId`/`model` are threaded through for
 * the git_commit trailer and the committer-lock payload.
 */
function createTools({ repoRoot, policy, ledger, runState, runId, model, committerLockPath, writeScope } = {}) {
  if (!repoRoot) {
    throw new Error('createTools requires repoRoot');
  }
  const state = runState || { readState: {} };
  if (!state.readState) {
    state.readState = {};
  }
  if (!state.writtenPaths) {
    state.writtenPaths = new Set();
  }
  const ctx = { repoRoot, policy, ledger, runState: state, runId, model, committerLockPath, writeScope };

  const handlers = {
    read_file: readFileHandler,
    grep_files: grepFilesHandler,
    write_file: writeFileHandler,
    edit_file: editFileHandler,
    run_bash_command: runBashCommandHandler,
    git_commit: gitCommitHandler,
  };

  async function dispatch(name, args) {
    // §C.1.10 — validation happens before ANY handler executes.
    validateArgs(name, args);
    // Every schema-validated tool name has a real handler (the handlers
    // map's keys are exactly TOOL_SCHEMAS' keys) — validateArgs just above
    // already threw MalformedToolCallError for anything else, so
    // `handlers[name]` is never undefined here (Step 9 panel fold, F-CR1:
    // the old `|| notImplemented` fallback was dead code — every tool has
    // shipped a real handler since Phase 1/2 — removed rather than kept
    // unreachable).
    const handler = handlers[name];
    const startedAt = Date.now();
    let outcome;
    try {
      outcome = await handler(args, ctx);
    } catch (err) {
      // Step 9 panel fold, F-DS8 — a handler that throws a raw exception
      // (e.g. an fs TOCTOU race not caught by its own inline checks) must
      // still produce exactly one structured tool_call record (§C.1.1), not
      // crash the engine loop. `pre`/`post` are omitted here (unlike a
      // normal blocked/ok outcome) because the fault happened INSIDE the
      // handler, at an unknown point relative to any worktree capture it may
      // have already taken — there is no reliable bracket to report.
      const code = mapFsErrorCode(err) || 'HANDLER_FAULT';
      outcome = { toolResult: { ok: false, error: { code, message: err && err.message ? err.message : String(err) } } };
    }
    return {
      ...outcome,
      duration_ms: Date.now() - startedAt,
    };
  }

  return {
    schemas: buildOpenAiSchemas(),
    dispatch,
    // exposed for commits 3/4 to register real handlers without a second
    // factory function, and for the fences test suite to introspect.
    _handlers: handlers,
    _ctx: ctx,
  };
}

module.exports = {
  createTools,
  validateArgs,
  validateType,
  MalformedToolCallError,
  TOOL_SCHEMAS,
  committerLockFileName,
  // Step 9 panel fold — exported for direct unit testing (mirrors
  // exec-claims.js's own acquireClaim/releaseClaim exports).
  acquireCommitterLock,
  releaseCommitterLock,
  classifySpawnFailure,
  mapFsErrorCode,
};
