// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BZ G1, Rule 10
//
// S1-P-8a — enrich_parcels' #12c (latest-run probe) and #12d (layers probe) contract reads:
//
//   * `readZoningContract` reads the producer through `ctx.producer` (the ONE `readRunHistory`
//     reader), so the slug forms (`slugForms('load_zoning', ['sources'])`), the status sets, the
//     order keys and the jsonb-object `metaObject` predicate all come from the library — the
//     compute file carries NO `pipeline_runs` SQL for these two reads any more;
//   * `base === true` and "a run carrying `zoning_layers_loaded` exists" are no longer THROWS:
//     they are the descriptor's `op: "true"` pin on `records_meta.zoning_layers_loaded.base`
//     (with `meta_object: "zoning_layers_loaded"`), evaluated by `measureProducerPins` BEFORE any
//     phase — so a violation is a declared FAIL/MISSING row, never a compute throw (Rule 10).
//
// CHESTERTON'S FENCE (scripts/lib/compute/enrich-parcels.js, the jidogg fences at the two deleted
// throws): the #12c probe and the #12d read use DIFFERENT status sets ON PURPOSE — the probe wants
// a failed run SEEN (a wider, explicitly closed terminal set), the layers read wants a BASELINE
// (the library default). This file locks that difference by asserting the two calls' option
// objects EXACTLY.
//
// The descriptor is loaded for real (fs + JSON.parse) so a pin that exists only in prose cannot pass.
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const compute = require('../../scripts/lib/compute/enrich-parcels.js');
const { evaluatePins, producerOptsForPin } = require('../../scripts/lib/step/producer.js');
/* eslint-enable @typescript-eslint/no-require-imports */

const ROOT = path.resolve(__dirname, '../..');
const COMPUTE_PATH = path.join(ROOT, 'scripts/lib/compute/enrich-parcels.js');
const DESCRIPTOR_PATH = path.join(ROOT, 'scripts/enrich-parcels.descriptor.json');

const DESCRIPTOR = JSON.parse(fs.readFileSync(DESCRIPTOR_PATH, 'utf8'));
const SRC = fs.readFileSync(COMPUTE_PATH, 'utf8');

type Pin = {
  step: string;
  stamp: string;
  op?: string;
  equals?: string;
  meta_object?: string;
  why?: { text?: string; liveness?: { kind?: string; ref?: string } };
};

const PINS = DESCRIPTOR.staleness.pins as Pin[];
// The zoning contract pins S1-P-8a owns: `load_zoning` pins that declare an op.
const CONTRACT_PINS = PINS.filter((p) => p.step === 'load_zoning' && p.op !== undefined);
const BASE_PIN = CONTRACT_PINS.find((p) => p.stamp === 'records_meta.zoning_layers_loaded.base');

const readZoningContract = compute.readZoningContract as (ctx: {
  pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
  producer: (slug: string, opts?: Record<string, unknown>) => Promise<Record<string, unknown>>;
}) => Promise<Record<string, unknown>>;

/** A producer result shaped exactly like `makeProducer`'s return (the runner's contract). */
const found = (records_meta: object, over: Record<string, unknown> = {}) => ({
  slug: 'load_zoning',
  forms: ['sources:load_zoning', 'load_zoning', 'load-zoning'],
  reason: 'FOUND' as const,
  sid: 1,
  status: 'completed',
  started_at: '2026-01-01T00:00:00Z',
  completed_at: '2026-01-01T00:01:00Z',
  records_meta,
  rows: [],
  ...over,
});

/** The `readZoningChange` row `pool.query` answers (s1p-8b owns that function; here it is stubbed). */
const CHANGE_ROW = {
  changed: false,
  producer_run_id: null,
  producer_completed_at: null,
  own_last_run_id: 3,
  own_last_started_at: null,
  read_at: null,
} as const;

// ---------------------------------------------------------------------------
// A. The DECLARED pin — the real descriptor, the real evaluator
// ---------------------------------------------------------------------------

describe('enrich-parcels descriptor pin — the former readZoningContract HALTs are declared rows', () => {
  it('declares the base-layer contract as ONE load_zoning op:true pin carrying meta_object', () => {
    expect(BASE_PIN, 'the records_meta.zoning_layers_loaded.base pin must exist').toBeDefined();
    expect(BASE_PIN).toMatchObject({
      step: 'load_zoning',
      stamp: 'records_meta.zoning_layers_loaded.base',
      op: 'true',
      meta_object: 'zoning_layers_loaded',
    });
    // liveness on the pin — a declared pin with no liveness is a dead assertion.
    expect(BASE_PIN?.why?.liveness?.kind).toBe('file');
    expect(BASE_PIN?.why?.liveness?.ref).toBe('scripts/lib/compute/enrich-parcels.js');
    // the watermark pin (no op) stays a watermark: it carries the key, not the verdict.
    const watermark = PINS.find((p) => p.stamp === 'records_meta.zoning_layers_loaded');
    expect(watermark?.op).toBeUndefined();
    expect(watermark?.equals).toBeUndefined();
  });

  it('(a) base:true → PASS; base:false → FAIL; base absent / no run / MISSING → MISSING', () => {
    const evaluate = (res: object) => evaluatePins([BASE_PIN], { load_zoning: res });
    const rowOf = (res: object) => evaluate(res)[0];

    const pass = rowOf(found({ zoning_layers_loaded: { base: true } }));
    expect(pass.result).toBe('PASS');
    expect(pass.status).toBe('INFO');
    expect(pass.observed).toBe(true);

    const fail = rowOf(found({ zoning_layers_loaded: { base: false } }));
    expect(fail.result).toBe('FAIL');
    expect(fail.status).toBe('FAIL');
    expect(fail.observed).toBe(false);

    // the key is an object but .base is absent → MISSING (a violated producer contract, never ERROR)
    expect(rowOf(found({ zoning_layers_loaded: {} })).result).toBe('MISSING');
    // the key itself is absent
    expect(rowOf(found({})).result).toBe('MISSING');
    // no producer run at all (the old "no successful run with zoning_layers_loaded" throw)
    const noRun = evaluatePins([BASE_PIN], {
      load_zoning: { reason: 'MISSING', sid: null, status: null, completed_at: null, records_meta: null },
    })[0];
    expect(noRun.result).toBe('MISSING');
    expect(noRun.status).toBe('FAIL');

    // exactly ONE row per evaluated pin
    expect(evaluate(found({ zoning_layers_loaded: { base: true } }))).toHaveLength(1);
  });

  it('(b) the pin reads the run through producerOptsForPin → { metaObject }', () => {
    expect(producerOptsForPin(BASE_PIN)).toEqual({ metaObject: 'zoning_layers_loaded' });
  });
});

// ---------------------------------------------------------------------------
// B. The hook — ctx.producer, with the two reads' identities LOCKED
// ---------------------------------------------------------------------------

/** A stub producer: the terminal-set probe answers `probe`, the metaObject read answers `metaRes`. */
function stubCtx(opts: {
  probe?: Record<string, unknown>;
  metaRes?: Record<string, unknown>;
  changeRow?: object | null;
} = {}) {
  const probe = opts.probe ?? found({}, { sid: 1, status: 'completed' });
  const metaRes = opts.metaRes ?? found(
    {
      zoning_layers_loaded: { base: true, a: 1 },
      zoning_partial_load: true,
      base_layer_committed_after_overlays_failed: true,
    },
    { sid: 2 },
  );
  const query = vi.fn(async () => ({ rows: [opts.changeRow ? opts.changeRow : CHANGE_ROW] }));
  /* library-faithful: onError:"throw" rethrows an ERROR result (producer.js) */
  const producer = vi.fn(async (slug: string, o: Record<string, unknown> = {}) => {
    const r = (o.metaObject !== undefined ? metaRes : probe) as Record<string, unknown>;
    if (r && r.reason === 'ERROR' && o.onError === 'throw') throw new Error(String(r.error));
    return r;
  });
  return { ctx: { pool: { query }, producer }, producer, query };
}

describe('readZoningContract — reads via ctx.producer (no ledger SQL of its own)', () => {
  it('(c) resolves layers/partial/baseCommittedAfterOverlayFailed/zoning_change; the two reads are EXACT', async () => {
    const { ctx, producer } = stubCtx();
    const contract = await readZoningContract(ctx);

    expect(contract).toMatchObject({
      layers: { base: true, a: 1 },
      partial: true,
      baseCommittedAfterOverlayFailed: true,
      zoning_change: { changed: false, own_last_run_id: 1 }, // s1p-8b: readZoningChange reads via the same ctx.producer (stub answers sid 1)
    });

    // The two contract reads come FIRST, in this order, with these identities (Chesterton's fence:
    // the #12c probe's terminal set is NOT the layers read's baseline set); s1p-8b's readZoningChange
    // adds two more producer reads after them (own baseline, zoning window).
    expect(producer).toHaveBeenCalledTimes(4);
    expect(producer.mock.calls[0]).toEqual([
      'load_zoning',
      { statuses: 'terminal', orderBy: 'started_at', excludeWarnSkip: false, onError: 'throw' },
    ]);
    expect(producer.mock.calls[1]?.[1]).toEqual({ metaObject: 'zoning_layers_loaded' });
    // the layers read's identity IS the declared pin's identity (same run the runner evaluated).
    expect(producerOptsForPin(BASE_PIN)).toEqual(producer.mock.calls[1]?.[1]);
  });

  it('(c2) no defaults: a zoning_layers_loaded-less read surfaces `undefined` loudly (never {} silently)', async () => {
    // The PIN owns the verdict (a missing key is MISSING/FAIL before any phase); the hook must NOT
    // mask it with an `|| {}` default — a violated producer contract reaching here is a bug.
    const noKey = stubCtx({ metaRes: found({}, { sid: 2 }) });
    await expect(readZoningContract(noKey.ctx)).resolves.toMatchObject({ layers: undefined });

    const nullMeta = stubCtx({
      metaRes: { reason: 'MISSING', sid: null, status: null, completed_at: null, records_meta: null, rows: [] },
    });
    await expect(readZoningContract(nullMeta.ctx)).rejects.toThrow(TypeError);
  });

  it('(d) latest failed → the named residual HALT; ERROR → fail closed; MISSING → proceeds', async () => {
    const failed = stubCtx({ probe: found({}, { status: 'failed' }) });
    await expect(readZoningContract(failed.ctx)).rejects.toThrow(/latest sources:load_zoning run FAILED/);

    const errored = stubCtx({ probe: { reason: 'ERROR', error: 'boom' } });
    await expect(readZoningContract(errored.ctx)).rejects.toThrow(/boom/);

    // a step that has NEVER run is not this hook's halt — the declared pin is MISSING and the
    // RUNNER halts before the hook; the hook itself still resolves (with the layers read's own
    // answers, hence partial/baseCommitted from the layered fixture, not from the probe).
    const missing = stubCtx({
      probe: { reason: 'MISSING', sid: null, status: null, completed_at: null, records_meta: null },
    });
    await expect(readZoningContract(missing.ctx)).resolves.toMatchObject({
      layers: { base: true, a: 1 },
      partial: true,
      baseCommittedAfterOverlayFailed: true,
    });
  });

  it('(e) source-scan: no inline `FROM pipeline_runs … zoning_layers_loaded` probe remains', () => {
    expect(SRC).not.toMatch(/FROM pipeline_runs[\s\S]{0,200}zoning_layers_loaded/);
    // the step name the producer is asked for is the pinned step, not a second literal
    expect(SRC).toMatch(/const ZONING_PRODUCER_STEP = 'load_zoning'/);
    expect(SRC).toMatch(/ctx\.producer\(ZONING_PRODUCER_STEP/);
  });
});
