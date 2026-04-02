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

/**
 * Classify an error into a machine-readable category (B23 Error Taxonomy).
 * Enables dashboards to filter/group by error type without parsing messages.
 *
 * @param {Error|unknown} err
 * @returns {'network'|'timeout'|'parse'|'database'|'file_not_found'|'unknown'}
 */
function classifyError(err) {
  if (!(err instanceof Error)) return 'unknown';
  const code = /** @type {string|undefined} */ (/** @type {any} */ (err).code);
  if (code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'EPIPE') return 'network';
  if (code === 'ETIMEDOUT' || code === 'ABORT_ERR' || (err.message && err.message.includes('timeout'))) return 'timeout';
  if (code === 'ENOENT') return 'file_not_found';
  if (err.name === 'SyntaxError' || (err.message && err.message.includes('JSON'))) return 'parse';
  if (code && (code.startsWith('23') || code.startsWith('42') || code.startsWith('22') || code.startsWith('40'))) return 'database';
  return 'unknown';
}

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

  /** Error (may be fatal). Includes auto-classified error_type (B23). */
  error(tag, err, ctx) {
    const entry = {
      level: 'ERROR',
      tag,
      msg: err instanceof Error ? err.message : String(err),
      error_type: classifyError(err),
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
// Record Tracking Counters
// ---------------------------------------------------------------------------

let _trackedNew = 0;
let _trackedUpdated = 0;

/**
 * Increment running record counters. Call this as your script processes records
 * so emitSummary() can validate reported values.
 *
 * @param {number} recordsNew - New records created in this batch
 * @param {number} recordsUpdated - Existing records updated in this batch
 */
function track(recordsNew, recordsUpdated) {
  _trackedNew += recordsNew || 0;
  _trackedUpdated += recordsUpdated || 0;
}

/** Reset counters (called internally by run() at start). */
track.reset = function () {
  _trackedNew = 0;
  _trackedUpdated = 0;
};

/**
 * Return current tracked counters.
 * @returns {{ records_new: number, records_updated: number }}
 */
function getTracked() {
  return { records_new: _trackedNew, records_updated: _trackedUpdated };
}

// ---------------------------------------------------------------------------
// Run Start Timestamp — set by run(), used by emitSummary for velocity
// ---------------------------------------------------------------------------
let _runStartMs = Date.now();

// ---------------------------------------------------------------------------
// PIPELINE_SUMMARY / PIPELINE_META Emission
// ---------------------------------------------------------------------------

/**
 * Emit a PIPELINE_SUMMARY line to stdout.
 * Parsed by run-chain.js and stored in pipeline_runs.
 *
 * Auto-injects standardized health metrics into audit_table.rows:
 * - sys_* (always): velocity, duration — free for all scripts
 * - err_* (opt-in): from telemetry_context.error_taxonomy
 * - dq_*  (opt-in): from telemetry_context.data_quality
 *
 * @param {{ records_total: number, records_new: number, records_updated: number, records_meta?: object, telemetry_context?: { error_taxonomy?: Record<string, number>, data_quality?: Record<string, { nulls: number, total: number }> } }} stats
 */
function emitSummary(stats) {
  const payload = {
    records_total: stats.records_total ?? 0,
    // Preserve null — signals "not applicable" for CQA/read-only scripts (§3.5)
    records_new: stats.records_new !== undefined ? stats.records_new : 0,
    records_updated: stats.records_updated !== undefined ? stats.records_updated : 0,
  };
  if (stats.records_meta) payload.records_meta = stats.records_meta;

  // --- Auto-inject standardized health metrics (append, don't replace) ---
  // Ensure records_meta and audit_table exist
  if (!payload.records_meta) payload.records_meta = {};
  if (!payload.records_meta.audit_table) {
    payload.records_meta.audit_table = { phase: 0, name: 'Auto', verdict: 'PASS', rows: [] };
  }
  if (!payload.records_meta.audit_table.rows) {
    payload.records_meta.audit_table.rows = [];
  }
  const rows = payload.records_meta.audit_table.rows;

  // sys_* metrics (always injected — free for all 44 scripts)
  const durationMs = Date.now() - _runStartMs;
  const total = stats.records_total ?? 0;
  const velocity = durationMs > 0 ? parseFloat((total / (durationMs / 1000)).toFixed(2)) : 0;
  rows.push(
    { metric: 'sys_velocity_rows_sec', value: velocity, threshold: null, status: 'INFO' },
    { metric: 'sys_duration_ms', value: durationMs, threshold: null, status: 'INFO' }
  );

  // err_* metrics (opt-in via telemetry_context.error_taxonomy)
  if (stats.telemetry_context?.error_taxonomy) {
    for (const [key, count] of Object.entries(stats.telemetry_context.error_taxonomy)) {
      rows.push({ metric: `err_${key}`, value: count, threshold: null, status: count > 0 ? 'WARN' : 'PASS' });
    }
  }

  // dq_* metrics (opt-in via telemetry_context.data_quality)
  if (stats.telemetry_context?.data_quality) {
    for (const [field, info] of Object.entries(stats.telemetry_context.data_quality)) {
      const { nulls, total: fieldTotal } = /** @type {{ nulls: number, total: number }} */ (info);
      const pct = fieldTotal > 0 ? ((nulls / fieldTotal) * 100).toFixed(1) + '%' : '0.0%';
      const pctNum = fieldTotal > 0 ? (nulls / fieldTotal) * 100 : 0;
      rows.push({ metric: `dq_null_rate_${field}`, value: pct, threshold: '< 50%', status: pctNum >= 50 ? 'FAIL' : 'PASS' });
    }
  }

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
 * Log a progress update with percentage, elapsed time, and velocity (B19).
 *
 * @param {string} label - Script name or step label
 * @param {number} current - Records processed so far
 * @param {number} total - Total records to process
 * @param {number} startMs - Date.now() when processing started
 */
function progress(label, current, total, startMs) {
  const elapsed = (Date.now() - startMs) / 1000;
  const pct = total > 0 ? ((current / total) * 100).toFixed(1) : '0.0';
  const velocity = elapsed > 0 ? Math.round(current / elapsed) : 0;
  console.log(`  [${label}] ${current.toLocaleString()} / ${total.toLocaleString()} (${pct}%) — ${elapsed.toFixed(1)}s — ${velocity} rows/s`);
}

// ---------------------------------------------------------------------------
// Lifecycle Runner
// ---------------------------------------------------------------------------

/**
 * Run a pipeline script with standardized lifecycle:
 * 1. Create pool
 * 2. Execute fn(pool) inside try/catch
 * 3. Always pool.end() in finally
 * 4. Re-throw on fatal error (lets caller or Node.js unhandled rejection handle exit)
 *
 * Safe to import in long-running processes — does not call process.exit().
 *
 * @param {string} name - Script name for logging (e.g. 'load-permits')
 * @param {(pool: Pool) => Promise<void>} fn - The main pipeline logic
 */
async function run(name, fn) {
  const pool = createPool();
  const startMs = Date.now();
  _runStartMs = startMs; // expose to emitSummary for velocity calc
  try {
    await fn(pool);
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    console.log(`\n[${name}] completed in ${elapsed}s`);
  } catch (err) {
    log.error(`[${name}]`, err, { phase: 'fatal' });
    throw err;
  } finally {
    await pool.end().catch((endErr) => {
      log.warn(`[${name}]`, `pool.end failed: ${endErr.message}`);
    });
  }
}

// ---------------------------------------------------------------------------
// Telemetry — pre/post run DB state capture (T1, T2, T4)
// ---------------------------------------------------------------------------

/**
 * Capture pre-run database state for telemetry.
 * T1: row counts per table, T2: pg_stat mutation counters, T4: NULL fill counts.
 *
 * @param {Pool} pool
 * @param {string[]} tables - Target write table names
 * @param {Record<string, string[]>} [nullCols] - Optional: { table: [col1, col2] } for NULL auditing (T4)
 * @returns {Promise<object>} Pre-run telemetry snapshot
 */
async function captureTelemetry(pool, tables, nullCols) {
  const snapshot = { counts: {}, pg_stats: {}, null_fills: {}, engine: {}, captured_at: new Date().toISOString() };
  for (const table of tables) {
    try {
      // T1: row count
      const countRes = await pool.query(`SELECT count(*)::int AS cnt FROM ${quoteIdent(table)}`);
      snapshot.counts[table] = { before: countRes.rows[0].cnt };

      // T2: pg_stat mutation counters
      const statRes = await pool.query(
        `SELECT n_tup_ins::int AS ins, n_tup_upd::int AS upd, n_tup_del::int AS del
         FROM pg_stat_user_tables WHERE relname = $1`,
        [table]
      );
      if (statRes.rows[0]) {
        snapshot.pg_stats[table] = {
          before_ins: statRes.rows[0].ins,
          before_upd: statRes.rows[0].upd,
          before_del: statRes.rows[0].del,
        };
      }

      // T6: Engine health stats (dead tuples, index usage)
      const engineRes = await pool.query(
        `SELECT n_live_tup::bigint AS live, n_dead_tup::bigint AS dead,
                seq_scan::bigint AS seq, idx_scan::bigint AS idx
         FROM pg_stat_user_tables WHERE relname = $1`,
        [table]
      );
      if (engineRes.rows[0]) {
        const r = engineRes.rows[0];
        const live = parseInt(r.live, 10) || 0;
        const dead = parseInt(r.dead, 10) || 0;
        const seq = parseInt(r.seq, 10) || 0;
        const idx = parseInt(r.idx, 10) || 0;
        snapshot.engine[table] = {
          n_live_tup: live,
          n_dead_tup: dead,
          dead_ratio: (live + dead) > 0 ? Math.round((dead / (live + dead)) * 10000) / 10000 : 0,
          seq_scan: seq,
          idx_scan: idx,
          seq_ratio: (seq + idx) > 0 ? Math.round((seq / (seq + idx)) * 10000) / 10000 : 0,
        };
      }

      // T4: NULL fill counts for configured columns
      if (nullCols && nullCols[table]) {
        snapshot.null_fills[table] = {};
        for (const col of nullCols[table]) {
          const nullRes = await pool.query(
            `SELECT count(*)::int AS cnt FROM ${quoteIdent(table)} WHERE ${quoteIdent(col)} IS NULL`
          );
          snapshot.null_fills[table][col] = { before: nullRes.rows[0].cnt };
        }
      }
    } catch (err) {
      log.warn('[telemetry]', `captureTelemetry failed for ${table}: ${err.message}`);
    }
  }
  return snapshot;
}

/**
 * Capture post-run database state and compute deltas against pre-run snapshot.
 *
 * @param {Pool} pool
 * @param {string[]} tables
 * @param {object} pre - Pre-run telemetry from captureTelemetry()
 * @returns {Promise<object>} Telemetry with before/after/delta values
 */
async function diffTelemetry(pool, tables, pre) {
  const result = { counts: {}, pg_stats: {}, null_fills: {}, engine: {} };
  for (const table of tables) {
    try {
      // T1: row count diff
      const countRes = await pool.query(`SELECT count(*)::int AS cnt FROM ${quoteIdent(table)}`);
      const after = countRes.rows[0].cnt;
      const before = pre.counts[table]?.before ?? 0;
      result.counts[table] = { before, after, delta: after - before };

      // T2: pg_stat diff
      if (pre.pg_stats[table]) {
        const statRes = await pool.query(
          `SELECT n_tup_ins::int AS ins, n_tup_upd::int AS upd, n_tup_del::int AS del
           FROM pg_stat_user_tables WHERE relname = $1`,
          [table]
        );
        if (statRes.rows[0]) {
          result.pg_stats[table] = {
            ins: statRes.rows[0].ins - pre.pg_stats[table].before_ins,
            upd: statRes.rows[0].upd - pre.pg_stats[table].before_upd,
            del: statRes.rows[0].del - pre.pg_stats[table].before_del,
          };
        }
      }

      // T6: Engine health (post-run snapshot for comparison)
      if (pre.engine && pre.engine[table]) {
        const engineRes = await pool.query(
          `SELECT n_live_tup::bigint AS live, n_dead_tup::bigint AS dead,
                  seq_scan::bigint AS seq, idx_scan::bigint AS idx
           FROM pg_stat_user_tables WHERE relname = $1`,
          [table]
        );
        if (engineRes.rows[0]) {
          const r = engineRes.rows[0];
          const live = parseInt(r.live, 10) || 0;
          const dead = parseInt(r.dead, 10) || 0;
          const seq = parseInt(r.seq, 10) || 0;
          const idx = parseInt(r.idx, 10) || 0;
          result.engine[table] = {
            n_live_tup: live,
            n_dead_tup: dead,
            dead_ratio: (live + dead) > 0 ? Math.round((dead / (live + dead)) * 10000) / 10000 : 0,
            seq_scan: seq,
            idx_scan: idx,
            seq_ratio: (seq + idx) > 0 ? Math.round((seq / (seq + idx)) * 10000) / 10000 : 0,
          };
        }
      }

      // T4: NULL fill diff
      if (pre.null_fills[table]) {
        result.null_fills[table] = {};
        for (const col of Object.keys(pre.null_fills[table])) {
          const nullRes = await pool.query(
            `SELECT count(*)::int AS cnt FROM ${quoteIdent(table)} WHERE ${quoteIdent(col)} IS NULL`
          );
          const afterNull = nullRes.rows[0].cnt;
          const beforeNull = pre.null_fills[table][col].before;
          result.null_fills[table][col] = {
            before: beforeNull,
            after: afterNull,
            filled: beforeNull - afterNull,
          };
        }
      }
    } catch (err) {
      log.warn('[telemetry]', `diffTelemetry failed for ${table}: ${err.message}`);
    }
  }
  return result;
}

/**
 * Sanitize a PostgreSQL identifier (table or column name).
 * Prevents SQL injection in dynamic telemetry queries.
 * @param {string} name
 * @returns {string}
 */
function quoteIdent(name) {
  // Only allow [a-zA-Z0-9_] — reject anything else
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
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
// Queue Age Check (B20) — detects stale unprocessed items
// ---------------------------------------------------------------------------

/**
 * Check the age of the oldest unprocessed item in a queue-like table.
 * Logs a warning if the max age exceeds the threshold.
 *
 * @param {Pool} pool
 * @param {string} table - Table name (e.g. 'scraper_queue', 'permits')
 * @param {string} timestampCol - Column holding the "queued at" timestamp
 * @param {{ where?: string, warnMinutes?: number, label?: string }} [options]
 * WARNING: options.where is interpolated directly into SQL. Only pass trusted,
 * hardcoded filter strings — never user input.
 * @returns {Promise<{ maxAgeMinutes: number, count: number }>}
 */
async function checkQueueAge(pool, table, timestampCol, options = {}) {
  const where = options.where ? `WHERE ${options.where}` : '';
  const label = options.label || `[queue-age:${table}]`;
  const warnMinutes = options.warnMinutes || 60;

  const result = await pool.query(
    `SELECT
       COUNT(*)::int AS cnt,
       EXTRACT(EPOCH FROM (NOW() - MIN(${quoteIdent(timestampCol)}))) / 60 AS max_age_minutes
     FROM ${quoteIdent(table)} ${where}`
  );

  const row = result.rows[0];
  const maxAgeMinutes = parseFloat(row.max_age_minutes) || 0;
  const count = row.cnt;

  if (maxAgeMinutes > warnMinutes) {
    log.warn(label, `Queue age warning: oldest item is ${Math.round(maxAgeMinutes)}m old (threshold: ${warnMinutes}m)`, { table, maxAgeMinutes, count });
  }

  return { maxAgeMinutes, count };
}

// ---------------------------------------------------------------------------
// Semantic Bounds Check (B22) — detects out-of-range values
// ---------------------------------------------------------------------------

/**
 * Check column values against declared bounds. Logs warnings for violations.
 *
 * @param {Pool} pool
 * @param {string} table
 * @param {Record<string, { min?: number, max?: number }>} bounds
 * @param {string} [label]
 * @returns {Promise<Array<{ column: string, violations: number, min?: number, max?: number }>>}
 */
async function checkBounds(pool, table, bounds, label) {
  const tag = label || `[bounds:${table}]`;
  const results = [];

  for (const [col, { min, max }] of Object.entries(bounds)) {
    const conditions = [];
    const params = [];
    let paramIdx = 1;
    if (min !== undefined) { conditions.push(`${quoteIdent(col)} < $${paramIdx++}`); params.push(min); }
    if (max !== undefined) { conditions.push(`${quoteIdent(col)} > $${paramIdx++}`); params.push(max); }
    if (conditions.length === 0) continue;

    const result = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM ${quoteIdent(table)} WHERE ${conditions.join(' OR ')}`,
      params
    );
    const violations = result.rows[0].cnt;
    results.push({ column: col, violations, min, max });

    if (violations > 0) {
      log.warn(tag, `Bounds violation: ${violations} rows in ${table}.${col} outside [${min ?? '-∞'}, ${max ?? '∞'}]`, { table, column: col, violations, min, max });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Streaming Query — prevents OOM on large result sets (B4)
// ---------------------------------------------------------------------------

/**
 * Execute a SQL query as an async iterable stream using pg-query-stream.
 * Instead of loading all rows into memory, yields one row at a time.
 *
 * Usage:
 *   for await (const row of pipeline.streamQuery(pool, 'SELECT * FROM big_table')) {
 *     processRow(row);
 *   }
 *
 * Requires: npm install pg-query-stream
 *
 * @param {Pool} pool
 * @param {string} sql
 * @param {any[]} [params=[]]
 * @param {{ batchSize?: number }} [options={}]
 * @yields {object} One row at a time
 */
async function* streamQuery(pool, sql, params = [], options = {}) {
  const QueryStream = require('pg-query-stream');
  const client = await pool.connect();
  let stream;
  try {
    const qs = new QueryStream(sql, params, { batchSize: options.batchSize || 100 });
    stream = client.query(qs);
    for await (const row of stream) {
      yield row;
    }
  } finally {
    if (stream) stream.destroy();
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createPool,
  classifyError,
  log,
  withTransaction,
  track,
  getTracked,
  emitSummary,
  emitMeta,
  progress,
  run,
  streamQuery,
  checkQueueAge,
  checkBounds,
  BATCH_SIZE,
  maxRowsPerInsert,
  isFullMode,
  captureTelemetry,
  diffTelemetry,
  quoteIdent,
};
