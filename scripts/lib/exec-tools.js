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
 * Commit 2 ships every tool as a schema-validated stub returning
 * `{ ok:false, error:{ code:'NOT_IMPLEMENTED' } }` — real handlers for
 * read_file/grep_files land in commit 3, write_file/edit_file/
 * run_bash_command in commit 4. `git_commit` stays a stub through the whole
 * of Phase 1 (it ships in Phase 2 commit 10, once the commit fences exist).
 */

class MalformedToolCallError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MalformedToolCallError';
  }
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
  const handlers = {};

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
