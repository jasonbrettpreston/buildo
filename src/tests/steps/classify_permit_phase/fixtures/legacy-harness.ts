// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
//
// ① — the CLASSIFY-PERMIT-PHASE legacy oracle (C6-2, W2 of the V3-CoA path, McDonald's Airtight V3).
//
// This module does NOT load `scripts/classify-permit-phase.js`. It evaluates the VERBATIM legacy source
// text committed beside it as `fixtures/legacy-classify-permit-phase.js.txt` (byte-identical to the
// shipped script at the ① freeze, last touched by 50837ef4, sha256 f952f0cb…), so the conversion must
// reproduce the legacy OBSERVABLE behaviour (Spec 123 §4.5) without the legacy text being the source of
// truth.
//
// Curated shim: `./lib/pipeline` is a FAKE (advisory-lock and transaction wrappers, getDbTimestamp,
// summary/meta capture) and `Date` is frozen (the duration reads Date.now()). The pool and client are a
// scripted SQL router keyed on the whitespace-collapsed text: it returns the scripted counts, it does
// NOT evaluate the WHERE clauses (the predicates are pinned as text; their live effect is a PRE capture).
// `./lib/safe-math` is the REAL module (pure).

import fs from 'fs';
import path from 'path';

/** Options for `loadLegacy`. Every field is optional; defaults reproduce a quiet happy path. */
export interface LegacyOpts {
  /** The pre-UPDATE eligible count (`cnt`), as the driver returns it (a string for COUNT(*)). */
  eligible?: unknown;
  /** permit_nums the guarded UPDATE's RETURNING yields (default three). */
  examined?: string[];
  /** The post-UPDATE cumulative counts. */
  totalExamination?: unknown;
  totalInspection?: unknown;
  /** When true the guarded UPDATE throws inside its transaction. */
  updateFail?: boolean;
  /** When true the post-COMMIT stats read throws. */
  statsFail?: boolean;
  lockAcquired?: boolean;
  runAt?: Date;
}

/** A captured `pool.query` / `client.query` call; `norm` is the whitespace-collapsed text. */
export interface QueryCall { sql: string; norm: string; params: unknown[]; via: 'pool' | 'client'; txn: number | null }
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

export const DEFAULT_EXAMINED = Object.freeze(['24 100001 BLD', '24 100002 HVA', '24 100003 PLB']);

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
  async function exec(via: 'pool' | 'client', sql: string, params: unknown[] = []): Promise<Res> {
    const s = sql.replace(/\s+/g, ' ').trim();
    queries.push({ sql, norm: s, params, via, txn: via === 'client' ? openTxn : null });
    if (s.startsWith('SELECT COUNT(*) AS cnt FROM permits')) {
      events.push('SELECT eligible');
      return { rows: [{ cnt: opts.eligible === undefined ? '5' : opts.eligible }] };
    }
    if (s.startsWith('UPDATE permits SET enriched_status')) {
      events.push('UPDATE permits');
      if (opts.updateFail) throw new Error('update failed');
      const examined = opts.examined ?? [...DEFAULT_EXAMINED];
      return { rows: examined.map((p) => ({ permit_num: p })), rowCount: examined.length };
    }
    if (s.startsWith('SELECT COUNT(*) FILTER (WHERE enriched_status')) {
      events.push('SELECT stats');
      if (opts.statsFail) throw new Error('stats read failed');
      return {
        rows: [{
          total_examination: opts.totalExamination === undefined ? '40' : opts.totalExamination,
          total_inspection: opts.totalInspection === undefined ? '160' : opts.totalInspection,
        }],
      };
    }
    throw new Error('[legacy-harness] unrouted SQL: ' + s.slice(0, 160));
  }
  const client = { query: (sql: string, params?: unknown[]) => exec('client', sql, params) };
  const pool = { query: (sql: string, params?: unknown[]) => exec('pool', sql, params) };

  const pipeline = {
    log,
    run: (_name: string, fn: (p: unknown) => Promise<void>) => { mainFn = fn; },
    getDbTimestamp: () => { events.push('run_at'); return Promise.resolve(runAt); },
    withTransaction: async (_p: unknown, fn: (c: typeof client) => Promise<unknown>) => {
      txnCount += 1;
      openTxn = txnCount;
      events.push('BEGIN');
      try {
        const r = await fn(client);
        events.push('COMMIT');
        return r;
      } catch (err) {
        events.push('ROLLBACK');
        throw err;
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
    emitSummary: (s: SummaryRecord) => { events.push('summary'); summaries.push(s); },
    emitMeta: (r: Record<string, string[]>, w: Record<string, string[]>) => { events.push('meta'); metas.push({ reads: r, writes: w }); },
  };

  const FROZEN_NOW = Date.parse('2026-10-23T12:00:00Z');
  class FrozenDate extends Date {
    static override now(): number { return FROZEN_NOW; }
  }

  function customRequire(id: string): unknown {
    requiredModules.push(id);
    if (id === './lib/pipeline') return pipeline;
    if (id === './lib/safe-math') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(path.join(REPO_ROOT, 'scripts/lib/safe-math.js'));
    }
    throw new Error("[legacy-harness] unexpected require('" + id + "') from the legacy source");
  }

  const SCRIPT_REL = 'src/tests/steps/classify_permit_phase/fixtures/legacy-classify-permit-phase.js.txt';
  const source = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8').replace(/^#![^\n]*\n/, '');
  const moduleShim: { exports: Record<string, unknown> } = { exports: {} };
  const factory = new Function(
    'require', 'module', 'exports', '__dirname', 'Date',
    source + '\n;module.exports = Object.assign({}, module.exports, { ADVISORY_LOCK_ID });',
  );
  factory(customRequire, moduleShim, moduleShim.exports, path.join(REPO_ROOT, 'scripts'), FrozenDate);

  async function runMain(): Promise<void> {
    if (!mainFn) throw new Error('[legacy-harness] pipeline.run(...) was never called by the legacy source');
    await mainFn(pool);
  }

  return { runMain, helpers: moduleShim.exports, queries, summaries, metas, logs, lockIds, events, txns: () => txnCount, requiredModules };
}
