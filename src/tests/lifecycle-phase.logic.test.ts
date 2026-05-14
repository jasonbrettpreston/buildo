// 🔗 SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3 (CoA-side phase emission rules) + Spec 42 §6.7 (9-rule precedence)
// 🔗 ACTIVE TASK: .cursor/active_task.md (WF1 Phase E.1 — bug 84-W12 fix + mapToUniversalStream + TS twin extension)
//
// Pure-function unit tests for the lifecycle phase classifier.
// Every branch in the decision tree (§1.1-§1.6 of the target spec) must
// have at least one test case. Coverage target: 100% branch coverage.
//
// Test strategy:
//   1. Phase coverage — one case per phase label (26 cases minimum)
//   2. Boundary cases — exact-day boundaries for P7a/b/c/stalled splits
//   3. Edge cases — null/empty/unknown/trailing-space handling
//   4. CoA cases — canonical approved set, dead set, deferred variants
//   5. Gap statuses — the 4 statuses State Verification found unhandled
//   6. Fuzzing — 1000 random inputs, 0 crashes, 0 out-of-range outputs
//   7. Cross-signal — stalled modifier vs phase primary

import { describe, test, expect } from 'vitest';
import {
  classifyLifecyclePhase,
  classifyCoaPhase,
  classifyCoaPhaseLegacy,
  mapToUniversalStream,
  normalizeCoaDecision,
  normalizeCoaStatus,
  isDeferredDecisionVariant,
  computeStallFromActivity,
  DEAD_STATUS_SET,
  TERMINAL_P20_SET,
  WINDDOWN_P19_SET,
  INTAKE_P3_SET,
  REVIEW_P4_SET,
  HOLD_P5_SET,
  READY_P6_SET,
  REVISION_P8_SET,
  NOT_STARTED_P7D_SET,
  NORMALIZED_APPROVED_DECISIONS,
  NORMALIZED_P19_DECISIONS,
  NORMALIZED_P20_DECISIONS,
  NORMALIZED_FINAL_AND_BINDING_DECISIONS,
  NORMALIZED_DEFERRED_DECISIONS,
  NORMALIZED_DECISION_TO_STATUS_MAP,
  COA_REVIEW_STATUSES,
  COA_INTAKE_STATUSES,
  COA_TERMINAL_P20_STATUSES,
  COA_TERMINAL_P19_STATUSES,
  COA_APPROVED_STATUSES,
  COA_FINAL_AND_BINDING_STATUSES,
  COA_POST_DECISION_STATUSES,
  VALID_PHASES,
  type UniversalStreamRow,
} from '@/lib/classification/lifecycle-phase';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
const NOW = new Date('2026-04-11T12:00:00Z');

function daysAgo(n: number): Date {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

interface PermitInput {
  status?: string | null;
  enriched_status?: string | null;
  issued_date?: Date | null;
  is_orphan?: boolean;
  latest_passed_stage?: string | null;
  latest_inspection_date?: Date | null;
  has_passed_inspection?: boolean;
  now?: Date;
}

function permit(overrides: PermitInput = {}) {
  return {
    status: null,
    enriched_status: null,
    issued_date: null,
    is_orphan: false,
    latest_passed_stage: null,
    latest_inspection_date: null,
    has_passed_inspection: false,
    now: NOW,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════
// Section A — Dead states (phase = null)
// ═════════════════════════════════════════════════════════════════
describe('classifyLifecyclePhase — dead states', () => {
  const deadStatuses = [
    'Cancelled', 'Revoked', 'Permit Revoked',
    'Refused', 'Refusal Notice',
    'Application Withdrawn', 'Abandoned',
    'Not Accepted', 'Work Suspended',
    'VIOLATION', 'Order Issued',
    'Tenant Notice Period', 'Follow-up Required',
  ];

  for (const status of deadStatuses) {
    test(`${status} returns phase=null`, () => {
      const result = classifyLifecyclePhase(permit({ status }));
      expect(result.phase).toBeNull();
      expect(result.stalled).toBe(false);
    });
  }
});

// ═════════════════════════════════════════════════════════════════
// Section B — Terminal states (P19, P20)
// ═════════════════════════════════════════════════════════════════
describe('classifyLifecyclePhase — terminal states', () => {
  test.each(['Closed', 'File Closed', 'Permit Issued/Close File'])(
    '%s → P20',
    (status) => {
      const result = classifyLifecyclePhase(permit({ status }));
      expect(result.phase).toBe('P20');
    },
  );

  test.each([
    'Pending Closed',
    'Pending Cancellation',
    'Revocation Pending',
    'Revocation Notice Sent',
  ])('%s → P19', (status) => {
    const result = classifyLifecyclePhase(permit({ status }));
    expect(result.phase).toBe('P19');
  });
});

// ═════════════════════════════════════════════════════════════════
// Section C — Orphan branch (O1, O2, O3, O4)
// ═════════════════════════════════════════════════════════════════
describe('classifyLifecyclePhase — orphan branch', () => {
  test('O1 — orphan with intake-status', () => {
    const result = classifyLifecyclePhase(
      permit({ status: 'Under Review', is_orphan: true }),
    );
    expect(result.phase).toBe('O1');
  });

  test('O1 — orphan with Application Received', () => {
    const result = classifyLifecyclePhase(
      permit({ status: 'Application Received', is_orphan: true }),
    );
    expect(result.phase).toBe('O1');
  });

  test('O1 — orphan with Ready for Issuance', () => {
    const result = classifyLifecyclePhase(
      permit({ status: 'Ready for Issuance', is_orphan: true }),
    );
    expect(result.phase).toBe('O1');
  });

  test('O2 — orphan with Permit Issued, fresh', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Permit Issued',
        issued_date: daysAgo(30),
        is_orphan: true,
      }),
    );
    expect(result.phase).toBe('O2');
  });

  test('O2 — orphan with Inspection status', () => {
    const result = classifyLifecyclePhase(
      permit({ status: 'Inspection', is_orphan: true }),
    );
    expect(result.phase).toBe('O2');
  });

  test('O3 — orphan Permit Issued, 200 days old, no inspections', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Permit Issued',
        issued_date: daysAgo(200),
        is_orphan: true,
        has_passed_inspection: false,
      }),
    );
    expect(result.phase).toBe('O3');
  });

  test('O2 not O3 — orphan Permit Issued, 200 days old, HAS passed inspection', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Permit Issued',
        issued_date: daysAgo(200),
        is_orphan: true,
        has_passed_inspection: true,
      }),
    );
    expect(result.phase).toBe('O2');
  });

  test('O1 boundary — orphan at exactly 180 days with no inspections still O2', () => {
    // Rule is strictly > 180
    const result = classifyLifecyclePhase(
      permit({
        status: 'Permit Issued',
        issued_date: daysAgo(180),
        is_orphan: true,
      }),
    );
    expect(result.phase).toBe('O2');
  });

  test('O3 boundary — orphan at 181 days with no inspections is O3', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Permit Issued',
        issued_date: daysAgo(181),
        is_orphan: true,
      }),
    );
    expect(result.phase).toBe('O3');
  });

  test('P20 not O4 — orphan Closed still returns P20 (shared terminal handling)', () => {
    // Terminal states are checked BEFORE the orphan branch, so orphans
    // with Closed status return P20 directly, not O4.
    const result = classifyLifecyclePhase(
      permit({ status: 'Closed', is_orphan: true }),
    );
    expect(result.phase).toBe('P20');
  });

  test('null not dead — orphan Cancelled returns null (dead check first)', () => {
    const result = classifyLifecyclePhase(
      permit({ status: 'Cancelled', is_orphan: true }),
    );
    expect(result.phase).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════
// Section D — BLD-led pre-issuance phases (P3, P4, P5, P6, P7d, P8)
// ═════════════════════════════════════════════════════════════════
describe('classifyLifecyclePhase — pre-issuance phases', () => {
  test.each([
    'Application Received',
    'Application Acceptable',
    'Plan Review Complete',
    'Open',
    'Active',
    'Request Received',
  ])('%s → P3 (Intake)', (status) => {
    const result = classifyLifecyclePhase(permit({ status }));
    expect(result.phase).toBe('P3');
  });

  test.each([
    'Under Review',
    'Examination',
    "Examiner's Notice Sent",
    'Consultation Completed',
  ])('%s → P4 (Under Review)', (status) => {
    const result = classifyLifecyclePhase(permit({ status }));
    expect(result.phase).toBe('P4');
  });

  test('Trailing-space "Under Review " still → P4', () => {
    // Real DB has this exact trailing-space variant
    const result = classifyLifecyclePhase(permit({ status: 'Under Review ' }));
    expect(result.phase).toBe('P4');
  });

  test.each([
    'Application On Hold',
    'Application on Hold', // lowercase variant from the DB
    'Deficiency Notice Issued',
    'Response Received',
    'Pending Parent Folder Review',
  ])('%s → P5 (On Hold)', (status) => {
    const result = classifyLifecyclePhase(permit({ status }));
    expect(result.phase).toBe('P5');
  });

  test.each([
    'Ready for Issuance',
    'Forwarded for Issuance',
    'Issuance Pending',
    'Approved',
    'Agreement in Progress',
    'Licence Issued',
  ])('%s → P6 (Ready to Issue)', (status) => {
    const result = classifyLifecyclePhase(permit({ status }));
    expect(result.phase).toBe('P6');
  });

  test.each([
    'Work Not Started',
    'Not Started',
    'Not Started - Express',
    'Extension Granted',
    'Extension in Progress',
  ])('%s → P7d (Not Started flagged)', (status) => {
    const result = classifyLifecyclePhase(permit({ status }));
    expect(result.phase).toBe('P7d');
  });

  test.each(['Revision Issued', 'Revised'])('%s → P8', (status) => {
    const result = classifyLifecyclePhase(permit({ status }));
    expect(result.phase).toBe('P8');
  });
});

// ═════════════════════════════════════════════════════════════════
// Section E — Gap statuses found during State Verification
// ═════════════════════════════════════════════════════════════════
describe('classifyLifecyclePhase — gap statuses from State Verification', () => {
  test('Forward to Inspector → P18 (construction active, routed to inspector)', () => {
    const result = classifyLifecyclePhase(
      permit({ status: 'Forward to Inspector' }),
    );
    expect(result.phase).toBe('P18');
  });

  test('Inspection Request to Cancel → P19 (wind-down)', () => {
    const result = classifyLifecyclePhase(
      permit({ status: 'Inspection Request to Cancel' }),
    );
    expect(result.phase).toBe('P19');
  });

  test('Order Complied → P8 (active, order resolved)', () => {
    // 22 rows in live DB. Permits where a violation order was complied with.
    // The permit is back to normal, so routed to P8 (revision/active catch-all).
    const result = classifyLifecyclePhase(permit({ status: 'Order Complied' }));
    expect(result.phase).toBe('P8');
  });

  test('Rescheduled → P18 (inspection pipeline)', () => {
    const result = classifyLifecyclePhase(permit({ status: 'Rescheduled' }));
    expect(result.phase).toBe('P18');
  });
});

// ═════════════════════════════════════════════════════════════════
// Section F — P7a/b/c time-bucket split
// ═════════════════════════════════════════════════════════════════
describe('classifyLifecyclePhase — P7 age buckets', () => {
  test('P7a — issued 15 days ago, no inspections', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Permit Issued',
        issued_date: daysAgo(15),
        has_passed_inspection: false,
      }),
    );
    expect(result.phase).toBe('P7a');
    expect(result.stalled).toBe(false);
  });

  test('P7a boundary — issued exactly 30 days ago still P7a', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Permit Issued',
        issued_date: daysAgo(30),
        has_passed_inspection: false,
      }),
    );
    expect(result.phase).toBe('P7a');
  });

  test('P7b — issued 31 days ago', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Permit Issued',
        issued_date: daysAgo(31),
        has_passed_inspection: false,
      }),
    );
    expect(result.phase).toBe('P7b');
  });

  test('P7b boundary — issued exactly 90 days ago still P7b', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Permit Issued',
        issued_date: daysAgo(90),
        has_passed_inspection: false,
      }),
    );
    expect(result.phase).toBe('P7b');
  });

  test('P7c — issued 91 days ago', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Permit Issued',
        issued_date: daysAgo(91),
        has_passed_inspection: false,
      }),
    );
    expect(result.phase).toBe('P7c');
    expect(result.stalled).toBe(false);
  });

  test('P7c boundary — issued exactly 730 days ago still P7c (not stalled yet)', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Permit Issued',
        issued_date: daysAgo(730),
        has_passed_inspection: false,
      }),
    );
    expect(result.phase).toBe('P7c');
    expect(result.stalled).toBe(false);
  });

  test('P7c + stalled — issued 731 days ago, no inspections', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Permit Issued',
        issued_date: daysAgo(731),
        has_passed_inspection: false,
      }),
    );
    expect(result.phase).toBe('P7c');
    expect(result.stalled).toBe(true);
  });

  test('P7c NULL issued_date fallback', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Permit Issued',
        issued_date: null,
        has_passed_inspection: false,
      }),
    );
    expect(result.phase).toBe('P7c');
  });
});

// ═════════════════════════════════════════════════════════════════
// Section G — Active construction sub-stages (P9-P17, P18)
// ═════════════════════════════════════════════════════════════════
describe('classifyLifecyclePhase — active construction', () => {
  test('P18 — status=Inspection, no inspection data', () => {
    const result = classifyLifecyclePhase(
      permit({ status: 'Inspection', latest_passed_stage: null }),
    );
    expect(result.phase).toBe('P18');
  });

  test('P9 — latest passed Excavation/Shoring', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Inspection',
        latest_passed_stage: 'Excavation/Shoring',
      }),
    );
    expect(result.phase).toBe('P9');
  });

  test('P9 — latest passed Site Grading Inspection', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Inspection',
        latest_passed_stage: 'Site Grading Inspection',
      }),
    );
    expect(result.phase).toBe('P9');
  });

  test('P9 — latest passed Demolition', () => {
    const result = classifyLifecyclePhase(
      permit({ status: 'Inspection', latest_passed_stage: 'Demolition' }),
    );
    expect(result.phase).toBe('P9');
  });

  test('P10 — latest passed Footings/Foundations', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Inspection',
        latest_passed_stage: 'Footings/Foundations',
      }),
    );
    expect(result.phase).toBe('P10');
  });

  test('P11 — latest passed Structural Framing', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Inspection',
        latest_passed_stage: 'Structural Framing',
      }),
    );
    expect(result.phase).toBe('P11');
  });

  test('P12 — latest passed HVAC/Extraction Rough-in', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Inspection',
        latest_passed_stage: 'HVAC/Extraction Rough-in',
      }),
    );
    expect(result.phase).toBe('P12');
  });

  test('P12 — latest passed Fire Protection Systems', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Inspection',
        latest_passed_stage: 'Fire Protection Systems',
      }),
    );
    expect(result.phase).toBe('P12');
  });

  test('P12 — latest passed Drain/Waste/Vents', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Inspection',
        latest_passed_stage: 'Drain/Waste/Vents',
      }),
    );
    expect(result.phase).toBe('P12');
  });

  test('P13 — latest passed Insulation/Vapour Barrier', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Inspection',
        latest_passed_stage: 'Insulation/Vapour Barrier',
      }),
    );
    expect(result.phase).toBe('P13');
  });

  test('P14 — latest passed Fire Separations', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Inspection',
        latest_passed_stage: 'Fire Separations',
      }),
    );
    expect(result.phase).toBe('P14');
  });

  test('P15 — latest passed Interior Final Inspection', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Inspection',
        latest_passed_stage: 'Interior Final Inspection',
      }),
    );
    expect(result.phase).toBe('P15');
  });

  test('P15 — latest passed Plumbing Final', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Inspection',
        latest_passed_stage: 'Plumbing Final',
      }),
    );
    expect(result.phase).toBe('P15');
  });

  test('P15 — latest passed HVAC Final', () => {
    const result = classifyLifecyclePhase(
      permit({ status: 'Inspection', latest_passed_stage: 'HVAC Final' }),
    );
    expect(result.phase).toBe('P15');
  });

  test('P16 — latest passed Exterior Final Inspection', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Inspection',
        latest_passed_stage: 'Exterior Final Inspection',
      }),
    );
    expect(result.phase).toBe('P16');
  });

  test('P17 — latest passed Occupancy', () => {
    const result = classifyLifecyclePhase(
      permit({ status: 'Inspection', latest_passed_stage: 'Occupancy' }),
    );
    expect(result.phase).toBe('P17');
  });

  test('P17 — latest passed Final Inspection', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Inspection',
        latest_passed_stage: 'Final Inspection',
      }),
    );
    expect(result.phase).toBe('P17');
  });

  test('P18 — unknown stage_name falls through', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Inspection',
        latest_passed_stage: 'Change of Use', // real DB value, unmapped
      }),
    );
    expect(result.phase).toBe('P18');
  });
});

// ═════════════════════════════════════════════════════════════════
// Section H — Stalled modifier (orthogonal to phase)
// ═════════════════════════════════════════════════════════════════
describe('classifyLifecyclePhase — stalled modifier', () => {
  test('stalled=true when enriched_status=Stalled', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Inspection',
        enriched_status: 'Stalled',
        latest_passed_stage: 'Structural Framing',
      }),
    );
    expect(result.phase).toBe('P11'); // primary phase preserved
    expect(result.stalled).toBe(true); // overlay applied
  });

  test('stalled=true on long-issued no-inspection Permit Issued', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Permit Issued',
        issued_date: daysAgo(800),
        has_passed_inspection: false,
      }),
    );
    expect(result.phase).toBe('P7c');
    expect(result.stalled).toBe(true);
  });

  test('stalled=true on Inspection with 200d-old latest inspection', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Inspection',
        latest_passed_stage: 'Structural Framing',
        latest_inspection_date: daysAgo(200),
        has_passed_inspection: true,
      }),
    );
    expect(result.phase).toBe('P11');
    expect(result.stalled).toBe(true);
  });

  test('stalled=false on fresh Permit Issued', () => {
    const result = classifyLifecyclePhase(
      permit({
        status: 'Permit Issued',
        issued_date: daysAgo(15),
        has_passed_inspection: false,
      }),
    );
    expect(result.stalled).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════
// Section I — Edge cases (null, empty, unknown)
// ═════════════════════════════════════════════════════════════════
describe('classifyLifecyclePhase — edge cases', () => {
  test('null status returns null phase', () => {
    const result = classifyLifecyclePhase(permit({ status: null }));
    expect(result.phase).toBeNull();
  });

  test('empty string status returns null phase', () => {
    const result = classifyLifecyclePhase(permit({ status: '' }));
    expect(result.phase).toBeNull();
  });

  test('whitespace-only status returns null phase', () => {
    const result = classifyLifecyclePhase(permit({ status: '   ' }));
    expect(result.phase).toBeNull();
  });

  test('unknown status "Foo Bar" returns null phase', () => {
    const result = classifyLifecyclePhase(permit({ status: 'Foo Bar Unknown' }));
    expect(result.phase).toBeNull();
  });

  test('orphan with unknown status defaults to O1', () => {
    const result = classifyLifecyclePhase(
      permit({ status: 'Foo Bar', is_orphan: true }),
    );
    expect(result.phase).toBe('O1');
  });
});

// ═════════════════════════════════════════════════════════════════
// Section J — Constant set integrity
// ═════════════════════════════════════════════════════════════════
describe('Constant sets — integrity', () => {
  test('DEAD_STATUS_SET contains all dead statuses', () => {
    expect(DEAD_STATUS_SET.has('Cancelled')).toBe(true);
    expect(DEAD_STATUS_SET.has('Revoked')).toBe(true);
    expect(DEAD_STATUS_SET.has('VIOLATION')).toBe(true);
    expect(DEAD_STATUS_SET.has('Permit Issued')).toBe(false);
  });

  test('TERMINAL_P20_SET covers Closed + variants', () => {
    expect(TERMINAL_P20_SET.has('Closed')).toBe(true);
    expect(TERMINAL_P20_SET.has('File Closed')).toBe(true);
    expect(TERMINAL_P20_SET.has('Permit Issued/Close File')).toBe(true);
  });

  test('sets are disjoint (no status in two different sets)', () => {
    const sets = [
      ['DEAD', DEAD_STATUS_SET],
      ['P20', TERMINAL_P20_SET],
      ['P19', WINDDOWN_P19_SET],
      ['P3', INTAKE_P3_SET],
      ['P4', REVIEW_P4_SET],
      ['P5', HOLD_P5_SET],
      ['P6', READY_P6_SET],
      ['P8', REVISION_P8_SET],
      ['P7d', NOT_STARTED_P7D_SET],
    ] as const;

    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        const pairA = sets[i]!;
        const pairB = sets[j]!;
        const [nameA, setA] = pairA;
        const [nameB, setB] = pairB;
        for (const item of setA) {
          if (setB.has(item)) {
            throw new Error(
              `Status "${item}" is in both ${nameA} and ${nameB} sets`,
            );
          }
        }
      }
    }
  });

  test('VALID_PHASES covers all expected values (WF3-04: O4 phantom removed)', () => {
    // WF3-04 (H-W14 / 84-W10): O4 is a phantom phase — listed in
    // VALID_PHASES but no classifier rule produces it. Removed.
    const expected = [
      'P1', 'P2', 'P3', 'P4', 'P5', 'P6',
      'P7a', 'P7b', 'P7c', 'P7d',
      'P8', 'P9', 'P10', 'P11', 'P12', 'P13',
      'P14', 'P15', 'P16', 'P17', 'P18',
      'P19', 'P20',
      'O1', 'O2', 'O3',
    ];
    for (const phase of expected) {
      expect(VALID_PHASES.has(phase)).toBe(true);
    }
    expect(VALID_PHASES.has('O4')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════
// Section K — CoA classifier (P1, P2, null)
// ═════════════════════════════════════════════════════════════════
interface CoaInput {
  decision?: string | null;
  linked_permit_num?: string | null;
  status?: string | null;
  daysSinceActivity?: number | null;
  stallThresholdDays?: number | null;
}

function coa(overrides: CoaInput = {}) {
  return {
    decision: null,
    linked_permit_num: null,
    status: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────
// Phase E.1 (84-W12) — 22-status × 7-decision matrix
// Spec 84 §2.5.c canonical statuses + expected (phase, rule) per the
// 9-rule precedence. Source-of-truth for test #1 + regression for
// "rule 9 never fires when status is canonical and decision is null".
// ─────────────────────────────────────────────────────────────────

interface ExpectedPhaseRule { phase: string; rule: number; }

const STATUS_EXPECTATIONS: ReadonlyArray<readonly [string, ExpectedPhaseRule]> = Object.freeze([
  // Intake → P1 (rule 8)
  ['Application Received',     { phase: 'P1', rule: 8 }],
  ['Accepted',                 { phase: 'P1', rule: 8 }],
  // Review → P2 (rule 7)
  ['Prepare Notice',           { phase: 'P2', rule: 7 }],
  ['Notice Prepared',          { phase: 'P2', rule: 7 }],
  ['Tentatively Scheduled',    { phase: 'P2', rule: 7 }],
  ['Hearing Scheduled',        { phase: 'P2', rule: 7 }],
  ['Hearing Rescheduled',      { phase: 'P2', rule: 7 }],
  ['Postponed',                { phase: 'P2', rule: 7 }],
  ['Deferred',                 { phase: 'P2', rule: 7 }],
  // Approved → P3 (rule 5)
  ['Conditional Consent',      { phase: 'P3', rule: 5 }],
  ['Approved',                 { phase: 'P3', rule: 5 }],
  ['Approved with Conditions', { phase: 'P3', rule: 5 }],
  // Refused → P19 (rule 2)
  ['Refused',                  { phase: 'P19', rule: 2 }],
  // Final and Binding → P4 (rule 3)
  ['Final and Binding',        { phase: 'P4', rule: 3 }],
  // Post-decision → P3 (rule 4)
  ['Await Expiry Date',        { phase: 'P3', rule: 4 }],
  ['Appealed',                 { phase: 'P3', rule: 4 }],
  ['TLAB Appeal',              { phase: 'P3', rule: 4 }],
  ['OMB Appeal',               { phase: 'P3', rule: 4 }],
  // Terminal P19 status (refused/withdrawn/cancelled)
  ['Application Withdrawn',    { phase: 'P19', rule: 2 }],
  ['Cancelled',                { phase: 'P19', rule: 2 }],
  // Terminal P20 (closed)
  ['Closed',                   { phase: 'P20', rule: 1 }],
  ['Complete',                 { phase: 'P20', rule: 1 }],
]);

describe('classifyCoaPhase — Phase E.1 bug 84-W12 fix', () => {
  // ─────────────────────────────────────────────────────────────
  // Test #1: 22-status regression (decision=null) — Appendix A in plan
  // Catches v1 bug: rule 9 catchall must NEVER fire for any canonical status.
  // ─────────────────────────────────────────────────────────────
  describe('22 canonical status values map to expected (phase, rule)', () => {
    for (const [status, expected] of STATUS_EXPECTATIONS) {
      test(`status='${status}' + decision=null → ${expected.phase} (rule ${expected.rule})`, () => {
        const r = classifyCoaPhase(coa({ status, decision: null }));
        expect(r.phase).toBe(expected.phase);
        expect(r.matchedRule).toBe(expected.rule);
        expect(r.unmappedStatus).toBe(false);
        expect(r.matchedRule).not.toBe(9); // explicit anti-catchall regression
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Test #2: Decision-only matrix (status=null × 9 decisions)
  // ─────────────────────────────────────────────────────────────
  describe('decision-only paths (status=null)', () => {
    test.each([
      [null,                       'P1',  9],   // catchall (no inputs)
      ['Approved',                 'P3',  5],
      ['Approved With Conditions', 'P3',  5],
      ['Final and Binding',        'P4',  3],
      ['Refused',                  'P19', 2],
      ['Deferred',                 'P2',  6],
      ['closed',                   'P20', 1],
      ['conditional consent',      'P3',  5],
      // Date-stamped Deferred variant (v4 fold: Rule 6 hardcoded fallback)
      ['Deferred Aug 18, 2016 (Orig Mark Kehler)', 'P2', 6],
    ])('decision="%s" → %s (rule %d)', (decision, expectedPhase, expectedRule) => {
      const r = classifyCoaPhase(coa({ status: null, decision }));
      expect(r.phase).toBe(expectedPhase);
      expect(r.matchedRule).toBe(expectedRule);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Test #3: Precedence tiebreaker tests (7 cases)
  // ─────────────────────────────────────────────────────────────
  describe('precedence tiebreakers', () => {
    test("decision='Approved' + status='Hearing Scheduled' → rule 5 wins (P3, status-driven)", () => {
      const r = classifyCoaPhase(coa({ status: 'Hearing Scheduled', decision: 'Approved' }));
      // R5 fires status-side first (status IN COA_APPROVED_STATUSES? No → fall through to decision-side)
      // But status='Hearing Scheduled' is in COA_REVIEW_STATUSES (R7) — would fire R7 if R5 decision-side didn't fire first.
      // R5 decision-side fires BEFORE R7 status-side → R5 wins.
      expect(r.phase).toBe('P3');
      expect(r.matchedRule).toBe(5);
    });

    test("status='Final and Binding' + decision='Approved' → rule 3 wins (P4)", () => {
      const r = classifyCoaPhase(coa({ status: 'Final and Binding', decision: 'Approved' }));
      expect(r.phase).toBe('P4');
      expect(r.matchedRule).toBe(3);
    });

    test("status='Refused' + decision=null → rule 2 wins (P19) — v1 bug regression", () => {
      const r = classifyCoaPhase(coa({ status: 'Refused', decision: null }));
      expect(r.phase).toBe('P19');
      expect(r.matchedRule).toBe(2);
    });

    test("status='Closed' + decision='Approved' → rule 1 wins (P20, terminal overrides approval)", () => {
      const r = classifyCoaPhase(coa({ status: 'Closed', decision: 'Approved' }));
      expect(r.phase).toBe('P20');
      expect(r.matchedRule).toBe(1);
    });

    test("status='Appealed' + decision='Approved' → rule 4 wins (P3, post-decision more recent than approval)", () => {
      const r = classifyCoaPhase(coa({ status: 'Appealed', decision: 'Approved' }));
      expect(r.phase).toBe('P3');
      expect(r.matchedRule).toBe(4);
    });

    test("status='Hearing Scheduled' + decision='Deferred' → rule 6 wins (P2, decision more authoritative)", () => {
      const r = classifyCoaPhase(coa({ status: 'Hearing Scheduled', decision: 'Deferred' }));
      expect(r.phase).toBe('P2');
      expect(r.matchedRule).toBe(6);
      expect(r.matchedStatus).toBe('Deferred');
    });

    test("decision='deferred but refused' → rule 6 wins (P2) — startsWith catches it; negative guard only blocks exact-match variants", () => {
      // The isDeferredDecisionVariant negative guard rejects only EXACT matches
      // in NORMALIZED_P19_DECISIONS / P20 / Approved / FaB. 'deferred but refused'
      // is not exact-match in any other set, so startsWith('deferred ') triggers
      // rule 6 (P2 + matchedStatus='Deferred'). Documents current behavior; if
      // operators want this routed differently (e.g., to P19 via substring match),
      // that is an E.2+ design discussion.
      const r = classifyCoaPhase(coa({ status: null, decision: 'deferred but refused' }));
      expect(r.phase).toBe('P2');
      expect(r.matchedRule).toBe(6);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Test #4: Normalization edge cases
  // ─────────────────────────────────────────────────────────────
  describe('normalization', () => {
    test("status='  Hearing Scheduled  ' (whitespace) → trimmed, rule 7 → P2", () => {
      const r = classifyCoaPhase(coa({ status: '  Hearing Scheduled  ', decision: null }));
      expect(r.phase).toBe('P2');
      expect(r.matchedRule).toBe(7);
      expect(r.matchedStatus).toBe('Hearing Scheduled');
    });

    test("status='' (empty) → normalized to null → rule 9 catchall", () => {
      const r = classifyCoaPhase(coa({ status: '', decision: null }));
      expect(r.phase).toBe('P1');
      expect(r.matchedRule).toBe(9);
      expect(r.matchedStatus).toBeNull();
      expect(r.unmappedStatus).toBe(false); // status was empty, normalized to null
    });

    test("decision='FINAL AND BINDING' (uppercase) → normalized, rule 3 → P4", () => {
      const r = classifyCoaPhase(coa({ status: null, decision: 'FINAL AND BINDING' }));
      expect(r.phase).toBe('P4');
      expect(r.matchedRule).toBe(3);
      expect(r.matchedStatus).toBe('Final and Binding');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Test #5/6: Stall behavior — in-flight + forced-false
  // ─────────────────────────────────────────────────────────────
  describe('stall detection', () => {
    test('stall-in-catchall: rule 9 P1 still computes stall', () => {
      const r = classifyCoaPhase(coa({
        status: 'UNRECOGNIZED_STATUS_XYZ',
        decision: null,
        daysSinceActivity: 100,
        stallThresholdDays: 30,
      }));
      expect(r.phase).toBe('P1');
      expect(r.matchedRule).toBe(9);
      expect(r.unmappedStatus).toBe(true);
      expect(r.stalled).toBe(true);
    });

    test("stalled=false for P20 (status='Closed', large daysSinceActivity)", () => {
      const r = classifyCoaPhase(coa({
        status: 'Closed', decision: null,
        daysSinceActivity: 10000, stallThresholdDays: 30,
      }));
      expect(r.phase).toBe('P20');
      expect(r.stalled).toBe(false);
    });

    test("stalled=false for P3 (status='Approved', large daysSinceActivity)", () => {
      const r = classifyCoaPhase(coa({
        status: 'Approved', decision: null,
        daysSinceActivity: 10000, stallThresholdDays: 30,
      }));
      expect(r.phase).toBe('P3');
      expect(r.stalled).toBe(false);
    });

    test("stalled=false for P19 (status='Refused', large daysSinceActivity)", () => {
      const r = classifyCoaPhase(coa({
        status: 'Refused', decision: null,
        daysSinceActivity: 10000, stallThresholdDays: 30,
      }));
      expect(r.phase).toBe('P19');
      expect(r.stalled).toBe(false);
    });

    test('null daysSinceActivity + threshold=30 → stalled=false (no crash)', () => {
      const r = classifyCoaPhase(coa({
        status: 'Hearing Scheduled',
        decision: null,
        daysSinceActivity: null,
        stallThresholdDays: 30,
      }));
      expect(r.stalled).toBe(false);
    });

    test('P1 stalls when daysSinceActivity > threshold', () => {
      const r = classifyCoaPhase(coa({
        status: 'Application Received',
        decision: null,
        daysSinceActivity: 35, stallThresholdDays: 30,
      }));
      expect(r.phase).toBe('P1');
      expect(r.stalled).toBe(true);
    });

    test('P2 stalls when daysSinceActivity > threshold', () => {
      const r = classifyCoaPhase(coa({
        status: 'Hearing Scheduled', decision: null,
        daysSinceActivity: 45, stallThresholdDays: 30,
      }));
      expect(r.phase).toBe('P2');
      expect(r.stalled).toBe(true);
    });

    test('days === threshold is NOT stalled (strict greater-than)', () => {
      const r = classifyCoaPhase(coa({
        status: 'Application Received', decision: null,
        daysSinceActivity: 30, stallThresholdDays: 30,
      }));
      expect(r.stalled).toBe(false);
    });

    test('zero threshold → stalled=false (feature off)', () => {
      const r = classifyCoaPhase(coa({
        status: 'Application Received', decision: null,
        daysSinceActivity: 100, stallThresholdDays: 0,
      }));
      expect(r.stalled).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Test #7: Two-flow regression — Rule 0 removal validation
  // ─────────────────────────────────────────────────────────────
  describe('two-flow regression (Spec 42 §6.6.X)', () => {
    test("linked CoA + status='Hearing Scheduled' → P2 (NOT null, Rule 0 removed)", () => {
      const r = classifyCoaPhase(coa({
        linked_permit_num: 'PERM12345',
        status: 'Hearing Scheduled',
        decision: null,
      }));
      expect(r.phase).toBe('P2');
    });

    test("unlinked CoA + status='Hearing Scheduled' → P2 (same result, flow irrelevant)", () => {
      const r = classifyCoaPhase(coa({
        linked_permit_num: null,
        status: 'Hearing Scheduled',
        decision: null,
      }));
      expect(r.phase).toBe('P2');
    });

    test("linked CoA + status='Approved' → P3 (was null under buggy v1)", () => {
      const r = classifyCoaPhase(coa({
        linked_permit_num: 'PERM12345',
        status: 'Approved',
        decision: null,
      }));
      expect(r.phase).toBe('P3');
      expect(r.matchedRule).toBe(5);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Test #8: NORMALIZED_DECISION_TO_STATUS_MAP completeness
  // Every key in the union of decision sets must have a map entry;
  // every map value must map to a canonical CoA status.
  // ─────────────────────────────────────────────────────────────
  describe('NORMALIZED_DECISION_TO_STATUS_MAP completeness', () => {
    test('every key in P19/P20/FaB/Approved/Deferred decision sets is in the map', () => {
      const allDecisions = new Set<string>([
        ...NORMALIZED_P19_DECISIONS,
        ...NORMALIZED_P20_DECISIONS,
        ...NORMALIZED_FINAL_AND_BINDING_DECISIONS,
        ...NORMALIZED_APPROVED_DECISIONS,
        ...NORMALIZED_DEFERRED_DECISIONS,
      ]);
      for (const decision of allDecisions) {
        expect(NORMALIZED_DECISION_TO_STATUS_MAP.has(decision)).toBe(true);
      }
    });

    test('every map value is in a canonical CoA status set', () => {
      const allStatuses = new Set<string>([
        ...COA_REVIEW_STATUSES,
        ...COA_INTAKE_STATUSES,
        ...COA_TERMINAL_P20_STATUSES,
        ...COA_TERMINAL_P19_STATUSES,
        ...COA_APPROVED_STATUSES,
        ...COA_FINAL_AND_BINDING_STATUSES,
        ...COA_POST_DECISION_STATUSES,
      ]);
      for (const value of NORMALIZED_DECISION_TO_STATUS_MAP.values()) {
        expect(allStatuses.has(value)).toBe(true);
      }
    });

    test('typo variants map to canonical Approved with Conditions', () => {
      expect(NORMALIZED_DECISION_TO_STATUS_MAP.get('approved on condation')).toBe('Approved with Conditions');
      expect(NORMALIZED_DECISION_TO_STATUS_MAP.get('conitional approval')).toBe('Approved with Conditions');
      expect(NORMALIZED_DECISION_TO_STATUS_MAP.get('approved wih conditions')).toBe('Approved with Conditions');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Test #9: Defensive input
  // ─────────────────────────────────────────────────────────────
  describe('defensive input', () => {
    test('null input → sentinel {phase:null, matchedRule:0, ...}', () => {
      const r = classifyCoaPhase(null as unknown as never);
      expect(r.phase).toBeNull();
      expect(r.matchedRule).toBe(0);
      expect(r.stalled).toBe(false);
      expect(r.unmappedStatus).toBe(false);
      expect(r.unmappedDecision).toBe(false);
    });

    test('undefined input → sentinel {phase:null, matchedRule:0, ...}', () => {
      const r = classifyCoaPhase(undefined as unknown as never);
      expect(r.phase).toBeNull();
      expect(r.matchedRule).toBe(0);
    });

    test('string input → sentinel {phase:null, matchedRule:0, ...}', () => {
      const r = classifyCoaPhase('garbage' as unknown as never);
      expect(r.phase).toBeNull();
      expect(r.matchedRule).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase E.1 (84-W12) — mapToUniversalStream lookup tests
// ─────────────────────────────────────────────────────────────────
describe('mapToUniversalStream', () => {
  function fixtureCatalog(): Map<string, UniversalStreamRow> {
    return new Map<string, UniversalStreamRow>([
      ['coa.status:Application Received',     {seq:  1, group:'C1', block:'B1.A', stage:'S1', phase:'P1',  bid_value: 0.1}],
      ['coa.status:Approved',                 {seq: 11, group:'C2', block:'B2.B', stage:'S2', phase:'P3',  bid_value: 0.6}],
      ['coa.status:Final and Binding',        {seq: 14, group:'C2', block:'B2.C', stage:'S2', phase:'P4',  bid_value: 0.7}],
      ['coa.status:Refused',                  {seq: 13, group:'C3', block:'B3.A', stage:'S3', phase:'P19', bid_value: 0.0}],
      ['coa.status:Closed',                   {seq: 22, group:'C3', block:'B3.B', stage:'S3', phase:'P20', bid_value: 0.0}],
      // Poisoned rows (v4 fold #5 — post-lookup phase validation)
      ['permits.status:Notice Sent',          {seq: 35, group:'P4', block:'B4.A', stage:'S4', phase:'UNMAPPED→null', bid_value: null}],
      ['permits.status:Multi-Phase Row',      {seq: 47, group:'P4', block:'B4.B', stage:'S4', phase:'P7a/P7b/P7c (or P9-P17)', bid_value: 0.3}],
    ]);
  }

  test('direct hit returns frozen catalog row', () => {
    const cat = fixtureCatalog();
    const r = mapToUniversalStream(cat, 'Approved', 'coa.status');
    expect(r).not.toBeNull();
    expect(r!.seq).toBe(11);
    expect(r!.phase).toBe('P3');
    expect(Object.isFrozen(r)).toBe(true);
  });

  test('miss returns null (no wildcard fallback)', () => {
    const r = mapToUniversalStream(fixtureCatalog(), 'No Such Status', 'coa.status');
    expect(r).toBeNull();
  });

  test('null matchedStatus returns null (catchall rule 9 case)', () => {
    const r = mapToUniversalStream(fixtureCatalog(), null, 'coa.status');
    expect(r).toBeNull();
  });

  test('poisoned row with .phase="UNMAPPED→null" returns null (post-lookup validation)', () => {
    const r = mapToUniversalStream(fixtureCatalog(), 'Notice Sent', 'permits.status');
    expect(r).toBeNull();
  });

  test('multi-value catalog .phase like "P7a/P7b/P7c" returns null', () => {
    const r = mapToUniversalStream(fixtureCatalog(), 'Multi-Phase Row', 'permits.status');
    expect(r).toBeNull();
  });

  test('source must match exact catalog key (CoA callsite invariant)', () => {
    const cat = fixtureCatalog();
    // Approved is in 'coa.status:Approved' but not 'permits.status:Approved'
    expect(mapToUniversalStream(cat, 'Approved', 'permits.status')).toBeNull();
  });

  test('non-Map catalog argument returns null defensively', () => {
    const r = mapToUniversalStream(
      {} as unknown as ReadonlyMap<string, UniversalStreamRow>,
      'Approved',
      'coa.status',
    );
    expect(r).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase E.1 (84-W12) — classifyCoaPhaseLegacy (Same-Sprint Option 2)
// ─────────────────────────────────────────────────────────────────
describe('classifyCoaPhaseLegacy', () => {
  test('P1 from new shape → P1 in legacy shape', () => {
    const r = classifyCoaPhaseLegacy(coa({ status: 'Application Received', decision: null }));
    expect(r).toEqual({ phase: 'P1', stalled: false });
  });

  test('P2 from new shape → P2 in legacy shape', () => {
    const r = classifyCoaPhaseLegacy(coa({ status: 'Hearing Scheduled', decision: null }));
    expect(r).toEqual({ phase: 'P2', stalled: false });
  });

  test('P3 narrows to null (preserves old return shape, not old buggy behavior)', () => {
    const r = classifyCoaPhaseLegacy(coa({ status: 'Approved', decision: null }));
    expect(r).toEqual({ phase: null, stalled: false });
  });

  test('P4 narrows to null', () => {
    const r = classifyCoaPhaseLegacy(coa({ status: 'Final and Binding', decision: null }));
    expect(r).toEqual({ phase: null, stalled: false });
  });

  test('P19 narrows to null', () => {
    const r = classifyCoaPhaseLegacy(coa({ status: 'Refused', decision: null }));
    expect(r).toEqual({ phase: null, stalled: false });
  });

  test('P20 narrows to null', () => {
    const r = classifyCoaPhaseLegacy(coa({ status: 'Closed', decision: null }));
    expect(r).toEqual({ phase: null, stalled: false });
  });

  test('preserves stalled flag for P1/P2 (catchall stall propagates)', () => {
    const r = classifyCoaPhaseLegacy(coa({
      status: 'UNRECOGNIZED', decision: null,
      daysSinceActivity: 100, stallThresholdDays: 30,
    }));
    expect(r.phase).toBe('P1');
    expect(r.stalled).toBe(true);
  });

  test('returned shape has exactly 2 keys (phase + stalled, no extras)', () => {
    const r = classifyCoaPhaseLegacy(coa({ status: 'Application Received', decision: null }));
    expect(Object.keys(r).sort()).toEqual(['phase', 'stalled']);
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase E.1 (84-W12) — Helpers
// ─────────────────────────────────────────────────────────────────
describe('normalizeCoaStatus', () => {
  test("trims and returns null for empty", () => {
    expect(normalizeCoaStatus('  Hearing Scheduled  ')).toBe('Hearing Scheduled');
    expect(normalizeCoaStatus('')).toBeNull();
    expect(normalizeCoaStatus('   ')).toBeNull();
    expect(normalizeCoaStatus(null)).toBeNull();
    expect(normalizeCoaStatus(undefined)).toBeNull();
  });

  test('preserves case (unlike normalizeCoaDecision)', () => {
    expect(normalizeCoaStatus('HEARING SCHEDULED')).toBe('HEARING SCHEDULED');
  });
});

describe('isDeferredDecisionVariant', () => {
  test('canonical and typo deferred values match', () => {
    expect(isDeferredDecisionVariant('deferred')).toBe(true);
    expect(isDeferredDecisionVariant('deffered')).toBe(true);
  });

  test('date-stamped variants match via startsWith', () => {
    expect(isDeferredDecisionVariant('deferred aug 18, 2016 (orig mark kehler)')).toBe(true);
    expect(isDeferredDecisionVariant('deferred feb 2')).toBe(true);
  });

  test("'decision not made...' outlier matches", () => {
    expect(isDeferredDecisionVariant('decision not made - appeal was made due to that')).toBe(true);
  });

  test('null/empty does not match', () => {
    expect(isDeferredDecisionVariant(null)).toBe(false);
    expect(isDeferredDecisionVariant(undefined)).toBe(false);
  });

  test('negative guard: exact-match approved variant does not match', () => {
    expect(isDeferredDecisionVariant('approved')).toBe(false);
    expect(isDeferredDecisionVariant('conditional consent')).toBe(false);
  });

  test('negative guard: exact-match P19/P20 variant does not match', () => {
    expect(isDeferredDecisionVariant('refused')).toBe(false);
    expect(isDeferredDecisionVariant('closed')).toBe(false);
  });

  test('non-deferred unknown decision does not match', () => {
    expect(isDeferredDecisionVariant('garbage 123')).toBe(false);
    expect(isDeferredDecisionVariant('approved-ish')).toBe(false);
  });
});

describe('computeStallFromActivity', () => {
  test('returns true when days > threshold', () => {
    expect(computeStallFromActivity(35, 30)).toBe(true);
  });
  test('returns false when days === threshold (strict)', () => {
    expect(computeStallFromActivity(30, 30)).toBe(false);
  });
  test('returns false when days < threshold', () => {
    expect(computeStallFromActivity(20, 30)).toBe(false);
  });
  test('null/undefined inputs return false (no crash)', () => {
    expect(computeStallFromActivity(null, 30)).toBe(false);
    expect(computeStallFromActivity(30, null)).toBe(false);
    expect(computeStallFromActivity(undefined, undefined)).toBe(false);
  });
  test('NaN inputs return false', () => {
    expect(computeStallFromActivity(NaN, 30)).toBe(false);
    expect(computeStallFromActivity(30, NaN)).toBe(false);
  });
  test('zero threshold returns false (feature off)', () => {
    expect(computeStallFromActivity(100, 0)).toBe(false);
  });
  test('negative threshold returns false', () => {
    expect(computeStallFromActivity(100, -1)).toBe(false);
  });
});

describe('normalizeCoaDecision', () => {
  test('trims leading/trailing whitespace', () => {
    expect(normalizeCoaDecision('  Approved  ')).toBe('approved');
  });

  test('lowercases', () => {
    expect(normalizeCoaDecision('APPROVED')).toBe('approved');
  });

  test('collapses internal whitespace', () => {
    expect(normalizeCoaDecision('Approved   with   Conditions')).toBe(
      'approved with conditions',
    );
  });

  test('null → null', () => {
    expect(normalizeCoaDecision(null)).toBeNull();
  });

  test('undefined → null', () => {
    expect(normalizeCoaDecision(undefined as unknown as null)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════
// Section L — Fuzzing (1000 random inputs)
// ═════════════════════════════════════════════════════════════════
describe('classifyLifecyclePhase — fuzzing', () => {
  const RANDOM_STATUSES = [
    null,
    '',
    'Permit Issued',
    'Inspection',
    'Unknown Status',
    'Cancelled',
    'Closed',
    'Application Received',
    'Under Review',
    'Revision Issued',
    'Foo Bar Baz',
    '   ',
    'null',
  ];
  const RANDOM_STAGES = [
    null,
    'Excavation/Shoring',
    'Structural Framing',
    'Change of Use',
    'Unknown Stage',
  ];

  function pickRandom<T>(arr: readonly T[]): T {
    const idx = Math.floor(Math.random() * arr.length);
    // arr is non-empty and idx is in-range, so non-null assertion is safe
    return arr[idx] as T;
  }

  function randomPermit() {
    return {
      status: pickRandom(RANDOM_STATUSES),
      enriched_status: Math.random() < 0.1 ? 'Stalled' : null,
      issued_date:
        Math.random() < 0.2
          ? null
          : daysAgo(Math.floor(Math.random() * 3000)),
      is_orphan: Math.random() < 0.3,
      latest_passed_stage: pickRandom(RANDOM_STAGES),
      latest_inspection_date:
        Math.random() < 0.5 ? null : daysAgo(Math.floor(Math.random() * 500)),
      has_passed_inspection: Math.random() < 0.3,
      now: NOW,
    };
  }

  test('1000 random inputs — no crashes, all outputs in valid domain', () => {
    for (let i = 0; i < 1000; i++) {
      const row = randomPermit();
      let result;
      expect(() => {
        result = classifyLifecyclePhase(row);
      }).not.toThrow();
      expect(result).toBeDefined();
      // phase must be in VALID_PHASES or null
      expect(
        result!.phase === null || VALID_PHASES.has(result!.phase),
      ).toBe(true);
      // stalled must be boolean
      expect(typeof result!.stalled).toBe('boolean');
    }
  });

  test('1000 random CoA inputs — no crashes, phase in widened E.1 domain', () => {
    const RANDOM_DECISIONS = [
      null,
      'Approved',
      'approved',
      'Refused',
      'Withdrawn',
      'Deferred',
      'conditional approval',
      'conditional consent',
      'final and binding',
      'closed',
      'Oct 29, 2019',
      '',
      'Garbage 123',
    ];
    const RANDOM_STATUSES = [
      null, '',
      'Application Received', 'Accepted',
      'Hearing Scheduled', 'Deferred',
      'Approved', 'Approved with Conditions', 'Final and Binding',
      'Refused', 'Application Withdrawn', 'Closed', 'Complete',
      'Appealed', 'TLAB Appeal',
      'UNKNOWN_STATUS_FOOBAR',
    ];
    const VALID_COA_PHASES = new Set<string | null>([
      'P1', 'P2', 'P3', 'P4', 'P19', 'P20', null,
    ]);
    for (let i = 0; i < 1000; i++) {
      const row = {
        decision: pickRandom(RANDOM_DECISIONS),
        linked_permit_num: Math.random() < 0.5 ? '25 123456 BLD' : null,
        status: pickRandom(RANDOM_STATUSES),
      };
      let result: ReturnType<typeof classifyCoaPhase> | undefined;
      expect(() => {
        result = classifyCoaPhase(row);
      }).not.toThrow();
      expect(result).toBeDefined();
      expect(VALID_COA_PHASES.has(result!.phase)).toBe(true);
      expect(typeof result!.stalled).toBe('boolean');
      expect(typeof result!.matchedRule).toBe('number');
      expect(result!.matchedRule).toBeGreaterThanOrEqual(0);
      expect(result!.matchedRule).toBeLessThanOrEqual(9);
    }
  });
});
