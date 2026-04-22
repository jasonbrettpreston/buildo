// 🔗 SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md §Implementation
//
// 3-tier timing engine — given a permit and a trade, returns an estimate of
// when the tradesperson's trade will be needed on that site. Reads from
// `permit_inspections`, `inspection_stage_map`, and `phase_calibration` (v2),
// plus the existing PHASE_TRADE_MAP from classification/phases.ts.
//
// Never throws. On unexpected error the function returns a safe "timing
// unavailable" fallback and logs via logError so Phase 2's API routes can
// rely on this being callable without their own try/catch.
//
// timing.ts is the request-path consumer. The nightly populator of the
// calibration cache is: scripts/compute-timing-calibration-v2.js.
// Unlike the cost-model dual code path, these two files do NOT share logic —
// the script computes percentile SQL only; the library reads what the script
// writes.

import type { Pool } from 'pg';
import type { TradeTimingEstimate } from '@/features/leads/types';
import {
  determinePhase,
  PHASE_TRADE_MAP,
  type Phase,
} from '@/lib/classification/phases';
import { logError, logInfo, logWarn } from '@/lib/logger';
import type { InspectionStageMapRow } from '@/lib/permits/types';

// ---------------------------------------------------------------------------
// Constants — exported for tests and documentation
// ---------------------------------------------------------------------------

export const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const STALENESS_DAYS = 180;
const CALIBRATION_STALE_DAYS = 30;
export const NOT_PASSED_PENALTY_DAYS = 14;
export const STAGE_GAP_MEDIAN_DAYS = 30;
const MIN_SAMPLE_SIZE = 20;
export const PRE_PERMIT_MIN_DAYS = 240; // 8 months
export const PRE_PERMIT_MAX_DAYS = 420; // 14 months

interface CalibrationCacheRow {
  permit_type: string;
  median_days: number;
  p25_days: number;
  p75_days: number;
  sample_size: number;
  computed_at: Date;
}

/**
 * Bootstrap calibration from spec 71 §Calibration data (initial seed from
 * the 2026-Q1 audit: Issued → first inspection, Median=105d, P25=44d,
 * P75=238d, n=7732). Used when the cache is empty (e.g., before the first
 * compute-timing-calibration-v2.js run) so Tier 2 is functional from day 0.
 */
export const BOOTSTRAP_CALIBRATION = {
  p25: 44,
  median: 105,
  p75: 238,
} as const;

// ---------------------------------------------------------------------------
// Module-level calibration cache (process-wide)
// ---------------------------------------------------------------------------

let calibrationCache: Map<string, CalibrationCacheRow> | null = null;
let calibrationLoadedAt = 0;

/** Test-only escape hatch — resets module state between test runs. */
export function _resetCalibrationCache(): void {
  calibrationCache = null;
  calibrationLoadedAt = 0;
}

async function ensureCalibrationLoaded(pool: Pool): Promise<void> {
  const now = Date.now();
  if (calibrationCache !== null && now - calibrationLoadedAt < REFRESH_INTERVAL_MS) {
    return;
  }
  try {
    const res = await pool.query<CalibrationCacheRow>(
      `SELECT permit_type,
              MIN(median_days)::int AS median_days,
              MIN(p25_days)::int AS p25_days,
              MAX(p75_days)::int AS p75_days,
              SUM(sample_size)::int AS sample_size,
              MAX(computed_at) AS computed_at
         FROM phase_calibration
        WHERE from_phase = 'ISSUED'
          AND permit_type != '__ALL__'
        GROUP BY permit_type`,
    );
    const map = new Map<string, CalibrationCacheRow>();
    for (const row of res.rows) {
      map.set(row.permit_type, row);
    }
    calibrationCache = map;
    calibrationLoadedAt = now;
  } catch (err) {
    logError('[timing/calibration]', err, { stage: 'load' });
    // Never leave cache null after a failed load — use empty map so callers
    // can proceed via Tier 2 BOOTSTRAP fallback. We DELIBERATELY do NOT
    // bump calibrationLoadedAt: leaving it stale forces the very next call
    // to retry, instead of locking the empty cache in for REFRESH_INTERVAL_MS
    // and silently degrading every request for 5 minutes after a transient
    // DB blip.
    if (calibrationCache === null) {
      calibrationCache = new Map();
    }
  }
}

interface GlobalMedian {
  p25: number;
  median: number;
  p75: number;
}

/**
 * Compute the global calibration as a sample-weighted average across every
 * cached permit_type. Weighting by `sample_size` is statistically the right
 * thing to do — a permit_type with 10 000 observations should outweigh one
 * with 25. Falls back to BOOTSTRAP_CALIBRATION when the cache is empty.
 */
function getGlobalMedianCalibration(): GlobalMedian {
  if (!calibrationCache || calibrationCache.size === 0) {
    return { ...BOOTSTRAP_CALIBRATION };
  }
  let weightedP25 = 0;
  let weightedMedian = 0;
  let weightedP75 = 0;
  let totalWeight = 0;
  for (const row of calibrationCache.values()) {
    const w = Math.max(0, row.sample_size);
    if (w === 0) continue;
    weightedP25 += row.p25_days * w;
    weightedMedian += row.median_days * w;
    weightedP75 += row.p75_days * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return { ...BOOTSTRAP_CALIBRATION };
  return {
    p25: Math.round(weightedP25 / totalWeight),
    median: Math.round(weightedMedian / totalWeight),
    p75: Math.round(weightedP75 / totalWeight),
  };
}

// ---------------------------------------------------------------------------
// Candidate permit for parent/child merge
// ---------------------------------------------------------------------------

interface Candidate {
  permit_num: string;
  permit_type: string | null;
  issued_date: Date | null;
  status: string | null;
}

async function pickBestCandidate(
  permit_num: string,
  trade_slug: string,
  pool: Pool,
): Promise<Candidate> {
  const fallback: Candidate = {
    permit_num,
    permit_type: null,
    issued_date: null,
    status: null,
  };
  try {
    // Stable ordering: prefer the most recently-issued sibling first, ties
    // broken by permit_num. Without ORDER BY, the fallback below would pick
    // an arbitrary row on every call (non-deterministic).
    const res = await pool.query<Candidate>(
      `SELECT DISTINCT p.permit_num, p.permit_type, p.issued_date, p.status
         FROM permit_parcels pp_self
         JOIN permit_parcels pp_sibling
           ON pp_sibling.parcel_id = pp_self.parcel_id
         JOIN permits p
           ON p.permit_num = pp_sibling.permit_num
          AND p.revision_num = pp_sibling.revision_num
        WHERE pp_self.permit_num = $1
        ORDER BY p.issued_date DESC NULLS LAST, p.permit_num ASC`,
      [permit_num],
    );
    const siblings = res.rows;
    if (siblings.length === 0) return fallback;

    // Prefer any sibling whose current phase's trade list contains our trade
    for (const sibling of siblings) {
      const phase = determinePhase({
        ...(sibling.status !== null && { status: sibling.status }),
        issued_date: sibling.issued_date ?? null,
      });
      const phaseTrades = PHASE_TRADE_MAP[phase as Phase] ?? [];
      if (phaseTrades.includes(trade_slug)) {
        return sibling;
      }
    }
    // No phase match — return the first sibling that is the original permit
    // if present, else the first row.
    const original = siblings.find((s) => s.permit_num === permit_num);
    return original ?? siblings[0] ?? fallback;
  } catch (err) {
    logWarn('[timing/pick-candidate]', 'sibling query failed — using original', {
      permit_num,
      err: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

interface InspectionRow {
  stage_name: string;
  status: string;
  inspection_date: Date | null;
}

function isPassed(status: string | null | undefined): boolean {
  return (status ?? '').trim().toLowerCase() === 'passed';
}

function isNotPassed(status: string | null | undefined): boolean {
  return (status ?? '').trim().toLowerCase() === 'not passed';
}

function findLatestPassedInspection(rows: InspectionRow[]): InspectionRow | null {
  let latest: InspectionRow | null = null;
  for (const row of rows) {
    if (!isPassed(row.status) || !row.inspection_date) continue;
    if (!latest) {
      latest = row;
      continue;
    }
    const latestDate = latest.inspection_date;
    if (latestDate && row.inspection_date > latestDate) {
      latest = row;
    }
  }
  return latest;
}

function findInspectionForStage(
  rows: InspectionRow[],
  stage_name: string,
): InspectionRow | null {
  let latest: InspectionRow | null = null;
  for (const row of rows) {
    if (row.stage_name !== stage_name) continue;
    if (!latest) {
      latest = row;
      continue;
    }
    const latestDate = latest.inspection_date;
    const rowDate = row.inspection_date;
    if (rowDate && (!latestDate || rowDate > latestDate)) {
      latest = row;
    }
  }
  return latest;
}

function daysBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / (24 * 60 * 60 * 1000));
}

async function findEnablingStage(
  trade_slug: string,
  pool: Pool,
): Promise<InspectionStageMapRow | null> {
  const res = await pool.query<InspectionStageMapRow>(
    `SELECT id, stage_name, stage_sequence, trade_slug, relationship,
            min_lag_days, max_lag_days, precedence
       FROM inspection_stage_map
      WHERE trade_slug = $1
      ORDER BY precedence ASC
      LIMIT 1`,
    [trade_slug],
  );
  return res.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

/**
 * Staleness guard — if the permit's most recent PASSED inspection is more
 * than STALENESS_DAYS old, return the stalled fallback regardless of trade.
 * Called BEFORE the enabling-stage lookup so it fires even when the trade
 * has no map entry.
 *
 * Two-branch behavior:
 *   1. Has at least one passed inspection: stale if `daysSince > STALENESS_DAYS`.
 *   2. ZERO passed inspections AND issued > STALENESS_DAYS days ago: also
 *      stale. Pre-fix this branch returned null (not stale), and a permit
 *      issued 15 years ago with no inspections fell through to
 *      tier2IssuedHeuristic where it got the squishy "trade window may
 *      have passed" message instead of definitively stalled. Caught by
 *      user-supplied Gemini holistic review 2026-04-09 ("Infinity Stale").
 */
function checkStaleness(
  inspections: InspectionRow[],
  issuedDate: Date | null,
): TradeTimingEstimate | null {
  const latestPassed = findLatestPassedInspection(inspections);
  if (latestPassed?.inspection_date) {
    const daysSince = daysBetween(latestPassed.inspection_date, new Date());
    if (daysSince <= STALENESS_DAYS) return null;
    return {
      confidence: 'low',
      tier: 1,
      min_days: 0,
      max_days: 0,
      display: `Project may be stalled — last activity ${daysSince} days ago`,
    };
  }
  // Branch 2: no passed inspections at all. If the permit was issued
  // more than STALENESS_DAYS ago and STILL has zero passed inspections,
  // the project is dormant by any reasonable definition. (Permits with
  // recent issued_date + zero inspections are normal — they're just
  // pre-construction.)
  if (issuedDate) {
    const daysSinceIssued = daysBetween(issuedDate, new Date());
    if (daysSinceIssued > STALENESS_DAYS) {
      return {
        confidence: 'low',
        tier: 1,
        min_days: 0,
        max_days: 0,
        display: `Project appears stalled — issued ${daysSinceIssued} days ago with no inspection activity`,
      };
    }
  }
  return null;
}

function tier1StageBased(
  trade_slug: string,
  inspections: InspectionRow[],
  enablingStage: InspectionStageMapRow,
): TradeTimingEstimate {
  const latestPassed = findLatestPassedInspection(inspections);
  const enablingInspection = findInspectionForStage(inspections, enablingStage.stage_name);
  let min = enablingStage.min_lag_days;
  let max = enablingStage.max_lag_days;
  let delayed = false;

  if (enablingInspection) {
    if (isNotPassed(enablingInspection.status)) {
      min += NOT_PASSED_PENALTY_DAYS;
      max += NOT_PASSED_PENALTY_DAYS;
      delayed = true;
    }
    // Passed or outstanding at the enabling stage: use map lag as-is
  } else {
    // Enabling stage not yet reached — count stage-sequence gap from latest passed
    if (latestPassed) {
      const latestStageSeq = inspections.find((r) => r.stage_name === latestPassed.stage_name)
        ? getStageSequence(latestPassed.stage_name)
        : null;
      if (latestStageSeq !== null && enablingStage.stage_sequence > latestStageSeq) {
        // sequence values are 10,20,30,40,50,60,70 → each step = 1 stage
        const stepsAway = Math.floor((enablingStage.stage_sequence - latestStageSeq) / 10);
        const gapDays = stepsAway * STAGE_GAP_MEDIAN_DAYS;
        min += gapDays;
        max += gapDays;
      }
    }
  }

  const rangeWeeks =
    min === max ? `${Math.round(min / 7)} weeks` : `${Math.round(min / 7)}-${Math.round(max / 7)} weeks`;
  const base = `${enablingStage.stage_name} stage — ${trade_slug} in ${rangeWeeks}`;
  return {
    confidence: 'high',
    tier: 1,
    min_days: min,
    max_days: max,
    display: delayed ? `${base} (delayed — re-inspection pending)` : base,
  };
}

/**
 * Best-effort mapping from inspection stage_name to the known sequence
 * values (10/20/30/40/50/60/70). Returns null when the stage_name isn't
 * recognised — the caller must handle that.
 */
function getStageSequence(stage_name: string): number | null {
  const norm = stage_name.toLowerCase();
  if (norm.includes('excavation') || norm.includes('shoring')) return 10;
  if (norm.includes('footing') || norm.includes('foundation')) return 20;
  if (norm.includes('framing') || norm.includes('structural')) return 30;
  if (norm.includes('insulation') || norm.includes('vapour') || norm.includes('vapor')) return 40;
  if (norm.includes('fire')) return 50;
  if (norm.includes('interior final')) return 60;
  if (norm.includes('occupancy')) return 70;
  return null;
}

function tier2IssuedHeuristic(
  candidate: Candidate,
  trade_slug: string,
): TradeTimingEstimate {
  if (!candidate.issued_date || !candidate.permit_type) {
    // Missing issued_date → fall through to Tier 3
    return tier3PrePermit();
  }

  const row = calibrationCache?.get(candidate.permit_type) ?? null;
  const now = new Date();

  let p25: number;
  let p75: number;

  const stale =
    row !== null &&
    row.computed_at !== null &&
    daysBetween(new Date(row.computed_at), now) > CALIBRATION_STALE_DAYS;
  const insufficient = row !== null && row.sample_size < MIN_SAMPLE_SIZE;

  if (!row) {
    const g = getGlobalMedianCalibration();
    p25 = g.p25;
    p75 = g.p75;
  } else if (stale) {
    logWarn('[timing/calibration]', 'stale calibration row — falling back to global median', {
      permit_type: candidate.permit_type,
    });
    const g = getGlobalMedianCalibration();
    p25 = g.p25;
    p75 = g.p75;
  } else if (insufficient) {
    logWarn('[timing/calibration]', 'insufficient sample size — falling back to global median', {
      permit_type: candidate.permit_type,
      sample_size: row.sample_size,
    });
    const g = getGlobalMedianCalibration();
    p25 = g.p25;
    p75 = g.p75;
  } else {
    p25 = row.p25_days;
    p75 = row.p75_days;
  }

  // Determine elapsed days since issued, then estimate remaining bounds
  // relative to p25/p75 first-inspection windows.
  const elapsedDays = Math.max(0, daysBetween(new Date(candidate.issued_date), now));
  const remainingMin = Math.max(0, p25 - elapsedDays);
  const remainingMax = Math.max(remainingMin, p75 - elapsedDays);
  const weeksElapsed = Math.round(elapsedDays / 7);

  // Phase check: is the trade active in the currently-estimated phase?
  const phase = determinePhase({
    ...(candidate.status !== null && { status: candidate.status }),
    issued_date: candidate.issued_date ?? null,
  });
  const phaseTrades = PHASE_TRADE_MAP[phase] ?? [];
  const tradeInPhase = phaseTrades.includes(trade_slug);

  // Overdue: elapsed days exceed even the P75 calibration → the trade
  // window has likely closed. Show a different message instead of "0-0
  // weeks remaining" which is confusing.
  if (elapsedDays > p75) {
    return {
      confidence: 'medium',
      tier: 2,
      min_days: 0,
      max_days: 0,
      display: tradeInPhase
        ? `Permit issued ${weeksElapsed} weeks ago — your trade should be active now or recently completed`
        : `Permit issued ${weeksElapsed} weeks ago — your trade window may have passed`,
    };
  }

  const minWeeks = Math.round(remainingMin / 7);
  const maxWeeks = Math.round(remainingMax / 7);

  // Sub-week-resolution overdue: the day-based guard above
  // (`elapsedDays > p75`) catches the obvious overdue case, but it
  // doesn't catch the rounding cliff. Example: p75=238, elapsed=236
  // → guard fails (236 < 238), but remainingMax = 2 → round(2/7) = 0
  // → user sees "0-0 weeks remaining". Catch the rounding cliff
  // explicitly and route to the same overdue branch. Caught by
  // user-supplied Gemini holistic 2026-04-09 ("0-0 Weeks Math Gap").
  if (maxWeeks <= 0) {
    return {
      confidence: 'medium',
      tier: 2,
      min_days: 0,
      max_days: 0,
      display: tradeInPhase
        ? `Permit issued ${weeksElapsed} weeks ago — your trade should be active now or recently completed`
        : `Permit issued ${weeksElapsed} weeks ago — your trade window may have passed`,
    };
  }

  const display = tradeInPhase
    ? `Permit issued ${weeksElapsed} weeks ago — your trade is active now (${minWeeks}-${maxWeeks} weeks remaining)`
    : `Permit issued ${weeksElapsed} weeks ago — your trade estimated in ${minWeeks}-${maxWeeks} weeks`;

  return {
    confidence: 'medium',
    tier: 2,
    min_days: remainingMin,
    max_days: remainingMax,
    display,
  };
}

function tier3PrePermit(): TradeTimingEstimate {
  return {
    confidence: 'low',
    tier: 3,
    min_days: PRE_PERMIT_MIN_DAYS,
    max_days: PRE_PERMIT_MAX_DAYS,
    display: 'Pre-permit stage — your trade estimated 8-14 months out',
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Estimate when a given trade will be needed on a given permit. Returns a
 * safe fallback on ANY error — never throws. Designed to be called from
 * API route handlers without their own try/catch.
 */
export async function getTradeTimingForPermit(
  permit_num: string,
  trade_slug: string,
  pool: Pool,
): Promise<TradeTimingEstimate> {
  try {
    await ensureCalibrationLoaded(pool);
    const candidate = await pickBestCandidate(permit_num, trade_slug, pool);

    let inspections: InspectionRow[];
    try {
      const res = await pool.query<InspectionRow>(
        `SELECT stage_name, status, inspection_date
           FROM permit_inspections
          WHERE permit_num = $1
          ORDER BY inspection_date DESC NULLS LAST`,
        [candidate.permit_num],
      );
      inspections = res.rows;
    } catch (err) {
      logError('[timing/get-trade-timing]', err, {
        stage: 'inspections',
        permit_num,
        trade_slug,
      });
      return safeFallback();
    }

    // Staleness guard runs UNCONDITIONALLY — even for zero-inspection
    // permits. The two-branch checkStaleness handles both:
    //   (1) permits with passed inspections > 180 days old
    //   (2) permits issued > 180 days ago with ZERO passed inspections
    // Pre-fix this guard was gated on `inspections.length > 0`, which
    // missed branch 2 entirely — a 15-year-old permit with no
    // inspections fell through to tier2IssuedHeuristic and got the
    // squishy "trade window may have passed" message instead of
    // definitively stalled. User-supplied Gemini holistic 2026-04-09.
    // candidate.issued_date is already typed `Date | null`, so we pass
    // it directly — the `new Date(...)` wrap was redundant and would
    // mask a regression that returned a string from the DB layer.
    // (Gemini WF3 review 2026-04-09 line 875.)
    const stalled = checkStaleness(inspections, candidate.issued_date);
    if (stalled) {
      logInfo('[timing/get-trade-timing]', 'tier_1_stalled', {
        permit_num: candidate.permit_num,
        trade_slug,
      });
      return stalled;
    }

    if (inspections.length > 0) {

      // Tier 1: need enabling stage lookup
      let enablingStage: InspectionStageMapRow | null = null;
      try {
        enablingStage = await findEnablingStage(trade_slug, pool);
      } catch (err) {
        logWarn('[timing/enabling-stage]', 'lookup failed', {
          trade_slug,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      if (enablingStage) {
        const result = tier1StageBased(trade_slug, inspections, enablingStage);
        logInfo('[timing/get-trade-timing]', 'tier_1', {
          permit_num: candidate.permit_num,
          trade_slug,
          confidence: result.confidence,
        });
        return result;
      }
      // No enabling stage for this trade → fall through to Tier 2
    }

    if (candidate.issued_date) {
      const result = tier2IssuedHeuristic(candidate, trade_slug);
      logInfo('[timing/get-trade-timing]', 'tier_2', {
        permit_num: candidate.permit_num,
        trade_slug,
        confidence: result.confidence,
      });
      return result;
    }

    const result = tier3PrePermit();
    logInfo('[timing/get-trade-timing]', 'tier_3', {
      permit_num: candidate.permit_num,
      trade_slug,
    });
    return result;
  } catch (err) {
    logError('[timing/get-trade-timing]', err, { permit_num, trade_slug });
    return safeFallback();
  }
}

function safeFallback(): TradeTimingEstimate {
  return {
    confidence: 'low',
    tier: 3,
    min_days: 0,
    max_days: 0,
    display: 'Timing unavailable',
  };
}
