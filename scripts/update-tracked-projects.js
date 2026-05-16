#!/usr/bin/env node
/**
 * Update Tracked Projects — the CRM Assistant.
 *
 * Nightly pipeline script that processes saved + claimed projects,
 * detects state changes (stalled, urgency shifts, window closures),
 * generates alerts ONLY when reality shifts, and auto-archives dead
 * leads. Two "memory" columns (last_notified_urgency, last_notified_stalled)
 * prevent duplicate notifications across runs.
 *
 * Two routing paths:
 *   Path A (Saved): passive watchlist — auto-archive only, no alerts
 *   Path B (Claimed): active flight board — stall/recovery/imminent alerts
 *
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/82_crm_assistant_alerts.md
 *
 * DUAL PATH NOTE: N/A — this script processes saved + claimed tracked_projects
 * in two internal routing paths (Path A / Path B), but there is no separate
 * TypeScript module maintaining parity. src/lib/classification/scoring.ts is
 * unrelated (computes lead_score, not CRM alert state).
 */
'use strict';

const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const {
  TRADE_TARGET_PHASE_FALLBACK,
  PHASE_ORDINAL,
} = require('./lib/lifecycle-phase');
const { loadMarketplaceConfigs } = require('./lib/config-loader');

// Terminal phases that should trigger auto-archive regardless of
// ordinal comparison. PHASE_ORDINAL omits these, so isWindowClosed
// would never fire for P19/P20 permits. Independent review gap.
const TERMINAL_PHASES = new Set(['P19', 'P20']);

// Claimed statuses — these get the full alert treatment
const CLAIMED_STATUSES = new Set([
  'claimed_unverified', 'claimed', 'verified',
]);

// WF3-03 PR-B (H-W1): lock ID = spec number convention.
const ADVISORY_LOCK_ID = 82;

// spec §8.4: cap alerts array in records_meta at 200 items to prevent
// a burst of stalled projects from blowing up PIPELINE_SUMMARY payload.
const ALERTS_META_CAP = 200;

// WF3-01: Short push-friendly notification titles per spec 82 §4.
// The longer contextual sentence goes to notifications.body (see alerts.push calls).
const NOTIFICATION_TITLES = {
  STALL_WARNING:           'Site Stalled — Check your schedule.',
  STALL_CLEARED:           'Back to Work — Site is active again.',
  START_IMMINENT:          'Job Starting Soon — Confirm your crew.',
  // Phase F.2 new subtypes (Spec 82 §4)
  COA_HEARING_IMMINENT:    'Variance Hearing Soon — Confirm crew.',
  COA_DECISION_RENDERED:   'Variance Approved — Permit expected soon.',
  COA_STALLED:             'Variance Stalled — Project may be on hold.',
};

// spec 47 §6.3: stay under 65,535 parameters.
// notifications INSERT: 7 cols per row — user_id, type, permit_num,
// trade_slug, title, body, created_at → Math.floor(65535 / 7) = 9362.
const ALERT_INSERT_COLS = 7;
const ALERT_BATCH_SIZE  = Math.floor(65535 / ALERT_INSERT_COLS);

// Zod schema for per-trade config fields consumed by this script.
// spec 47 §4.2: validate before use — prevents silent wrong-type skips.
const TRADE_CONFIG_SCHEMA = z.object({
  bid_phase_cutoff:   z.string().min(1),
  work_phase_target:  z.string().min(1),
}).passthrough();

// Phase F.2 v4 — LOGIC_VARS_SCHEMA for CoA-side stall thresholds + imminent window.
// 4 keys total: 3 existing (mig 093 + mig 136) + 1 new (mig 154 — coa_stall_threshold_postponed_days).
// v2 CRIT-A: reads the existing `coa_stall_threshold` key (NOT `_days` variant — v1 naming drift).
const LOGIC_VARS_SCHEMA = z.object({
  coa_stall_threshold:                z.coerce.number().int().positive(),  // mig 093 default 30
  coa_stall_threshold_p2_days:        z.coerce.number().int().positive(),  // mig 136 default 90
  coa_stall_threshold_postponed_days: z.coerce.number().int().positive(),  // mig 154 default 60
  coa_imminent_window_days:           z.coerce.number().int().positive(),  // mig 136 default 7
}).passthrough();

// ─── Phase F.2 module-local pure helpers ────────────────────────────────────

// extractCoaApplicationNumber — regex-based lead_id parser (v3 LOW-20 fold).
// Returns null on non-CoA / malformed inputs; callers should fall back to 'unknown-coa' string.
function extractCoaApplicationNumber(leadId) {
  if (typeof leadId !== 'string') return null;
  const m = leadId.match(/^coa:(.+)$/);
  return m ? m[1] : null;
}

// selectCoaStallThreshold — Spec 82 §4 3-tier per-status mapping (v2 HIGH-I operator-tunable).
// v2 CRIT-A: reads existing `coa_stall_threshold` key (NOT `_days` suffix — v1 drift).
// v3 MED-18: null/empty status returns null; caller skips days-based stall (still honors
// the explicit lifecycle_stalled flag from the classifier).
function selectCoaStallThreshold(coaStatus, logicVars) {
  if (coaStatus == null || coaStatus === '') return null;
  if (coaStatus === 'Hearing Scheduled') return logicVars.coa_stall_threshold_p2_days;
  if (coaStatus === 'Postponed' || coaStatus === 'Deferred') return logicVars.coa_stall_threshold_postponed_days;
  return logicVars.coa_stall_threshold;
}

// isCoaInImminentWindow — hearing_date-based imminent gate (Spec 82 §4).
// v2 LOW-U: normalize to UTC midnight before subtraction (prevents DST off-by-one).
// v4 HIGH-GG: explicit UTC parse on string-form input (appends T00:00:00Z if missing — without
// this, `new Date('2026-07-15')` parses as engine-default timezone).
// v4 NIT-XX: zero/negative windowDays guard.
function isCoaInImminentWindow(hearingDate, runAt, windowDays) {
  if (!hearingDate) return false;
  if (typeof windowDays !== 'number' || windowDays <= 0) return false;
  const hearingStr = typeof hearingDate === 'string'
    ? (hearingDate.includes('T') ? hearingDate : hearingDate + 'T00:00:00Z')
    : hearingDate;
  const hearing = new Date(hearingStr);
  if (isNaN(hearing.getTime())) return false;
  hearing.setUTCHours(0, 0, 0, 0);
  const today = new Date(runAt);
  today.setUTCHours(0, 0, 0, 0);
  const daysUntilHearing = Math.floor((hearing.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  return daysUntilHearing > 0 && daysUntilHearing <= windowDays;
}

// isCoaDecisionTerminal — Spec 82 §4 decision-keyed auto-archive trigger.
const COA_TERMINAL_DECISIONS = new Set(['Refused', 'Withdrawn', 'Closed']);
function isCoaDecisionTerminal(coaDecision) {
  return typeof coaDecision === 'string' && COA_TERMINAL_DECISIONS.has(coaDecision);
}

// COA_APPROVED_DECISIONS — v2 CRIT-G fold: Final and Binding REMOVED per Spec 82 §4 contract
// ("decision = 'Final and Binding' → keep the lead; linked permit handles it later").
const COA_APPROVED_DECISIONS = new Set(['Approved', 'Approved with Conditions']);
function isCoaDecisionApproved(coaDecision) {
  return typeof coaDecision === 'string' && COA_APPROVED_DECISIONS.has(coaDecision);
}

// isCoaTerminalState — combined terminal-decision OR terminal-status check (v3 HIGH-11 + v4 CRIT-DD).
// Spec 84 §3 P20 maps status IN ('Complete', 'Closed') as terminal. v4 CRIT-DD added 'Closed'
// because 87.6% of CoAs have status='Closed' (most with decision='Approved' = lifecycle complete).
const COA_TERMINAL_STATUSES = new Set(['Complete', 'Closed']);
function isCoaTerminalState(coaStatus, coaDecision) {
  return isCoaDecisionTerminal(coaDecision)
      || (typeof coaStatus === 'string' && COA_TERMINAL_STATUSES.has(coaStatus));
}

pipeline.run('update-tracked-projects', async (pool) => {
  // ─── Concurrency guard — pipeline.withAdvisoryLock (Phase 2 migration) ───
  // §4: ALL state-dependent initialization (getDbTimestamp, loadMarketplaceConfigs)
  // MUST execute inside the lock callback to ensure absolute isolation.
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {

  // §R3.5: Capture run timestamp at pipeline startup — MANDATORY per skeleton.
  // Used as $1 in all updated_at writes to prevent the Midnight Cross.
  const RUN_AT = await pipeline.getDbTimestamp(pool);

  // ─── Load Control Panel via shared loader ──────────────────
  const { tradeConfigs, logicVars } = await loadMarketplaceConfigs(pool, 'tracked-projects');

  // Phase F.2 v4 Spec 47 §R4: validate CoA logic_variables at startup (fail-fast).
  // diff-IMPORTANT (Observability): emit a minimal failure-state PIPELINE_SUMMARY before throwing
  // so the Observer FreshnessTimeline shows a verdict + audit_table.rows entry rather than a bare
  // FAIL with no payload. Mirrors the §R10/§R12 emit-before-throw pattern used by E.3/E.4 scripts.
  const logicVarsResult = LOGIC_VARS_SCHEMA.safeParse(logicVars);
  if (!logicVarsResult.success) {
    const errMsg = logicVarsResult.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    pipeline.emitSummary({
      records_total: 0,
      records_new: 0,
      records_updated: 0,
      records_meta: {
        audit_table: {
          phase: 82,
          name: 'CRM Assistant — logic_variables validation',
          verdict: 'FAIL',
          rows: [{
            metric: 'logic_vars_validation',
            value: 0,
            threshold: '== PASS',
            status: 'FAIL',
          }],
        },
        validation_error: errMsg,
      },
    });
    throw new Error(`[tracked-projects] CoA logic_variables validation failed: ${errMsg}`);
  }
  // v4 NIT-YY fold: advisory warn if threshold ordering is unusual.
  if (logicVars.coa_stall_threshold_p2_days < logicVars.coa_stall_threshold) {
    pipeline.log.warn('[tracked-projects]',
      `[ADVISORY] coa_stall_threshold_p2_days (${logicVars.coa_stall_threshold_p2_days}) < coa_stall_threshold (${logicVars.coa_stall_threshold}) — Hearing Scheduled rows will stall faster than generic rows, contradicting Spec 82 §4 intent.`);
  }

  // Phase F.2 v4 HIGH-N: pre-fetch BOTH 7-day and 30-day deploy-age counts in a single query.
  // The pipeline slug must be 'permits:update_tracked_projects' (F.2's own pipeline — NOT F.1's).
  const { rows: deployAgeRows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '7 days')::int  AS prior_runs_7d,
       COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '30 days')::int AS prior_runs_30d
     FROM pipeline_runs
     WHERE pipeline = 'permits:update_tracked_projects'`,
  );
  const coaFirstDeployGrace = deployAgeRows[0].prior_runs_7d === 0;
  const inQuietPeriod = deployAgeRows[0].prior_runs_30d === 0;

  // spec 47 §4.2: validate each trade's required fields before use.
  // Invalid entries log a WARN and are treated as unmapped (skipped).
  const validTradeConfigs = {};
  for (const [slug, tc] of Object.entries(tradeConfigs)) {
    const result = TRADE_CONFIG_SCHEMA.safeParse(tc);
    if (!result.success) {
      pipeline.log.warn(
        '[tracked-projects]',
        `tradeConfigs[${slug}] missing required fields — trade will be skipped`,
        { errors: result.error.issues.map((i) => i.message) },
      );
    } else {
      validTradeConfigs[slug] = tc;
    }
  }

  // WF3 (2026-04-23): TRADE_TARGET_PHASE_FALLBACK used when trade_configurations
  // returns 0 valid entries — prevents silent 100% project-skip where every
  // row counts as unmappedTrade++. Mirrors the pattern in compute-trade-forecasts.js.
  let TRADE_TARGET_PHASE = TRADE_TARGET_PHASE_FALLBACK;
  const builtPhaseMap = Object.fromEntries(
    Object.entries(validTradeConfigs).map(([slug, tc]) => [slug, {
      bid_phase: tc.bid_phase_cutoff,
      work_phase: tc.work_phase_target,
    }]),
  );
  if (Object.keys(builtPhaseMap).length > 0) {
    TRADE_TARGET_PHASE = builtPhaseMap;
  } else {
    pipeline.log.warn(
      '[tracked-projects]',
      'trade_configurations returned 0 valid entries — using TRADE_TARGET_PHASE_FALLBACK',
    );
  }
  // ═══════════════════════════════════════════════════════════
  // Step 1: Stream all active tracked projects with forecast data
  //
  // spec 47 §6.1: tracked_projects is explicitly listed as always
  // requiring pipeline.streamQuery. pool.query would load the entire
  // active set into Node heap at once.
  //
  // §16.3 stale-snapshot guard not needed: advisory lock 82 prevents
  // concurrent script instances, and the two write-back targets
  // (tracked_projects.status/memory-columns, lead_analytics) are only
  // written by this script's own withTransaction blocks.
  // ═══════════════════════════════════════════════════════════
  pipeline.log.info('[tracked-projects]', 'Streaming active tracked projects...');

  // ╔═══════════════════════════════════════════════════════════════════════════════════╗
  // ║ Phase F.2 SOURCE_SQL — Branch A (permit-side, preserved + #118 naming standardized) ║
  // ║ + Branch B (NEW — CoA-side via tp.lead_id JOIN coa_applications).                   ║
  // ║                                                                                     ║
  // ║ Both branches project 20 columns with matching types per UNION ALL requirement.     ║
  // ║ Branch A WHERE includes mutual-exclusivity guard (v2 CRIT-C — prevents double-      ║
  // ║ processing of CoA-formatted lead_id rows with non-null permit_num).                 ║
  // ╚═══════════════════════════════════════════════════════════════════════════════════╝
  const SQL = `
    -- Branch A: permit-side (v2 #118 fold: rename permit_lead_id → lead_id)
    -- diff-CRIT parity: NULL ca_lead_id keeps column-count alignment with Branch B's new projection.
    SELECT
      tp.id AS tracking_id,
      tp.user_id,
      tp.status AS tracking_status,
      tp.trade_slug,
      tp.permit_num,
      tp.revision_num,
      p.lead_id AS lead_id,
      NULL::text         AS ca_lead_id,
      p.lifecycle_phase,
      p.lifecycle_stalled,
      NULL::varchar(50) AS coa_status,
      NULL::varchar(50) AS coa_decision,
      NULL::date         AS hearing_date,
      NULL::varchar(10)  AS lifecycle_group,
      tf.predicted_start,
      tf.urgency,
      tp.last_notified_urgency,
      tp.last_notified_stalled,
      NULL::boolean      AS notified_decision_rendered,
      COALESCE(tc.imminent_window_days, 14) AS imminent_window_days,
      NULL::int          AS coa_days_at_status
    FROM tracked_projects tp
    JOIN permits p ON tp.permit_num = p.permit_num
                  AND tp.revision_num = p.revision_num
    LEFT JOIN trade_forecasts tf ON tp.permit_num = tf.permit_num
                                 AND tp.revision_num = tf.revision_num
                                 AND tp.trade_slug = tf.trade_slug
    LEFT JOIN trade_configurations tc ON tc.trade_slug = tp.trade_slug
    WHERE tp.status IN ('saved', 'claimed_unverified', 'claimed', 'verified')
      AND tp.permit_num IS NOT NULL
      AND tp.revision_num IS NOT NULL
      AND (tp.lead_id IS NULL OR tp.lead_id NOT LIKE 'coa:%')

    UNION ALL

    -- Branch B: CoA-side (Phase F.2 NEW)
    -- v4 HIGH-JJ: LEFT JOIN coa_applications enables single-pass orphan detection inline in the
    --   stream loop (orphan rows have ca.* = NULL).
    -- diff-CRIT (Observability): ca_lead_id projected so JS can detect orphans by ca.lead_id IS NULL
    --   (reliable since coa_applications.lead_id is NOT NULL + UNIQUE per migration 133), instead of
    --   the brittle (lifecycle_phase IS NULL AND coa_status IS NULL) discriminant which would
    --   misidentify CKAN-null-status matched rows as orphans.
    -- diff-HIGH (DeepSeek + Gemini convergent): coa_days_at_status uses $1::timestamptz RUN_AT
    --   instead of NOW() — Spec 47 §14 Midnight Cross: a run spanning midnight could otherwise
    --   flip the day count mid-stream and cause inconsistent stall detection.
    SELECT
      tp.id AS tracking_id,
      tp.user_id,
      tp.status AS tracking_status,
      tp.trade_slug,
      tp.permit_num,
      tp.revision_num,
      tp.lead_id,
      ca.lead_id AS ca_lead_id,
      ca.lifecycle_phase,
      ca.lifecycle_stalled,
      ca.status   AS coa_status,
      ca.decision AS coa_decision,
      ca.hearing_date,
      ca.lifecycle_group,
      tf.predicted_start,
      tf.urgency,
      tp.last_notified_urgency,
      tp.last_notified_stalled,
      tp.notified_decision_rendered,
      NULL::int AS imminent_window_days,
      GREATEST(
        COALESCE(
          FLOOR(EXTRACT(EPOCH FROM ($1::timestamptz - ca.lifecycle_classified_at)) / 86400)::int,
          FLOOR(EXTRACT(EPOCH FROM ($1::timestamptz - ca.last_seen_at)) / 86400)::int,
          0
        ),
        0
      ) AS coa_days_at_status
    FROM tracked_projects tp
    LEFT JOIN coa_applications ca ON ca.lead_id = tp.lead_id
    LEFT JOIN trade_forecasts tf ON tf.lead_id = tp.lead_id
                                AND tf.trade_slug = tp.trade_slug
    WHERE tp.status IN ('saved', 'claimed_unverified', 'claimed', 'verified')
      AND tp.lead_id LIKE 'coa:%'
  `;

  // ═══════════════════════════════════════════════════════════
  // Step 2: Process each row through the routing engine
  // ═══════════════════════════════════════════════════════════
  const updates = [];  // {id, fields} — batched DB updates
  const alerts = [];   // {user_id, type, message} — notification payloads

  // Phase F.2: counters split per-branch. records_total = permit + CoA per Spec 47 §11.1.
  let totalRowsPermit = 0;
  let totalRowsCoa = 0;
  let archived = 0;          // permit-side archive count
  let archivedCoa = 0;       // CoA-side archive count (v3 HIGH-8)
  let stallAlerts = 0;
  let recoveryAlerts = 0;
  let imminentAlerts = 0;
  let unmappedTrade = 0;
  let deliveryErrors = 0;

  // Phase F.2 CoA-side alert counters
  let coaStallAlerts = 0;
  let coaRecoveryAlerts = 0;
  let coaImminentAlerts = 0;
  let coaDecisionAlerts = 0;
  let coaOrphanedLeadIds = 0;
  let coaNotifiedDecisionRenderedCount = 0;

  let unknown_phase_skipped = 0;
  const unknownPhasesSeen = new Set();

  // Phase F.2 v3 HIGH-8: per-lifecycle_group cohort breakdown (C1/C2/C3/C4 symmetric 5-field shape).
  // Any group's `.archived` counter increments when that group's CoA row hits a terminal state.
  // diff-HIGH (DeepSeek + Gemini NIT convergent): `unknown` slot prevents silent data loss for
  // CoA rows where lifecycle_group is NULL or otherwise unrecognized — without this, the
  // `if (skipDistributionCoa[groupKey])` guard silently drops the increment.
  const skipDistributionCoa = {
    C1:      { imminent: 0, stalled: 0, recovery: 0, decision: 0, archived: 0 },
    C2:      { imminent: 0, stalled: 0, recovery: 0, decision: 0, archived: 0 },
    C3:      { imminent: 0, stalled: 0, recovery: 0, decision: 0, archived: 0 },
    C4:      { imminent: 0, stalled: 0, recovery: 0, decision: 0, archived: 0 },
    unknown: { imminent: 0, stalled: 0, recovery: 0, decision: 0, archived: 0 },
  };
  // Failed-sample for INNER-JOIN-equivalent orphan rows (CoA tracked_projects row pointing to
  // a missing coa_applications row). v4 HIGH-JJ: LEFT JOIN refactor lets us detect orphans inline.
  const orphanedCoaSample = [];

  // diff-HIGH (DeepSeek + Gemini convergent): pass RUN_AT as $1 so Branch B's coa_days_at_status
  // uses the same snapshot timestamp as all DB writes — prevents Spec 47 §14 Midnight Cross.
  for await (const row of pipeline.streamQuery(pool, SQL, [RUN_AT])) {
    const isCoaRow = typeof row.lead_id === 'string' && row.lead_id.startsWith('coa:');

    // ═════════════════════════════════════════════════════════════════════
    // Phase F.2 CoA branch dispatch (v4 — Spec 82 §4)
    // ═════════════════════════════════════════════════════════════════════
    if (isCoaRow) {
      totalRowsCoa++;

      // v4 HIGH-JJ: orphan detection inline — LEFT JOIN coa_applications produced ca.* = NULL
      // when the CoA tracked_projects row references a missing coa_applications row.
      // diff-CRIT (Observability): use ca.lead_id (projected as ca_lead_id) as the discriminant —
      // coa_applications.lead_id is NOT NULL + UNIQUE per migration 133, so NULL here is an
      // unambiguous LEFT JOIN miss. The earlier (lifecycle_phase IS NULL AND coa_status IS NULL)
      // form misidentified rows with CKAN-null status as orphans (Spec 84 P19/P20 false-positive).
      if (row.ca_lead_id == null) {
        coaOrphanedLeadIds++;
        if (orphanedCoaSample.length < 20) {
          orphanedCoaSample.push(`lead_id=${row.lead_id} — no matching coa_applications row (LEFT JOIN drop)`);
        }
        continue;
      }

      const targets = TRADE_TARGET_PHASE[row.trade_slug];
      if (!targets) { unmappedTrade++; continue; }

      // v4 CRIT-AA: decision-reversal reset MUST run BEFORE auto-archive. If a CoA appeals
      // Approved → Refused, the script archives + continues otherwise leaving the flag stuck.
      // Counter increment also moves here, guarded with `&& isCoaDecisionApproved` so only
      // "currently approved + flagged" rows count (the dedup-health semantic).
      if (row.notified_decision_rendered === true && isCoaDecisionApproved(row.coa_decision)) {
        coaNotifiedDecisionRenderedCount++;
      }
      if (row.notified_decision_rendered === true && !isCoaDecisionApproved(row.coa_decision)) {
        updates.push({ id: row.tracking_id, notified_decision_rendered: false });
      }

      // Auto-archive precedence (Spec 82 §4). v3 CRIT-2 simplified to `if (terminalState)` only;
      // v4 CRIT-DD added 'Closed' to terminal statuses (87.6% of CoAs).
      const terminalState = isCoaTerminalState(row.coa_status, row.coa_decision);
      if (terminalState) {
        updates.push({ id: row.tracking_id, status: 'archived' });
        archivedCoa++;
        const groupKey = row.lifecycle_group || 'unknown';
        if (skipDistributionCoa[groupKey]) skipDistributionCoa[groupKey].archived++;
        continue;
      }

      // Saved path (passive watchlist) — no alerts; FaB does not archive (linked permit later)
      if (row.tracking_status === 'saved') continue;

      // Claimed path
      if (!CLAIMED_STATUSES.has(row.tracking_status)) continue;

      // CoA stall — 3-tier per-status threshold + explicit lifecycle_stalled flag.
      // v3 MED-18: null threshold (unrecognized status) → skip days-based stall.
      const stallThreshold = selectCoaStallThreshold(row.coa_status, logicVars);
      const coaStalled = row.lifecycle_stalled === true
                      || (stallThreshold != null
                          && row.coa_days_at_status != null
                          && row.coa_days_at_status > stallThreshold);

      // v4 MED-PP: decouple recovery condition — `STALL_CLEARED` requires BOTH lifecycle_stalled
      // = false AND days-based stall cleared, not just `!coaStalled`.
      const daysBasedStallCleared = stallThreshold == null
        || row.coa_days_at_status == null
        || row.coa_days_at_status <= stallThreshold;
      const fullyRecovered = row.lifecycle_stalled === false && daysBasedStallCleared;

      // v4 HIGH-K: gate alert pushes on !coaFirstDeployGrace to prevent day-0 storm.
      if (coaStalled && row.last_notified_stalled !== true && !coaFirstDeployGrace) {
        const appNum = extractCoaApplicationNumber(row.lead_id) || 'unknown-coa';
        alerts.push({
          user_id: row.user_id,
          type: 'COA_STALLED',
          permit_num: row.permit_num,
          coa_application_number: appNum,
          trade_slug: row.trade_slug,
          title: NOTIFICATION_TITLES.COA_STALLED,
          body: `CoA stalled at "${row.coa_status}" for > ${stallThreshold} days — project may be on hold.`,
        });
        updates.push({ id: row.tracking_id, last_notified_stalled: true });
        coaStallAlerts++;
        const grp = row.lifecycle_group || 'unknown';
        skipDistributionCoa[grp].stalled++;
      }

      if (fullyRecovered && row.last_notified_stalled === true && !coaFirstDeployGrace) {
        const appNum = extractCoaApplicationNumber(row.lead_id) || 'unknown-coa';
        alerts.push({
          user_id: row.user_id,
          type: 'STALL_CLEARED',
          permit_num: row.permit_num,
          coa_application_number: appNum,
          trade_slug: row.trade_slug,
          title: NOTIFICATION_TITLES.STALL_CLEARED,
          body: `CoA at ${appNum} is moving again — schedule activity resuming.`,
        });
        updates.push({ id: row.tracking_id, last_notified_stalled: false });
        coaRecoveryAlerts++;
        const grp = row.lifecycle_group || 'unknown';
        skipDistributionCoa[grp].recovery++;
      }

      // Imminent — hearing_date-based.
      const inImminentWindow = isCoaInImminentWindow(row.hearing_date, RUN_AT, logicVars.coa_imminent_window_days);
      if (inImminentWindow && row.last_notified_urgency !== 'imminent' && !coaStalled && !coaFirstDeployGrace) {
        const appNum = extractCoaApplicationNumber(row.lead_id) || 'unknown-coa';
        const hearingStr = row.hearing_date
          ? new Date(row.hearing_date).toISOString().slice(0, 10)
          : 'soon';
        alerts.push({
          user_id: row.user_id,
          type: 'COA_HEARING_IMMINENT',
          permit_num: row.permit_num,
          coa_application_number: appNum,
          trade_slug: row.trade_slug,
          title: NOTIFICATION_TITLES.COA_HEARING_IMMINENT,
          body: `Variance hearing for ${appNum} is on ${hearingStr} — confirm crew availability for likely-approved ${row.trade_slug}.`,
        });
        updates.push({ id: row.tracking_id, last_notified_urgency: 'imminent' });
        coaImminentAlerts++;
        const grp = row.lifecycle_group || 'unknown';
        skipDistributionCoa[grp].imminent++;
      }

      // COA_DECISION_RENDERED — one-shot on Approved decisions (FaB excluded per v2 CRIT-G).
      // v2 CRIT-G fold uses notified_decision_rendered BOOLEAN (NOT last_notified_urgency overload).
      if (isCoaDecisionApproved(row.coa_decision) && !row.notified_decision_rendered && !coaFirstDeployGrace) {
        const appNum = extractCoaApplicationNumber(row.lead_id) || 'unknown-coa';
        alerts.push({
          user_id: row.user_id,
          type: 'COA_DECISION_RENDERED',
          permit_num: row.permit_num,
          coa_application_number: appNum,
          trade_slug: row.trade_slug,
          title: NOTIFICATION_TITLES.COA_DECISION_RENDERED,
          body: `Variance approved for ${appNum} — permit application expected within 12 months.`,
        });
        updates.push({ id: row.tracking_id, notified_decision_rendered: true });
        coaDecisionAlerts++;
        const grp = row.lifecycle_group || 'unknown';
        skipDistributionCoa[grp].decision++;
      }

      // CoA urgency reset (mirrors permit-side B5 — clear last_notified_urgency if no longer imminent)
      if (row.last_notified_urgency === 'imminent' && !inImminentWindow) {
        updates.push({ id: row.tracking_id, last_notified_urgency: null });
      }

      continue;
    }

    // ═════════════════════════════════════════════════════════════════════
    // Permit branch (existing logic preserved — E.2 defensive guard REMOVED above)
    // ═════════════════════════════════════════════════════════════════════
    totalRowsPermit++;

    const targets = TRADE_TARGET_PHASE[row.trade_slug];
    if (!targets) { unmappedTrade++; continue; } // unmapped trade — skip

    const currentOrdinal = PHASE_ORDINAL[row.lifecycle_phase];
    const targetOrdinal = PHASE_ORDINAL[targets.work_phase];

    // ═══════════════════════════════════════════════════════════
    // WF3-03: Dead Lead Cleanup
    //
    // Null lifecycle_phase = unclassified or dead-state permit.
    // If it also has no forecast (urgency is null), it is a ghost
    // lead that will never trigger an alert and can never auto-archive
    // via isWindowClosed or urgency='expired'. Archive it to keep the
    // user's CRM flight-board clean. The update is routed through the
    // existing archiveIds SQL path — no new SQL statement needed.
    //
    // If urgency is non-null the permit has an active forecast signal
    // despite missing phase data — skip silently (don't archive) since
    // the phase may be assigned in a future classify run.
    //
    // Always continue regardless to skip the rest of the alerting logic
    // and avoid polluting the "unknown phase" telemetry with null rows.
    // ═══════════════════════════════════════════════════════════
    if (row.lifecycle_phase == null) {
      if (row.urgency == null) {
        updates.push({ id: row.tracking_id, status: 'archived' });
        archived++;
      }
      continue;
    }

    // Defensive WARN for genuinely unknown phase values (non-null, not
    // in PHASE_ORDINAL, not in TERMINAL_PHASES). See counter declaration.
    if (currentOrdinal == null && !TERMINAL_PHASES.has(row.lifecycle_phase)) {
      unknown_phase_skipped++;
      if (!unknownPhasesSeen.has(row.lifecycle_phase)) {
        unknownPhasesSeen.add(row.lifecycle_phase);
        pipeline.log.warn(
          '[tracked-projects]',
          `Unknown lifecycle_phase="${row.lifecycle_phase}" — neither in PHASE_ORDINAL nor TERMINAL_PHASES. `
            + 'Row will not auto-archive; investigate producer.',
          { permit_num: row.permit_num, revision_num: row.revision_num,
            trade_slug: row.trade_slug },
        );
      }
      continue;
    }

    // Window closed: permit physically passed the trade's work phase,
    // OR permit reached a terminal phase (P19/P20). Terminal phases
    // are not in PHASE_ORDINAL so the ordinal check would miss them.
    const isWindowClosed = TERMINAL_PHASES.has(row.lifecycle_phase)
      || (currentOrdinal != null && targetOrdinal != null
          && currentOrdinal >= targetOrdinal);

    // ─── Path A: Saved (passive watchlist) ──────────────────
    if (row.tracking_status === 'saved') {
      if (isWindowClosed || row.urgency === 'expired') {
        updates.push({ id: row.tracking_id, status: 'archived' });
        archived++;
      }
      // No alerts for saves — passive watchlist
      continue;
    }

    // ─── Path B: Claimed (active flight board) ──────────────
    if (!CLAIMED_STATUSES.has(row.tracking_status)) continue;

    // B1. Auto-archive: window closed → job is starting/done
    if (isWindowClosed) {
      updates.push({ id: row.tracking_id, status: 'archived' });
      archived++;
      continue; // No alerts on closed jobs
    }

    // B1b. Auto-archive claimed leads whose urgency is 'expired'
    // (WF3 2026-04-13). Previously only saved leads archived on
    // urgency=expired; claimed leads would accumulate in the
    // tracked_projects table indefinitely even after the forecast
    // engine had given up on them. The expired threshold is controlled
    // by logic_variables.expired_threshold_days (consumed upstream by
    // compute-trade-forecasts.classifyUrgency).
    if (row.urgency === 'expired') {
      updates.push({ id: row.tracking_id, status: 'archived' });
      archived++;
      continue;
    }

    // B2. Stall alert: site just stalled (state-change detection)
    if (row.lifecycle_stalled === true && row.last_notified_stalled !== true) {
      // spec 47 §14.4: guard against invalid date strings from the DB before
      // calling .toISOString() — a corrupt predicted_start would throw, not
      // fall through the ternary. Number.isNaN(d.getTime()) catches that case.
      const _ps1 = row.predicted_start ? new Date(row.predicted_start) : null;
      const dateStr = (_ps1 && !Number.isNaN(_ps1.getTime()))
        ? _ps1.toISOString().slice(0, 10)
        : 'TBD';
      alerts.push({
        user_id: row.user_id,
        type: 'STALL_WARNING',
        permit_num: row.permit_num,
        trade_slug: row.trade_slug,
        title: NOTIFICATION_TITLES.STALL_WARNING,
        body: `Schedule Alert: The site at ${row.permit_num} just stalled. Your ${row.trade_slug} target date has been pushed back to ${dateStr}.`,
      });
      updates.push({
        id: row.tracking_id,
        last_notified_stalled: true,
      });
      stallAlerts++;
    }

    // B3. Recovery alert: site just unstalled
    if (row.lifecycle_stalled === false && row.last_notified_stalled === true) {
      alerts.push({
        user_id: row.user_id,
        type: 'STALL_CLEARED',
        permit_num: row.permit_num,
        trade_slug: row.trade_slug,
        title: NOTIFICATION_TITLES.STALL_CLEARED,
        body: `Schedule Alert: The stop-work at ${row.permit_num} has been cleared. Construction is resuming.`,
      });
      updates.push({
        id: row.tracking_id,
        last_notified_stalled: false,
      });
      recoveryAlerts++;
    }

    // B4. Imminent alert: urgency just shifted to imminent.
    // Skip if stalled — a stalled site with "imminent" urgency is
    // contradictory (the predicted_start is unreliable during stall).
    // WF3: both reviewers flagged the double-alert scenario.
    if (row.urgency === 'imminent' && row.last_notified_urgency !== 'imminent'
        && row.lifecycle_stalled !== true) {
      const _ps2 = row.predicted_start ? new Date(row.predicted_start) : null;
      const dateStr = (_ps2 && !Number.isNaN(_ps2.getTime()))
        ? _ps2.toISOString().slice(0, 10)
        : 'soon';
      alerts.push({
        user_id: row.user_id,
        type: 'START_IMMINENT',
        permit_num: row.permit_num,
        trade_slug: row.trade_slug,
        title: NOTIFICATION_TITLES.START_IMMINENT,
        body: `Action Required: Your ${row.trade_slug} job at ${row.permit_num} is IMMINENT (within ${row.imminent_window_days} days). Expected start: ${dateStr}.`,
      });
      updates.push({
        id: row.tracking_id,
        last_notified_urgency: 'imminent',
      });
      imminentAlerts++;
    }

    // ═══════════════════════════════════════════════════════════
    // WF3-02 (B5): Urgency Reset
    //
    // If a project was previously marked imminent but the city delays
    // the permit (forecast shifts back to 'delayed' or 'upcoming'),
    // clear last_notified_urgency so the script can re-alert the user
    // when it approaches again.
    //
    // Silent state reset — no alert payload generated here.
    // ═══════════════════════════════════════════════════════════
    if (row.last_notified_urgency === 'imminent' && row.urgency !== 'imminent') {
      updates.push({
        id: row.tracking_id,
        last_notified_urgency: null,
      });
    }
  }

  pipeline.log.info('[tracked-projects]',
    `Streamed ${totalRowsPermit + totalRowsCoa} active tracked projects (permit=${totalRowsPermit}, coa=${totalRowsCoa})`);
  pipeline.log.info('[tracked-projects]', `Archived: ${archived}`);
  pipeline.log.info(
    '[tracked-projects]',
    `Alerts: stall=${stallAlerts}, recovery=${recoveryAlerts}, imminent=${imminentAlerts}`,
  );

  // ═══════════════════════════════════════════════════════════
  // Step 3: Merge + batch UPDATE tracked_projects
  //
  // WF3 fix #1: merge updates by ID before executing. A single row
  // can generate multiple update entries (e.g., stall alert sets
  // last_notified_stalled + imminent alert sets last_notified_urgency).
  // Without merging, we'd issue 2 UPDATEs for the same row.
  //
  // WF3 (spec 47 §7.5 N+1 fix): Replace per-row client.query with
  // category-based batch UPDATEs using ANY($ids::int[]).
  // Each unique field-combination gets ONE UPDATE statement that
  // targets its entire id set — at most 8 DB roundtrips for any
  // number of rows (5 original + 3 WF3-02 reset categories).
  //
  // updated_at uses $1 = RUN_AT (captured at startup) — not NOW() —
  // to prevent the Midnight Cross (spec 47 §14).
  // ═══════════════════════════════════════════════════════════
  const merged = new Map();
  for (const upd of updates) {
    const existing = merged.get(upd.id);
    if (existing) {
      Object.assign(existing, upd); // later fields overwrite earlier
    } else {
      merged.set(upd.id, { ...upd });
    }
  }

  const mergedUpdates = [...merged.values()];
  let totalUpdated = 0;

  if (mergedUpdates.length > 0) {
    // Categorise by which fields change — each category maps to one UPDATE.
    //
    // WF3-02: Added 3 reset categories for last_notified_urgency = NULL.
    // The old `hasUrgency = upd.last_notified_urgency != null` evaluated to
    // false for null values, causing reset updates to silently fall through
    // to the invariant warning. isImminent / isReset replace it.
    const archiveIds = [];
    const stallOnIds = [];              // stalled = true
    const stallOffIds = [];             // stalled = false, no urgency change
    const imminentOnlyIds = [];         // urgency = 'imminent', no stall change
    const stallOffImminentIds = [];     // stalled = false + urgency = 'imminent'
    const resetUrgencyOnlyIds = [];     // urgency = NULL (WF3-02 reset)
    const stallOnResetUrgencyIds = [];  // stalled = true  + urgency = NULL (WF3-02)
    const stallOffResetUrgencyIds = []; // stalled = false + urgency = NULL (WF3-02)
    // Phase F.2 v4 diff-CRIT-1 (DeepSeek + Independent — 2/3 reviewers convergent):
    // notified_decision_rendered true/false categories — without these, COA_DECISION_RENDERED
    // dedup flag updates silently fall to the else-branch and never persist, causing the alert
    // to fire every run forever.
    const decisionRenderedTrueIds = [];
    const decisionRenderedFalseIds = [];

    for (const upd of mergedUpdates) {
      const hasStatus    = upd.status === 'archived';
      const hasStall     = upd.last_notified_stalled != null;
      const isImminent   = upd.last_notified_urgency === 'imminent';
      const isReset      = upd.last_notified_urgency === null;
      const hasDecisionT = upd.notified_decision_rendered === true;
      const hasDecisionF = upd.notified_decision_rendered === false;

      if (hasStatus) {
        archiveIds.push(upd.id);
      } else if (hasStall && !isImminent && !isReset) {
        (upd.last_notified_stalled === true ? stallOnIds : stallOffIds).push(upd.id);
      } else if (isImminent && !hasStall) {
        imminentOnlyIds.push(upd.id);
      } else if (hasStall && isImminent) {
        // B3 (stall recovery) + B4 (imminent) fired together — stall is always false here
        // because B4 requires lifecycle_stalled !== true.
        stallOffImminentIds.push(upd.id);
      } else if (isReset && !hasStall) {
        resetUrgencyOnlyIds.push(upd.id);
      } else if (hasStall && isReset) {
        (upd.last_notified_stalled === true ? stallOnResetUrgencyIds : stallOffResetUrgencyIds).push(upd.id);
      } else if (hasDecisionT && !hasStall && !isImminent && !isReset) {
        decisionRenderedTrueIds.push(upd.id);
      } else if (hasDecisionF && !hasStall && !isImminent && !isReset) {
        decisionRenderedFalseIds.push(upd.id);
      } else {
        // Defensive invariant: all update objects pushed by the routing engine
        // must set status, last_notified_stalled, or last_notified_urgency.
        pipeline.log.warn(
          '[tracked-projects]',
          'Batch categorizer: update object has no recognized fields — will not be written',
          { id: upd.id, fields: Object.keys(upd) },
        );
        deliveryErrors++;
      }
    }

    // WF3 fix #2: wrap all category UPDATEs in one withTransaction to
    // prevent partial state on crash. Memory flags + archive decisions
    // must be atomic — a crash between them would double-fire alerts.
    await pipeline.withTransaction(pool, async (client) => {
      // IS DISTINCT FROM guards on all 5 categories (spec 47 §12):
      // prevents re-writing rows whose state already matches the target,
      // keeping rowCount accurate and making re-runs truly idempotent.
      if (archiveIds.length > 0) {
        const r = await client.query(
          `UPDATE tracked_projects
              SET status = 'archived', updated_at = $1
            WHERE id = ANY($2::int[])
              AND status IS DISTINCT FROM 'archived'`,
          [RUN_AT, archiveIds],
        );
        totalUpdated += r.rowCount ?? 0;
      }
      if (stallOnIds.length > 0) {
        const r = await client.query(
          `UPDATE tracked_projects
              SET last_notified_stalled = true, updated_at = $1
            WHERE id = ANY($2::int[])
              AND last_notified_stalled IS DISTINCT FROM true`,
          [RUN_AT, stallOnIds],
        );
        totalUpdated += r.rowCount ?? 0;
      }
      if (stallOffIds.length > 0) {
        const r = await client.query(
          `UPDATE tracked_projects
              SET last_notified_stalled = false, updated_at = $1
            WHERE id = ANY($2::int[])
              AND last_notified_stalled IS DISTINCT FROM false`,
          [RUN_AT, stallOffIds],
        );
        totalUpdated += r.rowCount ?? 0;
      }
      if (imminentOnlyIds.length > 0) {
        const r = await client.query(
          `UPDATE tracked_projects
              SET last_notified_urgency = 'imminent', updated_at = $1
            WHERE id = ANY($2::int[])
              AND last_notified_urgency IS DISTINCT FROM 'imminent'`,
          [RUN_AT, imminentOnlyIds],
        );
        totalUpdated += r.rowCount ?? 0;
      }
      if (stallOffImminentIds.length > 0) {
        const r = await client.query(
          `UPDATE tracked_projects
              SET last_notified_stalled = false,
                  last_notified_urgency = 'imminent',
                  updated_at = $1
            WHERE id = ANY($2::int[])
              AND (last_notified_stalled IS DISTINCT FROM false
                   OR last_notified_urgency IS DISTINCT FROM 'imminent')`,
          [RUN_AT, stallOffImminentIds],
        );
        totalUpdated += r.rowCount ?? 0;
      }

      // ═══════════════════════════════════════════════════════════
      // WF3-02: Urgency Reset SQL Executions
      // IS NOT NULL guard (not IS DISTINCT FROM) because the target
      // value IS null — IS DISTINCT FROM NULL would be equivalent to
      // IS NOT NULL, but making it explicit keeps the intent clear.
      // ═══════════════════════════════════════════════════════════
      if (resetUrgencyOnlyIds.length > 0) {
        const r = await client.query(
          `UPDATE tracked_projects
              SET last_notified_urgency = NULL, updated_at = $1
            WHERE id = ANY($2::int[])
              AND last_notified_urgency IS NOT NULL`,
          [RUN_AT, resetUrgencyOnlyIds],
        );
        totalUpdated += r.rowCount ?? 0;
      }
      if (stallOnResetUrgencyIds.length > 0) {
        const r = await client.query(
          `UPDATE tracked_projects
              SET last_notified_stalled = true,
                  last_notified_urgency = NULL,
                  updated_at = $1
            WHERE id = ANY($2::int[])
              AND (last_notified_stalled IS DISTINCT FROM true
                   OR last_notified_urgency IS NOT NULL)`,
          [RUN_AT, stallOnResetUrgencyIds],
        );
        totalUpdated += r.rowCount ?? 0;
      }
      // Phase F.2 v4 diff-CRIT-1: write notified_decision_rendered updates so COA_DECISION_RENDERED
      // dedup persists across runs (without these blocks the alert would re-fire every run).
      if (decisionRenderedTrueIds.length > 0) {
        const r = await client.query(
          `UPDATE tracked_projects
              SET notified_decision_rendered = true, updated_at = $1
            WHERE id = ANY($2::int[])
              AND notified_decision_rendered IS DISTINCT FROM true`,
          [RUN_AT, decisionRenderedTrueIds],
        );
        totalUpdated += r.rowCount ?? 0;
      }
      if (decisionRenderedFalseIds.length > 0) {
        const r = await client.query(
          `UPDATE tracked_projects
              SET notified_decision_rendered = false, updated_at = $1
            WHERE id = ANY($2::int[])
              AND notified_decision_rendered IS DISTINCT FROM false`,
          [RUN_AT, decisionRenderedFalseIds],
        );
        totalUpdated += r.rowCount ?? 0;
      }

      if (stallOffResetUrgencyIds.length > 0) {
        const r = await client.query(
          `UPDATE tracked_projects
              SET last_notified_stalled = false,
                  last_notified_urgency = NULL,
                  updated_at = $1
            WHERE id = ANY($2::int[])
              AND (last_notified_stalled IS DISTINCT FROM false
                   OR last_notified_urgency IS NOT NULL)`,
          [RUN_AT, stallOffResetUrgencyIds],
        );
        totalUpdated += r.rowCount ?? 0;
      }

      // ═══════════════════════════════════════════════════════════
      // WF3-01: Atomic Notification Dispatch
      //
      // Spec 82 §4: the CRM Assistant MUST INSERT into the notifications
      // table for every generated alert. This block was previously missing —
      // alerts were queued in memory and emitted to PIPELINE_SUMMARY for
      // Datadog, but never persisted to the DB and never delivered to users.
      //
      // Atomicity (spec 47 §7.1): INSERT runs inside the SAME transaction
      // as the memory flag UPDATEs above. If the flag UPDATE commits but
      // the INSERT fails (or vice versa), the user either loses the alert
      // permanently or receives it again tomorrow. Atomic commit prevents both.
      //
      // Batching (spec 47 §7.6): multi-row VALUES INSERT — no N+1.
      // Parameter guard (spec 47 §6.3): chunk at ALERT_BATCH_SIZE to stay
      // under the 65,535 param hard limit even on burst-stall days.
      // Midnight Cross (spec 47 §14.2): use RUN_AT (captured at startup),
      // never NOW(), so created_at matches updated_at on tracked_projects.
      // ═══════════════════════════════════════════════════════════
      if (alerts.length > 0) {
        for (let i = 0; i < alerts.length; i += ALERT_BATCH_SIZE) {
          const batch = alerts.slice(i, i + ALERT_BATCH_SIZE);
          const tuples = batch.map((_, idx) => {
            const base = idx * ALERT_INSERT_COLS;
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
          }).join(', ');
          const params = batch.flatMap((a) => [
            a.user_id, a.type,
            // v4 CRIT-CC: CoA notifications carry application_number in permit_num column (polymorphism
            // per Spec 82 §4; mobile app discriminates on `type LIKE 'COA_%'`). Fallback to 'unknown-coa'
            // if extractCoaApplicationNumber returned null — prevents NULL in notifications.permit_num.
            a.coa_application_number || a.permit_num || 'unknown-coa',
            a.trade_slug, a.title, a.body, RUN_AT,
          ]);
          await client.query(
            `INSERT INTO notifications
               (user_id, type, permit_num, trade_slug, title, body, created_at)
             VALUES ${tuples}`,
            params,
          );
        }
      }
    });
    pipeline.log.info(
      '[tracked-projects]',
      `Applied ${totalUpdated} DB updates (${mergedUpdates.length} merged from ${updates.length} raw)`,
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Step 4: Analytics Sync — populate lead_analytics
  // ═══════════════════════════════════════════════════════════
  //
  // Aggregates all tracked_projects by permit into lead_analytics so
  // the competition discount (opportunity score) reflects real user
  // behavior. Runs as a single SQL UPSERT — Postgres does the GROUP BY.
  // Uses LPAD to match the canonical lead_key format.
  //
  // updated_at uses $1 = RUN_AT — not NOW() — per spec 47 §14.
  pipeline.log.info('[tracked-projects]', 'Syncing lead_analytics...');

  // Wrap both UPSERT + zero-out in a single transaction so a crash
  // between them doesn't leave stale non-zero counts alongside fresh
  // counts. Adversarial review: data corruption vector without atomicity.
  let analyticsSynced = 0;
  let analyticsZeroed = 0;

  await pipeline.withTransaction(pool, async (client) => {
    // Phase F.2 v4 diff-CRIT-3 (Gemini CRIT 1): UNION CoA rows so CoA tracking activity flows
    // into lead_analytics. Without this branch, downstream consumers (opportunity score,
    // market density UI) see permit-side counts only — CoA leads are invisible to analytics.
    // CoA lead_key uses the canonical `lead_id` value directly (tp.lead_id already starts with
    // 'coa:' for the CoA branch); permit lead_key keeps the legacy LPAD-revision_num form for
    // backward compatibility with the existing lead_analytics rows.
    const { rows: syncedRows } = await client.query(`
      INSERT INTO lead_analytics (lead_key, tracking_count, saving_count, updated_at)
      SELECT lead_key, tracking_count, saving_count, updated_at FROM (
        -- Permit branch (existing — backward-compatible LPAD lead_key shape)
        SELECT
          'permit:' || tp.permit_num || ':' || LPAD(tp.revision_num::text, 2, '0') AS lead_key,
          COUNT(*) FILTER (WHERE tp.status IN ('claimed_unverified', 'claimed', 'verified'))::int AS tracking_count,
          COUNT(*) FILTER (WHERE tp.status = 'saved')::int AS saving_count,
          $1::timestamptz AS updated_at
        FROM tracked_projects tp
        WHERE tp.status NOT IN ('archived', 'expired')
          AND tp.permit_num IS NOT NULL
          AND tp.revision_num IS NOT NULL
          AND (tp.lead_id IS NULL OR tp.lead_id NOT LIKE 'coa:%')
        GROUP BY tp.permit_num, tp.revision_num

        UNION ALL

        -- CoA branch (Phase F.2 v4 — uses tp.lead_id directly as lead_key)
        SELECT
          tp.lead_id AS lead_key,
          COUNT(*) FILTER (WHERE tp.status IN ('claimed_unverified', 'claimed', 'verified'))::int AS tracking_count,
          COUNT(*) FILTER (WHERE tp.status = 'saved')::int AS saving_count,
          $1::timestamptz AS updated_at
        FROM tracked_projects tp
        WHERE tp.status NOT IN ('archived', 'expired')
          AND tp.lead_id LIKE 'coa:%'
        GROUP BY tp.lead_id
      ) combined
      ON CONFLICT (lead_key) DO UPDATE SET
        tracking_count = EXCLUDED.tracking_count,
        saving_count = EXCLUDED.saving_count,
        updated_at = EXCLUDED.updated_at
      RETURNING 1
    `, [RUN_AT]);
    analyticsSynced = syncedRows.length;

    // Zero out lead_analytics rows where all trackers have been archived.
    // v4 diff-CRIT-3: also covers CoA lead_keys ('coa:%' form). The NOT EXISTS subquery handles
    // both permit and CoA via OR'd lead_key reconstruction.
    const { rows: zeroedRows } = await client.query(`
      UPDATE lead_analytics la
         SET tracking_count = 0, saving_count = 0, updated_at = $1
       WHERE NOT EXISTS (
         SELECT 1 FROM tracked_projects tp
          WHERE tp.status NOT IN ('archived', 'expired')
            AND (
              la.lead_key = 'permit:' || tp.permit_num || ':' || LPAD(tp.revision_num::text, 2, '0')
              OR la.lead_key = tp.lead_id
            )
       )
       AND (la.tracking_count > 0 OR la.saving_count > 0)
      RETURNING 1
    `, [RUN_AT]);
    analyticsZeroed = zeroedRows.length;
  });

  pipeline.log.info(
    '[tracked-projects]',
    `Analytics sync: ${analyticsSynced} upserted, ${analyticsZeroed} zeroed`,
  );

  // ═══════════════════════════════════════════════════════════
  // Step 5: Audit + Telemetry
  // ═══════════════════════════════════════════════════════════

  // spec §8.2 mandatory rows for "Alert delivery" type:
  // alerts_evaluated, alerts_delivered, delivery_errors
  // Phase F.2 v4 diff-CRIT-2 (Gemini + Independent — 2/3 convergent): include CoA counters.
  // Without this, alerts_delivered undercount the actual notifications written to the DB
  // (which includes CoA alerts via alerts.length), corrupting the operator's health signal.
  const totalAlerts = stallAlerts + recoveryAlerts + imminentAlerts
    + coaStallAlerts + coaRecoveryAlerts + coaImminentAlerts + coaDecisionAlerts;
  const auditTableRows = [
    { metric: 'alerts_evaluated',  value: totalRowsPermit + totalRowsCoa, threshold: null, status: 'INFO' },
    { metric: 'alerts_delivered',  value: totalAlerts,  threshold: null, status: 'INFO' },
    { metric: 'delivery_errors',   value: deliveryErrors, threshold: 0, status: deliveryErrors > 0 ? 'FAIL' : 'PASS' },
    { metric: 'projects_archived', value: archived,     threshold: null, status: 'INFO' },
    { metric: 'unknown_phase',     value: unknown_phase_skipped, threshold: null, status: 'INFO' },
    // Phase F.2 CoA-side audit rows
    { metric: 'coa_stall_alerts',     value: coaStallAlerts,    threshold: null, status: 'INFO' },
    { metric: 'coa_recovery_alerts',  value: coaRecoveryAlerts, threshold: null, status: 'INFO' },
    { metric: 'coa_imminent_alerts',  value: coaImminentAlerts, threshold: null, status: 'INFO' },
    { metric: 'coa_decision_alerts',  value: coaDecisionAlerts, threshold: null, status: 'INFO' },
    // v3 CRIT-6 / v4 CRIT-F: threshold row — kill-switch detector for 100% archival
    {
      metric: 'coa_archived',
      value: archivedCoa,
      threshold: '< 100% of totalRowsCoa',
      status: totalRowsCoa > 0 && archivedCoa === totalRowsCoa ? 'WARN' : 'PASS',
    },
    // v3 HIGH-9 / v4 HIGH-LL: orphan capture (threshold label is the trigger condition)
    {
      metric: 'coa_orphaned_lead_ids',
      value: coaOrphanedLeadIds,
      threshold: '> 0',
      status: coaOrphanedLeadIds > 0 ? 'WARN' : 'PASS',
    },
    // v4 HIGH-OO: in_quiet_period visible in audit_table.rows (not just records_meta)
    {
      metric: 'in_quiet_period',
      value: inQuietPeriod ? 1 : 0,
      threshold: null,
      status: 'INFO',
    },
  ];
  const auditVerdict =
    auditTableRows.some((r) => r.status === 'FAIL') ? 'FAIL' :
    auditTableRows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';

  // spec §8.4: cap alerts array at ALERTS_META_CAP items.
  // A burst of stalled permits could produce thousands of alert payloads
  // — embedding them all in PIPELINE_SUMMARY would crash observability
  // ingestion (Datadog/CloudWatch row size limits). Use alerts_total +
  // alerts_truncated to preserve the count signal without the payload.
  const alertsCapped = alerts.slice(0, ALERTS_META_CAP);
  const alertsTruncated = alerts.length > ALERTS_META_CAP;

  pipeline.emitSummary({
    records_total: totalRowsPermit + totalRowsCoa,
    records_new: 0,
    records_updated: totalUpdated,
    failed_sample: orphanedCoaSample.length > 0 ? orphanedCoaSample : undefined,
    records_meta: {
      active_tracked: totalRowsPermit + totalRowsCoa,
      total_rows_permit: totalRowsPermit,
      total_rows_coa: totalRowsCoa,
      coa_first_deploy_grace: coaFirstDeployGrace,
      in_quiet_period: inQuietPeriod,
      coa_alert_distribution_by_lifecycle_group: skipDistributionCoa,
      coa_notified_decision_rendered_count: coaNotifiedDecisionRenderedCount,
      coa_orphaned_lead_ids_sample_capped: coaOrphanedLeadIds > 20,
      archived,
      stall_alerts: stallAlerts,
      recovery_alerts: recoveryAlerts,
      imminent_alerts: imminentAlerts,
      alerts_total: alerts.length,
      ...(alertsTruncated ? { alerts_truncated: true } : {}),
      analytics_synced: analyticsSynced,
      analytics_zeroed: analyticsZeroed,
      unmapped_trade: unmappedTrade,
      unknown_phase_skipped,
      unknown_phase_values: [...unknownPhasesSeen],
      alerts: alertsCapped,
      run_at: RUN_AT,
      audit_table: {
        phase: 24,
        name: 'CRM Assistant',
        verdict: auditVerdict,
        rows: auditTableRows,
      },
    },
  });

  pipeline.emitMeta(
    {
      tracked_projects: ['id', 'user_id', 'status', 'trade_slug', 'permit_num', 'revision_num', 'lead_id', 'last_notified_urgency', 'last_notified_stalled', 'notified_decision_rendered'],
      permits: ['permit_num', 'revision_num', 'lead_id', 'lifecycle_phase', 'lifecycle_stalled'],
      trade_forecasts: ['permit_num', 'revision_num', 'trade_slug', 'lead_id', 'predicted_start', 'urgency'],
      trade_configurations: ['trade_slug', 'imminent_window_days', 'bid_phase_cutoff', 'work_phase_target'],
      // Phase F.2 reads
      coa_applications: ['lead_id', 'lifecycle_phase', 'lifecycle_stalled', 'lifecycle_group', 'status', 'decision', 'hearing_date', 'lifecycle_classified_at', 'last_seen_at'],
      pipeline_runs: ['pipeline', 'started_at'],
    },
    {
      tracked_projects: ['status', 'last_notified_urgency', 'last_notified_stalled', 'notified_decision_rendered', 'updated_at'],
      lead_analytics: ['lead_key', 'tracking_count', 'saving_count', 'updated_at'],
      // Phase F.2: 3 new notification subtypes write here (existing pattern; new types per Spec 82 §4)
      notifications: ['user_id', 'type', 'permit_num', 'trade_slug', 'title', 'body', 'created_at'],
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
          phase: 24,
          name: 'CRM Assistant',
          verdict: 'PASS',
          rows: [{ metric: 'skipped_lock_held', value: 1, threshold: null, status: 'INFO' }],
        },
      },
    });
    pipeline.emitMeta({}, {});
    return;
  }
});
