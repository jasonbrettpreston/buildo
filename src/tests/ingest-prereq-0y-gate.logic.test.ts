// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A19 (0y; RE-FREEZE #30, logged in 122 §8)
//
// INGESTOR prerequisite 0y (part C) — THE ALL-PRIMARIES CKAN GATE.
//
// 0x taught `ingestPrimaries` to drive ONE `runIngestPhase` per bound primary, each gating
// ALONE against its own `emits[0].skeleton[<id>]` sub-block. Zoning's frozen §9 contract has
// no per-primary sub-block: its per-layer versions are STRINGS under one top-level key, and
// legacy `load-zoning.js` decides ONCE, before any fetch:
//
//     const skip = storedVersion && decisions.every(skip);          // load-zoning.js:598-601
//
// 0y moves that decision into the LIBRARY as `staleness.skip_scope:"all_primaries"`: ONE
// `pipeline_runs` prior read, ONE `package_show` (`validatorCache`, GR-5d), ONE
// `allPrimariesDecision` over N primaries, and — on a skip — ONE re-emit of the prior run's
// top-level contract keys (`layer_versions`, `layers_loaded`; the runner writes `audit_table`
// itself). This file locks that gate's contract (plan §3c/§3d):
//
//   - T9  RED all-unchanged ⇒ SKIP: no datastore GET, ONE package_show, no write, and a
//          `skipEmitMeta` that is EXACTLY the DERIVED re-emit keys (O-A3), never `audit_table`;
//   - T10 RED one changed ⇒ LOAD all three: `step_gate.decisions` per id (GR-5a), the aggregate
//          `reason` ("changed", O-A1), the WHOLE prior meta on `prior`, `no_pre_acquisition_trigger`
//          on every narrowed call, ONE package_show, and ONE shared `validatorCache` Map (GR-5d);
//   - T11 RED max-age (F-M4 through `allPrimariesDecision`, G4): a stored version older than the
//          730-day arm ⇒ `cache_stale_force_reload` ⇒ LOAD; a missing max-age variable throws
//          `/forceReloadMaxAgeDays/` by name;
//   - T12 RED no baseline / incomplete prior (O-A3, G4): no prior ⇒ `no_prior_version` ⇒ LOAD; a
//          prior without `layer_versions` ⇒ LOAD; a prior MISSING one primary's key ⇒ that decision
//          `no_prior_version` and the run LOADs (assert the ACQUISITION, not just the reason);
//          `layer_versions` present without `layers_loaded` ⇒ `prior_contract_incomplete` ⇒ LOAD;
//          `layers_loaded` null or wrong-typed ⇒ `prior_contract_incomplete` ⇒ LOAD;
//   - T12b RED (HAZARD lock): a prior whose `layer_versions.ov_a` is `null` ⇒ `allPrimariesDecision`
//          LOADs (`ov_a` decision `no_prior_version`);
//   - T13 RED forced (GR-5b): `override.force_run` ⇒ LOAD all with `reason:"force_run"` and
//          `skip:false`, but the per-primary decisions are STILL computed (`unchanged` where the
//          versions match);
//   - T14 RED refusals: `0y Y1`–`0y Y3` via `ingestPrimaries` (binder, before any I/O); `0y Y4`/
//          `0y Y5` via the EXPORTED `runIngestPhase` (before :1143, so `pool.query` stays 0×);
//   - T15 PIN (0x unchanged, G1): the heritage-shaped `per_primary` descriptor still refuses B6 and
//          still skips per primary, and a full `per_primary` run's `records_meta.gate` carries
//          EXACTLY `["reason","gated_skip"]` (19′/26′ spread `{}` when `step_gate` is absent);
//   - T16 RED B6 relaxed (G2): Z3 binds with `emits[0].skeleton` ABSENT and with `emits:"none"`,
//          the `:732` narrowing does not throw, an id colliding with an object-skeleton top-level
//          key is refused by name, and `skip_scope` deleted refuses at M4 (AJV) AND at B6.
//
// Every RED assertion below fails TODAY for the stated reason and NOT because of a typo:
//   - `staleness.allPrimariesDecision` does not exist (T11/T12/T12b: "not a function");
//   - `ingestPrimaries` ignores `skip_scope` entirely (T9/T10/T12/T13: no `step_gate`, no skip);
//   - `multiPrimaryBinding` does not know Y1–Y3 and B6 still fires under `all_primaries` (T14/T16);
//   - `runIngestPhase` has no Y4/Y5 refusals (T14: no `/0y Y4/`, `/0y Y5/`).
// T15 is the half that PASSES today and must keep passing after the implementation.
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

const PACKAGE_URL = 'https://ex/api/3/action/package_show?id=p';
const DATASTORE_URL = 'https://ex/api/3/action/datastore_search';
const MAX_AGE_VAR = 'load_zoning_force_reload_max_age_days';
const PAGE_SIZE_VAR = 'load_zoning_datastore_page_size';

/** The clock every CKAN test runs against (§3c: `nowMs` keeps millisecond precision). */
const NOW = new Date('2026-09-29T00:00:00Z');

/** A `package_show` HTTP-date version `days` before `NOW` (a stored version's timestamp). */
const versionDaysAgo = (days: number): string => new Date(NOW.getTime() - days * 86400000).toUTCString();

/**
 * The fake pool every test shares. The PRIOR read is routed on `SELECT records_meta FROM
 * pipeline_runs` (I-A5), NEVER on the `status='completed'` literal, because witness-unblock
 * C3 rewrites that literal; the interrupted-retraction query is routed on the CTE name
 * `own_last_completed` (staleness.js:410), and answers "nothing interrupted" unless the test
 * says otherwise. `logic_variables` answers the config resolver, `SELECT NOW()` the clock,
 * `INSERT INTO pipeline_runs` the ledger row, and `INSERT INTO <table>` the guarded upsert's
 * `is_insert` RETURNING.
 */
function fakePool(opts: {
  priorMeta?: Record<string, unknown> | null;
  interrupted?: Record<string, unknown> | null;
  tables?: string[];
} = {}) {
  const calls: Array<{ text: string; params: unknown[] | undefined }> = [];
  const tables = opts.tables ?? ['tbase', 'tov_a', 'tov_b'];
  const tablesAlt = tables.map((t) => t.replace(/^t/, '')).join('|');
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
    if (text.includes('own_last_completed')) {
      return opts.interrupted ? { rows: [opts.interrupted] } : { rows: [] };
    }
    if (/SELECT records_meta FROM pipeline_runs/i.test(text)) {
      return { rows: opts.priorMeta ? [{ records_meta: opts.priorMeta }] : [] };
    }
    if (/SELECT NOW\(\) AS now/i.test(text)) return { rows: [{ now: NOW }] };
    if (new RegExp(`INSERT INTO (${tablesAlt})\\b`, 'i').test(text)) return { rows: [{ is_insert: true }] };
    return { rows: [] };
  };
  const record = async (text: string, params?: unknown[]) => { calls.push({ text, params }); return answer(text); };
  return {
    calls, query: record,
    connect: async () => ({ query: record, release: () => {} }),
  };
}

/** The resolved config the runner threads to compute — the seed defaults for ravine's vars. */
function seedConfig(): Record<string, number> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the committed seed registry
  const seed = require(join(process.cwd(), 'scripts/seeds/logic_variables.json')) as Record<string, { default: number }>;
  const out: Record<string, number> = {};
  for (const v of (LOAD_RAVINES.config.logic_variables as Array<{ name: string }>)) out[v.name] = seed[v.name]!.default;
  return out;
}

/** The CKAN config: the page size + the 730-day force-reload window the gate reads by name. */
function ckanConfig(overrides: Record<string, number | undefined> = {}): Record<string, number> {
  const base: Record<string, number> = {
    ...seedConfig(),
    [PAGE_SIZE_VAR]: 2,
    [MAX_AGE_VAR]: 730,
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete base[k];
    else base[k] = v;
  }
  return base;
}

/**
 * Fixture `Z3` (§4) — the zoning-shaped clone of the 0x `H2` fixture: three `ckan_datastore`
 * primaries `base`/`ov_a`/`ov_b` sharing ONE `package_url`, three targets, the trigger from
 * §3e (GR-5c: `emit_key:"layer_versions"`, Z3's OWN emit), `skip_scope:"all_primaries"`,
 * `recovery.interrupted:"force_full_on_next_run"`, `execution.shape:"ingest"`, and an `emits[]`
 * of `layer_versions`/`layers_loaded`/`audit_table` with NO per-id skeleton (I-A3).
 *
 * The write shape follows the committed ravines write (a keyed target the shared
 * `ravineCompute.dedupeBySourceId`/`coerceKey` understand) with `guards.srid:"none"` and no
 * `wkb_geometry` column, so the CKAN arm's shaped features flow to `executeWrite` (stubbed)
 * without a geometry pass.
 */
function Z3(): Record<string, any> {
  const external = (id: string, onFailure?: string) => ({
    id,
    kind: 'http_api',
    format: 'ckan_datastore',
    url: DATASTORE_URL,
    ckan: {
      resource_id: `R${id}`,
      package_url: PACKAGE_URL,
      page_size_from_config: PAGE_SIZE_VAR,
    },
    key_property: '_id',
    target: `t${id}`,
    ...(onFailure ? { on_failure: onFailure } : {}),
  });

  const d = clone(LOAD_RAVINES) as unknown as Record<string, any>;
  d.identity = {
    ...d.identity,
    name: 'load_zoning',
    display_name: 'Zoning By-law',
    archetype: 'INGESTOR',
    spec: '58',
    spec_version: '1.0',
  };
  d.inputs = {
    ...d.inputs,
    reads: {
      steps: [],
      tables: [],
      externals: [external('base'), external('ov_a', 'warn_row_continue'), external('ov_b', 'warn_row_continue')],
    },
  };
  d.outputs = {
    ...d.outputs,
    writes: ['tbase', 'tov_a', 'tov_b'].map((table) => ({
      table,
      key: 'source_id',
      key_sql_type: 'BIGINT',
      columns: [
        { name: 'source_id', vocabulary: 'none', written: 'step', bind: 'value' },
        { name: 'source_dataset_version', vocabulary: 'none', written: 'step', bind: 'value' },
      ],
      write_discipline: {
        class: 'upsert_scoped_departure_delete',
        guard: 'is_distinct_from',
        guard_columns: ['source_dataset_version'],
        scope: 'none',
        expected_change_ratio: '<= 0.5',
        idempotent_rerun: 'zero_writes',
        txn_scope: 'step',
        why: { text: 'One guarded upsert per declared target.', liveness: { kind: 'table', ref: table } },
      },
      retract: 'departed',
    })),
    invalidates: [],
    write_inventory: {
      statements: 3,
      why: { text: 'One guarded upsert per declared target.', liveness: { kind: 'file', ref: 'scripts/lib/step/write.js' } },
    },
  };
  d.staleness = {
    ...d.staleness,
    trigger: [{
      signal: 'source_validator',
      position: 'pre_acquisition',
      style: 'ckan_metadata',
      emit_key: 'layer_versions',
      max_age_days_from_config: MAX_AGE_VAR,
    }],
    skip_scope: 'all_primaries',
    mode_select: 'skip',
    logic_version: 'none',
    on_prior_run_error: 'fail_step',
  };
  d.guards = { requires: [], srid: 'none', empty_source: 'none', schema_drift: 'pause' };
  d.execution = { ...d.execution, shape: 'ingest' };
  d.emits = [
    { key: 'layer_versions', type: 'object', consumers: [] },
    { key: 'layers_loaded', type: 'object', consumers: [] },
    { key: 'audit_table', type: 'object', consumers: [] },
  ];
  d.recovery = { ...d.recovery, interrupted: 'force_full_on_next_run' };
  d.invariants = 'none';
  d.plausibility = 'none';
  d.override = 'none';
  d.config = {
    ...d.config,
    logic_variables: [
      { name: PAGE_SIZE_VAR, min: 1, max: 32000, on_invalid: 'fail' },
      { name: MAX_AGE_VAR, min: 1, max: 3650, on_invalid: 'fail' },
    ],
  };
  return d;
}

/**
 * The fake CKAN server: serves `package_show` (a resource list with per-resource versions) and
 * paged `datastore_search` (each page carrying `result.total`), and records EVERY url — so
 * "0 datastore GETs", "exactly 1 package_show" and pagination are all assertable. A HEAD to the
 * bare datastore endpoint answers 200 (the CKAN arm replaces the HEAD validators with
 * `package_show`, but a pre-15′ tree still HEADs).
 */
function fakeFetch(opts: {
  versions?: Record<string, string | null>;
  recordsByResource?: Record<string, Array<Record<string, unknown>>>;
} = {}) {
  const versions = opts.versions
    ?? { Rbase: versionDaysAgo(2), Rov_a: versionDaysAgo(2), Rov_b: versionDaysAgo(2) };
  const recordsByResource = opts.recordsByResource ?? {
    Rbase: [{ _id: 1, geometry: '{"type":"Point","coordinates":[0,0]}' }],
    Rov_a: [{ _id: 2, geometry: '{"type":"Point","coordinates":[0,0]}' }],
    Rov_b: [{ _id: 3, geometry: '{"type":"Point","coordinates":[0,0]}' }],
  };
  const urls: string[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: { method?: string }) => {
    urls.push(url);
    if (url.startsWith(PACKAGE_URL)) {
      return new Response(JSON.stringify({
        success: true,
        result: {
          metadata_modified: versions.Rbase ?? null,
          resources: Object.entries(versions).map(([id, last_modified]) => ({ id, last_modified })),
        },
      }), { status: 200, statusText: '200' });
    }
    if (url.startsWith(DATASTORE_URL)) {
      if (init?.method === 'HEAD') return new Response(null, { status: 200, statusText: '200' });
      const q = new URL(url).searchParams;
      const resourceId = q.get('resource_id') ?? '';
      const limit = Number(q.get('limit'));
      const offset = Number(q.get('offset'));
      const all = recordsByResource[resourceId] ?? [];
      return new Response(JSON.stringify({
        success: true,
        result: { records: all.slice(offset, offset + limit), total: all.length, limit, offset },
      }), { status: 200, statusText: '200' });
    }
    throw new Error(`fakeFetch: unexpected url ${url}`);
  });
  return {
    fetchImpl,
    urls,
    // A datastore GET carries the query string; a HEAD hit answers `/datastore_search` exactly,
    // so the query-string filter separates the two without counting a HEAD as a page fetch.
    datastoreGets: () => urls.filter((u) => u.startsWith(`${DATASTORE_URL}?`)),
    packageShows: () => urls.filter((u) => u.startsWith(PACKAGE_URL)),
  };
}

/** The prior `records_meta`: `layer_versions` (id → version string) + `layers_loaded`. */
function priorMeta(
  versions: Record<string, string | null>,
  loaded: unknown = { base: true, ov_a: true, ov_b: true },
) {
  return { layer_versions: versions, layers_loaded: loaded };
}

/**
 * The stub set: the prior read is routed through `readPriorEmitWithPosture` (so the caller can
 * hand back the WHOLE prior meta — the `emitKey:null` read I-A5 mandates), and the write seams
 * are stubbed. `acquireExternal` is NOT stubbed: the REAL CKAN arm runs so its args — including
 * the shared `validatorCache` Map — are assertable (GR-5d).
 */
function stubs(prior: Record<string, unknown> | null) {
  return [
    vi.spyOn(acquireLib, 'acquireExternal'),
    vi.spyOn(stalenessLib, 'readPriorEmitWithPosture')
      .mockResolvedValue({ prior, error: null }),
    vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({
      tbase: { rls_enabled: true, bypassrls: true, policies: 0 },
      tov_a: { rls_enabled: true, bypassrls: true, policies: 0 },
      tov_b: { rls_enabled: true, bypassrls: true, policies: 0 },
    }),
    vi.spyOn(writeLib, 'executeWrite').mockResolvedValue({
      inserted: 1, updated: 0, deleted: 0, rows_scanned: 1, rows_changed: 1, unchanged: 0,
    }),
  ] as Array<{ mockRestore: () => void }>;
}

/** One `ingestPrimaries` call against the stubbed seams, with the real CKAN arm. */
async function callPrimaries(
  descriptor: Record<string, unknown>,
  opts: { pool?: ReturnType<typeof fakePool>; fetchImpl?: unknown; config?: Record<string, number>; extra?: Record<string, unknown> } = {},
) {
  return stepLib.ingestPrimaries({
    descriptor,
    pool: opts.pool ?? fakePool(),
    compute: ravineCompute,
    config: opts.config ?? ckanConfig(),
    fetchImpl: opts.fetchImpl ?? (async () => { throw new Error('the gate must not reach the network in this test'); }),
    chainId: null,
    log: noopLog,
    tag: '[0y]',
    clockNow: NOW,
    preWriteGate: null,
    ...(opts.extra ?? {}),
  });
}

/** The spy on the REAL `acquireExternal`, narrowed for assertions. */
const acquireSpy = () => acquireLib.acquireExternal as unknown as {
  mock: { calls: Array<[Record<string, any>]>; invocationCallOrder: number[] };
};

/** Call `staleness.allPrimariesDecision` directly (T12b) with Z3's declared contract. */
function decisionFor(prior: Record<string, unknown> | null, opts: {
  config?: Record<string, number>;
  versions?: Record<string, string | null>;
  forced?: boolean;
} = {}) {
  const trigger = (Z3().staleness.trigger as Array<Record<string, unknown>>)[0]!;
  const versions = opts.versions ?? { Rbase: versionDaysAgo(2), Rov_a: versionDaysAgo(2), Rov_b: versionDaysAgo(2) };
  const validatorsById: Record<string, { lastModified: string | null; etag: null }> = {
    base: { lastModified: versions.Rbase ?? null, etag: null },
    ov_a: { lastModified: versions.Rov_a ?? null, etag: null },
    ov_b: { lastModified: versions.Rov_b ?? null, etag: null },
  };
  return stalenessLib.allPrimariesDecision({
    primaries: [{ id: 'base' }, { id: 'ov_a' }, { id: 'ov_b' }],
    triggerFor: () => trigger,
    validatorsById,
    priorMeta: prior,
    config: opts.config ?? ckanConfig(),
    nowMs: NOW.getTime(),
    forced: opts.forced ?? false,
    reemitKeys: ['layer_versions', 'layers_loaded'],
    emitTypes: { layer_versions: 'object', layers_loaded: 'object' },
  }) as { skip: boolean; reason: string; decisions: Record<string, { skip: boolean; reason: string }> };
}

describe('INGESTOR prerequisite 0y — the all-primaries CKAN gate', () => {
  let restored: Array<{ mockRestore: () => void }> = [];
  afterEach(() => {
    for (const s of restored.splice(0)) s.mockRestore();
  });

  // =========================================================================
  // T9 — ALL UNCHANGED ⇒ SKIP. The prior meta holds the package's own three
  // versions, so every decision is `unchanged` and no primary is acquired: ZERO
  // datastore GETs, exactly ONE `package_show`, ZERO writes. The skip re-emits
  // EXACTLY the DERIVED keys (O-A3) and never `audit_table`.
  // =========================================================================
  it('0y-T9 — all three versions unchanged ⇒ skip with no datastore GET, one package_show, and exactly the derived re-emit keys', async () => {
    const versions = { Rbase: versionDaysAgo(2), Rov_a: versionDaysAgo(2), Rov_b: versionDaysAgo(2) };
    const preceding = priorMeta({ base: versions.Rbase, ov_a: versions.Rov_a, ov_b: versions.Rov_b });
    const f = fakeFetch({ versions });
    const pool = fakePool();
    restored = stubs(preceding);

    const out = await callPrimaries(Z3(), { pool, fetchImpl: f.fetchImpl }) as {
      skipped: boolean;
      signal: string;
      prior: unknown;
      skipEmitMeta: Record<string, unknown>;
    };

    expect(out.skipped, 'every primary is unchanged, so the whole step skips').toBe(true);
    expect(out.signal).toBe('source_validator');
    expect(f.datastoreGets(), 'a skip never reaches the datastore — nothing is downloaded').toHaveLength(0);
    expect(f.packageShows(), 'ONE package_show decides for all primaries (validatorCache)').toHaveLength(1);
    expect(writeLib.executeWrite, 'no write txn opens on a skip').toHaveBeenCalledTimes(0);
    expect(acquireSpy().mock.calls, 'no narrowed runIngestPhase call is made on a skip').toHaveLength(0);

    expect(out.skipEmitMeta, 'the skip re-emits the prior top-level contract keys, by value').toEqual({
      layer_versions: preceding.layer_versions,
      layers_loaded: preceding.layers_loaded,
    });
    expect(
      Object.keys(out.skipEmitMeta).sort(),
      'EXACTLY the DERIVED re-emit keys — never `audit_table` (the runner writes that itself, O-A3)',
    ).toEqual(['layer_versions', 'layers_loaded']);
    expect('audit_table' in out.skipEmitMeta).toBe(false);
  });

  // =========================================================================
  // T10 — ONE CHANGED (ov_b) ⇒ LOAD ALL THREE. The step gate names each primary's
  // decision (GR-5a) and the aggregate reason is `changed` (O-A1); the aggregate
  // `prior` is the WHOLE prior meta; each narrowed call reuses the same
  // `validatorCache` Map (identity, GR-5d) and reports `no_pre_acquisition_trigger`
  // because the per-primary narrowing dropped the step-level trigger.
  // =========================================================================
  it('0y-T10 — ov_b changed ⇒ load all three, per-id decisions, whole prior, one shared validatorCache', async () => {
    const stuck = versionDaysAgo(2);
    const moved = versionDaysAgo(1);
    const versions = { Rbase: stuck, Rov_a: stuck, Rov_b: moved };
    const preceding = priorMeta({ base: stuck, ov_a: stuck, ov_b: versionDaysAgo(9) });
    const f = fakeFetch({ versions });
    restored = stubs(preceding);

    const out = await callPrimaries(Z3(), { fetchImpl: f.fetchImpl }) as {
      skipped: boolean;
      reason: string;
      prior: unknown;
      acquired: {
        step_gate: {
          scope: string;
          reason: string;
          decisions: Record<string, { skip: boolean; reason: string }>;
        };
        primaries: Record<string, { outcome: string }>;
      };
      written: { by_target: Record<string, unknown> };
    };

    expect(out.skipped, 'one changed primary loads the whole step').toBe(false);
    expect(out.acquired.step_gate.scope).toBe('all_primaries');
    expect(out.acquired.step_gate.decisions, 'one decision per primary (GR-5a)').toEqual({
      base: { skip: true, reason: 'unchanged' },
      ov_a: { skip: true, reason: 'unchanged' },
      ov_b: { skip: false, reason: 'changed' },
    });
    expect(out.acquired.step_gate.reason, 'the aggregate reason follows the O-A1 precedence').toBe('changed');
    expect(out.reason).toBe('changed');
    expect(out.prior, 'the aggregate `prior` is the WHOLE prior meta, not a sub-block').toBe(preceding);

    expect(acquireSpy().mock.calls, 'each primary is acquired exactly once').toHaveLength(3);
    expect(writeLib.executeWrite, 'each primary writes its own transaction').toHaveBeenCalledTimes(3);
    expect(Object.keys(out.written.by_target).sort()).toEqual(['tbase', 'tov_a', 'tov_b']);
    for (const id of ['base', 'ov_a', 'ov_b']) expect(out.acquired.primaries[id]!.outcome).toBe('loaded');

    for (const call of acquireSpy().mock.calls) {
      const gate = call[0].preAcquisitionGate;
      expect(gate, 'every narrowed call stages a pre-acquisition gate').toBeTypeOf('function');
      expect(
        gate({ lastModified: null, etag: null }).reason,
        'the step-level trigger was dropped by the per-primary narrowing',
      ).toBe('no_pre_acquisition_trigger');
    }

    expect(f.packageShows(), 'the shared validatorCache means ONE package_show for three primaries').toHaveLength(1);
    const caches = acquireSpy().mock.calls.map((c) => c[0].validatorCache);
    expect(caches[0], 'every narrowed call is handed a validatorCache Map (GR-5d)').toBeInstanceOf(Map);
    expect(caches[1], 'the SAME Map instance, not a fresh one per call').toBe(caches[0]);
    expect(caches[2]).toBe(caches[0]);
  });

  // =========================================================================
  // T11 — MAX-AGE (F-M4 through `allPrimariesDecision`, G4). A stored version older
  // than the configured 730-day window forces the load with `cache_stale_force_reload`,
  // and a missing/non-finite max-age variable throws by name.
  // =========================================================================
  it('0y-T11 — a stored version older than the 730-day arm ⇒ cache_stale_force_reload ⇒ load all', async () => {
    const stale = versionDaysAgo(800);
    const fresh = versionDaysAgo(2);
    const versions = { Rbase: fresh, Rov_a: fresh, Rov_b: fresh };
    const preceding = priorMeta({ base: stale, ov_a: fresh, ov_b: fresh });
    const f = fakeFetch({ versions });
    restored = stubs(preceding);

    const out = await callPrimaries(Z3(), { fetchImpl: f.fetchImpl }) as {
      skipped: boolean;
      reason: string;
      acquired: { step_gate: { reason: string; dataset_version_age_days: number | null } };
    };

    expect(out.skipped, 'a version past the force-reload window loads even when the metadata matches').toBe(false);
    expect(out.acquired.step_gate.reason, 'the aggregate reason is the stale-cache arm (O-A1)').toBe('cache_stale_force_reload');
    expect(out.reason).toBe('cache_stale_force_reload');
    expect(
      out.acquired.step_gate.dataset_version_age_days,
      'the age of the OLDEST stored version is reported (O-A2)',
    ).toBeGreaterThan(730);
  });

  it('0y-T11 — a missing max-age variable throws /forceReloadMaxAgeDays/ by name', async () => {
    const fresh = versionDaysAgo(2);
    const preceding = priorMeta({ base: fresh, ov_a: fresh, ov_b: fresh });
    const f = fakeFetch({ versions: { Rbase: fresh, Rov_a: fresh, Rov_b: fresh } });
    restored = stubs(preceding);

    await expect(
      callPrimaries(Z3(), { fetchImpl: f.fetchImpl, config: ckanConfig({ [MAX_AGE_VAR]: undefined }) }),
      'the force-reload window is a visible parameter, never a hidden default',
    ).rejects.toThrow(/forceReloadMaxAgeDays/);
  });

  // =========================================================================
  // T12 — NO BASELINE / INCOMPLETE PRIOR (O-A3, G4). Every direction is fail-safe
  // LOAD: no prior, no `layer_versions`, a missing primary key, or a violated
  // re-emit contract (`prior_contract_incomplete`).
  // =========================================================================
  it('0y-T12 — no prior row ⇒ no_prior_version ⇒ LOAD (assert the acquisition, not just the reason)', async () => {
    const f = fakeFetch();
    const pool = fakePool();
    restored = stubs(null);

    const out = await callPrimaries(Z3(), { pool, fetchImpl: f.fetchImpl }) as {
      skipped: boolean;
      reason: string;
      acquired: { step_gate: { decisions: Record<string, { reason: string }> } };
    };

    expect(out.skipped).toBe(false);
    expect(out.acquired.step_gate.decisions.base!.reason).toBe('no_prior_version');
    expect(out.reason).toBe('no_prior_version');
    expect(acquireSpy().mock.calls, 'a missing baseline LOADs — every primary is acquired').toHaveLength(3);
  });

  it('0y-T12 — a prior without `layer_versions` ⇒ no_prior_version ⇒ LOAD', async () => {
    const f = fakeFetch();
    restored = stubs({ layers_loaded: { base: true, ov_a: true, ov_b: true } });

    const out = await callPrimaries(Z3(), { fetchImpl: f.fetchImpl }) as { skipped: boolean; reason: string };

    expect(out.skipped).toBe(false);
    expect(out.reason).toBe('no_prior_version');
    expect(acquireSpy().mock.calls).toHaveLength(3);
  });

  it("0y-T12 — a prior MISSING one primary's layer key ⇒ that decision is no_prior_version and the run LOADs", async () => {
    const fresh = versionDaysAgo(2);
    const f = fakeFetch({ versions: { Rbase: fresh, Rov_a: fresh, Rov_b: fresh } });
    // `layer_versions` names only base and ov_a: ov_b has no stored version.
    restored = stubs(priorMeta({ base: fresh, ov_a: fresh }));

    const out = await callPrimaries(Z3(), { fetchImpl: f.fetchImpl }) as {
      skipped: boolean;
      reason: string;
      acquired: {
        step_gate: { decisions: Record<string, { reason: string }> };
        primaries: Record<string, { outcome: string }>;
      };
    };

    expect(out.skipped, 'a primary with no stored version cannot be skipped').toBe(false);
    expect(out.acquired.step_gate.decisions.ov_b!.reason).toBe('no_prior_version');
    expect(out.reason).toBe('no_prior_version');
    expect(acquireSpy().mock.calls, 'the LOAD is asserted by the acquisition, not only by the reason').toHaveLength(3);
    expect(out.acquired.primaries.ov_b!.outcome).toBe('loaded');
  });

  it('0y-T12 — `layer_versions` present without `layers_loaded` ⇒ prior_contract_incomplete ⇒ LOAD', async () => {
    const fresh = versionDaysAgo(2);
    const f = fakeFetch({ versions: { Rbase: fresh, Rov_a: fresh, Rov_b: fresh } });
    restored = stubs({ layer_versions: { base: fresh, ov_a: fresh, ov_b: fresh } });

    const out = await callPrimaries(Z3(), { fetchImpl: f.fetchImpl }) as { skipped: boolean; reason: string };

    expect(out.skipped).toBe(false);
    expect(out.reason, 'a re-emitted key missing from the prior fails safe to LOAD (O-A3)').toBe('prior_contract_incomplete');
    expect(acquireSpy().mock.calls).toHaveLength(3);
  });

  it('0y-T12 — `layers_loaded` present but null ⇒ prior_contract_incomplete ⇒ LOAD', async () => {
    const fresh = versionDaysAgo(2);
    const f = fakeFetch({ versions: { Rbase: fresh, Rov_a: fresh, Rov_b: fresh } });
    restored = stubs({ layer_versions: { base: fresh, ov_a: fresh, ov_b: fresh }, layers_loaded: null });

    const out = await callPrimaries(Z3(), { fetchImpl: f.fetchImpl }) as { skipped: boolean; reason: string };

    expect(out.skipped).toBe(false);
    expect(out.reason).toBe('prior_contract_incomplete');
    expect(acquireSpy().mock.calls).toHaveLength(3);
  });

  it('0y-T12 — `layers_loaded` present with the wrong type ⇒ prior_contract_incomplete ⇒ LOAD', async () => {
    const fresh = versionDaysAgo(2);
    const f = fakeFetch({ versions: { Rbase: fresh, Rov_a: fresh, Rov_b: fresh } });
    // The emit declares `layers_loaded` as an OBJECT; a string is the declared contract broken.
    restored = stubs({ layer_versions: { base: fresh, ov_a: fresh, ov_b: fresh }, layers_loaded: 'yes' });

    const out = await callPrimaries(Z3(), { fetchImpl: f.fetchImpl }) as { skipped: boolean; reason: string };

    expect(out.skipped).toBe(false);
    expect(out.reason).toBe('prior_contract_incomplete');
    expect(acquireSpy().mock.calls).toHaveLength(3);
  });

  // =========================================================================
  // T12b — (HAZARD lock). A prior whose `layer_versions.ov_a` is NULL must LOAD
  // (`no_prior_version`): legacy load-zoning.js:686/690 records a FAILED overlay's
  // version, so the next all-primaries run must not skip that layer. RED today:
  // `allPrimariesDecision` does not exist.
  // =========================================================================
  it('0y-T12b — a null layer version ⇒ allPrimariesDecision LOADs that primary (no_prior_version)', () => {
    const fresh = versionDaysAgo(2);
    const decision = decisionFor(priorMeta({ base: fresh, ov_a: null, ov_b: fresh }));

    expect(decision.skip, 'a null stored version is not a baseline').toBe(false);
    expect(decision.decisions.ov_a!.reason, 'null ⇒ no_prior_version ⇒ LOAD (fail-safe, G4)').toBe('no_prior_version');
    expect(decision.decisions.base!.reason).toBe('unchanged');
    expect(decision.decisions.ov_b!.reason).toBe('unchanged');
  });

  // =========================================================================
  // T13 — FORCED (GR-5b). A standing `override.force_run` loads every primary, the
  // top-level reason is `force_run`, and the per-primary decisions are STILL
  // computed (`unchanged` where the versions match).
  // =========================================================================
  it('0y-T13 — override.force_run ⇒ load all, reason force_run, decisions still computed', async () => {
    const fresh = versionDaysAgo(2);
    const preceding = priorMeta({ base: fresh, ov_a: fresh, ov_b: fresh });
    const f = fakeFetch({ versions: { Rbase: fresh, Rov_a: fresh, Rov_b: fresh } });
    restored = [
      ...stubs(preceding),
      vi.spyOn(stalenessLib, 'resolveOverrides').mockReturnValue({ force_run: true, force_full: false, dry_run: false }),
    ];

    const out = await callPrimaries(Z3(), { fetchImpl: f.fetchImpl }) as {
      skipped: boolean;
      reason: string;
      acquired: {
        step_gate: { reason: string; decisions: Record<string, { skip: boolean; reason: string }> };
        primaries: Record<string, { outcome: string }>;
      };
    };

    expect(out.skipped, 'a forced run never skips').toBe(false);
    expect(out.reason).toBe('force_run');
    expect(out.acquired.step_gate.reason).toBe('force_run');
    expect(
      out.acquired.step_gate.decisions,
      'the per-primary decisions are still computed under force (GR-5b)',
    ).toEqual({
      base: { skip: true, reason: 'unchanged' },
      ov_a: { skip: true, reason: 'unchanged' },
      ov_b: { skip: true, reason: 'unchanged' },
    });
    expect(acquireSpy().mock.calls, 'a forced run loads every primary').toHaveLength(3);
    expect(out.acquired.primaries.base!.outcome).toBe('loaded');
  });
});

describe('INGESTOR prerequisite 0y — refusals (0y Y1–Y5) and the relaxed B6', () => {
  let restored: Array<{ mockRestore: () => void }> = [];
  afterEach(() => {
    for (const s of restored.splice(0)) s.mockRestore();
  });

  // =========================================================================
  // T14 — REFUSALS. Y1–Y3 live in the PURE binder (`multiPrimaryBinding`) and fire
  // BEFORE the first pool query and the first fetch; Y4/Y5 live in the EXPORTED
  // `runIngestPhase`, inserted before :1143, so a refusal still costs 0 pool calls
  // and 0 fetches. Every row asserts that cost.
  // =========================================================================
  it('0y-T14 — Y1 (a non-CKAN primary under all_primaries) refuses by code and by id, costing no I/O', async () => {
    const d = Z3();
    d.inputs.reads.externals[2]!.format = 'shapefile_zip';
    const f = fakeFetch();
    const pool = fakePool();
    restored = stubs(null);

    await expect(
      callPrimaries(d, { pool, fetchImpl: f.fetchImpl }),
      'Y1 refuses a non-ckan_datastore primary under the all-primaries scope',
    ).rejects.toThrow(/0y Y1/);
    await expect(callPrimaries(d, { pool, fetchImpl: f.fetchImpl })).rejects.toThrow(/"ov_b"/);
    expect(f.fetchImpl, 'the refusal costs no network').toHaveBeenCalledTimes(0);
    expect(pool.calls, 'the refusal costs no pool query').toHaveLength(0);
  });

  it('0y-T14 — Y2 row 1 (a primary no ckan_metadata trigger covers) refuses by code and by id', async () => {
    const d = Z3();
    // Re-scope the single trigger to base and ov_a only: ov_b is left uncovered.
    d.staleness.trigger[0] = { ...d.staleness.trigger[0], external: 'base' };
    d.staleness.trigger.push({ ...d.staleness.trigger[0], external: 'ov_a' });
    const f = fakeFetch();
    const pool = fakePool();
    restored = stubs(null);

    await expect(callPrimaries(d, { pool, fetchImpl: f.fetchImpl })).rejects.toThrow(/0y Y2/);
    await expect(callPrimaries(d, { pool, fetchImpl: f.fetchImpl })).rejects.toThrow(/"ov_b"/);
    expect(f.fetchImpl).toHaveBeenCalledTimes(0);
    expect(pool.calls).toHaveLength(0);
  });

  it('0y-T14 — Y2 row 2 (a pre_acquisition trigger that is not ckan_metadata) refuses by code', async () => {
    const d = Z3();
    // Keep the covering ckan_metadata trigger, ADD a style-less pre_acquisition trigger.
    d.staleness.trigger.push({ signal: 'source_validator', position: 'pre_acquisition' });
    const f = fakeFetch();
    const pool = fakePool();
    restored = stubs(null);

    await expect(
      callPrimaries(d, { pool, fetchImpl: f.fetchImpl }),
      'a pre_acquisition trigger the narrowing would drop is refused, never silently dropped (R-AJ)',
    ).rejects.toThrow(/0y Y2/);
    expect(f.fetchImpl).toHaveBeenCalledTimes(0);
    expect(pool.calls).toHaveLength(0);
  });

  it('0y-T14 — Y3 (a post_acquisition trigger reaching a ckan_datastore primary) refuses by code and by id', async () => {
    const d = Z3();
    d.staleness.trigger.push({ signal: 'content_hash', position: 'post_acquisition', external: 'ov_b' });
    const f = fakeFetch();
    const pool = fakePool();
    restored = stubs(null);

    await expect(callPrimaries(d, { pool, fetchImpl: f.fetchImpl })).rejects.toThrow(/0y Y3/);
    await expect(callPrimaries(d, { pool, fetchImpl: f.fetchImpl })).rejects.toThrow(/"ov_b"/);
    expect(f.fetchImpl).toHaveBeenCalledTimes(0);
    expect(pool.calls).toHaveLength(0);
  });

  /** A single-primary descriptor (exactly ONE `outputs.writes[]`) that BYPASSES AJV. */
  function singlePrimary(): Record<string, any> {
    const d = Z3();
    d.inputs.reads.externals = [d.inputs.reads.externals[0]];
    d.outputs.writes = [d.outputs.writes[0]];
    delete d.staleness.skip_scope;
    return d;
  }

  it('0y-T14 — Y4 (a ckan_datastore external with no target) is refused by runIngestPhase before any I/O', async () => {
    const d = singlePrimary();
    delete d.inputs.reads.externals[0].target;
    const f = fakeFetch();
    const pool = fakePool();
    restored = stubs(null);

    await expect(
      stepLib.runIngestPhase({
        descriptor: d, pool, compute: ravineCompute, config: ckanConfig(), fetchImpl: f.fetchImpl,
        chainId: null, log: noopLog, tag: '[0y]', clockNow: NOW, preWriteGate: null,
      }),
      'Y4 is the runtime twin of Y-I1\'s `target` clause (I-A7)',
    ).rejects.toThrow(/0y Y4/);
    expect(f.fetchImpl, 'Y4 fires before :1143, so no fetch happens').toHaveBeenCalledTimes(0);
    expect(pool.calls, 'Y4 fires before :1143, so no pool query happens').toHaveLength(0);
  });

  it('0y-T14 — Y5 (a non-default trigger style reaching runIngestPhase) is refused before any I/O', async () => {
    const d = singlePrimary();
    // A plain committed-shape primary plus a `ckan_metadata` trigger that the all-primaries
    // narrowing would have dropped: reaching runIngestPhase means it was NOT dropped.
    d.inputs.reads.externals = [{
      id: 'base', kind: 'http_file', format: 'shapefile_zip', url: 'https://ex/layer.zip',
      key_property: 'OBJECTID',
    }];
    const f = fakeFetch();
    const pool = fakePool();
    restored = stubs(null);

    await expect(
      stepLib.runIngestPhase({
        descriptor: d, pool, compute: ravineCompute, config: ckanConfig(), fetchImpl: f.fetchImpl,
        chainId: null, log: noopLog, tag: '[0y]', clockNow: NOW, preWriteGate: null,
      }),
      'a non-default style must be refused by name, never silently gated as validator-equality (I-A7)',
    ).rejects.toThrow(/0y Y5/);
    expect(f.fetchImpl).toHaveBeenCalledTimes(0);
    expect(pool.calls).toHaveLength(0);
  });

  // =========================================================================
  // T16 — B6 RELAXED (G2). Under `all_primaries` there is no per-primary sub-block,
  // so B6 must not fire; the `:732` narrowing must not throw for an ABSENT skeleton
  // or `emits:"none"`; and a primary id that collides with a TOP-LEVEL key of an
  // object skeleton is refused by name (the collision B6 used to hide).
  // =========================================================================
  it('0y-T16 — Z3 binds with NO per-primary skeleton, and the :732 narrowing does not throw', async () => {
    const d = Z3(); // emits[] carry no `skeleton` at all.
    const pairs = stepLib.multiPrimaryBinding(d, 'T') as Array<{ external: { id: string } }>;
    expect(pairs.map((p) => p.external.id), 'all three primaries bind without a sub-block').toEqual(['base', 'ov_a', 'ov_b']);

    const emit = stepLib.emitsList(d)[0] as { skeleton?: unknown };
    expect(emit.skeleton, 'Z3 declares no per-primary skeleton (I-A3)').toBeUndefined();
    // The LIBRARY's narrowing, never a re-typed copy of the old unguarded `skeleton[id]`: no
    // prior row ⇒ LOAD, so `ingestPrimaries` narrows every primary's emit over the absent skeleton.
    restored = stubs(null);
    const f = fakeFetch();
    await expect(
      callPrimaries(d, { fetchImpl: f.fetchImpl }),
      'the absent-skeleton narrowing must refuse or guard, never TypeError',
    ).resolves.toBeDefined();
  });

  it('0y-T16 — Z3 with `emits:"none"` binds and the narrowing does not throw', () => {
    const d = Z3();
    d.emits = 'none';
    const pairs = stepLib.multiPrimaryBinding(d, 'T') as Array<{ external: { id: string } }>;
    expect(pairs).toHaveLength(3);
    const emit = stepLib.emitsList(d)[0];
    expect(emit, 'emits:"none" resolves to no emit, so the narrowing must be guarded (G2)').toBeUndefined();
  });

  it('0y-T16 — a primary id colliding with a top-level key of an object skeleton is refused by name', () => {
    const d = Z3();
    // An object skeleton carrying a TOP-LEVEL key equal to a primary id: the `:732`
    // narrowing would silently overwrite it.
    d.emits = [{ key: 'layer_versions', type: 'object', consumers: [], skeleton: { ov_a: { spec_version: '1.0' } } }];
    expect(() => stepLib.multiPrimaryBinding(d, 'T')).toThrow(/0y G2/);
    expect(() => stepLib.multiPrimaryBinding(d, 'T')).toThrow(/"ov_a"/);
  });

  it('0y-T16 — Z3 with skip_scope deleted refuses at M4 (AJV) and at B6 (direct binding)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any -- the real schema
    const Ajv: any = require('ajv');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real schema
    const schema = require(join(process.cwd(), 'scripts/steps/_schema/step.schema.json'));
    const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);

    const d = Z3();
    delete d.staleness.skip_scope;

    const errors = (validate(d) ? [] : (validate.errors ?? [])) as Array<{ keyword?: string; instancePath?: string; params?: Record<string, unknown> }>;
    expect(validate(d), 'a ckan_metadata trigger requires staleness.skip_scope (M4)').toBe(false);
    expect(
      errors.some((e) => e.keyword === 'required' && e.instancePath === '/staleness' && e.params?.missingProperty === 'skip_scope'),
      'expected the M4 required/skip_scope error at /staleness',
    ).toBe(true);

    // Direct binding (no AJV): without `all_primaries` the old B6 still fires on the
    // missing per-primary skeleton.
    const bound = Z3();
    delete bound.staleness.skip_scope;
    bound.emits = [{ key: 'layer_versions', type: 'object', consumers: [] }];
    expect(() => stepLib.multiPrimaryBinding(bound, 'T')).toThrow(/B6/);
  });
});

// ===========================================================================
// T15 — PIN (0x unchanged, G1). `skip_scope` absent means `per_primary`, which
// is 0x's behaviour byte for byte: B6 still fires on a missing sub-skeleton, a
// per-primary skip still leaves the step un-skipped, and a full `per_primary`
// run's `records_meta.gate` carries EXACTLY `["reason","gated_skip"]` (the 19′/26′
// conditional spreads both evaluate to `{}` when `step_gate` is absent).
// ===========================================================================
describe('INGESTOR prerequisite 0y — T15 PIN: the per_primary path is unchanged (0x)', () => {
  let restored: Array<{ mockRestore: () => void }> = [];
  afterEach(() => {
    for (const s of restored.splice(0)) s.mockRestore();
  });

  /** The primary's acquisition block — every field `runIngestPhase`'s conservation reads. */
  function primaryAcquired(featureCount: number) {
    return {
      rows_parsed: featureCount,
      feature_count: featureCount,
      rows_read: featureCount,
      invalid_geometry_skipped: 0,
      invalid_geometry_repaired: 0,
      geometry_collection_extracted: 0,
      skipped_keys: [],
      last_modified: 'Mon, 14 Mar 2022 15:25:09 GMT',
      last_modified_ms: Date.parse('Mon, 14 Mar 2022 15:25:09 GMT'),
      etag: null,
      content_hash: 'bb',
      source_dataset_version: 'bb',
      license_url: 'https://open.toronto.ca/open-data-license/',
    };
  }

  /** The heritage-shaped multi-primary fixture (0x H2): TWO shapefile primaries, TWO targets. */
  function H2(): Record<string, any> {
    const d = clone(LOAD_RAVINES) as unknown as Record<string, any>;
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
    // FLEET-2 MQ-A7 (step.schema.json allOf[11]): the ravines base keeps schema_drift "pause", so force_run must be an
    // env var (same as the real load-ravines descriptor).
    d.override = { force_full: 'none', force_run: 'RAVINE_FORCE_RELOAD', dry_run: 'none' };
    return d;
  }

  it('0y-T15 (PIN) — the per_primary path still refuses B6 on a missing sub-skeleton', () => {
    const d = H2();
    d.emits[0].skeleton = { a: {} };
    expect(() => stepLib.multiPrimaryBinding(d, 'T')).toThrow(/B6/);
  });

  it('0y-T15 (PIN) — the per_primary path still skips per primary (0x T7 shape)', async () => {
    const d = H2();
    for (const s of restored.splice(0)) s.mockRestore();
    restored = [
      vi.spyOn(stalenessLib, 'readPriorEmitWithPosture')
        .mockResolvedValue({ prior: { a: { content_hash: 'x' }, b: { content_hash: 'y' } }, error: null }),
      vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({
        ta: { rls_enabled: true, bypassrls: true, policies: 0 },
        tb: { rls_enabled: true, bypassrls: true, policies: 0 },
      }),
      vi.spyOn(acquireLib, 'acquireExternal').mockImplementation((async ({ external }: { external: { id: string } }) => (
        external.id === 'a'
          ? {
            tier1: { skip: false }, tier2: { skip: true, reason: 'content_hash_unchanged' },
            features: [], acquired: primaryAcquired(0), emitBlock: { from: 'a' },
          }
          : {
            tier1: { skip: false }, tier2: { skip: false }, emitBlock: null,
            features: [{ source_id: 1, geojson: '{}', record: {} }], acquired: primaryAcquired(1),
          }
      )) as (...args: unknown[]) => unknown),
      vi.spyOn(writeLib, 'validateGeometries').mockResolvedValue({
        carried: [{ source_id: 1, geom: Buffer.from('') }], repaired: 0, collectionExtracted: 0, skipped: 0, skippedKeys: [],
      }),
      vi.spyOn(writeLib, 'executeWrite').mockResolvedValue({
        inserted: 1, updated: 0, deleted: 0, rows_scanned: 1, rows_changed: 1, unchanged: 0,
      }),
    ];

    const out = await stepLib.ingestPrimaries({
      descriptor: d, pool: fakePool({ tables: ['ta', 'tb'] }), compute: ravineCompute, config: seedConfig(),
      fetchImpl: async () => { throw new Error('the per_primary path must not reach the network here'); },
      chainId: null, log: noopLog, tag: '[0y-pin]', clockNow: NOW, preWriteGate: null,
    }) as { skipped: boolean; acquired: { primaries: Record<string, { outcome: string }> } };

    expect(out.acquired.primaries.a!.outcome, 'the skipped primary keeps 0x\'s outcome').toBe('skipped');
    expect(out.acquired.primaries.b!.outcome).toBe('loaded');
    expect(out.skipped, 'a per-primary skip never skips the step').toBe(false);
    expect(writeLib.executeWrite).toHaveBeenCalledTimes(1);
  });

  it('0y-T15 (PIN) — a full per_primary run carries EXACTLY ["reason","gated_skip"] on records_meta.gate', async () => {
    for (const s of restored.splice(0)) s.mockRestore();
    const priorStub = { a: { content_hash: 'x' }, b: { content_hash: 'y' } };
    restored = [
      vi.spyOn(stalenessLib, 'readPriorEmitWithPosture').mockResolvedValue({ prior: priorStub, error: null }),
      vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({
        ta: { rls_enabled: true, bypassrls: true, policies: 0 },
        tb: { rls_enabled: true, bypassrls: true, policies: 0 },
      }),
      vi.spyOn(acquireLib, 'acquireExternal').mockResolvedValue({
        tier1: { skip: false }, tier2: { skip: false }, emitBlock: null,
        features: [{ source_id: 1, geojson: '{}', record: {} }], acquired: primaryAcquired(1),
      }),
      vi.spyOn(writeLib, 'validateGeometries').mockResolvedValue({
        carried: [{ source_id: 1, geom: Buffer.from('') }], repaired: 0, collectionExtracted: 0, skipped: 0, skippedKeys: [],
      }),
      vi.spyOn(writeLib, 'executeWrite').mockResolvedValue({
        inserted: 1, updated: 0, deleted: 0, rows_scanned: 1, rows_changed: 1, unchanged: 0,
      }),
    ];

    const fn = Object.assign(
      async (ctx: Record<string, any>) => {
        for (const id of ctx.checks) ctx.report(id, { value: 0, inert: true });
        return {
          records_meta: ctx.written
            ? { k: { a: { from: 'compute' }, b: { from: 'compute' } } }
            : { k: {} },
        };
      },
      { ...ravineCompute },
    );
    const pool = fakePool({ tables: ['ta', 'tb'] });
    const out = await stepLib.step(H2(), fn).run({
      pool, chainId: null, fetch: async () => { throw new Error('the per_primary path must not reach the network here'); },
    }) as { recordsMeta: { gate: Record<string, unknown> } };

    expect(
      Object.keys(out.recordsMeta.gate).sort(),
      'step_gate is absent on a per_primary run, so BOTH conditional spreads are `{}` (F3)',
    ).toEqual(['gated_skip', 'reason']);
  });
});

// ===========================================================================
// 0y — CONVERTED INGESTORs ARE UNTOUCHED BY THE 0y GATE (Regression Guardian R1).
//
// The Y4/Y5 refusals were inserted into `runIngestPhase` BEFORE any I/O (I-A7).
// Y5 read the declared triggers as `((descriptor.staleness && descriptor.staleness.trigger)
// || []).filter(...)` — which assumes `staleness.trigger` is ALWAYS an array. The
// schema says otherwise: `trigger` is legally the STRING `"none"` (an ungated step,
// `triggersAt` reads it as `[]`), and FIVE of the seven converted INGESTOR descriptors
// declare exactly that (load-address-points, load-parcels, load-wsib, load-massing,
// load-neighbourhoods). So `runIngestPhase` threw a TypeError — `.filter is not a
// function` — from the Y5 line itself, BEFORE the HEAD and before any pool use: every
// one of those five steps was DEAD ON ARRIVAL, and the crash wore the costume of a
// runtime bug rather than the mis-declared descriptor the guard exists to name.
//
// This block is the Regression Guardian: for EACH converted INGESTOR it drives the REAL
// exported `runIngestPhase` and asserts the promise never rejects with a TypeError and
// never mentions a 0y Y1–Y5 code — the only legal outcomes are a clean resolution or a
// NON-TypeError throw from later in the phase. The pool stub answers NOTHING (`query`
// and `connect` both reject `POOL_REACHED`), so a rejection carrying that message proves
// the phase reached its real I/O rather than dying in a guard.
// ===========================================================================
describe('0y — converted INGESTORs are untouched by the 0y gate (Regression Guardian R1)', () => {
  /** Every converted file whose sibling descriptor declares `identity.archetype: "INGESTOR"`. */
  function convertedIngestors(): Array<{ file: string; descriptorPath: string; descriptor: Record<string, any> }> {
    /* eslint-disable @typescript-eslint/no-require-imports -- the real registry and descriptors */
    const converted = require(join(process.cwd(), 'scripts/steps/_schema/converted.json')) as { converted: string[] };
    return converted.converted
      .map((file) => file.replace(/\.js$/, '.descriptor.json'))
      .map((descriptorPath) => ({ descriptorPath, descriptor: require(join(process.cwd(), descriptorPath)) as Record<string, any> }))
      .filter(({ descriptor }) => descriptor.identity && descriptor.identity.archetype === 'INGESTOR')
      .map(({ descriptorPath, descriptor }) => ({ file: descriptorPath.replace(/\.descriptor\.json$/, '.js'), descriptorPath, descriptor }));
    /* eslint-enable @typescript-eslint/no-require-imports */
  }

  /** A pool stub that answers NOTHING: every query/connect rejects `POOL_REACHED`. */
  function deadPool() {
    const reached = async () => { throw new Error('POOL_REACHED'); };
    return { query: reached, connect: reached };
  }

  /** Run the REAL `runIngestPhase` against the dead pool and classify the outcome. */
  async function outcomeOf(descriptor: Record<string, any>): Promise<{ ok: true } | { ok: false; error: Error }> {
    try {
      await stepLib.runIngestPhase({
        descriptor,
        pool: deadPool(),
        compute: ravineCompute,
        config: ckanConfig(),
        fetchImpl: async () => { throw new Error('NO_NETWORK'); },
        chainId: null,
        log: noopLog,
        tag: '[0y-rg]',
        clockNow: NOW,
        preWriteGate: null,
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  /**
   * The R1 contract, in ONE place: a converted descriptor must never die in the 0y gate.
   * A TypeError (`.filter is not a function`) or a 0y Y1–Y5 message is the defect; every
   * OTHER throw — a `POOL_REACHED` from the phase's real I/O, a refusal later in the
   * phase — is a legal outcome and is left alone.
   */
  function expectNoGateCrash(outcome: { ok: true } | { ok: false; error: Error }): void {
    if (outcome.ok) return;
    expect(outcome.error, 'the 0y gate must never raise a TypeError over a legal descriptor').not.toBeInstanceOf(TypeError);
    expect(outcome.error.message, 'the 0y gate must not refuse a converted INGESTOR by code').not.toMatch(/0y Y[1-5]/);
  }

  // 7 -> 8 at batch-2 row 3.4 ③ (load_heritage, 2026-10-03): the INGESTOR joined converted.json.
  // 8 -> 9 at batch-2 row 3.3 ③ (load_zoning, 2026-10-05): the first multi-primary CKAN DataStore INGESTOR joined.
  it('the registry declares exactly NINE converted INGESTORs (the R1 scope is not vacuous)', () => {
    expect(convertedIngestors(), 'the R1 lock covers every converted INGESTOR, and there are nine').toHaveLength(9);
  });

  it('every converted INGESTOR survives the 0y gate (RED: the five `trigger:"none"` steps die in Y5 today)', async () => {
    const ingestors = convertedIngestors();
    const failures: Array<{ file: string; message: string }> = [];
    for (const { file, descriptor } of ingestors) {
      const outcome = await outcomeOf(clone(descriptor));
      try {
        expectNoGateCrash(outcome);
      } catch (err) {
        failures.push({ file, message: outcome.ok ? '' : outcome.error.message });
        void err;
      }
    }
    expect(
      failures,
      'every converted INGESTOR must pass the 0y gate untouched — no TypeError, no 0y Y-code',
    ).toEqual([]);
  });

  it('a MINIMAL single-primary descriptor with `staleness: { trigger: "none" }` behaves the same', async () => {
    const descriptor = clone(LOAD_RAVINES) as unknown as Record<string, any>;
    descriptor.staleness = { ...descriptor.staleness, trigger: 'none' };
    const outcome = await outcomeOf(descriptor);
    expectNoGateCrash(outcome);
  });
});

// ===========================================================================
// 0y — OUTPUT-GROUNDER FINDINGS F1/F2 (fix7).
//
// F1 (HIGH, measured): the all_primaries pre-loop read the prior under the BARE
// slug (`descriptor.identity.name`, `load_zoning`) while every ledger row the
// runner writes is keyed `<chain>:<slug>` (`ledgerPipelineName(descriptor,
// chainId)`, `sources:load_zoning` — the dev DB has 6 such rows and 0 bare
// ones). In a chain run the prior was therefore NEVER found, every decision read
// `no_prior_version`, and the step never skipped. RED: the captured pipeline name
// is the BARE slug and the run LOADs instead of SKIPping.
//
// F2 (MEDIUM, latent): `allPrimariesDecision` compared JS `typeof v` with the
// declared `emits[].type`, whose schema vocabulary is
// `string,int,number,bool,object,array,null`. `int`/`bool`/`array` never match
// (so a CORRECT value reads as `prior_contract_incomplete` ⇒ needless LOAD) and
// an array passes as `object` (so a WRONG value reads as complete).
// ===========================================================================
describe('INGESTOR prerequisite 0y — output-grounder F1/F2', () => {
  let restored: Array<{ mockRestore: () => void }> = [];
  afterEach(() => {
    for (const s of restored.splice(0)) s.mockRestore();
  });

  it('0y-F1 — a chain run reads the prior under ledgerPipelineName(descriptor, chainId), and skips', async () => {
    const versions = { Rbase: versionDaysAgo(2), Rov_a: versionDaysAgo(2), Rov_b: versionDaysAgo(2) };
    const preceding = priorMeta({ base: versions.Rbase, ov_a: versions.Rov_a, ov_b: versions.Rov_b });
    const f = fakeFetch({ versions });
    const pool = fakePool();

    // The prior is answered ONLY for the ledger name the runner writes
    // (`sources:load_zoning`). The stub CAPTURES the pipeline-name argument so
    // the test can assert which name the pre-loop actually asked for.
    const readStub = vi.spyOn(stalenessLib, 'readPriorEmitWithPosture')
      .mockImplementation((async (_pool: unknown, ledgerName: string) => ({
        prior: ledgerName === 'sources:load_zoning' ? preceding : null,
        error: null,
      })) as (...args: unknown[]) => Promise<{ prior: typeof preceding | null; error: null }>);
    restored = [
      readStub,
      vi.spyOn(acquireLib, 'acquireExternal'),
      vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({
        tbase: { rls_enabled: true, bypassrls: true, policies: 0 },
        tov_a: { rls_enabled: true, bypassrls: true, policies: 0 },
        tov_b: { rls_enabled: true, bypassrls: true, policies: 0 },
      }),
      vi.spyOn(writeLib, 'executeWrite').mockResolvedValue({
        inserted: 1, updated: 0, deleted: 0, rows_scanned: 1, rows_changed: 1, unchanged: 0,
      }),
    ];

    const out = await callPrimaries(Z3(), {
      pool, fetchImpl: f.fetchImpl, extra: { chainId: 'sources' },
    }) as { skipped: boolean; skipEmitMeta: Record<string, unknown> };

    const captured = readStub.mock.calls[0]![1] as string;
    expect(
      captured,
      'the prior must be read under the ledger name the runner WRITES (ledgerPipelineName), not the bare slug',
    ).toBe('sources:load_zoning');
    expect(out.skipped, 'with the prior found under the ledger name, every decision is unchanged ⇒ SKIP').toBe(true);
    expect(f.datastoreGets(), 'a skip reaches no datastore page').toHaveLength(0);
    expect(out.skipEmitMeta, 'the skip re-emits exactly the derived keys, by value').toEqual({
      layer_versions: preceding.layer_versions,
      layers_loaded: preceding.layers_loaded,
    });
  });

  it('0y-F2 — every schema emit type matches its correctly-typed value (no prior_contract_incomplete)', () => {
    const fresh = versionDaysAgo(2);
    const trigger = (Z3().staleness.trigger as Array<Record<string, unknown>>)[0]!;
    const validatorsById: Record<string, { lastModified: string | null; etag: null }> = {
      base: { lastModified: fresh, etag: null },
      ov_a: { lastModified: fresh, etag: null },
      ov_b: { lastModified: fresh, etag: null },
    };
    const prior = {
      layer_versions: { base: fresh, ov_a: fresh, ov_b: fresh },
      count: 5,
      flag: true,
      list: [1, 2],
      obj: { a: 1 },
      text: 'x',
      ratio: 1.5,
    };
    const emitTypes = {
      layer_versions: 'object',
      count: 'int',
      flag: 'bool',
      list: 'array',
      obj: 'object',
      text: 'string',
      ratio: 'number',
    };
    const decision = stalenessLib.allPrimariesDecision({
      primaries: [{ id: 'base' }, { id: 'ov_a' }, { id: 'ov_b' }],
      triggerFor: () => trigger,
      validatorsById,
      priorMeta: prior,
      config: ckanConfig(),
      nowMs: NOW.getTime(),
      forced: false,
      reemitKeys: Object.keys(emitTypes),
      emitTypes,
    }) as { skip: boolean; reason: string };

    expect(decision.reason, 'a correctly-typed re-emit contract is COMPLETE — int/bool/array/string/number/object all match').not.toBe('prior_contract_incomplete');
    expect(decision.skip, 'versions match and the contract is complete ⇒ SKIP').toBe(true);
  });

  it('0y-F2 — an ARRAY under a declared `object` is prior_contract_incomplete (fail-safe LOAD)', () => {
    const fresh = versionDaysAgo(2);
    const trigger = (Z3().staleness.trigger as Array<Record<string, unknown>>)[0]!;
    const validatorsById: Record<string, { lastModified: string | null; etag: null }> = {
      base: { lastModified: fresh, etag: null },
      ov_a: { lastModified: fresh, etag: null },
      ov_b: { lastModified: fresh, etag: null },
    };
    const prior = {
      layer_versions: { base: fresh, ov_a: fresh, ov_b: fresh },
      layers_loaded: [1, 2], // the declared type is `object`; an array is NOT an object
    };
    const decision = stalenessLib.allPrimariesDecision({
      primaries: [{ id: 'base' }, { id: 'ov_a' }, { id: 'ov_b' }],
      triggerFor: () => trigger,
      validatorsById,
      priorMeta: prior,
      config: ckanConfig(),
      nowMs: NOW.getTime(),
      forced: false,
      reemitKeys: ['layer_versions', 'layers_loaded'],
      emitTypes: { layer_versions: 'object', layers_loaded: 'object' },
    }) as { skip: boolean; reason: string };

    expect(decision.reason, 'an array does NOT satisfy a declared `object`').toBe('prior_contract_incomplete');
    expect(decision.skip).toBe(false);
  });
});
