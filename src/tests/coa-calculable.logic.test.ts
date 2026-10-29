// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-59 (operator FS-Q1, 2026-10-29: "this is easy to calculate the required number 3 times the number of units"; card
//            ~/Buildo-scratch/p2close/CARD-mb59.answered.md), CHAT-198.NN-Q1 (answered class), M-321 (pre-registration committed first)
//
// MB-59: a requirement the notice states without a number that the keyed rule can calculate (maximum bedrooms = 3 x dwelling units, 10.20.40.1(8)(B)) is calculated by the model
// and the row is scored ANSWERED with the verdict against the applicant's figure; it is neither NOT MODELLED nor NO ANSWER.
// Red first: before the change the row has 1 dwelling unit (the purpose "convert the existing 2 unit dwelling to 3 units" is read as a detached house) and no candidate rule.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs/.json surface
const ROOT = process.cwd();
const TOOLS = 'scripts/analysis/bylaw-validation';
const DATA = process.env.COA_DATA || path.join(os.homedir(), 'Buildo-scratch/coa-data');
const have = fs.existsSync(path.join(DATA, 'parcels-all2.json')) && fs.existsSync(path.join(DATA, 'notices-all2.json'));

describe.skipIf(!have)('MB-59: a requirement the notice prints no figure for, that the rule calculates, is answered with a verdict (A0055/26SC#1)', () => {
  it('3 dwelling units after the conversion, maximum bedrooms 3 x 3 = 9, the proposal of 16 exceeds it: ANSWERED with that verdict', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb59-')); const out = path.join(dir, 's.json');
    execFileSync('node', [path.join(ROOT, TOOLS, 'coa-scorecard.mjs'), '--notices', path.join(DATA, 'notices-all2.json'), '--parcels', path.join(DATA, 'parcels-all2.json'), '--plan-facts', path.join(DATA, 'plan-facts'), '--out', out], { encoding: 'utf8' });
    const rows: Json[] = JSON.parse(fs.readFileSync(out, 'utf8')).rows;
    const r = rows.find((x) => x.notice === 'A0055/26SC' && x.n === 1) as Json;
    expect(r.dwelling_units).toBe(3);
    expect(r.class).toBe('ANSWERED');
    expect(r.ours.value).toBe(9);
    expect(r.verdict).toMatchObject({ proposed: 16, limit: 9, exceeds: true });
  }, 120000);
});
