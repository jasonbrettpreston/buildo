// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.10, P5.12, P5.15;
//            docs/reports/2026-10-20-bylaw-e2e-verification.md (golden-lot end-to-end verification, lane e2e-verify-1)
//
// Generates src/tests/fixtures/bylaw-golden-lots/cases.json from the tree (envelope-answer tracker + dispositions, the
// agreed units, the committed evaluator) and the golden-lot snapshot src/tests/fixtures/bylaw-golden-lots/lots.json (a
// read-only pull of the local dev DB; no DB access here). One case per "wrong" / "disclose" answer × zone; every check is
// run once and its result stored as `initial` (the evidence the report cites).
// Usage: node scripts/analysis/bylaw-validation/golden-lots-cases.mjs --check | --write
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const MODE = process.argv[2];
if (MODE !== '--check' && MODE !== '--write') { console.error('usage: golden-lots-cases.mjs --check | --write'); process.exit(2); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SPD = path.join(ROOT, 'src/tests/fixtures/bylaw-golden-lots');
const H = await import(path.join(ROOT, 'src/tests/helpers/bylaw-golden-lots.ts'));
const A = await H.loadAssembly(ROOT);
const lotsDoc = JSON.parse(fs.readFileSync(path.join(SPD, 'lots.json'), 'utf8'));
const LOTS = new Map(lotsDoc.lots.map((l) => [l.id, l]));
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const tracker = read('docs/reports/generated/envelope-answer-tracker.json');
const disp = new Map(read('docs/reference/envelope-answer-dispositions.json').dispositions.map((d) => [d.unit_id, d]));
const prov = new Map(read('docs/reference/bylaw-provisions.json').rows.map((r) => [r.regulation_id, r]));
const vocab = read('scripts/seeds/bylaw/vocab.json');
const ACC = new Set(Object.keys(vocab.accessory_structure_use || {}).filter((k) => k !== '$comment'));
const CHZ = { '10.10': ['R'], '10.20': ['RD'], '10.40': ['RS'], '10.60': ['RT'], '10.80': ['RM'] };
const ALLZ = ['R', 'RD', 'RS', 'RT', 'RM'];
const r4 = (x) => Math.round(x * 1e6) / 1e6;
const L = (id) => { const g = LOTS.get(id); if (!g) throw new Error(`lot ${id} missing`); return g; };
const f = (id) => L(id).lot.vars.lot_frontage_m; const dep = (id) => L(id).lot.vars.lot_depth_m;

function zonesOf(u) { const z = (u.application?.zones || []).filter((x) => x !== 'any'); if (z.length) return z; const ch = u.unit_id.split('.').slice(0, 2).join('.'); return CHZ[ch] || ALLZ; }
function regOf(id) { return id.split('#')[0]; }
function familyOf(id) {
  const reg = regOf(id); const p = prov.get(reg); const parts = reg.replace(/\(.*$/, '').split('.');
  const art = /^10\.(10|20|40|60|80)$/.test(parts.slice(0, 2).join('.')) ? ['10', 'x', ...parts.slice(2)].join('.') : parts.join('.');
  return `${art} ${p?.article_title || ''}`.trim();
}
function scenarioOf(u) {
  const bt = u.application?.building_types || ['any']; const lc = u.application?.lot_conditions || [];
  const flags = {}; if (lc.includes('lawfully_existing')) flags.lawfully_existing = true;
  let s;
  if (bt.includes('garden_suite')) s = { building_type: 'garden_suite' };
  else if (bt.includes('laneway_suite')) s = { building_type: 'laneway_suite' };
  else if (bt.includes('secondary_suite')) { s = { building_type: bt.find((t) => ['detached_house', 'detached_houseplex', 'semi_detached_houseplex', 'semi_detached_house'].includes(t)) || 'detached_house' }; flags.has_secondary_suite = true; }
  else if (bt.includes('any')) s = { building_type: 'detached_house' };
  else s = { building_type: ['detached_house', 'detached_houseplex', 'semi_detached_house', 'semi_detached_houseplex', 'townhouse', 'apartment_building', 'ancillary_building', 'duplex', 'triplex', 'fourplex', 'non_residential_building'].find((t) => bt.includes(t)) || bt[0] };
  if (Object.keys(flags).length) s.flags = flags;
  return s;
}
// golden-lot categories that make a lot "affected" by an answer: from the unit's own lot conditions and the answer's P5.12 code
const COND_CATS = { corner_lot: ['corner', 'lane_corner'], through_lot: ['through', 'through2'], abuts_lane: ['lane', 'lane_deep', 'lane_corner', 'lane_le6', 'lane_narrow'], major_street: ['major'],
  heritage_property: ['heritage', 'heritage_rt'], no_rear_lot_line: ['triangle'], depth_band: ['deep', 'lane_deep'], label_value: ['label_u', 'label_u2', 'label_u_rt', 'label_a_rt'] };
const CODE_CATS = { triangular_lot: ['triangle'], heritage_designated: ['heritage', 'heritage_rt'], through_lot_front_line: ['through', 'through2'], sixplex_height_conditions: ['sixplex'],
  major_street_forms_not_modelled: ['major'], townhouse_driveway_width: ['major'], laneway_upper_side_stepback: ['lane', 'lane_deep', 'lane_corner'] };
const wantCats = (u, code) => new Set([...(u.application?.lot_conditions || []).flatMap((x) => COND_CATS[x] || []), ...(CODE_CATS[code] || [])]);
const isAcc = (u) => (u.application?.uses || []).map((x) => (x && typeof x === 'object' ? x.token : x)).some((x) => ACC.has(x));

// ------------------------------------------------------------------ hand-specified effect checks (value-bearing answers)
// Each: unit → { zone → [ [lotId, scenario, target, expect, rationale] ] , class?, finding?, note }
const GS = { building_type: 'garden_suite' };
const LS = { building_type: 'laneway_suite' };
const PLAIN = { R: '5403712', RD: '5118342', RS: '5124393', RT: '5071329', RM: '5059565' };
const DEEP = { R: '5363005', RD: '5159934', RS: '5131054', RT: '5156521', RM: '5175239' };
const LANE = { R: '5401117', RD: '5463382', RS: '5357962', RT: '5326708', RM: '5498745' };
const each = (map, fn) => Object.fromEntries(Object.entries(map).map(([z, id]) => [z, [fn(id, z)]]));
const sideGS = (id) => r4(Math.max(0.6, Math.min(0.1 * f(id), 3.0)));
const rear755 = (id) => r4(Math.max(7.5, 0.25 * dep(id)));
const HAND = {
  '150.7.20.1(2)#whole': { z: each(PLAIN, (id) => [id, GS, 'buildings_on_lot', { value: 1 }, 'one ancillary building with a garden or laneway suite per lot']) },
  '150.8.20.1(2)#whole': { z: each(LANE, (id) => [id, LS, 'buildings_on_lot', { value: 1 }, 'one ancillary building with a laneway or garden suite per lot']) },
  '150.7.60.20(2)#(2)(A)': { z: each(DEEP, (id) => [id, { ...GS, vars: { proposed_height_m: 6.3 } }, 'rear_setback_m', { value: 3.15 }, `lot depth ${dep(id).toFixed(2)} m > 45.0 m: max(1.5, 0.5 × 6.3 m suite height) = 3.15 m`]),
    note: 'the suite height is a scenario input (P5.5 search); without it the evaluator answers not_evaluated:missing_input:proposed_height_m, which the step supplies' },
  '150.7.60.20(2)#(2)(B)': { z: each(PLAIN, (id) => [id, GS, 'rear_setback_m', { value: 1.5 }, `lot depth ${dep(id).toFixed(2)} m ≤ 45.0 m, not a through lot: 1.5 m`]) },
  '150.7.60.20(3)#(3)(B)': { z: each(PLAIN, (id) => [id, GS, 'rear_setback_m', { value: 1.5 }, 'not a through lot ("all other cases"): 1.5 m']) },
  '150.7.60.20(5)#(5)(B)': { z: { ...each(PLAIN, (id) => [id, GS, 'side_setback_m', { value: sideGS(id) }, `max(0.6, min(10 % × ${f(id).toFixed(3)} m, 3.0)) = ${sideGS(id)} m`]), RT: [['5071329', GS, 'side_setback_m', { value: sideGS('5071329') }, `max(0.6, min(10 % × ${f('5071329').toFixed(3)}, 3.0))`], ['5106285', GS, 'side_setback_m', { value: 3.0 }, `frontage ${f('5106285').toFixed(1)} m: the 3.0 m cap binds`]] } },
  '150.7.60.20(5)#(5)(A)': { z: each(PLAIN, (id) => [id, GS, 'side_setback_m', { applied_includes: false, unit_applies: false, value: sideGS(id) }, 'openings taken as absent (vocab default suite_wall_openings=false, M-197): the with-openings arm is not bound']) },
  '150.7.60.20(6)#(6)(C)': { z: { R: [{ kind: 'reach', lot: '5396831', scenario: GS, rationale: 'corner lot (20 Athletic Ave): the corner arm (C) applies' }, { kind: 'excluded', lot: '5403712', scenario: GS, why: 'condition corner_lot', rationale: 'interior lot (36 Hallam St): (C) is set aside, so 1.5 m is not every garden suite\'s default (M-179(2)); (5)(B) answers there (proven under 150.7.60.20(5)(B))' }],
    RD: [{ kind: 'reach', lot: '5144129', scenario: GS, rationale: 'corner lot (68 Aviemore Dr): the corner arm (C) applies' }, { kind: 'excluded', lot: '5118342', scenario: GS, why: 'condition corner_lot', rationale: 'interior lot: (C) is set aside' }] },
    owed: 'suite_side_setbacks_m (M-198(2): the larger of (A) — the Layer 2 front_setback_m proxy averaged with the principal\'s required side yard, min 1.5 m — and (C) max(principal side yard, 1.5 m); disposition owed M-198 → P5.13)',
    note: 'the corner-lot-only half is proven (the arm applies on corner lots and is set aside on interior lots). The value needs the principal building\'s side yard and the Layer 2 front-setback proxy (cross-structure, M-198(2)); the disposition owes it to P5.13. Today the evaluator answers not_evaluated:missing_input:side_setback_m on a corner lot, which is the input ① supplies' },
  '150.7.60.20(3)#(3)(A)': { z: { R: [{ kind: 'reach', lot: '5370045', scenario: GS, rationale: 'through lot (27 Gibson Ave): the through-lot arm (A) applies' }, { kind: 'reach', lot: '5397229', scenario: GS, rationale: 'through lot (167 Ashdale Ave): (A) applies' }, { kind: 'excluded', lot: '5403712', scenario: GS, why: 'condition through_lot', rationale: 'not a through lot: (A) is set aside and (B) 1.5 m answers (proven under 150.7.60.20(3)(B))' }] },
    owed: 'suite_rear_setback_m (M-198(1): max(the subject lot\'s Layer 2 front_setback_m as the neighbour proxy, 1.5 m), disclosed suite_lot_fact_unknown; P5.13)',
    note: 'M-198(1) (69a:326): "the neighbour\'s required front yard is approximated by the subject lot\'s Layer 2 front_setback_m, and the larger of (A) and (B) 1.5 m is taken". The proxy is a Layer 2 value that today\'s path does not supply (the evaluator answers not_evaluated:missing_input:abutting_front_setback_m on both through lots), so the value is owed to ① (P5.13)' },
  '150.7.60.40(1)#(1)(A)': { z: each(PLAIN, (id) => [id, { ...GS, vars: { distance_to_residential_m: 6.0 } }, 'height_m', { value: 4.0 }, 'suite 6.0 m (< 7.5 m) from the house: 4.0 m']) },
  '150.7.60.40(1)#(1)(B)': { z: each(PLAIN, (id) => [id, { ...GS, vars: { distance_to_residential_m: 8.0 } }, 'height_m', { value: 6.3 }, 'suite 8.0 m (≥ 7.5 m) from the house: 6.3 m']) },
  '150.7.60.40(2)#whole': { z: each(PLAIN, (id) => [id, GS, 'height_storeys', { value: 2 }, 'a garden suite may have two storeys']) },
  '150.7.60.50(4)#(4)(A)': { z: each(PLAIN, (id) => [id, GS, 'gfa_m2', { value: 120 }, 'garden-suite maximum GFA 120 m²']) },
  '150.7.60.50(4)#(4)(B)': { z: each(PLAIN, (id) => [id, { ...GS, vars: { height_storeys: 1 } }, 'gfa_m2', { value: 60 }, 'one-storey garden suite: 60 m²']) },
  '150.7.60.70(1)#(1)(A)': { z: { ...each(PLAIN, (id) => [id, GS, 'lot_coverage_pct', { value: 45 }, 'lot with an LC overlay: max(45 %, overlay LC) = 45 %']), R: [['5403712', GS, 'lot_coverage_pct', { value: 'unregulated' }, 'R lot with no LC overlay: unregulated (the expression\'s own else-arm)'], ['5306058', GS, 'lot_coverage_pct', { value: 45 }, 'R lot with LC 35: max(45 %, 35 %) = 45 %']] } },
  '150.7.60.70(1)#(1)(B)': { z: each(PLAIN, (id) => [id, GS, 'ancillary_coverage_pct', { value: 20 }, 'all ancillary buildings capped at 20 % on their own target']) },
  '150.8.60.30(1)#(1)(A)': { z: each(LANE, (id) => [id, { ...LS, vars: { proposed_height_m: 4.0 } }, 'separation_m', { value: 4.0 }, 'laneway suite no taller than 4.0 m: 4.0 m separation']) },
  '150.8.60.30(1)#(1)(B)': { z: each(LANE, (id) => [id, { ...LS, vars: { proposed_height_m: 6.3 } }, 'separation_m', { value: 7.5 }, 'laneway suite taller than 4.0 m: 7.5 m separation']) },
  '150.8.60.30(5)#whole': { z: each(LANE, (id) => [id, LS, 'building_length_m', { value: 10 }, 'laneway-suite maximum length 10.0 m']) },
  '150.8.60.30(6)#whole': { z: each(LANE, (id) => [id, LS, 'building_width_m', { value: 8 }, 'laneway-suite maximum width 8.0 m']) },
  '150.8.60.40(1)#(1)(B)': { z: each(LANE, (id) => [id, { ...LS, vars: { distance_to_residential_m: 8.0 } }, 'height_m', { value: 6.3 }, 'laneway suite 8.0 m (≥ 7.5 m) from the house: 6.3 m']) },
  '150.8.60.20(2)#(2)(A)': { z: each(LANE, (id) => [id, LS, 'rear_setback_m', { value: 1.0, winner: '150.8.60.20(2)#(2)(B)' }, 'openings taken as none: the 0.0 m arm is not bound; the 1.0 m (2)(B) setback answers']) },
  '150.8.60.20(3)#(3)(D)': { z: each(LANE, (id) => [id, { ...LS, vars: { proposed_height_m: 4.0 } }, 'side_setback_m', { value: 1.0 }, 'a 4.0 m laneway suite (no part above 4.0 m): the default side setback is 1.0 m']),
    note: 'E2E-F-03 fixed (bylaw-fix-1, 2026-10-20): (3)(C) carries its height threshold (proposed_height_m > 4.0 m, "beginning from a height of 4.0 metres"), so a 4.0 m suite takes (D) 1.0 m. Before: 1.5 m from (3)(C)' },
  '150.8.60.20(3)#(3)(A)': { z: each(LANE, (id) => [id, { ...LS, vars: { proposed_height_m: 4.0 } }, 'side_setback_m', { value: 1.0 }, 'side lot line facts not held: "as keyed the 1.0 m default answers"']),
    note: 'E2E-F-03 fixed (bylaw-fix-1, 2026-10-20): the 1.0 m default answers. Before: 1.5 m from (3)(C)' },
  '10.10.40.1(2)#(2)(A)': { z: { R: [['5403712', { building_type: 'detached_house' }, 'buildings_on_lot', { value: 1 }, 'one residential building per lot']] } },
  '10.10.40.1(3)#(3)(A)': { z: { R: [['5265152', { building_type: 'detached_house' }, 'dwelling_units_max', { value: 4 }, 'R (f9.0; u4): the u label caps dwelling units at 4'], ['5403712', { building_type: 'detached_house' }, 'dwelling_units_max', { value: 'unregulated', unit_applies: false }, 'R (d0.6), no u label: no u cap']] } },
  '10.60.40.1(2)#(2)(A)': { z: { RT: [['5152702', { building_type: 'detached_house' }, 'dwelling_units_max', { value: 97 }, 'RT (u97): the u label caps dwelling units at 97'], ['5071329', { building_type: 'detached_house' }, 'dwelling_units_max', { value: 'unregulated', unit_applies: false }, 'RT (au220.0), no u label: no cap']] } },
  '10.10.40.70(4)#(4)(D)': { z: { R: [['5403712', { building_type: 'detached_houseplex' }, 'side_setback_m', { value: 0.45 }, 'detached houseplex, no windows or doors by default (M-205): 0.45 m'], ['5377946', { building_type: 'detached_houseplex' }, 'side_setback_m', { value: 0.45 }, 'as above (15.2 m frontage)']] },
    note: 'E2E-F-04 fixed (bylaw-fix-1, 2026-10-20): "may be reduced to" is a backward displacement trigger, so 10.10.40.70(4) displaces (3)(A)/(B) and the 0.45 m blank-wall default answers (M-205(2)). Before: 0.9 m from (3)(A)' },
  '10.10.40.70(4)#(4)(E)': { z: { R: [['5403712', { building_type: 'semi_detached_houseplex' }, 'side_setback_m', { value: 0.45 }, 'semi-detached houseplex, blank side wall by default: 0.45 m']] }, note: 'E2E-F-04 fixed: as (4)(D). Before: 0.9 m from (3)(A)' },
  '10.20.30.20(1)#(1)(C)': { z: { RD: [['5271366', { building_type: 'townhouse', flags: { all_units_front_street: true, unit_not_fronting_street: false } }, 'required_lot_frontage_m', { value: 20 }, 'major street, 4 units fronting the street, no driveway (M-176(1) default): 4 × (6.0 − 1.0) = 20.0 m'], ['5309349', { building_type: 'townhouse', flags: { all_units_front_street: true, unit_not_fronting_street: false } }, 'required_lot_frontage_m', { value: 20 }, 'as above (corner, major street)']] },
    note: 'townhouse forms are deferred (M-214(3)); the street-fronting design choice is taken as met (M-172) in the scenario' },
  '10.40.30.20(1)#(1)(D)': { z: { RS: [['5161500', { building_type: 'townhouse', flags: { all_units_front_street: true, unit_not_fronting_street: false } }, 'required_lot_frontage_m', { value: 20 }, '4 × 5.0 m (no driveway)'], ['5162565', { building_type: 'townhouse', flags: { all_units_front_street: true, unit_not_fronting_street: false } }, 'required_lot_frontage_m', { value: 20 }, '4 × 5.0 m']] } },
  '10.80.30.20(1)#(1)(D)': { z: { RM: [['5349061', { building_type: 'townhouse', flags: { all_units_front_street: true, unit_not_fronting_street: false } }, 'required_lot_frontage_m', { value: 20 }, '4 × 5.0 m (no driveway)'], ['5163532', { building_type: 'townhouse', flags: { all_units_front_street: true, unit_not_fronting_street: false } }, 'required_lot_frontage_m', { value: 20 }, '4 × 5.0 m']] } },
  '10.20.30.40(1)#(1)(D)': { z: { RD: [['5118342', { building_type: 'detached_house', flags: { has_secondary_suite: true } }, 'lot_coverage_pct', { value: 45 }, 'detached house with a secondary suite on an LC-mapped lot: 45 %'], ['5263242', { building_type: 'detached_houseplex' }, 'lot_coverage_pct', { value: 45 }, 'detached houseplex: 45 %']] } },
  '10.40.30.40(1)#(1)(D)': { z: { RS: [['5124393', { building_type: 'detached_house', flags: { has_secondary_suite: true } }, 'lot_coverage_pct', { value: 45 }, 'house with a secondary suite: 45 %'], ['5131054', { building_type: 'detached_houseplex' }, 'lot_coverage_pct', { value: 45 }, 'detached houseplex: 45 %']] } },
  '10.20.40.1(4)#(4)(A)': { z: { RD: [['5271366', { building_type: 'townhouse' }, 'dwelling_unit_width_m', { value: 5 }, 'no individual private driveway (M-176(1) default): 5.0 m unit width']] } },
  '10.20.40.10(4)#(4)(A)': { z: { RD: [['5118342', { building_type: 'detached_house', flags: { flat_or_shallow_roof: true } }, 'main_wall_height_m', { value: 7.5 }, 'flat roof, HT 10.0: max(7.2, 10.0 − 2.5) = 7.5 m'], ['5263242', { building_type: 'detached_house', flags: { flat_or_shallow_roof: true } }, 'main_wall_height_m', { value: 7.2 }, 'flat roof, HT ≤ 9.7: max(7.2, H − 2.5) = 7.2 m']] } },
  '10.20.40.10(7)#(7)(B)': { z: { RD: [['5118342', { building_type: 'detached_house' }, 'element_width_pct', { value: 40 }, 'dormers taken at the 40 % share']] } },
  '10.40.40.10(5)#(5)(B)': { z: { RS: [['5124393', { building_type: 'detached_house' }, 'element_width_pct', { value: 40 }, 'dormers taken at the 40 % share']] } },
  '10.20.40.70(2)#(2)(A)': { z: { RD: ['5118342', '5159934', '5075945'].map((id) => [id, { building_type: 'detached_house' }, 'rear_setback_m', { value: rear755(id) }, `max(7.5, 25 % × ${dep(id).toFixed(3)} m) = ${rear755(id)} m`]) } },
  '10.40.40.70(2)#(2)(A)': { z: { RS: ['5124393', '5131054'].map((id) => [id, { building_type: 'detached_house' }, 'rear_setback_m', { value: rear755(id) }, `max(7.5, 25 % × ${dep(id).toFixed(3)} m)`]) } },
  '10.40.40.70(2)#(2)(B)': { z: { RS: ['5124393', '5131054'].map((id) => [id, { building_type: 'detached_house' }, 'rear_setback_m', { value: rear755(id) }, `one greater-of with the 7.5 m leaf: ${rear755(id)} m`]) } },
  '10.80.40.70(2)#(2)(A)': { z: { RM: ['5059565', '5175239'].map((id) => [id, { building_type: 'detached_house' }, 'rear_setback_m', { value: rear755(id) }, `max(7.5, 25 % × ${dep(id).toFixed(3)} m)`]) } },
  '10.80.40.70(2)#(2)(B)': { z: { RM: ['5059565', '5175239'].map((id) => [id, { building_type: 'detached_house' }, 'rear_setback_m', { value: rear755(id) }, 'one greater-of with the 7.5 m leaf']) } },
  '10.40.40.20(4)#(4)(A)': { z: { RS: [['5161500', { building_type: 'townhouse' }, 'building_length_m', { value: 19 }, 'townhouse on a lot abutting a major street: 19.0 m ("Despite … (1)")'], ['5162565', { building_type: 'townhouse' }, 'building_length_m', { value: 19 }, 'as above']] },
    note: 'E2E-F-05 fixed (bylaw-fix-1, 2026-10-20; Spec 69a M-230, operator CHAT-5): the mis-cited "Despite regulation 10.20.40.20(1)" is read as 10.40.40.20(1) (vocab citation_corrections), so 19.0 m answers, disclosed. Before: the 19.0 m townhouse length is applied but the general 17.0 m (10.40.40.20(1)) still wins as the smaller maximum; the by-law text says "Despite regulation 10.20.40.20(1)" (an RD cross-reference), so no displacement link to 10.40.40.20(1) is made' },
  '10.80.30.20(1)#(1)(B)': { z: { RM: [['5349061', { building_type: 'detached_house' }, 'required_lot_frontage_m', { value: 12 }, 'RM (u4), no f label, major street: detached 12.0 m'], ['5349061', { building_type: 'semi_detached_house' }, 'required_lot_frontage_m', { value: 15 }, 'semi-detached 15.0 m']] } },
  '10.80.40.10(2)#(2)(A)': { z: { RM: [['5059565', { building_type: 'detached_house' }, 'main_wall_height_m', { value: 7.5 }, 'HT 10.0: max(7.0, 10.0 − 2.5) = 7.5 m'], ['5304047', { building_type: 'detached_house' }, 'main_wall_height_m', { value: 7.0 }, 'HT 8.5: max(7.0, 6.0) = 7.0 m']] } },
  '10.80.40.10(2)#(2)(B)': { z: { RM: [['5059565', { building_type: 'detached_house' }, 'main_wall_height_m', { value: 7.5 }, 'HT 10.0: 7.5 m'], ['5304047', { building_type: 'detached_house' }, 'main_wall_height_m', { value: 7.0 }, 'HT 8.5: 7.0 m']] } },
  '10.60.30.10(1)#(1)(B)': { z: { RT: [['5106285', { building_type: 'semi_detached_houseplex' }, 'required_lot_area_m2', { value: 110 }, 'RT (a220): 50 % × 220 = 110 m²']] } },
  '10.40.30.20(1)#(1)(C)': { z: { RS: [['5124393', { building_type: 'semi_detached_houseplex' }, 'required_lot_frontage_m', { value: 7.5 }, 'no f label: 50 % × 15.0 = 7.5 m'], ['5131054', { building_type: 'semi_detached_houseplex' }, 'required_lot_frontage_m', { value: 9 }, 'f18.0: 50 % × 18.0 = 9.0 m']] } },
  '10.5.40.40(5)#(5)(B)': { z: { R: [['5403712', { building_type: 'detached_house' }, 'fsi', { applied_includes: false, value: 0.6 }, 'a note on what FSI counts: never changes the FSI (d0.6 answers 0.6)']], RD: [['5263242', { building_type: 'detached_house' }, 'fsi', { applied_includes: false, value: 0.6 }, 'd0.6 answers 0.6']] } },
  '10.5.40.20(2)#whole': { z: { R: [['5403712', { building_type: 'detached_house' }, 'building_length_m', { applied_includes: false }, 'not a length rule: never applied']], RS: [['5124393', { building_type: 'detached_house' }, 'building_length_m', { applied_includes: false, value: 17 }, 'RS length answered unchanged: 17.0 m']] } },
  '10.5.40.30(1)#whole': { z: { R: [['5403712', { building_type: 'detached_house' }, 'building_depth_m', { applied_includes: false, value: 17 }, 'procedural: R depth answered unchanged (17.0 m)']] } },
  '10.5.40.30(2)#whole': { z: { R: [['5403712', { building_type: 'detached_house' }, 'building_depth_m', { applied_includes: false, value: 17 }, 'not a depth rule: R depth unchanged (17.0 m)']] } },
  '10.10.40.10(6)#whole': { z: { R: [['5403712', { building_type: 'detached_house' }, 'height_m', { applied_includes: false, value: 11 }, 'the 1.2 m entrance height never limits the envelope: height answers HT 11.0']] }, owed: 'disclosures' },
  '10.20.40.10(6)#whole': { z: { RD: [['5118342', { building_type: 'detached_house' }, 'height_m', { applied_includes: false, value: 10 }, 'the 1.2 m entrance height never limits the envelope: height answers HT 10.0']] }, owed: 'disclosures' },
  '150.7.75.1(1)#(1)(B)': { z: Object.fromEntries(Object.entries(PLAIN).map(([z, id]) => [z, [{ kind: 'excluded', lot: id, scenario: GS, why: 'use energy_device', rationale: 'a solar device on the suite is accessory scope: never a limit on the principal building' }]])) },
  '150.7.75.1(1)#(1)(A)': { z: Object.fromEntries(Object.entries(PLAIN).map(([z, id]) => [z, [{ kind: 'excluded', lot: id, scenario: GS, why: 'use energy_device', rationale: 'follows the suite\'s setbacks; never limits the principal building' }]])) },
  '150.7.60.20(2)#(2)(C)': { z: Object.fromEntries(Object.entries(PLAIN).map(([z, id]) => [z, [{ kind: 'excluded', lot: id, scenario: GS, why: 'condition suite_wall_openings', rationale: 'openings taken as absent (vocab default suite_wall_openings=false, M-197): the 3.0 m with-openings arm is not bound' }]])) },
  '10.40.40.1(7)#(7)(A)': { z: { RS: [['5124393', { building_type: 'semi_detached_houseplex', vars: { dwelling_units: 2 } }, 'bedrooms', { value: 8 }, 'two-unit houseplex: 4 × 2 = 8 bedrooms (reported as max_bedrooms)']] }, owed: 'disclosures' },
  // value-bearing parts of answers whose disclosure is owed to ① (the "never applied / keeps" half is provable today)
  '10.40.40.10(2)#(2)(C)': { z: { RS: [['5161500', { building_type: 'townhouse' }, 'main_wall_height_m', { status: 'not_applicable' }, 'RS townhouse on a major street: the main-wall limit does not apply'], ['5162565', { building_type: 'townhouse' }, 'main_wall_height_m', { status: 'not_applicable' }, 'as above']] }, owed: 'disclosures' },
  '10.10.40.40(2)#(2)(A)': { z: { R: [['5403712', { building_type: 'detached_house' }, 'fsi', { applied_includes: false, value: 0.6 }, 'R (d0.6) new build: the pre-1953 0.69 relief is never applied; FSI stays 0.6']] }, owed: 'disclosures' },
  '10.5.40.10(3)#(3)(A)': { z: { R: [['5403712', { building_type: 'detached_house' }, 'height_m', { applied_includes: false, value: 11 }, 'rooftop equipment allowance never raises the envelope: height answers HT 11.0']], RD: [['5118342', { building_type: 'detached_house' }, 'height_m', { applied_includes: false, value: 10 }, 'RD HT 10.0 unchanged']] }, owed: 'disclosures' },
  // storeys not capped / FSI not applicable for houseplexes and suites (verified_by_lock)
  '10.10.40.10(3)#(3)(C)': { z: { R: [['5403712', { building_type: 'detached_houseplex' }, 'height_storeys', { uncapped: true }, 'R houseplex: storeys not capped'], ['5403712', { building_type: 'semi_detached_houseplex' }, 'height_storeys', { uncapped: true }, 'semi houseplex: not capped']] } },
  '10.20.40.10(3)#(3)(C)': { z: { RD: [['5118342', { building_type: 'detached_houseplex' }, 'height_storeys', { uncapped: true }, 'RD houseplex: not capped'], ['5263242', { building_type: 'detached_houseplex' }, 'height_storeys', { uncapped: true }, 'RD houseplex (d label): not capped']] } },
  '10.40.40.10(3)#(3)(C)': { z: { RS: [['5124393', { building_type: 'detached_houseplex' }, 'height_storeys', { uncapped: true }, 'RS houseplex: not capped'], ['5355622', { building_type: 'semi_detached_houseplex' }, 'height_storeys', { uncapped: true }, 'RS semi houseplex: not capped']] } },
  '10.60.40.10(2)#(2)(C)': { z: { RT: [['5071329', { building_type: 'detached_houseplex' }, 'height_storeys', { uncapped: true }, 'RT houseplex: not capped']] } },
  '10.80.40.10(3)#(3)(C)': { z: { RM: [['5059565', { building_type: 'detached_houseplex' }, 'height_storeys', { uncapped: true }, 'RM houseplex: not capped']] } },
  '10.10.40.40(1)#(1)(C)': { z: { R: [['5403712', { building_type: 'detached_houseplex' }, 'fsi', { status: 'not_applicable' }, 'R houseplex: no FSI'], ['5403712', { building_type: 'detached_house', flags: { has_secondary_suite: true } }, 'fsi', { status: 'not_applicable' }, 'R house with a secondary suite: no FSI']] } },
  '10.20.40.40(1)#(1)(C)': { z: { RD: [['5263242', { building_type: 'detached_houseplex' }, 'fsi', { status: 'not_applicable' }, 'RD houseplex: no FSI'], ['5263242', { building_type: 'detached_house', flags: { has_secondary_suite: true } }, 'fsi', { status: 'not_applicable' }, 'RD house with a suite: no FSI']] } },
  '10.40.40.40(1)#(1)(C)': { z: { RS: [['5355622', { building_type: 'detached_house', flags: { has_secondary_suite: true } }, 'fsi', { status: 'not_applicable' }, 'RS house with a suite: no FSI'], ['5355622', { building_type: 'detached_houseplex' }, 'fsi', { status: 'not_applicable' }, 'RS houseplex: no FSI']] } },
  '10.60.40.40(1)#(1)(C)': { z: { RT: [['5071329', { building_type: 'detached_house', flags: { has_secondary_suite: true } }, 'fsi', { status: 'not_applicable' }, 'RT house with a suite: no FSI']] } },
  '10.40.40.40(1)#(1)(D)': { z: { RS: [['5161500', { building_type: 'townhouse' }, 'fsi', { status: 'not_applicable' }, 'RS townhouse (≤ 60 units) on a major street: no FSI']] } },
  '10.60.40.40(1)#(1)(D)': { z: { RT: [['5070752', { building_type: 'townhouse' }, 'fsi', { status: 'not_applicable' }, 'RT townhouse (≤ 60 units) on a major street: no FSI']] } },
  // M-180: the more permissive of the Chapter 900 exception and the zone houseplex / suite rule
  '10.40.30.1(2)#whole': { z: { RS: [['5019870', { building_type: 'detached_houseplex' }, 'lot_coverage_pct', { value: 45, disclosure_match: 'more permissive than the exception' }, 'RS (x256): exception 40 % vs houseplex 45 %: 45 % prevails, the exception value disclosed'], ['5024691', { building_type: 'detached_house', flags: { has_secondary_suite: true } }, 'lot_coverage_pct', { value: 45, disclosure_match: 'more permissive than the exception' }, 'RS (x256), house with a secondary suite: 45 %']] } },
  '10.60.30.1(2)#whole': { z: { RT: [['5017743', { building_type: 'detached_houseplex' }, 'lot_coverage_pct', { value: 50 }, 'RT (x97): exception 50 % vs houseplex 45 %: the exception is more permissive and prevails']] } },
  '10.60.40.1(5)#whole': { z: { RT: [['5135296', { building_type: 'detached_houseplex' }, 'height_storeys', { uncapped: true, disclosure_match: 'more permissive than the exception' }, 'RT (x38): exception 3 storeys vs houseplex not capped: not capped, disclosed']] } },
  '10.80.40.1(5)#whole': { z: { RM: [['5508019', { building_type: 'detached_houseplex' }, 'height_m', { value: 10, disclosure_match: 'more permissive than the exception' }, 'RM (x22, heritage): exception detached 9.5 m vs houseplex 10.0 m: 10.0 m, disclosed'], ['5510075', { building_type: 'detached_houseplex' }, 'height_m', { value: 10, disclosure_match: 'more permissive than the exception' }, 'as above'], ['5511363', { building_type: 'detached_houseplex' }, 'height_m', { value: 10, disclosure_match: 'more permissive than the exception' }, 'RM (x18): exception by_type detached 9.5 m vs houseplex HT 10.0 (no HT overlay: zone default)']] },
    note: 'E2E-F-06 fixed (bylaw-fix-1, 2026-10-20): the by_type lookup of an exception-layer unit reads the M-180(1) alias, and M-180(2) compares the zone rule the exception\x27s own "Despite" dropped. Before: x22 lots PASS; on the x18 lot (a by_type exception table naming detached_house but not detached_houseplex) the M-180(1) alias does not reach the by_type lookup and the result is not_evaluated:by_type_unlisted:detached_houseplex' },
  '10.80.30.1(2)#whole': { z: { RM: [['5511363', { building_type: 'detached_house', flags: { has_secondary_suite: true } }, 'lot_coverage_pct', { value: 'unregulated', disclosure_match: 'more permissive than the exception' }, 'RM (x18), house with a suite: zone suite rule (no LC overlay → unregulated) is more permissive than exception 33 %'], ['5511363', { building_type: 'detached_houseplex' }, 'lot_coverage_pct', { value: 'unregulated', disclosure_match: 'more permissive than the exception' }, 'RM (x18), houseplex: as above']] },
    note: 'E2E-F-06 fixed (bylaw-fix-1, 2026-10-20): the by_type lookup of an exception-layer unit reads the M-180(1) alias, and M-180(2) compares the zone rule the exception\x27s own "Despite" dropped. Before: the suite arm passes; the houseplex arm is not_evaluated:by_type_unlisted:detached_houseplex (x18 by_type table)' },
  '10.10.40.1(7)#whole': { z: { R: [['5265152', { building_type: 'detached_houseplex' }, 'height_storeys', { uncapped: true, disclosure_match: 'more permissive than the exception' }, 'R (x125): exception by_type detached 3 storeys vs R houseplex not capped: not capped, the exception value disclosed'], ['5265842', { building_type: 'detached_houseplex' }, 'height_storeys', { uncapped: true, disclosure_match: 'more permissive than the exception' }, 'as above']] },
    note: 'E2E-F-06 fixed (bylaw-fix-1, 2026-10-20): the by_type lookup of an exception-layer unit reads the M-180(1) alias, and M-180(2) compares the zone rule the exception\x27s own "Despite" dropped. Before: not_evaluated:by_type_unlisted:detached_houseplex on both x125 lots' },
  // map-area literal reading (M-224): the evaluator itself attaches the disclosure
  '150.7.60.30(1)#(1)(C)': { z: { R: [['5399918', { ...GS, vars: { proposed_height_m: 6.3 } }, 'separation_m', { value: 7.5, disclosure_match: 'Coxwell', unit_applies: false }, '1966 Dundas St E (inside the Coxwell / Victoria Park / Lake Ontario area): map not held → the city-wide 7.5 m answers and the Coxwell reading is disclosed (M-224)'], ['5403712', { ...GS, vars: { proposed_height_m: 6.3 } }, 'separation_m', { value: 7.5, disclosure_match: 'Coxwell', unit_applies: false }, '36 Hallam St (outside the area): the disclosure is attached on every lot']] },
    note: 'the generous in-area value (5.0 m separation at 6.3 m) is never computed: the area map is not held, so an in-area lot is answered 7.5 m with the disclosure' },
  '600.60.40(2)#(2)(A)': { z: { RD: [['5261114', { building_type: 'detached_houseplex', vars: { dwelling_units: 6 }, flags: { lowest_level_joists_1_0_to_1_5_m_for_80_pct: true, lowest_level_ceiling_2_4_m_for_80_pct: true, lowest_level_contains_dwelling_unit: true } }, 'height_m', { value: 10.5 }, 'sixplex-area RD lot (HT 10.0), 6-unit houseplex, lowest-level design taken as met (M-172): 10.5 m'], ['5271366', { building_type: 'detached_houseplex', vars: { dwelling_units: 6 }, flags: { lowest_level_joists_1_0_to_1_5_m_for_80_pct: true, lowest_level_ceiling_2_4_m_for_80_pct: true, lowest_level_contains_dwelling_unit: true } }, 'height_m', { value: 10.5 }, 'as above (major street)']] }, owed: 'disclosures' },
};
// answers whose effect lands only in the unbuilt step (Spec 78 Phase 5, ①)
const OWED_FIELD = {
  '150.7.60.50(1)#whole': 'suite_gfa_sqm / total_gfa_sqm (suite GFA outside the lot FSI)', '150.8.60.50(1)#whole': 'suite_gfa_sqm / total_gfa_sqm (suite GFA outside the lot FSI)',
  '150.7.60.50(2)#whole': 'suite_gfa_sqm (< principal GFA, cross-structure)', '150.8.60.50(2)#whole': 'suite_gfa_sqm (< principal GFA, cross-structure)',
  '150.8.60.70(1)#(1)(A)': 'suite_coverage_option (suite outside lot coverage)', '150.8.60.50(3)#whole': 'suite_gfa_sqm (suite chapter replaces 10.5.60.50(2))',
  '150.10.40.40(1)#whole': 'suite_interior_sqm (≤ 45 % of the house)', '150.10.40.40(2)#whole': 'suite_interior_sqm (one-storey house: whole basement)',
  '150.10.20.1(2)#whole': 'unit_breakdown (one suite per host unit)', '150.10.20.1(1)#(1)(A)': 'building_class (detached + suite in scope)', '150.10.20.1(1)#(1)(B)': 'building_class (semi + suite in scope)', '150.10.1(1)#whole': 'building_class (scope sentence)',
  '10.5.40.40(2)#whole': 'attic_outside_gfa_sqm (M-229 mechanical attic; lineage entry does not cite M-229)', '10.5.40.40(3)#(3)(A)': 'basement_livable_sqm (basement outside GFA)',
  '10.5.30.20(1)#(1)(A)': 'main_front_setback_basis (M-228 through-lot front lot line; lineage entry does not cite M-228)', '10.5.30.20(1)#(1)(B)': 'main_front_setback_basis (M-228; lineage entry does not cite M-228)',
  '150.7.80.1(1)#(1)(A)': 'disclosures (suite_parking_bicycle report field)', '150.7.80.1(1)#(1)(B)': 'disclosures (suite_parking_bicycle)', '150.8.80.1(1)#(1)(A)': 'disclosures (suite_parking_bicycle)', '150.7.80.1(2)#whole': 'disclosures (suite_parking_bicycle)',
  '150.7.60.20(6)#(6)(A)': 'disclosures (undetermined site fact adjacent_lot_fronts_flanking_street, vocab undetermined_condition_disclosure)',
};
const NOT_EX_ZONE = {};
const NOT_EX = { // answer → reason (no real lot can exercise it in the local dev DB / it is pinned)
  '10.10.30.1(2)#whole': 'no authored R exception (Chapter 900.2, 63 authored) keys lot_coverage_pct, and an unauthored exception blocks every target (ruling (d)): the R exception-vs-houseplex coverage comparison cannot arise on any real R lot today (454 R lots carry an LC overlay, none with an authored coverage exception)',
};

// ------------------------------------------------------------------ build cases
const rows = tracker.rows.filter((r) => r.verdict === 'wrong' || r.verdict === 'disclose');
const cases = [];
const mk = (u, zone, raw) => {
  if (!Array.isArray(raw)) return { kind: raw.kind, unit: u.unit_id, lot: raw.lot, scenario: raw.scenario, why: raw.why, rationale: raw.rationale };
  const [lot, scenario, target, expect, rationale] = raw; return { kind: 'value', unit: u.unit_id, lot, scenario, target, expect, rationale };
};
for (const r of rows) {
  const u = A.byId.get(r.unit_id); const d = disp.get(r.unit_id) || {};
  const base = { unit_id: r.unit_id, family: familyOf(r.unit_id), verdict: r.verdict, disposition: r.disposition, tracker_state: r.state, fix_ids: r.fix_ids, disclosure_code: r.disclosure_code || null,
    corrected_value: (r.corrected_value || '').slice(0, 400) };
  if (!u) { cases.push({ ...base, zone: '(row)', class: 'OWED', owed_field: `disclosures (P5.12 \`${r.disclosure_code}\`)`, reason: 'a row answer with no keyed unit (the regulation has no agreed unit): the disclosure can come only from the step emitting the disposition code', checks: [] }); continue; }
  const h = HAND[r.unit_id];
  const zones = h ? Object.keys(h.z) : zonesOf(u);
  for (const zone of zones) {
    const c = { ...base, zone };
    if (d.scope_pin) { cases.push({ ...c, class: 'NOT_EXERCISABLE', reason: `pinned out of scope (PIN ${d.scope_pin}, operator 2026-10-20 "y pin them"): no disclosure is applied by ruling`, checks: [] }); continue; }
    if (NOT_EX_ZONE[`${r.unit_id}|${zone}`]) { cases.push({ ...c, class: 'NOT_EXERCISABLE', reason: NOT_EX_ZONE[`${r.unit_id}|${zone}`], checks: [] }); continue; }
    if (NOT_EX[r.unit_id]) { cases.push({ ...c, class: 'NOT_EXERCISABLE', reason: NOT_EX[r.unit_id], checks: [] }); continue; }
    if (h) {
      const checks = h.z[zone].map((x) => mk(u, zone, x));
      const cls = h.class || (h.owed ? 'OWED' : 'PROVEN');
      cases.push({ ...c, class: cls, finding: h.finding || null, owed_field: h.owed ? (r.disclosure_code ? `disclosures (P5.12 \`${r.disclosure_code}\`)` : 'disclosures (P5.12 code, step ①)') : null, reason: h.note || (cls === 'PROVEN' ? 'the evaluator answers the operator\'s corrected value on real lots' : ''), checks });
      continue;
    }
    // default: the effect is a disclosure / a ① composition; prove the unit reaches an affected real lot
    const s = scenarioOf(u); const acc = isAcc(u);
    const pool = [...LOTS.values()].filter((g) => g.lot.zone === zone && (s.building_type !== 'laneway_suite' || g.lot.flags.abuts_lane));
    const tried = pool.map((g) => ({ g, res: H.runCheck(A, LOTS, { kind: acc ? 'loaded' : 'reach', unit: u.unit_id, lot: g.id, scenario: s }) }));
    const want = wantCats(u, r.disclosure_code); const m = (t) => t.g.cats.some((x) => want.has(x));
    const ok = [...tried.filter((t) => t.res.pass && m(t) && t.res.observed.applies === true), ...tried.filter((t) => t.res.pass && m(t) && t.res.observed.applies !== true),
      ...tried.filter((t) => t.res.pass && !m(t) && t.res.observed.applies === true), ...tried.filter((t) => t.res.pass && !m(t) && t.res.observed.applies !== true)].slice(0, 2);
    const owedField = OWED_FIELD[r.unit_id] || (r.disclosure_code ? `disclosures (P5.12 \`${r.disclosure_code}\`)` : 'disclosures / parcel_maxbld_scenarios composition (P5.10)');
    if (!ok.length) {
      const why = [...new Set(tried.map((t) => t.res.observed.why || (t.res.observed.candidate ? '' : 'not a candidate')))].slice(0, 3).join('; ');
      cases.push({ ...c, class: 'UNREACHED', reason: `no golden lot in ${zone} reaches the unit (${why})`, checks: tried.slice(0, 2).map((t) => ({ kind: acc ? 'loaded' : 'reach', unit: u.unit_id, lot: t.g.id, scenario: s, rationale: 'affected-lot precondition' })) });
      continue;
    }
    const keyed = u.disclosure && u.disclosure !== 'none';
    cases.push({ ...c, class: 'OWED', owed_field: owedField, keyed_disclosure: keyed ? u.disclosure.slice(0, 300) : null,
      reason: `${acc ? 'accessory-structure unit (M-175): loaded on the lot, never a principal limit; ' : ''}the unit reaches the lot${keyed ? ' and carries its keyed disclosure' : ''}; the lot-level emission belongs to compute_maxbld_scenarios (①, not built)`,
      checks: ok.map((t) => ({ kind: acc ? 'loaded' : 'reach', unit: u.unit_id, lot: t.g.id, scenario: s, rationale: `${want.size ? (m(t) ? 'category-matched ' : `no ${[...want].join('/')} lot in ${zone} reaches it; `) : ''}affected lot (${t.g.cats.join('+')}): ${acc ? 'candidate' : `applies ${t.res.observed.applies === true ? 'true' : `undecided (${t.res.observed.why})`}`}` })) });
  }
}
// the field-lineage entry each OWED case is owed to (docs/reference/maxbld-field-lineage.json)
const LIN = new Map(read('docs/reference/maxbld-field-lineage.json').fields.map((x) => [x.field, x]));
for (const c of cases.filter((x) => x.class === 'OWED')) {
  const head = String(c.owed_field || '').split(/[\s(]/)[0].replace(/[^a-z_]/g, '');
  const fld = LIN.has(head) ? head : 'disclosures';
  const e = LIN.get(fld);
  c.lineage = { field: fld, owed: (e.keyed.owed || []).map((o) => `${o.what} — ${o.owner}`), regulation_ids: e.regulation_ids.length };
}
// run every check once: the initial-run evidence
// evidence is kept compact: the alternate-path notes (rule 5) are counted, other disclosures clipped
const slim = (o) => { const d = o.disclosures || []; const alt = d.filter((x) => x.startsWith('alternate compliance path')).length;
  return { ...o, disclosures: d.filter((x) => !x.startsWith('alternate compliance path')).map((x) => x.slice(0, 240)), ...(alt ? { alternate_paths: alt } : {}) }; };
for (const c of cases) for (const k of c.checks) { const res = H.runCheck(A, LOTS, k); k.initial = { pass: res.pass, observed: slim(res.observed) }; }
const usedLots = new Set(cases.flatMap((c) => c.checks.map((k) => k.lot)));
const body = JSON.stringify({ schema: 'bylaw-golden-lots/cases@1', generated: 'scripts/analysis/bylaw-validation/golden-lots-cases.mjs --write', tracker_counts: tracker.counts, n: cases.length, cases }, null, 1) + '\n';
const outFile = path.join(SPD, 'cases.json');
if (MODE === '--write') fs.writeFileSync(outFile, body);
else if (!fs.existsSync(outFile) || fs.readFileSync(outFile, 'utf8') !== body) { console.error('cases.json is stale: run with --write'); process.exitCode = 1; }
const cnt = {}; for (const c of cases) cnt[c.class] = (cnt[c.class] || 0) + 1;
const mismatch = cases.filter((c) => (c.class === 'PROVEN' || c.class === 'OWED') && c.checks.some((k) => !k.initial.pass));
const failsPassing = cases.filter((c) => c.class === 'FAILS' && c.checks.every((k) => k.initial.pass));
console.log(cnt, 'lots', usedLots.size, 'PROVEN/OWED with a failing check:', mismatch.map((c) => `${c.unit_id}@${c.zone}`).join(' '), '| FAILS fully passing:', failsPassing.map((c) => `${c.unit_id}@${c.zone}`).join(' '));
for (const c of cases.filter((x) => x.class === 'UNREACHED')) console.log('UNREACHED', c.unit_id, c.zone, c.reason);
