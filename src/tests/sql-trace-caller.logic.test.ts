// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1
// Plan: .cursor/wf2_registry_truth_active_task.md P1-C-src (c), Fold 14
//
// Logic lock for src/lib/db/sql-trace-caller.ts — the test-mode caller tag.
// The module only PROVIDES the AsyncLocalStorage<string> instance the ONE
// tracer (scripts/lib/sql-witness/trace-preload.cjs) reads at
// `globalThis[Symbol.for('buildo.sql-witness.caller')]`, plus the source-file
// tag derivation and the pool.query wrapper that sets that tag. It never wraps
// `pg.Client.prototype` (one tracer, Spec 122 §10). Runtime confirmation of the
// tags is PARTIAL: pool-level `query()` is tagged, `getClient()` callers are not.

import { describe, it, expect, afterEach } from 'vitest';
import * as tag from '@/lib/db/sql-trace-caller';

const INSTALLED_KEY = Symbol.for('buildo.sql-witness.caller-installed');

// A real Windows stack (the string a Windows CI/dev box produces) with the
// module's OWN frame first, then client.ts, then the actual route.
const WINDOWS_STACK =
  'Error\n' +
  '    at withSqlCaller (C:\\Users\\u\\Buildo\\src\\lib\\db\\sql-trace-caller.ts:40:9)\n' +
  '    at query (C:\\Users\\u\\Buildo\\src\\lib\\db\\client.ts:117:30)\n' +
  '    at GET (C:\\Users\\u\\Buildo\\src\\app\\api\\permits\\route.ts:52:18)';

// The same shape on POSIX: client.ts is skipped, the feature lib wins.
const POSIX_STACK =
  'Error\n' +
  '    at q (/repo/src/lib/db/client.ts:1:1)\n' +
  '    at load (/repo/src/features/leads/lib/get-lead-feed.ts:9:2)';

// Only frames inside dependencies / Node internals — nothing taggable.
const NOISE_STACK =
  'Error\n' +
  '    at run (/repo/node_modules/next/dist/server/lib/router.js:9:2)\n' +
  '    at process (node:internal/process/task_queues:95:5)';

const THIS_FILE = 'src/tests/sql-trace-caller.logic.test.ts';

interface FakePool {
  // `never` matches the module's own signature while still accepting calls
  // with arguments (a `string` param would narrow `pool.query('SELECT 1')`).
  query: (...args: never[]) => unknown;
  [INSTALLED_KEY]?: boolean;
}

function fakePool(): FakePool {
  return {
    // Stand-in for `pool.query`: reports whatever caller tag is active, so the
    // test observes the tag the wrapper installed rather than real SQL.
    query: (..._a: never[]) => tag.callerStore().getStore() ?? null,
  };
}

// `pool.query` is typed `(...args: never[])`, so a literal argument cannot be
// passed directly; capture the call in a variable to keep the test honest
// (it really does CALL query, and really does read the returned tag).
function callQuery(fn: (...args: never[]) => unknown, sql: string): unknown {
  return (fn as unknown as (text: string) => unknown)(sql);
}

// `installSqlCallerTag` mutates the shared global store / pool objects. Tests
// that install must not leak the marker into a sibling test's fake pool — each
// fake pool is fresh, but the global ALS instance is intentionally shared.
afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('buildo.sql-witness.caller')];
});

describe('sqlCallerFile — derive the taggable source frame', () => {
  it('skips the module + client.ts frames and returns the route (Windows backslashes)', () => {
    expect(tag.sqlCallerFile(WINDOWS_STACK)).toBe('src/app/api/permits/route.ts');
  });

  it('skips client.ts and returns the first src/ feature frame (POSIX)', () => {
    expect(tag.sqlCallerFile(POSIX_STACK)).toBe('src/features/leads/lib/get-lead-feed.ts');
  });

  it('returns null when every frame is node_modules / node:internal', () => {
    expect(tag.sqlCallerFile(NOISE_STACK)).toBeNull();
  });

  it('returns null for an undefined stack', () => {
    expect(tag.sqlCallerFile(undefined)).toBeNull();
  });
});

describe('sqlTraceCallerEnabled — test mode AND a trace dir', () => {
  it('is enabled when NODE_ENV=test and BUILDO_SQL_TRACE is set', () => {
    expect(
      tag.sqlTraceCallerEnabled({ NODE_ENV: 'test', BUILDO_SQL_TRACE: '/tmp/x' })
    ).toBe(true);
  });

  it('is disabled outside test mode even with BUILDO_SQL_TRACE set', () => {
    expect(
      tag.sqlTraceCallerEnabled({ NODE_ENV: 'production', BUILDO_SQL_TRACE: '/tmp/x' })
    ).toBe(false);
  });

  it('is disabled in test mode without BUILDO_SQL_TRACE', () => {
    expect(tag.sqlTraceCallerEnabled({ NODE_ENV: 'test' })).toBe(false);
  });
});

describe('installSqlCallerTag — RED/GREEN pair', () => {
  it('RED: is a no-op outside test mode (same query function, returns false)', () => {
    const pool = fakePool();
    const before = pool.query;
    expect(tag.installSqlCallerTag(pool, { NODE_ENV: 'production' })).toBe(false);
    expect(pool.query).toBe(before);
    expect(pool[INSTALLED_KEY]).toBeUndefined();
  });

  it('GREEN: tags pool.query with the calling source file in test mode', () => {
    const pool = fakePool();
    const enabled: NodeJS.ProcessEnv = { NODE_ENV: 'test', BUILDO_SQL_TRACE: 'x' };
    expect(tag.installSqlCallerTag(pool, enabled)).toBe(true);
    expect(callQuery(pool.query, 'SELECT 1')).toBe(THIS_FILE);
  });

  it('GREEN: a second install returns true and does not double-wrap', () => {
    const pool = fakePool();
    const enabled: NodeJS.ProcessEnv = { NODE_ENV: 'test', BUILDO_SQL_TRACE: 'x' };
    expect(tag.installSqlCallerTag(pool, enabled)).toBe(true);
    const afterFirst = pool.query;
    expect(tag.installSqlCallerTag(pool, enabled)).toBe(true);
    expect(pool.query).toBe(afterFirst);
    expect(callQuery(pool.query, 'SELECT 1')).toBe(THIS_FILE);
  });
});

describe('withSqlCaller — scoped tagging', () => {
  it('runs fn untagged when disabled', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
    let inside: string | undefined = 'sentinel';
    const out = tag.withSqlCaller(() => {
      inside = tag.callerStore().getStore();
      return 'done';
    }, WINDOWS_STACK, env);
    expect(out).toBe('done');
    expect(inside).toBeUndefined();
  });

  it('exposes the derived file inside fn when enabled', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', BUILDO_SQL_TRACE: 'x' };
    let inside: string | undefined;
    tag.withSqlCaller(() => {
      inside = tag.callerStore().getStore();
    }, WINDOWS_STACK, env);
    expect(inside).toBe('src/app/api/permits/route.ts');
  });
});

describe('callerStore — one shared instance on globalThis', () => {
  it('is the same instance as globalThis[Symbol.for(buildo.sql-witness.caller)]', () => {
    const store = tag.callerStore();
    const shared = (globalThis as Record<symbol, unknown>)[tag.SQL_TRACE_CALLER_KEY];
    expect(shared).toBe(store);
    expect(tag.callerStore()).toBe(store);
  });
});
