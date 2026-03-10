#!/usr/bin/env node
/**
 * Pipeline SDK — shared infrastructure for all Buildo pipeline scripts.
 *
 * Standardizes: pool creation, transaction management, error handling,
 * structured logging, PIPELINE_SUMMARY/META emission, and process lifecycle.
 *
 * Usage:
 *   const pipeline = require('./lib/pipeline');
 *
 *   pipeline.run('load-permits', async (pool) => {
 *     const total = await loadData(pool);
 *     pipeline.emitSummary({ records_total: total, records_new: total, records_updated: 0 });
 *     pipeline.emitMeta(
 *       { 'CKAN API': ['PERMIT_NUM', 'REVISION_NUM'] },
 *       { permits: ['permit_num', 'revision_num'] }
 *     );
 *   });
 *
 * SPEC LINK: docs/specs/28_data_quality_dashboard.md
 * SPEC LINK: docs/specs/00_engineering_standards.md §9
 */
const { Pool } = require('pg');

// ---------------------------------------------------------------------------
// Pool Creation — single standardized pattern (PG_* env vars)
// ---------------------------------------------------------------------------

/**
 * Create a PostgreSQL connection pool using PG_* environment variables.
 * Every pipeline script MUST use this instead of inline `new Pool(...)`.
 */
function createPool() {
  return new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'buildo',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
  });
}

// ---------------------------------------------------------------------------
// Structured Logging — replaces bare console.error/warn/log in scripts
// ---------------------------------------------------------------------------

const log = {
  /** Informational message (non-error). */
  info(tag, msg, ctx) {
    const entry = { level: 'INFO', tag, msg };
    if (ctx) entry.context = ctx;
    console.log(JSON.stringify(entry));
  },

  /** Warning (non-fatal). */
  warn(tag, msg, ctx) {
    const entry = { level: 'WARN', tag, msg };
    if (ctx) entry.context = ctx;
    console.warn(JSON.stringify(entry));
  },

  /** Error (may be fatal). */
  error(tag, err, ctx) {
    const entry = {
      level: 'ERROR',
      tag,
      msg: err instanceof Error ? err.message : String(err),
    };
    if (err instanceof Error && err.stack) entry.stack = err.stack;
    if (ctx) entry.context = ctx;
    console.error(JSON.stringify(entry));
  },
};

// ---------------------------------------------------------------------------
// Transaction Management — §9.1 compliance
// ---------------------------------------------------------------------------

/**
 * Execute `fn(client)` inside a BEGIN/COMMIT transaction.
 * On error: ROLLBACK (with nested try-catch per §9.1) then re-throw.
 * Always releases the client back to the pool.
 *
 * @param {Pool} pool
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      log.error('[pipeline]', rollbackErr, { phase: 'rollback_failed' });
    }
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PIPELINE_SUMMARY / PIPELINE_META Emission
// ---------------------------------------------------------------------------

/**
 * Emit a PIPELINE_SUMMARY line to stdout.
 * Parsed by run-chain.js and stored in pipeline_runs.
 *
 * @param {{ records_total: number, records_new: number, records_updated: number, records_meta?: object }} stats
 */
function emitSummary(stats) {
  const payload = {
    records_total: stats.records_total ?? 0,
    records_new: stats.records_new ?? 0,
    records_updated: stats.records_updated ?? 0,
  };
  if (stats.records_meta) payload.records_meta = stats.records_meta;
  console.log('PIPELINE_SUMMARY:' + JSON.stringify(payload));
}

/**
 * Emit a PIPELINE_META line to stdout.
 * Documents which tables/columns a script reads and writes.
 *
 * @param {Record<string, string[]>} reads  - { tableName: [col1, col2, ...] }
 * @param {Record<string, string[]>} writes - { tableName: [col1, col2, ...] }
 * @param {string[]} [external] - External APIs used (e.g. ['CKAN API', 'Serper API'])
 */
function emitMeta(reads, writes, external) {
  const payload = { reads, writes };
  if (external && external.length > 0) payload.external = external;
  console.log('PIPELINE_META:' + JSON.stringify(payload));
}

// ---------------------------------------------------------------------------
// Progress Logging
// ---------------------------------------------------------------------------

/**
 * Log a progress update with percentage and elapsed time.
 *
 * @param {string} label - Script name or step label
 * @param {number} current - Records processed so far
 * @param {number} total - Total records to process
 * @param {number} startMs - Date.now() when processing started
 */
function progress(label, current, total, startMs) {
  const pct = total > 0 ? ((current / total) * 100).toFixed(1) : '0.0';
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`  [${label}] ${current.toLocaleString()} / ${total.toLocaleString()} (${pct}%) — ${elapsed}s`);
}

// ---------------------------------------------------------------------------
// Lifecycle Runner
// ---------------------------------------------------------------------------

/**
 * Run a pipeline script with standardized lifecycle:
 * 1. Create pool
 * 2. Execute fn(pool) inside try/catch
 * 3. Always pool.end() in finally
 * 4. process.exit(1) on fatal error
 *
 * @param {string} name - Script name for logging (e.g. 'load-permits')
 * @param {(pool: Pool) => Promise<void>} fn - The main pipeline logic
 */
async function run(name, fn) {
  const pool = createPool();
  const startMs = Date.now();
  try {
    await fn(pool);
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    console.log(`\n[${name}] completed in ${elapsed}s`);
  } catch (err) {
    log.error(`[${name}]`, err, { phase: 'fatal' });
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Batch Utilities
// ---------------------------------------------------------------------------

/** Default batch size for most pipeline scripts. */
const BATCH_SIZE = 1000;

/**
 * Calculate the maximum rows per INSERT to stay under PostgreSQL's
 * 65,535 parameter limit.
 *
 * @param {number} columnsPerRow - Number of $N placeholders per row
 * @returns {number}
 */
function maxRowsPerInsert(columnsPerRow) {
  return Math.floor(65535 / columnsPerRow);
}

/**
 * Check if the script was invoked with `--full` flag.
 * Standardized across all scripts (replaces env var variants).
 *
 * @returns {boolean}
 */
function isFullMode() {
  return process.argv.includes('--full');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createPool,
  log,
  withTransaction,
  emitSummary,
  emitMeta,
  progress,
  run,
  BATCH_SIZE,
  maxRowsPerInsert,
  isFullMode,
};
