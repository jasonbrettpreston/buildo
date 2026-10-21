// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-240 (rule 7a v2), M-241 (N-2), M-242 (N-3), M-243 (D-3),
//            M-244 (D-1), M-245 (M-205(1) no floor); docs/specs/01-pipeline/68_mcbylaw_standard.md §6, §7.5 (rule 7a);
//            decision logs docs/reports/decisions/2026-10-20-bylaw-fix-rulings.json (the By-law Fix Rulings page) and
//            2026-10-20-chat-batch-c-bylaw.json (CHAT-21)
//
// By-law fix lane 3 (wf1/bylaw-fix-3): the seven by-law rulings the operator approved on 2026-10-20, drafted by lane
// wf1/bylaw-fix-2 from City of Toronto Committee of Adjustment examiner figures. Every assertion reads the production
// path (validate.mjs inputs → agree.mjs resolved units with the M-75 corrections → withGeneratedFields + xref displacesOf
// → evaluate.mjs loadCandidates / effective over evaluatorVocab()), as bylaw-fix-2 does.
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
const page = (id: string): string => fs.readFileSync(path.join(process.cwd(), `scripts/seeds/bylaw/pages/${id}.txt`), 'utf8');

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
void unitOf; void read; void touched; void ZONES;

// R-7a-v2 / M-240 (operator approved 2026-10-20, `2026-10-20-bylaw-fix-rulings#R-7a-v2`): rule 7a does not count a
// DEFINE unit that has no statement for the target, nor a unit whose building_types exclude the lot's type (or its
// parent); an absence ruling may name building_types and may answer not_applicable with its subject_clause. ABS-3…ABS-7
// close the 16 INV-19 cells; R lot_coverage_pct resolves by ABS-1 (M-54 amended).
describe('R-7a-v2 / M-240 — absence per (zone, building type, target); a definition or another type\'s limit is not a limit', () => {
  const PRINCIPAL = ['detached_house', 'semi_detached_house', 'detached_houseplex'];
  const abs = (r: Json): unknown[] => [r.status, r.value, r.reason ?? null, r.evidence?.kind, r.evidence?.ruling];
  it('R: lot coverage of every principal type is unregulated by ABS-1 (DEFINE and ancillary-only units no longer block)', () => {
    for (const bt of PRINCIPAL) expect([bt, ...abs(eff(lot('R', bt), 'lot_coverage_pct'))]).toEqual([bt, 'value', 'unregulated', null, 'absence', 'ABS-1']);
  });
  it('ABS-3: R building length of a house, semi or houseplex is unregulated; an R townhouse on a major street keeps 19.0 m from 10.10.40.20(1)(A)', () => {
    for (const bt of PRINCIPAL) expect([bt, ...abs(eff(lot('R', bt), 'building_length_m'))]).toEqual([bt, 'value', 'unregulated', null, 'absence', 'ABS-3']);
    const t = eff(lot('R', 'townhouse', { flags: { major_street: true } }), 'building_length_m');
    expect([t.value, t.winner]).toEqual([19, '10.10.40.20(1)#(1)(A)']);
  });
  it('ABS-4 / ABS-5: RT building length and depth of a house, semi or houseplex are unregulated; an RT townhouse on a major street keeps 19.0 m', () => {
    for (const bt of PRINCIPAL) {
      expect([bt, ...abs(eff(lot('RT', bt), 'building_length_m'))]).toEqual([bt, 'value', 'unregulated', null, 'absence', 'ABS-4']);
      expect([bt, ...abs(eff(lot('RT', bt), 'building_depth_m'))]).toEqual([bt, 'value', 'unregulated', null, 'absence', 'ABS-5']);
    }
    const t = eff(lot('RT', 'townhouse', { flags: { major_street: true } }), 'building_length_m');
    expect([t.value, t.winner]).toEqual([19, '10.60.40.20(1)#(1)(A)']);
  });
  it('ABS-6: an RD semi-detached house\'s depth is unregulated; an RD detached house keeps 19.0 m from 10.20.40.30(1)', () => {
    expect(abs(eff(lot('RD', 'semi_detached_house'), 'building_depth_m'))).toEqual(['value', 'unregulated', null, 'absence', 'ABS-6']);
    const d = eff(lot('RD', 'detached_house'), 'building_depth_m');
    expect([d.value, d.winner]).toEqual([19, '10.20.40.30(1)#whole']);
  });
  it('ABS-7: an RM detached houseplex has no length, depth or main-wall rule — not_applicable:<the clause whose subject excludes it>', () => {
    const want: Record<string, string> = { building_length_m: '10.80.40.20(1)', building_depth_m: '10.80.40.30(1)', main_wall_height_m: '10.80.40.10(2)' };
    for (const [t, clause] of Object.entries(want)) {
      const r = eff(lot('RM', 'detached_houseplex'), t);
      expect([t, r.status, r.value, r.reason, r.evidence?.kind, String(r.evidence?.ruling).startsWith('ABS-7')]).toEqual([t, 'not_applicable', null, `not_applicable:${clause}`, 'absence', true]);
    }
  });
  it('the RM detached house keeps its 17.0 m length, 19.0 m depth and x.40.10(2) main wall', () => {
    const l = lot('RM', 'detached_house');
    expect([eff(l, 'building_length_m').value, eff(l, 'building_depth_m').value, String(eff(l, 'main_wall_height_m').winner).startsWith('10.80.40.10(2)')]).toEqual([17, 19, true]);
  });
  it('INV-19 open arm: no principal cell of the four targets is not_evaluated:no_candidate (ratchet 16 → 0)', () => {
    const open: string[] = [];
    for (const zone of ZONES) for (const bt of PRINCIPAL) for (const t of ['lot_coverage_pct', 'building_length_m', 'building_depth_m', 'main_wall_height_m']) {
      const r = eff(lot(zone, bt), t);
      if (r.status === 'not_evaluated' && r.reason === 'no_candidate') open.push(`${zone} ${bt} ${t}`);
    }
    expect(open).toEqual([]);
  });
  it('the absence rulings ABS-3…ABS-7 are each executed against their pinned page and pass', () => {
    const rs = I.absences.filter((r: Json) => /^ABS-[3-7](\.\d+)?$/.test(r.id));
    expect(rs.map((r: Json) => r.id)).toEqual(['ABS-3', 'ABS-4', 'ABS-5', 'ABS-6', 'ABS-7.1', 'ABS-7.2', 'ABS-7.3']);
    const res = E.checkAbsenceRulings({ rulings: rs, pages: Object.fromEntries(rs.map((r: Json) => [r.checked_page, page(r.checked_page)])), vocab: I.vocab });
    expect({ pass: res.pass, violations: res.violations }).toEqual({ pass: true, violations: [] });
  });
  it('an absence ruling may name building_types and answer not_applicable; not_applicable needs its subject_clause; one zone|target may carry a ruling per type', () => {
    const r6 = I.absences.find((r: Json) => r.id === 'ABS-6');
    expect(r6.building_types).toEqual(['semi_detached_house']);
    const r71 = I.absences.find((r: Json) => r.id === 'ABS-7.1');
    const { subject_clause: _drop, ...noClause } = r71; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(E.verifyAbsence(noClause, page(r71.checked_page), I.vocab).violations.join(' ')).toMatch(/not_applicable needs subject_clause/);
    const two = [r6, { ...r6, id: 'ABS-99', building_types: ['semi_detached_houseplex'] }];
    expect(E.checkAbsenceRulings({ rulings: two, pages: { [r6.checked_page]: page(r6.checked_page) }, vocab: I.vocab }).violations.filter((v: string) => /two rulings/.test(v))).toEqual([]);
    expect(E.checkAbsenceRulings({ rulings: [r6, { ...r6, id: 'ABS-99' }], pages: { [r6.checked_page]: page(r6.checked_page) }, vocab: I.vocab }).violations.join(' ')).toMatch(/two rulings/);
  });
});
