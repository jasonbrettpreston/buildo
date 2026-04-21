// 🔗 SPEC LINK: docs/specs/product/future/84_lifecycle_phase_engine.md §1.1–§1.6
// 🔗 DUAL CODE PATH: src/lib/classification/lifecycle-phase.ts (CLAUDE.md §7)
//
// JavaScript mirror of the TypeScript lifecycle-phase classifier.
// This file MUST stay in sync with the TS version bit-for-bit. The
// Tier 1 sync rule: if you edit one, edit the other in the same commit.
//
// Pure function — no DB access, no side effects. Consumed by
// scripts/classify-lifecycle-phase.js which handles the DB I/O.

'use strict';

// ─────────────────────────────────────────────────────────────────
// Constant sets
// ─────────────────────────────────────────────────────────────────

const DEAD_STATUS_SET = new Set([
  'Cancelled',
  'Revoked',
  'Permit Revoked',
  'Refused',
  'Refusal Notice',
  'Application Withdrawn',
  'Abandoned',
  'Not Accepted',
  'Work Suspended',
  'VIOLATION',
  'Order Issued',
  'Tenant Notice Period',
  'Follow-up Required',
]);

const TERMINAL_P20_SET = new Set([
  'Closed',
  'File Closed',
  'Permit Issued/Close File',
]);

const WINDDOWN_P19_SET = new Set([
  'Pending Closed',
  'Pending Cancellation',
  'Revocation Pending',
  'Revocation Notice Sent',
  // Gap status: pre-cancellation of an inspection request
  'Inspection Request to Cancel',
]);

const INTAKE_P3_SET = new Set([
  'Application Received',
  'Application Acceptable',
  'Plan Review Complete',
  'Open',
  'Active',
  'Request Received',
]);

const REVIEW_P4_SET = new Set([
  'Under Review',
  'Examination',
  "Examiner's Notice Sent",
  'Consultation Completed',
]);

const HOLD_P5_SET = new Set([
  'Application On Hold',
  'Application on Hold',
  'Deficiency Notice Issued',
  'Response Received',
  'Pending Parent Folder Review',
]);

const READY_P6_SET = new Set([
  'Ready for Issuance',
  'Forwarded for Issuance',
  'Issuance Pending',
  'Approved',
  'Agreement in Progress',
  'Licence Issued',
]);

const REVISION_P8_SET = new Set([
  'Revision Issued',
  'Revised',
  'Order Complied',
]);

const NOT_STARTED_P7D_SET = new Set([
  'Work Not Started',
  'Not Started',
  'Not Started - Express',
  'Extension Granted',
  'Extension in Progress',
]);

const INSPECTION_PIPELINE_P18_SET = new Set([
  'Forward to Inspector',
  'Rescheduled',
]);

// WF3-04 (H-W14 / 84-W10): O4 removed — phantom phase with no classifier rule.
const VALID_PHASES = new Set([
  'P1', 'P2', 'P3', 'P4', 'P5', 'P6',
  'P7a', 'P7b', 'P7c', 'P7d',
  'P8', 'P9', 'P10', 'P11', 'P12', 'P13',
  'P14', 'P15', 'P16', 'P17', 'P18',
  'P19', 'P20',
  'O1', 'O2', 'O3',
]);

const NORMALIZED_APPROVED_DECISIONS = new Set([
  'approved',
  'conditional approval',
  'conditional approved',
  'conditionally approved',
  'approved conditionally',
  'approved on condition',
  'approved on conditional',
  'approved on condation',
  'approved on condtion',
  'approved with conditions',
  'approved with condition',
  'approved wih conditions',
  'approved, as amended, on condition',
  'partially approved',
  'conitional approval',
  'modified approval',
]);

const NORMALIZED_DEAD_DECISIONS = new Set([
  'refused',
  'withdrawn',
  'application withdrawn',
  'application closed',
  'closed',
  'delegated consent refused',
]);

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(earlier, later) {
  return Math.floor((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

function normalizeStatus(s) {
  if (s == null) return null;
  const trimmed = String(s).trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeCoaDecision(d) {
  if (d == null) return null;
  const trimmed = String(d).trim().toLowerCase().replace(/\s+/g, ' ');
  return trimmed.length === 0 ? null : trimmed;
}

function mapInspectionStageToPhase(stageLower) {
  if (
    stageLower.includes('excavation') ||
    stageLower.includes('shoring') ||
    stageLower.includes('site grading') ||
    stageLower.includes('demolition')
  ) {
    return 'P9';
  }
  if (
    stageLower.includes('footings') ||
    stageLower.includes('foundations') ||
    stageLower === 'foundation'
  ) {
    return 'P10';
  }
  if (stageLower.includes('structural framing') || stageLower.includes('framing')) {
    return 'P11';
  }
  if (stageLower.includes('insulation') || stageLower.includes('vapour')) {
    return 'P13';
  }
  if (stageLower.includes('fire separations')) {
    return 'P14';
  }
  if (
    stageLower.includes('interior final') ||
    stageLower.includes('plumbing final') ||
    stageLower.includes('hvac final')
  ) {
    return 'P15';
  }
  if (stageLower.includes('exterior final')) {
    return 'P16';
  }
  if (stageLower.includes('occupancy') || stageLower.includes('final inspection')) {
    return 'P17';
  }
  if (
    stageLower.includes('hvac') ||
    stageLower.includes('plumbing') ||
    stageLower.includes('electrical') ||
    stageLower.includes('fire protection') ||
    stageLower.includes('fire access') ||
    stageLower.includes('water service') ||
    stageLower.includes('water distribution') ||
    stageLower.includes('drain') ||
    stageLower.includes('sewers') ||
    stageLower.includes('fire service')
  ) {
    return 'P12';
  }
  return null;
}

function computeStalled(input) {
  if (input.enriched_status === 'Stalled') return true;

  const issuedStallDays     = input.permitIssuedStallDays ?? 730;
  const inspectionStallDays = input.inspectionStallDays   ?? 180;

  if (
    input.status === 'Permit Issued' &&
    !input.has_passed_inspection &&
    input.issued_date != null
  ) {
    const daysSinceIssued = daysBetween(input.issued_date, input.now);
    if (daysSinceIssued > issuedStallDays) return true;
  }

  if (input.status === 'Inspection' && input.latest_inspection_date != null) {
    const daysSinceInspection = daysBetween(input.latest_inspection_date, input.now);
    if (daysSinceInspection > inspectionStallDays) return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────
// Main classifiers
// ─────────────────────────────────────────────────────────────────

function classifyLifecyclePhase(input) {
  const status = normalizeStatus(input.status);

  // Null / empty status → always unclassified. These rows are
  // explicitly excluded from the CQA unclassified-count gate in
  // classify-lifecycle-phase.js, so we must not assign O1 via the
  // orphan fallback — doing so would diverge from the SQL reproducer
  // and contradict the spec's "status IS NULL" carve-out.
  if (status == null) {
    return { phase: null, stalled: false };
  }

  if (DEAD_STATUS_SET.has(status)) {
    return { phase: null, stalled: false };
  }

  if (TERMINAL_P20_SET.has(status)) {
    return { phase: 'P20', stalled: false };
  }
  if (WINDDOWN_P19_SET.has(status)) {
    return { phase: 'P19', stalled: false };
  }

  const stalled = computeStalled(input);

  if (input.is_orphan) {
    return classifyOrphan(input, status, stalled);
  }

  return classifyBldLed(input, status, stalled);
}

function classifyOrphan(input, status, stalled) {
  if (
    status === 'Permit Issued' ||
    status === 'Inspection' ||
    status === 'Revision Issued' ||
    status === 'Revised'
  ) {
    if (input.issued_date != null && !input.has_passed_inspection) {
      const daysSinceIssued = daysBetween(input.issued_date, input.now);
      if (daysSinceIssued > 180) {
        return { phase: 'O3', stalled };
      }
    }
    return { phase: 'O2', stalled };
  }

  if (
    status != null &&
    (INTAKE_P3_SET.has(status) ||
      REVIEW_P4_SET.has(status) ||
      HOLD_P5_SET.has(status) ||
      READY_P6_SET.has(status))
  ) {
    return { phase: 'O1', stalled };
  }

  return { phase: 'O1', stalled };
}

function classifyBldLed(input, status, stalled) {
  if (status == null) {
    return { phase: null, stalled: false };
  }

  if (REVIEW_P4_SET.has(status)) return { phase: 'P4', stalled };
  if (HOLD_P5_SET.has(status)) return { phase: 'P5', stalled };
  if (READY_P6_SET.has(status)) return { phase: 'P6', stalled };
  if (INTAKE_P3_SET.has(status)) return { phase: 'P3', stalled };

  if (REVISION_P8_SET.has(status)) return { phase: 'P8', stalled };

  if (NOT_STARTED_P7D_SET.has(status)) return { phase: 'P7d', stalled };

  if (status === 'Permit Issued') {
    if (input.has_passed_inspection) {
      if (input.latest_passed_stage != null) {
        const stageLower = String(input.latest_passed_stage).toLowerCase();
        const mapped = mapInspectionStageToPhase(stageLower);
        if (mapped) return { phase: mapped, stalled };
      }
      return { phase: 'P18', stalled };
    }
    if (input.issued_date == null) {
      return { phase: 'P7c', stalled };
    }
    const p7aMax = input.p7aMaxDays ?? 30;
    const p7bMax = input.p7bMaxDays ?? 90;
    const daysSinceIssued = daysBetween(input.issued_date, input.now);
    if (daysSinceIssued <= p7aMax) return { phase: 'P7a', stalled };
    if (daysSinceIssued <= p7bMax) return { phase: 'P7b', stalled };
    return { phase: 'P7c', stalled };
  }

  if (status === 'Inspection') {
    if (input.latest_passed_stage == null) {
      return { phase: 'P18', stalled };
    }
    const stageLower = String(input.latest_passed_stage).toLowerCase();
    const mapped = mapInspectionStageToPhase(stageLower);
    return { phase: mapped || 'P18', stalled };
  }

  if (INSPECTION_PIPELINE_P18_SET.has(status)) {
    return { phase: 'P18', stalled };
  }

  return { phase: null, stalled: false };
}

// WF3 2026-04-13 — `stalled` flag added. Operator can tune the
// threshold via `logic_variables.coa_stall_threshold`. The classifier
// script passes `daysSinceActivity` (derived from last_seen_at) and
// `stallThresholdDays` (from control panel) into the pure function.
//
// Stall rule: only P1 (Intake) / P2 (Review) phases can stall. Approved,
// dead, or linked CoAs don't stall — they're terminal or have moved on.
function classifyCoaPhase(input) {
  if (input.linked_permit_num != null && String(input.linked_permit_num).trim() !== '') {
    return { phase: null, stalled: false };
  }

  const normalized = normalizeCoaDecision(input.decision);

  if (normalized != null && NORMALIZED_DEAD_DECISIONS.has(normalized)) {
    return { phase: null, stalled: false };
  }

  const phase = normalized != null && NORMALIZED_APPROVED_DECISIONS.has(normalized)
    ? 'P2'
    : 'P1';

  // Stall detection: only for in-flight phases (P1/P2). A CoA that has
  // had no activity for longer than the threshold is treated as stuck.
  // Guard against Number(null) = 0 which would silently disable stall
  // detection for rows with NULL last_seen_at (adversarial Probe 6).
  const days = input.daysSinceActivity == null
    ? null
    : Number(input.daysSinceActivity);
  const threshold = input.stallThresholdDays == null
    ? null
    : Number(input.stallThresholdDays);
  const stalled = days != null && threshold != null
    && Number.isFinite(days) && Number.isFinite(threshold)
    && threshold > 0 && days > threshold;

  return { phase, stalled };
}

// Frozen array form of DEAD_STATUS_SET — for SQL parameterization in
// pipeline scripts so they don't hardcode the 13 dead statuses. Import
// this + use `ANY($1::text[])` or `= ANY($N)` instead of inline NOT IN.
// Single source of truth per WF3 review finding (drift risk from 3 places).
const DEAD_STATUS_ARRAY = Object.freeze([...DEAD_STATUS_SET]);

// SQL NOT IN list of phases that compute-trade-forecasts (and related CQA
// scripts) exclude from forecast generation / eligibility counts.
// Exported as a single source of truth so all consumers stay in sync.
//   P19, P20  — terminal (wind-down / closed)
//   O1, O2, O3 — orphan (detached parent folder, progression unreliable)
// NOTE: P1/P2 removed 2026-04-21 — now included with 18-month recency gate
// in compute-trade-forecasts.js SOURCE_SQL directly.
const SKIP_PHASES_SQL = `('P19','P20','O1','O2','O3')`;

// Frozen array form of NORMALIZED_DEAD_DECISIONS — same rationale for CoA.
const NORMALIZED_DEAD_DECISIONS_ARRAY = Object.freeze([...NORMALIZED_DEAD_DECISIONS]);

// ─────────────────────────────────────────────────────────────────
// Trade → Target Phase mapping (Phase 3 calibration + Phase 4 flight tracker)
// ─────────────────────────────────────────────────────────────────
//
// Maps each of the 32 trade slugs to the lifecycle phase where that
// trade becomes "active" on-site. The flight tracker (Phase 4) uses
// this to answer: "given a permit currently at phase X, how many days
// until the plumber's target phase P12?"
//
// The calibration engine provides the (from_phase → to_phase) median
// days. TRADE_TARGET_PHASE bridges that to per-trade predictions.
// Bimodal trade target mapping: each trade has TWO windows.
//
// bid_phase:  the early phase where a builder starts looking for
//             subcontractors (the "get on the shortlist" window).
//             For most trades this is shortly after permit issuance.
// work_phase: the construction phase where the trade is physically
//             on-site doing the work (the "boots on the ground" window).
//
// The flight tracker routes to bid_phase if the permit hasn't reached
// it yet, otherwise to work_phase. This creates a self-healing pipeline:
// - A freshly issued permit shows "plumbing bidding in 30 days"
// - If the permit ages past the bid window, it shifts to "plumbing
//   rough-in in 82 days from framing" (the Rescue Mission)
// - If the permit gets a framing inspection, the prediction tightens
//   to actual construction calibration data
//
// WF3: replaces the single-phase mapping that caused 5,304 plumbing
// and 4,849 HVAC leads to land in the "overdue graveyard."
// WF3: bid_phase values recalibrated to match when GCs actually
// start soliciting subs. Major trades (MEP, structural, drywall,
// elevator) bid from P3 (application intake) — GCs line up subs
// before the permit even issues. Specialty finishes bid later (P7a
// or P11). Landscaping/decking bid during rough-in (P12).
const TRADE_TARGET_PHASE = Object.freeze({
  // --- SITE PREP & FOUNDATION ---
  excavation:          { bid_phase: 'P3',  work_phase: 'P9' },
  shoring:             { bid_phase: 'P3',  work_phase: 'P9' },
  demolition:          { bid_phase: 'P3',  work_phase: 'P9' },
  'temporary-fencing': { bid_phase: 'P3',  work_phase: 'P9' },
  concrete:            { bid_phase: 'P3',  work_phase: 'P10' },
  waterproofing:       { bid_phase: 'P3',  work_phase: 'P10' },

  // --- STRUCTURAL ---
  framing:             { bid_phase: 'P3',  work_phase: 'P11' },
  'structural-steel':  { bid_phase: 'P3',  work_phase: 'P11' },
  masonry:             { bid_phase: 'P7a', work_phase: 'P11' },
  elevator:            { bid_phase: 'P3',  work_phase: 'P11' },

  // --- MEP (Mechanical, Electrical, Plumbing) ---
  plumbing:            { bid_phase: 'P3',  work_phase: 'P12' },
  hvac:                { bid_phase: 'P3',  work_phase: 'P12' },
  electrical:          { bid_phase: 'P3',  work_phase: 'P12' },
  'drain-plumbing':    { bid_phase: 'P3',  work_phase: 'P12' },
  'fire-protection':   { bid_phase: 'P3',  work_phase: 'P12' },

  // --- ENVELOPE & INSULATION ---
  roofing:             { bid_phase: 'P7a', work_phase: 'P16' },
  insulation:          { bid_phase: 'P7a', work_phase: 'P13' },
  glazing:             { bid_phase: 'P7a', work_phase: 'P16' },

  // --- FINISHES (Interior) ---
  drywall:             { bid_phase: 'P3',  work_phase: 'P15' },
  painting:            { bid_phase: 'P7a', work_phase: 'P15' },
  flooring:            { bid_phase: 'P7a', work_phase: 'P15' },
  tiling:              { bid_phase: 'P7a', work_phase: 'P15' },
  'trim-work':         { bid_phase: 'P11', work_phase: 'P15' },
  'millwork-cabinetry': { bid_phase: 'P7a', work_phase: 'P15' },
  'stone-countertops': { bid_phase: 'P11', work_phase: 'P15' },
  security:            { bid_phase: 'P11', work_phase: 'P15' },

  // --- EXTERIOR & SPECIALTY ---
  'eavestrough-siding': { bid_phase: 'P7a', work_phase: 'P16' },
  caulking:            { bid_phase: 'P7a', work_phase: 'P16' },
  solar:               { bid_phase: 'P7a', work_phase: 'P16' },
  landscaping:         { bid_phase: 'P12', work_phase: 'P17' },
  'decking-fences':    { bid_phase: 'P12', work_phase: 'P17' },
  'pool-installation': { bid_phase: 'P7a', work_phase: 'P17' },
});

// Phase ordinals for forward-progression comparison. Single source of
// truth — imported by compute-trade-forecasts.js and
// update-tracked-projects.js. Previously duplicated; extracted here to
// prevent silent drift.
//
// WF3-04 (H-W14): O1/O2/O3 = 20 — orphan permits have a missing/
// detached parent folder; their phase cannot be reliably progressed
// through P9-P17 via inspections. Treating them as past all
// work_phase_targets (max P17 = 9) makes isWindowClosed in
// update-tracked-projects.js fire naturally, so orphan-tracked leads
// auto-archive instead of silently accumulating. compute-trade-
// forecasts.js still filters them via SKIP_PHASES (runs before
// PHASE_ORDINAL lookup), so these ordinals don't affect forecasting.
const PHASE_ORDINAL = Object.freeze({
  P1: -8, P2: -7,
  P3: -6, P4: -5, P5: -4, P6: -3,
  P7a: -2, P7b: -2, P7c: -2, P7d: -2,
  P8: -1,
  P9: 1, P10: 2, P11: 3, P12: 4, P13: 5,
  P14: 6, P15: 7, P16: 8, P17: 9,
  P18: 4,
  O1: 20, O2: 20, O3: 20,
});

module.exports = {
  classifyLifecyclePhase,
  classifyCoaPhase,
  normalizeCoaDecision,
  PHASE_ORDINAL,
  SKIP_PHASES_SQL,
  DEAD_STATUS_SET,
  DEAD_STATUS_ARRAY,
  NORMALIZED_DEAD_DECISIONS_ARRAY,
  TERMINAL_P20_SET,
  WINDDOWN_P19_SET,
  INTAKE_P3_SET,
  REVIEW_P4_SET,
  HOLD_P5_SET,
  READY_P6_SET,
  REVISION_P8_SET,
  NOT_STARTED_P7D_SET,
  INSPECTION_PIPELINE_P18_SET,
  NORMALIZED_APPROVED_DECISIONS,
  NORMALIZED_DEAD_DECISIONS,
  VALID_PHASES,
  TRADE_TARGET_PHASE,
  mapInspectionStageToPhase,
};
