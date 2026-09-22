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
 * `{ ok:false, error:{ code:'NOT_IMPLEMENTED' } }`. Commit 3 (this file's
 * current state) adds real `read_file`/`grep_files` handlers, both path-
 * confined (§C.1.3) and secret-fenced (§C.1.5's `secret_read_deny`), and
 * populates `runState.readState` for §C.1.6's read-before-write tracking.
 * `write_file`/`edit_file`/`run_bash_command` land in commit 4. `git_commit`
 * stays a stub through the whole of Phase 1 (it ships in Phase 2 commit 10,
 * once the commit fences exist).
 */

const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { resolveConfinedPath, toRepoRelativePosix, isSecretDenied, PathDeniedError } = require('./exec-path');
const { scrubbedEnv } = require('./exec-env');
const { redact } = require('./exec-ledger');

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
        old_string: { type: 'string' },
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
    description: 'Stage exactly the enumerated, previously-ledgered paths and commit through the husky hooks. NOT_IMPLEMENTED until Phase 2.',
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
      return;
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

async function notImplementedHandler(name) {
  return {
    toolResult: { ok: false, error: { code: 'NOT_IMPLEMENTED', message: `${name} is not implemented in this phase` } },
  };
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

  const result = spawnSync('git', argv, { cwd: repoRoot, env: scrubbedEnv(), encoding: 'utf8', shell: false });
  if (result.error) {
    return { toolResult: { ok: false, error: { code: 'BAD_PATTERN', message: `git grep failed to start: ${result.error.message}` } } };
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

/**
 * createTools({ repoRoot, policy, ledger, runState }) — `runState` is the
 * per-run mutable state bag (§C.1.6 read-before-write tracking lives at
 * `runState.readState[absPath] = { sha256, mtime_ms }`, populated once
 * read_file/write_file/edit_file land in commits 3-4). `policy` and `ledger`
 * are threaded through now so later commits (allowlist matching, the
 * self-protection denylist) do not need a signature change.
 */
function createTools({ repoRoot, policy, ledger, runState } = {}) {
  if (!repoRoot) {
    throw new Error('createTools requires repoRoot');
  }
  const state = runState || { readState: {} };
  if (!state.readState) {
    state.readState = {};
  }
  const ctx = { repoRoot, policy, ledger, runState: state };

  // Real handlers are added to this table in commits 3 (read_file,
  // grep_files) and 4 (write_file, edit_file, run_bash_command). git_commit
  // has no entry until Phase 2 commit 10, so it always falls through to the
  // NOT_IMPLEMENTED stub below.
  const handlers = {
    read_file: readFileHandler,
    grep_files: grepFilesHandler,
  };

  async function dispatch(name, args) {
    // §C.1.10 — validation happens before ANY handler executes.
    validateArgs(name, args);
    const handler = handlers[name] || (() => notImplementedHandler(name));
    const startedAt = Date.now();
    const outcome = await handler(args, ctx);
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
  MalformedToolCallError,
  TOOL_SCHEMAS,
};
