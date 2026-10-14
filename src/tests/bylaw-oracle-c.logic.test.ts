// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §6 (D6), §8 (D8 law at the hearing date), §16 (citation-first targeting)
// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (row shape), §6.5 (adjudication_kind), §10 (determinism lock)
// SPEC LINK: docs/specs/01-pipeline/69_mcbylaw_policy.md M-17 (double-keyed fields), M-75 (corrections)
//
// McBylaw oracle C (plan .cursor/mcbylaw/oracle-c-harness-plan.md; phase2-plan-v2 §V-2 row C, D6, P2-12): the Phase 1
// table vs the REQUIRED value of a 2017 CoA decision-notice item. Pure logic only; the DB read lives in oracle-c-run.mjs.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const OC: Json = await import(pathToFileURL(path.join(ROOT, 'scripts/analysis/bylaw/oracle-c.mjs')).href);
const req = createRequire(import.meta.url);
const { parseZoningDesignation } = req(path.join(ROOT, 'scripts/lib/coa-zoning-designation.js'));

const TARGETS: Json = {
  front_setback_m: { unit: 'm' }, side_setback_m: { unit: 'm' }, fsi: { unit: 'ratio' }, height_m: { unit: 'm' },
  encroachment_m: { unit: 'm' }, encroachment_clearance_m: { unit: 'm' }, lot_coverage_pct: { unit: 'pct' },
  building_length_m: { unit: 'm' }, parking_spaces: { unit: 'units' }, required_lot_frontage_m: { unit: 'm' },
};
const LIM = (unit_id: string, expr: string[] | string, extra: Json = {}): Json => ({
  unit_id, archetype: 'LIMIT', target: Array.isArray(expr) ? String(expr[0]).split(' = ')[0] : 'none', bound: 'min', condition: 'none',
  numeric_expression: expr, application: { zones: ['RD'] }, ...extra,
});
const ROW = (regulation_id: string, extra: Json = {}): Json => ({ regulation_id, scope: 'in_scope', row_status: 'complete', amendments: [], ...extra });

const provisions: Json = {
  rows: [
    ROW('10.20.40.70(1)'),
    ROW('10.20.40.70(3)'),
    ROW('10.20.40.40(1)'),
    ROW('10.10.40.10(1)'),
    ROW('10.5.40.60(7)'),
    ROW('10.20.40.20(1)', { row_status: 'pending' }),
    ROW('1.5.1(1)', { scope: 'out_of_scope', row_status: null }),
    ROW('10.20.30.40(1)', { amendments: [{ bylaw: '1000-2015', clause_path: '(1)(A)' }] }),
    ROW('10.20.30.41(1)', { amendments: [{ bylaw: '101-2022', clause_path: '(1)' }] }),
    ROW('10.20.30.42(1)', { amendments: [{ bylaw: '500-2014', clause_path: '(1)' }] }),
    ROW('10.20.30.43(1)', { amendments: [{ bylaw: '777-2021', clause_path: '(1)' }] }),
    ROW('10.20.30.44(1)', { amendments: [{ bylaw: '500-2014', clause_path: '(2)' }] }),
    ROW('10.20.40.80(1)'),
    ROW('10.20.40.81(1)'),
    ROW('10.20.40.82(1)'),
    ROW('10.20.40.71(1)'),
  ],
};
const statuses: Json = {
  '1000-2015': { status: 'in_force', in_force_on: '2015-06-01', enacted_on: '2015-05-01', in_force_trigger: null },
  '101-2022': { status: 'in_force', in_force_on: '2022-07-04', enacted_on: '2022-02-03', in_force_trigger: null },
  '500-2014': { status: 'not_verified', in_force_on: null, enacted_on: null, in_force_trigger: null },
  '777-2021': { status: 'not_verified', in_force_on: null, enacted_on: null, in_force_trigger: null },
};
const A_UNITS: Json[] = [
  LIM('10.20.40.70(1)#whole', ['front_setback_m = 6.0 m @(1)'], { condition: { tokens: ['front_averaging_not_applicable'] } }),
  ...['A:0.6:required_lot_frontage_m < 6.0 m', 'B:0.9:required_lot_frontage_m ≥ 6.0 m and required_lot_frontage_m < 12.0 m',
    'C:1.2:required_lot_frontage_m ≥ 12.0 m and required_lot_frontage_m < 15.0 m', 'D:1.5:required_lot_frontage_m ≥ 15.0 m'].map((s) => {
    const [c, v, cond] = s.split(':');
    return LIM(`10.20.40.70(3)#(3)(${c})`, [`side_setback_m = ${v} m @(3)(${c})`], { condition: { tokens: ['required_frontage_band'], if: cond } });
  }),
  LIM('10.20.40.40(1)#(1)(A)', ['fsi = label(d) @(1)(A)'], { bound: 'max', condition: { tokens: ['label_value'], if: 'labelled(d)' } }),
  LIM('10.20.40.40(1)#(1)(B)', ['fsi = unlimited @(1)(B)'], { bound: 'max', condition: { tokens: [], if: 'not labelled(d)' } }),
  { unit_id: '10.20.40.40(1)#(1)(C)', archetype: 'DISAPPLY', target: 'none', numeric_expression: 'none', condition: 'none', application: { zones: ['RD'] } },
  LIM('10.10.40.10(1)#(1)(A)', ['height_m = overlay(HT) @(1)(A)'], { bound: 'max', condition: { tokens: ['overlay_mapped'], if: 'mapped(HT)' } }),
  LIM('10.10.40.10(1)#(1)(B)', ['height_m = 10.0 m @(1)(B)'], { bound: 'max', condition: { tokens: ['overlay_mapped'], if: 'not mapped(HT)' } }),
  LIM('10.5.40.60(7)#(7)(B)', ['encroachment_m = 0.9 m @(7)(B)', 'encroachment_clearance_m = 0.3 m @(7)(B)'], { bound: 'max' }),
  LIM('10.20.30.40(1)#(1)(A)', ['lot_coverage_pct = 33 pct @(1)(A)'], { bound: 'max' }),
  LIM('10.20.30.40(1)#(1)(B)', ['lot_coverage_pct = 35 pct @(1)(B)'], { bound: 'max' }),
  LIM('10.20.30.41(1)#whole', ['lot_coverage_pct = 40 pct @(1)'], { bound: 'max' }),
  LIM('10.20.30.42(1)#whole', ['lot_coverage_pct = 40 pct @(1)'], { bound: 'max' }),
  LIM('10.20.30.43(1)#whole', ['lot_coverage_pct = 40 pct @(1)'], { bound: 'max' }),
  LIM('10.20.30.44(1)#(1)(A)', ['lot_coverage_pct = 40 pct @(1)(A)'], { bound: 'max' }),
  LIM('10.20.40.80(1)#whole', ['building_length_m = 17.0 m @(1)'], { bound: 'max' }),
  LIM('10.20.40.81(1)#(1)(A)', ['building_length_m = 17.0 m @(1)(A)'], { bound: 'max', condition: { tokens: ['major_street'] } }),
  LIM('10.20.40.81(1)#(1)(B)', ['building_length_m = 19.0 m @(1)(B)'], { bound: 'max', condition: { tokens: ['depth_band'] } }),
  LIM('10.20.40.82(1)#whole', ['building_length_m = 6.0 m @(1)'], { bound: 'max' }),
  LIM('10.20.40.71(1)#whole', ['front_setback_m = 6.0 m @(1)'], { condition: { tokens: ['front_averaging_not_applicable'] } }),
];
// keyer B: identical except 10.20.40.82 (B keyed 7.0 m; the disagreement record picks b) and 10.20.40.80 (corrected below)
const B_UNITS: Json[] = A_UNITS.map((u) => (u.unit_id === '10.20.40.82(1)#whole' ? { ...u, numeric_expression: ['building_length_m = 7.0 m @(1)'] } : u));
const shards: Json[] = [
  { key: 'fixture/all', a: { units: A_UNITS }, b: { units: B_UNITS } },
  // a re-key generation supersedes 10.20.40.70(1): 6.0 → 7.5 m
  { key: 'fixture/all~r1', a: { units: [LIM('10.20.40.70(1)#whole', ['front_setback_m = 7.5 m @(1)'])] }, b: { units: [LIM('10.20.40.70(1)#whole', ['front_setback_m = 7.5 m @(1)'])] } },
];
const adjudications: Json[] = [
  { kind: 'disagreement', unit: '10.20.40.82(1)#whole', field: 'numeric_expression', decision: 'b', id: 'ADJ-1' },
  { kind: 'correction', unit: '10.20.40.80(1)#whole', field: 'numeric_expression', value: ['building_length_m = 18.0 m @(1)'], id: 'COR-1' },
  { kind: 'correction', unit: '10.20.40.80(1)#whole', field: 'numeric_expression', value: ['building_length_m = 18.5 m @(1)'], id: 'COR-2', supersedes: 'COR-1' },
];
const table: Json = OC.buildTable({ provisions, shards, adjudications, targets: TARGETS });
const ctx: Json = { table, statuses, targets: TARGETS, parseZone: parseZoningDesignation };
const ITEM = (o: Json): Json => ({
  variance_key: 'toronto_ca_decision_pdf|A0001/17EYK|1', application_number: 'A0001/17EYK', hearing_date: '2017-06-14',
  cited_bylaw: '569-2013', citation_kind: 'chapter_regulation', regulation_id_as_cited: '10.20.40.70(1)', exception_ref: null,
  zoning_as_stated: 'RD (f12.0; d0.6)', target: 'front_setback_m', target_status: 'mapped', required_value: 7.5, required_unit: 'm',
  parse_status: 'pair', qualified: false, ...o,
});
const cmp = (o: Json): Json => OC.compareItem(ITEM(o), ctx);
const ans = (o: Json): string => { const r = cmp(o); return r.answer === 'not_comparable' ? `not_comparable:${r.reason}` : r.answer; };

describe('closed sets (D6): answers, reasons in evaluation order, adjudication kinds', () => {
  it('reasons are the Spec 129 D8 set ∪ D6 ∪ the PROPOSED additions, each once', () => {
    for (const r of ['former_bylaw', 'law_changed_after_hearing', 'amendment_status_unverified', 'target_not_modelled', 'parse_failed']) expect(OC.REASONS).toContain(r);
    expect(new Set(OC.REASONS).size).toBe(OC.REASONS.length);
    for (const r of OC.PROPOSED_REASONS) expect(OC.REASONS).toContain(r);
    expect(OC.ADJ_KINDS).toEqual(['table', 'parse', 'link', 'law_change']);
  });
});

describe('citation join', () => {
  it('splits a cited id into row id + clause path', () => {
    expect(OC.splitCitation('10.20.40.10(2)(B)(ii)')).toEqual({ article: '10.20.40.10', regulation_id: '10.20.40.10(2)', clause_path: '(2)(B)(ii)' });
    expect(OC.splitCitation('10.5.40.60(7)')).toEqual({ article: '10.5.40.60', regulation_id: '10.5.40.60(7)', clause_path: '(7)' });
    expect(OC.splitCitation('')).toBeNull();
  });
  it('path compatibility is token-prefix, both directions, never string-prefix', () => {
    expect(OC.pathCompatible('(3)', '(3)(C)')).toBe(true);
    expect(OC.pathCompatible('(2)(B)(ii)', '(2)(B)')).toBe(true);
    expect(OC.pathCompatible('(1)', '(10)')).toBe(false);
    expect(OC.pathCompatible('(1)(A)', '(1)(B)')).toBe(false);
  });
  it('parses statement forms', () => {
    expect(OC.parseStatement('front_setback_m = 6.0 m @(1)')).toMatchObject({ target: 'front_setback_m', form: 'literal', value: 6, unit: 'm' });
    expect(OC.parseStatement('fsi = label(d) @(1)(A)')).toMatchObject({ target: 'fsi', form: 'label', key: 'd' });
    expect(OC.parseStatement('fsi = unlimited @(1)(B)')).toMatchObject({ form: 'no_limit' });
    expect(OC.parseStatement('rear_setback_m = max(7.5 m @(2)(A); 25 pct × lot_depth_m @(2)(B)) @(2)')).toMatchObject({ target: 'rear_setback_m', form: 'lot_dependent' });
  });
});

describe('table side: agreed value = correction > disagreement decision > keyer A; newest re-key generation', () => {
  it('re-key generation ~r1 supersedes the base', () => expect(ans({})).toBe('match'));
  it('disagreement decided b uses keyer B', () => {
    expect(cmp({ regulation_id_as_cited: '10.20.40.82(1)', target: 'building_length_m', required_value: 7 }).answer).toBe('match');
  });
  it('the live correction (supersedes chain) wins', () => {
    expect(cmp({ regulation_id_as_cited: '10.20.40.80(1)', target: 'building_length_m', required_value: 18.5 }).answer).toBe('match');
    expect(cmp({ regulation_id_as_cited: '10.20.40.80(1)', target: 'building_length_m', required_value: 18 }).answer).toBe('mismatch');
  });
});

describe('not_comparable reasons, first one wins', () => {
  it('citation_absent / former_bylaw / exception_cited / parse_failed', () => {
    expect(ans({ cited_bylaw: null, citation_kind: 'none', regulation_id_as_cited: null })).toBe('not_comparable:citation_absent');
    expect(ans({ cited_bylaw: '438-86', citation_kind: 'former_bylaw_section', regulation_id_as_cited: null })).toBe('not_comparable:former_bylaw');
    expect(ans({ citation_kind: 'exception_clause', regulation_id_as_cited: null, exception_ref: '900.3.10(37)' })).toBe('not_comparable:exception_cited');
    expect(ans({ parse_status: 'multi_value_ambiguous' })).toBe('not_comparable:parse_failed');
  });
  it('row_not_in_table / row_out_of_scope / row_pending / clause_not_in_table', () => {
    expect(ans({ regulation_id_as_cited: '99.1.1(1)' })).toBe('not_comparable:row_not_in_table');
    expect(ans({ regulation_id_as_cited: '1.5.1(1)' })).toBe('not_comparable:row_out_of_scope');
    expect(ans({ regulation_id_as_cited: '10.20.40.20(1)' })).toBe('not_comparable:row_pending');
    expect(ans({ regulation_id_as_cited: '10.20.30.44(1)(B)', required_unit: 'pct', required_value: 40 })).toBe('not_comparable:clause_not_in_table');
  });
  it('target_not_modelled when no unit speaks the notice unit family', () => {
    expect(ans({ required_unit: 'm2', required_value: 10 })).toBe('not_comparable:target_not_modelled');
  });
  it('target_ambiguous unless the keyword target picks one (citation first, keyword as tiebreak)', () => {
    expect(ans({ regulation_id_as_cited: '10.5.40.60(7)', target: 'unmapped', target_status: 'unmapped', required_value: 0.9 })).toBe('not_comparable:target_ambiguous');
    expect(ans({ regulation_id_as_cited: '10.5.40.60(7)', target: 'encroachment_m', required_value: 0.9 })).toBe('match');
  });
  it('D8: verified in force before the hearing compares; after → law_changed; unverified → unverified; number year after → law_changed', () => {
    expect(ans({ regulation_id_as_cited: '10.20.30.40(1)(A)', required_unit: 'pct', required_value: 33 })).toBe('match');
    expect(ans({ regulation_id_as_cited: '10.20.30.41(1)', required_unit: 'pct', required_value: 40 })).toBe('not_comparable:law_changed_after_hearing');
    expect(ans({ regulation_id_as_cited: '10.20.30.42(1)', required_unit: 'pct', required_value: 40 })).toBe('not_comparable:amendment_status_unverified');
    const r = cmp({ regulation_id_as_cited: '10.20.30.43(1)', required_unit: 'pct', required_value: 40 });
    expect([r.reason, r.d8_basis]).toEqual(['law_changed_after_hearing', 'bylaw_number_year']);
  });
  it('D8 reads only tags on the candidate unit subtree; the row-level reading is kept as a sensitivity diagnostic', () => {
    const r = cmp({ regulation_id_as_cited: '10.20.30.44(1)(A)', required_unit: 'pct', required_value: 40 });
    expect([r.answer, r.d8_row_level]).toEqual(['match', 'amendment_status_unverified']);
    const s = OC.summarize([r, cmp({})]);
    expect(s.d8_row_level_sensitivity).toMatchObject({ n: 1, match: 1, mismatch: 0 });
  });
  it('zone_unparsed / zone_label_missing when a label() is needed', () => {
    expect(ans({ regulation_id_as_cited: '10.20.40.40(1)(A)', required_unit: 'ratio', required_value: 0.6, zoning_as_stated: 'Residential' })).toBe('not_comparable:zone_unparsed');
    // round 2 (R2-1 c): an untruncated label without d contradicts the pinned (A) "if labelled(d)"; a truncated one does not
    expect(ans({ regulation_id_as_cited: '10.20.40.40(1)(A)', required_unit: 'ratio', required_value: 0.6, zoning_as_stated: 'RD (f12.0)' })).toBe('not_comparable:citation_condition_conflict');
    expect(ans({ regulation_id_as_cited: '10.20.40.40(1)(A)', required_unit: 'ratio', required_value: 0.6, zoning_as_stated: 'RD (f12.0;' })).toBe('not_comparable:zone_label_missing');
  });
  it('a remaining branch that needs an input outside the round is lot_input_unavailable:<input> (round 2, R2-5)', () => {
    expect(ans({ regulation_id_as_cited: '10.10.40.10(1)', target: 'height_m', required_value: 10, zoning_as_stated: 'R (d0.6)' })).toBe('not_comparable:lot_input_unavailable:overlay');
  });
  it('a *_not_applicable condition (displaced by a lot-dependent provision) is never presumed by the citation', () => {
    expect(OC.displacedByLotInput({ tokens: ['front_averaging_not_applicable'] })).toBe(true);
    expect(OC.displacedByLotInput({ tokens: ['major_street'] })).toBe(false);
    expect(ans({ regulation_id_as_cited: '10.20.40.71(1)', required_value: 6 })).toBe('not_comparable:lot_input_required');
  });
  it('a label absent from a truncated zone string is unknown, not "not labelled"', () => {
    expect(OC.zoneIsTruncated('RD(f15.0;')).toBe(true);
    expect(OC.zoneIsTruncated('RD (f12.0; d0.6)')).toBe(false);
    expect(OC.zoneIsTruncated('RM (f12.0;u2;d0.8)(x252) &')).toBe(true);
    // 10.20.40.40(1): (A) label(d) if labelled(d) / (B) unlimited if not labelled(d); truncated → both kept → label missing
    expect(ans({ regulation_id_as_cited: '10.20.40.40(1)', required_unit: 'ratio', required_value: 0.6, zoning_as_stated: 'RD (f12.0;' })).toBe('not_comparable:zone_label_missing');
  });
  it('branch_unresolved keeps in_branch_set as a diagnostic', () => {
    const r1 = cmp({ regulation_id_as_cited: '10.20.40.81(1)', target: 'building_length_m', required_value: 19 });
    expect([r1.answer, r1.reason, r1.in_branch_set]).toEqual(['not_comparable', 'branch_unresolved', true]);
    const r2 = cmp({ regulation_id_as_cited: '10.20.40.81(1)', target: 'building_length_m', required_value: 21 });
    expect([r2.reason, r2.in_branch_set]).toEqual(['branch_unresolved', false]);
  });
});

describe('values', () => {
  it('label(d) resolves from the notice zone string; not labelled(d) branch drops', () => {
    expect(ans({ regulation_id_as_cited: '10.20.40.40(1)', required_unit: 'ratio', required_value: 0.6 })).toBe('match');
    expect(ans({ regulation_id_as_cited: '10.20.40.40(1)', required_unit: 'ratio', required_value: 0.45 })).toBe('mismatch');
  });
  it('a band is chosen by label f (three-valued conditions); without f the bands stay unresolved', () => {
    expect(ans({ regulation_id_as_cited: '10.20.40.70(3)', target: 'side_setback_m', required_value: 1.2 })).toBe('match');
    expect(ans({ regulation_id_as_cited: '10.20.40.70(3)', target: 'side_setback_m', required_value: 0.9, zoning_as_stated: 'RD (f7.5)' })).toBe('match');
    expect(ans({ regulation_id_as_cited: '10.20.40.70(3)', target: 'side_setback_m', required_value: 1.2, zoning_as_stated: 'RD' })).toBe('not_comparable:branch_unresolved');
  });
  it('a cited clause pins its unit and presumes its condition', () => {
    expect(ans({ regulation_id_as_cited: '10.20.40.70(3)(B)', target: 'side_setback_m', required_value: 0.9, zoning_as_stated: 'RD (f9.0)' })).toBe('match');
    expect(ans({ regulation_id_as_cited: '10.20.40.70(3)(B)', target: 'side_setback_m', required_value: 0.9, zoning_as_stated: 'RD' })).toBe('match');
  });
  it('cm converts to m; tolerance 0.0005', () => {
    expect(ans({ required_value: 750, required_unit: 'cm' })).toBe('match');
    expect(ans({ required_value: 7.5004 })).toBe('match');
    expect(ans({ required_value: 7.51 })).toBe('mismatch');
  });
  it('no_limit in the table vs a numeric requirement is a mismatch', () => {
    expect(ans({ regulation_id_as_cited: '10.20.40.40(1)(B)', required_unit: 'ratio', required_value: 0.6, zoning_as_stated: 'RD' })).toBe('mismatch');
  });
});

describe('statistics', () => {
  it('Wilson 95 % interval', () => {
    expect(OC.wilson(0, 0)).toBeNull();
    const w = OC.wilson(90, 100);
    expect(w.rate).toBeCloseTo(0.9, 6);
    expect(w.lo).toBeCloseTo(0.8256, 3);
    expect(w.hi).toBeCloseTo(0.9448, 3);
    expect(OC.wilson(10, 10).hi).toBe(1);
  });
  it('summarize: n per answer/target/zone class, comparable rate, clusters with ≤ 5 samples and an adjudication_kind proposal', () => {
    const items = [
      ITEM({}), ITEM({ variance_key: 'k2', application_number: 'A2', required_value: 6.0 }),
      ITEM({ variance_key: 'k3', application_number: 'A3', required_value: 6.0 }), ITEM({ variance_key: 'k4', application_number: 'A4', required_value: 6.0 }),
      ITEM({ variance_key: 'k5', application_number: 'A5', cited_bylaw: '438-86', citation_kind: 'former_bylaw_section', regulation_id_as_cited: null }),
    ];
    const s = OC.summarize(items.map((i) => OC.compareItem(i, ctx)));
    expect(s.by_answer).toEqual({ match: 1, mismatch: 3, not_comparable: 1 });
    expect(s.by_reason.former_bylaw).toBe(1);
    expect(s.comparable.n).toBe(4);
    expect(s.comparable.match).toBe(1);
    expect(s.by_zone_class.RD.match).toBe(1);
    expect(s.by_target.front_setback_m.mismatch).toBe(3);
    expect(s.clusters[0]).toMatchObject({ unit_ids: ['10.20.40.70(1)#whole'], table_value: '7.5 m', notice_value: '6 m', n: 3, applications: 3, adjudication_kind: 'table' });
    expect(s.clusters[0].samples.length).toBeLessThanOrEqual(5);
  });
  it('a notice value equal to another target of the selected unit proposes parse (keyword target mis-pick)', () => {
    const r = OC.compareItem(ITEM({ regulation_id_as_cited: '10.5.40.60(7)', target: 'encroachment_m', required_value: 0.3 }), ctx);
    expect([r.answer, r.notice_equals_other_target]).toEqual(['mismatch', ['encroachment_clearance_m']]);
    expect(OC.summarize([r]).clusters[0].adjudication_kind).toBe('parse');
  });
  it('is deterministic: the same input gives the same JSON', () => {
    const items = [ITEM({}), ITEM({ variance_key: 'k2', required_value: 6 })];
    expect(JSON.stringify(OC.summarize(items.map((i) => OC.compareItem(i, ctx))))).toBe(JSON.stringify(OC.summarize(items.reverse().map((i) => OC.compareItem(i, ctx)))));
  });
});

describe('independence (plan §V-2: C reads the table, never the evaluator) and determinism lock', () => {
  const banned = [/evaluate\.mjs/, /dsl\.mjs/, /authored\.mjs/, /oracle-b\//, /generate-bylaw-provisions/];
  it.each(['scripts/analysis/bylaw/oracle-c.mjs', 'scripts/analysis/bylaw/oracle-c-run.mjs'])('%s imports none of the banned modules', (f) => {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const imports = [...text.matchAll(/(?:import\s[^'"]*from\s*|import\(\s*|require\(\s*)['"]([^'"]+)['"]/g)].map((m) => String(m[1]));
    for (const re of banned) expect(imports.filter((i) => re.test(i))).toEqual([]);
  });
  it('oracle-c.mjs is pure: no fs, pg or process access', () => {
    const text = fs.readFileSync(path.join(ROOT, 'scripts/analysis/bylaw/oracle-c.mjs'), 'utf8');
    expect(/from\s+['"](node:)?fs['"]|['"]pg['"]|process\./.test(text)).toBe(false);
  });
});
