// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.5, §5.1 (acquisition seam; INGESTOR prerequisite 0r, RE-FREEZE #22)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 10 (the WARN row is library-owned — a declaration decides whether the library throws)
// SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §3.9 (the legacy load-centreline HEAD-failure posture: WARN row + proceed with null validators)
//
// INGESTOR prerequisite 0r (2026-09-24, WF2 plan §0r, Fold IC-1) — DECLARED HEAD-FAILURE
// POSTURE. Today a HEAD 4xx/5xx throws straight out of `acquireExternal` and kills the
// step. The legacy load-centreline loader (`scripts/load-centreline.js:433-439`) instead
// WARNed, proceeded with NULL validators, and let the tier-1 gate's `no_validators` arm
// decide to download — a "warn and proceed" posture that was NEVER declared, only observed.
//
// This prerequisite makes the posture descriptor data, reusing `staleness.on_prior_run_error`'s
// own vocabulary: `inputs.reads.externals[].on_head_error: "fail_step" | "warn_row"`, absent
// = `"fail_step"` (today, byte-identical). `warn_row` swallows the HEAD error, records its
// message on `acquired.head_error`, hands the gate null validators, and emits ONE
// library-owned WARN audit row (`§headErrorRows`, Rule 10) so the run SAYS it proceeded
// without validators.
//
// Orchestrator fold (2026-09-24): a NEW file, never appended to the 7,200-line
// step-library.logic.test.ts, whose 0p append clobbered it. The minimal stub helpers below
// are copied from that file (its own `fetchOf`/`clone` idiom), never imported from it.
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const acquireLib = require(path.join(process.cwd(), 'scripts/lib/step/acquire.js'));
const stepLib = require(path.join(process.cwd(), 'scripts/lib/step/index.js'));
const pipeline = require(path.join(process.cwd(), 'scripts/lib/pipeline.js'));
const LOAD_RAVINES = require(path.join(process.cwd(), 'scripts/load-ravines.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const noop = async () => {};

describe('INGESTOR prerequisite 0r — on_head_error', () => {
  /** A `log` that records every WARN as `{tag, msg}` — `warn_row` WARNs once on HEAD failure. */
  const warnLog = () => {
    const warns: Array<{ tag: unknown; msg: string }> = [];
    return { warns, log: { warn: (tag: unknown, msg: string) => { warns.push({ tag, msg }); }, info: () => {}, error: () => {} } };
  };
  /**
   * A fetch routed on `opts.method` — a REAL `Response` (Node's global fetch API), the same
   * shape the acquisition seam's `Readable.fromWeb(res.body)` requires. HEAD returns the
   * declared status; every GET returns the declared status too. Records the method sequence
   * so a lock can prove the GET was never attempted (T3).
   */
  const routedFetch = (headStatus: number, getStatus: number, methods: string[]) =>
    vi.fn(async (_url: string, opts: { method?: string }) => {
      const method = opts.method || 'GET';
      methods.push(method);
      if (method === 'HEAD') {
        return new Response(null, {
          status: headStatus,
          statusText: `${headStatus}`,
          headers: headStatus >= 200 && headStatus < 300 ? { 'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT', etag: '"abc"' } : {},
        });
      }
      return new Response(new Uint8Array(Buffer.from('zipbytes')), { status: getStatus, statusText: `${getStatus}` });
    });

  const acquireArgs = (descriptor: object, fetchImpl: unknown, external: object, gate: unknown, log: unknown) => ({
    ctxFetch: fetchImpl,
    log,
    tag: '[0r]',
    slug: (descriptor as { identity: { name: string } }).identity.name,
    external,
    descriptor,
    prior: null,
    timeoutMs: null,
    keyProperty: 'OBJECTID',
    keyColumn: 'ravine_id',
    coerceKey: (raw: unknown) => { const n = Number(raw); return Number.isFinite(n) ? n : null; },
    forced: false,
    preAcquisitionGate: gate,
    emitSkeleton: {},
  });

  it('T1 — on_head_error "warn_row" with a HEAD 503 RESOLVES, gate got null validators, acquired.head_error names HEAD 503', async () => {
    const descriptor = clone(LOAD_RAVINES) as { inputs: { reads: { externals: Array<Record<string, unknown>> } } };
    const external = descriptor.inputs.reads.externals[0]!;
    external.on_head_error = 'warn_row';
    const methods: string[] = [];
    const fetchImpl = routedFetch(503, 200, methods);
    const gate = vi.fn((_validators: { lastModified: unknown; etag: unknown }) => ({ skip: true, reason: 'x' }));
    const { warns, log } = warnLog();
    const r = await acquireLib.acquireExternal(acquireArgs(descriptor, fetchImpl, external, gate, log)) as {
      acquired: { head_error: string | null };
    };
    // RED before 0r: this rejects with /HEAD 503/ because `warn_row` is not honoured yet.
    expect(gate, 'the gate is still called — warn_row proceeds to the gate, it does not bypass it').toHaveBeenCalledTimes(1);
    const passed = gate.mock.calls[0]![0] as { lastModified: unknown; etag: unknown };
    expect(passed.lastModified, 'null validators — the tier-1 no_validators arm decides').toBeNull();
    expect(passed.etag).toBeNull();
    expect(r.acquired.head_error, 'the HEAD failure message is recorded, not swallowed').toMatch(/HEAD 503/);
    expect(warns.some((w) => /on_head_error "warn_row"/.test(w.msg)), 'the WARN says the posture out loud').toBe(true);
  });

  it('T2 — on_head_error "warn_row" with a HEAD error and gate {skip:false} then a GET 502 REJECTS naming GET 502', async () => {
    const descriptor = clone(LOAD_RAVINES) as { inputs: { reads: { externals: Array<Record<string, unknown>> } } };
    const external = descriptor.inputs.reads.externals[0]!;
    external.on_head_error = 'warn_row';
    const methods: string[] = [];
    const fetchImpl = routedFetch(503, 502, methods);
    const gate = () => ({ skip: false, reason: 'y' });
    const { log } = warnLog();
    const err = await acquireLib.acquireExternal(acquireArgs(descriptor, fetchImpl, external, gate, log))
      .then(() => null, (e: Error) => e) as Error | null;
    // RED before 0r: this rejects with /HEAD 503/ (the HEAD throw precedes the GET).
    expect(err, 'a GET failure after a warn_row HEAD proceeds is still fatal').toBeInstanceOf(Error);
    expect(err!.message).toMatch(/GET 502/);
  });

  it('T3 — absent AND explicit "fail_step" both reject naming HEAD 503 and never call GET (the pre-0r default, pinned)', async () => {
    for (const value of [undefined, 'fail_step'] as const) {
      const descriptor = clone(LOAD_RAVINES) as { inputs: { reads: { externals: Array<Record<string, unknown>> } } };
      const external = descriptor.inputs.reads.externals[0]!;
      if (value === undefined) delete external.on_head_error; else external.on_head_error = value;
      const methods: string[] = [];
      const fetchImpl = routedFetch(503, 200, methods);
      const gate = vi.fn(() => ({ skip: false, reason: 'z' }));
      const { log } = warnLog();
      const err = await acquireLib.acquireExternal(acquireArgs(descriptor, fetchImpl, external, gate, log))
        .then(() => null, (e: Error) => e) as Error | null;
      expect(err, `${String(value)}: a HEAD failure is fatal`).toBeInstanceOf(Error);
      expect(err!.message).toMatch(/HEAD 503/);
      expect(methods.filter((m) => m === 'GET'), `${String(value)}: GET is never attempted`).toHaveLength(0);
      expect(gate).not.toHaveBeenCalled();
    }
  });

  it('T4 — a HEAD 200 leaves acquired.head_error null on the happy path', async () => {
    const descriptor = clone(LOAD_RAVINES) as { inputs: { reads: { externals: Array<Record<string, unknown>> } } };
    const external = descriptor.inputs.reads.externals[0]!;
    const methods: string[] = [];
    const fetchImpl = routedFetch(200, 200, methods);
    const gate = () => ({ skip: true, reason: 'fresh' });
    const { log } = warnLog();
    const r = await acquireLib.acquireExternal(acquireArgs(descriptor, fetchImpl, external, gate, log)) as {
      acquired: { head_error: string | null };
    };
    expect(r.acquired.head_error).toBeNull();
  });

  it('T5 — headErrorRows: one WARN row from a non-empty head_error, none from null/[]; wired into index.js', () => {
    const rows = stepLib.headErrorRows([{ acquired: { head_error: 'HEAD 503 x' } }]);
    // RED before 0r: headErrorRows is not a function.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      metric: 'head_error',
      value: 'HEAD 503 x',
      status: 'WARN',
      source: 'gate',
      threshold: expect.any(String),
    });
    expect(rows[0].errored, 'a declared posture is not an anomaly an operator accepts').toBeUndefined();
    expect(stepLib.headErrorRows([{ acquired: { head_error: null } }]), 'null head_error is the healthy case').toEqual([]);
    expect(stepLib.headErrorRows([null]), 'a null phase result emits no row').toEqual([]);

    const src = fs.readFileSync(path.join(process.cwd(), 'scripts/lib/step/index.js'), 'utf8');
    expect(src, 'the row is wired into the audit table').toContain('...headErrorRows([ingest]),');
  });

  it('T6 — AJV: on_warn validates both values and rejects "fail"', () => {
    const goodWarn = clone(LOAD_RAVINES) as { inputs: { reads: { externals: Array<Record<string, unknown>> } } };
    goodWarn.inputs.reads.externals[0]!.on_head_error = 'warn_row';
    expect(() => pipeline.step(goodWarn, noop)).not.toThrow();

    const goodFail = clone(LOAD_RAVINES) as { inputs: { reads: { externals: Array<Record<string, unknown>> } } };
    goodFail.inputs.reads.externals[0]!.on_head_error = 'fail_step';
    expect(() => pipeline.step(goodFail, noop)).not.toThrow();

    const bad = clone(LOAD_RAVINES) as { inputs: { reads: { externals: Array<Record<string, unknown>> } } };
    bad.inputs.reads.externals[0]!.on_head_error = 'fail';
    expect(() => pipeline.step(bad, noop)).toThrow(/does not satisfy step\.schema\.json/);
  });
});
