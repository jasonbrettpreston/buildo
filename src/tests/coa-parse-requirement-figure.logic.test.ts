// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md line 93 (b) (a figure after a conditional marker is a condition; context figures are dropped),
//            docs/specs/01-pipeline/69a_mcbylaw_register.md CHAT-136.B10-PARSER (a qualifying phrase's first number read as the requirement), M-321 (pre-registration),
//            scripts/analysis/bylaw-validation/coa-expected/prereg-mb03.json (committed first)
//
// MB-03: the notice reader takes the figure the limit word governs, not a qualifier ("within 0.3 m of a building") or a threshold ("less than 7.5 m from the residential building").
// Sentence shapes are the real ones from the cumulative set (values only, no names). Red first: before the change coa-parse.cjs has no readFigures.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .cjs/.json surface
const ROOT = process.cwd();
const TOOLS = 'scripts/analysis/bylaw-validation';
const CP = createRequire(import.meta.url)(path.join(ROOT, TOOLS, 'coa-parse.cjs'));
const read = (req: string, prop: string): Json => CP.readFigures(req, prop);

describe('MB-03: the requirement figure is the one the limit word governs', () => {
  it('a platform clause: the "attached to or within 0.3 m of a building" qualifier is not the limit (A0103/26SC#3, A0129/26EYK#6, A0179/26EYK#4)', () => {
    expect(read('The front porch attached to or within 0.3 m of a building must comply with the minimum setback of 0.2m.', 'The front porch will be 0.57 m.').required).toEqual({ value: 0.2, unit: 'm' });
    const r = read('A platform without main walls, attached to or less than 0.3 m from a building, with a floor no higher than the first floor of the building above established grade may encroach 1.5 m into the required front yard setback, if it is no closer to a side lot line than the required side yard setback.', 'The platform will encroach 1.67 m into the required front yard setback.');
    expect(r.required).toEqual({ value: 1.5, unit: 'm' });
    expect(r.check).toBe(false);
    expect(read('A platform without main walls attached to or less than 0.3 m from a building, with a floor no higher than the first floor of the building above established grade may encroach into the required rear yard setback 2.5 m.', 'The platform will encroach 2.74 m.').required).toEqual({ value: 2.5, unit: 'm' });
  });
  it('the "if no closer to a side lot line than 1.2 m" condition is not the limit (A0245/26NY#3, A0265/26EYK#9, A0253/26NY#6)', () => {
    expect(read('A platform without main walls, attached to or less than 0.3 m from a building, with a floor no higher than the first floor of the building above established grade may encroach into the required front yard setback 2.5 m if it is no closer to a side lot line than the required side yard setback of 1.2 m.', 'The platform will encroach 2.07 m.').required.value).toBe(2.5);
    expect(read('A platform without main walls, attached to or located less than 0.3 m from a building, with a floor no higher than the first floor above established grade, may encroach into the required front yard setback a maximum of 2.5 m if it is no closer than 1.2 m to a side lot line.', 'The platform will encroach 3.17 m.').required.value).toBe(2.5);
  });
  it('a threshold that says when the rule applies is not the limit (A0375/26TEY#5, A0450/26TEY#4, A0194/26EYK#2)', () => {
    expect(read('The maximum permitted height of an ancillary building containing a laneway suite, located less than 7.5 m from the residential building on the same lot, is 4 m.', 'The height will be 7.19 m.').required).toEqual({ value: 4, unit: 'm' });
    expect(read('If the side lot line abuts a lot in the R, RD, RS, RT or RM Zone and the rear lot line abuts a lane, beginning from a height of 4 m, an ancillary building must be setback 1.5 m from the side lot line that abuts the rear lot line of another lot.', 'The side setback will be 0.33 m.').required).toEqual({ value: 1.5, unit: 'm' });
    expect(read('Platforms attached to or within 0.3 m of a rear main wall, which are greater than 1.2 m above the ground at any point below the platform, may project a maximum 2.5 m from the rear wall and may be no higher than the level of the floor from which it gains access.', 'The platform will project 3.66 m.').required.value).toBe(2.5);
  });
  it('lot frontage and drive aisle thresholds are not the limit (A0251/26TEY#3, A0302/26NY#2, A0252/26NY#5, A0244/26NY#6)', () => {
    expect(read('The minimum building setback from a side lot line for any addition or extension to the rear or the side of a lawfully existing building or structure on a lot with a lot frontage of less than 9 m is 0.76 m.', 'The setback will be 0.75 m.').required.value).toBe(0.76);
    expect(read('In the RD zone with a minimum required lot frontage of 18.0 m or less, the maximum permitted building length for a detached house is 17.0 m.', 'The building length will be 21.92 m.').required.value).toBe(17);
    expect(read('For a detached house, a driveway that is located in or passes through the front yard may be for lots with a lot frontage of 6.0 m to 23.0 m inclusive, or a townhouse dwelling unit at least 6.0 m wide, a maximum of 3.61 m wide.', 'The driveway width will be 5.04 m.').required.value).toBe(3.61);
    const p = read('The minimum dimensions of a parking space, accessed by a one-way or two-way drive aisle having a width of 6.0 m or more, is 2.6 m wide by 5.6 m long.', 'The aisle will be 6.0 m wide.');
    expect(p.required.value).toBe(2.6);
    expect(p.check).toBe(false); // MB-03b (MB03-Q2 replaces the one-figure reading): width and length are two stated limits, two checks (coa-limits.logic.test.ts)
  });
  it('shapes that already read right stay as they were (limit first, condition after)', () => {
    expect(read('Roof eaves may project a maximum of 0.9 m provided that they are no closer than 0.3 m to a lot line.', 'The eaves will project 1.65 m.').required.value).toBe(0.9);
    expect(read('The maximum permitted height of an ancillary building containing a garden suite is 4 m if the ancillary building is located less than 7.5 m from the residential building on the lot.', 'The height will be 4.85 m.')).toMatchObject({ required: { value: 4, unit: 'm' }, check: false });
    expect(read('An ancillary building containing a garden suite must be no less than 7.5 m from the main wall of a residential building on the same lot if the height of the ancillary building is greater than 4 m.', 'The separation will be 3.85 m.').required.value).toBe(7.5);
    expect(read('Roof eaves (including gutters) may project a maximum of 0.9 m provided that they are no closer than 0.3 m to a lot line.', 'The eaves will project 0.26 m.').required.value).toBe(0.9);
    expect(read('The maximum permitted building length is 19.0 m, provided the extension to the building is located 3.0 m from each side lot line.', 'The building length will be 19.51 m.').required.value).toBe(19);
  });
  it('several different figures of the unit keep the first as the requirement; since MB-03b each is its own check, none waits for the operator (A0090/26SC#3, A0396/26TEY#1, A0255/26NY#2)', () => {
    const r = read('A platform without main walls, such as a deck, porch, balcony or similar structure, attached to or within 0.3 m of a building, must comply with the required minimum building setbacks for the zone (3.6 m South and 0.45 m North).', 'The platform will be 2 m from the south lot line.');
    expect(r.required.value).toBe(3.6);
    expect(r.check).toBe(false); // MB03-Q2 (recorded fc117484)
    expect(read('Despite Regulation 10.20.40.70(3), the minimum required side yard setback is 0.9 m for one side yard setback and 1.2 m for the other side yard.', 'The setback will be 1.22 m.').check).toBe(false); // MB03-Q2
  });
  it('the full parser returns the same figure for a printed notice', () => {
    const text = ['PURPOSE OF THE APPLICATION', 'To construct a laneway suite.', 'REQUESTED VARIANCE(S) TO THE ZONING BY-LAW', '1. Section 150.8.60.40(1)(A), By-law 569-2013',
      'The maximum permitted height of an ancillary building containing a laneway suite, located less than 7.5 m from the residential building on the same lot, is 4 m.', 'The height of the ancillary building will be 7.19 m.'].join('\n');
    const v = CP.parse(text).record.variances[0];
    expect(v.required).toEqual({ value: 4, unit: 'm' });
    expect(v.proposed).toEqual({ value: 7.19, unit: 'm' });
  });
});

// ---------------------------------------------------------------- the scorer on re-read notices (needs the values-only coa-data; skipped when absent)
const DATA = process.env.COA_DATA || path.join(os.homedir(), 'Buildo-scratch/coa-data');
const have = fs.existsSync(path.join(DATA, 'parcels-all2.json')) && fs.existsSync(path.join(DATA, 'notices-all2.json'));
describe.skipIf(!have)('MB-03 on the 172-notice set re-read with the new rule', () => {
  it('A0450#4 and A0375#5 now MATCH, A0205#1 and #2 keep the side setback as their first check, no City limit is a qualifier', () => {
    const notices = JSON.parse(fs.readFileSync(path.join(DATA, 'notices-all2.json'), 'utf8'));
    for (const n of notices) for (const v of n.variances) { const f = CP.readFigures(v.requirement || '', v.proposal || ''); if (v.required) { v.required = f.required; v.required_all = f.required_all; v.check = f.check; } }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb03-')); const inp = path.join(dir, 'n.json'); const out = path.join(dir, 's.json');
    fs.writeFileSync(inp, JSON.stringify(notices));
    execFileSync('node', [path.join(ROOT, TOOLS, 'coa-scorecard.mjs'), '--notices', inp, '--parcels', path.join(DATA, 'parcels-all2.json'), '--plan-facts', path.join(DATA, 'plan-facts'), '--out', out], { encoding: 'utf8' });
    const rows: Json[] = JSON.parse(fs.readFileSync(out, 'utf8')).rows; const get = (a: string, n: number) => rows.find((r) => r.notice === a && r.n === n) as Json;
    expect(get('A0450/26TEY', 4)).toMatchObject({ class: 'MATCH', city_value: 1.5 });
    expect(get('A0375/26TEY', 5)).toMatchObject({ class: 'MATCH', city_value: 4 });
    expect(get('A0205/26NY', 1)).toMatchObject({ city_value: 1.8, target: 'platform_side_setback_m' }); // class: MB-03b checks the rear 10.88 m too (coa-limits.logic.test.ts)
    expect(get('A0205/26NY', 2)).toMatchObject({ city_value: 1.8, target: 'platform_side_setback_m' });
  }, 120000);
});
