#!/usr/bin/env node
/**
 * Classify Lifecycle Phase — Strangler Fig V1 classifier.
 *
 * Reads dirty rows from `permits` and `coa_applications`, applies the
 * pure function in scripts/lib/lifecycle-phase.js, and writes the
 * computed `lifecycle_phase` + `lifecycle_stalled` + `lifecycle_classified_at`
 * back to the DB via `IS DISTINCT FROM`-guarded UPDATEs.
 *
 * Runs as a standalone pipeline_runs entry. Triggered by:
 *   - `scripts/trigger-lifecycle-sync.js` (final step of permits + CoA chains)
 *   - Manual CLI: `node scripts/classify-lifecycle-phase.js`
 *
 * Incremental: only re-classifies rows where
 *   `lifecycle_classified_at IS NULL OR last_seen_at > lifecycle_classified_at`.
 * First-run backfill processes all ~237K permits + ~33K CoAs in one pass.
 * Typical incremental runs process ~5K-15K rows in 2-5 seconds.
 *
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md
 */
'use strict';

const https = require('https');
const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const {
  classifyLifecyclePhase,
  classifyCoaPhase,
  DEAD_STATUS_ARRAY,
  NORMALIZED_DEAD_DECISIONS_ARRAY,
} = require('./lib/lifecycle-phase');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');

// ─────────────────────────────────────────────────────────────────
// Push notification dispatch (spec 92 §2.2)
// Dispatches LIFECYCLE_PHASE_CHANGED and LIFECYCLE_STALLED pushes to
// users who have saved a permit. Wrapped in try-catch — failure MUST
// NOT abort the classification run.
// ─────────────────────────────────────────────────────────────────

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// EST/EDT gate — checks whether the current Toronto local time falls
// within the user's notification_schedule window. Uses Intl.DateTimeFormat
// to correctly handle DST (Toronto is UTC-5 EST in winter, UTC-4 EDT in
// summer — ~65% of the year). Hardcoding -5 would silently drop the first
// hour of the morning window (6–7 AM EDT) for ~8 months of the year.
const _torontoHourFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Toronto',
  hour: 'numeric',
  hour12: false,
});

function isScheduleAllowed(schedule, nowUtcMs) {
  const hour = parseInt(_torontoHourFmt.format(new Date(nowUtcMs)), 10);
  if (schedule === 'morning') return hour >= 6 && hour < 9;
  if (schedule === 'evening') return hour >= 17 && hour < 20;
  return true; // 'anytime'
}

function callExpoPushApi(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(messages);
    const req = https.request(
      EXPO_PUSH_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Dispatches pushes for a set of permit phase changes and stall events.
// pool: pg pool; transitions: [{permit_num, revision_num, phase}];
// stalledPermits: [{permit_num, revision_num}] (newly stalled rows).
async function dispatchPhaseChangePushes(pool, transitions, stalledPermits) {
  const nowMs = Date.now();
  const messages = [];

  // LIFECYCLE_PHASE_CHANGED
  for (const t of transitions) {
    let rows;
    try {
      const result = await pool.query(
        // Spec 99 §9.14: notification_prefs JSONB flattened to 5 columns in
        // migration 117. Select the two we read here directly.
        `SELECT dt.push_token, up.phase_changed, up.notification_schedule
           FROM lead_views lv
           JOIN device_tokens dt ON dt.user_id = lv.user_id
           JOIN user_profiles up ON up.user_id = lv.user_id
          WHERE lv.permit_num = $1
            AND lv.revision_num = $2
            AND lv.saved = true`,
        [t.permit_num, t.revision_num],
      );
      rows = result.rows;
    } catch (err) {
      pipeline.log.warn('[classify-lifecycle-phase/push]', `PHASE_CHANGED query failed for ${t.permit_num}`, { err: err.message });
      continue;
    }

    for (const row of rows) {
      if (!row.phase_changed) continue;
      if (!isScheduleAllowed(row.notification_schedule || 'anytime', nowMs)) continue;
      messages.push({
        to: row.push_token,
        title: 'Phase Update',
        // PIPEDA: no permit_num in the visible body — Expo logs push bodies for
        // delivery diagnostics. Routing identity is carried in data.entity_id below.
        body: 'A job you are tracking has advanced to the next phase.',
        data: {
          notification_type: 'LIFECYCLE_PHASE_CHANGED',
          route_domain: 'flight_board',
          entity_id: `${t.permit_num}--${t.revision_num}`,
          urgency: 'normal',
        },
      });
    }
  }

  // LIFECYCLE_STALLED — bypasses schedule gate (spec §2.2)
  for (const s of stalledPermits) {
    let rows;
    try {
      const result = await pool.query(
        // Spec 99 §9.14: read the lifecycle_stalled_pref column (renamed
        // from notification_prefs.lifecycle_stalled to disambiguate from
        // permits.lifecycle_stalled in joins).
        `SELECT dt.push_token, up.lifecycle_stalled_pref
           FROM lead_views lv
           JOIN device_tokens dt ON dt.user_id = lv.user_id
           JOIN user_profiles up ON up.user_id = lv.user_id
          WHERE lv.permit_num = $1
            AND lv.revision_num = $2
            AND lv.saved = true`,
        [s.permit_num, s.revision_num],
      );
      rows = result.rows;
    } catch (err) {
      pipeline.log.warn('[classify-lifecycle-phase/push]', `LIFECYCLE_STALLED query failed for ${s.permit_num}`, { err: err.message });
      continue;
    }

    for (const row of rows) {
      if (!row.lifecycle_stalled_pref) continue;
      // No schedule gate — stall alerts always deliver immediately
      messages.push({
        to: row.push_token,
        title: 'Delayed',
        // PIPEDA: no permit_num in body — routing identity in data.entity_id below.
        body: 'A job you are tracking has been flagged as stalled by the city.',
        data: {
          notification_type: 'LIFECYCLE_STALLED',
          route_domain: 'flight_board',
          entity_id: `${s.permit_num}--${s.revision_num}`,
          urgency: 'stalled',
        },
      });
    }
  }

  if (messages.length === 0) return;

  // Expo Push API accepts up to 100 messages per request
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      await callExpoPushApi(chunk);
    } catch (err) {
      pipeline.log.warn('[classify-lifecycle-phase/push]', `Expo Push API call failed (${chunk.length} msgs)`, { err: err.message });
    }
  }

  pipeline.log.info('[classify-lifecycle-phase/push]', `Dispatched ${messages.length} push notification(s)`);
}

// Dispatches START_DATE_URGENT pushes for permits predicted to start within 7 days.
// Bypasses the schedule gate (spec §2.2 — urgency override).
// Runs once per pipeline run after classification — fire-and-forget, MUST NOT abort.
async function dispatchStartDateUrgentPushes(pool) {
  const nowMs = Date.now();
  let rows;
  try {
    const result = await pool.query(
      // Spec 99 §9.14: read the start_date_urgent column directly.
      `SELECT DISTINCT ON (tf.permit_num, tf.revision_num, dt.push_token)
              tf.permit_num, tf.revision_num, dt.push_token,
              up.start_date_urgent, tf.predicted_start
         FROM trade_forecasts tf
         JOIN lead_views lv
           ON lv.permit_num = tf.permit_num
          AND lv.revision_num = tf.revision_num
          AND lv.saved = true
         JOIN device_tokens dt ON dt.user_id = lv.user_id
         JOIN user_profiles up ON up.user_id = lv.user_id
        WHERE tf.predicted_start IS NOT NULL
          AND tf.predicted_start >= NOW() + INTERVAL '6 days'
          AND tf.predicted_start <= NOW() + INTERVAL '7 days'`,
    );
    rows = result.rows;
  } catch (err) {
    pipeline.log.warn('[classify-lifecycle-phase/push]', 'START_DATE_URGENT query failed', { err: err.message });
    return;
  }

  const messages = [];
  for (const row of rows) {
    if (!row.start_date_urgent) continue;
    // No schedule gate — start-date alerts bypass the window (spec §2.2)
    const daysUntil = Math.ceil(
      (new Date(row.predicted_start).getTime() - nowMs) / (1000 * 60 * 60 * 24),
    );
    messages.push({
      to: row.push_token,
      title: 'Work Starting Soon',
      // PIPEDA: no permit_num in body — routing identity in data.entity_id below.
      body: `A saved job is predicted to start in ${daysUntil} day${daysUntil === 1 ? '' : 's'}.`,
      data: {
        notification_type: 'START_DATE_URGENT',
        route_domain: 'flight_board',
        entity_id: `${row.permit_num}--${row.revision_num}`,
        urgency: 'urgent',
      },
    });
  }

  if (messages.length === 0) return;

  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      await callExpoPushApi(chunk);
    } catch (err) {
      pipeline.log.warn('[classify-lifecycle-phase/push]', `Expo Push API call failed for START_DATE_URGENT (${chunk.length} msgs)`, { err: err.message });
    }
  }

  pipeline.log.info('[classify-lifecycle-phase/push]', `Dispatched ${messages.length} START_DATE_URGENT push notification(s)`);
}

// ─────────────────────────────────────────────────────────────────
// Config schema — §4.2: every logic_variable consumed by this script
// must appear in this Zod schema. Validated at startup before any
// computation so bad DB values (NULL, empty string, wrong type) throw
// immediately with a clear message instead of silently producing NaN.
// ─────────────────────────────────────────────────────────────────

const LIFECYCLE_CONFIG_SCHEMA = z.object({
  coa_stall_threshold:             z.coerce.number().positive(),
  lifecycle_issued_stall_days:     z.coerce.number().int().positive(),
  lifecycle_inspection_stall_days: z.coerce.number().int().positive(),
  lifecycle_p7a_max_days:          z.coerce.number().int().positive(),
  lifecycle_p7b_max_days:          z.coerce.number().int().positive(),
  // WF3 2026-04-23 B1-C2: previously hardcoded as `180` inside
  // classifyOrphan; now operator-tunable per spec 47 §4.1.
  lifecycle_orphan_stall_days:     z.coerce.number().int().positive(),
}).passthrough();

// ─────────────────────────────────────────────────────────────────
// Batch UPDATE SQL builders — batched via VALUES clause to avoid
// 65535-parameter PG limit.
//
// §6.3: batch sizes MUST be computed via Math.floor(65535 / column_count).
//
// PERMIT_BATCH_SIZE limited by the transition INSERT (7 params/row:
// permit_num, revision_num, from_phase, to_phase, RUN_AT, permit_type,
// neighbourhood_id). Transitions can equal the full batch on first-run
// backfill. (65535 - 1) / 7 = 9362.
// The phase UPDATE uses 4 data params/row + 1 RUN_AT appended =
// 9362*4+1 = 37449 — well under the 65535 limit.
const PERMIT_TRANSITION_COLS = 7;
const PERMIT_BATCH_SIZE = Math.floor((65535 - 1) / PERMIT_TRANSITION_COLS); // = 9362

// COA_BATCH_SIZE: 3 data cols (id, phase, stalled) + 1 RUN_AT appended = 4 params/row.
// (65535 - 1) / 4 = 16383.
const COA_COLS = 3;
const COA_BATCH_SIZE = Math.floor((65535 - 1) / (COA_COLS + 1)); // = 16383
// ─────────────────────────────────────────────────────────────────

function buildPermitUpdateSQL(batchSize) {
  const tuples = [];
  for (let i = 0; i < batchSize; i++) {
    const base = i * 4;
    tuples.push(
      `($${base + 1}::varchar, $${base + 2}::varchar, $${base + 3}::varchar, $${base + 4}::boolean)`,
    );
  }
  // Phase 2 state machine: phase_started_at is stamped ONLY when
  // lifecycle_phase actually changes (IS DISTINCT FROM), NOT when only
  // lifecycle_stalled changes. This creates the immutable "start time"
  // anchor required for countdown math. If only stalled changed, the
  // existing phase_started_at is preserved.
  //
  // §14.2: RUN_AT ($runAtParam) is appended as the last parameter after all
  // batch rows. Using a single captured DB timestamp prevents Midnight Cross
  // drift where batches processed after 00:00 get a different date than
  // earlier batches in the same run.
  const runAtParam = batchSize * 4 + 1;
  return `
    UPDATE permits p
       SET lifecycle_phase = v.phase,
           lifecycle_stalled = v.stalled,
           lifecycle_classified_at = $${runAtParam}::timestamptz,
           phase_started_at = CASE
             WHEN p.lifecycle_phase IS DISTINCT FROM v.phase
             THEN $${runAtParam}::timestamptz
             ELSE p.phase_started_at
           END
      FROM (VALUES ${tuples.join(', ')}) AS v(permit_num, revision_num, phase, stalled)
     WHERE p.permit_num = v.permit_num
       AND p.revision_num = v.revision_num
       AND (p.lifecycle_phase IS DISTINCT FROM v.phase
            OR p.lifecycle_stalled IS DISTINCT FROM v.stalled)
  `;
}

function buildCoaUpdateSQL(batchSize) {
  const tuples = [];
  for (let i = 0; i < batchSize; i++) {
    const base = i * 3;
    tuples.push(`($${base + 1}::int, $${base + 2}::varchar, $${base + 3}::boolean)`);
  }
  // WF3 2026-04-13 — lifecycle_stalled added (migration 094).
  // IS DISTINCT FROM guard on EITHER phase or stalled so we don't
  // bump lifecycle_classified_at when nothing actually changed.
  //
  // §14.2: RUN_AT ($runAtParam) appended as last parameter — same clock
  // source as the permit path, preventing Midnight Cross drift.
  const runAtParam = batchSize * 3 + 1;
  return `
    UPDATE coa_applications ca
       SET lifecycle_phase = v.phase,
           lifecycle_stalled = v.stalled,
           lifecycle_classified_at = $${runAtParam}::timestamptz
      FROM (VALUES ${tuples.join(', ')}) AS v(id, phase, stalled)
     WHERE ca.id = v.id
       AND (ca.lifecycle_phase IS DISTINCT FROM v.phase
            OR ca.lifecycle_stalled IS DISTINCT FROM v.stalled)
  `;
}

function flattenPermitBatch(rows) {
  const out = [];
  for (const r of rows) {
    out.push(r.permit_num, r.revision_num, r.phase, r.stalled);
  }
  return out;
}

function flattenCoaBatch(rows) {
  const out = [];
  for (const r of rows) {
    out.push(r.id, r.phase, r.stalled);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────
// Main run
// ─────────────────────────────────────────────────────────────────

// Startup validation — `<> ALL(ARRAY[]::text[])` is vacuously true
// in Postgres, which would silently zero-out the unclassified count.
if (DEAD_STATUS_ARRAY.length === 0) {
  throw new Error('DEAD_STATUS_ARRAY is empty — refusing to run');
}
if (NORMALIZED_DEAD_DECISIONS_ARRAY.length === 0) {
  throw new Error('NORMALIZED_DEAD_DECISIONS_ARRAY is empty — refusing to run');
}

// Advisory lock ID = spec number (84) per project convention.
// WF3-fix: was incorrectly set to 85 (migration number), which
// collided with compute-trade-forecasts.js (spec 85). The collision
// caused both scripts to mutually block each other when run concurrently.
// See adversarial review C1: without this lock, two chains finishing
// close in time would race on the UPDATE set.
const ADVISORY_LOCK_ID = 84;

pipeline.run('classify-lifecycle-phase', async (pool) => {

  // ═══════════════════════════════════════════════════════════
  // Concurrency guard — pipeline.withAdvisoryLock (Phase 2 migration)
  // ═══════════════════════════════════════════════════════════
  // §4: ALL state-dependent initialization (getDbTimestamp, loadMarketplaceConfigs,
  // validateLogicVars) MUST execute inside the lock callback to ensure absolute
  // isolation. Two concurrent instances loading config before lock acquisition
  // would race on stale state.
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {

  // §R3.5 / §14.1 — Capture DB clock ONCE as the very first query.
  // All batch UPDATEs/INSERTs that set a timestamp column pass RUN_AT
  // as $N — never calling NOW() inside loops. Using the DB timestamp
  // (not new Date()) ensures the JS and SQL sides share the same clock
  // source and TZ session, preventing Midnight Cross drift where batches
  // processed across midnight get different dates.
  const RUN_AT = await pipeline.getDbTimestamp(pool);

  // ═══════════════════════════════════════════════════════════
  // Load Control Panel (WF3 2026-04-13)
  // ═══════════════════════════════════════════════════════════
  // Pulls `coa_stall_threshold` (logic_variables, default 30 days) used
  // to flag CoAs stuck in P1/P2 for too long. Falls back gracefully if
  // the control panel query fails.
  const { logicVars } = await loadMarketplaceConfigs(pool, 'classify-lifecycle-phase');

  // §4.2 — Validate all logic_variables consumed by this script BEFORE
  // any computation. Throws if coa_stall_threshold is missing, non-numeric,
  // or non-positive (e.g. DB NULL → undefined → Zod .positive() rejects).
  // Prevents the silent-NaN failure mode (H-W11): bad value → NaN →
  // stall logic quietly disabled for all CoAs.
  const configValidation = validateLogicVars(
    logicVars, LIFECYCLE_CONFIG_SCHEMA, 'classify-lifecycle-phase',
  );
  if (!configValidation.valid) {
    throw new Error(
      `[classify-lifecycle-phase] config validation failed: ${configValidation.errors.join('; ')}`,
    );
  }
  const COA_STALL_THRESHOLD_DAYS       = logicVars.coa_stall_threshold;
  const PERMIT_ISSUED_STALL_DAYS       = logicVars.lifecycle_issued_stall_days;
  const INSPECTION_STALL_DAYS          = logicVars.lifecycle_inspection_stall_days;
  const P7A_MAX_DAYS                   = logicVars.lifecycle_p7a_max_days;
  const P7B_MAX_DAYS                   = logicVars.lifecycle_p7b_max_days;
  const ORPHAN_STALL_DAYS              = logicVars.lifecycle_orphan_stall_days;
  // ═══════════════════════════════════════════════════════════
  // Phase 1: classify dirty permit rows
  // ═══════════════════════════════════════════════════════════
  //
  // We AVOID correlated subqueries in the dirty-permit query because
  // `is_orphan` previously used split_part() on both sides of an
  // equality, which defeats index usage and produces O(n²) behaviour
  // across 243K permits (→ multi-hour classifier run).
  //
  // Instead we do three O(n) passes:
  //   1. Load BLD/CMB permit_nums and build Map<prefix, Set<permit_num>>
  //      for in-memory orphan detection
  //   2. Load inspection rollups via SQL aggregation (Postgres returns
  //      ~10K pre-aggregated rows, not the full 94K raw table)
  //   3. Stream dirty permits via pipeline.streamQuery, classify each row
  //      inline using the two Maps, flush per PERMIT_BATCH_SIZE batch
  //
  // §6.2: `permits` is a mandatory streaming table. Loading all dirty
  // permits into a single Node array via pool.query() risks OOM on
  // first-run backfill where 200K+ rows may be dirty simultaneously.
  // streamQuery provides backpressure — the cursor pauses during each
  // flushPermitBatch() withTransaction, so the heap holds at most
  // PERMIT_BATCH_SIZE rows (9362) at a time, not the full dirty set.
  //
  // WATERMARK RACE NOTE (WF3 Bug #5, document only):
  // Between the dirty-SELECT and the per-batch UPDATE that writes
  // lifecycle_classified_at = RUN_AT, a concurrent writer (e.g.,
  // load-permits.js or link-coa.js) can bump a permit's last_seen_at.
  // The classifier sees stale data for that row but stamps it with a
  // classified_at AFTER the concurrent writer's last_seen_at, so the
  // row won't appear dirty on the NEXT run — meaning the stale
  // classification sticks until another pipeline step bumps
  // last_seen_at again. This is the accepted best-effort incremental
  // trade-off: the next daily chain run will re-classify with fresh
  // data. No code fix needed — the alternative (SELECT FOR UPDATE)
  // would block the entire permits pipeline for ~170s.

  // Build orphan-detection map FIRST so it is ready when streaming begins.
  // Uses pool.query (not streamQuery) because only one column (permit_num)
  // is fetched — ~5MB of string data for ~237K rows, well within heap bounds.
  // The bldCmbByPrefix Map stores only Set<string> per prefix, not full rows.
  pipeline.log.info('[classify-lifecycle-phase]', 'Building BLD/CMB prefix map...');
  const bldCmbResult = await pool.query(
    `SELECT permit_num FROM permits
      WHERE split_part(permit_num, ' ', 3) IN ('BLD','CMB')`,
  );
  const bldCmbByPrefix = new Map();
  for (const row of bldCmbResult.rows) {
    const parts = row.permit_num.split(' ');
    if (parts.length < 3) continue;
    const prefix = `${parts[0]} ${parts[1]}`;
    let set = bldCmbByPrefix.get(prefix);
    if (!set) {
      set = new Set();
      bldCmbByPrefix.set(prefix, set);
    }
    set.add(row.permit_num);
  }
  pipeline.log.info(
    '[classify-lifecycle-phase]',
    `BLD/CMB prefixes tracked: ${bldCmbByPrefix.size.toLocaleString()}`,
  );

  // Build inspection rollup map — SQL-side aggregation so Node receives
  // ~10K rows (one per permit with inspections) instead of the full 94K+
  // raw permit_inspections table. Postgres is faster at this than JS, and
  // the approach avoids shipping 94K rows over the wire and building a
  // manual rollup in a for-loop. See WF3 Bug #2.
  // Acceptable as pool.query: result is a bounded aggregate (~10K rows).
  pipeline.log.info('[classify-lifecycle-phase]', 'Building inspection rollup map...');
  const inspResult = await pool.query(
    `WITH latest_passed AS (
       SELECT DISTINCT ON (permit_num) permit_num, stage_name
         FROM permit_inspections
        WHERE status = 'Passed'
        ORDER BY permit_num, inspection_date DESC NULLS LAST, stage_name
     ),
     rollup AS (
       SELECT permit_num,
              MAX(inspection_date) AS latest_inspection_date,
              BOOL_OR(status = 'Passed') AS has_passed_inspection
         FROM permit_inspections
        GROUP BY permit_num
     )
     SELECT r.permit_num,
            lp.stage_name AS latest_passed_stage,
            r.latest_inspection_date,
            r.has_passed_inspection
       FROM rollup r
       LEFT JOIN latest_passed lp USING (permit_num)`,
  );
  const inspByPermit = new Map();
  for (const row of inspResult.rows) {
    inspByPermit.set(row.permit_num, {
      latest_passed_stage: row.latest_passed_stage,
      latest_inspection_date: row.latest_inspection_date
        ? new Date(row.latest_inspection_date) : null,
      has_passed_inspection: row.has_passed_inspection,
    });
  }
  pipeline.log.info(
    '[classify-lifecycle-phase]',
    `Inspection rollups built for ${inspByPermit.size.toLocaleString()} permits`,
  );

  // Apply pure function to every dirty row during streaming — all lookups are O(1)
  const EMPTY_INSP = {
    latest_passed_stage: null,
    latest_inspection_date: null,
    has_passed_inspection: false,
  };

  // Suppress intra-bucket time-driven transitions (HIGH-1 from
  // adversarial + independent reviews): P7a/P7b/P7c are purely
  // time-bucketed sub-phases — a P7a→P7b "transition" is just
  // the permit aging past 30 days, not a real construction event.
  // Logging these would flood the calibration table with thousands
  // of tautological 60-day "transitions." Same for O2↔O3 (orphan
  // active → orphan stalled at 180 days).
  // P7d (Not Started) is NOT suppressed — P7d→P7a means the status
  // changed from "Work Not Started" to "Permit Issued", which IS real.
  const TIME_BUCKET_GROUPS = {
    P7a: 'P7_time', P7b: 'P7_time', P7c: 'P7_time',
    O2: 'O_time', O3: 'O_time',
  };

  let dirtyPermitsCount = 0;
  let permitsUpdated = 0;
  let transitionsLogged = 0;
  let permitBatchIndex = 0;

  // Per-batch flush — called from the streaming loop below and again for
  // the remainder. Closes over pool, RUN_AT, and the counters above.
  //
  // Design notes (adversarial review C2 + independent Defect 1):
  //   • The prior version wrapped all 484 batches in ONE transaction,
  //     holding row-level locks on every dirty permit for ~130s during
  //     the first-run backfill. That blocked concurrent writers.
  //   • It also ran the `classified_at` stamp for unchanged rows
  //     OUTSIDE the transaction, creating a consistency gap where a
  //     crash after phase-commit but before stamp-commit would leave
  //     the "unchanged rows" bucket unable to drain on future runs.
  //   • Fix: each batch's phase UPDATE + per-batch stamp UPDATE run
  //     together inside a single small withTransaction. Locks are
  //     released between batches (concurrent writers can interleave),
  //     and phase+stamp always commit atomically per batch.
  const flushPermitBatch = async (batch) => {
    if (batch.length === 0) return;
    permitBatchIndex++;

    const sql = buildPermitUpdateSQL(batch.length);
    // RUN_AT appended as last param — matches $${batchSize*4+1}::timestamptz
    // in the SQL returned by buildPermitUpdateSQL.
    const params = [...flattenPermitBatch(batch), RUN_AT];
    const batchPnums = batch.map((r) => r.permit_num);
    const batchRnums = batch.map((r) => r.revision_num);

    // Identify rows in this batch where lifecycle_phase actually
    // changes (not just stalled). These are the transitions we log.
    const transitions = batch.filter((r) => {
      if (r.phase === r.old_phase || r.phase === null) return false;
      // Suppress intra-bucket shifts
      const oldGroup = TIME_BUCKET_GROUPS[r.old_phase];
      const newGroup = TIME_BUCKET_GROUPS[r.phase];
      if (oldGroup && oldGroup === newGroup) return false;
      return true;
    });

    await pipeline.withTransaction(pool, async (client) => {
      // (a) Phase/stalled UPDATE + conditional phase_started_at stamp.
      const result = await client.query(sql, params);
      permitsUpdated += result.rowCount || 0;

      // (b) Log phase transitions to permit_phase_transitions.
      // Only fires for rows where the phase actually changed (not
      // stalled-only). Runs inside the same transaction so the
      // permit row and its transition history are always consistent.
      if (transitions.length > 0) {
        const tVals = [];
        const tParams = [];
        for (let j = 0; j < transitions.length; j++) {
          const t = transitions[j];
          // 7 params per row: permit_num, revision_num, from_phase,
          // to_phase, RUN_AT (§14.2), permit_type, neighbourhood_id.
          // base = j * 7.
          // Prior adversarial CRITICAL-1 fixed j*7 → j*6 when NOW()
          // was inline SQL (only 6 real params per row). Now that RUN_AT
          // is an explicit parameter, 7 params/row is correct — j*6
          // would cause param misalignment on batches with 2+ transitions.
          const base = j * 7;
          tVals.push(
            `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::timestamptz, $${base + 6}, $${base + 7}::int)`,
          );
          tParams.push(
            t.permit_num, t.revision_num,
            t.old_phase,  // from_phase (NULL on first classification)
            t.phase,      // to_phase
            RUN_AT,       // transitioned_at — §14.2 RUN_AT, not NOW()
            t.permit_type,
            t.neighbourhood_id,
          );
        }
        const insertResult = await client.query(
          `INSERT INTO permit_phase_transitions
             (permit_num, revision_num, from_phase, to_phase, transitioned_at, permit_type, neighbourhood_id)
           VALUES ${tVals.join(', ')}`,
          tParams,
        );
        transitionsLogged += insertResult.rowCount || 0;
      }

      // (c) Stamp classified_at for every row in this batch that is
      // still dirty (last_seen_at > classified_at). This covers both
      // (i) rows just updated by (a) — redundant, idempotent — and
      // (ii) rows (a) skipped because phase was already correct.
      // §14.2: $3 is RUN_AT — same snapshot timestamp used throughout the run.
      await client.query(
        `UPDATE permits
            SET lifecycle_classified_at = $3::timestamptz
           FROM unnest($1::text[], $2::text[]) AS t(permit_num, revision_num)
          WHERE permits.permit_num = t.permit_num
            AND permits.revision_num = t.revision_num
            AND (permits.lifecycle_classified_at IS NULL
                 OR permits.last_seen_at > permits.lifecycle_classified_at)`,
        [batchPnums, batchRnums, RUN_AT],
      );
    });

    // Push dispatch — fire-and-forget after the DB transaction commits.
    // Failures are logged and swallowed; they MUST NOT abort the classification run.
    // Only dispatch LIFECYCLE_STALLED when stalled transitions false→true.
    // Exclude null old_stalled (first-classification): we can't know if
    // the permit was stalled before we ever saw it, so we skip to avoid
    // false alerts on the first pipeline run.
    const stalledRows = batch.filter((r) => r.stalled === true && r.old_stalled === false);
    try {
      await dispatchPhaseChangePushes(pool, transitions, stalledRows);
    } catch (err) {
      pipeline.log.warn('[classify-lifecycle-phase/push]', 'dispatchPhaseChangePushes threw unexpectedly', { err: err.message });
    }

    // Progress log every 50 batches
    if (permitBatchIndex % 50 === 0) {
      pipeline.log.info(
        '[classify-lifecycle-phase]',
        `Permits batch ${permitBatchIndex} (${permitsUpdated.toLocaleString()} updated so far)`,
      );
    }
  };

  pipeline.log.info('[classify-lifecycle-phase]', 'Streaming dirty permits...');
  let permitBatch = [];
  for await (const row of pipeline.streamQuery(
    pool,
    `SELECT permit_num, revision_num, status, enriched_status, issued_date, last_seen_at,
            lifecycle_phase AS old_phase, lifecycle_stalled AS old_stalled, permit_type, neighbourhood_id
       FROM permits
      WHERE lifecycle_classified_at IS NULL
         OR last_seen_at > lifecycle_classified_at`,
  )) {
    dirtyPermitsCount++;

    // Orphan detection — O(1) lookup via bldCmbByPrefix Map
    const parts = row.permit_num.split(' ');
    let is_orphan = true;
    if (parts.length >= 3) {
      const prefix = `${parts[0]} ${parts[1]}`;
      const siblings = bldCmbByPrefix.get(prefix);
      if (siblings) {
        // Orphan iff no OTHER permit_num in the set — matches the
        // original SQL semantics (s.permit_num <> p.permit_num).
        for (const pn of siblings) {
          if (pn !== row.permit_num) {
            is_orphan = false;
            break;
          }
        }
      }
    }
    const insp = inspByPermit.get(row.permit_num) || EMPTY_INSP;
    const result = classifyLifecyclePhase({
      status: row.status,
      enriched_status: row.enriched_status,
      issued_date: row.issued_date,
      is_orphan,
      latest_passed_stage: insp.latest_passed_stage,
      latest_inspection_date: insp.latest_inspection_date,
      has_passed_inspection: insp.has_passed_inspection,
      now: RUN_AT,
      permitIssuedStallDays: PERMIT_ISSUED_STALL_DAYS,
      inspectionStallDays:   INSPECTION_STALL_DAYS,
      p7aMaxDays:            P7A_MAX_DAYS,
      p7bMaxDays:            P7B_MAX_DAYS,
      orphanStallDays:       ORPHAN_STALL_DAYS,
    });
    permitBatch.push({
      permit_num: row.permit_num,
      revision_num: row.revision_num,
      phase: result.phase,
      stalled: result.stalled,
      // Phase 2 state machine: carry the old phase + context for
      // transition logging. old_phase is the value BEFORE this run's
      // classification. If old_phase !== phase, we log a transition.
      old_phase: row.old_phase,
      old_stalled: row.old_stalled, // for stall-change push dispatch
      permit_type: row.permit_type,
      neighbourhood_id: row.neighbourhood_id,
    });

    if (permitBatch.length >= PERMIT_BATCH_SIZE) {
      await flushPermitBatch(permitBatch);
      permitBatch = [];
    }
  }
  // Flush remainder
  if (permitBatch.length > 0) {
    await flushPermitBatch(permitBatch);
    permitBatch = [];
  }
  pipeline.log.info(
    '[classify-lifecycle-phase]',
    `Permits streaming complete: ${dirtyPermitsCount.toLocaleString()} dirty, ${permitsUpdated.toLocaleString()} updated, ${transitionsLogged.toLocaleString()} transitions`,
  );

  // ═══════════════════════════════════════════════════════════
  // Phase 2: classify dirty CoA rows
  // ═══════════════════════════════════════════════════════════
  //
  // §6.2: `coa_applications` is a mandatory streaming table. Using
  // pipeline.streamQuery prevents OOM on backfills where all 33K+
  // CoA rows may be dirty simultaneously.
  //
  // §14.2: days_since_activity computed against $1::timestamptz (RUN_AT)
  // so all rows in the stream use the same instant — no NOW() drift.
  //
  // Adversarial Probe 6: NULL last_seen_at must not silently degrade to
  // days_since_activity = 0. `GREATEST(0, NULL) = NULL` → Number(null) = 0
  // in JS, masking the null. Use an explicit CASE so the classifier sees
  // null (→ stalled=false, the only safe default for unknown activity).
  pipeline.log.info(
    '[classify-lifecycle-phase]',
    `Streaming dirty CoAs (stall threshold=${COA_STALL_THRESHOLD_DAYS}d)...`,
  );

  let dirtyCoAsCount = 0;
  let coasUpdated = 0;

  const flushCoaBatch = async (batch) => {
    if (batch.length === 0) return;

    const sql = buildCoaUpdateSQL(batch.length);
    // RUN_AT appended as last param — matches $${batchSize*3+1}::timestamptz.
    const params = [...flattenCoaBatch(batch), RUN_AT];
    const batchIds = batch.map((r) => r.id);

    await pipeline.withTransaction(pool, async (client) => {
      const result = await client.query(sql, params);
      coasUpdated += result.rowCount || 0;

      // §14.2: $2 is RUN_AT — same snapshot as the phase UPDATE above.
      await client.query(
        `UPDATE coa_applications
            SET lifecycle_classified_at = $2::timestamptz
          WHERE id = ANY($1::int[])
            AND (lifecycle_classified_at IS NULL
                 OR last_seen_at > lifecycle_classified_at)`,
        [batchIds, RUN_AT],
      );
    });
  };

  let coaBatch = [];
  for await (const row of pipeline.streamQuery(
    pool,
    `SELECT id, decision, linked_permit_num, status, last_seen_at,
            CASE
              WHEN last_seen_at IS NULL THEN NULL
              ELSE GREATEST(0, EXTRACT(EPOCH FROM ($1::timestamptz - last_seen_at)) / 86400.0)
            END::float AS days_since_activity
       FROM coa_applications
      WHERE lifecycle_classified_at IS NULL
         OR last_seen_at > lifecycle_classified_at`,
    [RUN_AT],
  )) {
    dirtyCoAsCount++;
    const result = classifyCoaPhase({
      decision: row.decision,
      linked_permit_num: row.linked_permit_num,
      status: row.status,
      daysSinceActivity: row.days_since_activity,
      stallThresholdDays: COA_STALL_THRESHOLD_DAYS,
    });
    coaBatch.push({ id: row.id, phase: result.phase, stalled: result.stalled });

    if (coaBatch.length >= COA_BATCH_SIZE) {
      await flushCoaBatch(coaBatch);
      coaBatch = [];
    }
  }
  // Flush remainder
  if (coaBatch.length > 0) {
    await flushCoaBatch(coaBatch);
    coaBatch = [];
  }
  pipeline.log.info(
    '[classify-lifecycle-phase]',
    `CoAs streaming complete: ${dirtyCoAsCount.toLocaleString()} dirty, ${coasUpdated.toLocaleString()} updated`,
  );

  // ═══════════════════════════════════════════════════════════
  // Phase 2b: backfill phase_started_at for existing permits
  // ═══════════════════════════════════════════════════════════
  //
  // One-time backfill: permits that have a lifecycle_phase but no
  // phase_started_at (set by the Phase 1 migration or prior runs
  // before the state-machine upgrade). Uses best-available proxies:
  //   P7* / P8 / P18 → issued_date
  //   P3-P6          → application_date
  //   P9-P17         → latest inspection_date (from rollup)
  //   P19 / P20      → last_seen_at
  //   O1-O3          → COALESCE(application_date, first_seen_at)
  //
  // Idempotent: WHERE phase_started_at IS NULL. Second run = 0 rows.
  // All timestamp sources are existing DB column values — no NOW() needed.
  const { rows: backfillRows } = await pool.query(
    `UPDATE permits
        SET phase_started_at = CASE
          WHEN lifecycle_phase IN ('P7a','P7b','P7c','P7d','P8','P18')
            THEN COALESCE(issued_date::timestamptz, first_seen_at)
          WHEN lifecycle_phase IN ('P3','P4','P5','P6')
            THEN COALESCE(application_date::timestamptz, first_seen_at)
          WHEN lifecycle_phase IN ('P9','P10','P11','P12','P13','P14','P15','P16','P17')
            THEN COALESCE(
              (SELECT MAX(i.inspection_date)::timestamptz
                 FROM permit_inspections i
                WHERE i.permit_num = permits.permit_num
                  AND i.status = 'Passed'),
              issued_date::timestamptz,
              first_seen_at
            )
          WHEN lifecycle_phase IN ('P19','P20')
            THEN last_seen_at
          WHEN lifecycle_phase IN ('O1','O2','O3')
            THEN COALESCE(application_date::timestamptz, first_seen_at)
          ELSE first_seen_at
        END
      WHERE lifecycle_phase IS NOT NULL
        AND phase_started_at IS NULL
    RETURNING 1`,
  );
  const backfilledCount = backfillRows.length;
  if (backfilledCount > 0) {
    pipeline.log.info(
      '[classify-lifecycle-phase]',
      `Backfilled phase_started_at for ${backfilledCount.toLocaleString()} permits`,
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 2c: backfill initial transition rows (atomic)
  // ═══════════════════════════════════════════════════════════
  //
  // For existing classified permits that have no transition history
  // yet, write a single "initial classification" row with
  // from_phase = NULL. This gives the calibration engine baseline
  // data from day 1.
  //
  // WF3-03 PR-C (84-W3): wrapped in pipeline.withTransaction so a
  // first-run backfill that could write up to ~237K rows in one
  // statement no longer leaves partial state on crash. The NOT EXISTS
  // guard makes re-runs idempotent (subsequent runs see 0 rows after
  // the backfill commits). The single-statement INSERT…SELECT runs
  // fine inside one transaction at this row count — Postgres holds
  // the WAL frame in memory and commits at COMMIT, with rollback on
  // any error.
  //
  // §14.2: COALESCE(phase_started_at, $1::timestamptz) — RUN_AT as
  // the fallback when phase_started_at is NULL, avoiding an inline NOW().
  let initialTransCount = 0;
  await pipeline.withTransaction(pool, async (client) => {
    const { rows: initialTransRows } = await client.query(
      `INSERT INTO permit_phase_transitions
         (permit_num, revision_num, from_phase, to_phase, transitioned_at, permit_type, neighbourhood_id)
       SELECT permit_num, revision_num, NULL, lifecycle_phase,
              COALESCE(phase_started_at, $1::timestamptz),
              permit_type, neighbourhood_id
         FROM permits
        WHERE lifecycle_phase IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM permit_phase_transitions t
             WHERE t.permit_num = permits.permit_num
               AND t.revision_num = permits.revision_num
          )
      RETURNING 1`,
      [RUN_AT],
    );
    initialTransCount = initialTransRows.length;
  });
  if (initialTransCount > 0) {
    pipeline.log.info(
      '[classify-lifecycle-phase]',
      `Backfilled ${initialTransCount.toLocaleString()} initial transition rows`,
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 3: distribution telemetry + blocking unclassified check
  // ═══════════════════════════════════════════════════════════
  const { rows: distRows } = await pool.query(
    `SELECT lifecycle_phase, COUNT(*)::int AS n
       FROM permits
      GROUP BY lifecycle_phase
      ORDER BY lifecycle_phase NULLS LAST`,
  );
  const phaseDistribution = {};
  for (const r of distRows) {
    phaseDistribution[r.lifecycle_phase === null ? 'null' : r.lifecycle_phase] = r.n;
  }

  const { rows: coaDistRows } = await pool.query(
    `SELECT lifecycle_phase, COUNT(*)::int AS n
       FROM coa_applications
      GROUP BY lifecycle_phase`,
  );
  const coaDistribution = {};
  for (const r of coaDistRows) {
    coaDistribution[r.lifecycle_phase === null ? 'null' : r.lifecycle_phase] = r.n;
  }

  const { rows: stalledRows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM permits WHERE lifecycle_stalled = true`,
  );
  const stalledCount = stalledRows[0].n;

  // Unclassified count — uses DEAD_STATUS_ARRAY from the shared lib
  // (single source of truth) instead of hardcoding 13 statuses inline.
  // See WF3 Bug #4 (drift risk from 3 independent copies).
  //
  // Note `TRIM(status) <> ''`: the JS classifier's `normalizeStatus`
  // trims whitespace-only statuses to null BEFORE checking the dead
  // set, so whitespace-only rows get phase=null but should be excluded
  // from the unclassified count. See independent review Defect 2.
  const { rows: unclPermitRows } = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM permits
      WHERE lifecycle_phase IS NULL
        AND status <> ALL($1::text[])
        AND status IS NOT NULL
        AND TRIM(status) <> ''`,
    [DEAD_STATUS_ARRAY],
  );
  // WF3 Bug #3: also check CoA unclassified count. The CoA classifier
  // can silently leave rows with NULL phase if the decision-matching
  // logic breaks. Dead CoA decisions are excluded via the shared
  // NORMALIZED_DEAD_DECISIONS_ARRAY.
  const { rows: unclCoaRows } = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM coa_applications
      WHERE lifecycle_phase IS NULL
        AND linked_permit_num IS NULL
        AND lower(trim(regexp_replace(COALESCE(decision,''), '\\s+', ' ', 'g')))
            <> ALL($1::text[])
        AND decision IS NOT NULL
        AND TRIM(decision) <> ''`,
    [NORMALIZED_DEAD_DECISIONS_ARRAY],
  );
  const unclassifiedCount = unclPermitRows[0].n + unclCoaRows[0].n;

  // Build audit_table rows for the admin dashboard
  const auditRows = [
    { metric: 'permits_dirty', value: dirtyPermitsCount, threshold: null, status: 'INFO' },
    { metric: 'permits_updated', value: permitsUpdated, threshold: null, status: 'INFO' },
    { metric: 'coa_evaluated', value: dirtyCoAsCount, threshold: null, status: 'INFO' },
    { metric: 'coa_phase_changes', value: coasUpdated, threshold: null, status: 'INFO' },
    { metric: 'stalled_count', value: stalledCount, threshold: null, status: 'INFO' },
    {
      metric: 'unclassified_count',
      value: unclassifiedCount,
      threshold: '<= 100',
      status: unclassifiedCount <= 100 ? 'PASS' : 'FAIL',
    },
  ];

  // Log unclassified details if the threshold failed so operators can
  // see which statuses are missing from the decision tree.
  if (unclassifiedCount > 100) {
    const { rows: unclassifiedByStatus } = await pool.query(
      `SELECT status, COUNT(*)::int AS n
         FROM permits
        WHERE lifecycle_phase IS NULL
          AND status <> ALL($1::text[])
          AND status IS NOT NULL
          AND TRIM(status) <> ''
        GROUP BY status
        ORDER BY n DESC
        LIMIT 20`,
      [DEAD_STATUS_ARRAY],
    );
    pipeline.log.warn(
      '[classify-lifecycle-phase]',
      `BLOCKING: unclassified count ${unclassifiedCount} > 100. Top unhandled statuses:`,
      { unclassifiedByStatus },
    );
  }

  // START_DATE_URGENT dispatch — fire-and-forget, MUST NOT abort the run.
  try {
    await dispatchStartDateUrgentPushes(pool);
  } catch (err) {
    pipeline.log.warn('[classify-lifecycle-phase/push]', 'dispatchStartDateUrgentPushes threw unexpectedly', { err: err.message });
  }

  pipeline.emitSummary({
    records_total: dirtyPermitsCount,
    records_new: 0,
    records_updated: permitsUpdated,
    records_meta: {
      permits_updated: permitsUpdated,
      phase_transitions_logged: transitionsLogged,
      phase_started_at_backfilled: backfilledCount,
      initial_transitions_backfilled: initialTransCount,
      coas_updated: coasUpdated,
      phase_distribution: phaseDistribution,
      coa_distribution: coaDistribution,
      stalled_count: stalledCount,
      unclassified_count: unclassifiedCount,
      audit_table: {
        phase: 21, // visual ordering in admin dashboard, after assert_engine_health
        name: 'Classify Lifecycle Phase',
        verdict: unclassifiedCount <= 100 ? 'PASS' : 'FAIL',
        rows: auditRows,
      },
    },
  });

  pipeline.emitMeta(
    {
      permits: [
        'permit_num',
        'revision_num',
        'status',
        'enriched_status',
        'issued_date',
        'last_seen_at',
        'lifecycle_classified_at',
      ],
      permit_inspections: ['permit_num', 'stage_name', 'status', 'inspection_date'],
      coa_applications: [
        'id',
        'decision',
        'linked_permit_num',
        'status',
        'last_seen_at',
        'lifecycle_classified_at',
      ],
    },
    {
      permits: ['lifecycle_phase', 'lifecycle_stalled', 'lifecycle_classified_at', 'phase_started_at'],
      permit_phase_transitions: ['permit_num', 'revision_num', 'from_phase', 'to_phase', 'transitioned_at', 'permit_type', 'neighbourhood_id'],
      coa_applications: ['lifecycle_phase', 'lifecycle_stalled', 'lifecycle_classified_at'],
    },
  );

  // If unclassified threshold breached, emit a non-zero error so the
  // pipeline_runs row shows as FAIL. This is how the CQA gate operates.
  if (unclassifiedCount > 100) {
    throw new Error(
      `BLOCKING: ${unclassifiedCount} unclassified permits exceed threshold of 100. See log for top unhandled statuses.`,
    );
  }
  }); // end withAdvisoryLock

  // Lock was held by another instance — helper already emitted SKIP summary.
  if (!lockResult.acquired) {
    pipeline.emitMeta({}, {});
    return;
  }
});
