// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 (R-AG — the pre-push full suite; suite-speed WF2 2026-10-08)
//
// Per-test-file memo for IDENTICAL child-process runs. A test file that runs
// the very same command (same cmd, same args, same cwd, same FULL env) several
// times gets one real run; every later caller reads that run's result. Nothing
// about WHAT is asserted changes: the result is the real process's result.
//
// Rules (each one is why this is safe):
//   1. The key is [cmd, args, cwd, every env entry]. Any difference — an env
//      override, a fixture path, a different slug — is a different key, so a
//      different real run.
//   2. Only a run that reached an exit code (numeric `status`) is cached. A
//      spawn error, a timeout or a maxBuffer kill is NOT a result; the next
//      caller runs the process again, exactly as before the memo existed.
//   3. execFileSync's contract is kept: a non-zero exit is cached as the thrown
//      error and re-thrown to every caller.
//   4. Use it ONLY where nothing the child reads changes between the calls (a
//      test that mutates a committed file and re-runs a checker must call the
//      raw child_process function instead).
//   5. The first caller's options (timeout, maxBuffer) are the ones the real
//      run used.
//   6. `prefetch()` only changes WHEN an identical real run happens (earlier, a few at a
//      time), never what it is: same cmd/args/cwd/env, its own process, and it stores a
//      result only when the sync path would have stored the same one.
// One memo per test file (`createExecMemo()` at module scope); vitest isolates
// modules per file, so nothing is shared across files.
import {
  execFile as rawExecFile,
  execFileSync as rawExecFileSync,
  spawnSync as rawSpawnSync,
  type ExecFileSyncOptionsWithStringEncoding,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'node:child_process';

type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

/** One command for `prefetch()`: `kind` names the sync call that will later read it. */
export interface PrefetchJob {
  kind: 'spawnSync' | 'execFileSync';
  cmd: string;
  args: readonly string[];
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number; maxBuffer?: number };
}

/**
 * Builders for `prefetch()` jobs. They mirror the sync call they pre-run —
 * `prefetchJob.spawnSync('node', [X, '--flag'], opts)` — so a source scan for
 * `spawnSync('node', [X, …])` literals (step-conformance's anti-recursion guard)
 * still sees and checks every pre-run command's args.
 */
export const prefetchJob = {
  spawnSync(cmd: string, args: readonly string[], opts: PrefetchJob['opts']): PrefetchJob {
    return { kind: 'spawnSync', cmd, args, opts };
  },
  execFileSync(cmd: string, args: readonly string[], opts: PrefetchJob['opts']): PrefetchJob {
    return { kind: 'execFileSync', cmd, args, opts };
  },
};

function keyOf(cmd: string, args: readonly string[], cwd: string | URL | undefined, env: EnvLike | undefined): string {
  const e = env ?? process.env;
  const entries = Object.keys(e).sort().map((k) => [k, e[k]]);
  return JSON.stringify([cmd, args, String(cwd ?? process.cwd()), entries]);
}

export interface ExecMemo {
  spawnSync(cmd: string, args: readonly string[], opts: SpawnSyncOptionsWithStringEncoding): SpawnSyncReturns<string>;
  execFileSync(cmd: string, args: readonly string[], opts: ExecFileSyncOptionsWithStringEncoding): string;
  /**
   * Run `jobs` as REAL async child processes, at most `concurrency` at a time, and store each
   * result under the key the matching sync call will look up. Stored ONLY on a clean exit code:
   * spawnSync jobs on any numeric exit status, execFileSync jobs only on exit 0 (a non-zero exit is
   * left for the sync call to reproduce with its own genuine thrown error). A timeout, maxBuffer
   * overflow or spawn error stores nothing. Never rejects.
   */
  prefetch(jobs: readonly PrefetchJob[], concurrency: number): Promise<void>;
  /** How many REAL processes this memo has run (cache misses). */
  readonly realRuns: number;
}

export function createExecMemo(): ExecMemo {
  const spawned = new Map<string, SpawnSyncReturns<string>>();
  const executed = new Map<string, { out: string } | { err: unknown }>();
  let realRuns = 0;
  return {
    spawnSync(cmd, args, opts) {
      const key = keyOf(cmd, args, opts.cwd, opts.env);
      const hit = spawned.get(key);
      if (hit) return hit;
      realRuns++;
      const run = rawSpawnSync(cmd, args, opts);
      if (typeof run.status === 'number' && !run.error) spawned.set(key, run);
      return run;
    },
    execFileSync(cmd, args, opts) {
      const key = keyOf(cmd, args, opts.cwd, opts.env);
      const hit = executed.get(key);
      if (hit) {
        if ('err' in hit) throw hit.err;
        return hit.out;
      }
      realRuns++;
      try {
        const out = rawExecFileSync(cmd, args, opts);
        executed.set(key, { out });
        return out;
      } catch (err) {
        if (typeof (err as { status?: unknown }).status === 'number') executed.set(key, { err });
        throw err;
      }
    },
    async prefetch(jobs, concurrency) {
      const todo = jobs.filter((j) => {
        const key = keyOf(j.cmd, j.args, j.opts.cwd, j.opts.env);
        return j.kind === 'spawnSync' ? !spawned.has(key) : !executed.has(key);
      });
      let next = 0;
      const runOne = (j: PrefetchJob) =>
        new Promise<void>((resolve) => {
          const key = keyOf(j.cmd, j.args, j.opts.cwd, j.opts.env);
          realRuns++;
          rawExecFile(
            j.cmd,
            [...j.args],
            { cwd: j.opts.cwd, env: j.opts.env, timeout: j.opts.timeout, maxBuffer: j.opts.maxBuffer ?? 1024 * 1024, encoding: 'utf8', windowsHide: true },
            (err, stdout, stderr) => {
              const code = err ? (err as { code?: unknown }).code : 0;
              const killed = Boolean(err && ((err as { killed?: boolean }).killed || (err as { signal?: unknown }).signal));
              if (typeof code === 'number' && !killed) {
                if (j.kind === 'spawnSync') {
                  spawned.set(key, { pid: 0, output: [null, stdout, stderr], stdout, stderr, status: code, signal: null });
                } else if (code === 0) {
                  executed.set(key, { out: stdout });
                }
              }
              resolve();
            },
          );
        });
      const worker = async () => {
        while (next < todo.length) {
          const j = todo[next++]!;
          await runOne(j);
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, todo.length)) }, worker));
    },
    get realRuns() {
      return realRuns;
    },
  };
}
