// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5 rules 1, 2 and 4 (a clause that governs one part of a building is not a
//            whole-building candidate); docs/specs/01-pipeline/69a_mcbylaw_register.md M-497 (the parking-space portion scope),
//            M-169 (the closed set-aside disclosure form), M-75 (the keying-correction route)
//
// MB-27 increment 3 (the Layer 2 night) · Q-287E / Q-287E2 a · RED FIRST. The units of the parking-space family key a clause about
// "the portion of a building with a parking space" (or "the part of main wall ... with the access to the required parking space") as
// a whole-building limit. Keyed whole, 4a takes the largest minimum (x331, x88: 6.0 beats the whole-building 3.0) or the part's own
// value replaces the zone rule (x324: 5.7). applies_to.part "portion" sets the unit aside for the whole-building setback and
// discloses it. Production path: the evaluator over the real agreed units (loadRealLotAssembly).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const A = await (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw-validation/assembly.mjs')).href)).loadRealLotAssembly(ROOT);
const VOCAB: Json = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/vocab.json'), 'utf8'));
const unit = (id: string): Json => A.units.find((u: Json) => u.unit_id === id) as Json;
const lot = (zone: string, exception: string): Json => ({
  zone, exception, label: {}, overlays: {}, map_areas: [], building_type: 'detached_house', address: '1 Test St',
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, flat_or_shallow_roof: false },
  vars: { lot_frontage_m: 15, lot_depth_m: 36, lot_area_m2: 540, dwelling_units: 1, proposed_height_m: 8 },
});
const eff = (l: Json, t: string): Json => A.E.effective(l, t, A.E.loadCandidates(l, A.units).candidates, A.C);

const PORTION = [
  '900.3.10(287)#(287)[SSP](E)', '900.3.10(324)#(324)[SSP](C)', '900.3.10(331)#(331)[SSP](E)',
  '900.5.10(88)#(88)[SSP](F)', '900.3.10(713)#(713)[SSP](D)(i)',
];

describe('Q-287E: the portion scope is a closed vocabulary value and the five units carry it', () => {
  it('vocab.applies_to_part lists portion', () => {
    expect(VOCAB.applies_to_part).toContain('portion');
  });
  it.each(PORTION)('%s is keyed applies_to.part portion, with its own disclosure', (id) => {
    const u = unit(id);
    expect(u.applies_to.part).toBe('portion');
    expect(String(u.disclosure)).toMatch(/portion|part of/i);
  });
});

describe('Q-287E: on the production path the portion is set aside and disclosed, the whole building is answered by the whole-building clause', () => {
  it('x331 (RD): the whole-building front setback is (C) 3.0 m, not the 6.0 m of the parking-access main wall (E)', () => {
    const r = eff(lot('RD', '900.3.10(331)'), 'front_setback_m');
    expect([r.status, r.value, r.winner]).toEqual(['value', 3, '900.3.10(331)#(331)[SSP](C)']);
    expect((r.disclosures as string[]).some((d) => /900\.3\.10\(331\)/.test(d) || /parking/i.test(d))).toBe(true);
  });
  it('x88 (RT): the whole-building front setback is (D) 3.0 m, not the 6.0 m of (F)', () => {
    const r = eff(lot('RT', '900.5.10(88)'), 'front_setback_m');
    expect([r.status, r.value, r.winner]).toEqual(['value', 3, '900.5.10(88)#(88)[SSP](D)']);
  });
  it('x324 (RD): the 5.7 m of the parking-access main wall no longer replaces the zone rule (no exception candidate is left)', () => {
    const r = eff(lot('RD', '900.3.10(324)'), 'front_setback_m');
    expect(r.winner).not.toBe('900.3.10(324)#(324)[SSP](C)');
    expect(r.value).not.toBe(5.7);
  });
  it('x287 (RD): the whole-building side setback stays 0.9 m (C) and the 0.3 m portion is disclosed, not discarded', () => {
    const r = eff(lot('RD', '900.3.10(287)'), 'side_setback_m');
    expect([r.status, r.value, r.winner]).toEqual(['value', 0.9, '900.3.10(287)#(287)[SSP](C)']);
    expect((r.disclosures as string[]).some((d) => /0\.3/.test(d))).toBe(true);
  });
});

// Q-287E2 a also names the x812 (D)(ii) split (whole 4.5 m / portion 6.0 m). No correction route adds a unit: STOP recorded in the lane E report, lock held until ruled.

describe('Q-287E: a clause that stays whole is untouched (green on both trees)', () => {
  it('x331 (C) is whole', () => {
    expect(unit('900.3.10(331)#(331)[SSP](C)').applies_to.part).toBe('whole');
  });
});
