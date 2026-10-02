// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md
//
// Batch-2 row 3.4 ① — the LOAD-HERITAGE legacy oracle.
//
// This module does NOT load `scripts/load-heritage.js` through the pipeline SDK. Two reasons:
// (1) when the ② conversion lands, that live path becomes the §5.1 frozen `pipeline.step(...)`
// shell — a stub with no legacy logic left to observe; and (2) driving it in-process would hit
// Postgres. So the oracle reads the VERBATIM legacy source text committed beside it as
// `fixtures/legacy-load-heritage.js.txt` (identical to `scripts/load-heritage.js` at the ①
// freeze), strips the leading shebang, and evaluates it inside a `new Function` with a curated
// CommonJS `require` shim.
//
// Curated shim: `./lib/pipeline` is a FAKE (log capture, transaction/advisory-lock wrappers,
// summary/meta capture, row-budget math); `./lib/config-loader` returns an empty `logicVars`
// (so the script's zod ConfigSchema defaults apply untouched); `./lib/safe-math` and
// `./lib/source-version` are the REAL modules (absolute paths) so skip-check semantics are the
// shipped ones, not a re-implementation; node builtins resolve to the real modules; and the two
// heavy native deps (`node-stream-zip`, `shapefile`) are fakes driven by the `body` fixtures.
//
// The oracle's job (Spec 123 §4.5): a future converted implementation must reproduce the legacy
// OBSERVABLE BEHAVIOUR — the ordered `pool.query()` SQL/params stream, the `emitSummary` /
// `emitMeta` payloads, the `fetch` HEAD/GET stream, and the `pipeline.log` lines — without the
// legacy text being the source of truth for the new implementation. Every observable is captured
// on the returned `LegacyOracle` so a red suite can pin it before any conversion lands.

import fs from 'fs';
import path from 'path';

/** Repo root, derived from this file's location (src/tests/steps/load_heritage/fixtures/). */
const REPO_ROOT = path.resolve(__dirname, '../../../../../');
// ①: the legacy source text, committed VERBATIM beside this harness and never edited after the
// freeze. `__dirname` is still passed as `scripts/` below, so the legacy relative requires resolve
// exactly as they did when the file lived at `scripts/load-heritage.js`.
const SCRIPT_REL = 'src/tests/steps/load_heritage/fixtures/legacy-load-heritage.js.txt';
const SAFE_MATH_REL = 'scripts/lib/safe-math.js';
const SOURCE_VERSION_REL = 'scripts/lib/source-version.js';

/** Default HTTP validators used when a dataset's `head` block is not overridden. */
const DEFAULT_LAST_MODIFIED = 'Tue, 01 Sep 2026 22:16:33 GMT';
const DEFAULT_ETAG = '"e1"';

/** Substring that distinguishes the HCD url (upstream CKAN slug) from the Register url. */
const HCD_URL_MARKER = 'heritageconservationdistrict';

/** The two per-dataset keys this oracle knows about. */
export type DatasetKey = 'heritage_register' | 'heritage_districts';

/** One raw shapefile feature as the fake `shapefile.open()` reader yields it. */
export interface LegacyFeature {
  properties: Record<string, unknown>;
  geometry: Record<string, unknown> | null;
}

/**
 * Shape of `fixtures/heritage-features.json` — one feature list per dataset, plus an optional
 * `_why` provenance note (ignored by the callers).
 */
export interface FeaturesFixture {
  _why?: string;
  heritage_register?: LegacyFeature[];
  heritage_districts?: LegacyFeature[];
}

/** Per-dataset fake HEAD-response overrides (defaults: 200 / canned HTTP date / canned ETag). */
export interface HeadOverride {
  status?: number;
  lastModified?: string | null;
  etag?: string | null;
}

/** A captured `pipeline.log.<level>(...)` call. */
export interface LogRecord {
  level: string;
  args: unknown[];
}

/** A captured `fetch(url, init)` call (`method` defaults to `GET`, matching the platform). */
export interface FetchCall {
  url: string;
  method: string;
  key: DatasetKey;
}

/** A captured `pool.query(sql, params)` call. */
export interface QueryCall {
  sql: string;
  params: unknown[];
}

/** The recorded `emitSummary(...)` argument. */
export interface SummaryRecord {
  records_total: number;
  records_new: number;
  records_updated: number;
  records_meta: Record<string, unknown>;
}

/** The recorded `emitMeta(reads, writes, externals)` triplet. */
export interface MetaRecord {
  reads: Record<string, string[]>;
  writes: Record<string, string[]>;
  externals: string[];
}

/** The `rowCount` the fake pool reports for a `DELETE FROM heritage_*` statement. */
export interface DeleteResultRow {
  rows: Record<string, unknown>[];
  rowCount: number;
}

/**
 * Fake `pg`-shaped pool: records every query and returns canned rows keyed off the SQL shape
 * (prior-run read, validation round-trip, upsert RETURNING, orphan delete).
 */
export interface FakePool {
  queries: QueryCall[];
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] } & Partial<DeleteResultRow>>;
}

/** The real `./lib/safe-math` exports injected into the evaluated source. */
export interface SafeMathModule {
  safeParsePositiveInt(value: unknown, label: string): number;
  safeParseFloat(value: unknown, label: string): number;
  safeParseIntOrNull(value: unknown): number | null;
}

/** Handle returned by `loadLegacy`. */
export interface LegacyOracle {
  /** Drive the script's `main(pool)` against the fake pool (applying `env` for the duration). */
  runMain(): Promise<void>;
  /** The evaluated script's `module.exports` (pure helpers + SQL constants + url constants). */
  helpers: Record<string, unknown>;
  pool: FakePool;
  summaries: SummaryRecord[];
  metas: MetaRecord[];
  logs: LogRecord[];
  fetchCalls: FetchCall[];
  /** Number of `pipeline.withTransaction()` invocations observed. */
  txns(): number;
}

/** Options for `loadLegacy`. Every field is optional; defaults reproduce the happy path. */
export interface LegacyOpts {
  /** Parsed `fixtures/heritage-features.json`; defaults to the committed fixture file. */
  features?: FeaturesFixture;
  /** Per-dataset fake HEAD response (`status` / `lastModified` / `etag`). */
  head?: {
    heritage_register?: HeadOverride;
    heritage_districts?: HeadOverride;
  };
  /** Per-dataset GET bytes; defaults to `JSON.stringify(features[key])`. */
  body?: {
    heritage_register?: string;
    heritage_districts?: string;
  };
  /** Whatever the prior-run read returns as `records_meta` (null → first run). */
  priorMeta?: Record<string, unknown> | null;
  /** When true, the prior-run read throws (`prior read boom`). */
  priorError?: boolean;
  /** Source ids already present in each table (drives the orphan-DELETE rowCount). */
  existing?: {
    heritage_properties?: number[];
    heritage_districts?: number[];
  };
  /** Source ids to report as `{ is_insert: false }` in the upsert RETURNING stream. */
  unchanged?: {
    heritage_properties?: number[];
    heritage_districts?: number[];
  };
  /** Per-id validation status override (see the default status matrix below). */
  validation?: Record<number, string>;
  /** When false the advisory lock reports `{ acquired: false }` and `main()` is a no-op. */
  lockAcquired?: boolean;
  /** Environment variables applied to `process.env` for the duration of `runMain()`. */
  env?: Record<string, string>;
  /** Value returned by `pipeline.getDbTimestamp(pool)`; defaults to 2026-09-30T00:00:00Z. */
  runAt?: Date;
}

// ---------------------------------------------------------------------------
// Local structural aliases for the evaluated (untyped, plain-JS) source's shapes
// ---------------------------------------------------------------------------

/** A shapefile reader as `shapefile.open()` returns it. */
interface FakeShapefileReader {
  read(): Promise<
    | { done: false; value: { type: 'Feature'; properties: Record<string, unknown>; geometry: Record<string, unknown> | null } }
    | { done: true }
  >;
}

/** The `shapefile` module shim handed to the evaluated source. */
interface ShapefileModule {
  open(shpPath: string): Promise<FakeShapefileReader>;
}

/** The `node-stream-zip` module shim handed to the evaluated source. */
interface StreamZipModule {
  async: new (opts: { file: string }) => {
    extract(path: string | null, destDir: string): Promise<void>;
    entries(): Promise<Record<string, { name: string }>>;
    close(): Promise<void>;
  };
}

/** A fake pool-shaped client handed to `withTransaction` callbacks. */
interface TxClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }>;
}

/** The callback type the legacy source registers via `pipeline.run(name, cb)`. */
type MainCallback = (pool: unknown) => Promise<void>;

/**
 * Number of values each multi-row `INSERT` may carry before Postgres' 65535 bind-parameter
 * ceiling — the SDK's own `maxRowsPerInsert` contract (mirrored so `emitMeta` batching matches).
 * The fake pipeline reproduces the SDK's `Math.floor(65535 / n)`; we only need it for structural
 * typing, so an empty interface-free alias is enough.
 */
type MaxRowsPerInsert = (columnsPerRow: number) => number;

/** The fake `./lib/pipeline` module. */
interface FakePipeline {
  log: { info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void };
  run(name: string, cb: MainCallback): void;
  getDbTimestamp(pool: unknown): Promise<Date>;
  withTransaction<T>(pool: unknown, fn: (client: TxClient) => Promise<T>): Promise<T>;
  withAdvisoryLock(
    pool: unknown,
    lockId: number,
    fn: () => Promise<unknown>,
  ): Promise<{ acquired: boolean; lockId?: number; result?: unknown }>;
  emitSummary(payload: SummaryRecord): void;
  emitMeta(
    reads: Record<string, string[]>,
    writes: Record<string, string[]>,
    externals: string[],
  ): void;
  maxRowsPerInsert: MaxRowsPerInsert;
}

/** The fake `./lib/config-loader` module. */
interface FakeConfigLoader {
  loadMarketplaceConfigs(pool: unknown, name: string): Promise<{ logicVars: Record<string, unknown> }>;
}

// ---------------------------------------------------------------------------
// Defaults + small pure helpers
// ---------------------------------------------------------------------------

/** Key a shapefile path (`.shp`, basename only) or a fake zip entry back to its dataset. */
function datasetKeyFromName(name: string): DatasetKey {
  const base = path.basename(name).toLowerCase();
  if (/heritage[-_]districts/.test(base)) return 'heritage_districts';
  if (/heritage[-_]register/.test(base)) return 'heritage_register';
  throw new Error(`[legacy-harness] cannot map "${name}" to a heritage dataset`);
}

/** Key a fetched url back to its dataset by the upstream CKAN slug it carries. */
function datasetKeyFromUrl(url: string): DatasetKey {
  return url.includes(HCD_URL_MARKER) ? 'heritage_districts' : 'heritage_register';
}

/** `true` for any 2xx status. */
function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * Case-insensitive response-header lookup (the platform lower-cases keys; the harness tolerates
 * mixed case so a caller can pass `Last-Modified` and still hit the legacy `headers.get` path).
 */
function headerLookup(
  headers: { lastModified: string | null; etag: string | null },
  name: string,
): string | null {
  const key = name.toLowerCase();
  if (key === 'last-modified') return headers.lastModified;
  if (key === 'etag') return headers.etag;
  return null;
}

/** Read + parse `fixtures/heritage-features.json` when the caller does not supply one. */
function readDefaultFeatures(): FeaturesFixture {
  const raw = fs.readFileSync(path.join(REPO_ROOT, 'src/tests/steps/load_heritage/fixtures/heritage-features.json'), 'utf8');
  return JSON.parse(raw) as FeaturesFixture;
}

/** Absolutize a `features` option that is a relative path (default: the committed fixture). */
function resolveFeatures(opts: LegacyOpts): FeaturesFixture {
  if (opts.features !== undefined) return opts.features;
  return readDefaultFeatures();
}

// ---------------------------------------------------------------------------
// loadLegacy — evaluate the legacy source text against the fakes
// ---------------------------------------------------------------------------

/**
 * Reads the legacy source (fixture copy `fixtures/legacy-load-heritage.js.txt`) as SOURCE TEXT,
 * evaluates it with a curated `require` shim, and returns handles onto its exports plus the
 * observable capture surfaces.
 *
 * The script's module-scope guard `if (require.main === module)` never fires inside the
 * `new Function` sandbox (the shimmed `module` has no `require.main`), so nothing runs until the
 * caller invokes `runMain()`. The trailing assignment exposes `main`, the pure helpers, and the
 * SQL/url constants that `module.exports` does not already carry.
 */
export function loadLegacy(opts: LegacyOpts = {}): LegacyOracle {
  const features = resolveFeatures(opts);
  const runAt = opts.runAt ?? new Date('2026-09-30T00:00:00Z');
  const lockAcquired = opts.lockAcquired !== false;

  const headOverride: Record<DatasetKey, HeadOverride> = {
    heritage_register: opts.head?.heritage_register ?? {},
    heritage_districts: opts.head?.heritage_districts ?? {},
  };
  const existing = {
    heritage_properties: new Set(opts.existing?.heritage_properties ?? []),
    heritage_districts: new Set(opts.existing?.heritage_districts ?? []),
  };
  const unchanged = {
    heritage_properties: new Set(opts.unchanged?.heritage_properties ?? []),
    heritage_districts: new Set(opts.unchanged?.heritage_districts ?? []),
  };
  const validation = opts.validation ?? {};

  const summaries: SummaryRecord[] = [];
  const metas: MetaRecord[] = [];
  const logs: LogRecord[] = [];
  const fetchCalls: FetchCall[] = [];
  let txnCount = 0;

  /** `Object.fromEntries`-style override map so `body[key]` beats the JSON default. */
  const hasBody = (key: DatasetKey): boolean => opts.body?.[key] !== undefined;
  const bodyFor = (key: DatasetKey): string =>
    hasBody(key) ? String(opts.body?.[key]) : JSON.stringify(features[key] ?? []);

  // --- fake ./lib/pipeline -------------------------------------------------
  const fakePipeline: FakePipeline = {
    log: {
      info(...args: unknown[]): void {
        logs.push({ level: 'info', args });
      },
      warn(...args: unknown[]): void {
        logs.push({ level: 'warn', args });
      },
      error(...args: unknown[]): void {
        logs.push({ level: 'error', args });
      },
    },
    // Never reached: the legacy guard `if (require.main === module)` is false under the shim,
    // so the script never calls run(); runMain() calls the exported main(pool) directly.
    run(_name: string, _cb: MainCallback): void {},
    getDbTimestamp(): Promise<Date> {
      return Promise.resolve(runAt);
    },
    async withTransaction<T>(pool: unknown, fn: (client: TxClient) => Promise<T>): Promise<T> {
      txnCount += 1;
      void pool;
      return fn(poolClient);
    },
    async withAdvisoryLock(
      pool: unknown,
      lockId: number,
      fn: () => Promise<unknown>,
    ): Promise<{ acquired: boolean; lockId?: number; result?: unknown }> {
      if (!lockAcquired) return { acquired: false, lockId };
      const result = await fn();
      void pool;
      return { acquired: true, lockId, result };
    },
    emitSummary(payload: SummaryRecord): void {
      summaries.push(payload);
    },
    emitMeta(
      reads: Record<string, string[]>,
      writes: Record<string, string[]>,
      externals: string[],
    ): void {
      metas.push({ reads, writes, externals });
    },
    maxRowsPerInsert(columnsPerRow: number): number {
      return Math.floor(65535 / columnsPerRow);
    },
  };

  // --- fake ./lib/config-loader -------------------------------------------
  const fakeConfigLoader: FakeConfigLoader = {
    loadMarketplaceConfigs(): Promise<{ logicVars: Record<string, unknown> }> {
      // Empty logicVars → ConfigSchema.parse({}) → every zod `.default()` lane is exercised.
      return Promise.resolve({ logicVars: {} });
    },
  };

  // --- real ./lib/safe-math + ./lib/source-version ------------------------
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const safeMath = require(path.join(REPO_ROOT, SAFE_MATH_REL)) as SafeMathModule;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sourceVersion = require(path.join(REPO_ROOT, SOURCE_VERSION_REL)) as Record<string, unknown>;

  // --- fake node-stream-zip ------------------------------------------------
  // The legacy flow never reads real zip bytes: it downloads, extracts, then calls
  // `locateShapefile()` over the extracted dir. We mint exactly one `<key>.shp` + `<key>.dbf`
  // pair per extract so `readdirSync` finds a single, well-formed shapefile.
  const zipEntries: Record<DatasetKey, string[]> = {
    heritage_register: ['heritage_register.shp', 'heritage_register.dbf'],
    heritage_districts: ['heritage_districts.shp', 'heritage_districts.dbf'],
  };
  const fakeStreamZip: StreamZipModule = {
    async: class FakeStreamZip {
      private readonly key: DatasetKey;

      constructor(o: { file: string }) {
        const m = /heritage-(heritage_register|heritage_districts)-/.exec(o.file);
        if (!m) throw new Error(`[legacy-harness] cannot map zip "${o.file}" to a heritage dataset`);
        this.key = m[1] as DatasetKey;
      }

      extract(_p: string | null, destDir: string): Promise<void> {
        fs.mkdirSync(destDir, { recursive: true });
        const names = zipEntries[this.key];
        for (const name of names) {
          fs.writeFileSync(path.join(destDir, name), '');
        }
        return Promise.resolve();
      }

      entries(): Promise<Record<string, { name: string }>> {
        return Promise.resolve(
          Object.fromEntries(zipEntries[this.key].map((name) => [name, { name }])),
        );
      }

      close(): Promise<void> {
        return Promise.resolve();
      }
    },
  };

  // --- fake shapefile ------------------------------------------------------
  // Each `open(shpPath)` start a fresh cursor over a fixture private COPY (the legacy parser
  // never mutates features, but a copy keeps any future red-suite loop from sharing state).
  function makeReader(items: LegacyFeature[]): FakeShapefileReader {
    let index = 0;
    return {
      read(): Promise<
        | {
            done: false;
            value: {
              type: 'Feature';
              properties: Record<string, unknown>;
              geometry: Record<string, unknown> | null;
            };
          }
        | { done: true }
      > {
        if (index >= items.length) return Promise.resolve({ done: true });
        const item = items[index];
        index += 1;
        if (item === undefined) return Promise.resolve({ done: true });
        return Promise.resolve({
          done: false,
          value: { type: 'Feature', properties: item.properties, geometry: item.geometry },
        });
      },
    };
  }

  const fakeShapefile: ShapefileModule = {
    open(shpPath: string): Promise<FakeShapefileReader> {
      const key = datasetKeyFromName(shpPath);
      return Promise.resolve(makeReader(features[key] ?? []));
    },
  };

  // --- fetch ---------------------------------------------------------------
  const fetchShim = (url: string, init: { method?: string } = {}): Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    headers: { get(name: string): string | null };
    body?: ReadableStream<Uint8Array>;
  }> => {
    const key = datasetKeyFromUrl(url);
    fetchCalls.push({ url, method: init.method ?? 'GET', key });

    const override = headOverride[key];
    const status = override.status ?? 200;
    const headers = {
      lastModified: override.lastModified !== undefined ? override.lastModified : DEFAULT_LAST_MODIFIED,
      etag: override.etag !== undefined ? override.etag : DEFAULT_ETAG,
    };

    const response: {
      ok: boolean;
      status: number;
      statusText: string;
      headers: { get(name: string): string | null };
      body?: ReadableStream<Uint8Array>;
    } = {
      ok: isOk(status),
      status,
      statusText: 'ERR',
      headers: { get: (name: string) => headerLookup(headers, name) },
    };

    if ((init.method ?? 'GET') === 'GET') {
      const bytes = new TextEncoder().encode(bodyFor(key));
      response.body = new ReadableStream<Uint8Array>({
        start(controller): void {
          controller.enqueue(bytes);
          controller.close();
        },
      });
    }
    return Promise.resolve(response);
  };

  // --- fake pool -----------------------------------------------------------
  // `poolClient` IS `pool` (the SDK's withTransaction hands the same handle back), so a query
  // issued inside a transaction is still captured — and counted — by the one recorder.
  const poolClient: TxClient = {
    query(sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }> {
      pool.queries.push({ sql, params });

      // Prior-run meta read (source-version.js readPriorRunMeta).
      if (/FROM pipeline_runs/.test(sql)) {
        if (opts.priorError) return Promise.reject(new Error('prior read boom'));
        if (opts.priorMeta === null || opts.priorMeta === undefined) return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [{ records_meta: opts.priorMeta }] });
      }

      // §3.5 batched geometry validation — one dispatch per source_id in `$1`.
      if (/WITH input AS/.test(sql)) {
        const ids = Array.isArray(params[0]) ? (params[0] as unknown[]) : [];
        const pointSql = !/ST_MakeValid/.test(sql);
        const rows = ids.map((rawId) => {
          const id = Number(rawId);
          const override = validation[id];
          const status = override ?? defaultValidationStatus(id, params, pointSql);
          return {
            source_id: String(id),
            status,
            geom_wkb: Buffer.from(JSON.stringify({ id, status })),
            is_valid_original: true,
          };
        });
        return Promise.resolve({ rows });
      }

      // Upsert RETURNING (xmax = 0) AS is_insert — one row per bind slot group.
      const insert = sql.match(/^\s*INSERT INTO\s+(heritage_\w+)/);
      if (insert) {
        const table = String(insert[1]);
        const ids = idsEveryNth(params, table === 'heritage_properties' ? 12 : 9);
        const skip = table === 'heritage_properties' ? unchanged.heritage_properties : unchanged.heritage_districts;
        const rows = ids
          .filter((id) => !skip.has(id))
          .map((id) => ({ is_insert: !existingFor(table).has(id) }));
        return Promise.resolve({ rows });
      }

      // F-C1-guarded orphan DELETE — rowCount = existing ids the loaded set no longer covers.
      const del = sql.match(/^\s*DELETE FROM\s+(heritage_\w+)/);
      if (del) {
        const table = String(del[1]);
        const loaded = new Set(parseBidArray(params[0]));
        const rows = [...existingFor(table)].filter((id) => !loaded.has(id));
        return Promise.resolve({ rows: [], rowCount: rows.length });
      }

      return Promise.resolve({ rows: [] });
    },
  };

  const pool: FakePool = {
    queries: [],
    query: poolClient.query as FakePool['query'],
  };

  /** Source ids already present in a table, for `is_insert` / DELETE-rowCount derivation. */
  function existingFor(table: string): Set<number> {
    return table === 'heritage_properties' ? existing.heritage_properties : existing.heritage_districts;
  }

  /**
   * Default §3.5 status well-formedness matrix, keyed off the SQL shape:
   *   - point lane (no `ST_MakeValid`): Point → accepted, anything else → skipped_unsupported_type
   *   - polygon lane: Polygon/MultiPolygon → accepted, anything else → skipped_unsupported_type
   * The geometry a given `source_id` carries is unknowable here (the fake pool never sees it), so
   * the default reads the id's position in `$2`; callers that care pin `validation[id]` instead.
   */
  function defaultValidationStatus(id: number, params: unknown[], pointSql: boolean): string {
    const geojsons = Array.isArray(params[1]) ? (params[1] as unknown[]) : [];
    const idsArr = Array.isArray(params[0]) ? (params[0] as unknown[]) : [];
    const at = idsArr.findIndex((raw) => Number(raw) === id);
    const geojson = at >= 0 ? geojsons[at] : undefined;
    const type = extractGeometryType(geojson);
    if (pointSql) return type === 'Point' ? 'accepted' : 'skipped_unsupported_type';
    return type === 'Polygon' || type === 'MultiPolygon' ? 'accepted' : 'skipped_unsupported_type';
  }

  // ---------------------------------------------------------------------------
  // custom require
  // ---------------------------------------------------------------------------
  // `__dirname` for the evaluated source: the LEGACY location `scripts/`, NEVER derived from
  // SCRIPT_REL (which points at `src/tests/…/fixtures/`). The legacy relative requires
  // (`./lib/pipeline`, `./lib/safe-math`, `./lib/source-version`, `./lib/config-loader`) must
  // resolve exactly as they did before the ① freeze.
  const scriptDir = path.join(REPO_ROOT, 'scripts');

  const customRequire = (id: string): unknown => {
    if (id === './lib/pipeline') return fakePipeline;
    if (id === './lib/config-loader') return fakeConfigLoader;
    if (id === './lib/safe-math') return safeMath;
    if (id === './lib/source-version') return sourceVersion;
    if (id === 'node-stream-zip') return fakeStreamZip;
    if (id === 'shapefile') return fakeShapefile;
    if (
      id === 'zod' ||
      id === 'fs' ||
      id === 'os' ||
      id === 'path' ||
      id === 'crypto' ||
      id === 'stream' ||
      id === 'stream/promises'
    ) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(id);
    }
    throw new Error(`[legacy-harness] unexpected require('${id}') from the legacy source`);
  };

  // --- read + evaluate the legacy source text ------------------------------
  const rawSource = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8');
  const source = rawSource.replace(/^#![^\n]*\n/, '');
  const factory = new Function(
    'require',
    'module',
    'exports',
    '__dirname',
    'fetch',
    `${source}\n;module.exports = Object.assign({}, module.exports, { main, loadDataset, skeletonSub, specSub, parseRegister, parseHcd, REGISTER_URL, HCD_URL, LICENSE_URL });`,
  );

  const moduleShim = { exports: {} as Record<string, unknown> };
  factory(customRequire, moduleShim, moduleShim.exports, scriptDir, fetchShim);

  const runMain = async (): Promise<void> => {
    const main = moduleShim.exports.main as MainCallback | undefined;
    if (typeof main !== 'function') {
      throw new Error('[legacy-harness] legacy source did not export main()');
    }
    const savedEnv = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(opts.env ?? {})) {
      savedEnv.set(key, process.env[key]);
      process.env[key] = value;
    }
    try {
      await main(pool);
    } finally {
      for (const [key, prior] of savedEnv) {
        if (prior === undefined) delete process.env[key];
        else process.env[key] = prior;
      }
    }
  };

  return {
    runMain,
    helpers: moduleShim.exports,
    pool,
    summaries,
    metas,
    logs,
    fetchCalls,
    txns: () => txnCount,
  };
}

// ---------------------------------------------------------------------------
// Small parse helpers used by the fake pool's canned-row derivation
// ---------------------------------------------------------------------------

/** `true` when the value is an array of primitives (never a string/`null`). */
function isArrayLike(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/** Pick every Nth item out of a multi-row `INSERT`'s flat bind vector. */
function idsEveryNth(params: unknown[], stride: number): number[] {
  const ids: number[] = [];
  if (!isArrayLike(params)) return ids;
  for (let i = 0; i < params.length; i += stride) {
    const id = Number(params[i]);
    if (Number.isFinite(id) && id > 0) ids.push(id);
  }
  return ids;
}

/** Read a `$1::BIGINT[]` bind that the fake pool handed back as an array of numbers/strings. */
function parseBidArray(value: unknown): number[] {
  if (!isArrayLike(value)) return [];
  const ids: number[] = [];
  for (const raw of value) {
    const id = Number(raw);
    if (Number.isFinite(id)) ids.push(id);
  }
  return ids;
}

/** Best-effort `geometry.type` from a GeoJSON string / object (mirrors the fixture's `type`). */
function extractGeometryType(geojson: unknown): string | null {
  if (typeof geojson === 'string') {
    try {
      return extractGeometryType(JSON.parse(geojson) as unknown);
    } catch {
      return null;
    }
  }
  if (geojson !== null && typeof geojson === 'object' && 'type' in geojson) {
    const type = (geojson as { type?: unknown }).type;
    return typeof type === 'string' ? type : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public re-export surface (types only — everything else lives on `loadLegacy`)
// ---------------------------------------------------------------------------

/** Re-exported for callers that want the fixture type without importing the JSON directly. */
export type { FeaturesFixture as HeritageFeaturesFixture };
