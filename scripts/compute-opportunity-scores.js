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
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/81_opportunity_score_engine.md
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
// WF3 2026-05-08 — realtor financial-base carve-out (Spec 81 §3 + Spec 47 §10.2)
const { REALTOR_TRADE_SLUG } = require('./lib/pipeline-realtor-availability');

// WF3-03 PR-B (H-W1): lock ID = spec number convention.
const ADVISORY_LOCK_ID = 81;

// F.3: VALUES tuple is (lead_id, trade_slug, score) — 3 columns per row (was 4 pre-rekey).
// HIGH-v2-I: cap at 21000 for ~3% safety margin from the 65535 PostgreSQL parameter ceiling.
// scripts/lib/pipeline.js maxRowsPerInsert helper is Math.floor(65535/N) with no overhead reservation;
// 21000 × 3 = 63000 ≤ 65535. Verified.
const BATCH_SIZE = Math.min(pipeline.maxRowsPerInsert(3), 21000);

/**
 * F.3 module-local pure helper — branch discriminator for lead_id-keyed rows.
 *
 * Returns 'permit' | 'coa' | null. Regex anchored to first prefix (HIGH-v1-G ambiguity
 * safety) — handles edge cases like 'coa:permit:123' correctly (yields 'coa').
 * Returns null is UNREACHABLE in production: mig-134 CHECK '^(permit|coa):.+' on
 * trade_forecasts.lead_id + permits.lead_id columns rejects malformed values at write
 * time. Defensive null still propagates to caller for malformed-data observability
 * via totalRowsOther counter + failed_sample (see stream loop).
 *
 * MODULE scope is intentional (defined BEFORE pipeline.run) — vm sandbox extraction
 * pattern in logic test requires this. See compute-opportunity-scores.logic.test.ts.
 */
function parseBranchFromLeadId(leadId) {
  if (typeof leadId !== 'string') return null;
  const match = leadId.match(/^(coa|permit):/);
  return match ? match[1] : null;
}

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
  // ═══════════════════════════════════════════════════════════
  // F.3 deploy-age startup query (baseline-quiet-period gates per F.1/F.2 precedent).
  // MED-v2-T: SQL aliases named for COUNT direction clarity (NOT misleading "prior runs"
  //   shorthand). MED-v2-R: slug uses manifest-key form 'compute_opportunity_scores'
  //   underscore — verified per F.2 Obs HIGH-N precedent (run-chain.js writes ${chainId}:${slug}).
  // ═══════════════════════════════════════════════════════════
  const { rows: deployAgeRows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '7 days')::int  AS runs_older_than_7d,
       COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '30 days')::int AS runs_older_than_30d
     FROM pipeline_runs
     WHERE pipeline = 'permits:compute_opportunity_scores'`,
  );
  const coaFirstDeployGrace = deployAgeRows[0].runs_older_than_7d === 0;
  const inQuietPeriod       = deployAgeRows[0].runs_older_than_30d === 0;

  pipeline.log.info('[opportunity-scores]', 'Streaming forecast + cost + competition data...');

  // ═══════════════════════════════════════════════════════════
  // F.3 SOURCE_SQL — lead_id-keyed end-to-end.
  // ALIGNMENT GUARANTEE (CRIT-v1-A): mig 132 trigger sets permits.lead_id = 'permit:'||permit_num
  //   ||':'||LPAD(revision_num,2,'0'); F.2 lead_analytics permit branch writes IDENTICAL shape;
  //   F.1 writes tf.lead_id = p.lead_id direct passthrough. So `la.lead_key = tf.lead_id` JOIN
  //   is structurally guaranteed-aligned for both branches.
  // ORPHAN DISCRIMINANT (CRIT-v1-F + HIGH-v2-J): ce.lead_id AS ce_lead_id projected for
  //   single-pass orphan detection in stream loop. mig 145 makes cost_estimates.lead_id
  //   NOT NULL + PK, so a NULL here is an unambiguous LEFT JOIN miss (NOT a row-with-null-
  //   payload-columns legitimate case — eliminates F.2-style false-positive class).
  // ═══════════════════════════════════════════════════════════
  const SQL = `
    SELECT
      tf.lead_id,
      tf.permit_num,
      tf.revision_num,
      tf.trade_slug,
      tf.target_window,
      tf.urgency,
      ce.lead_id AS ce_lead_id,
      ce.estimated_cost,
      ce.trade_contract_values,
      ce.is_geometric_override,
      ce.modeled_gfa_sqm,
      COALESCE(la.tracking_count, 0) AS tracking_count,
      COALESCE(la.saving_count, 0) AS saving_count,
      tc.multiplier_bid,
      tc.multiplier_work
    FROM trade_forecasts tf
    LEFT JOIN cost_estimates ce         ON ce.lead_id  = tf.lead_id
    LEFT JOIN lead_analytics la         ON la.lead_key = tf.lead_id
    LEFT JOIN trade_configurations tc   ON tc.trade_slug = tf.trade_slug
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
  // F.3 per-branch counter split (CRIT-v2-B + HIGH-v2-J).
  // CRIT-v2-B: totalRowsOther counts malformed-prefix rows (UNREACHABLE post-mig-134 CHECK
  //   but Spec 47 §11.1 compliance defense — records_total must sum ALL stream rows).
  // MED-v3-D: records_scored uses Permit + Coa only (NOT + Other — malformed are `continue`'d).
  let totalRowsPermit = 0;
  let totalRowsCoa    = 0;
  let totalRowsOther  = 0;
  let nullInputScoresPermit = 0;
  let nullInputScoresCoa    = 0;
  let integrityFlagsPermit  = 0;
  let integrityFlagsCoa     = 0;
  let updatedPermit = 0;     // HIGH-I: accumulated AFTER withTransaction resolves (retry-safe).
  let updatedCoa    = 0;
  let orphanedPermitCost = 0;
  let orphanedCoaCost    = 0;
  let malformedLeadIds   = 0;
  let batchCount = 0;        // LOW-v3-H: explicit declaration.
  let batch = [];

  const orphanedPermitCostSample = [];
  const orphanedCoaCostSample    = [];
  const malformedLeadIdsSample   = [];

  // ─── flushBatch — per-branch dual-UPDATE inside one withTransaction (HIGH-v2-J + HIGH-I) ───
  // Splits the mixed-branch batch into permitBatch + coaBatch and runs 2 separate UPDATEs with
  // INDEPENDENT $1..$3N parameter indices (each loop builds its own vals + params). Both UPDATEs
  // are wrapped in a single withTransaction so the per-batch atomic-write semantic is preserved;
  // any failure rolls back BOTH branches.
  //
  // Counter accumulation (HIGH-I retry safety): pRowCount + cRowCount are locals; module-level
  // updatedPermit + updatedCoa are incremented AFTER withTransaction resolves (commit succeeded).
  //
  // Gemini v3 CRIT-A note (verified mitigated): pipeline.withTransaction propagates errors →
  // transaction rolls back atomically → pipeline.run's error handler emits failed PIPELINE_SUMMARY.
  // No silent data loss; behavior documented in scripts/lib/pipeline.js withTransaction contract.
  const flushBatch = async (currentBatch) => {
    if (currentBatch.length === 0) return;
    const permitBatch = currentBatch.filter((u) => u.branch === 'permit');
    const coaBatch    = currentBatch.filter((u) => u.branch === 'coa');

    let pRowCount = 0;
    let cRowCount = 0;

    await pipeline.withTransaction(pool, async (client) => {
      // Permit branch — own loop with $1..$3N indices starting at $1.
      if (permitBatch.length > 0) {
        const pVals = [];
        const pParams = [];
        for (let j = 0; j < permitBatch.length; j++) {
          const u = permitBatch[j];
          const base = j * 3;
          pVals.push(`($${base + 1}, $${base + 2}, $${base + 3}::int)`);
          pParams.push(u.lead_id, u.trade_slug, u.score);
        }
        const r = await client.query(
          `UPDATE trade_forecasts tf
              SET opportunity_score = v.score
            FROM (VALUES ${pVals.join(', ')}) AS v(lead_id, trade_slug, score)
            WHERE tf.lead_id    = v.lead_id
              AND tf.trade_slug = v.trade_slug
              AND tf.opportunity_score IS DISTINCT FROM v.score`,
          pParams,
        );
        pRowCount = r.rowCount ?? 0;
      }

      // CoA branch — own loop with $1..$3M indices starting at $1 again (independent of permit batch).
      if (coaBatch.length > 0) {
        const cVals = [];
        const cParams = [];
        for (let j = 0; j < coaBatch.length; j++) {
          const u = coaBatch[j];
          const base = j * 3;
          cVals.push(`($${base + 1}, $${base + 2}, $${base + 3}::int)`);
          cParams.push(u.lead_id, u.trade_slug, u.score);
        }
        const r = await client.query(
          `UPDATE trade_forecasts tf
              SET opportunity_score = v.score
            FROM (VALUES ${cVals.join(', ')}) AS v(lead_id, trade_slug, score)
            WHERE tf.lead_id    = v.lead_id
              AND tf.trade_slug = v.trade_slug
              AND tf.opportunity_score IS DISTINCT FROM v.score`,
          cParams,
        );
        cRowCount = r.rowCount ?? 0;
      }
    });

    // HIGH-I: accumulate AFTER withTransaction resolves — retry-safe (commit succeeded).
    updatedPermit += pRowCount;
    updatedCoa    += cRowCount;
  };

  for await (const row of pipeline.streamQuery(pool, SQL, [])) {
    // F.3 branch dispatch (parseBranchFromLeadId — module-scope pure helper).
    const branch = parseBranchFromLeadId(row.lead_id);

    if (branch === 'permit') {
      totalRowsPermit++;
    } else if (branch === 'coa') {
      totalRowsCoa++;
    } else {
      // CRIT-v2-B + MED-M: malformed lead_id (UNREACHABLE post-mig-134 CHECK but defensive).
      // MED-v3-D: NOT added to records_scored — malformed rows are `continue`'d and never scored.
      // Still counted in totalRowsOther for §11.1 records_total arithmetic completeness.
      totalRowsOther++;
      malformedLeadIds++;
      if (malformedLeadIdsSample.length < 20) {
        malformedLeadIdsSample.push(`[malformed] lead_id=${JSON.stringify(row.lead_id)} trade=${row.trade_slug}`);
      }
      continue;
    }

    // CRIT-v1-F + HIGH-v2-J: orphan check via ce.lead_id NOT-NULL guarantee (mig 145).
    //   A NULL ce_lead_id is an unambiguous LEFT JOIN miss (NOT a row-with-null-payload case —
    //   eliminates F.2-style false-positive class). Symmetric across both branches.
    if (row.ce_lead_id == null) {
      if (branch === 'permit') {
        orphanedPermitCost++;
        if (orphanedPermitCostSample.length < 20) {
          orphanedPermitCostSample.push(`[orphan-permit] lead_id=${row.lead_id} trade=${row.trade_slug}`);
        }
      } else {
        orphanedCoaCost++;
        if (orphanedCoaCostSample.length < 20) {
          orphanedCoaCostSample.push(`[orphan-coa] lead_id=${row.lead_id} trade=${row.trade_slug}`);
        }
      }
      // Continue processing — score will be NULL via hasNoCostData; orphan counter is observability-only.
    }

    // Integrity audit runs regardless of cost data availability (spec 81 §3) — now per-branch.
    if (row.tracking_count > 0 && row.modeled_gfa_sqm == null) {
      if (branch === 'permit') integrityFlagsPermit++;
      else                     integrityFlagsCoa++;
    }

    // NULL guard: missing cost data → explicit null, not 0 (spec 81 §3 WF1 April 2026).
    // score = null means "no cost data". score = 0 means "real value, fully competed".
    //
    // WF3 2026-05-08 — realtor carve-out (Spec 81 §3 + Spec 91 §3.5):
    // Realtors don't bid on a trade contract — they prospect for listings and
    // care about whether the home will be sold. The cost slicer doesn't
    // allocate to realtor (no key in trade_contract_values), so realtor uses
    // the TOTAL `estimated_cost` as its financial base. Branches on
    // trade_slug — Spec 95 §2.5.1 explicitly forbids branching on the persona
    // axis (the test below regression-locks zero references to that field).
    const tradeValues = row.trade_contract_values;
    const isRealtor = row.trade_slug === REALTOR_TRADE_SLUG;
    const hasNoCostData = row.estimated_cost == null
      || (!isRealtor && (!tradeValues || Object.keys(tradeValues).length === 0));

    let score;
    if (hasNoCostData) {
      score = null;
      if (branch === 'permit') nullInputScoresPermit++;
      else                     nullInputScoresCoa++;
    } else {
      const tradeValue = isRealtor
        ? row.estimated_cost
        : (tradeValues[row.trade_slug] ?? 0);

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

    // F.3 queue tagged with branch — flushBatch partitions on this for per-branch UPDATE.
    batch.push({
      lead_id: row.lead_id,
      trade_slug: row.trade_slug,
      score,
      branch,
    });

    // Flush full batch immediately — keeps heap at O(BATCH_SIZE), not O(total rows)
    if (batch.length >= BATCH_SIZE) {
      await flushBatch(batch);
      batch = [];
      batchCount++;
      // spec §8.5: progress log every 50 batches for long-running streams.
      // Gemini LOW v3: "scored / processed" — clarifies that malformed (totalRowsOther) are
      //   processed but NOT scored.
      if (batchCount % 50 === 0) {
        const scored = totalRowsPermit + totalRowsCoa;
        const processed = scored + totalRowsOther;
        pipeline.log.info(
          '[opportunity-scores]',
          `Progress: ${scored.toLocaleString()} rows scored / ${processed.toLocaleString()} processed, ${updatedPermit + updatedCoa} updated (batch ${batchCount})`,
        );
      }
    }
  }

  // Flush any remaining rows after the stream closes
  await flushBatch(batch);
  batch = [];

  pipeline.log.info('[opportunity-scores]', `Rows scored: ${totalRowsPermit + totalRowsCoa} (permit=${totalRowsPermit}, coa=${totalRowsCoa}, other=${totalRowsOther})`);
  pipeline.log.info('[opportunity-scores]', `Updated ${updatedPermit + updatedCoa} scores (permit=${updatedPermit}, coa=${updatedCoa})`);

  // HIGH-v3-C + Obs F2: pre-existing integrity_flags log site now INFO during quiet, WARN after —
  //   never silent. Matches the WARN-log gating applied to probe + orphan log sites below.
  const totalIntegrityFlags = integrityFlagsPermit + integrityFlagsCoa;
  if (totalIntegrityFlags > 0) {
    const msg = `Integrity audit: ${totalIntegrityFlags} tracked leads have no modeled_gfa_sqm (permit=${integrityFlagsPermit}, coa=${integrityFlagsCoa})`;
    if (inQuietPeriod) pipeline.log.info('[opportunity-scores]', msg);
    else               pipeline.log.warn('[opportunity-scores]', msg);
  }

  // ═══════════════════════════════════════════════════════════
  // F.3 CRIT-A defensive integrity probe — EXISTS+sample form (HIGH-v2-H avoids unbounded scan).
  // Symmetric across permit + CoA branches per HIGH-v2-J extension. Detects upstream lead_key
  // format drift (e.g., F.2's UNION-write logic regression). CRIT-v2-E: positioned INSIDE
  // withAdvisoryLock callback, AFTER final flushBatch, BEFORE emitSummary.
  // HIGH-v3-C: log INFO during inQuietPeriod / WARN after — never silent.
  // ═══════════════════════════════════════════════════════════
  let permitDriftSampleCount = 0;
  let coaDriftSampleCount = 0;
  let permitDriftSampleCapped = false;
  let coaDriftSampleCapped = false;

  const probeBranches = [
    { branch: 'permit', filter: "tf.lead_id LIKE 'permit:%'" },
    { branch: 'coa',    filter: "tf.lead_id LIKE 'coa:%'" },
  ];

  for (const { branch: probeBranch, filter } of probeBranches) {
    const { rows: [existsRow] } = await pool.query(`
      SELECT EXISTS(
        SELECT 1
          FROM trade_forecasts tf
          LEFT JOIN lead_analytics la ON la.lead_key = tf.lead_id
         WHERE ${filter}
           AND (tf.urgency IS NULL OR tf.urgency <> 'expired')
           AND la.lead_key IS NULL
         LIMIT 1
      ) AS has_drift
    `);

    if (existsRow.has_drift) {
      const { rows: [countRow] } = await pool.query(`
        SELECT COUNT(*)::int AS drift_sample_count
          FROM (
            SELECT 1
              FROM trade_forecasts tf
              LEFT JOIN lead_analytics la ON la.lead_key = tf.lead_id
             WHERE ${filter}
               AND (tf.urgency IS NULL OR tf.urgency <> 'expired')
               AND la.lead_key IS NULL
             LIMIT 50
          ) AS bounded
      `);
      if (probeBranch === 'permit') {
        permitDriftSampleCount = countRow.drift_sample_count;
        permitDriftSampleCapped = permitDriftSampleCount === 50;
      } else {
        coaDriftSampleCount = countRow.drift_sample_count;
        coaDriftSampleCapped = coaDriftSampleCount === 50;
      }
      // Gemini NIT: "at least N (sample capped at 50)" — explicit truncation indicator.
      const msg = `CRIT-A integrity probe: ${probeBranch} forecasts have at least ${countRow.drift_sample_count} rows with no matching lead_analytics row (sample capped at 50; possible upstream format drift)`;
      if (inQuietPeriod) pipeline.log.info('[opportunity-scores]', msg);
      else               pipeline.log.warn('[opportunity-scores]', msg);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // F.3 score-tier distribution — per-branch 3-way CASE (MED-L). Aggregate `score_distribution`
  // also retained for back-compat. score_distribution_other captures malformed-prefix rows
  // (expected empty post-mig-134 CHECK).
  // ═══════════════════════════════════════════════════════════
  const { rows: dist } = await pool.query(`
    SELECT
      CASE
        WHEN lead_id LIKE 'coa:%'    THEN 'coa'
        WHEN lead_id LIKE 'permit:%' THEN 'permit'
        ELSE 'other'
      END AS branch,
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
    GROUP BY 1, 2
  `, [vars.score_tier_elite, vars.score_tier_strong, vars.score_tier_moderate]);

  const scoreDistPermit = {};
  const scoreDistCoa = {};
  const scoreDistOther = {};
  const scoreDistAggregate = {};
  for (const r of dist) {
    const target = r.branch === 'permit' ? scoreDistPermit
                 : r.branch === 'coa'    ? scoreDistCoa
                 : scoreDistOther;
    target[r.tier] = r.n;
    scoreDistAggregate[r.tier] = (scoreDistAggregate[r.tier] ?? 0) + r.n;
  }

  // ═══════════════════════════════════════════════════════════
  // F.3 post-UPDATE audit — per-branch + legacy dual-emit (CRIT-B + MED-P).
  // Single query returns per-branch row counts + legacy COUNT(DISTINCT permit_num).
  // ═══════════════════════════════════════════════════════════
  const { rows: auditRows } = await pool.query(`
    SELECT
      CASE
        WHEN lead_id LIKE 'coa:%'    THEN 'coa'
        WHEN lead_id LIKE 'permit:%' THEN 'permit'
        ELSE 'other'
      END AS branch,
      SUM(CASE WHEN opportunity_score IS NULL THEN 1 ELSE 0 END)::int                  AS null_scores,
      SUM(CASE WHEN opportunity_score NOT BETWEEN 0 AND 100 THEN 1 ELSE 0 END)::int    AS out_of_range,
      COUNT(*)::int                                                                     AS forecasts_in_scope,
      COUNT(DISTINCT permit_num) FILTER (WHERE permit_num IS NOT NULL)::int             AS distinct_permits_in_scope
    FROM trade_forecasts
    WHERE (urgency IS NULL OR urgency <> 'expired')
    GROUP BY 1
  `);

  let nullScoresAggregate = 0;
  let outOfRangeAggregate = 0;
  let permitsInScopeLegacy = 0;
  let forecastsInScopePermit = 0;
  let forecastsInScopeCoa = 0;
  for (const r of auditRows) {
    nullScoresAggregate += r.null_scores;
    outOfRangeAggregate += r.out_of_range;
    if (r.branch === 'permit') {
      permitsInScopeLegacy = r.distinct_permits_in_scope;
      forecastsInScopePermit = r.forecasts_in_scope;
    } else if (r.branch === 'coa') {
      forecastsInScopeCoa = r.forecasts_in_scope;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // F.3 audit_table.rows — 17 rows = 7 preserved + 10 new.
  // MED-v3-D: records_scored uses Permit + Coa only (NOT + Other — malformed are never scored).
  // MED-v3-H: null_input_rate kept AGGREGATE intentionally (pre-existing semantic; per-branch is scope creep).
  // HIGH-v2-N + HIGH-v3-N: total_rows_coa threshold === 0; WARN status when value===0 AND !inQuietPeriod.
  // HIGH-v3-H: 5 WARN-gated metrics (`coa_orphaned_cost_count`, `permit_orphaned_cost_count`,
  //   `lead_analytics_unmatched_permit_count`, `lead_analytics_unmatched_coa_count`, `total_rows_coa`)
  //   gated on !inQuietPeriod (30-day per F.1 precedent — operator-tunable threshold pattern).
  // MED-v3-G: malformed_lead_ids WARN immediately (NOT quiet-gated — mig-139 makes it corruption-class).
  // ═══════════════════════════════════════════════════════════
  const recordsScored = totalRowsPermit + totalRowsCoa;
  const recordsUpdated = updatedPermit + updatedCoa;
  const recordsUnchanged = recordsScored - recordsUpdated;
  const auditTableRows = [
    // Preserved (7)
    { metric: 'records_scored',                          value: recordsScored,                threshold: null, status: 'INFO' },
    { metric: 'permits_in_scope_legacy_distinct_count',  value: permitsInScopeLegacy,         threshold: null, status: 'INFO' },
    { metric: 'records_unchanged',                       value: recordsUnchanged,             threshold: null, status: 'INFO' },
    { metric: 'null_input_rate',                         value: totalIntegrityFlags,          threshold: 0,    status: totalIntegrityFlags > 0 ? 'WARN' : 'PASS' },
    { metric: 'null_scores',                             value: nullScoresAggregate,          threshold: null, status: 'INFO' },
    { metric: 'null_input_scores',                       value: nullInputScoresPermit + nullInputScoresCoa, threshold: null, status: 'INFO' },
    { metric: 'out_of_range',                            value: outOfRangeAggregate,          threshold: 0,    status: outOfRangeAggregate > 0 ? 'FAIL' : 'PASS' },
    // New (10) — F.3 per-branch observability + baseline-quiet-period gates
    { metric: 'forecasts_in_scope_permit',               value: forecastsInScopePermit,       threshold: null, status: 'INFO' },
    { metric: 'forecasts_in_scope_coa',                  value: forecastsInScopeCoa,          threshold: null, status: 'INFO' },
    { metric: 'total_rows_coa',                          value: totalRowsCoa,                 threshold: '=== 0 (post-quiet)',
      status: inQuietPeriod ? 'INFO' : (totalRowsCoa === 0 ? 'WARN' : 'INFO') },
    { metric: 'coa_orphaned_cost_count',                 value: orphanedCoaCost,              threshold: '> 0',
      status: inQuietPeriod ? 'INFO' : (orphanedCoaCost > 0 ? 'WARN' : 'PASS') },
    { metric: 'permit_orphaned_cost_count',              value: orphanedPermitCost,           threshold: '> 0',
      status: inQuietPeriod ? 'INFO' : (orphanedPermitCost > 0 ? 'WARN' : 'PASS') },
    { metric: 'lead_analytics_unmatched_permit_count',   value: permitDriftSampleCount,       threshold: '> 0',
      status: inQuietPeriod ? 'INFO' : (permitDriftSampleCount > 0 ? 'WARN' : 'PASS') },
    { metric: 'lead_analytics_unmatched_coa_count',      value: coaDriftSampleCount,          threshold: '> 0',
      status: inQuietPeriod ? 'INFO' : (coaDriftSampleCount > 0 ? 'WARN' : 'PASS') },
    { metric: 'coa_first_deploy_grace',                  value: coaFirstDeployGrace ? 1 : 0,  threshold: null, status: 'INFO' },
    { metric: 'in_quiet_period',                         value: inQuietPeriod ? 1 : 0,        threshold: null, status: 'INFO' },
    { metric: 'malformed_lead_ids',                      value: malformedLeadIds,             threshold: '> 0',
      status: malformedLeadIds > 0 ? 'WARN' : 'PASS' },   // MED-v3-G: NOT quiet-gated — corruption-class.
  ];
  const auditVerdict =
    auditTableRows.some((r) => r.status === 'FAIL') ? 'FAIL' :
    auditTableRows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';

  // ═══════════════════════════════════════════════════════════
  // F.3 failed_sample — proportional cap (MED-v3-F: slice(0,7) per type before final slice(0,20))
  // ═══════════════════════════════════════════════════════════
  const allFailedSamples = [
    ...orphanedPermitCostSample.slice(0, 7),
    ...orphanedCoaCostSample.slice(0, 7),
    ...malformedLeadIdsSample.slice(0, 6),
  ].slice(0, 20);
  const failedSample = allFailedSamples.length > 0 ? allFailedSamples : undefined;

  pipeline.emitSummary({
    // CRIT-v2-B: records_total = ALL stream rows (Permit + Coa + Other) per Spec 47 §11.1.
    records_total: totalRowsPermit + totalRowsCoa + totalRowsOther,
    records_new: 0,
    // MED-v3-D: records_updated = ACTUAL write counts (malformed rows were `continue`'d).
    records_updated: recordsUpdated,
    ...(failedSample && { failed_sample: failedSample }),
    records_meta: {
      // F.3-new (16 entries) per CRIT-v3-Z recount
      total_rows_permit:                            totalRowsPermit,
      total_rows_coa:                               totalRowsCoa,
      total_rows_other:                             totalRowsOther,
      records_updated_permit:                       updatedPermit,
      records_updated_coa:                          updatedCoa,
      null_input_scores_permit:                     nullInputScoresPermit,
      null_input_scores_coa:                        nullInputScoresCoa,
      integrity_flags_permit:                       integrityFlagsPermit,
      integrity_flags_coa:                          integrityFlagsCoa,
      score_distribution_permit:                    scoreDistPermit,
      score_distribution_coa:                       scoreDistCoa,
      score_distribution_other:                     scoreDistOther,
      coa_orphaned_cost_sample_capped:              orphanedCoaCost > 20,
      permit_orphaned_cost_sample_capped:           orphanedPermitCost > 20,
      lead_analytics_unmatched_permit_sample_capped: permitDriftSampleCapped,
      lead_analytics_unmatched_coa_sample_capped:    coaDriftSampleCapped,
      // Preserved from skeleton (4 entries — mirrors audit rows for operator visibility +
      //   aggregate score_distribution retained for back-compat with pre-F.3 consumers).
      coa_first_deploy_grace: coaFirstDeployGrace,
      in_quiet_period:        inQuietPeriod,
      run_at:                 RUN_AT,
      score_distribution:     scoreDistAggregate,
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
      // F.3 lead_id rekey — read columns updated. NOTE: opportunity_score is read by the post-UPDATE
      //   audit query for null_scores + out_of_range, but per pre-existing convention reads list
      //   declares ONLY streaming-join columns (MED-v2-S documented exception).
      trade_forecasts: ['lead_id', 'permit_num', 'revision_num', 'trade_slug', 'target_window', 'urgency'],
      cost_estimates: ['lead_id', 'estimated_cost', 'trade_contract_values', 'is_geometric_override', 'modeled_gfa_sqm'],
      lead_analytics: ['lead_key', 'tracking_count', 'saving_count'],
      trade_configurations: ['trade_slug', 'multiplier_bid', 'multiplier_work'],
      pipeline_runs: ['pipeline', 'started_at'],
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
