// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A18 (0x; RE-FREEZE #29, logged in 122 §8)
//
// INGESTOR prerequisite 0x (part D) — IDEMPOTENCY of the multi-primary descent across
// THREE successive runs of the SAME descriptor.
//
// Parts B (the runner's per-primary loop) and B2 (the postures) lock ONE pass each: that a
// two-primary descriptor acquires+write each target, and that a per-primary throw is a
// FAIL/WARN row rather than the step's own failure. NONE of them runs the runner twice. The
// property 0x exists to keep — and the one a multi-primary descent is uniquely placed to
// lose — is that the SECOND run of an unchanged source is a NO-OP: each primary re-emits its
// own prior sub-block (`emits[0].skeleton[<id>]`), so the content_hash tier-2 gate SKIPS it
// and the run writes nothing. A single-primary INGESTOR gets this for free (one emit block,
// one sub-key); a multi-primary one must do it ONCE PER PRIMARY, and the library must
// RE-EMIT every skipped primary's sub-block into the run's own `records_meta`, not just the
// ones the compute authored.
//
// This file is RED today, for the two reasons it states below and NOT a typo:
//
//   T12  — the library does not yet re-emit a SKIPPED primary's sub-block, so run 2's
//          `records_meta.k` is `{}` (the compute authors LOADED sub-blocks only) and run 3
//          finds no baseline for either primary and RELOADS both. A descent whose second run
//          reloads an unchanged source is not idempotent;
//   T12b — under a persistent `warn_row_continue` failure, the failed primary's baseline
//          DOES NOT ADVANCE (the library never fabricates one for a primary it never loaded),
//          so the next run fails closed and RELOADS that primary — exactly one new write,
//          onto the failed primary's own table;
//   T14  — `aggregatePrimaries` folds the per-primary counters by SUM but drops `unchanged`
//          and the `delete_skipped_empty_guard` flag, and does not carry them per target.
//
// T13 and T8c are the PINs — the interrupted-retraction recovery reaching EVERY narrowed
// call, and the Guardian lock that a write guard's throw is never swallowed by
// `fail_row_continue`. Both already hold; they are here so the 0x fix cannot silently break
// them.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const stepLib = require(join(process.cwd(), 'scripts/lib/step'));
const stalenessLib = require(join(process.cwd(), 'scripts/lib/step/staleness.js'));
const acquireLib = require(join(process.cwd(), 'scripts/lib/step/acquire.js'));
const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
const ravineCompute = require(join(process.cwd(), 'scripts/lib/compute/load-ravines.js'));
const LOAD_RAVINES = require(join(process.cwd(), 'scripts/load-ravines.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const noopLog = { info: () => {}, warn: () => {}, error: () => {} };

/**
 * The fake pool the runner tests use: SQL text AND bound params are recorded (the 0x
 * refusals must cost ZERO statements, so `calls.length` is the assertion), logic_variables
 * rows answer the config resolver, `SELECT NOW()` answers the DB clock, and an
 * `INSERT INTO t{a,b,c}` answers the guarded upsert's `is_insert` RETURNING.
 */
function fakePool() {
  const calls: Array<{ text: string; params: unknown[] | undefined }> = [];
  const answer = (text: string) => {
    if (text.includes('FROM logic_variables')) {
      return {
        rows: Object.entries(seedConfig()).map(([variable_key, variable_value]) => ({
          variable_key, variable_value, variable_value_json: null,
        })),
      };
    }
    if (text.includes('current_database()')) {
      return { rows: [{ database: 'postgres', db_user: 'postgres', has_tracking: true }] };
    }
    if (text.includes('FROM public.schema_migrations')) return { rows: [{ n: 999 }] };
    if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] };
    if (text.startsWith('INSERT INTO pipeline_runs')) return { rows: [{ id: 4242 }] };
    if (/SELECT NOW\(\) AS now/i.test(text)) return { rows: [{ now: new Date('2026-09-28T00:00:00Z') }] };
    if (/INSERT INTO t[abc]\b/i.test(text)) return { rows: [{ is_insert: true }] };
    return { rows: [] };
  };
  const record = async (text: string, params?: unknown[]) => { calls.push({ text, params }); return answer(text); };
  return { calls, query: record, connect: async () => ({ query: record, release: () => {} }) };
}

/** The resolved config the runner threads to compute — the seed defaults for ravine's vars. */
function seedConfig(): Record<string, number> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the committed seed registry
  const seed = require(join(process.cwd(), 'scripts/seeds/logic_variables.json')) as Record<string, { default: number }>;
  const out: Record<string, number> = {};
  for (const v of LOAD_RAVINES.config.logic_variables as Array<{ name: string }>) out[v.name] = seed[v.name]!.default;
  return out;
}

const prior = { feature_count: 854, content_hash: 'aa', last_modified: 'Mon, 14 Mar 2022 15:25:09 GMT' };

/** The primary's acquisition block — every field `runIngestPhase` reads off `result.acquired`. */
function primaryAcquired() {
  return {
    feature_count: 1,
    rows_parsed: 1,
    invalid_geometry_skipped: 0,
    invalid_geometry_repaired: 0,
    geometry_collection_extracted: 0,
    skipped_keys: [],
    last_modified: prior.last_modified,
    last_modified_ms: Date.parse(prior.last_modified),
    etag: null,
    content_hash: 'bb',
    source_dataset_version: 'bb',
    license_url: 'https://open.toronto.ca/open-data-license/',
  };
}

/**
 * `H2()` — the multi-primary fixture: TWO url-bearing primaries (`a` → table `ta`, `b` →
 * table `tb`), each declaring its `target`, `outputs.writes` grown to the two matching
 * targets, the emit skeleton widened to ONE sub-block per primary id, and the four
 * staleness triggers SCOPED to `a`/`b` (each primary's narrowed descriptor then filters
 * to its own two triggers). `invariants`/`plausibility` are set to `"none"` so the
 * narrowed descriptors carry no post checks the loop would never report.
 */
function H2(): Record<string, unknown> {
  const d = clone(LOAD_RAVINES) as Record<string, unknown> & {
    inputs: { reads: { externals: Array<Record<string, unknown>> } };
    outputs: { writes: Array<Record<string, unknown>> };
    emits: Array<Record<string, unknown>>;
    staleness: { trigger: Array<Record<string, unknown>> };
    execution: Record<string, unknown>;
    guards: Record<string, unknown>;
  };
  const e0 = d.inputs.reads.externals[0]!;
  const w0 = d.outputs.writes[0]!;
  const emits0 = d.emits[0]!;
  d.inputs.reads.externals = [
    { ...e0, id: 'a', target: 'ta' },
    { ...e0, id: 'b', url: `${e0.url}?b`, target: 'tb' },
  ];
  d.outputs.writes = [
    { ...w0, table: 'ta' },
    { ...w0, table: 'tb' },
  ];
  d.emits = [{ ...emits0, key: 'k', skeleton: { a: {}, b: {} } }];
  d.execution.shape = 'ingest';
  d.staleness.trigger = ['a', 'b'].flatMap((x) => [
    { signal: 'source_validator', position: 'pre_acquisition', external: x },
    { signal: 'content_hash', position: 'post_acquisition', external: x },
  ]);
  d.guards.requires = [];
  d.invariants = 'none';
  d.plausibility = 'none';
  return d as unknown as Record<string, unknown>;
}

/** The multi-primary `ingestPrimaries` seams: prior read keyed by id, per-target privilege. */
function stubs() {
  return [
    vi.spyOn(stalenessLib, 'readPriorEmitWithPosture')
      .mockResolvedValue({ prior: { a: { content_hash: 'x' }, b: { content_hash: 'y' } }, error: null }),
    vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({
      ta: { rls_enabled: true, bypassrls: true, policies: 0 },
      tb: { rls_enabled: true, bypassrls: true, policies: 0 },
    }),
    vi.spyOn(acquireLib, 'acquireExternal').mockImplementation((async () => ({
      tier1: { skip: false },
      tier2: { skip: false },
      emitBlock: null,
      // A shapefile arm carries a pre-stringified geojson and the DBF properties; the
      // declared key column is `source_id` (outputs.writes[].key).
      features: [{ source_id: 1, geojson: '{}', record: {} }],
      acquired: primaryAcquired(),
    })) as (...args: unknown[]) => unknown),
    vi.spyOn(writeLib, 'validateGeometries').mockResolvedValue({
      carried: [{ source_id: 1, geom: Buffer.from('') }], repaired: 0, collectionExtracted: 0, skipped: 0, skippedKeys: [],
    }),
    vi.spyOn(writeLib, 'executeWrite').mockResolvedValue({
      inserted: 1, updated: 0, deleted: 0, rows_scanned: 1, rows_changed: 1, unchanged: 0,
    }),
  ] as Array<{ mockRestore: () => void }>;
}

/** One `ingestPrimaries` call against the stubbed seams. */
async function callPrimaries(descriptor: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return stepLib.ingestPrimaries({
    descriptor,
    pool: fakePool(),
    compute: ravineCompute,
    config: seedConfig(),
    fetchImpl: async () => { throw new Error('the runner must not reach the network in this test'); },
    chainId: null,
    log: noopLog,
    tag: '[0x]',
    clockNow: new Date('2026-09-29T00:00:00Z'),
    preWriteGate: null,
    ...extra,
  });
}

const throwing = async () => { throw new Error('the runner must not reach the network in this test'); };

/**
 * Force an acquisition posture on BOTH externals (`undefined` = the field is absent).
 */
const posture = (d: Record<string, unknown>, p: string | undefined) => {
  const exts = (d as { inputs: { reads: { externals: Array<Record<string, unknown>> } } })
    .inputs.reads.externals;
  for (const e of exts) {
    if (p === undefined) delete e.on_failure;
    else e.on_failure = p;
  }
  return d;
};

/**
 * The idempotency compute: reports every check inert, and — the ONE fact this file's
 * fixture is built around — authors a sub-block ONLY for each primary whose aggregate
 * outcome is `loaded`. A SKIPPED primary therefore contributes NOTHING here, by design:
 * the run's own `records_meta.k` must still carry it, re-emitted by the library from the
 * primary's own `emitBlock` (the prior sub-block it skipped against). That re-emit is the
 * property T12/T12b are RED about.
 */
function idempotentCompute() {
  return Object.assign(
    async (ctx: Record<string, any>) => {
      for (const id of ctx.checks) ctx.report(id, { value: 0, inert: true });
      const primaries = (ctx.acquired && ctx.acquired.primaries) || {};
      const k: Record<string, { content_hash: unknown }> = {};
      for (const [id, e] of Object.entries(primaries as Record<string, Record<string, unknown>>)) {
        if (e.outcome === 'loaded') k[id] = { content_hash: e.content_hash };
      }
      return ctx.written ? { records_meta: { k } } : { records_meta: {} };
    },
    { ...ravineCompute },
  );
}

/**
 * `ledgerRuns()` — the stateful THREE-RUN harness. ONE shared `fakePool()` (the run's own
 * statement stream, so "no new write" is measured against a single cumulative call log),
 * plus a `readPriorEmitWithPosture` spy that returns the PREVIOUS run's own `records_meta.k`
 * as the prior block: after each run the LAST 8-param `UPDATE pipeline_runs` is read and
 * `JSON.parse(params[7])` captured as `lastMeta` (ledger.js `finalizeLedgerRow`, params[7]
 * = the `records_meta` JSON). This is exactly the same `lastMeta.k` the second run of a
 * production INGESTOR reads back — so a library that fails to re-emit a skipped primary's
 * sub-block visibly forgets it.
 */
function ledgerRuns(d: Record<string, unknown>) {
  const pool = fakePool();
  let lastMeta: Record<string, any> | null = null;
  const restored: Array<{ mockRestore: () => void }> = [];
  const perRun: Array<{ mockRestore: () => void }> = [];

  const metaUpdates = () => pool.calls.filter((c) =>
    c.text.includes('UPDATE pipeline_runs') && Array.isArray(c.params) && c.params.length === 8);

  const readLastMeta = () => {
    const updates = metaUpdates();
    if (updates.length === 0) return null;
    const raw = updates[updates.length - 1]!.params![7];
    return raw == null ? null : JSON.parse(String(raw)) as Record<string, any>;
  };

  // The STABLE seams, installed ONCE: `executeWrite` in particular keeps ONE cumulative
  // call log across all three runs (re-spying it per run would reset the very history
  // "no new write" is measured against). Only the prior read and the acquisition — the
  // two seams that must change behaviour run to run — are re-armed.
  restored.push(
    vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({
      ta: { rls_enabled: true, bypassrls: true, policies: 0 },
      tb: { rls_enabled: true, bypassrls: true, policies: 0 },
    }),
    vi.spyOn(writeLib, 'validateGeometries').mockResolvedValue({
      carried: [{ source_id: 1, geom: Buffer.from('') }], repaired: 0, collectionExtracted: 0, skipped: 0, skippedKeys: [],
    }),
    vi.spyOn(writeLib, 'executeWrite').mockResolvedValue({
      inserted: 1, updated: 0, deleted: 0, rows_scanned: 1, rows_changed: 1, unchanged: 0,
    }),
  );

  /** Install the fresh per-run spies; `failId` makes that primary's acquisition throw. */
  const arm = (failId?: string) => {
    for (const s of perRun.splice(0)) s.mockRestore();
    perRun.push(
      vi.spyOn(stalenessLib, 'readPriorEmitWithPosture')
        .mockImplementation(async () => ({ prior: lastMeta ? (lastMeta.k ?? null) : null, error: null })),
      vi.spyOn(acquireLib, 'acquireExternal').mockImplementation((async (
        { external, prior: p }: { external: { id: string }; prior: Record<string, unknown> | null },
      ) => {
        if (external.id === failId) throw new Error('boom ' + external.id);
        if (p && p.content_hash === 'bb') {
          return {
            tier1: { skip: false },
            tier2: { skip: true, reason: 'content_hash_unchanged' },
            features: [],
            acquired: primaryAcquired(),
            emitBlock: { ...p, skipped_reason: 'content_hash_unchanged' },
          };
        }
        return {
          tier1: { skip: false },
          tier2: { skip: false },
          emitBlock: null,
          features: [{ source_id: 1, geojson: '{}', record: {} }],
          acquired: primaryAcquired(),
        };
      }) as (...args: unknown[]) => unknown),
    );
  };

  /** One full run of the SAME descriptor over the SAME pool, capturing the new ledger meta. */
  const run = async () => {
    const out = await stepLib.step(d, idempotentCompute()).run({ pool, chainId: null, fetch: throwing }) as {
      status: string;
      recordsMeta: Record<string, any>;
    };
    lastMeta = readLastMeta();
    return { out, lastMeta: lastMeta as Record<string, any> | null };
  };

  return {
    arm, run, pool, metaUpdates,
    writes: () => (writeLib.executeWrite as unknown as { mock: { calls: Array<[unknown, { plan: { table: string } }]> } }).mock.calls,
    dispose: () => {
      for (const s of perRun.splice(0)) s.mockRestore();
      for (const s of restored.splice(0)) s.mockRestore();
    },
  };
}

describe('INGESTOR prerequisite 0x — multi-primary idempotency (three runs, one pool)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // T12 RED — a three-run idempotency proof. Run 1 loads both primaries (two
  // writes). Run 2 finds BOTH content hashes unchanged and must SKIP both:
  // its ledger `records_meta.k` must carry `a` AND `b` with the `'bb'`
  // baseline the library RE-EMITTED from each primary's own emit block (the
  // library does not yet do this, so run 2's `k` is `{}` and run 3 RELOADS).
  // Run 3 must therefore issue NO new write either.
  // =========================================================================
  it('T12 (RED) — a skipped second run re-emits both primaries\' sub-blocks, so the third run writes nothing', async () => {
    const h = ledgerRuns(H2());
    try {
      // ── RUN 1: both load, two write transactions. ──
      h.arm();
      const r1 = await h.run();
      expect(r1.out.status, 'the first run of a two-primary descent is a success').toBe('completed');
      expect(h.writes().length, 'each primary writes its own transaction').toBe(2);
      expect(r1.lastMeta!.k, 'run 1 authors a sub-block for each LOADED primary').toEqual({
        a: { content_hash: 'bb' },
        b: { content_hash: 'bb' },
      });

      // ── RUN 2: both content hashes are unchanged, so BOTH skip. ──
      const writesBefore2 = h.writes().length;
      h.arm();
      const r2 = await h.run();
      expect(r2.out.status, 'a no-op second run is still a success').toBe('completed');
      expect(h.writes().length, 'a skipped primary issues NO new executeWrite call').toBe(writesBefore2);
      expect(r2.lastMeta!.k, 'the library re-emits BOTH skipped primaries\' sub-blocks into the run meta')
        .toMatchObject({
          a: { content_hash: 'bb', skipped_reason: 'content_hash_unchanged' },
          b: { content_hash: 'bb', skipped_reason: 'content_hash_unchanged' },
        });
      expect(r2.lastMeta!.k.a.content_hash, 'primary a\'s baseline survives the skip').toBe('bb');
      expect(r2.lastMeta!.k.b.content_hash, 'primary b\'s baseline survives the skip').toBe('bb');

      // ── RUN 3: nothing new to write, so STILL no new executeWrite call. ──
      const writesBefore3 = h.writes().length;
      h.arm();
      const r3 = await h.run();
      expect(r3.out.status).toBe('completed');
      expect(h.writes().length, 'a third run over an unchanged source writes nothing either').toBe(writesBefore3);
    } finally {
      h.dispose();
    }
  });

  // =========================================================================
  // T12b RED (LOW 3) — a PERSISTENT `warn_row_continue` failure. Run 1 loads
  // both. Run 2 fails `a` (it throws before it can be re-hashed): the failed
  // primary's baseline does NOT advance — the library never fabricates one for
  // a primary it never loaded — so `k` has NO key `a`, while `b`'s unchanged
  // hash lets it skip and re-emit `k.b`. Run 3, with `a` healthy again, finds
  // NO baseline for `a` and RELOADS it — EXACTLY ONE new write, onto `ta`.
  // RED today: `k` drops every skipped primary, so run 3 reloads BOTH.
  // =========================================================================
  it('T12b (RED) — a persistent warn_row_continue failure fails closed: its baseline never advances, so run 3 reloads exactly that primary', async () => {
    const h = ledgerRuns(posture(H2(), 'warn_row_continue'));
    try {
      // ── RUN 1: both load. ──
      h.arm();
      const r1 = await h.run();
      expect(r1.out.status).toBe('completed');
      expect(h.writes().length).toBe(2);
      expect(Object.keys(r1.lastMeta!.k).sort(), 'both primaries carry a baseline after a clean load').toEqual(['a', 'b']);

      // ── RUN 2: `a` throws (warn_row_continue swallows it), `b` skips unchanged. ──
      const writesBefore2 = h.writes().length;
      h.arm('a');
      const r2 = await h.run();
      expect(r2.out.status, 'a swallowed per-primary failure is a WARNING, not a failed run').toBe('completed_with_warnings');
      expect(Object.prototype.hasOwnProperty.call(r2.lastMeta!.k, 'a'), 'the failed primary\'s baseline is NOT fabricated').toBe(false);
      expect(r2.lastMeta!.k.b?.content_hash, 'the healthy, unchanged primary still skips and re-emits its sub-block').toBe('bb');
      expect(h.writes().length, 'only the healthy primary wrote nothing; b skipped, a never reached a write').toBe(writesBefore2);

      // ── RUN 3: `a` is healthy again and has NO baseline → reload it, and ONLY it. ──
      const writesBefore3 = h.writes().length;
      h.arm();
      const r3 = await h.run();
      expect(r3.out.status).toBe('completed');
      expect(h.writes().length, 'exactly ONE new write — the primary whose baseline never advanced').toBe(writesBefore3 + 1);
      const newWrites = h.writes().slice(writesBefore3);
      expect(newWrites[0]![1].plan.table, 'the reloaded primary is `a`, i.e. table `ta`').toBe('ta');
    } finally {
      h.dispose();
    }
  });

  // =========================================================================
  // T13 PIN (Guardian) — interrupted-retraction recovery reaches EVERY
  // narrowed call. `recovery.interrupted: "force_full_on_next_run"` plus a
  // `detectInterruptedRetraction` that reports the crash must make BOTH
  // primaries acquire with `forced === true` — a recovery that only reached
  // the FIRST primary would leave the second on the stale-skip path.
  // =========================================================================
  it('T13 (PIN) — an interrupted retraction forces EVERY narrowed primary acquisition, not just the first', async () => {
    const d = H2() as Record<string, any>;
    d.recovery = { ...d.recovery, interrupted: 'force_full_on_next_run' };
    const h = ledgerRuns(d);
    try {
      h.arm();
      // `h.arm()` installed the fresh per-run spies; add the interrupted-retraction one on top.
      const detect = vi.spyOn(stalenessLib, 'detectInterruptedRetraction')
        .mockResolvedValue({ interrupted: true, row: { id: 1, status: 'crashed' } } as never);

      const r = await h.run();
      expect(r.out.status, 'a forced-full recovery run still completes').toBe('completed');
      expect(detect, 'the reader is consulted for the recovery loop').toHaveBeenCalled();

      const acquire = acquireLib.acquireExternal as unknown as {
        mock: { calls: Array<[{ external: { id: string }; forced: boolean }]> };
      };
      expect(acquire.mock.calls.length, 'both primaries are acquired').toBe(2);
      expect(acquire.mock.calls[0]![0].external.id).toBe('a');
      expect(acquire.mock.calls[1]![0].external.id).toBe('b');
      expect(acquire.mock.calls[0]![0].forced, 'primary a is forced FULL').toBe(true);
      expect(acquire.mock.calls[1]![0].forced, 'primary b is forced FULL too — recovery reaches EVERY narrowed call').toBe(true);
    } finally {
      h.dispose();
    }
  });

  // =========================================================================
  // T14 RED — `aggregatePrimaries` aggregate semantics: a SUM across targets
  // for the countable fields, an OR for the boolean-ish `delete_skipped_empty_guard`
  // / `write_skipped_pre_write_fail`, and a per-target breakdown. The counter
  // fold drops `unchanged` and the guard flags today.
  // =========================================================================
  it('T14 (RED) — aggregatePrimaries sums unchanged, ORs the guard flags, and keys by_target', async () => {
    const first = stepLib.aggregatePrimaries([
      {
        id: 'a', target: 'ta', onFailure: 'abort_step',
        out: {
          reason: 'loaded', acquired: {},
          written: { inserted: 1, updated: 0, deleted: 0, rows_scanned: 3, rows_changed: 1, unchanged: 2, delete_skipped_empty_guard: false },
        },
      },
      {
        id: 'b', target: 'tb', onFailure: 'abort_step',
        out: {
          reason: 'loaded', acquired: {},
          written: { inserted: 0, updated: 0, deleted: 0, rows_scanned: 3, rows_changed: 0, unchanged: 3, delete_skipped_empty_guard: true },
        },
      },
    ], { emitKey: 'k', overrides: {} }) as {
      written: { unchanged: number; delete_skipped_empty_guard: boolean; by_target: Record<string, unknown> };
    };

    expect(first.written.unchanged, 'the two targets\' unchanged counts SUM (2 + 3)').toBe(5);
    expect(first.written.delete_skipped_empty_guard, 'a guard tripped on ANY target is true for the step').toBe(true);
    expect(Object.keys(first.written.by_target), 'each target keeps its own written breakdown').toEqual(['ta', 'tb']);

    const second = stepLib.aggregatePrimaries([
      {
        id: 'a', target: 'ta', onFailure: 'abort_step',
        out: {
          reason: 'loaded', acquired: {},
          written: { inserted: 1, updated: 0, deleted: 0, rows_scanned: 3, rows_changed: 1, unchanged: 2, delete_skipped_empty_guard: false },
        },
      },
      {
        id: 'b', target: 'tb', onFailure: 'abort_step',
        out: {
          writeSkipped: true, failedPreWrite: ['c'], reason: 'pre_write_check_failed', acquired: {},
          written: {
            inserted: 0, updated: 0, deleted: 0, rows_scanned: 0, rows_changed: 0,
            delete_skipped_empty_guard: false, write_skipped_pre_write_fail: true,
          },
        },
      },
    ], { emitKey: 'k', overrides: {} }) as {
      written: { write_skipped_pre_write_fail: boolean };
    };

    expect(second.written.write_skipped_pre_write_fail, 'a target that skipped its write before the pre_write check is visible on the step aggregate').toBe(true);
  });

  // =========================================================================
  // T8c PIN (Guardian lock) — a write guard's throw is NEVER swallowed by a
  // recoverable posture. `fail_row_continue` lets an ACQUISITION failure
  // continue, but `executeWrite` throwing the key guard's duplicate-source_id
  // error on `ta` must fail the step (`a` recorded `failed`, one
  // `primary_failed:a` FAIL row) — and `b` is still attempted.
  // =========================================================================
  it('T8c (PIN) — a write-guard throw under fail_row_continue fails the primary and never silently passes', async () => {
    const restored = stubs();
    try {
      (writeLib.executeWrite as unknown as { mockImplementation: (fn: (...a: unknown[]) => unknown) => void })
        .mockImplementation((async (_c: unknown, { plan }: { plan: { table: string } }) => {
          if (plan.table === 'ta') throw new Error('key guard: duplicate source_id');
          return { inserted: 1, updated: 0, deleted: 0, rows_scanned: 1, rows_changed: 1, unchanged: 0 };
        }) as (...args: unknown[]) => unknown);

      const out = await callPrimaries(posture(H2(), 'fail_row_continue')) as {
        acquired: { primaries: Record<string, Record<string, unknown>> };
      };

      expect(out.acquired.primaries.a!.outcome, 'the guarded write\'s throw is a FAILED primary').toBe('failed');

      const rows = stepLib.primaryFailureRows([out]) as Array<Record<string, unknown>>;
      expect(rows.length).toBe(1);
      expect(rows[0]).toMatchObject({ metric: 'primary_failed:a', status: 'FAIL', errored: true });

      const writes = (writeLib.executeWrite as unknown as {
        mock: { calls: Array<[unknown, { plan: { table: string } }]> };
      }).mock.calls;
      expect(writes.map((w) => w[1].plan.table), 'the healthy primary is still written after a\'s guard threw').toContain('tb');
    } finally {
      for (const s of restored) s.mockRestore();
    }
  });
});
