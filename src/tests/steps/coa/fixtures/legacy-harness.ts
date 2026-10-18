// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/51_source_coa.md
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
//
// ① — the LOAD-COA legacy oracle (phase-4 wave 1, McDonald's Airtight V3).
//
// This module does NOT load `scripts/load-coa.js`. It evaluates the VERBATIM legacy source text
// committed beside it as `fixtures/legacy-load-coa.js.txt` (identical to `scripts/load-coa.js` at the
// ① freeze, last touched by b87f62db), so a future conversion must reproduce the legacy OBSERVABLE
// behaviour (Spec 123 §4.5) without the legacy text being the source of truth.
//
// Curated shim: `./lib/pipeline`, the global `fetch`, `setTimeout` and `Date.now` are FAKES (txn and
// advisory-lock wrappers, summary/meta capture, CKAN DataStore pagination, retry delays, a frozen
// clock); `./lib/address` and node's `crypto` are the REAL modules, so street normalisation and the
// row hash are the shipped ones rather than a re-implementation.

import fs from 'fs';
import path from 'path';

/** The two CKAN DataStore resources the legacy script reads (`RESOURCES`, `load-coa.js:28-31`). */
export const ACTIVE_ID = '51fd09cd-99d6-430a-9d42-c24a937b0cb0';
export const CLOSED_ID = '9c97254e-5460-4799-896f-c7823413c81c';

/** One raw CKAN DataStore record. */
export type CkanRecord = Record<string, unknown>;

/** Per-request fake `fetch` override: HTTP status, CKAN `success`, or a thrown network error. */
export interface FetchOverride { status?: number; success?: boolean; throwError?: boolean }

/** Options for `loadLegacy`. Every field is optional; defaults reproduce the happy path. */
export interface LegacyOpts {
  /** CKAN records per resource id (default: none). */
  records?: Partial<Record<string, CkanRecord[]>>;
  /** Per-resource ordered overrides, consumed one per request (then the happy response). */
  fetchPlan?: Partial<Record<string, FetchOverride[]>>;
  /** `pipeline.isFullMode()` — true reads both resources. */
  full?: boolean;
  /** Prior `coa_applications.status` keyed by application_number (the pre-UPSERT SELECT). */
  prevStatus?: Record<string, string | null>;
  /** Application numbers already in the table (RETURNING is_insert=false). */
  existing?: string[];
  /** Application numbers whose data_hash is unchanged (no RETURNING row). */
  unchanged?: string[];
  /** When true the lifecycle_status_history INSERT throws. */
  ledgerFail?: boolean;
  /** When false the advisory lock reports `{ acquired: false }`. */
  lockAcquired?: boolean;
  /** `pipeline.getDbTimestamp(pool)` return. */
  runAt?: Date;
  /** Frozen `Date.now()` in ms. */
  nowMs?: number;
}

/** A captured `pool.query` / `client.query` call. */
export interface QueryCall { sql: string; params: unknown[]; via: 'pool' | 'client' }
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
  summaries: SummaryRecord[];
  metas: MetaRecord[];
  logs: LogRecord[];
  fetchUrls: string[];
  delays: number[];
  lockIds: number[];
  txns(): number;
}

export function loadLegacy(opts: LegacyOpts = {}): LegacyOracle {
  const REPO_ROOT = path.resolve(__dirname, '../../../../../');
  const runAt = opts.runAt ?? new Date('2026-10-17T12:00:00Z');
  const nowMs = opts.nowMs ?? Date.parse('2026-10-17T12:00:00Z');
  const queries: QueryCall[] = [];
  const summaries: SummaryRecord[] = [];
  const metas: MetaRecord[] = [];
  const logs: LogRecord[] = [];
  const fetchUrls: string[] = [];
  const delays: number[] = [];
  const lockIds: number[] = [];
  let txnCount = 0;
  let mainFn: ((pool: unknown) => Promise<void>) | null = null;
  const plans = new Map<string, FetchOverride[]>();
  for (const [id, list] of Object.entries(opts.fetchPlan ?? {})) plans.set(id, [...(list ?? [])]);
  const existing = new Set(opts.existing ?? []);
  const unchanged = new Set(opts.unchanged ?? []);

  const log = {
    info: (...args: unknown[]) => { logs.push({ level: 'info', args }); },
    warn: (...args: unknown[]) => { logs.push({ level: 'warn', args }); },
    error: (...args: unknown[]) => { logs.push({ level: 'error', args }); },
  };

  async function exec(via: 'pool' | 'client', sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }> {
    queries.push({ sql, params, via });
    if (/^\s*SELECT application_number, status\s+FROM coa_applications/.test(sql)) {
      const nums = (params[0] as string[]) ?? [];
      const rows = nums.filter((n) => opts.prevStatus && n in opts.prevStatus).map((n) => ({ application_number: n, status: opts.prevStatus?.[n] ?? null }));
      return { rows };
    }
    if (/^\s*INSERT INTO coa_applications/.test(sql)) {
      const nums = (params[0] as string[]) ?? [];
      return { rows: nums.filter((n) => !unchanged.has(n)).map((n) => ({ is_insert: !existing.has(n) })) };
    }
    if (/^\s*INSERT INTO lifecycle_status_history/.test(sql)) {
      if (opts.ledgerFail) throw new Error('ledger boom');
      return { rows: [], rowCount: ((params[0] as unknown[]) ?? []).length };
    }
    if (/^\s*UPDATE coa_applications/.test(sql)) return { rows: [], rowCount: ((params[1] as unknown[]) ?? []).length };
    if (/COUNT\(\*\) AS total/.test(sql)) return { rows: [{ total: '0', approved: '0', linked: '0', upcoming: '0' }] };
    return { rows: [] };
  }
  const client = { query: (sql: string, params?: unknown[]) => exec('client', sql, params) };
  const pool = { query: (sql: string, params?: unknown[]) => exec('pool', sql, params) };

  const pipeline = {
    log,
    run: (_name: string, fn: (p: unknown) => Promise<void>) => { mainFn = fn; },
    getDbTimestamp: () => Promise.resolve(runAt),
    isFullMode: () => opts.full === true,
    withTransaction: (_p: unknown, fn: (c: typeof client) => Promise<unknown>) => { txnCount += 1; return fn(client); },
    withAdvisoryLock: async (_p: unknown, id: number, fn: () => Promise<unknown>) => {
      lockIds.push(id);
      if (opts.lockAcquired === false) return { acquired: false, lockId: id };
      return { acquired: true, lockId: id, result: await fn() };
    },
    progress: () => undefined,
    emitSummary: (s: SummaryRecord) => { summaries.push(s); },
    emitMeta: (r: Record<string, string[]>, w: Record<string, string[]>) => { metas.push({ reads: r, writes: w }); },
  };

  async function fakeFetch(url: string): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> {
    fetchUrls.push(url);
    const u = new URL(url);
    const id = u.searchParams.get('resource_id') ?? '';
    const ov = plans.get(id)?.shift() ?? {};
    if (ov.throwError) throw new Error('network boom');
    const status = ov.status ?? 200;
    const limit = Number(u.searchParams.get('limit'));
    const offset = Number(u.searchParams.get('offset'));
    const list = opts.records?.[id] ?? [];
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ success: ov.success !== false, result: { records: list.slice(offset, offset + limit) } }),
    };
  }
  function fakeSetTimeout(fn: () => void, ms: number): number { delays.push(ms); fn(); return 0; }
  class FrozenDate extends Date {
    static override now(): number { return nowMs; }
  }

  function customRequire(id: string): unknown {
    if (id === './lib/pipeline') return pipeline;
    if (id === './lib/address') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(path.join(REPO_ROOT, 'scripts/lib/address.js'));
    }
    if (id === 'crypto') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('crypto');
    }
    throw new Error("[legacy-harness] unexpected require('" + id + "') from the legacy source");
  }

  const SCRIPT_REL = 'src/tests/steps/coa/fixtures/legacy-load-coa.js.txt';
  const source = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8').replace(/^#![^\n]*\n/, '');
  const moduleShim: { exports: Record<string, unknown> } = { exports: {} };
  const factory = new Function(
    'require', 'module', 'exports', '__dirname', 'fetch', 'setTimeout', 'Date',
    source + '\n;module.exports = Object.assign({}, module.exports, { mapRecord, computeHash, parseDate, trimToNull, upsertBatch, fetchAllRecords, RESOURCES, ACTIVE_RESOURCE_ID, CRITICAL_FIELDS, STATUS_TO_DATE_COLUMN_COA, BATCH_SIZE, MAX_RETRIES, RETRY_BASE_MS, ADVISORY_LOCK_ID, CKAN_BASE });',
  );
  factory(customRequire, moduleShim, moduleShim.exports, path.join(REPO_ROOT, 'scripts'), fakeFetch, fakeSetTimeout, FrozenDate);

  async function runMain(): Promise<void> {
    if (!mainFn) throw new Error('[legacy-harness] pipeline.run(...) was never called by the legacy source');
    await mainFn(pool);
  }

  return { runMain, helpers: moduleShim.exports, queries, summaries, metas, logs, fetchUrls, delays, lockIds, txns: () => txnCount };
}
