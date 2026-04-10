// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §4.10
//
// Pure helper encoding the spec's marker active-state precedence:
//
//   "When a user is simultaneously hovering one card and has selected
//    another, selectedLeadId wins. The isActive check is
//    `selectedLeadId === lead.id || (selectedLeadId === null &&
//    hoveredLeadId === lead.id)` — selection is sticky, hover is a
//    transient preview that only highlights when nothing is selected.
//    Clicking elsewhere clears selectedLeadId to allow hover preview
//    again."
//
// Lifted out of the LeadMapPane component for two reasons:
//   1. Unit-testable in isolation without mounting the map
//   2. Reusable by future consumers (e.g., the desktop card list
//      that may want to apply the same active-state highlight to its
//      own card while a marker is hovered)

/**
 * Decide whether a given lead should render in its "active" visual
 * state. Selection is sticky: any selectedLeadId override forces the
 * hover preview off. Hover only matters when no selection is set.
 *
 * Pure function — no hooks, no side effects. Both arguments may be
 * null (the initial Zustand state for both fields).
 */
export function isLeadActive(
  leadId: string,
  hoveredLeadId: string | null,
  selectedLeadId: string | null,
): boolean {
  if (selectedLeadId !== null) {
    return selectedLeadId === leadId;
  }
  return hoveredLeadId === leadId;
}
