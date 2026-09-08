// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §5 (advisory lock, dedicated
//   client pattern)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 12, R-B truthful crash
//   posture)
//
// WF3 enrich_parcels stall incident (2026-09-07) — root-cause fix + regression lock.
//
// INCIDENT: a `--full` golden-capture run left a postgres backend `idle in transaction`,
// holding `pg_try_advisory_xact_lock(65)` forever, with its own node process already gone. Live
// evidence (a LATER capture attempt, same incident class): stderr showed an UNHANDLED 'error'
// EVENT on a pg Client — `error: terminating connection due to administrator command` (57P01) —
// crashing the whole node process with `Unhandled 'error' event... throw er;` (node:events). ROOT
// CAUSE: neither `scripts/lib/pipeline.js`'s `createPool()` nor `scripts/lib/resolve-db.js`'s
// `createResolvedPool()` ever attached a `pool.on('error', ...)` listener — per node-postgres's
// own docs, the Pool re-emits an IDLE client's connection-level error as its own 'error' event,
// and Node's default EventEmitter behaviour for an unheard 'error' event is to THROW SYNCHRONOUSLY,
// outside any try/catch/finally in this codebase. A hard process crash never reaches a `finally`
// block that hasn't executed yet — so a DIFFERENT client, mid-`withAdvisoryLock`'s open
// `BEGIN`/`pg_try_advisory_xact_lock`, never gets to its own `client.release()`/`ROLLBACK`,
// leaving the backend (and the lock) stuck until an operator manually
// `pg_terminate_backend()`s it.
//
// FIX: `attachPoolErrorLogger` (pipeline.js) / the equivalent inline listener
// (resolve-db.js's `createResolvedPool`) — logged, never rethrown. This does not save the ONE
// in-flight transaction that happens to be open at the exact moment of an unrelated connection's
// error (nothing can, once the process would otherwise have crashed) — it removes the CLASS: an
// idle client's connection loss can no longer crash the process at all, so it can no longer
// collaterally kill an unrelated lock-holding transaction elsewhere.
//
// This file also locks `withAdvisoryLock`'s own pre-existing (and already correct) crash posture
// — a normal JS throw inside `fn()` (as opposed to an unhandled EventEmitter 'error' event) was
// ALREADY caught, ROLLBACK'd, and released; proven here so a future edit cannot regress it
// silently.

import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const pipeline = require('../../scripts/lib/pipeline.js') as {
  withAdvisoryLock: (pool: unknown, lockId: number, fn: () => Promise<unknown>, opts?: { skipEmit?: boolean }) => Promise<{ acquired: boolean; result?: unknown }>;
  attachPoolErrorLogger: (pool: EventEmitter) => EventEmitter;
  log: { error: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; info: (...args: unknown[]) => void };
};

function fakeLockPool(opts: { lockAcquired?: boolean } = {}) {
  const sql: string[] = [];
  const record = async (text: string) => {
    sql.push(text);
    if (/pg_try_advisory_xact_lock/.test(text)) return { rows: [{ acquired: opts.lockAcquired !== false }] };
    return { rows: [] };
  };
  let released = 0;
  return {
    sql,
    get releasedCount() { return released; },
    connect: async () => ({
      query: record,
      release: () => { released += 1; },
    }),
  };
}

describe('attachPoolErrorLogger — the root-cause fix (WF3 enrich_parcels stall incident)', () => {
  it('a pool with NO listener throws synchronously on an emitted "error" event (proves the incident mechanism is real, not hypothetical)', () => {
    const bare = new EventEmitter();
    expect(() => bare.emit('error', new Error('terminating connection due to administrator command'))).toThrow();
  });

  it('attachPoolErrorLogger makes the SAME emitted "error" event a no-op — logged via pipeline.log.error, never rethrown', () => {
    const pool = attachTestPool();
    const origError = pipeline.log.error;
    const errorSpy = vi.fn(origError);
    pipeline.log.error = errorSpy;
    try {
      expect(() => pool.emit('error', Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' }))).not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(
        '[pipeline]',
        expect.objectContaining({ message: 'terminating connection due to administrator command' }),
        expect.objectContaining({ phase: 'pool_idle_client_error' }),
      );
    } finally {
      pipeline.log.error = origError;
    }
  });

  function attachTestPool(): EventEmitter {
    return pipeline.attachPoolErrorLogger(new EventEmitter()) as EventEmitter;
  }
});

describe('withAdvisoryLock — truthful crash posture, already correct (Rule 12/R-B), locked against regression', () => {
  it('fn() throws — ROLLBACK is issued, the client IS released, and the error rethrows (never swallowed, never left mid-transaction)', async () => {
    const pool = fakeLockPool({ lockAcquired: true });
    const boom = new Error('pass boom');
    await expect(
      pipeline.withAdvisoryLock(pool, 65, async () => { throw boom; }),
    ).rejects.toThrow('pass boom');
    expect(pool.sql).toContain('BEGIN');
    expect(pool.sql).toContain('ROLLBACK');
    expect(pool.sql).not.toContain('COMMIT');
    expect(pool.releasedCount).toBe(1);
  });

  it('lock NOT acquired — ROLLBACK is issued, the client IS released, fn() never runs, acquired:false returned', async () => {
    const pool = fakeLockPool({ lockAcquired: false });
    const fn = vi.fn(async () => 'should never run');
    const result = await pipeline.withAdvisoryLock(pool, 65, fn, { skipEmit: false });
    expect(result).toEqual({ acquired: false });
    expect(fn).not.toHaveBeenCalled();
    expect(pool.sql).toContain('ROLLBACK');
    expect(pool.sql).not.toContain('COMMIT');
    expect(pool.releasedCount).toBe(1);
  });

  it('success path — COMMIT is issued (releasing the transaction-scoped lock), client released, fn()\'s result returned', async () => {
    const pool = fakeLockPool({ lockAcquired: true });
    const result = await pipeline.withAdvisoryLock(pool, 65, async () => 'ok');
    expect(result).toEqual({ acquired: true, result: 'ok' });
    expect(pool.sql).toContain('COMMIT');
    expect(pool.sql).not.toContain('ROLLBACK');
    expect(pool.releasedCount).toBe(1);
  });
});
