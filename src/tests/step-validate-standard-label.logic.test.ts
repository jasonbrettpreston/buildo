// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DT, R-DI
//
// Output panel round 2 (McDonald's Airtight V3, 2026-10-18).
// N1 (R-DT): the printed `standard=` label is decided at the step-validate call site by
// `standardSignals(sc, witness44)` feeding `standardFor`. A pending stage that EXCLUDES a gate
// from the hard stop while that gate is ACTUALLY red (`stageGatedReds`) reads V2 — excluded
// alone is not enough. Before the fold the call site passed only `hardStop`, so a
// `shape_clean_pending_recapture` step with a red G8 printed V3.
// N2 (R-DI): #44 FAIL:INPUT (both early returns of witnessFor) is hard for a pending OR a
// converted slug, as `evaluateWitness` already is for every other #44 FAIL.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import * as gateE from '../../scripts/analysis/gates/compute-literals.mjs';

const REPO_ROOT = path.resolve(__dirname, '../../');

type Excl = { gates: Set<string>; rules: Set<number> };
type Sv = {
  stageGatedReds: (i: {
    g: Record<string, { score: number; max: number }>;
    g9: { pass: boolean };
    matrix?: Array<Record<string, unknown>>;
    excl: Excl;
    registryFails?: number[];
    stage?: string;
  }) => string[];
  standardSignals: (
    sc: { hardStop: boolean; stageGated?: string[] },
    w: { hardStop?: boolean; attributed?: string[] } | null,
  ) => { hardStop: boolean; stageGated: boolean };
  witnessInputFailHard: (stage: string) => boolean;
};

let sv: Sv;
beforeAll(async () => {
  sv = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs')).href)) as unknown as Sv;
});

const green = { G7: { score: 3, max: 3 }, G8: { score: 3, max: 3 } };
const recapture: Excl = { gates: new Set(['G8']), rules: new Set() };
const none: Excl = { gates: new Set(), rules: new Set() };

/** The full call-site decision, as step-validate's scorecard line composes it. */
const label = (sc: { hardStop: boolean; stageGated?: string[] }, w: { hardStop?: boolean; attributed?: string[] } | null = null) =>
  gateE.standardFor('fixture-step', [], { slug: 'fixture_step', ...sv.standardSignals(sc, w) });

describe('N1 R-DT — a stage-gated red reads V2', () => {
  it('stageGatedReds: excluded AND not passing, never merely excluded', () => {
    // shape_clean_pending_recapture, G8 green: nothing hidden
    expect(sv.stageGatedReds({ g: green, g9: { pass: true }, excl: recapture, stage: 'shape_clean_pending_recapture' })).toEqual([]);
    // G8 below max (not only 0) while excluded: red
    expect(sv.stageGatedReds({ g: { ...green, G8: { score: 2, max: 3 } }, g9: { pass: true }, excl: recapture, stage: 'shape_clean_pending_recapture' })).toEqual(['G8']);
    // the same red with no exclusion is the hard stop's business, not stage-gating
    expect(sv.stageGatedReds({ g: { ...green, G8: { score: 0, max: 3 } }, g9: { pass: true }, excl: none })).toEqual([]);
    // G9 failing under descriptor_only, an excluded Rule row unpinned enforced-red, a capture-derived registry fail
    const desc: Excl = { gates: new Set(['G7', 'G8', 'G9']), rules: new Set([4, 11, 12]) };
    expect(sv.stageGatedReds({
      g: green, g9: { pass: false }, excl: desc, stage: 'descriptor_only',
      matrix: [{ rule: 4, status: 'enforced-red', pinned: false }, { rule: 5, status: 'enforced-red', pinned: false }, { rule: 11, status: 'enforced-red', pinned: true }],
      registryFails: [38, 32],
    })).toEqual(['G9', 'Rule 4', '#38']);
    // #38 under shape_clean_pending_recapture (G8 excluded ⇒ #30/#31/#38-#40 excluded)
    expect(sv.stageGatedReds({ g: green, g9: { pass: true }, excl: recapture, registryFails: [38], stage: 'shape_clean_pending_recapture' })).toEqual(['#38']);
  });

  it('call site: no hard stop + a stage-gated red prints V2 (old behaviour printed V3)', () => {
    // the old call site: standardFor saw only hardStop:false ⇒ V3
    expect(gateE.standardFor('fixture-step', [], { slug: 'fixture_step', hardStop: false })).toBe('V3');
    expect(label({ hardStop: false, stageGated: ['G8'] })).toBe('V2');
    expect(label({ hardStop: false, stageGated: [] })).toBe('V3');
    expect(label({ hardStop: true, stageGated: [] })).toBe('V2');
    expect(label({ hardStop: false, stageGated: [] }, { hardStop: true })).toBe('V2');
    expect(label({ hardStop: false, stageGated: [] }, { hardStop: false, attributed: ['x'] })).toBe('V2');
    expect(sv.standardSignals({ hardStop: false, stageGated: ['#38'] }, null)).toEqual({ hardStop: false, stageGated: true });
  });

  it('standardFor: stageGated true reads V2 even with hardStop false', () => {
    expect(gateE.standardFor('fixture-step', [], { slug: 'fixture_step', hardStop: false, stageGated: true })).toBe('V2');
    expect(gateE.standardFor('fixture-step', [], { slug: 'fixture_step', hardStop: false, stageGated: false })).toBe('V3');
  });

  it('the scorecard line routes through standardSignals', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs'), 'utf8');
    expect(src).toMatch(/standard=\$\{standardFor\([^\n]*\.\.\.standardSignals\(sc, witness44\)/);
  });
});

describe('N2 R-DI — #44 FAIL:INPUT is hard for pending OR converted', () => {
  it('witnessInputFailHard', () => {
    expect(sv.witnessInputFailHard('pending')).toBe(true);
    expect(sv.witnessInputFailHard('converted')).toBe(true);
    expect(sv.witnessInputFailHard('other')).toBe(false);
  });

  it('both FAIL:INPUT early returns (fingerprint, derived-reads-steps) use it', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs'), 'utf8');
    for (const arm of ['fingerprint', 'derived-reads-steps']) {
      const re = new RegExp(`FAIL:INPUT:\\$\\{row\\.slug\\}:${arm}\`\\], hardStop: witnessInputFailHard\\(row\\.stage\\) \\}`);
      expect(src).toMatch(re);
    }
    expect(src).not.toMatch(/FAIL:INPUT[^\n]*hardStop: row\.stage === 'pending'/);
  });
});
