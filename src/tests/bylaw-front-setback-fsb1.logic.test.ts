// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-245 (dated note 2026-10-29, card FS-SB1), M-256 (CHAT-198.NN-Q4 refined), M-321 (pre-registration);
//            decision log wf1/rulings-rec3@3942c7d0:docs/reports/decisions/2026-10-29-batch-aa.json (CHAT-198.NN-Q4);
//            scripts/analysis/bylaw-validation/coa-expected/prereg-fsb1.json
//
// Card FS-SB1: "The neighbours' front setbacks are the user's figures, else the building-footprint estimate plus the M-245 allowance of 1.0 m (both neighbours
// averaged, one side if only one is found), else 6.0 m; every estimated or default value is flagged needs survey." The allowance fya_porch_allowance_m is a
// logic variable read from ONE place: the product path (resolveFrontSetback) and the scorer share it, neither carries a literal 1.0.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const FA = async (): Promise<Json> => import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/front-averaging.mjs')).href);
const SEED: Json = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/logic_variables.json'), 'utf8'));
const nb = (id: number, est: number) => ({ neighbour_residential: true, same_frontage_street: true, neighbour_building_id: id, bldg_to_subject_m: 4, est_status: 'estimated', front_setback_est_m: est });
const lot = { zone_default_m: 6 };

describe('FS-SB1: the product path reads the neighbour front setback in the ruled order', () => {
  it('the logic-variable table holds the allowance at 1.0 (M-245)', () => {
    expect(SEED.fya_porch_allowance_m.default).toBe(1.0);
  });
  it('two neighbours: the average of the footprint estimates plus the allowance, flagged needs survey', async () => {
    const r = (await FA()).resolveFrontSetback([nb(1, 12.5), nb(2, 11.5)], SEED, lot);
    expect([r.basis, r.front_setback_m, r.needs_survey, r.disclosures]).toEqual(['averaged_two', 13, true, ['front_yard_needs_survey']]);
  });
  it('one side only: that side plus the allowance, flagged needs survey', async () => {
    const r = (await FA()).resolveFrontSetback([nb(1, 12.5)], SEED, lot);
    expect([r.basis, r.front_setback_m, r.needs_survey]).toEqual(['averaged_one', 13.5, true]);
  });
  it('no figure anywhere while averaging may apply: 6.0 m, flagged needs survey and as a default', async () => {
    const r = (await FA()).resolveFrontSetback([{ ...nb(1, 0), est_status: 'no_building', front_setback_est_m: null }], SEED, lot);
    expect([r.basis, r.front_setback_m, r.needs_survey, r.default_used, r.disclosures]).toEqual(['default_6_0', 6, true, true, ['front_yard_survey_required']]);
  });
  it('the user\'s figures win over the estimate, no allowance, no survey flag', async () => {
    const r = (await FA()).resolveFrontSetback([nb(1, 12.5), nb(2, 11.5)], SEED, lot, { neighbour_front_setbacks_m: [13.44, 13.39] });
    expect([r.basis, r.front_setback_m, r.needs_survey]).toEqual(['user_supplied', 13.42, false]);
  });
  it('the allowance comes from the table, not from a literal: another table value moves the result; a table without it is refused', async () => {
    const M = await FA();
    expect(M.resolveFrontSetback([nb(1, 12.5)], { fya_porch_allowance_m: { default: 2.0 } }, lot).front_setback_m).toBe(14.5);
    expect(M.resolveFrontSetback([nb(1, 12.5)], { fya_porch_allowance_m: 0.5 }, lot).front_setback_m).toBe(13);
    expect(() => M.resolveFrontSetback([nb(1, 12.5)], {}, lot)).toThrow(/fya_porch_allowance_m/);
  });
  it('the scorer shares the one implementation: it calls resolveFrontSetback with the table and carries no allowance literal of its own', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-scorecard.mjs'), 'utf8');
    expect(src).toMatch(/resolveFrontSetback\(/);
    expect(src).not.toMatch(/resolveFrontAveraging\(/);
    expect(src).not.toMatch(/FYA_ALLOWANCE\s*=\s*Number\([^)]*\|\|\s*1(\.0)?\)/);
    expect(src).toMatch(/logic_variables\.json/);
  });
});
