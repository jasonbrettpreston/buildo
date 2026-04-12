// 🔗 SPEC LINK: docs/reports/lifecycle_phase_implementation.md §1.1–§1.6
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

export interface PermitClassifierInput {
  status: string | null;
  enriched_status: string | null;
  issued_date: Date | null;
  is_orphan: boolean;
  latest_passed_stage: string | null;
  latest_inspection_date: Date | null;
  has_passed_inspection: boolean;
  /** Injected "now" for deterministic testing. Defaults to new Date() in callers. */
  now: Date;
}

export interface PermitClassifierResult {
  phase: string | null;
  stalled: boolean;
}

export interface CoaClassifierInput {
  decision: string | null;
  linked_permit_num: string | null;
  status: string | null;
}

export interface CoaClassifierResult {
  phase: 'P1' | 'P2' | null;
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
export const VALID_PHASES: ReadonlySet<string> = new Set([
  'P1', 'P2', 'P3', 'P4', 'P5', 'P6',
  'P7a', 'P7b', 'P7c', 'P7d',
  'P8', 'P9', 'P10', 'P11', 'P12', 'P13',
  'P14', 'P15', 'P16', 'P17', 'P18',
  'P19', 'P20',
  'O1', 'O2', 'O3', 'O4',
]);

/**
 * Trade → Target Phase mapping. Maps each of the 32 trade slugs to the
 * lifecycle phase where that trade becomes "active" on-site. The flight
 * tracker uses this to bridge calibration data (phase-to-phase medians)
 * to per-trade predictions. Dual code path: must match the JS version
 * in scripts/lib/lifecycle-phase.js.
 */
/** Bimodal trade target: bid_phase = when to start bidding, work_phase = when on-site. */
export interface TradeTarget {
  bid_phase: string;
  work_phase: string;
}

/**
 * Bimodal trade target mapping. Each trade has TWO windows:
 * bid_phase (get on the shortlist) and work_phase (boots on the ground).
 * Dual code path: must match scripts/lib/lifecycle-phase.js.
 */
export const TRADE_TARGET_PHASE: Readonly<Record<string, TradeTarget>> = Object.freeze({
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
});

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
]);

export const NORMALIZED_DEAD_DECISIONS: ReadonlySet<string> = new Set([
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

  // Signal 2: long-issued Permit Issued with no passed inspection
  if (
    input.status === 'Permit Issued' &&
    !input.has_passed_inspection &&
    input.issued_date != null
  ) {
    const daysSinceIssued = daysBetween(input.issued_date, input.now);
    if (daysSinceIssued > 730) return true;
  }

  // Signal 3: Inspection status with last inspection > 180 days old
  if (
    input.status === 'Inspection' &&
    input.latest_inspection_date != null
  ) {
    const daysSinceInspection = daysBetween(input.latest_inspection_date, input.now);
    if (daysSinceInspection > 180) return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────
// Main permit classifier
// ─────────────────────────────────────────────────────────────────

/**
 * Classify a single permit row into a lifecycle phase + stalled modifier.
 * Pure function — no DB, no throws. Deterministic.
 */
export function classifyLifecyclePhase(
  input: PermitClassifierInput,
): PermitClassifierResult {
  const status = normalizeStatus(input.status);

  // Step 0: null / empty status → always unclassified. These rows are
  // explicitly excluded from the CQA unclassified-count gate in
  // classify-lifecycle-phase.js, so we must not assign O1 via the
  // orphan fallback — doing so would diverge from the SQL reproducer
  // and contradict the spec's "status IS NULL" carve-out.
  if (status == null) {
    return { phase: null, stalled: false };
  }

  // Step 1: dead states (filter from feed)
  if (DEAD_STATUS_SET.has(status)) {
    return { phase: null, stalled: false };
  }

  // Step 2: terminal — P20 (closed) and P19 (wind-down)
  // Applied to both BLD-led and orphan paths before the orphan branch.
  if (TERMINAL_P20_SET.has(status)) {
    return { phase: 'P20', stalled: false };
  }
  if (WINDDOWN_P19_SET.has(status)) {
    return { phase: 'P19', stalled: false };
  }

  // Stalled modifier computed once — used by both orphan and BLD-led branches
  const stalled = computeStalled(input);

  // Step 3: orphan branch (simplified 4-phase)
  if (input.is_orphan) {
    return classifyOrphan(input, status, stalled);
  }

  // Step 4: BLD-led phase assignment
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
  // Active statuses — Permit Issued, Inspection, Revision Issued, Revised
  if (
    status === 'Permit Issued' ||
    status === 'Inspection' ||
    status === 'Revision Issued' ||
    status === 'Revised'
  ) {
    // O3 stalled check — long issue without any passed inspection
    if (
      input.issued_date != null &&
      !input.has_passed_inspection
    ) {
      const daysSinceIssued = daysBetween(input.issued_date, input.now);
      if (daysSinceIssued > 180) {
        return { phase: 'O3', stalled };
      }
    }
    return { phase: 'O2', stalled };
  }

  // Applied bucket — all pre-issuance statuses collapse to O1
  if (
    status != null &&
    (INTAKE_P3_SET.has(status) ||
      REVIEW_P4_SET.has(status) ||
      HOLD_P5_SET.has(status) ||
      READY_P6_SET.has(status))
  ) {
    return { phase: 'O1', stalled };
  }

  // Unknown orphan status — default to O1 (safer than null — orphan
  // pools tend to have real but weird statuses we haven't mapped)
  return { phase: 'O1', stalled };
}

// ─────────────────────────────────────────────────────────────────
// BLD-led branch (P3-P18)
// ─────────────────────────────────────────────────────────────────

function classifyBldLed(
  input: PermitClassifierInput,
  status: string | null,
  stalled: boolean,
): PermitClassifierResult {
  if (status == null) {
    return { phase: null, stalled: false };
  }

  // Pre-issuance phases (order matters — most specific first)
  if (REVIEW_P4_SET.has(status)) return { phase: 'P4', stalled };
  if (HOLD_P5_SET.has(status)) return { phase: 'P5', stalled };
  if (READY_P6_SET.has(status)) return { phase: 'P6', stalled };
  if (INTAKE_P3_SET.has(status)) return { phase: 'P3', stalled };

  // P8 — Revision/active catch-all (includes Order Complied gap status)
  if (REVISION_P8_SET.has(status)) return { phase: 'P8', stalled };

  // P7d — Not started flagged statuses
  if (NOT_STARTED_P7D_SET.has(status)) return { phase: 'P7d', stalled };

  // P7a/b/c — Permit Issued, time-bucketed, no passed inspection yet
  if (status === 'Permit Issued') {
    if (input.has_passed_inspection) {
      // Has passed inspection rows but status is still "Permit Issued" —
      // shouldn't usually happen but defend against it by routing to P18
      // (active construction, unknown sub-stage) since the permit has
      // real inspection activity.
      return { phase: 'P18', stalled };
    }
    if (input.issued_date == null) {
      return { phase: 'P7c', stalled };
    }
    const daysSinceIssued = daysBetween(input.issued_date, input.now);
    if (daysSinceIssued <= 30) return { phase: 'P7a', stalled };
    if (daysSinceIssued <= 90) return { phase: 'P7b', stalled };
    // P7c covers the 91-730 range AND the >730 range — stalled flag
    // disambiguates. Tests assert this behavior.
    return { phase: 'P7c', stalled };
  }

  // P9-P17/P18 — Inspection status, sub-stage mapped
  if (status === 'Inspection') {
    if (input.latest_passed_stage == null) {
      return { phase: 'P18', stalled };
    }
    const stageLower = String(input.latest_passed_stage).toLowerCase();
    const mapped = mapInspectionStageToPhase(stageLower);
    return { phase: mapped ?? 'P18', stalled };
  }

  // Gap statuses: Forward to Inspector, Rescheduled → P18 (inspection pipeline, no passed stage)
  if (INSPECTION_PIPELINE_P18_SET.has(status)) {
    return { phase: 'P18', stalled };
  }

  // Unknown status — safest fallback is null (unclassified)
  return { phase: null, stalled: false };
}

// ─────────────────────────────────────────────────────────────────
// CoA classifier (P1, P2, null)
// ─────────────────────────────────────────────────────────────────

/**
 * Classify a single CoA application row. Returns P1 (Variance Requested),
 * P2 (Variance Granted), or null (linked CoA or dead state).
 *
 * Linked CoAs return null because the lifecycle signal lives on the
 * linked permit, not on the CoA row. The feed SQL joins coa → permit
 * for those rows.
 */
export function classifyCoaPhase(
  input: CoaClassifierInput,
): CoaClassifierResult {
  // Linked CoAs don't carry their own phase — the permit does
  if (input.linked_permit_num != null && String(input.linked_permit_num).trim() !== '') {
    return { phase: null };
  }

  const normalized = normalizeCoaDecision(input.decision);

  // Dead-state decisions → null
  if (normalized != null && NORMALIZED_DEAD_DECISIONS.has(normalized)) {
    return { phase: null };
  }

  // Canonical approved → P2
  if (normalized != null && NORMALIZED_APPROVED_DECISIONS.has(normalized)) {
    return { phase: 'P2' };
  }

  // Everything else (null, deferred variants, postponed, garbage) → P1
  return { phase: 'P1' };
}
