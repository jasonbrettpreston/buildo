// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (condition: a band token needs its numeric `if`), §7.4,
//            §7.5 (rule 7a), §11.1; docs/specs/01-pipeline/69a_mcbylaw_register.md M-159, M-171, M-175, M-179(1),
//            M-198, M-75; operator chat 2026-10-20 batch B (raw record
//            docs/reports/decisions/raw/2026-10-20-chat-batch-b/2026-10-20-batch-b.json, CHAT-6…CHAT-13)
//
// By-law fix lane 2 (wf1/bylaw-fix-2): the operator's batch-B chat decisions and the findings from comparing the
// evaluator with City of Toronto Committee of Adjustment examiner figures (20 Norwood Rd A0625/26TEY, 453 Durie St
// A0594/26TEY and six more notices). Each describe names the finding and the rule it applies; every assertion reads the
// production path (validate.mjs inputs → agree.mjs resolved units with the M-75 corrections → withGeneratedFields + xref
// displacesOf → evaluate.mjs loadCandidates / effective over evaluatorVocab()), as bylaw-evaluator-fixes does.
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
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8'));

const ZONES = ['R', 'RD', 'RS', 'RT', 'RM'];
// a lot as Layer 3 would hand it over: site facts not holding (M-169), design choices set explicitly per test
const lot = (zone: string, buildingType: string, extra: Json = {}): Json => ({
  zone, label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: buildingType,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false, ...(extra.flags ?? {}) },
  vars: { lot_frontage_m: 12, lot_depth_m: 40, proposed_height_m: 4, distance_to_residential_m: 5, ...(extra.vars ?? {}) },
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'flags' && k !== 'vars')),
});
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);
const touched = (r: Json): string[] => [r.winner, ...(r.applied ?? [])].filter((x: unknown): x is string => typeof x === 'string');

describe('G-AGREE holds with every correction of this lane (no orphan)', () => {
  it('no violation', () => {
    expect(ag.violations).toEqual([]);
  });
});

// N-1 (CoA 20 Norwood Rd A0625/26TEY, R d1.0: the City applied 10.10.60.70(1)'s 5 % ancillary coverage to a garage).
// 150.7.60.70(1) and 150.8.60.70(1) open "if a lot has … an ancillary building containing a garden [laneway] suite": the
// 20 % / 30 % caps govern only a lot with a suite (M-159, the family of the 28b959c2 suite ancillary-building leak).
// M-179(1): the all-ancillary cap is its own target, so 10.5.60.70(1)(B) ("the area of the lot covered by all ancillary
// buildings and structures may not exceed 10 percent") is keyed on ancillary_coverage_pct too.
describe('N-1 / M-159 / M-179(1) — a plain ancillary building takes 10.10.60.70(1) 5 % (R) or 10.5.60.70(1)(B) 10 %, never a suite cap', () => {
  it('no 150.7.60.70 / 150.8.60.70 unit decides a plain ancillary building\'s ancillary_coverage_pct', () => {
    for (const zone of ZONES) {
      const r = eff(lot(zone, 'ancillary_building'), 'ancillary_coverage_pct');
      expect([zone, touched(r).filter((id) => /^150\.(7|8)\.60\.70/.test(id))]).toEqual([zone, []]);
    }
  });
  it('R: a plain ancillary building answers 5 % from 10.10.60.70(1) (20 Norwood Rd examiner figure)', () => {
    const r = eff(lot('R', 'ancillary_building', { label: { d: 1.0 } }), 'ancillary_coverage_pct');
    expect([r.status, r.value, String(r.winner).startsWith('10.10.60.70(1)#')]).toEqual(['value', 5, true]);
  });
  it('RD / RS / RT / RM: a plain ancillary building answers 10 % from 10.5.60.70(1)(B), keyed on ancillary_coverage_pct', () => {
    expect([unitOf('10.5.60.70(1)#(1)(B)').target, unitOf('10.5.60.70(1)#(1)(B)').numeric_expression]).toEqual(['ancillary_coverage_pct', ['ancillary_coverage_pct = 10 pct @(1)(B)']]);
    for (const zone of ['RD', 'RS', 'RT', 'RM']) {
      const r = eff(lot(zone, 'ancillary_building'), 'ancillary_coverage_pct');
      expect([zone, r.value, r.winner]).toEqual([zone, 10, '10.5.60.70(1)#(1)(B)']);
    }
  });
  it('the suites keep their own caps: a garden suite 20 %, a laneway suite 30 %', () => {
    expect(eff(lot('R', 'garden_suite'), 'ancillary_coverage_pct').value).toBe(20);
    expect(eff(lot('R', 'laneway_suite', { flags: { abuts_lane: true } }), 'ancillary_coverage_pct').value).toBe(30);
    for (const id of ['150.7.60.70(1)#(1)(B)', '150.8.60.70(1)#(1)(A)', '150.8.60.70(1)#(1)(B)']) {
      expect([id, unitOf(id).application.building_types.includes('ancillary_building')]).toEqual([id, false]);
    }
  });
});

// N-4: 10.10.60.70(1) "the area of the lot covered by ancillary buildings and structures may not exceed 5% of the lot
// area, except for the following: (A) the water surface area of an outdoor swimming pool … and (B) ancillary buildings or
// structures containing parking spaces, to a maximum of one parking space per dwelling unit on the lot". The 5 % is the
// stem every arm repeats (the keyed calculation_handling gaps); (A) and (B) are exclusions from the measure, not scopes
// of the cap. Scoped to `uses` swimming_pool / parking_space, (A) was set aside by M-175 and (B) read as a cap for
// parking. M-171: an exclusion that needs building facts is disclosed, never deducted.
describe('N-4 / M-171 — 10.10.60.70(1)(B) is an exclusion from the 5 %, not a 5 % cap for parking', () => {
  it('neither arm is scoped to a use: the 5 % stem binds every ancillary building', () => {
    for (const id of ['10.10.60.70(1)#(1)(A)', '10.10.60.70(1)#(1)(B)']) expect([id, unitOf(id).application.uses]).toEqual([id, []]);
  });
  it('(B) discloses the parking exclusion; (A) the pool water-surface exclusion', () => {
    expect(unitOf('10.10.60.70(1)#(1)(B)').disclosure).toMatch(/one parking space per dwelling unit/);
    expect(unitOf('10.10.60.70(1)#(1)(A)').disclosure).toMatch(/swimming pool/);
  });
  it('the 10.10.60.70(1)(A) stem is no longer set aside by the M-175 accessory-structure guard', () => {
    const r = E.applies(lot('R', 'ancillary_building'), units.find((u) => u.unit_id === '10.10.60.70(1)#(1)(A)'), C);
    expect(r.ok).toBe(true);
  });
});

// N-3 (CoA 20 Norwood Rd A0625/26TEY and 27 Regal: the City applied 10.5.60.50(2)(B) as 40 m²). (B) "40.0 square metres in
// all other cases" is the complement of (A) "a lot with a lot frontage of 12.0 metres or more"; its frontage_band token
// had no condition.if, and a threshold token without one is undecided (Spec 68 §6: a band token carries its numeric if).
// NOT FIXED in this lane: G-CLAUSE binds a condition's literals to the unit's own clause and licenses its variables from
// the unit's own text, and (B)'s text names neither "lot frontage" nor 12.0, so the complement condition is refused
// (literal_not_in_clause, variable_unlicensed). A complement-arm ruling is drafted for the operator; these cases are
// it.fails until it lands, then they flip.
describe('N-3 / Spec 68 §6 — 10.5.60.50(2)(B) "in all other cases" resolves: under 12.0 m of frontage, 40 m² (OWED: complement-arm ruling)', () => {
  it.fails('(B) carries condition.if lot_frontage_m < 12.0 m', () => {
    expect(unitOf('10.5.60.50(2)#(2)(B)').condition).toEqual({ tokens: ['frontage_band'], if: 'lot_frontage_m < 12.0 m' });
  });
  it.fails('a 9.0 m lot answers 40 m² from (B); a 12.0 m lot 60 m² from (A)', () => {
    for (const zone of ZONES) {
      const narrow = eff(lot(zone, 'ancillary_building', { vars: { lot_frontage_m: 9 } }), 'ancillary_floor_area_m2');
      expect([zone, narrow.value, narrow.winner]).toEqual([zone, 40, '10.5.60.50(2)#(2)(B)']);
      const wide = eff(lot(zone, 'ancillary_building', { vars: { lot_frontage_m: 12 } }), 'ancillary_floor_area_m2');
      expect([zone, wide.value, wide.winner]).toEqual([zone, 60, '10.5.60.50(2)#(2)(A)']);
    }
  });
});

// CHAT-13 (operator chat 2026-10-20, "bug_fix": "Per the operator's existing 'disclose' answers, make these
// disclosure-only and remove them from the suite building height keying"). 150.7.60.60(5)(A) / 150.8.60.60(5)(A): "the
// maximum height of the roof, canopy, awning or similar structure is 4.0 metres" — the canopy's height, not the
// building's. The operator answered both "disclose" (decks_platforms_not_modelled, M-175); the laneway twin is already
// UNUSUAL, so the garden unit takes the same form (parallel chapters 150.7 / 150.8).
describe('CHAT-13 / M-175 — the 150.7 / 150.8.60.60(5)(A) canopy height is disclosure-only, never a building height', () => {
  it('both units are UNUSUAL with no target and carry their disclosure', () => {
    for (const id of ['150.7.60.60(5)#(5)(A)', '150.8.60.60(5)#(5)(A)']) {
      const u = unitOf(id);
      expect([id, u.archetype, u.target, u.numeric_expression]).toEqual([id, 'UNUSUAL', 'none', 'none']);
      expect(String(u.disclosure)).toMatch(/4\.0 m/);
    }
  });
  it('no canopy unit decides height_m for an ancillary building or a suite', () => {
    for (const zone of ZONES) for (const bt of ['ancillary_building', 'garden_suite', 'laneway_suite']) {
      const r = eff(lot(zone, bt, { flags: { abuts_lane: true } }), 'height_m');
      expect([zone, bt, touched(r).filter((id) => /^150\.(7|8)\.60\.60\(5\)/.test(id))]).toEqual([zone, bt, []]);
    }
  });
});

// CHAT-6 (operator chat 2026-10-20, approve: "Drop the M-193 (Coxwell map area) mis-citation so the row closes as M-198
// owed to P5.13, like (6)(C)"). The tracker row 150.7.60.20(6)(A) cited M-193, which is not a ruling on that corner-lot
// clause; with it dropped the row rests on M-198 and its named lock, and the M-198(2) averaging stays with P5.13.
describe('CHAT-6 — 150.7.60.20(6)(A) closes on M-198 (M-193 dropped as a mis-citation)', () => {
  it('the disposition cites no M-193 and the tracker row is INCORPORATED', () => {
    const d = read('docs/reference/envelope-answer-dispositions.json').dispositions.find((x: Json) => x.unit_id === '150.7.60.20(6)#(6)(A)');
    expect(d.fix_ids).toEqual(['M-198']);
    const row = read('docs/reports/generated/envelope-answer-tracker.json').rows.find((x: Json) => x.unit_id === '150.7.60.20(6)#(6)(A)');
    expect([row.state, row.fix_ids]).toEqual(['INCORPORATED', ['M-198']]);
  });
});

// CHAT-7 (operator chat 2026-10-20, approve: "Key the 1.5 m step-back above 4.0 m (150.8.60.20(3)(C)) as its own target
// (e.g. upper_side_setback_m, laneway suite only); the whole-building side setback stays 1.0 m; Layer 3 does the
// step-back geometry"). M-198(4): (3)(C) is a mandatory upper-storey rule; M-219 remainder: it was keyed as the whole
// building's side_setback_m, so a lane lot answered 1.5 m where (3)(D) gives 1.0 m.
describe('CHAT-7 / M-198(4) / M-219 — the laneway 1.5 m step-back above 4.0 m is upper_side_setback_m; the side setback stays 1.0 m', () => {
  it('upper_side_setback_m is a vocab dsl_target in metres', () => {
    expect(I.vocab.dsl_target.upper_side_setback_m?.unit).toBe('m');
  });
  it('150.8.60.20(3)(C) is keyed on upper_side_setback_m, laneway suite only', () => {
    const u = unitOf('150.8.60.20(3)#(3)(C)');
    expect([u.target, u.numeric_expression, u.application.building_types]).toEqual(['upper_side_setback_m', ['upper_side_setback_m = 1.5 m @(3)(C)'], ['laneway_suite']]);
  });
  it('a 6.3 m laneway suite on a lane lot: side setback 1.0 m from (3)(D), upper side setback 1.5 m from (3)(C)', () => {
    for (const zone of ZONES) {
      const l = lot(zone, 'laneway_suite', { flags: { abuts_lane: true }, vars: { proposed_height_m: 6.3 } });
      const side = eff(l, 'side_setback_m');
      expect([zone, side.value, side.winner]).toEqual([zone, 1, '150.8.60.20(3)#(3)(D)']);
      const up = eff(l, 'upper_side_setback_m');
      expect([zone, up.value, up.winner]).toEqual([zone, 1.5, '150.8.60.20(3)#(3)(C)']);
    }
  });
  it('a 4.0 m laneway suite has no step-back; no house or garden suite takes one', () => {
    const low = eff(lot('R', 'laneway_suite', { flags: { abuts_lane: true }, vars: { proposed_height_m: 4 } }), 'upper_side_setback_m');
    expect(touched(low)).not.toContain('150.8.60.20(3)#(3)(C)');
    for (const bt of ['detached_house', 'garden_suite', 'ancillary_building']) {
      const r = eff(lot('R', bt, { flags: { abuts_lane: true }, vars: { proposed_height_m: 6.3 } }), 'upper_side_setback_m');
      expect([bt, touched(r)]).toEqual([bt, []]);
    }
  });
});

// CHAT-8 (operator chat 2026-10-20, approve: "Let rule 7a treat a target as unregulated by absence when only
// lawfully-existing or ancillary-only units carry it; then confirm absence for R/RT length, RT depth and main wall (M-186),
// RM houseplex (M-204 not_applicable); R coverage and RD semi depth per the 19-cell ratchet list"). Spec 68 §7.5 rule 7a /
// M-54 note: absence needs no by-law unit for the target; a unit that applies only to a lawfully existing building or
// only to an ancillary building / suite / accessory structure never limits a new principal building, so it no longer
// blocks. M-186: RT has no main-wall rule (10.60.40.10 holds only (1) height and (2) storeys) → ABS-2.
describe('CHAT-8 / rule 7a / M-186 — lawfully-existing-only and ancillary-only units no longer block absence; RT main wall is unregulated', () => {
  it('vocab declares what rule 7a ignores (lawfully_existing; the ancillary and garden / laneway suite classes; accessory-structure uses)', () => {
    expect(I.vocab.absence_ignore).toMatchObject({ lot_conditions: ['lawfully_existing'], building_types: ['ancillary_building', 'garden_suite', 'laneway_suite'], accessory_structure_uses: true });
  });
  it('RT: a house, semi or houseplex main wall answers unregulated by absence (ABS-2, M-186)', () => {
    for (const bt of ['detached_house', 'semi_detached_house', 'detached_houseplex']) {
      const r = eff(lot('RT', bt), 'main_wall_height_m');
      expect([bt, r.status, r.value, r.evidence?.kind, r.evidence?.ruling]).toEqual([bt, 'value', 'unregulated', 'absence', 'ABS-2']);
    }
  });
  it('a principal-building unit for the target still blocks absence: RD / RS main walls keep their x.40.10(2) limit', () => {
    for (const zone of ['R', 'RD', 'RS']) expect([zone, eff(lot(zone, 'detached_house'), 'main_wall_height_m').value]).toEqual([zone, 7.5]);
  });
});

// CHAT-10 (operator chat 2026-10-20, approve: "Amend Spec 68 §11.1 and the vocab together to add not_buildable and the
// prefixed status forms"); Spec 69a M-223(1) ("vocab.layer3.scenario_status lacks not_buildable:<clauses>; Spec 78's
// not_permitted:<clause> prefix form is not in vocab"). Spec 68 §11.1: the status list "equals that block in both
// directions" — so the lock parses §11.1's Status paragraph and compares each level, name and parameter form, both ways.
describe('CHAT-10 / M-223(1) — the Layer 3 scenario status gains not_buildable; vocab and Spec 68 §11.1 declare the same prefixed forms', () => {
  const spec = fs.readFileSync(path.join(process.cwd(), 'docs/specs/01-pipeline/68_mcbylaw_standard.md'), 'utf8');
  const para = spec.split('\n').find((l) => l.startsWith('**Status (closed;')) ?? '';
  const forms = (seg: string): Record<string, string> => Object.fromEntries([...seg.matchAll(/`([a-z_]+)(?::([^`]+))?`/g)].map((m) => [m[1], m[2] ?? '']));
  const scenarioSeg = (/Scenario level \([^)]*\): (.*?)\. Field level/.exec(para) ?? [])[1] ?? '';
  const fieldSeg = (/Field level \([^)]*\): (.*?)\. `not_permitted` reason/.exec(para) ?? [])[1] ?? '';
  const L3 = I.vocab.layer3;
  it('Spec 68 §11.1 names not_buildable:<clauses> at the scenario level', () => {
    expect(forms(scenarioSeg)).toMatchObject({ not_buildable: '<clauses>' });
  });
  it('vocab.layer3.scenario_status has not_buildable', () => {
    expect(L3.scenario_status).toContain('not_buildable');
  });
  it('vocab.layer3.status_form declares each level\'s prefixed forms, equal to Spec 68 §11.1 in both directions', () => {
    expect(L3.status_form?.scenario).toEqual(forms(scenarioSeg));
    expect(L3.status_form?.field).toEqual(forms(fieldSeg));
    expect(Object.keys(L3.status_form?.scenario ?? {}).sort()).toEqual([...L3.scenario_status].sort());
    expect(Object.keys(L3.status_form?.field ?? {}).sort()).toEqual([...L3.field_status].sort());
  });
});
