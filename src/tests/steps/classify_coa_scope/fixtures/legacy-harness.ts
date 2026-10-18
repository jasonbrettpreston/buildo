// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 5, §6.6.D
//
// ① — the CLASSIFY-COA-SCOPE legacy oracle (phase-4 wave 4, McDonald's Airtight V3).
//
// This module does NOT load `scripts/classify-coa-scope.js`. It evaluates the VERBATIM legacy source text
// committed beside it as `fixtures/legacy-classify-coa-scope.js.txt` (identical to the script at the ①
// freeze, last touched by c53f60a8), so the conversion must reproduce the legacy OBSERVABLE behaviour
// (Spec 123 §4.5) without the legacy text being the source of truth.
//
// Curated shim: `./lib/pipeline` (stream, txn and advisory-lock wrappers, summary/meta/log capture, RUN_AT)
// and `./lib/config-loader` (the logic-variable map) are FAKES, as is `Date.now` (a frozen clock);
// `./lib/coa-scope-classifier` and `zod` are the REAL modules, so the classification is the shipped one
// rather than a re-implementation. The fake `validateLogicVars` mirrors `scripts/lib/config-loader.js:290-300`.

import fs from 'fs';
import path from 'path';

/** One source row of the legacy pending cursor (`classify-coa-scope.js:167-172`). */
export interface SourceRow { id: number; description: string | null; status?: string | null; decision?: string | null }

/** Options for `loadLegacy`. Every field is optional; defaults reproduce the happy path. */
export interface LegacyOpts {
  /** Rows the pending cursor yields, in order. */
  rows?: SourceRow[];
  /** logic_variables as `loadMarketplaceConfigs` would return them. */
  logicVars?: Record<string, unknown>;
  /** rowCount each UPDATE reports (default: the batch size). */
  rowCountFor?: (batchLen: number) => number;
  /** When false the advisory lock reports `{ acquired: false }`. */
  lockAcquired?: boolean;
  /** `pipeline.getDbTimestamp(pool)` return. */
  runAt?: Date;
  /** Frozen `Date.now()` in ms. */
  nowMs?: number;
}

/** A captured query: `stream` (streamQuery), `client` (inside a txn). */
export interface QueryCall { sql: string; params: unknown[]; via: 'stream' | 'client' }
/** The recorded `emitSummary(...)` argument. */
export interface SummaryRecord { records_total: number | null; records_new: number | null; records_updated: number | null; records_meta: Record<string, unknown> }
/** The recorded `emitMeta(reads, writes)` pair. */
export interface MetaRecord { reads: Record<string, string[]>; writes: Record<string, string[]> }
/** A captured `pipeline.log.<level>(...)` call. */
export interface LogRecord { level: string; args: unknown[] }

/** Handle returned by `loadLegacy`. */
export interface LegacyOracle {
  runMain(): Promise<void>;
  queries: QueryCall[];
  summaries: SummaryRecord[];
  metas: MetaRecord[];
  logs: LogRecord[];
  lockIds: number[];
  /** Ordered trace of the pre-lock / lock / stream events. */
  events: string[];
  txns(): number;
}

/** The seeded default at the ① freeze (`scripts/seeds/logic_variables.json` coa_scope_unmapped_threshold_pct). */
export const DEFAULT_VARS = Object.freeze({ coa_scope_unmapped_threshold_pct: 10 });

export function loadLegacy(opts: LegacyOpts = {}): LegacyOracle {
  const REPO_ROOT = path.resolve(__dirname, '../../../../../');
  const runAt = opts.runAt ?? new Date('2026-10-18T12:00:00Z');
  const nowMs = opts.nowMs ?? Date.parse('2026-10-18T12:00:00Z');
  const queries: QueryCall[] = [];
  const summaries: SummaryRecord[] = [];
  const metas: MetaRecord[] = [];
  const logs: LogRecord[] = [];
  const lockIds: number[] = [];
  const events: string[] = [];
  let txnCount = 0;
  let mainFn: ((pool: unknown) => Promise<void>) | null = null;

  const log = {
    info: (...args: unknown[]) => { logs.push({ level: 'info', args }); },
    warn: (...args: unknown[]) => { logs.push({ level: 'warn', args }); },
    error: (...args: unknown[]) => { logs.push({ level: 'error', args }); },
  };

  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params, via: 'client' });
      const batchLen = Math.max(0, (params.length - 1) / 5);
      return { rows: [], rowCount: opts.rowCountFor ? opts.rowCountFor(batchLen) : batchLen };
    },
  };
  const pool = {};

  const pipeline = {
    log,
    run: (_name: string, fn: (p: unknown) => Promise<void>) => { mainFn = fn; },
    getDbTimestamp: () => { events.push('run_at'); return Promise.resolve(runAt); },
    withTransaction: (_p: unknown, fn: (c: typeof client) => Promise<unknown>) => { txnCount += 1; return fn(client); },
    withAdvisoryLock: async (_p: unknown, id: number, fn: () => Promise<unknown>) => {
      events.push('lock');
      lockIds.push(id);
      if (opts.lockAcquired === false) return { acquired: false, lockId: id };
      return { acquired: true, lockId: id, result: await fn() };
    },
    streamQuery: async function* (_p: unknown, sql: string, params: unknown[] = []) {
      events.push('stream');
      queries.push({ sql, params, via: 'stream' });
      for (const r of opts.rows ?? []) yield r;
    },
    emitSummary: (s: SummaryRecord) => { summaries.push(s); },
    emitMeta: (r: Record<string, string[]>, w: Record<string, string[]>) => { metas.push({ reads: r, writes: w }); },
  };

  const configLoader = {
    loadMarketplaceConfigs: async (_pool: unknown, tag: string) => {
      events.push('config:' + tag);
      return { logicVars: { ...DEFAULT_VARS, ...(opts.logicVars ?? {}) } };
    },
    validateLogicVars: (logicVars: unknown, schema: { safeParse(v: unknown): { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } } }) => {
      const result = schema.safeParse(logicVars);
      if (!result.success) {
        return { valid: false, errors: (result.error?.issues ?? []).map((i) => `${i.path.join('.')}: ${i.message}`) };
      }
      return { valid: true };
    },
  };

  class FrozenDate extends Date {
    static override now(): number { return nowMs; }
  }

  function customRequire(id: string): unknown {
    if (id === './lib/pipeline') return pipeline;
    if (id === './lib/config-loader') return configLoader;
    if (id === './lib/coa-scope-classifier') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(path.join(REPO_ROOT, 'scripts/lib/coa-scope-classifier.js'));
    }
    if (id === 'zod') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('zod');
    }
    throw new Error("[legacy-harness] unexpected require('" + id + "') from the legacy source");
  }

  const SCRIPT_REL = 'src/tests/steps/classify_coa_scope/fixtures/legacy-classify-coa-scope.js.txt';
  const source = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8').replace(/^#![^\n]*\n/, '');
  const moduleShim: { exports: Record<string, unknown> } = { exports: {} };
  const factory = new Function('require', 'module', 'exports', '__dirname', 'Date', source);
  factory(customRequire, moduleShim, moduleShim.exports, path.join(REPO_ROOT, 'scripts'), FrozenDate);

  async function runMain(): Promise<void> {
    if (!mainFn) throw new Error('[legacy-harness] pipeline.run(...) was never called by the legacy source');
    await mainFn(pool);
  }

  return { runMain, queries, summaries, metas, logs, lockIds, events, txns: () => txnCount };
}
