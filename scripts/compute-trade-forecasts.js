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
const { TRADE_TARGET_PHASE } = require('./lib/lifecycle-phase');

// Phase ordinals for forward-progression comparison.
// Permits at or past the target phase → overdue (window closed).
// Phase ordinals for forward-progression comparison.
// P18 = "construction active, has passed inspection" — conservatively
// placed at ordinal 4 (same as P12 rough-in) since we know at least
// one inspection passed but don't know the exact sub-stage. This means
// P18 permits are "past" P9-P12 targets but "before" P13+ targets.
// Without this, P18 permits with target P9 (excavation) would never
// be marked overdue via the ordinal path. See independent D2 +
// adversarial Probe 3.
const PHASE_ORDINAL = {
  P9: 1, P10: 2, P11: 3, P12: 4, P13: 5,
  P14: 6, P15: 7, P16: 8, P17: 9,
  P18: 4, // conservative: at least past rough-in
};

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

// Urgency classification thresholds (days until predicted_start)
function classifyUrgency(daysUntil, isPastTarget) {
  if (isPastTarget) return 'overdue';
  if (daysUntil <= -30) return 'overdue';
  if (daysUntil <= 0) return 'delayed';
  if (daysUntil <= 14) return 'imminent';
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
  const today = new Date();
  today.setHours(0, 0, 0, 0); // normalize to midnight

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
           p.lifecycle_phase, p.phase_started_at, p.permit_type
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
    const { permit_num, revision_num, trade_slug, lifecycle_phase, phase_started_at, permit_type } = row;

    // Skip terminal/orphan/CoA phases
    if (SKIP_PHASES.has(lifecycle_phase)) {
      skipped++;
      continue;
    }

    // Look up target phase for this trade
    const targetPhase = TRADE_TARGET_PHASE[trade_slug];
    if (!targetPhase) {
      unmappedTrades++;
      continue;
    }

    const currentOrdinal = PHASE_ORDINAL[lifecycle_phase];
    const targetOrdinal = PHASE_ORDINAL[targetPhase];

    // If permit is already at or past the target phase → overdue
    const isPastTarget = currentOrdinal != null && targetOrdinal != null
      && currentOrdinal >= targetOrdinal;

    // Determine calibration lookup key
    const fromPhase = PRE_CONSTRUCTION_PHASES.has(lifecycle_phase)
      ? 'ISSUED'
      : lifecycle_phase;

    const cal = lookupCalibration(fromPhase, targetPhase, permit_type);

    // Compute predicted start date
    const anchorDate = new Date(phase_started_at);
    anchorDate.setHours(0, 0, 0, 0);
    const predictedStart = new Date(anchorDate);
    predictedStart.setDate(predictedStart.getDate() + cal.median);

    const daysUntil = Math.floor(
      (predictedStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    const urgency = classifyUrgency(daysUntil, isPastTarget);
    const confidence = classifyConfidence(cal.sample, cal.method === 'default');

    forecasts.push({
      permit_num,
      revision_num,
      trade_slug,
      predicted_start: predictedStart.toISOString().slice(0, 10), // YYYY-MM-DD
      confidence,
      urgency,
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
  const { rows: staleRows } = await pool.query(
    `DELETE FROM trade_forecasts
      WHERE (permit_num, revision_num) IN (
        SELECT permit_num, revision_num
          FROM permits
         WHERE lifecycle_phase IS NULL
            OR lifecycle_phase IN ('P19','P20','O1','O2','O3','O4','P1','P2')
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
        const base = j * 11;
        vals.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::date, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}::int, $${base + 9}::int, $${base + 10}::int, $${base + 11}::int)`,
        );
        params.push(
          f.permit_num, f.revision_num, f.trade_slug,
          f.predicted_start, f.confidence, f.urgency,
          f.calibration_method, f.sample_size,
          f.median_days, f.p25_days, f.p75_days,
        );
      }

      await pool.query(
        `INSERT INTO trade_forecasts
           (permit_num, revision_num, trade_slug, predicted_start,
            confidence, urgency, calibration_method, sample_size,
            median_days, p25_days, p75_days)
         VALUES ${vals.join(', ')}
         ON CONFLICT (permit_num, revision_num, trade_slug)
         DO UPDATE SET
           predicted_start = EXCLUDED.predicted_start,
           confidence = EXCLUDED.confidence,
           urgency = EXCLUDED.urgency,
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
