// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-218 (D1 class: a flat-roof clause keyed without its roof
//            condition), M-400 / M-465 (the roof form is a design option), M-75 (operator corrections); the operator answers
//            D-RK a, F-1 a and F-2 a of 2026-11-03 (~/Buildo-scratch/mcbylaws/inc2/open-questions.md); Spec 68 §6 (conditions)
//
// MB-27.L2 (1:4) — red first. The RD exceptions whose clause reads "If a detached house has a roof with a slope of less than
// 1.0 vertical units for every 4.0 horizontal units, for more than 50% of the total horizontal roof area" carry the
// flat_or_shallow_roof condition: 69(C), 975(C) (storey condition kept), 971(B) (its "if 3 storeys is permitted" keyed, F-1 a),
// 893(F), and 70(C) keyed as a 9.5 m height limit in the 69(C) form (F-2 a). Production path, as bylaw-evaluator-fixes:
// validate.mjs inputs -> agree.mjs agreed units with the M-75 corrections -> withGeneratedFields + displacesOf -> evaluate.mjs.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href);
const V = await mod('scripts/analysis/bylaw/validate.mjs');
const AU = await mod('scripts/analysis/bylaw/authored.mjs');
const AG = await mod('scripts/analysis/bylaw/agree.mjs');
const XR = await mod('scripts/analysis/bylaw/xref.mjs');
const E = await mod('scripts/analysis/bylaw/evaluate.mjs');
const VO = await mod('scripts/analysis/bylaw/vocab.mjs');
const I = V.loadInputs({ root: process.cwd() });
const ag = AG.checkAgree({ shards: AU.loadAuthored(process.cwd()), adjudications: I.adjudications, vocab: I.vocab });
const index = AU.buildIndex(I.slice);
const units: Json[] = [...AG.agreedUnits(ag).values()]
  .map((u: Json): Json => AU.withGeneratedFields(u))
  .map((u: Json) => { const d = XR.displacesOf(index, u.unit_id, I.vocab, null); return { ...u, displaces: d.targets.map((t: Json) => t.id), displaces_optional: d.optional_variation }; });
const C = E.makeContext(VO.evaluatorVocab(I.vocab), { absences: I.absences });
// effective() runs on the production assembly (the one bylaw-layer2-input.json is generated from), whose context carries the
// G-AGREE authored map: without it the lot gate (ruling (d)) answers exception_not_authored before any unit is read
const RA = await (await mod('scripts/analysis/bylaw-validation/assembly.mjs')).loadRealLotAssembly(process.cwd());
const unitOf = (id: string): Json => { const u = units.find((x: Json) => x.unit_id === id); if (!u) throw new Error(`no unit ${id}`); return u; };

const TOKEN = 'flat_or_shallow_roof';
const PHRASE = 'slope of less than 1.0 vertical units for every 4.0 horizontal units';
const U69 = '900.3.10(69)#(69)[SSP](C)';
const U70 = '900.3.10(70)#(70)[SSP](C)';
const U893 = '900.3.10(893)#(893)[SSP](F)';
const U971 = '900.3.10(971)#(971)[SSP](B)';
const U975 = '900.3.10(975)#(975)[SSP](C)';
const REKEYED = [U69, U70, U893, U971, U975];
const WITH_STOREYS = [U69, U70, U971, U975];

const lot = (exception: string, flag: boolean | undefined, extra: Json = {}): Json => {
  const flags: Json = { lawfully_existing: false, corner_lot: false, through_lot: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false };
  if (flag !== undefined) flags[TOKEN] = flag;
  return { zone: 'RD', exception, label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: 'detached_house', flags,
    vars: { lot_frontage_m: 12, lot_depth_m: 40, proposed_height_m: 4, distance_to_residential_m: 5, main_building_gfa_m2: 500 }, ...extra };
};
const eff = (l: Json, t: string): Json => RA.E.effective(l, t, RA.E.loadCandidates(l, RA.units).candidates, RA.C);

describe('MB-27.L2 (1:4) — G-AGREE holds with the new corrections', () => {
  it('K0 no agreement violation (every correction names a unit and a field the keyers carry)', () => {
    expect(ag.violations).toEqual([]);
  });
});

describe('MB-27.L2 (1:4) — the keying (D-RK a, F-1 a, F-2 a)', () => {
  it('K1 each re-keyed 1:4 unit carries the flat_or_shallow_roof condition', () => {
    for (const id of REKEYED) expect([id, unitOf(id).condition.tokens]).toEqual([id, expect.arrayContaining([TOKEN])]);
  });
  it('K1b the storey condition is kept on 69(C), 975(C) and keyed on 971(B) and 70(C) (F-1 a, F-2 a)', () => {
    for (const id of WITH_STOREYS) {
      const c = unitOf(id).condition;
      expect([id, c.tokens.includes('storey_count_band'), c.if]).toEqual([id, true, 'height_storeys ≥ 3 storeys']);
    }
    expect(unitOf(U893).condition.tokens).toEqual([TOKEN]);
  });
  it('K2 the evidence quotes the 1:4 words, and those words are in the clause text', () => {
    const md = fs.readFileSync(path.join(process.cwd(), 'docs/reference/bylaw-provisions.md'), 'utf8');
    for (const id of REKEYED) {
      const u = unitOf(id);
      expect([id, u.application.evidence[TOKEN]]).toEqual([id, PHRASE]);
      expect(u.application.lot_conditions).toContain(TOKEN);
      const n = id.match(/^900\.3\.10\((\d+)\)/)![1];
      const row = md.split('\n').find((l) => l.startsWith(`| 900.3.10(${n}) |`))!;
      expect([id, row.includes(PHRASE)]).toEqual([id, true]);
    }
  });
  it('K3 the token licence holds both slope wordings', () => {
    expect(I.vocab.lot_condition[TOKEN].patterns).toEqual(['slope of less than 1.0 vertical units for every 10.0 horizontal units', PHRASE]);
  });
  it('K7 70(C) is a 9.5 m height limit in the 69(C) form (F-2 a)', () => {
    const u70 = unitOf(U70); const u69 = unitOf(U69);
    expect([u70.archetype, u70.target, u70.bound]).toEqual([u69.archetype, u69.target, u69.bound]);
    expect(u70.numeric_expression).toEqual(['height_m = 9.5 m @(70)[SSP](C)']);
  });
});

describe('MB-27.L2 (1:4) — applicability follows the roof option', () => {
  const exc = (id: string): string => id.slice(0, id.indexOf('#'));
  it('K4 a pitched roof (token false) never applies the 1:4 clause', () => {
    for (const id of REKEYED) expect([id, E.applies(lot(exc(id), false), unitOf(id), C).ok]).toEqual([id, false]);
  });
  it('K4b an undecided roof form leaves the clause undecided, never applied silently', () => {
    for (const id of REKEYED) expect([id, E.applies(lot(exc(id), undefined), unitOf(id), C).ok]).toEqual([id, null]);
  });
  it('K4c with 3 storeys permitted (the storey test holds), an undecided roof form is what leaves the height undecided', () => {
    const st3 = { overlays: { ST: 3 } };
    for (const id of REKEYED) {
      const r = eff(lot(exc(id), undefined, st3), 'height_m');
      expect([id, r.status, r.reason]).toEqual([id, 'not_evaluated', 'condition_unknown:flat_or_shallow_roof']);
    }
  });
  it('K5 893(F): with a shallow roof its 11.0 m applies despite 10.20.40.10(4)(A); with a pitched roof it does not', () => {
    const flat = eff(lot('900.3.10(893)', true), 'height_m');
    expect([flat.status, flat.value, flat.winner]).toEqual(['value', 11, U893]);
    const pitched = eff(lot('900.3.10(893)', false), 'height_m');
    expect([pitched.status, pitched.winner === U893]).toEqual(['value', false]);
  });
  it('K8 70(C) (F-2 a): with 3 storeys permitted, a shallow roof caps the height at 9.5 m; a pitched roof does not take the cap', () => {
    const st3 = { overlays: { ST: 3 } };
    const flat = eff(lot('900.3.10(70)', true, st3), 'height_m');
    expect([flat.status, flat.value, flat.winner]).toEqual(['value', 9.5, U70]);
    const pitched = eff(lot('900.3.10(70)', false, st3), 'height_m');
    expect([pitched.status, pitched.winner === U70]).toEqual(['value', false]);
    const unknown = eff(lot('900.3.10(70)', undefined, st3), 'height_m');
    expect([unknown.status, unknown.reason]).toEqual(['not_evaluated', 'condition_unknown:flat_or_shallow_roof']);
  });
});

describe('MB-27.L2 (1:4) — 971(B) storey condition (F-1 a, operator-confirmed upward move)', () => {
  it('K9 with 2 storeys permitted the 9.5 m cap does not apply in either roof form; with 3 storeys a shallow roof takes it', () => {
    for (const flag of [true, false]) {
      const st2 = eff(lot('900.3.10(971)', flag, { overlays: { ST: 2 } }), 'height_m');
      expect([flag, st2.status, st2.winner === U971]).toEqual([flag, 'value', false]);
    }
    const st3 = eff(lot('900.3.10(971)', true, { overlays: { ST: 3 } }), 'height_m');
    expect([st3.status, st3.value, st3.winner]).toEqual(['value', 9.5, U971]);
  });
});

describe('MB-27.L2 (1:4) — nothing else is corrected', () => {
  it('K6 the 2026-11-03 D-RK corrections name only the five re-keyed units', () => {
    const named = new Set((I.adjudications.adjudications as Json[]).filter((e: Json) => e.kind === 'correction' && e.adjudicated_on === '2026-11-03' && /D-RK|F-2 a/.test(String(e.reason))).map((e: Json) => e.unit));
    expect([...named].sort()).toEqual([...REKEYED].sort());
  });
});
