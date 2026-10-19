// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DX (CKAN primary forms; runner-lane
//            draft R-DU, operator y 2026-10-18); Spec 122 §8 RE-FREEZE #37
//
// R-DX — a `ckan_datastore` primary is a first-class INGESTOR primary in four forms:
//   (i)   geometry-less under guards.srid "none": the CKAN arm keeps every record, geojson null;
//   (ii)  one targetless CKAN primary runs through runIngestPhase (0y Y4 deleted; B7 stays);
//   (iii) primaries naming the SAME target form one union group: each selected member is acquired,
//         the records concatenated (tagged with the member id), shaped, deduplicated ONCE and
//         written in ONE write; members share format and key property, else refused (U1);
//   (iv)  externals[].modes ⊆ ["full","incremental"] selects members by the run mode (one helper,
//         resolveRunMode, shared with runEnrichPhase); an unselected member is
//         {selected:false, reason:"mode"}; the run mode is stamped; a group with zero selected
//         members is refused (U2).
// Red-first: the it.fails cases are RED on the pre-#37 runner (acquire.js drops null geometry; Y4; B3;
// the schema refuses `modes`) and flip at RE-FREEZE #37. Gate K evidence:
// docs/reports/red-evidence/runner-lane/r-dx-ckan-primary.json.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const stepLib = require(join(process.cwd(), 'scripts/lib/step'));
const acquireLib = require(join(process.cwd(), 'scripts/lib/step/acquire.js'));
const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
const stalenessLib = require(join(process.cwd(), 'scripts/lib/step/staleness.js'));
const validateLib = require(join(process.cwd(), 'scripts/lib/step/validate.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

const noopLog = { info: () => {}, warn: () => {}, error: () => {} };
const PACKAGE_URL = 'https://ex/api/3/action/package_show?id=pkg';
const DATASTORE_URL = 'https://ex/api/3/action/datastore_search';
const VERSION = 'Mon, 14 Mar 2022 15:25:09 GMT';

function ckanExternal(id: string, resourceId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    kind: 'http_api',
    format: 'ckan_datastore',
    url: DATASTORE_URL,
    ckan: { resource_id: resourceId, package_url: PACKAGE_URL, page_size_from_config: 'x_page_size' },
    key_property: '_id',
    ...extra,
  };
}

/** A CKAN server serving package_show + paged datastore_search from per-resource records. */
function fakeCkan(recordsByResource: Record<string, Array<Record<string, unknown>>>) {
  const urls: string[] = [];
  const fetchImpl = vi.fn(async (url: string) => {
    urls.push(url);
    if (url.startsWith(PACKAGE_URL)) {
      return new Response(JSON.stringify({ success: true, result: { metadata_modified: VERSION, resources: Object.keys(recordsByResource).map((id) => ({ id, last_modified: VERSION })) } }), { status: 200 });
    }
    const q = new URL(url).searchParams;
    const all = recordsByResource[q.get('resource_id') ?? ''] ?? [];
    const limit = Number(q.get('limit'));
    const offset = Number(q.get('offset'));
    return new Response(JSON.stringify({ success: true, result: { records: all.slice(offset, offset + limit), total: all.length } }), { status: 200 });
  });
  return { fetchImpl, urls };
}

function armArgs(external: Record<string, unknown>, fetchImpl: unknown, guards: Record<string, unknown>) {
  return {
    ctxFetch: fetchImpl,
    log: noopLog,
    tag: '[r-dx]',
    slug: 'x',
    external,
    descriptor: { identity: { name: 'x', spec_version: '1.0' }, staleness: 'none', guards, execution: { network: { timeout: '30s', retries: 0, retry_backoff_from_config: 'none' } } },
    config: { x_page_size: 10 },
    prior: null,
    timeoutMs: null,
    keyProperty: '_id',
    keyColumn: 'source_id',
    coerceKey: (raw: unknown) => (raw == null ? null : raw),
    forced: false,
    targetEmpty: async () => false,
    preAcquisitionGate: () => ({ skip: false, reason: 'fresh' }),
    emitSkeleton: {},
    validatorCache: new Map(),
  };
}

const POINT = '{"type":"Point","coordinates":[0,0]}';

describe('R-DX (i) — the geometry-less CKAN arm', () => {
  it('T1: under guards.srid "none" every record is kept, geojson null, null_geometry_count 0 (flips at RE-FREEZE #37)', async () => {
    const { fetchImpl } = fakeCkan({ R: [{ _id: 'a', geometry: null }, { _id: 'b' }] });
    const r = await acquireLib.acquireExternal(armArgs(ckanExternal('p', 'R'), fetchImpl, { srid: 'none' }));
    expect(r.acquired.feature_count).toBe(2);
    expect(r.acquired.null_geometry_count).toBe(0);
    expect(r.features.map((f: { geojson: unknown }) => f.geojson)).toEqual([null, null]);
    expect(r.acquired.rows_parsed).toBe(r.acquired.feature_count + r.acquired.bad_key_count);
  });

  it('T2 (GREEN pin): with a declared SRID the arm is byte-identical — a null-geometry record is dropped and counted', async () => {
    const { fetchImpl } = fakeCkan({ R: [{ _id: 'a', geometry: null }, { _id: 'b', geometry: POINT }] });
    const r = await acquireLib.acquireExternal(armArgs(ckanExternal('p', 'R'), fetchImpl, { srid: 4326 }));
    expect(r.acquired.feature_count).toBe(1);
    expect(r.acquired.null_geometry_count).toBe(1);
    expect(r.features[0].geojson).toBe(POINT);
  });
});

/** A minimal no-geometry CKAN INGESTOR: one write target `tc`, keyed on source_id. */
function ckanIngestor(externals: Array<Record<string, unknown>>): Record<string, any> {
  return {
    identity: { name: 'x_ckan', archetype: 'INGESTOR', spec_version: '1.0' },
    inputs: { reads: { externals, tables: [] } },
    outputs: {
      writes: [{
        table: 'tc',
        key: 'source_id',
        key_sql_type: 'TEXT',
        columns: [{ name: 'source_id', written: 'step' }, { name: 'name', written: 'step' }],
        write_discipline: { class: 'guarded_upsert', guard: 'is_distinct_from', guard_columns: 'all_declared', scope: 'none' },
        retract: 'none',
      }],
    },
    // a multi-primary step keeps one emit sub-block per primary id (0x B6); a single primary declares none
    emits: [{ key: 'k', type: 'object', skeleton: externals.some((e) => typeof e.target === 'string') ? Object.fromEntries(externals.map((e) => [String(e.id), {}])) : 'none', consumers: [] }],
    staleness: { trigger: 'none', on_prior_run_error: 'warn_row' },
    guards: { srid: 'none', requires: [] },
    execution: { shape: 'ingest', network: { timeout: '30s', retries: 0, retry_backoff_from_config: 'none' } },
    terminals: [],
    invariants: 'none',
    plausibility: 'none',
  };
}

const compute = {
  coerceKey: (raw: unknown) => (raw == null ? null : String(raw)),
  shapeRecord: (rec: Record<string, unknown>, ctx: { external_id?: string }) => ({ name: `${String(rec.name)}@${String(ctx.external_id)}` }),
  dedupeBySourceId: (rows: Array<Record<string, unknown>>) => {
    const seen = new Map<unknown, Record<string, unknown>>();
    let duplicateCount = 0;
    for (const r of rows) { if (seen.has(r.source_id)) duplicateCount++; else seen.set(r.source_id, r); }
    return { kept: [...seen.values()], duplicateCount };
  },
  shouldSkipDelete: () => false,
};

function memberAcquired(id: string, records: Array<Record<string, unknown>>) {
  return {
    tier1: { skip: false, reason: 'fresh' },
    tier2: { skip: false, reason: 'not_reached' },
    emitBlock: null,
    features: records.map((r) => ({ source_id: String(r._id), geojson: null, record: r })),
    acquired: { feature_count: records.length, rows_parsed: records.length, bad_key_count: 0, null_geometry_count: 0, source_dataset_version: VERSION, content_hash: null, member: id },
  };
}

function stubs(byId: Record<string, Array<Record<string, unknown>>>) {
  const acquire = vi.spyOn(acquireLib, 'acquireExternal').mockImplementation((async (a: { external: { id: string } }) => memberAcquired(a.external.id, byId[a.external.id] ?? [])) as (...args: unknown[]) => unknown);
  const exec = vi.spyOn(writeLib, 'executeWrite').mockImplementation((async (_p: unknown, a: { carried: unknown[] }) => ({ inserted: a.carried.length, updated: 0, deleted: 0, rows_scanned: a.carried.length, rows_changed: a.carried.length, unchanged: 0 })) as (...args: unknown[]) => unknown);
  return [
    acquire,
    exec,
    vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({ tc: { rls_enabled: true, bypassrls: true, policies: 0 } }),
    vi.spyOn(stalenessLib, 'readPriorEmitWithPosture').mockResolvedValue({ prior: null, error: null }),
    vi.spyOn(stalenessLib, 'detectInterruptedRetraction').mockResolvedValue({ interrupted: false }),
  ] as Array<{ mockRestore: () => void; mock?: { calls: unknown[][] } }>;
}

const fakePool = () => ({ query: async () => ({ rows: [] }), connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) });
const args = (descriptor: Record<string, unknown>) => ({
  descriptor, pool: fakePool(), compute, config: { x_page_size: 10 },
  fetchImpl: async () => { throw new Error('no network in this test'); },
  chainId: null, log: noopLog, tag: '[r-dx]', clockNow: new Date('2026-10-18T00:00:00Z'), preWriteGate: null,
});

describe('R-DX (ii)-(iv) — the runner forms', () => {
  let restored: Array<{ mockRestore: () => void }> = [];
  afterEach(() => { for (const s of restored.splice(0)) s.mockRestore(); vi.restoreAllMocks(); });

  it('T3: one targetless CKAN primary runs through runIngestPhase (0y Y4 deleted) (flips at RE-FREEZE #37)', async () => {
    restored = stubs({ p: [{ _id: '1', name: 'a' }] });
    const out = await stepLib.runIngestPhase(args(ckanIngestor([ckanExternal('p', 'R')])));
    expect(out.reason).toBe('loaded');
    expect(out.written.inserted).toBe(1);
  });

  it('T4: two primaries on ONE target are one union group: both acquired, deduplicated once across both, ONE write (flips at RE-FREEZE #37)', async () => {
    restored = stubs({ active: [{ _id: '1', name: 'a' }, { _id: '2', name: 'b' }], closed: [{ _id: '2', name: 'b2' }, { _id: '3', name: 'c' }] });
    const d = ckanIngestor([ckanExternal('active', 'RA', { target: 'tc' }), ckanExternal('closed', 'RC', { target: 'tc' })]);
    const out = await stepLib.ingestPrimaries(args(d));
    const acquireCalls = (acquireLib.acquireExternal as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const execCalls = (writeLib.executeWrite as unknown as { mock: { calls: Array<[unknown, { carried: Array<Record<string, unknown>> }]> } }).mock.calls;
    expect(acquireCalls).toHaveLength(2);
    expect(execCalls).toHaveLength(1);
    expect(execCalls[0]![1].carried.map((r) => r.source_id).sort()).toEqual(['1', '2', '3']);
    // shapeRecord was handed the member id (the record is tagged with it)
    expect(execCalls[0]![1].carried.find((r) => r.source_id === '1')!.name).toBe('a@active');
    expect(out.acquired.primaries.active.outcome).toBe('loaded');
    expect(out.acquired.primaries.closed.outcome).toBe('loaded');
    expect(out.written.by_target.tc.inserted).toBe(3);
  });

  it('T5: externals[].modes — a "full" member is skipped on an incremental run (selected:false, reason "mode"), acquired on a full run, and the run mode is stamped (flips at RE-FREEZE #37)', async () => {
    const d = ckanIngestor([ckanExternal('active', 'RA', { target: 'tc' }), ckanExternal('closed', 'RC', { target: 'tc', modes: ['full'] })]);
    // the schema admits the field
    const schemaOk = (() => { try { validateLib.compileStepSchema(validateLib.loadSchema()); return true; } catch { return false; } })();
    expect(schemaOk).toBe(true);
    expect(JSON.stringify(validateLib.loadSchema())).toContain('"modes"');
    restored = stubs({ active: [{ _id: '1', name: 'a' }], closed: [{ _id: '9', name: 'z' }] });
    const inc = await stepLib.ingestPrimaries(args(d));
    expect((acquireLib.acquireExternal as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(1);
    expect(inc.acquired.primaries.closed).toEqual({ selected: false, reason: 'mode', target: 'tc' });
    expect(inc.run_mode).toBe('incremental');
    for (const s of restored.splice(0)) s.mockRestore();
    restored = stubs({ active: [{ _id: '1', name: 'a' }], closed: [{ _id: '9', name: 'z' }] });
    restored.push(vi.spyOn(stalenessLib, 'resolveOverrides').mockReturnValue(Object.freeze({ force_run: false, force_full: true, dry_run: false })));
    const full = await stepLib.ingestPrimaries(args(d));
    expect((acquireLib.acquireExternal as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(2);
    expect(full.run_mode).toBe('full');
    expect(stepLib.resolveRunMode({ overrides: { force_full: false }, interrupted: false, argv: [] })).toBe('incremental');
    expect(stepLib.resolveRunMode({ overrides: { force_full: false }, interrupted: true, argv: [] })).toBe('full');
    expect(stepLib.resolveRunMode({ overrides: { force_full: false }, interrupted: false, argv: ['--full'] })).toBe('full');
  });

  it('T5b: a single targetless primary that declares modes stamps run_mode when selected and refuses (0x U2) when not', async () => {
    restored = stubs({ p: [{ _id: '1', name: 'a' }] });
    const inc = await stepLib.runIngestPhase(args(ckanIngestor([ckanExternal('p', 'R', { modes: ['incremental'] })])));
    expect(inc.run_mode).toBe('incremental');
    expect(inc.reason).toBe('loaded');
    await expect(stepLib.runIngestPhase(args(ckanIngestor([ckanExternal('p', 'R', { modes: ['full'] })])))).rejects.toThrow(/0x U2/);
  });

  it('T7: a union group keeps each member\'s own truth (0x per-primary form; #33 schema_drift per external id): its dataset version, its header, and a header drift checked against its OWN baseline', async () => {
    restored = stubs({});
    restored.shift()!.mockRestore();
    restored.unshift(vi.spyOn(acquireLib, 'acquireExternal').mockImplementation((async (a: { external: { id: string } }) => {
      const id = a.external.id;
      const m = memberAcquired(id, [{ _id: id === 'active' ? '1' : '2', name: id }]);
      return { ...m, acquired: { ...m.acquired, source_dataset_version: `v-${id}`, record_fields: id === 'active' ? ['_id', 'name'] : ['_id', 'name', 'added'] } };
    }) as (...args: unknown[]) => unknown));
    const d = ckanIngestor([ckanExternal('active', 'RA', { target: 'tc' }), ckanExternal('closed', 'RC', { target: 'tc' })]);
    d.guards.schema_drift = 'warn';
    const out = await stepLib.ingestPrimaries({ ...args(d), schemaDriftBaseline: { found: true, fields: { active: ['_id', 'name'], closed: ['_id', 'name'] } } });
    expect(out.acquired.primaries.active.source_dataset_version).toBe('v-active');
    expect(out.acquired.primaries.closed.source_dataset_version).toBe('v-closed');
    expect(out.acquired.primaries.active.record_fields).toEqual(['_id', 'name']);
    expect(out.acquired.primaries.closed.record_fields).toEqual(['_id', 'name', 'added']);
    const rows = (out.schemaDrift as Array<{ external: string; row: { status: string } }>).map((x) => `${x.external}:${x.row.status}`).sort();
    expect(rows).toEqual(['active:INFO', 'closed:WARN']);
  });

  it('T6: a union group whose members disagree on key property (or format) is refused by name, before any I/O; a group with zero selected members too (flips at RE-FREEZE #37)', async () => {
    restored = stubs({});
    const keyMismatch = ckanIngestor([ckanExternal('a', 'RA', { target: 'tc' }), ckanExternal('b', 'RB', { target: 'tc', key_property: 'other_id' })]);
    await expect(stepLib.ingestPrimaries(args(keyMismatch))).rejects.toThrow(/0x U1/);
    const noneSelected = ckanIngestor([ckanExternal('a', 'RA', { target: 'tc', modes: ['full'] }), ckanExternal('b', 'RB', { target: 'tc', modes: ['full'] })]);
    await expect(stepLib.ingestPrimaries(args(noneSelected))).rejects.toThrow(/0x U2/);
    expect((acquireLib.acquireExternal as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(0);
  });
});
