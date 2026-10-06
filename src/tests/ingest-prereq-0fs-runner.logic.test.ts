// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md §A17 (0fs; RE-FREEZE #28, logged in 122 §8)
//
// INGESTOR prerequisite 0fs (part B) — the RUNNER half of local-file acquisition and the
// no-geometry arm.
//
// Part A taught the acquisition seam `kind:"filesystem"` + `externals[].path`: a repo-relative
// pattern (`data/B*.csv`) is resolved against a `repoRoot`, snapshotted into the existing temp
// root and hashed exactly like a download (md5, pinned by `DEFAULT_CONTENT_HASH_ALGORITHM`), and a
// file that is not there is the EXISTING tier-1 skip return carrying
// `reason:"no_source_file"`. This file locks the runner half, which is two separate gaps:
//
// (1) PRIMARY SELECTION (index.js :695). The 0w line is
//     `const urled = externals.filter(e => typeof e.url === 'string' && e.url.length > 0)`, so a
//     PATH-BEARING filesystem primary is invisible: `primaries.length === 0` and the step throws
//     "0 url-bearing primary". The fix widens the `sourced` filter with a `hasPath` arm (the
//     variable name and the throw text stay byte-identical, so 0w-runner T2's `/exactly ONE/`
//     survives), and four named construction refusals close the shapes the schema also rejects:
//     (v) a declared-but-never-fetched external, (vi) a lookup carrying a path, (viii) url+path or
//     a path on a non-filesystem kind, and (vii) a path primary with no `no_source_file` terminal —
//     fail-closed, because `selectTerminal` falls back to `pool[0]` and would mislabel the skip as
//     `skipped_source_validator`.
//
// (2) THE SKIP'S SIGNAL AND THE INTERRUPTED RETRACTION (index.js :935-937, A3). A missing local
//     file must report `signal:"no_source_file"` (so the terminal narrowed by id is the one the
//     descriptor declares), and an INTERRUPTED RETRACTION concurrent with an absent file must
//     REFUSE rather than skip: a completed skip advances `own_last_completed` and erases the
//     interrupted state (`staleness.js`).
//
// (3) THE NO-GEOMETRY ARM (index.js :1082). `write.validateGeometries` THROWS when
//     `plan.geometry_columns[0]` is absent ("nowhere to land"), and it is called unconditionally,
//     so an INGESTOR with no wkb bind (load_wsib row 3.5, composite TEXT key, `retract:"none"`,
//     `guards.srid:"none"`) cannot run at all. `noGeometry = plan.geometry_columns.length === 0 &&
//     descriptor.guards.srid === 'none'` short-circuits it to the identity
//     `{carried: kept, repaired:0, collectionExtracted:0, skipped:0, skippedKeys:[], invalidStored:0}`.
//     The `srid === 'none'` half is what keeps the `1a440908` fence: a geometry step that forgot
//     its bind (srid 4326) must STILL hit the throw.
//
// T-pin: every converted INGESTOR is url'd `http_file` at srid 4326, so neither arm is reachable
// for it and the byte-identical guarantee holds by measurement (T12), not by assertion.
//
// The harness copies the 0w-runner pattern verbatim (its own `fakePool`, `stubsFor`, `runPhase`);
// fixtures live in memory only, never under `data/`.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS libraries */
const stepLib = require(join(process.cwd(), 'scripts/lib/step'));
const stalenessLib = require(join(process.cwd(), 'scripts/lib/step/staleness.js'));
const acquireLib = require(join(process.cwd(), 'scripts/lib/step/acquire.js'));
const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
const ravineCompute = require(join(process.cwd(), 'scripts/lib/compute/load-ravines.js'));
const LOAD_RAVINES = require(join(process.cwd(), 'scripts/load-ravines.descriptor.json'));
const LOAD_ADDRESS_POINTS = require(join(process.cwd(), 'scripts/load-address-points.descriptor.json'));
const LOAD_PARCELS = require(join(process.cwd(), 'scripts/load-parcels.descriptor.json'));
const LOAD_CENTRELINE = require(join(process.cwd(), 'scripts/load-centreline.descriptor.json'));
const LOAD_MASSING = require(join(process.cwd(), 'scripts/load-massing.descriptor.json'));
const LOAD_NEIGHBOURHOODS = require(join(process.cwd(), 'scripts/load-neighbourhoods.descriptor.json'));
/* eslint-enable @typescript-eslint/no-require-imports */

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const noopLog = { info: () => {}, warn: () => {}, error: () => {} };


/**
 * FS — the filesystem PRIMARY. `path` names a repo-relative pattern with one `*` wildcard; the
 * extension resolves case-SENSITIVELY (legacy `endsWith('.csv')`) while the basename is
 * case-insensitive. `csv_options` is mandatory for every `format:"csv"` fixture (A4), and the
 * declared key column is `Legal name` — the wsib source's own CSV header.
 */
const FS = {
  id: 'fs',
  kind: 'filesystem',
  path: 'data/B*.csv',
  format: 'csv',
  csv_options: { bom: true, relax_quotes: false },
  key_property: 'Legal name',
};

/** The fail-closed terminal a path-bearing primary MUST declare (refusal vii). */
const SKIPPED_NO_SOURCE_FILE = {
  id: 'skipped_no_source_file',
  kind: 'skip_gated',
  status: 'completed',
  records_meta: { audit_table: 'object', terminal: 'string' },
  why: {
    text: 'the operator has not dropped the file',
    liveness: { kind: 'file', ref: 'scripts/lib/step/acquire.js' },
  },
};

/**
 * D — the descriptor under test: load_ravines with the filesystem primary REPLACING the CKAN
 * external, `execution.shape:"ingest"` (which bypasses `isIngestStep`'s url fallback), a
 * triggerless staleness posture, and the `skipped_no_source_file` terminal.
 */
function D(): Record<string, unknown> {
  const d = clone(LOAD_RAVINES) as Record<string, unknown> & {
    inputs: { reads: { externals: Array<Record<string, unknown>> } };
    execution: Record<string, unknown>;
    staleness: Record<string, unknown>;
    terminals: Array<Record<string, unknown>>;
  };
  d.inputs.reads.externals = [clone(FS)];
  d.execution.shape = 'ingest';
  d.staleness.trigger = 'none';
  d.terminals.push(clone(SKIPPED_NO_SOURCE_FILE));
  return d;
}

/** D without the fail-closed terminal — the (vii) refusal's fixture. */
function DWithoutTerminal(): Record<string, unknown> {
  const d = D();
  (d as { terminals: Array<Record<string, unknown>> }).terminals =
    (d as { terminals: Array<Record<string, unknown>> }).terminals.filter((t) => t.id !== 'skipped_no_source_file');
  return d;
}

/**
 * D8 — the wsib-shaped no-geometry INGESTOR (load_wsib row 3.5). Composite TEXT key on
 * `(legal_name_normalized, mailing_address)`, `retract:"none"` (no scoped departure DELETE, so no
 * single key array is ever cast), no column binds `wkb_geometry`, no `geometry_kind`, and
 * `guards.srid:"none"` — the DECLARED no-geometry flag G1's schema rule ties to the absent bind.
 */
function D8(): Record<string, unknown> {
  const d = D() as Record<string, unknown> & {
    inputs: { reads: { externals: Array<Record<string, unknown>> } };
    outputs: { writes: Array<Record<string, unknown>> };
    guards: Record<string, unknown>;
  };
  // T8 isolates the NO-GEOMETRY arm, not primary selection: the acquisition is
  // mocked, so swap the path-bearing filesystem fixture back for the url'd ravine
  // primary. Without this the pre-0fs run dies at "0 url-bearing primary" and never
  // reaches the `validateGeometries` call this test exists to fence.
  d.inputs.reads.externals = clone(LOAD_RAVINES.inputs.reads.externals);
  d.identity = { ...(d.identity as Record<string, unknown>), name: 'load_wsib', display_name: 'WSIB', spec: '3.5' };
  d.outputs.writes[0] = {
    table: 'wsib',
    key: ['legal_name_normalized', 'mailing_address'],
    key_sql_type: 'TEXT',
    columns: [
      { name: 'legal_name_normalized', vocabulary: 'none', written: 'step', bind: 'value' },
      { name: 'mailing_address', vocabulary: 'none', written: 'step', bind: 'value' },
      { name: 'created_at', vocabulary: 'none', written: 'db_default', bind: 'value' },
    ],
    write_discipline: {
      class: 'upsert_scoped_departure_delete',
      guard: 'is_distinct_from',
      guard_columns: ['mailing_address'],
      scope: 'none',
      expected_change_ratio: '<= 0.5',
      idempotent_rerun: 'zero_writes',
      txn_scope: 'step',
      why: {
        text: 'The composite TEXT key is the WSIB firm identity; the upsert is the write.',
        liveness: { kind: 'table', ref: 'wsib' },
      },
    },
    retract: 'none',
  };
  d.guards.srid = 'none';
  return d;
}

/**
 * The compute for D's `format:"csv"` filesystem primary: ravine compute + `shapeRecord`
 * (brief 0fs-0b). The runner refuses a csv external whose compute exports no
 * `shapeRecord`, above the HEAD, so without it T6/T7/T7d would die on that refusal.
 */
function fsCompute(): Record<string, unknown> {
  return { ...(ravineCompute as Record<string, unknown>), shapeRecord: vi.fn(() => ({ source_id: 1 })) };
}

/** The two rows D8's compute keeps — the identity the no-geometry arm must preserve. */
const D8_ROWS = [
  { legal_name_normalized: 'a  b', mailing_address: '1 Main St' },
  { legal_name_normalized: 'c  d', mailing_address: '2 Main St' },
];

type FakePoolOpts = { logicVars?: Record<string, unknown> };

/**
 * The minimal fake pool the LR-D9 test in src/tests/step-library.logic.test.ts uses:
 * SQL text is recorded, logic_variables rows are answered, everything else is `{rows: []}`.
 */
function fakePool(opts: FakePoolOpts = {}) {
  const sql: string[] = [];
  const answer = (text: string) => {
    if (text.includes('FROM logic_variables')) {
      return {
        rows: Object.entries(opts.logicVars ?? {}).map(([variable_key, variable_value]) => ({
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
    return { rows: [] };
  };
  const record = async (text: string) => { sql.push(text); return answer(text); };
  return { sql, query: record, connect: async () => ({ query: record, release: () => {} }) };
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

/** The primary's acquisition block — every field the runner reads off `result.acquired`. */
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
    source_path: 'data/BusinessClassificationDetails(2025).csv',
  };
}

/** The pass-through write mock T8 reads `carried` off: two rows in, two rows accounted for. */
function writeArgsMock() {
  return vi.fn(async (_pool: unknown, args: { carried: Array<Record<string, unknown>> }) => ({
    carried: args.carried,
    inserted: args.carried.length,
    updated: 0,
    deleted: 0,
    rows_scanned: args.carried.length,
    rows_changed: args.carried.length,
    unchanged: 0,
    delete_skipped_empty_guard: false,
  }));
}

/** Every stub a `runIngestPhase` call needs, restored by the caller. */
function stubsFor(opts: { acquireImpl?: (args: { external: Record<string, unknown> }) => unknown } = {}) {
  return [
    vi.spyOn(stalenessLib, 'readPriorEmitWithPosture').mockResolvedValue({ prior, error: null }),
    vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({ ravines: { rls_enabled: true, bypassrls: true, policies: 0 } }),
    vi.spyOn(acquireLib, 'acquireExternal').mockImplementation((opts.acquireImpl ?? (async () => ({
      tier1: { skip: false },
      tier2: { skip: false },
      emitBlock: null,
      features: [{ 'Legal name': 'x', geojson: '{}', record: {} }],
      acquired: primaryAcquired(),
    }))) as (...args: unknown[]) => unknown),
    vi.spyOn(writeLib, 'validateGeometries').mockResolvedValue({
      carried: [{ source_id: 1, geom: Buffer.from('') }], repaired: 0, collectionExtracted: 0, skipped: 0, skippedKeys: [],
    }),
    vi.spyOn(writeLib, 'executeWrite').mockResolvedValue({
      inserted: 1, updated: 0, deleted: 0, rows_scanned: 1, rows_changed: 1, unchanged: 0, delete_skipped_empty_guard: false,
    }),
  ] as Array<{ mockRestore: () => void }>;
}

/** The acquisition calls made in this test, in order. */
function acquireCalls(): Array<{ external: { id: string } }> {
  return (acquireLib.acquireExternal as unknown as { mock: { calls: Array<[{ external: { id: string } }]> } }).mock.calls
    .map((c) => c[0]);
}

/** One runner call against the stubbed seams. `compute` defaults to the real ravine module. */
async function runPhase(descriptor: Record<string, unknown>, compute: Record<string, unknown> = ravineCompute as unknown as Record<string, unknown>, config = seedConfig()) {
  return stepLib.runIngestPhase({
    descriptor,
    pool: fakePool({ logicVars: config }),
    compute,
    config,
    fetchImpl: async () => { throw new Error('the runner must not reach the network in this test'); },
    chainId: null,
    log: noopLog,
    tag: '[ingest-0fs-runner]',
    clockNow: new Date('2026-08-26T00:00:00Z'),
    preWriteGate: null,
  });
}

describe('INGESTOR prerequisite 0fs — runner: filesystem primary + no-geometry arm', () => {
  let restored: Array<{ mockRestore: () => void }> = [];
  afterEach(() => {
    for (const s of restored.splice(0)) s.mockRestore();
  });

  // =========================================================================
  // T6 — THE PATH-BEARING PRIMARY IS ACQUIRED.
  //
  // RED before 0fs: `urled` filters on `typeof e.url === 'string'`, so the single
  // path-bearing external is invisible, `primaries.length === 0`, and the run
  // throws "0 url-bearing primary" before any acquisition.
  // =========================================================================
  it('T6 — a path-bearing filesystem primary is passed to acquireExternal, once, by id', async () => {
    restored = stubsFor();
    await runPhase(D(), fsCompute());

    const calls = acquireCalls();
    expect(calls, 'exactly one acquisition — the filesystem primary').toHaveLength(1);
    expect(calls[0]!.external.id, 'the path-bearing primary, selected by hasPath').toBe('fs');
  });

  // =========================================================================
  // T6b — THE FOUR CONSTRUCTION REFUSALS, EACH NAMING THE OFFENDING ID AND
  // EACH COSTING NO NETWORK.
  //
  // RED before 0fs: every one of these RESOLVES today, because a path-free /
  // path-plus-url / path-on-http_file / path-on-lookup external is simply not in
  // the url-bearing set and ravines' own url'd primary still satisfies "exactly
  // ONE". The declared-but-never-fetched class (v) is the 0w `.find` bug's
  // sibling, one axis over.
  // =========================================================================
  it('T6b(v) — a pathless filesystem external rejects naming its id and fetches nothing', async () => {
    const d = clone(LOAD_RAVINES) as Record<string, unknown>;
    (d as { inputs: { reads: { externals: Array<Record<string, unknown>> } } }).inputs.reads.externals
      .push({ id: 'never_fetched_pathless_fs', kind: 'filesystem' });
    restored = stubsFor();

    // The refusal names the offending id AND says the external is not in `sourced`
    // — never the 0w "exactly ONE url-bearing primary" throw, which would name every
    // primary the descriptor declares.
    await expect(runPhase(d)).rejects.toThrow(/"never_fetched_pathless_fs" carries neither a url nor a filesystem path/);
    expect(acquireLib.acquireExternal, 'a mis-declared descriptor must cost no network').not.toHaveBeenCalled();
  });

  it('T6b(viii) — an external carrying BOTH url and path rejects naming its id and fetches nothing', async () => {
    const d = clone(LOAD_RAVINES) as Record<string, unknown>;
    (d as { inputs: { reads: { externals: Array<Record<string, unknown>> } } }).inputs.reads.externals
      .push({
        id: 'both_url_and_path',
        kind: 'http_file',
        url: 'http://x',
        path: 'data/x.csv',
        format: 'csv',
        csv_options: { bom: false, relax_quotes: false },
      });
    restored = stubsFor();

    // `both_url_and_path` carries a url, so it IS in `urled`: today the run refuses
    // with "2 url-bearing primary external(s)" — the WRONG refusal (the pair is the
    // defect, not the count), and one that would change meaning under `load_heritage`'s
    // multi-primary widening. The (viii) refusal is the one that must fire.
    await expect(runPhase(d)).rejects.toThrow(/"both_url_and_path" declares a path with a url/);
    expect(acquireLib.acquireExternal, 'a mis-declared descriptor must cost no network').not.toHaveBeenCalled();
  });

  it('T6b(viii) — a path on a non-filesystem kind rejects naming its id and fetches nothing', async () => {
    const d = clone(LOAD_RAVINES) as Record<string, unknown>;
    (d as { inputs: { reads: { externals: Array<Record<string, unknown>> } } }).inputs.reads.externals
      .push({ id: 'path_on_http_file', kind: 'http_file', path: 'data/x.csv', format: 'csv', csv_options: { bom: false, relax_quotes: false } });
    restored = stubsFor();

    await expect(runPhase(d)).rejects.toThrow(/"path_on_http_file" declares a path with kind "http_file"/);
    expect(acquireLib.acquireExternal, 'a mis-declared descriptor must cost no network').not.toHaveBeenCalled();
  });

  it('T6b(vi) — a lookup carrying a path rejects naming its id and fetches nothing', async () => {
    const d = clone(LOAD_RAVINES) as Record<string, unknown>;
    (d as { inputs: { reads: { externals: Array<Record<string, unknown>> } } }).inputs.reads.externals
      .push({ id: 'lookup_with_path', kind: 'filesystem', path: 'data/x.xlsx', format: 'xlsx', role: 'lookup' });
    restored = stubsFor();

    // `lookup_with_path` has no url, so today it is not a lookup at all — it is
    // silently dropped from `lookups` and the primary's download proceeds.
    await expect(runPhase(d)).rejects.toThrow(/"lookup_with_path" is role "lookup" with a path/);
    expect(acquireLib.acquireExternal, 'a mis-declared descriptor must cost no network').not.toHaveBeenCalled();
  });

  // =========================================================================
  // T7 — THE MISSING-FILE SKIP CARRIES ITS OWN SIGNAL.
  //
  // RED before 0fs: `signal` is `result.tier1.skip ? 'source_validator' : …`, so a
  // `no_source_file` tier-1 skip is stamped `source_validator` and the terminal
  // narrowed by that discriminator is the WRONG one.
  // =========================================================================
  const missingFileResult = () => ({
    tier1: { skip: true, reason: 'no_source_file' },
    tier2: { skip: false, reason: 'not_reached' },
    features: [],
    acquired: {},
    emitBlock: { skipped_reason: 'no_source_file' },
  });

  it('T7 — a no_source_file tier-1 skip yields {skipped, reason, signal} all "no_source_file"', async () => {
    restored = stubsFor({ acquireImpl: missingFileResult });
    const out = await runPhase(D(), fsCompute()) as { skipped: boolean; reason: string; signal: string };

    expect(out.skipped).toBe(true);
    expect(out.reason).toBe('no_source_file');
    expect(out.signal, 'the signal IS the discriminator the terminal is narrowed by').toBe('no_source_file');
    expect(acquireLib.acquireExternal, 'the absent file costs one acquisition attempt and no download').toHaveBeenCalledTimes(1);
  });

  it('T7 — the same hold under a standing force_run override: a forced run with an absent file still skips as no_source_file', async () => {
    restored = [
      ...stubsFor({ acquireImpl: missingFileResult }),
      vi.spyOn(stalenessLib, 'resolveOverrides').mockReturnValue({ force_run: true }),
    ];
    const out = await runPhase(D(), fsCompute()) as { skipped: boolean; reason: string; signal: string };

    expect(out.skipped).toBe(true);
    expect(out.reason).toBe('no_source_file');
    expect(out.signal).toBe('no_source_file');
  });

  it('T7 — selectTerminal picks skipped_no_source_file over an added skipped_source_validator', async () => {
    const d = D() as { terminals: Array<Record<string, unknown>> };
    d.terminals.push({
      id: 'skipped_source_validator',
      kind: 'skip_gated',
      status: 'completed',
      records_meta: { audit_table: 'object', terminal: 'string' },
    });
    const picked = stepLib.selectTerminal(d, { kind: 'skip_gated', status: 'completed', discriminator: 'no_source_file' });
    expect(picked && picked.id).toBe('skipped_no_source_file');
  });

  // =========================================================================
  // T7b — REFUSAL (vii), FAIL-CLOSED.
  //
  // A path-bearing primary whose descriptor declares NO `skip_gated` terminal
  // whose id includes `no_source_file` is refused BEFORE the acquisition:
  // `selectTerminal` falls back to `pool[0]`, so the missing file would be
  // mislabelled `skipped_source_validator` and the operator would read a
  // staleness skip where the truth is "the file was never dropped".
  //
  // RED before 0fs: the descriptor resolves and the acquisition is attempted.
  // =========================================================================
  it('T7b — a path primary without a no_source_file terminal rejects /no_source_file/ before any fetch', async () => {
    restored = stubsFor();
    await expect(runPhase(DWithoutTerminal(), fsCompute()))
      .rejects.toThrow(/no_source_file/);
    expect(acquireLib.acquireExternal, 'the refusal is construction — it must precede the HEAD').not.toHaveBeenCalled();
  });

  // =========================================================================
  // T7d — A3: AN INTERRUPTED RETRACTION PLUS AN ABSENT FILE IS A REFUSAL, NOT A SKIP.
  //
  // A COMPLETED skip advances `own_last_completed` and ERASES the interrupted
  // state, so the retraction the crashed run owed would never be re-run. With an
  // interrupted prior run the absence is an error, not a legitimately absent
  // operator file. RED before 0fs: the run resolves as a skip.
  // =========================================================================
  it('T7d — an interrupted retraction concurrent with an absent file rejects /interrupted/', async () => {
    restored = [
      ...stubsFor({ acquireImpl: missingFileResult }),
      vi.spyOn(stalenessLib, 'detectInterruptedRetraction').mockResolvedValue({ interrupted: true, row: { id: 1, status: 'crashed' } }),
    ];
    await expect(runPhase(D(), fsCompute())).rejects.toThrow(/interrupted/);
  });

  // =========================================================================
  // T8 — THE NO-GEOMETRY ARM (b): an INGESTOR with no wkb bind and srid "none"
  // keeps EVERY row and never reaches the validator.
  //
  // RED before 0fs: `write.validateGeometries` is called unconditionally and
  // throws at write.js "no column declares bind wkb_geometry, so the validated
  // geometry has nowhere to land", so the run cannot complete at all.
  // =========================================================================
  it('T8 — no wkb bind + srid "none": validateGeometries is not called, every row is carried, geometry counters are 0', async () => {
    const compute = {
      ...ravineCompute,
      shapeRecord: vi.fn(() => clone(D8_ROWS[0]!)),
      coerceKey: (r: unknown) => r,
      dedupeBySourceId: (rows: Array<Record<string, unknown>>) => ({ kept: rows, duplicateCount: 0 }),
      validatorCounterDelta: () => ({}),
    };
    restored = [
      vi.spyOn(stalenessLib, 'readPriorEmitWithPosture').mockResolvedValue({ prior: null, error: null }),
      vi.spyOn(writeLib, 'assertWritePrivileges').mockResolvedValue({ wsib: { rls_enabled: true, bypassrls: true, policies: 0 } }),
      vi.spyOn(acquireLib, 'acquireExternal').mockResolvedValue({
        tier1: { skip: false },
        tier2: { skip: false },
        emitBlock: null,
        features: [
          { 'Legal name': 'a  b', geojson: null, record: { 'Mailing address': '1 Main St' } },
          { 'Legal name': 'c  d', geojson: null, record: { 'Mailing address': '2 Main St' } },
        ],
        acquired: {
          feature_count: 2,
          rows_parsed: 2,
          invalid_geometry_skipped: 0,
          invalid_geometry_repaired: 0,
          geometry_collection_extracted: 0,
          skipped_keys: [],
          content_hash: 'cc',
          source_dataset_version: 'cc',
        },
      }),
      // A PASS-THROUGH spy with NO mock implementation: if the runner calls it,
      // the real function throws "nowhere to land" — which is the point.
      vi.spyOn(writeLib, 'validateGeometries'),
      vi.spyOn(writeLib, 'executeWrite').mockImplementation(writeArgsMock() as never),
    ];
    // shapeRecord is called once per feature, so the two rows are distinct.
    const rows = [clone(D8_ROWS[0]!), clone(D8_ROWS[1]!)];
    let i = 0;
    (compute.shapeRecord as unknown as { mockImplementation: (f: () => unknown) => void })
      .mockImplementation(() => rows[i++]);

    const out = await runPhase(D8(), compute) as { acquired: Record<string, number> };

    expect(writeLib.validateGeometries, 'srid "none" + no wkb bind === the validator has nothing to do').toHaveBeenCalledTimes(0);
    const args = (writeLib.executeWrite as unknown as { mock: { calls: Array<[unknown, { carried: unknown }]> } }).mock.calls[0]![1];
    expect(args.carried, 'EVERY shaped row is carried — the no-geometry arm is the IDENTITY').toEqual([
      { legal_name_normalized: 'a  b', mailing_address: '1 Main St' },
      { legal_name_normalized: 'c  d', mailing_address: '2 Main St' },
    ]);
    expect(out.acquired.invalid_geometry_repaired).toBe(0);
    expect(out.acquired.invalid_geometry_stored).toBe(0);
    expect(out.acquired.invalid_geometry_skipped).toBe(0);
    expect(out.acquired.geometry_collection_extracted).toBe(0);
    // I5: `buildWritePlan` THROWS on a derived column with no geometry column, so a
    // runtime "derived" clause in the no-geometry arm could never be true. Assert the
    // structural fact instead of adding dead code.
    const plan = writeLib.buildWritePlan((D8() as { outputs: { writes: Array<Record<string, unknown>> } }).outputs.writes[0], D8());
    expect(plan.derived_columns, 'a no-geometry write has no derived measure to compute').toEqual([]);
  });

  // =========================================================================
  // T9(i) PIN — the FENCE, NOT the arm: NO wkb bind + srid 4326 STILL throws at
  // validateGeometries. `srid:"none"` is the DECLARED no-geometry flag; a
  // geometry step that forgot its bind must keep failing by name (`1a440908`).
  // GREEN before 0fs — this test exists so the arm above cannot be widened into
  // "no wkb bind at all ⇒ skip the validator".
  //
  // The primary is the URL-bearing ravine external on purpose: this is the
  // pre-0fs-REACHABLE path (the throw happens today, without any selection or
  // no-geometry change), so the PIN witnesses the FENCE, not the new arm. The
  // writes are D8's (no wkb bind) with srid 4326, i.e. the "forgot the bind"
  // descriptor the throw exists to catch.
  // =========================================================================
  it('T9(i) — no wkb bind + srid 4326 still rejects /nowhere to land/', async () => {
    const d = clone(LOAD_RAVINES) as Record<string, unknown>;
    (d as { outputs: { writes: Array<Record<string, unknown>> } }).outputs.writes[0] =
      (D8() as { outputs: { writes: Array<Record<string, unknown>> } }).outputs.writes[0]!;
    restored = stubsFor();
    // A PASS-THROUGH spy: the real `validateGeometries` must run, so the fence is
    // exercised rather than a mock's return value.
    restored[3]!.mockRestore();
    restored[3] = vi.spyOn(writeLib, 'validateGeometries');
    await expect(runPhase(d)).rejects.toThrow(/nowhere to land/);
  });

  // =========================================================================
  // T9(ii) PIN — a plain geometry INGESTOR is byte-identical: validateGeometries
  // is called exactly once with the plan, the kept rows, the classifier, and the
  // {log, tag} context.
  // =========================================================================
  it('T9(ii) — a plain ravines descriptor still calls validateGeometries exactly once', async () => {
    restored = stubsFor();
    await runPhase(clone(LOAD_RAVINES) as unknown as Record<string, unknown>);
    expect(writeLib.validateGeometries, 'the geometry arm is untouched for every converted INGESTOR').toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // T10 PIN — the wsib-shaped plan RENDERS: composite TEXT conflict target,
  // no departure DELETE, no validation SQL. This is the plan the no-geometry arm
  // runs against, and the reason it needs no `keys[0]`-only statement.
  // =========================================================================
  it('T10 — buildWritePlan for D8 renders the composite ON CONFLICT and no delete/validation SQL', async () => {
    const d = D8() as { outputs: { writes: Array<Record<string, unknown>> } };
    const plan = writeLib.buildWritePlan(d.outputs.writes[0], d) as {
      upsertSqlFor: (n: number) => string;
      delete_sql: string | null;
      validation_sql: string | null;
    };
    expect(plan.upsertSqlFor(1)).toContain('ON CONFLICT (legal_name_normalized, mailing_address)');
    expect(plan.delete_sql, 'retract "none" — no scoped departure DELETE').toBeNull();
    expect(plan.validation_sql, 'no geometry kind — no validator SQL is rendered').toBeNull();
  });

  // =========================================================================
  // T12 PIN — the byte-identical guarantee, MEASURED: no converted INGESTOR
  // declares `path` or `kind:"filesystem"`, so neither arm is reachable for any
  // of them and the five fleet captures cannot move on this axis.
  // =========================================================================
  it('T12 — no converted INGESTOR declares a path or a filesystem external', () => {
    for (const [name, descriptor] of [
      ['load-ravines', LOAD_RAVINES],
      ['load-address-points', LOAD_ADDRESS_POINTS],
      ['load-parcels', LOAD_PARCELS],
      ['load-centreline', LOAD_CENTRELINE],
      ['load-massing', LOAD_MASSING],
      ['load-neighbourhoods', LOAD_NEIGHBOURHOODS],
    ] as Array<[string, { inputs: { reads: { externals: Array<Record<string, unknown>> } } }]>) {
      for (const e of descriptor.inputs.reads.externals) {
        expect(Object.prototype.hasOwnProperty.call(e, 'path'), `${name}: no path-bearing external`).toBe(false);
        expect(e.kind, `${name}: no filesystem external`).not.toBe('filesystem');
      }
    }
  });
});
