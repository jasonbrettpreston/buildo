// 🔗 SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3
//             docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5
//
// Single source of truth for the phase friendly-name map authored from
// Spec 84 §3. The admin Lead Detail Inspector's `lifecycle.timeline[]`
// panel uses this for every `phase_name` field. Drift between this map
// and the spec means the UI renders stale labels — regression-locked
// by src/tests/phase-names.logic.test.ts which asserts every entry
// matches Spec 84 §3 verbatim.
//
// 23 entries: P1-P5 (CoA), INTAKE_P3-P5 (Permit Intake), P6-P20 (Permit
// progression), O1-O3 (Orphan track). P1/P2 only render for CoA leads
// — building permits never see those phases (their first transition
// is INTAKE_P3 or P6 per Spec 84 §3.2).

export const PHASE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  // §3.1 Pre-Permit (CoA-only — building permits don't enter these)
  P1: 'CoA Intake',
  P2: 'CoA Review',
  P3: 'CoA Approved',
  P4: 'CoA Final',
  P5: 'Zoning Review',
  // §3.2 Permit Intake Block (INTAKE_* prefixed to avoid CoA collision)
  INTAKE_P3: 'Permit Review',
  INTAKE_P4: 'Permit Approved',
  INTAKE_P5: 'Permit Ready',
  P6: 'Permit Applied',
  // §3.2 Issued time-bucketed
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
  // §3.7 Orphan track
  O1: 'Orphan Active',
  O2: 'Orphan Done',
  O3: 'Orphan Stalled',
});

/**
 * Resolve a phase code to its friendly name. Returns null for null/undefined
 * input or unknown codes (silent miss is preferable to a user-facing crash).
 */
export function phaseName(phase: string | null | undefined): string | null {
  if (phase == null || phase === '') return null;
  return PHASE_NAMES[phase] ?? null;
}
