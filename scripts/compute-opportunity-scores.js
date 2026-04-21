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
 * SPEC LINK: docs/specs/pipeline/41_chain_permits.md
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
// z.coerce.number() instead of z.number(): pg returns DECIMAL/NUMERIC columns as
// strings to prevent float64 precision loss. z.number() rejects strings and causes
// an instant 871ms Zod validation crash. z.coerce.number() coerces first.
const LOGIC_VARS_SCHEMA = z.object({
  los_base_divisor:     z.coerce.number().finite().positive(),
  los_base_cap:         z.coerce.number().finite().positive(),
  los_multiplier_bid:   z.coerce.number().finite().positive(),
  los_multiplier_work:  z.coerce.number().finite().positive(),
  los_penalty_tracking: z.coerce.number().finite().min(0),
  los_penalty_saving:   z.coerce.number().finite().min(0),
  los_decay_divisor:    z.coerce.number().finite().positive(),
  score_tier_elite:     z.coerce.number().finite().positive(),
  score_tier_strong:    z.coerce.number().finite().positive(),
  score_tier_moderate:  z.coerce.number().finite().positive(),
}).passthrough();

pipeline.run('compute-opportunity-scores', async (pool) => {
  // ─── Concurrency guard — pipeline.withAdvisoryLock (Phase 2 migration) ───
  // §4: ALL state-dependent initialization (getDbTimestamp, loadMarketplaceConfigs)
  // MUST execute inside the lock callback to ensure absolute isolation.
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {

  // §R3.5: Capture run timestamp at pipeline startup — MANDATORY per skeleton
  // even though opportunity_score is an int and no timestamp column is written.
  // Documents run identity and prevents Midnight Cross on any future additions.
  const RUN_AT = await pipeline.getDbTimestamp(pool);

  // ─── Load Control Panel via shared loader ──────────────────
  // tradeConfigs not used here — per-trade multipliers come from the SQL JOIN on trade_configurations.
  const { logicVars: vars } = await loadMarketplaceConfigs(pool, 'opportunity-scores');

  // WF3 backstop: migration 102 may not be applied yet in all environments;
  // a stale container image may also predate the seeds.json update. ??= sets
  // the value only when currently null/undefined — DB-sourced values are kept.
  vars.los_decay_divisor ??= 25;

  // Fail fast if any required variable is missing, zero, or non-finite.
  // Prevents division-by-zero (los_base_divisor) and NaN score propagation.
  const validation = validateLogicVars(vars, LOGIC_VARS_SCHEMA, 'opportunity-scores');
  if (!validation.valid) {
    throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
  }
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
  //
  // §16.3 stale-snapshot guard not needed: advisory lock 81 prevents
  // concurrent script instances, and no API route writes opportunity_score
  // — this script is the sole writer to that column.
  // ═══════════════════════════════════════════════════════════
  let totalRows = 0;
  let updated = 0;
  let integrityFlags = 0;
  let nullInputScores = 0;
  let batch = [];
  let batchCount = 0;

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

    // Integrity audit runs regardless of cost data availability (spec 81 §3)
    if (row.tracking_count > 0 && row.modeled_gfa_sqm == null) {
      integrityFlags++;
    }

    // NULL guard: missing cost data → explicit null, not 0 (spec 81 §3 WF1 April 2026).
    // score = null means "no cost data". score = 0 means "real value, fully competed".
    const tradeValues = row.trade_contract_values;
    const hasNoCostData = row.estimated_cost == null
      || !tradeValues
      || Object.keys(tradeValues).length === 0;

    let score;
    if (hasNoCostData) {
      score = null;
      nullInputScores++;
    } else {
      const tradeValue = tradeValues[row.trade_slug] ?? 0;

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

      // Asymptotic decay (spec 81 §3 WF1 April 2026): score approaches 0 under heavy
      // competition but never goes negative. rawPenalty computation is identical to the
      // old competitionPenalty; only the application changes from subtraction to decay.
      const rawPenalty =
        (row.tracking_count * vars.los_penalty_tracking) + (row.saving_count * vars.los_penalty_saving);
      const decayFactor = rawPenalty / vars.los_decay_divisor;
      const raw = (base * urgencyMultiplier) / (1 + decayFactor);

      // Math.max(0,...) clamp is a final safety boundary — unreachable under normal inputs
      score = Math.max(0, Math.min(100, Math.round(raw)));
    }

    batch.push({
      permit_num: row.permit_num,
      revision_num: row.revision_num,
      trade_slug: row.trade_slug,
      score,
    });

    // Flush full batch immediately — keeps heap at O(BATCH_SIZE), not O(total rows)
    if (batch.length >= BATCH_SIZE) {
      await flushBatch(batch);
      batch = [];
      batchCount++;
      // spec §8.5: progress log every 50 batches for long-running streams
      if (batchCount % 50 === 0) {
        pipeline.log.info(
          '[opportunity-scores]',
          `Progress: ${totalRows.toLocaleString()} rows scored, ${updated} updated (batch ${batchCount})`,
        );
      }
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
        WHEN opportunity_score IS NULL   THEN 'no_cost_data'
        WHEN opportunity_score >= $1     THEN 'elite'
        WHEN opportunity_score >= $2     THEN 'strong'
        WHEN opportunity_score >= $3     THEN 'moderate'
        ELSE 'low'
      END AS tier,
      COUNT(*)::int AS n
    FROM trade_forecasts
    WHERE (urgency IS NULL OR urgency <> 'expired')
    GROUP BY 1
  `, [vars.score_tier_elite, vars.score_tier_strong, vars.score_tier_moderate]);
  const scoreDist = Object.fromEntries(dist.map((r) => [r.tier, r.n]));

  // ═══════════════════════════════════════════════════════════
  // Step 3: Post-UPDATE audit (spec 47 §8.2 — real audit_table)
  // ═══════════════════════════════════════════════════════════
  const { rows: auditRows } = await pool.query(`
    SELECT
      SUM(CASE WHEN opportunity_score IS NULL THEN 1 ELSE 0 END)::int     AS null_scores,
      SUM(CASE WHEN opportunity_score NOT BETWEEN 0 AND 100 THEN 1 ELSE 0 END)::int AS out_of_range,
      COUNT(DISTINCT permit_num)::int AS permits_in_scope
    FROM trade_forecasts
    WHERE (urgency IS NULL OR urgency <> 'expired')
  `);
  const nullScores     = auditRows[0]?.null_scores     ?? 0;
  const outOfRange     = auditRows[0]?.out_of_range     ?? 0;
  const permitsInScope = auditRows[0]?.permits_in_scope ?? 0;

  // spec §8.2 mandatory rows for "Score engine" type:
  // records_scored, records_unchanged, null_input_rate (with threshold)
  const auditTableRows = [
    { metric: 'records_scored',     value: totalRows,            threshold: null, status: 'INFO' },
    { metric: 'permits_in_scope',   value: permitsInScope,       threshold: null, status: 'INFO' },
    { metric: 'records_unchanged',  value: totalRows - updated,  threshold: null, status: 'INFO' },
    { metric: 'null_input_rate',    value: integrityFlags,       threshold: 0,    status: integrityFlags > 0 ? 'WARN' : 'PASS' },
    { metric: 'null_scores',        value: nullScores,           threshold: null, status: 'INFO' },
    { metric: 'null_input_scores',  value: nullInputScores,      threshold: null, status: 'INFO' },
    { metric: 'out_of_range',       value: outOfRange,           threshold: 0,    status: outOfRange > 0    ? 'FAIL' : 'PASS' },
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
      null_input_scores: nullInputScores,
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
  }, { skipEmit: false }); // end withAdvisoryLock

  // Lock held — emit rich SKIP with audit_table (FreshnessTimeline verdict).
  if (!lockResult.acquired) {
    pipeline.emitSummary({
      records_total: 0, records_new: 0, records_updated: 0,
      records_meta: {
        skipped: true, reason: 'advisory_lock_held_elsewhere',
        audit_table: {
          phase: 23,
          name: 'Opportunity Score Engine',
          verdict: 'PASS',
          rows: [{ metric: 'skipped_lock_held', value: 1, threshold: null, status: 'INFO' }],
        },
      },
    });
    pipeline.emitMeta({}, {});
    return;
  }
});
