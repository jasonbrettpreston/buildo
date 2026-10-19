// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 12, §6.8 row 668
// SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3-ARCHETYPE (CoA: T2-or-T4)
//
// ① — the COMPUTE-COA-COST-ESTIMATES legacy oracle (phase-4 wave 4, McDonald's Airtight V3).
//
// This module does NOT load `scripts/compute-coa-cost-estimates.js`. It evaluates the VERBATIM legacy
// source text committed beside it as `fixtures/legacy-compute-coa-cost-estimates.js.txt` (identical to the
// script at the ① freeze, last touched by fb593a9e), so a conversion must reproduce the legacy OBSERVABLE
// behaviour (Spec 123 §4.5) without the legacy text being the source of truth.
//
// Curated shim: `./lib/pipeline`, `./lib/config-loader` and `process` (argv flags + the
// ARCHETYPE_COST_DISABLED kill switch) are FAKES; `zod`, `./lib/safe-math`, `./lib/coa-cost-model` and
// `src/features/leads/lib/cost-model-shared` (the Brain) are the REAL modules, so pricing is the shipped
// one, never a re-implementation.

import fs from 'fs';
import path from 'path';

/** One row of the legacy 6-table source SELECT (`compute-coa-cost-estimates.js:449-528`). */
export type SourceRow = Record<string, unknown> & { id: number; lead_id: string };

/** Options for `loadLegacy`. Every field is optional; defaults reproduce the happy path. */
export interface LegacyOpts {
  rows?: SourceRow[];
  /** CLI flags after the script name, e.g. ['--full'], ['--dry-run'], ['--limit=5']. */
  argv?: string[];
  env?: Record<string, string>;
  tradeRates?: Record<string, unknown>[];
  scopeMatrix?: Record<string, unknown>[];
  archetypeRates?: Record<string, unknown>[];
  /** When false the migration-145 pkey probe returns no row. */
  mig145?: boolean;
  /** lead_ids whose cost_estimates row already exists (RETURNING is_insert=false). */
  existing?: string[];
  /** lead_ids whose row is unchanged (the IS DISTINCT FROM guard returns nothing). */
  unchanged?: string[];
  percentiles?: { p25: unknown; p50: unknown; p75: unknown };
  corpus?: { priced: number; total: number };
  logicVars?: Record<string, unknown>;
  lockAcquired?: boolean;
  runAt?: Date;
}

export interface QueryCall { sql: string; params: unknown[]; via: 'pool' | 'client' | 'stream' }
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
  txnStarts: number[];
}

/** The seeded logic-variable values the legacy ConfigSchema validates (seeds + migration 156). */
export const SEEDED: Record<string, unknown> = {
  liar_gate_threshold: 0.25,
  model_range_pct: 0.2,
  fallback_range_pct: 0.4,
  urban_coverage_ratio: 0.7,
  suburban_coverage_ratio: 0.4,
  coa_cost_coverage_threshold_pct: 65,
  coa_cost_coverage_fail_pct: 5,
  archetype_nofit_residential_warn_pct: 25,
  archetype_t1_fsi_min: 0.05,
  archetype_t1_fsi_max: 5,
  archetype_t1_total_cap: 10000000,
  archetype_t2_reno_line_cap: 10000000,
  archetype_t2_build_line_cap: 50000000,
  archetype_t2_build_line_min: 0,
  archetype_t3_total_cap: 10000000,
};

export function loadLegacy(opts: LegacyOpts = {}): LegacyOracle {
  const REPO_ROOT = path.resolve(__dirname, '../../../../../');
  const runAt = opts.runAt ?? new Date('2026-10-18T12:00:00Z');
  const queries: QueryCall[] = [];
  const summaries: SummaryRecord[] = [];
  const metas: MetaRecord[] = [];
  const logs: LogRecord[] = [];
  const lockIds: number[] = [];
  const txnStarts: number[] = [];
  const existing = new Set(opts.existing ?? []);
  const unchanged = new Set(opts.unchanged ?? []);
  let mainFn: ((pool: unknown) => Promise<void>) | null = null;

  const log = {
    info: (...args: unknown[]) => { logs.push({ level: 'info', args }); },
    warn: (...args: unknown[]) => { logs.push({ level: 'warn', args }); },
    error: (...args: unknown[]) => { logs.push({ level: 'error', args }); },
  };

  async function exec(via: 'pool' | 'client', sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }> {
    queries.push({ sql, params, via });
    if (/FROM pg_constraint/.test(sql)) return { rows: opts.mig145 === false ? [] : [{ '?column?': 1 }] };
    if (/FROM trade_sqft_rates/.test(sql)) return { rows: opts.tradeRates ?? [{ trade_slug: 'plumbing', base_rate_sqft: 10, structure_complexity_factor: 1 }] };
    if (/FROM scope_intensity_matrix/.test(sql)) return { rows: opts.scopeMatrix ?? [] };
    if (/FROM archetype_cost_rates/.test(sql)) return { rows: opts.archetypeRates ?? [] };
    if (/^\s*INSERT INTO cost_estimates/.test(sql)) {
      const out: Record<string, unknown>[] = [];
      for (let i = 0; i < params.length; i += 16) {
        const lead = String(params[i]);
        if (!unchanged.has(lead)) out.push({ is_insert: !existing.has(lead) });
      }
      return { rows: out };
    }
    if (/^\s*UPDATE coa_applications/.test(sql)) return { rows: [], rowCount: Math.floor((params.length - 1) / 4) };
    if (/PERCENTILE_CONT/.test(sql)) return { rows: [opts.percentiles ?? { p25: '100000', p50: '250000', p75: '400000' }] };
    if (/AS priced/.test(sql)) return { rows: [opts.corpus ?? { priced: 1, total: 10 }] };
    return { rows: [] };
  }
  const client = { query: (sql: string, params?: unknown[]) => exec('client', sql, params) };
  const pool = { query: (sql: string, params?: unknown[]) => exec('pool', sql, params) };

  const pipeline = {
    log,
    run: (_name: string, fn: (p: unknown) => Promise<void>) => { mainFn = fn; },
    getDbTimestamp: () => Promise.resolve(runAt),
    withTransaction: (_p: unknown, fn: (c: typeof client) => Promise<unknown>) => { txnStarts.push(queries.length); return fn(client); },
    withAdvisoryLock: async (_p: unknown, id: number, fn: () => Promise<unknown>) => {
      lockIds.push(id);
      if (opts.lockAcquired === false) return { acquired: false, lockId: id };
      return { acquired: true, lockId: id, result: await fn() };
    },
    streamQuery: (_p: unknown, sql: string, params: unknown[]) => {
      queries.push({ sql, params, via: 'stream' });
      const rows = opts.rows ?? [];
      return (async function* gen() { for (const r of rows) yield r; })();
    },
    emitSummary: (s: SummaryRecord) => { summaries.push(s); },
    emitMeta: (r: Record<string, string[]>, w: Record<string, string[]>) => { metas.push({ reads: r, writes: w }); },
  };

  const logicVars = { ...SEEDED, ...(opts.logicVars ?? {}) };
  const configLoader = {
    loadMarketplaceConfigs: async () => ({ logicVars }),
    validateLogicVars: (lv: unknown, schema: { safeParse(v: unknown): { success: boolean; error?: { issues: { message: string; path: unknown[] }[] } } }) => {
      const r = schema.safeParse(lv);
      return r.success ? { valid: true, errors: [] } : { valid: false, errors: (r.error?.issues ?? []).map((i) => `${i.path.join('.')}: ${i.message}`) };
    },
  };

  function customRequire(id: string): unknown {
    if (id === './lib/pipeline') return pipeline;
    if (id === './lib/config-loader') return configLoader;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    if (id === 'zod') return require('zod');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    if (id === './lib/safe-math') return require(path.join(REPO_ROOT, 'scripts/lib/safe-math.js'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    if (id === './lib/coa-cost-model') return require(path.join(REPO_ROOT, 'scripts/lib/coa-cost-model.js'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    if (id === '../src/features/leads/lib/cost-model-shared') return require(path.join(REPO_ROOT, 'src/features/leads/lib/cost-model-shared.js'));
    throw new Error("[legacy-harness] unexpected require('" + id + "') from the legacy source");
  }

  const fakeProcess = { argv: ['node', 'scripts/compute-coa-cost-estimates.js', ...(opts.argv ?? [])], env: { ...(opts.env ?? {}) } };
  const SCRIPT_REL = 'src/tests/steps/compute_coa_cost_estimates/fixtures/legacy-compute-coa-cost-estimates.js.txt';
  const source = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8').replace(/^#![^\n]*\n/, '');
  const moduleShim: { exports: Record<string, unknown> } = { exports: {} };
  const factory = new Function('require', 'module', 'exports', '__dirname', 'process', source);
  factory(customRequire, moduleShim, moduleShim.exports, path.join(REPO_ROOT, 'scripts'), fakeProcess);

  async function runMain(): Promise<void> {
    if (!mainFn) throw new Error('[legacy-harness] pipeline.run(...) was never called by the legacy source');
    await mainFn(pool);
  }

  return { runMain, queries, summaries, metas, logs, lockIds, txnStarts };
}
