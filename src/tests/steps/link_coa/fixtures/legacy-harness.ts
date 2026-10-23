// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.D, §6.6.X, §6.11 Phase D R5.1 + R5.6
// SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md (Link CoA)
//
// ① — the LINK-COA legacy oracle (V3-COA package H, C6-4, McDonald's Airtight V3).
//
// This module does NOT load `scripts/link-coa.js`. It evaluates the VERBATIM legacy source text
// committed beside it as `fixtures/legacy-link-coa.js.txt` (byte-identical to `scripts/link-coa.js`
// at the ① freeze, last touched by 9a73771e, R-JM), so the conversion must reproduce the legacy
// OBSERVABLE behaviour (Spec 123 §4.5) without the legacy text being the source of truth.
//
// Curated shim: `./lib/pipeline` and `./lib/config-loader` are FAKES (txn and advisory-lock
// wrappers, summary/meta capture, a scripted logic_variables read; validateLogicVars runs the
// script's own zod schema exactly as the real loader does), `Date.now` is frozen and `process`
// is a fake carrying only `argv` and `env` (the script reads `--dry-run` and PIPELINE_CHAIN).
// The pool and client are a scripted SQL router keyed on the whitespace-collapsed statement text.
// `zod`, `./lib/lifecycle-phase` (SKIP_PHASES_SQL) and `./lib/safe-math` are the REAL modules.

import fs from 'fs';
import path from 'path';

/** One Tier-3 candidate row as the description SELECT returns it. */
export interface Tier3Row { id: number; application_number: string; ward: string | null; description: string }

/** Options for `loadLegacy`. Every field is optional; defaults reproduce a quiet happy path. */
export interface LegacyOpts {
  /** Raw logic_variables (default DEFAULT_LOGIC_VARS). */
  logicVars?: Record<string, unknown>;
  /** COUNT of CoAs with linked_permit_num IS NULL at start. Default 5. */
  unlinked?: number;
  /** Cross-ward pre-pass: the (application_number, permit_num) pairs the SELECT returns. */
  crossWard?: Array<{ application_number: string; permit_num: string }>;
  /** rowCount of the stale back-ref clear. */
  staleBackRefs?: number;
  /** Tier UPDATE RETURNING rows (linked permit_nums), keyed by the interpolated confidence text ('0.95', '0.85', '0.1', '0.6', '0.5' — JS number rendering). */
  tiers?: Record<string, string[]>;
  /** Dry-run tier COUNTs in tier order (1a, 1b, 1c, 2a, 2b). */
  dryTierCounts?: number[];
  /** Tier-3 candidate rows. */
  tier3?: Tier3Row[];
  /** Tier-3 link per candidate id -> permit_num (a candidate absent from the map links nothing). */
  tier3Links?: Record<number, string>;
  /** Zero-based Tier-3 batch indexes whose UPDATE throws. */
  tier3FailBatches?: number[];
  /** rowCount of the permits.last_seen_at bump (default = the bound permit list length). */
  bumped?: number;
  backRefCleared?: number;
  backRefSet?: number;
  wardMismatch?: number;
  wardFill?: number;
  latLngUpgrade?: number;
  inherited?: number;
  belowFloor?: number;
  eligible?: number;
  /** Post-enrichment lat/lng mismatch (pool). */
  leadMismatch?: number;
  prePermitLinks?: number;
  crossWardLinks?: number;
  potential?: number;
  /** When false the advisory lock reports `{ acquired: false }`. */
  lockAcquired?: boolean;
  runAt?: Date;
  /** process.argv tail (e.g. ['--dry-run']). */
  argv?: string[];
  /** process.env.PIPELINE_CHAIN. */
  chain?: string;
}

/** A captured `pool.query` / `client.query` call; `norm` is the whitespace-collapsed text. */
export interface QueryCall { sql: string; norm: string; params: unknown[]; via: 'pool' | 'client' }
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

export const DEFAULT_LOGIC_VARS = Object.freeze({ coa_match_conf_high: 0.9, coa_match_conf_medium: 0.5, coa_inherit_from_permit_min_confidence: 0.6 });

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
  let tiersStarted = false;
  let dryTierIdx = 0;
  let tier3Batch = 0;
  let mainFn: ((pool: unknown) => Promise<void>) | null = null;
  const crossWard = opts.crossWard ?? [];

  const log = {
    info: (...args: unknown[]) => { logs.push({ level: 'info', args }); },
    warn: (...args: unknown[]) => { logs.push({ level: 'warn', args }); },
    error: (...args: unknown[]) => { logs.push({ level: 'error', args }); },
  };

  type Res = { rows: Record<string, unknown>[]; rowCount?: number };
  async function exec(via: 'pool' | 'client', sql: string, params: unknown[] = []): Promise<Res> {
    const s = sql.replace(/\s+/g, ' ').trim();
    queries.push({ sql, norm: s, params, via });
    if (s.startsWith('SELECT COUNT(*) as total FROM coa_applications WHERE linked_permit_num IS NULL')) {
      return { rows: [{ total: String(n(opts.unlinked, 5)) }] };
    }
    if (s.startsWith('SELECT ca.application_number, ca.linked_permit_num AS permit_num')) return { rows: crossWard };
    if (s.startsWith('UPDATE coa_applications ca SET linked_permit_num = NULL, linked_confidence = NULL FROM permits p')) {
      events.push('UNLINK cross-ward');
      return { rows: [], rowCount: crossWard.length };
    }
    if (s.startsWith('UPDATE permits p SET linked_coa_application_number = NULL FROM (SELECT unnest(')) {
      return { rows: [], rowCount: n(opts.staleBackRefs) };
    }
    if (s.startsWith('SELECT COUNT(*) FROM coa_applications ca JOIN permits p ON p.permit_num = ca.linked_permit_num WHERE ca.linked_permit_num IS NOT NULL AND ca.ward IS NOT NULL')) {
      // the dry-run preview (before the tiers) and the post-run cross_ward_links count share one text
      return { rows: [{ count: String(tiersStarted ? n(opts.crossWardLinks) : crossWard.length) }] };
    }
    const tierUpd = s.match(/^UPDATE coa_applications ca SET linked_permit_num = matched\.permit_num, linked_confidence = (\d\.\d+) FROM/);
    if (tierUpd) {
      tiersStarted = true;
      const conf = tierUpd[1] as string;
      events.push('TIER ' + conf);
      const linked = opts.tiers?.[conf] ?? [];
      return { rows: linked.map((p) => ({ linked_permit_num: p })), rowCount: linked.length };
    }
    if (s.startsWith('SELECT COUNT(DISTINCT ca2.id) as cnt FROM coa_applications ca2 JOIN permits p')) {
      tiersStarted = true;
      const c = opts.dryTierCounts?.[dryTierIdx] ?? 0;
      dryTierIdx += 1;
      return { rows: [{ cnt: String(c) }] };
    }
    if (s.startsWith('SELECT id, application_number, ward, description FROM coa_applications WHERE linked_permit_num IS NULL')) {
      tiersStarted = true;
      return { rows: (opts.tier3 ?? []) as unknown as Record<string, unknown>[] };
    }
    if (s.startsWith('WITH candidates AS (') && /UPDATE coa_applications ca/.test(s)) {
      const idx = tier3Batch;
      tier3Batch += 1;
      events.push('TIER3 batch ' + idx);
      if ((opts.tier3FailBatches ?? []).includes(idx)) throw new Error('tsquery syntax error');
      const ids = (params[0] as number[]) ?? [];
      const linked = ids.filter((id) => opts.tier3Links?.[id] !== undefined).map((id) => ({ linked_permit_num: opts.tier3Links?.[id] }));
      return { rows: linked, rowCount: linked.length };
    }
    if (s.startsWith('WITH candidates AS (') && /SELECT COUNT\(\*\) as cnt/.test(s)) {
      const ids = (params[0] as number[]) ?? [];
      return { rows: [{ cnt: String(ids.filter((id) => opts.tier3Links?.[id] !== undefined).length) }] };
    }
    if (s.startsWith('UPDATE permits SET last_seen_at = $2::timestamptz')) {
      events.push('BUMP permits.last_seen_at');
      return { rows: [], rowCount: opts.bumped ?? ((params[0] as unknown[]) ?? []).length };
    }
    if (s.startsWith('UPDATE permits p SET linked_coa_application_number = NULL WHERE p.linked_coa_application_number IS NOT NULL')) {
      events.push('BACKREF clear');
      return { rows: [], rowCount: n(opts.backRefCleared) };
    }
    if (s.startsWith('UPDATE permits p SET linked_coa_application_number = src.application_number')) {
      events.push('BACKREF set');
      return { rows: [], rowCount: n(opts.backRefSet) };
    }
    if (s.startsWith('WITH best_permit AS (')) {
      if (/^WITH best_permit AS \( SELECT DISTINCT ON \(p\.permit_num\) p\.permit_num, p\.ward FROM permits p ORDER BY/.test(s)) return { rows: [{ n: n(opts.wardMismatch) }] };
      if (/AND ca\.ward IS NULL$/.test(s)) return { rows: [{ n: n(opts.wardFill) }] };
      if (/UPDATE coa_applications ca SET latitude = bp\.latitude/.test(s)) {
        events.push('ENRICH coa lat/lng/ward');
        return { rows: [], rowCount: n(opts.inherited) };
      }
      if (/SELECT COUNT\(\*\)::int AS n/.test(s)) return { rows: [{ n: via === 'client' ? n(opts.latLngUpgrade) : n(opts.leadMismatch) }] };
    }
    if (s.startsWith('SELECT COUNT(*)::int AS n FROM coa_applications WHERE linked_permit_num IS NOT NULL AND linked_confidence < $1::numeric')) return { rows: [{ n: n(opts.belowFloor) }] };
    if (s.startsWith('SELECT COUNT(*)::int AS n FROM coa_applications WHERE linked_permit_num IS NOT NULL AND linked_confidence >= $1::numeric')) return { rows: [{ n: n(opts.eligible) }] };
    if (s.startsWith('SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE linked_permit_num IS NOT NULL) AS linked')) {
      return { rows: [{ total: '100', linked: '90', high_conf: '50', med_conf: '20', low_conf: '20', upcoming: '3' }] };
    }
    if (/AND p\.permit_type = 'Pre-Permit'$/.test(s)) return { rows: [{ count: String(n(opts.prePermitLinks)) }] };
    if (/AS could_link/.test(s)) return { rows: [{ could_link: String(n(opts.potential)) }] };
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
      events.push('BEGIN');
      const r = await fn(client);
      events.push('COMMIT');
      return r;
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
  const fakeProcess = {
    argv: ['node', 'scripts/link-coa.js', ...(opts.argv ?? [])],
    env: opts.chain === undefined ? {} : { PIPELINE_CHAIN: opts.chain },
  };

  function customRequire(id: string): unknown {
    requiredModules.push(id);
    if (id === './lib/pipeline') return pipeline;
    if (id === './lib/config-loader') return configLoader;
    const real: Record<string, string> = {
      './lib/safe-math': 'scripts/lib/safe-math.js',
      './lib/lifecycle-phase': 'scripts/lib/lifecycle-phase.js',
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

  const SCRIPT_REL = 'src/tests/steps/link_coa/fixtures/legacy-link-coa.js.txt';
  const source = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8').replace(/^#![^\n]*\n/, '');
  const moduleShim: { exports: Record<string, unknown> } = { exports: {} };
  const factory = new Function(
    'require', 'module', 'exports', '__dirname', 'Date', 'process',
    source + '\n;module.exports = Object.assign({}, module.exports, { ADVISORY_LOCK_ID, LOGIC_VARS_SCHEMA });',
  );
  factory(customRequire, moduleShim, moduleShim.exports, path.join(REPO_ROOT, 'scripts'), FrozenDate, fakeProcess);

  async function runMain(): Promise<void> {
    if (!mainFn) throw new Error('[legacy-harness] pipeline.run(...) was never called by the legacy source');
    await mainFn(pool);
  }

  return { runMain, helpers: moduleShim.exports, queries, summaries, metas, logs, lockIds, events, txns: () => txnCount, requiredModules };
}
