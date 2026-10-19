// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EB (a) (runner-owned step_* variables)
//
// Spec 124 R-EB (a) (RE-FREEZE #37): pipeline.step() resolves the library's closed RUNNER_VARIABLES for
// EVERY step, in the same logic_variables statement as declared config, and a missing row refuses the
// run. A fake pool that answers `FROM logic_variables` must therefore carry these rows too. This helper
// derives them from the ONE list (scripts/lib/step/config.js) and the committed seed defaults — a test
// never retypes a runner name or value.
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- the CJS library's closed export + the seed registry */
const { RUNNER_VARIABLES } = require(join(process.cwd(), 'scripts/lib/step/config.js')) as { RUNNER_VARIABLES: readonly string[] };
const SEED = require(join(process.cwd(), 'scripts/seeds/logic_variables.json')) as Record<string, { default: number }>;
/* eslint-enable @typescript-eslint/no-require-imports */

/** The resolved runner values at their seed defaults (what config.js returns as `runner`). */
export function runnerValues(): Record<string, number> {
  return Object.fromEntries(RUNNER_VARIABLES.map((k) => [k, SEED[k]!.default]));
}

/** logic_variables rows for every runner-owned name, at its seed default. */
export function runnerVariableRows(): Array<{ variable_key: string; variable_value: number; variable_value_json: null; updated_at: null }> {
  return RUNNER_VARIABLES.map((k) => ({ variable_key: k, variable_value: SEED[k]!.default, variable_value_json: null, updated_at: null }));
}

export { RUNNER_VARIABLES };
