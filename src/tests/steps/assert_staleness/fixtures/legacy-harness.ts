// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md
//
// ① — the ASSERT-STALENESS legacy oracle (C6-1, McDonald's Airtight V3).
//
// This module does NOT load `scripts/quality/assert-staleness.js`. It evaluates the VERBATIM legacy
// source text committed beside it as `fixtures/legacy-assert-staleness.js.txt` (identical to the script
// at the ① freeze, last touched by 4d5df9e7), so the conversion must reproduce the legacy OBSERVABLE
// behaviour (Spec 123 §4.5) without the legacy text being the source of truth.
//
// Curated shim (the assert_coa_freshness precedent): `../lib/pipeline`, `../lib/config-loader` and
// `console` are FAKES; `zod` is the REAL module. The fake pool answers the two legacy SELECTs by shape:
// the `permit_freshness` CTE gets `staleness`, the other gets `coverage`.

import fs from 'fs';
import path from 'path';

/** The coverage SELECT's single row (`assert-staleness.js:66-75`). */
export interface CoverageRow { total_target?: string | number | null; scraped?: string | number | null }
/** The staleness SELECT's single row (`assert-staleness.js:106-122`). */
export interface StalenessRow { max_days_stale?: string | number | null; stale_30d?: string | number | null }

/** Options for `loadLegacy`. Every field is optional; defaults reproduce the happy path. */
export interface LegacyOpts {
  coverage?: CoverageRow;
  /** `null` = the staleness SELECT returns no row. */
  staleness?: StalenessRow | null;
  logicVars?: Record<string, unknown>;
  lockAcquired?: boolean;
}

export interface QueryCall { sql: string; params: unknown[] }
export interface SummaryRecord { records_total: number | null; records_new: number | null; records_updated: number | null; records_meta: Record<string, unknown> }
export interface MetaRecord { reads: Record<string, string[]>; writes: Record<string, string[]> }
export interface LogRecord { level: string; args: unknown[] }

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
export const DEFAULT_VARS = Object.freeze({
  scrape_early_phase_threshold_pct: 5,
  scrape_stale_days: 30,
  staleness_max_stale_over_30d: 10000,
  staleness_min_coverage_pct: 10,
  staleness_max_days_stale: 60,
});

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

  const coverage = { total_target: '1000', scraped: '500', ...(opts.coverage ?? {}) };
  const staleness = opts.staleness === null ? null : { max_days_stale: '10', stale_30d: '0', ...(opts.staleness ?? {}) };
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('permit_freshness')) return { rows: staleness === null ? [] : [staleness] };
      return { rows: [coverage] };
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

  const SCRIPT_REL = 'src/tests/steps/assert_staleness/fixtures/legacy-assert-staleness.js.txt';
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
