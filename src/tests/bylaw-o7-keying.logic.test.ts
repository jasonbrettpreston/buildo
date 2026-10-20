// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 O-7 ("The unkeyed law numbers (… R roof
//            slope …) are keyed by the keying lane before ①"), P5.2 item 6 ("capped by `roof_slope_max` where it is
//            keyed (R 10.10.40.10(4): 5:3)"; "applies above the second storey or higher on a detached house only");
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-223(3) ("`dsl_target` lacks … `roof_slope_max` … Each is a
//            vocab change with its red test"); docs/specs/01-pipeline/68_mcbylaw_standard.md §5a part 4 (externalized).
//
// O-7 keying (bylaw fix lane item 4, 2026-10-20). Every assertion reads the production path (validate.mjs inputs →
// agree.mjs resolved units with the M-75 corrections → xref displacesOf → evaluate.mjs effective over evaluatorVocab()),
// and every law number is read from the registry (docs/reference/bylaw-provisions.json `numeric_literals`).
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
const unitOf = (id: string): Json => {
  const r = ag.units.get(id);
  if (!r) throw new Error(`no unit ${id}`);
  return r.unit;
};
const provisions = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs/reference/bylaw-provisions.json'), 'utf8'));
const literals = (reg: string): number[] => provisions.rows.find((r: Json) => r.regulation_id === reg).numeric_literals.map((l: Json) => l.value);

const ZONES = ['R', 'RD', 'RS', 'RT', 'RM'];
const lot = (zone: string, buildingType: string): Json => ({
  zone, label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: buildingType,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false },
  vars: { lot_frontage_m: 12, lot_depth_m: 40, proposed_height_m: 4, distance_to_residential_m: 5 },
});
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);

describe('G-AGREE holds with the O-7 corrections (no orphan)', () => {
  it('no violation', () => {
    expect(ag.violations).toEqual([]);
  });
});

describe('O-7 / M-223(3) — R roof slope 10.10.40.10(4) is keyed as roof_slope_max', () => {
  const [vertical, horizontal] = literals('10.10.40.10(4)'); // "5.0 vertical units for every 3.0 horizontal units"
  it('roof_slope_max is a vocab dsl_target in ratio (vertical per horizontal)', () => {
    expect([I.vocab.dsl_target.roof_slope_max?.unit, I.vocab.dsl_target.roof_slope_max?.aspect]).toEqual(['ratio', 'envelope']);
  });
  it('the unit is a LIMIT max on a detached house in R, its two literals in the expression', () => {
    const u = unitOf('10.10.40.10(4)#whole');
    expect([u.archetype, u.target, u.bound, u.numeric_expression, u.application.zones, u.application.building_types]).toEqual([
      'LIMIT', 'roof_slope_max', 'max', ['roof_slope_max = 5.0 ratio ÷ 3.0 ratio @(4)'], ['R'], ['detached_house'],
    ]);
  });
  it('an R detached house answers roof_slope_max = 5.0 / 3.0 from 10.10.40.10(4)', () => {
    const r = eff(lot('R', 'detached_house'), 'roof_slope_max');
    expect([r.status, r.winner]).toEqual(['value', '10.10.40.10(4)#whole']);
    expect(r.value).toBeCloseTo((vertical as number) / (horizontal as number), 8); // effective() rounds to 9 decimals
  });
  it('scoped per class: no other R class and no other zone takes the R detached-house cap (P5.2 item 6, DeepSeek a8)', () => {
    for (const zone of ZONES) for (const bt of ['detached_house', 'semi_detached_house', 'detached_houseplex']) {
      if (zone === 'R' && bt === 'detached_house') continue;
      const r = eff(lot(zone, bt), 'roof_slope_max');
      expect([zone, bt, r.winner ?? null, (r.applied ?? []).includes('10.10.40.10(4)#whole')]).toEqual([zone, bt, null, false]);
    }
  });
});
