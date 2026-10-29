// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-245 and M-256 (dated notes 2026-10-29, card FS-SB2), M-321 (pre-registration);
//            decision log wf1/rulings-rec3@85b665ac:docs/reports/decisions/2026-10-29-batch-aa.json (CHAT-198.NN-Q4);
//            scripts/analysis/bylaw-validation/coa-expected/prereg-fsb2.json; audit ~/Buildo-scratch/p2close/front-setback-placeholder.md
//
// Card FS-SB2: "Where neighbours exist but their front setbacks cannot be measured, the placeholder is the mean of the subject lot's own building front setback
// plus 1.0 m and the median of the footprint estimates plus 1.0 m of other lots on the same street within the placeholder radius (one of the two if only one exists),
// else the same-zone median within the zone radius, else 6.0 m; always flagged needs survey, and never replaces a user figure or a neighbour estimate."
// Radii and minimum counts are logic variables backed by the pinned audit; one implementation (resolveFrontSetback) serves the product path and the scorer.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const FA = async (): Promise<Json> => import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/front-averaging.mjs')).href);
const SEED: Json = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/logic_variables.json'), 'utf8'));
const lot = { zone_default_m: 6 };
const unmeasured = [{ neighbour_residential: true, same_frontage_street: true, neighbour_building_id: 1, bldg_to_subject_m: 4, est_status: 'no_building', front_setback_est_m: null }];
const pool = (...v: number[]) => v.map((est_m, i) => ({ est_m, dist_m: 20 + 10 * i }));

describe('FS-SB2: the placeholder where neighbours exist but cannot be measured', () => {
  it('the four placeholder variables are in the logic-variable table, bounded, with their fit basis (200 m, 3, 500 m, 5)', () => {
    for (const [k, v] of [['fya_placeholder_street_radius_m', 200], ['fya_placeholder_street_min_n', 3], ['fya_placeholder_zone_radius_m', 500], ['fya_placeholder_zone_min_n', 5]] as const) {
      const e = SEED[k]; expect(e, k).toBeTruthy();
      expect([e.default, typeof e.min, typeof e.max]).toEqual([v, 'number', 'number']);
      expect(e.description).toMatch(/front-setback-placeholder\.md/);
    }
  });
  it('the worked example (A0246/17EYK): own 7.71 and street median 7.87, each plus 1.0, average 8.79, flagged needs survey', async () => {
    const r = (await FA()).resolveFrontSetback(unmeasured, SEED, lot, undefined, { own_est_m: 7.71, street_pool: pool(7.5, 7.87, 8.2) });
    expect([r.basis, r.front_setback_m, r.needs_survey, r.disclosures, r.placeholder_source]).toEqual(['placeholder_blend', 8.79, true, ['front_yard_survey_required'], 'own+street']);
  });
  it('one of the two when only one exists: own alone, or the street median alone', async () => {
    const M = await FA();
    const own = M.resolveFrontSetback(unmeasured, SEED, lot, undefined, { own_est_m: 7.71, street_pool: pool(7.5, 7.9) }); // two lots: below the minimum of 3
    expect([own.front_setback_m, own.placeholder_source]).toEqual([8.71, 'own']);
    const st = M.resolveFrontSetback(unmeasured, SEED, lot, undefined, { own_est_m: null, street_pool: pool(7.0, 8.0, 9.0, 10.0) }); // median 8.5
    expect([st.front_setback_m, st.placeholder_source]).toEqual([9.5, 'street']);
  });
  it('a lot outside the street radius does not count; the radius and minimum are read from the table', async () => {
    const M = await FA();
    const far = [...pool(7, 8), { est_m: 20, dist_m: 250 }];
    expect(M.resolveFrontSetback(unmeasured, SEED, lot, undefined, { own_est_m: 7.71, street_pool: far }).placeholder_source).toBe('own');
    const wide = { ...SEED, fya_placeholder_street_radius_m: { default: 300 } };
    expect(M.resolveFrontSetback(unmeasured, wide, lot, undefined, { own_est_m: 7.71, street_pool: far }).placeholder_source).toBe('own+street');
    const few = { ...SEED, fya_placeholder_street_min_n: { default: 2 } };
    expect(M.resolveFrontSetback(unmeasured, few, lot, undefined, { own_est_m: null, street_pool: pool(7, 8) }).front_setback_m).toBe(8.5);
  });
  it('neither own nor street: the same-zone median within the zone radius (at least 5 lots), plus 1.0 m', async () => {
    const M = await FA();
    const z = M.resolveFrontSetback(unmeasured, SEED, lot, undefined, { own_est_m: null, street_pool: pool(7), zone_pool: [...pool(6, 7, 8, 9, 10), { est_m: 30, dist_m: 800 }] });
    expect([z.basis, z.front_setback_m, z.placeholder_source, z.needs_survey]).toEqual(['placeholder_blend', 9, 'zone', true]);
    const few = M.resolveFrontSetback(unmeasured, SEED, lot, undefined, { own_est_m: null, street_pool: [], zone_pool: pool(6, 7, 8, 9) });
    expect([few.basis, few.front_setback_m, few.default_used]).toEqual(['default_6_0', 6, true]);
  });
  it('nothing available, or no context at all: 6.0 m, flagged needs survey and as a default (as FS-SB1)', async () => {
    const M = await FA();
    for (const ctx of [undefined, { own_est_m: null, street_pool: [], zone_pool: [] }]) {
      const r = M.resolveFrontSetback(unmeasured, SEED, lot, undefined, ctx);
      expect([r.basis, r.front_setback_m, r.needs_survey, r.default_used]).toEqual(['default_6_0', 6, true, true]);
    }
  });
  it('never replaces a user figure or a neighbour estimate', async () => {
    const M = await FA();
    const ctx = { own_est_m: 7.71, street_pool: pool(7.5, 7.87, 8.2) };
    const est = [{ ...unmeasured[0], est_status: 'estimated', front_setback_est_m: 12.5 }];
    expect(M.resolveFrontSetback(est, SEED, lot, undefined, ctx).basis).toBe('averaged_one');
    expect(M.resolveFrontSetback(est, SEED, lot, undefined, ctx).front_setback_m).toBe(13.5);
    const u = M.resolveFrontSetback(unmeasured, SEED, lot, { neighbour_front_setbacks_m: [9] }, ctx);
    expect([u.basis, u.front_setback_m]).toEqual(['user_supplied', 9]);
  });
  it('a context with a table that lacks a placeholder variable is refused, naming it', async () => {
    const { fya_placeholder_zone_min_n: _drop, ...rest } = SEED; // eslint-disable-line @typescript-eslint/no-unused-vars
    await expect((async () => (await FA()).resolveFrontSetback(unmeasured, rest, lot, undefined, { own_est_m: 7, street_pool: [], zone_pool: [] }))()).rejects.toThrow(/fya_placeholder_zone_min_n/);
  });
  it('the scorer passes the same table to the same function (no copy of the blend)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/analysis/bylaw-validation/coa-scorecard.mjs'), 'utf8');
    expect(src).toMatch(/FYA_TABLE = \{ \.\.\.LOGIC_VARS/);
    expect(src).not.toMatch(/placeholder_blend|median\(/);
  });
});
