// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-362 (increment 7: direction gate, closeness, catch rate)
// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md SC-19
// Panel close 2026-11-15: lens findings grounded (docs/reports/panels/INC7-S-2026-11-15-panel-record.md); operator rulings "1,2 and 4 y", "3 y"
// Red first: docs/reports/red-evidence/INC7/inc7-panel-red.txt
// INC7-S step 9 (RED): the panel close for the rulings build. Every describe below pins behaviour the step-8 module does not
// have yet, so this file fails on the first assertion of each block; nothing here is made to pass in this step.
// S: the settings contract for the three new keys and for the scoring "when" block (a bad entry, not a crash).
// T: no sniffing on prepared rows (a prepared row fed back in changes nothing, a stray duplicate_exempt on input is ignored).
// U: maxFor reports a non-numeric usable value, and the ambiguity test reads layer3.ambiguity_tolerance.
// V: limitMatch adds catch.limit_match.epsilon to the window.
// W: a variance row's building (never the keyed suite type) decides: held laneway rows are disclosed, a missing suite is a data gap.
// X, Y: text-valued duplicate rows (buildings.duplicate_rule.text_match) and the two text fields adaptBuildingFile now carries.
// Pure checks only; the settings file is read as data (mcbylaws/loop/inc7-scorer-settings.json) and never edited.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const M = (await import(path.join(ROOT, 'scripts/analysis/mcbylaws-loop/loop-inc7-score.mjs'))) as unknown as Inc7PanelModule;
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
type ClosenessResult = { measure: string; n: number; median: number | null; values: { case: string; ratio: number }[] };
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
  class: string;
  held?: boolean;
};
type CatchResult = { rows: CatchRow[]; counts: { [cls: string]: number }; denominator: number; thresholds: Dict[]; pass: boolean };
type Manifest = {
  excluded: Dict[];
  denominators: { [measure: string]: number };
  units: string[];
  skipped_rows: Dict[];
  disclosures: Dict[];
  held_rows?: Dict[];
  data_gaps?: Dict[];
  digest: string;
};
type Inc7Result = { direction: { [measure: string]: DirectionStats }; closeness: ClosenessResult; catch: CatchResult; ok: boolean; manifest?: Manifest };
type MaxResult = { value: number | null; reason: string };
type Inc7PanelModule = {
  validateSettings: (s: Settings) => string[];
  scoreInc7: (input: Dict) => Inc7Result;
  prepareRows: (cases: any[], varianceRows: any[], settings: Settings) => { rows: Dict[]; skipped: Dict[] };
  adaptBuildingFile: (file: Dict, settings: Settings) => { cases: Dict[]; varianceRows: Dict[] };
  scoreDirection: (cases: any[], layer3Rows: any[], varianceRows: any[], settings: Settings) => { [measure: string]: DirectionStats };
  scoreCatch: (cases: any[], layer3Rows: any[], varianceRows: any[], settings: Settings) => CatchResult;
  maxFor: (layer3Rows: any[], parcelId: string, buildingType: string | null | undefined, measure: string, settings: Settings) => MaxResult;
  limitMatch: (cityLimit: unknown, ourLimit: unknown, settings: Settings) => boolean | null;
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

// ---- fixtures (inline; no DB, no network) -------------------------------------------------------------
const row = (parcel_id: string, field_id: string, value: number | string | null, status = 'computed', building_type = 'detached_house'): Dict => ({
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
const L3ROW = (parcel_id: string, measure: string, value: number | string | null, building_type: string | null, status = 'computed'): Dict => {
  const field = (S.layer3.field_by_measure as Dict)[measure] as string;
  return { parcel_id, field_id: field, value, status, building_type };
};
// A case without a buildings block (normalised by unitsOf to one main building).
const CASE = (id: string, parcel_id: string, applicant_class: string | null, applicant: Dict, new_build: boolean | undefined = true): Dict => {
  const c: Dict = { case: id, parcel_id, applicant_class, applicant };
  if (new_build !== undefined) c.new_build = new_build;
  return c;
};
// A case the INC-7 way: main / garden_suite / laneway_suite.
const B = (cls: string | null, status: string, applicant: Dict): Dict => ({ class: cls, status, applicant });
const BCASE = (id: string, parcel_id: string, buildings: Dict): Dict => ({ case: id, parcel_id, buildings });
// The shipped layer 3 field for a measure, read from the settings (never a literal in this file).
const FIELD = (measure: string): string => (S.layer3.field_by_measure as Dict)[measure] as string;

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

// ---- S. the settings contract for the panel-close keys ------------------------------------------------
describe('S. validateSettings: the panel-close keys are checked, never crashed on', () => {
  it('S1 an off_scope text pattern that is not a valid regex is a violation naming the entry; the shipped file stays clean', () => {
    const bad = cfg((s) => { s.catch.off_scope[0].text_patterns = ['(']; });
    expect(M.validateSettings(bad)).toContain('text_pattern_invalid:bicycle_parking');
    expect(M.validateSettings(S)).toEqual([]);
  });
  it('S2 the scoring "when" block: an unknown key, a non-array main_status and a non-boolean suite_new', () => {
    expect(M.validateSettings(cfg((s) => { s.buildings.scoring[0].when = { main_statuss: ['new'] }; }))).toContain('when_key_unknown:main_statuss');
    expect(M.validateSettings(cfg((s) => { s.buildings.scoring[0].when = { main_status: 'new' }; }))).toContain('when_main_status_not_array');
    expect(M.validateSettings(cfg((s) => { s.buildings.scoring[0].when = { suite_new: 'yes' }; }))).toContain('when_suite_new_not_boolean');
  });
  it('S3 the two numeric keys: a negative epsilon and a non-numeric ambiguity tolerance', () => {
    expect(M.validateSettings(cfg((s) => { s.catch.limit_match.epsilon = -1; }))).toContain('limit_epsilon_invalid');
    expect(M.validateSettings(cfg((s) => { s.layer3.ambiguity_tolerance = 'x'; }))).toContain('ambiguity_tolerance_invalid');
  });
  it('S4 scoring with a bad settings object throws inc7_settings_invalid before any work', () => {
    const bad = cfg((s) => { s.catch.limit_match.epsilon = -1; });
    expect(() => M.scoreInc7({ cases: [], layer3Rows: [], varianceRows: [], settings: bad })).toThrow(/^inc7_settings_invalid/);
  });
});

// ---- T. no sniffing prepared rows ----------------------------------------------------------------------
describe('T. no sniff: prepared rows are ordinary rows, and a field on an input row is never trusted', () => {
  it('T1 prepareRows rows carry no duplicate_exempt key', () => {
    const f = A0461();
    const out = M.prepareRows(f.cs, f.vs, S);
    expect(out.rows.length).toBeGreaterThan(0);
    for (const r of out.rows) expect(Object.prototype.hasOwnProperty.call(r, 'duplicate_exempt')).toBe(false);
  });
  it('T2 feeding prepared rows back through prepareRows changes nothing', () => {
    const f = A0461();
    const first = M.prepareRows(f.cs, f.vs, S);
    const again = M.prepareRows(f.cs, first.rows, S);
    expect(again.rows).toEqual(first.rows);
    expect(again.skipped).toEqual([]);
  });
  it('T3 scoreDirection and scoreCatch agree on the raw rows, the prepared rows and a mixed list', () => {
    const f = A0461();
    const layer3Rows: Dict[] = [
      L3ROW('pA', 'height', 10, 'detached_house'),
      L3ROW('pA', 'gfa', 100, 'detached_house'),
      L3ROW('pA', 'gfa', 100, 'garden_suite'),
      L3ROW('pA', 'height', 5, 'garden_suite'),
    ];
    const prepared = M.prepareRows(f.cs, f.vs, S).rows;
    const mixed = [prepared[0], f.vs[1], prepared[1]];
    const raw = M.scoreDirection(f.cs, layer3Rows, f.vs, S);
    expect(M.scoreDirection(f.cs, layer3Rows, prepared, S)).toEqual(raw);
    expect(M.scoreDirection(f.cs, layer3Rows, mixed, S)).toEqual(raw);
    const rawCatch = M.scoreCatch(f.cs, layer3Rows, f.vs, S);
    expect(M.scoreCatch(f.cs, layer3Rows, prepared, S)).toEqual(rawCatch);
    expect(M.scoreCatch(f.cs, layer3Rows, mixed, S)).toEqual(rawCatch);
  });
  it('T4 a stray duplicate_exempt on a raw duplicate row is ignored: the displaced row is still skipped', () => {
    const f = A0461();
    const vs = f.vs.map((v) => (v.ordinal === 2 ? { ...v, duplicate_exempt: true } : v));
    const out = M.prepareRows(f.cs, vs, S);
    expect(out.rows.map((r) => r.ordinal)).toEqual([1, 3]);
    expect(out.skipped).toEqual([{ case: 'A0461', ordinal: 2, reason: 'duplicate_displaced' }]);
  });
});

// ---- U. maxFor: the non-numeric value and the tolerance ------------------------------------------------
describe('U. maxFor: an unreadable value is named, and one figure within layer3.ambiguity_tolerance is one figure', () => {
  it('U1 a usable status with a non-numeric value is value_not_numeric:<status>, not a status reason', () => {
    expect(M.maxFor([row('p1', FIELD('gfa'), 'n/a', 'computed')], 'p1', 'detached_house', 'gfa', S)).toEqual({
      value: null,
      reason: 'value_not_numeric:computed',
    });
  });
  it('U2 an unusable status keeps status:<status> (existing behaviour)', () => {
    expect(M.maxFor([row('p1', FIELD('height'), 10, 'not_evaluated')], 'p1', 'detached_house', 'height', S)).toEqual({
      value: null,
      reason: 'status:not_evaluated',
    });
  });
  it('U3 two usable maxima within the tolerance are the smaller figure, in either order; a larger gap is ambiguous', () => {
    const pair = (a: number, b: number): Dict[] => [row('p1', FIELD('gfa'), a), row('p1', FIELD('gfa'), b)];
    const near = pair(100, 100.0000000001);
    expect(M.maxFor(near, 'p1', 'detached_house', 'gfa', S)).toEqual({ value: 100, reason: 'ok' });
    expect(M.maxFor(pair(100.0000000001, 100), 'p1', 'detached_house', 'gfa', S)).toEqual({ value: 100, reason: 'ok' });
    expect(M.maxFor(pair(100, 100.5), 'p1', 'detached_house', 'gfa', S)).toEqual({ value: null, reason: 'ambiguous' });
    expect(M.maxFor(pair(100.5, 100), 'p1', 'detached_house', 'gfa', S)).toEqual({ value: null, reason: 'ambiguous' });
  });
  it('U4 with layer3.ambiguity_tolerance 0 the same near pair is ambiguous', () => {
    const zero = cfg((s) => { s.layer3.ambiguity_tolerance = 0; });
    const near: Dict[] = [row('p1', FIELD('gfa'), 100), row('p1', FIELD('gfa'), 100.0000000001)];
    expect(M.maxFor(near, 'p1', 'detached_house', 'gfa', zero)).toEqual({ value: null, reason: 'ambiguous' });
  });
});

// ---- V. limitMatch: the float epsilon -----------------------------------------------------------------
describe('V. limitMatch: catch.limit_match.epsilon absorbs float noise', () => {
  it('V1 a diff of 1e-17 matches with epsilon 1e-9 and fails with epsilon 0', () => {
    const tight = cfg((s) => { s.catch.limit_match = { abs: 0, rel_pct: 0, epsilon: 1e-9 }; });
    expect(M.limitMatch(0.1 + 0.2, 0.3, tight)).toBe(true);
    expect(M.limitMatch(0.3, 0.31, tight)).toBe(false);
    const none = cfg((s) => { s.catch.limit_match = { abs: 0, rel_pct: 0, epsilon: 0 }; });
    expect(M.limitMatch(0.1 + 0.2, 0.3, none)).toBe(false);
  });
});

// ---- W. the A0375 laneway suite: held rows and data gaps ----------------------------------------------
describe('W. A0375: the row\'s building decides, held rows are disclosed, a missing suite is a data gap', () => {
  const HELD = 'laneway_suite';
  const NOT_EVALUATED = (): string => (S.catch.verdict_roles as Dict).not_evaluated as string;
  const a0375 = (): { cs: Dict[]; rows: Dict[]; vs: Dict[] } => ({
    cs: [BCASE('A0375', 'p37', { main: B('detached_house', 'existing', { gfa: 80, height: 7, storeys: 2, footprint: 60, units: 1 }) })],
    rows: [L3ROW('p37', 'height', 10, 'detached_house'), L3ROW('p37', 'gfa', 100, 'detached_house')],
    vs: [
      { case: 'A0375', ordinal: 5, clause: '150.8.60.40(1)(A)', measure: undefined, city_limit: 4, applicant_figure: 7.19, granted: 'yes', city_row: true },
      { case: 'A0375', ordinal: 1, clause: '150.8.50.10(1)(B)', city_limit: 50, applicant_figure: 40, granted: 'yes', city_row: true },
    ],
  });
  const withSuite = (): Dict[] => [
    BCASE('A0375', 'p37', {
      main: B('detached_house', 'existing', { gfa: 80, height: 7, storeys: 2, footprint: 60, units: 1 }),
      laneway_suite: B('laneway_suite', 'new', { gfa: 40, height: 4, storeys: 1, footprint: null, units: null }),
    }),
  ];

  it('W1 prepareRows: the 150.8 height row belongs to the laneway suite, whatever the case keys', () => {
    const f = a0375();
    const out = M.prepareRows(f.cs, f.vs, S);
    expect(out.rows.map((r) => r.ordinal)).toEqual([5, 1]);
    expect(out.rows[0]?.building).toBe(HELD);
    expect(out.rows[0]?.measure).toBe('height');
    expect(out.rows[1]?.building).toBe(HELD);
  });
  it('W2 scoreCatch: both rows are NOT EVALUATED with no limit, class MISSED and held true', () => {
    const f = a0375();
    const out = M.scoreCatch(f.cs, f.rows, f.vs, S);
    expect(out.rows.map((r) => r.ordinal)).toEqual([5, 1]);
    for (const r of out.rows) {
      expect(r.building).toBe(HELD);
      expect(r.our_verdict).toBe(NOT_EVALUATED());
      expect(r.our_limit).toBeNull();
      expect(r.class).toBe('MISSED');
      expect(r.held).toBe(true);
    }
  });
  it('W3 scoreDirection: the main unit\'s height verdict is unchanged by the laneway row', () => {
    const f = a0375();
    const none = M.scoreDirection(f.cs, f.rows, [], S).height as DirectionStats;
    const withRow = M.scoreDirection(f.cs, f.rows, f.vs, S).height as DirectionStats;
    expect(none.correct).toBe(1);
    expect(none.wrong).toBe(0);
    expect(withRow.correct).toBe(none.correct);
    expect(withRow.wrong_cases).toEqual(none.wrong_cases);
    expect(withRow.denominator).toBe(none.denominator);
  });
  it('W4 the manifest: held_rows in row order and one data gap for the missing suite', () => {
    const f = a0375();
    const man = M.scoreInc7({ cases: f.cs, layer3Rows: f.rows, varianceRows: f.vs, settings: S }).manifest as Manifest;
    expect(man.held_rows).toEqual([
      { case: 'A0375', ordinal: 5, building: HELD, reason: `held:${HELD}` },
      { case: 'A0375', ordinal: 1, building: HELD, reason: `held:${HELD}` },
    ]);
    expect(man.data_gaps).toEqual([{ case: 'A0375', building: HELD, reason: 'suite_type_missing', rows: [5, 1] }]);
  });
  it('W5 with the laneway suite keyed the data gap is gone and the held rows stay', () => {
    const f = a0375();
    const man = M.scoreInc7({ cases: withSuite(), layer3Rows: f.rows, varianceRows: f.vs, settings: S }).manifest as Manifest;
    expect(man.data_gaps).toEqual([]);
    expect(man.held_rows).toEqual([
      { case: 'A0375', ordinal: 5, building: HELD, reason: `held:${HELD}` },
      { case: 'A0375', ordinal: 1, building: HELD, reason: `held:${HELD}` },
    ]);
  });
  it('W6 a garden-suite clause row in a house-only case: not evaluated, a data gap, and not held', () => {
    const cs = a0375().cs;
    const rows = a0375().rows;
    const vs = [VROW('A0375', 'footprint', 'yes', true, { ordinal: 7, clause: '150.7.60.20(2)(B)', city_limit: 69.15, applicant_figure: 60.65 })];
    const r = M.scoreCatch(cs, rows, vs, S).rows[0] as CatchRow;
    expect(r.building).toBe('garden_suite');
    expect(r.our_verdict).toBe(NOT_EVALUATED());
    expect(r.our_limit).toBeNull();
    const man = M.scoreInc7({ cases: cs, layer3Rows: rows, varianceRows: vs, settings: S }).manifest as Manifest;
    expect(man.data_gaps).toEqual([{ case: 'A0375', building: 'garden_suite', reason: 'suite_type_missing', rows: [7] }]);
    expect(man.held_rows).toEqual([]);
  });
  it('W7 rows on main and lot_wide never make a data gap', () => {
    const cs = [BCASE('A0380', 'p38', { main: B('detached_house', 'new', { gfa: 90, height: 8, storeys: 2, footprint: 70, units: 1 }) })];
    const rows = [L3ROW('p38', 'height', 9, 'detached_house'), L3ROW('p38', 'footprint', 80, 'detached_house')];
    const vs = [
      VROW('A0380', 'height', 'yes', true, { ordinal: 1, clause: '10.20.40.10(1)(A)', city_limit: 9, applicant_figure: 8 }),
      VROW('A0380', 'footprint', 'yes', true, { ordinal: 2, clause: '10.20.30.40(1)(A)', city_limit: 80, applicant_figure: 70 }),
    ];
    const man = M.scoreInc7({ cases: cs, layer3Rows: rows, varianceRows: vs, settings: S }).manifest as Manifest;
    expect(man.data_gaps).toEqual([]);
  });
  it('W8 the digest changes when a data gap is added, and with buildings.held [] the gap stays and held_rows empties', () => {
    const f = a0375();
    const suite = withSuite();
    const noGap = M.scoreInc7({ cases: suite, layer3Rows: f.rows, varianceRows: f.vs, settings: S }).manifest as Manifest;
    const gap = M.scoreInc7({ cases: f.cs, layer3Rows: f.rows, varianceRows: f.vs, settings: S }).manifest as Manifest;
    expect(noGap.data_gaps).toEqual([]);
    expect(gap.data_gaps).toHaveLength(1);
    expect(gap.digest).not.toBe(noGap.digest);
    const unheld = M.scoreInc7({ cases: f.cs, layer3Rows: f.rows, varianceRows: f.vs, settings: cfg((s) => { s.buildings.held = []; }) }).manifest as Manifest;
    expect(unheld.held_rows).toEqual([]);
    expect(unheld.data_gaps).toEqual([{ case: 'A0375', building: HELD, reason: 'suite_type_missing', rows: [5, 1] }]);
  });
});

// ---- X. text-valued duplicate rows --------------------------------------------------------------------
describe('X. text-valued duplicates: a displaced row with the same numbers is one fact', () => {
  const T2_PERMIT = 'a minimum of 50% (69.15 m2) of the rear yard must be maintained as soft landscaping';
  const T2_REQUEST = 'in this case, 44% (60.65 m2) of the rear yard will be maintained as soft landscaping';
  const T3_PERMIT = 'a minimum of 50% (69.15 m2) of the rear yard containing a garden suite must be maintained as soft landscaping';
  const T3_REQUEST = 'in this case, 44% (60.65 m2) of the rear yard containing a garden suite will be maintained as soft landscaping';
  const texts = (permit3: string = T3_PERMIT, request3: string = T3_REQUEST, permit2: string = T2_PERMIT): Dict[] => [
    { case: 'A0461', ordinal: 2, clause: '10.5.50.10(3)(A)', city_row: true, granted: 'yes', permitted_text: permit2, requested_text: T2_REQUEST },
    { case: 'A0461', ordinal: 3, clause: '150.7.50.10(1)(A)', city_row: true, granted: 'yes', permitted_text: permit3, requested_text: request3 },
  ];
  const withGarden = (): Dict[] => [
    BCASE('A0461', 'pA', {
      main: B('detached_house', 'existing', { gfa: 80, height: 7, storeys: 2, footprint: 60, units: 1 }),
      garden_suite: B('garden_suite', 'new', { gfa: 60, height: 4, storeys: 1, footprint: null, units: null }),
    }),
  ];
  const houseOnly = (): Dict[] => [
    BCASE('A0461', 'pA', { main: B('detached_house', 'existing', { gfa: 80, height: 7, storeys: 2, footprint: 60, units: 1 }) }),
  ];
  it('X1 the shipped rule is the numeric-token text match', () => {
    expect(S.buildings.duplicate_rule.text_match).toBe('numeric_tokens');
  });
  it('X2 same numbers: the displacing row is kept, the displaced one skipped as duplicate_displaced', () => {
    const out = M.prepareRows(withGarden(), texts(), S);
    expect(out.rows.map((r) => r.ordinal)).toEqual([3]);
    expect(out.skipped).toEqual([{ case: 'A0461', ordinal: 2, reason: 'duplicate_displaced' }]);
  });
  it('X3 a different number in the requested text keeps both rows', () => {
    const other = T3_REQUEST.replace('44% (60.65 m2)', '40% (55.15 m2)');
    const out = M.prepareRows(withGarden(), texts(T3_PERMIT, other), S);
    expect(out.rows.map((r) => r.ordinal)).toEqual([2, 3]);
    expect(out.skipped).toEqual([]);
  });
  it('X4 the same texts in a case with no suite have no displaced link: both rows stay', () => {
    const out = M.prepareRows(houseOnly(), texts(), S);
    expect(out.rows.map((r) => r.ordinal)).toEqual([2, 3]);
    expect(out.skipped).toEqual([]);
  });
  it('X5 an empty permitted text on one row keeps both', () => {
    const out = M.prepareRows(withGarden(), texts(T3_PERMIT, T3_REQUEST, ''), S);
    expect(out.rows.map((r) => r.ordinal)).toEqual([2, 3]);
    expect(out.skipped).toEqual([]);
  });
  it('X6 buildings.duplicate_rule.text_match none disables the text test', () => {
    const out = M.prepareRows(withGarden(), texts(), cfg((s) => { s.buildings.duplicate_rule.text_match = 'none'; }));
    expect(out.rows.map((r) => r.ordinal)).toEqual([2, 3]);
    expect(out.skipped).toEqual([]);
  });
  it('X7 adaptBuildingFile rows carry the lower-cased permitted_text and requested_text beside text', () => {
    const file: Dict = {
      cases: [
        {
          case_id: 'A0461',
          parcel_id: 'pA',
          applicant: {
            building_type: { golden_p_type: 'detached_house', golden_p_suite_type: 'garden', proposed_25_text: 'Alteration to an existing house' },
            gfa: { value: 110, suite_value: 99.22 },
            height: { value: 8 },
            storeys: { value: 2 },
            footprint: { value: 90 },
            units: { value: 1 },
          },
          varied_clauses: [
            {
              ordinal: 3,
              clause: { value: '150.7.50.10(1)(A)' },
              permitted: { value: null, as_printed: T3_PERMIT },
              requested: { value: null, as_printed: T3_REQUEST },
              city_granted: { value: 'yes' },
              measure: 'footprint',
            },
          ],
        },
      ],
    };
    const out = M.adaptBuildingFile(file, S);
    const v = out.varianceRows[0] as Dict;
    expect(v.text).toBe(`${T3_PERMIT} ${T3_REQUEST}`);
    expect(v.permitted_text).toBe(T3_PERMIT.toLowerCase());
    expect(v.requested_text).toBe(T3_REQUEST.toLowerCase());
  });
});

// ---- Y. real shape: adapted rows reproduce the skip ---------------------------------------------------
describe('Y. real shape: the adapted A0461 file skips the same displaced row', () => {
  it('Y1 adaptBuildingFile then prepareRows: one skip, ordinal 2, duplicate_displaced', () => {
    const file: Dict = {
      cases: [
        {
          case_id: 'A0461',
          parcel_id: 'pA',
          applicant: {
            building_type: { golden_p_type: 'detached_house', golden_p_suite_type: 'garden', proposed_25_text: 'Alteration to an existing house' },
            gfa: { value: 110, suite_value: 99.22 },
            height: { value: 8 },
            storeys: { value: 2 },
            footprint: { value: 90 },
            units: { value: 1 },
          },
          varied_clauses: [
            {
              ordinal: 2,
              clause: { value: '10.5.50.10(3)(A)' },
              permitted: { value: null, as_printed: 'a minimum of 50% (69.15 m2) of the rear yard must be maintained as soft landscaping' },
              requested: { value: null, as_printed: 'in this case, 44% (60.65 m2) of the rear yard will be maintained as soft landscaping' },
              city_granted: { value: 'yes' },
              measure: 'footprint',
            },
            {
              ordinal: 3,
              clause: { value: '150.7.50.10(1)(A)' },
              permitted: { value: null, as_printed: 'a minimum of 50% (69.15 m2) of the rear yard containing a garden suite must be maintained as soft landscaping' },
              requested: { value: null, as_printed: 'in this case, 44% (60.65 m2) of the rear yard containing a garden suite will be maintained as soft landscaping' },
              city_granted: { value: 'yes' },
              measure: 'footprint',
            },
          ],
        },
      ],
    };
    const adapted = deepFreeze(M.adaptBuildingFile(file, S));
    const out = M.prepareRows(adapted.cases, adapted.varianceRows, S);
    expect(out.rows.map((r) => r.ordinal)).toEqual([3]);
    expect(out.skipped).toEqual([{ case: 'A0461', ordinal: 2, reason: 'duplicate_displaced' }]);
  });
});
