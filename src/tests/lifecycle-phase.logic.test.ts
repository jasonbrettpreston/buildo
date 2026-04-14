// 🔗 SPEC LINK: docs/reports/lifecycle_phase_implementation.md §3.1
// 🔗 ACTIVE TASK: .cursor/active_task.md (WF2 Lifecycle Phase V1)
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
  normalizeCoaDecision,
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
  NORMALIZED_DEAD_DECISIONS,
  VALID_PHASES,
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

describe('classifyCoaPhase — CoA branch', () => {
  test('linked CoA returns null (phase lives on permit)', () => {
    const result = classifyCoaPhase(
      coa({ decision: 'Approved', linked_permit_num: '25 123456 BLD' }),
    );
    expect(result.phase).toBeNull();
  });

  test('canonical Approved → P2', () => {
    const result = classifyCoaPhase(coa({ decision: 'Approved' }));
    expect(result.phase).toBe('P2');
  });

  test('lowercase approved → P2', () => {
    const result = classifyCoaPhase(coa({ decision: 'approved' }));
    expect(result.phase).toBe('P2');
  });

  test('all-caps APPROVED → P2', () => {
    const result = classifyCoaPhase(coa({ decision: 'APPROVED' }));
    expect(result.phase).toBe('P2');
  });

  test.each([
    'conditional approval',
    'Approved on Condition',
    'Approved with Conditions',
    'Approved wih Conditions', // typo variant from real DB
    'Approved with condition',
    'approved on condition',
    'CONDITIONAL APPROVAL',
    'modified approval',
    'Conditional Approved',
    'Approved on conditional',
    'Approved on condation', // typo
    'approved on condtion', // typo
    'Approved, as amended, on Condition',
    'Partially Approved',
    'Conditionally Approved',
    'conitional approval', // typo
  ])('canonical approved variant "%s" → P2', (decision) => {
    const result = classifyCoaPhase(coa({ decision }));
    expect(result.phase).toBe('P2');
  });

  test.each(['Refused', 'refused', 'REFUSED'])(
    'Refused variants → null (dead)',
    (decision) => {
      const result = classifyCoaPhase(coa({ decision }));
      expect(result.phase).toBeNull();
    },
  );

  test.each(['Withdrawn', 'withdrawn', 'application withdrawn'])(
    'Withdrawn variants → null (dead)',
    (decision) => {
      const result = classifyCoaPhase(coa({ decision }));
      expect(result.phase).toBeNull();
    },
  );

  test('delegated consent refused → null (dead)', () => {
    const result = classifyCoaPhase(coa({ decision: 'DELEGATED CONSENT REFUSED' }));
    expect(result.phase).toBeNull();
  });

  test('"closed" or "application closed" → null (dead)', () => {
    expect(classifyCoaPhase(coa({ decision: 'closed' })).phase).toBeNull();
    expect(classifyCoaPhase(coa({ decision: 'application closed' })).phase).toBeNull();
  });

  test('NULL decision → P1 (Variance Requested)', () => {
    const result = classifyCoaPhase(coa({ decision: null }));
    expect(result.phase).toBe('P1');
  });

  test('Deferred → P1 (still pending)', () => {
    const result = classifyCoaPhase(coa({ decision: 'Deferred' }));
    expect(result.phase).toBe('P1');
  });

  test.each([
    'Deferred Jun 4, 2015',
    'Deferred Aug 18, 2016 (Orig Mark Kehler)',
    'deferred feb 2',
    'DEFFERED', // typo
  ])('Deferred date-suffix variant "%s" → P1', (decision) => {
    const result = classifyCoaPhase(coa({ decision }));
    expect(result.phase).toBe('P1');
  });

  test('Postponed → P1 (still pending)', () => {
    const result = classifyCoaPhase(coa({ decision: 'Postponed' }));
    expect(result.phase).toBe('P1');
  });

  test('garbage/unparseable decision → P1 (treat as undecided)', () => {
    const result = classifyCoaPhase(coa({ decision: 'Oct 29, 2019' }));
    expect(result.phase).toBe('P1');
  });

  test('"decision not made - appeal was made due to that" → P1', () => {
    const result = classifyCoaPhase(
      coa({ decision: 'decision not made - appeal was made due to that' }),
    );
    expect(result.phase).toBe('P1');
  });

  // ─── WF3 2026-04-13: Stall detection ─────────────────────────────
  // coa_stall_threshold from logic_variables drives lifecycle_stalled
  // on in-flight CoAs (P1/P2). Adversarial Probe 6 + Independent CL-10.
  describe('stall detection via coa_stall_threshold', () => {
    test('P1 stalls when daysSinceActivity exceeds threshold', () => {
      const result = classifyCoaPhase(
        coa({ decision: null, daysSinceActivity: 35, stallThresholdDays: 30 }),
      );
      expect(result.phase).toBe('P1');
      expect(result.stalled).toBe(true);
    });

    test('P2 (approved) stalls when daysSinceActivity exceeds threshold', () => {
      const result = classifyCoaPhase(
        coa({ decision: 'Approved', daysSinceActivity: 45, stallThresholdDays: 30 }),
      );
      expect(result.phase).toBe('P2');
      expect(result.stalled).toBe(true);
    });

    test('days === threshold is NOT stalled (strict greater-than)', () => {
      const result = classifyCoaPhase(
        coa({ decision: null, daysSinceActivity: 30, stallThresholdDays: 30 }),
      );
      expect(result.stalled).toBe(false);
    });

    test('linked CoA is never stalled (terminal)', () => {
      const result = classifyCoaPhase(
        coa({ linked_permit_num: '25 123 BLD', daysSinceActivity: 999, stallThresholdDays: 30 }),
      );
      expect(result.stalled).toBe(false);
    });

    test('dead-decision CoA is never stalled (terminal)', () => {
      const result = classifyCoaPhase(
        coa({ decision: 'application closed', daysSinceActivity: 999, stallThresholdDays: 30 }),
      );
      expect(result.stalled).toBe(false);
    });

    test('null daysSinceActivity → not stalled (unknown activity)', () => {
      const result = classifyCoaPhase(
        coa({ decision: null, daysSinceActivity: null, stallThresholdDays: 30 }),
      );
      expect(result.stalled).toBe(false);
    });

    test('null threshold → not stalled (feature off)', () => {
      const result = classifyCoaPhase(
        coa({ decision: null, daysSinceActivity: 100, stallThresholdDays: null }),
      );
      expect(result.stalled).toBe(false);
    });

    test('zero threshold → not stalled (feature off, prevents thrashing)', () => {
      const result = classifyCoaPhase(
        coa({ decision: null, daysSinceActivity: 100, stallThresholdDays: 0 }),
      );
      expect(result.stalled).toBe(false);
    });
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

  test('1000 random CoA inputs — no crashes', () => {
    const RANDOM_DECISIONS = [
      null,
      'Approved',
      'approved',
      'Refused',
      'Withdrawn',
      'Deferred',
      'conditional approval',
      'Oct 29, 2019',
      '',
      'Garbage 123',
    ];
    for (let i = 0; i < 1000; i++) {
      const row = {
        decision: pickRandom(RANDOM_DECISIONS),
        linked_permit_num: Math.random() < 0.5 ? '25 123456 BLD' : null,
        status: null,
      };
      let result;
      expect(() => {
        result = classifyCoaPhase(row);
      }).not.toThrow();
      expect(result).toBeDefined();
      expect(
        result!.phase === null || result!.phase === 'P1' || result!.phase === 'P2',
      ).toBe(true);
    }
  });
});
