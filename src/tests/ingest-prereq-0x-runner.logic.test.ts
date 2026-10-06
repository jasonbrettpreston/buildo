// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A18 (0x; RE-FREEZE #29, logged in 122 §8)
//
// INGESTOR prerequisite 0x (part B) — the RUNNER arm of the MULTI-PRIMARY INGESTOR.
//
// 0w taught `runIngestPhase` (single primary) about ONE primary + N `role:"lookup"`
// side-sources. Its own "exactly ONE url-bearing primary" throw was a RUNTIME refusal,
// explicitly written to be LIFTED (Fold CF-3) by "adding a per-primary target binding —
// one field, zero enum churn". 0x is that lift: a descriptor whose externals each name an
// `outputs.writes[].table` (via `target`) is a MULTI-PRIMARY step, dispatched away from
// `runIngestPhase` to `ingestPrimaries`, which drives `runIngestPhase` ONCE per bound
// primary over a one-external NARROWED descriptor — its own prior sub-block
// (`emits[0].skeleton[<id>]`), its own gates, its own write transaction. The cross-array
// binding facts (every primary targeted, every target declared and distinct, every write
// targeted, no lookup, a skeleton sub-block per id, two or more primaries, unique ids,
// url-only primaries) are runtime refusals **0x B1-B9**: JSON Schema cannot relate two
// arrays, so `multiPrimaryBinding` refuses them BY NAME AND CODE before any pool or
// network call.
//
// This file locks the PURE half — `isMultiPrimary` / `multiPrimaryBinding` and the
// per-primary loop's aggregation (`ingestPrimaries`) — plus the PIN that the SINGLE-primary
// path is byte-identical to 0w (a targeted descriptor never reaches `runIngestPhase`'s own
// refusal; an untargeted one still does).
//
// Red-first evidence (pre-0x: T4/T4b/T5/T6/T10b failed as "not a function"; T10a is the
// PIN) is recorded in the 0x landing, not restated here.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const stepLib = require(join(process.cwd(), 'scripts/lib/step'));
const stalenessLib = require(join(process.cwd(), 'scripts/lib/step/staleness.js'));
const acquireLib = require(join(process.cwd(), 'scripts/lib/step/acquire.js'));
const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
const conservationLib = require(join(process.cwd(), 'scripts/lib/step/conservation.js'));
const ravineCompute = require(join(process.cwd(), 'scripts/lib/compute/load-ravines.js'));
const LOAD_RAVINES = require(join(process.cwd(), 'scripts/load-ravines.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const noopLog = { info: () => {}, warn: () => {}, error: () => {} };

/** The 0w lookup: an xlsx side-source, declared with a role and no key_property. */
const LOOKUP = {
  id: 'l', kind: 'http_file', url: 'http://ex/p.xlsx', format: 'xlsx', role: 'lookup',
};

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

describe('INGESTOR prerequisite 0x — runner multi-primary (part 1: binding + loop)', () => {
  let restored: Array<{ mockRestore: () => void }> = [];
  afterEach(() => {
    for (const s of restored.splice(0)) s.mockRestore();
  });

  // =========================================================================
  // T4 — THE 0x B1-B9 REFUSALS + the two pre-loop export checks (X1), all
  // fired by `multiPrimaryBinding`/`ingestPrimaries` BEFORE the first pool
  // query and the first HEAD: a mis-declared descriptor costs no network and
  // no DB. RED today: `ingestPrimaries` is not exported.
  // =========================================================================
  const okRow = () => `acquireExternal 0×, assertWritePrivileges 0×, pool.calls.length === 0`;

  it('T4 — B1-B9 refuse the cross-array binding facts by CODE and by id, costing no network', async () => {
    const rows: Array<{ name: string; code: string; id: string; mutate: (d: Record<string, any>) => void }> = [
      {
        name: 'B1 — a primary with no target', code: 'B1', id: 'b',
        mutate: (d) => { delete d.inputs.reads.externals[1].target; },
      },
      {
        name: 'B2 — a target that is not a declared write table', code: 'B2', id: 'b',
        mutate: (d) => { d.inputs.reads.externals[1].target = 'nope'; },
      },
      {
        name: 'B3 — two primaries sharing one target', code: 'B3', id: 'b',
        mutate: (d) => { d.inputs.reads.externals[1].target = 'ta'; },
      },
      {
        name: 'B4 — a declared write target no primary fills', code: 'B4', id: 'tc',
        mutate: (d) => { d.outputs.writes.push({ ...d.outputs.writes[0], table: 'tc' }); },
      },
      {
        name: 'B5 — a lookup on a multi-primary step', code: 'B5', id: 'l',
        mutate: (d) => { d.inputs.reads.externals.push(clone(LOOKUP)); },
      },
      {
        name: 'B6 — a primary with no emits skeleton sub-block', code: 'B6', id: 'b',
        mutate: (d) => { d.emits[0].skeleton = { a: {} }; },
      },
      {
        name: 'B7 — one primary declaring a target', code: 'B7', id: 'a',
        mutate: (d) => {
          d.inputs.reads.externals = [d.inputs.reads.externals[0]];
          d.outputs.writes = [d.outputs.writes[0]];
          d.emits[0].skeleton = { a: {} };
          d.staleness.trigger = d.staleness.trigger.filter((t: any) => t.external === 'a');
        },
      },
      {
        name: 'B8 — two primaries with the same id', code: 'B8', id: 'a',
        mutate: (d) => { d.inputs.reads.externals[1].id = 'a'; d.emits[0].skeleton = { a: {} }; },
      },
      {
        name: 'B9 — a filesystem primary (no url, a path, csv)', code: 'B9', id: 'b',
        mutate: (d) => {
          d.inputs.reads.externals[1] = {
            id: 'b', kind: 'filesystem', path: 'data/x.csv', format: 'csv',
            csv_options: { bom: false, relax_quotes: false }, target: 'tb',
          };
        },
      },
      {
        name: 'B9 — a url primary that also carries a path', code: 'B9', id: 'b',
        mutate: (d) => { d.inputs.reads.externals[1].path = 'data/x.csv'; },
      },
      {
        name: 'B9 — an xlsx primary', code: 'B9', id: 'b',
        mutate: (d) => { d.inputs.reads.externals[1].format = 'xlsx'; },
      },
    ];

    for (const row of rows) {
      const d = H2();
      row.mutate(d as Record<string, any>);
      const pool = fakePool();
      restored = stubs();
      await expect(
        callPrimaries(d, { pool }),
        `${row.name}: the refusal names the code AND the offending id`,
      ).rejects.toThrow(new RegExp(`0x ${row.code}\\b`));
      await expect(
        callPrimaries(d, { pool }),
        `${row.name}: the refusal quotes the id "${row.id}"`,
      ).rejects.toThrow(new RegExp(`"${row.id}"`));
      expect(acquireLib.acquireExternal, `${row.name}: ${okRow()}`).not.toHaveBeenCalled();
      expect(writeLib.assertWritePrivileges, `${row.name}: ${okRow()}`).not.toHaveBeenCalled();
      expect(pool.calls.length, `${row.name}: ${okRow()}`).toBe(0);
    }
  });

  it('T4 — X1 refuses a csv primary with no shapeRecord and a set_source:"compute" target with no buildWriteSql', async () => {
    // X1a: `b` declares format "csv", so the step owes a `compute.shapeRecord`.
    const csv = H2();
    (csv as any).inputs.reads.externals[1] = {
      ...(csv as any).inputs.reads.externals[1],
      format: 'csv',
      csv_options: { bom: false, relax_quotes: false },
    };
    const shapeCompute = { ...ravineCompute } as Record<string, unknown>;
    delete shapeCompute.shapeRecord;
    const pool1 = fakePool();
    restored = stubs();
    await expect(
      callPrimaries(csv, { pool: pool1, compute: shapeCompute }),
      'X1a names the missing export and the id',
    ).rejects.toThrow(/shapeRecord/);
    await expect(
      callPrimaries(csv, { pool: pool1, compute: shapeCompute }),
      'X1a quotes the id',
    ).rejects.toThrow(/"b"/);
    expect(acquireLib.acquireExternal, `X1a: ${okRow()}`).not.toHaveBeenCalled();
    expect(writeLib.assertWritePrivileges, `X1a: ${okRow()}`).not.toHaveBeenCalled();
    expect(pool1.calls.length, `X1a: ${okRow()}`).toBe(0);

    // X1b: `tb` declares write_discipline.set_source "compute", so the step owes a
    // `compute.buildWriteSql`.
    const setSource = H2();
    (setSource as any).outputs.writes[1].write_discipline = {
      ...(setSource as any).outputs.writes[1].write_discipline,
      set_source: 'compute',
    };
    const writeCompute = { ...ravineCompute } as Record<string, unknown>;
    delete writeCompute.buildWriteSql;
    const pool2 = fakePool();
    restored = stubs();
    await expect(
      callPrimaries(setSource, { pool: pool2, compute: writeCompute }),
      'X1b names the missing export',
    ).rejects.toThrow(/buildWriteSql/);
    await expect(
      callPrimaries(setSource, { pool: pool2, compute: writeCompute }),
      'X1b quotes the target table',
    ).rejects.toThrow(/"tb"/);
    expect(acquireLib.acquireExternal, `X1b: ${okRow()}`).not.toHaveBeenCalled();
    expect(writeLib.assertWritePrivileges, `X1b: ${okRow()}`).not.toHaveBeenCalled();
    expect(pool2.calls.length, `X1b: ${okRow()}`).toBe(0);
  });

  it('T4 — the privilege preflight is the FIRST pool query, before the prior read and the first acquisition', async () => {
    restored = stubs();
    await callPrimaries(H2());

    const privilege = writeLib.assertWritePrivileges as unknown as {
      mock: { calls: unknown[]; invocationCallOrder: number[] };
    };
    const priorRead = stalenessLib.readPriorEmitWithPosture as unknown as {
      mock: { calls: unknown[]; invocationCallOrder: number[] };
    };
    const acquire = acquireLib.acquireExternal as unknown as {
      mock: { calls: unknown[]; invocationCallOrder: number[] };
    };

    expect(privilege.mock.calls, 'ONE privilege preflight covers the whole descriptor').toHaveLength(3);
    expect(
      privilege.mock.invocationCallOrder[0]!,
      'the privilege preflight precedes the first prior read',
    ).toBeLessThan(priorRead.mock.invocationCallOrder[0]!);
    expect(
      privilege.mock.invocationCallOrder[0]!,
      'the privilege preflight precedes the first acquisition',
    ).toBeLessThan(acquire.mock.invocationCallOrder[0]!);
  });

  // =========================================================================
  // T4b — the caller owns the per-primary TRIGGER SCOPING. `ingestPrimaries`
  // narrows `staleness.trigger` to each primary id, so an UNSCOPED trigger
  // (a `pre_compute` ledger/code/interval trigger carries no `external` by
  // design) reaches EVERY primary, while a trigger scoped to one id reaches
  // only that primary. RED today: `ingestPrimaries` does not narrow.
  // =========================================================================
  it('T4b — ingestPrimaries narrows staleness.trigger to each primary id, keeping the unscoped entry', async () => {
    const d = H2();
    (d as any).staleness.trigger = [
      { signal: 'content_hash', position: 'post_acquisition', external: 'a', hash: 'sha256' },
      { signal: 'source_validator', position: 'pre_acquisition' },
    ];
    restored = stubs();
    await callPrimaries(d);

    const calls = (acquireLib.acquireExternal as unknown as {
      mock: { calls: Array<[{ descriptor: { staleness: { trigger: unknown[] } } }]> };
    }).mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[0]![0].descriptor.staleness.trigger, 'primary a gets its own scoped trigger PLUS the unscoped one').toHaveLength(2);
    expect(calls[1]![0].descriptor.staleness.trigger, 'primary b gets only the unscoped entry').toEqual([
      { signal: 'source_validator', position: 'pre_acquisition' },
    ]);
  });

  // =========================================================================
  // T5 — the LOOP: two primaries, two acquisitions (a then b), two write
  // transactions (ta then tb), and an aggregated `acquired.primaries` /
  // `written.by_target`. RED today: `ingestPrimaries` does not exist.
  // =========================================================================
  it('T5 — drives runIngestPhase once per primary and aggregates acquired.primaries + written.by_target', async () => {
    restored = stubs();
    const out = await callPrimaries(H2()) as {
      skipped: boolean;
      written: { inserted: number; by_target: Record<string, unknown> };
      acquired: { primaries: Record<string, { outcome: string }> };
    };

    const acquire = (acquireLib.acquireExternal as unknown as {
      mock: { calls: Array<[{ external: { id: string } }]> };
    }).mock.calls;
    expect(acquire.length, 'each primary is acquired exactly once').toBe(2);
    expect(acquire[0]![0].external.id, 'declared external order').toBe('a');
    expect(acquire[1]![0].external.id).toBe('b');

    const writes = (writeLib.executeWrite as unknown as {
      mock: { calls: Array<[unknown, { plan: { table: string } }]> };
    }).mock.calls;
    expect(writes.length, 'each primary writes its own transaction').toBe(2);
    expect(writes[0]![1].plan.table).toBe('ta');
    expect(writes[1]![1].plan.table).toBe('tb');

    expect(out.written.inserted).toBe(2);
    expect(Object.keys(out.written.by_target)).toEqual(['ta', 'tb']);
    expect(out.acquired.primaries.a!.outcome).toBe('loaded');
    expect(out.acquired.primaries.b!.outcome).toBe('loaded');
    expect(out.skipped).toBe(false);
  });

  // =========================================================================
  // T6 — each primary reads ITS OWN prior sub-block: `a`'s `{content_hash:'x'}`
  // and `b`'s `{content_hash:'y'}` are handed to the acquisition seam as
  // `prior` (the descriptor's `emits[0].skeleton[<id>]` sub-block, keyed by
  // id). RED today: `ingestPrimaries` does not exist.
  // =========================================================================
  it('T6 — each primary is acquired with its own prior sub-block', async () => {
    restored = stubs();
    await callPrimaries(H2());

    const priors = (acquireLib.acquireExternal as unknown as {
      mock: { calls: Array<[{ prior: unknown }]> };
    }).mock.calls.map((c) => c[0].prior);
    expect(priors).toEqual([{ content_hash: 'x' }, { content_hash: 'y' }]);
  });

  // =========================================================================
  // T10a (PIN) — the SINGLE-primary path is UNTOUCHED. `runIngestPhase` on a
  // plain ravines clone reads the prior block WHOLE (the same object the stub
  // returns, identity-equal) and carries NO `acquired.primaries`; its own
  // `/acquires exactly ONE/` refusal still fires on a descriptor with two
  // url-bearing primaries and only one write target (H1x2). GREEN today and
  // after 0x — the fence that keeps 0x additive.
  // =========================================================================
  it('T10a (PIN) — runIngestPhase is byte-identical: whole prior, no acquired.primaries, and the ONE-primary refusal', async () => {
    const priorStub = { feature_count: 1, content_hash: 'aa' };
    restored = [
      vi.spyOn(stalenessLib, 'readPriorEmitWithPosture').mockResolvedValue({ prior: priorStub, error: null }),
      vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({ ravines: { rls_enabled: true, bypassrls: true, policies: 0 } }),
      vi.spyOn(acquireLib, 'acquireExternal').mockResolvedValue({
        tier1: { skip: false }, tier2: { skip: false }, emitBlock: null,
        features: [{ source_id: 1, geojson: '{}', record: {} }], acquired: primaryAcquired(),
      }),
      vi.spyOn(writeLib, 'validateGeometries').mockResolvedValue({
        carried: [{ source_id: 1, geom: Buffer.from('') }], repaired: 0, collectionExtracted: 0, skipped: 0, skippedKeys: [],
      }),
      vi.spyOn(writeLib, 'executeWrite').mockResolvedValue({
        inserted: 1, updated: 0, deleted: 0, rows_scanned: 1, rows_changed: 1, unchanged: 0,
      }),
    ];
    const out = await stepLib.runIngestPhase({
      descriptor: clone(LOAD_RAVINES),
      pool: fakePool(),
      compute: ravineCompute,
      config: seedConfig(),
      fetchImpl: async () => { throw new Error('the runner must not reach the network in this test'); },
      chainId: null,
      log: noopLog,
      tag: '[0x-pin]',
      clockNow: new Date('2026-09-29T00:00:00Z'),
      preWriteGate: null,
    }) as { acquired: Record<string, unknown> };

    const firstPrior = (acquireLib.acquireExternal as unknown as {
      mock: { calls: Array<[{ prior: unknown }]> };
    }).mock.calls[0]![0].prior;
    expect(firstPrior, 'the prior block is handed through by IDENTITY, not re-derived').toBe(priorStub);
    expect(out.acquired.primaries, 'the multi-primary aggregate is absent on the single-primary path').toBeUndefined();
  });

  it('T10a (PIN) — runIngestPhase still refuses two url-bearing primaries with one write target', async () => {
    // H1x2 = H2 minus writes[1], with both targets deleted: two url-bearing externals,
    // ONE write. `runIngestPhase` sees its own `/acquires exactly ONE/` refusal —
    // unchanged by 0x, because a targeted descriptor never reaches this path.
    const d = H2();
    delete (d as any).inputs.reads.externals[0].target;
    delete (d as any).inputs.reads.externals[1].target;
    (d as any).outputs.writes = [(d as any).outputs.writes[0]];
    restored = stubs();
    await expect(stepLib.runIngestPhase({
      descriptor: d,
      pool: fakePool(),
      compute: ravineCompute,
      config: seedConfig(),
      fetchImpl: async () => { throw new Error('the runner must not reach the network in this test'); },
      chainId: null,
      log: noopLog,
      tag: '[0x-pin]',
      clockNow: new Date('2026-09-29T00:00:00Z'),
      preWriteGate: null,
    })).rejects.toThrow(/acquires exactly ONE/);
  });

  // =========================================================================
  // T10b — `isMultiPrimary` is the DISPATCH predicate: true iff some external
  // declares a string `target`. Every converted INGESTOR today declares none,
  // so it stays on `runIngestPhase`. RED today: not exported.
  // =========================================================================
  it('T10b — isMultiPrimary is false for a single-primary descriptor and true for H2', () => {
    expect(stepLib.isMultiPrimary(LOAD_RAVINES)).toBe(false);
    expect(stepLib.isMultiPrimary(H2())).toBe(true);
  });
});

// ── 0x-0b2 appends below ──

// =========================================================================
// 0x — runner part 2: skip, postures, never-caught, pre_write, status.
//
// Pre-0x these failed as "not a function" / construction refusals (red-first evidence is
// in the 0x landing).
// =========================================================================
describe('INGESTOR prerequisite 0x — runner multi-primary (part 2: skip + postures)', () => {
  let restored: Array<{ mockRestore: () => void }> = [];
  afterEach(() => {
    for (const s of restored.splice(0)) s.mockRestore();
  });

  /** A per-primary acquisition result whose tier2 SKIPS on an unchanged content hash. */
  const skipResult = (id: string) => ({
    tier1: { skip: false },
    tier2: { skip: true, reason: 'content_hash_unchanged' },
    features: [],
    acquired: primaryAcquired(),
    emitBlock: { skipped_reason: 'content_hash_unchanged', from: id },
  });

  /** Force an acquisition posture on BOTH externals (`undefined` = the field is absent). */
  const posture = (d: Record<string, unknown>, p: string | undefined) => {
    const exts = (d as { inputs: { reads: { externals: Array<Record<string, unknown>> } } })
      .inputs.reads.externals;
    for (const e of exts) {
      if (p === undefined) delete e.on_failure;
      else e.on_failure = p;
    }
    return d;
  };

  const throwing = async () => { throw new Error('the runner must not reach the network in this test'); };

  /**
   * A FULL runner pass over H2(): observes every per-primary ctx (spied report
   * calls), records its own post-run conservation row, and reports a forced `a`
   * `ravine_count_drift_pct` error when asked.
   */
  async function fullRun(d: Record<string, unknown>, failA = false) {
    const seen: Array<Record<string, any>> = [];
    const fn = Object.assign(
      async (ctx: Record<string, any>) => {
        seen.push(ctx);
        for (const id of ctx.checks) {
          ctx.report(id, failA && ctx.primary === 'a' && id === 'ravine_count_drift_pct'
            ? { error: 'forced a' }
            : { value: 0, inert: true });
        }
        return ctx.written ? { records_meta: { k: { from: 'compute' } } } : { records_meta: {} };
      },
      { ...ravineCompute },
    );
    const pool = fakePool();
    const out = await stepLib.step(d, fn).run({ pool, chainId: null, fetch: throwing }) as {
      recordsMeta: { audit_table: { rows: Array<Record<string, unknown>> }; terminal: string };
      skipped: boolean;
      status: string;
      failedPreWrite: string[] | undefined;
      writeSkippedPreWriteWarn: boolean | undefined;
      failedPreWriteWarn: string[] | undefined;
      written: { inserted: number; updated: number };
      acquired: { primaries: Record<string, Record<string, unknown>> };
    };
    return { out, pool, seen, rows: out.recordsMeta.audit_table.rows };
  }

  // =========================================================================
  // T7 — a per-primary SKIP does not skip the STEP: `a` returns its skip block
  // (outcome `skipped`, signal `content_hash`, the emit block carried through),
  // `b` still loads and still writes. RED today: not exported.
  // =========================================================================
  it('T7 — one primary skipping leaves the other loading and the step un-skipped', async () => {
    restored = stubs();
    const acquire = acquireLib.acquireExternal as unknown as { mock: { calls: Array<[{ external: { id: string } }]> } };
    acquire.mock.calls.length = 0;
    let nth = 0;
    acquireLib.acquireExternal.mockImplementation((async () => {
      nth += 1;
      return nth === 1 ? skipResult('a') : {
        tier1: { skip: false }, tier2: { skip: false }, emitBlock: null,
        features: [{ source_id: 1, geojson: '{}', record: {} }], acquired: primaryAcquired(),
      };
    }) as (...args: unknown[]) => unknown);

    const out = await callPrimaries(H2()) as {
      skipped: boolean;
      acquired: { primaries: Record<string, Record<string, unknown>> };
    };

    expect(out.acquired.primaries.a).toMatchObject({
      outcome: 'skipped',
      signal: 'content_hash',
      emitBlock: skipResult('a').emitBlock,
    });
    expect(out.acquired.primaries.b!.outcome).toBe('loaded');
    expect(writeLib.executeWrite).toHaveBeenCalledTimes(1);
    expect(out.skipped).toBe(false);
  });

  // =========================================================================
  // T7b — BOTH primaries skip: the step is STILL not skipped, zero writes are
  // attempted, both emit blocks survive, and the aggregate counts zero. Then a
  // FULL run shows the same facts round-trip through the ctx and the terminal
  // `UPDATE pipeline_runs` (records_new bound to 0, not null).
  // =========================================================================
  it('T7b — both skip: no write, both emit blocks kept, records_new bound to 0', async () => {
    restored = stubs();
    let nth = 0;
    acquireLib.acquireExternal.mockImplementation((async () => {
      nth += 1;
      return skipResult(nth === 1 ? 'a' : 'b');
    }) as (...args: unknown[]) => unknown);

    const out = await callPrimaries(H2()) as {
      skipped: boolean;
      written: { inserted: number; updated: number };
      acquired: { primaries: Record<string, { emitBlock: unknown }> };
    };

    expect(out.skipped).toBe(false);
    expect(writeLib.executeWrite).toHaveBeenCalledTimes(0);
    expect(out.acquired.primaries.a!.emitBlock).toBeTruthy();
    expect(out.acquired.primaries.b!.emitBlock).toBeTruthy();
    expect(out.written.inserted).toBe(0);
    expect(out.written.updated).toBe(0);

    for (const s of restored.splice(0)) s.mockRestore();
    restored = stubs();
    let nth2 = 0;
    acquireLib.acquireExternal.mockImplementation((async () => {
      nth2 += 1;
      return skipResult(nth2 === 1 ? 'a' : 'b');
    }) as (...args: unknown[]) => unknown);

    const { out: full, seen, pool } = await fullRun(H2());

    const last = seen[seen.length - 1]!;
    expect(last.acquired.primaries.a.emitBlock).toBeTruthy();
    expect(last.acquired.primaries.b.emitBlock).toBeTruthy();

    const update = pool.calls.filter((c: { text: string; params: unknown[] | undefined }) =>
      c.text.includes('UPDATE pipeline_runs') && c.params?.length === 8);
    expect(update.length).toBeGreaterThan(0);
    expect(update[update.length - 1]!.params![5]).toBe(0);
    expect(full.recordsMeta.terminal).toBe('loaded');
  });

  // =========================================================================
  // T8 — acquisition POSTURES: `fail_row_continue` turns a thrown acquire into
  // one FAIL row and keeps going; `warn_row_continue` into a WARN row (no
  // `errored` key); ABSENT keeps the hard reject. Also: the never-caught
  // conservation arm and the privilege arm.
  // =========================================================================
  it('T8 — fail_row_continue records a FAIL row and continues', async () => {
    restored = stubs();
    acquireLib.acquireExternal.mockImplementation((async ({ external }: { external: { id: string } }) => {
      if (external.id === 'a') throw new Error('boom a');
      return {
        tier1: { skip: false }, tier2: { skip: false }, emitBlock: null,
        features: [{ source_id: 1, geojson: '{}', record: {} }], acquired: primaryAcquired(),
      };
    }) as (...args: unknown[]) => unknown);

    const out = await callPrimaries(posture(H2(), 'fail_row_continue')) as {
      acquired: { primaries: Record<string, Record<string, unknown>> };
    };

    expect(out.acquired.primaries.a).toMatchObject({ outcome: 'failed', error: 'boom a' });
    const writes = (writeLib.executeWrite as unknown as {
      mock: { calls: Array<[unknown, { plan: { table: string } }]> };
    }).mock.calls;
    expect(writes.length).toBe(1);
    expect(writes[0]![1].plan.table).toBe('tb');

    const rows = stepLib.primaryFailureRows([out]) as Array<Record<string, unknown>>;
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      metric: 'primary_failed:a', status: 'FAIL', errored: true, source: 'gate',
    });
  });

  it('T8 — warn_row_continue records a WARN row with no errored key', async () => {
    restored = stubs();
    acquireLib.acquireExternal.mockImplementation((async ({ external }: { external: { id: string } }) => {
      if (external.id === 'a') throw new Error('boom a');
      return {
        tier1: { skip: false }, tier2: { skip: false }, emitBlock: null,
        features: [{ source_id: 1, geojson: '{}', record: {} }], acquired: primaryAcquired(),
      };
    }) as (...args: unknown[]) => unknown);

    const out = await callPrimaries(posture(H2(), 'warn_row_continue'));
    const rows = stepLib.primaryFailureRows([out]) as Array<Record<string, unknown>>;
    expect(rows.length).toBe(1);
    expect(rows[0]!.status).toBe('WARN');
    expect('errored' in rows[0]!).toBe(false);
  });

  it('T8 — an absent posture keeps the hard reject and costs exactly one acquire', async () => {
    restored = stubs();
    acquireLib.acquireExternal.mockImplementation((async ({ external }: { external: { id: string } }) => {
      if (external.id === 'a') throw new Error('boom a');
      return {
        tier1: { skip: false }, tier2: { skip: false }, emitBlock: null,
        features: [{ source_id: 1, geojson: '{}', record: {} }], acquired: primaryAcquired(),
      };
    }) as (...args: unknown[]) => unknown);

    await expect(callPrimaries(posture(H2(), undefined))).rejects.toThrow(/boom a/);
    expect(acquireLib.acquireExternal).toHaveBeenCalledTimes(1);
  });

  it('T8 — a never-caught conservation break rejects with RowConservationError', async () => {
    restored = stubs();
    // Acquisition is NORMAL for both primaries; only `a`'s write counts are inconsistent
    // with its acquired rows, so the real rowConservation throws AFTER `a`'s write.
    writeLib.executeWrite.mockImplementation((async (_c: unknown, { plan }: { plan: { table: string } }) => (
      plan.table === 'ta'
        ? { inserted: 0, updated: 0, unchanged: 0, deleted: 0, rows_scanned: 1, rows_changed: 0 }
        : { inserted: 1, updated: 0, deleted: 0, rows_scanned: 1, rows_changed: 1, unchanged: 0 }
    )) as (...args: unknown[]) => unknown);

    await expect(callPrimaries(posture(H2(), 'fail_row_continue')))
      .rejects.toBeInstanceOf(conservationLib.RowConservationError);
    expect(acquireLib.acquireExternal).toHaveBeenCalledTimes(1);
  });

  it('T8 — a privilege failure is never caught by warn_row_continue', async () => {
    restored = stubs();
    (writeLib.assertWritePrivileges as unknown as { mockRejectedValue: (e: Error) => void })
      .mockRejectedValue(new Error('no priv'));

    await expect(callPrimaries(posture(H2(), 'warn_row_continue'))).rejects.toThrow(/no priv/);
    expect(acquireLib.acquireExternal).toHaveBeenCalledTimes(0);
  });

  // =========================================================================
  // T8b — the pre_write gate's `skipWrite` arm under warn_row_continue: the
  // primary reports `write_skipped` with no `failed_pre_write`, the aggregate
  // flags the warn + names the check, and NO failure row is emitted.
  // =========================================================================
  it('T8b — a pre_write skipWrite under warn_row_continue names the check and emits no row', async () => {
    restored = stubs();
    const preWriteGate = vi.fn(async (s: { primary: string }) => (s.primary === 'a'
      ? { abort: false, failed: [], skipWrite: true, skipWriteChecks: ['chk'] }
      : { abort: false, failed: [] }));

    const out = await callPrimaries(posture(H2(), 'warn_row_continue'), { preWriteGate }) as {
      acquired: { primaries: Record<string, Record<string, unknown>> };
      writeSkippedPreWriteWarn: boolean;
      failedPreWriteWarn: string[];
    };

    expect(out.acquired.primaries.a!.outcome).toBe('write_skipped');
    expect('failed_pre_write' in out.acquired.primaries.a!).toBe(false);
    expect(out.writeSkippedPreWriteWarn).toBe(true);
    expect(out.failedPreWriteWarn).toContain('a:chk');
    expect(stepLib.primaryFailureRows([out])).toEqual([]);
  });

  // =========================================================================
  // T9 — the pre_write gate's `abort` arm: ABSENT rejects and stops at `a`,
  // `fail_row_continue` continues to `b`; the status reports below pin the
  // three audit-table shapes (no pre_write_gate under a recoverable posture,
  // one FAIL row under fail_row_continue, one row under absent).
  // =========================================================================
  const gate = () => vi.fn(async (s: { primary: string }) => (s.primary === 'a'
    ? { abort: true, failed: ['chk'] }
    : { abort: false, failed: [] }));

  it('T9 — an aborting gate under an absent posture stops the loop: b not_reached, a:-prefixed failedPreWrite', async () => {
    restored = stubs();
    const preWriteGate = gate();

    // abort_step: a pre_write abort is not a throw — it stops the loop (zoning's
    // "base ok:false aborts"), and the remaining primary is recorded as not reached.
    const out = await callPrimaries(posture(H2(), undefined), { preWriteGate }) as {
      failedPreWrite: string[] | undefined;
      acquired: { primaries: Record<string, Record<string, unknown>> };
    };
    expect(preWriteGate.mock.calls.map((c) => c[0].primary)).toEqual(['a']);
    expect(out.acquired.primaries.b!.outcome).toBe('not_reached');
    expect(out.failedPreWrite).toEqual(['a:chk']);
    expect(writeLib.executeWrite).toHaveBeenCalledTimes(0);
  });

  it('T9 — fail_row_continue continues past an aborting gate to the second primary', async () => {
    restored = stubs();
    const preWriteGate = gate();

    const out = await callPrimaries(posture(H2(), 'fail_row_continue'), { preWriteGate }) as {
      failedPreWrite: string[] | undefined;
      acquired: { primaries: Record<string, Record<string, unknown>> };
    };

    expect(preWriteGate.mock.calls.map((c) => c[0].primary)).toEqual(['a', 'b']);
    expect(out.acquired.primaries.b!.outcome).toBe('loaded');
    expect(out.failedPreWrite).toBeUndefined();
    expect(out.acquired.primaries.a).toMatchObject({
      outcome: 'write_skipped', failed_pre_write: ['chk'],
    });
  });

  // Re-pointed 2026-10-04 (#52, fold 19 MQ-A1 (a); orchestrator ruling): the posture's promise is
  // proven on a primary that FAILS (its acquisition throws), not on a gate abort — a gate abort's
  // own FAIL row is now scored from the gate pass (Rule 10), see the next test.
  it('T9 — warn_row_continue status: a primary that THROWS is one WARN primary_failed row, no pre_write_gate row, completed_with_warnings', async () => {
    restored = stubs();
    const acquire = acquireLib.acquireExternal as unknown as {
      getMockImplementation: () => ((...args: unknown[]) => unknown) | undefined;
      mockImplementation: (fn: (...args: unknown[]) => unknown) => void;
    };
    const loaded = acquire.getMockImplementation();
    let nth = 0;
    acquire.mockImplementation(async (...args: unknown[]) => {
      nth += 1;
      if (nth === 1) throw new Error('forced a');
      return loaded ? loaded(...args) : undefined;
    });
    const { out, rows } = await fullRun(posture(H2(), 'warn_row_continue'), false);

    expect(rows.filter((r) => r.metric === 'pre_write_gate').length).toBe(0);
    const failed = rows.filter((r) => r.metric === 'primary_failed:a');
    expect(failed.length).toBe(1);
    expect(failed[0]!.status).toBe('WARN');
    expect(String(failed[0]!.value)).toContain('forced a');
    expect(out.status).toBe('completed_with_warnings');
  });

  it('T9b — warn_row_continue + an ABORTING gate: the gate pass\'s own errored FAIL row is scored (#52, Rule 10) ⇒ failed; the WARN primary_failed row still names the abort', async () => {
    restored = stubs();
    const { out, rows } = await fullRun(posture(H2(), 'warn_row_continue'), true);

    const check = rows.filter((r) => r.metric === 'ravine_count_drift_pct');
    expect(check.length).toBe(1);
    expect(check[0]!.status).toBe('FAIL');
    expect(check[0]!.errored).toBe(true);
    expect(check[0]!.observed).toBe('before_write');
    const failed = rows.filter((r) => r.metric === 'primary_failed:a');
    expect(failed.length).toBe(1);
    expect(failed[0]!.status).toBe('WARN');
    expect(out.status).toBe('failed');
  });

  it('T9 — fail_row_continue status: no pre_write_gate row, one FAIL errored row', async () => {
    restored = stubs();
    const { out, rows } = await fullRun(posture(H2(), 'fail_row_continue'), true);

    expect(rows.filter((r) => r.metric === 'pre_write_gate').length).toBe(0);
    const failed = rows.filter((r) => r.metric === 'primary_failed:a');
    expect(failed.length).toBe(1);
    expect(failed[0]!.status).toBe('FAIL');
    expect(failed[0]!.errored).toBe(true);
    expect(out.status).toBe('failed');
  });

  it('T9 — absent status: one FAIL errored pre_write_gate row and no primary_failed row', async () => {
    restored = stubs();
    const { rows } = await fullRun(posture(H2(), undefined), true);

    const pre = rows.filter((r) => r.metric === 'pre_write_gate');
    expect(pre.length).toBe(1);
    expect(pre[0]!.status).toBe('FAIL');
    expect(pre[0]!.errored).toBe(true);
    expect(rows.filter((r) => String(r.metric).startsWith('primary_failed')).length).toBe(0);
  });
});
