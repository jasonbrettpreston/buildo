// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-82 (dated note 2026-10-29, 2026-10-29-batch-aa#CHAT-198.NN-Q3);
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §6.5 (a new dsl_input is operator-ruled), §9 G-READ (input fidelity 800.50(320))
//
// The main building's gross floor area, the dsl_input main_building_gfa_m2 (150.7.60.50(2), 150.8.60.50(2): the floor area of a suite building must be
// less than that of the residential building on the lot). Operator rule (CHAT-198.NN-Q3): "A rule that compares a suite with the main building (house or
// semi-detached house) reads the main building's floor area from a declared input, filled from plan facts, then the user's footprint and storeys, then
// the maximum build." PURE: no I/O, no clock. A figure that is not a finite number above zero is not held.

/** The closed set of value sources, in the order they are tried. */
export const MAIN_GFA_BASES = Object.freeze(['plan_facts', 'user_footprint_storeys', 'max_build']);

const pos = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const round2 = (x) => Math.round(x * 100) / 100;

/**
 * held = { plan_gfa_m2 (plan facts existing_gfa_m2), footprint_sqm (user input existing_footprint_sqm), storeys (user input current_stories),
 *          max_build_gfa_m2 (the maximum build's gross floor area for the lot) }.
 * Returns { value, basis }: the first source that holds a figure; { value: null, basis: 'none' } when none does (the rule is then owed).
 * footprint x storeys needs both figures.
 */
export function resolveMainBuildingGfa(held) {
  const h = held || {};
  const plan = pos(h.plan_gfa_m2);
  if (plan != null) return { value: plan, basis: 'plan_facts' };
  const fp = pos(h.footprint_sqm); const st = pos(h.storeys);
  if (fp != null && st != null) return { value: round2(fp * st), basis: 'user_footprint_storeys' };
  const mb = pos(h.max_build_gfa_m2);
  if (mb != null) return { value: mb, basis: 'max_build' };
  return { value: null, basis: 'none' };
}
