#!/usr/bin/env node
'use strict';
/**
 * SPEC LINK: docs/specs/00-architecture/08_agents.md §C.5
 *
 * The DeepSeek Execution Engine CLI (SUB-ENG-1). `runEngine(opts)` is the
 * exported entry point: it THROWS on an engine-level fault (a ledger write
 * failure, a missing brief, a bad provider setup) and otherwise RETURNS a
 * run summary whose `status` names how the run ended
 * (`completed | aborted | killed | budget_exhausted | delegated_to_claude`).
 * The `require.main === module` wrapper is the only place that touches
 * `process.exitCode` — this module never calls `process.exit()` (banned).
 *
 * Loop (§C.5): brief → system prompt → model turn → for each tool_call:
 * kill check → handler → ledger → tool result → next turn, until the model
 * returns no tool calls (`completed`), a budget trips, a fault aborts, or
 * the kill sentinel appears.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const { openLedger, redact, generateRunId } = require('./lib/exec-ledger');
const { createTools, MalformedToolCallError } = require('./lib/exec-tools');
const { createTranscriptClient, createDeepSeekClient } = require('./lib/exec-model');
const { scrubbedEnv } = require('./lib/exec-env');
const { safeParsePositiveInt } = require('./lib/safe-math');
const { parseBrief } = require('./lib/exec-brief');
const { acquireClaim, releaseClaim, ClaimConflictError } = require('./lib/exec-claims');

const ENGINE_VERSION = '0.1.0-phase1';
const POLICY_PATH = path.join(__dirname, 'lib', 'exec-policy.json');

// §C.1.1 note in the tool_call ledger record — a fence "refused" a call
// BEFORE it ran; anything else that ran and failed is 'error'.
const BLOCKED_CODES = new Set([
  'NOT_READ', 'STALE', 'NO_MATCH', 'AMBIGUOUS_MATCH',
  'PATH_OUTSIDE_REPO', 'PATH_DENIED', 'SECRET_DENIED',
  'COMMAND_NOT_ALLOWED', 'FLAG_NOT_ALLOWED', 'TOO_LARGE',
  'PATH_NOT_LEDGERED', 'FLAG_REFUSED', 'COMMITTER_BUSY',
  'NOT_IMPLEMENTED', 'ARGV_UNSAFE_TOKEN',
  // §C.6 (F13) multi-worker isolation — commit 10b.
  'PATH_OUT_OF_SCOPE', 'PATH_RESERVED', 'CLAIM_CONFLICT', 'NO_WRITE_SCOPE',
  // F14 (commit 11) — money/auth/PII/migrations, enforced in the tool layer.
  'PATH_CLAUDE_ONLY',
]);

function sha256Hex(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function loadPolicy() {
  const raw = fs.readFileSync(POLICY_PATH, 'utf8');
  return { policy: JSON.parse(raw), sha256: sha256Hex(raw) };
}

/**
 * resolveRepoRoot(inputRepoRoot) — F14 (`--repo <path>`, commit 11): the
 * worktree root the engine operates in, defaulting to `process.cwd()`.
 * Realpath'd (so confinement/claims/lock keys downstream are consistent
 * regardless of a symlinked mount or a differently-cased drive letter) and
 * asserted to contain a `.git` — a FILE in a worktree, a DIRECTORY in the
 * primary checkout, `fs.existsSync` covers both. Throws (an engine-level
 * fault, never a silent no-op) when the path does not exist or is not a git
 * worktree — this runs BEFORE anything else, so a bad `--repo` value never
 * reaches the brief/ledger/claims machinery at all.
 */
function resolveRepoRoot(inputRepoRoot) {
  const candidate = inputRepoRoot || process.cwd();
  let real;
  try {
    real = fs.realpathSync(candidate);
  } catch (err) {
    throw new Error(`--repo path does not exist: ${candidate} (${err.message})`);
  }
  if (!fs.existsSync(path.join(real, '.git'))) {
    throw new Error(`--repo path is not a git worktree (no .git found under ${real})`);
  }
  return real;
}

function gitInfo(repoRoot) {
  const env = scrubbedEnv();
  try {
    const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, env, encoding: 'utf8' }).trim();
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot, env, encoding: 'utf8' }).trim();
    return { headSha, branch };
  } catch {
    return { headSha: 'unknown', branch: 'unknown' };
  }
}

/**
 * resolveProvider — §B / §C.5 precedence: `--provider` > `EXECUTION_PROVIDER`
 * > default `claude`. An unrecognised value ALWAYS resolves to `claude`,
 * never throws, and the reason is carried in `provider_source`.
 */
function resolveProvider(flagValue, envValue) {
  const known = new Set(['deepseek', 'claude']);
  if (flagValue !== undefined) {
    if (known.has(flagValue)) {
      return { provider: flagValue, provider_source: 'flag' };
    }
    return { provider: 'claude', provider_source: `fallback:unknown --provider value "${flagValue}"` };
  }
  if (envValue !== undefined) {
    if (known.has(envValue)) {
      return { provider: envValue, provider_source: 'env' };
    }
    return { provider: 'claude', provider_source: `fallback:unknown EXECUTION_PROVIDER value "${envValue}"` };
  }
  return { provider: 'claude', provider_source: 'default' };
}

function killSentinelPaths(ledgerDir, runId) {
  return [path.join(ledgerDir, 'KILL'), path.join(ledgerDir, `${runId}.kill`)];
}

function checkKillSentinel(ledgerDir, runId) {
  for (const sentinelPath of killSentinelPaths(ledgerDir, runId)) {
    if (fs.existsSync(sentinelPath)) {
      return sentinelPath;
    }
  }
  return null;
}

function emptyUsage() {
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
}

function addUsage(a, b) {
  return {
    prompt_tokens: (a.prompt_tokens || 0) + (b.prompt_tokens || 0),
    completion_tokens: (a.completion_tokens || 0) + (b.completion_tokens || 0),
    total_tokens: (a.total_tokens || 0) + (b.total_tokens || 0),
  };
}

/**
 * Redacts a tool call's args for the ledger. `content` (write_file) and
 * `new_string` (edit_file) are replaced by `{ bytes, sha256 }` per §C.3 —
 * everything else passes through the shared `redact()`.
 */
function ledgerToolArgs(name, args) {
  const out = { ...args };
  if (name === 'write_file' && typeof out.content === 'string') {
    out.content = { bytes: Buffer.byteLength(out.content, 'utf8'), sha256: sha256Hex(out.content) };
  }
  if (name === 'edit_file' && typeof out.new_string === 'string') {
    out.new_string = { bytes: Buffer.byteLength(out.new_string, 'utf8'), sha256: sha256Hex(out.new_string) };
  }
  return out;
}

function buildResultSummary(name, toolResult) {
  if (!toolResult || toolResult.ok !== true) {
    return undefined;
  }
  switch (name) {
    case 'read_file':
      return { bytes: Buffer.byteLength(toolResult.content || '', 'utf8'), sha256: toolResult.sha256, truncated: !!toolResult.truncated };
    case 'grep_files':
      return { matches_count: (toolResult.matches || []).length, truncated: !!toolResult.truncated };
    case 'write_file':
      return { bytes: toolResult.bytes, sha256: toolResult.sha256, created: !!toolResult.created };
    case 'edit_file':
      return { replacements: toolResult.replacements, sha256: toolResult.sha256 };
    case 'run_bash_command':
      return { exit_code: toolResult.exit_code, truncated: !!toolResult.truncated };
    case 'git_commit':
      return { sha: toolResult.sha };
    default:
      return undefined;
  }
}

const MUTATING_TOOLS = new Set(['write_file', 'edit_file', 'run_bash_command', 'git_commit']);

/**
 * runEngine(opts) — the exported entry point. Throws on an engine-level
 * fault; otherwise returns `{ status, run_id, ledger_path, iterations,
 * usage_total, tool_calls_total, blocked_total, commits }`.
 */
async function runEngine(opts = {}) {
  const repoRoot = resolveRepoRoot(opts.repoRoot);
  const { policy, sha256: policySha256 } = loadPolicy();
  const limits = policy.limits || {};
  const maxIterations = opts.maxIterations || limits.max_iterations || 40;
  const maxTotalTokens = opts.maxTotalTokens || limits.max_total_tokens || 400000;

  if (!opts.briefPath) {
    throw new Error('runEngine requires opts.briefPath');
  }
  const briefAbs = path.resolve(repoRoot, opts.briefPath);
  let briefContent;
  try {
    briefContent = fs.readFileSync(briefAbs, 'utf8');
  } catch (err) {
    throw new Error(`unable to read brief at ${briefAbs}: ${err.message}`);
  }
  const briefSha256 = sha256Hex(briefContent);
  // §C.6.1 (F13, commit 10b) — the brief's write_scope front matter. The
  // parsed body is not currently threaded into the system prompt separately
  // from the raw content (the model sees the whole brief, front matter
  // included) — only the ENGINE reads the parsed `write_scope`.
  const { writeScope } = parseBrief(briefContent);

  const resolved = resolveProvider(opts.provider, process.env.EXECUTION_PROVIDER);
  let provider = resolved.provider;
  let providerSource = resolved.provider_source;

  // §B / F14 (commit 11) — "an engine-unavailable provider resolves to
  // claude and logs the downgrade with its reason — never a throw-and-halt."
  // Two engine-unavailable conditions, checked ONLY when resolveProvider
  // already granted `deepseek`: (a) no DEEPSEEK_API_KEY AND no injected
  // modelClient/transcript (the exact condition under which
  // createDeepSeekClient below would otherwise throw); (b) the brief
  // declares no write_scope (§C.6.1) — previously a non-zero NO_WRITE_SCOPE
  // refusal (Phase 2 commit 10b); §B forbids a halt, so this is now folded
  // into the same downgrade path instead of its own terminal status.
  if (provider === 'deepseek') {
    const hasLiveClient = !!opts.modelClient || Array.isArray(opts.transcriptTurns) || !!opts.transcript;
    if (!hasLiveClient && !process.env.DEEPSEEK_API_KEY) {
      provider = 'claude';
      providerSource = 'fallback:engine_unavailable:no_api_key';
    } else if (writeScope.length === 0) {
      provider = 'claude';
      providerSource = 'fallback:no_write_scope';
    }
  }
  if (providerSource.startsWith('fallback:')) {
    // One stderr line on ANY downgrade (unknown --provider/EXECUTION_PROVIDER
    // values already resolved this way before commit 11; this line now
    // covers those too, not only the two new reasons).
    process.stderr.write(`deepseek-exec: provider downgraded to claude (${providerSource.slice('fallback:'.length)})\n`);
  }
  const model = opts.model || process.env.DEEPSEEK_EXEC_MODEL || 'deepseek-chat';
  const runId = opts.runId || generateRunId();
  // opts.ledger is a test-only escape hatch (mirrors opts.modelClient below)
  // — it lets a lock test prove "a ledger write failure aborts the run"
  // deterministically (a wrapping ledger whose append() throws) rather than
  // relying on OS filesystem-permission behavior, which differs by platform.
  const ledger = opts.ledger || openLedger({ ledgerDir: opts.ledgerDir, runId });
  const ledgerDir = path.dirname(ledger.path);
  const { headSha, branch } = gitInfo(repoRoot);

  // §C.6.3 (F13, commit 10b) — the active-claims registry. Only the LIVE
  // execution path (provider `deepseek`) ever touches a tool, so only it
  // acquires a claim; `claude` delegates and never dispatches a tool call.
  let claimId = null;
  if (provider === 'deepseek' && writeScope.length > 0) {
    try {
      const claim = acquireClaim({ ledgerDir, runId, repoRoot, branch, writeScope });
      claimId = claim.claimId;
    } catch (err) {
      if (err instanceof ClaimConflictError) {
        ledger.append({
          kind: 'run_start', provider, provider_source: providerSource, model, repo_root: repoRoot,
          head_sha: headSha, branch, brief_path: briefAbs, brief_sha256: briefSha256, policy_sha256: policySha256,
          budgets: { max_iterations: maxIterations, max_total_tokens: maxTotalTokens }, engine_version: ENGINE_VERSION,
          write_scope: writeScope, claim_id: null,
        });
        ledger.append({
          kind: 'run_end', status: 'claim_conflict', iterations: 0, usage_total: emptyUsage(),
          tool_calls_total: 0, blocked_total: 0, commits: [], duration_ms: 0,
        });
        ledger.close();
        return {
          status: 'claim_conflict', run_id: runId, ledger_path: ledger.path,
          iterations: 0, usage_total: emptyUsage(), tool_calls_total: 0, blocked_total: 0, commits: [],
        };
      }
      throw err;
    }
  }
  const releaseThisClaim = () => releaseClaim({ ledgerDir, claimId });
  // Defense-in-depth: a crash that skips `finish()` (e.g. an unhandled
  // exception outside runEngine's own control flow) must not strand a claim
  // in the registry forever.
  process.on('exit', releaseThisClaim);
  // Every normal exit path below removes the listener after releasing —
  // otherwise a long-lived host process (many runEngine() calls, e.g. a
  // test suite) accumulates one 'exit' listener per run and eventually
  // trips Node's MaxListenersExceededWarning.
  function finalizeClaim() {
    releaseThisClaim();
    process.removeListener('exit', releaseThisClaim);
  }

  const runStart = {
    kind: 'run_start',
    provider,
    provider_source: providerSource,
    model,
    repo_root: repoRoot,
    head_sha: headSha,
    branch,
    brief_path: briefAbs,
    brief_sha256: briefSha256,
    policy_sha256: policySha256,
    budgets: { max_iterations: maxIterations, max_total_tokens: maxTotalTokens },
    engine_version: ENGINE_VERSION,
    write_scope: writeScope,
    claim_id: claimId,
  };
  ledger.append(runStart);

  if (provider === 'claude') {
    ledger.append({
      kind: 'run_end',
      status: 'delegated_to_claude',
      iterations: 0,
      usage_total: emptyUsage(),
      tool_calls_total: 0,
      blocked_total: 0,
      commits: [],
      duration_ms: 0,
    });
    ledger.close();
    finalizeClaim();
    return {
      status: 'delegated_to_claude', run_id: runId, ledger_path: ledger.path,
      iterations: 0, usage_total: emptyUsage(), tool_calls_total: 0, blocked_total: 0, commits: [],
    };
  }

  // §B / F14 (commit 11) — the old NO_WRITE_SCOPE non-zero refusal (Phase 2
  // commit 10b) is GONE: an empty write_scope is now caught above, BEFORE
  // run_start, as a `fallback:no_write_scope` downgrade to `claude`, which
  // already returned via the `provider === 'claude'` branch above. Provider
  // can therefore never reach this point still `deepseek` with an empty
  // writeScope — asserted defensively rather than assumed, since a silently
  // reintroduced code path here would otherwise resurrect the halt §B bans.
  if (writeScope.length === 0) {
    throw new Error('unreachable: deepseek run with an empty write_scope should have downgraded to claude before run_start');
  }

  const startedAt = Date.now();
  const runState = { readState: {} };
  const tools = createTools({ repoRoot, policy, ledger, runState, runId, model, writeScope });

  let modelClient = opts.modelClient;
  if (!modelClient) {
    if (Array.isArray(opts.transcriptTurns)) {
      modelClient = createTranscriptClient(opts.transcriptTurns);
    } else if (opts.transcript) {
      const turns = JSON.parse(fs.readFileSync(path.resolve(repoRoot, opts.transcript), 'utf8'));
      modelClient = createTranscriptClient(turns);
    } else {
      modelClient = createDeepSeekClient({ model });
    }
  }

  const systemPrompt = [
    'You are the DeepSeek Execution Engine (SUB-ENG-1) operating on a real git worktree.',
    'You have exactly the tools listed in this turn\'s tool schemas. Every call must include a "reason".',
    '',
    briefContent,
  ].join('\n');

  const messages = [{ role: 'system', content: redact(systemPrompt) }];

  let iteration = 0;
  let usageTotal = emptyUsage();
  let toolCallsTotal = 0;
  let blockedTotal = 0;
  const commits = [];

  function finish(status) {
    const record = {
      kind: 'run_end',
      status,
      iterations: iteration,
      usage_total: usageTotal,
      tool_calls_total: toolCallsTotal,
      blocked_total: blockedTotal,
      commits,
      duration_ms: Date.now() - startedAt,
    };
    ledger.append(record);
    ledger.close();
    // §C.6.3 — "the claim is removed at run_end (any status)."
    finalizeClaim();
    return {
      status, run_id: runId, ledger_path: ledger.path,
      iterations: iteration, usage_total: usageTotal, tool_calls_total: toolCallsTotal,
      blocked_total: blockedTotal, commits,
    };
  }

  for (;;) {
    // §C.1.2 — kill switch checked before EVERY model turn.
    const sentinelBeforeTurn = checkKillSentinel(ledgerDir, runId);
    if (sentinelBeforeTurn) {
      ledger.append({ kind: 'kill', sentinel_path: sentinelBeforeTurn });
      return finish('killed');
    }

    iteration += 1;
    if (iteration > maxIterations) {
      iteration -= 1;
      return finish('budget_exhausted');
    }

    let turn;
    try {
      turn = await modelClient.next(messages, tools.schemas);
    } catch (err) {
      ledger.append({ kind: 'error', code: 'PROVIDER_ERROR', message: redact(err.message || String(err)), iteration });
      return finish('aborted');
    }

    usageTotal = addUsage(usageTotal, turn.usage || emptyUsage());
    const toolCalls = (turn.message && turn.message.tool_calls) || [];
    ledger.append({
      kind: 'model_turn',
      iteration,
      usage: turn.usage || emptyUsage(),
      tool_calls: toolCalls.length,
      finish_reason: turn.finish_reason,
      assistant_text: redact((turn.message && turn.message.content) || '').slice(0, 4096),
    });

    if (usageTotal.total_tokens > maxTotalTokens) {
      return finish('budget_exhausted');
    }

    messages.push({
      role: 'assistant',
      // §C.1.5 (commit 8) — "every string that enters a model message OR a
      // ledger record passes redaction"; the model_turn ledger record above
      // already redacts its own copy, but the assistant's own content is
      // ALSO re-fed into the next turn's `messages` array, so it must be
      // redacted here too or a secret the model echoes back would survive
      // unredacted for every subsequent turn's prompt.
      content: redact(turn.message.content ?? null),
      tool_calls: toolCalls,
    });

    if (toolCalls.length === 0) {
      return finish('completed');
    }

    for (const call of toolCalls) {
      // §C.1.2 — kill switch checked before EVERY tool call too.
      const sentinelBeforeTool = checkKillSentinel(ledgerDir, runId);
      if (sentinelBeforeTool) {
        ledger.append({ kind: 'kill', sentinel_path: sentinelBeforeTool });
        return finish('killed');
      }

      const name = call.function && call.function.name;
      let args;
      try {
        args = JSON.parse((call.function && call.function.arguments) || '{}');
      } catch (err) {
        ledger.append({ kind: 'error', code: 'MALFORMED_TOOL_CALL', message: redact(`unparsable arguments for "${name}": ${err.message}`), iteration });
        return finish('aborted');
      }

      const isMutating = MUTATING_TOOLS.has(name);

      let dispatchOutcome;
      try {
        dispatchOutcome = await tools.dispatch(name, args);
      } catch (err) {
        if (err instanceof MalformedToolCallError) {
          ledger.append({ kind: 'error', code: 'MALFORMED_TOOL_CALL', message: redact(err.message), iteration });
          return finish('aborted');
        }
        throw err;
      }

      // §C.3 — pre/post worktree capture is produced by the HANDLER itself
      // (scripts/lib/exec-worktree.js, wired in commit 4) so the window is
      // taken immediately around the actual mutation, not around dispatch
      // overhead. A stub tool (nothing implemented yet) has no pre/post.
      const { toolResult, pre, post, duration_ms: durationMs } = dispatchOutcome;

      const status = toolResult.ok ? 'ok' : (BLOCKED_CODES.has(toolResult.error && toolResult.error.code) ? 'blocked' : 'error');
      toolCallsTotal += 1;
      if (status === 'blocked') {
        blockedTotal += 1;
      }
      if (name === 'git_commit' && toolResult.ok && toolResult.sha) {
        commits.push(toolResult.sha);
      }

      const toolCallRecord = {
        kind: 'tool_call',
        iteration,
        tool: name,
        call_id: call.id,
        args: ledgerToolArgs(name, args),
        reason: args && args.reason,
        status,
        duration_ms: durationMs,
        result_summary: buildResultSummary(name, toolResult),
      };
      if (!toolResult.ok) {
        toolCallRecord.error = toolResult.error;
      }
      if (isMutating) {
        toolCallRecord.pre = pre;
        toolCallRecord.post = post;
      }
      ledger.append(toolCallRecord);

      // §C.3 run_end.status enumerates 'hook_failed' as a distinct overall
      // outcome, not merely a per-call error — a git_commit whose hooks (or
      // `git add`) genuinely fail is a real problem with the commit itself
      // (not a self-correctable fence like NOT_READ), so the run ends here
      // rather than looping the model into retrying the same failing commit.
      if (name === 'git_commit' && !toolResult.ok && toolResult.error && toolResult.error.code === 'HOOK_FAILED') {
        return finish('hook_failed');
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        // §C.1.5 — every string entering a model message passes redaction,
        // not only the ledger's copy (a tool result, e.g. read_file's
        // `content`, is otherwise unredacted text headed straight for the
        // model turn).
        content: redact(JSON.stringify(toolResult)),
      });
    }
  }
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf('=');
    let key = arg;
    let inlineValue;
    if (arg.startsWith('--') && eq !== -1) {
      key = arg.slice(0, eq);
      inlineValue = arg.slice(eq + 1);
    }
    const takeValue = () => (inlineValue !== undefined ? inlineValue : argv[++i]);
    switch (key) {
      case '--brief': opts.briefPath = takeValue(); break;
      case '--repo': opts.repoRoot = takeValue(); break;
      case '--provider': opts.provider = takeValue(); break;
      case '--model': opts.model = takeValue(); break;
      case '--max-iterations': opts.maxIterations = safeParsePositiveInt(takeValue(), '--max-iterations'); break;
      case '--transcript': opts.transcript = takeValue(); break;
      case '--ledger-dir': opts.ledgerDir = takeValue(); break;
      default: break;
    }
  }
  return opts;
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  runEngine(opts)
    .then((summary) => {
      const ok = summary.status === 'completed' || summary.status === 'delegated_to_claude';
      process.exitCode = ok ? 0 : 1;
      console.log(JSON.stringify(summary));
    })
    .catch((err) => {
      process.exitCode = 1;
      // §C.1.5 (G5, commit 8) — "every stderr line the engine prints" is
      // redacted, including an engine-level fault's own stack trace (which
      // may echo a brief path, an argv value, or another string that could
      // itself carry a secret pattern).
      console.error(redact(err && err.stack ? err.stack : String(err)));
    });
}

module.exports = { runEngine, resolveProvider, ledgerToolArgs, BLOCKED_CODES };
