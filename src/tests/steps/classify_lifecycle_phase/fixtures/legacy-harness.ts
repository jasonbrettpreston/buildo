// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md
// SPEC LINK: docs/specs/01-pipeline/101_notification_dispatch.md §2 (the enqueuer half)
//
// ① — the CLASSIFY-LIFECYCLE-PHASE legacy oracle (V3-COA package I, C6-5, McDonald's Airtight V3).
//
// This module does NOT load `scripts/classify-lifecycle-phase.js`. It evaluates the VERBATIM legacy
// source text committed beside it as `fixtures/legacy-classify-lifecycle-phase.js.txt` (byte-identical
// to the shipped script at the ① freeze, last touched by 5ef51de7), so the conversion must reproduce the
// legacy OBSERVABLE behaviour (Spec 123 §4.5) without the legacy text being the source of truth.
//
// Curated shim: `./lib/pipeline` and `./lib/config-loader` are FAKES (transaction and advisory-lock
// wrappers, a scripted `streamQuery`, summary/meta capture; validateLogicVars runs the script's own zod
// schema exactly as the real loader does) and `Date` is frozen (the START_DATE_URGENT body reads
// Date.now()). The pool and client are a scripted SQL router keyed on the whitespace-collapsed text.
// `zod`, `./lib/lifecycle-phase`, `./lib/orphan-detection`, `./lib/leads/lead-id` and
// `./lib/notification-types` are the REAL modules (all pure).

import fs from 'fs';
import path from 'path';

/** One dirty permit row as the streaming SELECT returns it (`classify-lifecycle-phase.js:998-1007`). */
export interface PermitRow {
  permit_num: string; revision_num: string; status: string | null; enriched_status?: string | null;
  issued_date?: Date | null; last_seen_at?: Date | null;
  old_phase?: string | null; old_stalled?: boolean | null; old_matched_status?: string | null;
  old_lifecycle_seq?: number | null; permit_type?: string | null; neighbourhood_id?: number | null;
  linked_coa_application_number?: string | null;
}
/** One dirty CoA row as the streaming SELECT returns it (`:1245-1274`). */
export interface CoaRow {
  id: number; lead_id: string; decision: string | null; linked_permit_num?: string | null; status: string | null;
  last_seen_at?: Date | null; old_phase?: string | null; old_seq?: number | null; old_matched_status?: string | null;
  permit_type?: null; project_type?: string | null; coa_type_class?: string | null; neighbourhood_id?: number | null;
  days_since_activity?: number | null;
}
export interface CatalogRow { seq: number; group: string; block: string; stage: string; phase: string; bid_value: string | null; source: string; status: string }
export interface SavedRow { user_id: string; permit_num: string; revision_num: string; trade_slug: string | null }
export interface UrgentRow { user_id: string; permit_num: string; revision_num: string; trade_slug: string | null; predicted_start: string }

/** Options for `loadLegacy`. Every field is optional; defaults reproduce a quiet happy path. */
export interface LegacyOpts {
  logicVars?: Record<string, unknown>;
  /** prior_runs_7d from the grace query (default 3 → grace OFF). */
  priorRuns7d?: number;
  /** The mig-146 columns information_schema returns (default all four). */
  coaAuditCols?: string[];
  catalog?: CatalogRow[];
  /** BLD/CMB permit_nums for the orphan prefix map. */
  bldCmb?: string[];
  insp?: Array<{ permit_num: string; latest_passed_stage: string | null; latest_inspection_date: string | null; has_passed_inspection: boolean }>;
  permits?: PermitRow[];
  coas?: CoaRow[];
  /** rowCount of each permit phase UPDATE (default: the batch length). */
  permitUpdateRowCount?: number;
  coaUpdateRowCount?: number;
  /** lifecycle_transitions ON CONFLICT: rows the INSERT reports (default: every bound row). */
  coaTransitionsRowCount?: number;
  /** When true every lifecycle_status_history INSERT throws (the SAVEPOINT path). */
  ledgerFail?: boolean;
  /** lead_views saved rows (filtered by the bound (permit_num, revision_num) pairs). */
  saved?: SavedRow[];
  savedFail?: boolean;
  urgent?: UrgentRow[];
  urgentFail?: boolean;
  /** When true the notifications INSERT throws. */
  notifInsertFail?: boolean;
  backfilled?: number;
  initialTrans?: number;
  permitDist?: Array<{ lifecycle_phase: string | null; n: number }>;
  coaDist?: Array<{ lifecycle_phase: string | null; n: number }>;
  stalled?: number;
  unclPermits?: number;
  unclCoas?: number;
  lockAcquired?: boolean;
  runAt?: Date;
}

/** A captured `pool.query` / `client.query` call; `norm` is the whitespace-collapsed text. */
export interface QueryCall { sql: string; norm: string; params: unknown[]; via: 'pool' | 'client' | 'stream'; txn: number | null }
export interface SummaryRecord { records_total: number | null; records_new: number | null; records_updated: number | null; records_meta: Record<string, unknown> }
export interface MetaRecord { reads: Record<string, string[]>; writes: Record<string, string[]> }
export interface LogRecord { level: string; args: unknown[] }

export interface LegacyOracle {
  runMain(): Promise<void>;
  helpers: Record<string, unknown>;
  queries: QueryCall[];
  summaries: SummaryRecord[];
  metas: MetaRecord[];
  logs: LogRecord[];
  lockIds: number[];
  events: string[];
  txns(): number;
  requiredModules: string[];
}

export const DEFAULT_LOGIC_VARS = Object.freeze({
  coa_stall_threshold: 30,
  lifecycle_issued_stall_days: 180,
  lifecycle_inspection_stall_days: 180,
  lifecycle_p7a_max_days: 30,
  lifecycle_p7b_max_days: 90,
  lifecycle_orphan_stall_days: 180,
});

export const DEFAULT_CATALOG: CatalogRow[] = [
  { seq: 5, group: 'G1', block: 'B1', stage: 'S1', phase: 'P1', bid_value: '0.10', source: 'coa.status', status: 'Application Received' },
];

const n = (v: number | undefined, d = 0): number => (v === undefined ? d : v);

export function loadLegacy(opts: LegacyOpts = {}): LegacyOracle {
  const REPO_ROOT = path.resolve(__dirname, '../../../../../');
  const runAt = opts.runAt ?? new Date('2026-10-23T12:00:00Z');
  const queries: QueryCall[] = [];
  const summaries: SummaryRecord[] = [];
  const metas: MetaRecord[] = [];
  const logs: LogRecord[] = [];
  const lockIds: number[] = [];
  const events: string[] = [];
  const requiredModules: string[] = [];
  let txnCount = 0;
  let openTxn: number | null = null;
  let mainFn: ((pool: unknown) => Promise<void>) | null = null;

  const log = {
    info: (...args: unknown[]) => { logs.push({ level: 'info', args }); },
    warn: (...args: unknown[]) => { logs.push({ level: 'warn', args }); },
    error: (...args: unknown[]) => { logs.push({ level: 'error', args }); },
  };

  type Res = { rows: Record<string, unknown>[]; rowCount?: number };
  const pairKey = (p: unknown, r: unknown) => `${String(p)}|${String(r)}`;
  async function exec(via: 'pool' | 'client', sql: string, params: unknown[] = []): Promise<Res> {
    const s = sql.replace(/\s+/g, ' ').trim();
    queries.push({ sql, norm: s, params, via, txn: via === 'client' ? openTxn : null });
    if (s.startsWith("SELECT COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '7 days')::int AS prior_runs_7d")) {
      return { rows: [{ prior_runs_7d: n(opts.priorRuns7d, 3) }] };
    }
    if (s.startsWith('SELECT column_name FROM information_schema.columns')) {
      const cols = opts.coaAuditCols ?? ['matched_status', 'matched_rule', 'unmapped_status', 'unmapped_decision'];
      return { rows: cols.map((c) => ({ column_name: c })) };
    }
    if (s.startsWith('SELECT seq, lifecycle_group AS "group"')) return { rows: (opts.catalog ?? DEFAULT_CATALOG) as unknown as Record<string, unknown>[] };
    if (s.startsWith('SELECT permit_num FROM permits WHERE split_part(permit_num')) return { rows: (opts.bldCmb ?? []).map((p) => ({ permit_num: p })) };
    if (s.startsWith('WITH latest_passed AS (')) return { rows: (opts.insp ?? []) as unknown as Record<string, unknown>[] };
    // ── per-batch permit transaction (:840-958)
    if (s.startsWith('UPDATE permits p SET lifecycle_phase = upd.phase')) {
      events.push('UPDATE permits phase');
      const len = ((params[0] as unknown[]) ?? []).length;
      return { rows: [], rowCount: opts.permitUpdateRowCount ?? len };
    }
    if (s.startsWith('INSERT INTO permit_phase_transitions (permit_num, revision_num, from_phase, to_phase, transitioned_at, permit_type, neighbourhood_id) VALUES')) {
      events.push('INSERT permit_phase_transitions');
      return { rows: [], rowCount: params.length / 7 };
    }
    if (s === 'SAVEPOINT ledger_write' || s === 'RELEASE SAVEPOINT ledger_write' || s === 'ROLLBACK TO SAVEPOINT ledger_write') {
      events.push(s);
      return { rows: [] };
    }
    if (s.startsWith('INSERT INTO lifecycle_status_history')) {
      events.push('INSERT lifecycle_status_history');
      if (opts.ledgerFail) throw new Error('ledger insert failed');
      return { rows: [], rowCount: ((params[0] as unknown[]) ?? []).length };
    }
    if (s.startsWith('UPDATE permits SET lifecycle_classified_at = $3::timestamptz')) {
      events.push('STAMP permits');
      return { rows: [], rowCount: ((params[0] as unknown[]) ?? []).length };
    }
    // ── per-batch CoA transaction (:1131-1231)
    if (s.startsWith('UPDATE coa_applications ca SET lifecycle_phase = upd.phase')) {
      events.push('UPDATE coa_applications phase');
      return { rows: [], rowCount: opts.coaUpdateRowCount ?? ((params[0] as unknown[]) ?? []).length };
    }
    if (s.startsWith('INSERT INTO lifecycle_transitions')) {
      events.push('INSERT lifecycle_transitions');
      return { rows: [], rowCount: opts.coaTransitionsRowCount ?? ((params[0] as unknown[]) ?? []).length };
    }
    if (s.startsWith('UPDATE coa_applications SET lifecycle_classified_at = $2::timestamptz')) {
      events.push('STAMP coa_applications');
      return { rows: [], rowCount: ((params[0] as unknown[]) ?? []).length };
    }
    // ── notification enqueue (:103-256), on the POOL after the batch COMMIT
    if (s.startsWith('SELECT DISTINCT ON (lv.user_id, lv.permit_num, lv.revision_num)')) {
      events.push('SELECT lead_views saved');
      if (opts.savedFail) throw new Error('lead_views read failed');
      const want = new Set(((params[0] as unknown[]) ?? []).map((p, i) => pairKey(p, (params[1] as unknown[])[i])));
      return { rows: (opts.saved ?? []).filter((r) => want.has(pairKey(r.permit_num, r.revision_num))) as unknown as Record<string, unknown>[] };
    }
    if (s.startsWith('SELECT DISTINCT ON (tf.permit_num, tf.revision_num, lv.user_id)')) {
      events.push('SELECT trade_forecasts urgent');
      if (opts.urgentFail) throw new Error('urgent read failed');
      return { rows: (opts.urgent ?? []) as unknown as Record<string, unknown>[] };
    }
    if (s.startsWith('INSERT INTO notifications (user_id, type, permit_num, trade_slug, title, body, lead_id, created_at) VALUES')) {
      events.push('INSERT notifications');
      if (opts.notifInsertFail) throw new Error('notifications insert failed');
      return { rows: [], rowCount: params.length / 8 };
    }
    // ── backfills (:1370-1443)
    if (s.startsWith('UPDATE permits SET phase_started_at = CASE')) {
      events.push('BACKFILL phase_started_at');
      return { rows: Array.from({ length: n(opts.backfilled) }, () => ({ '?column?': 1 })) };
    }
    if (s.startsWith('INSERT INTO permit_phase_transitions (permit_num, revision_num, from_phase, to_phase, transitioned_at, permit_type, neighbourhood_id) SELECT')) {
      events.push('BACKFILL initial transitions');
      return { rows: Array.from({ length: n(opts.initialTrans) }, () => ({ '?column?': 1 })) };
    }
    // ── distribution telemetry (:1454-1515)
    if (s.startsWith('SELECT lifecycle_phase, COUNT(*)::int AS n FROM permits GROUP BY lifecycle_phase')) return { rows: (opts.permitDist ?? [{ lifecycle_phase: 'P7a', n: 10 }]) as unknown as Record<string, unknown>[] };
    if (s.startsWith('SELECT lifecycle_phase, COUNT(*)::int AS n FROM coa_applications GROUP BY lifecycle_phase')) return { rows: (opts.coaDist ?? [{ lifecycle_phase: 'P1', n: 4 }]) as unknown as Record<string, unknown>[] };
    if (s.startsWith('SELECT COUNT(*)::int AS n FROM permits WHERE lifecycle_stalled = true')) return { rows: [{ n: n(opts.stalled) }] };
    if (s.startsWith('SELECT COUNT(*)::int AS n FROM permits WHERE lifecycle_phase IS NULL')) return { rows: [{ n: n(opts.unclPermits) }] };
    if (s.startsWith('SELECT COUNT(*)::int AS n FROM coa_applications WHERE lifecycle_phase IS NULL')) return { rows: [{ n: n(opts.unclCoas) }] };
    if (s.startsWith('SELECT status, COUNT(*)::int AS n FROM permits WHERE lifecycle_phase IS NULL')) return { rows: [{ status: 'Mystery', n: 101 }] };
    throw new Error('[legacy-harness] unrouted SQL: ' + s.slice(0, 160));
  }
  const client = { query: (sql: string, params?: unknown[]) => exec('client', sql, params) };
  const pool = { query: (sql: string, params?: unknown[]) => exec('pool', sql, params) };

  async function* streamQuery(_p: unknown, sql: string, params: unknown[] = []): AsyncGenerator<Record<string, unknown>> {
    const s = sql.replace(/\s+/g, ' ').trim();
    queries.push({ sql, norm: s, params, via: 'stream', txn: null });
    let rowsOut: Record<string, unknown>[];
    if (s.startsWith('SELECT permit_num, revision_num, status, enriched_status')) {
      events.push('STREAM permits');
      rowsOut = (opts.permits ?? []) as unknown as Record<string, unknown>[];
    } else if (s.startsWith('SELECT ca.id, ca.lead_id')) {
      events.push('STREAM coa_applications');
      rowsOut = (opts.coas ?? []) as unknown as Record<string, unknown>[];
    } else {
      throw new Error('[legacy-harness] unrouted stream: ' + s.slice(0, 160));
    }
    for (const r of rowsOut) yield r;
  }

  const pipeline = {
    log,
    run: (_name: string, fn: (p: unknown) => Promise<void>) => { mainFn = fn; },
    getDbTimestamp: () => { events.push('run_at'); return Promise.resolve(runAt); },
    streamQuery,
    withTransaction: async (_p: unknown, fn: (c: typeof client) => Promise<unknown>) => {
      txnCount += 1;
      openTxn = txnCount;
      events.push('BEGIN');
      try {
        const r = await fn(client);
        events.push('COMMIT');
        return r;
      } finally {
        openTxn = null;
      }
    },
    withAdvisoryLock: async (_p: unknown, id: number, fn: () => Promise<unknown>) => {
      lockIds.push(id);
      events.push('lock ' + id);
      if (opts.lockAcquired === false) return { acquired: false, lockId: id };
      return { acquired: true, lockId: id, result: await fn() };
    },
    progress: () => undefined,
    emitSummary: (s: SummaryRecord) => { summaries.push(s); },
    emitMeta: (r: Record<string, string[]>, w: Record<string, string[]>) => { metas.push({ reads: r, writes: w }); },
  };

  const configLoader = {
    loadMarketplaceConfigs: async () => {
      events.push('config');
      return { logicVars: { ...(opts.logicVars ?? DEFAULT_LOGIC_VARS) }, tradeConfigs: {} };
    },
    validateLogicVars: (vars: unknown, schema: { safeParse(v: unknown): { success: boolean; error?: { issues: Array<{ path: unknown[]; message: string }> } } }) => {
      const r = schema.safeParse(vars);
      if (r.success) return { valid: true, errors: [] };
      return { valid: false, errors: (r.error?.issues ?? []).map((i) => `${i.path.join('.')}: ${i.message}`) };
    },
  };

  const FROZEN_NOW = Date.parse('2026-10-23T12:00:00Z');
  class FrozenDate extends Date {
    static override now(): number { return FROZEN_NOW; }
  }

  function customRequire(id: string): unknown {
    requiredModules.push(id);
    if (id === './lib/pipeline') return pipeline;
    if (id === './lib/config-loader') return configLoader;
    const real: Record<string, string> = {
      './lib/lifecycle-phase': 'scripts/lib/lifecycle-phase.js',
      './lib/orphan-detection': 'scripts/lib/orphan-detection.js',
      './lib/leads/lead-id': 'scripts/lib/leads/lead-id.js',
      './lib/notification-types': 'scripts/lib/notification-types.js',
    };
    if (id in real) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(path.join(REPO_ROOT, real[id] as string));
    }
    if (id === 'zod') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(id);
    }
    throw new Error("[legacy-harness] unexpected require('" + id + "') from the legacy source");
  }

  const SCRIPT_REL = 'src/tests/steps/classify_lifecycle_phase/fixtures/legacy-classify-lifecycle-phase.js.txt';
  const source = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8').replace(/^#![^\n]*\n/, '');
  const moduleShim: { exports: Record<string, unknown> } = { exports: {} };
  const factory = new Function(
    'require', 'module', 'exports', '__dirname', 'Date',
    source + '\n;module.exports = Object.assign({}, module.exports, { ADVISORY_LOCK_ID, LIFECYCLE_CONFIG_SCHEMA, PERMIT_BATCH_SIZE, COA_BATCH_SIZE, NOTIF_INSERT_BATCH });',
  );
  factory(customRequire, moduleShim, moduleShim.exports, path.join(REPO_ROOT, 'scripts'), FrozenDate);

  async function runMain(): Promise<void> {
    if (!mainFn) throw new Error('[legacy-harness] pipeline.run(...) was never called by the legacy source');
    await mainFn(pool);
  }

  return { runMain, helpers: moduleShim.exports, queries, summaries, metas, logs, lockIds, events, txns: () => txnCount, requiredModules };
}
