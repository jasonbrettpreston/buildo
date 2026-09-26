// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.5, §5.1 (acquisition seam; INGESTOR prerequisite 0q)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 3 (a tunable is a registered logic variable, never a hidden literal)
// SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md (the load-archetype download path)
//
// INGESTOR prerequisite 0q (2026-09-24, WF2 plan §0q, Fold IC-3/IC-4) — DOWNLOAD
// RETRIES. `execution.network.retries` has been a FROZEN schema field since S1 with
// NO READER anywhere in `scripts/lib/` (measured 2026-09-24), and the acquisition
// seam's one download call (`downloadArchive`) makes exactly ONE attempt. The legacy
// loaders made ONE attempt too — `scripts/load-neighbourhoods.js:52` `downloadFile` and
// its copies in load-address-points/load-parcels/load-massing have NO retry loop (Fold
// G-4, 2026-09-25, MEASURED); only centreline's `downloadZipWithRetry` retried (THREE
// times, no backoff, WARN per failure, partial file removed, HEAD never retried). This
// prerequisite gives EVERY loader that posture, declared. The founding measurement is
// cloud `chain-sources` run 34769829628 (2026-09-13): a single `HTTP
// 502` at step 17/28 killed the run and 11 downstream steps never ran.
//
// This file carries the RED locks for the executor — `downloadWithRetries` and the
// `resolveRetryPolicy` resolver — plus the schema/registry bytes the retry policy needs.
// Orchestrator fold (2026-09-24): a NEW file, never appended to the 7,200-line
// step-library.logic.test.ts, whose 0p append clobbered it.
//
// The whole surface is DOWNLOAD-ONLY: `headValidators` is never retried (T7). A retry
// is `attempts = retries + 1`, WARN per failed attempt, the partial `dest` removed
// before the next attempt (never a truncated file silently parsed), a constant
// `backoffMs` sleep between attempts (never after the last), and the LAST error
// rethrown. Defaults are byte-identical to before: `retries: 0` === 1 attempt, no
// backoff, no WARN.
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const acquireLib = require(path.join(process.cwd(), 'scripts/lib/step/acquire.js'));
const pipeline = require(path.join(process.cwd(), 'scripts/lib/pipeline.js'));
const LOAD_RAVINES = require(path.join(process.cwd(), 'scripts/load-ravines.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const noop = async () => {};

describe('INGESTOR prerequisite 0q — download retries', () => {
  /** A `log` that records every WARN as `{tag, msg}` — the legacy retry loop WARNed each failure. */
  const warnLog = () => {
    const warns: Array<{ tag: unknown; msg: string }> = [];
    return { warns, log: { warn: (tag: unknown, msg: string) => { warns.push({ tag, msg }); }, info: () => {}, error: () => {} } };
  };
  /** A fetch whose Nth call returns the Nth queued response — a REAL `Response` (Node's
   * global fetch API), exactly the shape step-library.logic.test.ts's own `fetchImplFor`
   * uses: `downloadArchive`'s `Readable.fromWeb(res.body)` requires a genuine WHATWG
   * `ReadableStream`, which only a real `Response` (or a hand-built one, see T4/T7 below)
   * provides — a duck-typed `{body: asyncGenerator}` throws inside `Readable.fromWeb`. */
  const fetchOf = (queue: Array<{ status: number; body?: string }>) => {
    let i = 0;
    return vi.fn(async () => {
      const next = queue[i++];
      if (!next) throw new Error(`fetchOf: call ${i} exceeds the queued response list`);
      return new Response(new Uint8Array(Buffer.from(next.body ?? 'x')), {
        status: next.status,
        statusText: String(next.status),
      });
    });
  };

  it('T1 — a 502,502,200 sequence makes THREE attempts, returns attempts:3 and WARNs twice '
    + '(RED before 0q: downloadWithRetries is not a function)', async () => {
    const tmp = fs.mkdtempSync(path.join(process.cwd(), 'tmp-0q-t1-'));
    const dest = path.join(tmp, 'source.zip');
    const fetchImpl = fetchOf([{ status: 502 }, { status: 502 }, { status: 200 }]);
    const { warns, log } = warnLog();
    try {
      const dl = await acquireLib.downloadWithRetries(
        fetchImpl, 'http://ex/f.zip', dest, null, 'md5',
        { retries: 2, backoffMs: 0, log, tag: '[t1]' },
      );
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(dl.attempts).toBe(3);
      expect(dl.contentHash, 'a real download carries the streamed digest').toMatch(/^[0-9a-f]{32}$/);
      expect(dest, 'the successful attempt leaves the file on disk').toBeTruthy();
      expect(warns, 'one WARN per FAILED attempt (the two 502s), never for the success').toHaveLength(2);
      expect(warns[0]?.msg).toMatch(/download attempt 1\/3 failed/);
      expect(warns[1]?.msg).toMatch(/download attempt 2\/3 failed/);
      expect(warns.every((w) => w.tag === '[t1]')).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('T2 — retries 1 with a persistent 502 rejects naming GET 502, makes TWO attempts, '
    + 'and leaves NO dest behind', async () => {
    const tmp = fs.mkdtempSync(path.join(process.cwd(), 'tmp-0q-t2-'));
    const dest = path.join(tmp, 'source.zip');
    const fetchImpl = fetchOf([{ status: 502 }, { status: 502 }]);
    const { log } = warnLog();
    try {
      const err = await acquireLib.downloadWithRetries(
        fetchImpl, 'http://ex/f.zip', dest, null, 'md5',
        { retries: 1, backoffMs: 0, log, tag: '[t2]' },
      ).then(() => null, (e: Error) => e);
      expect(err, 'an exhausted retry budget rejects — it never resolves with a partial').toBeInstanceOf(Error);
      expect(err.message, 'the LAST error is rethrown, never swallowed').toMatch(/GET 502/);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(fs.existsSync(dest), 'the failed attempts removed every partial file').toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('T3 — retries 0 means EXACTLY one attempt (the pre-0q default, pinned)', async () => {
    const tmp = fs.mkdtempSync(path.join(process.cwd(), 'tmp-0q-t3-'));
    const dest = path.join(tmp, 'source.zip');
    const fetchImpl = fetchOf([{ status: 500 }]);
    const { warns, log } = warnLog();
    try {
      await acquireLib.downloadWithRetries(
        fetchImpl, 'http://ex/f.zip', dest, null, 'md5',
        { retries: 0, backoffMs: 0, log, tag: '[t3]' },
      ).catch(() => undefined);
      expect(fetchImpl, 'retries 0 === 1 attempt, no retry budget at all').toHaveBeenCalledTimes(1);
      expect(warns, 'a single-attempt failure is not a \"retry\" and does not WARN twice').toHaveLength(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('T4 — an attempt that errors MID-STREAM leaves no partial dest for the next attempt to see', async () => {
    const tmp = fs.mkdtempSync(path.join(process.cwd(), 'tmp-0q-t4-'));
    const dest = path.join(tmp, 'source.zip');
    const { log } = warnLog();
    let seenByAttempt2: boolean | null = null;
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call++;
      if (call === 1) {
        // A 200 whose body fails part-way — the stream error the partial-removal arm
        // exists for. A real `ReadableStream` that enqueues one chunk then errors, so
        // `Readable.fromWeb` sees a genuine WHATWG stream (see fetchOf's comment above).
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('partial-bytes'));
            controller.error(new Error('socket hang up mid-stream'));
          },
        });
        return new Response(stream, { status: 200, statusText: 'OK' });
      }
      seenByAttempt2 = fs.existsSync(dest);
      return new Response(new Uint8Array(Buffer.from('complete')), { status: 200, statusText: 'OK' });
    });
    try {
      const dl = await acquireLib.downloadWithRetries(
        fetchImpl, 'http://ex/f.zip', dest, null, 'md5',
        { retries: 1, backoffMs: 0, log, tag: '[t4]' },
      );
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(seenByAttempt2, 'attempt 1\'s partial dest must be GONE before attempt 2 starts').toBe(false);
      expect(dl.attempts).toBe(2);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('T5 — opts.sleep is injected: called ONCE with the backoff, and NEVER when backoffMs is 0', async () => {
    const tmp = fs.mkdtempSync(path.join(process.cwd(), 'tmp-0q-t5-'));
    const { log } = warnLog();
    try {
      const sleepBackoff = vi.fn(async () => {});
      const destA = path.join(tmp, 'a.zip');
      await acquireLib.downloadWithRetries(
        fetchOf([{ status: 502 }, { status: 200 }]), 'http://ex/a.zip', destA, null, 'md5',
        { retries: 1, backoffMs: 25, log, tag: '[t5a]', sleep: sleepBackoff },
      );
      expect(sleepBackoff, 'exactly one sleep, between the two attempts').toHaveBeenCalledTimes(1);
      expect(sleepBackoff).toHaveBeenCalledWith(25);

      const sleepZero = vi.fn(async () => {});
      const destB = path.join(tmp, 'b.zip');
      await acquireLib.downloadWithRetries(
        fetchOf([{ status: 502 }, { status: 200 }]), 'http://ex/b.zip', destB, null, 'md5',
        { retries: 1, backoffMs: 0, log, tag: '[t5b]', sleep: sleepZero },
      );
      expect(sleepZero, 'backoffMs 0 must not sleep at all').toHaveBeenCalledTimes(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('T6 — resolveRetryPolicy: {retries, backoffMs}; named var wins iff it is a non-negative integer; '
    + '"none" and absent config fall back to the literal (RED before 0q: not a function)', () => {
    const ravines = LOAD_RAVINES;
    // network: "none" → disabled, whether or not config names anything.
    expect(acquireLib.resolveRetryPolicy({ execution: { network: 'none' } }, null)).toEqual({ retries: 0, backoffMs: 0 });
    // Literal fallback with no config AND with an undefined config (the "unseeded DB" case).
    expect(acquireLib.resolveRetryPolicy(ravines, null)).toEqual({ retries: 0, backoffMs: 0 });
    expect(acquireLib.resolveRetryPolicy(ravines, undefined)).toEqual({ retries: 0, backoffMs: 0 });

    // A named variable + a descriptor literal: the RESOLVED config value wins.
    const named = clone(ravines);
    named.execution.network.retries = 5;
    named.execution.network.retries_from_config = 'ravines_download_retries';
    named.execution.network.retry_backoff_from_config = 'ravines_download_retry_backoff_ms';
    expect(acquireLib.resolveRetryPolicy(named, { ravines_download_retries: 2, ravines_download_retry_backoff_ms: 10 }))
      .toEqual({ retries: 2, backoffMs: 10 });

    // A NEGATIVE or non-integer config value is NOT honoured — the literal is the fallback.
    expect(acquireLib.resolveRetryPolicy(named, { ravines_download_retries: -1, ravines_download_retry_backoff_ms: 10 }))
      .toEqual({ retries: 5, backoffMs: 10 });

    // The literal "none" means "no retry" outright.
    const none = clone(ravines);
    none.execution.network.retries = 3;
    none.execution.network.retries_from_config = 'none';
    expect(acquireLib.resolveRetryPolicy(none, { ravines_download_retries: 4 })).toEqual({ retries: 0, backoffMs: 0 });
  });

  it('T7 — acquireExternal retries ONLY the GET: a HEAD 200 + two GET 502s with retries 1 makes '
    + 'exactly TWO GETs and NO second HEAD', async () => {
    const tmp = fs.mkdtempSync(path.join(process.cwd(), 'tmp-0q-t7-'));
    const descriptor = clone(LOAD_RAVINES);
    descriptor.execution.network.retries = 1;
    // No retries_from_config (and no `config` passed to acquireExternal below) — this
    // exercises the plain LITERAL path, not the "none" override (T6 already locks that
    // "none" forces retries to 0 outright; setting it here would contradict that lock).
    const methods: string[] = [];
    let gets = 0;
    const fetchImpl = vi.fn(async (_url: string, opts: { method?: string }) => {
      const method = opts.method || 'GET';
      methods.push(method);
      if (method === 'HEAD') {
        return new Response(null, { status: 200, statusText: 'OK' });
      }
      gets++;
      return new Response(new Uint8Array(0), { status: 502, statusText: 'Bad Gateway' });
    });
    const { log } = warnLog();
    try {
      const err = await acquireLib.acquireExternal({
        ctxFetch: fetchImpl,
        log,
        tag: '[t7]',
        slug: descriptor.identity.name,
        external: descriptor.inputs.reads.externals[0],
        descriptor,
        prior: null,
        timeoutMs: null,
        keyProperty: 'OBJECTID',
        keyColumn: 'ravine_id',
        coerceKey: (raw: unknown) => { const n = Number(raw); return Number.isFinite(n) ? n : null; },
        forced: false,
        preAcquisitionGate: () => ({ skip: false, reason: 't7' }),
        emitSkeleton: {},
      }).then(() => null, (e: Error) => e);
      expect(err, 'a persistent GET 502 rejects the acquisition').toBeInstanceOf(Error);
      expect(gets, 'retries 1 === two GET attempts').toBe(2);
      expect(methods.filter((m) => m === 'HEAD'), 'the HEAD is never retried — exactly one').toHaveLength(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('T6 — AJV: retries_from_config / retry_backoff_from_config validate as var-name strings, and a '
    + 'non-var name is rejected', () => {
    const good = clone(LOAD_RAVINES);
    good.execution.network.retries_from_config = 'ravines_download_retries';
    good.execution.network.retry_backoff_from_config = 'ravines_download_retry_backoff_ms';
    expect(() => pipeline.step(good, noop)).not.toThrow();

    const bad = clone(LOAD_RAVINES);
    bad.execution.network.retries_from_config = 'Bad-Name';
    expect(() => pipeline.step(bad, noop)).toThrow(/does not satisfy step\.schema\.json/);

    const badBackoff = clone(LOAD_RAVINES);
    badBackoff.execution.network.retry_backoff_from_config = 'Bad Name';
    expect(() => pipeline.step(badBackoff, noop)).toThrow(/does not satisfy step\.schema\.json/);
  });
});
