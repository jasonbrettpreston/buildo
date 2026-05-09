// 🔗 SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3
//             docs/specs/01-pipeline/80_taxonomies.md §5
//
// Canonical happy-path phase progression per permit_type. Used by
// build-lifecycle-timeline.ts to compute the "remaining uncompleted
// stages" portion of lifecycle.timeline[]. Each entry's predicted
// duration comes from phase_calibration cohort medians.
//
// Source: Spec 84 §3 progression tables. Building permits never see P1
// or P2 (CoA-only phases); the path always starts at INTAKE_P3 or P6.
// The 5 residential structural permit_types follow the full P9-P17
// inspection-stage sequence; trade-only permit_types (PLB, MS, DSS)
// follow a shorter orphan-track path because they don't get full
// inspection chains.

/**
 * Map of permit_type to its canonical phase progression. Phase codes
 * appear in monotonic Spec 84 §3 order; the array represents the
 * "happy path" the permit is expected to traverse.
 *
 * Used by `remainingPhases(permitType, currentPhase)` to slice the
 * portion AFTER the current phase. Unknown permit_types or off-path
 * states (e.g., a residential permit on the orphan track) return [] —
 * we don't predict recovery sequences.
 */
export const STANDARD_PHASE_PATH_BY_PERMIT_TYPE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // ── Residential structural — full P9-P18 chain ──
  'New Building': Object.freeze([
    'P3', 'P4', 'P5', 'P6',
    'P7a', 'P7b', 'P7c', 'P8',
    'P9', 'P10', 'P11', 'P12', 'P13', 'P14',
    'P15', 'P16', 'P17', 'P18',
  ]),
  'Building Additions/Alterations': Object.freeze([
    'P3', 'P4', 'P5', 'P6',
    'P7a', 'P7b', 'P7c', 'P8',
    'P9', 'P10', 'P11', 'P12', 'P13', 'P14',
    'P15', 'P16', 'P17', 'P18',
  ]),
  'New Houses': Object.freeze([
    'P3', 'P4', 'P5', 'P6',
    'P7a', 'P7b', 'P7c', 'P8',
    'P9', 'P10', 'P11', 'P12', 'P13', 'P14',
    'P15', 'P16', 'P17', 'P18',
  ]),
  'Residential Building Permit': Object.freeze([
    'P3', 'P4', 'P5', 'P6',
    'P7a', 'P7b', 'P7c', 'P8',
    'P9', 'P10', 'P11', 'P12', 'P13', 'P14',
    'P15', 'P16', 'P17', 'P18',
  ]),
  // ── Small Residential Projects — skips structural P9-P11 ──
  'Small Residential Projects': Object.freeze([
    'P3', 'P4', 'P5', 'P6',
    'P7a', 'P7b', 'P7c', 'P8',
    'P12', 'P15', 'P18',
  ]),
  // ── Non-residential — full chain (commercial inspections still apply) ──
  'Non-Residential Building Permit': Object.freeze([
    'P3', 'P4', 'P5', 'P6',
    'P7a', 'P7b', 'P7c', 'P8',
    'P9', 'P10', 'P11', 'P12', 'P13', 'P14',
    'P15', 'P16', 'P17', 'P18',
  ]),
  // ── Trade-only — orphan track (no full inspection chain) ──
  'Plumbing(PS)': Object.freeze([
    'P3', 'P6', 'P7a', 'P7b', 'P7c',
    'O1', 'O2', 'O3',
  ]),
  'Mechanical(MS)': Object.freeze([
    'P3', 'P6', 'P7a', 'P7b', 'P7c',
    'O1', 'O2', 'O3',
  ]),
  'Drain and Site Service': Object.freeze([
    'P3', 'P6', 'P7a', 'P7b', 'P7c',
    'O1', 'O2', 'O3',
  ]),
  // ── Demolition — short administrative path ──
  'Demolition Folder (DM)': Object.freeze([
    'P3', 'P6', 'P7a', 'P7b', 'P7c', 'P18',
  ]),
  // ── Designated Structures (signs, solar, retaining walls, telecom) ──
  'Designated Structures': Object.freeze([
    'P3', 'P6', 'P7a', 'P7b', 'P7c', 'P18',
  ]),
});

const TERMINAL_PHASES: ReadonlySet<string> = new Set(['P18', 'P19', 'P20', 'O3']);

/**
 * Returns the slice of the canonical path AFTER `currentPhase`. Returns
 * an empty array when:
 *   - permitType is null/undefined or unknown to the map
 *   - currentPhase is null/undefined
 *   - currentPhase is a terminal state (P18 / P19 / P20 / O3)
 *   - currentPhase is not in the canonical path (off-path permit)
 *
 * The off-path case (e.g., a New House on the orphan track) intentionally
 * returns [] — we don't predict recovery sequences. The inspector's
 * timeline still shows past + current, just no upcoming.
 */
export function remainingPhases(
  permitType: string | null | undefined,
  currentPhase: string | null | undefined,
): readonly string[] {
  if (permitType == null || currentPhase == null) return [];
  if (TERMINAL_PHASES.has(currentPhase)) return [];

  const path = STANDARD_PHASE_PATH_BY_PERMIT_TYPE[permitType];
  if (!path) return [];

  const idx = path.indexOf(currentPhase);
  if (idx === -1) return []; // off-path

  return path.slice(idx + 1);
}
