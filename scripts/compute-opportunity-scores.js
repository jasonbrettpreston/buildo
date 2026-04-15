#!/usr/bin/env node
/**
 * Compute Opportunity Scores — the Intrinsic Value Engine.
 *
 * Calculates a 0-100 composite score for each trade forecast by
 * combining trade dollar value (from cost_estimates), urgency window
 * multiplier (bid vs work), and competition discount (from lead_analytics).
 *
 * Also runs an integrity audit: flags permits where tracking_count > 0
 * but modeled_gfa_sqm is null (tracked leads with no geometric basis).
 *
 * SPEC LINK: docs/specs/product/future/81_opportunity_score_engine.md
 *
 * DUAL PATH NOTE: N/A — per spec §5 Operating Boundaries, opportunity_score
 * is a dynamic marketplace property written only by this pipeline script.
 * src/lib/classification/scoring.ts computes a different field (lead_score)
 * and must NOT be modified alongside this script.
 */
'use strict';

const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');

// WF3-03 PR-B (H-W1): lock ID = spec number convention.
const ADVISORY_LOCK_ID = 81;

// 4 params per row: permit_num, revision_num, trade_slug, score
const BATCH_SIZE = pipeline.maxRowsPerInsert(4); // Math.floor(65535 / 4) = 16383

// Zod schema for the logicVars used by this script.
// los_base_divisor=0 would cause division by zero; fail fast before scoring.
// spec 47 §4 — validate before entering main loop.
const LOGIC_VARS_SCHEMA = z.object({
  los_base_divisor:     z.number().finite().positive(),
  los_base_cap:         z.number().finite().positive(),
  los_multiplier_bid:   z.number().finite().positive(),
  los_multiplier_work:  z.number().finite().positive(),
  los_penalty_tracking: z.number().finite().min(0),
  los_penalty_saving:   z.number().finite().min(0),
}).passthrough();

pipeline.run('compute-opportunity-scores', async (pool) => {
  // §R3.5: Capture run timestamp at pipeline startup — MANDATORY per skeleton
  // even though opportunity_score is an int and no timestamp column is written.
  // Documents run identity and prevents Midnight Cross on any future additions.
  const { rows: [{ now: RUN_AT }] } = await pool.query('SELECT NOW() AS now');

  // ─── Load Control Panel via shared loader ──────────────────
  // tradeConfigs not used here — per-trade multipliers come from the SQL JOIN on trade_configurations.
  const { logicVars: vars } = await loadMarketplaceConfigs(pool, 'opportunity-scores');

  // Fail fast if any required variable is missing, zero, or non-finite.
  // Prevents division-by-zero (los_base_divisor) and NaN score propagation.
  const validation = validateLogicVars(vars, LOGIC_VARS_SCHEMA, 'opportunity-scores');
  if (!validation.valid) {
    throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
  }

  // ─── Concurrency guard — single-threaded scorer ──────────────
  // Lock acquired on a DEDICATED `pool.connect()` client (mirrors
  // classify-lifecycle-phase.js). pool.query would acquire on an
  // ephemeral connection and the unlock would no-op (cf. 83-W5).
  const lockClient = await pool.connect();

  // Guard flag prevents double-release if SIGTERM fires after the skip-path
  // (or after the finally block) has already released the client.
  let lockClientReleased = false;

  // §5.5: SIGTERM handler — release advisory lock before process exits so
  // the next scheduled run is not blocked by a stale lock on a dead session.
  process.on('SIGTERM', async () => {
    pipeline.log.warn(
      '[opportunity-scores]',
      'Received SIGTERM. Releasing advisory lock and shutting down gracefully...',
    );
    try {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
    } catch (e) { /* best-effort */ }
    if (!lockClientReleased) {
      lockClientReleased = true;
      lockClient.release();
    }
    process.exit(143);
  });

  try {
    const { rows: lockRows } = await lockClient.query(
      'SELECT pg_try_advisory_lock($1) AS got',
      [ADVISORY_LOCK_ID],
    );
    if (!lockRows[0].got) {
      pipeline.log.info(
        '[opportunity-scores]',
        `Advisory lock ${ADVISORY_LOCK_ID} held by another instance — skipping this run.`,
      );
      pipeline.emitSummary({
        records_total: 0, records_new: 0, records_updated: 0,
        records_meta: {
          skipped: true, reason: 'advisory_lock_held_elsewhere',
          advisory_lock_id: ADVISORY_LOCK_ID,
          audit_table: {
            phase: 23,
            name: 'Opportunity Score Engine',
            verdict: 'PASS',
            rows: [{ metric: 'skipped_lock_held', value: 1, threshold: null, status: 'INFO' }],
          },
        },
      });
      pipeline.emitMeta({}, {});
      lockClientReleased = true;
      lockClient.release();
      return;
    }
  } catch (lockErr) {
    lockClientReleased = true;
    lockClient.release();
    throw lockErr;
  }

  try {
  // ═══════════════════════════════════════════════════════════
  // Step 1: Stream trade forecasts + cost + competition data
  // spec 47 §6.1 — streamQuery required for trade_forecasts (2.5M+ rows).
  // JOIN trade_configurations for per-trade multipliers (Bug 2 fix).
  // spec §7 #6 — include NULL urgency rows (urgency IS NULL OR <> 'expired').
  // ═══════════════════════════════════════════════════════════
  pipeline.log.info('[opportunity-scores]', 'Streaming forecast + cost + competition data...');

  const SQL = `
    SELECT
      tf.permit_num,
      tf.revision_num,
      tf.trade_slug,
      tf.target_window,
      tf.urgency,
      ce.estimated_cost,
      ce.trade_contract_values,
      ce.is_geometric_override,
      ce.modeled_gfa_sqm,
      COALESCE(la.tracking_count, 0) AS tracking_count,
      COALESCE(la.saving_count, 0) AS saving_count,
      tc.multiplier_bid,
      tc.multiplier_work
    FROM trade_forecasts tf
    LEFT JOIN cost_estimates ce
      ON ce.permit_num = tf.permit_num AND ce.revision_num = tf.revision_num
    LEFT JOIN lead_analytics la
      ON la.lead_key = 'permit:' || tf.permit_num || ':' || LPAD(tf.revision_num, 2, '0')
    LEFT JOIN trade_configurations tc
      ON tc.trade_slug = tf.trade_slug
    WHERE (tf.urgency IS NULL OR tf.urgency <> 'expired')
  `;

  // ═══════════════════════════════════════════════════════════
  // Step 2: Score rows + flush per-batch (true streaming)
  //
  // WF3-11: Replaced global `updates[]` accumulator with per-batch flush.
  // The old pattern loaded the entire 2.5M row result set into Node heap,
  // defeating the memory-backpressure benefit of streamQuery. Each batch
  // of BATCH_SIZE rows is now written atomically via its own withTransaction
  // immediately after it fills. Heap holds at most one batch at a time.
  //
  // Atomicity trade-off: per-batch commits (not run-wide) mean a crash
  // mid-stream leaves some rows with the new score and others with the
  // previous run's score ("mixed vintage"). This is acceptable because:
  //   1. The IS DISTINCT FROM guard makes re-runs convergent — the next
  //      scheduled run will finish the remaining rows.
  //   2. The advisory lock prevents concurrent writers from interleaving.
  //   3. Scores are live-computed properties, not financial records — a
  //      brief mixed-vintage window does not corrupt durable state.
  // ═══════════════════════════════════════════════════════════
  let totalRows = 0;
  let updated = 0;
  let integrityFlags = 0;
  let batch = [];

  const flushBatch = async (currentBatch) => {
    if (currentBatch.length === 0) return;
    const vals = [];
    const params = [];
    for (let j = 0; j < currentBatch.length; j++) {
      const u = currentBatch[j];
      const base = j * 4;
      vals.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::int)`);
      params.push(u.permit_num, u.revision_num, u.trade_slug, u.score);
    }
    await pipeline.withTransaction(pool, async (client) => {
      const result = await client.query(
        `UPDATE trade_forecasts tf
            SET opportunity_score = v.score
          FROM (VALUES ${vals.join(', ')}) AS v(permit_num, revision_num, trade_slug, score)
         WHERE tf.permit_num = v.permit_num
           AND tf.revision_num = v.revision_num
           AND tf.trade_slug = v.trade_slug
           AND tf.opportunity_score IS DISTINCT FROM v.score`,
        params,
      );
      // spec §7 #5: use rowCount not batch size — IS DISTINCT FROM guard
      // means some rows in each batch may be skipped as unchanged.
      updated += result.rowCount ?? 0;
    });
  };

  for await (const row of pipeline.streamQuery(pool, SQL, [])) {
    totalRows++;

    // Extract trade-specific dollar value from JSONB
    const tradeValues = row.trade_contract_values || {};
    const tradeValue = tradeValues[row.trade_slug] || 0;

    // Base: trade value normalized, capped (from control panel)
    const base = Math.min(tradeValue / vars.los_base_divisor, vars.los_base_cap);

    // Per-trade urgency multiplier from trade_configurations JOIN (Bug 2 fix).
    // Falls back to global logic_variables if the trade has no row in
    // trade_configurations (defensive — all 32 trades should have one).
    // spec 47 §4 — guard parseFloat with isFinite; log warn + use global fallback on NaN.
    const rawBid = parseFloat(row.multiplier_bid);
    const rawWork = parseFloat(row.multiplier_work);
    if (row.multiplier_bid != null && !Number.isFinite(rawBid)) {
      pipeline.log.warn(
        '[opportunity-scores]',
        `Non-finite multiplier_bid for trade ${row.trade_slug} — using global fallback`,
        { raw: row.multiplier_bid },
      );
    }
    if (row.multiplier_work != null && !Number.isFinite(rawWork)) {
      pipeline.log.warn(
        '[opportunity-scores]',
        `Non-finite multiplier_work for trade ${row.trade_slug} — using global fallback`,
        { raw: row.multiplier_work },
      );
    }
    const urgencyMultiplier = row.target_window === 'bid'
      ? (row.multiplier_bid != null && Number.isFinite(rawBid) ? rawBid : vars.los_multiplier_bid)
      : (row.multiplier_work != null && Number.isFinite(rawWork) ? rawWork : vars.los_multiplier_work);

    // Competition discount (from control panel)
    const competitionPenalty =
      (row.tracking_count * vars.los_penalty_tracking) + (row.saving_count * vars.los_penalty_saving);

    // Raw score
    const raw = (base * urgencyMultiplier) - competitionPenalty;

    // Clamp to 0-100
    const score = Math.max(0, Math.min(100, Math.round(raw)));

    batch.push({
      permit_num: row.permit_num,
      revision_num: row.revision_num,
      trade_slug: row.trade_slug,
      score,
    });

    // Integrity audit: tracked lead with no geometric basis
    if (row.tracking_count > 0 && row.modeled_gfa_sqm == null) {
      integrityFlags++;
    }

    // Flush full batch immediately — keeps heap at O(BATCH_SIZE), not O(total rows)
    if (batch.length >= BATCH_SIZE) {
      await flushBatch(batch);
      batch = [];
    }
  }

  // Flush any remaining rows after the stream closes
  await flushBatch(batch);
  batch = [];

  pipeline.log.info('[opportunity-scores]', `Rows scored: ${totalRows}`);
  pipeline.log.info('[opportunity-scores]', `Updated ${updated} scores`);
  if (integrityFlags > 0) {
    pipeline.log.warn(
      '[opportunity-scores]',
      `Integrity audit: ${integrityFlags} tracked leads have no modeled_gfa_sqm`,
    );
  }

  // Score distribution for telemetry
  // spec §7 #6: apply NULL-safe urgency filter consistently
  const { rows: dist } = await pool.query(`
    SELECT
      CASE
        WHEN opportunity_score >= 80 THEN 'elite'
        WHEN opportunity_score >= 50 THEN 'strong'
        WHEN opportunity_score >= 20 THEN 'moderate'
        ELSE 'low'
      END AS tier,
      COUNT(*)::int AS n
    FROM trade_forecasts
    WHERE (urgency IS NULL OR urgency <> 'expired')
    GROUP BY 1
  `);
  const scoreDist = Object.fromEntries(dist.map((r) => [r.tier, r.n]));

  // ═══════════════════════════════════════════════════════════
  // Step 3: Post-UPDATE audit (spec 47 §8.2 — real audit_table)
  // ═══════════════════════════════════════════════════════════
  const { rows: auditRows } = await pool.query(`
    SELECT
      SUM(CASE WHEN opportunity_score IS NULL THEN 1 ELSE 0 END)::int     AS null_scores,
      SUM(CASE WHEN opportunity_score NOT BETWEEN 0 AND 100 THEN 1 ELSE 0 END)::int AS out_of_range
    FROM trade_forecasts
    WHERE (urgency IS NULL OR urgency <> 'expired')
  `);
  const nullScores  = auditRows[0]?.null_scores  ?? 0;
  const outOfRange  = auditRows[0]?.out_of_range  ?? 0;

  const auditTableRows = [
    { metric: 'null_scores',     value: nullScores,     threshold: 0, status: nullScores > 0  ? 'WARN' : 'PASS' },
    { metric: 'out_of_range',    value: outOfRange,     threshold: 0, status: outOfRange > 0  ? 'FAIL' : 'PASS' },
    { metric: 'integrity_flags', value: integrityFlags, threshold: null, status: 'INFO' },
  ];
  const auditVerdict =
    auditTableRows.some((r) => r.status === 'FAIL') ? 'FAIL' :
    auditTableRows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';

  pipeline.emitSummary({
    records_total: totalRows,
    records_new: 0,
    records_updated: updated,
    records_meta: {
      score_distribution: scoreDist,
      integrity_flags: integrityFlags,
      run_at: RUN_AT,
      audit_table: {
        phase: 23,
        name: 'Opportunity Score Engine',
        verdict: auditVerdict,
        rows: auditTableRows,
      },
    },
  });

  pipeline.emitMeta(
    {
      trade_forecasts: ['permit_num', 'revision_num', 'trade_slug', 'target_window', 'urgency'],
      cost_estimates: ['permit_num', 'revision_num', 'estimated_cost', 'trade_contract_values', 'is_geometric_override', 'modeled_gfa_sqm'],
      lead_analytics: ['lead_key', 'tracking_count', 'saving_count'],
      trade_configurations: ['trade_slug', 'multiplier_bid', 'multiplier_work'],
    },
    {
      trade_forecasts: ['opportunity_score'],
    },
  );
  } finally {
    // Release advisory lock on the SAME pinned client that acquired it.
    try {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
    } catch (unlockErr) {
      pipeline.log.warn(
        '[opportunity-scores]',
        'Failed to release advisory lock — it will expire when the session ends.',
        { err: unlockErr instanceof Error ? unlockErr.message : String(unlockErr) },
      );
    } finally {
      if (!lockClientReleased) {
        lockClientReleased = true;
        lockClient.release();
      }
    }
  }
});
