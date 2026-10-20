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
  ) => { hardStop: boolean; stageGated: boolean | string[] };
  witnessInputFailHard: (stage: string) => boolean;
};

let sv: Sv;
beforeAll(async () => {
  sv = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs')).href)) as unknown as Sv;
});

const green = { G7: { score: 3, max: 3 }, G8: { score: 3, max: 3 } };
const recapture: Excl = { gates: new Set(['G8']), rules: new Set() };
const none: Excl = { gates: new Set(), rules: new Set() };

/** The full call-site decision, as step-validate's scorecard line composes it. R-EY (2026-10-20): the
 * other conditions are answered clean here, so only the hard stop / stage-gated signal moves the label. */
const fullScores = Object.fromEntries([1, 1, 1, 2, 2, 1, 3, 3, 3].map((m, i) => [`G${i}`, { score: m, max: m }]));
const cleanWords = Object.fromEntries(['STANDARDIZED', 'OBSERVABLE', 'SCALABLE', 'UNDERSTANDABLE', 'ACCURATE'].map((w) => [w, { status: 'PASS', deferred: 0 }]));
const label = (sc: { hardStop: boolean; stageGated?: string[] }, w: { answer?: string; hardStop?: boolean; attributed?: string[] } | null = { answer: 'PASS' }) =>
  gateE.standardFor('fixture-step', [], {
    slug: 'fixture_step',
    ...(sv.standardSignals as unknown as (...a: unknown[]) => Record<string, unknown>)({ g: fullScores, invariantFails: [], hardStopReasons: [], ...sc }, w, { slug: 'fixture_step', fiveWord: cleanWords, programmeItems: [], exceptions: [] }),
  });

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
    // the R-DT call site: standardFor saw only hardStop:false ⇒ V3; R-EY (2026-10-20) fails that closed ⇒ V2
    expect(gateE.standardFor('fixture-step', [], { slug: 'fixture_step', hardStop: false })).toBe('V2');
    expect(label({ hardStop: false, stageGated: ['G8'] })).toBe('V2');
    expect(label({ hardStop: false, stageGated: [] })).toBe('V3');
    expect(label({ hardStop: true, stageGated: [] })).toBe('V2');
    expect(label({ hardStop: false, stageGated: [] }, { answer: 'PASS', hardStop: true })).toBe('V2');
    expect(label({ hardStop: false, stageGated: [] }, { answer: 'PASS', hardStop: false, attributed: ['x'] })).toBe('V2');
    expect(sv.standardSignals({ hardStop: false, stageGated: ['#38'] }, null)).toMatchObject({ hardStop: false, stageGated: ['#38'] });
  });

  it('standardFor: stageGated true reads V2 even with hardStop false', () => {
    const clean = { crossStep: [], registry: [], gates: [], fiveWord: [], programme: [], exceptions: [] };
    expect(gateE.standardFor('fixture-step', [], { slug: 'fixture_step', hardStop: false, stageGated: true, ...clean })).toBe('V2');
    expect(gateE.standardFor('fixture-step', [], { slug: 'fixture_step', hardStop: false, stageGated: false, ...clean })).toBe('V3');
  });

  it('the scorecard line routes through standardSignals', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs'), 'utf8');
    expect(src).toMatch(/const labelArgs = \[[^\n]*\.\.\.standardSignals\(sc, witness44, /);
    expect(src).toMatch(/standard=\$\{standardText\}/);
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

// Spec 124 R-EY (McDonald's Airtight V3, operator y 2026-10-20: "the label V3 should only apply if all
// the standards are met, compute purity, gates standardized, cross step, registry."). Amends R-DT:
// `standard: V3` holds only when ALL NINE conditions hold, and the printed label lists the failing ones.
type Gs = Record<string, { score: number; max: number }>;
type Signals = Record<string, unknown>;
type SvEy = {
  standardSignals: (
    sc: { hardStop: boolean; hardStopReasons?: string[]; stageGated?: string[]; g?: Gs; invariantFails?: string[] },
    w: { answer?: string; rows?: string[]; hardStop?: boolean; attributed?: string[] } | null,
    extra?: { slug?: string; fiveWord?: Record<string, { status: string; deferred: number }> | null; programmeItems?: Array<Record<string, unknown>>; descriptor?: Record<string, unknown>; exceptions?: string[] | undefined },
  ) => Signals;
};
type GateEy = {
  standardFailures: (m: string, rows: unknown[], opts?: Signals) => string[];
  standardLabel: (m: string, rows: unknown[], opts?: Signals) => string;
  standardFor: (m: string, rows: unknown[], opts?: Signals) => string;
};

describe('R-EY — V3 only when all nine conditions hold; the label names the failing ones', () => {
  const ge = gateE as unknown as GateEy;
  const svy = () => sv as unknown as SvEy;
  const sig = (sc: Parameters<SvEy['standardSignals']>[0], w: Parameters<SvEy['standardSignals']>[1], extra: Parameters<SvEy['standardSignals']>[2] = {}) =>
    svy().standardSignals(sc, w, { slug: 'fixture_step', exceptions: [], ...extra });
  const fullG: Gs = {
    G0: { score: 1, max: 1 }, G1: { score: 1, max: 1 }, G2: { score: 1, max: 1 }, G3: { score: 2, max: 2 }, G4: { score: 2, max: 2 },
    G5: { score: 1, max: 1 }, G6: { score: 3, max: 3 }, G7: { score: 3, max: 3 }, G8: { score: 3, max: 3 },
  };
  const words = (over: Record<string, { status: string; deferred: number }> = {}) => ({
    STANDARDIZED: { status: 'PASS', deferred: 0 }, OBSERVABLE: { status: 'PASS', deferred: 0 }, SCALABLE: { status: 'PASS', deferred: 0 },
    UNDERSTANDABLE: { status: 'PASS', deferred: 0 }, ACCURATE: { status: 'PASS', deferred: 0 }, ...over,
  });
  const cleanSc: { hardStop: boolean; hardStopReasons: string[]; stageGated: string[]; g: Gs; invariantFails: string[] } = { hardStop: false, hardStopReasons: [], stageGated: [], g: fullG, invariantFails: [] };
  const pass44: { answer: string; rows: string[]; hardStop: boolean; attributed: string[] } = { answer: 'PASS', rows: [], hardStop: false, attributed: [] };
  const lbl = (sc = cleanSc, w: typeof pass44 | null = pass44, extra: Parameters<SvEy['standardSignals']>[2] = { fiveWord: words(), programmeItems: [], exceptions: [] }) =>
    ge.standardLabel('fixture-step', [], { slug: 'fixture_step', ...sig(sc, w, extra) });

  it('a fully clean step reads V3', () => {
    expect(lbl()).toBe('V3');
    expect(ge.standardFor('fixture-step', [], { slug: 'fixture_step', ...sig(cleanSc, pass44, { fiveWord: words(), programmeItems: [] }) })).toBe('V3');
  });

  it('(6) a 14/17 step reads V2 and names each gate short of max', () => {
    const g = { ...fullG, G3: { score: 1, max: 2 }, G4: { score: 0, max: 2 } };
    expect(lbl({ ...cleanSc, g })).toBe('V2 (fails: 6 G3 1/2, G4 0/2)');
  });

  it('(6) a scorecard hard-stop reason other than a fast invariant is a gates failure', () => {
    expect(lbl({ ...cleanSc, hardStop: true, hardStopReasons: ['G9'] })).toBe('V2 (fails: 6 G9)');
  });

  it('(7) a deferred five-word item reads V2; a FAIL word reads V2', () => {
    expect(lbl(cleanSc, pass44, { fiveWord: words({ SCALABLE: { status: 'PASS', deferred: 1 } }), programmeItems: [] })).toBe('V2 (fails: 7 SCALABLE 1 deferred)');
    expect(lbl(cleanSc, pass44, { fiveWord: words({ ACCURATE: { status: 'FAIL', deferred: 0 } }), programmeItems: [] })).toBe('V2 (fails: 7 ACCURATE FAIL)');
  });

  it('(8) an unmet cutover_prereq naming the step reads V2 — the ③ cutover predicate (checkCutoverPrereqs), applies_when honoured', () => {
    const items = [
      { id: 'STA-2', status: 'BUILT', gate: { kind: 'cutover_prereq', blocks: ['fixture_step'] } },
      { id: 'NICE-1', status: 'PARTIAL', gate: { kind: 'nice_to_have', blocks: ['fixture_step'] } },
      { id: 'OTHER', status: 'PARTIAL', gate: { kind: 'cutover_prereq', blocks: ['another_step'] } },
      { id: 'COND-1', status: 'PARTIAL', gate: { kind: 'cutover_prereq', blocks: ['fixture_step'], applies_when: { descriptor_path: 'archetype', equals: 'RECORDER' } } },
    ];
    expect(lbl(cleanSc, pass44, { fiveWord: words(), programmeItems: items, descriptor: { archetype: 'ASSERT' } })).toBe('V3');
    // applies_when matching, or no descriptor to answer it (conservative, as checkCutoverPrereqs), blocks
    expect(lbl(cleanSc, pass44, { fiveWord: words(), programmeItems: items, descriptor: { archetype: 'RECORDER' } })).toBe('V2 (fails: 8 COND-1)');
    expect(lbl(cleanSc, pass44, { fiveWord: words(), programmeItems: items })).toBe('V2 (fails: 8 COND-1)');
    const open = [...items, { id: 'LDG-10', status: 'PARTIAL', gate: { kind: 'cutover_prereq', blocks: ['fixture_step'] } }];
    expect(lbl(cleanSc, pass44, { fiveWord: words(), programmeItems: open, descriptor: { archetype: 'ASSERT' } })).toBe('V2 (fails: 8 LDG-10)');
  });

  it('(9) an exception citing no register rule id reads V2 and is named', () => {
    expect(lbl(cleanSc, pass44, { fiveWord: words(), programmeItems: [], exceptions: ['grandfathered:fixture_step no rule id'] })).toBe('V2 (fails: 9 grandfathered:fixture_step no rule id)');
    expect(lbl(cleanSc, pass44, { fiveWord: words(), programmeItems: [], exceptions: undefined })).toBe('V2 (fails: 9 not evaluated)');
  });

  it('(3) cross-step: #44 must answer PASS with nothing attributed', () => {
    expect(lbl(cleanSc, { answer: 'UNWITNESSED:fixture_step', rows: ['UNWITNESSED:fixture_step'], hardStop: false, attributed: [] })).toBe('V2 (fails: 3 #44 UNWITNESSED)');
    expect(lbl(cleanSc, { ...pass44, attributed: ['x'] })).toBe('V2 (fails: 3 #44 attributed 1)');
    expect(lbl(cleanSc, null)).toBe('V2 (fails: 3 #44 not evaluated)');
  });

  it('(4) registry: a failing invariant blocking the step reads V2', () => {
    expect(lbl({ ...cleanSc, hardStop: true, hardStopReasons: ['fast invariant'], invariantFails: ['#22'] })).toBe('V2 (fails: 4 #22)');
  });

  it('(5) a stage-gated red is listed', () => {
    expect(lbl({ ...cleanSc, stageGated: ['G8'] })).toBe('V2 (fails: 5 G8)');
  });

  it('(1)/(2) purity and ledger rows are listed; several conditions are listed in order', () => {
    const purity = { gate: 'E', step: 'fixture-step', item: 'compute-decides@x#1', filed: '2026-10-11' };
    const ledgerA = { gate: 'A', step: 'fixture_step', item: 'closed-bounds:x' };
    const s8 = sig({ ...cleanSc, g: { ...fullG, G4: { score: 0, max: 2 } } }, pass44, { fiveWord: words(), programmeItems: [{ id: 'LDG-10', status: 'PARTIAL', gate: { kind: 'cutover_prereq', blocks: ['fixture_step'] } }] });
    expect(ge.standardLabel('fixture-step', [ledgerA], { slug: 'fixture_step', ...s8 })).toBe('V2 (fails: 2 ledger A; 6 G4 0/2; 8 LDG-10)');
    const f = ge.standardFailures('fixture-step', [purity], { slug: 'fixture_step', ...s8 });
    expect(f[0]).toMatch(/^1 purity/);
  });

  it('fail closed: a caller that answers only hardStop (the R-DT signature) reads V2', () => {
    expect(ge.standardFor('fixture-step', [], { slug: 'fixture_step', hardStop: false })).toBe('V2');
    expect(ge.standardLabel('fixture-step', [], { slug: 'fixture_step', hardStop: false })).toBe('V2 (fails: 3 not evaluated; 4 not evaluated; 6 not evaluated; 7 not evaluated; 8 not evaluated; 9 not evaluated)');
    expect(ge.standardFor('fixture-step', [])).toBe('V2');
  });

  it('the scorecard line prints standardLabel through standardSignals with the five words, programme items, descriptor and exceptions', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs'), 'utf8');
    expect(src).toMatch(/const labelArgs = \[[^\n]*\.\.\.standardSignals\(sc, witness44, \{ slug: row\.slug, fiveWord, programmeItems: programmeItemsAll, descriptor: descriptorInfo\.descriptor, exceptions: exceptions9\.fails \}\)/);
    expect(src).toMatch(/const standardText = standardLabel\(\.\.\.labelArgs\);/);
    expect(src).toMatch(/standard: standardFor\(\.\.\.labelArgs\)/);
    expect(src).toMatch(/invariantFails,\n/);
  });
});
