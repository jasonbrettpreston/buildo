// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md §R-KI (a step's loop set runs at commit, push and CI; red-by-design tests live in pending/)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md section 3 (regression-set groups and their dependencies on MB-31, MB-64 and MB-67)
import { describe, it } from 'vitest';

describe('MB-68 arms waiting on other tasks', () => {
  it.todo('golden25 group joins the regression set when lane T\'s seam runRow exists (MB-64)');
  it.todo('examples-inc1 group (MB-64)');
  it.todo('invariants group (MB-64)');
  it.todo('rows_from_two_increments reads the increment tag on catalogue rows (MB-31 adds the field)');
  it.todo('value_changed_unregistered on the 25 once expected_sha is printed by the seam (MB-64)');
  it.todo('loop-gate wired into the dispatcher as required (MB-67 flips external_arms.loop.required after MB-68 lands)');
});
