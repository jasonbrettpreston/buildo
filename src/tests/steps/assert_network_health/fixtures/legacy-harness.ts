// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md
//
// ① — the ASSERT-NETWORK-HEALTH legacy oracle (C6-1, McDonald's Airtight V3).
//
// This module does NOT load `scripts/quality/assert-network-health.js`. It evaluates the VERBATIM legacy
// source text committed beside it as `fixtures/legacy-assert-network-health.js.txt` (identical to the
// script at the ① freeze, last touched by 4d5df9e7), so the conversion must reproduce the legacy
// OBSERVABLE behaviour (Spec 123 §4.5) without the legacy text being the source of truth.
//
// Curated shim (the assert_coa_freshness precedent): `../lib/pipeline`, `../lib/config-loader` and
// `console` are FAKES (advisory-lock wrapper, summary/meta/log capture, the logic-variable map, stdout
// capture); `zod` is the REAL module, so the legacy Zod schema is the shipped one. The fake
// `validateLogicVars` mirrors `scripts/lib/config-loader.js` (safeParse -> {valid, errors}).

import fs from 'fs';
import path from 'path';

/** The `records_meta.scraper_telemetry` object the inspections scraper publishes. */
export interface Telemetry {
  schema_drift?: string[];
  permits_attempted?: number;
  proxy_errors?: number;
  error_categories?: Record<string, number>;
  last_error?: string;
  latency?: { p50?: number; max?: number };
  consecutive_empty_max?: number;
  session_bootstraps?: number;
  session_failures?: number;
  permits_closed?: number;
}

/** Options for `loadLegacy`. Every field is optional; defaults reproduce the happy path. */
export interface LegacyOpts {
  /** The latest inspections `pipeline_runs` row; `null` = no row at all. */
  lastRun?: { records_meta?: Record<string, unknown> | null; records_updated?: number | null } | null;
  /** logic_variables as `loadMarketplaceConfigs` would return them. */
  logicVars?: Record<string, unknown>;
  /** When false the advisory lock reports `{ acquired: false }`. */
  lockAcquired?: boolean;
}

/** A captured `pool.query` call. */
export interface QueryCall { sql: string; params: unknown[] }
/** The recorded `emitSummary(...)` argument. */
export interface SummaryRecord { records_total: number | null; records_new: number | null; records_updated: number | null; records_meta: Record<string, unknown> }
/** The recorded `emitMeta(reads, writes)` pair. */
export interface MetaRecord { reads: Record<string, string[]>; writes: Record<string, string[]> }
/** A captured log line (`console.*` or `pipeline.log.*`). */
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

/** The seeded defaults at the ① freeze (`scripts/seeds/logic_variables.json`; live values measured 2026-10-19). */
export const DEFAULT_VARS = Object.freeze({ scraper_error_rate_warn_pct: 5, scraper_latency_p50_warn_ms: 2000, scraper_empty_streak_warn: 20 });

export function loadLegacy(opts: LegacyOpts = {}): LegacyOracle {
  const REPO_ROOT = path.resolve(__dirname, '../../../../../');
  const queries: QueryCall[] = [];
  const summaries: SummaryRecord[] = [];
  const metas: MetaRecord[] = [];
  const logs: LogRecord[] = [];
  const lockIds: number[] = [];
  const configLoads: string[] = [];
  let mainFn: ((pool: unknown) => Promise<void>) | null = null;

  const capture = (level: string) => (...args: unknown[]) => { logs.push({ level, args }); };
  const log = { info: capture('info'), warn: capture('warn'), error: capture('error') };
  const fakeConsole = { log: capture('console.log'), error: capture('console.error'), warn: capture('console.warn') };

  const lastRun = opts.lastRun === undefined ? { records_meta: {}, records_updated: 0 } : opts.lastRun;
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return { rows: lastRun === null ? [] : [lastRun] };
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

  function customRequire(id: string): unknown {
    if (id === '../lib/pipeline') return pipeline;
    if (id === '../lib/config-loader') return configLoader;
    if (id === 'zod') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('zod');
    }
    throw new Error("[legacy-harness] unexpected require('" + id + "') from the legacy source");
  }

  const SCRIPT_REL = 'src/tests/steps/assert_network_health/fixtures/legacy-assert-network-health.js.txt';
  const source = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8').replace(/^#![^\n]*\n/, '');
  const moduleShim: { exports: Record<string, unknown> } = { exports: {} };
  const factory = new Function('require', 'module', 'exports', '__dirname', 'console', source);
  factory(customRequire, moduleShim, moduleShim.exports, path.join(REPO_ROOT, 'scripts/quality'), fakeConsole);

  async function runMain(): Promise<void> {
    if (!mainFn) throw new Error('[legacy-harness] pipeline.run(...) was never called by the legacy source');
    await mainFn(pool);
  }

  return { runMain, queries, summaries, metas, logs, lockIds, configLoads };
}
