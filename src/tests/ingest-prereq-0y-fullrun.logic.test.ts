// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A19 (0y; RE-FREEZE #30, logged in 122 §8)
// SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md F-M4 (:44, :208) and D8 (:628)
//
// INGESTOR prerequisite 0y (part D) — THE ALL-PRIMARIES FULL RUN.
//
// Brief 3's file locks the 0y GATE where a test can observe it without a runner: the pure
// `allPrimariesDecision`, the refusals, the relaxed B6. This file locks what NONE of that can:
// the whole assembled thing — the real `step(Z3, compute).run({pool, chainId:null, fetch})`
// lifecycle, `runWithPool`'s OWN ledger row, the `:5637` `stepCtx.gate` carry and the `:6058`
// skip-emit spread — reaching the ledger and the emitted `records_meta` end to end. Five
// claims, each invisible to a unit test of the gate:
//
//   T13b  the crash-recovery fence is REAL AND SCOPED (GR-4 / LW-D20, I-A2): a `running`,
//         not-yet-completed `pipeline_runs` row NEWER than the prior completed run forces a
//         LOAD under `all_primaries` with `reason:"force_run"`, but the run's OWN just-opened
//         row must NOT — the fence `detectInterruptedRetraction` gets `ownRunId` from
//         `runWithPool` (`index.js:5631`) and the query's `$2` excludes exactly that id.
//   T13c  the aggregate LOAD reason travels to the row (O-A1): for each cause a load run's
//         `records_meta.gate.reason` equals it, two causes at once resolve by the stated
//         precedence, and a load carries `decisions`/`max_age_days`/`dataset_version_age_days`
//         (the load half of 23‴→26′→19′; T17 is the skip half).
//   T17   a gated SKIP end to end (G3, O-A2): the prior block is re-emitted EXACTLY, the
//         ledger UPDATE binds NULL counters (ZN-D9), `executeWrite` never runs, `ctx.overrides`
//         is DEFINED (the skip return carries it, §3c), and the age on the row is computed from
//         the REAL prior against the run clock — never from a stubbed pre check.
//   T18   a LOAD end to end (O-A4): three `INSERT INTO`s in three `BEGIN`/`COMMIT` pairs, each
//         binding its OWN resource's `source_dataset_version`, with `written.by_target` keyed per
//         target; an overlay 503 under `warn_row_continue` is one WARN `primary_failed` row and
//         `completed_with_warnings`; a base 503 rejects and the second primary is never fetched.
//   T19   a `package_show` failure (O-A5, operator D3): a 5xx and a `success:false` each THROW
//         before ANY `datastore_search` GET; the ledger row is `failed`, its `error_message`
//         names `package_show`, and ZERO writes are issued.
//
// RED BEFORE 0y, and for the reason §6 row 4 names: `step(Z3, compute)` is AJV-validated at
// CONSTRUCTION, and `format:"ckan_datastore"` is not in the frozen format enum
// [READ scripts/steps/_schema/step.schema.json] while `ckan`/`style`/`max_age_days_from_config`/
// `skip_scope` are unknown keys on items declared `additionalProperties:false` — so Z3 fails with
// the `enum`/`additionalProperties` errors and the runner is never reached. Behind that refusal,
// every 0y behaviour these tests assert is absent: no `ingestPrimaries` `all_primaries` pre-loop,
// no `step_gate`, no `skipEmitMeta`. Either refusal alone reddens this file; the schema one fires
// first.
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
/** The `runId` `runWithPool` opens for a standalone run — the value the fence must exclude. */
const OWN_RUN_ID = 7777;

/** A `package_show` HTTP-date version `days` before `NOW` (a stored version's timestamp). */
const versionDaysAgo = (days: number): string => new Date(NOW.getTime() - days * 86400000).toUTCString();

type PoolCall = { text: string; params: unknown[] | undefined };

/**
 * The fake pool this file shares with brief 3, EXTENDED for the full run:
 *
 *   · the PRIOR read is routed on `SELECT records_meta FROM pipeline_runs` (I-A5), NEVER on the
 *     `status='completed'` literal, because witness-unblock C3 rewrites that literal;
 *   · the interrupted-retraction query is routed on the CTE name `own_last_completed`
 *     (`staleness.js:410`), NEVER on `status = 'completed'` (fold F4), and it HONOURS `$2`:
 *     the configured running row is returned only when `row.id !== params[1]` — the LW-D20
 *     own-run fence, exercised with the run id `runWithPool` itself passed;
 *   · `INSERT INTO pipeline_runs` answers `OWN_RUN_ID`, so the test can assert the fence with
 *     the SAME id the runner opened (never a hand-set one);
 *   · an `UPDATE pipeline_runs` records its bound params, which is how T17/T19 read the ledger.
 */
function fakePool(opts: {
  priorMeta?: Record<string, unknown> | null;
  /** A `running`/`crashed` row the interrupted-retraction query MAY return (subject to `$2`). */
  interrupted?: Record<string, unknown> | null;
  tables?: string[];
} = {}) {
  const calls: PoolCall[] = [];
  const tables = opts.tables ?? ['tbase', 'tov_a', 'tov_b'];
  const tablesAlt = tables.join('|');
  const answer = (text: string, params?: unknown[]) => {
    if (text.includes('FROM logic_variables')) {
      return {
        rows: Object.entries(ckanConfig()).map(([variable_key, variable_value]) => ({
          variable_key, variable_value, variable_value_json: null,
        })),
      };
    }
    if (text.includes('current_database()')) {
      return { rows: [{ database: 'postgres', db_user: 'postgres', has_tracking: true }] };
    }
    if (text.includes('FROM public.schema_migrations')) return { rows: [{ n: 999 }] };
    if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] };
    if (text.startsWith('INSERT INTO pipeline_runs')) return { rows: [{ id: OWN_RUN_ID }] };
    if (text.includes('own_last_completed')) {
      // The LW-D20 fence lives in `$2`: the run's OWN row must never be visible to the predicate.
      const row = opts.interrupted;
      if (!row) return { rows: [] };
      const ownRunId = params && params[1];
      return { rows: row.id !== ownRunId ? [row] : [] };
    }
    if (/SELECT records_meta FROM pipeline_runs/i.test(text)) {
      return { rows: opts.priorMeta ? [{ records_meta: opts.priorMeta }] : [] };
    }
    if (/SELECT NOW\(\) AS now/i.test(text)) return { rows: [{ now: NOW }] };
    if (/UPDATE pipeline_runs/i.test(text)) return { rows: [] };
    if (new RegExp(`INSERT INTO (${tablesAlt})\\b`, 'i').test(text)) return { rows: [{ is_insert: true }] };
    return { rows: [] };
  };
  const record = async (text: string, params?: unknown[]) => { calls.push({ text, params }); return answer(text, params); };
  return {
    calls, query: record,
    connect: async () => ({ query: record, release: () => {} }),
    ledgerUpdates: () => calls.filter((c) => /UPDATE pipeline_runs/i.test(c.text)),
    inserts: (table: string) => calls.filter((c) => new RegExp(`INSERT INTO ${table}\\b`, 'i').test(c.text)),
  };
}

type FakePool = ReturnType<typeof fakePool>;

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
 * Fixture `Z3` (§4) — byte-identical in shape to brief 3's fixture so the two files describe ONE
 * descriptor: three `ckan_datastore` primaries `base`/`ov_a`/`ov_b` sharing one `package_url`,
 * three targets, the §3e trigger (`emit_key:"layer_versions"`, GR-5c), `skip_scope:"all_primaries"`,
 * `recovery.interrupted:"force_full_on_next_run"`, `execution.shape:"ingest"`, and an `emits[]` of
 * `layer_versions`/`layers_loaded`/`audit_table` with NO per-id skeleton (I-A3).
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
    cache: 'none',
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
      replay: 'idempotent_upsert',
      source_key_policy: { unique: true, on_collision: 'dedupe_upstream', key_space_migration: 'none' },
    })),
    cascades: 'none',
    invalidates: [],
    publish: 'direct',
    write_inventory: {
      statements: 3,
      why: { text: 'One guarded upsert per declared target.', liveness: { kind: 'file', ref: 'scripts/lib/step/write.js' } },
    },
  };
  d.staleness = {
    ...d.staleness,
    scope: 'none',
    trigger: [{
      signal: 'source_validator',
      position: 'pre_acquisition',
      style: 'ckan_metadata',
      emit_key: 'layer_versions',
      max_age_days_from_config: MAX_AGE_VAR,
    }],
    skip_scope: 'all_primaries',
    mode_select: 'skip',
    checkpoint: 'none',
    interval: 'none',
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
 * The fake CKAN server (brief 3's, extended): serves `package_show` (a resource list with
 * per-resource versions) and paged `datastore_search` (each page carrying `result.total`), and
 * records EVERY url. `failPackageShow` makes a `package_show` answer a 5xx or a `success:false`
 * body (T19), and `failDatastoreFor` makes ONE resource's page fetch answer 503 (T18).
 */
function fakeFetch(opts: {
  versions?: Record<string, string | null>;
  recordsByResource?: Record<string, Array<Record<string, unknown>>>;
  failPackageShow?: 'status' | 'success';
  failDatastoreFor?: Record<string, number>;
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
      if (opts.failPackageShow === 'status') return new Response('boom', { status: 500, statusText: '500' });
      if (opts.failPackageShow === 'success') {
        return new Response(JSON.stringify({ success: false, error: { message: 'nope' } }), { status: 200, statusText: '200' });
      }
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
      const failStatus = opts.failDatastoreFor?.[resourceId];
      if (failStatus) return new Response('boom', { status: failStatus, statusText: String(failStatus) });
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
 * The acquisition stub set for the FULL RUN. Everything `runIngestPhase` reads off
 * `result.acquired` is supplied per primary, and each primary's `source_dataset_version` is
 * DISTINCT so T18 can prove each INSERT binds its OWN resource's version (D8 `:628` — the
 * library overrides each row's version with its primary's `acquired.source_dataset_version`).
 * `failFor` makes one primary's acquisition THROW, which the 0x posture routes.
 */
function stubsFor(prior: Record<string, unknown> | null, opts: {
  versions?: Record<string, string>;
  failFor?: Record<string, Error>;
} = {}) {
  const versions = opts.versions ?? {
    base: '2026-02-20T21:29:42.613615',
    ov_a: '2026-02-19T10:00:00.000000',
    ov_b: '2026-02-18T09:00:00.000000',
  };
  const acquiredFor = (id: string) => ({
    rows_parsed: 1,
    feature_count: 1,
    rows_read: 1,
    invalid_geometry_skipped: 0,
    invalid_geometry_repaired: 0,
    geometry_collection_extracted: 0,
    skipped_keys: [],
    last_modified: versions[id] ?? null,
    last_modified_ms: versions[id] ? Date.parse(versions[id]!) : null,
    etag: null,
    content_hash: null,
    source_dataset_version: versions[id] ?? null,
    license_url: 'https://open.toronto.ca/open-data-license/',
  });
  return () => [
    vi.spyOn(stalenessLib, 'readPriorEmitWithPosture').mockResolvedValue({ prior, error: null }),
    vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({
      tbase: { rls_enabled: true, bypassrls: true, policies: 0 },
      tov_a: { rls_enabled: true, bypassrls: true, policies: 0 },
      tov_b: { rls_enabled: true, bypassrls: true, policies: 0 },
    }),
    vi.spyOn(acquireLib, 'acquireExternal').mockImplementation((async ({ external }: { external: { id: string } }) => {
      const failure = opts.failFor?.[external.id];
      if (failure) throw failure;
      return {
        tier1: { skip: false },
        tier2: { skip: false },
        emitBlock: null,
        features: [{ source_id: 1, geojson: '{}', record: {} }],
        acquired: acquiredFor(external.id),
      };
    }) as (...args: unknown[]) => unknown),
  ] as Array<{ mockRestore: () => void }>;
}

/**
 * The compute: `load-ravines.js` with its declared-check dispatch preserved, but the entry point
 * replaced by a fixture that REPORTS EVERY SELECTED CHECK (an unreported check would leave the run
 * `incomplete` for the wrong reason — the 0x X8 lesson) and returns the declared re-emit blocks
 * only when `ctx.written` is set (so a skip contributes none of its own).
 */
/**
 * The LAST ingest result the runner handed the compute (`ctx.acquired` / `ctx.written`). `run()`
 * returns neither — its `acquired` is the advisory-lock boolean (index.js `return { status,
 * recordsMeta, runId, acquired: lockResult.acquired }`) — so T18 reads them here.
 */
let lastIngest: {
  acquired: { primaries?: Record<string, unknown> } | undefined;
  written: { by_target?: Record<string, { inserted?: number }> } | undefined;
} = { acquired: undefined, written: undefined };
const compute = Object.assign(
  async (ctx: { checks: string[]; report: (id: string, o: unknown) => void; written?: unknown; acquired?: unknown }) => {
    lastIngest = { acquired: ctx.acquired as typeof lastIngest.acquired, written: ctx.written as typeof lastIngest.written };
    for (const id of ctx.checks) ctx.report(id, { value: 0, inert: true });
    return ctx.written
      ? { records_meta: { layer_versions: { base: 'x' }, layers_loaded: { base: true } } }
      : { records_meta: {} };
  },
  { ...ravineCompute },
);

type Restorable = { mockRestore: () => void };

describe('INGESTOR prerequisite 0y — the all-primaries full run', () => {
  let restored: Restorable[] = [];
  afterEach(() => {
    for (const s of restored.splice(0)) s.mockRestore();
  });

  /** Swap the whole stub set (restoring the previous one first). */
  const withStubs = (next: () => Restorable[]) => {
    for (const s of restored.splice(0)) s.mockRestore();
    restored = next();
  };

  type RunOut = {
    status: string;
    recordsMeta: Record<string, any>;
    acquired: any;
  };

  /** One standalone full run of Z3 through the real lifecycle. */
  const runStep = async (pool: FakePool, fetchImpl: unknown): Promise<RunOut> =>
    stepLib.step(Z3(), compute).run({ pool, chainId: null, fetch: fetchImpl }) as Promise<RunOut>;

  // =========================================================================
  // T13b — CRASH RECOVERY, SCOPED (GR-4 / LW-D20, I-A2). The behaviour-only
  // assertion brief 3's file deliberately could not write: it needs the
  // `runId` `runWithPool` opened. A `running` row NEWER than the prior
  // completed run forces a LOAD with `force_run`; the run's OWN row does NOT,
  // and the fence must be exercised with the id the runner actually passed.
  // =========================================================================
  it('0y-T13b — a crashed running row newer than the prior forces LOAD (reason force_run); the run’s OWN row does not', async () => {
    const fresh = versionDaysAgo(2);
    const preceding = priorMeta({ base: fresh, ov_a: fresh, ov_b: fresh });

    // (1) A `running` row NEWER than the prior completed run, NOT this invocation's own id.
    const foreign = {
      id: OWN_RUN_ID + 1, pipeline: 'load_zoning', status: 'running',
      started_at: new Date(NOW.getTime() + 1000).toISOString(),
    };
    withStubs(stubsFor(preceding));
    const f1 = fakeFetch({ versions: { Rbase: fresh, Rov_a: fresh, Rov_b: fresh } });
    const pool1 = fakePool({ priorMeta: preceding, interrupted: foreign });
    const out1 = await runStep(pool1, f1.fetchImpl);

    expect(out1.recordsMeta.gate.gated_skip, 'a crash forces the load — the run does not skip').not.toBe(true);
    expect(out1.recordsMeta.gate.reason, 'a crash reports force_run, exactly as a declared override does').toBe('force_run');

    const fenceCall = pool1.calls.find((c) => c.text.includes('own_last_completed'));
    expect(fenceCall, 'the interrupted-retraction query was issued (recovery.interrupted is declared)').toBeDefined();
    expect(
      fenceCall!.params?.[1],
      "the fence is passed `runWithPool`'s OWN run id (index.js:5631), never a hand-set one",
    ).toBe(OWN_RUN_ID);
    expect(
      f1.packageShows(),
      'a crash-forced load still runs the gate once for the record (the reason must be observable)',
    ).toHaveLength(1);

    // (2) The run's OWN `running` row alone must NOT force: `$2` excludes it.
    withStubs(stubsFor(preceding));
    const f2 = fakeFetch({ versions: { Rbase: fresh, Rov_a: fresh, Rov_b: fresh } });
    const own = { id: OWN_RUN_ID, pipeline: 'load_zoning', status: 'running', started_at: NOW.toISOString() };
    const pool2 = fakePool({ priorMeta: preceding, interrupted: own });
    const out2 = await runStep(pool2, f2.fetchImpl);

    expect(
      out2.recordsMeta.gate.gated_skip,
      'without the LW-D20 fence EVERY run would read as interrupted and force forever — the skip must stand',
    ).toBe(true);
    expect(out2.recordsMeta.gate.reason).toBe('unchanged');
  });

  // =========================================================================
  // T13c — THE LOAD REASON ON THE ROW (O-A1; reads `records_meta`). A full run,
  // because only a run reaches the `:6077` `gateRecordsMeta` site, which is the
  // ONE `records_meta.gate` producer. Each cause reaches
  // `records_meta.gate.reason`; two at once resolve by the stated precedence;
  // and a load carries the O-A2 evidence three (`decisions`, `max_age_days`,
  // `dataset_version_age_days`).
  // =========================================================================
  it('0y-T13c — each LOAD cause reaches records_meta.gate.reason, two at once by precedence', async () => {
    const fresh = versionDaysAgo(2);
    const versions = { Rbase: fresh, Rov_a: fresh, Rov_b: fresh };

    const run = async (preceding: Record<string, unknown> | null, extra: {
      fetch?: ReturnType<typeof fakeFetch>;
      overrides?: Record<string, boolean>;
      failFor?: Record<string, Error>;
    } = {}) => {
      withStubs(stubsFor(preceding, extra.failFor ? { failFor: extra.failFor } : {}));
      if (extra.overrides) {
        // Tracked in `restored`, so the NEXT sub-run's `withStubs` (and `afterEach`) restores it —
        // untracked, a `force_run:true` spy leaks into every later run and `it` of this file.
        restored.push(vi.spyOn(stalenessLib, 'resolveOverrides')
          .mockReturnValue({ force_run: false, force_full: false, dry_run: false, ...extra.overrides }));
      }
      const f = extra.fetch ?? fakeFetch({ versions });
      const out = await runStep(fakePool({ priorMeta: preceding }), f.fetchImpl);
      return { out, f };
    };

    // force_run — a declared override.
    const forced = await run(priorMeta({ base: fresh, ov_a: fresh, ov_b: fresh }), { overrides: { force_run: true } });
    expect(forced.out.recordsMeta.gate.reason).toBe('force_run');

    // cache_stale_force_reload — a stored version past the 730-day window (F-M4).
    const stale = await run(priorMeta({ base: versionDaysAgo(800), ov_a: fresh, ov_b: fresh }));
    expect(stale.out.recordsMeta.gate.reason).toBe('cache_stale_force_reload');

    // no_prior_version — including the no-prior-row arm.
    const noPrior = await run(null);
    expect(noPrior.out.recordsMeta.gate.reason, 'no prior row ⇒ no_prior_version, never a skip').toBe('no_prior_version');
    const noVersionKey = await run({ layers_loaded: { base: true, ov_a: true, ov_b: true } });
    expect(noVersionKey.out.recordsMeta.gate.reason).toBe('no_prior_version');

    // prior_contract_incomplete — the derived re-emit contract is broken (O-A3).
    const incomplete = await run({ layer_versions: { base: fresh, ov_a: fresh, ov_b: fresh } });
    expect(incomplete.out.recordsMeta.gate.reason).toBe('prior_contract_incomplete');

    // changed — the metadata moved and nothing else is wrong. THE load half of
    // 23‴→26′→19′: decisions + max_age_days + dataset_version_age_days all present.
    const changed = await run(priorMeta({ base: fresh, ov_a: fresh, ov_b: versionDaysAgo(9) }));
    expect(changed.out.recordsMeta.gate.reason).toBe('changed');
    expect(changed.out.recordsMeta.gate.decisions, 'a load stamps the per-primary decisions (O-A2)').toEqual({
      base: { skip: true, reason: 'unchanged' },
      ov_a: { skip: true, reason: 'unchanged' },
      ov_b: { skip: false, reason: 'changed' },
    });
    expect(changed.out.recordsMeta.gate.max_age_days).toBe(730);
    expect(
      changed.out.recordsMeta.gate.dataset_version_age_days,
      'a load reports the age of the OLDEST stored version — 9 days here (O-A2)',
    ).toBeCloseTo(9, 5);

    // PRECEDENCE — force_run beats a changed primary: the top-level reason must be the
    // FIRST cause that applies, not whichever primary happened to be walked last.
    const forcedAndChanged = await run(priorMeta({ base: fresh, ov_a: fresh, ov_b: versionDaysAgo(9) }), { overrides: { force_run: true } });
    expect(forcedAndChanged.out.recordsMeta.gate.reason).toBe('force_run');

    // PRECEDENCE — cache_stale_force_reload beats no_prior_version: base is stale, ov_a
    // has no stored version, and the arm listed first wins.
    const staleAndMissing = await run(priorMeta({ base: versionDaysAgo(800), ov_a: null, ov_b: fresh }));
    expect(staleAndMissing.out.recordsMeta.gate.reason).toBe('cache_stale_force_reload');
  });

  it('0y-T13c — a no_validators primary (absent from package_show, stored version present) is a WARN row and the reason', async () => {
    const fresh = versionDaysAgo(2);
    // ov_b is NOT listed by package_show, so its validators are (null, null) while the prior
    // still holds a stored version: `no_validators` ⇒ LOAD that overlay only; base and ov_a
    // are unchanged ⇒ their narrowed calls skip.
    const preceding = priorMeta({ base: fresh, ov_a: fresh, ov_b: fresh });
    const f = fakeFetch({ versions: { Rbase: fresh, Rov_a: fresh } });
    // The CKAN arm refuses a primary absent from package_show, and ov_b's posture is
    // `warn_row_continue`, so that primary becomes a WARN row while the step completes.
    withStubs(stubsFor(preceding, {
      failFor: { ov_b: new Error('resource Rov_b is not listed by the package_show payload') },
    }));

    const out = await runStep(fakePool({ priorMeta: preceding }), f.fetchImpl);

    expect(out.recordsMeta.gate.reason, 'the aggregate reason is the fail-safe cause, O-A1').toBe('no_validators');
    expect(out.status, 'a declared warn_row_continue posture completes with warnings').toBe('completed_with_warnings');
    const rows = (out.recordsMeta.audit_table && out.recordsMeta.audit_table.rows) || [];
    const failed = rows.filter((r: { metric?: string }) => r.metric === 'primary_failed:ov_b');
    expect(failed.length, 'ONE primary_failed row for the refused overlay').toBe(1);
    expect(failed[0]!.status).toBe('WARN');
    expect('errored' in failed[0]!, 'a declared posture is a WARN with no errored key').toBe(false);
  });

  // =========================================================================
  // T17 — THE SKIP RUN, END TO END (G3, O-A2). Standalone (`chainId:null`), so the
  // step owns its ledger row and `runWithPool` writes the ledger UPDATE the test
  // reads. The prior block is re-emitted EXACTLY; the counters bind NULL (ZN-D9);
  // no write txn opens; `ctx.overrides` is DEFINED; and the age on the row is
  // computed from the REAL prior's stored version against the RUN clock.
  // =========================================================================
  it('0y-T17 — an unchanged run skips: prior re-emitted exactly, null counters on the ledger, no write, overrides defined', async () => {
    const fresh = versionDaysAgo(2);
    const oldest = versionDaysAgo(7);
    const preceding = priorMeta({ base: oldest, ov_a: fresh, ov_b: fresh });
    const f = fakeFetch({ versions: { Rbase: oldest, Rov_a: fresh, Rov_b: fresh } });
    withStubs(stubsFor(preceding));

    let seenOverrides: unknown = 'NOT_SEEN';
    const skipCompute = Object.assign(
      async (ctx: { checks: string[]; report: (id: string, o: unknown) => void; written?: unknown; overrides?: unknown }) => {
        seenOverrides = ctx.overrides;
        for (const id of ctx.checks) ctx.report(id, { value: 0, inert: true });
        return { records_meta: {} };
      },
      { ...ravineCompute },
    );
    const pool = fakePool({ priorMeta: preceding });
    const out = await stepLib.step(Z3(), skipCompute).run({ pool, chainId: null, fetch: f.fetchImpl }) as RunOut;

    expect(out.status, 'a gated skip lands a completed row a downstream HALT gate can read (DS4)').toBe('completed');

    // (1) The prior's own top-level contract keys, re-emitted BY VALUE.
    expect(out.recordsMeta.layer_versions, 'the skip re-emits the prior layer_versions').toEqual(preceding.layer_versions);
    expect(out.recordsMeta.layers_loaded, 'the skip re-emits the prior layers_loaded').toEqual(preceding.layers_loaded);

    // (2) The gate's WHY, plus the terminal.
    expect(out.recordsMeta.gate.reason).toBe('unchanged');
    expect(out.recordsMeta.gate.gated_skip).toBe(true);
    expect(out.recordsMeta.terminal, 'the declared skip_gated terminal for the source_validator signal').toBe('skipped_source_validator');

    // (3) O-A2 evidence three, computed from the REAL prior against the RUN clock.
    expect(out.recordsMeta.gate.decisions).toEqual({
      base: { skip: true, reason: 'unchanged' },
      ov_a: { skip: true, reason: 'unchanged' },
      ov_b: { skip: true, reason: 'unchanged' },
    });
    expect(out.recordsMeta.gate.max_age_days).toBe(730);
    expect(
      out.recordsMeta.gate.dataset_version_age_days,
      'the age of the OLDEST stored version (7 days) against the run clock — never a stubbed pre check',
    ).toBeCloseTo(7, 5);

    // (4) The ledger row binds NULL counters (ZN-D9) and the write path never opened.
    const updates = pool.ledgerUpdates();
    expect(updates.length, 'the standalone run owns its ledger row and finalizes it once').toBe(1);
    expect(updates[0]!.params?.[4], 'records_total binds null on a skip').toBeNull();
    expect(updates[0]!.params?.[5], 'records_new binds null on a skip').toBeNull();
    expect(updates[0]!.params?.[6], 'records_updated binds null on a skip').toBeNull();
    expect(
      pool.inserts('tbase').length + pool.inserts('tov_a').length + pool.inserts('tov_b').length,
      'a skip never opens a write txn — executeWrite issues no target INSERT (it is not stubbed in this file)',
    ).toBe(0);

    // (5) G3 — beyond the runner-owned keys, the TOP-LEVEL keys are EXACTLY the derived
    //     re-emit keys, never `audit_table` as an emit (the runner writes that itself).
    const runnerOwned = new Set(stepLib.RUNNER_META_KEYS as string[]);
    const derived = Object.keys(out.recordsMeta).filter((k) => !runnerOwned.has(k)).sort();
    expect(derived).toEqual(['layer_versions', 'layers_loaded']);

    // (6) `ctx.overrides` is DEFINED on the skip (the skip return carries it, §3c) — and
    //     the compute stub reported every selected `pre` check (0x X8 lesson), which the
    //     audit table proves by carrying a row per declared pre check.
    expect(seenOverrides, 'the skip return carries `overrides`, so ctx.overrides is never undefined').toBeDefined();
    expect(seenOverrides).not.toBeNull();
  });

  // =========================================================================
  // T18 — THE LOAD RUN, END TO END (O-A4). Each primary is its OWN transaction
  // (three `BEGIN`/`COMMIT` pairs), each INSERT binds its OWN resource's
  // `source_dataset_version`, and `written.by_target` is keyed per target so the
  // base target's counts are separable. A 503 on an overlay under
  // `warn_row_continue` is a WARN row + `completed_with_warnings`; a 503 on the
  // base aborts before the overlays are fetched.
  // =========================================================================
  it('0y-T18 — three targets, three transactions, each INSERT binding its own resource version', async () => {
    const fresh = versionDaysAgo(2);
    const preceding = priorMeta({ base: fresh, ov_a: versionDaysAgo(9), ov_b: versionDaysAgo(9) });
    const versions = {
      base: '2026-02-20T21:29:42.613615',
      ov_a: '2026-02-19T10:00:00.000000',
      ov_b: '2026-02-18T09:00:00.000000',
    };
    const f = fakeFetch({ versions: { Rbase: fresh, Rov_a: fresh, Rov_b: fresh } });
    withStubs(stubsFor(preceding, { versions }));

    const pool = fakePool({ priorMeta: preceding });
    const out = await runStep(pool, f.fetchImpl);

    // (1) THREE `INSERT INTO`s in THREE separate `BEGIN`/`COMMIT` pairs, in declared order.
    const insertIdx = ['tbase', 'tov_a', 'tov_b'].map((t) => pool.calls.findIndex((c) => new RegExp(`INSERT INTO ${t}\\b`, 'i').test(c.text)));
    expect(insertIdx.every((i) => i >= 0), 'each target gets its own INSERT').toBe(true);
    expect(pool.inserts('tbase')).toHaveLength(1);
    expect(pool.inserts('tov_a')).toHaveLength(1);
    expect(pool.inserts('tov_b')).toHaveLength(1);
    // Each INSERT's OWN transaction opens strictly after the previous INSERT's COMMIT.
    for (let i = 1; i < insertIdx.length; i++) {
      const priorCommit = pool.calls.findIndex((c, j) => j > insertIdx[i - 1]! && j < insertIdx[i]! && /^COMMIT$/i.test(c.text.trim()));
      const ownBegin = pool.calls.findIndex((c, j) => j > priorCommit && j < insertIdx[i]! && /^BEGIN$/i.test(c.text.trim()));
      expect(priorCommit, `${['tbase', 'tov_a', 'tov_b'][i - 1]} COMMITs before the next target's INSERT`).toBeGreaterThan(-1);
      expect(ownBegin, `target ${i} opens its OWN transaction after the previous COMMIT`).toBeGreaterThan(priorCommit);
    }

    // (2) Each INSERT binds ITS OWN resource's version string (library overrides per row, D8).
    const boundValues = (table: string) => (pool.inserts(table)[0]!.params ?? []).map(String);
    expect(boundValues('tbase'), 'the base INSERT binds the base resource’s version').toContain(versions.base);
    expect(boundValues('tov_a'), 'the ov_a INSERT binds the ov_a resource’s version').toContain(versions.ov_a);
    expect(boundValues('tov_b'), 'the ov_b INSERT binds the ov_b resource’s version').toContain(versions.ov_b);
    expect(boundValues('tbase')).not.toContain(versions.ov_a);

    // (3) `written.by_target` is keyed per target, with the base target's counts separable.
    expect(Object.keys(lastIngest.acquired!.primaries!).sort()).toEqual(['base', 'ov_a', 'ov_b']);
    expect(out.recordsMeta.gate.reason, 'a genuine load reports its cause on the row (O-A1)').toBe('changed');
    const byTarget = lastIngest.written!.by_target as Record<string, { inserted?: number }>;
    expect(Object.keys(byTarget).sort(), 'counters source per target (O-A4)').toEqual(['tbase', 'tov_a', 'tov_b']);
    expect(byTarget.tbase!.inserted, 'the base target’s own count is separable').toBe(1);
  });

  it('0y-T18 — an overlay 503 under warn_row_continue is one WARN row and completed_with_warnings', async () => {
    const fresh = versionDaysAgo(2);
    const preceding = priorMeta({ base: fresh, ov_a: versionDaysAgo(9), ov_b: versionDaysAgo(9) });
    const f = fakeFetch({ versions: { Rbase: fresh, Rov_a: fresh, Rov_b: fresh } });
    withStubs(stubsFor(preceding, { failFor: { ov_a: new Error('GET 503 Service Unavailable') } }));

    const pool = fakePool({ priorMeta: preceding });
    const out = await runStep(pool, f.fetchImpl);

    expect(out.status, 'ov_a is warn_row_continue, so the run completes with warnings').toBe('completed_with_warnings');
    const rows = (out.recordsMeta.audit_table && out.recordsMeta.audit_table.rows) || [];
    const failed = rows.filter((r: { metric?: string }) => r.metric === 'primary_failed:ov_a');
    expect(failed.length, 'ONE WARN primary_failed row for the failed overlay').toBe(1);
    expect(failed[0]!.status).toBe('WARN');
    expect(pool.inserts('tbase'), 'base still loaded').toHaveLength(1);
    expect(pool.inserts('tov_b'), 'the second overlay still loaded').toHaveLength(1);
    expect(pool.inserts('tov_a'), 'the failed overlay wrote nothing').toHaveLength(0);
  });

  it('0y-T18 — a base 503 rejects the run and the overlay is never fetched', async () => {
    const fresh = versionDaysAgo(2);
    const preceding = priorMeta({ base: fresh, ov_a: versionDaysAgo(9), ov_b: versionDaysAgo(9) });
    const f = fakeFetch({ versions: { Rbase: fresh, Rov_a: fresh, Rov_b: fresh } });
    withStubs(stubsFor(preceding, { failFor: { base: new Error('GET 503 Service Unavailable') } }));

    const pool = fakePool({ priorMeta: preceding });
    await expect(runStep(pool, f.fetchImpl), 'base is abort_step (no on_failure), so its throw propagates').rejects.toThrow(/503/);

    const acquire = acquireLib.acquireExternal as unknown as { mock: { calls: Array<[{ external: { id: string } }]> } };
    expect(
      acquire.mock.calls.map((c) => c[0].external.id),
      'the loop aborts on base — no overlay is acquired',
    ).toEqual(['base']);
    expect(pool.inserts('tbase')).toHaveLength(0);
    expect(pool.inserts('tov_a')).toHaveLength(0);
    expect(pool.inserts('tov_b')).toHaveLength(0);
  });

  // =========================================================================
  // T19 — `package_show` FAILS BY NAME (O-A5, operator D3). The gate's ONE
  // `package_show` is unwrapped in the pre-loop: a 5xx and a `success:false`
  // each THROW before ANY `datastore_search` GET; the ledger row is `failed`,
  // its `error_message` names `package_show`, and ZERO writes are issued.
  // =========================================================================
  it('0y-T19 — a package_show 5xx fails by name before any datastore GET and writes nothing', async () => {
    const fresh = versionDaysAgo(2);
    const preceding = priorMeta({ base: fresh, ov_a: fresh, ov_b: fresh });
    const f = fakeFetch({ versions: { Rbase: fresh, Rov_a: fresh, Rov_b: fresh }, failPackageShow: 'status' });
    // `acquireExternal` is stubbed for the other tests, but a `package_show` failure never
    // reaches it: the pre-loop gate fetches the validators itself. Keep the stub so the run
    // would otherwise be a normal load, and assert the failure is the ONLY thing that stops it.
    withStubs(stubsFor(preceding));

    const pool = fakePool({ priorMeta: preceding });
    await expect(runStep(pool, f.fetchImpl), 'a package_show 5xx throws by name').rejects.toThrow(/package_show/);

    expect(f.datastoreGets(), 'the refusal fires before ANY datastore_search GET').toHaveLength(0);
    expect(pool.inserts('tbase').length + pool.inserts('tov_a').length + pool.inserts('tov_b').length, '0 INSERTs are issued').toBe(0);

    const updates = pool.ledgerUpdates();
    expect(updates.length).toBe(1);
    expect(updates[0]!.params?.[0], 'the run’s own ledger row is failed').toBe('failed');
    expect(String(updates[0]!.params?.[2]), 'error_message names package_show (operator D3)').toContain('package_show');
  });

  it('0y-T19 — a package_show success:false fails by name before any datastore GET and writes nothing', async () => {
    const fresh = versionDaysAgo(2);
    const preceding = priorMeta({ base: fresh, ov_a: fresh, ov_b: fresh });
    const f = fakeFetch({ versions: { Rbase: fresh, Rov_a: fresh, Rov_b: fresh }, failPackageShow: 'success' });
    withStubs(stubsFor(preceding));

    const pool = fakePool({ priorMeta: preceding });
    await expect(runStep(pool, f.fetchImpl), 'success:false throws by name').rejects.toThrow(/package_show/);

    expect(f.datastoreGets()).toHaveLength(0);
    expect(pool.inserts('tbase').length + pool.inserts('tov_a').length + pool.inserts('tov_b').length).toBe(0);

    const updates = pool.ledgerUpdates();
    expect(updates.length).toBe(1);
    expect(updates[0]!.params?.[0]).toBe('failed');
    expect(String(updates[0]!.params?.[2])).toContain('package_show');
  });
});
