// SPEC LINK: docs/specs/01-pipeline/133_bylaw_handbook.md m.326 (order of authority), m.308 (>5 % parcel flag), m.313 (curved front), m.333 (plan facts are not calculator input)
// SPEC LINK: decision log wf1/rulings-rec3@d8306917:docs/reports/decisions/2026-10-25-batch-g.json#CHAT-156.M326-EXAMINED-FALLBACK (amends CHAT-145 C for the scorer only)
// SPEC LINK: wf1/rulings-rec3@f84fd3ca:docs/reports/decisions/2026-10-26-batch-h.json#CHAT-163.M326-SITE-PLAN, #CHAT-165.HELD-UNREAD-DISCLOSED
// Hermetic lock for scripts/analysis/bylaw-validation/coa-lotfacts.mjs: no coa-data needed, runs in CI.
// Fixture values only. Plan-fact figures are the committed scripts/seeds/coa-notices/aic-values/coa-2026-{a,b,c}.json entries for the named files.
// lot_source is the CHAT-145 C classification and parcel figures are from the frozen parcels snapshot (both values-only, kept outside git).
// The T-7 lot_shape_note is a synthetic sentence (Spec 129 §3).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const FILE = path.join(process.cwd(), 'scripts/analysis/bylaw-validation/coa-lotfacts.mjs');
const load = (): Promise<Json> => import(pathToFileURL(FILE).href);

const F = {
  A0166: { pf: { lot_area_m2: 490.29, lot_frontage_m: 12.35, lot_depth_m: null, corner_lot: true, lot_source: { lot_area_m2: 'plan_statistics', lot_frontage_m: 'plan_statistics', corner_lot: 'site_plan' } },
    p: { frontage_m: 13.14, depth_m: 37.36, lot_size_sqm: 491.04, is_corner_lot: true } },
  A0118: { pf: { lot_area_m2: 566.38, lot_frontage_m: 15.24, lot_depth_m: 37.16, corner_lot: false, lot_source: { lot_area_m2: 'plan_statistics', lot_frontage_m: 'plan_statistics', lot_depth_m: 'plan_statistics', corner_lot: 'unknown' } },
    p: { frontage_m: 7.61, depth_m: 37.17, lot_size_sqm: 282.79, is_corner_lot: false } },
  A0375: { pf: { lot_area_m2: 237.88, lot_frontage_m: 6.1, lot_depth_m: 39.01, corner_lot: null, lot_source: { lot_area_m2: 'plan_statistics', lot_frontage_m: 'site_plan', lot_depth_m: 'site_plan' } },
    p: { frontage_m: 4.99, depth_m: 31.38, lot_size_sqm: 156.63, is_corner_lot: true } },
  A0562: { pf: { lot_area_m2: 303.64, lot_frontage_m: null, lot_depth_m: null, corner_lot: true, lot_source: { lot_area_m2: 'plan_statistics', corner_lot: 'unknown' } },
    p: { frontage_m: 10.91, depth_m: 27.89, lot_size_sqm: 304.19, is_corner_lot: false } },
  A0553: { pf: { lot_area_m2: 255.84, lot_frontage_m: 11.94, lot_depth_m: 21.05, corner_lot: null, lot_source: { lot_area_m2: 'plan_statistics', lot_frontage_m: 'plan_statistics', lot_depth_m: 'plan_statistics' } }, p: null },
  SYN: { pf: { lot_area_m2: 400, lot_frontage_m: 10, lot_depth_m: 40, corner_lot: false, lot_source: { lot_area_m2: 'survey', lot_frontage_m: 'survey', lot_depth_m: 'zoning_notice', corner_lot: 'decision_notice' } },
    p: { frontage_m: 10, depth_m: 40, lot_size_sqm: 400, is_corner_lot: false } },
  EDGE: { pf: { lot_area_m2: 0, lot_frontage_m: 10, lot_depth_m: null, corner_lot: true, lot_source: { lot_area_m2: 'plan_statistics', lot_frontage_m: 'plan_statistics', corner_lot: 'zoning_notice' } },
    p: { frontage_m: 10.5, depth_m: 30, lot_size_sqm: 300, is_corner_lot: false } }, // synthetic: frontage exactly +5.0 %, a zero area, a ranked corner that disagrees
  NOSRC: { pf: { lot_area_m2: 400, lot_frontage_m: 10, lot_depth_m: null, corner_lot: false, lot_source: { lot_frontage_m: 'survey' } }, p: { frontage_m: 10, depth_m: 40, lot_size_sqm: 400, is_corner_lot: false } }, // synthetic: no source recorded
  A0247: { pf: { lot_area_m2: 1305.9, lot_frontage_m: 14.6, lot_depth_m: 45.57, corner_lot: false, lot_shape_note: 'SYNTHETIC: the front lot line is a curved frontage',
    lot_source: { lot_area_m2: 'unknown', lot_frontage_m: 'decision_notice', lot_depth_m: 'unknown', corner_lot: 'unknown' } },
    p: { frontage_m: 27.84, depth_m: 46.96, lot_size_sqm: 1307.19, is_corner_lot: false } },
} satisfies Record<string, { pf: Json | null; p: Json | null }>;
const run = async (k: keyof typeof F) => { const M = await load(); const { pf, p } = F[k]; const sv = M.lotFigures(pf); return { M, sv, chk: M.lotCheck(sv, p), ls: M.lotSourceOf(sv, p) }; };
const NONE = { frontage_m: null, depth_m: null, area_m2: null, corner: null };

describe('coa-lotfacts: lot figures in M-326 order (CHAT-156)', () => {
  it('T-8 (M-308 edges, synthetic): exactly 5 % is not flagged (> not >=), a zero figure is not read, and the corner message names its source', async () => {
    const { sv, chk, ls } = await run('EDGE');
    expect([sv?.frontage_m, sv?.area_m2, sv?.corner]).toEqual([10, null, true]);
    expect(ls.area_m2).toBe('parcel');
    expect(chk.disagree).toEqual(['corner parcel false vs zoning_notice true']);
  });
  it('T-0′: the order is the ruled five-source literal (CHAT-163: site_plan after plan_statistics, before decision_notice), frozen', async () => {
    const M = await load();
    const O = [...M.LOT_SOURCE_ORDER];
    expect(O).toEqual(['survey', 'zoning_notice', 'plan_statistics', 'site_plan', 'decision_notice']);
    expect(O.indexOf('plan_statistics') < O.indexOf('site_plan') && O.indexOf('site_plan') < O.indexOf('decision_notice')).toBe(true);
    expect(Object.isFrozen(M.LOT_SOURCE_ORDER)).toBe(true);
  });
  it('T-SRC: the module is pure (no import, process, require or fs use)', () => {
    expect(fs.readFileSync(FILE, 'utf8')).not.toMatch(/^\s*import\b|\bprocess\b|\brequire\(|\bfs\./m);
  });
  it('T-1 A0166: the plan-statistics area is read (0.5 x 490.29 = 245.145, City 245.15); the site-plan corner is read (CHAT-163); disclosed exactly', async () => {
    const { M, sv, ls } = await run('A0166');
    expect(sv?.area_m2).toBe(490.29);
    expect(ls).toEqual({ frontage_m: 'plan_statistics', depth_m: 'parcel', area_m2: 'plan_statistics', corner: 'site_plan' });
    expect(M.lotDisclosure(ls)).toBe('lot figure not from a survey: frontage_m plan_statistics, area_m2 plan_statistics, corner site_plan');
  });
  it('T-2 A0118: plan-statistics figures are held and the M-308 flag names the source', async () => {
    const { chk } = await run('A0118');
    expect(chk.held?.frontage_m).toBe(15.24);
    expect(chk.flag).toBe(true);
    expect(chk.disagree).toEqual(['frontage parcel 7.61 vs plan_statistics 15.24 (-50.1%)', 'area parcel 282.79 vs plan_statistics 566.38 (-50.1%)']);
  });
  it('T-3′ A0375: site-plan frontage and depth are read (CHAT-163); with the area they are flagged and disclosed exactly', async () => {
    const { M, sv, chk, ls } = await run('A0375');
    expect([sv?.frontage_m, sv?.depth_m, sv?.area_m2]).toEqual([6.1, 39.01, 237.88]);
    expect(ls).toEqual({ frontage_m: 'site_plan', depth_m: 'site_plan', area_m2: 'plan_statistics', corner: 'parcel' });
    expect(M.lotDisclosure(ls)).toBe('lot figure not from a survey: frontage_m site_plan, depth_m site_plan, area_m2 plan_statistics');
    expect(chk.disagree).toEqual(['frontage parcel 4.99 vs site_plan 6.1 (-18.2%)', 'depth parcel 31.38 vs site_plan 39.01 (-19.6%)', 'area parcel 156.63 vs plan_statistics 237.88 (-34.2%)']);
  });
  it('T-4 A0562: the area is read (0.2 %, no flag); an unknown-source corner flag is not read (CHAT-164 round)', async () => {
    const { sv, chk, ls } = await run('A0562');
    expect(sv?.area_m2).toBe(303.64);
    expect(sv.corner).toBeNull();
    expect(ls.corner).toBe('parcel');
    expect(chk.flag).toBe(false);
  });
  it('T-5: a survey figure keeps precedence and is not disclosed; ranked non-survey figures are', async () => {
    const { M, ls } = await run('SYN');
    expect(ls).toEqual({ frontage_m: 'survey', depth_m: 'zoning_notice', area_m2: 'survey', corner: 'decision_notice' });
    expect(M.lotDisclosure(ls)).toBe('lot figure not from a survey: depth_m zoning_notice, corner decision_notice');
  });
  it('T-6: no parcel means no figure used (null sources, nothing disclosed); a parcel lacking a field is null, not parcel', async () => {
    const M = await load();
    expect(M.lotSourceOf(M.lotFigures(null), null)).toEqual(NONE);
    expect(M.lotDisclosure(NONE)).toBeNull();
    const { ls } = await run('A0553'); // plan facts held, no parcel (D7)
    expect([ls, M.lotDisclosure(ls)]).toEqual([NONE, null]);
    expect(M.lotSourceOf(null, { frontage_m: 9, depth_m: null, lot_size_sqm: 300, is_corner_lot: false })).toEqual({ frontage_m: 'parcel', depth_m: null, area_m2: 'parcel', corner: 'parcel' });
  });
  it('T-7 (CHAT-46 / M-313): a ranked frontage measured along a curved front is not read, and the curved front stays on the record', async () => {
    const { M, sv, ls } = await run('A0247');
    expect([sv?.curved_front, sv?.frontage_m]).toEqual([true, null]); // M-313 OBSERVABLE: curved_front recorded even when nothing else is held
    expect([M.lotCheck(sv, F.A0247.p).flag, M.surveyRead(sv), M.lotDisclosure(ls)]).toEqual([false, false, null]);
    expect(ls.frontage_m).toBe('parcel');
    expect(M.lotFigures({ ...F.A0247.pf, lot_shape_note: '' })?.frontage_m).toBe(14.6);
  });
  it('T-9 (CHAT-165): held-but-unread plan figures are named with their source, values only', async () => {
    const M = await load();
    expect(M.lotHeldUnread(F.A0562.pf, F.A0562.p)).toBe('lot figure held, not read: corner true (source unknown)');
    expect(M.lotHeldUnread(F.A0375.pf, F.A0375.p)).toBeNull(); // site plan now read
    expect(M.lotHeldUnread(F.EDGE.pf, F.EDGE.p)).toBeNull();
    expect(M.lotHeldUnread(F.NOSRC.pf, F.NOSRC.p)).toBe('lot figure held, not read: area_m2 400 (source not recorded), corner false (source not recorded)');
  });
  it('T-10 (CHAT-165 / M-313): a ranked frontage on a curved front is held, not read; an unranked one shows its source reason only', async () => {
    const M = await load();
    expect(M.lotHeldUnread(F.A0247.pf, F.A0247.p)).toBe('lot figure held, not read: frontage_m 14.6 (curved front), depth_m 45.57 (source unknown), area_m2 1305.9 (source unknown), corner false (source unknown)');
    expect(M.lotHeldUnread({ ...F.A0247.pf, lot_source: { ...F.A0247.pf.lot_source, lot_frontage_m: 'unknown' } }, F.A0247.p)).toBe('lot figure held, not read: frontage_m 14.6 (source unknown), depth_m 45.57 (source unknown), area_m2 1305.9 (source unknown), corner false (source unknown)');
  });
  it('T-11 (CHAT-165, no parcel): every held figure is shown with the reason no parcel; no plan facts, nothing shown', async () => {
    const M = await load();
    expect([M.lotHeldUnread(F.A0553.pf, null), M.lotHeldUnread(F.A0562.pf, null), M.lotHeldUnread(null, F.A0562.p)]).toEqual([
      'lot figure held, not read: frontage_m 11.94 (no parcel), depth_m 21.05 (no parcel), area_m2 255.84 (no parcel)',
      'lot figure held, not read: area_m2 303.64 (no parcel), corner true (no parcel)', null]);
  });
  it('T-12 (CHAT-165): the held predicate (positive number, boolean corner) and the values-only source token', async () => {
    const M = await load();
    const pp = { frontage_m: 10, depth_m: 40, lot_size_sqm: 400, is_corner_lot: false };
    expect(M.lotHeldUnread({ lot_area_m2: 0, lot_depth_m: -2, corner_lot: 'true', lot_source: { lot_area_m2: 'unknown', lot_depth_m: 'unknown', corner_lot: 'unknown' } }, pp)).toBeNull();
    expect(M.lotHeldUnread({ lot_area_m2: 100, lot_depth_m: 30, corner_lot: true, lot_source: { lot_area_m2: '', lot_depth_m: 'Some Text, 1', corner_lot: { a: 1 } } }, pp))
      .toBe('lot figure held, not read: depth_m 30 (source unrecognised), area_m2 100 (source not recorded), corner true (source unrecognised)');
  });
});
