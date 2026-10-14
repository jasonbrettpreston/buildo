// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-CG — S2 F3-3, ONE dead-tuple measurement)
// SPEC LINK: docs/specs/01-pipeline/122a_step_optimization_appendix.md:391-396 ("one measurement, one threshold name")
//
// Operator ruling 2026-10-13: every dead-tuple ratio in the fleet is dead / (live + dead). Four homes compute or
// display it — the runner (plausibility.js deadTupleRatio), the AEH compute, the /api/quality route and the
// anomaly detector in src/lib/quality/types.ts. This lock fails if any of them drifts back to dead / live.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { detectEngineHealthIssues, ENGINE_HEALTH_DEFAULTS, type EngineHealthEntry } from '@/lib/quality/types';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library */
const { deadTupleRatio } = require(path.join(process.cwd(), 'scripts/lib/step/plausibility.js')) as {
  deadTupleRatio: (live: number, dead: number) => number;
};
/* eslint-enable @typescript-eslint/no-require-imports */

const entry = (live: number, dead: number): EngineHealthEntry => ({
  table_name: 't', n_live_tup: live, n_dead_tup: dead, dead_ratio: 0, seq_scan: 0, idx_scan: 1, seq_ratio: 0,
});

describe('ONE dead-tuple measurement (R-CG)', () => {
  it('the runner measures dead / (live + dead)', () => {
    expect(deadTupleRatio(9000, 1000)).toBe(0.1);
    expect(deadTupleRatio(1000, 1000)).toBe(0.5);
  });

  it('the anomaly detector uses the same form: 1000 dead of 10000 total is 0.1 (not 0.111), so it does not exceed 0.1', () => {
    const t = { ...ENGINE_HEALTH_DEFAULTS, engine_health_dead_tuple_ratio_warn_max: 0.1 };
    const deadIssues = (e: EngineHealthEntry) =>
      detectEngineHealthIssues([e], t).filter((a) => JSON.stringify(a).includes('dead'));
    expect(deadIssues(entry(9000, 1000))).toHaveLength(0); // dead/live would be 0.111 > 0.1 → an anomaly
    expect(deadIssues(entry(8000, 2000))).toHaveLength(1); // 0.2 > 0.1 under either form
  });

  it('the /api/quality route and the AEH compute carry the same form (source lock)', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'src/app/api/quality/route.ts'), 'utf-8');
    expect(route).toContain('Math.round((dead / (live + dead)) * 10000) / 10000');
    expect(route).not.toContain('(dead / live)');
    const aeh = fs.readFileSync(path.join(process.cwd(), 'scripts/lib/compute/assert-engine-health.js'), 'utf-8');
    expect(aeh).toContain('deadTupleRatio(live, dead)');
    expect(aeh).toContain('n_dead_tup::float8 / (n_live_tup + n_dead_tup)');
  });
});
