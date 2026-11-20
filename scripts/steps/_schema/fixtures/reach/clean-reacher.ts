// @ts-nocheck
// Gate A clean twin (task-367): reaches the compute core and the step config reader, and breaks none of the reused rules.
import { resolveConfig } from '../../../../../scripts/lib/step/config.js';
export async function cleanReach(pool, descriptor, clock) {
  const core = await import('../../../../../scripts/lib/compute/demo-core.js');
  const { values } = await resolveConfig(pool, descriptor);
  return { core, values, at: clock() };
}
