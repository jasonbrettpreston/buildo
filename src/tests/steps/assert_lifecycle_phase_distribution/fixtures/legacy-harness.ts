// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
//
// ① — the ASSERT-LIFECYCLE-PHASE-DISTRIBUTION legacy oracle (C6-1, McDonald's Airtight V3).
//
// This module does NOT load `scripts/quality/assert-lifecycle-phase-distribution.js`. It evaluates the
// VERBATIM legacy source text committed beside it as `fixtures/legacy-assert-lifecycle-phase-distribution.js.txt`
// (identical to the script at the ① freeze, last touched by 67663a81), so the conversion must reproduce the
// legacy OBSERVABLE behaviour (Spec 123 §4.5) without the legacy text being the source of truth.
//
// Curated shim (the assert_coa_freshness precedent): `./../lib/pipeline` and `./../lib/config-loader` are FAKES;
// `zod` and `./../lib/lifecycle-phase` (DEAD_STATUS_ARRAY, NORMALIZED_DEAD_DECISIONS_ARRAY) are the REAL modules.
// The legacy body runs only when `require.main === module` (its §R1 guard, :147); `asCli` (default true)
// makes the shim's `require.main` the module, as a CLI launch would. The fake pool answers each of the
// legacy SELECTs by its shape and records which one it answered.

import fs from 'fs';
import path from 'path';

/** One `universal_stream_catalog` row. */
export interface CatalogRow { seq: number; rows_count: number | null }

/** What the fake database holds. Every field is optional; defaults reproduce a small healthy estate. */
export interface Db {
  /** `false` = the catalog table does not exist (information_schema says so). */
  catalogExists?: boolean;
  catalog?: CatalogRow[];
  /** `permits` lifecycle_phase → count (`null` key = NULL phase). */
  permitPhases?: Record<string, number>;
  coaPhases?: Record<string, number>;
  /** lifecycle_seq → count over permits ∪ coa. */
  seqCounts?: Record<number, number>;
  seqUnclassifiedPermits?: number;
  seqUnclassifiedCoa?: number;
  unclassifiedPermits?: number;
  unclassifiedCoa?: number;
  liveStatusNull?: number;
  neverClassified?: number;
  bid?: { p_total: number; p_cov: number; c_total: number; c_cov: number };
  crossStalled?: number;
  crossActive?: number;
  crossIssued?: number;
}

export interface LegacyOpts {
  db?: Db;
  /** Merged over `defaultVars(catalog)`. */
  logicVars?: Record<string, unknown>;
  lockAcquired?: boolean;
  /** When false, `require.main !== module` (the script is required, not launched). */
  asCli?: boolean;
}

export interface QueryCall { sql: string; params: unknown[]; answered: string }
export interface SummaryRecord { records_total: number | null; records_new: number | null; records_updated: number | null; records_meta: Record<string, unknown> }
export interface MetaRecord { reads: Record<string, string[]>; writes: Record<string, string[]> }
export interface LogRecord { level: string; args: unknown[] }

export interface LegacyOracle {
  runMain(): Promise<void>;
  ran: boolean;
  exports: Record<string, unknown>;
  queries: QueryCall[];
  summaries: SummaryRecord[];
  metas: MetaRecord[];
  logs: LogRecord[];
  lockIds: number[];
  configLoads: string[];
}

/** The 18 phase-band suffixes (`assert-lifecycle-phase-distribution.js:40-53`). */
export const PHASE_SUFFIXES = ['p3', 'p4', 'p5', 'p6', 'p7a', 'p7b', 'p7c', 'p7d', 'p8', 'p18', 'p19', 'p20', 'p9_p17_agg', 'o1', 'o2', 'o3', 'coa_p1', 'coa_p2'];

/** A small catalog: seq 1 and 3 carry counts, seq 2 is a catalog-null (rows_count 0) INFO-only band. */
export const SMALL_CATALOG: readonly CatalogRow[] = Object.freeze([{ seq: 1, rows_count: 100 }, { seq: 2, rows_count: 0 }, { seq: 3, rows_count: 50 }]);

/** Seeded scalars (`scripts/seeds/logic_variables.json`; live values measured 2026-10-19), wide phase bands, and a 0..1000 band per catalog seq. */
export function defaultVars(catalog: readonly CatalogRow[]): Record<string, unknown> {
  const v: Record<string, unknown> = {
    lifecycle_unclassified_max: 100,
    lifecycle_live_status_null_warn_count: 50,
    lifecycle_seq_unclassified_max: 5000,
    lifecycle_cross_stalled_threshold: 1000,
    lifecycle_cross_active_inspection_threshold: 500,
    lifecycle_cross_issued_threshold: 500,
    lifecycle_seq_band_promote_to_fail_band_violation: 0,
    lifecycle_seq_band_promote_to_fail_no_band_configured: 0,
    lifecycle_seq_band_promote_to_fail_expected_data_missing: 0,
  };
  for (const s of PHASE_SUFFIXES) { v[`lifecycle_band_${s}_min`] = 0; v[`lifecycle_band_${s}_max`] = 1000000; }
  for (const r of catalog) { v[`lifecycle_seq_band_${r.seq}_min`] = 1; v[`lifecycle_seq_band_${r.seq}_max`] = 1000; }
  return v;
}

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

  const db: Required<Db> = {
    catalogExists: true,
    catalog: [...SMALL_CATALOG],
    permitPhases: { P7a: 40, P12: 30, null: 5 },
    coaPhases: { P1: 20, P2: 10 },
    seqCounts: { 1: 100, 3: 50 },
    seqUnclassifiedPermits: 0,
    seqUnclassifiedCoa: 0,
    unclassifiedPermits: 0,
    unclassifiedCoa: 0,
    liveStatusNull: 0,
    neverClassified: 0,
    bid: { p_total: 200, p_cov: 0, c_total: 100, c_cov: 100 },
    crossStalled: 0,
    crossActive: 0,
    crossIssued: 0,
    ...(opts.db ?? {}),
  };
  const counts = (m: Record<string, number>) => Object.entries(m).map(([k, n]) => ({ lifecycle_phase: k === 'null' ? null : k, n }));

  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      const has = (s: string) => sql.includes(s);
      let answered: string;
      let rows: unknown[];
      if (has('information_schema.tables')) { answered = 'catalog_exists'; rows = [{ exists: db.catalogExists }]; }
      else if (has('FROM universal_stream_catalog')) { answered = 'catalog'; rows = db.catalog; }
      else if (has('UNION ALL')) { answered = 'seq_distribution'; rows = Object.entries(db.seqCounts).map(([s, n]) => ({ lifecycle_seq: Number(s), n })); }
      else if (has('GROUP BY lifecycle_phase') && has('FROM coa_applications')) { answered = 'coa_phases'; rows = counts(db.coaPhases); }
      else if (has('GROUP BY lifecycle_phase')) { answered = 'permit_phases'; rows = counts(db.permitPhases); }
      // The cross checks first: two of them also say `OR lifecycle_phase IS NULL`.
      else if (has("'stalled'")) { answered = 'cross_stalled'; rows = [{ n: db.crossStalled }]; }
      else if (has("'active inspection'")) { answered = 'cross_active'; rows = [{ n: db.crossActive }]; }
      else if (has("'permit issued'")) { answered = 'cross_issued'; rows = [{ n: db.crossIssued }]; }
      else if (has('lifecycle_seq IS NULL') && has('FROM coa_applications')) { answered = 'seq_unclassified_coa'; rows = [{ n: db.seqUnclassifiedCoa }]; }
      else if (has('lifecycle_seq IS NULL')) { answered = 'seq_unclassified_permits'; rows = [{ n: db.seqUnclassifiedPermits }]; }
      else if (has('matched_rule IS NULL')) { answered = 'live_status_null'; rows = [{ n: db.liveStatusNull }]; }
      else if (has('lifecycle_phase IS NULL') && has('FROM coa_applications')) { answered = 'unclassified_coa'; rows = [{ n: db.unclassifiedCoa }]; }
      else if (has('lifecycle_phase IS NULL')) { answered = 'unclassified_permits'; rows = [{ n: db.unclassifiedPermits }]; }
      else if (has('lifecycle_classified_at IS NULL')) { answered = 'never_classified'; rows = [{ n: db.neverClassified }]; }
      else if (has('AS p_total')) { answered = 'bid_coverage'; rows = [db.bid]; }
      else throw new Error('[legacy-harness] unrecognised SELECT: ' + sql.slice(0, 80));
      queries.push({ sql, params, answered });
      return { rows };
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
      return { logicVars: { ...defaultVars(db.catalog), ...(opts.logicVars ?? {}) } };
    },
    validateLogicVars: (logicVars: unknown, schema: { safeParse(v: unknown): { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } } }) => {
      const result = schema.safeParse(logicVars);
      if (!result.success) {
        return { valid: false, errors: (result.error?.issues ?? []).map((i) => `${i.path.join('.')}: ${i.message}`) };
      }
      return { valid: true };
    },
  };

  const moduleShim: { exports: Record<string, unknown> } = { exports: {} };
  const customRequire = ((id: string): unknown => {
    if (id === './../lib/pipeline') return pipeline;
    if (id === './../lib/config-loader') return configLoader;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    if (id === './../lib/lifecycle-phase') return require(path.join(REPO_ROOT, 'scripts/lib/lifecycle-phase.js'));
    if (id === 'zod') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('zod');
    }
    throw new Error("[legacy-harness] unexpected require('" + id + "') from the legacy source");
  }) as ((id: string) => unknown) & { main?: unknown };
  customRequire.main = opts.asCli === false ? {} : moduleShim;

  const SCRIPT_REL = 'src/tests/steps/assert_lifecycle_phase_distribution/fixtures/legacy-assert-lifecycle-phase-distribution.js.txt';
  const source = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8').replace(/^#![^\n]*\n/, '');
  const factory = new Function('require', 'module', 'exports', '__dirname', source);
  factory(customRequire, moduleShim, moduleShim.exports, path.join(REPO_ROOT, 'scripts/quality'));

  const oracle: LegacyOracle = {
    async runMain(): Promise<void> {
      if (!mainFn) throw new Error('[legacy-harness] pipeline.run(...) was never called by the legacy source');
      await mainFn(pool);
    },
    ran: mainFn !== null,
    exports: moduleShim.exports,
    queries, summaries, metas, logs, lockIds, configLoads,
  };
  return oracle;
}
