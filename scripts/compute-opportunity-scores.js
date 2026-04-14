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
 * SPEC LINK: docs/reports/lifecycle_phase_implementation.md
 */
'use strict';

const pipeline = require('./lib/pipeline');
const { loadMarketplaceConfigs } = require('./lib/config-loader');

// WF3-03 PR-B (H-W1): lock ID = spec number convention.
const ADVISORY_LOCK_ID = 81;

pipeline.run('compute-opportunity-scores', async (pool) => {
  // ─── Concurrency guard — single-threaded scorer ──────────────
  // Lock acquired on a DEDICATED `pool.connect()` client (mirrors
  // classify-lifecycle-phase.js). pool.query would acquire on an
  // ephemeral connection and the unlock would no-op (cf. 83-W5).
  const lockClient = await pool.connect();
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
        records_meta: { skipped: true, reason: 'advisory_lock_held_elsewhere',
          advisory_lock_id: ADVISORY_LOCK_ID },
      });
      pipeline.emitMeta({}, {});
      lockClient.release();
      return;
    }
  } catch (lockErr) {
    lockClient.release();
    throw lockErr;
  }

  try {
  // ─── Load Control Panel via shared loader ──────────────────
  const { tradeConfigs, logicVars: vars } = await loadMarketplaceConfigs(pool, 'opportunity-scores');

  // ═══════════════════════════════════════════════════════════
  // Step 1: Load trade forecasts + cost + competition data
  // JOIN trade_configurations for per-trade multipliers (Bug 2 fix).
  // ═══════════════════════════════════════════════════════════
  pipeline.log.info('[opportunity-scores]', 'Loading forecast + cost + competition data...');

  const { rows } = await pool.query(`
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
    WHERE tf.urgency NOT IN ('expired')
  `);

  pipeline.log.info('[opportunity-scores]', `Rows to score: ${rows.length}`);

  // ═══════════════════════════════════════════════════════════
  // Step 2: Compute scores in JS
  // ═══════════════════════════════════════════════════════════
  const updates = [];
  let integrityFlags = 0;

  for (const row of rows) {
    // Extract trade-specific dollar value from JSONB
    const tradeValues = row.trade_contract_values || {};
    const tradeValue = tradeValues[row.trade_slug] || 0;

    // Base: trade value normalized, capped (from control panel)
    const base = Math.min(tradeValue / vars.los_base_divisor, vars.los_base_cap);

    // Per-trade urgency multiplier from trade_configurations (Bug 2 fix).
    // Falls back to global logic_variables if the trade has no row in
    // trade_configurations (defensive — all 32 trades should have one).
    const urgencyMultiplier = row.target_window === 'bid'
      ? (row.multiplier_bid != null ? parseFloat(row.multiplier_bid) : vars.los_multiplier_bid)
      : (row.multiplier_work != null ? parseFloat(row.multiplier_work) : vars.los_multiplier_work);

    // Competition discount (from control panel)
    const competitionPenalty =
      (row.tracking_count * vars.los_penalty_tracking) + (row.saving_count * vars.los_penalty_saving);

    // Raw score
    const raw = (base * urgencyMultiplier) - competitionPenalty;

    // Clamp to 0-100
    const score = Math.max(0, Math.min(100, Math.round(raw)));

    updates.push({
      permit_num: row.permit_num,
      revision_num: row.revision_num,
      trade_slug: row.trade_slug,
      score,
    });

    // Integrity audit: tracked lead with no geometric basis
    if (row.tracking_count > 0 && row.modeled_gfa_sqm == null) {
      integrityFlags++;
    }
  }

  pipeline.log.info('[opportunity-scores]', `Scores computed: ${updates.length}`);
  if (integrityFlags > 0) {
    pipeline.log.warn(
      '[opportunity-scores]',
      `Integrity audit: ${integrityFlags} tracked leads have no modeled_gfa_sqm`,
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Step 3: Batch UPDATE trade_forecasts.opportunity_score (atomic)
  // ═══════════════════════════════════════════════════════════
  // WF3-03 PR-B (H-W2 / 81-W1): wrap the multi-batch UPDATE loop in a
  // single pipeline.withTransaction so a crash mid-loop rolls back to
  // the pre-run state. Without this, the table would carry a mix of
  // this-run and last-run scores, contaminating downstream consumers
  // (compute-cost-estimates, update-tracked-projects, the lead feed).
  const BATCH_SIZE = 1000;
  let updated = 0;

  if (updates.length > 0) {
    await pipeline.withTransaction(pool, async (client) => {
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        const vals = [];
        const params = [];

        for (let j = 0; j < batch.length; j++) {
          const u = batch[j];
          const base = j * 4;
          vals.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::int)`);
          params.push(u.permit_num, u.revision_num, u.trade_slug, u.score);
        }

        await client.query(
          `UPDATE trade_forecasts tf
              SET opportunity_score = v.score
            FROM (VALUES ${vals.join(', ')}) AS v(permit_num, revision_num, trade_slug, score)
           WHERE tf.permit_num = v.permit_num
             AND tf.revision_num = v.revision_num
             AND tf.trade_slug = v.trade_slug
             AND tf.opportunity_score IS DISTINCT FROM v.score`,
          params,
        );
        updated += batch.length;
      }
    });
  }

  pipeline.log.info('[opportunity-scores]', `Updated ${updated} scores`);

  // Score distribution for telemetry
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
    WHERE urgency NOT IN ('expired')
    GROUP BY 1
  `);
  const scoreDist = Object.fromEntries(dist.map((r) => [r.tier, r.n]));

  pipeline.emitSummary({
    records_total: rows.length,
    records_new: 0,
    records_updated: updated,
    records_meta: {
      score_distribution: scoreDist,
      integrity_flags: integrityFlags,
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
      lockClient.release();
    }
  }
});
