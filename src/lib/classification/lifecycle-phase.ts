// 🔗 SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §1.1–§1.6
// 🔗 DUAL CODE PATH: scripts/lib/lifecycle-phase.js must mirror this logic
//                    bit-for-bit (CLAUDE.md §7).
//
// Lifecycle Phase Classifier — pure function that assigns a 24-phase
// label to a permit row or a CoA application row. Strangler Fig V1:
// this is the NEW column, separate from the existing enriched_status
// which stays as scraper operational state.
//
// Hard guarantees:
//   - No DB access. No side effects. No throws on any input.
//   - Same input → same output. Deterministic.
//   - TypeScript types here are pure inputs/outputs; the DB-layer
//     wrapper in scripts/classify-lifecycle-phase.js is responsible
//     for fetching the inputs and writing the outputs.
//
// Decision tree ordering (top-down, first match wins):
//   1. Dead states         → phase = null
//   2. Terminal P19/P20    → phase = P19 or P20
//   3. Orphan branch       → phase = O1 | O2 | O3 (terminal still P20)
//   4. BLD-led pre-issue   → phase = P3 | P4 | P5 | P6
//   5. BLD-led revision    → phase = P8
//   6. BLD-led not started → phase = P7d
//   7. BLD-led issued      → phase = P7a | P7b | P7c (time-bucketed)
//   8. BLD-led inspection  → phase = P9-P17 | P18 (stage-based or fallback)
//   9. Unknown fallback    → phase = null
//
// Stalled modifier (orthogonal boolean):
//   stalled = true if
//     - enriched_status = 'Stalled'                     (scraper signal)
//     - OR (Permit Issued > 2yr + no passed inspection) (age-based)
//     - OR (Inspection + latest inspection > 180d ago)  (inspection gap)

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

interface PermitClassifierInput {
  status: string | null;
  enriched_status: string | null;
  issued_date: Date | null;
  is_orphan: boolean;
  latest_passed_stage: string | null;
  latest_inspection_date: Date | null;
  has_passed_inspection: boolean;
  /** Injected "now" for deterministic testing. Defaults to new Date() in callers. */
  now: Date;
  /** Days since Permit Issued before stall flag is set. From logic_variables. */
  permitIssuedStallDays?: number | null;
  /** Days since last inspection before stall flag is set. From logic_variables. */
  inspectionStallDays?: number | null;
  /** Max days since issued for P7a bucket. From logic_variables. */
  p7aMaxDays?: number | null;
  /** Max days since issued for P7b bucket. From logic_variables. */
  p7bMaxDays?: number | null;
  /**
   * Days since issued for an orphan permit (no parent BLD/CMB) with no
   * passed inspection before it degrades from O2 → O3. From logic_variables
   * (`lifecycle_orphan_stall_days`, default 180). WF3 2026-04-23 B1-C2.
   */
  orphanStallDays?: number | null;
}

interface PermitClassifierResult {
  phase: string | null;
  stalled: boolean;
  /** Phase I.1.1b (Spec 84 §3.7): raw normalized input status that the classifier matched.
   * ALWAYS the raw normalized input — never a literal override. Null only for rule 0 and rule 1. */
  matchedStatus: string | null;
  /** Phase I.1.1b: rule number that fired (0..15 per Spec 84 §3.7 18-rule table; 0 = defensive sentinel). */
  matchedRule: number;
  /** Phase I.1.1b: input.status was non-null but matched no known status set (rule 15 catchall). */
  unmappedStatus: boolean;
}

interface CoaClassifierInput {
  decision: string | null;
  linked_permit_num: string | null;
  status: string | null;
  /** Days since last_seen_at (or equivalent activity signal). Used for stall detection. */
  daysSinceActivity?: number | null;
  /** Threshold in days — from logic_variables.coa_stall_threshold. */
  stallThresholdDays?: number | null;
}

/**
 * CoA classifier return shape.
 *
 * Phase E.1 (bug 84-W12 fix) widens `phase` to the full Universal Stream
 * CoA-side domain ({P1, P2, P3, P4, P19, P20, null}) and adds 4 fields
 * that drive E.2's audit_table + dual-ledger writes:
 *   - matchedStatus    — canonical CoA status string for mapToUniversalStream
 *                        lookup (null for rule 9 catchall → drives lifecycle_seq=NULL)
 *   - matchedRule      — 1..9 (rule that fired). 0 = defensive sentinel
 *                        when input is null / non-object.
 *   - unmappedStatus   — true when input.status was non-null but matched no set
 *   - unmappedDecision — true when input.decision was non-null but matched no set/helper
 *
 * Existing destructure `{phase, stalled}` continues to work (additive change).
 */
export interface CoaClassifierResult {
  phase: 'P1' | 'P2' | 'P3' | 'P4' | 'P19' | 'P20' | null;
  /** WF3 2026-04-13: true when an in-flight (P1/P2) CoA is inactive longer than threshold.
   * E.1: forced false for non-P1/P2 phases (terminal/post-decision can't stall). */
  stalled: boolean;
  /** E.1 (84-W12): canonical CoA status (e.g. 'Hearing Scheduled') for
   * mapToUniversalStream lookup. null when rule 9 catchall fires. */
  matchedStatus: string | null;
  /** E.1 (84-W12): rule number (1..9) that fired. 0 = defensive null/non-object input. */
  matchedRule: number;
  /** E.1 (84-W12): input.status was non-null but matched no set. Drives unmapped_status_count audit. */
  unmappedStatus: boolean;
  /** E.1 (84-W12): input.decision was non-null but matched no set/helper. Drives unmapped_decision_count audit. */
  unmappedDecision: boolean;
}

/**
 * Universal Stream catalog source enum. Matches migration 128 CHECK constraint exactly.
 * Callsite invariant: CoA classifier always emits CoA-side matchedStatus → callers pass 'coa.status'.
 */
export type UniversalStreamSource = 'coa.status' | 'permits.status' | 'insp.stage';

/**
 * Universal Stream catalog row shape (returned by mapToUniversalStream).
 *
 * ⚠️ The `phase` field is the catalog's DESCRIPTIVE label and may contain
 * multi-value strings (e.g. 'P7a/P7b/P7c (or P9-P17)') or sentinel values
 * (e.g. 'UNMAPPED→null'). It is NOT the canonical lifecycle_phase.
 * Use `classifyCoaPhase().phase` / `classifyLifecyclePhase().phase` as the
 * authoritative write target. Catalog `.phase` is for cross-reference only.
 */
export interface UniversalStreamRow {
  readonly seq: number;
  readonly group: string;
  readonly block: string;
  readonly stage: string;
  readonly phase: string;
  readonly bid_value: number | null;
}

// ─────────────────────────────────────────────────────────────────
// Constant sets — exported for tests and for use by the SQL reproducer
// which checks that it covers the same statuses.
// ─────────────────────────────────────────────────────────────────

export const DEAD_STATUS_SET: ReadonlySet<string> = new Set([
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

export const TERMINAL_P20_SET: ReadonlySet<string> = new Set([
  'Closed',
  'File Closed',
  'Permit Issued/Close File',
]);

export const WINDDOWN_P19_SET: ReadonlySet<string> = new Set([
  'Pending Closed',
  'Pending Cancellation',
  'Revocation Pending',
  'Revocation Notice Sent',
  // Gap status found in State Verification: Inspection Request to Cancel
  // is semantically pre-cancellation of an inspection request → wind-down.
  'Inspection Request to Cancel',
]);

export const INTAKE_P3_SET: ReadonlySet<string> = new Set([
  'Application Received',
  'Application Acceptable',
  'Plan Review Complete',
  'Open',
  'Active',
  'Request Received',
]);

export const REVIEW_P4_SET: ReadonlySet<string> = new Set([
  'Under Review',
  'Examination',
  "Examiner's Notice Sent",
  'Consultation Completed',
]);

export const HOLD_P5_SET: ReadonlySet<string> = new Set([
  'Application On Hold',
  'Application on Hold', // lowercase 'on' variant that exists in live DB
  'Deficiency Notice Issued',
  'Response Received',
  'Pending Parent Folder Review',
]);

export const READY_P6_SET: ReadonlySet<string> = new Set([
  'Ready for Issuance',
  'Forwarded for Issuance',
  'Issuance Pending',
  'Approved',
  'Agreement in Progress',
  'Licence Issued',
]);

export const REVISION_P8_SET: ReadonlySet<string> = new Set([
  'Revision Issued',
  'Revised',
  // Gap status: Order Complied means a violation order was resolved.
  // The permit is back to normal active state → route to the revision/
  // active catch-all bucket. 22 rows in live DB.
  'Order Complied',
]);

export const NOT_STARTED_P7D_SET: ReadonlySet<string> = new Set([
  'Work Not Started',
  'Not Started',
  'Not Started - Express',
  'Extension Granted',
  'Extension in Progress',
]);

// Gap statuses routed to P18 (construction active, stage unknown).
// Exported to maintain bit-for-bit parity with the JS dual-code-path
// mirror in scripts/lib/lifecycle-phase.js, which also exports this set.
// Asymmetric exports would violate the §7 dual-code-path rule even
// though no test currently imports this set from the TS side.
export const INSPECTION_PIPELINE_P18_SET: ReadonlySet<string> = new Set([
  'Forward to Inspector',
  'Rescheduled',
]);

/** The full valid phase domain, including CoA phases (P1, P2). Exported for fuzz tests. */
// WF3-04 (H-W14 / 84-W10): O4 removed — phantom phase, no classifier produces it.
export const VALID_PHASES: ReadonlySet<string> = new Set([
  'P1', 'P2', 'P3', 'P4', 'P5', 'P6',
  'P7a', 'P7b', 'P7c', 'P7d',
  'P8', 'P9', 'P10', 'P11', 'P12', 'P13',
  'P14', 'P15', 'P16', 'P17', 'P18',
  'P19', 'P20',
  'O1', 'O2', 'O3',
]);

/**
 * Trade → Target Phase mapping. Maps each of the 32 trade slugs to the
 * lifecycle phase where that trade becomes "active" on-site. The flight
 * tracker uses this to bridge calibration data (phase-to-phase medians)
 * to per-trade predictions. Dual code path: must match the JS version
 * in scripts/lib/lifecycle-phase.js.
 */
/** Bimodal trade target: bid_phase = when to start bidding, work_phase = when on-site. */
interface TradeTarget {
  bid_phase: string;
  work_phase: string;
}

/**
 * Bimodal trade target mapping — FALLBACK-ONLY. Each trade has TWO windows:
 * bid_phase (get on the shortlist) and work_phase (boots on the ground).
 * Dual code path: must match scripts/lib/lifecycle-phase.js.
 *
 * WF3 2026-04-23 — B1-C1: canonical source is the `trade_configurations` DB
 * table (loaded via `loadMarketplaceConfigs`) per spec 47 §4.1. This constant
 * is the last-resort fallback when the DB query fails or returns zero rows.
 * The legacy alias `TRADE_TARGET_PHASE` (below the definition) preserves
 * compatibility for callers still reading this constant statically; those
 * callers should migrate to DB-loaded config in a future WF.
 */
export const TRADE_TARGET_PHASE_FALLBACK: Readonly<Record<string, TradeTarget>> = Object.freeze({
  // Site prep & foundation — bid from P3 (GCs line up subs pre-issuance)
  excavation: { bid_phase: 'P3', work_phase: 'P9' },
  shoring: { bid_phase: 'P3', work_phase: 'P9' },
  demolition: { bid_phase: 'P3', work_phase: 'P9' },
  'temporary-fencing': { bid_phase: 'P3', work_phase: 'P9' },
  concrete: { bid_phase: 'P3', work_phase: 'P10' },
  waterproofing: { bid_phase: 'P3', work_phase: 'P10' },
  // Structural
  framing: { bid_phase: 'P3', work_phase: 'P11' },
  'structural-steel': { bid_phase: 'P3', work_phase: 'P11' },
  masonry: { bid_phase: 'P7a', work_phase: 'P11' },
  elevator: { bid_phase: 'P3', work_phase: 'P11' },
  // MEP
  plumbing: { bid_phase: 'P3', work_phase: 'P12' },
  hvac: { bid_phase: 'P3', work_phase: 'P12' },
  electrical: { bid_phase: 'P3', work_phase: 'P12' },
  'drain-plumbing': { bid_phase: 'P3', work_phase: 'P12' },
  'fire-protection': { bid_phase: 'P3', work_phase: 'P12' },
  // Envelope & insulation
  roofing: { bid_phase: 'P7a', work_phase: 'P16' },
  insulation: { bid_phase: 'P7a', work_phase: 'P13' },
  glazing: { bid_phase: 'P7a', work_phase: 'P16' },
  // Interior finishes
  drywall: { bid_phase: 'P3', work_phase: 'P15' },
  painting: { bid_phase: 'P7a', work_phase: 'P15' },
  flooring: { bid_phase: 'P7a', work_phase: 'P15' },
  tiling: { bid_phase: 'P7a', work_phase: 'P15' },
  'trim-work': { bid_phase: 'P11', work_phase: 'P15' },
  'millwork-cabinetry': { bid_phase: 'P7a', work_phase: 'P15' },
  'stone-countertops': { bid_phase: 'P11', work_phase: 'P15' },
  security: { bid_phase: 'P11', work_phase: 'P15' },
  // Exterior & specialty
  'eavestrough-siding': { bid_phase: 'P7a', work_phase: 'P16' },
  caulking: { bid_phase: 'P7a', work_phase: 'P16' },
  solar: { bid_phase: 'P7a', work_phase: 'P16' },
  landscaping: { bid_phase: 'P12', work_phase: 'P17' },
  'decking-fences': { bid_phase: 'P12', work_phase: 'P17' },
  'pool-installation': { bid_phase: 'P7a', work_phase: 'P17' },
  // Real Estate persona — WF2 Cycle 7 (Spec 91 §3.5).
  // bid_phase: P1 (intake) → realtor sees the permit the moment it enters
  // the DB, before issuance. work_phase: P19 (winddown / pre-occupancy) →
  // predicted_start aligns with project completion ("ready to list").
  // Same algorithm as construction trades; persona-specific behavior is
  // expressed via DB calibration only per Spec 91 §1.2 invariant.
  realtor: { bid_phase: 'P1', work_phase: 'P19' },
});

/**
 * Legacy alias — DO NOT USE in new code. Use `trade_configurations` DB
 * table via `loadMarketplaceConfigs()` instead (spec 47 §4.1). Retained so
 * `src/features/leads/lib/get-lead-feed.ts` and
 * `src/app/api/leads/flight-board/route.ts` keep compiling while their
 * migration to DB-loaded config is pending.
 */
export const TRADE_TARGET_PHASE = TRADE_TARGET_PHASE_FALLBACK;

// ─────────────────────────────────────────────────────────────────
// CoA decision normalization + canonical sets
// ─────────────────────────────────────────────────────────────────

/**
 * Normalize a CoA decision string: trim, lowercase, collapse internal
 * whitespace. Returns null for null/undefined/empty inputs.
 */
export function normalizeCoaDecision(d: string | null): string | null {
  if (d == null) return null;
  const trimmed = String(d).trim().toLowerCase().replace(/\s+/g, ' ');
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Phase E.1 (84-W12): trim + empty→null for input.status. Mirrors normalizeStatus
 * with a CoA-specific export name.
 */
export function normalizeCoaStatus(s: string | null | undefined): string | null {
  if (s == null) return null;
  const trimmed = String(s).trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Phase E.1 (84-W12): hoisted from inline classifyCoaPhase logic so the
 * JS↔TS parity test asserts identical behavior. Preserves null-safety guards
 * (adversarial Probe 6: Number(null) === 0 would silently disable stall detection).
 */
export function computeStallFromActivity(
  daysSinceActivity: number | null | undefined,
  stallThresholdDays: number | null | undefined,
): boolean {
  if (daysSinceActivity == null || stallThresholdDays == null) return false;
  const d = Number(daysSinceActivity);
  const t = Number(stallThresholdDays);
  if (!Number.isFinite(d) || !Number.isFinite(t) || t <= 0) return false;
  return d > t;
}

/**
 * Phase E.1 (84-W12) Spec 84 §2.5.b rows 40-54 — 505 free-text deferred variants.
 * Negative guard: explicitly excludes variants in other decision sets so e.g.
 * 'deferred but refused' (hypothetical) falls through to rule 9 catchall.
 */
export function isDeferredDecisionVariant(normalized: string | null | undefined): boolean {
  if (normalized == null) return false;
  if (NORMALIZED_APPROVED_DECISIONS.has(normalized)) return false;
  if (NORMALIZED_P19_DECISIONS.has(normalized)) return false;
  if (NORMALIZED_P20_DECISIONS.has(normalized)) return false;
  if (NORMALIZED_FINAL_AND_BINDING_DECISIONS.has(normalized)) return false;
  return (
    NORMALIZED_DEFERRED_DECISIONS.has(normalized) ||
    normalized.startsWith('deferred ') ||
    normalized.includes('decision not made')
  );
}

/**
 * Canonical set of "approved" CoA decisions after normalization. Covers
 * every variant found in the live DB as of 2026-04-11 (35 distinct
 * values normalized). Typos and legacy variants are enumerated
 * explicitly so no fuzzy matching is needed.
 */
export const NORMALIZED_APPROVED_DECISIONS: ReadonlySet<string> = new Set([
  'approved',
  'conditional approval',
  'conditional approved',
  'conditionally approved',
  'approved conditionally',
  'approved on condition',
  'approved on conditional',
  'approved on condation', // typo
  'approved on condtion', // typo
  'approved with conditions',
  'approved with condition',
  'approved wih conditions', // typo
  'approved, as amended, on condition',
  'partially approved',
  'conitional approval', // typo
  'modified approval',
  // Phase E.1 (84-W12) fold #3
  'conditional consent',
  'consent with conditions',
]);

// Phase E.1 (84-W12): legacy union — backward-compat for consumers that import
// NORMALIZED_DEAD_DECISIONS. Split into P19/P20 below. Removed in Phase F.
export const NORMALIZED_DEAD_DECISIONS: ReadonlySet<string> = new Set([
  'refused',
  'withdrawn',
  'application withdrawn',
  'application closed',
  'closed',
  'delegated consent refused',
]);

// Phase E.1 (84-W12) Spec 84 §2.5.b — decision sets split P19 vs P20
export const NORMALIZED_P19_DECISIONS: ReadonlySet<string> = new Set([
  'refused',
  'withdrawn',
  'application withdrawn',
  'delegated consent refused',
]);

export const NORMALIZED_P20_DECISIONS: ReadonlySet<string> = new Set([
  'closed',
  'application closed',
  'delegated consent closed',
]);

export const NORMALIZED_FINAL_AND_BINDING_DECISIONS: ReadonlySet<string> = new Set([
  'final and binding',
]);

export const NORMALIZED_DEFERRED_DECISIONS: ReadonlySet<string> = new Set([
  'deferred',
  'deffered', // §2.5.b row 53 typo
]);

// Phase E.1 (84-W12) — explicit decision→canonical-status map (Spec 42 §6.7 step 2).
// Every key in the union of P19/P20/FaB/Approved/Deferred decision sets has an
// entry. Test #8 asserts: every key in union → map.has(key) === true.
export const NORMALIZED_DECISION_TO_STATUS_MAP: ReadonlyMap<string, string> = new Map([
  // P19 decision-side
  ['refused', 'Refused'],
  ['withdrawn', 'Application Withdrawn'],
  ['application withdrawn', 'Application Withdrawn'],
  ['delegated consent refused', 'Refused'],
  // P20 decision-side
  ['closed', 'Closed'],
  ['application closed', 'Closed'],
  ['delegated consent closed', 'Closed'],
  // P4 decision-side
  ['final and binding', 'Final and Binding'],
  // P3 decision-side — 16 existing approved variants + 2 new
  ['approved', 'Approved'],
  ['conditional approval', 'Approved with Conditions'],
  ['conditional approved', 'Approved with Conditions'],
  ['conditionally approved', 'Approved with Conditions'],
  ['approved conditionally', 'Approved with Conditions'],
  ['approved on condition', 'Approved with Conditions'],
  ['approved on conditional', 'Approved with Conditions'],
  ['approved on condation', 'Approved with Conditions'],
  ['approved on condtion', 'Approved with Conditions'],
  ['approved with conditions', 'Approved with Conditions'],
  ['approved with condition', 'Approved with Conditions'],
  ['approved wih conditions', 'Approved with Conditions'],
  ['approved, as amended, on condition', 'Approved with Conditions'],
  ['partially approved', 'Approved'],
  ['conitional approval', 'Approved with Conditions'],
  ['modified approval', 'Approved'],
  ['conditional consent', 'Conditional Consent'],
  ['consent with conditions', 'Conditional Consent'],
  // P2 decision-side
  ['deferred', 'Deferred'],
  ['deffered', 'Deferred'],
]);

// Phase E.1 (84-W12) Spec 84 §2.5.c — CoA-side status sets matching the 22
// canonical CKAN values. See Appendix A in active_task.md for the full table.

export const COA_REVIEW_STATUSES: ReadonlySet<string> = new Set([
  'Prepare Notice',
  'Notice Prepared',
  'Tentatively Scheduled',
  'Hearing Scheduled',
  'Hearing Rescheduled',
  'Postponed',
  'Deferred',
]);

export const COA_INTAKE_STATUSES: ReadonlySet<string> = new Set([
  'Application Received',
  'Accepted',
]);

export const COA_TERMINAL_P20_STATUSES: ReadonlySet<string> = new Set([
  'Closed',
  'Complete',
]);

export const COA_TERMINAL_P19_STATUSES: ReadonlySet<string> = new Set([
  'Application Withdrawn',
  'Cancelled',
  'Refused',
]);

export const COA_APPROVED_STATUSES: ReadonlySet<string> = new Set([
  'Approved',
  'Approved with Conditions',
  'Conditional Consent',
]);

export const COA_FINAL_AND_BINDING_STATUSES: ReadonlySet<string> = new Set([
  'Final and Binding',
]);

export const COA_POST_DECISION_STATUSES: ReadonlySet<string> = new Set([
  'Await Expiry Date',
  'Appealed',
  'TLAB Appeal',
  'OMB Appeal',
]);

// Phase E.1 (84-W12) fold #5 — mapToUniversalStream post-lookup phase validation
// uses the existing VALID_PHASES set (defined earlier in this file). Catalog rows
// with non-standard .phase (e.g., 'UNMAPPED→null', multi-value 'P7a/P7b/P7c') are
// treated as misses, driving E.2 to emit catalog_invalid_phase_count audit metric.

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** Milliseconds in a day — used for age calculations. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

/** Trim + treat empty string as null. Returns null for null/undefined/whitespace-only. */
function normalizeStatus(s: string | null): string | null {
  if (s == null) return null;
  const trimmed = String(s).trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Map a normalized inspection stage_name (already lowercased) to the
 * corresponding P9-P17 phase. Returns null for unmapped stages (which
 * fall through to P18 "Stage Unknown").
 */
function mapInspectionStageToPhase(stageLower: string): string | null {
  // P9 — Site prep
  if (
    stageLower.includes('excavation') ||
    stageLower.includes('shoring') ||
    stageLower.includes('site grading') ||
    stageLower.includes('demolition')
  ) {
    return 'P9';
  }

  // P10 — Foundation
  if (
    stageLower.includes('footings') ||
    stageLower.includes('foundations') ||
    stageLower === 'foundation'
  ) {
    return 'P10';
  }

  // P11 — Framing
  if (stageLower.includes('structural framing') || stageLower.includes('framing')) {
    return 'P11';
  }

  // P13 — Insulation (check BEFORE P12 rough-in so 'insulation' doesn't get caught by other checks)
  if (stageLower.includes('insulation') || stageLower.includes('vapour')) {
    return 'P13';
  }

  // P14 — Fire Separations (check BEFORE P12 so 'fire separations' isn't caught by 'fire')
  if (stageLower.includes('fire separations')) {
    return 'P14';
  }

  // P15 — Interior Finishing (check BEFORE P12 'fire protection' & P16 'exterior final')
  if (
    stageLower.includes('interior final') ||
    stageLower.includes('plumbing final') ||
    stageLower.includes('hvac final')
  ) {
    return 'P15';
  }

  // P16 — Exterior Finishing
  if (stageLower.includes('exterior final')) {
    return 'P16';
  }

  // P17 — Final Walkthrough (occupancy or generic final inspection)
  if (stageLower.includes('occupancy') || stageLower.includes('final inspection')) {
    return 'P17';
  }

  // P12 — Rough-In bucket (evaluated LAST among specific-phase mappings because
  // its patterns are broad: plumbing/electrical/hvac/fire/water/drain). The
  // earlier specific mappings (plumbing final, hvac final, fire separations)
  // have already been handled, so this is the catch-all for MEP rough-ins.
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

  // Unmapped stage (e.g., Change of Use, Repair/Retrofit, Pool Circulation) → fallback
  return null;
}

/**
 * Compute the stalled modifier independently of the primary phase.
 */
function computeStalled(input: PermitClassifierInput): boolean {
  // Signal 1: scraper-derived stalled flag
  if (input.enriched_status === 'Stalled') return true;

  const issuedStallDays     = input.permitIssuedStallDays ?? 730;
  const inspectionStallDays = input.inspectionStallDays   ?? 180;

  // Signal 2: long-issued Permit Issued with no passed inspection
  if (
    input.status === 'Permit Issued' &&
    !input.has_passed_inspection &&
    input.issued_date != null
  ) {
    const daysSinceIssued = daysBetween(input.issued_date, input.now);
    if (daysSinceIssued > issuedStallDays) return true;
  }

  // Signal 3: Inspection status with last inspection > threshold days old
  if (
    input.status === 'Inspection' &&
    input.latest_inspection_date != null
  ) {
    const daysSinceInspection = daysBetween(input.latest_inspection_date, input.now);
    if (daysSinceInspection > inspectionStallDays) return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────
// Main permit classifier
// ─────────────────────────────────────────────────────────────────

/**
 * Phase I.1.1b — finalize helper for the permit classifier.
 *
 * Contract (Spec 84 §3.7): every exit of classifyLifecyclePhase MUST set
 * matchedStatus to either `null` (rules 0 and 1 only) or a string. Runtime
 * assertion catches accidental `undefined` returns introduced by future
 * refactors — converts a silent ledger-suppression bug into a loud throw.
 */
function finalizePermit(args: {
  phase: string | null;
  stalled: boolean;
  matchedStatus: string | null;
  matchedRule: number;
  unmappedStatus: boolean;
}): PermitClassifierResult {
  const { phase, stalled, matchedStatus, matchedRule, unmappedStatus } = args;
  if (matchedStatus === undefined) {
    throw new Error(
      `[classifyLifecyclePhase] BUG: matchedStatus=undefined at rule ${matchedRule}`,
    );
  }
  return { phase, stalled, matchedStatus, matchedRule, unmappedStatus };
}

// Phase I.1.1b: union of every known permit status set. Used (in the JS twin)
// by tests that need to enumerate known statuses. The TS classifier's catchall
// detection lives implicitly in the rule cascade — if no specific rule fires,
// rule 15 runs. Exported for symmetry with the JS twin's module exports.
export const ALL_KNOWN_PERMIT_STATUSES = new Set<string>([
  ...DEAD_STATUS_SET,
  ...TERMINAL_P20_SET,
  ...WINDDOWN_P19_SET,
  ...INTAKE_P3_SET,
  ...REVIEW_P4_SET,
  ...HOLD_P5_SET,
  ...READY_P6_SET,
  ...NOT_STARTED_P7D_SET,
  ...REVISION_P8_SET,
  ...INSPECTION_PIPELINE_P18_SET,
  'Permit Issued',
  'Inspection',
]);

/**
 * Classify a single permit row into a lifecycle phase + stalled modifier
 * + Phase I.1.1b matched-status outputs.
 *
 * Pure function — no DB, no throws (except the finalizePermit runtime
 * assertion guarding the matchedStatus=undefined regression). Deterministic.
 *
 * Phase I.1.1b extends the return shape to include matchedStatus (raw
 * normalized input status — Spec 84 §3.7 contract), matchedRule (0..15
 * per the 18-rule precedence table), and unmappedStatus (rule 15 catchall
 * flag). Existing destructure `{phase, stalled}` continues to work.
 *
 * Precedence note: DEAD status takes precedence over orphan classification.
 * A permit that is both is_orphan AND has a DEAD status returns phase=null
 * via rule 2, NOT an O-phase. Terminal status is more authoritative than
 * the orphan-vs-BldLed distinction.
 */
export function classifyLifecyclePhase(
  input: PermitClassifierInput,
): PermitClassifierResult {
  // Rule 0 — defensive null/non-object input guard (mirrors CoA rule 0).
  if (typeof input !== 'object' || input === null) {
    return finalizePermit({
      phase: null,
      stalled: false,
      matchedStatus: null,
      matchedRule: 0,
      unmappedStatus: false,
    });
  }

  const status = normalizeStatus(input.status);

  // Rule 1 — null / empty status → always unclassified. Excluded from
  // the CQA unclassified-count gate in classify-lifecycle-phase.js.
  if (status == null) {
    return finalizePermit({
      phase: null,
      stalled: false,
      matchedStatus: null,
      matchedRule: 1,
      unmappedStatus: false,
    });
  }

  // Rule 2 — dead states. DEAD takes precedence over orphan: a permit
  // that is both is_orphan AND DEAD returns rule 2 (terminal authority).
  if (DEAD_STATUS_SET.has(status)) {
    return finalizePermit({
      phase: null,
      stalled: false,
      matchedStatus: status,
      matchedRule: 2,
      unmappedStatus: false,
    });
  }

  // Rule 3 — terminal P20 (closed).
  if (TERMINAL_P20_SET.has(status)) {
    return finalizePermit({
      phase: 'P20',
      stalled: false,
      matchedStatus: status,
      matchedRule: 3,
      unmappedStatus: false,
    });
  }

  // Rule 4 — wind-down P19.
  if (WINDDOWN_P19_SET.has(status)) {
    return finalizePermit({
      phase: 'P19',
      stalled: false,
      matchedStatus: status,
      matchedRule: 4,
      unmappedStatus: false,
    });
  }

  // Stalled modifier computed once — used by both orphan and BldLed branches.
  const stalled = computeStalled(input);

  // Rule 5 (sub-paths 5a/5b/5c) — orphan branch.
  if (input.is_orphan) {
    return classifyOrphan(input, status, stalled);
  }

  // Rules 6-15 — BldLed branch.
  return classifyBldLed(input, status, stalled);
}

// ─────────────────────────────────────────────────────────────────
// Orphan branch (O1, O2, O3)
// ─────────────────────────────────────────────────────────────────

function classifyOrphan(
  input: PermitClassifierInput,
  status: string | null,
  stalled: boolean,
): PermitClassifierResult {
  // Rule 5a — active statuses (Permit Issued / Inspection / Revision Issued / Revised) → O2 or O3.
  if (
    status === 'Permit Issued' ||
    status === 'Inspection' ||
    status === 'Revision Issued' ||
    status === 'Revised'
  ) {
    // O3 stalled check — long issue without any passed inspection.
    if (
      input.issued_date != null &&
      !input.has_passed_inspection
    ) {
      const daysSinceIssued = daysBetween(input.issued_date, input.now);
      const orphanStallDays = input.orphanStallDays ?? 180;
      if (daysSinceIssued > orphanStallDays) {
        return finalizePermit({
          phase: 'O3',
          stalled,
          matchedStatus: status,
          matchedRule: 5,
          unmappedStatus: false,
        });
      }
    }
    return finalizePermit({
      phase: 'O2',
      stalled,
      matchedStatus: status,
      matchedRule: 5,
      unmappedStatus: false,
    });
  }

  // Rule 5b — pre-issuance statuses (INTAKE / REVIEW / HOLD / READY) → O1.
  if (
    status != null &&
    (INTAKE_P3_SET.has(status) ||
      REVIEW_P4_SET.has(status) ||
      HOLD_P5_SET.has(status) ||
      READY_P6_SET.has(status))
  ) {
    return finalizePermit({
      phase: 'O1',
      stalled,
      matchedStatus: status,
      matchedRule: 5,
      unmappedStatus: false,
    });
  }

  // Rule 5c — orphan fallback. Any other status when is_orphan=true defaults to O1.
  // matchedStatus preserves the raw input (e.g., 'Forward to Inspector' on an orphan)
  // so the ledger lineage stays auditable. Independent CRIT 1 sub-path.
  return finalizePermit({
    phase: 'O1',
    stalled,
    matchedStatus: status,
    matchedRule: 5,
    unmappedStatus: false,
  });
}

// ─────────────────────────────────────────────────────────────────
// BLD-led branch (P3-P18)
// ─────────────────────────────────────────────────────────────────

function classifyBldLed(
  input: PermitClassifierInput,
  status: string | null,
  stalled: boolean,
): PermitClassifierResult {
  // Defensive: classifyBldLed is unreachable with status==null (caller handles
  // rule 1). Keep the guard as belt-and-suspenders — returns rule 1 shape.
  if (status == null) {
    return finalizePermit({
      phase: null,
      stalled: false,
      matchedStatus: null,
      matchedRule: 1,
      unmappedStatus: false,
    });
  }

  // Rule 6 — REVIEW_P4 (most specific first).
  if (REVIEW_P4_SET.has(status)) {
    return finalizePermit({ phase: 'P4', stalled, matchedStatus: status, matchedRule: 6, unmappedStatus: false });
  }
  // Rule 7 — HOLD_P5.
  if (HOLD_P5_SET.has(status)) {
    return finalizePermit({ phase: 'P5', stalled, matchedStatus: status, matchedRule: 7, unmappedStatus: false });
  }
  // Rule 8 — READY_P6.
  if (READY_P6_SET.has(status)) {
    return finalizePermit({ phase: 'P6', stalled, matchedStatus: status, matchedRule: 8, unmappedStatus: false });
  }
  // Rule 9 — INTAKE_P3 (CODE DRIFT §2.5.a rows 4/5/10 — out of I.1.1b scope).
  if (INTAKE_P3_SET.has(status)) {
    return finalizePermit({ phase: 'P3', stalled, matchedStatus: status, matchedRule: 9, unmappedStatus: false });
  }

  // Rule 11 — REVISION_P8 (includes Order Complied).
  if (REVISION_P8_SET.has(status)) {
    return finalizePermit({ phase: 'P8', stalled, matchedStatus: status, matchedRule: 11, unmappedStatus: false });
  }

  // Rule 10 — NOT_STARTED_P7D (CODE DRIFT §2.5.a rows 6/7 — out of I.1.1b scope).
  if (NOT_STARTED_P7D_SET.has(status)) {
    return finalizePermit({ phase: 'P7d', stalled, matchedStatus: status, matchedRule: 10, unmappedStatus: false });
  }

  // Rules 12/13 — Permit Issued: time-bucket (no passed inspection)
  // OR stage-mapped P9-P17 (passed inspection). matchedStatus is the raw
  // input 'Permit Issued' string (Spec 84 §3.7: raw status ALWAYS).
  if (status === 'Permit Issued') {
    if (input.has_passed_inspection) {
      if (input.latest_passed_stage != null) {
        const stageLower = String(input.latest_passed_stage).toLowerCase();
        const mapped = mapInspectionStageToPhase(stageLower);
        if (mapped) {
          // Rule 13 — Permit Issued + has_passed_inspection + stage maps → P9-P17.
          return finalizePermit({ phase: mapped, stalled, matchedStatus: status, matchedRule: 13, unmappedStatus: false });
        }
      }
      // Rule 14 — Permit Issued + has_passed_inspection but stage unmapped/null → P17 fallback.
      // (WF3 2026-04-23 B1-C3 rationale: a stage passed but didn't map, so the permit is at
      // Final Inspection — not the P18 "no stage yet" pipeline catchall.)
      return finalizePermit({ phase: 'P17', stalled, matchedStatus: status, matchedRule: 14, unmappedStatus: false });
    }
    // Rule 12 — Permit Issued + no passed inspection → P7a/P7b/P7c time-bucket.
    if (input.issued_date == null) {
      return finalizePermit({ phase: 'P7c', stalled, matchedStatus: status, matchedRule: 12, unmappedStatus: false });
    }
    const p7aMax = input.p7aMaxDays ?? 30;
    const p7bMax = input.p7bMaxDays ?? 90;
    const daysSinceIssued = daysBetween(input.issued_date, input.now);
    if (daysSinceIssued <= p7aMax) {
      return finalizePermit({ phase: 'P7a', stalled, matchedStatus: status, matchedRule: 12, unmappedStatus: false });
    }
    if (daysSinceIssued <= p7bMax) {
      return finalizePermit({ phase: 'P7b', stalled, matchedStatus: status, matchedRule: 12, unmappedStatus: false });
    }
    return finalizePermit({ phase: 'P7c', stalled, matchedStatus: status, matchedRule: 12, unmappedStatus: false });
  }

  // Rule 13 (continued) — status='Inspection' with stage mapping. matchedStatus = 'Inspection' (raw input).
  if (status === 'Inspection') {
    if (input.latest_passed_stage == null) {
      // No stage yet → P18 (inspection pipeline). matchedStatus = 'Inspection' raw.
      return finalizePermit({ phase: 'P18', stalled, matchedStatus: status, matchedRule: 14, unmappedStatus: false });
    }
    const stageLower = String(input.latest_passed_stage).toLowerCase();
    const mapped = mapInspectionStageToPhase(stageLower);
    if (mapped) {
      return finalizePermit({ phase: mapped, stalled, matchedStatus: status, matchedRule: 13, unmappedStatus: false });
    }
    return finalizePermit({ phase: 'P18', stalled, matchedStatus: status, matchedRule: 14, unmappedStatus: false });
  }

  // Rule 14 — INSPECTION_PIPELINE_P18 (Forward to Inspector, Rescheduled) → P18.
  if (INSPECTION_PIPELINE_P18_SET.has(status)) {
    return finalizePermit({ phase: 'P18', stalled, matchedStatus: status, matchedRule: 14, unmappedStatus: false });
  }

  // Rule 15 — catchall: status is non-null but matched no set above.
  // matchedStatus = the raw unmapped status (NOT null per Gemini CRIT fold) so
  // the ledger captures transitions INTO unmapped states. unmappedStatus=true.
  return finalizePermit({
    phase: null,
    stalled: false,
    matchedStatus: status,
    matchedRule: 15,
    unmappedStatus: true,
  });
}

// ─────────────────────────────────────────────────────────────────
// CoA classifier (P1, P2, null)
// ─────────────────────────────────────────────────────────────────

/**
 * Phase E.1 (84-W12) — REWRITTEN per Spec 42 §6.7 corrected 9-rule precedence.
 *
 * Bug 84-W12 root cause: pre-E.1 logic ignored `coa_applications.status` (read
 * only decision) AND short-circuited on `linked_permit_num`. Combined effect:
 * 99.4% of CoAs received `lifecycle_phase = NULL`. Spec 84 §2.5.f line 367
 * names Rule 0 (linked_permit_num short-circuit) as "THE 84-W12 root cause."
 *
 * New 9-rule precedence (top-down, first match wins) — see active_task.md.
 * Reordering: R1 (P20) > R2 (P19) > R3 (P4) > R4 (post-decision P3) > R5
 * (approved P3) > R6 (decision-deferred P2) > R7 (review P2) > R8 (intake P1)
 * > R9 (catchall P1 + unmapped flags).
 *
 * Stall: forced false for non-{P1, P2}. Rule 9 catchall DOES compute stall.
 *
 * Dual-code-path twin: scripts/lib/lifecycle-phase.js (Spec 84 §7).
 */
export function classifyCoaPhase(
  input: CoaClassifierInput,
): CoaClassifierResult {
  // Defensive guard — sentinel return for null / non-object input
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

  // Rule 1 — Terminal P20
  if (status != null && COA_TERMINAL_P20_STATUSES.has(status)) {
    return finalize({phase: 'P20', matchedRule: 1, matchedStatus: status,
                     unmappedStatus: false,
                     unmappedDecision: decision != null && !inAnyDecisionSet(decision),
                     input});
  }
  if (decision != null && NORMALIZED_P20_DECISIONS.has(decision)) {
    return finalize({phase: 'P20', matchedRule: 1,
                     matchedStatus: NORMALIZED_DECISION_TO_STATUS_MAP.get(decision) ?? null,
                     unmappedStatus: status != null && !inAnyStatusSet(status),
                     unmappedDecision: false,
                     input});
  }

  // Rule 2 — Terminal P19
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

  // Rule 3 — Final and Binding (P4)
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

  // Rule 4 — Post-decision (P3) — reordered above R5
  if (status != null && COA_POST_DECISION_STATUSES.has(status)) {
    return finalize({phase: 'P3', matchedRule: 4, matchedStatus: status,
                     unmappedStatus: false,
                     unmappedDecision: decision != null && !inAnyDecisionSet(decision),
                     input});
  }

  // Rule 5 — Approved (P3)
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

  // Rule 6 — Decision-deferred (P2) — reordered above R7
  if (isDeferredDecisionVariant(decision)) {
    const mapped = decision != null ? NORMALIZED_DECISION_TO_STATUS_MAP.get(decision) : undefined;
    return finalize({phase: 'P2', matchedRule: 6, matchedStatus: mapped ?? 'Deferred',
                     unmappedStatus: status != null && !inAnyStatusSet(status),
                     unmappedDecision: false,
                     input});
  }

  // Rule 7 — Review (P2)
  if (status != null && COA_REVIEW_STATUSES.has(status)) {
    return finalize({phase: 'P2', matchedRule: 7, matchedStatus: status,
                     unmappedStatus: false,
                     unmappedDecision: decision != null && !inAnyDecisionSet(decision),
                     input});
  }

  // Rule 8 — Intake (P1)
  if (status != null && COA_INTAKE_STATUSES.has(status)) {
    return finalize({phase: 'P1', matchedRule: 8, matchedStatus: status,
                     unmappedStatus: false,
                     unmappedDecision: decision != null && !inAnyDecisionSet(decision),
                     input});
  }

  // Rule 9 — Catchall (P1, unmapped flags set)
  return finalize({phase: 'P1', matchedRule: 9, matchedStatus: null,
                   unmappedStatus: status != null,
                   unmappedDecision: decision != null && !isDeferredDecisionVariant(decision),
                   input});
}

function inAnyStatusSet(status: string): boolean {
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

function inAnyDecisionSet(decision: string): boolean {
  return (
    NORMALIZED_P19_DECISIONS.has(decision) ||
    NORMALIZED_P20_DECISIONS.has(decision) ||
    NORMALIZED_FINAL_AND_BINDING_DECISIONS.has(decision) ||
    NORMALIZED_APPROVED_DECISIONS.has(decision) ||
    isDeferredDecisionVariant(decision)
  );
}

interface FinalizeArgs {
  phase: 'P1' | 'P2' | 'P3' | 'P4' | 'P19' | 'P20' | null;
  matchedRule: number;
  matchedStatus: string | null;
  unmappedStatus: boolean;
  unmappedDecision: boolean;
  input: CoaClassifierInput;
}

function finalize(args: FinalizeArgs): CoaClassifierResult {
  const {phase, matchedRule, matchedStatus, unmappedStatus, unmappedDecision, input} = args;
  const isInFlight = (phase === 'P1' || phase === 'P2');
  const stalled = isInFlight
    ? computeStallFromActivity(input.daysSinceActivity, input.stallThresholdDays)
    : false;
  return Object.freeze({phase, stalled, matchedStatus, matchedRule, unmappedStatus, unmappedDecision});
}

/**
 * Phase E.1 (84-W12) Same-Sprint Mitigation Option 2 — legacy adapter for v1
 * consumers that destructure only {phase, stalled} and assume phase ∈ {P1, P2, null}.
 *
 * **Preserves OLD RETURN SHAPE, NOT OLD BUGGY BEHAVIOR.** The buggy v1 mapping
 * (decision='Approved' → P2) was wrong — we are not preserving wrongness. The
 * adapter narrows P3/P4/P19/P20 → null so v1 consumers' switch statements
 * continue to write null for those cases (matching pre-E.1 production state)
 * until E.2 wires the full new shape.
 *
 * `scripts/classify-lifecycle-phase.js` uses this adapter until E.2 ships.
 */
export function classifyCoaPhaseLegacy(
  input: CoaClassifierInput,
): { phase: 'P1' | 'P2' | null; stalled: boolean } {
  const r = classifyCoaPhase(input);
  return {
    phase: (r.phase === 'P1' || r.phase === 'P2') ? r.phase : null,
    stalled: r.stalled,
  };
}

/**
 * Phase E.1 (84-W12) — Universal Stream catalog lookup. Pure function; catalog
 * passed in as pre-built Map (caller builds once at script startup in E.2).
 *
 * @param catalogByStatusSource — key = `${source}:${matchedStatus}`, value = catalog row.
 * @param matchedStatus — from classifyCoaPhase().matchedStatus / classifyLifecyclePhase output.
 *                        null/undefined returns null.
 * @param source — must match migration 128 CHECK: 'coa.status' | 'permits.status' | 'insp.stage'.
 *                 Callsite invariant: CoA classifier emits CoA-side matchedStatus → use 'coa.status'.
 *
 * Returns null when:
 *   1. matchedStatus is null/undefined (catchall rule 9 case → lifecycle_seq = NULL)
 *   2. catalog has no entry for the key (data drift)
 *   3. catalog row's `.phase` is non-standard (e.g., seq 35 'UNMAPPED→null',
 *      multi-value 'P7a/P7b/P7c'). Post-lookup phase validation; drives
 *      catalog_invalid_phase_count audit metric (7th metric in E.2).
 *
 * ⚠️ The returned `.phase` is the catalog's DESCRIPTIVE label and may contain
 *    multi-value strings (e.g., 'P7a/P7b/P7c (or P9-P17)') or sentinels.
 *    Use classifyCoaPhase().phase as the authoritative lifecycle_phase write target.
 *    Catalog `.phase` is for cross-reference / audit only.
 */
export function mapToUniversalStream(
  catalogByStatusSource: ReadonlyMap<string, UniversalStreamRow>,
  matchedStatus: string | null,
  source: UniversalStreamSource,
): Readonly<UniversalStreamRow> | null {
  if (matchedStatus == null) return null;
  if (!(catalogByStatusSource instanceof Map)) return null;
  const key = `${source}:${matchedStatus}`;
  const row = catalogByStatusSource.get(key);
  if (!row) return null;
  if (row.phase != null && !VALID_PHASES.has(row.phase)) {
    return null; // poisoned row → E.2 emits catalog_invalid_phase_count
  }
  return Object.freeze({...row});
}
