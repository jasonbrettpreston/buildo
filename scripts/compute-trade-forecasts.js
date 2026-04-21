#!/usr/bin/env node
/**
 * Compute Trade Forecasts — the Flight Tracker (Phase 4).
 *
 * Generates per-permit, per-trade predicted start dates and urgency
 * statuses. Marries the phase_started_at anchor (Phase 2) with the
 * phase_calibration medians (Phase 3) and TRADE_TARGET_PHASE mapping
 * to produce rows in trade_forecasts that the lead feed JOINs on.
 *
 * SPEC LINK: docs/specs/pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/product/future/85_trade_forecast_engine.md §6
 */
'use strict';

const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const {
  TRADE_TARGET_PHASE: TRADE_TARGET_PHASE_FALLBACK,
  PHASE_ORDINAL,
  SKIP_PHASES_SQL,
} = require('./lib/lifecycle-phase');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');

// PHASE_ORDINAL imported from shared lib. TRADE_TARGET_PHASE loaded from
// trade_configurations at runtime via shared config loader. Falls back to
// the hardcoded shared lib if the DB query fails.
let TRADE_TARGET_PHASE = TRADE_TARGET_PHASE_FALLBACK;

// Phases that should NOT produce trade forecasts.
// WF3-04 (H-W14 / 84-W10): O4 removed — phantom phase, no classifier produces it.
const SKIP_PHASES = new Set([
  'P19', 'P20',        // terminal
  'O1', 'O2', 'O3',    // orphan
]);

// SKIP_PHASES_SQL imported from scripts/lib/lifecycle-phase.js — single source of truth.
// Structural constant (spec 47 §4.1): enum vocabulary, not an operator-tunable value.

// Pre-construction phases use ISSUED calibration instead of phase-to-phase.
// P18 is intentionally NOT here — it means "construction active with at
// least one passed inspection." P18 permits should use the phase-to-phase
// fallback hierarchy (P18→target misses → ISSUED fallback naturally).
// Putting P18 here forced ISSUED calibration with issued_date anchors,
// making virtually every P18 forecast "overdue." See adversarial Probe 2.
const PRE_CONSTRUCTION_PHASES = new Set([
  'P1', 'P2',               // pre-permit (application received, CoA)
  'P3', 'P4', 'P5', 'P6',  // pre-issuance
  'P7a', 'P7b', 'P7c', 'P7d', // issued, pre-construction
  'P8',                      // revised
]);

// 13 params per row: permit_num, revision_num, trade_slug, predicted_start,
// confidence, urgency, target_window, calibration_method, sample_size,
// median_days, p25_days, p75_days, computed_at (§47 §6.1 runAt snapshot)
const FORECAST_BATCH_SIZE = pipeline.maxRowsPerInsert(13); // Math.floor(65535 / 13) = 5041

// spec 47 §4 + spec 85 §6 item 4 — fail fast before any math runs.
// These are the only logicVars consumed downstream; a NaN would silently
// corrupt predictedStart (setUTCDate) and urgency classification.
// z.coerce.number() instead of z.number(): pg returns DECIMAL/NUMERIC columns as
// strings to prevent float64 precision loss. z.number() rejects strings. Sibling
// fix alongside compute-opportunity-scores.js (same schema pattern, same risk).
const LOGIC_VARS_SCHEMA = z.object({
  stall_penalty_precon:               z.coerce.number().finite().min(0),
  stall_penalty_active:               z.coerce.number().finite().min(0),
  expired_threshold_days:             z.coerce.number().finite(),
  urgency_overdue_days:               z.coerce.number().finite().positive(),
  urgency_upcoming_days:              z.coerce.number().finite().positive(),
  snowplow_buffer_days:               z.coerce.number().finite().positive(),
  calibration_default_median_days:    z.coerce.number().finite().positive(),
  calibration_default_p25_days:       z.coerce.number().finite().positive(),
  calibration_default_p75_days:       z.coerce.number().finite().positive(),
}).passthrough();

// Urgency classification — no isStalled parameter.
//
// Stall handling is now done BEFORE this function via the "Instant
// Stall Recalibration" math that pushes predictedStart forward by a
// penalty buffer. The urgency function receives the adjusted daysUntil
// and classifies based on the recalibrated date. The frontend reads
// lifecycle_stalled directly from the permits table JOIN, not from
// trade_forecasts.
//
// Precedence: expired FIRST (threshold days past = dead data regardless
// of whether the permit physically passed the target). Then isPastTarget
// (recent overdue = active signal). This ensures 5-year-old permits
// that passed P12 get buried as expired, not stuck as overdue forever.
//
// WF3 2026-04-13: `expiredThreshold` is now loaded from logic_variables
// (expired_threshold_days, seeded as -90). Previously hardcoded.
// WF3-05 (H-W13): `imminentWindow` is loaded per-trade from
// trade_configurations.imminent_window_days (spec 85 / spec 82 §6).
// Default 14 is a safety net only — callers should always pass the
// per-trade value.
function classifyUrgency(daysUntil, isPastTarget, expiredThreshold, imminentWindow = 14, overdueWindow = 30, upcomingWindow = 30) {
  // 1. THE GRAVEYARD FIX — must be first. If it's past the expired
  // threshold, it's dead data. We don't care if it's also past the
  // target phase — both cases are dead.
  // Normalize: DB stores -90 but callers may pass either sign; coerce
  // to the negative form so we always compare daysUntil against a
  // negative threshold.
  const threshold = -Math.abs(expiredThreshold);
  if (daysUntil <= threshold) return 'expired';

  // 2. Physically passed the target phase but within threshold → active
  // signal. Builder may still urgently need this trade.
  if (isPastTarget) return 'overdue';

  // 3. Actionable tracking
  if (daysUntil <= -overdueWindow) return 'overdue';
  if (daysUntil <= 0) return 'delayed';
  if (daysUntil <= imminentWindow) return 'imminent';
  if (daysUntil <= upcomingWindow) return 'upcoming';
  return 'on_time';
}

function classifyConfidence(sampleSize, isFallback) {
  if (isFallback || sampleSize === 0) return 'low';
  if (sampleSize >= 30) return 'high';
  if (sampleSize >= 10) return 'medium';
  return 'low';
}

// WF3-03 (H-W1): lock ID = spec number convention.
const ADVISORY_LOCK_ID = 85;

pipeline.run('compute-trade-forecasts', async (pool) => {
  // spec 47 §4.3 startup guard: SKIP_PHASES is a structural constant but we verify
  // it's non-empty so an accidental Set clear never makes the NOT IN vacuously-true.
  if (SKIP_PHASES.size === 0) {
    throw new Error('[compute-trade-forecasts] SKIP_PHASES is empty — refusing to run (vacuously-true NOT IN guard)');
  }

  // ─── Concurrency guard — pipeline.withAdvisoryLock (Phase 2 migration) ───
  // Replaces hand-rolled lockClient + SIGTERM boilerplate. Helper handles:
  // dedicated pool.connect() client, advisory lock acquire/release,
  // SIGTERM/SIGINT trap, double-cleanup guard, and spec-mandated SKIP emit.
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
  // ─── Load Control Panel via shared loader ──────────────────
  const { tradeConfigs, logicVars } = await loadMarketplaceConfigs(pool, 'trade-forecasts');

  // Fail fast if any required variable is missing, zero, or non-finite.
  // Prevents NaN propagation into setUTCDate (stall penalties) and
  // urgency classification (expired_threshold_days).
  const validation = validateLogicVars(logicVars, LOGIC_VARS_SCHEMA, 'trade-forecasts');
  if (!validation.valid) {
    throw new Error(`logicVars validation failed: ${validation.errors.join('; ')}`);
  }
  const defaultMedianDays = logicVars.calibration_default_median_days;
  const defaultP25Days    = logicVars.calibration_default_p25_days;
  const defaultP75Days    = logicVars.calibration_default_p75_days;

  // Build TRADE_TARGET_PHASE from loaded trade configs
  TRADE_TARGET_PHASE = Object.fromEntries(
    Object.entries(tradeConfigs).map(([slug, tc]) => [slug, {
      bid_phase: tc.bid_phase_cutoff,
      work_phase: tc.work_phase_target,
    }]),
  );
  const undefinedPhaseCount = Object.values(TRADE_TARGET_PHASE)
    .filter(v => v.bid_phase == null || v.work_phase == null).length;
  if (undefinedPhaseCount > 0) {
    pipeline.log.warn('[trade-forecasts]',
      `${undefinedPhaseCount} trades have missing phase targets — fell back to lifecycle-phase.js constants`);
  }

  // §47 §6.1 — DB clock, captured once; bound to every computed_at write.
  // Also derive today as UTC midnight from the same DB clock so phase/urgency
  // comparisons are consistent for the entire run (no Midnight Cross drift).
  const { rows: [{ run_at: runAt, today }] } = await pool.query(
    `SELECT NOW() AS run_at,
            DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')::timestamptz AS today`,
  );

  // ═══════════════════════════════════════════════════════════
  // Step 1: Load calibration data into nested Map
  // ═══════════════════════════════════════════════════════════
  pipeline.log.info('[trade-forecasts]', 'Loading calibration data...');
  const { rows: calRows } = await pool.query(
    'SELECT from_phase, to_phase, permit_type, median_days, p25_days, p75_days, sample_size FROM phase_calibration',
  );

  // Map<from_phase, Map<to_phase, Map<permit_type|'__ALL__', calibration>>>
  const calMap = new Map();
  for (const row of calRows) {
    const key1 = row.from_phase;
    const key2 = row.to_phase;
    const key3 = row.permit_type || '__ALL__';
    if (!calMap.has(key1)) calMap.set(key1, new Map());
    const m2 = calMap.get(key1);
    if (!m2.has(key2)) m2.set(key2, new Map());
    m2.get(key2).set(key3, {
      median: row.median_days,
      p25: row.p25_days,
      p75: row.p75_days,
      sample: row.sample_size,
    });
  }
  pipeline.log.info('[trade-forecasts]', `Calibration loaded: ${calRows.length} entries`);

  // Calibration lookup with 4-level fallback
  function lookupCalibration(fromPhase, toPhase, permitType) {
    // Level 1: exact (fromPhase, toPhase, permitType)
    const l1 = calMap.get(fromPhase)?.get(toPhase)?.get(permitType);
    if (l1) return { ...l1, method: 'exact' };

    // Level 2: (fromPhase, toPhase, all types)
    const l2 = calMap.get(fromPhase)?.get(toPhase)?.get('__ALL__');
    if (l2) return { ...l2, method: 'fallback_all_types' };

    // Level 3: (ISSUED, toPhase, permitType)
    const l3 = calMap.get('ISSUED')?.get(toPhase)?.get(permitType);
    if (l3) return { ...l3, method: 'fallback_issued_type' };

    // Level 4: (ISSUED, toPhase, all types)
    const l4 = calMap.get('ISSUED')?.get(toPhase)?.get('__ALL__');
    if (l4) return { ...l4, method: 'fallback_issued_all' };

    // Level 5: default (from logicVars)
    return { median: defaultMedianDays, p25: defaultP25Days, p75: defaultP75Days, sample: 0, method: 'default' };
  }

  // ═══════════════════════════════════════════════════════════
  // Step 2: Stale-purge + pre-count folded into first UPSERT batch
  //
  // §7.3: DELETE + UPSERT must share the same withTransaction so a
  // crash between commits cannot leave trade_forecasts empty.
  // purgeExecuted gates the purge to the first flushForecastBatch call.
  // ═══════════════════════════════════════════════════════════
  let stalePurged = 0;
  let gracePurged = 0;
  let preRowCount = 0;

  // ═══════════════════════════════════════════════════════════
  // Step 3: Stream permit-trade pairs + compute + per-batch flush
  //
  // WF3-12: Replaced pool.query accumulator with pipeline.streamQuery.
  // The old pattern loaded ~183K permit-trade rows into permitTradeRows
  // then built a second unbounded forecasts[] array — O(N) heap for both.
  // Now: rows stream through a for-await loop, forecasts flush per-batch
  // into their own withTransaction. Heap holds at most O(BATCH_SIZE).
  //
  // Per-batch commit trade-off: a crash mid-stream leaves some rows with
  // the new forecast and others with the previous run's values. Acceptable
  // because: (1) the script is the sole writer to trade_forecasts (advisory
  // lock 85 prevents concurrent runs), and (2) re-running the script
  // converges — ON CONFLICT DO UPDATE is idempotent.
  // ═══════════════════════════════════════════════════════════
  const SOURCE_SQL = `
    WITH last_passed AS (
      SELECT permit_num, MAX(inspection_date)::timestamptz AS last_passed_inspection_date
        FROM permit_inspections
       WHERE status = 'Passed'
       GROUP BY permit_num
    )
    SELECT p.permit_num, p.revision_num, t.slug AS trade_slug,
           p.lifecycle_phase, p.phase_started_at, p.permit_type,
           p.lifecycle_stalled, p.issued_date, p.application_date,
           lp.last_passed_inspection_date
      FROM permit_trades pt
      JOIN trades t ON t.id = pt.trade_id
      JOIN permits p ON p.permit_num = pt.permit_num
                    AND p.revision_num = pt.revision_num
      LEFT JOIN last_passed lp ON lp.permit_num = p.permit_num
     WHERE pt.is_active = true
       AND p.lifecycle_phase IS NOT NULL
       AND (
         (
           p.lifecycle_phase IN ('P1','P2')
           AND p.application_date IS NOT NULL
           AND p.application_date >= NOW() - INTERVAL '18 months'
         )
         OR (
           p.lifecycle_phase NOT IN ${SKIP_PHASES_SQL}
           AND p.lifecycle_phase NOT IN ('P1','P2')
           AND COALESCE(p.phase_started_at, p.issued_date::timestamptz) >= NOW() - INTERVAL '3 years'
         )
       )
  `;

  let totalRows = 0;
  let skipped = 0;
  let unmappedTrades = 0;
  let upserted = 0;
  let anchorFallbackCount = 0;
  let snowplowCount = 0;
  let batch = [];
  let batchCount = 0;
  let purgeExecuted = false;

  const flushForecastBatch = async (currentBatch) => {
    const shouldPurge = !purgeExecuted;
    const hasRows = currentBatch.length > 0;
    if (!shouldPurge && !hasRows) return;
    await pipeline.withTransaction(pool, async (client) => {
      if (shouldPurge) {
        // §8.1: capture preRowCount BEFORE any mutating DELETEs so telemetry
        // reflects the true baseline, not the post-purge state.
        const { rows: preCount } = await client.query(
          'SELECT COUNT(*)::int AS n FROM trade_forecasts',
        );
        preRowCount = preCount[0].n;

        // F1 Grace-Purge: remove expired forecasts older than 180 days.
        // The snowplow is dead code for expired rows — all expired rows have a real
        // phase anchor (anchorIsFallback is always false), so no snapping occurs.
        // Without this purge, expired rows accumulate indefinitely. The 180-day
        // window keeps ~6 months of recently-expired leads visible while shedding
        // true zombie data. Uses runAt for run-clock consistency.
        const graceResult = await client.query(
          `DELETE FROM trade_forecasts
            WHERE urgency = 'expired'
              AND predicted_start < $1::timestamptz - INTERVAL '180 days'`,
          [runAt],
        );
        gracePurged = graceResult.rowCount || 0;
        if (gracePurged > 0) {
          pipeline.log.info(
            '[trade-forecasts]',
            `Grace-purged ${gracePurged.toLocaleString()} expired forecasts older than 180 days`,
          );
        }

        const { rows: staleRows } = await client.query(
          `DELETE FROM trade_forecasts tf
            WHERE NOT EXISTS (
              SELECT 1 FROM permit_trades pt
                JOIN permits p ON p.permit_num = pt.permit_num
                              AND p.revision_num = pt.revision_num
                JOIN trades t ON t.id = pt.trade_id
               WHERE pt.permit_num = tf.permit_num
                 AND pt.revision_num = tf.revision_num
                 AND t.slug = tf.trade_slug
                 AND pt.is_active = true
                 AND p.lifecycle_phase IS NOT NULL
                 AND (
                   (
                     p.lifecycle_phase IN ('P1','P2')
                     AND p.application_date IS NOT NULL
                     AND p.application_date >= NOW() - INTERVAL '18 months'
                   )
                   OR (
                     p.lifecycle_phase NOT IN ${SKIP_PHASES_SQL}
                     AND p.lifecycle_phase NOT IN ('P1','P2')
                     AND COALESCE(p.phase_started_at, p.issued_date::timestamptz) >= NOW() - INTERVAL '3 years'
                   )
                 )
            )
          RETURNING 1`,
        );
        stalePurged = staleRows.length;
        if (stalePurged > 0) {
          pipeline.log.info(
            '[trade-forecasts]',
            `Purged ${stalePurged.toLocaleString()} stale forecasts for terminal/orphan/dead permits`,
          );
        }
      }
      if (!hasRows) return;
      const vals = [];
      const params = [];
      for (let j = 0; j < currentBatch.length; j++) {
        const f = currentBatch[j];
        const base = j * 13;
        vals.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::date, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}::int, $${base + 10}::int, $${base + 11}::int, $${base + 12}::int, $${base + 13}::timestamptz)`,
        );
        params.push(
          f.permit_num, f.revision_num, f.trade_slug,
          f.predicted_start, f.confidence, f.urgency,
          f.target_window, f.calibration_method, f.sample_size,
          f.median_days, f.p25_days, f.p75_days,
          runAt, // §47 §6.1 — same timestamp for every row in this run
        );
      }
      const insertResult = await client.query(
        `INSERT INTO trade_forecasts
           (permit_num, revision_num, trade_slug, predicted_start,
            confidence, urgency, target_window, calibration_method,
            sample_size, median_days, p25_days, p75_days, computed_at)
         VALUES ${vals.join(', ')}
         ON CONFLICT (permit_num, revision_num, trade_slug)
         DO UPDATE SET
           predicted_start = EXCLUDED.predicted_start,
           confidence = EXCLUDED.confidence,
           urgency = EXCLUDED.urgency,
           target_window = EXCLUDED.target_window,
           calibration_method = EXCLUDED.calibration_method,
           sample_size = EXCLUDED.sample_size,
           median_days = EXCLUDED.median_days,
           p25_days = EXCLUDED.p25_days,
           p75_days = EXCLUDED.p75_days,
           computed_at = EXCLUDED.computed_at`,
        params,
      );
      // §47 §6.3: use actual rowCount, not batch size. ON CONFLICT DO UPDATE
      // returns rowCount for both INSERTs and UPDATEs; rows skipped by IS DISTINCT FROM
      // guards elsewhere would return 0. Counting batch size was over-reporting.
      upserted += insertResult.rowCount || 0;
    });
    // Set purgeExecuted only after the transaction commits successfully.
    // If the transaction rolls back, the flag stays false so the next
    // flushForecastBatch call will retry the purge.
    if (shouldPurge) purgeExecuted = true;
  };

  pipeline.log.info('[trade-forecasts]', 'Streaming active permit-trade pairs...');
  for await (const row of pipeline.streamQuery(pool, SOURCE_SQL, [])) {
    totalRows++;
    const {
      permit_num, revision_num, trade_slug,
      lifecycle_phase, phase_started_at, permit_type,
      lifecycle_stalled, last_passed_inspection_date,
      issued_date, application_date,
    } = row;

    // Fallback Anchor Hierarchy (spec 85 §3): phase_started_at → last passed
    // inspection → issued_date → application_date. Stamps 'fallback_issued'
    // on calibration_method when a fallback is used.
    const effectiveAnchor = phase_started_at
      || last_passed_inspection_date
      || (issued_date ? new Date(issued_date + 'T00:00:00Z') : null)
      || (application_date ? new Date(application_date + 'T00:00:00Z') : null);

    if (!effectiveAnchor) { skipped++; continue; }

    const anchorIsFallback = !phase_started_at;

    // Look up bimodal targets for this trade
    const targets = TRADE_TARGET_PHASE[trade_slug];
    if (!targets) {
      unmappedTrades++;
      continue;
    }

    // Count fallback anchor usage only for rows that will produce a forecast
    if (anchorIsFallback) anchorFallbackCount++;

    const currentOrdinal = PHASE_ORDINAL[lifecycle_phase];
    const bidOrdinal = PHASE_ORDINAL[targets.bid_phase];

    // ── BIMODAL ROUTING ─────────────────────────────────────────
    // Target the bid_phase if we haven't reached it yet (the
    // "get on the shortlist" window). Once the permit passes the
    // bid_phase, shift to work_phase (the "Rescue Mission" — the
    // trade is physically needed on-site soon).
    //
    // This is the self-healing core: an HVAC permit issued 2 years
    // ago burned through bid_phase → expired. But if that permit
    // gets a "Framing Passed" inspection tomorrow, it shifts to
    // work_phase (P12). The calibration recalculates from the new
    // phase anchor, daysUntil becomes positive, and the lead
    // resurrects from expired → upcoming/imminent.
    let targetPhase;
    let targetWindow;
    if (currentOrdinal != null && bidOrdinal != null && currentOrdinal <= bidOrdinal) {
      targetPhase = targets.bid_phase;
      targetWindow = 'bid';
    } else {
      targetPhase = targets.work_phase;
      targetWindow = 'work';
    }

    const targetOrdinal = PHASE_ORDINAL[targetPhase];

    // isPastTarget only applies when targeting work_phase. For bid_phase
    // targeting: being AT the bid phase means the window is OPEN, not
    // closed. Without this guard, a P3 permit targeting bid_phase P3
    // gets isPastTarget=true (ordinal -6 >= -6) → urgency="overdue",
    // contradicting the `<=` fix that keeps the bid window open.
    // Adversarial WF3 Defect 1.
    const isPastTarget = targetPhase === targets.work_phase
      && currentOrdinal != null && targetOrdinal != null
      && currentOrdinal >= targetOrdinal;

    // Determine calibration lookup key
    const fromPhase = PRE_CONSTRUCTION_PHASES.has(lifecycle_phase)
      ? 'ISSUED'
      : lifecycle_phase;

    const cal = lookupCalibration(fromPhase, targetPhase, permit_type);

    // Compute predicted start date — all math in UTC to prevent
    // timezone-induced off-by-one errors. setHours(0) uses local TZ
    // but toISOString() outputs UTC, which can shift the date backward
    // by a full day when the server TZ differs from the DB TZ.
    // WF3 Bug Fix: use setUTCHours + setUTCDate for consistent dates.
    // 1. Compute original predicted start date from calibration medians
    const anchorDate = new Date(effectiveAnchor);
    // §47 §14.4: guard Invalid Date before any arithmetic (new Date(bad-string) is truthy but NaN)
    if (isNaN(anchorDate.getTime())) { skipped++; continue; }
    anchorDate.setUTCHours(0, 0, 0, 0);
    let predictedStart = new Date(anchorDate);
    predictedStart.setUTCDate(predictedStart.getUTCDate() + cal.median);

    // 2. HISTORIC SNOWPLOW (spec 85 §3 WF3 April 2026):
    // Fallback anchors (issued_date / application_date) are often 1-3 years in
    // the past. predictedStart = oldAnchor + median still lands in the past →
    // large negative daysUntil → expired urgency (was 76.9% FAIL after WF1).
    // Snap to today + snowplow_buffer_days (DB-driven, spec 47 §4.1) so rescued
    // leads are Rescue Missions. Only fires for fallback anchors.
    // Use runAt (actual run timestamp) not today (midnight UTC) — any predictedStart
    // before the current moment triggers the snowplow, including same-day forecasts
    // that land at today-midnight (equal to `today`, so the old guard missed them).
    const isPast = new Date(predictedStart).getTime() < new Date(runAt).getTime();
    if (anchorIsFallback && isPast) {
      predictedStart = new Date(today);
      predictedStart.setUTCDate(predictedStart.getUTCDate() + logicVars.snowplow_buffer_days);
      snowplowCount++;
    }

    // 3. INSTANT STALL RECALIBRATION — context-aware penalty + rolling snowplow.
    //
    // When lifecycle_stalled flips to true:
    //   a) Instant penalty: push predicted_start forward by a buffer that
    //      reflects how long this KIND of stall typically takes to resolve.
    //      Pre-construction stalls (zoning, permits) = 45 days (bureaucracy).
    //      Active construction stalls (failed inspection) = 14 days.
    //   b) Rolling snowplow: if the project remains stalled across multiple
    //      daily runs, the predicted date must keep rolling forward. It can
    //      never be closer than stallPenalty days from today. This prevents
    //      the date from drifting into the past while stalled.
    if (lifecycle_stalled) {
      const stallPenalty = PRE_CONSTRUCTION_PHASES.has(lifecycle_phase)
        ? logicVars.stall_penalty_precon
        : logicVars.stall_penalty_active;

      // Apply the instant shockwave to the original estimate
      predictedStart.setUTCDate(predictedStart.getUTCDate() + stallPenalty);

      // The rolling snowplow: floor at today + penalty
      const minimumStallDate = new Date(today);
      minimumStallDate.setUTCDate(minimumStallDate.getUTCDate() + stallPenalty);

      if (predictedStart.getTime() < minimumStallDate.getTime()) {
        predictedStart = minimumStallDate;
      }
    }

    // 3. Calculate final daysUntil based on recalibrated date
    const daysUntil = Math.floor(
      (predictedStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    // WF3-05 (H-W13): per-trade imminent window from Control Panel.
    // `?? 14` (not `|| 14`) preserves a legitimate 0-day window — the
    // spec allows trades to opt out of the imminent tier entirely.
    const urgency = classifyUrgency(
      daysUntil,
      isPastTarget,
      logicVars.expired_threshold_days,
      tradeConfigs[trade_slug]?.imminent_window_days ?? 14,
      logicVars.urgency_overdue_days,
      logicVars.urgency_upcoming_days,
    );
    const confidence = classifyConfidence(cal.sample, cal.method === 'default');
    const finalCalMethod = anchorIsFallback ? 'fallback_issued' : cal.method;

    batch.push({
      permit_num,
      revision_num,
      trade_slug,
      predicted_start: predictedStart.toISOString().slice(0, 10),
      confidence,
      urgency,
      target_window: targetWindow,
      calibration_method: finalCalMethod,
      sample_size: cal.sample,
      median_days: cal.median,
      p25_days: cal.p25,
      p75_days: cal.p75,
    });

    if (batch.length >= FORECAST_BATCH_SIZE) {
      await flushForecastBatch(batch);
      batch = [];
      batchCount++;
      if (batchCount % 50 === 0) {
        pipeline.log.info(
          '[trade-forecasts]',
          `Progress: ${totalRows.toLocaleString()} rows streamed, ${upserted.toLocaleString()} upserted (batch ${batchCount})`,
        );
      }
    }
  }

  // Final flush for any remaining rows after the stream closes
  await flushForecastBatch(batch);
  batch = [];

  pipeline.log.info('[trade-forecasts]', `Rows streamed: ${totalRows.toLocaleString()}`);
  pipeline.log.info('[trade-forecasts]', `Skipped (no anchor): ${skipped.toLocaleString()}`);
  if (unmappedTrades > 0) {
    pipeline.log.warn('[trade-forecasts]', `Unmapped trades (not in TRADE_TARGET_PHASE): ${unmappedTrades}`);
  }

  const { rows: postCount } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM trade_forecasts',
  );
  const postRowCount = postCount[0].n;
  const newRows = Math.max(0, postRowCount - preRowCount);

  // Urgency distribution for telemetry
  const { rows: urgDist } = await pool.query(
    'SELECT urgency, COUNT(*)::int AS n FROM trade_forecasts GROUP BY 1 ORDER BY 1',
  );
  const urgencyDistribution = Object.fromEntries(urgDist.map((r) => [r.urgency, r.n]));

  // Calibration method distribution — required by spec 47 §8.2 (forecast engine minimum)
  const { rows: calDist } = await pool.query(
    'SELECT calibration_method, COUNT(*)::int AS n FROM trade_forecasts GROUP BY 1',
  );
  const calibrationDistribution = Object.fromEntries(calDist.map((r) => [r.calibration_method, r.n]));
  // Avoid div-by-zero on an empty table (e.g., fresh environment)
  const totalForecasts = postRowCount > 0 ? postRowCount : 1;
  const defaultPct = ((calibrationDistribution.default ?? 0) / totalForecasts) * 100;
  const expiredPct = ((urgencyDistribution.expired ?? 0) / totalForecasts) * 100;

  // Build audit table per spec 47 §8.2 — forecast engine minimum:
  // forecasts_computed, stale_purged, default_calibration_pct (with threshold)
  const auditRows = [
    { metric: 'forecasts_computed',        value: upserted,                threshold: null,    status: 'INFO' },
    { metric: 'new_forecasts',             value: newRows,                 threshold: null,    status: 'INFO' },
    { metric: 'stale_purged',              value: stalePurged,             threshold: null,    status: 'INFO' },
    { metric: 'grace_purged',             value: gracePurged,             threshold: null,    status: 'INFO' },
    // skipped_no_anchor: rows reaching the JS loop with no effectiveAnchor (all 4 fallback fields NULL).
    // Terminal/orphan phases (SKIP_PHASES) are now excluded at SQL level — they no longer reach this counter.
    { metric: 'skipped_no_anchor',         value: skipped,                 threshold: null,    status: 'INFO' },
    { metric: 'snowplow_applied',          value: snowplowCount,           threshold: null,    status: 'INFO' },
    {
      metric: 'unmapped_trades',
      value: unmappedTrades,
      threshold: '== 0',
      status: unmappedTrades > 0 ? 'WARN' : 'PASS',
    },
    {
      metric: 'default_calibration_pct',
      value: defaultPct.toFixed(1) + '%',
      threshold: '< 20%',
      status: defaultPct >= 50 ? 'FAIL' : defaultPct >= 20 ? 'WARN' : 'PASS',
    },
    {
      metric: 'expired_urgency_pct',
      value: expiredPct.toFixed(1) + '%',
      threshold: '< 30%',
      status: expiredPct >= 60 ? 'FAIL' : expiredPct >= 30 ? 'WARN' : 'PASS',
    },
    { metric: 'total_forecast_rows', value: postRowCount, threshold: null, status: 'INFO' },
  ];
  const auditVerdict =
    auditRows.some((r) => r.status === 'FAIL') ? 'FAIL' :
    auditRows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';

  // §11.1: records_total = total rows streamed, not rows upserted
  pipeline.emitSummary({
    records_total: totalRows,
    records_new: newRows,
    records_updated: upserted - newRows,
    records_meta: {
      forecasts_computed: upserted,
      stale_forecasts_purged: stalePurged,
      grace_purged: gracePurged,
      skipped_no_anchor: skipped,
      unmapped_trades: unmappedTrades,
      anchor_fallbacks_used: anchorFallbackCount,
      snowplow_applied: snowplowCount,
      urgency_distribution: urgencyDistribution,
      calibration_distribution: calibrationDistribution,
      total_forecast_rows: postRowCount,
      audit_table: {
        phase: 22,
        name: 'Trade Forecasts',
        verdict: auditVerdict,
        rows: auditRows,
      },
    },
  });

  pipeline.emitMeta(
    {
      permit_trades: ['permit_num', 'revision_num', 'trade_id', 'is_active'],
      trades: ['id', 'slug'],
      permits: ['permit_num', 'revision_num', 'lifecycle_phase', 'phase_started_at', 'permit_type', 'issued_date', 'application_date'],
      permit_inspections: ['permit_num', 'inspection_date', 'status'],
      phase_calibration: ['from_phase', 'to_phase', 'permit_type', 'median_days', 'p25_days', 'p75_days', 'sample_size'],
    },
    {
      trade_forecasts: ['permit_num', 'revision_num', 'trade_slug', 'predicted_start', 'confidence', 'urgency', 'calibration_method', 'sample_size', 'median_days', 'p25_days', 'p75_days', 'computed_at'],
    },
  );
  }); // end withAdvisoryLock

  // Lock was held by another instance — helper already emitted SKIP summary.
  if (!lockResult.acquired) {
    pipeline.emitMeta({}, {});
    return;
  }
});
