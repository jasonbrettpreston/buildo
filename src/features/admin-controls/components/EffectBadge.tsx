/**
 * EffectBadge — shows, next to a logic variable in the control panel, that the live step does not read it yet
 * (Spec 124 R-EO, operator Q6 y 2026-10-19). The entries are GENERATED (scripts/generate-logic-variable-effect.mjs)
 * from the descriptors, converted.json stages, the live code and the copy migrations — never hand-listed (R-DL):
 *   - takes_effect_at_cutover: the step is in its copy window; the live legacy script reads another variable
 *     (or a built-in value) until the step's cutover;
 *   - not_read_scheduled_for_retirement: no step or app code reads it, so editing it changes nothing.
 * A variable with no entry is in effect and shows no badge.
 *
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-EO, R-DL
 */
import GENERATED_EFFECT from '../generated/logic-variable-effect.json';

export interface VariableEffect {
  badge: 'takes_effect_at_cutover' | 'not_read_scheduled_for_retirement';
  label: string;
  reason: string;
  step?: string;
  legacy_name?: string | null;
}

const EFFECT = (GENERATED_EFFECT as { entries: Record<string, VariableEffect> }).entries;

/** EXPORTED for the unit test: the badge for a variable, or null when the variable is in effect. */
export function effectFor(varKey: string): VariableEffect | null {
  return EFFECT[varKey] ?? null;
}

export function EffectBadge({ varKey }: { varKey: string }) {
  const effect = effectFor(varKey);
  if (!effect) return null;
  const tone = effect.badge === 'takes_effect_at_cutover'
    ? 'bg-amber-50 text-amber-800 border-amber-200'
    : 'bg-gray-100 text-gray-600 border-gray-300';
  return (
    <span
      className={`ml-2 inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal ${tone}`}
      title={effect.reason}
      data-effect={effect.badge}
    >
      {effect.label}
    </span>
  );
}
