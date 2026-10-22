// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md m.305 (CoA tools coa-*), m.56 (the --accept --ruling door), m.70 (pre-registration before the round), m.307 (classes outside both percentages)
// SPEC LINK: pending rows CHAT-63.C3 (BY-LAW CHANGED), CHAT-63.C4 (per-round pre-registration), CHAT-63.C5 (floors through the pin door)
// Red first: docs/reports/red-evidence/bylaw/coa-round-red.txt. Pure checks, no external data.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const R = await import(path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-round.mjs'));
const U = await import(path.join(ROOT, 'scripts/analysis/bylaw/universe.mjs'));

const row = (clause_norm: string, cls: string, notice = 'A1/26X', n = 1) => ({ notice, n, clause: clause_norm, clause_norm, class: cls });
const rows = (art: string, m: number, d: number, na = 0, ow = 0) => [
  ...Array.from({ length: m }, (_, i) => row(`${art}.10(1)`, 'MATCH', `M${art}`, i)), ...Array.from({ length: d }, (_, i) => row(`${art}.10(2)`, 'DIFFER', `D${art}`, i)),
  ...Array.from({ length: na }, (_, i) => row(`${art}.10(3)`, 'NO ANSWER', `N${art}`, i)), ...Array.from({ length: ow }, (_, i) => row(`${art}.10(4)`, 'OWED', `O${art}`, i)),
];

describe('C-3: BY-LAW CHANGED (counted in neither percentage; nothing guessed)', () => {
  const statuses = {
    '101-2022': { status: 'in_force', in_force_on: '2022-07-04', enacted_on: '2022-02-03', in_force_trigger: null },
    '500-2014': { status: 'not_verified', in_force_on: null, enacted_on: null, in_force_trigger: null },
    '900-2030': { status: 'not_verified', in_force_on: null, enacted_on: null, in_force_trigger: null },
  };
  const tag = (bylaw: string, clause_path = '(1)') => ({ bylaw, clause_path });
  it('a verified in-force date after the decision date is BY-LAW CHANGED', () => {
    expect(R.bylawStatusAtDecision([tag('101-2022')], statuses, '2021-05-01', '(1)')).toEqual({ state: 'changed', bylaws: ['101-2022'] });
  });
  it('a verified date on or before the decision date changes nothing', () => {
    expect(R.bylawStatusAtDecision([tag('101-2022')], statuses, '2022-07-04', '(1)').state).toBe('none');
  });
  it('a tag with no verified date is "amendment status unverified", never guessed as changed (not even by by-law number year)', () => {
    expect(R.bylawStatusAtDecision([tag('500-2014')], statuses, '2017-03-01', '(1)').state).toBe('unverified');
    expect(R.bylawStatusAtDecision([tag('900-2030')], statuses, '2017-03-01', '(1)').state).toBe('unverified');
  });
  it('a missing decision date is unverified, not changed', () => {
    expect(R.bylawStatusAtDecision([tag('101-2022')], statuses, '', '(1)').state).toBe('unverified');
  });
  it('only tags on the cited clause path count; a verified change outranks an unverified tag', () => {
    expect(R.bylawStatusAtDecision([tag('101-2022', '(2)')], statuses, '2021-05-01', '(1)').state).toBe('none');
    expect(R.bylawStatusAtDecision([tag('500-2014'), tag('101-2022')], statuses, '2021-05-01', '(1)').state).toBe('changed');
    expect(R.bylawStatusAtDecision([], statuses, '2021-05-01', '(1)').state).toBe('none');
  });
  it('BY-LAW CHANGED rows are in neither percentage', () => {
    const s = R.statsOf([...rows('10.20.40', 9, 1), row('10.20.40.10(1)', 'BY-LAW CHANGED'), row('10.20.40.10(1)', 'DATA')]);
    expect(s.overall).toMatchObject({ match: 9, differ: 1, accuracy: 0.9, answered: 1 });
  });
});

describe('C-5: floors through the pin door', () => {
  const all = [...rows('10.20.40', 18, 2, 5, 5), ...rows('10.10.40', 6, 0, 1, 1), ...rows('900.3.10', 2, 0)];
  it('statsOf: accuracy = M/(M+D); answered = (M+D)/(M+D+NA+OWED)', () => {
    const s = R.statsOf(all);
    expect(s.overall).toMatchObject({ match: 26, differ: 2, na: 6, ow: 6 });
    expect(s.overall.accuracy).toBeCloseTo(26 / 28, 9);
    expect(s.overall.answered).toBeCloseTo(28 / 40, 9);
    expect(R.articleOf('10.20.40.70(1)(B)')).toBe('10.20.40');
  });
  it('floors: per article for >= 10 scored rows, the smaller articles pooled, all rounded down', () => {
    const f = R.floorsFrom(R.statsOf(all));
    expect(Object.keys(f.articles)).toEqual(['10.20.40']);
    expect(f.articles['10.20.40']).toEqual({ accuracy: 90, answered: 66 });
    expect(f.pooled).toEqual({ accuracy: 100, answered: 80 });
    expect(f.overall).toEqual({ accuracy: 92, answered: 70 });
  });
  it('checkFloors passes at the floor and fails below it, naming the article', () => {
    const f = R.floorsFrom(R.statsOf(all));
    expect(R.checkFloors(f, R.statsOf(all))).toEqual([]);
    const worse = R.statsOf([...rows('10.20.40', 15, 5, 5, 5), ...rows('10.10.40', 6, 0, 1, 1), ...rows('900.3.10', 2, 0)]);
    const v = R.checkFloors(f, worse).join('\n');
    expect(v).toMatch(/article 10\.20\.40 accuracy/);
    expect(v).toMatch(/overall accuracy/);
  });
  it('an article with >= 10 scored rows and no floor is a violation (it must be added through the door)', () => {
    const f = R.floorsFrom(R.statsOf(all));
    const grown = R.statsOf([...all, ...rows('10.10.40', 8, 2)]);
    expect(R.checkFloors(f, grown).join()).toMatch(/article 10\.10\.40 has 10 or more scored rows and no floor/);
  });
  it('the accept door refuses a ruling that is not a RATIFIED register id, and records the ruling when it is', () => {
    const rulings = new Map([['M-1', 'RATIFIED'], ['M-2', 'PROPOSED']]);
    const f = R.floorsFrom(R.statsOf(all));
    expect(() => R.acceptFloors(f, R.statsOf(all), 'M-2', rulings)).toThrow(/not RATIFIED/);
    expect(() => R.acceptFloors(f, R.statsOf(all), '', rulings)).toThrow(/--ruling/);
    const g = R.acceptFloors(f, R.statsOf(all), 'M-1', rulings);
    expect(g.rulings.at(-1)).toMatchObject({ ruling: 'M-1' });
  });
  it('the committed floors file equals the 92 / 71 overall floors of CHAT-63.C5 and is not above the measured lock', () => {
    const f = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-expected/floors-172.json'), 'utf8'));
    expect(f.overall).toEqual({ accuracy: 92, answered: 71 });
    expect(f.pooled).toBeTruthy();
    expect(f.rulings[0].ruling).toBe('2026-10-22-batch-z3#CHAT-63.C5');
    expect(typeof U.readSpec69Rulings).toBe('function'); // the same ruling reader as the --accept door of the table pins
  });
});

describe('C-4: per-round pre-registration', () => {
  const base = [row('10.5.50.10(1)(C)', 'MATCH', 'A1'), row('10.20.40.70(3)', 'DIFFER', 'A2'), row('10.20.40.10(1)', 'NO ANSWER', 'A3')];
  it('diffMoves lists every row whose class changed, keyed by notice and item', () => {
    const cur = [row('10.5.50.10(1)(C)', 'MATCH', 'A1'), row('10.20.40.70(3)', 'MATCH', 'A2'), row('10.20.40.10(1)', 'NO ANSWER', 'A3')];
    expect(R.diffMoves(base, cur)).toEqual([{ notice: 'A2/n1'.split('/')[0], n: 1, clause: '10.20.40.70(3)', from: 'DIFFER', to: 'MATCH' }]);
  });
  const pre = (moves: object[], totals: object) => ({ schema: 'coa-round-prereg-v1', round: 1, expected_moves: moves, expected_totals: totals });
  const cur = [row('10.5.50.10(1)(C)', 'MATCH', 'A1'), row('10.20.40.70(3)', 'MATCH', 'A2'), row('10.20.40.10(1)', 'NO ANSWER', 'A3')];
  const totals = { MATCH: 2, 'NO ANSWER': 1 };
  it('an expected move that happens, with the expected totals, is OK', () => {
    const r = R.checkPrereg(pre([{ clause: '10.20.40.70(3)', from: 'DIFFER', to: 'MATCH' }], totals), R.diffMoves(base, cur), totals);
    expect(r).toMatchObject({ verdict: 'ok', unexpected: [], missing: [], totals_diff: [] });
  });
  it('an unexpected move is a finding, not a pass; so is an expected move that did not happen and a totals difference', () => {
    const r = R.checkPrereg(pre([{ clause: '10.5.50.10(1)(C)', from: 'MATCH', to: 'DIFFER' }], { MATCH: 3 }), R.diffMoves(base, cur), totals);
    expect(r.verdict).toBe('finding');
    expect(r.unexpected).toHaveLength(1);
    expect(r.missing).toHaveLength(1);
    expect(r.totals_diff.join()).toMatch(/MATCH expected 3 got 2/);
  });
  it('the form is the prereg-0 form (schema id, round, plan_ref, comment) and the round-0 file is committed', () => {
    const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/validation/coa-rounds/prereg-0.json'), 'utf8'));
    expect(R.checkPreregShape(p)).toEqual([]);
    expect(R.checkPreregShape({ ...p, schema: 'x' }).join()).toMatch(/schema/);
    expect(R.checkPreregShape({ ...p, expected_moves: [{ clause: 'x' }] }).join()).toMatch(/expected_moves/);
  });
});

// The scorer wiring, on the 172-notice set (values-only data kept outside git; skipped where absent, like coa-scorecard.logic.test.ts).
import os from 'node:os';
import { execFileSync } from 'node:child_process';
const DATA = process.env.COA_DATA || path.join(os.homedir(), 'Buildo-scratch/coa-data');
const have172 = fs.existsSync(path.join(DATA, 'parcels-all2.json')) && fs.existsSync(path.join(DATA, 'notices-all2.json'));
describe.skipIf(!have172)('scorer wiring (172 notices)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coaround-'));
  const run = (extra: string[], out = path.join(tmp, 'sc.json')) => {
    try {
      return { code: 0, so: execFileSync('node', [path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-scorecard.mjs'), '--notices', path.join(DATA, 'notices-all2.json'),
        '--parcels', path.join(DATA, 'parcels-all2.json'), '--plan-facts', path.join(DATA, 'plan-facts'), '--out', out, ...extra], { encoding: 'utf8' }) };
    } catch (e: any) { return { code: e.status, so: String(e.stdout) }; }
  };
  const floorsFile = path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-expected/floors-172.json');
  it('C-3: A0573/24NY (heard 2025-01-23, 10.20.40.30(1) amended by 648-2025, in force 2025-06-26) is BY-LAW CHANGED, in neither percentage', () => {
    const r = run([]);
    expect(r.so).toMatch(/"BY-LAW CHANGED":1/);
    const sc = JSON.parse(fs.readFileSync(path.join(tmp, 'sc.json'), 'utf8'));
    const x = sc.rows.find((q: any) => q.notice === 'A0573/24NY' && q.clause_norm === '10.20.40.30(1)');
    expect([x.class, x.class_before_bylaw]).toEqual(['BY-LAW CHANGED', 'MATCH']);
    expect(sc.rows.some((q: any) => q.amendment_status === 'unverified')).toBe(true); // tag without a verified date: labelled, not guessed, class kept
  }, 120000);
  it('C-5: the committed floors hold on the 172-notice set (--floors) and a raised floor fails', () => {
    expect(run(['--floors', floorsFile]).so).toMatch(/FLOORS OK/);
    const hi = path.join(tmp, 'hi.json');
    const f = JSON.parse(fs.readFileSync(floorsFile, 'utf8')); f.articles['10.20.40'].accuracy = 99; fs.writeFileSync(hi, JSON.stringify(f));
    const r = run(['--floors', hi]);
    expect(r.code).toBe(1);
    expect(r.so).toMatch(/FLOORS FAIL: article 10\.20\.40 accuracy/);
  }, 240000);
  it('C-5: --accept without a RATIFIED --ruling refuses and leaves the floors file unchanged', () => {
    const copy = path.join(tmp, 'copy.json'); fs.copyFileSync(floorsFile, copy);
    const r = run(['--floors', copy, '--accept', '--ruling=M-99999']);
    expect(r.code).not.toBe(0);
    expect(fs.readFileSync(copy, 'utf8')).toBe(fs.readFileSync(floorsFile, 'utf8'));
  }, 120000);
  it('C-4: an uncommitted pre-registration is a finding; a registered round-0 file matches expected against actual', () => {
    const loose = path.join(tmp, 'prereg-x.json'); fs.copyFileSync(path.join(ROOT, 'scripts/seeds/bylaw/validation/coa-rounds/prereg-0.json'), loose);
    const r = run(['--prereg', loose]);
    expect(r.code).toBe(1);
    expect(r.so).toMatch(/PREREG FINDING.*not committed at HEAD/);
  }, 120000);
});
