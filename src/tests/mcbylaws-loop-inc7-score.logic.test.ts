// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-362 (increment 7: direction gate, closeness, catch rate)
// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md SC-19
// Red first: docs/reports/red-evidence/INC7/inc7-scorer-red.txt
// INC7-S step 1 (RED): the scorer loop-inc7-score.mjs does not exist yet, so every test in this file fails on the import.
// INC7-S step 5 (K1..K11, panel findings F1..F5): written RED against the step-4 module — the vacuous direction pass (F1),
// the silent first-row pick among ambiguous maxima (F2), the positional verdict roles (F3), the guessed fallback category
// (F4) and the closeness ratio over a zero/negative maximum (F5).
// Pure checks only; the settings file is read as data (mcbylaws/loop/inc7-scorer-settings.json) and never edited.
// The scorer may not mutate its inputs: some tests deep-freeze them and one runs every scorer twice.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(__dirname, '../..');
const M = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-inc7-score.mjs'))) as unknown as Inc7Module;
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'mcbylaws/loop/inc7-scorer-settings.json'), 'utf8')) as Settings;

type Dict = { [key: string]: any };
type Settings = { [key: string]: any };
type MaxResult = { value: number | null; reason: string };
type DirectionCaseResult = { status: string };
type DirectionStats = {
  gated: boolean;
  cases: number;
  evaluated: number;
  correct: number;
  wrong: number;
  not_evaluated: number;
  no_applicant_figure: number;
  denominator: number;
  required: number;
  pass: boolean;
  wrong_cases: string[];
  not_evaluated_cases: string[];
};
type ClosenessResult = {
  measure: string;
  n: number;
  median: number | null;
  spread: Dict | null;
  values: { case: string; ratio: number }[];
  threshold: number | null;
  threshold_met: boolean | null;
};
type CatchRow = {
  case: string;
  measure: string;
  city_row: boolean;
  our_verdict: string;
  city_limit: number | null;
  our_limit: number | null;
  limit_match: boolean | null;
  category: string;
  class: string;
};
type CatchThreshold = { id: string; kind: string; value: number | null; actual: number | null; pass: boolean };
type CatchResult = {
  rows: CatchRow[];
  counts: { [cls: string]: number };
  denominator: number;
  rates: { [id: string]: any };
  thresholds: CatchThreshold[];
  pass: boolean;
};
type Inc7Result = {
  direction: { [measure: string]: DirectionStats };
  closeness: ClosenessResult;
  catch: CatchResult;
  ok: boolean;
  settings_digest: string;
};
type Inc7Input = { cases: any[]; layer3Rows: any[]; varianceRows: any[]; settings: Settings };
type Inc7Module = {
  requiredCorrect: (n: number, pct: number, rounding: string) => number;
  validateSettings: (s: Settings) => string[];
  maxFor: (layer3Rows: any[], parcelId: string, buildingType: string | null | undefined, measure: string, settings: Settings) => MaxResult;
  directionCase: (args: { applicant: number | null | undefined; max: number | null; variance: boolean; tol: number }) => DirectionCaseResult;
  scoreDirection: (cases: any[], layer3Rows: any[], varianceRows: any[], settings: Settings) => { [measure: string]: DirectionStats };
  scoreCloseness: (cases: any[], layer3Rows: any[], varianceRows: any[], settings: Settings) => ClosenessResult;
  classifyRow: (facts: { city_row: boolean; our_verdict: string; limit_match: boolean | null }, settings: Settings) => string;
  limitMatch: (cityLimit: unknown, ourLimit: unknown, settings: Settings) => boolean | null;
  scoreCatch: (cases: any[], layer3Rows: any[], varianceRows: any[], settings: Settings) => CatchResult;
  scoreInc7: (input: Inc7Input) => Inc7Result;
  runInc7: (args: {
    reader: { layer3Rows: (parcelIds: string[]) => Promise<any[]> };
    readJson: (p: string) => any;
    paths: { cases: string; variance_rows: string; settings: string };
  }) => Promise<Inc7Result>;
};

// One setting varied per test: a structured clone of the shipped file, patched; never the file itself.
const cfg = (f: (s: Settings) => void): Settings => {
  const s = JSON.parse(JSON.stringify(S)) as Settings;
  f(s);
  return s;
};
const deepFreeze = <T>(o: T): T => {
  if (o !== null && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Dict)) deepFreeze(v);
  }
  return o;
};
const isDeepFrozen = (o: unknown): boolean => {
  if (o === null || typeof o !== 'object') return true;
  if (!Object.isFrozen(o)) return false;
  return Object.values(o as Dict).every(isDeepFrozen);
};
const canonical = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const d = v as Dict;
  const keys = Object.keys(d).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(d[k])}`).join(',')}}`;
};
const sha256Hex = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

// ---- fixtures (inline; no DB, no network) -------------------------------------------------------------
const L3 = (
  parcel_id: string,
  field_id: string,
  value: number | string | null,
  status = 'computed',
  building_type = 'detached_house',
): Dict => [parcel_id, field_id, value, status, building_type];
const L3_ROW = (a: Dict): Dict => ({ parcel_id: a[0], field_id: a[1], value: a[2], status: a[3], building_type: a[4] });
const row = (parcel_id: string, field_id: string, value: number | string | null, status = 'computed', building_type = 'detached_house'): Dict =>
  L3_ROW(L3(parcel_id, field_id, value, status, building_type));
const VROW = (caseId: string, measure: string, granted: string, city_row: boolean, extra: Dict = {}): Dict => ({
  case: caseId,
  measure,
  city_row,
  granted,
  ...extra,
});

// c1..c6 on parcels p1..p6, all detached_house new builds (the brief fixture). gfa maxima: 110 100 100 100 100 100.
const CASE = (id: string, parcel_id: string, applicant_class: string | null, applicant: Dict, new_build: boolean | undefined = true): Dict => {
  const c: Dict = { case: id, parcel_id, applicant_class, applicant };
  if (new_build !== undefined) c.new_build = new_build;
  return c;
};
const cases6 = (): Dict[] => [
  CASE('c1', 'p1', 'detached_house', { gfa: 100, height: 9, storeys: 2, footprint: 90, units: 1 }),
  CASE('c2', 'p2', 'detached_house', { gfa: 90, height: 8, storeys: 2, footprint: 80, units: 2 }),
  CASE('c3', 'p3', 'detached_house', { gfa: 80, height: 7, storeys: 1, footprint: 70, units: 1 }),
  CASE('c4', 'p4', 'detached_house', { gfa: 120, height: 12, storeys: 3, footprint: 95, units: 3 }),
  CASE('c5', 'p5', null, { gfa: 70, height: 6, storeys: 1, footprint: 60, units: 1 }),
  CASE('c6', 'p6', 'detached_house', { gfa: 130, height: 10, storeys: 3, footprint: 85, units: 2 }),
];
const L3_P1_P6 = (): Dict[] => [
  row('p1', 'gfa_max_m2', 110), row('p1', 'height_max_m', 10), row('p1', 'storeys_max', 3), row('p1', 'footprint_max_m2', 100), row('p1', 'units_max', 2),
  row('p2', 'gfa_max_m2', 100), row('p2', 'height_max_m', 9), row('p2', 'storeys_max', 2), row('p2', 'footprint_max_m2', 90), row('p2', 'units_max', 2),
  row('p3', 'gfa_max_m2', 100), row('p3', 'height_max_m', 8), row('p3', 'storeys_max', 2), row('p3', 'footprint_max_m2', 80), row('p3', 'units_max', 1),
  row('p4', 'gfa_max_m2', 100), row('p4', 'height_max_m', 12), row('p4', 'storeys_max', 3), row('p4', 'footprint_max_m2', 60), row('p4', 'units_max', 2),
  row('p5', 'gfa_max_m2', 100), row('p5', 'height_max_m', 9), row('p5', 'storeys_max', 2), row('p5', 'footprint_max_m2', 70), row('p5', 'units_max', 1),
  row('p6', 'gfa_max_m2', 100), row('p6', 'height_max_m', 8), row('p6', 'storeys_max', 2), row('p6', 'footprint_max_m2', 80), row('p6', 'units_max', 2),
];
// The one granted variance in the fixture: c4 gfa, so c4 is the correct call on gfa (120 > 100).
const VROWS6 = (): Dict[] => [VROW('c4', 'gfa', 'yes', true, { city_limit: 120, applicant_figure: 120 })];
const input6 = (settings: Settings = S): Inc7Input => ({ cases: cases6(), layer3Rows: L3_P1_P6(), varianceRows: VROWS6(), settings });

// A PASSING fixture: 10 new-build detached_house cases, every figure inside its max except footprint (95 > 80, not gated),
// and 10 variances on `setback` (8 CAUGHT, 2 MISSED) so the catch rates clear 70 % and 50 %.
const PARCELS_10 = ['pa1', 'pa2', 'pa3', 'pa4', 'pa5', 'pa6', 'pa7', 'pa8', 'pa9', 'pa10'];
const inputPass = (settings: Settings = S): Inc7Input => {
  const cases = PARCELS_10.map((pid) =>
    CASE(pid, pid, 'detached_house', { gfa: 90, height: 8, storeys: 2, footprint: 95, units: 1 }),
  );
  const layer3Rows: Dict[] = [];
  for (const pid of PARCELS_10) {
    layer3Rows.push(
      row(pid, 'gfa_max_m2', 100),
      row(pid, 'height_max_m', 9),
      row(pid, 'storeys_max', 2),
      row(pid, 'footprint_max_m2', 80),
      row(pid, 'units_max', 2),
    );
  }
  const varianceRows = PARCELS_10.map((pid, i) =>
    i < 8
      ? VROW(pid, 'setback', 'yes', true, { city_limit: 100, our_verdict: 'EXCEEDS', our_limit: 100 })
      : VROW(pid, 'setback', 'yes', true, { our_verdict: 'COMPLIES' }),
  );
  return { cases, layer3Rows, varianceRows, settings };
};

describe('A. requiredCorrect and validateSettings (M-362 thresholds set before results)', () => {
  it('A1 90 % of 25: ceil 23, floor 22, round 23 (22.5 rounds up)', () => {
    expect(M.requiredCorrect(25, 90, 'ceil')).toBe(23);
    expect(M.requiredCorrect(25, 90, 'floor')).toBe(22);
    expect(M.requiredCorrect(25, 90, 'round')).toBe(23);
  });
  it('A2 90 % of 10 is 9 and 90 % of 20 is 18: floating noise never bumps a whole number', () => {
    expect(M.requiredCorrect(10, 90, 'ceil')).toBe(9);
    expect(M.requiredCorrect(20, 90, 'ceil')).toBe(18); // 18.000000000000004 must not become 19
    expect(M.requiredCorrect(0, 90, 'ceil')).toBe(0);
  });
  it('A3 an unknown rounding mode throws inc7_settings_invalid', () => {
    expect(() => M.requiredCorrect(25, 90, 'half_up')).toThrow(/^inc7_settings_invalid/);
  });
  it('A4 the shipped settings validate clean', () => {
    expect(M.validateSettings(S)).toEqual([]);
  });
  it('A5 one violation per code: gate measure, rounding, spread, denominator, threshold kind', () => {
    expect(M.validateSettings(cfg((s) => { s.direction.gate_measures.push('setbacks'); }))).toContain('gate_measure_unknown:setbacks');
    expect(M.validateSettings(cfg((s) => { s.direction.count_rounding = 'half_up'; }))).toContain('rounding_unknown:half_up');
    expect(M.validateSettings(cfg((s) => { s.closeness.spread = 'range'; }))).toContain('spread_unknown:range');
    expect(M.validateSettings(cfg((s) => { s.direction.denominator = 'some_cases'; }))).toContain('denominator_unknown:some_cases');
    expect(M.validateSettings(cfg((s) => { s.catch.thresholds[0].kind = 'pct_max'; }))).toContain('threshold_kind_unknown:caught_plus_estimate_pct_min');
  });
  it('A5b class_rule_class_empty and field_missing:<measure>', () => {
    expect(M.validateSettings(cfg((s) => { s.catch.class_rules[0].class = ''; }))).toContain('class_rule_class_empty');
    expect(M.validateSettings(cfg((s) => { delete s.layer3.field_by_measure.height; }))).toContain('field_missing:height');
  });
  it('A5c each allowed value validates clean (the green twin)', () => {
    expect(M.validateSettings(cfg((s) => { s.closeness.spread = 'min_max'; }))).toEqual([]);
    expect(M.validateSettings(cfg((s) => { s.closeness.spread = 'stdev'; }))).toEqual([]);
    expect(M.validateSettings(cfg((s) => { s.direction.denominator = 'evaluated_cases'; }))).toEqual([]);
    expect(M.validateSettings(cfg((s) => { s.direction.count_rounding = 'floor'; }))).toEqual([]);
  });
});

describe('B. maxFor: the usable maximum of a parcel for a case class (M-362 own type)', () => {
  const rows = (): Dict[] => [
    row('p1', 'gfa_max_m2', 110),
    row('p1', 'gfa_max_m2', 120, 'computed', 'sixplex'),
    row('p1', 'height_max_m', 10, 'not_evaluated'),
    row('p1', 'storeys_max', '3'),
  ];
  it('B1 ok: the case-class max of the measure field; a numeric string returns as a Number', () => {
    expect(M.maxFor(rows(), 'p1', 'detached_house', 'gfa', S)).toEqual({ value: 110, reason: 'ok' });
    const s = M.maxFor(rows(), 'p1', 'detached_house', 'storeys', S);
    expect(s).toEqual({ value: 3, reason: 'ok' });
    expect(typeof s.value).toBe('number');
  });
  it('B2 no_class: a null or undefined building type has no maximum', () => {
    expect(M.maxFor(rows(), 'p1', null, 'gfa', S)).toEqual({ value: null, reason: 'no_class' });
    expect(M.maxFor(rows(), 'p1', undefined, 'gfa', S)).toEqual({ value: null, reason: 'no_class' });
  });
  it('B3 no_row: no row for that parcel and class (another class is not used)', () => {
    expect(M.maxFor(rows(), 'p9', 'detached_house', 'gfa', S)).toEqual({ value: null, reason: 'no_row' });
    expect(M.maxFor(rows(), 'p1', 'semidetached_house', 'gfa', S)).toEqual({ value: null, reason: 'no_row' });
  });
  it('B4 status:<status>: a not_evaluated row is not usable', () => {
    expect(M.maxFor(rows(), 'p1', 'detached_house', 'height', S)).toEqual({ value: null, reason: 'status:not_evaluated' });
  });
});

describe('C. directionCase: the direction rule and the variance flip (M-362)', () => {
  it('C1 no_applicant_figure and not_evaluated', () => {
    expect(M.directionCase({ applicant: null, max: 100, variance: false, tol: 0.05 })).toEqual({ status: 'no_applicant_figure' });
    expect(M.directionCase({ applicant: undefined, max: 100, variance: false, tol: 0.05 })).toEqual({ status: 'no_applicant_figure' });
    expect(M.directionCase({ applicant: 90, max: null, variance: false, tol: 0.05 })).toEqual({ status: 'not_evaluated' });
  });
  it('C2 no variance: applicant <= max is correct, applicant > max is wrong', () => {
    expect(M.directionCase({ applicant: 90, max: 100, variance: false, tol: 0.05 })).toEqual({ status: 'correct' });
    expect(M.directionCase({ applicant: 100, max: 100, variance: false, tol: 0.05 })).toEqual({ status: 'correct' });
    expect(M.directionCase({ applicant: 130, max: 100, variance: false, tol: 0.05 })).toEqual({ status: 'wrong' });
  });
  it('C3 a variance on the measure flips it: applicant > max is correct, otherwise wrong', () => {
    expect(M.directionCase({ applicant: 120, max: 100, variance: true, tol: 0.05 })).toEqual({ status: 'correct' });
    expect(M.directionCase({ applicant: 100, max: 100, variance: true, tol: 0.05 })).toEqual({ status: 'wrong' });
    expect(M.directionCase({ applicant: 90, max: 100, variance: true, tol: 0.05 })).toEqual({ status: 'wrong' });
  });
  it('C4 the tolerance edge: applicant == max + tol is correct without a variance and wrong with one', () => {
    expect(M.directionCase({ applicant: 100.05, max: 100, variance: false, tol: 0.05 })).toEqual({ status: 'correct' });
    expect(M.directionCase({ applicant: 100.06, max: 100, variance: false, tol: 0.05 })).toEqual({ status: 'wrong' });
    expect(M.directionCase({ applicant: 100.05, max: 100, variance: true, tol: 0.05 })).toEqual({ status: 'wrong' });
    expect(M.directionCase({ applicant: 100.06, max: 100, variance: true, tol: 0.05 })).toEqual({ status: 'correct' });
  });
});

describe('D. scoreDirection: counts, denominator, rounding and the gate (M-362)', () => {
  it('D1 the fixture on gfa: 4 correct (c1, c2, c3 and c4 by its variance), 1 not evaluated (c5), 1 wrong (c6)', () => {
    const d = M.scoreDirection(cases6(), L3_P1_P6(), VROWS6(), S);
    const s = d.gfa as DirectionStats;
    expect(s.cases).toBe(6);
    expect(s.evaluated).toBe(5);
    expect(s.correct).toBe(4);
    expect(s.wrong).toBe(1);
    expect(s.not_evaluated).toBe(1);
    expect(s.no_applicant_figure).toBe(0);
    expect(s.denominator).toBe(6); // all_cases: the not-evaluated case is in it and is not correct
    expect(s.required).toBe(6); // ceil(90 % of 6)
    expect(s.pass).toBe(false);
    expect(s.wrong_cases).toEqual(['c6']);
    expect(s.not_evaluated_cases).toEqual(['c5']);
    expect(s.gated).toBe(true);
    expect((d.height as DirectionStats).gated).toBe(true);
    expect((d.storeys as DirectionStats).gated).toBe(true);
    expect((d.footprint as DirectionStats).gated).toBe(false);
    expect((d.units as DirectionStats).gated).toBe(false);
  });
  it('D2 gate_measures changes gated and ok only: a failing footprint passes until it is a gate measure', () => {
    const base = M.scoreInc7(inputPass());
    expect((base.direction.footprint as DirectionStats).pass).toBe(false); // 95 > 80 with no variance: 0 correct
    expect((base.direction.footprint as DirectionStats).gated).toBe(false);
    expect(base.ok).toBe(true);
    const gated = cfg((s) => { s.direction.gate_measures.push('footprint'); });
    const out = M.scoreInc7({ ...inputPass(), settings: gated });
    expect((out.direction.footprint as DirectionStats).gated).toBe(true);
    expect((out.direction.footprint as DirectionStats).correct).toBe((base.direction.footprint as DirectionStats).correct);
    expect(out.ok).toBe(false);
  });
  it('D3 count_rounding floor vs ceil flips pass with 22 of 25 correct', () => {
    const cs: Dict[] = [];
    const rows: Dict[] = [];
    for (let i = 1; i <= 25; i += 1) {
      const app = i <= 22 ? 90 : 130; // 22 correct, 3 wrong, no variances
      const pid = `r${i}`;
      cs.push(CASE(`r${i}`, pid, 'detached_house', { gfa: app, height: 8, storeys: 2, footprint: 70, units: 1 }));
      rows.push(row(pid, 'gfa_max_m2', 100), row(pid, 'height_max_m', 9), row(pid, 'storeys_max', 2), row(pid, 'footprint_max_m2', 80), row(pid, 'units_max', 2));
    }
    const ceilOut = M.scoreDirection(cs, rows, [], S).gfa as DirectionStats;
    expect(ceilOut.correct).toBe(22);
    expect(ceilOut.denominator).toBe(25);
    expect(ceilOut.required).toBe(23);
    expect(ceilOut.pass).toBe(false);
    const floorOut = M.scoreDirection(cs, rows, [], cfg((s) => { s.direction.count_rounding = 'floor'; })).gfa as DirectionStats;
    expect(floorOut.required).toBe(22);
    expect(floorOut.pass).toBe(true);
  });
  it('D4 denominator: all_cases counts a not-evaluated case; evaluated_cases is evaluated; no figure is out of both', () => {
    const noFigure = cases6().map((c) => (c.case === 'c5' ? { ...c, applicant: {} } : c));
    const all = M.scoreDirection(noFigure, L3_P1_P6(), VROWS6(), S).gfa as DirectionStats;
    expect(all.no_applicant_figure).toBe(1); // c5, whose applicant is now {}: out of both denominators
    expect(all.not_evaluated).toBe(0);
    expect(all.denominator).toBe(5); // c1, c2, c3, c4, c6
    const ev = M.scoreDirection(cases6(), L3_P1_P6(), VROWS6(), cfg((s) => { s.direction.denominator = 'evaluated_cases'; })).gfa as DirectionStats;
    expect(ev.evaluated).toBe(5);
    expect(ev.denominator).toBe(5);
    expect(ev.not_evaluated).toBe(1);
    expect(ev.required).toBe(5); // ceil(90 % of 5)
    expect(ev.pass).toBe(false);
  });
  it('D5 a granted "no" is not a variance; "modified" is', () => {
    const cs = cases6().map((c) => (c.case === 'c4' ? { ...c, applicant: { ...(c.applicant as Dict), gfa: 90 } } : c));
    const no = M.scoreDirection(cs, L3_P1_P6(), [VROW('c4', 'gfa', 'no', true)], S).gfa as DirectionStats;
    expect(no.correct).toBe(4); // c4 (90 <= 100) correct beside c1, c2, c3; c6 still wrong
    expect(no.wrong).toBe(1);
    const yes = M.scoreDirection(cs, L3_P1_P6(), [VROW('c4', 'gfa', 'yes', true)], S).gfa as DirectionStats;
    expect(yes.correct).toBe(3);
    expect(yes.wrong).toBe(2); // c4 flipped: applicant 90 <= 100 is wrong under a variance, beside c6
    const modified = M.scoreDirection(cs, L3_P1_P6(), [VROW('c4', 'gfa', 'modified', true)], S).gfa as DirectionStats;
    expect(modified.correct).toBe(3);
    expect(modified.wrong).toBe(2);
  });
});

describe('E. scoreCloseness: median and spread of applicant / max (M-362 closeness)', () => {
  // five known ratios 0.7, 0.8, 0.9, 1.0, 1.1: median 0.9, q1 0.8, q3 1.0, iqr 0.2 (R type 7 interpolation)
  const five = (): { cases: Dict[]; rows: Dict[] } => {
    const pairs: [number, number][] = [[70, 100], [80, 100], [90, 100], [100, 100], [110, 100]];
    const cases: Dict[] = [];
    const rows: Dict[] = [];
    pairs.forEach(([app, max], i) => {
      const pid = `n${i + 1}`;
      cases.push(CASE(`n${i + 1}`, pid, 'detached_house', { gfa: app, height: 8, storeys: 2, footprint: 70, units: 1 }));
      rows.push(row(pid, 'gfa_max_m2', max));
    });
    return { cases, rows };
  };
  it('E1 five known ratios: median 0.9, q1 0.8, q3 1.0, iqr 0.2', () => {
    const f = five();
    const out = M.scoreCloseness(f.cases, f.rows, [], S);
    expect(out.measure).toBe('gfa');
    expect(out.n).toBe(5);
    expect(out.median).toBe(0.9);
    expect(out.spread).toEqual({ kind: 'iqr', q1: 0.8, q3: 1, iqr: 0.2 });
    expect(out.values).toEqual([
      { case: 'n1', ratio: 0.7 },
      { case: 'n2', ratio: 0.8 },
      { case: 'n3', ratio: 0.9 },
      { case: 'n4', ratio: 1 },
      { case: 'n5', ratio: 1.1 },
    ]);
  });
  it('E2 an even n averages the two middle values; a ratio is rounded to 3 dp', () => {
    const f = five();
    expect(M.scoreCloseness(f.cases.slice(0, 4), f.rows.slice(0, 4), [], S).median).toBe(0.85);
    const one = M.scoreCloseness(
      [CASE('q1', 'pq1', 'detached_house', { gfa: 1, height: 8, storeys: 2, footprint: 70, units: 1 })],
      [row('pq1', 'gfa_max_m2', 3)],
      [],
      S,
    );
    expect(one.values).toEqual([{ case: 'q1', ratio: 0.333 }]);
    expect(one.median).toBe(0.333);
  });
  it('E3 min_max and stdev spreads', () => {
    const f = five();
    const mm = cfg((s) => { s.closeness.spread = 'min_max'; });
    expect(M.scoreCloseness(f.cases, f.rows, [], mm).spread).toEqual({ kind: 'min_max', min: 0.7, max: 1.1 });
    const sdSet = cfg((s) => { s.closeness.spread = 'stdev'; });
    const sd = M.scoreCloseness(f.cases, f.rows, [], sdSet).spread as Dict;
    expect(sd.kind).toBe('stdev');
    expect(sd.stdev).toBeCloseTo(0.141, 3); // population stdev of 0.7..1.1 = sqrt(0.02) = 0.1414
  });
  it('E4 n = 0: median null and spread null', () => {
    const out = M.scoreCloseness([], [], [], S);
    expect(out.n).toBe(0);
    expect(out.median).toBeNull();
    expect(out.spread).toBeNull();
    expect(out.values).toEqual([]);
  });
  it('E5 the population: a granted variance, a non-new-build case and a parcel with no usable max are excluded', () => {
    const cs = five().cases.map((c) => (c.case === 'n2' ? { ...c, new_build: false } : c));
    const rows = five().rows.filter((r) => r.parcel_id !== 'n3');
    const out = M.scoreCloseness(cs, rows, [VROW('n1', 'gfa', 'yes', true)], S);
    expect(out.values.map((v) => v.case)).toEqual(['n4', 'n5']);
    expect(out.n).toBe(2);
    expect(out.median).toBe(1.05);
  });
  it('E6 the threshold stays what the settings hold: null -> threshold_met null; a number -> median >= t', () => {
    const f = five();
    const nil = M.scoreCloseness(f.cases, f.rows, [], S);
    expect(nil.threshold).toBeNull();
    expect(nil.threshold_met).toBeNull();
    const t90 = M.scoreCloseness(f.cases, f.rows, [], cfg((s) => { s.closeness.threshold = 0.9; }));
    expect(t90.threshold).toBe(0.9);
    expect(t90.threshold_met).toBe(true);
    const t95 = M.scoreCloseness(f.cases, f.rows, [], cfg((s) => { s.closeness.threshold = 0.95; }));
    expect(t95.threshold_met).toBe(false);
  });
});

describe('F. classifyRow and limitMatch (the catch table)', () => {
  const facts = (city_row: boolean, our_verdict: string, limit_match: boolean | null): { city_row: boolean; our_verdict: string; limit_match: boolean | null } => ({
    city_row,
    our_verdict,
    limit_match,
  });
  it('F1 the shipped table, row by row', () => {
    expect(M.classifyRow(facts(true, 'EXCEEDS', true), S)).toBe('CAUGHT');
    expect(M.classifyRow(facts(true, 'EXCEEDS', false), S)).toBe('WRONG LIMIT');
    expect(M.classifyRow(facts(true, 'EXCEEDS', null), S)).toBe('NOT SCORED');
    expect(M.classifyRow(facts(true, 'MAY EXCEED', null), S)).toBe('CAUGHT-ESTIMATE');
    expect(M.classifyRow(facts(true, 'COMPLIES', null), S)).toBe('MISSED');
    expect(M.classifyRow(facts(true, 'NOT EVALUATED', null), S)).toBe('MISSED');
    expect(M.classifyRow(facts(false, 'EXCEEDS', null), S)).toBe('FALSE ALARM');
    expect(M.classifyRow(facts(false, 'MAY EXCEED', null), S)).toBe('SOFT ALARM');
    expect(M.classifyRow(facts(false, 'COMPLIES', null), S)).toBe('NOT SCORED');
    expect(M.classifyRow(facts(false, 'NOT EVALUATED', null), S)).toBe('NOT SCORED');
  });
  it('F2 a changed table via cfg: NOT EVALUATED moved to NOT SCORED leaves the denominator', () => {
    const changed = cfg((s) => {
      const miss = s.catch.class_rules.find((r: Dict) => r.class === 'MISSED' && Array.isArray(r.our_verdict) && r.our_verdict.includes('NOT EVALUATED')) as Dict;
      miss.our_verdict = ['COMPLIES'];
      s.catch.class_rules.push({ class: 'NOT SCORED', city_row: true, our_verdict: ['NOT EVALUATED'] });
    });
    expect(M.classifyRow(facts(true, 'NOT EVALUATED', null), changed)).toBe('NOT SCORED');
    expect(M.classifyRow(facts(true, 'NOT EVALUATED', null), S)).toBe('MISSED');
    expect(M.classifyRow(facts(true, 'COMPLIES', null), changed)).toBe('MISSED');
    // a derived NOT EVALUATED City row is out of the denominator under the changed table, in it under the shipped one
    const cs = [CASE('e1', 'pe1', 'detached_house', { gfa: 120, height: 8, storeys: 2, footprint: 70, units: 1 })];
    const v = [VROW('e1', 'gfa', 'yes', true, { city_limit: 120 })];
    const out = M.scoreCatch(cs, [], v, changed);
    expect(out.denominator).toBe(0);
    expect(out.counts['NOT SCORED']).toBe(1);
    expect(M.scoreCatch(cs, [], v, S).denominator).toBe(1);
  });
  it('F3 limitMatch: null on a non-number, abs/rel window otherwise', () => {
    expect(M.limitMatch(null, 9, S)).toBeNull();
    expect(M.limitMatch(9, undefined, S)).toBeNull();
    expect(M.limitMatch('9', 9, S)).toBeNull();
    expect(M.limitMatch(Number.NaN, 9, S)).toBeNull();
    expect(M.limitMatch(100, 100, S)).toBe(true);
    expect(M.limitMatch(100, 100.6, S)).toBe(true); // rel 0.6 % of 100 = 0.6
    expect(M.limitMatch(100, 100.7, S)).toBe(false);
    expect(M.limitMatch(1, 1.011, S)).toBe(true); // abs 0.011 wins over the tiny rel window of 0.006
    expect(M.limitMatch(1, 1.012, S)).toBe(false);
  });
});

describe('G. scoreCatch: classes, derivation, denominator and thresholds (M-362 catch; SC-19)', () => {
  const rowOf = (out: CatchResult, caseId: string): CatchRow => out.rows.find((r) => r.case === caseId) as CatchRow;
  const th = (out: CatchResult, id: string): CatchThreshold => out.thresholds.find((t) => t.id === id) as CatchThreshold;
  it('G1 a City row with no verdict derives NOT EVALUATED when no max is usable, and it is in the denominator as MISSED', () => {
    const cs = [CASE('e1', 'pe1', 'detached_house', { gfa: 120, height: 8, storeys: 2, footprint: 70, units: 1 })];
    const out = M.scoreCatch(cs, [], [VROW('e1', 'gfa', 'yes', true, { city_limit: 120 })], S);
    const r = rowOf(out, 'e1');
    expect(r.our_verdict).toBe('NOT EVALUATED');
    expect(r.our_limit).toBeNull();
    expect(r.class).toBe('MISSED');
    expect(out.counts.MISSED).toBe(1);
    expect(out.denominator).toBe(1);
  });
  it('G2 the derivation from the Layer 3 max: figure > max + tolerance is EXCEEDS, else COMPLIES; our_limit = max', () => {
    const cs = [
      CASE('g1', 'pg1', 'detached_house', { gfa: 110, height: 12, storeys: 2, footprint: 70, units: 1 }),
      CASE('g2', 'pg2', 'detached_house', { gfa: 90, height: 10, storeys: 2, footprint: 70, units: 1 }),
    ];
    const rows = [row('pg1', 'gfa_max_m2', 100), row('pg1', 'height_max_m', 10), row('pg2', 'gfa_max_m2', 100), row('pg2', 'height_max_m', 10)];
    const v = [VROW('g1', 'gfa', 'yes', true, { city_limit: 110 }), VROW('g2', 'height', 'yes', true, { city_limit: 10 })];
    const out = M.scoreCatch(cs, rows, v, S);
    expect(rowOf(out, 'g1').our_verdict).toBe('EXCEEDS');
    expect(rowOf(out, 'g1').our_limit).toBe(100);
    expect(rowOf(out, 'g1').limit_match).toBe(false); // |110 - 100| > 0.6
    expect(rowOf(out, 'g1').class).toBe('WRONG LIMIT');
    expect(rowOf(out, 'g2').our_verdict).toBe('COMPLIES'); // height tolerance 0.05: 10 > 10.05 is false
    expect(rowOf(out, 'g2').class).toBe('MISSED');
  });
  it('G3 a given verdict and limit on the row win over the derivation', () => {
    const cs = [CASE('h1', 'ph1', 'detached_house', { gfa: 110, height: 8, storeys: 2, footprint: 70, units: 1 })];
    const rows = [row('ph1', 'gfa_max_m2', 100)];
    const out = M.scoreCatch(cs, rows, [VROW('h1', 'gfa', 'yes', true, { city_limit: 110, our_verdict: 'COMPLIES', our_limit: 110 })], S);
    const r = rowOf(out, 'h1');
    expect(r.our_verdict).toBe('COMPLIES');
    expect(r.our_limit).toBe(110);
    expect(r.limit_match).toBe(true);
    expect(r.class).toBe('MISSED');
  });
  it('G4 one of each class, the counts and the denominator (NOT SCORED excluded)', () => {
    const cs: Dict[] = [];
    const rows: Dict[] = [];
    const v: Dict[] = [];
    for (let i = 1; i <= 9; i += 1) {
      cs.push(CASE(`k${i}`, `pk${i}`, 'detached_house', { gfa: 100, height: 8, storeys: 2, footprint: 70, units: 1 }));
      rows.push(row(`pk${i}`, 'gfa_max_m2', 100));
    }
    v.push({ case: 'k1', measure: 'gfa', city_row: true, granted: 'yes', city_limit: 100, our_verdict: 'EXCEEDS', our_limit: 100 }); // CAUGHT
    v.push({ case: 'k2', measure: 'gfa', city_row: true, granted: 'yes', city_limit: 100, our_verdict: 'MAY EXCEED' }); // CAUGHT-ESTIMATE
    v.push({ case: 'k3', measure: 'gfa', city_row: true, granted: 'yes', city_limit: 110, our_verdict: 'EXCEEDS', our_limit: 100 }); // WRONG LIMIT
    v.push({ case: 'k4', measure: 'gfa', city_row: true, granted: 'no', city_limit: 90, our_verdict: 'COMPLIES' }); // MISSED
    v.push({ case: 'k5', measure: 'gfa', city_row: false, our_verdict: 'EXCEEDS' }); // FALSE ALARM
    v.push({ case: 'k6', measure: 'gfa', city_row: false, our_verdict: 'MAY EXCEED' }); // SOFT ALARM
    v.push({ case: 'k7', measure: 'gfa', city_row: true, granted: 'yes', city_limit: 100, our_verdict: 'EXCEEDS', our_limit: 100 }); // CAUGHT
    v.push({ case: 'k8', measure: 'gfa', city_row: false, our_verdict: 'COMPLIES' }); // NOT SCORED
    const out = M.scoreCatch(cs, rows, v, S);
    expect(out.rows).toHaveLength(8);
    expect(out.counts.CAUGHT).toBe(2);
    expect(out.counts['CAUGHT-ESTIMATE']).toBe(1);
    expect(out.counts['WRONG LIMIT']).toBe(1);
    expect(out.counts.MISSED).toBe(1);
    expect(out.counts['FALSE ALARM']).toBe(1);
    expect(out.counts['SOFT ALARM']).toBe(1);
    expect(out.counts['NOT SCORED']).toBe(1);
    expect(out.denominator).toBe(5); // CAUGHT 2 + ESTIMATE 1 + WRONG LIMIT 1 + MISSED 1
    expect(th(out, 'caught_plus_estimate_pct_min').actual).toBe(60); // 3/5
    expect(th(out, 'caught_pct_min').actual).toBe(40); // 2/5
    expect(th(out, 'false_alarm_max').actual).toBe(1);
    expect(th(out, 'soft_alarm_max').actual).toBe(1);
    expect(th(out, 'wrong_limit_max').actual).toBe(1);
    expect(out.pass).toBe(false);
  });
  it('G5 the pct_min boundary: 70.0 passes, just under fails', () => {
    const cityRun = (n: number, caught: number, est: number): CatchResult => {
      const cs: Dict[] = [];
      const rows: Dict[] = [];
      const v: Dict[] = [];
      for (let i = 1; i <= n; i += 1) {
        cs.push(CASE(`t${i}`, `pt${i}`, 'detached_house', { gfa: 100, height: 8, storeys: 2, footprint: 70, units: 1 }));
        rows.push(row(`pt${i}`, 'gfa_max_m2', 100));
        const our_verdict = i <= caught ? 'EXCEEDS' : i <= caught + est ? 'MAY EXCEED' : 'COMPLIES';
        v.push({ case: `t${i}`, measure: 'gfa', city_row: true, granted: 'yes', city_limit: 100, our_verdict, our_limit: 100 });
      }
      return M.scoreCatch(cs, rows, v, S);
    };
    const at70 = cityRun(10, 7, 0);
    expect(th(at70, 'caught_plus_estimate_pct_min').actual).toBe(70);
    expect(th(at70, 'caught_plus_estimate_pct_min').pass).toBe(true);
    expect(th(cityRun(10, 6, 1), 'caught_plus_estimate_pct_min').pass).toBe(true); // 7/10
    expect(th(cityRun(10, 6, 0), 'caught_plus_estimate_pct_min').pass).toBe(false); // 60 %: just under
    expect(th(cityRun(10, 6, 0), 'caught_pct_min').pass).toBe(true); // 60 % >= 50
    expect(th(cityRun(10, 5, 0), 'caught_pct_min').actual).toBe(50);
    expect(th(cityRun(10, 5, 0), 'caught_pct_min').pass).toBe(true); // exactly 50 passes
    expect(th(cityRun(10, 4, 0), 'caught_pct_min').pass).toBe(false); // 40 % just under
  });
  it('G5b pct_min compares the exact percentage: 1749 of 2500 is 69.96 and fails 70', () => {
    const runOf2500 = (caught: number): CatchResult => {
      const v: Dict[] = [];
      for (let i = 1; i <= 2500; i += 1) {
        const our_verdict = i <= caught ? 'EXCEEDS' : 'COMPLIES';
        v.push({ case: `x${i}`, measure: 'setback', city_row: true, granted: 'yes', city_limit: 100, our_limit: 100, our_verdict });
      }
      return M.scoreCatch([], [], v, S);
    };
    const under = runOf2500(1749);
    const under70 = th(under, 'caught_plus_estimate_pct_min');
    expect(under70.pass).toBe(false); // 69.96 % is under 70, however it rounds
    expect(under70.actual).toBeCloseTo(69.96, 9);
    const at70 = th(runOf2500(1750), 'caught_plus_estimate_pct_min');
    expect(at70.actual).toBeCloseTo(70.0, 9);
    expect(at70.pass).toBe(true);
  });
  it('G6 the count_max boundary: 10 false alarms pass, 11 fail; 15 soft alarms pass, 16 fail', () => {
    const alarmRun = (falseAlarms: number, softAlarms: number): CatchResult => {
      const cs: Dict[] = [];
      const v: Dict[] = [];
      cs.push(CASE('z0', 'pz0', 'detached_house', { gfa: 100, height: 8, storeys: 2, footprint: 70, units: 1 }));
      for (let i = 1; i <= falseAlarms; i += 1) {
        cs.push(CASE(`f${i}`, `pf${i}`, 'detached_house', { gfa: 100, height: 8, storeys: 2, footprint: 70, units: 1 }));
        v.push({ case: `f${i}`, measure: 'gfa', city_row: false, our_verdict: 'EXCEEDS' });
      }
      for (let i = 1; i <= softAlarms; i += 1) {
        cs.push(CASE(`s${i}`, `ps${i}`, 'detached_house', { gfa: 100, height: 8, storeys: 2, footprint: 70, units: 1 }));
        v.push({ case: `s${i}`, measure: 'gfa', city_row: false, our_verdict: 'MAY EXCEED' });
      }
      v.push({ case: 'z0', measure: 'gfa', city_row: true, granted: 'yes', city_limit: 100, our_verdict: 'EXCEEDS', our_limit: 100 });
      return M.scoreCatch(cs, [], v, S);
    };
    expect(th(alarmRun(10, 0), 'false_alarm_max').pass).toBe(true);
    expect(th(alarmRun(11, 0), 'false_alarm_max').pass).toBe(false);
    expect(th(alarmRun(0, 15), 'soft_alarm_max').pass).toBe(true);
    expect(th(alarmRun(0, 16), 'soft_alarm_max').pass).toBe(false);
  });
  it('G7 an existing-lot-minimum false alarm fails that one threshold only', () => {
    const cs: Dict[] = [];
    const v: Dict[] = [];
    for (let i = 1; i <= 8; i += 1) {
      cs.push(CASE(`m${i}`, `pm${i}`, 'detached_house', { gfa: 100, height: 8, storeys: 2, footprint: 70, units: 1 }));
      v.push({ case: `m${i}`, measure: 'gfa', city_row: true, granted: 'yes', city_limit: 100, our_verdict: 'EXCEEDS', our_limit: 100 });
    }
    v.push({ case: 'm1', measure: 'gfa', city_row: false, our_verdict: 'EXCEEDS', category: 'existing-lot minimum' });
    const out = M.scoreCatch(cs, [], v, S);
    expect(th(out, 'false_alarm_existing_lot_minimum_max').actual).toBe(1);
    expect(th(out, 'false_alarm_existing_lot_minimum_max').pass).toBe(false);
    expect(th(out, 'false_alarm_existing_party_wall_max').pass).toBe(true);
    expect(th(out, 'false_alarm_max').pass).toBe(true);
    expect(th(out, 'caught_plus_estimate_pct_min').pass).toBe(true);
    expect(th(out, 'caught_pct_min').pass).toBe(true);
    expect(out.pass).toBe(false); // the one failing line fails the catch report
  });
  it('G8 an unknown false-alarm category, and an absent one, fall to other', () => {
    const cs = [CASE('u1', 'pu1', 'detached_house', { gfa: 100, height: 8, storeys: 2, footprint: 70, units: 1 })];
    const city = { case: 'u1', measure: 'gfa', city_row: true, granted: 'yes', city_limit: 100, our_verdict: 'EXCEEDS', our_limit: 100 };
    const out = M.scoreCatch(cs, [], [city, { case: 'u1', measure: 'gfa', city_row: false, our_verdict: 'EXCEEDS', category: 'made up' }], S);
    expect((out.rows.find((r) => r.class === 'FALSE ALARM') as CatchRow).category).toBe('other');
    expect(th(out, 'false_alarm_existing_lot_minimum_max').actual).toBe(0);
    const dflt = M.scoreCatch(cs, [], [city, { case: 'u1', measure: 'gfa', city_row: false, our_verdict: 'EXCEEDS' }], S);
    expect((dflt.rows.find((r) => r.class === 'FALSE ALARM') as CatchRow).category).toBe('other');
  });
  it('G9 a pct_min threshold with a zero denominator has actual null and does not pass', () => {
    const out = M.scoreCatch([], [], [], S);
    expect(out.denominator).toBe(0);
    for (const t of out.thresholds) {
      if (t.kind === 'pct_min') {
        expect(t.actual).toBeNull();
        expect(t.pass).toBe(false);
      }
    }
    expect(out.pass).toBe(false);
  });
});

describe('H. scoreInc7: the whole fixture, the digest, the throws, no mutation (M-362)', () => {
  it('H1 the passing fixture: ok true, every gated measure reporting, catch passing', () => {
    const out = M.scoreInc7(inputPass());
    expect(out.direction.gfa?.gated).toBe(true);
    expect(out.direction.height?.gated).toBe(true);
    expect(out.direction.storeys?.gated).toBe(true);
    expect(out.closeness.measure).toBe('gfa');
    expect(out.closeness.values.map((v) => v.case)).toEqual(PARCELS_10);
    expect(out.catch.pass).toBe(true);
    expect(out.ok).toBe(true);
  });
  it('H2 settings_digest is a 12-hex-char sha256 prefix of the canonical settings', () => {
    const out = M.scoreInc7(input6());
    const whole = sha256Hex(canonical(S));
    expect(out.settings_digest).toMatch(/^[0-9a-f]{12}$/);
    expect(whole.startsWith(out.settings_digest)).toBe(true);
    expect(M.scoreInc7(input6()).settings_digest).toBe(out.settings_digest);
  });
  it('H3 the digest changes when a setting changes', () => {
    const base = M.scoreInc7(input6()).settings_digest;
    const t = M.scoreInc7({ ...input6(), settings: cfg((s) => { s.closeness.threshold = 0.9; }) }).settings_digest;
    expect(t).not.toBe(base);
    const g = M.scoreInc7({ ...input6(), settings: cfg((s) => { s.direction.gate_measures.push('footprint'); }) }).settings_digest;
    expect(g).not.toBe(base);
  });
  it('H4 an invalid setting set throws inc7_settings_invalid; a bad input throws inc7_input_invalid:<what>', () => {
    expect(() => M.scoreInc7({ ...input6(), settings: cfg((s) => { s.direction.count_rounding = 'half_up'; }) })).toThrow(/^inc7_settings_invalid/);
    const first = cases6()[0] as Dict;
    expect(() => M.scoreInc7({ ...input6(), cases: [...cases6(), first] })).toThrow(/^inc7_input_invalid:cases_duplicate:c1$/);
    expect(() => M.scoreInc7({ ...input6(), cases: 'nope' as any })).toThrow(/^inc7_input_invalid:cases/);
    expect(() => M.scoreInc7({ ...input6(), varianceRows: 'nope' as any })).toThrow(/^inc7_input_invalid:variance_rows/);
    expect(() => M.scoreInc7({ ...input6(), layer3Rows: 'nope' as any })).toThrow(/^inc7_input_invalid:layer3_rows/);
  });
  it('H5 no input is mutated: every scorer runs on deep-frozen inputs and they are still deep-frozen', () => {
    const inp = deepFreeze({ cases: cases6(), layer3Rows: L3_P1_P6(), varianceRows: VROWS6(), settings: cfg((s) => { s.closeness.threshold = 0.9; }) });
    expect(isDeepFrozen(inp)).toBe(true);
    expect(() => M.requiredCorrect(25, 90, 'ceil')).not.toThrow();
    expect(() => M.validateSettings(inp.settings)).not.toThrow();
    expect(() => M.maxFor(inp.layer3Rows, 'p1', 'detached_house', 'gfa', inp.settings)).not.toThrow();
    expect(() => M.scoreDirection(inp.cases, inp.layer3Rows, inp.varianceRows, inp.settings)).not.toThrow();
    expect(() => M.scoreCloseness(inp.cases, inp.layer3Rows, inp.varianceRows, inp.settings)).not.toThrow();
    expect(() => M.scoreCatch(inp.cases, inp.layer3Rows, inp.varianceRows, inp.settings)).not.toThrow();
    expect(() => M.scoreInc7(inp)).not.toThrow();
    expect(isDeepFrozen(inp)).toBe(true);
  });
  it('H6 idempotent: two runs return deep-equal results', () => {
    const a = M.scoreInc7(input6());
    const b = M.scoreInc7(input6());
    expect(a).toEqual(b);
  });
});

describe('I. runInc7: read the data, ask the reader for the case parcels, score (async)', () => {
  const paths = { cases: '/r/cases.json', variance_rows: '/r/variance.json', settings: '/r/settings.json' };
  const readJson6 = (p: string): any => (p === '/r/cases.json' ? cases6() : p === '/r/variance.json' ? VROWS6() : S);
  it('I1 the reader gets the distinct non-null parcel ids sorted, is called once, and the result equals scoreInc7', async () => {
    const asked: string[][] = [];
    const out = await M.runInc7({
      reader: {
        layer3Rows: async (ids: string[]) => {
          asked.push(ids);
          return L3_P1_P6();
        },
      },
      readJson: readJson6,
      paths,
    });
    expect(asked).toEqual([['p1', 'p2', 'p3', 'p4', 'p5', 'p6']]);
    expect(asked.length).toBe(1);
    expect(out).toEqual(M.scoreInc7({ cases: cases6(), layer3Rows: L3_P1_P6(), varianceRows: VROWS6(), settings: S }));
  });
  it('I2 the parcel list is sorted and carries each parcel once', async () => {
    const cs = [
      CASE('a1', 'pb', 'detached_house', { gfa: 1, height: 8, storeys: 2, footprint: 70, units: 1 }),
      CASE('a2', 'pa', 'detached_house', { gfa: 1, height: 8, storeys: 2, footprint: 70, units: 1 }),
      CASE('a3', 'pb', 'detached_house', { gfa: 1, height: 8, storeys: 2, footprint: 70, units: 1 }),
    ];
    const asked: string[][] = [];
    await M.runInc7({
      reader: {
        layer3Rows: async (ids: string[]) => {
          asked.push(ids);
          return [];
        },
      },
      readJson: (p: string) => (p === '/r/cases.json' ? cs : p === '/r/variance.json' ? [] : S),
      paths,
    });
    expect(asked).toEqual([['pa', 'pb']]);
  });
  it('I3 the reader is called once and its rejection propagates', async () => {
    let calls = 0;
    const run = M.runInc7({
      reader: {
        layer3Rows: async () => {
          calls += 1;
          throw new Error('reader_down');
        },
      },
      readJson: readJson6,
      paths,
    });
    await expect(run).rejects.toThrow(/reader_down/);
    expect(calls).toBe(1);
  });
});

describe('J. provisional-defaults lock: the shipped settings are the research reading (RESEARCH-20261115)', () => {
  it('J1 direction: gate gfa/height/storeys, threshold 90, rounding ceil, denominator all_cases', () => {
    expect(S.direction.measures).toEqual(['gfa', 'height', 'storeys', 'footprint', 'units']);
    expect(S.direction.gate_measures).toEqual(['gfa', 'height', 'storeys']);
    expect(S.direction.threshold_pct).toBe(90);
    expect(S.direction.count_rounding).toBe('ceil');
    expect(S.direction.denominator).toBe('all_cases');
    expect(S.direction.variance_granted_values).toEqual(['yes', 'modified']);
    expect(S.direction.tolerance).toEqual({ gfa: 0.05, height: 0.05, storeys: 0, footprint: 0.05, units: 0 });
  });
  it('J2 closeness: gfa, new builds with no variance on the measure, iqr spread, threshold null', () => {
    expect(S.closeness.measure).toBe('gfa');
    expect(S.closeness.population).toEqual({ new_build: true, variance_on_measure: false });
    expect(S.closeness.spread).toBe('iqr');
    expect(S.closeness.threshold).toBeNull();
  });
  it('J3 catch thresholds are 70 / 50 / 10 / 15 / 3, the two zero-category lines and the two SC-19 wrong-limit lines', () => {
    const list = S.catch.thresholds.map((t: Dict) => [t.id, t.kind, t.value, t.classes, t.category ?? null]);
    expect(list).toEqual([
      ['caught_plus_estimate_pct_min', 'pct_min', 70, ['CAUGHT', 'CAUGHT-ESTIMATE'], null],
      ['caught_pct_min', 'pct_min', 50, ['CAUGHT'], null],
      ['false_alarm_max', 'count_max', 10, ['FALSE ALARM'], null],
      ['soft_alarm_max', 'count_max', 15, ['SOFT ALARM'], null],
      ['wrong_limit_max', 'count_max', 3, ['WRONG LIMIT'], null],
      ['false_alarm_existing_lot_minimum_max', 'count_max', 0, ['FALSE ALARM'], 'existing-lot minimum'],
      ['false_alarm_existing_party_wall_max', 'count_max', 0, ['FALSE ALARM'], 'existing/party wall'],
      ['wrong_limit_complete_inputs_max', 'count_max', 0, ['WRONG LIMIT'], null],
      ['wrong_limit_named_cause_max', 'count_max', 0, ['WRONG LIMIT'], null],
    ]);
    // Operator ruling 2026-11-15, verbatim "1,2 and 4 y" (D-4, SC-19): zero wrong limits with complete inputs, and
    // zero wrong limits without a named cause. Both are the same class, narrowed by one flag.
    const complete = S.catch.thresholds.find((t: Dict) => t.id === 'wrong_limit_complete_inputs_max') as Dict;
    expect(complete.complete_inputs).toBe(true);
    expect((S.catch.thresholds.find((t: Dict) => t.id === 'wrong_limit_max') as Dict).complete_inputs).toBeUndefined();
    const named = S.catch.thresholds.find((t: Dict) => t.id === 'wrong_limit_named_cause_max') as Dict;
    expect(named.named_cause).toBe(false);
  });
  it('J4 layer 3 and catch basics: one usable status, five measure fields, denominator classes, NOT SCORED', () => {
    expect(S.layer3.usable_status).toEqual(['computed']);
    expect(S.layer3.field_by_measure).toEqual({ gfa: 'gfa_max_m2', height: 'height_max_m', storeys: 'storeys_max', footprint: 'footprint_max_m2', units: 'units_max' });
    expect(S.catch.denominator_classes).toEqual(['CAUGHT', 'CAUGHT-ESTIMATE', 'WRONG LIMIT', 'MISSED']);
    expect(S.catch.unclassified_class).toBe('NOT SCORED');
    expect(S.catch.false_alarm_categories).toEqual(['existing-lot minimum', 'existing/party wall', 'other']);
    expect(S.catch.limit_match).toEqual({ abs: 0.011, rel_pct: 0.6, epsilon: 1e-9 });
  });
  it('J5 the shipped file still validates clean after the lock (a silent change fails both)', () => {
    expect(M.validateSettings(S)).toEqual([]);
    expect(M.requiredCorrect(S.direction.threshold_pct === 90 ? 25 : 0, S.direction.threshold_pct, S.direction.count_rounding)).toBe(23);
  });
});

describe('K. panel findings F1..F5: no vacuous pass, no silent pick among ambiguous maxima, roles and fallback as settings', () => {
  // F1: an empty denominator requires nothing and must never pass (ceil of 0 is 0, so correct >= required was vacuously true).
  it('K1 an empty denominator never passes: no cases, or cases with no applicant figure', () => {
    expect((M.scoreDirection([], [], [], S).gfa as DirectionStats).pass).toBe(false);
    const out = M.scoreInc7({ cases: [], layer3Rows: [], varianceRows: [], settings: S });
    expect(out.ok).toBe(false);
    const noFigures = cases6().map((c) => ({ ...c, applicant: {} }));
    const s = M.scoreDirection(noFigures, L3_P1_P6(), VROWS6(), S).gfa as DirectionStats;
    expect(s.no_applicant_figure).toBe(6);
    expect(s.denominator).toBe(0);
    expect(s.pass).toBe(false);
    expect(M.scoreInc7({ cases: noFigures, layer3Rows: L3_P1_P6(), varianceRows: VROWS6(), settings: S }).ok).toBe(false);
  });

  // F2: two usable rows for one parcel, class and field with different figures: no maximum, and the answer is order-free.
  it('K2 maxFor: two usable rows with different figures are ambiguous, identical figures are fine, order-blind', () => {
    const two = (a: number, b: number): Dict[] => [row('p1', 'gfa_max_m2', a), row('p1', 'gfa_max_m2', b)];
    expect(M.maxFor(two(100, 120), 'p1', 'detached_house', 'gfa', S)).toEqual({ value: null, reason: 'ambiguous' });
    expect(M.maxFor(two(120, 100), 'p1', 'detached_house', 'gfa', S)).toEqual({ value: null, reason: 'ambiguous' });
    expect(M.maxFor(two(100, 100), 'p1', 'detached_house', 'gfa', S)).toEqual({ value: 100, reason: 'ok' });
    // rows of another class, another field or another parcel are not rivals: still one maximum
    const mixed: Dict[] = [row('p1', 'gfa_max_m2', 100), row('p1', 'gfa_max_m2', 120), row('p1', 'gfa_max_m2', 999, 'computed', 'sixplex')];
    expect(M.maxFor(mixed, 'p1', 'detached_house', 'gfa', S)).toEqual({ value: null, reason: 'ambiguous' });
    expect(M.maxFor(mixed, 'p1', 'sixplex', 'gfa', S)).toEqual({ value: 999, reason: 'ok' });
    // an unusable rival row does not make the maximum ambiguous
    const unusableRival: Dict[] = [row('p1', 'gfa_max_m2', 100), row('p1', 'gfa_max_m2', 120, 'not_evaluated')];
    expect(M.maxFor(unusableRival, 'p1', 'detached_house', 'gfa', S)).toEqual({ value: 100, reason: 'ok' });
  });
  it('K3 scoreDirection: a case on an ambiguous parcel is not evaluated (all_cases keeps it in the denominator)', () => {
    const cs = [CASE('c1', 'p1', 'detached_house', { gfa: 100, height: 9, storeys: 2, footprint: 90, units: 1 })];
    const rows: Dict[] = [row('p1', 'gfa_max_m2', 100), row('p1', 'gfa_max_m2', 120), row('p1', 'height_max_m', 10), row('p1', 'storeys_max', 3)];
    const gfa = M.scoreDirection(cs, rows, [], S).gfa as DirectionStats;
    expect(gfa.not_evaluated).toBe(1);
    expect(gfa.not_evaluated_cases).toEqual(['c1']);
    expect(gfa.correct).toBe(0);
    expect(gfa.denominator).toBe(1);
    expect(gfa.pass).toBe(false);
    // the derived catch verdict for the same parcel is NOT EVALUATED, never a silent EXCEEDS/COMPLIES
    const caught = M.scoreCatch(cs, rows, [VROW('c1', 'gfa', 'yes', true, { city_limit: 100 })], S);
    expect((caught.rows[0] as CatchRow).our_verdict).toBe('NOT EVALUATED');
    expect((caught.rows[0] as CatchRow).our_limit).toBeNull();
  });

  // F3: the verdict roles are settings; the order of catch.verdicts names nothing.
  it('K4 the shipped roles: four distinct verdict words, each in catch.verdicts', () => {
    expect(S.catch.verdict_roles).toEqual({
      exceeds: 'EXCEEDS',
      may_exceed: 'MAY EXCEED',
      complies: 'COMPLIES',
      not_evaluated: 'NOT EVALUATED',
    });
    expect([...S.catch.verdicts].sort()).toEqual(Object.values(S.catch.verdict_roles).sort());
    expect(M.validateSettings(S)).toEqual([]);
  });
  it('K5 reordering catch.verdicts changes nothing; a missing role is verdict_role_missing:<role>', () => {
    const reordered = cfg((s) => { s.catch.verdicts = ['NOT EVALUATED', 'COMPLIES', 'MAY EXCEED', 'EXCEEDS']; });
    expect(M.validateSettings(reordered)).toEqual([]);
    const base = M.scoreInc7(input6());
    const flip = M.scoreInc7({ ...input6(), settings: reordered });
    expect(flip.catch).toEqual(base.catch);
    expect(flip.ok).toBe(base.ok);
    expect(flip.settings_digest).not.toBe(base.settings_digest); // the digest still names the file as written
    const missing = cfg((s) => { delete s.catch.verdict_roles.exceeds; });
    expect(M.validateSettings(missing)).toContain('verdict_role_missing:exceeds');
    expect(() => M.scoreInc7({ ...input6(), settings: missing })).toThrow(/^inc7_settings_invalid/);
    const unknownWord = cfg((s) => { s.catch.verdict_roles.complies = 'PASSES'; });
    expect(M.validateSettings(unknownWord)).toContain('verdict_role_missing:complies');
    const noRoles = cfg((s) => { delete s.catch.verdict_roles; });
    expect(M.validateSettings(noRoles)).toContain('verdict_role_missing:exceeds');
  });

  // F4: the fallback category is a setting, never the last category in the list.
  it('K6 the shipped fallback is "other" and it validates clean', () => {
    expect(S.catch.false_alarm_fallback_category).toBe('other');
    expect(S.catch.false_alarm_categories).toContain(S.catch.false_alarm_fallback_category);
    expect(M.validateSettings(S)).toEqual([]);
  });
  it('K7 an unknown category falls to the setting; a re-pointed setting moves the bucket and fails its zero line', () => {
    const cs = [CASE('u1', 'pu1', 'detached_house', { gfa: 100, height: 8, storeys: 2, footprint: 70, units: 1 })];
    const city = VROW('u1', 'gfa', 'yes', true, { city_limit: 100, our_verdict: 'EXCEEDS', our_limit: 100 });
    const alarm = { case: 'u1', measure: 'gfa', city_row: false, our_verdict: 'EXCEEDS', category: 'made up' };
    const th = (out: CatchResult, id: string): CatchThreshold => out.thresholds.find((t) => t.id === id) as CatchThreshold;
    const shipped = M.scoreCatch(cs, [], [city, alarm], S);
    expect((shipped.rows.find((r) => r.class === 'FALSE ALARM') as CatchRow).category).toBe('other');
    const partyWall = cfg((s) => { s.catch.false_alarm_fallback_category = 'existing/party wall'; });
    expect(M.validateSettings(partyWall)).toEqual([]);
    const moved = M.scoreCatch(cs, [], [city, alarm], partyWall);
    expect((moved.rows.find((r) => r.class === 'FALSE ALARM') as CatchRow).category).toBe('existing/party wall');
    expect(th(moved, 'false_alarm_existing_party_wall_max').actual).toBe(1);
    expect(th(moved, 'false_alarm_existing_party_wall_max').pass).toBe(false);
    expect(th(shipped, 'false_alarm_existing_party_wall_max').pass).toBe(true);
    const invalid = cfg((s) => { s.catch.false_alarm_fallback_category = 'made up'; });
    expect(M.validateSettings(invalid)).toContain('fallback_category_invalid');
    expect(() => M.scoreInc7({ cases: cs, layer3Rows: [], varianceRows: [city, alarm], settings: invalid })).toThrow(/^inc7_settings_invalid/);
  });

  // F5: a maximum of zero or less is no denominator at all (today only 0 is skipped, so -5 gives a ratio of -18).
  it('K8 scoreCloseness excludes a parcel whose maximum is zero or negative', () => {
    const cs = [
      CASE('d1', 'pd1', 'detached_house', { gfa: 90, height: 8, storeys: 2, footprint: 70, units: 1 }),
      CASE('d2', 'pd2', 'detached_house', { gfa: 90, height: 8, storeys: 2, footprint: 70, units: 1 }),
      CASE('d3', 'pd3', 'detached_house', { gfa: 90, height: 8, storeys: 2, footprint: 70, units: 1 }),
    ];
    const rows = [row('pd1', 'gfa_max_m2', 100), row('pd2', 'gfa_max_m2', -5), row('pd3', 'gfa_max_m2', 0)];
    const out = M.scoreCloseness(cs, rows, [], S);
    expect(out.values).toEqual([{ case: 'd1', ratio: 0.9 }]);
    expect(out.n).toBe(1);
  });
});
