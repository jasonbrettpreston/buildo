// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-247..M-258 (chat batch G, the CoA scorecard rulings);
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §6, §7.5; decision log
//            docs/reports/decisions/2026-10-21-chat-batch-g.json (CHAT-29)
//
// By-law fix lane 4 (wf1/bylaw-fix-4): the scorecard rulings the operator approved on 2026-10-21, each drafted from City of
// Toronto Committee of Adjustment examiner figures (lanes coa-scorecard-1 / coa-scorecard-hist). Every assertion reads the
// production path: the real-lot assembly (scripts/analysis/bylaw-validation/assembly.mjs — agreed units with the M-75
// corrections, generated fields, xref displacement links, exception authoring state per ruling (d)) and evaluate.mjs.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href);
const AS = await mod('scripts/analysis/bylaw-validation/assembly.mjs');
const AU = await mod('scripts/analysis/bylaw/authored.mjs');
const XR = await mod('scripts/analysis/bylaw/xref.mjs');
const { I, E, units, C } = await AS.loadRealLotAssembly(process.cwd());
const index = AU.buildIndex(I.slice);
const external = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/seeds/bylaw/external.json'), 'utf8'));
const byId = new Map<string, Json>(units.map((u: Json) => [u.unit_id, u]));
const unitOf = (id: string): Json => {
  const u = byId.get(id);
  if (!u) throw new Error(`no unit ${id}`);
  return u;
};
const page = (id: string): string => fs.readFileSync(path.join(process.cwd(), `scripts/seeds/bylaw/pages/${id}.txt`), 'utf8');
const disp = (id: string): string[] => XR.displacesOf(index, id, I.vocab, external).targets.map((t: Json) => t.id);

// a lot as Layer 3 would hand it over: site facts not holding (M-169), design choices set explicitly per test
const lot = (zone: string, buildingType: string, extra: Json = {}): Json => ({
  zone, label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: buildingType, exception: null,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, major_street: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false, ...(extra.flags ?? {}) },
  vars: { lot_frontage_m: 12, lot_depth_m: 40, lot_area_m2: 480, proposed_height_m: 4, distance_to_residential_m: 5, ...(extra.vars ?? {}) },
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'flags' && k !== 'vars')),
});
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);
void unitOf; void page;

// F-SC-3 / M-248 (operator approved 2026-10-21, `2026-10-21-chat-batch-g#CHAT-29.F-SC-3`): "Despite regulations
// 10.80.40.70(1) to (3) above" displaces (1), (2) and (3), not the two endpoints only.
describe('F-SC-3 / M-248 — a dotted range "X(1) to (n)" displaces every regulation in the range', () => {
  it('the by-law text carries the dotted ranges (ch10_80.txt, ch10_20.txt)', () => {
    expect(page('ch10_80')).toContain('Despite regulations 10.80.40.70(1) to (3) above');
    expect(page('ch10_20')).toContain('Despite regulations 10.20.40.70(1) to (6) above');
  });

  it('RM 10.80.40.70(4) displaces (1), (2) and (3); RD 10.20.40.70(7) displaces (1) to (6)', () => {
    for (const k of ['A', 'B', 'C', 'D']) expect(disp(`10.80.40.70(4)#(4)(${k})`), k).toEqual(expect.arrayContaining(['10.80.40.70(1)', '10.80.40.70(2)', '10.80.40.70(3)']));
    expect(disp('10.20.40.70(7)#(7)(D)')).toEqual(expect.arrayContaining(['10.20.40.70(1)', '10.20.40.70(2)', '10.20.40.70(3)', '10.20.40.70(4)', '10.20.40.70(5)', '10.20.40.70(6)']));
  });

  it('1785 Keele St (RM, major street, apartment, depth 30.44 m): rear yard 7.5 m from (4)(B), not 25 % of depth from (2)(B)', () => {
    const r = eff(lot('RM', 'apartment_building', { label: {}, flags: { major_street: true }, vars: { lot_depth_m: 30.44, lot_frontage_m: 30 } }), 'rear_setback_m');
    expect([r.status, r.value, r.winner]).toEqual(['value', 7.5, '10.80.40.70(4)#(4)(B)']);
  });
});
