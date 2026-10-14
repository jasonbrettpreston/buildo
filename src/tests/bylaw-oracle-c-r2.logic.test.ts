// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §7 (D7 link path), §8 (D8 law at the hearing date), §16 (citation-first)
// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (amendments[] tag binding), §10 (determinism lock)
// SPEC LINK: docs/specs/01-pipeline/69_mcbylaw_policy.md M-17 (double-keyed fields)
//
// McBylaw oracle C round 2 (pre-registration .cursor/mcbylaw/oracle-c/prereg-round-2.txt, R2-1 … R2-8; operator decisions
// 2026-10-14 after the grounder's GROUND-1.md): C-4 amended, C-6 regulation-level tags, the D7 parcel link with lot inputs
// from existing parcel columns (select-only), lot_input_unavailable:<input>, and the round-1 labelling / join fixes.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const OC: Json = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/oracle-c.mjs')).href);
const req = createRequire(import.meta.url);
const { parseZoningDesignation } = req(path.join(ROOT, 'scripts/lib/coa-zoning-designation.js'));

const TARGETS: Json = {
  rear_setback_m: { unit: 'm' }, side_setback_m: { unit: 'm' }, encroachment_m: { unit: 'm' }, height_m: { unit: 'm' },
  main_wall_height_m: { unit: 'm' }, rear_soft_landscaping_pct: { unit: 'pct' }, entrance_height_m: { unit: 'm' },
};
const LIM = (unit_id: string, expr: string[], condition: Json | string = 'none'): Json => ({
  unit_id, archetype: 'LIMIT', target: String(expr[0]).split(' = ')[0], bound: 'min', condition, numeric_expression: expr,
});
const ROW = (regulation_id: string, leaves: string[], extra: Json = {}): Json => ({
  regulation_id, scope: 'in_scope', row_status: 'complete', amendments: [], verbatim: '(x) text',
  clauses: leaves.map((p) => ({ leaf: true, path: p })), ...extra,
});
const BANDS = ['A:0.6:required_lot_frontage_m < 6.0 m', 'B:0.9:required_lot_frontage_m ≥ 6.0 m and required_lot_frontage_m < 12.0 m', 'C:1.2:required_lot_frontage_m ≥ 12.0 m'];
const provisions: Json = {
  rows: [
    ROW('10.20.40.70(2)', ['(2)(A)', '(2)(B)']),
    ROW('10.40.40.70(3)', ['(3)(A)', '(3)(B)', '(3)(C)', '(3)(E)'], {
      verbatim: '(3) Minimum Side Yard Setback … (E) 1.8 metres, for a non-residential building. [ By-law: 474-2023 ]',
      amendments: [{ bylaw: '474-2023', clause_path: '(3)(E)', qualifier: null }],
    }),
    ROW('10.41.40.70(3)', ['(3)(A)', '(3)(B)', '(3)(C)']),
    ROW('10.5.40.60(1)', ['(1)(F)(i)', '(1)(F)(ii)']),
    ROW('10.10.40.70(2)', ['(2)']),
    ROW('10.5.50.10(3)', ['(3)(A)', '(3)(B)']),
    ROW('10.10.40.10(1)', ['(1)(A)']),
    ROW('10.10.40.10(2)', ['(2)(A)']),
    ROW('10.80.40.10(4)', ['(4)'], { amendments: [{ bylaw: null, clause_path: '(4)', qualifier: 'PL130592 Mar_2018' }] }),
  ],
};
const statuses: Json = { '474-2023': { status: 'in_force', in_force_on: '2023-05-12', enacted_on: '2023-04-01', in_force_trigger: null } };
const band = (reg: string): Json[] => BANDS.map((s) => {
  const [c, v, cond] = s.split(':');
  return LIM(`${reg}#(3)(${c})`, [`side_setback_m = ${v} m @(3)(${c})`], { tokens: ['required_frontage_band'], if: cond });
});
const A_UNITS: Json[] = [
  LIM('10.20.40.70(2)#(2)(A)', ['rear_setback_m = 7.5 m @(2)(A)']),
  LIM('10.20.40.70(2)#(2)(B)', ['rear_setback_m = max(7.5 m @(2)(A); 25 pct × lot_depth_m @(2)(B)) @(2)']),
  ...band('10.40.40.70(3)'),
  LIM('10.40.40.70(3)#(3)(E)', ['side_setback_m = 1.8 m @(3)(E)']),
  ...band('10.41.40.70(3)'),
  LIM('10.5.40.60(1)#(1)(F)', ['encroachment_m = 1.5 m @(1)(F)(i)']),
  LIM('10.10.40.70(2)#whole', ['rear_setback_m = 7.5 m @(2)']),
  LIM('10.5.50.10(3)#(3)(A)', ['rear_soft_landscaping_pct = 50 pct @(3)(A)'], { tokens: ['frontage_band'], if: 'lot_frontage_m > 6.0 m' }),
  LIM('10.5.50.10(3)#(3)(B)', ['rear_soft_landscaping_pct = 25 pct @(3)(B)'], { tokens: ['frontage_band'], if: 'lot_frontage_m ≤ 6.0 m' }),
  LIM('10.10.40.10(1)#(1)(A)', ['height_m = overlay(HT) @(1)(A)']),
  LIM('10.10.40.10(2)#(2)(A)', ['main_wall_height_m = max(7.0 m; height_m − 2.5 m) @(2)(A)']),
  LIM('10.80.40.10(4)#whole', ['entrance_height_m = 1.2 m @(4)']),
];
const table: Json = OC.buildTable({ provisions, shards: [{ key: 'fx/all', a: { units: A_UNITS }, b: { units: A_UNITS } }], adjudications: [], targets: TARGETS });
const ctx: Json = { table, statuses, targets: TARGETS, parseZone: parseZoningDesignation };
const LOT = (o: Json = {}): Json => ({ link_status: 'linked_unique', lot_frontage_m: 10, lot_depth_m: 20, lot_area_m2: 200, corner_lot: false, ...o });
const ITEM = (o: Json): Json => ({
  variance_key: 'toronto_ca_decision_pdf|A0001/17TEY|1', application_number: 'A0001/17TEY', hearing_date: '2017-06-14',
  cited_bylaw: '569-2013', citation_kind: 'chapter_regulation', regulation_id_as_cited: '10.20.40.70(2)(A)', exception_ref: null,
  zoning_as_stated: 'RD (f12.0; d0.6)', target: 'rear_setback_m', target_status: 'mapped', required_value: 7.5, required_unit: 'm',
  parse_status: 'pair', qualified: false, lot: LOT(), ...o,
});
const ans = (o: Json): string => { const r = OC.compareItem(ITEM(o), ctx); return r.answer === 'not_comparable' ? `not_comparable:${r.reason}` : r.answer; };

describe('R2-6 labelling fixes (GROUND-1 note 7)', () => {
  it('a former_bylaw_section form is former_bylaw, even when the by-law reads 569-2013', () => {
    expect(ans({ citation_kind: 'former_bylaw_section', regulation_id_as_cited: null })).toBe('not_comparable:former_bylaw');
  });
  it('a numberless tag whose qualifier dates an order after the hearing is law_changed_after_hearing (order_qualifier_date)', () => {
    const r = OC.compareItem(ITEM({ regulation_id_as_cited: '10.80.40.10(4)', target: 'unmapped', target_status: 'unmapped', required_value: 1.2 }), ctx);
    expect([r.reason, r.d8_basis]).toEqual(['law_changed_after_hearing', 'order_qualifier_date']);
  });
});

describe('R2-7 join fixes (GROUND-1 claim 3)', () => {
  it('a statement whose @clause tag is incompatible with the cited clause is not a candidate', () => {
    expect(ans({ regulation_id_as_cited: '10.5.40.60(1)(F)(ii)', target: 'encroachment_m', required_value: 0.3 })).toBe('not_comparable:target_not_modelled');
    expect(ans({ regulation_id_as_cited: '10.5.40.60(1)(F)(i)', target: 'encroachment_m', required_value: 1.5 })).toBe('match');
  });
  it('a cited clause absent from the row clause list is clause_not_in_table (the #whole unit does not swallow it)', () => {
    expect(ans({ regulation_id_as_cited: '10.10.40.70(2)(A)(ii)', required_value: 7.5 })).toBe('not_comparable:clause_not_in_table');
    expect(ans({ regulation_id_as_cited: '10.10.40.70(2)', required_value: 7.5 })).toBe('match');
  });
});

describe('R2-1 C-4 amended', () => {
  it('(c) a pinned unit whose condition is false on the notice label facts is citation_condition_conflict', () => {
    expect(ans({ regulation_id_as_cited: '10.41.40.70(3)(A)', target: 'side_setback_m', required_value: 0.9, zoning_as_stated: 'RS (f10.5)' })).toBe('not_comparable:citation_condition_conflict');
    expect(ans({ regulation_id_as_cited: '10.41.40.70(3)(B)', target: 'side_setback_m', required_value: 0.9, zoning_as_stated: 'RS (f10.5)' })).toBe('match');
    expect(ans({ regulation_id_as_cited: '10.41.40.70(3)(A)', target: 'side_setback_m', required_value: 0.6, zoning_as_stated: 'RS' })).toBe('match');
  });
  it('(c) a class-only zone string states no label facts: labelled(k) is unknown, never false', () => {
    expect(OC.evalCondition({ tokens: [], if: 'labelled(a)' }, { zone_parsed: true, zone_class_only: true, label: {} })).toBeNull();
    expect(OC.evalCondition({ tokens: [], if: 'labelled(a)' }, { zone_parsed: true, zone_class_only: false, label: {} })).toBe(false);
  });
  it('(b) a pinned operand of a sibling greater-of is replaced by the governing expression (R2-4)', () => {
    expect(ans({ lot: LOT({ lot_depth_m: 20 }) })).toBe('match'); // 25 % × 20 = 5 < 7.5: the literal governs
    expect(ans({ lot: LOT({ lot_depth_m: 40 }) })).toBe('not_comparable:lot_input_required'); // 10 > 7.5: the lot operand governs
    expect(ans({ lot: LOT({ lot_depth_m: 30.5 }) })).toBe('not_comparable:branch_unresolved'); // 7.625 within 5 % of 7.5
    expect(ans({ lot: { link_status: 'unlinked' } })).toBe('not_comparable:lot_input_unavailable:parcel_link');
    expect(ans({ regulation_id_as_cited: '10.20.40.70(2)', lot: LOT({ lot_depth_m: 20 }) })).toBe('match');
  });
});

describe('R2-4 lot inputs select branches only; R2-5 closed unavailable inputs', () => {
  it('a frontage band is chosen by the linked parcel frontage, unknown within the margin', () => {
    const o = { regulation_id_as_cited: '10.5.50.10(3)', target: 'rear_soft_landscaping_pct', required_unit: 'pct', required_value: 50 };
    expect(ans({ ...o, lot: LOT({ lot_frontage_m: 10 }) })).toBe('match');
    expect(ans({ ...o, lot: LOT({ lot_frontage_m: 6.1 }) })).toBe('not_comparable:branch_unresolved');
    expect(ans({ ...o, lot: { link_status: 'ambiguous' } })).toBe('not_comparable:branch_unresolved');
  });
  it('inputs outside the round are lot_input_unavailable:<input>', () => {
    expect(ans({ regulation_id_as_cited: '10.10.40.10(1)(A)', target: 'height_m', required_value: 10 })).toBe('not_comparable:lot_input_unavailable:overlay');
    expect(ans({ regulation_id_as_cited: '10.10.40.10(2)(A)', target: 'main_wall_height_m', required_value: 7.5 })).toBe('not_comparable:lot_input_unavailable:height');
    expect(OC.LOT_INPUTS_UNAVAILABLE).toContain('abutments');
  });
});

describe('R2-2 C-6: an end-of-regulation tag is regulation-level for D8, with a census', () => {
  it('the tag after the last clause applies to every unit of the row', () => {
    const r = OC.compareItem(ITEM({ regulation_id_as_cited: '10.40.40.70(3)(B)', target: 'side_setback_m', required_value: 0.9, zoning_as_stated: 'RS' }), ctx);
    expect([r.reason, r.d8_basis, r.d8_end_tag]).toEqual(['law_changed_after_hearing', 'verified_in_force_on', true]);
  });
  it('the census lists the rows that rely on it', () => {
    expect(OC.endOfRegulationTags(table.rows.get('10.40.40.70(3)'))).toEqual(['474-2023']);
    expect(OC.endOfRegulationTags(table.rows.get('10.80.40.10(4)'))).toEqual([]); // single leaf: not a multi-clause regulation
  });
});

describe('R2-8 reporting: coverage, clusters, label-derived matches', () => {
  it('summarize prints rows reached / complete rows, unit sets, per-row Wilson and the rule-of-three bound on rows', () => {
    const items = [
      ITEM({}), ITEM({ variance_key: 'k2', application_number: 'A2', regulation_id_as_cited: '10.10.40.70(2)' }),
      ITEM({ variance_key: 'k3', application_number: 'A3', regulation_id_as_cited: '10.10.40.70(2)', required_value: 7 }),
    ];
    const s = OC.summarize(items.map((i) => OC.compareItem(i, ctx)), { complete_rows: 100 });
    expect(s.coverage).toMatchObject({ rows_reached: 2, complete_rows: 100, unit_sets: 2, rows_with_mismatch: 1, label_derived_matches: 0 });
    expect(s.coverage.rule_of_three_rows_if_zero_table_errors).toBeCloseTo(1.5, 6);
    expect(s.clusters_by_row.map((c: Json) => [c.regulation_id, c.match, c.mismatch])).toEqual([['10.10.40.70(2)', 1, 1], ['10.20.40.70(2)', 1, 0]]);
  });
  it('a mismatch on a branch a measured lot input selected proposes link (lot input), and margin-unknown items are not branch gaps', () => {
    const r = OC.compareItem(ITEM({ required_value: 7.65 }), ctx); // 25 % × 20 m = 5 m → the literal 7.5 m was selected by the lot input
    expect([r.answer, r.table_form]).toEqual(['mismatch', 'literal_selected_by_lot']);
    const u = OC.compareItem(ITEM({ variance_key: 'k9', required_value: 7.65, lot: LOT({ lot_depth_m: 30.5 }) }), ctx);
    const s = OC.summarize([r, u], { complete_rows: 1 });
    expect([s.clusters[0].adjudication_kind, s.branch_gaps.length]).toEqual(['link', 0]);
  });
  it('link status and the zone-class proxy are counted', () => {
    const items = [ITEM({ link_proxy: 'class_match' }), ITEM({ variance_key: 'k2', lot: { link_status: 'unlinked' }, link_proxy: 'not_comparable' })];
    const s = OC.summarize(items.map((i) => OC.compareItem(i, ctx)), { complete_rows: 1 });
    expect(s.link).toEqual({ by_status: { ambiguous: 0, linked_unique: 1, unlinked: 1 }, proxy: { class_match: 1, class_mismatch: 0, component_mismatch_dated: 0, not_comparable: 1 } });
  });
});
