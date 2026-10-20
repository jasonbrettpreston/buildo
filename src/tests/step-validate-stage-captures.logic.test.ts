// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-K / R-DT (stage gating); wave-4 W4A-R6 (operator y
//            2026-10-18) — the one "awaiting captures" predicate, keyed on the declared stage.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// rule-map: R-FH — the register row for W4A-R6 (integrate-12): the stage-gated capture predicate
describe('W4A-R6 — stageAwaitsCaptures (one predicate for the capture-derived gates)', () => {
  it('is true exactly for the stages that exclude G8, and agrees with stageExcludesRegistry on #30/#31/#38-#40', async () => {
    const sv = (await import(pathToFileURL(path.join(process.cwd(), 'scripts/analysis/step-validate.mjs')).href)) as {
      stageAwaitsCaptures: (s?: string) => boolean;
      stageExcludesRegistry: (id: number, s?: string) => boolean;
    };
    const cases: Array<[string | undefined, boolean]> = [
      [undefined, false], ['red_suite', false], ['descriptor_only', true], ['compute_ported', true],
      ['runner_wired', false], ['shape_clean_pending_recapture', true], ['shape_clean', false],
    ];
    for (const [stage, want] of cases) {
      expect(sv.stageAwaitsCaptures(stage), String(stage)).toBe(want);
      for (const id of [30, 31, 38, 39, 40]) expect(sv.stageExcludesRegistry(id, stage), `${stage} #${id}`).toBe(want);
    }
  });
});
