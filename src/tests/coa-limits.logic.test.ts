// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB03-Q2 (2026-10-29-batch-ac, recorded fc117484: a requirement sentence yields one check per stated limit; a figure that
//            defines when the rule applies is a condition, never a limit), M-321 (pre-registration), scripts/analysis/bylaw-validation/coa-expected/prereg-mb03b.json (committed first)
//
// MB-03b: the notice reader classifies every figure of a requirement sentence as a limit, a condition or a definition; the scorer makes one check per limit;
// a definition figure ("within 0.3 m of a building") is disclosed, never scored. Sentence shapes are the real ones from the cumulative set (values only, no names).
// Red first: before the change coa-parse.cjs has no requirementLimits and reads "5,400 m2" as 400.
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
const limits = (req: string): Json[] => CP.requirementLimits(req);
const kinds = (req: string): string[] => limits(req).map((l) => `${l.value}${l.unit}:${l.kind}`);

describe('MB-03b: every figure of a requirement sentence is a limit, a condition or a definition', () => {
  it('eaves: the maximum projection and the clearance from the lot line are two limits (A0151/26EYK#3, A0510/26TEY#4)', () => {
    expect(limits('Roof eaves may project a maximum of 0.9 m provided that they are no closer than 0.3 m to a lot line.').map((l) => [l.value, l.kind, l.role])).toEqual([[0.9, 'limit', 'encroachment'], [0.3, 'limit', 'clearance']]);
    expect(limits('The eaves of a roof on an ancillary building may encroach into a building setback a maximum of 0.3 m, if the eaves are no closer to a lot line than 0.15 m.').map((l) => [l.value, l.kind, l.role])).toEqual([[0.3, 'limit', 'encroachment'], [0.15, 'limit', 'clearance']]);
    expect(limits('The permitted maximum projection of the roof eaves of an ancillary building into the minimum building setback is 0.3 m if the eaves are no closer to a lot line than 0.15 m.').map((l) => [l.value, l.role])).toEqual([[0.3, 'encroachment'], [0.15, 'clearance']]);
  });
  it('a platform: the 0.3 m building definition is a definition, each named line is its own limit (A0090/26SC#3, A0205/26NY#1, A0396/26TEY#1)', () => {
    const a = limits('A platform without main walls, such as a deck, porch, balcony or similar structure, attached to or within 0.3 m of a building, must comply with the required minimum building setbacks for the zone (3.6 m South and 0.45 m North).');
    expect(a.map((l) => [l.value, l.kind, l.role])).toEqual([[0.3, 'definition', null], [3.6, 'limit', 'setback:side'], [0.45, 'limit', 'setback:side']]);
    const b = limits('A platform without main walls, such as a deck, porch, balcony or similar structure, attached to or within 0.3m of a building, must comply with the required minimum building setbacks for the zone: 1.8m from the side lot lines (as per Exception RD5) and 10.88m from the rear lot line.');
    expect(b.map((l) => [l.value, l.kind, l.role])).toEqual([[0.3, 'definition', null], [1.8, 'limit', 'setback:side'], [10.88, 'limit', 'setback:rear']]);
    const c = limits('In the Residential (R) zone, a platform without main walls, attached to or within 0.3 m of a building, must comply with the required minimum building setbacks for the zone: - The minimum required front yard setback is 1.1 m. - The minimum required side (south) yard setback is 0.45 m. - The minimum required side (north) yard setback is 0.9 m.');
    expect(c.map((l) => [l.value, l.kind, l.role])).toEqual([[0.3, 'definition', null], [1.1, 'limit', 'setback:front'], [0.45, 'limit', 'setback:side'], [0.9, 'limit', 'setback:side']]);
  });
  it('a platform encroachment with a side clearance: both are limits, the definition is not (A0245/26NY#3, A0265/26EYK#9)', () => {
    expect(limits('A platform without main walls, attached to or less than 0.3 m from a building, with a floor no higher than the first floor of the building above established grade may encroach into the required front yard setback 2.5 m if it is no closer to a side lot line than the required side yard setback of 1.2 m.').map((l) => [l.value, l.kind, l.role])).toEqual([[0.3, 'definition', null], [2.5, 'limit', 'encroachment'], [1.2, 'limit', 'clearance']]);
  });
  it('thresholds that say when the rule applies are conditions (A0174/26NY#1, A0198/26NY#5, A0203/26EYK#2, A0428/26TEY#7, A0229/26NY#1, A0259/26NY#1)', () => {
    expect(kinds('Despite regulation 10.5.60.30(1), the main wall of an ancillary building containing a garden suite must be no less than 7.5 m from the main wall of the residential building on the same lot if the height of the ancillary building is greater than 4.0m.')).toEqual(['7.5m:limit', '4m:condition']);
    expect(kinds('An ancillary building containing a garden suite must be no less than 4 m from a residential building on the same lot if the height of the ancillary building is no greater than 4 m.')).toEqual(['4m:limit', '4m:condition']);
    expect(kinds('A platform without main walls, together with stairs or ramps leading to the platform, may encroach into the required distance separation by a maximum of 1.5 m from the front main wall of the ancillary building if the platform is no higher than 0.3 m above the average elevation of the ground measured along the front main wall of the ancillary building.')).toEqual(['1.5m:limit', '0.3m:condition']);
    expect(kinds('The minimum required side yard setback of a full or partial second storey addition above an existing one-storey detached house on a lot with a lot frontage of less than 15.3 m is equal to the side yard setback of the existing detached house if the side yard setback of the addition is a minimum of 0.6 m and the minimum required aggregate side yard setbacks of both side yards is 2.1 m.')).toEqual(['15.3m:condition', '0.6m:limit', '2.1m:limit']);
    expect(kinds('The maximum permitted height of an ancillary building containing a garden suite is 4 m if the ancillary building is located less than 7.5 m from the residential building on the same lot.')).toEqual(['4m:limit', '7.5m:condition']);
    expect(kinds('The level of the floor of a platform permitted in accordance with 10.5.40.50(2) and located at or below the first storey of a residential building, may be no higher than 1.2 m above the ground at any point below the platform, except where the platform is attached to or within 0.3 m of a rear main wall.')).toEqual(['1.2m:limit', '0.3m:definition']);
    expect(kinds('...may be no higher than 1.2 m above the ground at any point below the platform, except where the platform is attached to or within 0.3 m of: a rear main wall, any part of the platform floor located 2.5 m or less from the rear main wall may be no higher than the level of the floor from which it gains access.')).toEqual(['1.2m:limit', '0.3m:definition', '2.5m:condition']);
  });
  it('several stated limits of one sentence stay several (A0252/26NY#2, A0255/26NY#2, A0231/26EYK#3, A0201/26EYK#9, A0240/26NY#2, A0244/26NY#6)', () => {
    expect(kinds('The maximum permitted building length is 19.0 m, provided the extension to the building is located 3.0 m from each side lot line.')).toEqual(['19m:limit', '3m:limit']);
    expect(kinds('Despite Regulation 10.20.40.70(3), the minimum required side yard setback is 0.9 m for one side yard setback and 1.2 m for the other side yard.')).toEqual(['0.9m:limit', '1.2m:limit']);
    expect(kinds('A parapet on a residential building in the RD zone may exceed the permitted maximum main wall height by a maximum of 0.3 m resulting in a maximum permitted building height of 7.5 m.')).toEqual(['0.3m:limit', '7.5m:limit']);
    expect(kinds('If a building has uses for which 5 or more "long-term" bicycle parking spaces are required, bicycle maintenance facilities must be provided in the building with a minimum of 1.8 m in length, 2.6 m in width and 1.9 m in vertical clearance from the ground.')).toEqual(['1.8m:limit', '2.6m:limit', '1.9m:limit']);
    expect(kinds('The minimum side yard setback shall be (A) 4.5m for one side yard, and (B) 3.0m for all the other side yards.')).toEqual(['4.5m:limit', '3m:limit']);
    expect(kinds('The minimum dimensions of a parking space, accessed by a one-way or two-way drive aisle having a width of 6.0 m or more, is 2.6 m wide by 5.6 m long.')).toEqual(['6m:condition', '2.6m:limit', '5.6m:limit']);
  });
  it('proposal text that spilled into the requirement sentence is not a limit (A0205/26NY#4, A0300/26NY#1)', () => {
    expect(kinds('The main wall of an ancillary building containing a garden suite must be: (B) no less than 7.5m from the main wall of the residential building on the same lot if the height of the ancillary building is greater than 4m; and With the addition at the rear, the separation distance from the proposed garden suite is 0m.')).toEqual(['7.5m:limit', '4m:condition', '0m:proposal']);
    expect(kinds('The minimum required total amenity space is 4.0 m² per dwelling unit; 108.0 m² The proposed total amenity space is 0 m² per dwelling unit; 0 m².')).toEqual(['4m²:limit', '108m²:limit', '0m²:proposal', '0m²:proposal']);
  });
});

describe('MB-03b: the first limit is still the requirement figure; no figure waits for the operator', () => {
  it('required stays the first limit, and a sentence whose figures are all classified is no longer marked check (the MB03-Q2 ruling replaces the one-figure reading)', () => {
    const r = CP.readFigures('A platform without main walls, such as a deck, porch, balcony or similar structure, attached to or within 0.3 m of a building, must comply with the required minimum building setbacks for the zone (3.6 m South and 0.45 m North).', 'The platform will be 2 m from the south lot line.');
    expect(r.required).toEqual({ value: 3.6, unit: 'm' });
    expect(r.check).toBe(false);
    expect(CP.readFigures('Despite Regulation 10.20.40.70(3), the minimum required side yard setback is 0.9 m for one side yard setback and 1.2 m for the other side yard.', 'The setback will be 1.22 m.').check).toBe(false);
    expect(CP.readFigures('The minimum dimensions of a parking space, accessed by a one-way or two-way drive aisle having a width of 6.0 m or more, is 2.6 m wide by 5.6 m long.', 'The aisle will be 6.0 m wide.').check).toBe(false);
  });
});

describe('MB-03b: the thousands separator', () => {
  it('"5,400 m2" is 5400, not 400 (A0325/26NY#1)', () => {
    const f = CP.readFigures('Despite Regulation 15.5.50.10(1), a minimum of 5,400 m2 of landscaping must be provided of which 2,500 m2 of the required landscaping must be comprised of soft landscaping.', 'The proposed landscaping is 4,700 m2and the proposed soft landscaping is 2,000 m2.');
    expect(f.required).toEqual({ value: 5400, unit: 'm²' });
    expect(f.required_all.map((m: Json) => m.value)).toEqual([5400, 2500]);
    expect(f.proposed).toEqual({ value: 4700, unit: 'm²' });
    expect(CP.measures('a width of 1,234.5 m and 12,3 m')).toEqual([{ value: 1234.5, unit: 'm' }, { value: 3, unit: 'm' }]);
  });
});

describe('MB-03b: the scrubber keeps the word "project"', () => {
  it('an agent whose firm name holds "Project" does not turn the verb into [name removed]', () => {
    const text = ['File Number: A0999/26TEY', 'Agent: Acme Project Design Inc.', '', 'PURPOSE OF THE APPLICATION', 'To construct a house.', 'REQUESTED VARIANCE(S) TO THE ZONING BY-LAW',
      '1. Section 10.5.40.60(7), By-law 569-2013', 'Roof eaves may project a maximum of 0.9 m provided that they are no closer than 0.3 m to a lot line.', 'The proposed eaves will project 0.46 m and will be located 0.14 m from the east side lot line.'].join('\n');
    const rec = CP.parse(text).record;
    expect(rec.variances[0].requirement).toContain('may project a maximum of 0.9 m');
    expect(rec.variances[0].proposal).toContain('will project 0.46 m');
    expect(JSON.stringify(rec)).not.toMatch(/ACME|Acme\b/i);
  });
});

// ---------------------------------------------------------------- the scorer (needs the values-only coa-data; skipped when absent)
const DATA = process.env.COA_DATA || path.join(os.homedir(), 'Buildo-scratch/coa-data');
const have = fs.existsSync(path.join(DATA, 'parcels-all2.json')) && fs.existsSync(path.join(DATA, 'notices-all2.json'));
describe.skipIf(!have)('MB-03b on the 172-notice set: one check per stated limit, the definition disclosed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb03b-')); const out = path.join(dir, 's.json');
  const run = (): Json[] => {
    if (!fs.existsSync(out)) execFileSync('node', [path.join(ROOT, TOOLS, 'coa-scorecard.mjs'), '--notices', path.join(DATA, 'notices-all2.json'), '--parcels', path.join(DATA, 'parcels-all2.json'), '--plan-facts', path.join(DATA, 'plan-facts'), '--out', out], { encoding: 'utf8' });
    return JSON.parse(fs.readFileSync(out, 'utf8')).rows;
  };
  const get = (rows: Json[], a: string, n: number) => rows.find((r) => r.notice === a && r.n === n) as Json;
  it('A0205#1 checks the side setback 1.8 m and the rear setback 10.88 m; the 0.3 m is a definition, disclosed', () => {
    const r = get(run(), 'A0205/26NY', 1);
    expect(r.checks.map((c: Json) => [c.value, c.target])).toEqual([[1.8, 'platform_side_setback_m'], [10.88, 'platform_rear_setback_m']]);
    expect(r.disclosures).toEqual([{ code: 'attached_platform_definition', figure: '0.3 m', clause: '10.5.40.50(2)' }]);
  }, 120000);
  it('eaves rows check the projection and the clearance from the lot line (A0151/26EYK#3)', () => {
    const r = get(run(), 'A0151/26EYK', 3);
    expect(r.checks.map((c: Json) => [c.value, c.target])).toEqual([[0.9, 'eaves_encroachment_m'], [0.3, 'eaves_clearance_m']]);
    expect(r.checks.every((c: Json) => ['MATCH', 'DIFFER', 'OWED', 'NO ANSWER'].includes(c.class))).toBe(true);
  }, 120000);
  it('A0090#3 reads the named lot lines as side setbacks: 3.6 m south and 0.45 m north', () => {
    const r = get(run(), 'A0090/26SC', 3);
    expect(r.checks.map((c: Json) => [c.value, c.target])).toEqual([[3.6, 'platform_side_setback_m'], [0.45, 'platform_side_setback_m']]);
  }, 120000);
  it('A0262#10 and #11 no longer read the 0.3 m definition as the limit', () => {
    const rows = run();
    for (const n of [10, 11]) { const r = get(rows, 'A0262/26EYK', n); if (r) expect(r.city_value).not.toBe(0.3); }
  }, 120000);
});
