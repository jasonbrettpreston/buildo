// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7, §8.7
//
// ① — the COMPUTE-PHASE-CALIBRATION legacy oracle (C6-3, McDonald's Airtight V3).
//
// This module does NOT load `scripts/compute-phase-calibration.js`. It evaluates the VERBATIM legacy source
// text committed beside it as `fixtures/legacy-compute-phase-calibration.js.txt` (identical to the script at
// the ① freeze, sha256 d7f018dc…, last touched by 0ba9f6b7), so the conversion must reproduce the legacy
// OBSERVABLE behaviour (Spec 123 §4.5) without the legacy text being the source of truth.
//
// Curated shim (the assert_lifecycle_phase_distribution precedent): `./lib/pipeline` and `./lib/config-loader`
// are FAKES; `zod` is the REAL module. The legacy body runs only when `require.main === module` (:123);
// `asCli` (default true) makes the shim's `require.main` the module, as a CLI launch would. The fake pool
// answers each legacy SELECT by its shape and records which one it answered; the fake transaction client
// records every statement of the write (:413-434). The aggregate SQL itself is NOT evaluated: the fake
// returns the buckets the test hands it (the SQL text is pinned by its own tokens instead).

import fs from 'fs';
import path from 'path';

/** One aggregate bucket as the legacy SELECTs return it (`:256-266`, `:314-324`). */
export interface Bucket {
  permit_type: string | null;
  project_type: string | null;
  coa_type_class: string | null;
  from_seq: number | null;
  to_seq: number | null;
  phase: string | null;
  median_days: number | null;
  p25_days: number | null;
  p75_days: number | null;
  sample_size: number;
}

/** What the fake database holds. Every field is optional; defaults reproduce a small healthy estate. */
export interface Db {
  ltExists?: boolean;
  pscExists?: boolean;
  coaAppsExists?: boolean;
  /** COUNT(*) of lifecycle_transitions with lead_id LIKE 'coa:%' (no seq filter, :170-172). */
  coaLeadRows?: number;
  /** coa_applications project_type coverage percent (:191-196). */
  coaAppsPct?: number;
  /** lifecycle_transitions (CoA) project_type coverage percent (:201-207). */
  ltPct?: number;
  permitBuckets?: Bucket[];
  coaBuckets?: Bucket[];
  /** coa_transition_count (:390-394). */
  coaTransitionCount?: number;
  /** coa_type_class_null_transition_count (:400-405). */
  coaNullCount?: number;
}

export interface LegacyOpts {
  db?: Db;
  logicVars?: Record<string, unknown>;
  lockAcquired?: boolean;
  asCli?: boolean;
  runAt?: string;
}

export interface QueryCall { sql: string; params: unknown[]; answered: string }
export interface TxnCall { sql: string; params: unknown[] }
export interface SummaryRecord { records_total: number | null; records_new: number | null; records_updated: number | null; records_meta: Record<string, unknown> }
export interface MetaRecord { reads: Record<string, string[]>; writes: Record<string, string[]> }
export interface LogRecord { level: string; args: unknown[] }

export interface LegacyOracle {
  runMain(): Promise<void>;
  ran: boolean;
  exports: Record<string, unknown>;
  queries: QueryCall[];
  /** One entry per `withTransaction` call; each holds the statements issued on its client, in order. */
  txns: TxnCall[][];
  summaries: SummaryRecord[];
  metas: MetaRecord[];
  logs: LogRecord[];
  lockIds: number[];
  configLoads: string[];
}

export const RUN_AT = '2026-10-23T04:00:00.000Z';

export function permitBucket(permit_type: string, phase: string, sample_size: number): Bucket {
  return { permit_type, project_type: null, coa_type_class: null, from_seq: null, to_seq: null, phase, median_days: 10, p25_days: 5, p75_days: 20, sample_size };
}
export function coaBucket(project_type: string | null, coa_type_class: string | null, from_seq: number, to_seq: number, sample_size: number): Bucket {
  return { permit_type: null, project_type, coa_type_class, from_seq, to_seq, phase: 'P1', median_days: 30, p25_days: 15, p75_days: 45, sample_size };
}

/** The seeded variable (`scripts/seeds/logic_variables.json` `calibration_freshness_warn_hours`, default 48). */
export function defaultVars(): Record<string, unknown> {
  return { calibration_freshness_warn_hours: 48 };
}

export function loadLegacy(opts: LegacyOpts = {}): LegacyOracle {
  const REPO_ROOT = path.resolve(__dirname, '../../../../../');
  const queries: QueryCall[] = [];
  const txns: TxnCall[][] = [];
  const summaries: SummaryRecord[] = [];
  const metas: MetaRecord[] = [];
  const logs: LogRecord[] = [];
  const lockIds: number[] = [];
  const configLoads: string[] = [];
  let mainFn: ((pool: unknown) => Promise<void>) | null = null;
  const runAt = opts.runAt ?? RUN_AT;

  const capture = (level: string) => (...args: unknown[]) => { logs.push({ level, args }); };
  const log = { info: capture('info'), warn: capture('warn'), error: capture('error') };

  const db: Required<Db> = {
    ltExists: true,
    pscExists: true,
    coaAppsExists: true,
    coaLeadRows: 400,
    coaAppsPct: 90,
    ltPct: 85,
    permitBuckets: [permitBucket('New Building', 'P7a', 150), permitBucket('Small Residential Projects', 'P8', 40)],
    coaBuckets: [coaBucket('addition', 'minor_variance', 1, 2, 120), coaBucket('new_build', 'consent', 2, 3, 35)],
    coaTransitionCount: 380,
    coaNullCount: 10,
    ...(opts.db ?? {}),
  };

  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      const has = (s: string) => sql.includes(s);
      let answered: string;
      let rows: unknown[];
      if (has('SELECT NOW() AS now')) { answered = 'db_clock'; rows = [{ now: runAt }]; }
      else if (has('information_schema.tables') && has("'lifecycle_transitions'")) { answered = 'lt_exists'; rows = [{ exists: db.ltExists }]; }
      else if (has('information_schema.tables') && has("'phase_stay_calibration'")) { answered = 'psc_exists'; rows = [{ exists: db.pscExists }]; }
      else if (has('information_schema.tables') && has("'coa_applications'")) { answered = 'coa_apps_exists'; rows = [{ exists: db.coaAppsExists }]; }
      else if (has('ROUND(100.0') && has('FROM coa_applications')) { answered = 'coa_apps_coverage'; rows = [{ pct: db.coaAppsPct }]; }
      else if (has('ROUND(100.0') && has('FROM lifecycle_transitions')) { answered = 'lt_coverage'; rows = [{ pct: db.ltPct }]; }
      else if (has('FROM permit_phase_transitions')) { answered = 'permit_agg'; rows = db.permitBuckets; }
      else if (has('coa_transitions_with_duration')) { answered = 'coa_agg'; rows = db.coaBuckets; }
      else if (has('FROM lifecycle_transitions') && has('coa_type_class IS NULL')) { answered = 'coa_null_count'; rows = [{ n: db.coaNullCount }]; }
      else if (has('FROM lifecycle_transitions') && has('BETWEEN 1 AND 22')) { answered = 'coa_transition_count'; rows = [{ n: db.coaTransitionCount }]; }
      else if (has('FROM lifecycle_transitions')) { answered = 'coa_lead_rows'; rows = [{ n: db.coaLeadRows }]; }
      else throw new Error('[legacy-harness] unrecognised SELECT: ' + sql.slice(0, 80));
      queries.push({ sql, params, answered });
      return { rows };
    },
  };

  const pipeline = {
    log,
    run: (_name: string, fn: (p: unknown) => Promise<void>) => { mainFn = fn; },
    getDbTimestamp: async (p: { query: (s: string) => Promise<{ rows: { now: string }[] }> }) => {
      const { rows } = await p.query('SELECT NOW() AS now');
      return rows[0]?.now;
    },
    // The real helper (scripts/lib/pipeline.js:1037-1071) emits this skip summary itself when the lock is held.
    withAdvisoryLock: async (_p: unknown, id: number, fn: () => Promise<unknown>) => {
      lockIds.push(id);
      if (opts.lockAcquired === false) {
        summaries.push({ records_total: 0, records_new: 0, records_updated: 0, records_meta: { skipped: true, reason: 'advisory_lock_held_elsewhere' } });
        return { acquired: false };
      }
      return { acquired: true, result: await fn() };
    },
    withTransaction: async (_p: unknown, fn: (client: unknown) => Promise<unknown>) => {
      const calls: TxnCall[] = [];
      txns.push(calls);
      const client = { query: async (sql: string, params: unknown[] = []) => { calls.push({ sql, params }); return { rows: [], rowCount: 0 }; } };
      return fn(client);
    },
    emitSummary: (s: SummaryRecord) => { summaries.push(s); },
    emitMeta: (r: Record<string, string[]>, w: Record<string, string[]>) => { metas.push({ reads: r, writes: w }); },
  };

  const configLoader = {
    loadMarketplaceConfigs: async (_pool: unknown, tag: string) => {
      configLoads.push(tag);
      return { logicVars: { ...defaultVars(), ...(opts.logicVars ?? {}) } };
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
    if (id === './lib/pipeline') return pipeline;
    if (id === './lib/config-loader') return configLoader;
    if (id === 'zod') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('zod');
    }
    throw new Error("[legacy-harness] unexpected require('" + id + "') from the legacy source");
  }) as ((id: string) => unknown) & { main?: unknown };
  customRequire.main = opts.asCli === false ? {} : moduleShim;

  const SCRIPT_REL = 'src/tests/steps/compute_phase_calibration/fixtures/legacy-compute-phase-calibration.js.txt';
  const source = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8').replace(/^#![^\n]*\n/, '');
  const factory = new Function('require', 'module', 'exports', '__dirname', source);
  factory(customRequire, moduleShim, moduleShim.exports, path.join(REPO_ROOT, 'scripts'));

  return {
    async runMain(): Promise<void> {
      if (!mainFn) throw new Error('[legacy-harness] pipeline.run(...) was never called by the legacy source');
      await mainFn(pool);
    },
    ran: mainFn !== null,
    exports: moduleShim.exports,
    queries, txns, summaries, metas, logs, lockIds, configLoads,
  };
}
