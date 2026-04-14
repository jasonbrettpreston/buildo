// 🔗 SPEC LINK: docs/reports/lifecycle_phase_implementation.md §2.6
//
// Feed consumer helper — maps the 24-phase `lifecycle_phase` column
// to human-readable display labels for the lead feed card.
//
// Replaces the previous placeholder TIMING_DISPLAY_BY_CONFIDENCE
// constant that returned 'Active build phase' for 95% of permits.
// Now each card shows a distinct, meaningful phase label.
//
// The map is pure data — no logic, no branching — so consumers can
// include the full 24-value lookup in a single object literal and
// render it without import overhead.

/** Canonical display labels for every lifecycle phase value. */
export const LIFECYCLE_PHASE_DISPLAY: Record<string, string> = {
  // CoA origination
  P1: 'Variance requested',
  P2: 'Variance granted',

  // Direct-permit origination
  P3: 'Application intake',

  // Review phases
  P4: 'Under review',
  P5: 'On hold',
  P6: 'Ready to issue',

  // Issued, pre-construction (time-bucketed)
  P7a: 'Freshly issued',
  P7b: 'Mobilizing',
  P7c: 'Recently issued',
  P7d: 'Not started',

  // Permit revised
  P8: 'Permit revised',

  // Active construction sub-stages
  P9: 'Site prep',
  P10: 'Foundation',
  P11: 'Framing',
  P12: 'Rough-in',
  P13: 'Insulation',
  P14: 'Fire separations',
  P15: 'Interior finishing',
  P16: 'Exterior finishing',
  P17: 'Final walkthrough',
  P18: 'Construction active',

  // Wind-down / terminal
  P19: 'Wind-down',
  P20: 'Closed',

  // Orphan trade-permit lifecycle.
  // WF3-04 (H-W14 / 84-W10): O4 removed — phantom phase, no classifier produces it.
  O1: 'Trade permit applied',
  O2: 'Trade permit active',
  O3: 'Trade permit stalled',
};

/**
 * Build the display label shown on the lead feed card. Combines the
 * base phase name with a "(stalled)" suffix when the stalled modifier
 * is set. Falls back to "Unknown" for null or unrecognized phases so
 * the card always renders something.
 */
export function displayLifecyclePhase(
  phase: string | null,
  stalled: boolean,
): string {
  if (phase == null) return 'Unknown';
  const base = LIFECYCLE_PHASE_DISPLAY[phase] ?? phase;
  return stalled ? `${base} (stalled)` : base;
}
