// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md
//
// ① — the ASSERT-COA-FRESHNESS legacy oracle (phase-4 wave 4, McDonald's Airtight V3).
//
// This module does NOT load `scripts/quality/assert-coa-freshness.js`. It evaluates the VERBATIM legacy
// source text committed beside it as `fixtures/legacy-assert-coa-freshness.js.txt` (identical to the
// script at the ① freeze, last touched by bc9e6103), so the conversion must reproduce the legacy
// OBSERVABLE behaviour (Spec 123 §4.5) without the legacy text being the source of truth.
//
// Curated shim: `../lib/pipeline`, `../lib/config-loader` and `Date.now` are FAKES (advisory-lock
// wrapper, summary/meta/log capture, the logic-variable map, a frozen clock); `zod` is the REAL module,
// so the legacy Zod schema (including its fail > warn refine) is the shipped one. The fake
// `validateLogicVars` mirrors `scripts/lib/config-loader.js:290-300` (safeParse -> {valid, errors}).

import fs from 'fs';
import path from 'path';

/** The single aggregate row the legacy SELECT returns (`assert-coa-freshness.js:53-60`). */
export interface AggregateRow { max_last_seen?: Date | string | null; max_hearing_date?: string | null; max_decision_date?: string | null; total_records?: string | number }

/** Options for `loadLegacy`. Every field is optional; defaults reproduce the happy path. */
export interface LegacyOpts {
  /** The single aggregate row the legacy SELECT returns (`assert-coa-freshness.js:53-60`). */
  row?: AggregateRow;
  /** logic_variables as `loadMarketplaceConfigs` would return them. */
  logicVars?: Record<string, unknown>;
  /** When false the advisory lock reports `{ acquired: false }`. */
  lockAcquired?: boolean;
  /** Frozen `Date.now()` in ms. */
  nowMs?: number;
}

/** A captured `pool.query` call. */
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
  queries: QueryCall[];
  summaries: SummaryRecord[];
  metas: MetaRecord[];
  logs: LogRecord[];
  lockIds: number[];
  configLoads: string[];
}

/** The seeded defaults at the ① freeze (`scripts/seeds/logic_variables.json` coa_freshness_*). */
export const DEFAULT_VARS = Object.freeze({ coa_freshness_warn_days: 45, coa_freshness_fail_days: 135 });

export function loadLegacy(opts: LegacyOpts = {}): LegacyOracle {
  const REPO_ROOT = path.resolve(__dirname, '../../../../../');
  const nowMs = opts.nowMs ?? Date.parse('2026-10-18T12:00:00Z');
  const queries: QueryCall[] = [];
  const summaries: SummaryRecord[] = [];
  const metas: MetaRecord[] = [];
  const logs: LogRecord[] = [];
  const lockIds: number[] = [];
  const configLoads: string[] = [];
  let mainFn: ((pool: unknown) => Promise<void>) | null = null;

  const log = {
    info: (...args: unknown[]) => { logs.push({ level: 'info', args }); },
    warn: (...args: unknown[]) => { logs.push({ level: 'warn', args }); },
    error: (...args: unknown[]) => { logs.push({ level: 'error', args }); },
  };

  const row = {
    max_last_seen: null,
    max_hearing_date: null,
    max_decision_date: null,
    total_records: '0',
    ...(opts.row ?? {}),
  };
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return { rows: [row] };
    },
  };

  const pipeline = {
    log,
    run: (_name: string, fn: (p: unknown) => Promise<void>) => { mainFn = fn; },
    withAdvisoryLock: async (_p: unknown, id: number, fn: () => Promise<unknown>) => {
      lockIds.push(id);
      if (opts.lockAcquired === false) return { acquired: false, lockId: id };
      return { acquired: true, lockId: id, result: await fn() };
    },
    emitSummary: (s: SummaryRecord) => { summaries.push(s); },
    emitMeta: (r: Record<string, string[]>, w: Record<string, string[]>) => { metas.push({ reads: r, writes: w }); },
  };

  const configLoader = {
    loadMarketplaceConfigs: async (_pool: unknown, tag: string) => {
      configLoads.push(tag);
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
    if (id === '../lib/pipeline') return pipeline;
    if (id === '../lib/config-loader') return configLoader;
    if (id === 'zod') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('zod');
    }
    throw new Error("[legacy-harness] unexpected require('" + id + "') from the legacy source");
  }

  const SCRIPT_REL = 'src/tests/steps/assert_coa_freshness/fixtures/legacy-assert-coa-freshness.js.txt';
  const source = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8').replace(/^#![^\n]*\n/, '');
  const moduleShim: { exports: Record<string, unknown> } = { exports: {} };
  const factory = new Function('require', 'module', 'exports', '__dirname', 'Date', source);
  factory(customRequire, moduleShim, moduleShim.exports, path.join(REPO_ROOT, 'scripts/quality'), FrozenDate);

  async function runMain(): Promise<void> {
    if (!mainFn) throw new Error('[legacy-harness] pipeline.run(...) was never called by the legacy source');
    await mainFn(pool);
  }

  return { runMain, queries, summaries, metas, logs, lockIds, configLoads };
}
