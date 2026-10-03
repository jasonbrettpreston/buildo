// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1
// Plan: .cursor/wf2_registry_truth_active_task.md P1-C-src (c), Fold 14
//
// WHAT: the test-mode caller tag. It PROVIDES (never wraps) the single
// `AsyncLocalStorage<string>` instance the ONE tracer
// (scripts/lib/sql-witness/trace-preload.cjs) reads at record time via
// `globalThis[Symbol.for('buildo.sql-witness.caller')]`, derives the source
// file that issued a query from the JS stack, and can install a thin
// `pool.query` wrapper that runs each call inside that scope.
//
// WHY: without a caller tag a trace statement can be attributed to a file only
// by eyeballing `text`. With it, a test-mode run names the route/feature that
// issued each statement. The tracer stays the only thing that touches
// `pg.Client.prototype.query` (one tracer, Spec 122 §10) — this module only
// supplies the tag the tracer already knows how to read.
//
// SCOPE: no effect unless `NODE_ENV === 'test'` AND `BUILDO_SQL_TRACE` is set;
// in every other environment `installSqlCallerTag` is a no-op that returns
// `false`, so shipped behaviour is unchanged. Runtime confirmation is PARTIAL:
// the `pool.query` path is tagged, but `getClient()` hands out a raw client
// whose `client.query` calls are NOT tagged (see src/lib/db/client.ts).

import { AsyncLocalStorage } from 'node:async_hooks';

export const SQL_TRACE_CALLER_KEY = Symbol.for('buildo.sql-witness.caller');
const INSTALLED_KEY = Symbol.for('buildo.sql-witness.caller-installed');

// Frames belonging to the tracing plumbing itself are never the caller we want:
// the wrapper frame (this module) and the pool frame (client.ts) sit between the
// real caller and the tracer.
const SKIPPED_FILES = ['src/lib/db/client.ts', 'src/lib/db/sql-trace-caller.ts'];
const SOURCE_FRAME_RE = /(src\/[^\s()]*?\.(?:ts|tsx)):\d+:\d+/;

/**
 * The caller tag is only meaningful inside a traced test run: `NODE_ENV=test`
 * selects test mode, `BUILDO_SQL_TRACE` proves the tracer will actually read
 * the tag (without a trace dir the tracer does not even wrap `query`).
 */
export function sqlTraceCallerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'test' && Boolean(env.BUILDO_SQL_TRACE);
}

/**
 * Return the first `src/**.ts|tsx` frame that is not tracing plumbing, as a
 * repo-relative POSIX path (`src/app/api/permits/route.ts`). `null` when the
 * stack is missing or every frame is library/Node-internal.
 */
export function sqlCallerFile(stack: string | undefined): string | null {
  if (!stack) return null;
  const lines = stack.replace(/\\/g, '/').split('\n');
  for (let i = 1; i < lines.length; i += 1) {
    const frame = lines[i];
    if (!frame) continue;
    const match = SOURCE_FRAME_RE.exec(frame);
    if (!match) continue;
    const file = match[1];
    if (!file || SKIPPED_FILES.includes(file)) continue;
    return file;
  }
  return null;
}

/**
 * Get-or-create the ONE `AsyncLocalStorage<string>` instance shared by this
 * module and the tracer. Created once per process: a re-require (or a second
 * importer) must reuse the same instance, or the tracer would read an empty
 * store while the tag was written to a different one.
 */
export function callerStore(): AsyncLocalStorage<string> {
  const shared = globalThis as unknown as Record<symbol, AsyncLocalStorage<string> | undefined>;
  const existing = shared[SQL_TRACE_CALLER_KEY];
  if (existing) return existing;
  const created = new AsyncLocalStorage<string>();
  shared[SQL_TRACE_CALLER_KEY] = created;
  return created;
}

/**
 * Run `fn` with the caller tag set to the file derived from `stack`. Returns
 * `fn()`'s value and propagates its throw. Disabled env, or a stack with no
 * taggable frame, runs `fn` untagged (the store stays `undefined`) rather than
 * tagging it with a placeholder.
 */
export function withSqlCaller<R>(
  fn: () => R,
  stack: string | undefined = new Error().stack,
  env: NodeJS.ProcessEnv = process.env
): R {
  if (!sqlTraceCallerEnabled(env)) return fn();
  const file = sqlCallerFile(stack);
  return file ? callerStore().run(file, fn) : fn();
}

/**
 * Install the caller tag on a pool by replacing `pool.query` with a
 * pass-through wrapper that runs the original inside `withSqlCaller`. Returns
 * `false` when disabled (pool untouched) and `true` otherwise, including on a
 * repeat call — the symbolic marker on the pool makes this idempotent, so a
 * double install never double-wraps (`new Error().stack` at the tagged call
 * time is what names the caller; a nested wrapper would only add frames at the
 * bottom, which are skipped anyway, but the identity churn is still avoided).
 *
 * `new Error().stack` is captured inside the wrapper, so the top frames are the
 * wrapper itself and the caller — which is why `withSqlCaller` skips them.
 */
export function installSqlCallerTag(
  pool: { query: (...args: never[]) => unknown },
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!sqlTraceCallerEnabled(env)) return false;
  const marked = pool as unknown as Record<symbol, boolean | undefined>;
  if (marked[INSTALLED_KEY]) return true;

  const original = pool.query;
  const tagged = function taggedQuery(this: unknown, ...args: never[]): unknown {
    return withSqlCaller(() => original.apply(this, args), new Error().stack, env);
  } as (...args: never[]) => unknown;

  pool.query = tagged;
  marked[INSTALLED_KEY] = true;
  return true;
}
