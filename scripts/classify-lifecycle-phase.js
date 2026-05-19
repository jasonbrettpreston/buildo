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
  // Phase E.2 (2026-05-14): consumer switched back from classifyCoaPhaseLegacy
  // to the full E.1 substrate classifyCoaPhase. Now writes 11 columns per row
  // (phase + stalled + lifecycle_seq/group/block/stage + bid_value + 4 audit cols).
  // Drives the 0.6% → ≥95% non-NULL coverage jump on first E.2 production run.
  classifyCoaPhase,
  mapToUniversalStream,
  DEAD_STATUS_ARRAY,
  NORMALIZED_DEAD_DECISIONS_ARRAY,
} = require('./lib/lifecycle-phase');
const { computeIsOrphan } = require('./lib/orphan-detection');
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

// WF3 2026-05-04 hardening (review_followups.md classify-lifecycle-phase
// bundle): Expo Push API returns 200 with errors embedded in the JSON
// body (per-ticket `status:'error'` + top-level errors). Pre-WF3 this
// function resolved on any HTTP response without inspecting status code
// or body — silently dropping pushes on 4xx/5xx, rate-limit responses,
// and per-ticket DeviceNotRegistered errors. Now the function rejects on
// non-2xx and parses Expo's per-ticket error array, throwing a
// summarised error that the caller's catch surfaces via pipeline.log.
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
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`Expo Push API ${status}: ${data.slice(0, 500)}`));
            return;
          }
          // Parse JSON body to surface per-ticket errors. Expo returns
          // `{ data: [{ status: 'ok'|'error', message?, details? }, ...] }`
          // OR `{ errors: [...] }` on top-level failure.
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            // Non-JSON 2xx body — exotic but treat as success per the
            // pre-WF3 contract; the body is unused by callers.
            resolve(data);
            return;
          }
          if (Array.isArray(parsed?.errors) && parsed.errors.length > 0) {
            reject(new Error(`Expo Push API top-level errors: ${JSON.stringify(parsed.errors).slice(0, 500)}`));
            return;
          }
          // Surface per-ticket errors so the caller can log them. We don't
          // reject on per-ticket errors (some tickets succeeded) — just
          // attach a summary the caller can warn on.
          const tickets = Array.isArray(parsed?.data) ? parsed.data : [];
          const errored = tickets.filter((t) => t && t.status === 'error');
          if (errored.length > 0) {
            const summary = errored
              .slice(0, 5)
              .map((t) => `${t.details?.error ?? 'unknown'}: ${t.message ?? ''}`)
              .join('; ');
            pipeline.log.warn(
              '[classify-lifecycle-phase/push]',
              `Expo Push API returned ${errored.length}/${tickets.length} per-ticket errors`,
              { sample: summary },
            );
          }
          resolve(data);
        });
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
//
// WF3 2026-05-04 (review_followups.md classify-lifecycle-phase bundle):
// pre-WF3 the inner loop issued ONE pool.query per transition AND per
// stalled permit. With thousands of phase changes daily, this tipped
// Cloud SQL into connection exhaustion and held the advisory lock for
// the duration. Now each subroutine issues a SINGLE batched query using
// `(permit_num, revision_num) IN (SELECT * FROM unnest(...))` — see
// Spec 99 §9.14 commentary for column types (`permit_num text`,
// `revision_num varchar(10)`).
async function dispatchPhaseChangePushes(pool, transitions, stalledPermits) {
  const nowMs = Date.now();
  const messages = [];

  // LIFECYCLE_PHASE_CHANGED — batched lookup. WF3 Phase 7 amendment
  // (Gemini HIGH): defensively filter out rows with null permit_num or
  // revision_num before flattening into the unnest arrays. Tuple-IN with
  // a NULL element returns UNKNOWN (per SQL spec), so `(lv.permit_num,
  // lv.revision_num) IN (SELECT ...)` would silently drop the affected
  // permits. `permits.revision_num` is currently NOT NULL by schema, so
  // the filter is defense-in-depth against future migrations that relax
  // the constraint OR upstream code that ever produces a {permit_num: ...,
  // revision_num: null} transition row.
  if (transitions.length > 0) {
    const validTransitions = transitions.filter(
      (t) => t.permit_num != null && t.revision_num != null,
    );
    const permitNums = validTransitions.map((t) => t.permit_num);
    const revisionNums = validTransitions.map((t) => t.revision_num);
    let rows;
    try {
      const result = await pool.query(
        `SELECT lv.permit_num, lv.revision_num, dt.push_token,
                up.phase_changed, up.notification_schedule
           FROM lead_views lv
           JOIN device_tokens dt ON dt.user_id = lv.user_id
           JOIN user_profiles up ON up.user_id = lv.user_id
          WHERE (lv.permit_num, lv.revision_num) IN (
                  SELECT * FROM unnest($1::text[], $2::varchar[])
                )
            AND lv.saved = true`,
        [permitNums, revisionNums],
      );
      rows = result.rows;
    } catch (err) {
      pipeline.log.warn(
        '[classify-lifecycle-phase/push]',
        `PHASE_CHANGED batched query failed for ${transitions.length} transitions`,
        { err: err.message },
      );
      rows = [];
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
          entity_id: `${row.permit_num}--${row.revision_num}`,
          urgency: 'normal',
        },
      });
    }
  }

  // LIFECYCLE_STALLED — batched lookup. Bypasses schedule gate (spec §2.2).
  // Same null-filter rationale as the PHASE_CHANGED branch above.
  if (stalledPermits.length > 0) {
    const validStalled = stalledPermits.filter(
      (s) => s.permit_num != null && s.revision_num != null,
    );
    const permitNums = validStalled.map((s) => s.permit_num);
    const revisionNums = validStalled.map((s) => s.revision_num);
    let rows;
    try {
      const result = await pool.query(
        // Spec 99 §9.14: read the lifecycle_stalled_pref column (renamed
        // from notification_prefs.lifecycle_stalled to disambiguate from
        // permits.lifecycle_stalled in joins).
        `SELECT lv.permit_num, lv.revision_num, dt.push_token, up.lifecycle_stalled_pref
           FROM lead_views lv
           JOIN device_tokens dt ON dt.user_id = lv.user_id
           JOIN user_profiles up ON up.user_id = lv.user_id
          WHERE (lv.permit_num, lv.revision_num) IN (
                  SELECT * FROM unnest($1::text[], $2::varchar[])
                )
            AND lv.saved = true`,
        [permitNums, revisionNums],
      );
      rows = result.rows;
    } catch (err) {
      pipeline.log.warn(
        '[classify-lifecycle-phase/push]',
        `LIFECYCLE_STALLED batched query failed for ${stalledPermits.length} permits`,
        { err: err.message },
      );
      rows = [];
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
          entity_id: `${row.permit_num}--${row.revision_num}`,
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
      //
      // WF3 2026-05-04 (review_followups.md classify-lifecycle-phase
      // bundle): added ORDER BY clause matching the DISTINCT ON tuple +
      // a tiebreaker. PostgreSQL's `SELECT DISTINCT ON (cols)` without
      // a matching ORDER BY returns an arbitrary row per group — could
      // silently drop legitimate subscribers OR return the wrong
      // predicted_start. The tiebreaker `tf.predicted_start ASC` picks
      // the earliest predicted_start when a (permit, revision, token)
      // tuple has multiple forecast rows in the 6-7 day window (rare
      // but possible across multiple trade forecasts on the same
      // permit) — earliest date wins because the urgency message is
      // stated as "starting in N days", and the user wants the
      // earliest-actionable signal.
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
          AND tf.predicted_start <= NOW() + INTERVAL '7 days'
        ORDER BY tf.permit_num, tf.revision_num, dt.push_token, tf.predicted_start ASC`,
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

// Phase E.2 — COA_BATCH_SIZE is heap-bounded, NOT param-bounded.
// With unnest array form, total bind params = 13 (12 arrays + 1 RUN_AT)
// regardless of batch size. PG 65535 param limit does NOT apply.
// 5000 rows × 12 columns × ~50 bytes ≈ 3 MB per batch — comfortable for
// Node default heap. Chosen for round-trip efficiency: 5K rows = ~7 batches
// on 33K first-run.
const COA_BATCH_SIZE = 5000;
// ─────────────────────────────────────────────────────────────────

// Phase I.1.1b — unnest array form (mirror COA_UPDATE_SQL pattern at line ~441).
// 8 bind params constant regardless of batch size: 7 arrays + 1 RUN_AT, well below
// the PG 65535 param limit. Replaces the prior positional VALUES tuples form
// which would have ballooned to 8 cols × batchSize at moderate sizes.
//
// IMPORTANT (Independent IMPORTANT v1 fold): the `phase_started_at` CASE
// expression must be preserved. CoA template has no equivalent — must be
// carried over manually. Stamping fires ONLY on lifecycle_phase change, NOT
// when only stalled changes — preserves the immutable phase-start anchor.
const PERMIT_UPDATE_SQL = `
  UPDATE permits p SET
    lifecycle_phase           = upd.phase,
    lifecycle_stalled         = upd.stalled,
    matched_status            = upd.matched_status,
    matched_rule              = upd.matched_rule,
    unmapped_status           = upd.unmapped_status,
    lifecycle_classified_at   = $8::timestamptz,
    phase_started_at = CASE
      WHEN p.lifecycle_phase IS DISTINCT FROM upd.phase
      THEN $8::timestamptz
      ELSE p.phase_started_at
    END
  FROM (
    SELECT * FROM unnest(
      $1::varchar[],     -- permit_nums
      $2::varchar[],     -- revision_nums
      $3::varchar[],     -- phases (nullable)
      $4::boolean[],     -- stalleds
      $5::text[],        -- matched_statuses (nullable for rule 0/1)
      $6::smallint[],    -- matched_rules (0..15)
      $7::boolean[]      -- unmapped_status flags
    ) AS u(permit_num, revision_num, phase, stalled, matched_status, matched_rule, unmapped_status)
  ) upd
  WHERE p.permit_num = upd.permit_num
    AND p.revision_num = upd.revision_num
    AND (p.lifecycle_phase     IS DISTINCT FROM upd.phase
      OR p.lifecycle_stalled   IS DISTINCT FROM upd.stalled
      OR p.matched_status      IS DISTINCT FROM upd.matched_status
      OR p.matched_rule        IS DISTINCT FROM upd.matched_rule
      OR p.unmapped_status     IS DISTINCT FROM upd.unmapped_status)
`;

// Phase E.2 — unnest array-param form. 12 array params + 1 RUN_AT = 13 bind params
// regardless of batch size. Writes 11 columns + lifecycle_classified_at per row.
// IS DISTINCT FROM clauses cover all 11 columns to capture catalog-evolution
// scenarios (a catalog row's lifecycle_group could change while seq stays the same).
const COA_UPDATE_SQL = `
  UPDATE coa_applications ca SET
    lifecycle_phase           = upd.phase,
    lifecycle_stalled         = upd.stalled,
    lifecycle_seq             = upd.lifecycle_seq,
    lifecycle_group           = upd.lifecycle_group,
    lifecycle_block           = upd.lifecycle_block,
    lifecycle_stage           = upd.lifecycle_stage,
    bid_value                 = upd.bid_value,
    matched_status            = upd.matched_status,
    matched_rule              = upd.matched_rule,
    unmapped_status           = upd.unmapped_status,
    unmapped_decision         = upd.unmapped_decision,
    lifecycle_classified_at   = $13::timestamptz
  FROM (
    SELECT * FROM unnest(
      $1::int[],          -- ids
      $2::text[],         -- phases (nullable)
      $3::boolean[],      -- stalleds
      $4::int[],          -- seqs (nullable)
      $5::text[],         -- groups (nullable)
      $6::text[],         -- blocks (nullable)
      $7::text[],         -- stages (nullable)
      $8::decimal[],      -- bid_values (nullable)
      $9::text[],         -- matched_statuses (nullable)
      $10::smallint[],    -- matched_rules
      $11::boolean[],     -- unmapped_status flags
      $12::boolean[]      -- unmapped_decision flags
    ) AS u(id, phase, stalled, lifecycle_seq, lifecycle_group, lifecycle_block,
           lifecycle_stage, bid_value, matched_status, matched_rule,
           unmapped_status, unmapped_decision)
  ) upd
  WHERE ca.id = upd.id
    AND (ca.lifecycle_phase           IS DISTINCT FROM upd.phase
      OR ca.lifecycle_stalled         IS DISTINCT FROM upd.stalled
      OR ca.lifecycle_seq             IS DISTINCT FROM upd.lifecycle_seq
      OR ca.lifecycle_group           IS DISTINCT FROM upd.lifecycle_group
      OR ca.lifecycle_block           IS DISTINCT FROM upd.lifecycle_block
      OR ca.lifecycle_stage           IS DISTINCT FROM upd.lifecycle_stage
      OR ca.bid_value                 IS DISTINCT FROM upd.bid_value
      OR ca.matched_status            IS DISTINCT FROM upd.matched_status
      OR ca.matched_rule              IS DISTINCT FROM upd.matched_rule
      OR ca.unmapped_status           IS DISTINCT FROM upd.unmapped_status
      OR ca.unmapped_decision         IS DISTINCT FROM upd.unmapped_decision)
`;

// Phase E.2 transitions INSERT — ON CONFLICT idempotency via mig 146's
// uix_lifecycle_transitions_idempotency UNIQUE INDEX on (lead_id, transitioned_at).
const COA_TRANSITIONS_INSERT_SQL = `
  INSERT INTO lifecycle_transitions
    (lead_id, from_phase, to_phase, from_seq, to_seq,
     transitioned_at, permit_type, project_type,
     coa_type_class, neighbourhood_id)
  SELECT * FROM unnest(
    $1::text[],     -- lead_ids
    $2::text[],     -- from_phases (nullable, from JS batch.old_phase)
    $3::text[],     -- to_phases
    $4::int[],      -- from_seqs (nullable, from JS batch.old_seq)
    $5::int[],      -- to_seqs (nullable)
    $6::timestamptz[],
    $7::text[],     -- permit_types
    $8::text[],     -- project_types
    $9::text[],     -- coa_type_classes
    $10::bigint[]   -- neighbourhood_ids
  ) AS t(lead_id, from_phase, to_phase, from_seq, to_seq,
         transitioned_at, permit_type, project_type, coa_type_class, neighbourhood_id)
  ON CONFLICT (lead_id, transitioned_at) DO NOTHING
`;

// Phase E.2 audit_table helpers.
// computeWarnableAuditStatus is for "lower-is-better" thresholds (e.g., unmapped counts).
// For zero-tolerance metrics (catalog_invalid_phase_count), use inline ternary
// (`count === 0 ? 'PASS' : 'FAIL'`) — two patterns coexist intentionally.
function computeWarnableAuditStatus(value, { passAt, warnAt }) {
  if (value <= passAt) return 'PASS';
  if (value <= warnAt) return 'WARN';
  return 'FAIL';
}

// Build top-N matched-status distribution + __other__ bucket for records_meta.
function buildTop20WithOther(map) {
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 20);
  const tail = sorted.slice(20);
  const result = Object.fromEntries(top);
  if (tail.length > 0) {
    result.__other__ = tail.reduce((sum, [, v]) => sum + v, 0);
  }
  return result;
}

// Phase I.1.1b — build 7 unnest array params from permitBatch rows (one array per column).
// Mirrors buildCoaUpdateArrays at line 547. Used by PERMIT_UPDATE_SQL.
function buildPermitUpdateArrays(rows) {
  return [
    rows.map((r) => r.permit_num),
    rows.map((r) => r.revision_num),
    rows.map((r) => r.phase),
    rows.map((r) => r.stalled),
    rows.map((r) => r.matched_status),
    rows.map((r) => r.matched_rule),
    rows.map((r) => r.unmapped_status),
  ];
}

// Phase E.2 — build 12 unnest array params from coaBatch rows (one array per column).
function buildCoaUpdateArrays(rows) {
  return [
    rows.map((r) => r.id),
    rows.map((r) => r.phase),
    rows.map((r) => r.stalled),
    rows.map((r) => r.lifecycle_seq),
    rows.map((r) => r.lifecycle_group),
    rows.map((r) => r.lifecycle_block),
    rows.map((r) => r.lifecycle_stage),
    rows.map((r) => r.bid_value),
    rows.map((r) => r.matched_status),
    rows.map((r) => r.matched_rule),
    rows.map((r) => r.unmapped_status),
    rows.map((r) => r.unmapped_decision),
  ];
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

  // Phase I.1.1b — first-deploy grace flag (Observability MED fold, mirror
  // F.1 coaFirstDeployGrace pattern at compute-trade-forecasts.js:261-272).
  // Counts prior chain runs older than 7 days. TRUE during first 7 days
  // post-extension-deploy. Used to soften `permit_unmapped_status_count`
  // WARN→INFO during the grace window — operators understand the spike is
  // expected and not actionable.
  //
  // DeepSeek DIFF-CRIT fold: the script is invoked from BOTH chains
  // (`permits:classify-lifecycle-phase` AND `coa:classify-lifecycle-phase`
  // — `run-chain.js:321` adds the `${chainId}:` prefix) AND standalone
  // (`classify-lifecycle-phase`). The IN clause covers all three invocation
  // paths so the grace clock advances regardless of which chain calls it.
  //
  // The `records_meta->>'permit_classifier_extended' = 'true'` filter scopes
  // the grace window to runs that include I.1.1b's new audit rows; prior
  // I.1.1a runs (without the extension) don't count toward the 7-day clock.
  const { rows: graceRows } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '7 days')::int AS prior_runs_7d
       FROM pipeline_runs
      WHERE pipeline IN ('permits:classify-lifecycle-phase',
                         'coa:classify-lifecycle-phase',
                         'classify-lifecycle-phase')
        AND records_meta->>'permit_classifier_extended' = 'true'`,
  );
  const permitFirstDeployGrace = (graceRows[0]?.prior_runs_7d ?? 0) === 0;

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
  // Phase E.2 — Migration-existence guard + Universal Stream catalog Map
  // ═══════════════════════════════════════════════════════════
  // Both run INSIDE the lock callback to preserve the existing invariant
  // (§4 above: all state-dependent initialization is lock-isolated).
  //
  // Guard #1 (migration 146): fail fast if mig 146 hasn't been applied —
  // would otherwise crash later with confusing column-doesn't-exist errors.
  const { rows: colCheck } = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'coa_applications'
        AND column_name IN ('matched_status','matched_rule','unmapped_status','unmapped_decision')`,
  );
  const expectedCols = new Set(['matched_status', 'matched_rule', 'unmapped_status', 'unmapped_decision']);
  const foundCols = new Set(colCheck.map((r) => r.column_name));
  const missing = [...expectedCols].filter((c) => !foundCols.has(c));
  if (missing.length > 0) {
    throw new Error(
      `[classify-lifecycle-phase] migration 146 not applied — missing columns on coa_applications: ` +
      `${missing.join(', ')}. Apply migrations/146_e2_coa_audit_columns.sql before running.`,
    );
  }

  // Build universal_stream_catalog lookup Map (column aliases bridge schema names).
  // NOTE: bid_value DECIMAL(3,2) parsed as float; 0-1 range non-financial use case.
  //       parseFloat + isFinite guard avoids Number('') = 0 trap.
  const catalogByStatusSource = new Map();
  const { rows: catalogRows } = await pool.query(
    `SELECT seq,
            lifecycle_group AS "group",
            lifecycle_block AS "block",
            lifecycle_stage AS "stage",
            phase, bid_value, source, status
       FROM universal_stream_catalog`,
  );
  for (const r of catalogRows) {
    const bvNum = r.bid_value === null ? null : parseFloat(r.bid_value);
    const bidValueSafe = (bvNum === null || !Number.isFinite(bvNum)) ? null : bvNum;
    catalogByStatusSource.set(`${r.source}:${r.status}`, Object.freeze({
      seq: r.seq,
      group: r.group,
      block: r.block,
      stage: r.stage,
      phase: r.phase,
      bid_value: bidValueSafe,
    }));
  }
  if (catalogByStatusSource.size === 0) {
    throw new Error(
      '[classify-lifecycle-phase] universal_stream_catalog returned 0 rows — ' +
      'CoA classification cannot proceed. Verify migration 129 seed.',
    );
  }
  // Guard #2: catalog must have at least one coa.status row.
  // Defends against catalog source rename in a future migration silently
  // disabling CoA classification.
  const hasCoaStatusRows = Array.from(catalogByStatusSource.keys())
    .some((k) => k.startsWith('coa.status:'));
  if (!hasCoaStatusRows) {
    throw new Error(
      '[classify-lifecycle-phase] universal_stream_catalog has no coa.status rows — ' +
      'CoA classification cannot proceed.',
    );
  }
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

  // Phase I.1.1b — permit-side audit accumulators (mirror CoA-side
  // unmappedStatusCount + distributions at line ~1105-1116). Tracked at script
  // scope so flushPermitBatch can update them per batch.
  let permitUnmappedStatusCount = 0;       // rule 15 fires
  let permitCodeDriftCount = 0;            // Spec 84 §2.5.a rows 6/7/10 visibility
  const permitRuleDistribution = new Map();      // rule N → count
  const permitMatchedStatusCounts = new Map();   // matched_status → count

  // Phase I.1.1b — code-drift status set (Spec 84 §2.5.a rows 6/7/10).
  // INFO-only counter; surfacing for operator visibility, NOT a CQA gate.
  const PERMIT_CODE_DRIFT_STATUSES = new Set([
    'Not Started',           // §2.5.a row 6 — city says pre-review, code says P7d post-issuance
    'Not Started - Express', // §2.5.a row 7 — same as row 6
    'Plan Review Complete',  // §2.5.a row 10 — city says end-of-Phase-2, code says INTAKE_P3
  ]);

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

    // Phase I.1.1b — unnest array form. 7 arrays + RUN_AT = 8 bind params constant.
    const params = [...buildPermitUpdateArrays(batch), RUN_AT];
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

    // Phase I.1.1b — accumulate audit distributions BEFORE the transaction.
    // (The UPDATE rowCount only reflects rows that changed; the distributions
    // need every classified row regardless of IS DISTINCT FROM result.)
    for (const r of batch) {
      if (r.unmapped_status) permitUnmappedStatusCount += 1;
      if (r.matched_status != null && PERMIT_CODE_DRIFT_STATUSES.has(r.matched_status)) {
        permitCodeDriftCount += 1;
      }
      const ruleKey = `rule_${r.matched_rule}`;
      permitRuleDistribution.set(ruleKey, (permitRuleDistribution.get(ruleKey) ?? 0) + 1);
      if (r.matched_status != null) {
        permitMatchedStatusCounts.set(
          r.matched_status,
          (permitMatchedStatusCounts.get(r.matched_status) ?? 0) + 1,
        );
      }
    }

    await pipeline.withTransaction(pool, async (client) => {
      // (a) Phase/stalled/matched_* UPDATE + conditional phase_started_at stamp.
      const result = await client.query(PERMIT_UPDATE_SQL, params);
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

      // (c) Phase I.1 permit-side lifecycle_status_history ledger write.
      // Filter rows where matched_status diff-compares to old_matched_status
      // (Q2 zero-delta suppression per v2.3 plan). SAVEPOINT pattern wraps the
      // INSERT — ledger errors emit WARN but primary UPDATEs (a)/(b) survive.
      const ledgerRows = batch.filter((r) =>
        r.matched_status != null && r.matched_status !== r.old_matched_status,
      );
      if (ledgerRows.length > 0) {
        try {
          await client.query('SAVEPOINT ledger_write');
          const ledgerRes = await client.query(
            `INSERT INTO lifecycle_status_history
               (lead_id, from_status, to_status, from_seq, to_seq,
                from_phase, to_phase, transitioned_at, detected_by, permit_type)
             SELECT * FROM UNNEST(
               $1::text[], $2::varchar[], $3::varchar[],
               $4::integer[], $5::integer[],
               $6::varchar[], $7::varchar[],
               $8::timestamptz[], $9::varchar[], $10::varchar[]
             )
             ON CONFLICT (lead_id, to_status, date_trunc('second', transitioned_at AT TIME ZONE 'UTC'))
             DO NOTHING`,
            [
              ledgerRows.map((r) => 'permit:' + r.permit_num + ':' + String(r.revision_num).padStart(2, '0')),
              ledgerRows.map((r) => r.old_matched_status ?? null),
              ledgerRows.map((r) => r.matched_status),
              ledgerRows.map((r) => r.old_lifecycle_seq ?? null),
              ledgerRows.map((r) => r.lifecycle_seq ?? null),
              ledgerRows.map((r) => (r.phase !== r.old_phase ? (r.old_phase ?? null) : null)),
              ledgerRows.map((r) => (r.phase !== r.old_phase ? (r.phase ?? null) : null)),
              ledgerRows.map(() => RUN_AT),
              ledgerRows.map(() => 'classify-lifecycle-phase.js'),
              ledgerRows.map((r) => r.permit_type ?? null),
            ],
          );
          await client.query('RELEASE SAVEPOINT ledger_write');
          lifecycleStatusHistoryInserted += ledgerRes.rowCount || 0;
        } catch (ledgerErr) {
          try {
            await client.query('ROLLBACK TO SAVEPOINT ledger_write');
          } catch (rollbackErr) {
            pipeline.log.error('[classify-lifecycle-phase]',
              'ROLLBACK TO SAVEPOINT failed; transaction state may be unstable',
              { primaryError: ledgerErr.message, rollbackError: rollbackErr.message });
          }
          pipeline.log.warn('[classify-lifecycle-phase]',
            'permit-side ledger write failed; primary updates preserved',
            { error: ledgerErr.message });
          lifecycleStatusHistoryErrors++;
        }
      }

      // (d) Stamp classified_at for every row in this batch that is
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
    // Phase I.1 dirty SELECT extension (mig 155 enabled permits.matched_status):
    // matched_status AS old_matched_status — for ledger from_status diff comparison
    // lifecycle_seq AS old_lifecycle_seq — for ledger from_seq population
    //
    // Phase I.1.1b CRIT-2 fold (Independent + Observability 92-95% convergence):
    // Added `OR matched_rule IS NULL` to ensure existing classified permits
    // (lifecycle_classified_at populated + last_seen_at not advanced) ALSO get
    // matchedStatus/matchedRule populated on the first run after I.1.1b ships.
    // Mirror of CoA-side line ~1263 predicate. Without this clause, the matched_*
    // columns would stay NULL forever on already-classified permits.
    `SELECT permit_num, revision_num, status, enriched_status, issued_date, last_seen_at,
            lifecycle_phase AS old_phase, lifecycle_stalled AS old_stalled,
            matched_status AS old_matched_status,
            lifecycle_seq AS old_lifecycle_seq,
            permit_type, neighbourhood_id
       FROM permits
      WHERE lifecycle_classified_at IS NULL
         OR last_seen_at > lifecycle_classified_at
         OR matched_rule IS NULL`,
  )) {
    dirtyPermitsCount++;

    // Orphan detection — pure helper. Per Spec 84 §7, O-phases are for
    // "standalone trade permits" only (HVA/PLB/DRN/etc.); BLD and CMB
    // are parent permits and can never be orphans. Earlier inline logic
    // wrongly orphaned single-revision BLDs because their prefix Set
    // contained only themselves; the loop never set is_orphan = false.
    // See scripts/lib/orphan-detection.js for the spec-aligned check.
    const is_orphan = computeIsOrphan(row.permit_num, bldCmbByPrefix);
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
      // Phase 2 state machine: carry old phase for transition logging.
      old_phase: row.old_phase,
      old_stalled: row.old_stalled,
      permit_type: row.permit_type,
      neighbourhood_id: row.neighbourhood_id,
      // Phase I.1.1b — wire the extended classifier result (Spec 84 §3.7).
      // matchedStatus is the raw normalized input status (or null for rule 0/1).
      // matchedRule is 0..15 per the 18-rule precedence table.
      // unmappedStatus is true only when status was non-null but matched no
      // known set (rule 15 catchall).
      matched_status: result.matchedStatus,
      matched_rule: result.matchedRule,
      unmapped_status: result.unmappedStatus,
      old_matched_status: row.old_matched_status,
      // lifecycle_seq is permit-side dormant (not derived by classifyLifecyclePhase
      // — the universal stream catalog drives this on CoA side only).
      lifecycle_seq: null,
      old_lifecycle_seq: row.old_lifecycle_seq,
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
  let coasUpdated = 0;                  // total rows where any column changed (Phase E.2: renamed coa_rows_updated metric)
  let coaPhaseTransitionsCount = 0;     // E.2: actual phase OR seq changes that produced a lifecycle_transitions row
  // Phase I.1: classifier-side lifecycle_status_history ledger counters (both streams).
  // Tracked at script scope so flushPermitBatch + flushCoaBatch share them.
  let lifecycleStatusHistoryInserted = 0;
  let lifecycleStatusHistoryErrors = 0;
  let coaStalledCount = 0;              // E.2: CoA-side stall count (separate from permit-side stalled_count)
  let unmappedStatusCount = 0;          // E.2: rule 9 catchall OR data-drift signal
  let unmappedDecisionCount = 0;        // E.2: decision non-null but not in any decision set
  let catalogStatusMissingCount = 0;    // E.2: matchedStatus not in catalog Map (CKAN drift)
  let catalogInvalidPhaseCount = 0;     // E.2: status present but catalog row has non-standard phase

  // E.2 distribution accumulators — stored in pipeline_runs.records_meta only.
  // NOT passed to DeepSeek narrative (Spec 48 observer's contextJson excludes
  // records_meta distributions; deferred to Spec 48 Improvement D). Operators
  // query records_meta directly via the SQL in the operator pre-ack.
  const coaRuleDistribution = new Map();
  const coaPhaseDistributionLive = new Map();
  const coaMatchedStatusCounts = new Map();

  const flushCoaBatch = async (batch) => {
    if (batch.length === 0) return;

    const updateArrays = buildCoaUpdateArrays(batch);
    const batchIds = batch.map((r) => r.id);

    // v4 fold v3-5: phase OR seq change filter (catalog evolution may shift
    // seq without phase). Mirrors the IS DISTINCT FROM coverage in the UPDATE.
    // First-classification rows have old_phase + old_seq NULL — they pass the
    // filter so a ledger row is recorded with from_phase=NULL (matches existing
    // Phase 2c permit-side pattern).
    const phaseChangedBatch = batch.filter((b) => {
      const phaseChanged = (b.old_phase ?? null) !== (b.phase ?? null);
      const seqChanged   = (b.old_seq   ?? null) !== (b.lifecycle_seq ?? null);
      return phaseChanged || seqChanged;
    });

    await pipeline.withTransaction(pool, async (client) => {
      // (a) Main UPDATE — 11 cols + classified_at, single statement with
      //     IS DISTINCT FROM dead-update guard on all 11 cols. RUN_AT is $13.
      const result = await client.query(COA_UPDATE_SQL, [...updateArrays, RUN_AT]);
      coasUpdated += result.rowCount || 0;

      // (b) lifecycle_transitions INSERT for rows where phase or seq changed.
      //     ON CONFLICT (lead_id, transitioned_at) DO NOTHING via mig 146's
      //     UNIQUE INDEX — idempotent against crash-and-retry within the same run.
      //     Counter uses insertResult.rowCount (NOT phaseChangedBatch.length) so
      //     the audit metric reflects DB-committed rows even when ON CONFLICT fires
      //     — matches the permit-side pattern at line 898.
      if (phaseChangedBatch.length > 0) {
        const transInsertResult = await client.query(COA_TRANSITIONS_INSERT_SQL, [
          phaseChangedBatch.map((b) => b.lead_id),
          phaseChangedBatch.map((b) => b.old_phase),
          phaseChangedBatch.map((b) => b.phase),
          phaseChangedBatch.map((b) => b.old_seq),
          phaseChangedBatch.map((b) => b.lifecycle_seq),
          phaseChangedBatch.map(() => RUN_AT),
          phaseChangedBatch.map((b) => b.permit_type),
          phaseChangedBatch.map((b) => b.project_type),
          phaseChangedBatch.map((b) => b.coa_type_class),
          phaseChangedBatch.map((b) => b.neighbourhood_id),
        ]);
        coaPhaseTransitionsCount += transInsertResult.rowCount || 0;
      }

      // (b.2) Phase I.1 CoA-side lifecycle_status_history ledger write.
      // Q2 zero-delta suppression: only write when matched_status differs from
      // persisted value. SAVEPOINT pattern preserves primary transition writes
      // on ledger failures (per Spec 47 §R9 Tier 3 framework).
      const coaLedgerRows = batch.filter((r) =>
        r.matched_status != null && r.matched_status !== r.old_matched_status,
      );
      if (coaLedgerRows.length > 0) {
        try {
          await client.query('SAVEPOINT ledger_write');
          const ledgerRes = await client.query(
            `INSERT INTO lifecycle_status_history
               (lead_id, from_status, to_status, from_seq, to_seq,
                from_phase, to_phase, transitioned_at, detected_by,
                coa_type_class, project_type)
             SELECT * FROM UNNEST(
               $1::text[], $2::varchar[], $3::varchar[],
               $4::integer[], $5::integer[],
               $6::varchar[], $7::varchar[],
               $8::timestamptz[], $9::varchar[],
               $10::varchar[], $11::varchar[]
             )
             ON CONFLICT (lead_id, to_status, date_trunc('second', transitioned_at AT TIME ZONE 'UTC'))
             DO NOTHING`,
            [
              coaLedgerRows.map((r) => r.lead_id),
              coaLedgerRows.map((r) => r.old_matched_status ?? null),
              coaLedgerRows.map((r) => r.matched_status),
              coaLedgerRows.map((r) => r.old_seq ?? null),
              coaLedgerRows.map((r) => r.lifecycle_seq ?? null),
              coaLedgerRows.map((r) => (r.phase !== r.old_phase ? (r.old_phase ?? null) : null)),
              coaLedgerRows.map((r) => (r.phase !== r.old_phase ? (r.phase ?? null) : null)),
              coaLedgerRows.map(() => RUN_AT),
              coaLedgerRows.map(() => 'classify-lifecycle-phase.js'),
              coaLedgerRows.map((r) => r.coa_type_class ?? null),
              coaLedgerRows.map((r) => r.project_type ?? null),
            ],
          );
          await client.query('RELEASE SAVEPOINT ledger_write');
          lifecycleStatusHistoryInserted += ledgerRes.rowCount || 0;
        } catch (ledgerErr) {
          try {
            await client.query('ROLLBACK TO SAVEPOINT ledger_write');
          } catch (rollbackErr) {
            pipeline.log.error('[classify-lifecycle-phase]',
              'ROLLBACK TO SAVEPOINT failed; transaction state may be unstable',
              { primaryError: ledgerErr.message, rollbackError: rollbackErr.message });
          }
          pipeline.log.warn('[classify-lifecycle-phase]',
            'CoA-side ledger write failed; primary updates preserved',
            { error: ledgerErr.message });
          lifecycleStatusHistoryErrors++;
        }
      }

      // (c) Stamp classified_at for every row in this batch that is
      //     still dirty (last_seen_at > classified_at). Matches existing
      //     permit-side pattern (step (c) at line ~760).
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
    // Phase E.2 — extended SELECT carries lead_id + old_phase + old_seq
    // + cohort dimensions for lifecycle_transitions INSERT.
    // Backfill predicate uses `OR ca.matched_rule IS NULL` (NOT matched_status —
    // catchall rule 9 writes matched_status=NULL forever, would create infinite
    // re-classification loop). matched_rule is null only pre-classification;
    // monotonic NULL→non-NULL after first run, breaking the loop.
    // Phase I.1 dirty SELECT extension: matched_status AS old_matched_status for
    // Q2 zero-delta suppression on ledger writes.
    `SELECT ca.id,
            ca.lead_id,
            ca.decision,
            ca.linked_permit_num,
            ca.status,
            ca.last_seen_at,
            ca.lifecycle_phase   AS old_phase,
            ca.lifecycle_seq     AS old_seq,
            ca.matched_status    AS old_matched_status,
            ca.permit_type,
            ca.project_type,
            ca.coa_type_class,
            ca.neighbourhood_id,
            CASE
              WHEN ca.last_seen_at IS NULL THEN NULL
              ELSE GREATEST(0, EXTRACT(EPOCH FROM ($1::timestamptz - ca.last_seen_at)) / 86400.0)
            END::float AS days_since_activity
       FROM coa_applications ca
      WHERE ca.lifecycle_classified_at IS NULL
         OR ca.last_seen_at > ca.lifecycle_classified_at
         OR ca.matched_rule IS NULL`,
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
    // E.1 substrate authoritative phase (NEVER catalogRow.phase per Observability v4 fold #104).
    const catalogRow = mapToUniversalStream(catalogByStatusSource, result.matchedStatus, 'coa.status');

    // Catalog poisoning telemetry — split into 2 counters for triage clarity:
    //   - catalog_status_missing_count: status not in catalog Map (CKAN drift; add to seed)
    //   - catalog_invalid_phase_count:  status present but catalog phase non-standard (fix seed)
    // Rule 9 catchall has matchedStatus=null and is skipped here (correct).
    if (result.matchedStatus != null) {
      const rawCatalogRow = catalogByStatusSource.get(`coa.status:${result.matchedStatus}`);
      if (rawCatalogRow == null) {
        catalogStatusMissingCount++;
      } else if (catalogRow == null) {
        catalogInvalidPhaseCount++;
      }
    }

    coaBatch.push({
      id: row.id,
      lead_id: row.lead_id,
      old_phase: row.old_phase,
      old_seq: row.old_seq,
      old_matched_status: row.old_matched_status,  // Phase I.1: for Q2 zero-delta suppression on ledger
      permit_type: row.permit_type,
      project_type: row.project_type,
      coa_type_class: row.coa_type_class,
      neighbourhood_id: row.neighbourhood_id,
      // E.1 substrate authoritative — lifecycle_phase write target
      phase: result.phase,
      stalled: result.stalled,
      // Granular Universal Stream columns (catalogRow.* — null on catchall or catalog miss)
      lifecycle_seq: catalogRow?.seq ?? null,
      lifecycle_group: catalogRow?.group ?? null,
      lifecycle_block: catalogRow?.block ?? null,
      lifecycle_stage: catalogRow?.stage ?? null,
      bid_value: catalogRow?.bid_value ?? null,
      // New persisted audit columns (mig 146)
      matched_status: result.matchedStatus,
      matched_rule: result.matchedRule,
      unmapped_status: result.unmappedStatus,
      unmapped_decision: result.unmappedDecision,
    });

    // Distribution accumulators (NOT passed to DeepSeek — records_meta only).
    coaRuleDistribution.set(result.matchedRule, (coaRuleDistribution.get(result.matchedRule) || 0) + 1);
    coaPhaseDistributionLive.set(result.phase ?? 'null', (coaPhaseDistributionLive.get(result.phase ?? 'null') || 0) + 1);
    if (result.matchedStatus != null) {
      coaMatchedStatusCounts.set(
        result.matchedStatus,
        (coaMatchedStatusCounts.get(result.matchedStatus) || 0) + 1,
      );
    }
    if (result.stalled) coaStalledCount++;
    if (result.unmappedStatus) unmappedStatusCount++;
    if (result.unmappedDecision) unmappedDecisionCount++;

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
  //
  // Phase E.2 (DeepSeek diff HIGH 2): removed `AND linked_permit_num IS NULL`
  // filter — that was pre-E.1 carve-out for the now-removed Rule 0 short-circuit.
  // Post-E.1, linked CoAs are CLASSIFIED (not skipped), so any linked CoA with
  // NULL lifecycle_phase represents a real classification failure and must count.
  const { rows: unclCoaRows } = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM coa_applications
      WHERE lifecycle_phase IS NULL
        AND lower(trim(regexp_replace(COALESCE(decision,''), '\\s+', ' ', 'g')))
            <> ALL($1::text[])
        AND decision IS NOT NULL
        AND TRIM(decision) <> ''`,
    [NORMALIZED_DEAD_DECISIONS_ARRAY],
  );
  const unclassifiedCount = unclPermitRows[0].n + unclCoaRows[0].n;

  // Build audit_table rows for the admin dashboard
  // Phase E.2: 7 new CoA-side metrics (4 thresholded scalars + 2 INFO + 1 split-from-existing).
  // Spec 48 observer reads `audit_table.rows` for automated WARN/FAIL via extractIssues().
  // The 3 distributions live in records_meta only (manual operator inspection via SQL).
  // Phase I.1.1b — permit-side unmapped status WARN (mirror CoA absolute
  // threshold pattern at line ~1580, Observability HIGH 3 fold). During the
  // 7-day grace window the WARN is softened to INFO so first-deploy spike
  // doesn't dominate operator triage. Steady-state: 'Notice Sent' (§2.5.a
  // row 13) is the only known unmapped status — count of 1 = PASS expected.
  const permitUnmappedStatus = permitFirstDeployGrace
    ? 'INFO'
    : computeWarnableAuditStatus(permitUnmappedStatusCount, { passAt: 1, warnAt: 3 });

  const auditRows = [
    // Existing permit-side rows (unchanged)
    { metric: 'permits_dirty', value: dirtyPermitsCount, threshold: null, status: 'INFO' },
    { metric: 'permits_updated', value: permitsUpdated, threshold: null, status: 'INFO' },
    // Phase I.1.1b — permit-side matched-status outputs (Spec 84 §3.7).
    {
      metric: 'permit_unmapped_status_count',
      value: permitUnmappedStatusCount,
      threshold: permitFirstDeployGrace
        ? 'INFO during first-deploy grace (7d)'
        : '<=3 WARN, <=1 PASS',
      status: permitUnmappedStatus,
    },
    {
      // Operator visibility for Spec 84 §2.5.a CODE DRIFT rows (6/7/10).
      // INFO-only — drift correction is a separate WF3, not a CQA gate.
      metric: 'permit_code_drift_count',
      value: permitCodeDriftCount,
      threshold: 'INFO — Spec 84 §2.5.a documented drift',
      status: 'INFO',
    },
    {
      // Top-5 matchedRule hits (DIFF-stage Independent IMPORTANT fold).
      // Surfaces rule-by-rule distribution at-a-glance for the admin dashboard
      // without requiring an operator to query records_meta directly. The full
      // 16-rule distribution lives in records_meta.permit_rule_distribution.
      metric: 'permit_rule_distribution_top5',
      value: Object.fromEntries(
        [...permitRuleDistribution.entries()]
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5),
      ),
      threshold: null,
      status: 'INFO',
    },
    {
      // First-deploy grace visibility (1=active, 0=expired).
      metric: 'permit_first_deploy_grace',
      value: permitFirstDeployGrace ? 1 : 0,
      threshold: null,
      status: 'INFO',
    },
    // CoA-side existing (renamed: coa_phase_changes was misleading — counts ANY column change)
    { metric: 'coa_evaluated', value: dirtyCoAsCount, threshold: null, status: 'INFO' },
    { metric: 'coa_rows_updated', value: coasUpdated, threshold: null, status: 'INFO' },
    { metric: 'coa_phase_transitions_count', value: coaPhaseTransitionsCount, threshold: null, status: 'INFO' },
    // Phase I.1: classifier-side lifecycle_status_history ledger counters (Spec 47 §11.2 Overflow Rule).
    // Unconditional emission. WARN-grade error gate (NOT FAIL) preserves primary
    // transition-write verdict on ledger failures per Tier 3 SAVEPOINT pattern.
    { metric: 'lifecycle_status_history_inserted', value: lifecycleStatusHistoryInserted, threshold: null, status: 'INFO' },
    { metric: 'lifecycle_status_history_errors', value: lifecycleStatusHistoryErrors, threshold: '== 0', status: lifecycleStatusHistoryErrors > 0 ? 'WARN' : 'PASS' },
    // Existing permit-side stall (kept distinct from coa_stalled_count per Observability v4 fold #105)
    { metric: 'stalled_count', value: stalledCount, threshold: null, status: 'INFO' },
    // Phase E.2 NEW — 4 thresholded scalars + 1 INFO
    { metric: 'coa_stalled_count', value: coaStalledCount, threshold: null, status: 'INFO' },
    {
      metric: 'unmapped_status_count',
      value: unmappedStatusCount,
      threshold: '<=3 WARN, <=1 PASS',
      status: computeWarnableAuditStatus(unmappedStatusCount, { passAt: 1, warnAt: 3 }),
    },
    {
      metric: 'unmapped_decision_count',
      value: unmappedDecisionCount,
      threshold: '<=5 WARN, <=3 PASS',
      status: computeWarnableAuditStatus(unmappedDecisionCount, { passAt: 3, warnAt: 5 }),
    },
    {
      metric: 'catalog_status_missing_count',
      value: catalogStatusMissingCount,
      threshold: '<=3 WARN, <=1 PASS',
      status: computeWarnableAuditStatus(catalogStatusMissingCount, { passAt: 1, warnAt: 3 }),
    },
    {
      metric: 'catalog_invalid_phase_count',
      value: catalogInvalidPhaseCount,
      threshold: '=0 PASS, >0 FAIL',
      status: catalogInvalidPhaseCount === 0 ? 'PASS' : 'FAIL',
    },
    // Existing CQA gate
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

  // Phase E.2: audit_table.verdict computed from row statuses per Spec 47 §R10.
  // FAIL if any row is FAIL; else WARN if any is WARN; else PASS.
  const hasFail = auditRows.some((r) => r.status === 'FAIL');
  const hasWarn = auditRows.some((r) => r.status === 'WARN');
  const auditVerdict = hasFail ? 'FAIL' : (hasWarn ? 'WARN' : 'PASS');

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
      // Phase E.2 NEW — 3 distributions in records_meta (NOT in audit_table.rows).
      // Surfaced for manual operator inspection only — Spec 48 observer reads
      // audit_table.rows for automated WARN/FAIL; distributions land in
      // pipeline_runs.records_meta but are NOT passed to DeepSeek narrative
      // until Spec 48 Improvement D ships.
      // Phase I.1.1b — emit_meta sentinel. Drives the permitFirstDeployGrace
      // startup query (counts prior runs that included the matched_status
      // extension). Once 7 days of runs land, grace expires automatically.
      permit_classifier_extended: 'true',
      // Phase I.1.1b — permit-side distributions (Observability HIGH 4 fold).
      // Mirror CoA-side coa_rule_distribution + coa_matched_status_top20.
      permit_rule_distribution: Object.fromEntries(permitRuleDistribution),
      permit_matched_status_top20: buildTop20WithOther(permitMatchedStatusCounts),
      coa_rule_distribution: Object.fromEntries(coaRuleDistribution),
      coa_phase_distribution_live: Object.fromEntries(coaPhaseDistributionLive),
      coa_matched_status_top20: buildTop20WithOther(coaMatchedStatusCounts),
      audit_table: {
        phase: 21, // visual ordering in admin dashboard, after assert_engine_health
        name: 'Classify Lifecycle Phase',
        verdict: auditVerdict,
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
        // Phase I.1: new reads for ledger diff comparison (mig 155 columns).
        'matched_status',
        'lifecycle_seq',
      ],
      permit_inspections: ['permit_num', 'stage_name', 'status', 'inspection_date'],
      coa_applications: [
        'id',
        'lead_id',
        'decision',
        'linked_permit_num',
        'status',
        'last_seen_at',
        'lifecycle_phase',         // E.2: read as old_phase
        'lifecycle_seq',           // E.2: read as old_seq
        'permit_type',             // E.2: cohort dimension for transitions
        'project_type',
        'coa_type_class',
        'neighbourhood_id',
        'matched_rule',            // E.2: backfill predicate
        'matched_status',          // Phase I.1: ledger from_status diff comparison
        'lifecycle_classified_at',
      ],
      universal_stream_catalog: ['seq', 'lifecycle_group', 'lifecycle_block', 'lifecycle_stage', 'phase', 'bid_value', 'source', 'status'],
    },
    {
      permits: [
        'lifecycle_phase', 'lifecycle_stalled', 'lifecycle_classified_at', 'phase_started_at',
        // Phase I.1.1b — matched_* writes (mig 155 columns; populated for first time).
        'matched_status', 'matched_rule', 'unmapped_status',
      ],
      permit_phase_transitions: ['permit_num', 'revision_num', 'from_phase', 'to_phase', 'transitioned_at', 'permit_type', 'neighbourhood_id'],
      // Phase E.2: extended write list (mig 146 columns + granular Universal Stream)
      coa_applications: [
        'lifecycle_phase', 'lifecycle_stalled', 'lifecycle_classified_at',
        'lifecycle_seq', 'lifecycle_group', 'lifecycle_block', 'lifecycle_stage', 'bid_value',
        'matched_status', 'matched_rule', 'unmapped_status', 'unmapped_decision',
      ],
      lifecycle_transitions: ['lead_id', 'from_phase', 'to_phase', 'from_seq', 'to_seq', 'transitioned_at', 'permit_type', 'project_type', 'coa_type_class', 'neighbourhood_id'],
      // Phase I.1: lifecycle_status_history ledger writes (Tier 3 per Spec 47 §R9).
      // Both permit-side and CoA-side classifier rows write through this table.
      lifecycle_status_history: ['lead_id', 'from_status', 'to_status', 'from_seq', 'to_seq', 'from_phase', 'to_phase', 'transitioned_at', 'detected_by', 'permit_type', 'coa_type_class', 'project_type'],
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
