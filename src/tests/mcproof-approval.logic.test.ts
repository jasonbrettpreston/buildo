// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-436..M-447 (McProof, MB-77 sub-item (b)).
//
// RED-first test for the three approval rules of the McProof builder:
//   item 4  stage-order gate (MCPROOF-6, CARD-mcproof-lessons item 1) and planned n/a;
//   item 5  the A7 mandatory-stage table per layer + the A6/A7 path overrides;
//   item 7  deriveOverall (MCPROOF-12) and the C3.4 model-agreement rule.
//
// The modules `scripts/analysis/mcproof/approval.mjs` (and `records.mjs` for cityState)
// do not exist yet: importing them is the red. Every fixture is built inline here; the
// shipped thresholds come from the config file through loadConfig(), never as literals
// in code. Where a case needs a different value the config is copied and one key changed
// with a recomputed config_sha.

import { describe, it, expect } from 'vitest';
import * as approval from '../../scripts/analysis/mcproof/approval.mjs';
import * as records from '../../scripts/analysis/mcproof/records.mjs';
import * as sizing from '../../scripts/analysis/mcproof/sizing.mjs';
import * as cfg from '../../scripts/analysis/mcproof/config.mjs';

// ---------------------------------------------------------------------------- types

type Vocab = Record<string, unknown>;
type Values = Record<string, unknown>;
type Config = { values: Values; config_sha: string };
type Row = Record<string, unknown>;

type Api = {
  loadConfig: () => Config;
  sha16: (x: unknown) => string;
  cv: (config: Config, key: string) => unknown;
  keySha: (config: Config, key: string) => string;
  mandatoryStages: (layer: string, opts: { path?: string; lowRisk?: boolean; config: Config }) => {
    required: string[];
    may_na: string[];
  };
  plannedNa: (sizingRow: Row, config: Config) => Record<string, { reason: string; cites_config?: string; config_key_sha?: string }>;
  stageOrderGate: (recordsIn: Record<string, Record<string, Row>>, config: Config) => { open: boolean; unfinished: string[] };
  mayCall: (
    stageKey: string,
    id: string,
    gate: { open: boolean; unfinished: string[] },
    recordsIn: Record<string, Record<string, Row>>,
  ) => boolean;
  deriveOverall: (
    record: Record<string, Row>,
    ctx: { layer: string; path?: string; lowRisk?: boolean; operator_answered?: boolean; accepted_findings?: Row[]; config: Config },
  ) => { state: string; text: string };
};

type RecApi = {
  cityState: (approvalRow: Row | null, sizingRow: Row | null) => { status: string; reason?: string };
  settleRecord: (record: Record<string, Row>, opts: { example_sha: string; config: Config }) => Record<string, Row>;
  exampleSha: (example: Row) => string;
  compareIds: (a: string, b: string) => number;
};

type SizingApi = {
  computeSizing: (input: {
    examples: Row[];
    approvals: Row;
    reviews: Row;
    amended_rulings: Row;
    config: Config;
  }) => { config_sha: string; inputs_sha: string; rows: Row[] };
};

const A = approval as unknown as Api;
const R = records as unknown as RecApi;
const S = sizing as unknown as SizingApi;
const C = cfg as unknown as Pick<Api, 'loadConfig' | 'sha16' | 'cv' | 'keySha'>;

// ----------------------------------------------------------------------- config helpers

const BASE: Config = C.loadConfig();

function withValue(key: string, value: unknown): Config {
  const values: Values = { ...BASE.values, [key]: value };
  return { values, config_sha: C.sha16(values) };
}

// The switch state is a value case, not a change of the shipped file: both states are
// exercised, each with a recomputed config_sha.
const SWITCH_ON: Config = withValue('quick_arithmetic_skips_stage5', true);
const SWITCH_OFF: Config = withValue('quick_arithmetic_skips_stage5', false);
const LOW_RISK: Row = { layer: 'Arithmetic', path: 'quick' };

// ----------------------------------------------------------------------------- vocab

const ZERO_CFG = '0'.repeat(16);

function stageRecord(extra: Row = {}): Row {
  return {
    status: 'open',
    note: '',
    model: '',
    attempts: 0,
    example_sha: 'abc',
    config_sha: ZERO_CFG,
    ...extra,
  };
}

function rec(over: Record<string, Row>): Record<string, Row> {
  const out: Record<string, Row> = {
    question: stageRecord(),
    city: stageRecord(),
    regression: stageRecord(),
    blind: stageRecord(),
    claude: stageRecord(),
    arithmetic: stageRecord(),
  };
  for (const [k, v] of Object.entries(over)) out[k] = { ...(out[k] ?? {}), ...v };
  return out;
}

// An example whose whole set is finished at stage 0 and City, so the gate is open.
function finishedRec(over: Record<string, Row> = {}): Record<string, Row> {
  return rec({
    question: { status: 'approved', model: 'deepseek', attempts: 1, ...(over.question ?? {}) },
    city: { status: 'n/a', reason: 'no city row for this clause', ...(over.city ?? {}) },
    ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== 'question' && k !== 'city')),
  });
}

const ID_A = 'e1';
const ID_B = 'e2';

function recordSet(ids: string[], make: (id: string) => Record<string, Row>): Record<string, Record<string, Row>> {
  const out: Record<string, Record<string, Row>> = {};
  for (const id of ids) out[id] = make(id);
  return out;
}

// ------------------------------------------------------------------------ vocab helpers

function assertSortedUnique(actual: string[]): void {
  expect([...actual].sort()).toEqual(actual);
  expect(new Set(actual).size).toEqual(actual.length);
}

function asSet(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}

// ================================================================================ item 4

describe('MB-77 (b) approval — stage order gate and mayCall', () => {
  it('MB-77 (b) keeps the gate closed while any example question is open, even when another example is approved at stage 0', () => {
    const set = recordSet([ID_A, ID_B], (id) => finishedRec(id === ID_B ? { question: { status: 'open' } } : {}));
    const gate = A.stageOrderGate(set, BASE);
    expect(gate.open).toBe(false);
    for (const id of [ID_A, ID_B]) {
      expect(A.mayCall('blind', id, gate, set)).toBe(false);
      expect(A.mayCall('arithmetic', id, gate, set)).toBe(false);
      expect(A.mayCall('claude', id, gate, set)).toBe(false);
    }
    // A plain open is unfinished and the example appears in the unfinished list.
    expect(gate.unfinished).toContain(ID_B);
    expect(gate.unfinished).not.toContain(ID_A);
  });

  it('MB-77 (b) keeps the gate closed while an errored example still has retries left', () => {
    const maxRetries = Number(C.cv(BASE, 'max_retries_per_stage'));
    // attempts - 1 < max_retries_per_stage -> retries remain
    const set = recordSet([ID_A, ID_B], (id) =>
      finishedRec(id === ID_B ? { question: { status: 'errored', model: 'deepseek', attempts: 1 } } : {}),
    );
    expect(1 - 1 < maxRetries).toBe(true);
    const gate = A.stageOrderGate(set, BASE);
    expect(gate.open).toBe(false);
    expect(A.mayCall('blind', ID_A, gate, set)).toBe(false);
    expect(A.mayCall('arithmetic', ID_A, gate, set)).toBe(false);
    expect(A.mayCall('claude', ID_A, gate, set)).toBe(false);
  });

  it('MB-77 (b) opens the gate once every stage-0 and city is finished (approved, differs, routed needs_you, parked, n/a)', () => {
    const finishedStates: Row[] = [
      { status: 'approved', model: 'deepseek', attempts: 1 },
      { status: 'differs', model: 'deepseek', attempts: 1 },
      { status: 'open', routed: 'needs_you', cannot_decide: true },
      { status: 'parked', model: 'deepseek', attempts: 3 },
      { status: 'n/a', reason: 'no city row for this clause' },
    ];
    for (const q of finishedStates) {
      for (const c of finishedStates) {
        const set = recordSet([ID_A], () => finishedRec({ question: q, city: c }));
        const gate = A.stageOrderGate(set, BASE);
        expect(gate.open).toBe(true);
        expect(gate.unfinished).toEqual([]);
      }
    }
    // a parked stage at stage 0 is not reported unfinished
    const parkedGate = A.stageOrderGate(recordSet([ID_A], () => finishedRec({ question: finishedStates[3]! })), BASE);
    expect(parkedGate.unfinished).toEqual([]);
    expect(parkedGate.open).toBe(true);
  });

  it('MB-77 (b) opens the gate but still refuses blind and claude for an example whose question is not approved', () => {
    const set = recordSet([ID_A, ID_B], (id) =>
      ID_B === id
        ? finishedRec({ question: { status: 'parked', model: 'deepseek', attempts: 3 } })
        : finishedRec(),
    );
    const gate = A.stageOrderGate(set, BASE);
    expect(gate.open).toBe(true);
    expect(A.mayCall('question', ID_B, gate, set)).toBe(true);
    expect(A.mayCall('regression', ID_B, gate, set)).toBe(true);
    expect(A.mayCall('blind', ID_B, gate, set)).toBe(false);
    expect(A.mayCall('arithmetic', ID_B, gate, set)).toBe(false);
    expect(A.mayCall('claude', ID_B, gate, set)).toBe(false);
    expect(A.mayCall('blind', ID_A, gate, set)).toBe(true);
  });

  it('MB-77 (b) blocks blind for every example while the city stage is open (no approval row seeds it open)', () => {
    const cityOpen = R.cityState(null, null);
    expect(cityOpen.status).toBe('open');
    const set = recordSet([ID_A, ID_B], () => finishedRec({ city: { status: cityOpen.status } }));
    const gate = A.stageOrderGate(set, BASE);
    expect(gate.open).toBe(false);
    expect(gate.unfinished).toContain(ID_A);
    expect(gate.unfinished).toContain(ID_B);
    for (const id of [ID_A, ID_B]) expect(A.mayCall('blind', id, gate, set)).toBe(false);
  });

  it('MB-77 (b) lets claude through only after blind is finished for that example', () => {
    const blindUnfinished = recordSet([ID_A], () => finishedRec({ blind: { status: 'errored', model: 'deepseek', attempts: 1 } }));
    const gateA = A.stageOrderGate(blindUnfinished, BASE);
    expect(gateA.open).toBe(true);
    expect(A.mayCall('claude', ID_A, gateA, blindUnfinished)).toBe(false);

    const blindFinished = recordSet([ID_A], () => finishedRec({ blind: { status: 'approved', model: 'deepseek', attempts: 1 } }));
    const gateB = A.stageOrderGate(blindFinished, BASE);
    expect(gateB.open).toBe(true);
    expect(A.mayCall('claude', ID_A, gateB, blindFinished)).toBe(true);
  });

  it('MB-77 (b) treats an errored stage with its retries exhausted as finished and orders unfinished ids with compareIds', () => {
    const maxRetries = Number(C.cv(BASE, 'max_retries_per_stage'));
    // attempts - 1 >= max_retries_per_stage -> the stage becomes parked (A4) and counts as finished.
    const exhausted = finishedRec({ question: { status: 'errored', model: 'deepseek', attempts: maxRetries + 1 } });
    const gateA = A.stageOrderGate(recordSet(['e9'], () => exhausted), BASE);
    expect(gateA.open).toBe(true);
    expect(gateA.unfinished).toEqual([]);

    // An errored stage with retries left is unfinished, and the list is in compareIds order (e9 before e10).
    const retrying = finishedRec({ question: { status: 'errored', model: 'deepseek', attempts: 1 } });
    const gateB = A.stageOrderGate(recordSet(['e10', 'e9'], () => retrying), BASE);
    expect(gateB.open).toBe(false);
    expect(gateB.unfinished).toEqual(['e9', 'e10']);
  });

  it('MB-77 (b) lets claude through once blind is finished as n/a or routed needs_you, not only approved', () => {
    const blindNa = recordSet([ID_A], () => finishedRec({ blind: { status: 'n/a', reason: 'sizing rule quick' } }));
    const gateA = A.stageOrderGate(blindNa, BASE);
    expect(gateA.open).toBe(true);
    expect(A.mayCall('blind', ID_A, gateA, blindNa)).toBe(true);
    expect(A.mayCall('claude', ID_A, gateA, blindNa)).toBe(true);

    const blindRouted = recordSet([ID_A], () => finishedRec({ blind: { status: 'open', routed: 'needs_you', cannot_decide: true } }));
    const gateB = A.stageOrderGate(blindRouted, BASE);
    expect(gateB.open).toBe(true);
    expect(A.mayCall('claude', ID_A, gateB, blindRouted)).toBe(true);

    // A plain open blind refuses claude even with the gate open and the question approved.
    const blindOpen = recordSet([ID_A], () => finishedRec({ blind: { status: 'open' } }));
    const gateC = A.stageOrderGate(blindOpen, BASE);
    expect(gateC.open).toBe(true);
    expect(A.mayCall('claude', ID_A, gateC, blindOpen)).toBe(false);
  });

  it('MB-77 (b) never plans claude as n/a for a low-risk Arithmetic example, in either switch state', () => {
    const on = A.plannedNa(LOW_RISK, SWITCH_ON);
    const off = A.plannedNa(LOW_RISK, SWITCH_OFF);
    expect(Object.prototype.hasOwnProperty.call(on, 'claude')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(off, 'claude')).toBe(false);
    expect(asSet(Object.keys(on))).toEqual(['arithmetic', 'blind', 'regression']);
    expect(asSet(Object.keys(off))).toEqual(['blind', 'regression']);
  });

  it('MB-77 (b) plans the non-low-risk quick n/a set and the low-risk arithmetic n/a with its config citation', () => {
    const quick = A.plannedNa({ layer: 'Reading', path: 'quick' }, SWITCH_ON);
    expect(asSet(Object.keys(quick))).toEqual(['blind', 'claude', 'regression']);
    expect(quick.blind?.reason).toMatch(/sizing rule /);
    expect(quick.claude?.reason).toMatch(/sizing rule /);

    const low = A.plannedNa(LOW_RISK, SWITCH_ON);
    expect(low.arithmetic?.cites_config).toBe('quick_arithmetic_skips_stage5');
    expect(low.arithmetic?.config_key_sha).toBe(C.keySha(SWITCH_ON, 'quick_arithmetic_skips_stage5'));
    expect(low.arithmetic?.reason).toMatch(/low-risk Arithmetic/);
    expect(low.arithmetic?.reason).toMatch(/CARD-mcproof-lessons item 2/);

    const off = A.plannedNa(LOW_RISK, SWITCH_OFF);
    expect(Object.prototype.hasOwnProperty.call(off, 'arithmetic')).toBe(false);
  });
});

// ================================================================================ item 5

describe('MB-77 (b) approval — A7 mandatory-stage table as literals', () => {
  const TABLE: Record<string, { required: string[]; may_na: string[] }> = {
    Source: {
      required: ['question', 'claude', 'arithmetic'],
      may_na: ['city', 'blind', 'regression'],
    },
    Reading: {
      required: ['question', 'regression', 'blind', 'claude'],
      may_na: ['city', 'arithmetic'],
    },
    Ruling: {
      required: ['question', 'regression', 'blind', 'claude', 'operator_answered'],
      may_na: ['city', 'arithmetic'],
    },
    Inputs: {
      required: ['question', 'regression', 'claude'],
      may_na: ['blind', 'city', 'arithmetic'],
    },
    Arithmetic: {
      required: ['question', 'blind', 'claude', 'arithmetic'],
      may_na: ['city', 'regression'],
    },
  };

  for (const [layer, expected] of Object.entries(TABLE)) {
    it(`MB-77 (b) gives layer ${layer} exactly its required and may_na stages`, () => {
      const got = A.mandatoryStages(layer, { path: 'full', config: BASE });
      expect(asSet(got.required)).toEqual(asSet(expected.required));
      expect(asSet(got.may_na)).toEqual(asSet(expected.may_na));
    });
  }

  it('MB-77 (b) lists every table row for the sample path exactly as for the layer table', () => {
    for (const [layer, expected] of Object.entries(TABLE)) {
      const got = A.mandatoryStages(layer, { path: 'sample', config: BASE });
      expect(asSet(got.required)).toEqual(asSet(expected.required));
      expect(asSet(got.may_na)).toEqual(asSet(expected.may_na));
    }
  });

  it("MB-77 (b) narrows the quick path to the configured quick_path_stages and throws unknown_layer for an unknown layer", () => {
    const quick = A.mandatoryStages('Reading', { path: 'quick', config: BASE });
    expect(asSet(quick.required)).toEqual(asSet(C.cv(BASE, 'quick_path_stages') as string[]));
    expect(asSet(quick.required)).toEqual(['arithmetic', 'question']);
    expect(() => A.mandatoryStages('NotALayer', { path: 'full', config: BASE })).toThrow(/unknown_layer:NotALayer/);
  });

  it('MB-77 (b) with quick_arithmetic_skips_stage5 true makes a low-risk Arithmetic example approvable on question + claude', () => {
    const stages = A.mandatoryStages('Arithmetic', { path: 'quick', lowRisk: true, config: SWITCH_ON });
    expect(asSet(stages.required)).toEqual(['claude', 'question']);
    expect(stages.required).not.toContain('blind');
    expect(stages.required).not.toContain('arithmetic');

    const record = recordSet([ID_A], () =>
      finishedRec({
        question: { status: 'approved', model: 'deepseek', attempts: 1 },
        claude: { status: 'approved', model: 'claude', attempts: 1 },
        blind: { status: 'n/a', reason: 'low-risk Arithmetic, sizing rule quick, CARD-mcproof-lessons item 2', cites_config: 'quick_arithmetic_skips_stage5', config_key_sha: C.keySha(SWITCH_ON, 'quick_arithmetic_skips_stage5') },
        arithmetic: { status: 'n/a', reason: 'low-risk Arithmetic, sizing rule quick, CARD-mcproof-lessons item 2', cites_config: 'quick_arithmetic_skips_stage5', config_key_sha: C.keySha(SWITCH_ON, 'quick_arithmetic_skips_stage5') },
        regression: { status: 'n/a', reason: 'sizing rule quick' },
      }),
    )[ID_A]!;
    const overall = A.deriveOverall(record, {
      layer: 'Arithmetic',
      path: 'quick',
      lowRisk: true,
      operator_answered: false,
      accepted_findings: [],
      config: SWITCH_ON,
    });
    expect(overall.state).toBe('approved');
  });

  it('MB-77 (b) with quick_arithmetic_skips_stage5 false requires claude and arithmetic, so a missing claude blocks', () => {
    const stages = A.mandatoryStages('Arithmetic', { path: 'quick', lowRisk: true, config: SWITCH_OFF });
    expect(asSet(stages.required)).toEqual(['arithmetic', 'claude', 'question']);
    expect(stages.required).toContain('claude');
    expect(stages.required).toContain('arithmetic');

    const record = recordSet([ID_A], () =>
      finishedRec({
        question: { status: 'approved', model: 'deepseek', attempts: 1 },
        claude: { status: 'open' },
        arithmetic: { status: 'approved', model: 'deepseek', attempts: 1 },
        blind: { status: 'n/a', reason: 'low-risk Arithmetic, sizing rule quick, CARD-mcproof-lessons item 2' },
        regression: { status: 'n/a', reason: 'sizing rule quick' },
      }),
    )[ID_A]!;
    const overall = A.deriveOverall(record, {
      layer: 'Arithmetic',
      path: 'quick',
      lowRisk: true,
      operator_answered: false,
      accepted_findings: [],
      config: SWITCH_OFF,
    });
    expect(overall.state).toBe('needs_you');
  });
});

// ================================================================================ item 7

function blindClaudeSameModel(): Record<string, Row> {
  // Full-review Reading example: every table stage approved with the SAME model string
  // on blind (stage 3) and claude (stage 4), city n/a with a reason.
  return finishedRec({
    question: { status: 'approved', model: 'deepseek', attempts: 1 },
    regression: { status: 'approved', model: 'deepseek', attempts: 1 },
    blind: { status: 'approved', model: 'deepseek-v4', attempts: 1 },
    claude: { status: 'approved', model: 'deepseek-v4', attempts: 1 },
  });
}

function fullCtx(extra: Row = {}): { layer: string; path: string; lowRisk: boolean; operator_answered: boolean; accepted_findings: Row[]; config: Config } {
  return {
    layer: 'Reading',
    path: 'full',
    lowRisk: false,
    operator_answered: false,
    accepted_findings: [],
    config: BASE,
    ...(extra as Record<string, never>),
  };
}

describe('MB-77 (b) approval — deriveOverall', () => {
  it('MB-77 (b) approves a quick example with blind and claude n/a and no model comparison', () => {
    const record = recordSet([ID_A], () =>
      finishedRec({
        question: { status: 'approved', model: 'deepseek', attempts: 1 },
        regression: { status: 'n/a', reason: 'sizing rule quick' },
        blind: { status: 'n/a', reason: 'sizing rule quick' },
        claude: { status: 'n/a', reason: 'sizing rule quick' },
        arithmetic: { status: 'approved', model: 'deepseek', attempts: 1 },
      }),
    )[ID_A]!;
    const overall = A.deriveOverall(record, {
      layer: 'Reading',
      path: 'quick',
      lowRisk: false,
      operator_answered: false,
      accepted_findings: [],
      config: BASE,
    });
    expect(overall.state).toBe('approved');
    expect(typeof overall.text).toBe('string');
  });

  it('MB-77 (b) sends a full review to needs_you when blind and claude carry the same non-empty model (C3.4 independence)', () => {
    const overall = A.deriveOverall(blindClaudeSameModel(), fullCtx());
    expect(overall.state).toBe('needs_you');
  });

  it('MB-77 (b) does not compare two n/a stages with no model', () => {
    const record = recordSet([ID_A], () =>
      finishedRec({
        question: { status: 'approved', model: 'deepseek', attempts: 1 },
        regression: { status: 'n/a', reason: 'sizing rule quick' },
        blind: { status: 'n/a', reason: 'sizing rule quick' },
        claude: { status: 'n/a', reason: 'sizing rule quick' },
        arithmetic: { status: 'approved', model: 'deepseek', attempts: 1 },
      }),
    )[ID_A]!;
    expect(record.blind?.model).toBe('');
    expect(record.claude?.model).toBe('');
    expect(A.deriveOverall(record, { layer: 'Reading', path: 'quick', lowRisk: false, operator_answered: false, accepted_findings: [], config: BASE }).state).toBe('approved');
  });

  it('MB-77 (b) lets an accepted finding with reason and accepted_by satisfy a differs stage', () => {
    const finding: Row = { stage: 'blind', finding_id: 'f1', reason: 'grounder is right, arithmetic slip', accepted_by: 'operator', date: '2026-10-31' };
    const record = finishedRec({
      question: { status: 'approved', model: 'deepseek', attempts: 1 },
      regression: { status: 'approved', model: 'deepseek', attempts: 1 },
      blind: { status: 'differs', model: 'deepseek', attempts: 1 },
      claude: { status: 'approved', model: 'claude', attempts: 1 },
      arithmetic: { status: 'approved', model: 'deepseek', attempts: 1 },
    });
    const withFinding = A.deriveOverall(record, fullCtx({ accepted_findings: [finding] }));
    expect(withFinding.state).toBe('approved');

    const withoutFinding = A.deriveOverall(record, fullCtx());
    expect(withoutFinding.state).toBe('change');
  });

  it('MB-77 (b) does not accept a finding without reason or accepted_by and yields change', () => {
    const record = finishedRec({
      question: { status: 'approved', model: 'deepseek', attempts: 1 },
      regression: { status: 'approved', model: 'deepseek', attempts: 1 },
      blind: { status: 'differs', model: 'deepseek', attempts: 1 },
      claude: { status: 'approved', model: 'claude', attempts: 1 },
    });
    const thin: Row = { stage: 'blind', finding_id: 'f2', reason: '', accepted_by: '', date: '2026-10-31' };
    expect(A.deriveOverall(record, fullCtx({ accepted_findings: [thin] })).state).toBe('change');
  });

  it('MB-77 (b) sends a Ruling example to needs_you until operator_answered', () => {
    const record = finishedRec({
      question: { status: 'approved', model: 'deepseek', attempts: 1 },
      regression: { status: 'approved', model: 'deepseek', attempts: 1 },
      blind: { status: 'approved', model: 'deepseek', attempts: 1 },
      claude: { status: 'approved', model: 'claude', attempts: 1 },
      arithmetic: { status: 'n/a', reason: 'no number in this example' },
    });
    const rulingCtx = { layer: 'Ruling', path: 'full', lowRisk: false, operator_answered: false, accepted_findings: [], config: BASE };
    expect(A.deriveOverall(record, rulingCtx).state).toBe('needs_you');
    expect(A.deriveOverall(record, { ...rulingCtx, operator_answered: true }).state).toBe('approved');
  });

  it('MB-77 (b) sends errored and cannot_decide records to needs_you and ignores a hand-written overall', () => {
    const errored = finishedRec({ question: { status: 'errored', model: 'deepseek', attempts: 1 } });
    expect(A.deriveOverall(errored, fullCtx()).state).toBe('needs_you');

    const undecided = finishedRec({ question: { status: 'open', routed: 'needs_you', cannot_decide: true } });
    expect(A.deriveOverall(undecided, fullCtx()).state).toBe('needs_you');

    const handWritten = { ...blindClaudeSameModel(), overall: { state: 'approved', text: 'trust me' } };
    expect(A.deriveOverall(handWritten, fullCtx()).state).toBe('needs_you');
  });

  it('MB-77 (b) sends an n/a stage outside may_na to needs_you', () => {
    // Reading: blind is required, so an n/a blind is not satisfied even with a reason.
    const record = finishedRec({
      question: { status: 'approved', model: 'deepseek', attempts: 1 },
      regression: { status: 'approved', model: 'deepseek', attempts: 1 },
      blind: { status: 'n/a', reason: 'sizing rule quick' },
      claude: { status: 'approved', model: 'claude', attempts: 1 },
    });
    expect(A.deriveOverall(record, fullCtx()).state).toBe('needs_you');
  });

  it('MB-77 (b) sends a record whose stage sha went stale to needs_you once settled', () => {
    const example: Row = {
      id: ID_A,
      layer: 'Reading',
      increment: 2,
      question: 'is a one metre fence exempt?',
      scenario: 'a fence on the boundary',
      inputs: { length_m: 1 },
      clause_chain: ['C1'],
      rulings_cited: ['M-100'],
      formula_row: 'R7',
      branch: 'exempt',
      is_new: false,
      answer: 'yes',
    };
    const sha = R.exampleSha(example);
    const record = finishedRec({
      question: { status: 'approved', model: 'deepseek', attempts: 1, example_sha: sha },
      regression: { status: 'approved', model: 'deepseek', attempts: 1, example_sha: sha },
      blind: { status: 'approved', model: 'deepseek', attempts: 1, example_sha: sha },
      claude: { status: 'approved', model: 'claude', attempts: 1, example_sha: sha },
      arithmetic: { status: 'n/a', reason: 'no number in this example', example_sha: sha },
      city: { status: 'n/a', reason: 'no city row for this clause', example_sha: sha },
    });
    const fresh = R.settleRecord(record, { example_sha: sha, config: BASE });
    expect(fresh.question?.status).toBe('approved');
    expect(fresh.city?.status).toBe('n/a');
    expect(A.deriveOverall(fresh, fullCtx()).state).toBe('approved');

    // A stage recorded against another example sha reads `open`, so the required stage is not satisfied.
    const stale = R.exampleSha({ ...example, answer: 'no' });
    const settled = R.settleRecord(record, { example_sha: stale, config: BASE });
    expect(settled.question?.status).toBe('open');
    expect(A.deriveOverall(settled, fullCtx()).state).toBe('needs_you');
  });
});

// ============================================================ cross-module: sizing -> approval

describe('MB-77 (b) approval — sizing rows drive planned n/a, cityState and mayCall', () => {
  it('MB-77 (b) feeds computeSizing rows into plannedNa, cityState and the gate without a claude n/a for low-risk', () => {
    const examples: Row[] = [
      {
        id: ID_A,
        layer: 'Arithmetic',
        increment: 2,
        question: 'what is 2 + 2?',
        scenario: 'an addition',
        inputs: { a: 2, b: 2 },
        clause_chain: ['C1'],
        rulings_cited: [],
        formula_row: 'R1',
        branch: 'add',
        is_new: false,
        answer: '4',
      },
      {
        id: ID_B,
        layer: 'Reading',
        increment: 2,
        question: 'what does clause 1 mean?',
        scenario: 'a reading',
        inputs: {},
        clause_chain: ['C2'],
        rulings_cited: [],
        formula_row: 'R2',
        branch: 'read',
        is_new: false,
        answer: 'it means what it says',
      },
    ];
    const result = S.computeSizing({
      examples,
      approvals: { approved_clauses: ['C1'] },
      reviews: {},
      amended_rulings: {},
      config: BASE,
    });
    const rowA = result.rows.find((r) => r.id === ID_A);
    const rowB = result.rows.find((r) => r.id === ID_B);
    expect(rowA).toBeDefined();
    expect(rowB).toBeDefined();
    expect(rowA?.path).toBe('quick');
    expect(rowA?.low_risk_arithmetic).toBe(true);
    expect(rowB?.path).toBe('full');

    const plannedA = A.plannedNa(rowA!, BASE);
    expect(Object.keys(plannedA).sort()).toEqual(['arithmetic', 'blind', 'regression']);
    expect(Object.prototype.hasOwnProperty.call(plannedA, 'claude')).toBe(false);
    expect(plannedA.arithmetic?.reason).toMatch(/low-risk Arithmetic/);

    expect(R.cityState(null, rowA!)).toEqual({ status: 'n/a', reason: `sizing rule ${String(rowA?.rule)}` });
    expect(R.cityState(null, rowB!).status).toBe('open');

    // Gate closed: the full row's city stage is open, so no blind call is allowed for any example.
    const closed = recordSet([ID_A, ID_B], (id) =>
      finishedRec({
        question: { status: 'approved', model: 'deepseek', attempts: 1 },
        city: R.cityState(null, id === ID_A ? rowA! : rowB!),
      }),
    );
    const gateClosed = A.stageOrderGate(closed, BASE);
    expect(gateClosed.open).toBe(false);
    expect(gateClosed.unfinished).toEqual([ID_B]);
    for (const id of [ID_A, ID_B]) expect(A.mayCall('blind', id, gateClosed, closed)).toBe(false);
    expect(A.mayCall('question', ID_B, gateClosed, closed)).toBe(true);

    // City approved for the full row: the gate opens and blind is allowed for both examples.
    const approvedCity = R.cityState({ id: ID_B, layer: 'Reading', approved: true, rule: 'no_blockers', reason: 'city data matches' }, rowB!);
    expect(approvedCity).toEqual({ status: 'approved' });
    const open = recordSet([ID_A, ID_B], (id) =>
      finishedRec({
        question: { status: 'approved', model: 'deepseek', attempts: 1 },
        city: id === ID_A ? R.cityState(null, rowA!) : approvedCity,
      }),
    );
    const gateOpen = A.stageOrderGate(open, BASE);
    expect(gateOpen.open).toBe(true);
    expect(gateOpen.unfinished).toEqual([]);
    for (const id of [ID_A, ID_B]) expect(A.mayCall('blind', id, gateOpen, open)).toBe(true);
  });
});
