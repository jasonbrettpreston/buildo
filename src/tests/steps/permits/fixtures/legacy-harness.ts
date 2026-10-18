// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/50_source_permits.md
//
// ① — the LOAD-PERMITS legacy oracle (phase 4 wave 1, McDonald's Airtight V3).
//
// This module does NOT load `scripts/load-permits.js`. It evaluates the VERBATIM legacy source text
// committed beside it as `fixtures/legacy-load-permits.js.txt` (byte-identical to `scripts/load-permits.js`
// at the ① freeze, blob 50837ef4), with `require.main === module` true so the `pipeline.run(...)` body
// is registered and can be driven.
//
// Curated shim: `./lib/pipeline`, the global `fetch` and `setTimeout` are FAKES (advisory lock, txn
// wrapper, summary/meta capture, CKAN DataStore pagination, retry without real waits); `./lib/address`,
// `./lib/safe-math` and `./lib/leads/lead-id` are the REAL modules, so mapping and lead_id derivation
// are the shipped ones rather than a re-implementation.
//
// The oracle's job (Spec 123 §4.5): a converted implementation must reproduce the legacy OBSERVABLE
// BEHAVIOUR — the ordered `pool.query()` SQL/params stream, the `emitSummary`/`emitMeta` payloads, the
// CKAN request stream and the `pipeline.log` lines — without the legacy text being its source of truth.

import fs from 'fs';
import path from 'path';

/** One raw CKAN DataStore record for the Active Building Permits resource. */
export type CkanRecord = Record<string, unknown>;

/** Options for `loadLegacy`. Every field is optional; defaults reproduce the happy path. */
export interface LegacyOpts {
  /** The CKAN records served across pages (page size is the legacy's own `limit`). */
  records?: CkanRecord[];
  /** Prior `permits.status` keyed `<permit_num>--<revision_num>` (absent key → new permit). */
  priorStatus?: Record<string, string | null>;
  /** Keys whose upsert is a no-op (data_hash unchanged → no RETURNING row). */
  unchangedKeys?: string[];
  /** HTTP status for every datastore_search call (default 200). */
  httpStatus?: number;
  /** When true, the lifecycle_status_history INSERT rejects (drives the SAVEPOINT lane). */
  failLedger?: boolean;
  /** When false the advisory lock reports `{ acquired: false }` and the body never runs. */
  lockAcquired?: boolean;
  /** Value returned by `pipeline.getDbTimestamp(pool)`; defaults to 2026-10-17T12:00:00Z. */
  runAt?: Date;
}

/** A captured `pool.query(sql, params)` call. */
export interface QueryCall { sql: string; params: unknown[] }

/** The recorded `emitSummary(...)` argument. */
export interface SummaryRecord { records_total: number | null; records_new: number | null; records_updated: number | null; records_meta: Record<string, unknown> }

/** The recorded `emitMeta(reads, writes)` pair. */
export interface MetaRecord { reads: Record<string, string[]>; writes: Record<string, string[]> }

/** A captured `pipeline.log.<level>(...)` call. */
export interface LogRecord { level: string; args: unknown[] }

/** Handle returned by `loadLegacy`. */
export interface LegacyOracle {
  runMain(): Promise<void>;
  helpers: Record<string, unknown>;
  queries: QueryCall[];
  fetchUrls: string[];
  summaries: SummaryRecord[];
  metas: MetaRecord[];
  logs: LogRecord[];
  lockIds: number[];
  txns(): number;
}

const REPO_ROOT = path.resolve(__dirname, '../../../../../');
const SCRIPT_REL = 'src/tests/steps/permits/fixtures/legacy-load-permits.js.txt';

export function loadLegacy(opts: LegacyOpts = {}): LegacyOracle {
  const records = opts.records ?? [];
  const runAt = opts.runAt ?? new Date('2026-10-17T12:00:00Z');
  const priorStatus = opts.priorStatus ?? {};
  const unchangedKeys = new Set(opts.unchangedKeys ?? []);
  const queries: QueryCall[] = [];
  const fetchUrls: string[] = [];
  const summaries: SummaryRecord[] = [];
  const metas: MetaRecord[] = [];
  const logs: LogRecord[] = [];
  const lockIds: number[] = [];
  let txnCount = 0;
  let body: ((pool: unknown) => Promise<void>) | null = null;

  // The fake `./lib/pipeline`: capture seam, txn + advisory-lock wrappers, the library batch size.
  const log = {
    info: (...args: unknown[]) => { logs.push({ level: 'info', args }); },
    warn: (...args: unknown[]) => { logs.push({ level: 'warn', args }); },
    error: (...args: unknown[]) => { logs.push({ level: 'error', args }); },
  };
  const pool = { query: poolQuery };
  const pipeline = {
    log,
    BATCH_SIZE: 1000,
    run: (_name: string, fn: (p: unknown) => Promise<void>) => { body = fn; },
    getDbTimestamp: () => Promise.resolve(runAt),
    withTransaction: (_p: unknown, fn: (c: typeof pool) => Promise<unknown>) => { txnCount += 1; return fn(pool); },
    withAdvisoryLock: async (_p: unknown, id: number, fn: () => Promise<unknown>) => {
      lockIds.push(id);
      if (opts.lockAcquired === false) return { acquired: false, lockId: id };
      return { acquired: true, lockId: id, result: await fn() };
    },
    emitSummary: (s: SummaryRecord) => { summaries.push(s); },
    emitMeta: (r: Record<string, string[]>, w: Record<string, string[]>) => { metas.push({ reads: r, writes: w }); },
    progress: () => undefined,
  };

  // The fake global `fetch`: CKAN DataStore pagination by `limit`/`offset` over `records`.
  async function fakeFetch(url: string): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> {
    fetchUrls.push(url);
    const status = opts.httpStatus ?? 200;
    const u = new URL(url);
    const limit = Number(u.searchParams.get('limit'));
    const offset = Number(u.searchParams.get('offset'));
    return {
      ok: status === 200,
      status,
      json: async () => ({ success: true, result: { records: records.slice(offset, offset + limit), total: records.length } }),
    };
  }
  // Retry backoff without real waits: the delay is recorded by the warn log line, never slept.
  const fakeSetTimeout = (fn: () => void) => { fn(); return 0; };

  // The fake pool: canned rows keyed off the legacy SQL shapes.
  async function poolQuery(sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }> {
    queries.push({ sql, params });
    if (/FROM permits p\s+JOIN UNNEST/.test(sql)) {
      const [nums, revs] = params as [string[], string[]];
      const rows = nums
        .map((n, i) => ({ permit_num: n, revision_num: revs[i], key: `${n}--${revs[i]}` }))
        .filter((r) => Object.prototype.hasOwnProperty.call(priorStatus, r.key))
        .map((r) => ({ permit_num: r.permit_num, revision_num: r.revision_num, status: priorStatus[r.key] }));
      return { rows };
    }
    if (/^\s*INSERT INTO permits \(/.test(sql)) {
      // 40 bound columns per row; RETURNING one row per changed key (is_insert when no prior row).
      const perRow = 40;
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i + perRow <= params.length - 1; i += perRow) {
        const key = `${String(params[i])}--${String(params[i + 1])}`;
        if (unchangedKeys.has(key)) continue;
        rows.push({ is_insert: !Object.prototype.hasOwnProperty.call(priorStatus, key) });
      }
      return { rows };
    }
    if (/INSERT INTO lifecycle_status_history/.test(sql)) {
      if (opts.failLedger) throw new Error('ledger boom');
      return { rows: [], rowCount: (params[0] as unknown[]).length };
    }
    return { rows: [], rowCount: 0 };
  }

  // The curated require shim: one fake, three real libs, node builtins, nothing else.
  function customRequire(id: string): unknown {
    if (id === './lib/pipeline') return pipeline;
    if (id === './lib/address' || id === './lib/safe-math' || id === './lib/leads/lead-id') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(path.join(REPO_ROOT, 'scripts/lib', id.slice('./lib/'.length) + '.js'));
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    if (id === 'fs' || id === 'path' || id === 'crypto') return require(id);
    throw new Error("[legacy-harness] unexpected require('" + id + "') from the legacy source");
  }

  // Evaluate the frozen legacy text (shebang stripped) with `require.main === module`.
  const source = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8').replace(/^#![^\n]*\n/, '');
  const moduleShim: { exports: Record<string, unknown> } = { exports: {} };
  const req = Object.assign(customRequire, { main: moduleShim });
  const factory = new Function('require', 'module', 'exports', '__dirname', 'fetch', 'setTimeout', source);
  factory(req, moduleShim, moduleShim.exports, path.join(REPO_ROOT, 'scripts'), fakeFetch, fakeSetTimeout);

  async function runMain(): Promise<void> {
    if (body === null) throw new Error('[legacy-harness] pipeline.run(...) was never registered');
    await body(pool);
  }

  return { runMain, helpers: moduleShim.exports, queries, fetchUrls, summaries, metas, logs, lockIds, txns: () => txnCount };
}
