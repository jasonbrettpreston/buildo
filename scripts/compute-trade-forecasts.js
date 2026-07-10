#!/usr/bin/env node
/**
 * Compute Trade Forecasts — the Flight Tracker (Phase 4).
 *
 * Generates per-permit, per-trade predicted start dates and urgency
 * statuses. Marries the phase_started_at anchor (Phase 2) with the
 * phase_calibration medians (Phase 3) and TRADE_TARGET_PHASE mapping
 * to produce rows in trade_forecasts that the lead feed JOINs on.
 *
 * SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md
 * SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md §6
 */
'use strict';

const { z } = require('zod');
const pipeline = require('./lib/pipeline');
const {
  TRADE_TARGET_PHASE_FALLBACK,
  PHASE_ORDINAL,
  SKIP_PHASES_SQL,
} = require('./lib/lifecycle-phase');
const { loadMarketplaceConfigs, validateLogicVars } = require('./lib/config-loader');
const { classifyCalibrationThresholdStatus, classifyCoaGateWarnAcceptedStatus } = require('./lib/calibration-guard');

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

// Phase F.1: 14 params per row — adds lead_id (post-mig 151 PK) so CoA rows can write
// directly (no permits FK trigger derivation available for CoA). Permit-side rows continue
// to populate lead_id since mig 139 promoted it to NOT NULL UNIQUE.
// v3 NIT-O fold: FORECAST_COL_COUNT extracted as single source of truth for SQL + params.
const FORECAST_COL_COUNT = 14; // permit_num, revision_num, lead_id, trade_slug, predicted_start,
                                // confidence, urgency, target_window, calibration_method,
                                // sample_size, median_days, p25_days, p75_days, computed_at
const FORECAST_BATCH_SIZE = pipeline.maxRowsPerInsert(FORECAST_COL_COUNT); // Math.floor(65535 / 14) = 4681

// Phase F.1: lead_id format validators for pre-INSERT pre-validation (v4 MED-I — both sides).
// Spec 42 §6.6.A: permit lead_id is `permit:<num>:<rev>`; CoA is `coa:<application_number>`.
const LEAD_ID_FORMAT_COA = /^coa:.+$/;
const LEAD_ID_FORMAT_PERMIT = /^permit:[^:]+:[^:]+$/;

// Grace-purge window: rows older than this are deleted by the grace-purge DELETE.
// Mirrored as the JS in-memory cutoff to break the write+delete zombie loop.
// Sourced from docs/specs/_contracts.json retention.grace_purge_days.
const GRACE_PURGE_DAYS = 180;

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
  // Phase F.1 v3 CRIT-D: snowplow staleness gate for CoA lifecycle_transition anchors
  coa_lifecycle_transition_stale_days: z.coerce.number().int().positive(),
  // Phase F.1 v4 MED-J: operator-tunable gate freshness window
  coa_gate_calibration_window_days:    z.coerce.number().int().positive(),
  // Spec 79 §7a WF3 #2 (Finding J, 2026-05-20): operator safety valve to
  // force-active the CoA gate during post-grace deadlocks. Default 0; set
  // to 1 via Control Panel to bypass calibration verdict gating entirely.
  // `.default(0)` is critical — without it, runs before mig 159 applies
  // would get undefined → z.coerce.number() yields NaN → .int() throws.
  coa_gate_force_active:               z.coerce.number().int().min(0).max(1).default(0),
  // WF2 D2a (Spec 85 §3.6): externalized default_calibration_pct verdict thresholds
  // (were hardcoded 20/50). Required + finite (fail-fast Zod) — a missing/NaN threshold
  // must throw, not silently degrade the verdict cascade. Seeded via logic_variables.json.
  forecast_default_calibration_warn_pct: z.coerce.number().finite().min(0).max(100),
  forecast_default_calibration_fail_pct: z.coerce.number().finite().min(0).max(100),
  // Spec 80 P4 (D1 / CR-F4): non-forecastable trade slugs. JSONB logic variable
  // (mig 210) read as an array by config-loader.js:220-221 (variable_value_json
  // is an object → passed through untouched). `.optional()` NOT `.required()`:
  // config-loader has no fallback for JSONB vars (they live only in migrations,
  // like income_premium_tiers), so a DB-down degraded run yields undefined →
  // empty exclusion set, which is the safe default (nothing excluded, unmapped
  // counter still fires). z.string() array so a poisoned non-string entry throws.
  forecast_excluded_trade_slugs:       z.array(z.string()).optional(),
  // P16 16E [Gemini MEDIUM pinned] — provenance weight for INFERENCE-basis trade attachments
  // in the forecast input aggregation: an inference row's calibration sample is scaled by this
  // factor BEFORE classifyConfidence banding (an inference attachment needs 1/weight× the
  // evidence sample to reach the same confidence band). 0.5 default; panel-adjustable.
  // Ranking/serving authority remains attachment_basis (D5) — this weights, never gates.
  inference_weight:                    z.coerce.number().finite().min(0).max(1).default(0.5),
}).passthrough();

// ─── Phase F.1 module-local helpers ─────────────────────────────────────────

// selectCoaAnchor (v2 NIT 14 fold — extracted for testability): returns the best CoA anchor
// per Spec 85 §3 priority: lifecycle_transitions.MAX(transitioned_at) → decision_date →
// hearing_date → first_seen_at. Returns { date, source } or null if no anchor available.
function selectCoaAnchor(row) {
  if (row.phase_started_at)  return { date: row.phase_started_at,                          source: 'lifecycle_transition' };
  if (row.decision_date)     return { date: new Date(row.decision_date + 'T00:00:00Z'),     source: 'decision_date' };
  if (row.hearing_date)      return { date: new Date(row.hearing_date  + 'T00:00:00Z'),     source: 'hearing_date' };
  if (row.first_seen_at)     return { date: row.first_seen_at,                              source: 'first_seen_at' };
  return null;
}

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
// WF3 B2-H4 (2026-04-23): parameters are required — no defaults. A
// silent default masked config-loader regressions (DB return missing
// urgency_overdue_days → function silently used 30 instead of throwing).
// The single call site always threads the DB-driven values; any new
// call site must do the same.
function classifyUrgency(daysUntil, isPastTarget, expiredThreshold, imminentWindow, overdueWindow, upcomingWindow) {
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

  // Spec 80 P4 (D1 / CR-F4): non-forecastable trade slugs (e.g. site-maintenance — no
  // phase-anchored install window). Rows carrying these slugs are skipped BEFORE branch
  // dispatch so they never inflate records_total NOR unmapped_trades; surfaced via the
  // excluded_rows + excluded_trade_slugs audit rows. Array.isArray guard: on a DB-down
  // degraded run the JSONB var is absent (no config-loader fallback) → empty set.
  const excludedTradeSlugs = new Set(
    Array.isArray(logicVars.forecast_excluded_trade_slugs)
      ? logicVars.forecast_excluded_trade_slugs
      : [],
  );
  if (excludedTradeSlugs.size > 0) {
    pipeline.log.info('[trade-forecasts]',
      `Non-forecastable excluded trade slugs: ${[...excludedTradeSlugs].join(', ')}`);
  }

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
  // Phase F.1: CoA audit-verdict gate (follow-up #131)
  // ═══════════════════════════════════════════════════════════
  // v3 CRIT-A: pipeline column stores `${chainId}:${manifest_key}` where manifest_key uses
  //   UNDERSCORE per scripts/manifest.json. run-chain.js:321 builds the scopedSlug as
  //   `${chainId}:${slug}` from the manifest key. v2 hyphen typo would never match.
  // v3 CRIT-B: 7-day window per Spec 48 §3.4 baseline (now operator-tunable per v4 MED-J).
  // v3 CRIT-C: drop status='completed' filter; check status in JS so most-recent FAILED run
  //   is detected instead of falling through to an older PASS.
  // ─── D3a: CoA gate policy (declarative) ───────────────────────────────────
  // coa_gate_policy is a NON-numeric logic variable stored as a JSONB string (mig 211).
  // config-loader.js only reads object-typed JSON (line 220-221), so read it directly here.
  // Default 'pass_only' (strict) whenever absent, malformed, or on query failure — the safe
  // posture is to gate on PASS only.
  let coaGatePolicy = 'pass_only';
  try {
    const { rows: policyRows } = await pool.query(
      `SELECT variable_value_json FROM logic_variables WHERE variable_key = 'coa_gate_policy'`,
    );
    const rawPolicy = policyRows[0]?.variable_value_json;
    if (rawPolicy === 'pass_only' || rawPolicy === 'pass_or_warn') {
      coaGatePolicy = rawPolicy;
    } else if (rawPolicy != null) {
      pipeline.log.warn('[trade-forecasts]',
        `coa_gate_policy has unexpected value ${JSON.stringify(rawPolicy)} — defaulting to pass_only`);
    }
  } catch (err) {
    pipeline.log.warn('[trade-forecasts]',
      'coa_gate_policy read failed — defaulting to pass_only',
      { error: err instanceof Error ? err.message : String(err) });
  }

  const GATE_PIPELINE_NAME = 'permits:compute_phase_calibration';
  const gateWindowDays = logicVars.coa_gate_calibration_window_days;
  let coaGateActive = false;
  let coaGateStatus = 'unknown';
  let coaGateLastRunId = null;
  let coaGateLastVerdict = null;
  // D3a: set true when a WARN verdict is accepted under coa_gate_policy='pass_or_warn'.
  let coaGateWarnAccepted = false;
  // WF2 P8 amendment: set true when the gate's calibration verdict is a clean PASS
  // (recovered health). Combined with a still-loose coa_gate_policy this drives the
  // coa_audit_gate_warn_accepted row to FAIL (config drift — revert to pass_only).
  let coaCalibrationPassGrade = false;
  try {
    const { rows: gateRows } = await pool.query(
      `SELECT id, status, started_at, records_meta->'audit_table'->>'verdict' AS verdict
         FROM pipeline_runs
        WHERE pipeline = $1
          AND started_at >= NOW() - ($2 || ' days')::interval
        ORDER BY started_at DESC
        LIMIT 1`,
      [GATE_PIPELINE_NAME, gateWindowDays.toString()],
    );
    if (gateRows.length === 0) {
      coaGateStatus = 'no_prior_run';
    } else {
      coaGateLastRunId = gateRows[0].id;
      coaGateLastVerdict = gateRows[0].verdict;
      const lastStatus = gateRows[0].status;
      if (lastStatus !== 'completed') {
        coaGateStatus = `blocked_by_failed_run_${lastStatus}`;
      } else if (coaGateLastVerdict === 'PASS') {
        coaGateActive = true;
        coaGateStatus = 'pass';
        coaCalibrationPassGrade = true;   // WF2 P8: clean PASS = recovered calibration health
      } else if (coaGateLastVerdict === 'WARN' && coaGatePolicy === 'pass_or_warn') {
        // D3a: a WARN verdict within the freshness window activates the CoA branch under the
        // pass_or_warn policy. Strictly narrower than the already-sanctioned cold-start grace
        // bypass — the WARN here is a sample-size caveat, not a wrongness signal. FAIL, absent
        // (no_prior_run / stale window), and non-completed runs all stay BLOCKED.
        coaGateActive = true;
        coaGateWarnAccepted = true;
        coaGateStatus = 'pass_or_warn_accepted';
      } else {
        coaGateStatus = `blocked_by_${(coaGateLastVerdict || 'null').toLowerCase()}`;
      }
    }
  } catch (err) {
    coaGateActive = false;
    coaGateStatus = 'query_error';
    pipeline.log.warn('[trade-forecasts]', 'audit-verdict gate query failed — CoA branch will be skipped',
      { error: err instanceof Error ? err.message : String(err) });
  }

  // ─── Spec 79 §7a WF3 #2 (Finding J, 2026-05-20) — gate overrides ───
  // Override order is intentional (least-authoritative → most-authoritative):
  //   (a) verdict branches above set coaGateActive based on calibration state
  //   (b) grace bypass — cold-start override (breaks chicken-and-egg)
  //   (c) force-active — operator safety valve (last word, always wins)
  // Two rounds of adversarial plan-review locked this ordering: force-active
  // MUST be last so it decisively overrides any prior state. Grace MUST come
  // BEFORE force-active so the audit row can distinguish the two reasons.

  // IMPL-review fold (DeepSeek CRIT 2026-05-20): deployAge query MUST run
  // before the override blocks below — they reference `coaFirstDeployGrace`.
  // Pre-fold this lived ~50 lines further down, causing a ReferenceError.
  //
  // v4 CRIT-B: pre-fetch BOTH 7-day and 30-day deploy-age counts in a SINGLE
  // startup query. Eliminates the inline `await pool.query(...)` from
  // audit-row construction that previously could throw after UPSERTs commit
  // but before emitSummary (violating Spec 47 §3.5).
  // v3 HIGH-J: coaFirstDeployGrace = TRUE if F.1 has NO pipeline_runs rows
  //   older than 7 days (cold-start). FALSE means it's been running ≥7 days;
  //   `no_prior_run` then means broken cron.
  // v3 HIGH-I: inQuietPeriod = TRUE during first 30 days post-deploy
  //   (suppresses expected-WARN on coa_anchor_fallback_pct +
  //   coa_anchor_stale_lifecycle_transition_count).
  const { rows: deployAgeRows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '7 days')::int  AS prior_runs_7d,
       COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '30 days')::int AS prior_runs_30d
     FROM pipeline_runs
     WHERE pipeline = 'permits:compute_trade_forecasts'`,
  );
  const coaFirstDeployGrace = deployAgeRows[0].prior_runs_7d === 0;
  const inQuietPeriod = deployAgeRows[0].prior_runs_30d === 0;

  // (b) Grace bypass — fires when calibration isn't yet PASS AND we're in
  // the cold-start window (no pipeline_runs older than 7 days for this slug).
  // `coaFirstDeployGrace` is computed once at startup (just above). It does
  // NOT auto-deactivate within a run — it transitions to false on the NEXT
  // script invocation once prior_runs_7d > 0.
  const coaGraceBypassActive = coaFirstDeployGrace && !coaGateActive;
  if (coaGraceBypassActive) {
    coaGateActive = true;
    coaGateStatus = `grace_bypass_${coaGateStatus}`;
  }

  // (c) Force-active — operator safety valve via logic_variable. Last so it
  // decisively wins regardless of grace or verdict. For post-grace deadlocks
  // (e.g., coa_cohort_presence still 0 after 7 days because of a separate
  // upstream bug) operator sets coa_gate_force_active=1 via Control Panel.
  const coaGateForceActive = logicVars.coa_gate_force_active === 1;
  if (coaGateForceActive) {
    coaGateActive = true;
    coaGateStatus = `forced_active_${coaGateStatus}`;
  }

  pipeline.log.info('[trade-forecasts]',
    `CoA audit-verdict gate: ${coaGateStatus} (last_run_id=${coaGateLastRunId}, last_verdict=${coaGateLastVerdict})`);

  // Spec 79 §7a WF3 #2 fold C — accurate post-mortem log when overrides fire.
  // Either override produces writes without normal calibration validation;
  // operator-visible WARN with both flag states + the suppressed verdict.
  if (coaGraceBypassActive || coaGateForceActive) {
    pipeline.log.warn('[trade-forecasts]',
      `CoA gate overridden — calibration verdict was ${coaGateLastVerdict || 'no_prior_run'}. ` +
      `grace_bypass=${coaGraceBypassActive} force_active=${coaGateForceActive}. ` +
      `Grace bypass deactivates on next script run once pipeline_runs has rows ≥7d old. ` +
      `Force-active deactivates when coa_gate_force_active is set to 0 via Control Panel.`);
  }

  // (deployAgeRows / coaFirstDeployGrace / inQuietPeriod hoisted to ABOVE the
  //  gate overrides per DeepSeek IMPL-review CRIT fold — they're now declared
  //  immediately before the grace bypass block, ~70 lines earlier.)

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
  // Phase F.1 Step 1.b: Load CoA cohort calibration from phase_stay_calibration
  // ═══════════════════════════════════════════════════════════
  // v2 CRIT 6 fold: phase_stay_calibration is a DIFFERENT table from phase_calibration. E.3
  // writes CoA-side rows here keyed on the 5-tuple (NULL permit_type, project_type,
  // coa_type_class, from_seq, to_seq).
  // v2 CRIT 1 + v3 HIGH-F folds: lookup keys on from_seq matching lifecycle_seq (the cohort
  // row's from_seq = the phase being EXITED in the LAG window). Multiple to_seq variants for
  // the same from_seq are collapsed by keeping max-sample row. 4-level fallback:
  //   1 exact, 2 (pt, __ALL__, fs), 3 (__ALL__, tc, fs), 4 (__ALL__, __ALL__, fs), 5 default.
  pipeline.log.info('[trade-forecasts]', 'Loading CoA cohort calibration from phase_stay_calibration...');
  const { rows: coaCalRows } = await pool.query(
    `SELECT project_type, coa_type_class, from_seq, to_seq,
            median_days, p25_days, p75_days, sample_size, permit_type
       FROM phase_stay_calibration
      WHERE permit_type IS NULL
        AND from_seq IS NOT NULL
        AND median_days IS NOT NULL`,
  );

  // Map<projectType, Map<coaTypeClass, Map<fromSeq, {median,p25,p75,sample,toSeq}>>>
  const coaCalMap = new Map();
  for (const row of coaCalRows) {
    if (row.permit_type != null) continue;  // v2 LOW 13 fold: undef-safe; defensive belt-and-suspenders
    const pt = row.project_type ?? '__ALL__';
    const tc = row.coa_type_class ?? '__ALL__';
    const fs = row.from_seq;                // v2 CRIT 1 fold: key on from_seq, NOT to_seq

    if (!coaCalMap.has(pt)) coaCalMap.set(pt, new Map());
    const m2 = coaCalMap.get(pt);
    if (!m2.has(tc)) m2.set(tc, new Map());
    const existing = m2.get(tc).get(fs);
    if (!existing || row.sample_size > existing.sample) {
      m2.get(tc).set(fs, {
        median: row.median_days,
        p25:    row.p25_days,
        p75:    row.p75_days,
        sample: row.sample_size,
        toSeq:  row.to_seq,
      });
    }
  }
  const coaCohortCount = [...coaCalMap.values()].reduce(
    (n, m1) => n + [...m1.values()].reduce((nn, m2) => nn + m2.size, 0), 0);
  pipeline.log.info('[trade-forecasts]',
    `CoA cohort calibration loaded: ${coaCalRows.length} raw rows → ${coaCohortCount} unique (pt,tc,from_seq) cohorts`);

  // v3 HIGH-F: 5-level fallback chain. fallback_all_type_classes (Level 2), fallback_all_
  // project_types (Level 3 — NEW), fallback_all_cohorts (Level 4), default (Level 5).
  function lookupCoaCalibration(projectType, coaTypeClass, lifecycleSeq) {
    // Level 1: exact (project_type, coa_type_class, from_seq=lifecycleSeq)
    const l1 = coaCalMap.get(projectType)?.get(coaTypeClass)?.get(lifecycleSeq);
    if (l1) return { ...l1, method: 'exact' };
    // Level 2: (project_type, __ALL__ coa_type_class, from_seq) — collapse type-class dimension
    const l2 = coaCalMap.get(projectType)?.get('__ALL__')?.get(lifecycleSeq);
    if (l2) return { ...l2, method: 'fallback_all_type_classes' };
    // Level 3: (__ALL__ project_type, coa_type_class, from_seq) — v3 HIGH-F fold (NEW)
    const l3 = coaCalMap.get('__ALL__')?.get(coaTypeClass)?.get(lifecycleSeq);
    if (l3) return { ...l3, method: 'fallback_all_project_types' };
    // Level 4: (__ALL__ project_type, __ALL__ coa_type_class, from_seq) — collapse both
    const l4 = coaCalMap.get('__ALL__')?.get('__ALL__')?.get(lifecycleSeq);
    if (l4) return { ...l4, method: 'fallback_all_cohorts' };
    // Level 5: default (logicVars-driven; same as permit-side fallback)
    return { median: defaultMedianDays, p25: defaultP25Days, p75: defaultP75Days, sample: 0, method: 'default' };
  }

  // ═══════════════════════════════════════════════════════════
  // Step 2: Capture preRowCount BEFORE any mutation (§47 §8.1).
  //
  // WF3 B2-H2 (2026-04-23): preRowCount is captured here — outside the
  // main write transaction — so records_new = postRowCount - preRowCount
  // reflects the true baseline even when the transaction later rolls back
  // a failed chunk. Advisory lock 85 already prevents concurrent writers,
  // so there is no race between this SELECT and the later DELETEs.
  // ═══════════════════════════════════════════════════════════
  let stalePurged = 0;
  let stalePurgedPermit = 0;            // Phase F.1: per-branch breakdown
  let stalePurgedCoa = 0;
  let gracePurged = 0;
  let preRowCount = 0;
  let preCountFailed = false;
  const failedSample = [];               // Phase F.1 v3 MED-M + v4 MED-I: lead_id pre-validation
  const validForecasts = [];             // Phase F.1: pre-validated subset of allForecasts
  // diff-fold #4 (DeepSeek HIGH 2): track invalid-format count per branch so audit can surface
  let leadIdFormatFailedPermit = 0;
  let leadIdFormatFailedCoa = 0;
  // diff-fold #5 (DeepSeek CRIT 2): surface NULL lifecycle_seq CoA rows that silently fall to default
  let coaNullLifecycleSeqCount = 0;
  try {
    const { rows: preCount } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM trade_forecasts',
    );
    preRowCount = preCount[0].n;
  } catch (err) {
    // WF3 (2026-04-23): flag failure so newRows defaults to 0 instead of
    // postRowCount. Without the flag, `newRows = Math.max(0, postRowCount - 0)`
    // would report every re-run row as "new", making records_new ≈ postRowCount
    // and records_updated = 0 — the opposite of reality on any subsequent run.
    preCountFailed = true;
    pipeline.log.warn(
      '[trade-forecasts]',
      'preRowCount query failed — records_new will default to 0',
      { error: err instanceof Error ? err.message : String(err) },
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Step 3: Stream permit-trade pairs + compute in memory, then run
  //         ONE atomic purge+upsert transaction (§47 §7.1, §7.3).
  //
  // WF3 B2-C1 (2026-04-23): previously each FORECAST_BATCH_SIZE chunk had
  // its own transaction, and the first chunk's transaction carried the
  // grace-purge + stale-purge DELETEs. A crash after the first chunk left
  // the DB with purged old rows + a partial slice of new rows — the
  // canonical §7.3 violation. Fixed by accumulating all forecasts in a
  // single in-memory array during the stream and running one
  // withTransaction that wraps grace-purge, stale-purge, and the chunked
  // UPSERT loop. Peak heap ≈ 183K rows × ~300 bytes ≈ 55MB — well within
  // the pipeline budget. Advisory lock 85 prevents concurrent runs; pool
  // max (10) comfortably accommodates streamQuery's connection + the
  // tx's connection + the lock's connection.
  // ═══════════════════════════════════════════════════════════
  // ╔═══════════════════════════════════════════════════════════════════════════════════╗
  // ║ Phase F.1 SOURCE_SQL — Branch A (permit-side, preserved exactly) + Branch B (NEW). ║
  // ║                                                                                   ║
  // ║ CRITICAL: Branch B's WHERE clause must stay in sync with the CoA stale-purge      ║
  // ║ CTE (see Part 2.7 / live_coa_forecasts below). Any change to "what counts as a    ║
  // ║ live CoA forecast subject" must be mirrored in BOTH places. Otherwise stale-purge ║
  // ║ either drops active forecasts or leaves ghosts.                                   ║
  // ╚═══════════════════════════════════════════════════════════════════════════════════╝
  const SOURCE_SQL = `
    WITH last_passed AS (
      SELECT permit_num, MAX(inspection_date)::timestamptz AS last_passed_inspection_date
        FROM permit_inspections
       WHERE status = 'Passed'
       GROUP BY permit_num
    )
    -- Branch A: permit-side
    -- P16 16E [GRD-4]: attachment_basis projected in BOTH branches — the provenance input
    -- to the inference_weight confidence banding + the inference_forecast_inputs_count row.
    SELECT p.permit_num, p.revision_num, p.lead_id, t.slug AS trade_slug,
           p.lifecycle_phase, p.phase_started_at, p.permit_type,
           NULL::text AS project_type, NULL::text AS coa_type_class,
           NULL::int  AS lifecycle_seq,  NULL::text AS lifecycle_group,
           p.lifecycle_stalled, p.issued_date, p.application_date,
           NULL::date AS decision_date, NULL::date AS hearing_date,
           NULL::timestamptz AS first_seen_at,
           lp.last_passed_inspection_date,
           pt.attachment_basis
      FROM permit_trades pt
      JOIN trades t ON t.id = pt.trade_id
      JOIN permits p ON p.permit_num = pt.permit_num
                    AND p.revision_num = pt.revision_num
      LEFT JOIN last_passed lp ON lp.permit_num = p.permit_num
     WHERE pt.is_active = true
       AND p.lifecycle_phase IS NOT NULL
       AND p.lifecycle_stalled = false
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

    UNION ALL

    -- Branch B: CoA-side (Phase F.1)
    -- LATERAL JOIN value 'phase_started_at' is a DERIVED alias matching the permit-side
    -- column semantically (most-recent phase transition timestamp); coa_applications has
    -- no real phase_started_at column.
    -- v2 HIGH 7 fold: decision_date + hearing_date are DATE (no TZ); explicit AT TIME ZONE 'UTC'
    -- cast forces canonical interpretation. phase_started_at and first_seen_at are already
    -- timestamptz so they bypass the cast (v4 NIT-N comment).
    -- v4 HIGH-G fold: 3-year time bound REMOVED. lifecycle_group filter already gates active
    -- (C1/C2/C3) vs terminal (C4); long-running OMB appeals (>3 years) must still produce
    -- forecasts. (Permits-side 3-year bound exists to prune ancient ungated applications;
    -- CoA doesn't have that pathology.)
    SELECT NULL::varchar(30) AS permit_num,
           NULL::varchar(10) AS revision_num,
           lt.lead_id, t.slug AS trade_slug,
           ca.lifecycle_phase, latest_trans.phase_started_at,
           NULL::text AS permit_type,
           ca.project_type, ca.coa_type_class,
           ca.lifecycle_seq, ca.lifecycle_group,
           ca.lifecycle_stalled,
           NULL::date AS issued_date, NULL::date AS application_date,
           ca.decision_date, ca.hearing_date, ca.first_seen_at,
           NULL::timestamptz AS last_passed_inspection_date,
           lt.attachment_basis
      FROM lead_trades lt
      JOIN trades t ON t.id = lt.trade_id
      JOIN coa_applications ca ON ca.lead_id = lt.lead_id
      LEFT JOIN LATERAL (
        SELECT MAX(transitioned_at) AS phase_started_at
          FROM lifecycle_transitions
         WHERE lead_id = lt.lead_id
      ) latest_trans ON true
     WHERE lt.is_active = true
       AND lt.lead_id LIKE 'coa:%'
       AND ca.lifecycle_phase IS NOT NULL
       AND ca.lifecycle_stalled = false
       AND ca.lifecycle_group IN ('C1','C2','C3')
       AND COALESCE(
             latest_trans.phase_started_at,
             (ca.decision_date::timestamp AT TIME ZONE 'UTC'),
             (ca.hearing_date::timestamp  AT TIME ZONE 'UTC'),
             ca.first_seen_at
           ) IS NOT NULL
  `;

  // Phase F.1: counters split per-branch. records_total = permits + CoA per Spec 47 §11.1
  // (both forecast subjects per Spec 85 §3 unified output entity).
  let totalRowsPermit = 0;
  let totalRowsCoa = 0;
  let skipped = 0;             // permit-side: no-anchor
  let skippedPastTarget = 0;   // permit-side: phase-past-target guard
  let skippedTooOld = 0;       // permit-side: grace cutoff
  let unmappedTrades = 0;
  // Spec 80 P4 (D1 / OB-F5): excluded (non-forecastable) rows + distinct slugs seen.
  // Kept OUTSIDE records_total (skipped before totalRows++) and OUTSIDE unmapped_trades.
  let excludedRows = 0;
  const excludedSlugsSeen = new Set();
  // P16 16E [D-1] — inference-basis rows entering the forecast inputs (the consumption
  // boundary counter; 0 while the p16_inference_layer_enabled gate is OFF).
  let inferenceForecastInputs = 0;
  // P16 16E — provenance weight (Zod-defaulted 0.5; see LOGIC_VARS_SCHEMA note).
  const inferenceWeight = Number(logicVars.inference_weight ?? 0.5);
  // Weighted calibration-sample input for classifyConfidence: inference-basis rows
  // contribute at inference_weight× (an inference attachment needs 1/weight× the sample
  // to reach the same confidence band). Evidence/legacy-NULL rows pass through untouched.
  const weightedSample = (sample, basis) =>
    basis === 'inference' ? Math.floor(sample * inferenceWeight) : sample;
  let upserted = 0;
  let upsertedCoa = 0;
  let anchorFallbackCount = 0; // permit-side fallback count
  let snowplowCount = 0;       // permit-side snowplow count

  // Phase F.1 CoA-side counters (v3 HIGH-H + v4 folds)
  let skippedNoAnchorCoa = 0;
  let skippedTooOldCoa = 0;
  let snowplowAppliedCoa = 0;
  let coaSkippedAuditBlocked = 0;
  let coaAnchorFallbackCount = 0;
  let coaAnchorStaleLifecycleTransitionCount = 0;

  // coa_skipped_count is RETAINED at 0 indefinitely for 7-day Observer baseline continuity
  // (v2 CRIT 5 fold). Active CoA branch supersedes the E.2 defensive guard which is REMOVED.
  const coaSkippedCount = 0;

  // anchor-source breakdown for permit-side audit (existing) + CoA-side audit (new)
  const anchorSourceCounts = {
    phase_started_at: 0,
    last_passed_inspection: 0,
    issued_date: 0,
    application_date: 0,
  };
  const coaAnchorSourceCounts = {
    lifecycle_transition: 0,
    decision_date: 0,
    hearing_date: 0,
    first_seen_at: 0,
  };

  // v3 HIGH-H fold: per-lifecycle_group skip+upsert breakdown for §11.4 cohort traceability.
  // Operator can answer "what happened to N CoAs in C2 last week?" from records_meta.
  const skipDistribution = {
    C1: { skipped_no_anchor: 0, skipped_too_old: 0, snowplow_applied: 0, upserted: 0 },
    C2: { skipped_no_anchor: 0, skipped_too_old: 0, snowplow_applied: 0, upserted: 0 },
    C3: { skipped_no_anchor: 0, skipped_too_old: 0, snowplow_applied: 0, upserted: 0 },
  };

  // In-memory mirror of the grace-purge DELETE threshold. Rows whose final
  // predictedStart would land before this cutoff are dropped here rather than
  // being written to trade_forecasts only to be deleted on the same run —
  // breaking the write+delete zombie loop. Uses runAt (DB clock) to match
  // the SQL `$1::timestamptz - INTERVAL '${GRACE_PURGE_DAYS} days'` exactly.
  const graceCutoffMs = new Date(runAt).getTime() - GRACE_PURGE_DAYS * 24 * 60 * 60 * 1000;

  // In-memory accumulator for all forecasts computed during the stream.
  // Peak heap ≈ |permit-trade rows that survive skips| × ~300 bytes per object.
  // At current scale (~183K input rows → ~130K surviving forecasts after skips)
  // this is ≈ 40MB — acceptable per spec 85 §6.1 memory budget.
  const allForecasts = [];

  pipeline.log.info('[trade-forecasts]', 'Streaming active permit-trade pairs...');
  for await (const row of pipeline.streamQuery(pool, SOURCE_SQL, [])) {
    const isCoaRow = typeof row.lead_id === 'string' && row.lead_id.startsWith('coa:');

    // ═════════════════════════════════════════════════════════════════════
    // Spec 80 P4 (D1 / OB-F5): non-forecastable trade exclusion — FIRST, before
    // both the branch dispatch and the totalRows++ increments. Excluded slugs
    // have no phase-anchored install window; they are counted ONLY as
    // excluded_rows (never records_total, never unmapped_trades) so the
    // unmapped_trades == 0 acceptance holds and the exclusion is loud, not silent.
    // ═════════════════════════════════════════════════════════════════════
    if (excludedTradeSlugs.has(row.trade_slug)) {
      excludedRows++;
      excludedSlugsSeen.add(row.trade_slug);
      continue;
    }

    // P16 16E [D-1] — count inference-basis rows at the consumption boundary (both branches;
    // after the excluded-slug skip so the counter mirrors what actually enters the engine).
    if (row.attachment_basis === 'inference') inferenceForecastInputs++;

    // ═════════════════════════════════════════════════════════════════════
    // Phase F.1 CoA branch dispatch (v2 CRIT folds + v3/v4 hardening)
    // ═════════════════════════════════════════════════════════════════════
    if (isCoaRow) {
      totalRowsCoa++;
      if (!coaGateActive) {
        coaSkippedAuditBlocked++;
        continue;
      }

      const anchor = selectCoaAnchor(row);
      if (!anchor) {
        skippedNoAnchorCoa++;
        if (skipDistribution[row.lifecycle_group]) skipDistribution[row.lifecycle_group].skipped_no_anchor++;
        continue;
      }
      const { date: effectiveAnchor, source: coaAnchorSource } = anchor;

      // 5-tuple cohort lookup (from_seq matching lifecycle_seq per v2 CRIT 1 / v3 HIGH-F)
      // diff-fold #5 (DeepSeek CRIT 2): count NULL lifecycle_seq rows that silently fall to default
      if (row.lifecycle_seq == null) coaNullLifecycleSeqCount++;
      const cal = lookupCoaCalibration(row.project_type, row.coa_type_class, row.lifecycle_seq);

      // CoA bimodal simplification: target_window = 'bid' ALWAYS (Spec 85 §3)
      const targetWindow = 'bid';

      const anchorDate = new Date(effectiveAnchor);
      if (isNaN(anchorDate.getTime())) {
        skippedNoAnchorCoa++;
        if (skipDistribution[row.lifecycle_group]) skipDistribution[row.lifecycle_group].skipped_no_anchor++;
        continue;
      }
      anchorDate.setUTCHours(0, 0, 0, 0);
      let predictedStart = new Date(anchorDate);
      predictedStart.setUTCDate(predictedStart.getUTCDate() + cal.median);

      // v3 CRIT-D fold: snowplow eligibility — first_seen_at always eligible (years-stale CKAN
      // seed); lifecycle_transition eligible only when older than logicVars.coa_lifecycle_
      // transition_stale_days (default 180d ≈ p75 of CoA decision cohort).
      const anchorAgeDays = (new Date(runAt).getTime() - anchorDate.getTime()) / (24 * 60 * 60 * 1000);
      const lifecycleTransitionStale =
            coaAnchorSource === 'lifecycle_transition'
            && anchorAgeDays > logicVars.coa_lifecycle_transition_stale_days;
      if (lifecycleTransitionStale) coaAnchorStaleLifecycleTransitionCount++;
      const snowplowEligible = coaAnchorSource === 'first_seen_at' || lifecycleTransitionStale;
      const isPast = predictedStart.getTime() < new Date(runAt).getTime();
      if (snowplowEligible && isPast) {
        predictedStart = new Date(today);
        predictedStart.setUTCDate(predictedStart.getUTCDate() + logicVars.snowplow_buffer_days);
        snowplowAppliedCoa++;
        if (skipDistribution[row.lifecycle_group]) skipDistribution[row.lifecycle_group].snowplow_applied++;
      }

      if (predictedStart.getTime() < graceCutoffMs) {
        skippedTooOldCoa++;
        if (skipDistribution[row.lifecycle_group]) skipDistribution[row.lifecycle_group].skipped_too_old++;
        continue;
      }

      const daysUntil = Math.floor((predictedStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      // CoA never sets isPastTarget (target_window='bid' only)
      const urgency = classifyUrgency(
        daysUntil,
        /* isPastTarget */ false,
        logicVars.expired_threshold_days,
        tradeConfigs[row.trade_slug]?.imminent_window_days ?? 14,
        logicVars.urgency_overdue_days,
        logicVars.urgency_upcoming_days,
      );
      // P16 16E — inference-basis rows band at inference_weight× the calibration sample.
      const confidence = classifyConfidence(weightedSample(cal.sample, row.attachment_basis), cal.method === 'default');

      // v2 MED 12 fold: explicit cases + throw on unknown source (unreachable via selectCoaAnchor enum)
      let finalCalMethod;
      switch (coaAnchorSource) {
        case 'lifecycle_transition': finalCalMethod = cal.method; break;
        case 'decision_date':        finalCalMethod = 'fallback_decision'; break;
        case 'hearing_date':         finalCalMethod = 'fallback_hearing'; break;
        case 'first_seen_at':        finalCalMethod = 'fallback_first_seen'; break;
        default:
          throw new Error(`[trade-forecasts] selectCoaAnchor returned unknown source: ${coaAnchorSource}`);
      }

      coaAnchorSourceCounts[coaAnchorSource]++;
      if (coaAnchorSource !== 'lifecycle_transition') coaAnchorFallbackCount++;

      allForecasts.push({
        permit_num:    null,
        revision_num:  null,
        lead_id:       row.lead_id,
        trade_slug:    row.trade_slug,
        predicted_start: predictedStart.toISOString().slice(0, 10),
        confidence, urgency,
        target_window: targetWindow,
        calibration_method: finalCalMethod,
        sample_size: cal.sample,
        median_days: cal.median,
        p25_days:    cal.p25,
        p75_days:    cal.p75,
      });
      upsertedCoa++;
      if (skipDistribution[row.lifecycle_group]) skipDistribution[row.lifecycle_group].upserted++;
      continue;
    }

    // ═════════════════════════════════════════════════════════════════════
    // Permit branch (existing logic preserved — E.2 defensive guard REMOVED above)
    // ═════════════════════════════════════════════════════════════════════
    totalRowsPermit++;

    const {
      permit_num, revision_num, trade_slug,
      lifecycle_phase, phase_started_at, permit_type,
      lifecycle_stalled, last_passed_inspection_date,
      issued_date, application_date,
    } = row;

    // Fallback Anchor Hierarchy (spec 85 §3): phase_started_at → last passed
    // inspection → issued_date → application_date.
    // WF3 B2-H3 (2026-04-23): track anchorSource explicitly so the Historic
    // Snowplow only fires for anchors that can be years stale (issued_date,
    // application_date). The old anchorIsFallback boolean snowplowed freshly
    // inspection-anchored permits even when their predictedStart was only
    // a few days past — unnecessarily clobbering real signal.
    let effectiveAnchor;
    let anchorSource;
    if (phase_started_at) {
      effectiveAnchor = phase_started_at;
      anchorSource = 'phase_started_at';
    } else if (last_passed_inspection_date) {
      effectiveAnchor = last_passed_inspection_date;
      anchorSource = 'last_passed_inspection';
    } else if (issued_date) {
      effectiveAnchor = new Date(issued_date + 'T00:00:00Z');
      anchorSource = 'issued_date';
    } else if (application_date) {
      effectiveAnchor = new Date(application_date + 'T00:00:00Z');
      anchorSource = 'application_date';
    } else {
      skipped++;
      continue;
    }

    // Preserved as a derived boolean so the anchor_fallbacks_used counter
    // and existing audit rows keep the same semantic: "any non-phase
    // anchor is a fallback," regardless of how stale the anchor is.
    const anchorIsFallback = anchorSource !== 'phase_started_at';

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

    // Phase-Past-Target Guard: permit has moved PAST the target phase —
    // the trade's opportunity window is definitively closed. Skip entirely
    // rather than generating a forecast that immediately classifies as `expired`.
    // Strict > (not >=): AT the target phase means the window is RIGHT NOW
    // (overdue urgency); strictly PAST means the opportunity is gone.
    if (currentOrdinal != null && targetOrdinal != null && currentOrdinal > targetOrdinal) {
      skippedPastTarget++;
      continue;
    }

    // Count fallback anchor usage only for rows that will produce a forecast.
    // Must come after the Phase-Past-Target Guard so rows that are immediately
    // skipped do not inflate the fallback counter.
    if (anchorIsFallback) anchorFallbackCount++;
    anchorSourceCounts[anchorSource]++;

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
    // issued_date / application_date anchors are often 1-3 years in the past.
    // predictedStart = oldAnchor + median still lands in the past → large negative
    // daysUntil → expired urgency (was 76.9% FAIL after WF1). Snap to today +
    // snowplow_buffer_days (DB-driven, spec 47 §4.1) so rescued leads are Rescue
    // Missions.
    // Use runAt (actual run timestamp) not today (midnight UTC) — any predictedStart
    // before the current moment triggers the snowplow, including same-day forecasts
    // that land at today-midnight (equal to `today`, so the old guard missed them).
    // WF3 B2-H3 (2026-04-23): gate on anchorSource, not anchorIsFallback. A
    // last_passed_inspection anchor is fresh by definition (< 60 days old) —
    // snowplowing it clobbers real signal with an arbitrary buffer date.
    const isPast = new Date(predictedStart).getTime() < new Date(runAt).getTime();
    const snowplowSource = anchorSource === 'issued_date' || anchorSource === 'application_date';
    if (snowplowSource && isPast) {
      predictedStart = new Date(today);
      predictedStart.setUTCDate(predictedStart.getUTCDate() + logicVars.snowplow_buffer_days);
      snowplowCount++;
    }

    // 3. In-memory grace cutoff: drop rows whose predictedStart is older than
    // the grace-purge threshold. These would be UPSERTed then immediately
    // deleted by the grace-purge DELETE — producing a zombie write+delete cycle.
    // Dropping here saves the round-trip and eliminates the loop.
    if (predictedStart.getTime() < graceCutoffMs) {
      skippedTooOld++;
      continue;
    }

    // 4. Calculate final daysUntil based on recalibrated date
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
    // P16 16E — inference-basis rows band at inference_weight× the calibration sample.
    const confidence = classifyConfidence(weightedSample(cal.sample, row.attachment_basis), cal.method === 'default');
    // WF3 B2-H3: anchor-source-specific calibration_method. Preserves
    // 'fallback_issued' for issued_date anchors (existing dashboards +
    // infra test pin this label) and adds granular labels for the other
    // two fallback sources so calibration_distribution can distinguish
    // inspection-rescued leads from truly stale application_date ones.
    let finalCalMethod;
    if (anchorSource === 'phase_started_at')          finalCalMethod = cal.method;
    else if (anchorSource === 'issued_date')          finalCalMethod = 'fallback_issued';
    else if (anchorSource === 'last_passed_inspection') finalCalMethod = 'fallback_inspection';
    else                                              finalCalMethod = 'fallback_application';

    allForecasts.push({
      permit_num,
      revision_num,
      lead_id: row.lead_id,                    // Phase F.1: post-mig 151 PK column (explicit write)
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

    // Progress log every ~50 batch-sizes worth of accepted forecasts.
    if (allForecasts.length > 0 && allForecasts.length % (FORECAST_BATCH_SIZE * 50) === 0) {
      pipeline.log.info(
        '[trade-forecasts]',
        `Streamed ${(totalRowsPermit + totalRowsCoa).toLocaleString()} rows, ${allForecasts.length.toLocaleString()} forecasts buffered`,
      );
    }
  }

  pipeline.log.info('[trade-forecasts]',
    `Rows streamed: ${(totalRowsPermit + totalRowsCoa).toLocaleString()} (permit=${totalRowsPermit.toLocaleString()}, coa=${totalRowsCoa.toLocaleString()})`);
  pipeline.log.info('[trade-forecasts]',
    `Forecasts to write: ${allForecasts.length.toLocaleString()} (coa=${upsertedCoa.toLocaleString()})`);
  pipeline.log.info('[trade-forecasts]', `Skipped (no anchor, permit): ${skipped.toLocaleString()}`);
  if (skippedNoAnchorCoa > 0) {
    pipeline.log.info('[trade-forecasts]', `Skipped (no anchor, CoA): ${skippedNoAnchorCoa.toLocaleString()}`);
  }
  if (skippedTooOldCoa > 0) {
    pipeline.log.info('[trade-forecasts]', `Skipped (too old, CoA grace cutoff): ${skippedTooOldCoa.toLocaleString()}`);
  }
  if (coaSkippedAuditBlocked > 0) {
    pipeline.log.info('[trade-forecasts]', `CoA audit-gate blocked: ${coaSkippedAuditBlocked.toLocaleString()} rows (gate=${coaGateStatus})`);
  }
  if (skippedTooOld > 0) {
    pipeline.log.info('[trade-forecasts]', `Skipped (too old, grace cutoff): ${skippedTooOld.toLocaleString()}`);
  }
  if (unmappedTrades > 0) {
    pipeline.log.warn('[trade-forecasts]', `Unmapped trades (not in TRADE_TARGET_PHASE): ${unmappedTrades}`);
  }
  if (excludedRows > 0) {
    pipeline.log.info('[trade-forecasts]',
      `Excluded (non-forecastable) rows: ${excludedRows.toLocaleString()} across slugs [${[...excludedSlugsSeen].sort().join(', ')}]`);
  }

  // ═══════════════════════════════════════════════════════════
  // Step 4: Atomic purge + upsert (§47 §7.1, §7.3).
  //
  // Single withTransaction wrapping: grace-purge DELETE, stale-purge DELETE,
  // then chunked INSERT ON CONFLICT. If any step fails, the tx rolls back
  // and trade_forecasts is unchanged — no "purged-but-not-replaced" window.
  // ═══════════════════════════════════════════════════════════
  await pipeline.withTransaction(pool, async (client) => {
    // F1 Grace-Purge: remove expired forecasts older than GRACE_PURGE_DAYS.
    // The snowplow never rescues expired rows (expired rows have a real phase
    // anchor, so no snapping occurs). Without this purge, expired rows would
    // accumulate indefinitely. Uses runAt for run-clock consistency.
    const graceResult = await client.query(
      `DELETE FROM trade_forecasts
        WHERE urgency = 'expired'
          AND predicted_start < $1::timestamptz - INTERVAL '${GRACE_PURGE_DAYS} days'`,
      [runAt],
    );
    gracePurged = graceResult.rowCount || 0;
    if (gracePurged > 0) {
      pipeline.log.info(
        '[trade-forecasts]',
        `Grace-purged ${gracePurged.toLocaleString()} expired forecasts older than ${GRACE_PURGE_DAYS} days`,
      );
    }

    // F2 Stale-purge — PERMIT branch (v2 CRIT 2 fold adds tf.lead_id LIKE 'permit:%' guard).
    // Restricts to permit-side rows so NULL=NULL UNKNOWN can't silently drop CoA forecasts.
    const { rows: stalePermitRows } = await client.query(
      `DELETE FROM trade_forecasts tf
        WHERE tf.lead_id LIKE 'permit:%'
          AND NOT EXISTS (
          SELECT 1 FROM permit_trades pt
            JOIN permits p ON p.permit_num = pt.permit_num
                          AND p.revision_num = pt.revision_num
            JOIN trades t ON t.id = pt.trade_id
           WHERE pt.permit_num = tf.permit_num
             AND pt.revision_num = tf.revision_num
             AND t.slug = tf.trade_slug
             AND pt.is_active = true
             AND p.lifecycle_phase IS NOT NULL
             AND p.lifecycle_stalled = false
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
    stalePurgedPermit = stalePermitRows.length;

    // F3 Stale-purge — CoA branch (v3 HIGH-E fold: CTE + LEFT JOIN refactor).
    //
    // ╔═══════════════════════════════════════════════════════════════════════════════════╗
    // ║ CRITICAL: this WHERE clause MUST stay in sync with Branch B of SOURCE_SQL above.  ║
    // ║ Any change to "what counts as a live CoA forecast subject" must be mirrored in    ║
    // ║ BOTH places. Otherwise stale-purge drops active forecasts or leaves ghosts.       ║
    // ╚═══════════════════════════════════════════════════════════════════════════════════╝
    //
    // CTE-based pattern: pre-aggregate MAX(transitioned_at) per lead_id once (single scan
    // of lifecycle_transitions), then LEFT JOIN to find purge candidates. Replaces v2's
    // correlated scalar subquery which would have run N times inside the DELETE.
    const { rows: staleCoaRows } = await client.query(
      `WITH live_coa_anchors AS (
         SELECT lead_id, MAX(transitioned_at) AS phase_started_at
           FROM lifecycle_transitions
          WHERE lead_id LIKE 'coa:%'
          GROUP BY lead_id
       ),
       live_coa_forecasts AS (
         SELECT lt.lead_id, t.slug AS trade_slug
           FROM lead_trades lt
           JOIN trades t ON t.id = lt.trade_id
           JOIN coa_applications ca ON ca.lead_id = lt.lead_id
           LEFT JOIN live_coa_anchors la ON la.lead_id = lt.lead_id
          WHERE lt.is_active = true
            AND lt.lead_id LIKE 'coa:%'
            AND ca.lifecycle_phase IS NOT NULL
            AND ca.lifecycle_stalled = false
            AND ca.lifecycle_group IN ('C1','C2','C3')
            AND COALESCE(
                  la.phase_started_at,
                  (ca.decision_date::timestamp AT TIME ZONE 'UTC'),
                  (ca.hearing_date::timestamp  AT TIME ZONE 'UTC'),
                  ca.first_seen_at
                ) IS NOT NULL
       )
       DELETE FROM trade_forecasts tf
        WHERE tf.lead_id LIKE 'coa:%'
          AND NOT EXISTS (
            SELECT 1 FROM live_coa_forecasts lcf
             WHERE lcf.lead_id = tf.lead_id AND lcf.trade_slug = tf.trade_slug
          )
        RETURNING tf.lead_id`,
    );
    stalePurgedCoa = staleCoaRows.length;

    // v3 LOW-P fold: surface first 5 purged CoA lead_ids for operator debugging
    if (stalePurgedCoa > 0) {
      const sample = staleCoaRows.slice(0, 5).map(r => r.lead_id).join(', ');
      pipeline.log.info(
        '[trade-forecasts]',
        `Stale-purged ${stalePurgedCoa.toLocaleString()} CoA forecasts (sample: ${sample}${stalePurgedCoa > 5 ? ', ...' : ''})`,
      );
    }

    stalePurged = stalePurgedPermit + stalePurgedCoa;
    if (stalePurged > 0) {
      pipeline.log.info(
        '[trade-forecasts]',
        `Purged ${stalePurged.toLocaleString()} stale forecasts (permit=${stalePurgedPermit.toLocaleString()}, coa=${stalePurgedCoa.toLocaleString()})`,
      );
    }

    // v3 MED-M + v4 MED-I fold: pre-validate lead_id format for BOTH CoA and permit before
    // INSERT to surface format drift. Failed entries populate failedSample (capped at 20 per
    // Spec 48 §4). Valid forecasts feed the INSERT.
    for (const f of allForecasts) {
      const isCoa = f.lead_id?.startsWith('coa:');
      const isPermit = f.lead_id?.startsWith('permit:');
      const validFormat = (isCoa && LEAD_ID_FORMAT_COA.test(f.lead_id))
                       || (isPermit && LEAD_ID_FORMAT_PERMIT.test(f.lead_id));
      if (!validFormat) {
        if (failedSample.length < 20) {
          const prefix = isCoa ? 'coa' : isPermit ? 'permit' : 'unknown';
          failedSample.push(`lead_id:${f.lead_id} — ${prefix}-format validation failed`);
        }
        // diff-fold #1 (Independent BUG 1 — HIGH 88): drop the now-skipped row from upsertedCoa
        // so forecasts_computed_permit = upserted - upsertedCoa stays accurate. Without this,
        // upsertedCoa counts pushes BEFORE validation while `upserted` counts INSERT rowCount
        // AFTER validation — leading to negative forecasts_computed_permit when any CoA fails.
        if (isCoa) {
          upsertedCoa--;
          leadIdFormatFailedCoa++;
        } else {
          leadIdFormatFailedPermit++;
        }
        continue;
      }
      validForecasts.push(f);
    }

    // Chunked UPSERT: 14 columns per row (Phase F.1 adds lead_id explicitly — post-mig 151 PK).
    // FORECAST_COL_COUNT = 14 single source of truth (v3 NIT-O fold).
    for (let offset = 0; offset < validForecasts.length; offset += FORECAST_BATCH_SIZE) {
      const chunk = validForecasts.slice(offset, offset + FORECAST_BATCH_SIZE);
      const vals = [];
      const params = [];
      for (let j = 0; j < chunk.length; j++) {
        const f = chunk[j];
        const base = j * FORECAST_COL_COUNT;
        vals.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, ` +
          `$${base + 5}::date, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, ` +
          `$${base + 10}::int, $${base + 11}::int, $${base + 12}::int, $${base + 13}::int, ` +
          `$${base + 14}::timestamptz)`,
        );
        params.push(
          f.permit_num, f.revision_num, f.lead_id, f.trade_slug,
          f.predicted_start, f.confidence, f.urgency,
          f.target_window, f.calibration_method,
          f.sample_size, f.median_days, f.p25_days, f.p75_days,
          runAt, // §47 §6.1 — same timestamp for every row in this run
        );
      }
      const insertResult = await client.query(
        `INSERT INTO trade_forecasts
           (permit_num, revision_num, lead_id, trade_slug, predicted_start,
            confidence, urgency, target_window, calibration_method,
            sample_size, median_days, p25_days, p75_days, computed_at)
         VALUES ${vals.join(', ')}
         ON CONFLICT (lead_id, trade_slug)
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
           computed_at = EXCLUDED.computed_at,
           permit_num = EXCLUDED.permit_num,
           revision_num = EXCLUDED.revision_num`,
        params,
      );
      upserted += insertResult.rowCount || 0;
    }
  });

  const { rows: postCount } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM trade_forecasts',
  );
  const postRowCount = postCount[0].n;
  const newRows = preCountFailed ? 0 : Math.max(0, postRowCount - preRowCount);

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

  // P13-5: per-urgency synthetic-share provenance. The in-bounds urgency shape is
  // manufactured while calibration is cold (most rows on the level-5 default prior), so
  // each urgency bucket carries WHAT % of its rows sit on that default — the numbers
  // arrive with their honesty. INFO only (visibility; the real de-synthesizer is the
  // calibration-history backfill, RC5/D2c). Grouped in ONE scan.
  const { rows: urgSynRows } = await pool.query(
    `SELECT urgency,
            COUNT(*) FILTER (WHERE calibration_method = 'default')::int AS syn,
            COUNT(*)::int AS n
       FROM trade_forecasts GROUP BY urgency ORDER BY urgency`,
  );
  const urgencySyntheticRows = urgSynRows.map((r) => ({
    metric: `synthetic_share_${r.urgency}`,
    value: (r.n > 0 ? (100 * r.syn / r.n) : 0).toFixed(1) + '%',
    threshold: `${r.syn}/${r.n} on default calibration (provenance, not a gate)`,
    status: 'INFO',
  }));
  // Avoid div-by-zero on an empty table (e.g., fresh environment)
  const totalForecasts = postRowCount > 0 ? postRowCount : 1;
  const defaultPct = ((calibrationDistribution.default ?? 0) / totalForecasts) * 100;
  const expiredPct = ((urgencyDistribution.expired ?? 0) / totalForecasts) * 100;

  // WF2 D2a (Spec 85 §3.6): externalized default_calibration_pct verdict thresholds + the
  // GRD-F1 mechanical re-tightening guard. STRICT pair (20/50) is the pre-relaxation baseline —
  // any active pair looser than it emits calibration_thresholds_relaxed WARN on every run so the
  // loosening can never quietly become permanent. calibration_cohort_fill_pct = share of rows NOT
  // on the level-5 calibration_method='default' (cheap: 100 − default_calibration_pct).
  const STRICT_CALIB_WARN_PCT = 20;
  const STRICT_CALIB_FAIL_PCT = 50;
  const calibWarnPct = logicVars.forecast_default_calibration_warn_pct;
  const calibFailPct = logicVars.forecast_default_calibration_fail_pct;
  const calibThresholdsRelaxed = calibWarnPct > STRICT_CALIB_WARN_PCT || calibFailPct > STRICT_CALIB_FAIL_PCT;
  const calibCohortFillPct = 100 - defaultPct;
  // WF2 P8 escalation (Gemini P9-pass): three-state guard — PASS (strict active) /
  // WARN (relaxed + cohorts still cold) / FAIL (relaxed + cohorts RECOVERED past
  // the strict-PASS point = config drift demanding a return to strict thresholds).
  const calibRelaxedStatus = classifyCalibrationThresholdStatus({
    relaxed: calibThresholdsRelaxed,
    defaultPct,
    strictWarnPct: STRICT_CALIB_WARN_PCT,
  });

  // Phase F.1 audit row classifications (v3 HIGH-J + v3 HIGH-I + v4 HIGH-F folds).
  // coa_audit_gate_status — INFO for healthy (pass) + first-deploy-grace cold-start.
  //   WARN for actual upstream failures or persistent absence (broken cron).
  let coaGateAuditStatus;
  if (coaGateStatus === 'pass') {
    coaGateAuditStatus = 'INFO';
  } else if (coaGateStatus === 'no_prior_run' && coaFirstDeployGrace) {
    coaGateAuditStatus = 'INFO';                                  // Day 0–7 cold-start
  } else {
    coaGateAuditStatus = 'WARN';                                  // broken-cron OR actual failure
  }

  // coa_anchor_fallback_pct — quiet-period INFO during first 30 days; threshold-WARN after.
  const coaAnchorFallbackPct = totalRowsCoa > 0
    ? (coaAnchorFallbackCount / totalRowsCoa) * 100 : 0;
  const coaAnchorFallbackStatus = inQuietPeriod
    ? 'INFO'
    : (coaAnchorFallbackPct >= 95 ? 'WARN' : 'PASS');

  // coa_anchor_stale_lifecycle_transition_count — quiet-period INFO; > 50% post-quiet → WARN.
  const coaStalePct = totalRowsCoa > 0
    ? (coaAnchorStaleLifecycleTransitionCount / totalRowsCoa) : 0;
  // diff-fold #3 (Observability HIGH 85): below-threshold post-quiet-period must be 'PASS'
  // not 'INFO' so the Spec 48 Observer's anomaly detection sees a clean signal.
  const coaStaleStatus = inQuietPeriod
    ? 'INFO'
    : (coaStalePct > 0.5 ? 'WARN' : 'PASS');

  // Build audit table per spec 47 §8.2 — forecast engine minimum + Phase F.1 additions.
  const auditRows = [
    { metric: 'forecasts_computed',        value: upserted,                threshold: null,    status: 'INFO' },
    { metric: 'new_forecasts',             value: newRows,                 threshold: null,    status: 'INFO' },
    { metric: 'stale_purged',              value: stalePurged,             threshold: null,    status: 'INFO' },
    { metric: 'stale_purged_permit',       value: stalePurgedPermit,       threshold: null,    status: 'INFO' },
    { metric: 'stale_purged_coa',          value: stalePurgedCoa,          threshold: null,    status: 'INFO' },
    { metric: 'grace_purged',             value: gracePurged,             threshold: null,    status: 'INFO' },
    // skipped_no_anchor: permit-side only (CoA breakdown in skipped_no_anchor_coa)
    { metric: 'skipped_no_anchor',         value: skipped,                 threshold: null,    status: 'INFO' },
    { metric: 'skipped_past_target',       value: skippedPastTarget,       threshold: null,    status: 'INFO' },
    { metric: 'skipped_too_old',           value: skippedTooOld,           threshold: null,    status: 'INFO' },
    { metric: 'snowplow_applied',          value: snowplowCount,           threshold: null,    status: 'INFO' },
    // Phase F.1 CoA-side counters in audit_table.rows per Spec 47 §11.4 (v2 HIGH 8)
    { metric: 'skipped_no_anchor_coa',     value: skippedNoAnchorCoa,      threshold: null,    status: 'INFO' },
    { metric: 'skipped_too_old_coa',       value: skippedTooOldCoa,        threshold: null,    status: 'INFO' },
    { metric: 'snowplow_applied_coa',      value: snowplowAppliedCoa,      threshold: null,    status: 'INFO' },
    { metric: 'coa_forecasts_computed',    value: upsertedCoa,             threshold: null,    status: 'INFO' },
    { metric: 'coa_skipped_audit_blocked', value: coaSkippedAuditBlocked,  threshold: null,    status: 'INFO' },
    { metric: 'coa_audit_gate_status',     value: coaGateStatus,           threshold: "== 'pass'", status: coaGateAuditStatus },
    // Spec 79 §7a WF3 #2 (Finding J): two distinct override-visibility rows so
    // operators can distinguish grace bypass (auto, cold-start) from force-active
    // (manual, post-grace deadlock). WARN status when either is active — writes
    // are flowing without normal calibration validation; operator should monitor.
    { metric: 'coa_audit_gate_grace_bypass',
      value: coaGraceBypassActive ? 1 : 0,
      threshold: '== 0; if 1, calibration unhealthy and cold-start grace is allowing writes — verify by re-running compute_phase_calibration after 7d',
      status: coaGraceBypassActive ? 'WARN' : 'INFO' },
    { metric: 'coa_audit_gate_force_active',
      value: coaGateForceActive ? 1 : 0,
      threshold: '== 0; if 1, operator has manually overridden the gate — set coa_gate_force_active=0 once root cause is resolved',
      status: coaGateForceActive ? 'WARN' : 'INFO' },
    // D3a (OB-F6 / GRD-F2): the third bypass, as loud as the two it joins. A WARN calibration
    // verdict was accepted under coa_gate_policy='pass_or_warn' — writes flow on a sample-size
    // caveat rather than a clean PASS; operator should monitor. Value carries the accepted verdict.
    // WF2 P8 amendment (Gemini): three-state re-tightening guard mirroring
    // calibration_thresholds_relaxed. WARN while a WARN verdict is accepted under
    // pass_or_warn (calibration cold). FAIL once the calibration verdict recovers
    // to a clean PASS while the policy is STILL pass_or_warn — the loose policy is
    // no longer needed and persisting it is config drift demanding a revert.
    { metric: 'coa_audit_gate_warn_accepted',
      value: coaGateWarnAccepted ? 1 : 0,
      threshold: `policy=${coaGatePolicy}; == 0 under pass_only. WARN while a WARN verdict is accepted (calibration cold); FAIL once calibration recovers to PASS while policy is still pass_or_warn — set coa_gate_policy=pass_only to revert`,
      status: classifyCoaGateWarnAcceptedStatus({
        policy: coaGatePolicy,
        warnAccepted: coaGateWarnAccepted,
        calibrationPassGrade: coaCalibrationPassGrade,
      }) },
    {
      metric: 'coa_anchor_fallback_pct',
      value: coaAnchorFallbackPct.toFixed(1) + '%',
      threshold: '< 95% post-quiet-period; INFO during 30-day quiet period',
      status: coaAnchorFallbackStatus,
    },
    // v4 HIGH-F: numeric 1/0 (NOT JS boolean) per Spec 48 §3.1 — Observer's anomaly detection
    // math coerces boolean to NaN.
    { metric: 'coa_anchor_fallback_pct_quiet_period', value: inQuietPeriod ? 1 : 0, threshold: null, status: 'INFO' },
    {
      metric: 'coa_anchor_stale_lifecycle_transition_count',
      value: coaAnchorStaleLifecycleTransitionCount,
      threshold: '< 50% of totalRowsCoa post-quiet-period',
      status: coaStaleStatus,
    },
    {
      metric: 'unmapped_trades',
      value: unmappedTrades,
      threshold: '== 0',
      status: unmappedTrades > 0 ? 'WARN' : 'PASS',
    },
    // Spec 80 P4 (D1 / OB-F5): the two exclusion-visibility rows. excluded_rows mirrors
    // unmapped_trades' row-count semantics (a counted, never-silent skip); excluded_trade_slugs
    // names the distinct slugs so an operator can see WHICH trades were withheld. Both INFO —
    // exclusion is a deliberate, configured non-forecastable classification, not an anomaly.
    { metric: 'excluded_rows', value: excludedRows, threshold: null, status: 'INFO' },
    {
      metric: 'excluded_trade_slugs',
      value: [...excludedSlugsSeen].sort().join(', ') || '(none)',
      threshold: null,
      status: 'INFO',
    },
    // P16 16E [D-1] — inference-basis rows entering the forecast inputs (0 while the
    // p16_inference_layer_enabled gate is OFF). Their confidence bands at inference_weight×
    // the calibration sample (provenance weighting — never full-weight P13-3-style inflation).
    { metric: 'inference_forecast_inputs_count', value: inferenceForecastInputs, threshold: null, status: 'INFO' },
    { metric: 'inference_weight', value: inferenceWeight, threshold: null, status: 'INFO' },
    {
      metric: 'default_calibration_pct',
      value: defaultPct.toFixed(1) + '%',
      threshold: `< ${calibWarnPct}% (WARN ≥ ${calibWarnPct}%, FAIL ≥ ${calibFailPct}%)`,
      status: defaultPct >= calibFailPct ? 'FAIL' : defaultPct >= calibWarnPct ? 'WARN' : 'PASS',
    },
    // GRD-F1 / D2a mechanical re-tightening guard: the loosening is LOUD + permanent-by-choice-only.
    // calibration_thresholds_relaxed WARNs on EVERY run while the active pair is looser than the
    // strict pair (20/50); its value carries the active pair. calibration_cohort_fill_pct (share of
    // rows NOT on the level-5 default) tells the operator when it's safe to restore 20/50.
    {
      metric: 'calibration_thresholds_relaxed',
      value: `warn=${calibWarnPct}/fail=${calibFailPct} (strict warn=${STRICT_CALIB_WARN_PCT}/fail=${STRICT_CALIB_FAIL_PCT})`,
      threshold: `WARN while relaxed AND cohorts cold; FAIL once calibration_cohort_fill_pct recovers past the strict-PASS point (default_calibration_pct < ${STRICT_CALIB_WARN_PCT}%) — restore strict warn=${STRICT_CALIB_WARN_PCT}/fail=${STRICT_CALIB_FAIL_PCT}`,
      status: calibRelaxedStatus,
    },
    {
      metric: 'calibration_cohort_fill_pct',
      value: calibCohortFillPct.toFixed(1) + '%',
      threshold: `> ${(100 - STRICT_CALIB_WARN_PCT)}% ⇒ default_calibration_pct < ${STRICT_CALIB_WARN_PCT}% (strict-PASS): restore strict warn/fail thresholds`,
      status: 'INFO',
    },
    // P13-5: per-urgency synthetic-share provenance (the urgency shape's honesty).
    ...urgencySyntheticRows,
    {
      metric: 'expired_urgency_pct',
      value: expiredPct.toFixed(1) + '%',
      threshold: '< 30%',
      status: expiredPct >= 60 ? 'FAIL' : expiredPct >= 30 ? 'WARN' : 'PASS',
    },
    { metric: 'total_forecast_rows', value: postRowCount, threshold: null, status: 'INFO' },
    // v2 CRIT 5: keep emitting coa_skipped_count = 0 indefinitely for 7-day Observer baseline
    // continuity. Retire in F.2 once `coa_forecasts_computed` appears in ≥ 7 daily Observer
    // baselines as PASS/INFO (concrete retirement criterion per diff-fold doc).
    { metric: 'coa_skipped_count', value: coaSkippedCount, threshold: null, status: 'INFO' },
    // diff-fold #4 (DeepSeek HIGH 2): escalate to WARN when ANY lead_id pre-validation
    // failures occur. The bare `failed_sample` field is easy to miss; this audit row makes
    // widespread format drift visible in Observer's extractIssues().
    {
      metric: 'lead_id_format_failed_count',
      value: leadIdFormatFailedPermit + leadIdFormatFailedCoa,
      threshold: '== 0',
      status: (leadIdFormatFailedPermit + leadIdFormatFailedCoa) > 0 ? 'WARN' : 'PASS',
    },
    // diff-fold #5 (DeepSeek CRIT 2): NULL lifecycle_seq CoA rows silently fall to default
    // calibration. INFO during quiet period (E.2 ramp); WARN after quiet period if > 0 (E.2
    // writer is unhealthy).
    {
      metric: 'coa_null_lifecycle_seq_count',
      value: coaNullLifecycleSeqCount,
      threshold: inQuietPeriod ? null : '== 0',
      status: inQuietPeriod ? 'INFO' : (coaNullLifecycleSeqCount > 0 ? 'WARN' : 'PASS'),
    },
  ];
  const auditVerdict =
    auditRows.some((r) => r.status === 'FAIL') ? 'FAIL' :
    auditRows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';

  // Phase F.1 v3 HIGH-9 fold: records_total = totalRowsPermit + totalRowsCoa per Spec 47 §11.1
  // (both branches are primary forecast subjects per Spec 85 §3 unified output entity).
  pipeline.emitSummary({
    records_total: totalRowsPermit + totalRowsCoa,
    records_new: newRows,
    records_updated: upserted - newRows,
    failed_sample: failedSample.length > 0 ? failedSample : undefined,
    records_meta: {
      forecasts_computed: upserted,
      forecasts_computed_permit: upserted - upsertedCoa,
      forecasts_computed_coa: upsertedCoa,
      total_rows_permit: totalRowsPermit,
      total_rows_coa: totalRowsCoa,
      stale_forecasts_purged: stalePurged,
      stale_purged_permit: stalePurgedPermit,
      stale_purged_coa: stalePurgedCoa,
      grace_purged: gracePurged,
      skipped_no_anchor: skipped,
      skipped_no_anchor_coa: skippedNoAnchorCoa,
      skipped_past_target: skippedPastTarget,
      skipped_too_old: skippedTooOld,
      skipped_too_old_coa: skippedTooOldCoa,
      snowplow_applied_coa: snowplowAppliedCoa,
      coa_skipped_audit_blocked: coaSkippedAuditBlocked,
      coa_anchor_stale_lifecycle_transition_count: coaAnchorStaleLifecycleTransitionCount,
      // diff-fold #2 (Observability HIGH 90): raw float for Spec 48 Observer baseline arithmetic.
      // The audit_table.rows entry stays as a formatted '%' string for human display; this
      // top-level records_meta scalar is what observe-chain.js's anomaly detection consumes.
      coa_anchor_fallback_pct: coaAnchorFallbackPct,
      // diff-fold #5: surface NULL lifecycle_seq count for the Observer's baseline tracking.
      coa_null_lifecycle_seq_count: coaNullLifecycleSeqCount,
      // diff-fold #4: per-branch breakdown of lead_id pre-validation failures.
      lead_id_format_failed_permit: leadIdFormatFailedPermit,
      lead_id_format_failed_coa: leadIdFormatFailedCoa,
      // v3 HIGH-H: per-lifecycle_group breakdown for Spec 47 §11.4 cohort traceability
      skipped_distribution_by_lifecycle_group: skipDistribution,
      coa_first_deploy_grace: coaFirstDeployGrace,
      coa_audit_gate_status: coaGateStatus,
      // D3a: gate policy + WARN-accept visibility for the Observer baseline.
      coa_gate_policy: coaGatePolicy,
      coa_audit_gate_warn_accepted: coaGateWarnAccepted,
      // D2a: calibration verdict-threshold telemetry (raw scalars for anomaly detection).
      forecast_default_calibration_warn_pct: calibWarnPct,
      forecast_default_calibration_fail_pct: calibFailPct,
      calibration_thresholds_relaxed: calibThresholdsRelaxed,
      calibration_cohort_fill_pct: calibCohortFillPct,
      unmapped_trades: unmappedTrades,
      // Spec 80 P4 (D1 / OB-F5): non-forecastable exclusion telemetry (outside records_total).
      excluded_rows: excludedRows,
      excluded_trade_slugs: [...excludedSlugsSeen].sort(),
      anchor_fallbacks_used: anchorFallbackCount,
      anchor_sources: anchorSourceCounts,
      anchor_sources_coa: coaAnchorSourceCounts,
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
      permit_trades: ['permit_num', 'revision_num', 'trade_id', 'is_active', 'attachment_basis'],
      trades: ['id', 'slug'],
      permits: ['permit_num', 'revision_num', 'lifecycle_phase', 'lifecycle_stalled', 'phase_started_at', 'permit_type', 'issued_date', 'application_date'],
      permit_inspections: ['permit_num', 'inspection_date', 'status'],
      phase_calibration: ['from_phase', 'to_phase', 'permit_type', 'median_days', 'p25_days', 'p75_days', 'sample_size'],
      // Phase F.1 reads (CoA UNION + gate) — P16 16E [BUG-5]: +attachment_basis both branches
      lead_trades: ['lead_id', 'trade_id', 'is_active', 'attachment_basis'],
      coa_applications: ['lead_id', 'lifecycle_phase', 'lifecycle_seq', 'lifecycle_group', 'lifecycle_stalled', 'project_type', 'coa_type_class', 'decision_date', 'hearing_date', 'first_seen_at'],
      lifecycle_transitions: ['lead_id', 'transitioned_at'],
      phase_stay_calibration: ['permit_type', 'project_type', 'coa_type_class', 'from_seq', 'to_seq', 'median_days', 'p25_days', 'p75_days', 'sample_size'],
      pipeline_runs: ['pipeline', 'status', 'started_at', 'records_meta'],
      // D3a: coa_gate_policy read directly (config-loader reads object JSON only, not string scalars).
      logic_variables: ['variable_key', 'variable_value_json'],
    },
    {
      trade_forecasts: ['permit_num', 'revision_num', 'lead_id', 'trade_slug', 'predicted_start', 'confidence', 'urgency', 'calibration_method', 'sample_size', 'median_days', 'p25_days', 'p75_days', 'computed_at'],
    },
  );
  }); // end withAdvisoryLock

  // Lock was held by another instance — helper already emitted SKIP summary.
  if (!lockResult.acquired) {
    pipeline.emitMeta({}, {});
    return;
  }
});
