#!/usr/bin/env node
/**
 * Compute Trade Forecasts — the Flight Tracker (Phase 4).
 *
 * Generates per-permit, per-trade predicted start dates and urgency
 * statuses. Marries the phase_started_at anchor (Phase 2) with the
 * phase_calibration medians (Phase 3) and TRADE_TARGET_PHASE mapping
 * to produce rows in trade_forecasts that the lead feed JOINs on.
 *
 * SPEC LINK: docs/reports/lifecycle_phase_implementation.md §Phase 4
 */
'use strict';

const pipeline = require('./lib/pipeline');
const {
  TRADE_TARGET_PHASE: TRADE_TARGET_PHASE_FALLBACK,
  PHASE_ORDINAL,
} = require('./lib/lifecycle-phase');
const { loadMarketplaceConfigs } = require('./lib/config-loader');

// PHASE_ORDINAL imported from shared lib. TRADE_TARGET_PHASE loaded from
// trade_configurations at runtime via shared config loader. Falls back to
// the hardcoded shared lib if the DB query fails.
let TRADE_TARGET_PHASE = TRADE_TARGET_PHASE_FALLBACK;

// Phases that should NOT produce trade forecasts
const SKIP_PHASES = new Set([
  'P19', 'P20',              // terminal
  'O1', 'O2', 'O3', 'O4',  // orphan (O4 is architecturally unreachable but defensive)
  'P1', 'P2',               // CoA pre-permit
]);

// Pre-construction phases use ISSUED calibration instead of phase-to-phase.
// P18 is intentionally NOT here — it means "construction active with at
// least one passed inspection." P18 permits should use the phase-to-phase
// fallback hierarchy (P18→target misses → ISSUED fallback naturally).
// Putting P18 here forced ISSUED calibration with issued_date anchors,
// making virtually every P18 forecast "overdue." See adversarial Probe 2.
const PRE_CONSTRUCTION_PHASES = new Set([
  'P3', 'P4', 'P5', 'P6',  // pre-issuance
  'P7a', 'P7b', 'P7c', 'P7d', // issued, pre-construction
  'P8',                      // revised
]);

const FORECAST_BATCH_SIZE = 1000;
const DEFAULT_MEDIAN_DAYS = 30;

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
function classifyUrgency(daysUntil, isPastTarget, expiredThreshold, imminentWindow = 14) {
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
  if (daysUntil <= -30) return 'overdue';
  if (daysUntil <= 0) return 'delayed';
  if (daysUntil <= imminentWindow) return 'imminent';
  if (daysUntil <= 30) return 'upcoming';
  return 'on_time';
}

function classifyConfidence(sampleSize, isFallback) {
  if (isFallback || sampleSize === 0) return 'low';
  if (sampleSize >= 30) return 'high';
  if (sampleSize >= 10) return 'medium';
  return 'low';
}

pipeline.run('compute-trade-forecasts', async (pool) => {
  // ─── Load Control Panel via shared loader ──────────────────
  const { tradeConfigs, logicVars } = await loadMarketplaceConfigs(pool, 'trade-forecasts');

  // Build TRADE_TARGET_PHASE from loaded trade configs
  TRADE_TARGET_PHASE = Object.fromEntries(
    Object.entries(tradeConfigs).map(([slug, tc]) => [slug, {
      bid_phase: tc.bid_phase_cutoff,
      work_phase: tc.work_phase_target,
    }]),
  );

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0); // normalize to UTC midnight

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

    // Level 5: hardcoded default
    return { median: DEFAULT_MEDIAN_DAYS, p25: 15, p75: 60, sample: 0, method: 'default' };
  }

  // ═══════════════════════════════════════════════════════════
  // Step 2: Query all active permit-trade pairs with lifecycle data
  // ═══════════════════════════════════════════════════════════
  pipeline.log.info('[trade-forecasts]', 'Querying active permit-trade pairs...');
  const { rows: permitTradeRows } = await pool.query(`
    SELECT p.permit_num, p.revision_num, t.slug AS trade_slug,
           p.lifecycle_phase, p.phase_started_at, p.permit_type,
           p.lifecycle_stalled
      FROM permit_trades pt
      JOIN trades t ON t.id = pt.trade_id
      JOIN permits p ON p.permit_num = pt.permit_num
                    AND p.revision_num = pt.revision_num
     WHERE pt.is_active = true
       AND p.lifecycle_phase IS NOT NULL
       AND p.phase_started_at IS NOT NULL
  `);
  pipeline.log.info(
    '[trade-forecasts]',
    `Active permit-trade pairs: ${permitTradeRows.length.toLocaleString()}`,
  );

  // ═══════════════════════════════════════════════════════════
  // Step 3: Compute forecasts in JS
  // ═══════════════════════════════════════════════════════════
  const forecasts = [];
  let skipped = 0;
  let unmappedTrades = 0;

  for (const row of permitTradeRows) {
    const {
      permit_num, revision_num, trade_slug,
      lifecycle_phase, phase_started_at, permit_type,
      lifecycle_stalled,
    } = row;

    // Skip terminal/orphan/CoA phases
    if (SKIP_PHASES.has(lifecycle_phase)) {
      skipped++;
      continue;
    }

    // Look up bimodal targets for this trade
    const targets = TRADE_TARGET_PHASE[trade_slug];
    if (!targets) {
      unmappedTrades++;
      continue;
    }

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
    const anchorDate = new Date(phase_started_at);
    anchorDate.setUTCHours(0, 0, 0, 0);
    let predictedStart = new Date(anchorDate);
    predictedStart.setUTCDate(predictedStart.getUTCDate() + cal.median);

    // 2. INSTANT STALL RECALIBRATION — context-aware penalty + rolling snowplow.
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

      if (predictedStart < minimumStallDate) {
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
    );
    const confidence = classifyConfidence(cal.sample, cal.method === 'default');

    forecasts.push({
      permit_num,
      revision_num,
      trade_slug,
      predicted_start: predictedStart.toISOString().slice(0, 10),
      confidence,
      urgency,
      target_window: targetWindow,
      calibration_method: cal.method,
      sample_size: cal.sample,
      median_days: cal.median,
      p25_days: cal.p25,
      p75_days: cal.p75,
    });
  }

  pipeline.log.info('[trade-forecasts]', `Forecasts computed: ${forecasts.length.toLocaleString()}`);
  pipeline.log.info('[trade-forecasts]', `Skipped (terminal/orphan): ${skipped.toLocaleString()}`);
  if (unmappedTrades > 0) {
    pipeline.log.warn('[trade-forecasts]', `Unmapped trades (not in TRADE_TARGET_PHASE): ${unmappedTrades}`);
  }

  // ═══════════════════════════════════════════════════════════
  // Step 3b: Delete stale forecasts for permits now in terminal/orphan/dead phases
  // ═══════════════════════════════════════════════════════════
  // When a permit transitions from P7c → P20 (closed), the script skips
  // it (SKIP_PHASES). Without cleanup, the old forecast row persists with
  // a stale urgency. The feed would show "delayed" for a closed permit.
  // Independent D4 + adversarial Probe 4.
  // Ironclad ghost purge: deletes forecasts if EITHER the permit died
  // (terminal/orphan/dead phase) OR the specific trade was deactivated
  // on the permit. The NOT EXISTS ensures no orphan forecast rows
  // persist between runs. This replaces the simpler IN-based DELETE
  // that only caught phase-based invalidation.
  const { rows: staleRows } = await pool.query(
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
           AND p.lifecycle_phase NOT IN ('P19','P20','O1','O2','O3','O4','P1','P2')
           AND p.lifecycle_phase IS NOT NULL
      )
    RETURNING 1`,
  );
  const stalePurged = staleRows.length;
  if (stalePurged > 0) {
    pipeline.log.info(
      '[trade-forecasts]',
      `Purged ${stalePurged.toLocaleString()} stale forecasts for terminal/orphan/dead permits`,
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Step 4: Batch UPSERT into trade_forecasts
  // ═══════════════════════════════════════════════════════════
  const { rows: preCount } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM trade_forecasts',
  );
  const preRowCount = preCount[0].n;

  let upserted = 0;
  if (forecasts.length > 0) {
    const batches = [];
    for (let i = 0; i < forecasts.length; i += FORECAST_BATCH_SIZE) {
      batches.push(forecasts.slice(i, i + FORECAST_BATCH_SIZE));
    }

    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      const vals = [];
      const params = [];
      for (let j = 0; j < batch.length; j++) {
        const f = batch[j];
        const base = j * 12;
        vals.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::date, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}::int, $${base + 10}::int, $${base + 11}::int, $${base + 12}::int)`,
        );
        params.push(
          f.permit_num, f.revision_num, f.trade_slug,
          f.predicted_start, f.confidence, f.urgency,
          f.target_window, f.calibration_method, f.sample_size,
          f.median_days, f.p25_days, f.p75_days,
        );
      }

      await pool.query(
        `INSERT INTO trade_forecasts
           (permit_num, revision_num, trade_slug, predicted_start,
            confidence, urgency, target_window, calibration_method,
            sample_size, median_days, p25_days, p75_days)
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
           computed_at = NOW()`,
        params,
      );
      upserted += batch.length;

      if ((bi + 1) % 10 === 0 || bi === batches.length - 1) {
        pipeline.log.info(
          '[trade-forecasts]',
          `Batch ${bi + 1}/${batches.length} (${upserted.toLocaleString()} upserted)`,
        );
      }
    }
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

  pipeline.emitSummary({
    records_total: forecasts.length,
    records_new: newRows,
    records_updated: upserted - newRows,
    records_meta: {
      forecasts_computed: forecasts.length,
      stale_forecasts_purged: stalePurged,
      skipped_terminal_orphan: skipped,
      unmapped_trades: unmappedTrades,
      urgency_distribution: urgencyDistribution,
      total_forecast_rows: postRowCount,
    },
  });

  pipeline.emitMeta(
    {
      permit_trades: ['permit_num', 'revision_num', 'trade_id', 'is_active'],
      trades: ['id', 'slug'],
      permits: ['permit_num', 'revision_num', 'lifecycle_phase', 'phase_started_at', 'permit_type'],
      phase_calibration: ['from_phase', 'to_phase', 'permit_type', 'median_days', 'p25_days', 'p75_days', 'sample_size'],
    },
    {
      trade_forecasts: ['permit_num', 'revision_num', 'trade_slug', 'predicted_start', 'confidence', 'urgency', 'calibration_method', 'sample_size', 'median_days', 'p25_days', 'p75_days'],
    },
  );
});
