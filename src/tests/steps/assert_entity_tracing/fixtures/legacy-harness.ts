// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
//
// ① — the ASSERT-ENTITY-TRACING legacy oracle (C6-1, McDonald's Airtight V3).
//
// This module does NOT load `scripts/quality/assert-entity-tracing.js`. It evaluates the VERBATIM legacy
// source text committed beside it as `fixtures/legacy-assert-entity-tracing.js.txt` (identical to the
// script at the ① freeze, last touched by ea3b86ee), so the conversion must reproduce the legacy
// OBSERVABLE behaviour (Spec 123 §4.5) without the legacy text being the source of truth.
//
// Curated shim (the assert_coa_freshness precedent): `./../lib/pipeline` is a FAKE (advisory-lock wrapper,
// summary/meta/log capture). `./../lib/lifecycle-phase` (SKIP_PHASES_SQL) and `./../lib/accepted-baseline`
// are the REAL modules — both pure, and part of the behaviour being pinned. The fake pool answers the
// legacy SELECTs by their output alias.

import fs from 'fs';
import path from 'path';

/** The counts the fake pool returns, keyed by the legacy query they answer. */
export interface Counts {
  window_permits?: number;
  eligible_permits?: number;
  permit_trades?: number;
  cost_estimates?: number;
  trade_forecasts?: number;
  lifecycle_phase?: number;
  forecast_rows?: number | null;
  opportunity_scored?: number | null;
}

export interface LegacyOpts {
  counts?: Counts;
  lockAcquired?: boolean;
}

export interface QueryCall { sql: string; params: unknown[]; answered: string }
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
  lockOpts: unknown[];
}

/** A healthy window (the live run 1591 shape, 2026-07-17, with opportunity_score above its threshold). */
export const HEALTHY: Readonly<Required<Counts>> = Object.freeze({
  window_permits: 211289,
  eligible_permits: 165111,
  permit_trades: 207757,
  cost_estimates: 211128,
  trade_forecasts: 148739,
  lifecycle_phase: 210129,
  forecast_rows: 1046140,
  opportunity_scored: 900000,
});

export function loadLegacy(opts: LegacyOpts = {}): LegacyOracle {
  const REPO_ROOT = path.resolve(__dirname, '../../../../../');
  const queries: QueryCall[] = [];
  const summaries: SummaryRecord[] = [];
  const metas: MetaRecord[] = [];
  const logs: LogRecord[] = [];
  const lockIds: number[] = [];
  const lockOpts: unknown[] = [];
  let mainFn: ((pool: unknown) => Promise<void>) | null = null;

  const capture = (level: string) => (...args: unknown[]) => { logs.push({ level, args }); };
  const log = { info: capture('info'), warn: capture('warn'), error: capture('error') };
  const c = { ...HEALTHY, ...(opts.counts ?? {}) };

  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      let answered: string;
      let row: Record<string, unknown>;
      if (sql.includes('AS window_permits')) { answered = 'window_permits'; row = { window_permits: c.window_permits }; }
      else if (sql.includes('AS eligible_permits')) { answered = 'eligible_permits'; row = { eligible_permits: c.eligible_permits }; }
      else if (sql.includes('AS forecast_rows')) { answered = 'opportunity_score'; row = { forecast_rows: c.forecast_rows, matched: c.opportunity_scored }; }
      else if (sql.includes('FROM permit_trades pt')) { answered = 'permit_trades'; row = { matched: c.permit_trades }; }
      else if (sql.includes('FROM cost_estimates ce')) { answered = 'cost_estimates'; row = { matched: c.cost_estimates }; }
      else if (sql.includes('FROM trade_forecasts tf')) { answered = 'trade_forecasts'; row = { matched: c.trade_forecasts }; }
      else if (sql.includes('lifecycle_phase IS NOT NULL')) { answered = 'lifecycle_phase'; row = { matched: c.lifecycle_phase }; }
      else throw new Error('[legacy-harness] unrecognised SELECT: ' + sql.slice(0, 80));
      queries.push({ sql, params, answered });
      return { rows: [row] };
    },
  };

  const pipeline = {
    log,
    run: (_name: string, fn: (p: unknown) => Promise<void>) => { mainFn = fn; },
    withAdvisoryLock: async (_p: unknown, id: number, fn: () => Promise<unknown>, o?: unknown) => {
      lockIds.push(id);
      lockOpts.push(o);
      if (opts.lockAcquired === false) return { acquired: false, lockId: id };
      return { acquired: true, lockId: id, result: await fn() };
    },
    emitSummary: (s: SummaryRecord) => { summaries.push(s); },
    emitMeta: (r: Record<string, string[]>, w: Record<string, string[]>) => { metas.push({ reads: r, writes: w }); },
  };

  function customRequire(id: string): unknown {
    if (id === './../lib/pipeline') return pipeline;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    if (id === './../lib/lifecycle-phase') return require(path.join(REPO_ROOT, 'scripts/lib/lifecycle-phase.js'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    if (id === './../lib/accepted-baseline') return require(path.join(REPO_ROOT, 'scripts/lib/accepted-baseline.js'));
    throw new Error("[legacy-harness] unexpected require('" + id + "') from the legacy source");
  }

  const SCRIPT_REL = 'src/tests/steps/assert_entity_tracing/fixtures/legacy-assert-entity-tracing.js.txt';
  const source = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8').replace(/^#![^\n]*\n/, '');
  const moduleShim: { exports: Record<string, unknown> } = { exports: {} };
  const factory = new Function('require', 'module', 'exports', '__dirname', source);
  factory(customRequire, moduleShim, moduleShim.exports, path.join(REPO_ROOT, 'scripts/quality'));

  async function runMain(): Promise<void> {
    if (!mainFn) throw new Error('[legacy-harness] pipeline.run(...) was never called by the legacy source');
    await mainFn(pool);
  }

  return { runMain, queries, summaries, metas, logs, lockIds, lockOpts };
}
