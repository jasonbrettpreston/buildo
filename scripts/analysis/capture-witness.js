// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (Phase 1 WITNESS, P1-C3b harness)
// Plan: .cursor/wf2_registry_truth_active_task.md PHASE 1 item 1 (tracer) / item 3 (gate #44), P1-C3b
//
// Harness-side WITNESS helpers (P1-C3b2) for `scripts/analysis/capture-step-golden.js`.
// The harness itself is NOT touched here: this module is the pure, DB-free, stdout-free
// surface the capture tool will import — it starts a traced child env, snapshots the
// resolver's `information_schema.columns` catalog, refuses the measured posix-DSM crash
// configuration, and turns the tracer's per-pid NDJSON into the sibling
// `<golden>.trace.json` (P1-C3b1 `assemble.cjs`).
//
// Contract: `.cursor/engine-briefs/p1c3b2-red.md`; NDJSON input shape
// `.cursor/engine-briefs/p1c3a-contract.md`; trace output shape
// `.cursor/engine-briefs/p1c3-trace-format.md`.
// This module NEVER opens a DB connection of its own (every `pool` is passed in) and
// NEVER writes to stdout/stderr — the caller (`capture-step-golden.js`) does the logging.
'use strict';

const fs = require('fs');
const path = require('path');
const { assembleTrace, tracePathFor, preTablesFromTrace } = require('../lib/sql-witness/assemble.cjs');
const {
  buildDsmCapacityRow,
  findBlockingPreflightRow,
  resolveDsmTarget,
  loadSupabaseDbPort,
} = require('../lib/preflight-dsm');

// The tracer preload loaded into the traced child through `NODE_OPTIONS=--require`
// (plan PHASE 1 item 1). Absolute so the child's cwd cannot change what is loaded.
const PRELOAD_PATH = path.resolve(__dirname, '..', 'lib', 'sql-witness', 'trace-preload.cjs');

// Repo root: `scripts/analysis/` -> `..`, `..`. Used only as the `loadSupabaseDbPort`
// hint source, exactly as `scripts/run-chain.js` does.
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// The refusal prefix the harness/backfill script must surface verbatim (canary 15).
const REFUSAL_PREFIX = '[capture-step-golden] REFUSED (sys_dsm_capacity)';

/** Sorted, unique copy — the resolver/catalog contract never returns bare Sets. */
function sortedUnique(xs) {
  return Array.from(new Set(xs)).sort();
}

/**
 * A NEW child env carrying the tracer: `BUILDO_SQL_TRACE=<traceDir>` and
 * `--require "<PRELOAD_PATH>"` appended to any existing `NODE_OPTIONS`.
 * The caller's `env` object is never mutated.
 *
 * @param {Record<string, string|undefined>} env
 * @param {string} traceDir
 * @returns {Record<string, string>}
 */
function traceEnv(env, traceDir) {
  const out = Object.assign({}, env || {});
  out.BUILDO_SQL_TRACE = traceDir;
  // NODE_OPTIONS treats backslashes in a quoted value as escapes — a Windows path must be forward-slashed.
  out.NODE_OPTIONS = `${(out.NODE_OPTIONS || '')} --require "${PRELOAD_PATH.split(path.sep).join('/')}"`.trim();
  return out;
}

/**
 * Snapshot the resolver's catalog: `information_schema.columns` for the public
 * schema, grouped `{ table: [cols…] }` with both keys and each column list sorted.
 * Reads only — never writes, never logs.
 *
 * @param {{query: (sql: string) => Promise<{rows: Array<object>}>}} pool
 * @returns {Promise<Record<string, string[]>>}
 */
async function snapshotCatalog(pool) {
  const res = await pool.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'`
  );
  const rows = (res && res.rows) || [];
  const byTable = {};
  for (const row of rows) {
    if (!row || row.table_name == null || row.column_name == null) continue;
    const table = String(row.table_name);
    if (!byTable[table]) byTable[table] = [];
    byTable[table].push(String(row.column_name));
  }
  const out = {};
  for (const table of Object.keys(byTable).sort()) out[table] = sortedUnique(byTable[table]);
  return out;
}

/** The committed catalog's repo-relative path (`docs/reports/witness/_catalog.json`). */
const CATALOG_REL = 'docs/reports/witness/_catalog.json';

/** Provenance string stamped on the committed catalog (the snapshot query `snapshotCatalog` runs). */
const CATALOG_SOURCE =
  "information_schema.columns WHERE table_schema = 'public' (scripts/analysis/capture-witness.js snapshotCatalog)";

/**
 * Write the COMMITTED catalog — the file the fixture guard
 * (`src/tests/steps/_witness-guard.ts`) resolves unqualified columns / `*` against,
 * refreshed by every capture from the same snapshot its trace used (Fold 7 ruling 1).
 * Deterministic: no timestamp; keys sorted and every column array passed through
 * `sortedUnique` (non-array values are skipped).
 *
 * @param {Record<string, string[]>} catalog — `{ table: [cols…] }` (e.g. `snapshotCatalog`)
 * @param {string} [outPath] — defaults to `<REPO_ROOT>/<CATALOG_REL>`
 * @returns {{catalogPath: string, tables: number}}
 */
function writeCatalog(catalog, outPath = path.join(REPO_ROOT, CATALOG_REL)) {
  const src = catalog || {};
  const tables = {};
  for (const table of Object.keys(src).sort()) {
    if (!Array.isArray(src[table])) continue;
    tables[table] = sortedUnique(src[table]);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const doc = { catalog_version: 1, source: CATALOG_SOURCE, tables };
  fs.writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
  return { catalogPath: outPath, tables: Object.keys(tables).length };
}

/**
 * Phase-0 DSM gate for a capture: read `dynamic_shared_memory_type`, build the
 * `sys_dsm_capacity` row with the SAME inputs `scripts/run-chain.js` feeds it
 * (`buildDsmCapacityRow` + `resolveDsmTarget` + `loadSupabaseDbPort`), then THROW
 * on the one blocking row (`findBlockingPreflightRow`, Spec 30 §4.1a) instead of
 * logging. No new threshold and no new check is introduced here.
 *
 * @param {{query: (sql: string) => Promise<{rows: Array<object>}>}} pool
 * @param {Record<string, string|undefined>} env
 * @returns {Promise<object>} the non-blocking row
 */
async function dsmGuard(pool, env) {
  const res = await pool.query('SHOW dynamic_shared_memory_type');
  const dsmType = (res && res.rows && res.rows[0] && res.rows[0].dynamic_shared_memory_type) || null;
  const target = resolveDsmTarget(env || {});
  const row = buildDsmCapacityRow({
    dsmType,
    isLocal: target.isLocal,
    port: target.port,
    supabasePort: loadSupabaseDbPort(REPO_ROOT),
  });
  const blocking = findBlockingPreflightRow([row]);
  if (blocking) {
    throw new Error(`${REFUSAL_PREFIX}: ${blocking.message}`);
  }
  return row;
}

/**
 * tablesFromTraceIfNone — canary 9 fallback (Spec 122 §6.6.1 step optimization).
 * The runner's step descriptor may declare no tables (`tables: []`, `source:
 * 'none'`); in exactly that case the already-assembled trace is the only
 * evidence of what the step touched, so expose its sorted WRITTEN tables and
 * relabel the source `'trace'` (assemble.cjs `preTablesFromTrace`). Every other
 * source (descriptor/arg) and any non-empty list pass through untouched.
 *
 * @param {{tables: string[], source: string, trace: object}} input
 * @returns {{tables: string[], source: string}}
 */
function tablesFromTraceIfNone({ tables, source, trace }) {
  if (tables.length === 0 && source === 'none') {
    return { tables: preTablesFromTrace(trace), source: 'trace' };
  }
  return { tables, source };
}

/**
 * Assemble the trace for one capture from the tracer's per-pid NDJSON files.
 * Reads every `*.ndjson` in `traceDir` (sorted for determinism), resolves the
 * catalog, assembles the trace doc and writes it BESIDE the golden
 * (`tracePathFor(outPath)`), 2-space JSON with a trailing newline. The golden
 * itself is untouched, so no G8 diff follows.
 *
 * When `catalog` is supplied it is authoritative and the pool is NEVER queried
 * (so `pool` becomes optional); otherwise the catalog is snapshotted from
 * `pool` as before.
 *
 * @param {{traceDir: string, pool?: object, catalog?: Record<string, string[]>, meta: object, outPath: string}} input
 * @returns {Promise<{trace: object, tracePath: string}>}
 */
async function writeTraceFromDir({ traceDir, pool, catalog, meta, outPath }) {
  const entries = fs.existsSync(traceDir)
    ? fs.readdirSync(traceDir).filter((name) => name.endsWith('.ndjson')).sort()
    : [];
  const ndjsonTexts = entries.map((name) => fs.readFileSync(path.join(traceDir, name), 'utf8'));
  const resolvedCatalog = catalog || (await snapshotCatalog(pool));
  const trace = await assembleTrace({ ndjsonTexts, catalog: resolvedCatalog, meta: meta || {} });
  const tracePath = tracePathFor(outPath);
  fs.mkdirSync(path.dirname(tracePath), { recursive: true });
  fs.writeFileSync(tracePath, `${JSON.stringify(trace, null, 2)}\n`);
  return { trace, tracePath };
}

module.exports = {
  PRELOAD_PATH,
  CATALOG_REL,
  traceEnv,
  snapshotCatalog,
  writeCatalog,
  dsmGuard,
  writeTraceFromDir,
  tablesFromTraceIfNone,
};


