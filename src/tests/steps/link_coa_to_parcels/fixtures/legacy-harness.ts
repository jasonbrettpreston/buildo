// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §4.5 (legacy oracle, not source-text)
// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.5 step 9, §6.8, §6.11.1
//
// ① — the LINK-COA-TO-PARCELS legacy oracle (phase-4 wave 4, McDonald's Airtight V3).
//
// This module does NOT load `scripts/link-coa-to-parcels.js`. It evaluates the VERBATIM legacy
// source text committed beside it as `fixtures/legacy-link-coa-to-parcels.js.txt` (identical to
// `scripts/link-coa-to-parcels.js` at the ① freeze, last touched by cd714db4), so a future
// conversion must reproduce the legacy OBSERVABLE behaviour (Spec 123 §4.5) without the legacy
// text being the source of truth.
//
// Curated shim: `./lib/pipeline` and `./lib/config-loader` are FAKES (txn and advisory-lock
// wrappers, summary/meta capture, a scripted logic_variables read; validateLogicVars runs the
// script's own zod schema exactly as the real loader does) and `Date.now` is frozen. The pool and
// client are a scripted SQL router keyed on the statement text. `zod`, `./lib/safe-math`,
// `./lib/address-normalizers`, `./lib/coa-link-sql` and the lazily-required Turf modules are the
// REAL modules, so the street-type parse, the bridge SQL text and the point-in-polygon test are the
// shipped ones rather than a re-implementation.

import fs from 'fs';
import path from 'path';

/** One candidate CoA row as the batch SELECT returns it. */
export interface CoaRow {
  id: number;
  lead_id: string;
  street_num: string | null;
  street_name_normalized: string | null;
  street_name: string | null;
  latitude?: number | null;
  longitude?: number | null;
  neighbourhood_id?: number | null;
}

/** One parcel candidate row (tier queries). */
export interface ParcelRow {
  id: number;
  centroid_lat: number | string | null;
  centroid_lng: number | string | null;
  geom?: string | null;
  geometry?: unknown;
  type_confirmed?: boolean;
}

/** A neighbourhood row as the startup load returns it. */
export interface NhoodRow { id: number; neighbourhood_id: number; name: string; geometry: unknown }

/** Options for `loadLegacy`. Every field is optional; defaults reproduce the happy path. */
export interface LegacyOpts {
  /** Raw logic_variables (default: unmatched 5, tier1a 0.95, tier1b 0.80). */
  logicVars?: Record<string, unknown>;
  /** `pg_extension` probe result. Default true. */
  postgis?: boolean;
  /** Neighbourhood rows loaded at startup. */
  nhoods?: NhoodRow[];
  /** The candidate CoAs (parcel_linked_at IS NULL, street_name_normalized NOT NULL). */
  coas?: CoaRow[];
  /** COUNT of unprocessed CoAs; default = coas.length + prePassCount. */
  unprocessed?: number;
  /** Rows the no-street-name pre-pass stamps (rowCount). */
  prePassCount?: number;
  /** Bridge-path hits keyed `${street_num}|${street_name_normalized}`. */
  bridge?: Record<string, ParcelRow>;
  /** Legacy tier-1a parcels-table hits keyed `${street_num}|${street_name_normalized}`. */
  exact?: Record<string, ParcelRow>;
  /** Tier-1b name-only hits keyed by street_name_normalized. */
  byName?: Record<string, ParcelRow>;
  /** Neighbourhood id returned by the PostGIS ST_Contains lookup, keyed `${lng},${lat}`. */
  nhAt?: Record<string, number>;
  /** ST_Contains(parcel geom, centroid) answer; default true. */
  centroidInside?: boolean;
  /** lead_ids whose lead_parcels INSERT throws (a poison row). */
  failLeadIds?: string[];
  /** Successive ghost DELETE rowCounts (then 0). */
  ghosts?: number[];
  /** Corpus coverage row. */
  corpus?: { total: number; linked: number; missing_normalized: number };
  /** When false the advisory lock reports `{ acquired: false }`. */
  lockAcquired?: boolean;
  /** `pipeline.getDbTimestamp(pool)` return. */
  runAt?: Date;
}

/** A captured `pool.query` / `client.query` call. */
export interface QueryCall { sql: string; params: unknown[]; via: 'pool' | 'client' }
/** The recorded `emitSummary(...)` argument. */
export interface SummaryRecord { records_total: number | null; records_new: number | null; records_updated: number | null; records_meta: Record<string, unknown> }
/** The recorded `emitMeta(reads, writes)` pair. */
export interface MetaRecord { reads: Record<string, string[]>; writes: Record<string, string[]> }
/** A captured `pipeline.log.<level>(...)` call. */
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
  txns(): number;
  requiredModules: string[];
}

export const DEFAULT_LOGIC_VARS = Object.freeze({ coa_unmatched_threshold_pct: 5, coa_parcel_conf_tier1a: 0.95, coa_parcel_conf_tier1b: 0.8 });

export function loadLegacy(opts: LegacyOpts = {}): LegacyOracle {
  const REPO_ROOT = path.resolve(__dirname, '../../../../../');
  const runAt = opts.runAt ?? new Date('2026-10-18T12:00:00Z');
  const queries: QueryCall[] = [];
  const summaries: SummaryRecord[] = [];
  const metas: MetaRecord[] = [];
  const logs: LogRecord[] = [];
  const lockIds: number[] = [];
  const events: string[] = [];
  const requiredModules: string[] = [];
  let txnCount = 0;
  let mainFn: ((pool: unknown) => Promise<void>) | null = null;
  const coas = opts.coas ?? [];
  const ghosts = [...(opts.ghosts ?? [])];
  const failLeads = new Set(opts.failLeadIds ?? []);
  const postgis = opts.postgis !== false;

  const log = {
    info: (...args: unknown[]) => { logs.push({ level: 'info', args }); },
    warn: (...args: unknown[]) => { logs.push({ level: 'warn', args }); },
    error: (...args: unknown[]) => { logs.push({ level: 'error', args }); },
  };

  async function exec(via: 'pool' | 'client', sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }> {
    queries.push({ sql, params, via });
    const s = sql.trim();
    if (/^SELECT 1 FROM pg_extension/.test(s)) return { rows: postgis ? [{ '?column?': 1 }] : [] };
    if (/^SELECT id, neighbourhood_id, name, geometry FROM neighbourhoods/.test(s)) return { rows: (opts.nhoods ?? []) as unknown as Record<string, unknown>[] };
    if (/^SELECT COUNT\(\*\)::int AS n FROM coa_applications/.test(s)) {
      return { rows: [{ n: opts.unprocessed ?? coas.length + (opts.prePassCount ?? 0) }] };
    }
    if (/AS missing_normalized/.test(s)) return { rows: [opts.corpus ?? { total: 0, linked: 0, missing_normalized: 0 }] };
    if (/^UPDATE coa_applications\s+SET parcel_linked_at = \$1::timestamptz\s+WHERE parcel_linked_at IS NULL\s+AND lead_id IS NOT NULL\s+AND street_name_normalized IS NULL/.test(s)) {
      return { rows: [], rowCount: opts.prePassCount ?? 0 };
    }
    if (/^SELECT ca\.id,/.test(s)) {
      const after = Number(params[0]);
      const limit = Number(params[1]);
      return { rows: coas.filter((c) => c.id > after).slice(0, limit) as unknown as Record<string, unknown>[] };
    }
    if (/^(SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)/.test(s)) { events.push(s); return { rows: [] }; }
    if (/FROM address_points ap/.test(s)) {
      const hit = opts.bridge?.[`${params[0]}|${params[1]}`];
      return { rows: hit ? [hit as unknown as Record<string, unknown>] : [] };
    }
    if (/FROM parcels\s+WHERE addr_num_normalized = \$1/.test(s)) {
      const hit = opts.exact?.[`${params[0]}|${params[1]}`];
      return { rows: hit ? [hit as unknown as Record<string, unknown>] : [] };
    }
    if (/FROM parcels\s+WHERE street_name_normalized = \$1/.test(s)) {
      const hit = opts.byName?.[String(params[0])];
      return { rows: hit ? [hit as unknown as Record<string, unknown>] : [] };
    }
    if (/^INSERT INTO lead_parcels/.test(s)) {
      events.push('INSERT lead_parcels ' + String(params[0]));
      if (failLeads.has(String(params[0]))) throw new Error('poison row');
      return { rows: [], rowCount: 1 };
    }
    if (/^SELECT id FROM neighbourhoods/.test(s)) {
      const id = opts.nhAt?.[`${params[0]},${params[1]}`];
      return { rows: id === undefined ? [] : [{ id }] };
    }
    if (/^SELECT ST_Contains\(\$1::geometry/.test(s)) return { rows: [{ inside: opts.centroidInside !== false }] };
    if (/^UPDATE coa_applications\s+SET latitude/.test(s)) { events.push('UPDATE backfill ' + String(params[4])); return { rows: [], rowCount: 1 }; }
    if (/^UPDATE coa_applications\s+SET parcel_linked_at = \$1::timestamptz\s+WHERE id = \$2/.test(s)) { events.push('UPDATE stamp ' + String(params[1])); return { rows: [], rowCount: 1 }; }
    if (/^DELETE FROM lead_parcels/.test(s)) return { rows: [], rowCount: ghosts.shift() ?? 0 };
    throw new Error('[legacy-harness] unrouted SQL: ' + s.slice(0, 120));
  }
  const client = { query: (sql: string, params?: unknown[]) => exec('client', sql, params) };
  const pool = { query: (sql: string, params?: unknown[]) => exec('pool', sql, params) };

  const pipeline = {
    log,
    BATCH_SIZE: 1000,
    run: (_name: string, fn: (p: unknown) => Promise<void>) => { mainFn = fn; },
    getDbTimestamp: () => Promise.resolve(runAt),
    withTransaction: async (_p: unknown, fn: (c: typeof client) => Promise<unknown>) => {
      txnCount += 1;
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
      if (r.success) return { valid: true };
      return { valid: false, errors: (r.error?.issues ?? []).map((i) => `${i.path.join('.')}: ${i.message}`) };
    },
  };

  const FROZEN_NOW = Date.parse('2026-10-18T12:00:00Z');
  class FrozenDate extends Date {
    static override now(): number { return FROZEN_NOW; }
  }

  function customRequire(id: string): unknown {
    requiredModules.push(id);
    if (id === './lib/pipeline') return pipeline;
    if (id === './lib/config-loader') return configLoader;
    const real: Record<string, string> = {
      './lib/safe-math': 'scripts/lib/safe-math.js',
      './lib/address-normalizers': 'scripts/lib/address-normalizers.js',
      './lib/coa-link-sql': 'scripts/lib/coa-link-sql.js',
    };
    if (id in real) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(path.join(REPO_ROOT, real[id] as string));
    }
    if (id === 'zod' || id === '@turf/boolean-point-in-polygon' || id === '@turf/helpers') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(id);
    }
    throw new Error("[legacy-harness] unexpected require('" + id + "') from the legacy source");
  }

  const SCRIPT_REL = 'src/tests/steps/link_coa_to_parcels/fixtures/legacy-link-coa-to-parcels.js.txt';
  const source = fs.readFileSync(path.join(REPO_ROOT, SCRIPT_REL), 'utf8').replace(/^#![^\n]*\n/, '');
  const moduleShim: { exports: Record<string, unknown> } = { exports: {} };
  const factory = new Function(
    'require', 'module', 'exports', '__dirname', 'Date',
    source + '\n;module.exports = Object.assign({}, module.exports, { ADVISORY_LOCK_ID, LOGIC_VARS_SCHEMA, GHOST_CLEANUP_BATCH_SIZE, pointInPolygon, pointInGeoJSON, haversineDistance, computeBBox, buildCorpusCoverageRows });',
  );
  factory(customRequire, moduleShim, moduleShim.exports, path.join(REPO_ROOT, 'scripts'), FrozenDate);

  async function runMain(): Promise<void> {
    if (!mainFn) throw new Error('[legacy-harness] pipeline.run(...) was never called by the legacy source');
    await mainFn(pool);
  }

  return { runMain, helpers: moduleShim.exports, queries, summaries, metas, logs, lockIds, events, txns: () => txnCount, requiredModules };
}
