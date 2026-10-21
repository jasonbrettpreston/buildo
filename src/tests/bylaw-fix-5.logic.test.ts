// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-259 (chat batch H, CHAT-33; amends the M-205(2) dated note),
//            M-205(2), M-197, M-172, M-254; docs/specs/01-pipeline/68_mcbylaw_standard.md §6, §7.5; decision log
//            docs/reports/decisions/2026-10-21-chat-batch-h.json (CHAT-33)
//
// By-law fix lane 5 (wf1/bylaw-fix-5): F-SC-5, the 0.45 m blank-wall side-yard reduction of 10.10.40.70(4), which the
// operator approved on 2026-10-21 ("1-5 y ensure."). Every assertion reads the production path: the real-lot assembly
// (scripts/analysis/bylaw-validation/assembly.mjs — agreed units with the M-75 corrections, generated fields, xref
// displacement links) and evaluate.mjs, and the committed golden cases.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href);
const AS = await mod('scripts/analysis/bylaw-validation/assembly.mjs');
const { I, E, units, C } = await AS.loadRealLotAssembly(process.cwd());
const byId = new Map<string, Json>(units.map((u: Json) => [u.unit_id, u]));
const unitOf = (id: string): Json => {
  const u = byId.get(id);
  if (!u) throw new Error(`no unit ${id}`);
  return u;
};
const page = (id: string): string => fs.readFileSync(path.join(process.cwd(), `scripts/seeds/bylaw/pages/${id}.txt`), 'utf8');
const tokensOf = (c: unknown): string[] => (c && typeof c === 'object' && Array.isArray((c as Json).tokens) ? (c as Json).tokens : []);

// a lot as Layer 3 would hand it over: site facts not holding (M-169); the design choice set per test
const lot = (buildingType: string, flags: Json = {}): Json => ({
  zone: 'R', label: { d: 0.6 }, overlays: {}, map_areas: [], building_type: buildingType, exception: null,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, major_street: false, front_averaging_not_applicable: true, abuts_lane: false,
    suite_wall_openings: false, flat_or_shallow_roof: false, all_units_front_street: true, ...flags },
  vars: { lot_frontage_m: 7.5, lot_depth_m: 30, lot_area_m2: 225, proposed_height_m: 4, dwelling_units: 1 },
});
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);
const LEAD_IN = 'may be reduced to 0.45 metres if there are no windows or doors in that side of the building, for the following residential building types in the R zone';
const KEYED = ['A', 'B', 'C', 'D', 'E', 'G'].map((k) => `10.10.40.70(4)#(4)(${k})`);

// F-SC-5 / M-259 (operator approved 2026-10-21, `2026-10-21-chat-batch-h#CHAT-33`): 10.10.40.70(4) holds only "if there
// are no windows or doors in that side of the building" — a design choice (M-172), taken as met by default (M-205(2)),
// so a design with openings answers (3)'s 0.9 m, and a platform, which has no side wall, never takes the reduction.
describe('F-SC-5 / M-259 — the 0.45 m blank-wall reduction holds only for a side without windows or doors (blank_side_wall)', () => {
  it('the text puts the condition in the lead-in of every item (ch10_10.txt); no parallel chapter has the reduction', () => {
    expect(page('ch10_10')).toContain(LEAD_IN);
    for (const ch of ['ch10_20', 'ch10_40', 'ch10_60', 'ch10_80']) expect([ch, /windows or doors in that side/.test(page(ch))]).toEqual([ch, false]);
  });

  it('vocab declares blank_side_wall: a user-input design choice licensed by the text, taken as met by default (M-205(2))', () => {
    const v = I.vocab;
    expect(v.lot_condition.blank_side_wall).toEqual({ user_input: 'blank_side_wall', patterns: ['no windows or doors in that side'] });
    expect(v.user_input).toContain('blank_side_wall');
    const dc = v.design_choice_disclosure;
    expect(typeof dc.lot_condition.blank_side_wall).toBe('string');
    expect(typeof dc.user_input.blank_side_wall).toBe('string');
    expect(dc.default_overrides.blank_side_wall.taken_as).toBe(true);
    expect(dc.default_overrides.blank_side_wall.why).toContain('M-205(2)');
  });

  it('every keyed unit of 10.10.40.70(4) carries the token in its condition and application, with the lead-in phrase as evidence', () => {
    for (const id of KEYED) {
      const u = unitOf(id);
      expect([id, tokensOf(u.condition).includes('blank_side_wall'), (u.application.lot_conditions || []).includes('blank_side_wall')]).toEqual([id, true, true]);
      expect([id, u.application.evidence.blank_side_wall]).toEqual([id, 'if there are no windows or doors in that side of the building']);
    }
    // the tokens they carried before stay (C: all units front a street; G: the 13.0 m height band)
    expect(tokensOf(unitOf('10.10.40.70(4)#(4)(C)').condition)).toContain('all_units_front_street');
    expect(unitOf('10.10.40.70(4)#(4)(G)').condition).toMatchObject({ if: 'proposed_height_m ≤ 13.0 m' });
  });

  it('taken as met (the M-205(2) default), the R side yard is the 0.45 m reduction', () => {
    expect(eff(lot('detached_house', { blank_side_wall: true }), 'side_setback_m')).toMatchObject({ status: 'value', value: 0.45, winner: '10.10.40.70(4)#(4)(A)' });
    expect(eff(lot('semi_detached_house', { blank_side_wall: true }), 'side_setback_m')).toMatchObject({ status: 'value', value: 0.45, winner: '10.10.40.70(4)#(4)(B)' });
  });

  it('with windows or doors in that side (blank_side_wall false) the side yard is the (3)(A) 0.9 m', () => {
    for (const bt of ['detached_house', 'semi_detached_house', 'detached_houseplex', 'semi_detached_houseplex']) {
      const r = eff(lot(bt, { blank_side_wall: false }), 'side_setback_m');
      expect([bt, r.status, r.value, r.winner]).toEqual([bt, 'value', 0.9, '10.10.40.70(3)#(3)(A)']);
    }
  });

  it('with the design not given the answer asks for it (needs_user_input), never an assumed 0.45 m', () => {
    const r = eff(lot('detached_house'), 'side_setback_m');
    expect([r.status, r.reason]).toEqual(['not_evaluated', 'needs_user_input:blank_side_wall']);
  });

  it('a platform has no side wall: its side setback and clearance are the unreduced side yard, 0.9 m, while the house keeps 0.45 m', () => {
    const l = lot('detached_house', { blank_side_wall: true });
    expect(eff(l, 'platform_side_setback_m')).toMatchObject({ status: 'value', value: 0.9, winner: '10.5.40.50(2)#whole' });
    expect(eff(l, 'platform_clearance_m')).toMatchObject({ status: 'value', value: 0.9 });
    expect(eff(l, 'side_setback_m')).toMatchObject({ status: 'value', value: 0.45, winner: '10.10.40.70(4)#(4)(A)' });
    expect(I.vocab.accessory_structure_use.deck_or_platform.reference_flags).toEqual({ blank_side_wall: false });
  });

  it('golden COA-F-02 (453 Durie St A0594/26TEY, 474 Beresford Ave A0510/26TEY): the City 0.9 m is answered once the scenario says the wall has openings', () => {
    const cases = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/tests/fixtures/bylaw-golden-lots/cases.json'), 'utf8')).cases as Json[];
    const side = cases.filter((c) => c.coa && c.checks.some((k: Json) => k.unit === '10.10.40.70(3)#(3)(A)' && k.target === 'side_setback_m'));
    expect(side.map((c) => [c.coa, c.address]).sort()).toEqual([['A0510/26TEY', '474 Beresford Ave'], ['A0594/26TEY', '453 Durie St']]);
    for (const c of side) {
      expect([c.coa, c.class, c.finding]).toEqual([c.coa, 'PROVEN', null]);
      for (const k of c.checks) expect([c.coa, k.scenario.flags?.blank_side_wall, k.initial.pass, k.initial.observed.value]).toEqual([c.coa, false, true, 0.9]);
    }
    expect(cases.some((c) => c.finding === 'COA-F-02')).toBe(false);
  });
});
