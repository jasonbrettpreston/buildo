// SPEC LINK: docs/specs/00-architecture/08_agents.md §C
//
// Shared throwaway-repo + transcript-client harness for the SUB-ENG-1 lock
// suites (src/tests/deepseek-exec.infra.test.ts, src/tests/deepseek-exec-fences.infra.test.ts).
// Extracted in Phase 2 commit 6 to avoid duplicating the harness across two
// files (the phase-1 lock file's own inline copy was replaced with imports
// from here — same behavior, single definition).
//
// Test hygiene (tasks/lessons.md, 2026-09-21 — "a test that shells out to git
// inherits the SESSION's GIT_* env"): every child git process this harness
// spawns runs with a GIT_*-scrubbed, allowlisted env and a fail-closed guard
// that refuses to touch anything but a throwaway temp repo, checked BEFORE
// any mutating git command.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const REPO_ROOT = path.resolve(__dirname, '../../../');
const FORBIDDEN_REPO_ROOTS = ['C:\\Users\\User\\buildo-engine', 'C:\\Users\\User\\Buildo', REPO_ROOT];

// Git exports GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE/... into hook environments;
// a child `git` that inherits them ignores `cwd` (tasks/lessons.md, capture-
// harness-overwrite.infra.test.ts precedent). Scrub at module load.
for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX']) delete process.env[k];

export const GIT_TEST_IDENTITY = {
  GIT_AUTHOR_NAME: 'deepseek-exec-test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'deepseek-exec-test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid',
};
const ALLOWED_ENV_KEYS = ['PATH', 'Path', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'SystemRoot', 'ComSpec', 'APPDATA', 'LOCALAPPDATA'];

export type ChildEnv = { NODE_ENV: 'development' | 'production' | 'test'; [key: string]: string };

export function scrubbedChildEnv(): ChildEnv {
  const nodeEnv = process.env.NODE_ENV;
  const out: ChildEnv = { NODE_ENV: nodeEnv === 'development' || nodeEnv === 'production' ? nodeEnv : 'test' };
  for (const k of Object.keys(process.env)) {
    const v = process.env[k];
    if (ALLOWED_ENV_KEYS.includes(k) && v !== undefined) out[k] = v;
  }
  Object.assign(out, GIT_TEST_IDENTITY);
  return out;
}

export function assertThrowawayRepo(repo: string): void {
  // A forbidden root that no longer exists on disk (the buildo-engine worktree
  // was removed 2026-09-22) must not crash the guard — fall back to the
  // resolved path so the comparison still fails closed on a string match.
  const norm = (p: string) => {
    try {
      return fs.realpathSync.native(path.resolve(p)).toLowerCase();
    } catch {
      return path.resolve(p).toLowerCase();
    }
  };
  const repoNorm = norm(repo);
  if (FORBIDDEN_REPO_ROOTS.some((f) => { const fn = norm(f); return repoNorm === fn || repoNorm.startsWith(fn + path.sep); })) {
    throw new Error(`refusing to run a mutating git command against ${repo} — a real project root, not a throwaway repo`);
  }
  if (!repoNorm.startsWith(norm(os.tmpdir()) + path.sep) && repoNorm !== norm(os.tmpdir())) {
    throw new Error(`refusing: ${repo} is not under the OS temp dir`);
  }
}

export function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-test-'));
  assertThrowawayRepo(repo);
  const env = scrubbedChildEnv();
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('-c', 'core.autocrlf=false', 'init', '-q');
  assertThrowawayRepo(repo);
  git('config', 'user.email', GIT_TEST_IDENTITY.GIT_AUTHOR_EMAIL);
  git('config', 'user.name', GIT_TEST_IDENTITY.GIT_AUTHOR_NAME);
  git('config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(repo, 'seed.txt'), 'seed\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'seed');
  return repo;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS engine
export const engineMod = require(path.join(REPO_ROOT, 'scripts/deepseek-exec.js'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const ledgerMod = require(path.join(REPO_ROOT, 'scripts/lib/exec-ledger.js'));

export const runEngine: (opts: Record<string, unknown>) => Promise<{
  status: string; run_id: string; ledger_path: string; iterations: number;
  usage_total: { prompt_tokens: number; completion_tokens: number; total_tokens: number; billable_tokens: number };
  tool_calls_total: number; blocked_total: number; commits: string[];
}> = engineMod.runEngine;
export const resolveProvider: (flag: string | undefined, env: string | undefined) => { provider: string; provider_source: string } = engineMod.resolveProvider;
export const redact: (s: string, extra?: string[]) => string = ledgerMod.redact;

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type Turn = {
  message: { role: 'assistant'; content: string | null; tool_calls: ToolCall[] };
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  finish_reason: string;
};

export function toolTurn(id: string, name: string, args: unknown): Turn {
  return {
    message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    finish_reason: 'tool_calls',
  };
}
export function multiToolTurn(calls: Array<{ id: string; name: string; args: unknown }>): Turn {
  return {
    message: { role: 'assistant', content: null, tool_calls: calls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: JSON.stringify(c.args) } })) },
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    finish_reason: 'tool_calls',
  };
}
export function rawToolTurn(id: string, name: string, rawArguments: string): Turn {
  return {
    message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: rawArguments } }] },
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    finish_reason: 'tool_calls',
  };
}
export function stopTurn(): Turn {
  return { message: { role: 'assistant', content: 'done', tool_calls: [] }, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, finish_reason: 'stop' };
}

export function hookedClient(turns: Turn[], hooks: Record<number, () => void> = {}) {
  let i = 0;
  return {
    async next() {
      const hook = hooks[i];
      if (hook) hook();
      const t = turns[i];
      i += 1;
      if (!t) return stopTurn();
      return t;
    },
  };
}

/**
 * writeBrief(repo, opts) — §C.6.1 front matter. DEFAULTS to
 * `write_scope: ['**']` (matches everything) so every PRE-existing call site
 * (all of Phase 1 + Phase 2 commits 6-10, none of which declare a scope)
 * keeps behaving exactly as before once commit 10b's NO_WRITE_SCOPE-refusal
 * and PATH_OUT_OF_SCOPE fences land — a real scope was always "supposed" to
 * be there, `['**']` is the honest default for a test that isn't exercising
 * scope itself. Pass `{ writeScope: null }` (or `{ writeScope: [] }`) for the
 * NO_WRITE_SCOPE lock, or a narrow glob array for the PATH_OUT_OF_SCOPE lock.
 */
export function writeBrief(repo: string, opts?: { writeScope?: string[] | null }): string {
  const briefPath = path.join(repo, 'brief.md');
  const scope = opts && Object.prototype.hasOwnProperty.call(opts, 'writeScope') ? opts.writeScope : ['**'];
  const frontMatter = (scope === null || scope === undefined || scope.length === 0)
    ? ''
    : `---\nwrite_scope:\n${scope.map((g) => `- ${g}`).join('\n')}\n---\n`;
  fs.writeFileSync(briefPath, `${frontMatter}test brief\n`);
  return briefPath;
}

/**
 * cleanupTempDir(dir) — fold-validation LOW (commit 12e): under full-suite
 * load, `fs.rmSync` of a throwaway temp repo can hit `EPERM` on Windows when
 * a just-killed child process (the timeout-budget locks spawn real
 * processes) still holds a lingering handle into it — a transient race, not
 * a real failure of the test itself. `maxRetries`/`retryDelay` give the OS a
 * little time to release the handle; a FINAL failure is logged, not thrown —
 * the OS temp dir is disposable, and failing the test suite over an orphaned
 * temp directory is strictly worse than leaving one behind.
 */
export function cleanupTempDir(dir: string): void {
  if (!dir) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (err) {
    console.warn(`cleanupTempDir: could not remove ${dir}: ${(err as Error).message}`);
  }
}

export function ledgerRecords(ledgerDir: string, runId: string): Array<Record<string, unknown>> {
  const text = fs.readFileSync(path.join(ledgerDir, `${runId}.jsonl`), 'utf8');
  return text.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
