// SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md §3 (Historic Snowplow + Behavioral Contract)
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const read = (rel: string) =>
  fs.readFileSync(path.resolve(repoRoot, rel), 'utf-8');

describe('scripts/compute-trade-forecasts.js — script shape', () => {
  let content: string;
  beforeAll(() => {
    content = read('scripts/compute-trade-forecasts.js');
  });

  it('uses pipeline.run wrapper', () => {
    expect(content).toMatch(
      /pipeline\.run\(\s*['"]compute-trade-forecasts['"]/,
    );
  });

  it('imports TRADE_TARGET_PHASE from shared lib', () => {
    expect(content).toMatch(/TRADE_TARGET_PHASE/);
    expect(content).toMatch(/require\(['"]\.\/lib\/lifecycle-phase['"]\)/);
  });

  it('loads calibration data into a nested Map', () => {
    expect(content).toMatch(/calMap/);
    expect(content).toMatch(/new Map\(\)/);
    expect(content).toMatch(/FROM phase_calibration/);
  });

  it('uses bimodal TRADE_TARGET_PHASE routing (bid_phase vs work_phase)', () => {
    expect(content).toMatch(/bid_phase/);
    expect(content).toMatch(/work_phase/);
    expect(content).toMatch(/targets\.bid_phase/);
    expect(content).toMatch(/targets\.work_phase/);
    // Bimodal routing: target bid_phase if AT or before it, else work_phase.
    // WF3: was `<`, now `<=` so permits AT the bid_phase still target it
    // (the bid window is open, not closed).
    expect(content).toMatch(/currentOrdinal\s*<=\s*bidOrdinal/);
  });

  it('implements 4-level fallback hierarchy + default', () => {
    expect(content).toMatch(/lookupCalibration/);
    expect(content).toMatch(/exact/);
    expect(content).toMatch(/fallback_all_types/);
    expect(content).toMatch(/fallback_issued_type/);
    expect(content).toMatch(/fallback_issued_all/);
    expect(content).toMatch(/default/);
  });

  it('queries active permit-trade pairs via JOIN', () => {
    expect(content).toMatch(/permit_trades pt/);
    expect(content).toMatch(/JOIN trades t/);
    expect(content).toMatch(/JOIN permits p/);
    expect(content).toMatch(/pt\.is_active = true/);
  });

  it('skips terminal, orphan, and CoA phases (WF3-04: O4 phantom removed)', () => {
    // WF3-04 (H-W14 / 84-W10): O4 is a phantom phase — listed in
    // VALID_PHASES / SKIP_PHASES but no classifier rule produces it.
    // Removed from both JS and the SQL NOT IN filter.
    expect(content).toMatch(/SKIP_PHASES/);
    expect(content).toMatch(/'P19'/);
    expect(content).toMatch(/'P20'/);
    expect(content).toMatch(/'O1'/);
    expect(content).toMatch(/'O2'/);
    expect(content).toMatch(/'O3'/);
    // SKIP_PHASES set and SQL NOT IN must both exclude O4
    expect(content).not.toMatch(/'O4'/);
  });

  it('purges ghost forecasts via NOT EXISTS against active permit_trades', () => {
    // WF3 ghost purge: deletes forecasts if the permit died OR the
    // trade was deactivated. NOT EXISTS is ironclad — catches both.
    expect(content).toMatch(/DELETE FROM trade_forecasts/);
    expect(content).toMatch(/NOT EXISTS/);
    expect(content).toMatch(/pt\.is_active = true/);
    expect(content).toMatch(/stalePurged/);
  });

  it('imports PHASE_ORDINAL from shared lib and uses for ordinal comparison', () => {
    // WF3: was duplicated, now imported from scripts/lib/lifecycle-phase.js
    expect(content).toMatch(/PHASE_ORDINAL/);
    expect(content).toMatch(/isPastTarget/);
    expect(content).toMatch(/currentOrdinal.*>=.*targetOrdinal/);
    // Must NOT define PHASE_ORDINAL locally (it's imported)
    expect(content).not.toMatch(/const PHASE_ORDINAL\s*=\s*\{/);
  });

  it('uses pre-construction → ISSUED fallback for P3-P8/P7* but NOT P18', () => {
    expect(content).toMatch(/PRE_CONSTRUCTION_PHASES/);
    expect(content).toMatch(/'ISSUED'/);
    // P18 must NOT be in PRE_CONSTRUCTION_PHASES (adversarial Probe 2)
    const preConMatch = content.match(/PRE_CONSTRUCTION_PHASES\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
    expect(preConMatch).toBeTruthy();
    expect(preConMatch![1]).not.toMatch(/P18/);
  });

  it('classifies urgency with expired decay + correct thresholds (no on_hold)', () => {
    expect(content).toMatch(/classifyUrgency/);
    // WF3 2026-04-13: expired threshold now loaded from logic_variables
    // (expired_threshold_days, seeded as -90). Previously hardcoded.
    expect(content).toMatch(/expired/);
    expect(content).toMatch(/expired_threshold_days/);
    // Ensure the hardcoded -90 is gone from the classify function
    expect(content).not.toMatch(/daysUntil <= -90/);
    // Stall handling is now via Instant Recalibration math, NOT a
    // separate urgency tier. classifyUrgency has no isStalled param.
    expect(content).not.toMatch(/return 'on_hold'/);
    // Standard tiers
    expect(content).toMatch(/overdue/);
    expect(content).toMatch(/delayed/);
    expect(content).toMatch(/imminent/);
    expect(content).toMatch(/upcoming/);
    expect(content).toMatch(/on_time/);
  });

  it('delegates advisory lock 85 to pipeline.withAdvisoryLock — Phase 2 migration (spec 47 §5)', () => {
    // Phase 2: hand-rolled lock boilerplate replaced with pipeline.withAdvisoryLock.
    // Helper handles: dedicated pool.connect() client, pg_try_advisory_lock,
    // pg_advisory_unlock, SIGTERM/SIGINT trap, double-cleanup guard, SKIP emit.
    expect(content).toMatch(/const ADVISORY_LOCK_ID = 85/);
    expect(content).toMatch(/pipeline\.withAdvisoryLock\(pool,\s*ADVISORY_LOCK_ID/);
    // Must NOT hand-roll — any direct lock call bypasses the spec helper
    expect(content).not.toMatch(/pg_try_advisory_lock/);
    expect(content).not.toMatch(/pg_advisory_unlock/);
    // Must NOT install its own SIGTERM — helper installs and removes it
    expect(content).not.toMatch(/process\.on\(\s*['"]SIGTERM['"]/);
  });

  it('wraps stale-purge DELETE + batch UPSERT loop in a single withTransaction (WF3-03 / H-W2 / 85-W2)', () => {
    // Crash between DELETE and UPSERT used to leave stale rows purged but
    // new rows missing. Both phases now run inside a single transaction —
    // crash → rollback → table unchanged.
    expect(content).toMatch(/pipeline\.withTransaction/);
    // Regression anchor: the old code had bare pool.query for both DELETE
    // (stale purge) and UPSERT loop. Both are now client.query inside the
    // transaction callback.
    expect(content).not.toMatch(/await pool\.query\([\s\S]{0,40}DELETE FROM trade_forecasts/);
    expect(content).not.toMatch(/await pool\.query\(\s*`INSERT INTO trade_forecasts/);
  });

  it('consumes per-trade imminent_window_days from trade_configurations (WF3-05, H-W13)', () => {
    // H-W13: the Control Panel `trade_configurations.imminent_window_days`
    // knob must drive the `urgency='imminent'` threshold, not the hardcoded 14.
    // Signature must accept a 4th parameter (the per-trade window).
    expect(
      content,
      'classifyUrgency signature must accept an imminentWindow parameter',
    ).toMatch(/function classifyUrgency\([^)]*imminentWindow/);

    // Body must use the parameter, not the hardcoded 14.
    expect(
      content,
      'imminent classification must compare against the parameter, not 14',
    ).toMatch(/daysUntil <= imminentWindow/);
    expect(
      content,
      'hardcoded `daysUntil <= 14` must be removed from classifyUrgency',
    ).not.toMatch(/if \(daysUntil <= 14\) return 'imminent'/);

    // Call site must pass the per-trade value from tradeConfigs with
    // nullish-coalesce (NOT || 14, which would erase a legitimate 0-day
    // window).
    expect(
      content,
      'call site must thread tradeConfigs[trade_slug]?.imminent_window_days',
    ).toMatch(
      /classifyUrgency\([^)]*logicVars\.expired_threshold_days[^)]*tradeConfigs\[[^\]]+\]\?\.imminent_window_days\s*\?\?\s*14/,
    );
    expect(
      content,
      '`|| 14` would silently rewrite a legitimate 0-day window; use `?? 14`',
    ).not.toMatch(/imminent_window_days\s*\|\|\s*14/);
  });

  it('ZG-1b Stalled Gate: stall recalibration block removed (dead code after SQL gate excludes lifecycle_stalled=true)', () => {
    // SOURCE_SQL now has AND p.lifecycle_stalled = false, so every row reaching the
    // stream loop has lifecycle_stalled = false. The old `if (lifecycle_stalled) { ... }`
    // block was permanently unreachable — retaining it would mislead readers into
    // thinking stall penalties are applied when they are not. Deleted in WF3 2026-04-22.
    // stall_penalty_precon / stall_penalty_active remain in LOGIC_VARS_SCHEMA in case
    // of future re-introduction, but the penalty math no longer runs per-row.
    expect(content).not.toMatch(/if\s*\(\s*lifecycle_stalled\s*\)\s*\{/);
    expect(content).not.toMatch(/minimumStallDate/);
  });

  it('classifies confidence from sample_size', () => {
    expect(content).toMatch(/classifyConfidence/);
    expect(content).toMatch(/>= 30/);
    expect(content).toMatch(/>= 10/);
  });

  it('batch-upserts into trade_forecasts with ON CONFLICT', () => {
    expect(content).toMatch(/INSERT INTO trade_forecasts/);
    expect(content).toMatch(
      /ON CONFLICT \(permit_num, revision_num, trade_slug\)/,
    );
    expect(content).toMatch(/DO UPDATE SET/);
  });

  it('uses 13 params per row (includes target_window AND computed_at runAt snapshot)', () => {
    // §47 §6.1: computed_at is now an explicit param bound to runAt (not NOW()).
    // Row width: 12 forecast fields + 1 timestamp = 13 per row.
    expect(content).toMatch(/j \* 13/);
    const insertMatch = content.match(
      /INSERT INTO trade_forecasts\s*\([^)]+\)/,
    );
    expect(insertMatch).toBeTruthy();
    expect(insertMatch![0]).toMatch(/target_window/);
    expect(insertMatch![0]).toMatch(/computed_at/);
  });

  it('§47 §6.1 — computed_at binds $N not NOW() (runAt snapshot, not per-row DB clock)', () => {
    // NOW() evaluates at INSERT time, so rows in a long streaming run get
    // different computed_at values. runAt is captured once at script startup
    // via SELECT NOW() (DB clock) and threaded as $N so every row in the run
    // shares the same timestamp, enabling point-in-time queries and run-level
    // observability histograms. JS wall clock (new Date()) was replaced by DB
    // clock to eliminate Midnight Cross drift across a long streaming run.
    expect(content).not.toMatch(/computed_at\s*=\s*NOW\(\)/);
    expect(content).toMatch(/computed_at\s*=\s*EXCLUDED\.computed_at/);
    // runAt must come from DB clock (SELECT NOW()), NOT JS wall clock (new Date())
    expect(content).not.toMatch(/const runAt\s*=\s*new Date\(\)/);
    expect(content).toMatch(/SELECT NOW\(\) AS run_at/);
  });

  it('emits PIPELINE_SUMMARY with urgency distribution', () => {
    expect(content).toMatch(/pipeline\.emitSummary/);
    expect(content).toMatch(/urgency_distribution/);
    expect(content).toMatch(/forecasts_computed/);
  });

  it('uses UTC date math to prevent timezone off-by-one', () => {
    // WF3: setHours(0) uses local TZ but toISOString() outputs UTC.
    // On a Toronto server, this can shift dates backward by a full day.
    expect(content).toMatch(/setUTCHours\(0,\s*0,\s*0,\s*0\)/);
    expect(content).toMatch(/setUTCDate/);
    // Must NOT use local-TZ setHours for date normalization
    expect(content).not.toMatch(/\.setHours\(0,\s*0,\s*0,\s*0\)/);
  });

  it('logs unmapped trades as a warning', () => {
    expect(content).toMatch(/unmappedTrades/);
    expect(content).toMatch(/pipeline\.log\.warn/);
  });

  it('WF3-12 Zod defense — validates logicVars before running math (spec 85 §6 item 4)', () => {
    // spec 47 §4 + spec 85 §6 item 4: fail fast before any math runs.
    // stall_penalty_precon, stall_penalty_active → corrupt setUTCDate calls.
    // expired_threshold_days → silently classifies every permit as non-expired.
    expect(content).toMatch(/require\(['"]zod['"]\)/);
    expect(content).toMatch(/LOGIC_VARS_SCHEMA\s*=\s*z\.object/);
    expect(content).toMatch(/stall_penalty_precon/);
    expect(content).toMatch(/stall_penalty_active/);
    expect(content).toMatch(/expired_threshold_days/);
    expect(content).toMatch(/validateLogicVars\(\s*logicVars\s*,\s*LOGIC_VARS_SCHEMA/);
  });

  it('WF3-12 streamQuery — no unbounded pool.query over permit-trade JOIN (spec 85 §6 item 1)', () => {
    // spec 47 §6.1: streaming required for queries returning >10K rows.
    // The permit_trades ⋈ trades ⋈ permits JOIN returns ~183K rows.
    // pool.query loads all rows into V8 heap; streamQuery bounds it to O(BATCH_SIZE).
    expect(content).toMatch(/pipeline\.streamQuery\(\s*pool\s*,/);
    expect(content).toMatch(/for\s+await\s*\(\s*const\s+\w+\s+of\s+pipeline\.streamQuery/);
    // Regression guard — the old unbounded-load pattern must be gone.
    expect(content).not.toMatch(/const\s+\{\s*rows:\s*permitTradeRows\s*\}\s*=\s*await\s+pool\.query/);
  });

  it('emits audit_table with a real verdict (not UNKNOWN) per spec 47 §8.2', () => {
    // The SDK auto-injects { verdict: "UNKNOWN", rows: [] } when audit_table is absent.
    // This test verifies the script provides its own audit_table so the FreshnessTimeline
    // shows a meaningful PASS/WARN/FAIL instead of the UNKNOWN sentinel.
    expect(content).toMatch(/audit_table\s*:/);
    // Must have phase: 22 (chain position in permits chain)
    expect(content).toMatch(/phase\s*:\s*22/);
    // Name must be human-readable, not the SDK auto-inject "Auto"
    expect(content).toMatch(/name\s*:\s*['"]Trade Forecasts['"]/);
    // Verdict must be computed from row statuses, not hardcoded
    // Allow both `some(r =>` and `some((r) =>` forms
    expect(content).toMatch(/auditRows\.some\(\(?\s*r\s*\)?\s*=>\s*r\.status\s*===\s*['"]FAIL['"]\)/);
    expect(content).toMatch(/auditRows\.some\(\(?\s*r\s*\)?\s*=>\s*r\.status\s*===\s*['"]WARN['"]\)/);
  });

  it('includes default_calibration_pct threshold row per spec 47 §8.2 forecast-engine minimum', () => {
    // spec 47 §8.2 requires forecast engines to include default_calibration_pct with a threshold.
    // High default rate means phase_calibration is missing data for too many (from_phase, to_phase) pairs.
    expect(content).toMatch(/default_calibration_pct/);
    // Must query calibration_method distribution from trade_forecasts after the run
    expect(content).toMatch(/calibration_method/);
  });

  it('includes unmapped_trades threshold row (WARN when > 0)', () => {
    // unmapped_trades > 0 means classify-permits produced a trade slug that
    // has no entry in TRADE_TARGET_PHASE — forecasts silently skipped for those trades.
    // Must be surfaced as a WARN, not buried in a console.log.
    expect(content).toMatch(/unmapped_trades[\s\S]*?threshold[\s\S]*?==\s*0/);
  });

  it('reads urgency bucket thresholds from logicVars — no hardcoded -30 or 30 (WF3-E14)', () => {
    // E14: urgency_overdue_days and urgency_upcoming_days externalized to logic_variables.
    expect(content).toMatch(/logicVars\.urgency_overdue_days/);
    expect(content).toMatch(/logicVars\.urgency_upcoming_days/);
    // Hardcoded -30 and 30 boundaries must be gone from classifyUrgency
    expect(content).not.toMatch(/daysUntil <= -30\b/);
    expect(content).not.toMatch(/daysUntil <= 30\b/);
    // Function signature accepts overdueWindow and upcomingWindow parameters
    expect(content).toMatch(/function classifyUrgency\([^)]*overdueWindow/);
    expect(content).toMatch(/function classifyUrgency\([^)]*upcomingWindow/);
  });

  it('reads calibration fallback defaults from logicVars — no hardcoded DEFAULT_MEDIAN_DAYS=30, p25=15, p75=60 (WF3-E21)', () => {
    // E21: calibration_default_median_days, _p25_days, _p75_days externalized.
    expect(content).toMatch(/logicVars\.calibration_default_median_days/);
    expect(content).toMatch(/logicVars\.calibration_default_p25_days/);
    expect(content).toMatch(/logicVars\.calibration_default_p75_days/);
    // Hardcoded constants must be gone
    expect(content).not.toMatch(/DEFAULT_MEDIAN_DAYS\s*=/);
    expect(content).not.toMatch(/p25:\s*15\b/);
    expect(content).not.toMatch(/p75:\s*60\b/);
    // Level-5 fallback must use the derived variables
    expect(content).toMatch(/defaultMedianDays/);
    expect(content).toMatch(/defaultP25Days/);
    expect(content).toMatch(/defaultP75Days/);
  });

  it('SOURCE_SQL does NOT filter phase_started_at IS NOT NULL — fallback anchor handles NULL', () => {
    // WF1: removing the hard gate so permits without a real phase anchor still
    // produce forecasts (with calibration_method = 'fallback_issued').
    expect(content).not.toMatch(/phase_started_at IS NOT NULL/);
  });

  it('SOURCE_SQL fetches fallback anchor columns via CTE (no N+1 correlated subquery)', () => {
    // The fallback anchor hierarchy needs last passed inspection date, issued_date,
    // and application_date. The inspection aggregate must be a CTE (one Postgres
    // pass, not one query per row).
    expect(content).toMatch(/WITH last_passed AS/);
    expect(content).toMatch(/FROM permit_inspections/);
    expect(content).toMatch(/issued_date/);
    expect(content).toMatch(/application_date/);
    expect(content).toMatch(/last_passed_inspection_date/);
    // Must NOT use a correlated subquery inside the SELECT list — that is O(n)
    expect(content).not.toMatch(/SELECT.*FROM permit_inspections.*WHERE.*permit_num\s*=\s*p\.permit_num/);
  });

  it("stamps calibration_method = 'fallback_issued' when phase_started_at is NULL (spec 85 §3)", () => {
    // Any row produced from a fallback anchor must advertise the lower confidence
    // level so the UI (FreshnessTimeline) can distinguish it from real anchors.
    expect(content).toMatch(/'fallback_issued'/);
    expect(content).toMatch(/anchorIsFallback/);
  });

  it('tracks anchor_fallbacks_used counter in telemetry', () => {
    expect(content).toMatch(/anchorFallbackCount/);
    expect(content).toMatch(/anchor_fallbacks_used/);
  });

  it('PIPELINE_META reads include permit_inspections for fallback anchor', () => {
    expect(content).toMatch(/permit_inspections/);
  });

  it('Historic Snowplow: snaps past predicted_start forward when anchorIsFallback (WF3-B2)', () => {
    // Fallback anchors (issued_date/application_date) are often years in the
    // past → predictedStart lands in the past → expired urgency (76.9% FAIL).
    // Snowplow snaps to today + logicVars.snowplow_buffer_days so rescued leads are
    // Rescue Missions, not dead leads. Buffer is DB-driven per spec 47 §4.1.
    expect(content).toMatch(/snowplow_buffer_days/);
    // Must use setUTCDate for consistent UTC date math (same pattern as stall snowplow)
    expect(content).toMatch(/setUTCDate[\s\S]{0,80}logicVars\.snowplow_buffer_days/);
    // Must be in LOGIC_VARS_SCHEMA with coercion — not a hardcoded constant (spec 47 §4.1)
    // z.coerce.number() required: pg returns DECIMAL as string (WF3 April 2026)
    expect(content).toMatch(/snowplow_buffer_days\s*:\s*z\.coerce\.number\(\)\.finite\(\)\.positive\(\)/);
    // Old hardcoded constant must be gone
    expect(content).not.toMatch(/const SNOWPLOW_BUFFER_DAYS = 7/);
  });

  it('Bug-1: snowplow guard compares against runAt (not today midnight) — catches same-day fallback forecasts (WF3 April 2026)', () => {
    // predictedStart = fallbackAnchor + median can land at today-midnight when the
    // anchor is just recent enough. today-midnight equals `today` so the old guard
    // (< today) never fires for same-day forecasts — they silently stay "delayed"
    // instead of being snapped to today + buffer. Using runAt (actual run timestamp)
    // ensures any predictedStart before the current moment triggers the snowplow.
    expect(content).toMatch(
      /isPast\s*=\s*new Date\(predictedStart\)\.getTime\(\)\s*<\s*new Date\(runAt\)\.getTime\(\)/,
    );
    // The if-guard must reference isPast, not raw Date objects directly.
    // WF3 B2-H3 (2026-04-23): the guard variable is now `snowplowSource`
    // (derived from anchorSource) rather than `anchorIsFallback`, so the
    // check evolves with the fix.
    expect(content).toMatch(/snowplowSource\s*&&\s*isPast/);
    // Must NOT use today.getTime() in the snowplow isPast comparison
    expect(content).not.toMatch(/isPast\s*=\s*new Date\(predictedStart\)\.getTime\(\)\s*<\s*today\.getTime\(\)/);
  });

  it('WF3 B2-H3: snowplow fires only for issued_date / application_date anchors (not last_passed_inspection)', () => {
    // Previously `anchorIsFallback && isPast` snowplowed any non-phase anchor —
    // including fresh last_passed_inspection anchors whose predictedStart was
    // only a few days past. The new guard uses anchorSource so inspection-
    // anchored permits keep their calibrated date and only truly-stale
    // issued_date / application_date anchors (which can be years old) get
    // snapped forward to today + snowplow_buffer_days.
    expect(content).toMatch(/anchorSource\s*===\s*'issued_date'/);
    expect(content).toMatch(/anchorSource\s*===\s*'application_date'/);
    // The snowplowSource derivation must combine both sources via ||
    expect(content).toMatch(
      /snowplowSource\s*=\s*anchorSource\s*===\s*'issued_date'\s*\|\|\s*anchorSource\s*===\s*'application_date'/,
    );
    // last_passed_inspection must NOT appear in the snowplow gate
    expect(content).not.toMatch(
      /snowplowSource[\s\S]{0,120}last_passed_inspection/,
    );
  });

  it('WF3 B2-H3: anchor_sources counter map exposed in records_meta for calibration_distribution triage', () => {
    // Per-source breakdown lets operators distinguish fresh inspection-anchored
    // rescues from stale issued/application snowplow hits — information the old
    // binary anchor_fallbacks_used counter could not answer.
    expect(content).toMatch(/anchorSourceCounts/);
    expect(content).toMatch(/anchor_sources\s*:\s*anchorSourceCounts/);
    // All four source keys must be pre-declared so JSON output is stable
    expect(content).toMatch(/phase_started_at\s*:\s*0/);
    expect(content).toMatch(/last_passed_inspection\s*:\s*0/);
    expect(content).toMatch(/issued_date\s*:\s*0/);
    expect(content).toMatch(/application_date\s*:\s*0/);
  });

  it('WF3 B2-C1: single atomic purge+upsert transaction after stream closes (§47 §7.1, §7.3)', () => {
    // Previously each FORECAST_BATCH_SIZE chunk had its own withTransaction,
    // with grace-purge + stale-purge DELETEs riding on the first chunk. A
    // crash after the first batch committed left purged old rows + partial
    // new rows — the canonical §7.3 violation. Fixed by accumulating forecasts
    // in memory then running one withTransaction that wraps grace-purge,
    // stale-purge, and the chunked UPSERT loop.
    expect(content).toMatch(/const allForecasts\s*=\s*\[\]/);
    expect(content).toMatch(/allForecasts\.push/);
    // Must NOT retain the old per-batch flush helper
    expect(content).not.toMatch(/const flushForecastBatch\s*=/);
    expect(content).not.toMatch(/let purgeExecuted/);
    // Chunked upsert still uses FORECAST_BATCH_SIZE to stay under 65535 params
    expect(content).toMatch(/offset\s*\+=\s*FORECAST_BATCH_SIZE/);
    // Grace-purge + stale-purge must both live inside the single withTransaction
    expect(content).toMatch(
      /pipeline\.withTransaction\(pool,\s*async\s*\(client\)\s*=>[\s\S]*?DELETE FROM trade_forecasts[\s\S]*?urgency\s*=\s*'expired'[\s\S]*?INSERT INTO trade_forecasts/,
    );
  });

  it('WF3 B2-H2: preRowCount captured via pool.query before any mutation (not inside the tx)', () => {
    // §47 §8.1: records_new = postRowCount - preRowCount, and preRowCount MUST
    // precede any DELETE. Capturing it inside the write transaction made it
    // structurally fragile — a refactor that moved the capture below the
    // grace-purge DELETE would have silently returned post-purge counts.
    // New structure: an independent pool.query runs before the stream opens.
    expect(content).toMatch(
      /await pool\.query\(\s*['"]SELECT COUNT\(\*\)::int AS n FROM trade_forecasts['"]/,
    );
    // The old flushForecastBatch-internal capture must be gone
    expect(content).not.toMatch(
      /preRowCount\s*=\s*preCount\[0\]\.n;?\s*\n\s*\n\s*\/\/ F1 Grace-Purge/,
    );
  });

  it('WF3 (2026-04-23): preCountFailed flag prevents records_new reporting postRowCount on pre-count failure', () => {
    // Without the flag, `newRows = Math.max(0, postRowCount - 0)` = postRowCount.
    // On any subsequent run this makes records_new ≈ 130K and records_updated = 0
    // — the opposite of reality. The flag zeros newRows when the pre-count query fails.
    expect(content).toMatch(/let preCountFailed\s*=\s*false/);
    expect(content).toMatch(/preCountFailed\s*=\s*true/);
    expect(content).toMatch(/preCountFailed\s*\?\s*0\s*:\s*Math\.max\(0,\s*postRowCount\s*-\s*preRowCount\)/);
  });

  it('WF3 B2-H4: classifyUrgency signature has no default values — callers MUST pass DB-driven windows', () => {
    // Defaults silently hid config-loader regressions: a missing
    // urgency_overdue_days in logicVars meant classifyUrgency used 30 instead
    // of throwing. Removing defaults forces the caller (or Zod) to surface
    // the problem.
    expect(content).not.toMatch(
      /imminentWindow\s*=\s*\d+\s*,\s*overdueWindow\s*=\s*\d+\s*,\s*upcomingWindow\s*=\s*\d+/,
    );
    // Signature still accepts the three window parameters (just no defaults)
    expect(content).toMatch(
      /function classifyUrgency\([^)]*imminentWindow\s*,\s*overdueWindow\s*,\s*upcomingWindow\s*\)/,
    );
  });

  it('LOGIC_VARS_SCHEMA uses z.coerce.number() — pg DECIMAL/NUMERIC returns as string (WF3 April 2026)', () => {
    // pg driver returns DECIMAL/NUMERIC as strings to prevent float64 precision loss.
    // z.number() rejects strings; z.coerce.number() coerces before validation.
    // Sibling fix alongside compute-opportunity-scores.js (same schema pattern, same risk).
    expect(content).toMatch(/z\.coerce\.number\(\)/);
    // None of the schema fields should use bare z.number()
    expect(content).not.toMatch(/stall_penalty_precon\s*:\s*z\.number\(\)/);
    expect(content).not.toMatch(/snowplow_buffer_days\s*:\s*z\.number\(\)/);
    expect(content).not.toMatch(/expired_threshold_days\s*:\s*z\.number\(\)/);
  });

  it('Historic Snowplow tracks snowplowCount counter in telemetry (WF3-B2)', () => {
    expect(content).toMatch(/snowplowCount/);
    expect(content).toMatch(/snowplowCount\+\+/);
    expect(content).toMatch(/snowplow_applied/);
  });

  it('Historic Snowplow exposes snowplow_applied in records_meta (WF3-B2)', () => {
    // Chain orchestrator surfaces this so operators can see how many leads
    // were rescued by the snowplow vs. expired naturally.
    expect(content).toMatch(/snowplow_applied\s*:\s*snowplowCount/);
  });

  it('F1 grace-purge: deletes expired rows older than GRACE_PURGE_DAYS (prevents zombie accumulation)', () => {
    // The snowplow is structurally dead code (all expired rows have phase_started_at IS NOT NULL,
    // so anchorIsFallback is never true for expired rows). Without an explicit purge, expired
    // trade_forecasts rows accumulate indefinitely. The grace-purge runs in Step 2's withTransaction
    // to clear rows that are both urgency='expired' AND predicted_start > GRACE_PURGE_DAYS in the past.
    // WF3 2026-04-22: '180 days' literal replaced with GRACE_PURGE_DAYS template interpolation so the
    // JS in-memory cutoff and SQL DELETE share the same named constant.
    expect(content).toMatch(/gracePurged/);
    expect(content).toMatch(/DELETE FROM trade_forecasts/);
    expect(content).toMatch(/urgency\s*=\s*'expired'/);
    // Must use the named constant in a template literal, not a bare '180 days' literal
    expect(content).toMatch(/INTERVAL\s*'\$\{GRACE_PURGE_DAYS\} days'/);
    expect(content).not.toMatch(/INTERVAL\s*'180 days'/);
  });

  it('F1 grace-purge: DELETE runs inside withTransaction, not as a bare pool.query', () => {
    // Must be client.query inside the Step 2 withTransaction, not a standalone pool.query.
    // A bare pool.query DELETE outside the transaction creates a crash-window between purge
    // and upsert that leaves deleted rows gone without replacements (spec 47 §7.3 H-W2).
    expect(content).not.toMatch(/await pool\.query\([\s\S]{0,80}urgency.*=.*'expired'[\s\S]{0,80}predicted_start/);
    expect(content).not.toMatch(/await pool\.query\([\s\S]{0,80}predicted_start[\s\S]{0,80}urgency.*=.*'expired'/);
  });

  it('F1 grace-purge: grace_purged exposed in both audit_table rows and records_meta', () => {
    // Dual-location requirement: spec §3 + spec §4 Testing Mandate
    expect(content).toMatch(/metric:\s*['"]grace_purged['"]/);    // audit_table row
    expect(content).toMatch(/grace_purged\s*:\s*gracePurged/);    // records_meta key
  });

  it('S1 SKIP_PHASES pushdown: SOURCE_SQL filters lifecycle_phase NOT IN SKIP_PHASES_SQL (not JS loop)', () => {
    // Moving the SKIP_PHASES filter from JS to SQL eliminates ~1M rows from being
    // streamed across the wire and discarded in the JS loop. DB filters at source.
    expect(content).toMatch(/SKIP_PHASES_SQL/);
    expect(content).toMatch(/lifecycle_phase NOT IN[\s\S]*?SKIP_PHASES_SQL/);
  });

  it('S1 SKIP_PHASES pushdown: JS SKIP_PHASES.has check removed from stream loop', () => {
    // After SQL pushdown, the JS in-loop check is redundant and must be removed.
    // Its presence would be misleading (implies rows still reach the loop).
    expect(content).not.toMatch(/SKIP_PHASES\.has\(\s*lifecycle_phase\s*\)/);
  });

  it('S1 SKIP_PHASES pushdown: skipped counter renamed to skipped_no_anchor (terminal/orphan now SQL-filtered)', () => {
    // The old name "skipped_terminal_orphan" was accurate when SKIP_PHASES filtering
    // happened in JS. After SQL pushdown, the only rows skipped in the loop are those
    // with no effectiveAnchor (all four fallback anchor fields are NULL).
    expect(content).toMatch(/skipped_no_anchor/);
    expect(content).not.toMatch(/skipped_terminal_orphan/);
  });

  it('S1 SKIP_PHASES pushdown: SKIP_PHASES.size === 0 startup guard present (spec 47 §4.3)', () => {
    // spec 47 §4.3: validate constant arrays passed into SQL clauses are non-empty
    // before running any queries. Empty SKIP_PHASES_SQL = vacuously-true NOT IN = no rows excluded.
    expect(content).toMatch(/SKIP_PHASES\.size\s*===\s*0/);
  });

  it('S1 SKIP_PHASES_SQL mirrors SKIP_PHASES Set exactly (same phase codes, no drift)', () => {
    // SKIP_PHASES (JS Set) lives in this script; SKIP_PHASES_SQL is imported from
    // scripts/lib/lifecycle-phase.js (WF3-D DRY). The phases must match — this
    // test reads lifecycle-phase.js to verify cross-file consistency.
    const setMatch = content.match(/SKIP_PHASES\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
    expect(setMatch, 'SKIP_PHASES Set not found in script').toBeTruthy();
    const lifecycleContent = read('scripts/lib/lifecycle-phase.js');
    const sqlMatch = lifecycleContent.match(/SKIP_PHASES_SQL\s*=\s*`\(([^`]+)\)`/);
    expect(sqlMatch, 'SKIP_PHASES_SQL constant not found in lifecycle-phase.js').toBeTruthy();
    const setPhases = (setMatch?.[1] ?? '').match(/'(\w+)'/g)?.map(s => s.slice(1, -1)).sort() ?? [];
    const sqlPhases = (sqlMatch?.[1] ?? '').match(/'(\w+)'/g)?.map(s => s.slice(1, -1)).sort() ?? [];
    expect(setPhases).toEqual(sqlPhases);
  });

  it('S1 stale-purge NOT IN uses SKIP_PHASES_SQL interpolation, not a separate hardcoded literal', () => {
    // Both SOURCE_SQL and the stale-purge query must use ${SKIP_PHASES_SQL} so that
    // adding a phase to SKIP_PHASES propagates to both queries automatically.
    const matches = content.match(/NOT IN \$\{SKIP_PHASES_SQL\}/g);
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });

  it('S1 skipped counter log message uses "no anchor" label, not "terminal/orphan"', () => {
    // After SQL pushdown, "skipped" only increments when effectiveAnchor is null/invalid.
    // Terminal/orphan rows are excluded by SQL before the stream opens — they never reach JS.
    expect(content).toMatch(/Skipped \(no anchor\)/);
    expect(content).not.toMatch(/Skipped \(terminal\/orphan\)/);
  });

  it('WF3 Zombie Gate: SOURCE_SQL Branch B has 3-year COALESCE recency gate (breaks P18 zombie loop)', () => {
    // A P18 permit with phase_started_at = 2018 was being streamed each run because
    // Branch B had no recency gate — grace-purge deletes the expired row, stream
    // recreates it with the same ancient anchor, it re-expires immediately, repeat.
    // Fix: COALESCE(phase_started_at, issued_date) >= NOW() - INTERVAL '3 years'
    // ensures permits with decade-old anchors never enter the stream.
    // Red Light: this test MUST fail before the SOURCE_SQL edit is applied.
    expect(content).toMatch(
      /COALESCE\(p\.phase_started_at,\s*p\.issued_date::timestamptz\)\s*>=\s*NOW\(\)\s*-\s*INTERVAL\s*'3 years'/,
    );
  });

  it('WF3 Zombie Gate: stale-purge NOT EXISTS mirrors SOURCE_SQL Branch B 3-year gate', () => {
    // The stale-purge must use the same recency gate as SOURCE_SQL — otherwise
    // a permit that ages out of the 3-year window stays in trade_forecasts until
    // the grace-purge window (180 days after expiry) catches it, producing a
    // ghost forecast for up to ~180 days after the permit should have been evicted.
    // Red Light: this test MUST fail before the stale-purge edit is applied.
    const coalesceGate =
      /COALESCE\(p\.phase_started_at,\s*p\.issued_date::timestamptz\)\s*>=\s*NOW\(\)\s*-\s*INTERVAL\s*'3 years'/g;
    const matches = content.match(coalesceGate);
    // Must appear in both SOURCE_SQL and the NOT EXISTS subquery
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });

  it('WF3 P1/P2 Inclusion: SOURCE_SQL Branch A gates on application_date with 18-month window', () => {
    // P1/P2 permits (pre-permit / CoA) have no issued_date or phase_started_at.
    // application_date IS their primary temporal anchor. The 18-month gate is
    // intentionally stricter than the 3-year zombie gate to prevent stale pre-permit
    // leads from reaching the PERT pipeline.
    // This test also confirms P1/P2 were successfully removed from SKIP_PHASES_SQL
    // (so the OR branch structure exists at all — if P1/P2 were still skipped,
    // there would be no Branch A).
    expect(content).toMatch(
      /p\.lifecycle_phase\s+IN\s+\(\s*'P1'\s*,\s*'P2'\s*\)/,
    );
    expect(content).toMatch(
      /p\.application_date\s*>=\s*NOW\(\)\s*-\s*INTERVAL\s*'18 months'/,
    );
  });

  it('WF3 P1/P2 Inclusion: Branch B explicitly excludes P1/P2 (branches are mutually exclusive)', () => {
    // Branch B uses COALESCE(phase_started_at, issued_date) as anchor.
    // P1/P2 have neither — they must NOT enter Branch B or the COALESCE
    // falls back to NULL and the 3-year gate becomes vacuously true.
    // p.lifecycle_phase NOT IN ('P1','P2') in Branch B is the guard.
    expect(content).toMatch(
      /lifecycle_phase NOT IN \$\{SKIP_PHASES_SQL\}[\s\S]{0,120}lifecycle_phase NOT IN \('P1','P2'\)/,
    );
  });

  it('WF3 Phase-Past-Target Guard: skips forecast generation when currentOrdinal > targetOrdinal', () => {
    // A P18 permit (ordinal 15) targeting HVAC work_phase P7c (ordinal 0) has
    // currentOrdinal=15 > targetOrdinal=0. The trade's opportunity window is
    // definitively closed — generating a forecast would immediately produce
    // `expired` urgency, inflating the 70.6% expired rate.
    // Strict > (not >=): AT the target phase = opportunity is RIGHT NOW (overdue);
    // PAST the target phase = opportunity is definitively gone.
    // Red Light: this test MUST fail before the guard is inserted.
    expect(content).toMatch(
      /currentOrdinal\s*!=\s*null\s*&&\s*targetOrdinal\s*!=\s*null\s*&&\s*currentOrdinal\s*>\s*targetOrdinal/,
    );
  });

  it('WF3 Phase-Past-Target Guard: skippedPastTarget counter declared and incremented', () => {
    // Separate counter from skipped (no-anchor) so operators can distinguish
    // "no anchor found" skips from "opportunity definitively closed" skips.
    expect(content).toMatch(/skippedPastTarget\s*=\s*0/);
    expect(content).toMatch(/skippedPastTarget\+\+/);
  });

  it('WF3 Phase-Past-Target Guard: skipped_past_target exposed in audit_table rows', () => {
    // spec 47 §8.2: every counter that affects forecast output must be in audit_table.
    expect(content).toMatch(/metric:\s*['"]skipped_past_target['"]/);
  });

  it('WF3 Phase-Past-Target Guard: skipped_past_target exposed in records_meta', () => {
    // spec 47 §8.2 dual-location: audit_table (visible in FreshnessTimeline)
    // AND records_meta (accessible to chain orchestrator + observability stack).
    expect(content).toMatch(/skipped_past_target\s*:\s*skippedPastTarget/);
  });

  // ── Stalled Gate + Grace Cutoff (WF3 2026-04-22) ────────────────────────

  it('ZG-1 Stalled Gate: SOURCE_SQL top-level WHERE filters lifecycle_stalled = false', () => {
    // Stalled permits have ancient phase_started_at anchors → predictedStart deep
    // in the past → expired urgency → grace_purge deletes → regenerated next run (zombie).
    // SQL gate excludes them before streaming, breaking the loop at source.
    // lifecycle_stalled is BOOLEAN NOT NULL DEFAULT false (migration 085) — = false is safe.
    expect(content).toMatch(/lifecycle_stalled\s*=\s*false/);
  });

  it('ZG-2 Stalled Gate: AND p.lifecycle_stalled = false appears in BOTH SOURCE_SQL and stale-purge NOT EXISTS', () => {
    // The stale-purge NOT EXISTS must mirror SOURCE_SQL — otherwise existing forecasts
    // for now-stalled permits are never deleted (stalled permits still pass the NOT EXISTS
    // subquery, so the RETURNING 1 finds a match and no DELETE fires).
    // Anchored to `AND p.` to count only genuine SQL WHERE-clause guards, not comments.
    const matches = content.match(/AND p\.lifecycle_stalled\s*=\s*false/g);
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });

  it('ZG-3 Grace Cutoff: GRACE_PURGE_DAYS named constant defined as 180', () => {
    // 180 days crosses spec ↔ SQL ↔ JS — must be a named constant, not a duplicated literal.
    // Sourced from docs/specs/_contracts.json retention.grace_purge_days.
    expect(content).toMatch(/GRACE_PURGE_DAYS\s*=\s*180\b/);
  });

  it('ZG-4 Grace Cutoff: grace-purge SQL uses GRACE_PURGE_DAYS template interpolation (no bare literal)', () => {
    // The grace-purge DELETE must use `INTERVAL '${GRACE_PURGE_DAYS} days'` so the
    // constant and the SQL stay in sync automatically. A bare '180 days' literal
    // would drift silently if the contract value changes.
    expect(content).toMatch(/INTERVAL\s*'\$\{GRACE_PURGE_DAYS\} days'/);
    // The old bare literal must be replaced
    expect(content).not.toMatch(/INTERVAL\s*'180 days'/);
  });

  it('ZG-5 Grace Cutoff: skippedTooOld counter declared and incremented in stream loop', () => {
    // Rows dropped by the in-memory cutoff must be counted separately from
    // skipped_no_anchor and skipped_past_target so operators can quantify
    // how many zombie rows are being suppressed per run.
    expect(content).toMatch(/skippedTooOld\s*=\s*0/);
    expect(content).toMatch(/skippedTooOld\+\+/);
  });

  it('ZG-6 Grace Cutoff: skipped_too_old exposed in both audit_table rows and records_meta', () => {
    // Dual-location requirement: spec §4 Testing Mandate + spec 47 §8.2.
    expect(content).toMatch(/metric:\s*['"]skipped_too_old['"]/);
    expect(content).toMatch(/skipped_too_old\s*:\s*skippedTooOld/);
  });
});
