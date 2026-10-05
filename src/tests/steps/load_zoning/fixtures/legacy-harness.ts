// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md
//
// ① — the LOAD-ZONING legacy oracle.
//
// This module does NOT load `scripts/load-zoning.js`. It evaluates the VERBATIM legacy source text
// committed beside it as `fixtures/legacy-load-zoning.js.txt` (identical to `scripts/load-zoning.js`
// at the ① freeze), the force seam (`ZONING_FORCE_RELOAD=1`) included, so the PRE golden capture and
// the POST conversion are forced identically.
//
// Curated shim: `./lib/pipeline` and node's `https` are FAKES (transaction/advisory-lock wrappers,
// summary/meta capture, row-budget math, request/redirect/timeout control); `./lib/source-version`,
// `./lib/zoning-attr-drift` and `./lib/geometry-validator` are the REAL modules, so skip-check and
// geometry semantics are the shipped ones rather than a re-implementation.
//
// The oracle's job (Spec 123 §4.5): a future converted implementation must reproduce the legacy
// OBSERVABLE BEHAVIOUR — the ordered `pool.query()` SQL/params stream, the `emitSummary`/`emitMeta`
// payloads, the `https.get` request/redirect/timeout stream, and the `pipeline.log` lines — without
// the legacy text being the source of truth for the new implementation.

import fs from 'fs';
import path from 'path';

/** The ten per-layer keys, in base-first load order (mirrors the legacy `LAYERS` registry order). */
export const LAYER_KEYS = ['base','height_overlay','lot_coverage_overlay','building_setback_overlay','policy_area_overlay','policy_road_overlay','rooming_house_overlay','parking_zone_overlay','priority_retail_overlay','queenstw_eat_overlay'] as const;

/** One zoning layer key. */
export type LayerKey = (typeof LAYER_KEYS)[number];

/** The measured CKAN `metadata_modified` for package 34927e44-fc11-4336-a8aa-a0dfb27658b7 (package_show fallback). */
export const DEFAULT_VERSION = '2026-02-20T21:29:42.613615';

/** One raw CKAN DataStore record (attributes + a GeoJSON `geometry` string + the injected `_id`). */
export type CkanRecord = Record<string, unknown>;

/**
 * Shape of a per-layer records fixture (parsed JSON or an inline literal), plus an optional `_why`
 * provenance note (ignored by callers).
 */
export type RecordsFixture = { _why?: string } & Partial<Record<LayerKey, CkanRecord[]>>;

/** Per-request fake `https.get` overrides (status / CKAN `success` flag / forced timeout / redirect hops). */
export interface HttpOverride { status?: number; success?: boolean; timeout?: boolean; redirects?: number }

/** Per-geometry-text §3.5 validation status override (see the default status matrix in part 2). */
export interface ValidationRow { valid_before?: boolean; empty_after?: boolean; simple_ok?: boolean }

/** Options for `loadLegacy`. Every field is optional; defaults reproduce the happy path. */
export interface LegacyOpts {
  /** Parsed per-layer CKAN records; unset layers get their canned default record set. */
  records?: Partial<Record<LayerKey, CkanRecord[]>>;
  /** Per-layer `last_modified` from the single `package_show` (package_show `last_modified`; default null). */
  versions?: Partial<Record<LayerKey, string | null>>;
  /** `result.metadata_modified` returned by `package_show` (the fallback when a resource has no `last_modified`). */
  metadataModified?: string;
  /** `package_show` fake overrides; `omit` drops resources from `result.resources` entirely. */
  packageShow?: HttpOverride & { omit?: LayerKey[] };
  /** Per-layer `datastore_search` fake overrides. */
  layerHttp?: Partial<Record<LayerKey, HttpOverride>>;
  /** Whatever the prior-run read returns as `records_meta` (null → first run). */
  priorMeta?: Record<string, unknown> | null;
  /** When true, the prior-run read throws (`prior read boom`). */
  priorError?: boolean;
  /** Source ids already present in each table, keyed by TABLE (drives the pre-DELETE count). */
  existing?: Record<string, number[]>;
  /** Source ids to report as `{ is_insert: false }` in the upsert RETURNING stream, keyed by TABLE. */
  unchanged?: Record<string, number[]>;
  /** Per-geometry §3.5 validation override, keyed by the EXACT geometry text. */
  validation?: Record<string, ValidationRow>;
  /** Table names whose upsert rejects (drives the per-layer load-error lane). */
  failUpsert?: string[];
  /** When false the advisory lock reports `{ acquired: false }` and `main()` is a no-op. */
  lockAcquired?: boolean;
  /** Environment variables applied to `process.env` for the duration of `runMain()`. */
  env?: Record<string, string>;
  /** Value returned by `pipeline.getDbTimestamp(pool)`; defaults to 2026-10-02T12:00:00Z. */
  runAt?: Date;
}

/** A captured `https.get(url, { timeout })` call, classified by action and layer. */
export interface HttpCall { url: string; timeout: unknown; kind: 'package_show' | 'datastore_search'; layer: LayerKey | null }

/** A captured `pool.query(sql, params)` call. */
export interface QueryCall { sql: string; params: unknown[] }

/** The recorded `emitSummary(...)` argument. */
export interface SummaryRecord { records_total: number | null; records_new: number | null; records_updated: number | null; records_meta: Record<string, unknown> }

/** The recorded `emitMeta(reads, writes, externals)` triplet. */
export interface MetaRecord { reads: Record<string, string[]>; writes: Record<string, string[]>; externals: string[] }

/** A captured `pipeline.log.<level>(...)` call. */
export interface LogRecord { level: string; args: unknown[] }

/** Fake `pg`-shaped pool: records every query and returns canned rows keyed off the SQL shape. */
export interface FakePool { queries: QueryCall[]; query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }> }

/** Handle returned by `loadLegacy`. */
export interface LegacyOracle { runMain(): Promise<void>; helpers: Record<string, unknown>; pool: FakePool; summaries: SummaryRecord[]; metas: MetaRecord[]; logs: LogRecord[]; httpCalls: HttpCall[]; lockIds: number[]; txns(): number }

export function loadLegacy(opts: LegacyOpts = {}): LegacyOracle {
  // Resolve the repo root and parse the committed records fixture once.
  const REPO_ROOT = path.resolve(__dirname, '../../../../../');
  const fixture = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'src/tests/steps/load_zoning/fixtures/zoning-records.json'), 'utf8')) as RecordsFixture;
  // Per-layer records: explicit opts win, else the canned fixture, else empty.
  const records: Record<LayerKey, CkanRecord[]> = {} as Record<LayerKey, CkanRecord[]>;
  for (const k of LAYER_KEYS) {
    records[k] = opts.records?.[k] !== undefined ? opts.records[k] : (fixture[k] ?? []);
  }
  // Frozen run timestamp (the legacy `getDbTimestamp(pool)` return).
  const runAt = opts.runAt ?? new Date('2026-10-02T12:00:00Z');
  // Capture channels + the txn counter and the per-handle redirect-hop map.
  const summaries: SummaryRecord[] = [];
  const metas: MetaRecord[] = [];
  const logs: LogRecord[] = [];
  const httpCalls: HttpCall[] = [];
  const lockIds: number[] = [];
  let txnCount = 0;
  const hops = new Map<string, number>();
  // Filled in part 2 from the evaluated LAYERS registry (resource_id ↔ layer key).
  let resourceToKey: Record<string, LayerKey> = {};
  let keyToResource: Partial<Record<LayerKey, string>> = {};

  // The fake `./lib/pipeline`: capture seam for logs/summaries/metas, txn + advisory-lock wrappers, row budget.
  const log = {
    info: (...args: unknown[]) => { logs.push({ level: 'info', args }); },
    warn: (...args: unknown[]) => { logs.push({ level: 'warn', args }); },
    error: (...args: unknown[]) => { logs.push({ level: 'error', args }); },
  };
  const pipeline = {
    log,
    run: () => undefined,
    getDbTimestamp: () => Promise.resolve(runAt),
    withTransaction: (_p: unknown, fn: (c: { query: typeof clientQuery }) => Promise<unknown>) => { txnCount += 1; return fn(client); },
    withAdvisoryLock: async (_p: unknown, id: number, fn: () => Promise<unknown>) => {
      lockIds.push(id);
      if (opts.lockAcquired === false) return { acquired: false, lockId: id };
      return { acquired: true, lockId: id, result: await fn() };
    },
    emitSummary: (s: SummaryRecord) => { summaries.push(s); },
    emitMeta: (r: Record<string, string[]>, w: Record<string, string[]>, e: string[]) => { metas.push({ reads: r, writes: w, externals: e }); },
    maxRowsPerInsert: (n: number) => Math.floor(65535 / n),
  };

  // The fake `https`: models request/redirect/timeout/status/success and paginates DataStore responses.
  interface FakeReq { on(evt: string, fn: (...a: unknown[]) => void): FakeReq; destroy(): void }
  interface FakeRes { statusCode: number; headers: Record<string, string>; on(evt: string, fn: (c?: unknown) => void): FakeRes; destroy(): void }
  const fakeHttps = {
    get(url: string, o: { timeout?: number }, cb: (res: FakeRes) => void): FakeReq {
      const listeners: Record<string, (...a: unknown[]) => void> = {};
      const req: FakeReq = { on: (evt, fn) => { listeners[evt] = fn; return req; }, destroy: () => undefined };
      const u = new URL(url);
      const isPkg = u.pathname.endsWith('/package_show');
      const layer = isPkg ? null : (resourceToKey[u.searchParams.get('resource_id') ?? ''] ?? null);
      httpCalls.push({ url, timeout: o?.timeout, kind: isPkg ? 'package_show' : 'datastore_search', layer });
      const ov = (isPkg ? opts.packageShow : (layer ? opts.layerHttp?.[layer] : undefined)) ?? {};
      setImmediate(() => {
        if (ov.timeout) { listeners.timeout?.(); return; }
        const resL: Record<string, (c?: unknown) => void> = {};
        const res: FakeRes = { statusCode: 200, headers: {}, on: (evt, fn) => { resL[evt] = fn; return res; }, destroy: () => undefined };
        const hk = isPkg ? '__pkg' : String(layer);
        const used = hops.get(hk) ?? 0;
        if (ov.redirects && used < ov.redirects) {
          hops.set(hk, used + 1);
          res.statusCode = 302;
          res.headers.location = url + '&hop=' + (used + 1);
          cb(res);
          return;
        }
        if (ov.status && ov.status !== 200) { res.statusCode = ov.status; cb(res); return; }
        let body: Record<string, unknown>;
        if (isPkg) {
          body = {
            success: ov.success !== false,
            result: {
              metadata_modified: opts.metadataModified ?? DEFAULT_VERSION,
              resources: LAYER_KEYS
                .filter((k) => !(opts.packageShow?.omit ?? []).includes(k))
                .map((k) => ({ id: keyToResource[k], last_modified: opts.versions?.[k] ?? null })),
            },
          };
        } else {
          const limit = Number(u.searchParams.get('limit'));
          const offset = Number(u.searchParams.get('offset'));
          const list = layer ? records[layer] : [];
          body = { success: ov.success !== false, result: { records: list.slice(offset, offset + limit), total: list.length } };
        }
        cb(res);
        resL.data?.(JSON.stringify(body));
        resL.end?.();
      });
      return req;
    },
  };
  // Per-table stores the fake pool consults: pre-existing ids and the "unchanged" RETURNING set.
  const existing: Record<string, Set<number>> = {};
  const unchanged: Record<string, Set<number>> = {};
  for (const [table, ids] of Object.entries(opts.existing ?? {})) existing[table] = new Set(ids);
  for (const [table, ids] of Object.entries(opts.unchanged ?? {})) unchanged[table] = new Set(ids);
  // The staging table's live contents, reset by each per-table pre-DELETE COUNT.
  let staged = new Set<number>();
  // The fake pool: every query recorded, then routed on the FIRST matching SQL shape.
  const pool: FakePool = {
    queries: [],
    query: (sql, params = []) => client.query(sql, params),
  };
  async function clientQuery(sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }> {
    pool.queries.push({ sql, params });
    // Prior-run read: `sourceVersion.readPriorRunMeta`'s `SELECT records_meta FROM pipeline_runs`.
    if (/FROM pipeline_runs/.test(sql)) {
      if (opts.priorError) throw new Error('prior read boom');
      return { rows: opts.priorMeta ? [{ records_meta: opts.priorMeta }] : [] };
    }
    // §3.5 geometry batch (the REAL `geometryValidationSql`): unnest + WITH ORDINALITY.
    const geom = /WITH ORDINALITY AS t\(gj, ord\)/.exec(sql);
    if (geom) {
      const texts = (params[0] as string[]) ?? [];
      const rows = texts.map((gj, i) => ({
        ord: String(i + 1),
        valid_before: true,
        empty_after: false,
        simple_ok: true,
        ...(opts.validation?.[gj] ?? {}),
      }));
      return { rows };
    }
    // Per-table pre-DELETE count (also resets the staging store for this table's write).
    const count = /^SELECT COUNT\(\*\)::int AS c FROM (zoning_\w+)/.exec(sql);
    if (count) {
      staged = new Set<number>();
      const table = String(count[1]);
      return { rows: [{ c: existing[table]?.size ?? 0 }] };
    }
    // Staging insert (tested BEFORE the generic upsert route — both start with INSERT INTO).
    if (/^INSERT INTO _zoning_staging/.test(sql)) {
      for (const p of params) staged.add(Number(p));
      return { rows: [] };
    }
    // Batched UPSERT: report only the rows the change guard would actually write.
    const upsert = /^INSERT INTO (zoning_\w+) \(([^)]*)\)/.exec(sql);
    if (upsert) {
      const table = String(upsert[1]);
      const n = String(upsert[2]).split(', ').length;
      if (opts.failUpsert?.includes(table)) throw new Error('upsert boom ' + table);
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < params.length; i += n) {
        const id = Number(params[i]);
        if (unchanged[table]?.has(id)) continue;
        rows.push({ is_insert: !(existing[table]?.has(id)) });
      }
      return { rows };
    }
    // Orphan delete: count pre-existing ids absent from this run's staging set.
    const del = /^DELETE FROM (zoning_\w+) t WHERE NOT EXISTS/.exec(sql);
    if (del) {
      const table = String(del[1]);
      const orphans = [...(existing[table] ?? [])].filter((id) => !staged.has(id)).length;
      return { rows: [], rowCount: orphans };
    }
    // The `CREATE TEMP TABLE _zoning_staging ... ON COMMIT DROP` and anything else.
    return { rows: [] };
  }
  const client = { query: clientQuery };

  // The curated require shim: two fakes, the three real libs, nothing else.
  function customRequire(id: string): unknown {
    if (id === './lib/pipeline') return pipeline;
    if (id === 'https') return fakeHttps;
    if (id === './lib/source-version' || id === './lib/zoning-attr-drift' || id === './lib/geometry-validator') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(path.join(REPO_ROOT, 'scripts/lib', id.slice('./lib/'.length) + '.js'));
    }
    throw new Error("[legacy-harness] unexpected require('" + id + "') from the legacy source");
  }

  // Evaluate the frozen legacy text (shebang stripped) with the shimmed require + a module shim.
  const SCRIPT_REL = 'src/tests/steps/load_zoning/fixtures/legacy-load-zoning.js.txt';
  const source = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8').replace(/^#![^\n]*\n/, '');
  const moduleShim: { exports: Record<string, unknown> } = { exports: {} };
  const factory = new Function(
    'require', 'module', 'exports', '__dirname',
    source + '\n;module.exports = Object.assign({}, module.exports, { main, loadLayer, fetchResourceVersions, fetchDatastoreRecords, httpGetJson, LICENSE_URL, CKAN_PACKAGE_ID, CKAN_ACTION, PIPELINE_NAME, DATASTORE_PAGE, BATCH_SIZE, MAX_REDIRECTS, HTTP_TIMEOUT_MS, ADVISORY_LOCK_ID });',
  );
  factory(customRequire, moduleShim, moduleShim.exports, path.join(REPO_ROOT, 'scripts'));
  // Fill the resource_id ↔ layer-key maps from the evaluated LAYERS registry.
  const layers = moduleShim.exports.LAYERS as { key: LayerKey; resourceId: string }[];
  resourceToKey = {};
  keyToResource = {};
  for (const l of layers) {
    resourceToKey[l.resourceId] = l.key;
    keyToResource[l.key] = l.resourceId;
  }

  // Run `main(pool)` under `opts.env`, restoring `process.env` in the `finally`.
  async function runMain(): Promise<void> {
    const priors = new Map<string, string | undefined>();
    for (const [k, v] of Object.entries(opts.env ?? {})) {
      priors.set(k, process.env[k]);
      process.env[k] = v;
    }
    try {
      await (moduleShim.exports.main as (p: unknown) => Promise<void>)(pool);
    } finally {
      for (const [k, prev] of priors) {
        if (prev === undefined) delete process.env[k];
        else process.env[k] = prev;
      }
    }
  }

  return { runMain, helpers: moduleShim.exports, pool, summaries, metas, logs, httpCalls, lockIds, txns: () => txnCount };
}
