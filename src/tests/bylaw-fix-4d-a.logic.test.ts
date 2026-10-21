// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-265..M-279 (fix round 4D lane A: M-265 INCLUDE link, M-266 keeps-limit wording, M-267 suite scope, M-268.. authored exceptions; operator rulings of
//            2026-10-21, decision log docs/reports/decisions/2026-10-21-page-4d-a.json, CHAT-38.F-4D-2 / -18 / -6 / -SC-*),
//            M-251 (unit_application), M-248, M-180; docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (include_ref is G),
//            §7.5 rules 1, 2, 4a, ruling (d)
//
// Fix round 4D, lane A (exceptions and precedence). Every assertion reads the production path: the real-lot assembly
// (scripts/analysis/bylaw-validation/assembly.mjs: agreed units with the M-75 corrections, generated fields, xref links)
// and evaluate.mjs. Lot facts are values only (label, frontage, depth, area, corner / lane flags) from the CoA notice lots.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href);
const AS = await mod('scripts/analysis/bylaw-validation/assembly.mjs');
const { I, E, units, C } = await AS.loadRealLotAssembly(process.cwd());
const byId = new Map<string, Json>(units.map((u: Json) => [u.unit_id, u]));
const DEFAULTS: Json = {};
for (const [k, v] of Object.entries((I.vocab.design_choice_disclosure || {}).default_overrides || {})) if (k !== '$comment' && v && typeof (v as Json).taken_as === 'boolean') DEFAULTS[k] = (v as Json).taken_as;
const EXC_CH: Record<string, number> = { R: 2, RD: 3, RS: 4, RT: 5, RM: 6 };

// a CoA notice lot as the scorecard builds it (coa-scorecard.mjs lotFromParcel + makeLot)
interface Facts { label: string; zone: string; fr: number; d: number; a: number; corner?: boolean; lane?: boolean }
const lotOf = (f: Facts, buildingType = 'detached_house', dwellingUnits = 1, flags: Json = {}): Json => {
  const label: Json = {};
  const m = /\(([^)]*)\)/.exec(f.label);
  if (m && m[1]) for (const part of m[1].split(';')) { const p = /^\s*([a-wyz][a-z]?)\s*([\d.]+)\s*$/.exec(part); if (p && p[1]) label[p[1]] = Number(p[2]); }
  const x = /\(x(\d+)\)/.exec(f.label);
  return { zone: f.zone, zone_label: f.label, label, overlays: {}, map_areas: [], building_type: buildingType, exception: x ? `900.${EXC_CH[f.zone] ?? 0}.10(${x[1]})` : null,
    vars: { lot_frontage_m: f.fr, lot_depth_m: f.d, lot_area_m2: f.a, dwelling_units: dwellingUnits },
    flags: { ...DEFAULTS, corner_lot: Boolean(f.corner), through_lot: false, major_street: false, abuts_lane: Boolean(f.lane), lawfully_existing: false, ...flags } };
};
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);

const A0062 = { label: 'RD (f9.0; a325) (x156)', zone: 'RD', fr: 9.15, d: 36.52, a: 334.09 };
const A0094 = { label: 'RD (f10.5) (x252)', zone: 'RD', fr: 22.39, d: 22.73, a: 508.97 };
const A0136 = { label: 'RS (f12.0) (x61)', zone: 'RS', fr: 6.57, d: 32.15, a: 211.29 };
const A0166 = { label: 'RD (f13.5; a510; d0.45) (x21)', zone: 'RD', fr: 13.14, d: 37.36, a: 491.04, corner: true };
const A0067 = { label: 'RD (f15.0; a557) (x155)', zone: 'RD', fr: 15.23, d: 38.08, a: 580.13 };
const A0079 = { label: 'RD (f12.0; a464) (x340)', zone: 'RD', fr: 16.8, d: 55.66, a: 934.95 };

// F-4D-2 / F-4D-18 / F-4D-SC-1462: the lots sit under an exception that "must comply with" exception 1462 / 336, and the
// include link of an INCLUDE unit was never generated, so the 1462 / 336 tiers never reached the lot and the base-zone
// "not limited by this regulation" (10.20.40.40(1)(B)) was the only floor-space unit. Spec 68 §6: include_ref is G.
describe('F-4D-2 / F-4D-18 / F-4D-SC-1462 — an INCLUDE to a Ch.900 exception links the exception, so its numeric floor space outranks the base "no limit"', () => {
  it('the assembly generates include_ref on an INCLUDE unit that names a Ch.900 exception row (252, 155, 156 all chain to 1462)', () => {
    for (const id of ['900.3.10(252)#(252)[SSP](C)', '900.3.10(155)#(155)[SSP](F)']) expect([id, byId.get(id)?.include_ref]).toEqual([id, '900.3.10(1462)']);
    const chain = units.filter((u: Json) => u.archetype === 'INCLUDE' && u.include_ref);
    expect(chain.length).toBeGreaterThan(10);
    for (const u of chain) expect([u.unit_id, /^900\.[2-6]\.10\(\d+\)$/.test(u.include_ref)]).toEqual([u.unit_id, true]);
  });

  it('the loader pulls the 1462 tiers onto an exception 252 lot (A0094/26SC)', () => {
    const l = lotOf(A0094);
    const ids = E.loadCandidates(l, units).candidates.map((u: Json) => u.unit_id);
    for (const t of ['(i)', '(ii)', '(iii)']) expect(ids).toContain(`900.3.10(1462)#(1462)[SSP](A)${t}`);
  });

  it('A0094/26SC 3 Parkview Hts: floor space is the 1462 (A)(ii) tier, 0.5 (the City 0.5), not "unlimited"', () => {
    expect(eff(lotOf(A0094), 'fsi')).toMatchObject({ status: 'value', value: 0.5, winner: '900.3.10(1462)#(1462)[SSP](A)(ii)' });
  });

  it('A0062/25SC (exception 156, a detached houseplex with a secondary suite): the 1462 (A)(i) 0.6 answers (the City 0.6), the base DISAPPLY no longer leaves it blank', () => {
    expect(eff(lotOf(A0062, 'detached_houseplex', 2), 'fsi')).toMatchObject({ status: 'value', value: 0.6, winner: '900.3.10(1462)#(1462)[SSP](A)(i)' });
  });

  it('A0136/26SC (RS exception 61 chains to RS 336): floor space 0.6 (the City 0.6), not "unlimited"', () => {
    expect(eff(lotOf(A0136), 'fsi')).toMatchObject({ status: 'value', value: 0.6 });
  });

  it('one precedence rule: on a lot with no "d" label, the exception tier (a finite maximum) wins over the base "unlimited", at each tier', () => {
    const base = { label: 'RD (f10.5) (x1462)', zone: 'RD', fr: 15, d: 30 };
    const cases: Array<[number, number]> = [[300, 0.6], [500, 0.5], [800, 0.4]]; // lot area -> tier ratio; (i) lesser of 0.6 or 204 m2 is 0.6 at 300 m2 (204/300 = 0.68)
    for (const [area, want] of cases) {
      const r = eff(lotOf({ ...base, a: area }), 'fsi');
      expect([area, r.status, r.value]).toEqual([area, 'value', want]);
    }
    expect(eff(lotOf({ ...base, a: 300 }), 'fsi').winner).toMatch(/^900\.3\.10\(1462\)/);
  });
});

// F-4D-6: RD 21 (B) "Despite regulation 10.20.40.30 (1), the maximum building depth permitted by that regulation includes the
// one storey extension permitted by 10.20.40.20 (2)" restates the 19 m depth rule with a measuring convention. The limit stays.
describe('F-4D-6 — exception RD 21 (B) keeps the 19 m building depth of 10.20.40.30(1) and discloses the extension convention', () => {
  it('(B) is a keep-the-limit variation of 10.20.40.30(1), not a displacement of it; RD 18 (D) and RD 37 (B) carry the same wording (rule by family)', () => {
    for (const id of ['900.3.10(21)#(21)[SSP](B)', '900.3.10(37)#(37)[SSP](B)', '900.3.10(18)#(18)[SSP](D)']) {
      const b = byId.get(id) as Json;
      expect([id, b.displaces, b.displaces_optional]).toEqual([id, ['10.20.40.30(1)'], true]);
    }
  });

  it('A0166/26EYK: building depth answers 19 m (the City 19 m) with the extension disclosure attached', () => {
    const r = eff(lotOf(A0166), 'building_depth_m');
    expect(r).toMatchObject({ status: 'value', value: 19, winner: '10.20.40.30(1)#whole' });
    expect(r.disclosures.join(' ')).toContain('one-storey rear extension counts toward the maximum building depth');
  });

  it('the vocab names the wording that keeps the limit (data, easy to alter), and no "Despite ... permitted by that regulation" unit displaces silently', () => {
    expect(I.vocab.displacement_triggers.keeps_limit_phrases).toContain('permitted by that regulation');
  });
});

// F-4D-SC-155 / F-4D-SC-340: the exception side-yard figure binds the principal building (the F-SC-7 pattern, M-251).
describe('F-4D-SC-155 / F-4D-SC-340 — the exception side yard 0.9 m binds the residential building, not the garden suite', () => {
  it('unit_application sets 155 (D) and 340 (B) aside for ancillary building / garden suite / laneway suite', () => {
    for (const id of ['900.3.10(155)#(155)[SSP](D)', '900.3.10(340)#(340)[SSP](B)']) {
      expect([id, I.vocab.unit_application[id]?.excluded_building_types]).toEqual([id, ['ancillary_building', 'garden_suite', 'laneway_suite']]);
    }
  });

  it('A0067/26SC (x155) garden suite takes the suite rule 150.7.60.20(5)(B), 1.524 m (the City 1.524); the house keeps 0.9 m', () => {
    const suite = eff(lotOf(A0067, 'garden_suite'), 'side_setback_m');
    expect([suite.status, suite.winner]).toEqual(['value', '150.7.60.20(5)#(5)(B)']);
    expect(suite.value).toBeCloseTo(1.524, 2); // 10 % of the 15.23 m frontage; the examiner's 1.524 m uses the surveyed frontage
    expect(eff(lotOf(A0067, 'detached_house', 1, { blank_side_wall: true }), 'side_setback_m')).toMatchObject({ status: 'value', value: 0.9 });
  });

  it('A0079/26SC (x340) garden suite takes the suite rule, 1.68 m (the City 1.68)', () => {
    const suite = eff(lotOf(A0079, 'garden_suite'), 'side_setback_m');
    expect([suite.status, suite.value, suite.winner]).toEqual(['value', 1.68, '150.7.60.20(5)#(5)(B)']);
  });
});

// F-4D-10 / F-4D-16 / F-4D-SC-245 / F-4D-SC-256: exceptions keyed through the double-keying harness (keyer A a fresh Claude seat,
// keyer B the DeepSeek engine, blind): batch W2 shards s04 s14 s15 s28 s37 s53 and the new W2X supplement (the named
// exceptions below the census floor). An exception is authored when every unit is agreed or adjudicated (ruling (d)); the units
// the two keyers disagree on stay pending for the operator (queue drafted in ~/Buildo-scratch/fix-round-4d/a/notes).
describe('F-4D-10 / F-4D-16 / F-4D-SC-245 / F-4D-SC-256 — exceptions 1389, 528, 245 and 256 are authored; the lots answer from them', () => {
  const lone = (reg: string): Json[] => units.filter((u: Json) => String(u.unit_id).startsWith(`${reg}#`));
  it('each carries its numeric units as keyed from the clause text', () => {
    const val = (id: string): unknown => (byId.get(id) as Json | undefined)?.numeric_expression;
    expect(val('900.3.10(245)#(245)[SSP](C)')).toEqual(['lot_coverage_pct = 40 pct @(245)[SSP](C)']);
    expect(val('900.3.10(245)#(245)[SSP](D)')).toEqual(['side_setback_m = 1.2 m @(245)[SSP](D)']);
    expect(val('900.3.10(245)#(245)[SSP](F)')).toEqual(['side_setback_m = 0.3 m @(245)[SSP](F)']);
    expect(val('900.3.10(256)#(256)[SSP](A)')).toEqual(['side_setback_m = 1.2 m @(256)[SSP](A)']);
    expect(val('900.3.10(528)#(528)[SSP](C)')).toEqual(['front_setback_m = 3.0 m @(528)[SSP](C)']);
    expect(val('900.3.10(528)#(528)[SSP](D)')).toEqual(['side_setback_m = 1.0 m @(528)[SSP](D)']);
    expect(lone('900.3.10(1389)').map((u) => u.unit_id)).toEqual(['900.3.10(1389)#(1389)[PBS](A)', '900.3.10(1389)#(1389)[SSP](A)']);
  });

  it('199 and 256 chain to 1462 through their INCLUDE unit (M-265)', () => {
    for (const reg of ['900.3.10(256)#(256)[SSP](C)', '900.3.10(199)#(199)[SSP](D)']) expect([reg, byId.get(reg)?.include_ref]).toEqual([reg, '900.3.10(1462)']);
  });

  it('528 (A) and (B) carry no lawfully_existing condition, as the 137 other "existed on the day of the enactment" units (M-75 correction)', () => {
    for (const k of ['A', 'B']) expect((byId.get(`900.3.10(528)#(528)[SSP](${k})`) as Json).condition).toBe('none');
  });

  it('the lots answer: A0484/26TEY (x1389) length 17 m and floor space 0.35; A0138/26SC (x528) is no longer blocked by the exception gate; A0103/26SC (x256) eaves 0.9 m', () => {
    const l1389 = lotOf({ label: 'RD (f12.0; d0.35) (x1389)', zone: 'RD', fr: 18.3, d: 43.36, a: 793.55 });
    expect(eff(l1389, 'building_length_m')).toMatchObject({ status: 'value', value: 17 });
    expect(eff(l1389, 'fsi')).toMatchObject({ status: 'value', value: 0.35 });
    const l528 = lotOf({ label: 'RD (x528)', zone: 'RD', fr: 10.12, d: 37.35, a: 377.78 });
    for (const t of ['building_length_m', 'building_depth_m', 'rear_setback_m', 'lot_coverage_pct']) expect([t, String(eff(l528, t).reason)]).not.toEqual([t, 'exception_not_authored:900.3.10(528)']);
    expect(eff(lotOf({ label: 'RD (f15.0) (x256)', zone: 'RD', fr: 9.15, d: 39.57, a: 362.09, lane: true }), 'eaves_encroachment_m')).toMatchObject({ status: 'value', value: 0.9 });
  });

  it('the W2X supplement is planned and seeded: 1434, 117, 258, 528 (below the W2 floor), keys .w2x-sNN so a later W2 never collides', async () => {
    const K = await mod('scripts/analysis/bylaw/keying.mjs');
    expect(K.W2X_MEMBERS).toEqual(['900.3.10(1434)', '900.3.10(117)', '900.3.10(258)', '900.3.10(528)']);
    const seed = JSON.parse((await import('node:fs')).readFileSync(path.join(process.cwd(), 'scripts/seeds/bylaw/w2x-shards.json'), 'utf8'));
    expect(seed.batch).toBe('W2X');
    expect(seed.shards.every((s: Json) => /\.w2x-s\d\d$/.test(s.key))).toBe(true);
    expect(seed.members.map((m: Json) => m.regulation_id).sort()).toEqual([...K.W2X_MEMBERS].sort());
  });
});
