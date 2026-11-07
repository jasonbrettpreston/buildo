// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-190 (dated note 2026-11-06, Q10 a: "The RM houseplex is shown with no
//            main-wall limit"), M-361 Q1, M-240 (absence per zone, building type and target), M-482 (the typed-ruling form, ABS-10.5);
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5 rule 7a v2
//
// MB-27 increment 3 (the Layer 2 night) · DL-4 a with T Q4 c · RED FIRST. 10.80.40.10(2) and (6) name "a detached house or a
// semi-detached house"; the RM detached houseplex has no main-wall share, no set-back storey and no pitched-roof threshold. Today the
// four cells are `not_evaluated:no_candidate` (measured on all 51,897 RM lots). Data: one typed absence ruling per target for RM,
// building_types [detached_houseplex], each executed against its pinned page ch10_80 (the Q11 / M-475 "fix the stored input" form).
// semi_detached_houseplex has the same gap and is NOT in this item (its own increment, RR-01; disclosed).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const A = await (await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw-validation/assembly.mjs')).href)).loadRealLotAssembly(ROOT);
const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const ABS: Json[] = read('scripts/seeds/bylaw/absence-rulings.json').rulings;
const PAGE = fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/pages/ch10_80.txt'), 'utf8');
const TARGETS = ['main_wall_front_rear_share_pct', 'main_wall_side_share_pct', 'upper_storey_setback_m', 'pitched_roof_slope_min'];
const mine = ABS.filter((r) => r.zone === 'RM' && TARGETS.includes(r.target) && JSON.stringify(r.building_types) === JSON.stringify(['detached_houseplex']));
const lot = (bt: string): Json => ({
  zone: 'RM', exception: null, label: { u: 4 }, overlays: {}, map_areas: [], building_type: bt,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, flat_or_shallow_roof: false },
  vars: { lot_frontage_m: 12, lot_depth_m: 36, lot_area_m2: 432, dwelling_units: bt === 'detached_houseplex' ? 4 : 1, proposed_height_m: 10 },
});
const eff = (l: Json, t: string): Json => A.E.effective(l, t, A.E.loadCandidates(l, A.units).candidates, A.C);
const show = (r: Json): unknown[] => [r.status, r.value, (r.evidence && r.evidence.kind) || null];

describe('DL-4 a: the RM detached-houseplex absence rulings are data', () => {
  it('one typed RM ruling per target, building_types [detached_houseplex], on page ch10_80', () => {
    expect(mine.map((r) => r.target).sort()).toEqual([...TARGETS].sort());
    for (const r of mine) expect([r.checked_page, r.evidence_kind]).toEqual(['ch10_80', 'absence']);
  });
  it('each passes on its pinned page (every occurrence accounted for)', () => {
    const r = A.E.checkAbsenceRulings({ rulings: mine, pages: { ch10_80: PAGE }, vocab: VOCAB });
    expect({ pass: r.pass, violations: r.violations, executed: r.executed }).toEqual({ pass: true, violations: [], executed: TARGETS.length });
  });
  it('negative case (the ABS-10.5 form, panel F11): a new RM clause that names the detached houseplex turns the rulings red', () => {
    const synthetic = PAGE + ' (7) Maximum Height of Specified Pairs of Main Walls for a Detached Houseplex In the RM zone, the permitted maximum height of main walls for a detached houseplex is 9.0 metres for at least 50 percent of the total width of each side main wall.';
    const r = A.E.checkAbsenceRulings({ rulings: mine, pages: { ch10_80: synthetic }, vocab: VOCAB });
    expect(r.pass).toBe(false);
    expect(r.violations.some((x: string) => /absence_contradicted/.test(x))).toBe(true);
  });
});

describe('DL-4 a on the production path', () => {
  it.each(TARGETS)('RM detached_houseplex %s: unregulated by absence, never no_candidate', (t) => {
    expect(show(eff(lot('detached_houseplex'), t))).toEqual(['value', 'unregulated', 'absence']);
  });
  it('RM detached_house keeps its shares and threshold (values measured on the tip for this lot; green on both trees)', () => {
    const l = lot('detached_house');
    expect([eff(l, 'main_wall_front_rear_share_pct').value, eff(l, 'main_wall_side_share_pct').value, eff(l, 'pitched_roof_slope_min').value]).toEqual([60, 70, 0.1]);
  });
});
