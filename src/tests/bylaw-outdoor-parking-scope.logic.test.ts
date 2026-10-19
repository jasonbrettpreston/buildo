// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.1, §7.3, §7.5 (archetype, UNUSUAL shape, applicability);
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-75 (corrections), M-98 / M-102 (no licensed target → UNUSUAL),
//            M-159 (a unit governs only its own subject), M-225 (10.5.80.1(2)(A) is the outdoor-parking-area rule)
//
// Coxwell review 2026-10-18 side finding: 10.5.80.1(2)(A) ("no portion of the ancillary outdoor area [for the parking
// or storing of more than 3 vehicles] is closer to a residential building on the same lot than 6.0 metres") was agreed
// by both keyers as LIMIT separation_m min 6.0, building_types ["any"], condition none. separation_m is the distance
// between BUILDINGS (vocab concept), so the parking-area rule won the garden-suite separation on every lot: a suite
// ≤ 4.0 m tall got 6.0 m instead of the 4.0 m of 150.7.60.30(1)(A), and the Coxwell-area 5.0 m of (1)(C) was hidden.
// Each assertion reads the production path (validate.mjs inputs → agree.mjs resolved units → withGeneratedFields +
// xref displacesOf → evaluate.mjs loadCandidates / effective over evaluatorVocab()).
import { describe, expect, it } from 'vitest';
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
const resolved: Json[] = [...AG.agreedUnits(ag).values()];
const units: Json[] = resolved
  .map((u: Json): Json => AU.withGeneratedFields(u))
  .map((u: Json) => { const d = XR.displacesOf(index, u.unit_id, I.vocab, null); return { ...u, displaces: d.targets.map((t: Json) => t.id), displaces_optional: d.optional_variation }; });
const C = E.makeContext(VO.evaluatorVocab(I.vocab), { absences: I.absences });
const UNIT = '10.5.80.1(2)#(2)(A)';
const usesOf = (u: Json): string[] => (u.application?.uses ?? []).map((x: unknown) => (x && typeof x === 'object' ? (x as Json).token : x));
const targetsOf = (u: Json): string[] => [u.target].flat().filter((t: unknown) => typeof t === 'string' && t !== 'none');
const parkingIds = new Set(resolved.filter((u) => usesOf(u).includes('parking_space')).map((u) => u.unit_id));

const suiteLot = (zone: string, buildingType: string, vars: Json, mapAreas: string[] = []): Json => ({
  zone, label: {}, overlays: {}, flags: { lawfully_existing: false }, building_type: buildingType, map_areas: mapAreas,
  vars: { lot_frontage_m: 12, lot_depth_m: 40, ...vars },
});
const sep = (lot: Json): Json => E.effective(lot, 'separation_m', E.loadCandidates(lot, units).candidates, C);

describe('M-225 — 10.5.80.1(2)(A) is the outdoor-parking-area rule, not a building separation', () => {
  it('G-AGREE holds with the corrections (no orphan)', () => {
    expect(ag.violations).toEqual([]);
  });
  it('the resolved unit is UNUSUAL: no target, the 6.0 m limit listed limit_not_modelled, its subject disclosed', () => {
    const u = ag.units.get(UNIT)?.unit;
    expect(u).toBeTruthy();
    expect([u.archetype, u.target, u.bound, u.numeric_expression]).toEqual(['UNUSUAL', 'none', 'none', 'none']);
    expect(u.literals_not_expressed).toEqual(expect.arrayContaining([
      expect.objectContaining({ literal: '3', clause: '(2)', reason: 'threshold_used_in_application' }),
      expect.objectContaining({ literal: '6.0', clause: '(2)(A)', reason: 'limit_not_modelled' }),
    ]));
    expect(u.calculation_handling.status).toBe('not_modelled');
    expect(u.disclosure).toMatch(/outdoor area .*more than 3 vehicles/);
  });

  for (const zone of ['R', 'RD']) {
    it(`RED→GREEN (${zone}): a garden suite ≤ 4.0 m at 4.0 m takes 4.0 m from 150.7.60.30(1)(A), not 6.0 m`, () => {
      const r = sep(suiteLot(zone, 'garden_suite', { proposed_height_m: 4.0, distance_to_residential_m: 4.0 }));
      expect([r.status, r.value, r.winner]).toEqual(['value', 4, '150.7.60.30(1)#(1)(A)']);
      expect(r.applied).not.toContain(UNIT);
    });
  }

  it('the Coxwell-area 5.0 m of 150.7.60.30(1)(C) is no longer hidden by a 6.0 m parking rule', () => {
    const r = sep(suiteLot('RD', 'garden_suite', { proposed_height_m: 6.3, distance_to_residential_m: 5.0 }, ['Coxwell Avenue']));
    expect(r.value).toBe(5);
    expect(r.winner).toBe('150.7.60.30(1)#(1)(C)');
  });
});

describe('guard — no parking clause feeds separation_m for a suite', () => {
  it('no resolved unit scoped to parking_space is keyed to separation_m', () => {
    expect(resolved.filter((u) => parkingIds.has(u.unit_id) && targetsOf(u).includes('separation_m')).map((u) => u.unit_id)).toEqual([]);
  });
  for (const zone of ['R', 'RD', 'RS', 'RT', 'RM']) {
    for (const type of ['garden_suite', 'laneway_suite']) {
      it(`${zone} ${type}: neither the winner nor any applied separation_m unit is a parking clause`, () => {
        for (const h of [4.0, 6.3]) {
          const r = sep(suiteLot(zone, type, { proposed_height_m: h, distance_to_residential_m: h > 4 ? 7.5 : 4.0 }));
          expect([r.winner, ...(r.applied ?? [])].filter((id: unknown) => typeof id === 'string' && parkingIds.has(id))).toEqual([]);
        }
      });
    }
  }
});
