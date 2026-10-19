// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/66_enrich_permits.md
//
// ① — the ENRICH-PERMITS legacy oracle, shared by enrich_permits and enrich_coa_zoning (phase-4 wave 4,
// McDonald's Airtight V3). One legacy file served both slugs through ENRICH_TARGET; the ① identity split
// gave enrich_coa_zoning its own pass-through shell (`scripts/enrich-coa-zoning.js`).
//
// This module does NOT load `scripts/enrich-permits.js`. It evaluates the VERBATIM legacy source text
// committed beside it as `fixtures/legacy-enrich-permits.js.txt` (identical to `scripts/enrich-permits.js`
// at the ① freeze: last behaviour change 173f0d1e, plus the ① `main` export the split shell needs), so a
// future conversion must reproduce the legacy OBSERVABLE behaviour (Spec 123 §4.5) without the legacy text
// being the source of truth.
//
// Curated shim: `./lib/pipeline`, `process.env` and `Date.now` are FAKES (txn and advisory-lock wrappers,
// summary/meta capture, the ENRICH_TARGET env, a frozen clock). The pool and client are a scripted SQL
// router keyed on the statement text. `./lib/max-build`, `./lib/optimal-config-cols` and
// `./lib/parcel-cost-cols` are the REAL modules, so the propagated column lists (the Spec 78 O-11
// max-build contract) are the shipped ones rather than a re-implementation.

import fs from 'fs';
import path from 'path';

export type Target = 'permits' | 'coa';

/** Options for `loadLegacy`. Every field is optional; defaults reproduce the happy path. */
export interface LegacyOpts {
  /** `process.env.ENRICH_TARGET` (default 'permits'). */
  target?: string;
  /** COUNT of parcels with zoning_enriched_at (WF2 ran). Default 1. */
  wf2?: number;
  /** COUNT of parcels with ravine lineage. Default 1. */
  ravine?: number;
  /** COUNT of parcels with heritage lineage. Default 1. */
  heritage?: number;
  /** Columns reported MISSING per table by the information_schema probes. */
  missingCols?: Record<string, string[]>;
  /** information_schema.tables hit for the link table. Default true. */
  linkTable?: boolean;
  /** pipeline_runs completed_at of enrich_centreline / parcels. */
  centrelineAt?: string | null;
  parcelsAt?: string | null;
  /** logic_variables centreline_propagation_coverage_min row (undefined = row absent). */
  centrelineMin?: string;
  /** enriched / valid-geom parcels share. Default 0.97. */
  centrelineCov?: number | null;
  /** lead_zoning_enrich stats. */
  stats?: { enriched_leads: number; multi_parcel: number; heterogeneous: number };
  /** Rows in the enrichment scope. */
  scoped?: number;
  /** UPDATE rowCount. */
  updated?: number;
  /** Orphan nullify rowCount. */
  orphans?: number;
  /** Coverage gate denominator / numerator. */
  coverage?: { denom: number; num: number };
  /** Null-rate row. */
  nulls?: { fsi: string | null; cov: string | null; height: string | null };
  /** logic_variables bylaw null floors (rows returned by the ANY($1) read). */
  floors?: Array<{ variable_key: string; variable_value: string }>;
  /** permits-only disagreement counts. */
  rnfpDisagree?: number;
  heritageDisagree?: number;
  /** When false the advisory lock reports `{ acquired: false }`. */
  lockAcquired?: boolean;
  /** `pipeline.getDbTimestamp(client)` return. */
  runAt?: Date;
}

/** A captured `pool.query` / `client.query` call. */
export interface QueryCall { sql: string; params: unknown[]; via: 'pool' | 'client' }
export interface SummaryRecord { records_total: number | null; records_new: number | null; records_updated: number | null; records_meta: Record<string, unknown> }
export interface MetaRecord { reads: Record<string, string[]>; writes: Record<string, string[]> }
export interface LogRecord { level: string; args: unknown[] }

/** Handle returned by `loadLegacy`. */
export interface LegacyOracle {
  runMain(): Promise<void>;
  helpers: Record<string, unknown>;
  queries: QueryCall[];
  summaries: SummaryRecord[];
  metas: MetaRecord[];
  logs: LogRecord[];
  lockIds: number[];
  events: string[];
  runNames: string[];
}

const REPO_ROOT = path.resolve(__dirname, '../../../../../');

/** The real `scripts/lib/max-build.js` (the O-11 column contract). */
export function maxBuild(): Record<string, string[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.join(REPO_ROOT, 'scripts/lib/max-build.js')) as Record<string, string[]>;
}

export function loadLegacy(opts: LegacyOpts = {}): LegacyOracle {
  const runAt = opts.runAt ?? new Date('2026-10-18T12:00:00Z');
  const queries: QueryCall[] = [];
  const summaries: SummaryRecord[] = [];
  const metas: MetaRecord[] = [];
  const logs: LogRecord[] = [];
  const lockIds: number[] = [];
  const events: string[] = [];
  const runNames: string[] = [];
  let mainFn: ((pool: unknown) => Promise<void>) | null = null;

  const log = {
    info: (...args: unknown[]) => { logs.push({ level: 'info', args }); },
    warn: (...args: unknown[]) => { logs.push({ level: 'warn', args }); },
    error: (...args: unknown[]) => { logs.push({ level: 'error', args }); },
  };
  /** Any COUNT(*) FILTER observability row: every requested alias reads 0. */
  const zeros = new Proxy({}, { get: () => 0 });

  async function exec(via: 'pool' | 'client', sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }> {
    queries.push({ sql, params, via });
    const s = sql.trim();
    if (/^SELECT COUNT\(\*\)::int AS n FROM parcels WHERE zoning_enriched_at IS NOT NULL/.test(s)) return { rows: [{ n: opts.wf2 ?? 1 }] };
    if (/ravine_dataset_version_when_enriched IS NOT NULL/.test(s)) return { rows: [{ n: opts.ravine ?? 1 }] };
    if (/heritage_dataset_version_when_enriched IS NOT NULL/.test(s)) return { rows: [{ n: opts.heritage ?? 1 }] };
    if (/FROM information_schema\.columns/.test(s)) {
      const tbl = String(params[0]);
      const missing = new Set(opts.missingCols?.[tbl] ?? []);
      return { rows: ((params[1] as string[]) ?? []).filter((c) => !missing.has(c)).map((c) => ({ column_name: c })) };
    }
    if (/FROM information_schema\.tables/.test(s)) return { rows: opts.linkTable === false ? [] : [{ '?column?': 1 }] };
    if (/AS enriched_at,/.test(s)) {
      return { rows: [{ enriched_at: opts.centrelineAt === undefined ? '2026-10-17T00:00:00Z' : opts.centrelineAt, parcels_at: opts.parcelsAt === undefined ? '2026-10-16T00:00:00Z' : opts.parcelsAt }] };
    }
    if (/variable_key = 'centreline_propagation_coverage_min'/.test(s)) {
      return { rows: opts.centrelineMin === undefined ? [] : [{ variable_value: opts.centrelineMin }] };
    }
    if (/AS pct\s+FROM parcels/.test(s)) return { rows: [{ pct: opts.centrelineCov === undefined ? 0.97 : opts.centrelineCov }] };
    if (/^DROP TABLE IF EXISTS lead_zoning_enrich/.test(s)) { events.push('DROP temp'); return { rows: [] }; }
    if (/^CREATE TEMP TABLE lead_zoning_enrich/.test(s)) { events.push('CREATE temp'); return { rows: [] }; }
    if (/FROM lead_zoning_enrich$/.test(s) && /enriched_leads/.test(s)) return { rows: [opts.stats ?? { enriched_leads: 90, multi_parcel: 3, heterogeneous: 1 }] };
    if (/^SELECT COUNT\(\*\)::int AS n FROM (permits p|coa_applications c) WHERE \(TRUE\)/.test(s)) return { rows: [{ n: opts.scoped ?? 100 }] };
    if (/^UPDATE (permits p|coa_applications c) SET\s+\w+ = e\./.test(s)) { events.push('UPDATE enrich'); return { rows: [], rowCount: opts.updated ?? 12 }; }
    if (/zoning_enriched_at = NULL\s+WHERE/.test(s)) { events.push('UPDATE orphans'); return { rows: [], rowCount: opts.orphans ?? 2 }; }
    if (/AS denom/.test(s)) return { rows: [opts.coverage ?? { denom: 1000, num: 850 }] };
    if (/AS fsi,/.test(s) && /AS height/.test(s)) return { rows: [opts.nulls ?? { fsi: '80.0', cov: '60.0', height: '20.0' }] };
    if (/^SELECT variable_key, variable_value FROM logic_variables WHERE variable_key = ANY\(\$1\)/.test(s)) return { rows: opts.floors ?? [] };
    if (/permit_type = 'RNFP'/.test(s)) return { rows: [{ n: opts.rnfpDisagree ?? 0 }] };
    if (/permit_type = 'Heritage'/.test(s)) return { rows: [{ n: opts.heritageDisagree ?? 0 }] };
    if (/COUNT\(\*\) FILTER/.test(s)) return { rows: [zeros] };
    throw new Error('[legacy-harness] unrouted SQL: ' + s.slice(0, 140));
  }
  const client = { query: (sql: string, params?: unknown[]) => exec('client', sql, params) };
  const pool = { query: (sql: string, params?: unknown[]) => exec('pool', sql, params) };

  const pipeline = {
    log,
    run: (name: string, fn: (p: unknown) => Promise<void>) => { runNames.push(name); mainFn = fn; },
    getDbTimestamp: () => Promise.resolve(runAt),
    withTransaction: async (_p: unknown, fn: (c: typeof client) => Promise<unknown>) => {
      events.push('BEGIN');
      const r = await fn(client);
      events.push('COMMIT');
      return r;
    },
    withAdvisoryLock: async (_p: unknown, id: number, fn: () => Promise<unknown>) => {
      lockIds.push(id);
      if (opts.lockAcquired === false) return { acquired: false, lockId: id };
      return { acquired: true, lockId: id, result: await fn() };
    },
    emitSummary: (s: SummaryRecord) => { summaries.push(s); },
    emitMeta: (r: Record<string, string[]>, w: Record<string, string[]>) => { metas.push({ reads: r, writes: w }); },
  };

  const FROZEN_NOW = Date.parse('2026-10-18T12:00:00Z');
  class FrozenDate extends Date {
    static override now(): number { return FROZEN_NOW; }
  }
  const fakeProcess = { env: { ENRICH_TARGET: opts.target ?? 'permits' } };

  const moduleShim: { exports: Record<string, unknown> } = { exports: {} };
  const customRequire = Object.assign((id: string): unknown => {
    if (id === './lib/pipeline') return pipeline;
    const real: Record<string, string> = {
      './lib/max-build': 'scripts/lib/max-build.js',
      './lib/optimal-config-cols': 'scripts/lib/optimal-config-cols.js',
      './lib/parcel-cost-cols': 'scripts/lib/parcel-cost-cols.js',
    };
    if (id in real) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(path.join(REPO_ROOT, real[id] as string));
    }
    throw new Error("[legacy-harness] unexpected require('" + id + "') from the legacy source");
  }, { main: moduleShim });

  const SCRIPT_REL = 'src/tests/steps/enrich_permits/fixtures/legacy-enrich-permits.js.txt';
  const source = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8').replace(/^#![^\n]*\n/, '');
  const factory = new Function(
    'require', 'module', 'exports', '__dirname', 'Date', 'process',
    source + '\n;module.exports = Object.assign({}, module.exports, { CFG, SCALARS, OVERLAY_FLAGS, OPT_COMP_PROP_COLS, COST_PROP_COLS, CENTRELINE_COVERAGE_MIN_DEFAULT, bylawNullFloors, nullRates });',
  );
  factory(customRequire, moduleShim, moduleShim.exports, path.join(REPO_ROOT, 'scripts'), FrozenDate, fakeProcess);

  async function runMain(): Promise<void> {
    if (!mainFn) throw new Error('[legacy-harness] pipeline.run(...) was never called by the legacy source');
    await mainFn(pool);
  }

  return { runMain, helpers: moduleShim.exports, queries, summaries, metas, logs, lockIds, events, runNames };
}

/** The ① split shell's text (legacy pass-through), frozen beside the oracle. */
export function legacyCoaShellText(): string {
  return fs.readFileSync(path.join(REPO_ROOT, 'src/tests/steps/enrich_permits/fixtures/legacy-enrich-coa-zoning.js.txt'), 'utf8');
}
