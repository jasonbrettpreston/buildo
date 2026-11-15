// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-362 (increment 7: direction gate, closeness, catch rate)
// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md SC-19
// Operator rulings 2026-11-15: "1,2 and 4 y", "3 y" (INC-7 building rule, D-1..D-4, by-building primary measure)
// Red first: docs/reports/red-evidence/INC7/inc7-rulings-red.txt
// INC7-S step 6 (RED): the module gains a buildings block, the two rulings and the D-2..D-4 fixes.
// Every locked function below (clauseKey, buildingOfRow, measureOfRow, prepareRows, unitsOf, adaptBuildingFile) is NEW:
// the module is written in the NEXT step, so this file fails on `M.<name> is not a function` (or on the assertions that
// pin the new behaviour of the existing scorers). Nothing here is made to pass in this step.
// Pure checks only; the settings file is read as data (mcbylaws/loop/inc7-scorer-settings.json) and never edited.
// The scorer may not mutate its inputs: several tests deep-freeze them and one runs the scorer twice.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(__dirname, '../..');
const MODULE_PATH = path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-inc7-score.mjs');
const M = (await import(MODULE_PATH)) as unknown as Inc7BuildingsModule;
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'mcbylaws/loop/inc7-scorer-settings.json'), 'utf8')) as Settings;

type Dict = { [key: string]: any };
type Settings = { [key: string]: any };
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
  excluded_cases?: string[];
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
  clause?: string | null;
  ordinal?: number | null;
  building?: string | null;
  city_row: boolean;
  our_verdict: string;
  city_limit: number | null;
  our_limit: number | null;
  limit_match: boolean | null;
  category: string | null;
  class: string;
  off_scope?: string | null;
  relative?: boolean;
  cause?: string | null;
  complete_inputs?: boolean;
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
type Manifest = {
  excluded: { case: string; measure: string; reason: string }[];
  denominators: { [measure: string]: number };
  units: string[];
  skipped_rows: Dict[];
  disclosures: Dict[];
  digest: string;
};
type Inc7Result = {
  direction: { [measure: string]: DirectionStats };
  closeness: ClosenessResult;
  catch: CatchResult;
  ok: boolean;
  settings_digest: string;
  manifest?: Manifest;
};
type BuildingOf = { building: string; rule_id: string; displaced_by: string | null };
type Unit = {
  id: string;
  case: string;
  building: string;
  class: string | null;
  status: string;
  applicant: Dict;
  parcel_id: string | null;
  held: boolean;
  new_build: boolean;
};
type Inc7BuildingsModule = {
  requiredCorrect: (n: number, pct: number, rounding: string) => number;
  validateSettings: (s: Settings) => string[];
  scoreDirection: (cases: any[], layer3Rows: any[], varianceRows: any[], settings: Settings) => { [measure: string]: DirectionStats };
  scoreCloseness: (cases: any[], layer3Rows: any[], varianceRows: any[], settings: Settings) => ClosenessResult;
  classifyRow: (facts: Dict, settings: Settings) => string;
  scoreCatch: (cases: any[], layer3Rows: any[], varianceRows: any[], settings: Settings) => CatchResult;
  scoreInc7: (input: Dict) => Inc7Result;
  clauseKey: (clause: unknown) => string | null;
  buildingOfRow: (row: Dict, suiteBuildings: string[], settings: Settings) => BuildingOf;
  measureOfRow: (row: Dict, settings: Settings) => string | null;
  prepareRows: (cases: any[], varianceRows: any[], settings: Settings) => { rows: Dict[]; skipped: Dict[] };
  unitsOf: (caseObj: Dict, settings: Settings) => Unit[];
  adaptBuildingFile: (file: Dict, settings: Settings) => { cases: Dict[]; varianceRows: Dict[] };
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
const row = (parcel_id: string, field_id: string, value: number | string | null, building_type = 'detached_house', status = 'computed'): Dict => ({
  parcel_id,
  field_id,
  value,
  status,
  building_type,
});
const VROW = (caseId: string, measure: string, granted: string, city_row: boolean, extra: Dict = {}): Dict => ({
  case: caseId,
  measure,
  city_row,
  granted,
  ...extra,
});
// A case the OLD way (no buildings block): unitsOf normalises it to one main building.
const CASE = (id: string, parcel_id: string, applicant_class: string | null, applicant: Dict, new_build: boolean | undefined = true): Dict => {
  const c: Dict = { case: id, parcel_id, applicant_class, applicant };
  if (new_build !== undefined) c.new_build = new_build;
  return c;
};
// A case the NEW way (INC-7 shape): main / garden_suite / laneway_suite.
const B = (cls: string | null, status: string, applicant: Dict): Dict => ({ class: cls, status, applicant });
const BCASE = (id: string, parcel_id: string, buildings: Dict): Dict => ({ case: id, parcel_id, buildings });

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
const VROWS6 = (): Dict[] => [VROW('c4', 'gfa', 'yes', true, { city_limit: 120, applicant_figure: 120 })];
const input6 = (settings: Settings = S): Dict => ({ cases: cases6(), layer3Rows: L3_P1_P6(), varianceRows: VROWS6(), settings });

// The module's own text, comments removed, for the no-clause-names-in-code guard.
const moduleCode = (): string =>
  fs
    .readFileSync(MODULE_PATH, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/*'))
    .join('\n');

describe('L. clauseKey: the normalised clause path (operator ruling 2026-11-15, "1,2 and 4 y")', () => {
  it('L1 a Chapter prefix, the dot before "(" and a trailing ", Exception ..." part are stripped', () => {
    expect(M.clauseKey('Chapter 10.20.30.40.(1)(A)')).toBe('10.20.30.40(1)(A)');
    expect(M.clauseKey('900.6.10(252), Exception RM 252')).toBe('900.6.10(252)');
    expect(M.clauseKey('150.7.60.20(2)(B)')).toBe('150.7.60.20(2)(B)');
  });
  it('L2 surrounding spaces go; null, empty and non-string are null', () => {
    expect(M.clauseKey('  10.5.60.40(3)  ')).toBe('10.5.60.40(3)');
    expect(M.clauseKey(null)).toBeNull();
    expect(M.clauseKey('')).toBeNull();
    expect(M.clauseKey(42)).toBeNull();
    expect(M.clauseKey(undefined)).toBeNull();
  });
});

describe('M. buildingOfRow: the clause family decides the building, the row\'s own field is ignored (ruling "1,2 and 4 y", item 1)', () => {
  const of = (clause: unknown, suite: string[] = []): BuildingOf => M.buildingOfRow({ clause, building: 'garden_suite' }, suite, S);
  it('M1 the clause_rules table: clause family -> building', () => {
    expect(of('150.7.60.50(2)').building).toBe('garden_suite');
    expect(of('150.8.60.40(1)(A)').building).toBe('laneway_suite');
    expect(of('10.5.60.40(3)').building).toBe('other_ancillary');
    expect(of('10.10.60.70(1)').building).toBe('other_ancillary');
    expect(of('10.20.40.10(1)(A)').building).toBe('main');
    expect(of('900.3.10(38)(A)').building).toBe('main');
    expect(of('10.20.30.40(1)(A)').building).toBe('lot_wide');
    expect(of('900.6.10(252), Exception RM 252').building).toBe('lot_wide');
    expect(of('Chapter 10.20.30.40.(1)(A)').building).toBe('lot_wide');
    expect(of('200.5.1.10(2)(A)(i)').building).toBe('lot_wide');
    expect(of('10.5.100.1(2)(B)(ii)').building).toBe('lot_wide');
  });
  it('M2 no clause is the no_clause building (lot_wide); an unclaimed clause is the default (unknown)', () => {
    const none = of(null);
    expect(none.building).toBe(S.buildings.no_clause_building);
    expect(none.building).toBe('lot_wide');
    expect(none.rule_id).toBe('no_clause');
    const odd = of('999.9.9');
    expect(odd.building).toBe(S.buildings.default_building);
    expect(odd.building).toBe('unknown');
    expect(odd.rule_id).toBe('default');
  });
  it('M3 the displaced rows: a case with a garden suite moves the clause to the displacing family', () => {
    // R12: 10.5.50.10(3)(A) is lot_wide alone, garden_suite when the case carries a garden suite
    const alone = of('10.5.50.10(3)(A)');
    expect(alone.building).toBe('lot_wide');
    const withSuite = of('10.5.50.10(3)(A)', ['garden_suite']);
    expect(withSuite.building).toBe('garden_suite');
    expect(withSuite.rule_id).toBe('R12');
    expect(withSuite.displaced_by).toBe('150.7.50.10(1)');
    // R15: lot coverage stays a lot-wide measure even beside a garden suite
    const coverage = of('10.20.30.40(1)(A)', ['garden_suite']);
    expect(coverage.building).toBe('lot_wide');
    expect(coverage.rule_id).toBe('R15');
    expect(coverage.displaced_by).toBe('150.7.60.70(1)');
    expect(of('10.20.30.40(1)(A)').displaced_by).toBeNull();
  });
});

describe('N. measureOfRow: the measure follows the clause family (ruling "3 y", primary measure by building)', () => {
  const of = (clause: string, measure?: unknown): string | null => M.measureOfRow(measure === undefined ? { clause } : { clause, measure }, S);
  it('N1 clause family -> measure', () => {
    expect(of('10.20.40.40(1)(A)')).toBe('gfa');
    expect(of('10.20.40.10(1)(A)')).toBe('height');
    expect(of('10.5.60.40(3)')).toBe('storeys');
    expect(of('10.20.30.40(1)(A)')).toBe('footprint');
    expect(of('10.20.40.10(2)(A)(i)')).toBeNull(); // main-wall height carries no direction measure
  });
  it('N2 an explicit measure wins; an empty string does not; an unclaimed clause is null', () => {
    expect(of('10.20.40.40(1)(A)', 'units')).toBe('units');
    expect(of('10.20.40.40(1)(A)', '')).toBe('gfa');
    expect(of('999.9.9')).toBeNull();
  });
});

describe('O. prepareRows: every row carries building, rule_id, displaced_by, measure, clause_key; duplicates are one fact', () => {
  const A0461 = (): { cs: Dict[]; vs: Dict[] } => {
    const cs = [
      BCASE('A0461', 'pA', {
        main: B('detached_house', 'existing', { gfa: 80, height: 7, storeys: 2, footprint: 60, units: 1 }),
        garden_suite: B('garden_suite', 'new', { gfa: 60, height: 4, storeys: 1, footprint: null, units: null }),
      }),
    ];
    const vs = [
      VROW('A0461', 'height', 'yes', true, { ordinal: 1, clause: '150.7.60.40(1)', city_limit: 4.5, applicant_figure: 4 }),
      VROW('A0461', 'footprint', 'yes', true, { ordinal: 2, clause: '10.5.50.10(3)(A)', city_limit: 69.15, applicant_figure: 60.65 }),
      VROW('A0461', 'footprint', 'yes', true, { ordinal: 3, clause: '150.7.50.10(1)(A)', city_limit: 69.15, applicant_figure: 60.65 }),
    ];
    return { cs, vs };
  };
  it('O1 the added fields on every row, and the measure from the family', () => {
    const out = M.prepareRows(cases6(), [VROW('c1', 'gfa', 'yes', true, { ordinal: 1, clause: '10.20.40.40(1)(A)' })], S);
    expect(out.rows).toHaveLength(1);
    const r = out.rows[0] as Dict;
    expect(r.building).toBe('main');
    expect(r.rule_id).toBe('R8-R10');
    expect(r.displaced_by).toBeNull();
    expect(r.measure).toBe('gfa');
    expect(r.clause_key).toBe('10.20.40.40(1)(A)');
    expect(r.case).toBe('c1');
    expect(out.skipped).toEqual([]);
  });
  it('O2 the A0461 shape: two rows, same building, same city_limit and figure, one displacing clause -> the displaced row is skipped', () => {
    const f = A0461();
    const out = M.prepareRows(f.cs, f.vs, S);
    expect(out.rows.map((r) => r.ordinal)).toEqual([1, 3]);
    expect(out.skipped).toEqual([{ case: 'A0461', ordinal: 2, reason: 'duplicate_displaced' }]);
    // the duplicate test reads the data rule, not the code
    expect(S.buildings.duplicate_rule.skipped_reason).toBe('duplicate_displaced');
  });
  it('O3 the same two rows in a case WITHOUT a suite stay two rows (the clause families differ)', () => {
    const f = A0461();
    const cs = [{ ...f.cs[0], buildings: { main: B('detached_house', 'existing', { gfa: 80, height: 7, storeys: 2, footprint: 60, units: 1 }) } }];
    const out = M.prepareRows(cs, f.vs, S);
    expect(out.rows.map((r) => r.ordinal)).toEqual([1, 2, 3]);
    expect(out.skipped).toEqual([]);
  });
  it('O4 rows without both figures are never duplicates', () => {
    const f = A0461();
    const vs = f.vs.map((v) => ({ ...v, applicant_figure: null }));
    const out = M.prepareRows(f.cs, vs, S);
    expect(out.rows).toHaveLength(3);
    expect(out.skipped).toEqual([]);
  });
  it('O5 the inputs are not mutated and the output is fresh data', () => {
    const f = deepFreeze(A0461());
    const out = M.prepareRows(f.cs, f.vs, S);
    expect(out.rows.length).toBeGreaterThan(0);
    expect(isDeepFrozen(f)).toBe(true);
    expect((f.vs[0] as Dict).building).toBeUndefined();
  });
});

describe('P. unitsOf: one scored unit per building in scope (ruling "3 y")', () => {
  it('P1 a case without a buildings block is one main unit (every old fixture keeps working)', () => {
    const u = M.unitsOf(CASE('c1', 'p1', 'detached_house', { gfa: 100 }), S);
    expect(u).toEqual([
      { id: 'c1', case: 'c1', building: 'main', class: 'detached_house', status: 'new', applicant: { gfa: 100 }, parcel_id: 'p1', held: false, new_build: true },
    ]);
    const old = M.unitsOf(CASE('c2', 'p2', null, { gfa: 90 }, false), S);
    expect(old[0]?.status).toBe('existing');
    expect(old[0]?.new_build).toBe(false);
    expect(old[0]?.class).toBeNull();
  });
  it('P2 suite-only: an existing house plus a new garden suite scores the suite alone', () => {
    const c = BCASE('s1', 'ps1', {
      main: B('detached_house', 'existing', { gfa: 80, height: 7, storeys: 2, footprint: 70, units: 1 }),
      garden_suite: B('garden_suite', 'new', { gfa: 60, height: 4, storeys: 1, footprint: null, units: null }),
    });
    const u = M.unitsOf(c, S);
    expect(u.map((x) => x.id)).toEqual(['s1:garden_suite']);
    expect(u[0]).toEqual({
      id: 's1:garden_suite',
      case: 's1',
      building: 'garden_suite',
      class: 'garden_suite',
      status: 'new',
      applicant: { gfa: 60, height: 4, storeys: 1, footprint: null, units: null },
      parcel_id: 'ps1',
      held: false,
      new_build: true,
    });
  });
  it('P3 both new: the main house and the suite are both scored, in buildings.list order', () => {
    const c = BCASE('s2', 'ps2', {
      garden_suite: B('garden_suite', 'new', { gfa: 60 }),
      main: B('detached_house', 'new', { gfa: 90 }),
    });
    expect(M.unitsOf(c, S).map((x) => x.id)).toEqual(['s2', 's2:garden_suite']);
  });
  it('P4 no suite: the main house alone, whatever its status', () => {
    const existing = BCASE('s3', 'ps3', { main: B('detached_house', 'existing', { gfa: 90 }) });
    expect(M.unitsOf(existing, S).map((x) => x.id)).toEqual(['s3']);
    const rebuilt = BCASE('s3b', 'ps3b', { main: B('detached_house', 'new', { gfa: 90 }) });
    expect(M.unitsOf(rebuilt, S).map((x) => x.id)).toEqual(['s3b']);
  });
  it('P5 a new laneway suite on an existing house is one held unit', () => {
    const c = BCASE('s4', 'ps4', {
      main: B('detached_house', 'existing', { gfa: 80 }),
      laneway_suite: B('laneway_suite', 'new', { gfa: 40 }),
    });
    const u = M.unitsOf(c, S);
    expect(u.map((x) => x.id)).toEqual(['s4:laneway_suite']);
    expect(u[0]?.held).toBe(true);
    expect(u[0]?.new_build).toBe(true);
  });
  it('P6 a building that is not one of the suite roles is not a scored unit', () => {
    const c = BCASE('s5', 'ps5', { main: B('detached_house', 'existing', { gfa: 80 }), other_ancillary: B(null, 'new', { gfa: 20 }) });
    expect(M.unitsOf(c, S).map((x) => x.id)).toEqual(['s5']);
  });
});

describe('Q. adaptBuildingFile: the INC-7 input shape -> cases and variance rows', () => {
  const file = (): Dict => ({
    cases: [
      {
        case_id: 'A1',
        parcel_id: 'pa',
        applicant: {
          building_type: { golden_p_type: 'detached_house', golden_p_suite_type: null, proposed_25_text: 'New detached house' },
          gfa: { value: 120 },
          height: { value: 9 },
          storeys: { value: 2 },
          footprint: { value: 95 },
          units: { value: 1 },
        },
        varied_clauses: [
          {
            ordinal: 1,
            clause: { value: '10.20.40.10(1)(A)' },
            permitted: { value: 10, as_printed: '10 metres' },
            requested: { value: 9, as_printed: '9 metres' },
            city_granted: { value: 'yes' },
            measure: 'height',
            building: 'garden_suite',
          },
        ],
      },
      {
        case_id: 'A2',
        parcel_id: 'pb',
        applicant: {
          building_type: { golden_p_type: 'detached_house', golden_p_suite_type: 'garden', proposed_25_text: 'Alteration to an existing house' },
          gfa: { value: 110, suite_value: 99.22 },
          height: { value: 8 },
          storeys: { value: 2 },
          footprint: { value: 90 },
          units: { value: 1 },
        },
        varied_clauses: [],
      },
      {
        case_id: 'A3',
        parcel_id: 'pc',
        applicant: {
          building_type: { golden_p_type: 'detached_house', golden_p_suite_type: 'laneway', proposed_25_text: 'Alteration to existing house' },
          gfa: { value: 100 },
          height: { value: 8 },
          storeys: { value: 2 },
          footprint: { value: 90 },
          units: { value: 1 },
        },
        varied_clauses: [],
      },
    ],
  });
  it('Q1 cases: class from the type map, main status from the proposed text, suite value on gfa', () => {
    const out = M.adaptBuildingFile(file(), S);
    expect(out.cases.map((c) => c.case)).toEqual(['A1', 'A2', 'A3']);
    const [a1, a2, a3] = out.cases as [Dict, Dict, Dict];
    expect(a1.parcel_id).toBe('pa');
    expect(a1.applicant_class).toBe('detached_house');
    expect(a1.new_build).toBe(true);
    expect(a1.buildings.main).toEqual({ class: 'detached_house', status: 'new', applicant: { gfa: 120, height: 9, storeys: 2, footprint: 95, units: 1 } });
    expect(a1.buildings.garden_suite).toBeUndefined();
    expect(a1.buildings.laneway_suite).toBeUndefined();
    expect(a2.new_build).toBe(false);
    expect(a2.buildings.main.status).toBe('existing');
    expect(a2.buildings.garden_suite).toEqual({
      class: 'garden_suite',
      status: 'new',
      applicant: { gfa: 99.22, height: null, storeys: null, footprint: null, units: null },
    });
    expect(a3.new_build).toBe(false);
    expect(a3.buildings.laneway_suite).toEqual({
      class: 'laneway_suite',
      status: 'new',
      applicant: { gfa: null, height: null, storeys: null, footprint: null, units: null },
    });
  });
  it('Q2 an unmapped golden_p_type scores as null and adds no suite', () => {
    const f = file();
    (f.cases[1] as Dict).applicant.building_type.golden_p_type = 'triplexish';
    const a2 = M.adaptBuildingFile(f, S).cases[1] as Dict;
    expect(a2.applicant_class).toBeNull();
    expect(a2.buildings.main.class).toBeNull();
  });
  it('Q3 variance rows: the building field is ignored; city figures, lower-cased text, measure', () => {
    const out = M.adaptBuildingFile(file(), S);
    expect(out.varianceRows).toEqual([
      {
        case: 'A1',
        ordinal: 1,
        clause: '10.20.40.10(1)(A)',
        city_row: true,
        granted: 'yes',
        city_limit: 10,
        applicant_figure: 9,
        text: '10 metres 9 metres',
        permitted_text: '10 metres',
        requested_text: '9 metres',
        measure: 'height',
      },
    ]);
  });
  it('Q4 the adapted file runs straight through unitsOf: A2 is one garden-suite unit', () => {
    const c = M.adaptBuildingFile(file(), S).cases[1] as Dict;
    expect(M.unitsOf(c, S).map((u) => u.id)).toEqual(['A2:garden_suite']);
  });
});

// ---- D-2, D-3, D-4 (operator ruling 2026-11-15, "1,2 and 4 y") -------------------------------------------
const PARCELS = (n: number, prefix: string): string[] => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

describe('R. D-2 direction: the exact test, the applicant-null exclusion and the manifest (ruling "1,2 and 4 y")', () => {
  // n new-build units, each on its own parcel with a gfa max of 100; the first `correct` are inside, the rest over.
  const run = (n: number, correct: number, settings: Settings = S): DirectionStats => {
    const ids = PARCELS(n, 'r');
    const cs = ids.map((id, i) => CASE(id, id, 'detached_house', { gfa: i < correct ? 90 : 130, height: 8, storeys: 2, footprint: 70, units: 1 }));
    const rows = ids.map((id) => row(id, 'gfa_max_m2', 100));
    return M.scoreDirection(cs, rows, [], settings).gfa as DirectionStats;
  };
  const trio = (): { cs: Dict[]; rows: Dict[] } => {
    const ids = ['d1', 'd2', 'd3'];
    const cs = ids.map((id) => CASE(id, `p${id}`, 'detached_house', { gfa: id === 'd3' ? 130 : 90, height: 8, storeys: 2, footprint: 70, units: 1 }));
    const rows = ids.map((id) => row(`p${id}`, 'gfa_max_m2', 100));
    return { cs, rows };
  };
  it('R1 9 of 10 passes and 22 of 25 fails: the test is correct * 100 >= threshold_pct * denominator', () => {
    expect(run(10, 9).pass).toBe(true);
    expect(run(10, 9).required).toBe(9); // `required` stays ceil
    expect(run(25, 22).pass).toBe(false);
    expect(run(25, 23).pass).toBe(true);
    expect(run(19, 17).pass).toBe(false);
    expect(run(20, 18).pass).toBe(true);
  });
  it('R2 a measure is excluded per case iff the keyed applicant figure is null: excluded_cases carries the unit ids', () => {
    const f = trio();
    const base = M.scoreDirection(f.cs, f.rows, [], S).gfa as DirectionStats;
    expect(base.excluded_cases).toEqual([]);
    expect(base.denominator).toBe(3);
    const cs = f.cs.map((c) => (c.case === 'd3' ? { ...c, applicant: { height: 8, storeys: 2 } } : c));
    const out = M.scoreDirection(cs, f.rows, [], S).gfa as DirectionStats;
    expect(out.excluded_cases).toEqual(['d3']);
    expect(out.no_applicant_figure).toBe(1);
    expect(out.denominator).toBe(2);
    expect(out.pass).toBe(true);
  });
  it('R3 scoreInc7 manifest: excluded list, denominators, units, skipped rows, disclosures, digest', () => {
    const f = trio();
    const input = { cases: f.cs, layer3Rows: f.rows, varianceRows: [], settings: S };
    const out = M.scoreInc7(deepFreeze(input));
    const man = out.manifest as Manifest;
    expect(man.excluded).toEqual([]);
    expect(man.denominators.gfa).toBe(out.direction.gfa?.denominator);
    expect(man.units).toEqual(['d1', 'd2', 'd3']);
    expect(man.skipped_rows).toEqual([]);
    expect(man.disclosures).toEqual([]);
    expect(man.digest).toMatch(/^[0-9a-f]{12}$/);
    const bare: Dict = { ...man };
    delete bare.digest;
    expect(sha256Hex(canonical(bare)).startsWith(man.digest)).toBe(true);
    // identical on two runs, and it changes when one excluded case is added
    expect((M.scoreInc7(input).manifest as Manifest).digest).toBe(man.digest);
    const excluded = { ...input, cases: f.cs.map((c) => (c.case === 'd3' ? { ...c, applicant: { height: 8 } } : c)) };
    const other = M.scoreInc7(excluded).manifest as Manifest;
    expect(other.excluded.filter((e) => e.measure === 'gfa')).toEqual([{ case: 'd3', measure: 'gfa', reason: 'applicant_figure_null' }]);
    expect(other.excluded.every((e) => e.case === 'd3')).toBe(true);
    expect(other.digest).not.toBe(man.digest);
    expect(other.denominators.gfa).toBe(2);
  });
  it('R4 the fixture: no excluded case on gfa; with c5 applicant {} one excluded entry per measure', () => {
    expect((M.scoreInc7(input6()).manifest as Manifest).excluded).toEqual([]);
    const cs = cases6().map((c) => (c.case === 'c5' ? { ...c, applicant: {} } : c));
    const man = M.scoreInc7({ ...input6(), cases: cs }).manifest as Manifest;
    const measures = S.direction.measures as string[];
    expect(man.excluded.map((e) => e.case)).toEqual(measures.map(() => 'c5'));
    expect(man.excluded.map((e) => e.measure)).toEqual(measures);
    expect(man.excluded.every((e) => e.reason === 'applicant_figure_null')).toBe(true);
    expect(measures).toEqual(['gfa', 'height', 'storeys', 'footprint', 'units']);
    expect(S.direction.excluded_when).toBe('applicant_figure_null');
  });
  it('R5 our not-evaluated counts as wrong: a unit whose class is null stays in the denominator', () => {
    const f = trio();
    const cs = f.cs.map((c) => (c.case === 'd3' ? { ...c, applicant_class: null } : c));
    const out = M.scoreDirection(cs, f.rows, [], S).gfa as DirectionStats;
    expect(out.not_evaluated).toBe(1);
    expect(out.not_evaluated_cases).toEqual(['d3']);
    expect(out.denominator).toBe(3);
    expect(out.correct).toBe(2);
    expect(out.pass).toBe(false); // 2 of 3 against ceil(2.7) = 3
  });
});

describe('S. D-3 closeness: the floor_index quantile and the new-build units (oracle-compare.mjs:24)', () => {
  const pairs = (vals: number[]): { cs: Dict[]; rows: Dict[] } => ({
    cs: vals.map((v, i) => CASE(`n${i + 1}`, `pn${i + 1}`, 'detached_house', { gfa: v * 100, height: 8, storeys: 2, footprint: 70, units: 1 })),
    rows: vals.map((_v, i) => row(`pn${i + 1}`, 'gfa_max_m2', 100)),
  });
  it('S1 n = 4 (0.77, 0.87, 0.92, 1.0): median 0.895, q1 0.77, q3 0.92, iqr 0.15', () => {
    const f = pairs([0.77, 0.87, 0.92, 1.0]);
    const out = M.scoreCloseness(f.cs, f.rows, [], S);
    expect(S.closeness.quantile_method).toBe('floor_index');
    expect(out.median).toBe(0.895);
    expect(out.spread).toEqual({ kind: 'iqr', q1: 0.77, q3: 0.92, iqr: 0.15 });
  });
  it('S2 n = 5 (0.7 .. 1.1): q1 0.8 and q3 1.0 under floor_index too', () => {
    const f = pairs([0.7, 0.8, 0.9, 1.0, 1.1]);
    const out = M.scoreCloseness(f.cs, f.rows, [], S);
    expect(out.median).toBe(0.9);
    expect(out.spread).toEqual({ kind: 'iqr', q1: 0.8, q3: 1, iqr: 0.2 });
  });
  it('S3 quantile_method linear gives the type-7 values: n = 4 q1 0.845, q3 0.94, iqr 0.095', () => {
    const f = pairs([0.77, 0.87, 0.92, 1.0]);
    const out = M.scoreCloseness(f.cs, f.rows, [], cfg((s) => { s.closeness.quantile_method = 'linear'; }));
    expect(out.spread).toEqual({ kind: 'iqr', q1: 0.845, q3: 0.94, iqr: 0.095 });
  });
  it('S4 an unknown quantile method is a settings violation', () => {
    const bad = cfg((s) => { s.closeness.quantile_method = 'nearest_thing'; });
    expect(M.validateSettings(bad)).toContain('quantile_method_unknown:nearest_thing');
    expect(M.validateSettings(S)).toEqual([]);
  });
  it('S5 the population is the new-build UNITS: a suite-only case contributes its suite, not the existing house', () => {
    const c = BCASE('sn1', 'psn1', {
      main: B('detached_house', 'existing', { gfa: 200, height: 7, storeys: 2, footprint: 70, units: 1 }),
      garden_suite: B('garden_suite', 'new', { gfa: 90, height: 4, storeys: 1, footprint: null, units: null }),
    });
    const rows = [row('psn1', 'gfa_max_m2', 100, 'detached_house'), row('psn1', 'gfa_max_m2', 100, 'garden_suite')];
    const out = M.scoreCloseness([c], rows, [], S);
    expect(out.values).toEqual([{ case: 'sn1:garden_suite', ratio: 0.9 }]);
    expect(out.n).toBe(1);
    expect(out.median).toBe(0.9);
  });
});

describe('T. D-4 catch: off-scope, relative limits, the second CAUGHT-ESTIMATE trigger, SC-19 (ruling "1,2 and 4 y")', () => {
  const e1 = (): Dict[] => [CASE('e1', 'pe1', 'detached_house', { gfa: 120, height: 8, storeys: 2, footprint: 70, units: 1 })];
  const rowsE1 = (): Dict[] => [row('pe1', 'gfa_max_m2', 100), row('pe1', 'height_max_m', 9), row('pe1', 'storeys_max', 2)];
  const rowOf = (out: CatchResult, ordinal?: number): CatchRow =>
    (ordinal === undefined ? out.rows[0] : out.rows.find((r) => r.ordinal === ordinal)) as CatchRow;
  const offScopeCause = (): string => ((S.catch.off_scope as Dict[])[0] as Dict).cause as string;

  it('T1 off-scope is data: a 230.5.1.10(6) EXCEEDS City row is MISSED with the setting cause', () => {
    const v = [VROW('e1', 'gfa', 'yes', true, { ordinal: 1, clause: '230.5.1.10(6)', our_verdict: 'EXCEEDS', city_limit: 100, our_limit: 100 })];
    const r = rowOf(M.scoreCatch(e1(), rowsE1(), v, S));
    expect(r.class).toBe('MISSED');
    expect(r.off_scope).toBe('bicycle_parking');
    expect(r.cause).toBe(offScopeCause());
  });
  it('T2 a no-clause row whose text says bicycle is off scope the same way', () => {
    const v = [VROW('e1', 'gfa', 'yes', true, { ordinal: 1, text: 'two bicycle parking spaces required', our_verdict: 'EXCEEDS', city_limit: 100, our_limit: 100 })];
    expect(rowOf(M.scoreCatch(e1(), rowsE1(), v, S)).class).toBe('MISSED');
  });
  it('T3 with off_scope [] the same row is CAUGHT (limit_match true): proves it is data, not code', () => {
    const v = [VROW('e1', 'gfa', 'yes', true, { clause: '230.5.1.10(6)', our_verdict: 'EXCEEDS', city_limit: 100, our_limit: 100 })];
    const r = rowOf(M.scoreCatch(e1(), rowsE1(), v, cfg((s) => { s.catch.off_scope = []; })));
    expect(r.class).toBe('CAUGHT');
    expect(r.limit_match).toBe(true);
    expect(r.off_scope).toBeNull();
  });
  it('T4 relative limits: a suite gfa clause with a null city limit is CAUGHT with no limit comparison', () => {
    const v = [VROW('e1', 'gfa', 'yes', true, { clause: '150.7.60.50(2)', our_verdict: 'EXCEEDS', city_limit: null })];
    const r = rowOf(M.scoreCatch(e1(), rowsE1(), v, S));
    expect(r.relative).toBe(true);
    expect(r.limit_match).toBeNull();
    expect(r.class).toBe('CAUGHT');
    const none = rowOf(M.scoreCatch(e1(), rowsE1(), v, cfg((s) => { s.catch.relative_rules = []; })));
    expect(none.relative).toBe(false);
    expect(none.class).toBe('NOT SCORED');
  });
  it('T5 second CAUGHT-ESTIMATE trigger: MAY EXCEED with a wrong limit is an estimate, not a wrong limit', () => {
    const v = [VROW('e1', 'gfa', 'yes', true, { our_verdict: 'MAY EXCEED', city_limit: 100, our_limit: 150 })];
    const r = rowOf(M.scoreCatch(e1(), rowsE1(), v, S));
    expect(r.limit_match).toBe(false);
    expect(r.class).toBe('CAUGHT-ESTIMATE');
  });
  it('T6 classifyRow accepts the whole fact set, including relative and off_scope', () => {
    expect(M.classifyRow({ city_row: true, our_verdict: 'EXCEEDS', limit_match: null, relative: true, off_scope: null }, S)).toBe('CAUGHT');
    expect(M.classifyRow({ city_row: true, our_verdict: 'EXCEEDS', limit_match: true, relative: false, off_scope: null }, S)).toBe('CAUGHT');
    expect(M.classifyRow({ city_row: true, our_verdict: 'EXCEEDS', limit_match: true, relative: false, off_scope: 'bicycle_parking' }, S)).toBe('MISSED');
    expect(M.classifyRow({ city_row: true, our_verdict: 'MAY EXCEED', limit_match: false, relative: false, off_scope: null }, S)).toBe('CAUGHT-ESTIMATE');
  });
  it('T7 SC-19: a wrong limit with complete inputs fails the complete-inputs line; incomplete passes there but counts', () => {
    const complete = [VROW('e1', 'gfa', 'yes', true, { our_verdict: 'EXCEEDS', city_limit: 150, our_limit: 100 })];
    const out = M.scoreCatch(e1(), rowsE1(), complete, S);
    expect(rowOf(out).class).toBe('WRONG LIMIT');
    expect(rowOf(out).complete_inputs).toBe(true);
    expect((out.thresholds.find((t) => t.id === 'wrong_limit_complete_inputs_max') as CatchThreshold).pass).toBe(false);
    const incomplete = M.scoreCatch(
      [CASE('e1', 'pe1', 'detached_house', { gfa: 120, height: null, storeys: 2, footprint: 70, units: 1 })],
      rowsE1(),
      complete,
      S,
    );
    expect(rowOf(incomplete).complete_inputs).toBe(false);
    expect((incomplete.thresholds.find((t) => t.id === 'wrong_limit_complete_inputs_max') as CatchThreshold).pass).toBe(true);
    expect((incomplete.thresholds.find((t) => t.id === 'wrong_limit_max') as CatchThreshold).actual).toBe(1);
    const gfaOnly = M.scoreCatch(
      [CASE('e1', 'pe1', 'detached_house', { gfa: 120, height: null, storeys: 2, footprint: 70, units: 1 })],
      rowsE1(),
      complete,
      cfg((s) => { s.catch.complete_inputs.measures = ['gfa']; }),
    );
    expect(rowOf(gfaOnly).complete_inputs).toBe(true);
    expect(S.catch.complete_inputs).toEqual({ measures: ['gfa', 'height', 'storeys'], require_class: true });
  });
  it('T8 named causes: a wrong limit with a cause passes that line, without one it fails', () => {
    const withCause = M.scoreCatch(e1(), rowsE1(), [VROW('e1', 'gfa', 'yes', true, { our_verdict: 'EXCEEDS', city_limit: 150, our_limit: 100, cause: 'layer 3 row missing' })], S);
    const without = M.scoreCatch(e1(), rowsE1(), [VROW('e1', 'gfa', 'yes', true, { our_verdict: 'EXCEEDS', city_limit: 150, our_limit: 100 })], S);
    const line = (out: CatchResult): CatchThreshold => out.thresholds.find((t) => t.id === 'wrong_limit_named_cause_max') as CatchThreshold;
    expect(line(withCause).pass).toBe(true);
    expect(line(without).pass).toBe(false);
    expect(line(without).actual).toBe(1);
  });
  it('T9 every catch row carries clause, ordinal, building, off_scope, relative, cause and complete_inputs', () => {
    const r = rowOf(M.scoreCatch(e1(), rowsE1(), [VROW('e1', 'gfa', 'yes', true, { ordinal: 7, clause: '10.20.40.40(1)(A)', our_verdict: 'EXCEEDS', city_limit: 100, our_limit: 100 })], S));
    expect(r).toMatchObject({
      clause: '10.20.40.40(1)(A)',
      ordinal: 7,
      building: 'main',
      off_scope: null,
      relative: false,
      cause: null,
      complete_inputs: true,
    });
  });
});

describe('U. ruling 1 in scoring: variance rows by building, catch rows derive from their own building (ruling "1,2 and 4 y")', () => {
  // A lot with an existing house (main) and a new garden suite: each building has its own Layer 3 maximum.
  const suiteCase = (): Dict[] => [
    BCASE('g1', 'pg', {
      main: B('detached_house', 'existing', { gfa: 80, height: 12, storeys: 2, footprint: 95, units: 1 }),
      garden_suite: B('garden_suite', 'new', { gfa: 60, height: 4, storeys: 1, footprint: null, units: null }),
    }),
  ];
  const suiteRows = (): Dict[] => [
    row('pg', 'gfa_max_m2', 100, 'detached_house'),
    row('pg', 'height_max_m', 10, 'detached_house'),
    row('pg', 'footprint_max_m2', 80, 'detached_house'),
    row('pg', 'gfa_max_m2', 100, 'garden_suite'),
    row('pg', 'height_max_m', 5, 'garden_suite'),
  ];
  const l3Row = (measure: string, value: number | null, building_type: string | null): Dict => {
    const field = (S.layer3.field_by_measure as Dict)[measure] as string;
    return { parcel_id: 'pg', field_id: field, value, status: 'computed', building_type };
  };
  it('U1 a garden-suite height variance does NOT flip the main unit (suite-only case)', () => {
    const v = [VROW('g1', 'height', 'yes', true, { clause: '150.7.60.40(1)' })];
    const d = M.scoreDirection(suiteCase(), suiteRows(), v, S);
    // suite-only: the one unit is the suite; its own (garden_suite building) variance flips it: 4 <= 5 with a variance is wrong
    expect(d.height?.wrong_cases).toEqual(['g1:garden_suite']);
    expect(d.height?.correct).toBe(0);
    expect(d.height?.wrong).toBe(1);
    expect(S.buildings.variance_buildings.main).toEqual(['main', 'lot_wide']);
    expect(S.buildings.variance_buildings.garden_suite).toEqual(['garden_suite']);
  });
  it('U2 a lot_wide footprint variance DOES count for the main unit (both buildings new)', () => {
    const cs = [
      BCASE('g2', 'pg', {
        main: B('detached_house', 'new', { gfa: 80, height: 8, storeys: 2, footprint: 95, units: 1 }),
        garden_suite: B('garden_suite', 'new', { gfa: 60, height: 4, storeys: 1, footprint: null, units: null }),
      }),
    ];
    const v = [VROW('g2', 'footprint', 'yes', true, { clause: '10.20.30.40(1)(A)' })];
    const both = M.scoreDirection(cs, suiteRows(), v, S);
    const none = M.scoreDirection(cs, suiteRows(), [], S);
    expect(none.footprint?.correct).toBe(0); // 95 > 80, no variance
    expect(both.footprint?.correct).toBe(1); // the lot-wide variance flips it
    expect(both.gfa?.correct).toBe(2);
  });
  it('U3 a catch row on the garden suite derives its max from the garden_suite class', () => {
    const v = [VROW('g1', 'gfa', 'yes', true, { clause: '150.7.60.50(2)', our_verdict: 'EXCEEDS', city_limit: 105 })];
    const r = M.scoreCatch(suiteCase(), suiteRows(), v, S).rows[0] as CatchRow;
    expect(r.building).toBe('garden_suite');
    expect(r.our_limit).toBe(100);
    expect(r.class).toBe('CAUGHT');
  });
  it('U4 a catch row on other_ancillary has no class: NOT EVALUATED -> MISSED', () => {
    const v = [VROW('g1', 'storeys', 'yes', true, { clause: '10.5.60.40(3)', city_limit: 2 })];
    const rows = [...suiteRows(), l3Row('storeys', null, null)];
    const r = M.scoreCatch(suiteCase(), rows, v, S).rows[0] as CatchRow;
    expect(r.building).toBe('other_ancillary');
    expect(S.buildings.row_scores_against.other_ancillary).toBeNull();
    expect(r.our_verdict).toBe('NOT EVALUATED');
    expect(r.class).toBe('MISSED');
  });
  it('U5 the row skipped as a duplicate is absent from catch.rows and present in manifest.skipped_rows', () => {
    const cs = [
      BCASE('A0461', 'pg', {
        main: B('detached_house', 'existing', { gfa: 80, height: 7, storeys: 2, footprint: 60, units: 1 }),
        garden_suite: B('garden_suite', 'new', { gfa: 60, height: 4, storeys: 1, footprint: 60.65, units: null }),
      }),
    ];
    const v = [
      VROW('A0461', 'footprint', 'yes', true, { ordinal: 2, clause: '10.5.50.10(3)(A)', our_verdict: 'EXCEEDS', city_limit: 69.15, applicant_figure: 60.65 }),
      VROW('A0461', 'footprint', 'yes', true, { ordinal: 3, clause: '150.7.50.10(1)(A)', our_verdict: 'EXCEEDS', city_limit: 69.15, applicant_figure: 60.65 }),
    ];
    const out = M.scoreInc7({ cases: cs, layer3Rows: suiteRows(), varianceRows: v, settings: S });
    expect(out.catch.rows.map((r) => r.ordinal)).toEqual([3]);
    expect((out.manifest as Manifest).skipped_rows).toEqual([{ case: 'A0461', ordinal: 2, reason: 'duplicate_displaced' }]);
  });
});

describe('V. ruling 3 end to end: the suite is scored against the garden-suite maximum (ruling "3 y")', () => {
  const suiteRows = (): Dict[] => [
    row('pv', 'gfa_max_m2', 100, 'detached_house'),
    row('pv', 'height_max_m', 9, 'detached_house'),
    row('pv', 'storeys_max', 2, 'detached_house'),
    row('pv', 'gfa_max_m2', 100, 'garden_suite'),
    row('pv', 'height_max_m', 5, 'garden_suite'),
    row('pv', 'storeys_max', 1, 'garden_suite'),
  ];
  const suiteOnly = (): Dict[] => [
    BCASE('v1', 'pv', {
      main: B('detached_house', 'existing', { gfa: 300, height: 40, storeys: 9, footprint: 200, units: 6 }),
      garden_suite: B('garden_suite', 'new', { gfa: 99.22, height: 4, storeys: 1, footprint: null, units: null }),
    }),
  ];
  const bothNew = (): Dict[] => [
    BCASE('v2', 'pv', {
      main: B('detached_house', 'new', { gfa: 110, height: 8, storeys: 2, footprint: 70, units: 1 }),
      garden_suite: B('garden_suite', 'new', { gfa: 60, height: 4, storeys: 1, footprint: null, units: null }),
    }),
  ];
  const houseOnly = (): Dict[] => [BCASE('v3', 'pv', { main: B('detached_house', 'new', { gfa: 90, height: 8, storeys: 2, footprint: 70, units: 1 }) })];
  it('V1 suite-only: the suite is scored (99.22 vs 100 correct), the existing house is not', () => {
    const d = M.scoreDirection(suiteOnly(), suiteRows(), [], S);
    expect(d.gfa?.cases).toBe(1);
    expect(d.gfa?.correct).toBe(1);
    expect(d.gfa?.denominator).toBe(1);
    expect(d.gfa?.not_evaluated_cases).toEqual([]);
    expect(d.gfa?.not_evaluated).toBe(0);
  });
  it('V2 both new: each against its own maximum', () => {
    const d = M.scoreDirection(bothNew(), suiteRows(), [], S);
    expect(d.gfa?.cases).toBe(2);
    expect(d.gfa?.denominator).toBe(2);
    expect(d.gfa?.correct).toBe(1);
    expect(d.gfa?.wrong_cases).toEqual(['v2']); // 110 > 100 on the house; 60 <= 100 on the suite
  });
  it('V3 no suite: the main house is scored alone', () => {
    const d = M.scoreDirection(houseOnly(), suiteRows(), [], S);
    expect(d.gfa?.cases).toBe(1);
    expect(d.gfa?.correct).toBe(1);
    expect(d.gfa?.denominator).toBe(1);
  });
  it('V4 the denominators count units and are frozen in the manifest', () => {
    const cs = [...suiteOnly(), ...bothNew(), ...houseOnly()];
    const man = M.scoreInc7({ cases: cs, layer3Rows: suiteRows(), varianceRows: [], settings: S }).manifest as Manifest;
    expect(man.units).toEqual(['v1:garden_suite', 'v2', 'v2:garden_suite', 'v3']);
    expect(man.denominators.gfa).toBe(4);
  });
});

describe('W. the laneway suite is held: not evaluated, in the denominator, disclosed (MB-57, ruling "3 y")', () => {
  const heldCase = (): Dict[] => [
    BCASE('h1', 'ph', {
      main: B('detached_house', 'existing', { gfa: 80, height: 7, storeys: 2, footprint: 60, units: 1 }),
      laneway_suite: B('laneway_suite', 'new', { gfa: 40, height: 4, storeys: 1, footprint: null, units: null }),
    }),
  ];
  const heldRows = (): Dict[] => [
    row('ph', 'gfa_max_m2', 100, 'laneway_suite'),
    row('ph', 'height_max_m', 5, 'laneway_suite'),
    row('ph', 'storeys_max', 1, 'laneway_suite'),
    row('ph', 'footprint_max_m2', 80, 'laneway_suite'),
    row('ph', 'units_max', 1, 'laneway_suite'),
  ];
  it('W1 a held unit is not evaluated, in the denominator and counts wrong', () => {
    const d = M.scoreDirection(heldCase(), heldRows(), [], S).gfa as DirectionStats;
    expect(d.not_evaluated_cases).toEqual(['h1:laneway_suite']);
    expect(d.denominator).toBe(1);
    expect(d.correct).toBe(0);
    expect(d.pass).toBe(false);
  });
  it('W2 every measure with a figure gets one disclosure in the manifest', () => {
    const man = M.scoreInc7({ cases: heldCase(), layer3Rows: heldRows(), varianceRows: [], settings: S }).manifest as Manifest;
    expect(man.disclosures).toHaveLength(3); // gfa, height, storeys: footprint and units carry no applicant figure
    expect(man.disclosures).toContainEqual({ unit: 'h1:laneway_suite', building: 'laneway_suite', measure: 'gfa', reason: 'held:laneway_suite' });
    expect(man.disclosures).toContainEqual({ unit: 'h1:laneway_suite', building: 'laneway_suite', measure: 'storeys', reason: 'held:laneway_suite' });
  });
  it('W3 with buildings.held [] the same unit is evaluated against its maximum', () => {
    const d = M.scoreDirection(heldCase(), heldRows(), [], cfg((s) => { s.buildings.held = []; })).gfa as DirectionStats;
    expect(d.not_evaluated_cases).toEqual([]);
    expect(d.correct).toBe(1);
    expect(d.denominator).toBe(1);
  });
});

describe('X. settings lock: the shipped file carries the 2026-11-15 rulings, and no clause or building name is in the code', () => {
  const has = (haystack: unknown, needle: string): boolean => typeof haystack === 'string' && haystack.includes(needle);
  it('X1 the rulings block names "1,2 and 4 y" and "3 y"', () => {
    expect(has(S.rulings.building_rule, '1,2 and 4 y')).toBe(true);
    expect(has(S.rulings.d1_d4, '1,2 and 4 y')).toBe(true);
    expect(has(S.rulings.primary_measure_by_building, '3 y')).toBe(true);
  });
  it('X2 the buildings block: held, list, scoring first rule, held laneway', () => {
    expect(S.buildings.held).toEqual(['laneway_suite']);
    expect(S.buildings.list).toEqual(['main', 'garden_suite', 'laneway_suite', 'other_ancillary', 'lot_wide', 'unknown']);
    expect(S.buildings.scoring[0].when).toEqual({ suite_new: true, main_status: ['existing'] });
    expect(S.buildings.scoring[0].score).toEqual(['suite']);
    expect(S.buildings.suite_roles).toEqual(['garden_suite', 'laneway_suite']);
  });
  it('X3 the direction and closeness blocks: gate measures, exclusions, floor_index', () => {
    expect(S.direction.gate_measures).toEqual(['gfa', 'height', 'storeys']);
    expect(S.direction.excluded_when).toBe('applicant_figure_null');
    expect(S.closeness.quantile_method).toBe('floor_index');
  });
  it('X4 no clause family and no building name as a string literal in the code (comments allowed)', () => {
    const code = moduleCode();
    expect(code.length).toBeGreaterThan(0);
    expect(code).not.toContain('SPEC LINK'); // comments were stripped, so the header is gone
    for (const family of ['150.7', '150.8', '10.5.60', '10.20.40', '900.3.10', '230.']) {
      expect(code).not.toContain(family);
    }
    for (const name of ['garden_suite', 'laneway_suite', 'lot_wide', 'other_ancillary']) {
      expect(code).not.toContain(name);
    }
  });
});
