// 🔗 SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3
//
// Parity test for src/lib/classification/phase-names.ts — the friendly-name
// map authored from Spec 84 §3. Drift between the map and the spec means
// the inspector's lifecycle.timeline[].phase_name field renders a stale
// label. Lock parity at unit-test level.

import { describe, it, expect } from 'vitest';
import { PHASE_NAMES, phaseName } from '@/lib/classification/phase-names';

// Source of truth: Spec 84 §3 phase tables, transcribed verbatim.
// 23 entries: P3-P8, P7a-d (4), P9-P20 (12), O1-O3 (3), CoA P1/P2.
// INTAKE_P3/P4/P5 are defined per Spec 84 §3.2 (Permit Intake Block —
// prefixed to avoid collision with CoA P3-P5 that mean different things).
const EXPECTED: Record<string, string> = {
  // §3.1 Pre-Permit (CoA-only)
  P1: 'CoA Intake',
  P2: 'CoA Review',
  P3: 'CoA Approved',
  P4: 'CoA Final',
  P5: 'Zoning Review',
  // §3.2 Permit Intake Block (INTAKE_* prefixed)
  INTAKE_P3: 'Permit Review',
  INTAKE_P4: 'Permit Approved',
  INTAKE_P5: 'Permit Ready',
  P6: 'Permit Applied',
  // §3.2 issued time-bucketed
  P7a: 'Issued (Early)',
  P7b: 'Issued (Mid)',
  P7c: 'Issued (Late)',
  P7d: 'Work Not Started',
  P8: 'Mobilization',
  // §3.3 Structural
  P9: 'Excavation',
  P10: 'Foundations',
  P11: 'Structural Framing',
  // §3.4 Enclosure & Systems
  P12: 'Rough-ins',
  P13: 'Insulation',
  P14: 'Fire Sep / Board',
  // §3.5 Finishes & Closing
  P15: 'Interior Finals',
  P16: 'Exterior Finals',
  P17: 'Occupancy',
  P18: 'Project Closed',
  // §3.6 Terminal
  P19: 'Cancelled',
  P20: 'Revoked',
  // §3.7 Orphan
  O1: 'Orphan Active',
  O2: 'Orphan Done',
  O3: 'Orphan Stalled',
};

describe('PHASE_NAMES — Spec 84 §3 friendly-name map (WF1 #B 2026-05-09)', () => {
  it('has the same key set as Spec 84 §3', () => {
    expect(Object.keys(PHASE_NAMES).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.entries(EXPECTED))(
    '%s → %s',
    (phase, expectedName) => {
      expect(PHASE_NAMES[phase]).toBe(expectedName);
    },
  );

  it('phaseName() returns the friendly name for a known code', () => {
    expect(phaseName('P7c')).toBe('Issued (Late)');
    expect(phaseName('INTAKE_P3')).toBe('Permit Review');
    expect(phaseName('O3')).toBe('Orphan Stalled');
  });

  it('phaseName() returns null for null/undefined/unknown', () => {
    expect(phaseName(null)).toBeNull();
    expect(phaseName(undefined)).toBeNull();
    expect(phaseName('P99')).toBeNull();
    expect(phaseName('')).toBeNull();
  });

  it('the map is frozen — runtime mutation is rejected', () => {
    expect(() => {
      // @ts-expect-error — testing immutability
      PHASE_NAMES.P7c = 'mutated';
    }).toThrow();
  });
});
