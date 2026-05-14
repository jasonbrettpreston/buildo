// 🔗 SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §1.1–§1.6
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
  // Phase E.1 (84-W12) fold #3: 'conditional consent' was previously encoded only
  // in coa_applications.status; adding it to the decision set so rule 5 fires for
  // both status- and decision-driven cases.
  'conditional consent',
  'consent with conditions',
]);

// Phase E.1 (84-W12): legacy union — backward-compat for any consumer that
// imports NORMALIZED_DEAD_DECISIONS. Split into P19/P20 below (the new precedence
// distinguishes terminal-refused/withdrawn from terminal-closed). Will be
// removed in Phase F when all consumers migrate to the split sets.
const NORMALIZED_DEAD_DECISIONS = new Set([
  'refused',
  'withdrawn',
  'application withdrawn',
  'application closed',
  'closed',
  'delegated consent refused',
]);

// Phase E.1 (84-W12) Spec 84 §2.5.b: decisions semantically equivalent to
// status='Refused'/'Withdrawn' → P19 (refused/withdrawn terminal).
const NORMALIZED_P19_DECISIONS = new Set([
  'refused',
  'withdrawn',
  'application withdrawn',
  'delegated consent refused',
]);

// Phase E.1 (84-W12) Spec 84 §2.5.b: decisions semantically equivalent to
// status='Closed' → P20 (closed terminal).
const NORMALIZED_P20_DECISIONS = new Set([
  'closed',
  'application closed',
  'delegated consent closed',
]);

// Phase E.1 (84-W12) Spec 84 §2.5.b row 83: 'Final and Binding' is a distinct
// post-approval terminal phase (P4). Single canonical variant; not in
// NORMALIZED_APPROVED_DECISIONS to keep rule 3 (P4) above rule 5 (P3) cleanly.
const NORMALIZED_FINAL_AND_BINDING_DECISIONS = new Set(['final and binding']);

// Phase E.1 (84-W12) Spec 84 §2.5.b rows 40-54: 505 free-text deferred variants
// (most date-stamped: 'deferred aug 18, 2016 (orig mark kehler)'). The canonical
// values 'deferred' / 'deffered' (row 53 typo) are in this set; date-stamped
// variants resolve via isDeferredDecisionVariant() below.
const NORMALIZED_DEFERRED_DECISIONS = new Set([
  'deferred',
  'deffered', // §2.5.b row 53 typo — preserved literal
]);

// Phase E.1 (84-W12) Universal Stream catalog (migration 129 CoA-side seq 1-22):
// When a decision-driven rule (1, 2, 3, 5, 6) fires, this map provides the
// canonical CoA status string for mapToUniversalStream lookup. Every key in the
// union of {P19, P20, FaB, Approved, Deferred} decision sets has an explicit
// entry; test #8 (decision-to-status map completeness) asserts:
//   - every key in the union has a map entry
//   - every value appears in a CoA-side status set
const NORMALIZED_DECISION_TO_STATUS_MAP = new Map([
  // P19 decision-side → catalog seq 13 / 19 / 20
  ['refused',                              'Refused'],
  ['withdrawn',                            'Application Withdrawn'],
  ['application withdrawn',                'Application Withdrawn'],
  ['delegated consent refused',            'Refused'],
  // P20 decision-side → catalog seq 21 / 22
  ['closed',                               'Closed'],
  ['application closed',                   'Closed'],
  ['delegated consent closed',             'Closed'],
  // P4 decision-side → catalog seq 14
  ['final and binding',                    'Final and Binding'],
  // P3 decision-side — all 16 existing approved variants + 2 new → catalog seq 10/11/12
  ['approved',                             'Approved'],
  ['conditional approval',                 'Approved with Conditions'],
  ['conditional approved',                 'Approved with Conditions'],
  ['conditionally approved',               'Approved with Conditions'],
  ['approved conditionally',               'Approved with Conditions'],
  ['approved on condition',                'Approved with Conditions'],
  ['approved on conditional',              'Approved with Conditions'],
  ['approved on condation',                'Approved with Conditions'],
  ['approved on condtion',                 'Approved with Conditions'],
  ['approved with conditions',             'Approved with Conditions'],
  ['approved with condition',              'Approved with Conditions'],
  ['approved wih conditions',              'Approved with Conditions'],
  ['approved, as amended, on condition',   'Approved with Conditions'],
  ['partially approved',                   'Approved'],
  ['conitional approval',                  'Approved with Conditions'],
  ['modified approval',                    'Approved'],
  ['conditional consent',                  'Conditional Consent'],
  ['consent with conditions',              'Conditional Consent'],
  // P2 decision-side → catalog seq 9 (date-stamped variants resolve via
  // isDeferredDecisionVariant + hardcoded 'Deferred' fallback in rule 6)
  ['deferred',                             'Deferred'],
  ['deffered',                             'Deferred'],
]);

// Phase E.1 (84-W12) Spec 84 §2.5.c: status sets matching the 22 canonical
// CKAN CoA status values. Each maps 1:1 to a catalog row.

// CoA-3..CoA-6 — review/scheduling/paused-review (rows 72-78) → P2 (seq 3-9)
const COA_REVIEW_STATUSES = new Set([
  'Prepare Notice',
  'Notice Prepared',
  'Tentatively Scheduled',
  'Hearing Scheduled',
  'Hearing Rescheduled',
  'Postponed',
  'Deferred',
]);

// CoA-1, CoA-2 — intake (rows 70-71) → P1 (seq 1-2)
const COA_INTAKE_STATUSES = new Set([
  'Application Received',
  'Accepted',
]);

// CoA-14 P20 — terminal closed (rows 90-91) → seq 21-22
const COA_TERMINAL_P20_STATUSES = new Set([
  'Closed',
  'Complete',
]);

// CoA-14 P19 — terminal refused/withdrawn/cancelled (rows 82, 88-89) → seq 13/19/20
const COA_TERMINAL_P19_STATUSES = new Set([
  'Application Withdrawn',
  'Cancelled',
  'Refused',
]);

// CoA-7, CoA-8 — approved (rows 79-81) → P3 (seq 10/11/12)
const COA_APPROVED_STATUSES = new Set([
  'Approved',
  'Approved with Conditions',
  'Conditional Consent',
]);

// CoA-9 — final and binding (row 83) → P4 (seq 14)
const COA_FINAL_AND_BINDING_STATUSES = new Set([
  'Final and Binding',
]);

// CoA-10..CoA-13 — post-decision in-appeal (rows 84-87) → P3 (seq 15-18)
const COA_POST_DECISION_STATUSES = new Set([
  'Await Expiry Date',
  'Appealed',
  'TLAB Appeal',
  'OMB Appeal',
]);

// Phase E.1 (84-W12) fold #5: post-lookup phase validation in mapToUniversalStream
// uses the existing VALID_PHASES set (defined earlier; matches Universal Stream
// catalog post-Phase-B). Catalog rows like seq 35 (permits.status='Notice Sent')
// have phase='UNMAPPED→null', and some permit-side rows have multi-value phase
// like 'P7a/P7b/P7c (or P9-P17)'. mapToUniversalStream returns null when the
// lookup hits such a poisoned row, driving E.2 to emit catalog_invalid_phase_count
// audit metric (7th metric).

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

// Phase E.1 (84-W12): trim + empty→null for input.status. Mirrors normalizeStatus
// but exported with a CoA-specific name so consumers can grep traceably.
function normalizeCoaStatus(s) {
  if (s == null) return null;
  const trimmed = String(s).trim();
  return trimmed.length === 0 ? null : trimmed;
}

// Phase E.1 (84-W12): hoisted from inline classifyCoaPhase logic (was lines 388-398)
// so the JS↔TS parity test asserts identical behavior across both implementations.
// Preserves the existing null-safety guards (adversarial Probe 6: Number(null) === 0
// would silently disable stall detection for rows with NULL last_seen_at).
function computeStallFromActivity(daysSinceActivity, stallThresholdDays) {
  if (daysSinceActivity == null || stallThresholdDays == null) return false;
  const d = Number(daysSinceActivity);
  const t = Number(stallThresholdDays);
  if (!Number.isFinite(d) || !Number.isFinite(t) || t <= 0) return false;
  return d > t;
}

// Phase E.1 (84-W12) Spec 84 §2.5.b rows 40-54: 505 free-text deferred variants.
// Negative guard (v4 fold #7): explicitly excludes variants in the other decision
// sets so e.g. 'deferred but refused' (hypothetical) falls through to rule 9 catchall
// rather than masquerading as P2-deferred.
function isDeferredDecisionVariant(normalized) {
  if (normalized == null) return false;
  if (NORMALIZED_APPROVED_DECISIONS.has(normalized)) return false;
  if (NORMALIZED_P19_DECISIONS.has(normalized)) return false;
  if (NORMALIZED_P20_DECISIONS.has(normalized)) return false;
  if (NORMALIZED_FINAL_AND_BINDING_DECISIONS.has(normalized)) return false;
  return (
    NORMALIZED_DEFERRED_DECISIONS.has(normalized) ||
    normalized.startsWith('deferred ') ||      // 'deferred aug 18, 2016 (orig...)'
    normalized.includes('decision not made')    // §2.5.b row 54 outlier
  );
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
      // WF3 2026-04-23 B1-C2: threshold sourced from logic_variables
      // (lifecycle_orphan_stall_days). `?? 180` preserves legacy behaviour
      // for test callers that don't provide the full config context —
      // the pipeline script always passes the DB-loaded value.
      const orphanStallDays = input.orphanStallDays ?? 180;
      if (daysSinceIssued > orphanStallDays) {
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
      // WF3 2026-04-23 B1-C3: an inspection passed but the stage either
      // wasn't recorded (rollup race) or didn't map to P9-P16. Routing to
      // P18 (Inspection Pipeline) is the wrong bucket — P18 represents
      // "in pipeline, no stage passed yet". Since a stage HAS passed,
      // the permit is effectively at Final Inspection (P17). This bumps
      // ambiguous inspection-passed rows forward, not backward.
      return { phase: 'P17', stalled };
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

// Phase E.1 (84-W12) — REWRITTEN per Spec 42 §6.7 corrected 9-rule precedence.
// Bug 84-W12 root cause: pre-E.1 logic ignored coa_applications.status entirely
// (read only decision) AND short-circuited on linked_permit_num. Combined effect:
// 99.4% of CoAs received lifecycle_phase = NULL. Spec 84 §2.5.f line 367 names
// Rule 0 (linked_permit_num short-circuit) as "THE 84-W12 root cause."
//
// New 9-rule precedence (top-down, first match wins). Reordering rationale:
//   R1 (status/decision terminal P20) before R2 (P19) — Closed is the most
//     recent state and overrides any intermediate decision.
//   R4 (post-decision: Appealed/TLAB/OMB/Await Expiry) before R5 (Approved) —
//     post-decision states are MORE RECENT than the approval that preceded them.
//   R6 (decision-deferred) before R7 (status-review) — decision is more
//     authoritative than scheduling status (a hearing can be scheduled but
//     subsequently deferred via decision update).
//
// matchedStatus derivation: when a decision-driven rule fires (R1/R2/R3/R5/R6),
// matchedStatus is derived from NORMALIZED_DECISION_TO_STATUS_MAP so E.2's
// mapToUniversalStream lookup always returns a valid catalog row (or null when
// the catalog has no entry — driving lifecycle_seq=NULL + audit increment).
//
// Stall detection: forced false for non-{P1, P2} phases (terminal/post-decision
// can't stall). Rule 9 catchall → P1 DOES compute stall (an in-flight CoA with
// an unrecognized status may still be stuck).
function classifyCoaPhase(input) {
  // Defensive guard: null/non-object input → sentinel return with matchedRule=0
  if (typeof input !== 'object' || input === null) {
    return {
      phase: null,
      stalled: false,
      matchedStatus: null,
      matchedRule: 0,
      unmappedStatus: false,
      unmappedDecision: false,
    };
  }

  const status = normalizeCoaStatus(input.status);
  const decision = normalizeCoaDecision(input.decision);

  // ─────────────────────────────────────────────────────────────
  // Rule 1 — Terminal P20 (Closed / Complete; or decision='closed')
  // ─────────────────────────────────────────────────────────────
  if (status != null && COA_TERMINAL_P20_STATUSES.has(status)) {
    return finalize({phase: 'P20', matchedRule: 1, matchedStatus: status,
                     unmappedStatus: false, unmappedDecision: decision != null && !inAnyDecisionSet(decision),
                     input});
  }
  if (decision != null && NORMALIZED_P20_DECISIONS.has(decision)) {
    return finalize({phase: 'P20', matchedRule: 1,
                     matchedStatus: NORMALIZED_DECISION_TO_STATUS_MAP.get(decision) ?? null,
                     unmappedStatus: status != null && !inAnyStatusSet(status),
                     unmappedDecision: false,
                     input});
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 2 — Terminal P19 (Refused / Withdrawn / Cancelled)
  // ─────────────────────────────────────────────────────────────
  if (status != null && COA_TERMINAL_P19_STATUSES.has(status)) {
    return finalize({phase: 'P19', matchedRule: 2, matchedStatus: status,
                     unmappedStatus: false,
                     unmappedDecision: decision != null && !inAnyDecisionSet(decision),
                     input});
  }
  if (decision != null && NORMALIZED_P19_DECISIONS.has(decision)) {
    return finalize({phase: 'P19', matchedRule: 2,
                     matchedStatus: NORMALIZED_DECISION_TO_STATUS_MAP.get(decision) ?? null,
                     unmappedStatus: status != null && !inAnyStatusSet(status),
                     unmappedDecision: false,
                     input});
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 3 — Final and Binding (P4)
  // ─────────────────────────────────────────────────────────────
  if (status != null && COA_FINAL_AND_BINDING_STATUSES.has(status)) {
    return finalize({phase: 'P4', matchedRule: 3, matchedStatus: status,
                     unmappedStatus: false,
                     unmappedDecision: decision != null && !inAnyDecisionSet(decision),
                     input});
  }
  if (decision != null && NORMALIZED_FINAL_AND_BINDING_DECISIONS.has(decision)) {
    return finalize({phase: 'P4', matchedRule: 3, matchedStatus: 'Final and Binding',
                     unmappedStatus: status != null && !inAnyStatusSet(status),
                     unmappedDecision: false,
                     input});
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 4 — Post-decision in-appeal (P3) — reordered ABOVE R5 (approved)
  //   because post-decision states (Appealed/TLAB/OMB/Await Expiry) are
  //   MORE RECENT than the approval that preceded them.
  // ─────────────────────────────────────────────────────────────
  if (status != null && COA_POST_DECISION_STATUSES.has(status)) {
    return finalize({phase: 'P3', matchedRule: 4, matchedStatus: status,
                     unmappedStatus: false,
                     unmappedDecision: decision != null && !inAnyDecisionSet(decision),
                     input});
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 5 — Approved (P3)
  // ─────────────────────────────────────────────────────────────
  if (status != null && COA_APPROVED_STATUSES.has(status)) {
    return finalize({phase: 'P3', matchedRule: 5, matchedStatus: status,
                     unmappedStatus: false,
                     unmappedDecision: decision != null && !inAnyDecisionSet(decision),
                     input});
  }
  if (decision != null && NORMALIZED_APPROVED_DECISIONS.has(decision)) {
    return finalize({phase: 'P3', matchedRule: 5,
                     matchedStatus: NORMALIZED_DECISION_TO_STATUS_MAP.get(decision) ?? null,
                     unmappedStatus: status != null && !inAnyStatusSet(status),
                     unmappedDecision: false,
                     input});
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 6 — Decision-deferred (P2) — reordered ABOVE R7 (status-review)
  //   because decision is more authoritative than scheduling status.
  //   Date-stamped variants (505 in §2.5.g) return undefined from the
  //   map; the hardcoded 'Deferred' fallback handles them.
  // ─────────────────────────────────────────────────────────────
  if (isDeferredDecisionVariant(decision)) {
    const mapped = NORMALIZED_DECISION_TO_STATUS_MAP.get(decision);
    return finalize({phase: 'P2', matchedRule: 6, matchedStatus: mapped ?? 'Deferred',
                     unmappedStatus: status != null && !inAnyStatusSet(status),
                     unmappedDecision: false,
                     input});
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 7 — Review/scheduling/paused-review statuses (P2)
  // ─────────────────────────────────────────────────────────────
  if (status != null && COA_REVIEW_STATUSES.has(status)) {
    return finalize({phase: 'P2', matchedRule: 7, matchedStatus: status,
                     unmappedStatus: false,
                     unmappedDecision: decision != null && !inAnyDecisionSet(decision),
                     input});
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 8 — Intake statuses (P1)
  // ─────────────────────────────────────────────────────────────
  if (status != null && COA_INTAKE_STATUSES.has(status)) {
    return finalize({phase: 'P1', matchedRule: 8, matchedStatus: status,
                     unmappedStatus: false,
                     unmappedDecision: decision != null && !inAnyDecisionSet(decision),
                     input});
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 9 — Catchall (P1, unmappedStatus/Decision flags set)
  //   matchedStatus = null (NOT a sentinel — drives mapToUniversalStream
  //   to return null → E.2 writes lifecycle_seq = NULL correctly).
  //   Stall is computed (catchall P1 may still be stuck).
  // ─────────────────────────────────────────────────────────────
  return finalize({phase: 'P1', matchedRule: 9, matchedStatus: null,
                   unmappedStatus: status != null,
                   unmappedDecision: decision != null && !isDeferredDecisionVariant(decision),
                   input});
}

// Helper: did the input.status fall into any of the canonical status sets?
function inAnyStatusSet(status) {
  return (
    COA_REVIEW_STATUSES.has(status) ||
    COA_INTAKE_STATUSES.has(status) ||
    COA_TERMINAL_P20_STATUSES.has(status) ||
    COA_TERMINAL_P19_STATUSES.has(status) ||
    COA_APPROVED_STATUSES.has(status) ||
    COA_FINAL_AND_BINDING_STATUSES.has(status) ||
    COA_POST_DECISION_STATUSES.has(status)
  );
}

// Helper: did the input.decision fall into any decision set/helper?
function inAnyDecisionSet(decision) {
  return (
    NORMALIZED_P19_DECISIONS.has(decision) ||
    NORMALIZED_P20_DECISIONS.has(decision) ||
    NORMALIZED_FINAL_AND_BINDING_DECISIONS.has(decision) ||
    NORMALIZED_APPROVED_DECISIONS.has(decision) ||
    isDeferredDecisionVariant(decision)
  );
}

// Finalize: attach stall flag (forced false for non-P1/P2) + freeze.
function finalize({phase, matchedRule, matchedStatus, unmappedStatus, unmappedDecision, input}) {
  const isInFlight = (phase === 'P1' || phase === 'P2');
  const stalled = isInFlight
    ? computeStallFromActivity(input.daysSinceActivity, input.stallThresholdDays)
    : false;
  return Object.freeze({phase, stalled, matchedStatus, matchedRule, unmappedStatus, unmappedDecision});
}

// Phase E.1 (84-W12) Same-Sprint Mitigation Option 2: legacy adapter for v1
// consumers that destructure only {phase, stalled} and assume phase ∈ {P1, P2, null}.
//
// PRESERVES OLD RETURN SHAPE, NOT OLD BUGGY BEHAVIOR. The buggy v1 mapping
// (decision='Approved' → P2) was wrong — we are not preserving wrongness. The
// adapter narrows P3/P4/P19/P20 → null so v1 consumers' switch statements
// continue to write null for those cases (matching pre-E.1 production state)
// until E.2 wires the full new shape.
//
// scripts/classify-lifecycle-phase.js uses this adapter until E.2 ships.
function classifyCoaPhaseLegacy(input) {
  const r = classifyCoaPhase(input);
  return {
    phase: (r.phase === 'P1' || r.phase === 'P2') ? r.phase : null,
    stalled: r.stalled,
  };
}

// Phase E.1 (84-W12): Universal Stream catalog lookup. Pure function — catalog
// passed in as pre-built Map by caller (E.2 builds it once at script startup).
//
// Key invariant: catalogByStatusSource keys are `${source}:${matchedStatus}` strings.
// Match the migration 128 source CHECK constraint: 'coa.status' | 'permits.status' | 'insp.stage'.
//
// Returns null when:
//   1. matchedStatus is null/undefined (catchall rule 9 case — drives lifecycle_seq=NULL)
//   2. matchedStatus is a string but not in catalog (data drift)
//   3. catalog row has a non-standard .phase value (e.g., seq 35 'UNMAPPED→null',
//      multi-value 'P7a/P7b/P7c'). Post-lookup phase validation prevents poisoned
//      catalog rows from corrupting E.2's lifecycle_phase write. Drives
//      catalog_invalid_phase_count audit metric (7th metric).
//
// ⚠️ The returned `.phase` field is the catalog's DESCRIPTIVE label and must
//    NOT be used as the lifecycle_phase write target — that comes from
//    classifyCoaPhase().phase / classifyLifecyclePhase().phase. The catalog
//    `.phase` is for cross-reference / audit only.
function mapToUniversalStream(catalogByStatusSource, matchedStatus, source) {
  if (matchedStatus == null) return null;
  if (!(catalogByStatusSource instanceof Map)) return null;
  const key = `${source}:${matchedStatus}`;
  const row = catalogByStatusSource.get(key);
  if (!row) return null;
  // Post-lookup phase validation (v4 fold #5):
  if (row.phase != null && !VALID_PHASES.has(row.phase)) {
    return null; // poisoned row → E.2 emits catalog_invalid_phase_count
  }
  return Object.freeze({...row});
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
//
// WF3 2026-04-23 — B1-C1: this constant is FALLBACK-ONLY. Canonical source
// is the `trade_configurations` DB table (loaded via `loadMarketplaceConfigs`
// in config-loader.js) per spec 47 §4.1. Runtime scripts build their working
// map from the DB and only fall back to this constant when the DB query
// fails or returns zero rows. The legacy alias `TRADE_TARGET_PHASE` (below
// the definition) exists for pre-DB-config frontend consumers that still
// import the static constant directly; those importers should migrate to
// DB-loaded config in a future WF.
const TRADE_TARGET_PHASE_FALLBACK = Object.freeze({
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
  // Real Estate persona — WF2 Cycle 7 (Spec 91 §3.5).
  // Mirror of src/lib/classification/lifecycle-phase.ts (CLAUDE.md §7
  // dual code path mandate). bid_phase: P1 (intake — earliest visibility,
  // pre-issuance). work_phase: P19 (winddown / pre-occupancy → ready to
  // list). Same algorithm as construction trades; persona-specific
  // behavior is DB calibration only per Spec 91 §1.2.
  realtor:             { bid_phase: 'P1',  work_phase: 'P19' },
});

// Legacy alias — DO NOT USE in new code. Use `trade_configurations` DB
// table via `loadMarketplaceConfigs()` instead (spec 47 §4.1). Retained so
// src/features/leads/lib/get-lead-feed.ts and src/app/api/leads/flight-board/route.ts
// (which import this constant statically) keep compiling. A future WF should
// migrate those consumers to DB-loaded config.
const TRADE_TARGET_PHASE = TRADE_TARGET_PHASE_FALLBACK;

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
  // WF3 2026-04-23 B1-H4: P18 was previously 4, colliding with P12 (Rough-In)
  // and causing isWindowClosed / Phase-Past-Target comparisons to misfire for
  // MEP trades on inspection-pipeline permits. Fractional ordinal (3.5) places
  // P18 between P11 (structural framing) and P12 (rough-in) — "inspections in
  // progress, specific stage unknown". All consumers use </>/>= comparisons,
  // never equality or indexing, so the fractional value is safe.
  P18: 3.5,
  O1: 20, O2: 20, O3: 20,
});

module.exports = {
  // Permit + CoA classifiers
  classifyLifecyclePhase,
  classifyCoaPhase,
  // Phase E.1 (84-W12) — Same-Sprint Mitigation Option 2 + Universal Stream substrate
  classifyCoaPhaseLegacy,
  mapToUniversalStream,
  // Normalization helpers
  normalizeCoaDecision,
  normalizeCoaStatus,
  computeStallFromActivity,
  isDeferredDecisionVariant,
  // Phase ordinals + skip lists
  PHASE_ORDINAL,
  SKIP_PHASES_SQL,
  // Permit-side status sets
  DEAD_STATUS_SET,
  DEAD_STATUS_ARRAY,
  TERMINAL_P20_SET,
  WINDDOWN_P19_SET,
  INTAKE_P3_SET,
  REVIEW_P4_SET,
  HOLD_P5_SET,
  READY_P6_SET,
  REVISION_P8_SET,
  NOT_STARTED_P7D_SET,
  INSPECTION_PIPELINE_P18_SET,
  // Phase E.1 (84-W12) — CoA-side status sets matching §2.5.c 22 values
  COA_REVIEW_STATUSES,
  COA_INTAKE_STATUSES,
  COA_TERMINAL_P20_STATUSES,
  COA_TERMINAL_P19_STATUSES,
  COA_APPROVED_STATUSES,
  COA_FINAL_AND_BINDING_STATUSES,
  COA_POST_DECISION_STATUSES,
  // CoA-side decision sets + map
  NORMALIZED_APPROVED_DECISIONS,
  NORMALIZED_DEAD_DECISIONS,                 // legacy union (deprecated — split into P19/P20)
  NORMALIZED_DEAD_DECISIONS_ARRAY,
  NORMALIZED_P19_DECISIONS,
  NORMALIZED_P20_DECISIONS,
  NORMALIZED_FINAL_AND_BINDING_DECISIONS,
  NORMALIZED_DEFERRED_DECISIONS,
  NORMALIZED_DECISION_TO_STATUS_MAP,
  // Domain + legacy
  VALID_PHASES,
  TRADE_TARGET_PHASE_FALLBACK,
  TRADE_TARGET_PHASE, // legacy alias — see comment near definition
  mapInspectionStageToPhase,
};
