#!/usr/bin/env node
/**
 * CQA Tier 3: Engine Health & Volume Volatility
 *
 * Queries pg_stat_user_tables for all monitored tables to detect:
 * 1. Dead tuple buildup (VACUUM not keeping up)
 * 2. Sequential scan dominance (missing/unused indexes)
 * 3. Update ping-pong (scripts re-touching unchanged rows)
 *
 * Also snapshots engine health to engine_health_snapshots table for trending.
 *
 * Usage: node scripts/quality/assert-engine-health.js
 *
 * Exit 0 = pass (warnings are OK)
 * Exit 1 = fail (critical engine health issues)
 *
 * SPEC LINK: docs/specs/28_data_quality_dashboard.md
 */
const pipeline = require('../lib/pipeline');

const pool = pipeline.createPool();

const SLUG = 'assert_engine_health';

const CHAIN_ID = process.env.PIPELINE_CHAIN || null;

// Thresholds
const DEAD_TUPLE_RATIO = 0.10;       // 10%
const SEQ_SCAN_RATIO = 0.80;         // 80%
const SEQ_SCAN_MIN_ROWS = 10000;     // Only flag large tables
const PING_PONG_RATIO = 2;           // updates > 2x inserts

async function run() {
  console.log('\n=== CQA Tier 3: Engine Health & Volume Volatility ===\n');

  const startMs = Date.now();
  let runId = null;

  if (!CHAIN_ID) {
    try {
      const res = await pool.query(
        `INSERT INTO pipeline_runs (pipeline, started_at, status)
         VALUES ($1, NOW(), 'running') RETURNING id`,
        [SLUG]
      );
      runId = res.rows[0].id;
    } catch (err) {
      console.warn('Could not insert pipeline_runs row:', err.message);
    }
  }

  const warnings = [];
  const errors = [];
  const tableResults = [];
  let vacuumTargets = [];
  let recordsUpdated = 0;

  try {
    // Discover all public-schema tables dynamically — no hardcoded list
    const tableRes = await pool.query(
      `SELECT relname FROM pg_stat_user_tables
       WHERE schemaname = 'public'
       ORDER BY relname`
    );
    const MONITORED_TABLES = tableRes.rows.map(r => r.relname);
    console.log(`Monitoring ${MONITORED_TABLES.length} tables\n`);

    // Query pg_stat_user_tables for all monitored tables
    const statRes = await pool.query(
      `SELECT relname AS table_name,
              n_live_tup::bigint AS n_live_tup,
              n_dead_tup::bigint AS n_dead_tup,
              seq_scan::bigint AS seq_scan,
              idx_scan::bigint AS idx_scan,
              n_tup_ins::bigint AS n_tup_ins,
              n_tup_upd::bigint AS n_tup_upd
       FROM pg_stat_user_tables
       WHERE relname = ANY($1)
       ORDER BY relname`,
      [MONITORED_TABLES]
    );

    for (const row of statRes.rows) {
      const live = parseInt(row.n_live_tup, 10) || 0;
      const dead = parseInt(row.n_dead_tup, 10) || 0;
      const seq = parseInt(row.seq_scan, 10) || 0;
      const idx = parseInt(row.idx_scan, 10) || 0;
      const ins = parseInt(row.n_tup_ins, 10) || 0;
      const upd = parseInt(row.n_tup_upd, 10) || 0;
      const totalScans = seq + idx;

      const deadRatio = live > 0 ? dead / live : 0;
      const seqRatio = totalScans > 0 ? seq / totalScans : 0;

      tableResults.push({
        table_name: row.table_name,
        n_live_tup: live,
        n_dead_tup: dead,
        dead_ratio: Math.round(deadRatio * 10000) / 10000,
        seq_scan: seq,
        idx_scan: idx,
        seq_ratio: Math.round(seqRatio * 10000) / 10000,
      });

      // Check 1: Dead tuple ratio
      if (live > 0 && deadRatio > DEAD_TUPLE_RATIO) {
        warnings.push(`${row.table_name}: ${dead.toLocaleString()} dead tuples (${(deadRatio * 100).toFixed(1)}% of ${live.toLocaleString()} live)`);
        console.log(`  WARN: ${row.table_name} — dead tuple ratio ${(deadRatio * 100).toFixed(1)}% exceeds ${DEAD_TUPLE_RATIO * 100}%`);
      } else {
        console.log(`  OK: ${row.table_name} — dead tuple ratio ${(deadRatio * 100).toFixed(1)}%`);
      }

      // Check 2: Sequential scan ratio on large tables
      if (live >= SEQ_SCAN_MIN_ROWS && totalScans > 0 && seqRatio > SEQ_SCAN_RATIO) {
        warnings.push(`${row.table_name}: ${(seqRatio * 100).toFixed(1)}% sequential scans (${seq} seq vs ${idx} idx)`);
        console.log(`  WARN: ${row.table_name} — seq scan ratio ${(seqRatio * 100).toFixed(1)}% exceeds ${SEQ_SCAN_RATIO * 100}%`);
      } else if (live >= SEQ_SCAN_MIN_ROWS) {
        console.log(`  OK: ${row.table_name} — seq scan ratio ${(seqRatio * 100).toFixed(1)}%`);
      }

      // Check 3: Update ping-pong (cumulative — all-time ratio)
      if (ins > 0 && upd > PING_PONG_RATIO * ins) {
        const ratio = (upd / ins).toFixed(1);
        warnings.push(`${row.table_name}: update/insert ratio ${ratio}x (${upd.toLocaleString()} upd vs ${ins.toLocaleString()} ins)`);
        console.log(`  WARN: ${row.table_name} — update ping-pong ${ratio}x`);
      }
    }

    // Auto-VACUUM ANALYZE tables exceeding dead tuple threshold
    vacuumTargets = tableResults.filter((t) => t.dead_ratio > DEAD_TUPLE_RATIO && t.n_live_tup > 0);
    if (vacuumTargets.length > 0) {
      console.log(`\n--- Auto-VACUUM ANALYZE (${vacuumTargets.length} tables above ${DEAD_TUPLE_RATIO * 100}% dead ratio) ---`);
      for (const target of vacuumTargets) {
        try {
          // VACUUM ANALYZE is safe: non-blocking on reads, reclaims dead tuples, updates planner stats
          await pool.query(`VACUUM ANALYZE ${target.table_name}`);
          console.log(`  VACUUM ANALYZE ${target.table_name} — done (was ${(target.dead_ratio * 100).toFixed(1)}% dead)`);
        } catch (vacErr) {
          console.warn(`  WARN: VACUUM ANALYZE ${target.table_name} failed: ${vacErr.message}`);
        }
      }
    }

    // Snapshot engine health to engine_health_snapshots table
    try {
      for (const entry of tableResults) {
        const res = await pool.query(
          `INSERT INTO engine_health_snapshots
             (table_name, snapshot_date, n_live_tup, n_dead_tup, dead_ratio, seq_scan, idx_scan, seq_ratio)
           VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (table_name, snapshot_date) DO UPDATE SET
             n_live_tup = EXCLUDED.n_live_tup,
             n_dead_tup = EXCLUDED.n_dead_tup,
             dead_ratio = EXCLUDED.dead_ratio,
             seq_scan = EXCLUDED.seq_scan,
             idx_scan = EXCLUDED.idx_scan,
             seq_ratio = EXCLUDED.seq_ratio,
             captured_at = NOW()
           WHERE engine_health_snapshots.n_live_tup IS DISTINCT FROM EXCLUDED.n_live_tup
              OR engine_health_snapshots.n_dead_tup IS DISTINCT FROM EXCLUDED.n_dead_tup
              OR engine_health_snapshots.dead_ratio IS DISTINCT FROM EXCLUDED.dead_ratio
              OR engine_health_snapshots.seq_scan IS DISTINCT FROM EXCLUDED.seq_scan
              OR engine_health_snapshots.idx_scan IS DISTINCT FROM EXCLUDED.idx_scan
              OR engine_health_snapshots.seq_ratio IS DISTINCT FROM EXCLUDED.seq_ratio
           RETURNING xmax`,
          [entry.table_name, entry.n_live_tup, entry.n_dead_tup, entry.dead_ratio, entry.seq_scan, entry.idx_scan, entry.seq_ratio]
        );
        // xmax > 0 means UPDATE (existing row changed), xmax = 0 means INSERT (new row)
        if (res.rowCount > 0 && res.rows[0].xmax !== '0') recordsUpdated++;
      }
      console.log(`\n  Snapshot: ${tableResults.length} tables written to engine_health_snapshots (${recordsUpdated} actually updated)`);
    } catch (err) {
      // Non-fatal — table may not exist yet
      console.warn(`  WARN: Could not write engine_health_snapshots: ${err.message}`);
    }

  } catch (err) {
    errors.push(err.message);
    console.error(`  ERROR: ${err.message}`);
  }

  const durationMs = Date.now() - startMs;
  const hasErrors = errors.length > 0;
  const status = hasErrors ? 'failed' : 'completed';
  const allMessages = [...errors, ...warnings.map((w) => `WARN: ${w}`)];
  const errorMsg = allMessages.length > 0 ? allMessages.join('; ') : null;
  // Build inspection-specific audit_table (Phase 6)
  const inspRow = tableResults.find((t) => t.table_name === 'permit_inspections');
  let inspAuditTable = null;
  if (inspRow) {
    const live = inspRow.n_live_tup;
    const dead = inspRow.n_dead_tup;
    const deadPct = live + dead > 0 ? ((dead / (live + dead)) * 100).toFixed(2) + '%' : '0%';
    // Query update/insert ratio for permit_inspections
    const piStat = await pool.query(
      `SELECT n_tup_ins::bigint AS ins, n_tup_upd::bigint AS upd, last_autovacuum
       FROM pg_stat_user_tables WHERE relname = 'permit_inspections'`
    ).catch(() => ({ rows: [] }));
    const ins = parseInt(piStat.rows[0]?.ins) || 0;
    const upd = parseInt(piStat.rows[0]?.upd) || 0;
    const uiRatio = ins > 0 ? (upd / ins).toFixed(2) : 0;
    const lastVac = piStat.rows[0]?.last_autovacuum || null;

    const deadPctNum = live + dead > 0 ? (dead / (live + dead)) * 100 : 0;
    const uiRatioNum = ins > 0 ? upd / ins : 0;
    const auditRows = [
      { metric: 'live_rows', value: live, threshold: null, status: 'INFO' },
      { metric: 'dead_rows', value: dead, threshold: null, status: 'INFO' },
      { metric: 'dead_tuple_pct', value: deadPct, threshold: '< 10%', status: deadPctNum >= 10 ? 'FAIL' : 'PASS' },
      { metric: 'update_insert_ratio', value: parseFloat(uiRatio), threshold: '< 5.0', status: uiRatioNum >= 5 ? 'FAIL' : 'PASS' },
      { metric: 'last_autovacuum', value: lastVac, threshold: null, status: 'INFO' },
    ];
    const hasFails = auditRows.some((r) => r.status === 'FAIL');
    inspAuditTable = {
      phase: 6,
      name: 'Engine Health',
      verdict: hasFails ? 'FAIL' : 'PASS',
      rows: auditRows,
    };
  }

  const meta = JSON.stringify({
    checks_passed: allMessages.length === 0 ? 'all' : undefined,
    checks_warned: warnings.length,
    checks_failed: errors.length,
    tables_checked: tableResults.length,
    tables_vacuumed: vacuumTargets.length,
    warnings: warnings.length > 0 ? warnings : undefined,
    errors: errors.length > 0 ? errors : undefined,
    engine_health: tableResults,
    ...(inspAuditTable && { audit_table: inspAuditTable }),
  });

  if (runId) {
    await pool.query(
      `UPDATE pipeline_runs
       SET completed_at = NOW(), status = $1, duration_ms = $2, error_message = $3,
           records_meta = $5
       WHERE id = $4`,
      [status, durationMs, errorMsg, runId, meta]
    ).catch(() => {});
  }

  console.log(`PIPELINE_SUMMARY:${JSON.stringify({ records_total: tableResults.length, records_new: null, records_updated: recordsUpdated, records_meta: JSON.parse(meta) })}`);
  console.log('PIPELINE_META:' + JSON.stringify({
    reads: { pg_stat_user_tables: ['relname', 'n_live_tup', 'n_dead_tup', 'seq_scan', 'idx_scan', 'n_tup_ins', 'n_tup_upd'] },
    writes: { engine_health_snapshots: ['table_name', 'n_live_tup', 'n_dead_tup', 'dead_ratio', 'seq_scan', 'idx_scan', 'seq_ratio'] },
  }));

  if (warnings.length > 0) {
    console.log(`\n  Warnings: ${warnings.length}`);
  }
  if (errors.length > 0) {
    console.log(`  Errors: ${errors.length}`);
  }

  console.log(`\n=== Engine Health: ${status.toUpperCase()} (${(durationMs / 1000).toFixed(1)}s) ===\n`);

  await pool.end();

  if (hasErrors) process.exit(1);
}

run().catch((err) => {
  console.error('Engine health check error:', err);
  pool.end().catch(() => {});
  process.exit(1);
});
