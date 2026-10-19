// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 5, §6.8 row 667
// SPEC LINK: docs/specs/01-pipeline/80_taxonomies.md §5
//
// ① — the CLASSIFY-COA-TRADES legacy oracle (phase-4 wave 4, McDonald's Airtight V3).
//
// This module does NOT load `scripts/classify-coa-trades.js`. It evaluates the VERBATIM legacy source
// text committed beside it as `fixtures/legacy-classify-coa-trades.js.txt` (identical to the script at
// the ① freeze, last touched by 638d2b76), so a conversion must reproduce the legacy OBSERVABLE
// behaviour (Spec 123 §4.5) without the legacy text being the source of truth.
//
// Curated shim: `./lib/pipeline` and `./lib/config-loader` are FAKES (txn and advisory-lock wrappers,
// a streamQuery over fixture rows, summary/meta capture, a logic-variable map, the vocab-coverage
// call recorded); `zod`, `./lib/coa-trade-classifier`, `./lib/pipeline-realtor-availability` and
// `./manifest.json` are the REAL modules, so classification is the shipped one, never a re-implementation.

import fs from 'fs';
import path from 'path';

/** One `coa_applications` row as the legacy source SELECT returns it (`classify-coa-trades.js:269`). */
export interface CoaRow {
  id: number;
  lead_id: string;
  scope_tags: string[] | null;
  coa_type_class?: string | null;
  project_type?: string | null;
  structure_type?: string | null;
  scope_classified_at?: Date | null;
}

/** Options for `loadLegacy`. Every field is optional; defaults reproduce the happy path. */
export interface LegacyOpts {
  /** Rows the source stream yields, in order. */
  rows?: CoaRow[];
  /** `SELECT id, slug FROM trades` result. */
  trades?: { id: number; slug: string }[];
  /** `SELECT id, slug FROM product_groups` result. */
  products?: { id: number; slug: string }[];
  /** Whether trades.id=33/slug='realtor' exists (default true). */
  realtorAvailable?: boolean;
  /** `lead_id|trade_id` keys that already exist (RETURNING is_insert=false). */
  existingTradeKeys?: string[];
  /** logic_variables overrides on top of the seeded defaults below. */
  logicVars?: Record<string, unknown>;
  /** When false the advisory lock reports `{ acquired: false }`. */
  lockAcquired?: boolean;
  /** `pipeline.getDbTimestamp(pool)` return. */
  runAt?: Date;
}

/** A captured `pool.query` / `client.query` / `streamQuery` call. */
export interface QueryCall { sql: string; params: unknown[]; via: 'pool' | 'client' | 'stream' }
/** The recorded `emitSummary(...)` argument. */
export interface SummaryRecord { records_total: number | null; records_new: number | null; records_updated: number | null; records_meta: Record<string, unknown>; telemetry_context?: Record<string, unknown> }
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
  vocabSpecs: unknown[];
  /** Index into `queries` at which each transaction opened. */
  txnStarts: number[];
}

/** The seeded logic-variable defaults the legacy schema validates (`scripts/seeds/logic_variables.json`). */
export const SEEDED: Record<string, unknown> = {
  coa_trades_unmapped_threshold_pct: 20,
  vocab_coverage_pass_pct: 90,
  vocab_coverage_warn_pct: 70,
  archetype_bundle_confidence: 0.55,
  coa_active_trades_warn_max: 18,
  p16_inference_layer_enabled: 0,
};

export function loadLegacy(opts: LegacyOpts = {}): LegacyOracle {
  const REPO_ROOT = path.resolve(__dirname, '../../../../../');
  const runAt = opts.runAt ?? new Date('2026-10-18T12:00:00Z');
  const queries: QueryCall[] = [];
  const summaries: SummaryRecord[] = [];
  const metas: MetaRecord[] = [];
  const logs: LogRecord[] = [];
  const lockIds: number[] = [];
  const vocabSpecs: unknown[] = [];
  const txnStarts: number[] = [];
  const existing = new Set(opts.existingTradeKeys ?? []);
  let mainFn: ((pool: unknown) => Promise<void>) | null = null;

  const log = {
    info: (...args: unknown[]) => { logs.push({ level: 'info', args }); },
    warn: (...args: unknown[]) => { logs.push({ level: 'warn', args }); },
    error: (...args: unknown[]) => { logs.push({ level: 'error', args }); },
  };

  async function exec(via: 'pool' | 'client', sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }> {
    queries.push({ sql, params, via });
    if (/^\s*SELECT id, slug FROM trades WHERE id = \$1 AND slug = \$2/.test(sql)) {
      return { rows: opts.realtorAvailable === false ? [] : [{ id: 33, slug: 'realtor' }] };
    }
    if (/^\s*SELECT id, slug FROM trades\s*$/.test(sql)) return { rows: opts.trades ?? [] };
    if (/^\s*SELECT id, slug FROM product_groups\s*$/.test(sql)) return { rows: opts.products ?? [] };
    if (/^\s*INSERT INTO lead_trades/.test(sql)) {
      const out: Record<string, unknown>[] = [];
      for (let i = 0; i < params.length; i += 9) out.push({ is_insert: !existing.has(`${String(params[i])}|${String(params[i + 1])}`) });
      return { rows: out };
    }
    if (/^\s*DELETE FROM lead_products/.test(sql)) return { rows: [], rowCount: 0 };
    if (/^\s*INSERT INTO lead_products/.test(sql)) return { rows: [], rowCount: params.length / 4 };
    if (/^\s*UPDATE coa_applications/.test(sql)) return { rows: [], rowCount: ((params[0] as unknown[]) ?? []).length };
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
    computeVocabCoverage: async (_p: unknown, spec: unknown) => { vocabSpecs.push(spec); return { trade_vocab: { covered: 1, total: 1 } }; },
    emitSummary: (s: SummaryRecord) => { summaries.push(s); },
    emitMeta: (r: Record<string, string[]>, w: Record<string, string[]>) => { metas.push({ reads: r, writes: w }); },
  };

  const logicVars = { ...SEEDED, ...(opts.logicVars ?? {}) };
  const configLoader = {
    loadMarketplaceConfigs: async () => ({ logicVars }),
    validateLogicVars: (lv: unknown, schema: { safeParse(v: unknown): { success: boolean; error?: { issues: { message: string }[] } } }) => {
      const r = schema.safeParse(lv);
      return r.success ? { valid: true, errors: [] } : { valid: false, errors: (r.error?.issues ?? []).map((i) => i.message) };
    },
  };

  function customRequire(id: string): unknown {
    if (id === './lib/pipeline') return pipeline;
    if (id === './lib/config-loader') return configLoader;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    if (id === 'zod') return require('zod');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    if (id === './lib/coa-trade-classifier') return require(path.join(REPO_ROOT, 'scripts/lib/coa-trade-classifier.js'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    if (id === './lib/pipeline-realtor-availability') return require(path.join(REPO_ROOT, 'scripts/lib/pipeline-realtor-availability.js'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    if (id === './manifest.json') return require(path.join(REPO_ROOT, 'scripts/manifest.json'));
    throw new Error("[legacy-harness] unexpected require('" + id + "') from the legacy source");
  }

  const SCRIPT_REL = 'src/tests/steps/classify_coa_trades/fixtures/legacy-classify-coa-trades.js.txt';
  const source = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8').replace(/^#![^\n]*\n/, '');
  const moduleShim: { exports: Record<string, unknown> } = { exports: {} };
  const factory = new Function('require', 'module', 'exports', '__dirname', source);
  factory(customRequire, moduleShim, moduleShim.exports, path.join(REPO_ROOT, 'scripts'));

  async function runMain(): Promise<void> {
    if (!mainFn) throw new Error('[legacy-harness] pipeline.run(...) was never called by the legacy source');
    await mainFn(pool);
  }

  return { runMain, queries, summaries, metas, logs, lockIds, vocabSpecs, txnStarts };
}
