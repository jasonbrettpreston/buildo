// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (:804-815); 132_step_standard_handbook.md §6 R-BA, core.8, core.9
//
// COMPLY.3 stage 1 (task-367) — Gate A, `scripts/analysis/gates/compute-reach.mjs`, proven in BOTH directions (08_agents.md:462 "Every lock is proven in
// BOTH directions"): RED on a planted reacher (console, wall clock, bare fetch, process.env, module numeric const), GREEN on a clean one; a file that
// breaks rules but never reaches the core is not listed; a file that imports a reacher is listed as a one-hop caller. Report-only: nothing here wires it.
import { describe, it, expect } from 'vitest';
import * as gate from '../../scripts/analysis/gates/compute-reach.mjs';

const FIX = 'scripts/steps/_schema/fixtures/reach';
const ROOT = process.cwd();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (): any => gate.run(ROOT, [FIX]);

describe('gate A — engine compute reached outside the scanned compute folder', () => {
  it('A1 RED: the planted reacher is listed and five reused rules fire on it', () => {
    const { reachers, findings } = run();
    expect(reachers.map((r: { file: string }) => r.file)).toContain(`${FIX}/bad-reacher.ts`);
    const ids = new Set(findings.filter((f: { file: string }) => f.file.endsWith('bad-reacher.ts')).map((f: { ruleId: string }) => f.ruleId));
    for (const id of ['compute-no-console', 'compute-no-wall-clock', 'compute-no-bare-fetch', 'compute-no-process-env', 'compute-no-module-numeric-const']) {
      expect(ids.has(id), `rule ${id} did not fire on the planted reacher`).toBe(true);
    }
  });

  it('A2 GREEN: the clean reacher is listed (static + dynamic reach) and has zero findings', () => {
    const { reachers, findings } = run();
    const clean = reachers.find((r: { file: string }) => r.file.endsWith('clean-reacher.ts'));
    expect(clean, 'clean reacher not listed').toBeTruthy();
    expect(clean.hits.map((h: { form: string }) => h.form).sort()).toEqual(['dynamic', 'static']);
    expect(findings.filter((f: { file: string }) => f.file.endsWith('clean-reacher.ts'))).toEqual([]);
  });

  it('A3: a file that never imports the core is not listed and not scanned', () => {
    const { reachers, callers, findings } = run();
    expect(reachers.concat(callers).some((r: { file: string }) => r.file.endsWith('not-a-reacher.ts'))).toBe(false);
    expect(findings.some((f: { file: string }) => f.file.endsWith('not-a-reacher.ts'))).toBe(false);
  });

  it('A4: a file importing a reacher is a one-hop caller and is scanned', () => {
    const { callers, findings } = run();
    expect(callers.map((c: { file: string }) => c.file)).toContain(`${FIX}/caller.ts`);
    expect(findings.some((f: { file: string; ruleId: string }) => f.file.endsWith('caller.ts') && f.ruleId === 'compute-no-wall-clock')).toBe(true);
  });

  it('A5: the applied rule ids all exist in the reused rule file; the dynamic-require id is excluded', () => {
    expect(() => gate.reusedRules(ROOT)).not.toThrow();
    expect(gate.GATE_A_RULE_IDS).not.toContain('compute-forbidden-require-dynamic');
    expect(gate.reaches("import x from '../../scripts/lib/step/config.js'").length).toBe(1);
    expect(gate.reaches("const y = require('../lib/compute-helper')").length).toBe(0);
  });
});
