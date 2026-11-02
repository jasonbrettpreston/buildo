// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-440 / M-444 / M-445 / M-446 (McProof, MB-77 b); docs/specs/00-architecture/08_agents.md §11.7
//            M-440 (one config shape, values through `cv`), M-444 (records merge + stage state), M-445 (attempts,
//            fix rounds, parked), M-446 (mandatory stage order gate).
//
// MB-77 (b) records: unit tests over `scripts/analysis/mcproof/records.mjs` (merge, stage state, attempts,
// fix rounds, parked list) and the `config.mjs` helpers they read through. RED phase: the modules do not exist yet,
// so every loading path below fails until they land. Fixtures are inline (temp dirs only, removed in afterEach).
//
// Sources read (not modified): scripts/analysis/mcproof/mcproof.config.json (values via loadConfig, literals only in
// the expected-value tables).
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, unknown>;
// A missing module fails every test that uses it (red-first evidence), never silently passes.
const load = (rel: string): Promise<Json> =>
  import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));

const MOD_DIR = 'scripts/analysis/mcproof';
const config = await load(`${MOD_DIR}/config.mjs`);
const records = await load(`${MOD_DIR}/records.mjs`);
const cfgFns = config as unknown as {
  loadConfig: () => { values: Record<string, unknown>; config_sha: string };
  canonicalJson: (v: unknown) => string;
  cv: (c: { values: Record<string, unknown>; config_sha: string }, k: string) => unknown;
  assertSafeKeys: (v: unknown) => void;
};

type Config = { values: Record<string, unknown>; config_sha: string };
type Ctx = {
  cfg: () => Config;
  sha16: (s: string) => string;
  keySha: (c: Config, key: string) => string;
  compareIds: (a: string, b: string) => number;
  exampleSha: (e: Json) => string;
  mergeStageFiles: (
    files: Json,
    ids: string[],
    city: { cityRows: Json[]; sizingRows: Json[]; config: Config },
  ) => { records: Record<string, Record<string, Json>>; missing: string[] };
  cityState: (row: Json | null, sizing: Json | null) => { status: string; reason?: string };
  settleRecord: (rec: Json, opts: { example_sha: string; config: Config }) => Record<string, Json>;
  stageState: (
    stage: Json,
    opts: { example_sha: string; config: Config; stale?: boolean },
  ) => string;
  resolveAttempt: (
    input: { attempts: number; id: string; classification: Json; stale?: boolean },
    c: Config,
  ) => { status: string; retry?: boolean; attempts?: number };
  resolveFixRound: (input: { fix_rounds: number }, c: Config) => { parked: boolean };
  parkedList: (recs: Record<string, Record<string, Json>>, c: Config) => string[];
};

const ctx = (): Ctx => {
  const c: Ctx = {
    cfg: config.loadConfig as Ctx['cfg'],
    sha16: config.sha16 as Ctx['sha16'],
    keySha: config.keySha as Ctx['keySha'],
    compareIds: config.compareIds as Ctx['compareIds'],
    exampleSha: records.exampleSha as Ctx['exampleSha'],
    mergeStageFiles: records.mergeStageFiles as Ctx['mergeStageFiles'],
    cityState: records.cityState as Ctx['cityState'],
    settleRecord: records.settleRecord as Ctx['settleRecord'],
    stageState: records.stageState as Ctx['stageState'],
    resolveAttempt: records.resolveAttempt as Ctx['resolveAttempt'],
    resolveFixRound: records.resolveFixRound as Ctx['resolveFixRound'],
    parkedList: records.parkedList as Ctx['parkedList'],
  };
  return c;
};

const tmpDirs: string[] = [];
const tmpDir = (tag: string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mcproof-records-${tag}-`));
  tmpDirs.push(dir);
  return dir;
};
afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** A copy of the shipped config values with one key replaced and `config_sha` recomputed. */
const withKey = (c: Ctx, key: string, value: unknown): Config => {
  const base = c.cfg();
  const values: Record<string, unknown> = { ...base.values, [key]: value };
  return { values, config_sha: c.sha16(cfgFns.canonicalJson(values)) };
};

const example = (over: Json = {}): Json => ({
  id: 'e1',
  layer: 'Arithmetic',
  increment: 1,
  question: 'What is the permitted lot coverage?',
  scenario: 'A 12.0 m by 20.0 m lot; coverage 240 m2 of 410 m2.',
  inputs: { frontage_m: 12, depth_m: 20, area_m2: 240 },
  clause_chain: ['9.10', '9.10.40.10(1)'],
  rulings_cited: ['M-01'],
  formula_row: 'coverage = built_area / lot_area',
  branch: 'standard',
  is_new: false,
  answer: { value: 0.585, unit: 'share' },
  ...over,
});

const stage = (over: Json = {}): Json => ({
  status: 'approved',
  note: 'checked against 9.10.40.10(1)',
  model: 'seat-a',
  attempts: 1,
  example_sha: 'abc',
  config_sha: 'cfg',
  ...over,
});

const ids = ['e1', 'e2', 'e10'];

// The config every merge reads through `cv` (the merged city/overall states need `max_retries_per_stage`).
const CONFIG: Config = cfgFns.loadConfig();

// A minimal well-formed stage file: an object with an entry per id.
const file = (over: Record<string, Json> = {}): Json => ({
  e1: stage({ example_sha: 'sha-e1' }),
  e2: stage({ example_sha: 'sha-e2' }),
  e10: stage({ example_sha: 'sha-e10' }),
  ...over,
});

const noCity = { cityRows: [] as Json[], sizingRows: [] as Json[], config: CONFIG };

describe('MB-77 (b) records: config helpers', () => {
  it('MB-77 (b) records: loadConfig exposes values and a sha16 config_sha, cv throws on a missing key', () => {
    const c = ctx();
    const cfg = c.cfg();
    expect(Object.keys(cfg.values).length).toBeGreaterThan(10);
    expect(cfg.values['max_retries_per_stage']).toBe(2);
    expect(cfg.values['max_fix_rounds']).toBe(2);
    expect(cfg.config_sha).toMatch(/^[0-9a-f]{16}$/);
    expect(cfg.config_sha).toBe(c.sha16(cfgFns.canonicalJson(cfg.values) ));
    expect(() => cfgFns.cv(cfg, 'no_such_key')).toThrow('config_key_missing:no_such_key');
    expect(cfgFns.cv(cfg, 'max_fix_rounds')).toBe(2);
  });

  it('MB-77 (b) records: compareIds orders digit runs numerically with a total, non-locale fallback', () => {
    const c = ctx();
    const sorted = ['e10', 'e2', 'e1', 'e9', 'e09'].slice().sort(c.compareIds);
    expect(sorted).toEqual(['e1', 'e2', 'e09', 'e9', 'e10']);
    expect(c.compareIds('e2', 'e10')).toBeLessThan(0);
    expect(c.compareIds('e1', 'e1')).toBe(0);
    // equal numeric value falls back to raw UTF-16 of the whole id: 'e09' (0x30 '0') before 'e9'? — '0'(48) < '9'(57)
    expect(c.compareIds('e09', 'e9')).toBeLessThan(0);
  });

  it('MB-77 (b) records: assertSafeKeys refuses __proto__, constructor and prototype', () => {
    const c = ctx();
    for (const bad of ['__proto__', 'constructor', 'prototype']) {
      expect(() => cfgFns.assertSafeKeys({ [bad]: 1 })).toThrow(`forbidden_key:${bad}`);
    }
    expect(() => cfgFns.assertSafeKeys({ e1: 1 })).not.toThrow();
    expect(() => c.mergeStageFiles({}, [], noCity)).not.toThrow();
    // a literal `{ __proto__: x }` would set the prototype, not a key: build the real own key instead.
    const protoStage: Json = JSON.parse(JSON.stringify({ ['__proto__']: stage() })) as Json;
    expect(Object.prototype.hasOwnProperty.call(protoStage, '__proto__')).toBe(true);
    expect(() => c.mergeStageFiles({ question: protoStage }, ids, noCity)).toThrow(
      'forbidden_key:__proto__',
    );
  });
});

describe('MB-77 (b) records: exampleSha and stale stages (item 1)', () => {
  it('MB-77 (b) records: a changed layer, is_new, increment, formula_row, branch, scenario or question changes exampleSha; a note does not', () => {
    const c = ctx();
    const base = c.exampleSha(example());
    expect(base).toMatch(/^[0-9a-f]{16}$/);
    const changed: Json[] = [
      example({ layer: 'Inputs' }),
      example({ is_new: true }),
      example({ increment: 2 }),
      example({ formula_row: 'coverage = built_area / gross_area' }),
      example({ branch: 'corner_lot' }),
      example({ layer: 'Ruling' }),
      example({ increment: 1.5 }),
    ];
    for (const e of changed) expect(c.exampleSha(e)).not.toBe(base);
    // scenario alone moves the sha
    const otherScenario = example({ scenario: 'A 10.0 m by 41.0 m lot; coverage 240 m2 of 410 m2.' });
    expect(c.exampleSha(otherScenario)).not.toBe(base);
    // question alone moves the sha
    const otherQuestion = example({ question: 'What is the lot coverage, rounded?' });
    expect(c.exampleSha(otherQuestion)).not.toBe(base);
    expect(c.exampleSha(otherQuestion)).not.toBe(c.exampleSha(otherScenario));
    // the id and the prose notes are excluded from the sha
    expect(c.exampleSha(example({ id: 'e99' }))).toBe(base);
    expect(c.exampleSha(example({ note: 'a free-text reviewer note' }))).toBe(base);
    expect(c.exampleSha(example({ why: 'because the operator said so' }))).toBe(base);
    // stable over key order
    const reordered: Json = {
      answer: { unit: 'share', value: 0.585 },
      branch: 'standard',
      formula_row: 'coverage = built_area / lot_area',
      rulings_cited: ['M-01'],
      clause_chain: ['9.10', '9.10.40.10(1)'],
      inputs: { area_m2: 240, depth_m: 20, frontage_m: 12 },
      scenario: 'A 12.0 m by 20.0 m lot; coverage 240 m2 of 410 m2.',
      question: 'What is the permitted lot coverage?',
      increment: 1,
      layer: 'Arithmetic',
      is_new: false,
      id: 'e1',
    };
    expect(c.exampleSha(reordered)).toBe(base);
  });

  it('MB-77 (b) records: a stage recording another example_sha reads open, the matching one reads approved', () => {
    const c = ctx();
    const cfg = c.cfg();
    const sha = c.exampleSha(example());
    expect(c.stageState(stage({ example_sha: sha }), { example_sha: sha, config: cfg })).toBe('approved');
    expect(c.stageState(stage({ example_sha: 'stale-sha' }), { example_sha: sha, config: cfg })).toBe('open');
    // stale flag also reopens
    expect(c.stageState(stage({ example_sha: sha }), { example_sha: sha, config: cfg, stale: true })).toBe('open');
  });
});

describe('MB-77 (b) records: stageState reason and config citations (item 2)', () => {
  it('MB-77 (b) records: n/a without reason reads open; a differing config_key_sha reads open; another key does not reopen', () => {
    const c = ctx();
    const cfg = c.cfg();
    const sha = 'sha-e1';
    const why = 'quick arithmetic: stages 3 and 5 skipped (quick_arithmetic_skips_stage5)';
    const keySha = c.keySha(cfg, 'quick_arithmetic_skips_stage5');
    expect(keySha).toMatch(/^[0-9a-f]{16}$/);

    const good = stage({
      status: 'n/a',
      reason: why,
      cites_config: 'quick_arithmetic_skips_stage5',
      config_key_sha: keySha,
      example_sha: sha,
    });
    expect(c.stageState(good, { example_sha: sha, config: cfg })).toBe('n/a');

    // n/a without reason -> open
    const { reason: _dropped, ...noReason } = good;
    expect(c.stageState(noReason, { example_sha: sha, config: cfg })).toBe('open');
    expect(c.stageState(stage({ ...good, reason: '' }), { example_sha: sha, config: cfg })).toBe('open');

    // citing the switch but recording another key's sha -> open
    const otherSha = c.keySha(cfg, 'tolerance_other');
    expect(otherSha).not.toBe(keySha);
    expect(
      c.stageState(stage({ ...good, config_key_sha: otherSha }), { example_sha: sha, config: cfg }),
    ).toBe('open');

    // editing another key (tolerance_other) leaves the switching record n/a
    const edited = withKey(c, 'tolerance_other', 1e-6);
    expect(edited.config_sha).not.toBe(cfg.config_sha);
    expect(c.keySha(edited, 'quick_arithmetic_skips_stage5')).toBe(keySha);
    expect(c.stageState(good, { example_sha: sha, config: edited })).toBe('n/a');

    // flipping the cited key invalidates the reason
    const flipped = withKey(c, 'quick_arithmetic_skips_stage5', false);
    expect(c.stageState(good, { example_sha: sha, config: flipped })).toBe('open');
  });

  it('MB-77 (b) records: cityState derives open, approved, differs, n/a and the quick sizing override', () => {
    const c = ctx();
    const sha = 'sha-e1';
    const cfg = c.cfg();
    const cases: Array<{ row: Json | null; sizing: Json | null; status: string; reason?: string }> = [
      { row: null, sizing: null, status: 'open' },
      { row: { id: 'e1', layer: 'Arithmetic', approved: true, rule: 'no_evidence', reason: 'found' }, sizing: null, status: 'approved' },
      {
        row: {
          id: 'e2',
          layer: 'Arithmetic',
          approved: false,
          rule: 'blocked',
          reason: 'disagreement: height 9.2 m vs 9.0 m',
        },
        sizing: null,
        status: 'differs',
        reason: 'disagreement: height 9.2 m vs 9.0 m',
      },
      {
        row: { id: 'e3', layer: 'Arithmetic', approved: false, rule: 'blocked', reason: 'blocked by 9.10.40.10(2)' },
        sizing: null,
        status: 'n/a',
        reason: 'blocked by 9.10.40.10(2)',
      },
      {
        // MCPROOF.md C1 "Thin data": a below_threshold row is n/a with the reason thin.
        row: { id: 'e4', layer: 'Arithmetic', approved: false, rule: 'below_threshold', reason: 'thin evidence' },
        sizing: null,
        status: 'n/a',
        reason: 'thin',
      },
      {
        row: { id: 'e5', layer: 'Arithmetic', approved: false, rule: 'excluded_layer', reason: 'no matching rule' },
        sizing: null,
        status: 'n/a',
        reason: 'no matching rule',
      },
      {
        row: { id: 'e6', layer: 'Arithmetic', approved: true, rule: 'no_evidence', reason: 'found' },
        sizing: { id: 'e6', layer: 'Arithmetic', path: 'quick', rule: 'low_risk_arithmetic', evidence: 'x', low_risk_arithmetic: true },
        status: 'n/a',
        reason: 'sizing rule low_risk_arithmetic',
      },
      // a quick sizing row wins over an approved City row, and no approval row is needed for it
      {
        row: null,
        sizing: { id: 'e7', layer: 'Arithmetic', path: 'quick', rule: 'quick_path', evidence: 'x', low_risk_arithmetic: false },
        status: 'n/a',
        reason: 'sizing rule quick_path',
      },
    ];
    for (const k of cases) {
      const got = c.cityState(k.row, k.sizing);
      expect(got.status).toBe(k.status);
      if (k.reason !== undefined) expect(got.reason).toBe(k.reason);
    }
    void cfg;
    void sha;
  });
});

describe('MB-77 (b) records: attempts, retries and fix rounds (item 3)', () => {
  it('MB-77 (b) records: resolveAttempt retries attempts 1 and 2, parks attempt 3, answers and resets on stale', () => {
    const c = ctx();
    const cfg = c.cfg();
    expect(cfg.values['max_retries_per_stage']).toBe(2);
    const unanswered = { answers: {} as Json };
    expect(c.resolveAttempt({ attempts: 1, id: 'e1', classification: unanswered }, cfg)).toMatchObject({
      status: 'errored',
      retry: true,
    });
    expect(c.resolveAttempt({ attempts: 2, id: 'e1', classification: unanswered }, cfg)).toMatchObject({
      status: 'errored',
      retry: true,
    });
    expect(c.resolveAttempt({ attempts: 3, id: 'e1', classification: unanswered }, cfg)).toMatchObject({
      status: 'parked',
      retry: false,
    });
    // the returned count to record is the input attempt (the contract defines `attempts` on the result)
    expect(c.resolveAttempt({ attempts: 2, id: 'e1', classification: unanswered }, cfg).attempts).toBe(2);
    expect(c.resolveAttempt({ attempts: 3, id: 'e1', classification: unanswered }, cfg).attempts).toBe(3);
    // answered wins over attempts
    expect(
      c.resolveAttempt({ attempts: 3, id: 'e1', classification: { answers: { e1: { value: 1 } } } }, cfg),
    ).toMatchObject({ status: 'answered' });
    // stale resets the count, then a fresh run is errored again, not parked
    const reset = c.resolveAttempt({ attempts: 3, id: 'e1', classification: unanswered, stale: true }, cfg);
    expect(reset.status).toBe('errored');
    expect(reset.attempts).toBe(1);
    expect(reset.retry).toBe(true);
    // a non-integer attempts value is malformed
    expect(() => c.resolveAttempt({ attempts: 1.5, id: 'e1', classification: unanswered }, cfg)).toThrow(
      /malformed/,
    );
    expect(() => c.resolveAttempt({ attempts: 0.5, id: 'e1', classification: unanswered }, cfg)).toThrow(
      /malformed/,
    );
    expect(() =>
      c.resolveAttempt({ attempts: Number.NaN, id: 'e1', classification: unanswered }, cfg),
    ).toThrow(/malformed/);
  });

  it('MB-77 (b) records: errored blocks approval and retries exhausted parks into needs_you via parkedList', () => {
    const c = ctx();
    const cfg = c.cfg();
    const sha = 'sha-e10';
    const errored = stage({ status: 'errored', attempts: 3, example_sha: sha });
    // an errored stage is never approved
    expect(c.stageState(errored, { example_sha: sha, config: cfg })).not.toBe('approved');
    expect(c.stageState(errored, { example_sha: sha, config: cfg })).toBe('parked');
    expect(c.stageState(stage({ status: 'errored', attempts: 1, example_sha: sha }), { example_sha: sha, config: cfg })).toBe(
      'errored',
    );
    const merged = c.mergeStageFiles({ question: file({ e10: errored }) }, ids, noCity);
    expect(c.parkedList(merged.records, cfg)).toEqual(['e10']);
    expect(merged.records['e10']?.['question']?.['status']).toBe('errored');
    // needs_you is the operator queue name for a parked record
    const needsYou = merged.records['e10']?.['question']?.['needs_you'] === true;
    expect(needsYou || c.parkedList(merged.records, cfg).includes('e10')).toBe(true);
  });

  it('MB-77 (b) records: mergeStageFiles throws malformed for missing attempts or NaN attempts', () => {
    const c = ctx();
    const { attempts: _dropped, ...noAttempts } = stage();
    expect(() => c.mergeStageFiles({ question: file({ e2: noAttempts }) }, ids, noCity)).toThrow(
      'malformed:question:e2',
    );
    expect(() =>
      c.mergeStageFiles({ question: file({ e2: stage({ attempts: Number.NaN }) }) }, ids, noCity),
    ).toThrow('malformed:question:e2');
    expect(() => c.mergeStageFiles({ question: file({ e2: stage({ attempts: -1 }) }) }, ids, noCity)).toThrow(
      'malformed:question:e2',
    );
    expect(() => c.mergeStageFiles({ question: file({ e2: stage({ attempts: '1' }) }) }, ids, noCity)).toThrow(
      'malformed:question:e2',
    );
  });

  it('MB-77 (b) records: resolveFixRound parks at max_fix_rounds and refuses a malformed count', () => {
    const c = ctx();
    const cfg = c.cfg();
    expect(cfg.values['max_fix_rounds']).toBe(2);
    expect(c.resolveFixRound({ fix_rounds: 0 }, cfg)).toEqual({ parked: false });
    expect(c.resolveFixRound({ fix_rounds: 1 }, cfg)).toEqual({ parked: false });
    expect(c.resolveFixRound({ fix_rounds: 2 }, cfg)).toEqual({ parked: true });
    expect(c.resolveFixRound({ fix_rounds: 3 }, cfg)).toEqual({ parked: true });
    // a fix_rounds that is not a non-negative integer is malformed, never parked by accident
    expect(() => c.resolveFixRound({ fix_rounds: -1 }, cfg)).toThrow('malformed:fix_rounds');
    expect(() => c.resolveFixRound({ fix_rounds: 1.5 }, cfg)).toThrow('malformed:fix_rounds');
    expect(() => c.resolveFixRound({ fix_rounds: Number.NaN }, cfg)).toThrow('malformed:fix_rounds');
    expect(() => c.resolveFixRound({ fix_rounds: '2' as unknown as number }, cfg)).toThrow(
      'malformed:fix_rounds',
    );
    expect(() => c.resolveFixRound({} as unknown as { fix_rounds: number }, cfg)).toThrow(
      'malformed:fix_rounds',
    );
  });
});

describe('MB-77 (b) records: mergeStageFiles shape and city seeding (item 6)', () => {
  it('MB-77 (b) records: a missing file leaves its stage open and is named in missing; no files lists all', () => {
    const c = ctx();
    const partial = c.mergeStageFiles({ question: file() }, ids, noCity);
    expect(partial.missing.slice().sort()).toEqual(['arithmetic', 'blind', 'claude', 'regression']);
    for (const id of ids) {
      expect(partial.records[id]?.['question']?.['status']).toBe('approved');
      for (const absent of ['regression', 'blind', 'claude', 'arithmetic']) {
        expect(partial.records[id]?.[absent]?.['status']).toBe('open');
      }
    }
    const none = c.mergeStageFiles({}, ids, noCity);
    expect(none.missing.slice().sort()).toEqual(['arithmetic', 'blind', 'claude', 'question', 'regression']);
    for (const id of ids) {
      for (const st of ['question', 'regression', 'blind', 'claude', 'arithmetic', 'city']) {
        expect(none.records[id]?.[st]?.['status']).toBe('open');
      }
      // overall is derived (deriveOverall in approval.mjs), never stored on a merged record
      expect(none.records[id]?.['overall']).toBeUndefined();
    }
    // city records are seeded, so the stage order gate can read records[id].city
    expect(none.records['e1']?.['city']).toBeDefined();
    expect(none.records['e1']?.['city']?.['status']).toBe('open');
  });

  it('MB-77 (b) records: a quick or approved City row seeds the city stage from cityState', () => {
    const c = ctx();
    const cityRows: Json[] = [
      { id: 'e1', layer: 'Arithmetic', approved: true, rule: 'no_evidence', reason: 'found' },
      { id: 'e10', layer: 'Arithmetic', approved: false, rule: 'below_threshold', reason: 'thin evidence' },
    ];
    const sizingRows: Json[] = [
      {
        id: 'e2',
        layer: 'Arithmetic',
        path: 'quick',
        rule: 'low_risk_arithmetic',
        evidence: 'arithmetic form 9.10.40.10',
        low_risk_arithmetic: true,
      },
      { id: 'e1', layer: 'Arithmetic', path: 'full', rule: 'full', evidence: 'x', low_risk_arithmetic: false },
    ];
    const merged = c.mergeStageFiles({}, ids, { cityRows, sizingRows, config: c.cfg() });
    expect(merged.records['e1']?.['city']?.['status']).toBe('approved');
    expect(merged.records['e2']?.['city']?.['status']).toBe('n/a');
    expect(merged.records['e2']?.['city']?.['reason']).toBe('sizing rule low_risk_arithmetic');
    // MCPROOF.md C1 "Thin data": a below_threshold row seeds the city stage as n/a with the reason thin.
    expect(merged.records['e10']?.['city']?.['status']).toBe('n/a');
    expect(merged.records['e10']?.['city']?.['reason']).toBe('thin');
  });

  it('MB-77 (c) fixes cityState thin: a below_threshold row is n/a with the reason thin and seeds the city stage', () => {
    const c = ctx();
    const thinRow: Json = {
      id: 'e1',
      layer: 'Arithmetic',
      approved: false,
      rule: 'below_threshold',
      reason: 'thin evidence',
    };
    expect(c.cityState(thinRow, { id: 'e1', path: 'full' })).toEqual({ status: 'n/a', reason: 'thin' });
    const merged = c.mergeStageFiles({}, ids, { cityRows: [thinRow], sizingRows: [], config: c.cfg() });
    expect(merged.records['e1']?.['city']?.['status']).toBe('n/a');
    expect(merged.records['e1']?.['city']?.['reason']).toBe('thin');
  });

  it('MB-77 (b) records: empty, non-object or shaped files throw malformed, unknown ids throw unknown_id', () => {
    const c = ctx();
    expect(() => c.mergeStageFiles({ question: {} }, ids, noCity)).toThrow('malformed:question:empty');
    expect(() => c.mergeStageFiles({ question: [] as unknown as Json }, ids, noCity)).toThrow(
      'malformed:question:shape',
    );
    expect(() => c.mergeStageFiles({ question: 'nope' as unknown as Json }, ids, noCity)).toThrow(
      'malformed:question:shape',
    );
    expect(() => c.mergeStageFiles({ question: null as unknown as Json }, ids, noCity)).toThrow(
      'malformed:question:shape',
    );
    expect(() => c.mergeStageFiles({ question: file({ e77: stage() }) }, ids, noCity)).toThrow(
      'unknown_id:e77',
    );
    // a stage without a string status
    expect(() =>
      c.mergeStageFiles({ question: file({ e2: stage({ status: undefined }) }) }, ids, noCity),
    ).toThrow('malformed:question:e2');
    // approved without a model
    expect(() =>
      c.mergeStageFiles({ question: file({ e2: stage({ model: '' }) }) }, ids, noCity),
    ).toThrow('malformed:question:e2');
    expect(() => c.mergeStageFiles({ question: file({ e2: stage({ model: undefined }) }) }, ids, noCity)).toThrow(
      'malformed:question:e2',
    );
    // differs without a model
    expect(() =>
      c.mergeStageFiles({ question: file({ e2: stage({ status: 'differs', model: '' }) }) }, ids, noCity),
    ).toThrow('malformed:question:e2');
    expect(() =>
      c.mergeStageFiles({ question: file({ e2: stage({ status: 'differs', model: undefined }) }) }, ids, noCity),
    ).toThrow('malformed:question:e2');
  });

  it('MB-77 (b) records: a city file, a city field and a hand-written overall are refused', () => {
    const c = ctx();
    expect(() => c.mergeStageFiles({ city: file() }, ids, noCity)).toThrow(/city/);
    expect(() => c.mergeStageFiles({ overall: file() }, ids, noCity)).toThrow(/overall/);
    expect(() =>
      c.mergeStageFiles({ question: file({ e2: stage({ status: 'approved', city: 'approved' }) }) }, ids, noCity),
    ).toThrow(/malformed:question:e2|city/);
    expect(() =>
      c.mergeStageFiles({ question: file({ e2: stage({ status: 'approved', overall: { status: 'approved' } }) }) }, ids, noCity),
    ).toThrow(/malformed:question:e2|overall/);
    // the derived overall is never written by the merge: only deriveOverall (approval.mjs) derives it
    const merged = c.mergeStageFiles({ question: file() }, ids, noCity);
    expect(merged.records['e1']?.['overall']).toBeUndefined();
    expect(Object.keys(merged.records['e1'] ?? {}).sort()).toEqual([
      'arithmetic',
      'blind',
      'city',
      'claude',
      'question',
      'regression',
    ]);
  });

  it('MB-77 (b) records: __proto__ in a stage file throws forbidden_key', () => {
    const c = ctx();
    const protoFile: Json = JSON.parse(`{"e1": ${JSON.stringify(stage())}, "__proto__": ${JSON.stringify(stage())}}`) as Json;
    expect(Object.keys(protoFile)).toContain('__proto__');
    expect(() => c.mergeStageFiles({ question: protoFile }, ids, noCity)).toThrow('forbidden_key:__proto__');
    expect(() => c.mergeStageFiles({ question: file({ constructor: stage() }) }, ids, noCity)).toThrow(
      'forbidden_key:constructor',
    );
  });
});

describe('MB-77 (b) records: settleRecord rewrites each stage through stageState (item 4)', () => {
  it('MB-77 (b) records: settleRecord reopens a stale stage, parks an exhausted errored stage and reopens a reasonless n/a', () => {
    const c = ctx();
    const cfg = c.cfg();
    const sha = 'sha-e1';

    // a stale stage: it recorded another example_sha -> reads open
    const staleRecord: Json = {
      question: stage({ example_sha: 'old-sha' }),
      city: { status: 'approved', note: '', model: '', attempts: 0, example_sha: sha, config_sha: 'cfg' },
    };
    const settledStale = c.settleRecord(staleRecord, { example_sha: sha, config: cfg });
    expect(settledStale['question']?.['status']).toBe('open');
    expect((staleRecord as Record<string, Json>)['question']?.['status']).toBe('approved');
    // the fields of the entry are kept, only the status is rewritten
    expect(settledStale['question']?.['model']).toBe('seat-a');
    expect(settledStale['question']?.['example_sha']).toBe('old-sha');
    // a fresh matching stage keeps its state
    expect(settledStale['city']?.['status']).toBe('approved');

    // errored with the retries exhausted (attempts - 1 >= max_retries_per_stage) -> parked
    const exhausted: Json = {
      question: stage({ status: 'errored', attempts: 3, example_sha: sha }),
      regression: stage({ status: 'errored', attempts: 2, example_sha: sha }),
    };
    const settledErrored = c.settleRecord(exhausted, { example_sha: sha, config: cfg });
    expect(settledErrored['question']?.['status']).toBe('parked');
    expect(settledErrored['regression']?.['status']).toBe('errored');

    // an n/a without a reason reads open; with a reason it stays n/a
    const bare: Json = {
      question: { status: 'n/a', note: '', model: '', attempts: 0, example_sha: sha, config_sha: 'cfg' },
      blind: {
        status: 'n/a',
        note: '',
        model: '',
        attempts: 0,
        example_sha: sha,
        config_sha: 'cfg',
        reason: 'sizing rule low_risk_arithmetic',
      },
    };
    const settledNa = c.settleRecord(bare, { example_sha: sha, config: cfg });
    expect(settledNa['question']?.['status']).toBe('open');
    expect(settledNa['blind']?.['status']).toBe('n/a');
    // the input record is never mutated
    expect((bare as Record<string, Json>)['question']?.['status']).toBe('n/a');
    expect((bare as Record<string, Json>)['blind']?.['status']).toBe('n/a');
    // a merged record settles through the same rules: its seeded city and its file stages
    const merged = c.mergeStageFiles({ question: file({ e1: stage({ status: 'errored', attempts: 3, example_sha: 'sha-e1' }) }) }, ids, noCity);
    const settledMerged = c.settleRecord(merged.records['e1'] ?? {}, { example_sha: 'sha-e1', config: cfg });
    expect(settledMerged['question']?.['status']).toBe('parked');
    expect(settledMerged['city']?.['status']).toBe('open');
    expect(settledMerged['overall']).toBeUndefined();
  });
});
