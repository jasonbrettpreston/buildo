// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-314 (CHAT-49: the M-267 / F-SC-7 unit_application pattern for the
//            side-yard units of newly keyed exceptions 117, 199, 245, 256, 258, 287, 155 (E) and 340 (C)), M-267, M-251;
//            operator ruling 2026-10-21-batch-o#CHAT-49 ("1-4 y")
//
// A side-yard unit whose own text names no building type ("The minimum building setback from a side lot line is 0.9 metres")
// binds the principal building. A garden suite or laneway suite takes its own chapter rule (150.7 / 150.8), as M-267 ruled for
// 155 (D) and 340 (B). Units that name a building type (245 (F) and RS 256 (G): a garage) are not touched.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href);
const AS = await mod('scripts/analysis/bylaw-validation/assembly.mjs');
const { I, E, units, C } = await AS.loadRealLotAssembly(process.cwd());
const DEFAULTS: Json = {};
for (const [k, v] of Object.entries((I.vocab.design_choice_disclosure || {}).default_overrides || {})) if (k !== '$comment' && v && typeof (v as Json).taken_as === 'boolean') DEFAULTS[k] = (v as Json).taken_as;

// the units CHAT-49 names, listed by id (text read from the clause slice; none names a building type)
export const CHAT49_UNITS = [
  '900.3.10(117)#(117)[SSP](B)', '900.3.10(117)#(117)[SSP](C)',
  '900.3.10(199)#(199)[SSP](B)', '900.3.10(199)#(199)[SSP](C)',
  '900.3.10(245)#(245)[SSP](D)', '900.3.10(245)#(245)[SSP](E)',
  '900.3.10(256)#(256)[SSP](A)', '900.3.10(256)#(256)[SSP](B)', '900.4.10(256)#(256)[SSP](E)',
  '900.3.10(258)#(258)[SSP](A)', '900.3.10(258)#(258)[SSP](B)',
  '900.3.10(287)#(287)[SSP](C)', '900.3.10(287)#(287)[SSP](D)',
  '900.3.10(155)#(155)[SSP](E)', '900.3.10(340)#(340)[SSP](C)',
];
const EXCLUDED = ['ancillary_building', 'garden_suite', 'laneway_suite'];

const lotOf = (zone: string, exc: number, buildingType: string): Json => ({
  zone, zone_label: `${zone} (f15.0; a557) (x${exc})`, label: { f: 15, a: 557 }, overlays: {}, map_areas: [], building_type: buildingType,
  exception: `900.${zone === 'RS' ? 4 : 3}.10(${exc})`,
  vars: { lot_frontage_m: 15.23, lot_depth_m: 38.08, lot_area_m2: 580.13, dwelling_units: 1 },
  flags: { ...DEFAULTS, corner_lot: false, through_lot: false, major_street: false, abuts_lane: false, lawfully_existing: false },
});
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);

describe('CHAT-49 — newly keyed type-less side-yard units bind the principal building, not a garden or laneway suite', () => {
  it('every listed unit exists in the assembly and carries a unit_application entry citing M-314', () => {
    const ids = new Set(units.map((u: Json) => u.unit_id));
    for (const id of CHAT49_UNITS) {
      expect([id, ids.has(id)]).toEqual([id, true]);
      expect([id, I.vocab.unit_application[id]?.excluded_building_types, I.vocab.unit_application[id]?.ruling]).toEqual([id, EXCLUDED, 'M-314']);
    }
  });

  it('units that name a building type (a garage) are left alone', () => {
    for (const id of ['900.3.10(245)#(245)[SSP](F)', '900.4.10(256)#(256)[SSP](G)', '900.3.10(117)#(117)[SSP](D)']) expect([id, I.vocab.unit_application[id]]).toEqual([id, undefined]);
  });

  // 117, 199, 258 and 287 each still hold one pending unit (verify-27 A5), so those exceptions answer no lot yet; the behavioural proof uses 245 and 256 (authored)
  it('a garden suite on a lot under exception 245 takes the suite side rule, not the exception 1.2 m; the house keeps 1.2 m', () => {
    const suite = eff(lotOf('RD', 245, 'garden_suite'), 'side_setback_m');
    expect(suite.winner).not.toBe('900.3.10(245)#(245)[SSP](D)');
    const house = eff(lotOf('RD', 245, 'detached_house'), 'side_setback_m');
    expect([house.status, house.value, house.winner]).toEqual(['value', 1.2, '900.3.10(245)#(245)[SSP](D)']);
  });
  it('a laneway suite on a lot under RS exception 256 does not take the exception 1.2 m side yard', () => {
    const suite = eff(lotOf('RS', 256, 'laneway_suite'), 'side_setback_m');
    expect(suite.winner).not.toBe('900.4.10(256)#(256)[SSP](E)');
  });
});
