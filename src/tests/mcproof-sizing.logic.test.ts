// SPEC LINK: docs/reports/decisions/2026-10-31-batch-an.json (M-440 six-stage review, M-444 sizing by risk,
//            M-445 the generated sizing decision, M-446 record integrity); docs/specs/01-pipeline/69a_mcbylaw_register.md
//
// MB-77 (a) — RED phase. scripts/analysis/mcproof/{config,sizing,approval}.mjs do NOT exist yet: the imports
// below are module-not-found failures by design. Every test title carries `MB-77 (a)` and pins one numbered
// item of the brief: sizing rules R0..R5, the agreement/sample window, determinism and reproducibility, the
// security/fail-closed surface of `runSizingFiles`, and the config contract (`loadConfig`, `cv`, `keySha`).
//
// What is locked, per test:
//   1. Arithmetic on a quick-path rule is `low_risk_arithmetic` true; Reading on the same shape is false; a new
//      Arithmetic example, a Ruling example, an amended ruling and increment 1 are all `full`.
//   2. A precedent missing a required stage (regression) licenses nothing; an empty clause_chain never R2/R3; a
//      quick-depth precedent never justifies R3; a quick-depth question `differs` is R0; a low-risk claude
//      `differs` is `full`.
//   3. The agreement window (19 reviewed -> unchecked; 20 at 0.95 -> sampling; 20 at 0.90 -> not), both-`differs`
//      is not agreement, the seeded hash is input-order-free, sample_min_per_layer, sample_miss_reverts both ways.
//   4. compareIds totals (e9 < e09, e9 < e10 whatever the input order), two runs equal, a re-fed run equal,
//      config_sha and inputs_sha move exactly when they must, sizing.json is byte-identical twice.
//   5. Fail closed: outPath outside taskRoot, a symlink outPath, a missing amendedPath, a `__proto__` id, an
//      unknown layer.
//   6. The shipped config: quick_arithmetic_skips_stage5 is true with a reason; a missing reason throws;
//      `config_key_missing` throws; every key is attributed to the module that reads it.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as configRaw from '../../scripts/analysis/mcproof/config.mjs';
import * as sizingRaw from '../../scripts/analysis/mcproof/sizing.mjs';

type Json = Record<string, unknown>;
const cfgMod = configRaw as unknown as Json;
const sizingMod = sizingRaw as unknown as Json;

const loadConfig = cfgMod.loadConfig as (p?: string) => Json;
const cv = cfgMod.cv as (c: Json, k: string) => unknown;
const canonicalJson = cfgMod.canonicalJson as (v: unknown) => string;
const sha16 = cfgMod.sha16 as (s: string) => string;
const keySha = cfgMod.keySha as (c: Json, k: string) => string;
const compareIds = cfgMod.compareIds as (a: string, b: string) => number;
const assertSafeKeys = cfgMod.assertSafeKeys as (v: unknown) => void;

const computeSizing = sizingMod.computeSizing as (input: Json) => Json;
const runSizingFiles = sizingMod.runSizingFiles as (input: Json) => Json;

const SHIPPED_CONFIG = path.resolve(__dirname, '../../scripts/analysis/mcproof/mcproof.config.json');
const LIVE = loadConfig();

/** Temp directories made by a test, removed in `afterEach`. */
const tmpRoots: string[] = [];

function tmpDir(tag: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcproof-' + tag + '-'));
  tmpRoots.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    const dir = tmpRoots.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** A copy of the shipped config values with keys replaced and `config_sha` recomputed. */
function withConfig(over: Json): Json {
  const values = { ...(LIVE.values as Json), ...over };
  return { values, config_sha: sha16(canonicalJson(values)) };
}

/** The error message of a call that must throw (fails the test when it does not). */
function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  return 'did_not_throw';
}

/** A review record where every stage is approved (no `n/a`, so the layer table never matters). */
function allApproved(depth: string, over: Json = {}): Json {
  const stage = (extra: Json = {}): Json => ({ status: 'approved', ...extra });
  return {
    depth,
    question: stage(),
    city: stage(),
    regression: stage(),
    blind: stage(),
    claude: stage(),
    arithmetic: stage(),
    ...over,
  };
}

/** A review record in which no stage is recorded at all, used as the base for one-stage overrides. */
function everyStage(over: Json): Json {
  return { question: {}, city: {}, regression: {}, blind: {}, claude: {}, arithmetic: {}, ...over };
}

type ExampleOptions = {
  chain?: string[];
  rulings?: string[];
  formula?: string;
  branch?: string;
  increment?: number;
  isNew?: boolean;
};

let exampleSeq = 0;
function example(id: string, layer: string, over: ExampleOptions = {}): Json {
  exampleSeq += 1;
  return {
    id,
    layer,
    increment: over.increment ?? 2,
    question: 'What does the by-law permit on this lot?',
    scenario: { building_class: 'detached_house', zone: 'R', lot_frontage_m: 9 },
    inputs: { lot_frontage_m: { value: 9, source: 'survey' } },
    clause_chain: over.chain ?? [],
    rulings_cited: over.rulings ?? [],
    formula_row: over.formula ?? 'row-' + String(exampleSeq),
    branch: over.branch ?? 'plain',
    is_new: over.isNew ?? false,
    answer: { value: 1, unit: 'm' },
  };
}

function size(examples: Json[], reviews: Json, extra: Json = {}): Json {
  return computeSizing({
    examples,
    approvals: { approved_clauses: [] },
    reviews,
    amended_rulings: {},
    config: LIVE,
    ...extra,
  });
}

/** rows of a sizing result, keyed by example id. */
function byId(result: Json): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const row of result.rows as Json[]) out[row.id as string] = row;
  return out;
}

/** The sample rank of an id in a group: sha256(`sample_seed`:id) first 8 hex as a big-endian unsigned int. */
function sampleHash(id: string, seed = 'mcproof-1'): number {
  return Number.parseInt(sha16(seed + ':' + id).slice(0, 8), 16);
}

/** `true` when the id falls in the seeded `sample_share` window of the 0xffffffff rank space. */
function inSampleWindow(id: string, share = 0.2, seed = 'mcproof-1'): boolean {
  return sampleHash(id, seed) / 0xffffffff < share;
}

/** n distinct ids whose sample hash is NOT in the window (the deterministic quick remainder). */
function idsOutsideWindow(n: number, layer: string): string[] {
  const out: string[] = [];
  for (let i = 1; out.length < n; i += 1) {
    const id = layer.toLowerCase() + '-' + String(i);
    if (!inSampleWindow(id)) out.push(id);
  }
  return out;
}

/** n distinct ids whose sample hash IS in the window (the seeded sample members). */
function idsInsideWindow(n: number, layer: string): string[] {
  const out: string[] = [];
  for (let i = 1; out.length < n; i += 1) {
    const id = layer.toLowerCase() + '-in-' + String(i);
    if (inSampleWindow(id)) out.push(id);
  }
  return out;
}

/** A group of fully reviewed examples and its review map. */
function reviewedGroup(ids: string[], layer: string, over: (i: number) => Json = () => allApproved('full')): [Json[], Json] {
  const examples = ids.map((id) => example(id, layer));
  const reviews: Json = {};
  ids.forEach((id, i) => {
    reviews[id] = over(i);
  });
  return [examples, reviews];
}

/** A precedent review record in which every stage the layer table requires is approved. */

// ------------------------------------------------------------- (1) low-risk Arithmetic on the quick path

describe('MB-77 (a) — low-risk Arithmetic on the quick path', () => {
  it('MB-77 (a) an Arithmetic example licensed by R2 is quick with low_risk_arithmetic true while the same Reading example is false', () => {
    const approved = { approved_clauses: ['10.10.40.50(1)'] };
    const examples = [example('e1', 'Reading', { chain: ['10.10.40.50(1)'] }), example('e2', 'Arithmetic', { chain: ['10.10.40.50(1)'] })];
    const rows = byId(computeSizing({ examples, approvals: approved, reviews: {}, amended_rulings: {}, config: LIVE }));
    expect([rows.e1?.path, rows.e1?.rule, rows.e1?.low_risk_arithmetic]).toEqual(['quick', 'R2-approved-clause', false]);
    expect([rows.e2?.path, rows.e2?.rule, rows.e2?.low_risk_arithmetic]).toEqual(['quick', 'R2-approved-clause', true]);
  });

  it('MB-77 (a) a repeat of an approved pattern is quick in Arithmetic (low risk) and quick in Reading (not low risk); R3 is subsumed by R2, which fires first', () => {
    const precedent = example('e1', 'Reading', { chain: ['10.20.40.70(1)'], formula: 'F-front', branch: 'corner' });
    const arithmetic = example('e2', 'Arithmetic', { chain: ['10.20.40.70(1)'], formula: 'F-front', branch: 'corner' });
    const reading = example('e3', 'Reading', { chain: ['10.20.40.70(1)'], formula: 'F-front', branch: 'corner' });
    const rows = byId(size([precedent, arithmetic, reading], { e1: allApproved('full') }));
    expect([rows.e2?.path, rows.e2?.rule, rows.e2?.low_risk_arithmetic]).toEqual(['quick', 'R2-approved-clause', true]);
    expect([rows.e3?.path, rows.e3?.rule, rows.e3?.low_risk_arithmetic]).toEqual(['quick', 'R2-approved-clause', false]);
  });

  it('MB-77 (a) a new Arithmetic example is full under R1b with low_risk_arithmetic false', () => {
    const approved = { approved_clauses: ['10.10.40.50(1)'] };
    const examples = [example('e1', 'Reading', { chain: ['10.10.40.50(1)'] }), example('e2', 'Arithmetic', { chain: ['10.10.40.50(1)'], isNew: true })];
    const rows = byId(computeSizing({ examples, approvals: approved, reviews: {}, amended_rulings: {}, config: LIVE }));
    expect([rows.e2?.path, rows.e2?.rule, rows.e2?.low_risk_arithmetic]).toEqual(['full', 'R1b-new-reading', false]);
  });

  it('MB-77 (a) a Ruling-layer example is never quick and never low risk even with an approved clause and an approved pattern', () => {
    const approved = { approved_clauses: ['10.10.40.50(1)'] };
    const examples = [
      example('e1', 'Reading', { chain: ['10.10.40.50(1)'], formula: 'F', branch: 'b' }),
      example('e2', 'Ruling', { chain: ['10.10.40.50(1)'], formula: 'F', branch: 'b' }),
    ];
    const rows = byId(computeSizing({ examples, approvals: approved, reviews: { e1: allApproved('full'), e2: allApproved('full') }, amended_rulings: {}, config: LIVE }));
    expect([rows.e2?.path, rows.e2?.low_risk_arithmetic]).toEqual(['full', false]);
  });

  it('MB-77 (a) an amended ruling makes the example full under R1a even when it would otherwise be quick and low risk', () => {
    const approved = { approved_clauses: ['10.10.40.50(1)'] };
    const examples = [example('e1', 'Reading', { chain: ['10.10.40.50(1)'] }), example('e2', 'Arithmetic', { chain: ['10.10.40.50(1)'], rulings: ['R-77'] })];
    const rows = byId(computeSizing({ examples, approvals: approved, reviews: {}, amended_rulings: { e2: ['R-77'] }, config: LIVE }));
    expect([rows.e2?.path, rows.e2?.rule, rows.e2?.low_risk_arithmetic]).toEqual(['full', 'R1a-amended-ruling', false]);
  });

  it('MB-77 (a) increment 1 is full under R1d for every layer, Arithmetic included, with low_risk_arithmetic false', () => {
    const approved = { approved_clauses: ['10.10.40.50(1)'] };
    const examples = [
      example('e1', 'Reading', { chain: ['10.10.40.50(1)'], increment: 1 }),
      example('e2', 'Arithmetic', { chain: ['10.10.40.50(1)'], increment: 1 }),
      example('e3', 'Ruling', { increment: 1 }),
    ];
    // A Ruling-layer example meets R1c (never quick) before R1d.
    const rows = byId(computeSizing({ examples, approvals: approved, reviews: {}, amended_rulings: {}, config: LIVE }));
    expect([rows.e1?.path, rows.e2?.path, rows.e3?.path]).toEqual(['full', 'full', 'full']);
    expect([rows.e1?.rule, rows.e2?.rule, rows.e3?.rule]).toEqual([
      'R1d-full-review-increment',
      'R1d-full-review-increment',
      'R1c-never-quick-layer',
    ]);
    expect(rows.e2?.low_risk_arithmetic).toBe(false);
    expect(typeof rows.e2?.evidence).toBe('string');
  });

  it('MB-77 (a) increment "1" written as the string and 1 written as the number both match R1d-full-review-increment', () => {
    const examples = [
      example('e1', 'Reading', { increment: '1' as unknown as number }),
      example('e2', 'Reading', { increment: 1 }),
      example('e3', 'Inputs', { increment: '2' as unknown as number }),
    ];
    const rows = byId(size(examples, {}));
    expect([rows.e1?.path, rows.e1?.rule]).toEqual(['full', 'R1d-full-review-increment']);
    expect([rows.e2?.path, rows.e2?.rule]).toEqual(['full', 'R1d-full-review-increment']);
    expect([rows.e3?.path, rows.e3?.rule]).not.toEqual(['full', 'R1d-full-review-increment']);
    expect(rows.e1?.low_risk_arithmetic).toBe(false);
  });
});

// ------------------------------------------------------------- (2) precedent integrity

describe('MB-77 (a) — a precedent that is not fully approved licenses nothing', () => {
  it('MB-77 (a) a precedent missing its regression record is not fully approved, so it cannot license R2', () => {
    const approved = { approved_clauses: [] as string[] };
    const examples = [example('e1', 'Reading', { chain: ['10.10.40.50(1)'] }), example('e2', 'Arithmetic', { chain: ['10.10.40.50(1)'] })];
    const missingRegression = everyStage({
      question: { status: 'approved' },
      city: { status: 'approved' },
      blind: { status: 'approved' },
      claude: { status: 'approved' },
      arithmetic: { status: 'approved' },
    });
    const rows = byId(computeSizing({ examples, approvals: approved, reviews: { e1: missingRegression }, amended_rulings: {}, config: LIVE }));
    expect([rows.e2?.path, rows.e2?.rule]).toEqual(['full', 'R4-fill']);
  });

  it('MB-77 (a) a precedent missing its regression record cannot license R3 either', () => {
    const examples = [
      example('e1', 'Reading', { chain: ['10.10.40.50(1)'], formula: 'F', branch: 'b' }),
      example('e2', 'Reading', { chain: ['10.10.40.50(1)'], formula: 'F', branch: 'b' }),
    ];
    const missingRegression = everyStage({
      question: { status: 'approved' },
      city: { status: 'approved' },
      blind: { status: 'approved' },
      claude: { status: 'approved' },
      arithmetic: { status: 'approved' },
    });
    const rows = byId(computeSizing({ examples, approvals: { approved_clauses: [] }, reviews: { e1: missingRegression }, amended_rulings: {}, config: LIVE }));
    expect(rows.e2?.path).toBe('full');
  });

  it('MB-77 (a) an empty clause_chain never matches R2 or R3 and goes to rule 4 (full)', () => {
    const approved = { approved_clauses: ['10.10.40.50(1)'] };
    const examples = [example('e1', 'Reading', { formula: 'F', branch: 'b' }), example('e2', 'Arithmetic', { formula: 'F', branch: 'b' })];
    const rows = byId(computeSizing({ examples, approvals: approved, reviews: { e1: allApproved('full') }, amended_rulings: {}, config: LIVE }));
    expect([rows.e2?.path, rows.e2?.rule, rows.e2?.low_risk_arithmetic]).toEqual(['full', 'R4-fill', false]);
  });

  it('MB-77 (a) a quick-depth precedent does not justify R3 while a sample-depth precedent does', () => {
    const chain = ['10.10.40.50(1)'];
    const examples = [example('e1', 'Reading', { chain, formula: 'F', branch: 'b' }), example('e2', 'Reading', { chain, formula: 'F', branch: 'b' })];
    const quick = byId(computeSizing({ examples, approvals: { approved_clauses: [] }, reviews: { e1: allApproved('quick') }, amended_rulings: {}, config: LIVE }));
    expect(quick.e2?.path).toBe('full');
    const sample = byId(computeSizing({ examples, approvals: { approved_clauses: [] }, reviews: { e1: allApproved('sample') }, amended_rulings: {}, config: LIVE }));
    expect([sample.e2?.path, sample.e2?.rule]).toEqual(['quick', 'R2-approved-clause']);
  });

  it('MB-77 (a) a quick example whose question differs is R0-quick-failed full and a low-risk example whose claude differs is full too', () => {
    const approved = { approved_clauses: ['10.10.40.50(1)'] };
    const examples = [example('e1', 'Reading', { chain: ['10.10.40.50(1)'] }), example('e2', 'Arithmetic', { chain: ['10.10.40.50(1)'] })];
    const questionDiffers = byId(
      computeSizing({ examples, approvals: approved, reviews: { e2: allApproved('quick', { question: { status: 'differs' } }) }, amended_rulings: {}, config: LIVE }),
    );
    expect([questionDiffers.e2?.path, questionDiffers.e2?.rule]).toEqual(['full', 'R0-quick-failed']);
    const claudeDiffers = byId(
      computeSizing({ examples, approvals: approved, reviews: { e2: allApproved('quick', { claude: { status: 'differs' } }) }, amended_rulings: {}, config: LIVE }),
    );
    expect([claudeDiffers.e2?.path, claudeDiffers.e2?.rule, claudeDiffers.e2?.low_risk_arithmetic]).toEqual(['full', 'R0-quick-failed', false]);
  });
});

// ------------------------------------------------------------- (3) the agreement window and the seeded sample

describe('MB-77 (a) — sampling starts only inside the agreement window', () => {
  /**
   * `reviewed` fully reviewed examples (ids outside the hash window) followed by the given candidate ids, all in one
   * agreement group with no clause chain, so every one of them is a rule-4 candidate in id order: the first
   * `agreement_min_sample` (20) are R4-fill, the later ones are subject to the sampling decision.
   */
  function fixture(layer: string, reviewed: number, candIds: string[], disagree: (i: number) => boolean = () => false) {
    const ids = idsOutsideWindow(reviewed, layer);
    const [examples, reviews] = reviewedGroup(ids, layer, (i) =>
      disagree(i) ? allApproved('full', { blind: { status: 'differs' }, claude: { status: 'differs' } }) : allApproved('full'),
    );
    return { examples: [...examples, ...candIds.map((id) => example(id, layer))], reviews, ids };
  }
  const later = (n: number, layer: string, from: number): string[] => idsOutsideWindow(from + n, layer).slice(from);
  const NO_FLOOR = { sample_min_per_layer: 0 };
  const sizeWith = (examples: Json[], reviews: Json, over: Json = {}): Record<string, Json> =>
    byId(computeSizing({ examples, approvals: { approved_clauses: [] }, reviews, amended_rulings: {}, config: withConfig(over) }));

  it('MB-77 (a) 19 fully reviewed examples leave a candidate beyond the fill window R4-unchecked full', () => {
    const [fill, beyond] = later(2, 'Reading', 19);
    const f = fixture('Reading', 19, [fill as string, beyond as string]);
    const rows = sizeWith(f.examples, f.reviews);
    expect([rows[fill as string]?.path, rows[fill as string]?.rule]).toEqual(['full', 'R4-fill']);
    expect([rows[beyond as string]?.path, rows[beyond as string]?.rule]).toEqual(['full', 'R4-unchecked']);
  });

  it('MB-77 (a) 20 fully reviewed with 19 agreeing (0.95) start sampling: the quick remainder is R4-sample-rest', () => {
    const cands = later(4, 'Reading', 20);
    const f = fixture('Reading', 20, cands, (i) => i === 19);
    const rows = sizeWith(f.examples, f.reviews, NO_FLOOR);
    for (const id of cands) expect([id, rows[id]?.path, rows[id]?.rule]).toEqual([id, 'quick', 'R4-sample-rest']);
  });

  it('MB-77 (a) 20 fully reviewed with 18 agreeing (0.90) do not start sampling', () => {
    const cands = later(3, 'Reading', 20);
    const f = fixture('Reading', 20, cands, (i) => i >= 18);
    const rows = sizeWith(f.examples, f.reviews, NO_FLOOR);
    for (const id of cands) expect([id, rows[id]?.path, rows[id]?.rule]).toEqual([id, 'full', 'R4-unchecked']);
  });

  it('MB-77 (a) an example where blind and claude both differ is not agreement', () => {
    // 2 both-differ of 20: if both-differ counted as agreement the share would be 1.0 and sampling would start.
    const cands = later(2, 'Reading', 20);
    const two = fixture('Reading', 20, cands, (i) => i >= 18);
    for (const id of cands) expect([id, sizeWith(two.examples, two.reviews, NO_FLOOR)[id]?.rule]).toEqual([id, 'R4-unchecked']);
    // 1 both-differ of 20 is 19/20 = 0.95: sampling starts.
    const one = fixture('Reading', 20, cands, (i) => i === 19);
    for (const id of cands) expect([id, sizeWith(one.examples, one.reviews, NO_FLOOR)[id]?.rule]).toEqual([id, 'R4-sample-rest']);
  });

  it('MB-77 (a) the seeded hash alone picks the sample and the row is the same after reordering the input array', () => {
    const inside = idsInsideWindow(3, 'Reading');
    const outside = later(6, 'Reading', 20);
    const cands = [...outside, ...inside];
    const f = fixture('Reading', 20, cands);
    const forward = computeSizing({ examples: f.examples, approvals: { approved_clauses: [] }, reviews: f.reviews, amended_rulings: {}, config: withConfig(NO_FLOOR) });
    const reversed = computeSizing({ examples: [...f.examples].reverse(), approvals: { approved_clauses: [] }, reviews: f.reviews, amended_rulings: {}, config: withConfig(NO_FLOOR) });
    expect(reversed).toEqual(forward);
    const rows = byId(forward);
    for (const id of cands) expect([id, rows[id]?.rule]).toEqual([id, inSampleWindow(id) ? 'R4-sample' : 'R4-sample-rest']);
    for (const id of inside) expect(rows[id]?.path).toBe('sample');
  });

  it('MB-77 (a) sample_min_per_layer adds the lowest-hash candidates when the hash window is thin', () => {
    const cands = later(6, 'Reading', 20);
    const f = fixture('Reading', 20, cands);
    const rows = sizeWith(f.examples, f.reviews, { sample_share: 0.0000001, sample_min_per_layer: 3 });
    const sampled = cands.filter((id) => rows[id]?.rule === 'R4-sample');
    const rest = cands.filter((id) => rows[id]?.rule === 'R4-sample-rest');
    expect([sampled.length, rest.length]).toEqual([3, 3]);
    const ranked = [...cands].sort((a, b) => sampleHash(a) - sampleHash(b) || compareIds(a, b));
    expect([...sampled].sort(compareIds)).toEqual(ranked.slice(0, 3).sort(compareIds));
  });

  it('MB-77 (a) a miss in a hash-selected sample member reverts every rule-4 candidate to full under R4-reverted', () => {
    const miss = idsInsideWindow(1, 'Reading')[0] as string;
    const cands = [...later(4, 'Reading', 20), miss];
    const f = fixture('Reading', 20, cands);
    const reviews = { ...f.reviews, [miss]: allApproved('full', { blind: { status: 'differs' }, claude: { status: 'approved' } }) };
    const rows = sizeWith(f.examples, reviews, NO_FLOOR);
    for (const id of cands) expect([id, rows[id]?.path, rows[id]?.rule]).toEqual([id, 'full', 'R4-reverted']);
  });

  it('MB-77 (a) sample_miss_reverts false keeps the sample instead of reverting the group', () => {
    const miss = idsInsideWindow(1, 'Reading')[0] as string;
    const others = later(4, 'Reading', 20);
    const f = fixture('Reading', 20, [...others, miss]);
    const reviews = { ...f.reviews, [miss]: allApproved('full', { blind: { status: 'differs' }, claude: { status: 'approved' } }) };
    const rows = sizeWith(f.examples, reviews, { ...NO_FLOOR, sample_miss_reverts: false });
    expect(rows[miss]?.rule).toBe('R4-sample');
    for (const id of others) expect([id, rows[id]?.rule]).toEqual([id, 'R4-sample-rest']);
  });

  it('MB-77 (a) agreement_scope is read from the config: with [layer] alone agreement in Reading does not reach Inputs', () => {
    const f = fixture('Reading', 20, []);
    const cid = idsOutsideWindow(1, 'zinputs')[0] as string;
    const cand = example(cid, 'Inputs');
    const scoped = sizeWith([...f.examples, cand], f.reviews, { agreement_scope: ['layer'] });
    expect([scoped[cid]?.path, scoped[cid]?.rule]).toEqual(['full', 'R4-fill']);
    const incrementOnly = sizeWith([...f.examples, cand], f.reviews, { agreement_scope: ['increment'], ...NO_FLOOR });
    expect(incrementOnly[cid]?.rule).toBe('R4-sample-rest');
  });
});

// ------------------------------------------------------------- (4) determinism

describe('MB-77 (a) — deterministic ids, shas and output bytes', () => {
  it('MB-77 (a) compareIds is total: e09 sorts before e9 and e9 before e10 whatever the input order', () => {
    expect(compareIds('e09', 'e9')).toBeLessThan(0);
    expect(compareIds('e9', 'e09')).toBeGreaterThan(0);
    expect(compareIds('e9', 'e10')).toBeLessThan(0);
    expect(compareIds('a2', 'a10')).toBeLessThan(0);
    expect(compareIds('x', 'x')).toBe(0);
    const input = ['e10', 'e09', 'e9', 'e100', 'e2'];
    const expected = ['e2', 'e09', 'e9', 'e10', 'e100'];
    for (const order of [input, [...input].reverse(), [...input].sort()]) {
      const rows = (size(order.map((id) => example(id, 'Reading')), {}).rows as Json[]).map((r) => r.id);
      expect(rows).toEqual(expected);
    }
  });

  it('MB-77 (a) two runs are equal and a second run fed the first run results at the same depth is equal (no oscillation)', () => {
    const approved = { approved_clauses: ['10.10.40.50(1)'] };
    const examples = [
      example('e1', 'Reading', { chain: ['10.10.40.50(1)'] }),
      example('e2', 'Arithmetic', { chain: ['10.10.40.50(1)'] }),
      example('e3', 'Ruling'),
    ];
    const first = computeSizing({ examples, approvals: approved, reviews: {}, amended_rulings: {}, config: LIVE });
    const again = computeSizing({ examples, approvals: approved, reviews: {}, amended_rulings: {}, config: LIVE });
    expect(again).toEqual(first);
    const fed: Json = {};
    for (const row of first.rows as Json[]) fed[row.id as string] = allApproved(row.path as string);
    const second = computeSizing({ examples, approvals: approved, reviews: fed, amended_rulings: {}, config: LIVE });
    expect(second.rows).toEqual(first.rows);
    expect(second.inputs_sha).not.toBe(first.inputs_sha);
  });

  it('MB-77 (a) config_sha changes with a value and keySha names the key it covers', () => {
    const changed = withConfig({ agreement_min_share: 0.9 });
    expect(changed.config_sha).not.toBe(LIVE.config_sha);
    expect(sha16(canonicalJson(changed.values))).toBe(changed.config_sha);
    expect(keySha(changed, 'agreement_min_share')).not.toBe(keySha(LIVE, 'agreement_min_share'));
    expect(keySha(changed, 'sample_seed')).toBe(keySha(LIVE, 'sample_seed'));
    expect(cv(LIVE, 'agreement_min_share')).toBe(0.95);
  });

  it('MB-77 (a) inputs_sha changes when one example changes and not when the input file is reformatted', () => {
    const root = tmpDir('reformat');
    const examplesPath = path.join(root, 'examples.json');
    const approvalsPath = path.join(root, 'approvals.json');
    const reviewsPath = path.join(root, 'reviews.json');
    const amendedPath = path.join(root, 'amended.json');
    const firstOut = path.join(root, 'sizing-1.json');
    const secondOut = path.join(root, 'sizing-2.json');
    const thirdOut = path.join(root, 'sizing-3.json');
    const examples = [example('e1', 'Reading', { chain: [] })];
    fs.writeFileSync(approvalsPath, JSON.stringify({ approved_clauses: [] }));
    fs.writeFileSync(reviewsPath, JSON.stringify({}));
    fs.writeFileSync(amendedPath, JSON.stringify({}));
    fs.writeFileSync(examplesPath, JSON.stringify(examples));
    const args = (outPath: string): Json => ({ examplesPath, approvalsPath, reviewsPath, amendedPath, outPath, taskRoot: root, configPath: SHIPPED_CONFIG });
    const a = runSizingFiles(args(firstOut));
    fs.writeFileSync(examplesPath, JSON.stringify(examples, null, 4));
    const b = runSizingFiles(args(secondOut));
    expect(b.inputs_sha).toBe(a.inputs_sha);
    expect(fs.readFileSync(firstOut, 'utf8')).toBe(fs.readFileSync(secondOut, 'utf8'));
    fs.writeFileSync(examplesPath, JSON.stringify([{ ...examples[0], answer: { value: 2, unit: 'm' } }]));
    const c = runSizingFiles(args(thirdOut));
    expect(c.inputs_sha).not.toBe(a.inputs_sha);
  });

  it('MB-77 (a) runSizingFiles writes byte-identical sizing.json twice with stable key order and no timestamp', () => {
    const root = tmpDir('bytes');
    const examplesPath = path.join(root, 'examples.json');
    const approvalsPath = path.join(root, 'approvals.json');
    const reviewsPath = path.join(root, 'reviews.json');
    const amendedPath = path.join(root, 'amended.json');
    const outPath = path.join(root, 'sizing.json');
    fs.writeFileSync(examplesPath, JSON.stringify([example('e1', 'Reading', { chain: [] }), example('e2', 'Arithmetic', { chain: [] })]));
    fs.writeFileSync(approvalsPath, JSON.stringify({ approved_clauses: [] }));
    fs.writeFileSync(reviewsPath, JSON.stringify({}));
    fs.writeFileSync(amendedPath, JSON.stringify({}));
    const args: Json = { examplesPath, approvalsPath, reviewsPath, amendedPath, outPath, taskRoot: root, configPath: SHIPPED_CONFIG };
    runSizingFiles(args);
    const first = fs.readFileSync(outPath, 'utf8');
    runSizingFiles(args);
    const second = fs.readFileSync(outPath, 'utf8');
    expect(second).toBe(first);
    expect(first).toBe(JSON.stringify(JSON.parse(first), null, 2) + '\n');
    expect(first).not.toMatch(/generated_at|timestamp|"mtime"|"date"/);
    expect(JSON.parse(first)).toMatchObject({ config_sha: LIVE.config_sha });
  });
});

// ------------------------------------------------------------- (5) fail closed

/** A temp task root with the four input files written and a helper that names them. */
function fixtureRoot(tag: string, examples: Json[] = [example('e1', 'Reading', { chain: [] })]) {
  const root = tmpDir(tag);
  const examplesPath = path.join(root, 'examples.json');
  const approvalsPath = path.join(root, 'approvals.json');
  const reviewsPath = path.join(root, 'reviews.json');
  const amendedPath = path.join(root, 'amended.json');
  const outPath = path.join(root, 'sizing.json');
  fs.writeFileSync(examplesPath, JSON.stringify(examples));
  fs.writeFileSync(approvalsPath, JSON.stringify({ approved_clauses: [] }));
  fs.writeFileSync(reviewsPath, JSON.stringify({}));
  fs.writeFileSync(amendedPath, JSON.stringify({}));
  const args = (over: Json = {}): Json => ({
    examplesPath,
    approvalsPath,
    reviewsPath,
    amendedPath,
    outPath,
    taskRoot: root,
    configPath: SHIPPED_CONFIG,
    ...over,
  });
  return { root, examplesPath, approvalsPath, reviewsPath, amendedPath, outPath, args };
}

describe('MB-77 (a) — fail closed on paths, symlinks, missing inputs and unsafe ids', () => {
  it('MB-77 (a) an outPath outside taskRoot throws and nothing is written there', () => {
    const fixture = fixtureRoot('escape');
    const outside = tmpDir('outside');
    const escaped = path.join(outside, 'sizing.json');
    expect(messageOf(() => runSizingFiles(fixture.args({ outPath: escaped })))).not.toBe('did_not_throw');
    expect(fs.existsSync(escaped)).toBe(false);
  });

  it('MB-77 (a) a symlink at outPath is refused', () => {
    const fixture = fixtureRoot('symlink');
    const target = path.join(fixture.root, 'elsewhere.json');
    fs.writeFileSync(target, '{}');
    fs.rmSync(fixture.outPath, { force: true });
    fs.symlinkSync(target, fixture.outPath);
    expect(messageOf(() => runSizingFiles(fixture.args()))).not.toBe('did_not_throw');
    expect(fs.readFileSync(target, 'utf8')).toBe('{}');
  });

  it('MB-77 (a) a missing or unreadable amendedPath throws instead of sizing as if nothing changed', () => {
    const fixture = fixtureRoot('amended');
    fs.rmSync(fixture.amendedPath, { force: true });
    expect(messageOf(() => runSizingFiles(fixture.args()))).not.toBe('did_not_throw');
    expect(fs.existsSync(fixture.outPath)).toBe(false);
  });

  it('MB-77 (a) a __proto__ id and a forbidden map key throw forbidden_key', () => {
    const examples = [example('e1', 'Reading', { chain: [] }), { ...example('e2', 'Reading', { chain: [] }), id: '__proto__' }];
    expect(messageOf(() => size(examples, {}))).toMatch(/^forbidden_key:__proto__/);
    const asMap: Json = JSON.parse('{"__proto__": {"status": "approved"}}') as Json;
    expect(messageOf(() => size([example('e3', 'Reading', { chain: [] })], asMap))).toMatch(/^forbidden_key:__proto__/);
    expect(messageOf(() => assertSafeKeys(JSON.parse('{"constructor": 1}') as Json))).toMatch(/^forbidden_key:constructor/);
    expect(() => assertSafeKeys({ id: 'e1', layer: 'Reading' })).not.toThrow();
  });

  it('MB-77 (a) an unknown layer throws unknown_layer', () => {
    expect(messageOf(() => size([example('e1', 'Geometry')], {}))).toMatch(/^unknown_layer:Geometry/);
  });
});

// ------------------------------------------------------------- (6) the config contract

describe('MB-77 (a) — the shipped config and the module that reads each key', () => {
  it('MB-77 (a) the shipped config has quick_arithmetic_skips_stage5 true with a non-empty reason', () => {
    const raw = JSON.parse(fs.readFileSync(SHIPPED_CONFIG, 'utf8')) as Json;
    expect(cv(LIVE, 'quick_arithmetic_skips_stage5')).toBe(true);
    const entry = raw.quick_arithmetic_skips_stage5 as Json;
    expect(entry.value).toBe(true);
    expect(typeof entry.reason).toBe('string');
    expect((entry.reason as string).length).toBeGreaterThan(0);
    expect(LIVE.config_sha).toBe(sha16(canonicalJson(LIVE.values)));
  });

  it('MB-77 (a) a config entry without a reason throws config_missing_reason for that key', () => {
    const root = tmpDir('no-reason');
    const file = path.join(root, 'mcproof.config.json');
    const raw = JSON.parse(fs.readFileSync(SHIPPED_CONFIG, 'utf8')) as Json;
    const broken = { ...raw, answer_table_required: { value: (raw.answer_table_required as Json).value } };
    fs.writeFileSync(file, JSON.stringify(broken));
    expect(messageOf(() => loadConfig(file))).toMatch(/^config_missing_reason:answer_table_required/);
    const blank = { ...raw, sample_seed: { value: 'mcproof-1', reason: '' } };
    fs.writeFileSync(file, JSON.stringify(blank));
    expect(messageOf(() => loadConfig(file))).toMatch(/^config_missing_reason:sample_seed/);
    expect(() => loadConfig(SHIPPED_CONFIG)).not.toThrow();
  });

  it('MB-77 (a) cv of a missing key throws config_key_missing', () => {
    expect(messageOf(() => cv(LIVE, 'no_such_key'))).toBe('config_key_missing:no_such_key');
    expect(cv(LIVE, 'never_quick_layers')).toEqual(['Ruling']);
    expect(cv(LIVE, 'quick_path_stages')).toEqual(['question', 'arithmetic']);
  });

  it('MB-77 (a) every config key is listed with the module that reads it', () => {
    const raw = JSON.parse(fs.readFileSync(SHIPPED_CONFIG, 'utf8')) as Json;
    const rawKeys = Object.keys(raw).filter((k) => !k.startsWith('_'));
    // The authoritative list is what `loadConfig` settles into `values`; the file's own order is never assumed.
    const keys = Object.keys(LIVE.values as Json).sort();
    expect(keys.length).toBeGreaterThan(0);
    expect([...rawKeys].sort()).toEqual(keys);
    const CONSUMERS: Record<string, string> = {
      full_review_increments: 'sizing.mjs',
      quick_path_stages: 'approval.mjs',
      agreement_min_share: 'sizing.mjs',
      agreement_min_sample: 'sizing.mjs',
      agreement_scope: 'sizing.mjs',
      sample_seed: 'sizing.mjs',
      tolerance_area_m2: 'records.mjs',
      tolerance_other: 'records.mjs',
      operator_spot_check_share: 'not read here (operator summary, MB-77 (c), by design)',
      sample_share: 'sizing.mjs',
      sample_min_per_layer: 'sizing.mjs',
      sample_miss_reverts: 'sizing.mjs',
      never_quick_layers: 'sizing.mjs',
      max_fix_rounds: 'records.mjs',
      max_retries_per_stage: 'records.mjs',
      recent_min_distinct_applications: 'not read here (city-approve.mjs, by design)',
      stage_order_gate: 'approval.mjs',
      low_risk_arithmetic: 'sizing.mjs',
      quick_arithmetic_skips_stage5: 'approval.mjs',
      answer_table_required: 'records.mjs',
    };
    expect(keys).toEqual([...Object.keys(CONSUMERS)].sort());
    for (const key of keys) {
      expect([key, CONSUMERS[key] !== undefined]).toEqual([key, true]);
      expect([key, cv(LIVE, key) === undefined]).toEqual([key, false]);
    }
    expect(CONSUMERS.recent_min_distinct_applications).toMatch(/not read here/);
    expect(CONSUMERS.operator_spot_check_share).toMatch(/not read here/);
  });
});
