// SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §8 (D8 law at the hearing date), §16 (citation-first targeting)
// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-118 (scope), M-119 (C-2), M-122 (C-5), M-123 (C-6 (a′)), M-124 (reasons)
// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (amendments[] tag binding), §10 (determinism lock)
//
// McBylaw oracle C round 3 (pre-registration .cursor/mcbylaw/oracle-c/prereg-round-3.txt, R3-1 … R3-4): the keyword target
// never breaks a tie inside one unit (C-2), exception / former-density context is not comparable (C-5), and an
// end-of-regulation tag is regulation-level only when it is the regulation's only tag group (C-6 (a′)). Round-2 behaviour
// stays the default (`ctx.rules` absent) so a round-2 re-run is unchanged. Plus the later-round exception mode (fixtures only).
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
  encroachment_m: { unit: 'm' }, encroachment_clearance_m: { unit: 'm' }, height_m: { unit: 'm' }, main_wall_height_m: { unit: 'm' },
  fsi: { unit: 'ratio' }, side_setback_m: { unit: 'm' }, lot_coverage_pct: { unit: 'pct' },
};
const LIM = (unit_id: string, expr: string[], condition: Json | string = 'none'): Json => ({
  unit_id, archetype: 'LIMIT', target: String(expr[0]).split(' = ')[0], bound: 'max', condition, numeric_expression: expr,
});
const ROW = (regulation_id: string, leaves: string[], extra: Json = {}): Json => ({
  regulation_id, scope: 'in_scope', row_status: 'complete', amendments: [], verbatim: '(x) text',
  clauses: leaves.map((p) => ({ leaf: true, path: p })), ...extra,
});
const provisions: Json = {
  rows: [
    ROW('10.5.40.60(1)', ['(1)(E)']),
    ROW('10.10.40.10(2)', ['(2)(A)', '(2)(B)']),
    ROW('10.20.40.40(1)', ['(1)(A)', '(1)(B)']),
    // two tag groups: a mid-text group after (C) and the end group after (D) (card R2-4, 10.10.40.40(1))
    ROW('10.10.40.40(1)', ['(1)(A)', '(1)(B)', '(1)(C)', '(1)(D)'], {
      verbatim: '(1) … (C) text. [ By-law: 848-2025 ] (D) major street text. [ By-law: 474-2023 ]',
      amendments: [{ bylaw: '848-2025', clause_path: '(1)(C)', qualifier: null }, { bylaw: '474-2023', clause_path: '(1)(D)', qualifier: null }],
    }),
    // one tag group, at the end (card R2-1, 10.40.40.70(3))
    ROW('10.40.40.70(3)', ['(3)(A)', '(3)(E)'], {
      verbatim: '(3) Minimum Side Yard Setback … (E) 1.8 metres, for a non-residential building. [ By-law: 474-2023 ]',
      amendments: [{ bylaw: '474-2023', clause_path: '(3)(E)', qualifier: null }],
    }),
    ROW('900.3.10(37)', ['(37)(A)', '(37)(B)', '(37)(C)']),
    ROW('900.6.10(18)', ['(18)(A)'], { row_status: 'pending' }),
  ],
};
const statuses: Json = {
  '474-2023': { status: 'in_force', in_force_on: '2023-05-12', enacted_on: '2023-04-01', in_force_trigger: null },
  '848-2025': { status: 'in_force', in_force_on: '2025-09-01', enacted_on: '2025-08-01', in_force_trigger: null },
};
const UNITS: Json[] = [
  LIM('10.5.40.60(1)#(1)(E)', ['encroachment_m = 0.6 m @(1)(E)', 'encroachment_clearance_m = 0.3 m @(1)(E)']),
  LIM('10.10.40.10(2)#(2)(A)', ['height_m = 10.0 m @(2)(A)']),
  LIM('10.10.40.10(2)#(2)(B)', ['main_wall_height_m = 7.0 m @(2)(B)']),
  LIM('10.20.40.40(1)#(1)(A)', ['fsi = label(d) @(1)(A)'], { tokens: ['label_value'], if: 'labelled(d)' }),
  LIM('10.20.40.40(1)#(1)(B)', ['fsi = 0.6 ratio @(1)(B)'], { tokens: [], if: 'not labelled(d)' }),
  LIM('10.10.40.40(1)#(1)(A)', ['fsi = 0.6 ratio @(1)(A)']),
  LIM('10.40.40.70(3)#(3)(A)', ['side_setback_m = 0.9 m @(3)(A)']),
  LIM('10.40.40.70(3)#(3)(E)', ['side_setback_m = 1.8 m @(3)(E)']),
  LIM('900.3.10(37)#(37)(A)', ['fsi = 0.5 ratio @(37)(A)']),
  LIM('900.3.10(37)#(37)(B)', ['side_setback_m = 1.8 m @(37)(B)']),
  LIM('900.3.10(37)#(37)(C)', ['lot_coverage_pct = 33 pct @(37)(C)'], { tokens: ['detached'], if: 'building_type = detached' }),
  LIM('900.6.10(18)#(18)(A)', ['fsi = 0.45 ratio @(18)(A)']),
];
const table: Json = OC.buildTable({ provisions, shards: [{ key: 'fx/all', a: { units: UNITS }, b: { units: UNITS } }], adjudications: [], targets: TARGETS });
const R2: Json = { table, statuses, targets: TARGETS, parseZone: parseZoningDesignation };
const R3: Json = { ...R2, rules: OC.RULES[3] };
const ITEM = (o: Json): Json => ({
  variance_key: 'toronto_ca_decision_pdf|A0001/17TEY|1', application_number: 'A0001/17TEY', hearing_date: '2017-06-14',
  cited_bylaw: '569-2013', citation_kind: 'chapter_regulation', regulation_id_as_cited: '10.5.40.60(1)(E)', exception_ref: null,
  zoning_as_stated: 'RD (f12.0; d0.6)', target: 'encroachment_m', target_status: 'mapped', required_value: 0.6, required_unit: 'm',
  parse_status: 'pair', qualified: false, lot: { link_status: 'unlinked' }, ...o,
});
const ans = (o: Json, ctx: Json): string => { const r = OC.compareItem(ITEM(o), ctx); return r.answer === 'not_comparable' ? `not_comparable:${r.reason}` : r.answer; };

describe('round rule sets', () => {
  it('round 2 is the default and round 3 turns on C-2, C-5 and C-6 (a′) under a new oracle_c_version', () => {
    expect(OC.RULES[2]).toEqual({ version: 'oracle-c-2', keyword_within_unit: true, exception_ref_not_comparable: false, former_density_unknown: false, end_tag: 'a' });
    expect(OC.RULES[3]).toEqual({ version: 'oracle-c-3', keyword_within_unit: false, exception_ref_not_comparable: true, former_density_unknown: true, end_tag: 'a_prime' });
  });
});

describe('R3-1 C-2 (M-119): the keyword target never breaks a tie inside one unit', () => {
  it('two same-family targets in the one cited unit: round 2 lets the keyword pick, round 3 is target_ambiguous', () => {
    expect(ans({}, R2)).toBe('match');
    expect(ans({}, R3)).toBe('not_comparable:target_ambiguous');
    expect(OC.compareItem(ITEM({}), R3).table_targets).toEqual(['encroachment_clearance_m', 'encroachment_m']);
  });
  it('between units the keyword still picks (row-level citation, one target per unit)', () => {
    const o = { regulation_id_as_cited: '10.10.40.10(2)', target: 'height_m', required_value: 10 };
    expect(ans(o, R3)).toBe('match');
    expect(ans({ ...o, target: 'unmapped', target_status: 'unmapped' }, R3)).toBe('not_comparable:target_ambiguous');
  });
});

describe('R3-2 C-5 (M-122): exception and former-density context', () => {
  it('(a) an exception_ref beside a chapter_regulation citation is exception_cited', () => {
    const o = { regulation_id_as_cited: '10.10.40.10(2)(A)', target: 'height_m', required_value: 10, exception_ref: '900.3.10(37)' };
    expect(ans(o, R2)).toBe('match');
    expect(ans(o, R3)).toBe('not_comparable:exception_cited');
  });
  it('(b) a Z<n> token with no 569 d label: the d default branch is not compared (zone_label_missing)', () => {
    const o = { regulation_id_as_cited: '10.20.40.40(1)', target: 'fsi', required_unit: 'ratio', required_value: 0.35, zoning_as_stated: 'RD (f12.0) & R2 Z0.35' };
    expect(ans(o, R2)).toBe('mismatch'); // round 2: labelled(d) false → the 0.6 default branch
    expect(ans(o, R3)).toBe('not_comparable:zone_label_missing');
    expect(ans({ ...o, regulation_id_as_cited: '10.20.40.40(1)(B)' }, R3)).toBe('not_comparable:zone_label_missing'); // pinned default
    expect(ans({ ...o, regulation_id_as_cited: '10.20.40.40(1)(A)' }, R2)).toBe('not_comparable:citation_condition_conflict');
    expect(ans({ ...o, regulation_id_as_cited: '10.20.40.40(1)(A)' }, R3)).toBe('not_comparable:zone_label_missing');
  });
  it('(b) does not fire without the token, or when a 569 d label is stated', () => {
    const o = { regulation_id_as_cited: '10.20.40.40(1)', target: 'fsi', required_unit: 'ratio', required_value: 0.6 };
    expect(ans({ ...o, zoning_as_stated: 'RD (f12.0)' }, R3)).toBe('match');
    expect(ans({ ...o, zoning_as_stated: 'RD (f12.0; d0.6) & R2 Z0.35' }, R3)).toBe('match');
    expect(OC.hasFormerDensity('R & R4 Z1.0')).toBe(true);
    expect(OC.hasFormerDensity('RD (ZR)')).toBe(false);
    expect(OC.hasFormerDensity('RD (f12.0; d0.6)')).toBe(false);
  });
});

describe('R3-3 C-6 (a′) (M-123 note): end-of-regulation tag only when it is the only tag group', () => {
  it('a regulation that also tags mid-text keeps clause binding under (a′)', () => {
    const o = { regulation_id_as_cited: '10.10.40.40(1)(A)', target: 'fsi', required_unit: 'ratio', required_value: 0.6 };
    expect(ans(o, R2)).toBe('not_comparable:law_changed_after_hearing');
    expect(ans(o, R3)).toBe('match');
    expect(OC.endOfRegulationTags(table.rows.get('10.10.40.40(1)'), 'a')).toEqual(['474-2023']);
    expect(OC.endOfRegulationTags(table.rows.get('10.10.40.40(1)'), 'a_prime')).toEqual([]);
  });
  it('a single end group still binds the whole regulation (card R2-1 stays law_changed)', () => {
    const r = OC.compareItem(ITEM({ regulation_id_as_cited: '10.40.40.70(3)(A)', target: 'side_setback_m', required_value: 0.9, zoning_as_stated: 'RS' }), R3);
    expect([r.reason, r.d8_end_tag]).toEqual(['law_changed_after_hearing', true]);
  });
  it('the census reports both readings', () => {
    expect(OC.endTagCensus(table, 'a').rows.map((x: Json) => x.regulation_id)).toEqual(['10.10.40.40(1)', '10.40.40.70(3)']);
    expect(OC.endTagCensus(table, 'a_prime').rows.map((x: Json) => x.regulation_id)).toEqual(['10.40.40.70(3)']);
  });
});

describe('exception mode (later round): exception-cited notices vs Ch.900 exception rows', () => {
  const EX = (o: Json): Json => ITEM({
    citation_kind: 'exception_clause', regulation_id_as_cited: null, exception_ref: '900.3.10.(37)', zoning_as_stated: 'RD & R1',
    target: 'fsi', required_unit: 'ratio', required_value: 0.5, ...o,
  });
  const ex = (o: Json): string => { const r = OC.compareExceptionItem(EX(o), R3); return r.answer === 'not_comparable' ? `not_comparable:${r.reason}` : r.answer; };
  it('normalizes the exception reference to the row id; a non-Ch.900 reference is unparsed', () => {
    expect(OC.normalizeExceptionRef('900.3.10.(37)')).toBe('900.3.10(37)');
    expect(OC.normalizeExceptionRef('900.3.10(37)')).toBe('900.3.10(37)');
    expect(OC.normalizeExceptionRef('RD5')).toBeNull();
  });
  it('the keyword target selects the exception statement; value compared like round 3', () => {
    expect(ex({})).toBe('match');
    expect(ex({ required_value: 0.6 })).toBe('mismatch');
    expect(ex({ target: 'side_setback_m', required_unit: 'm', required_value: 1.8 })).toBe('match');
    const r = OC.compareExceptionItem(EX({}), R3);
    expect([r.mode, r.regulation_id, r.unit_ids]).toEqual(['exception', '900.3.10(37)', ['900.3.10(37)#(37)(A)']]);
  });
  it('closed not_comparable reasons', () => {
    expect(ex({ exception_ref: 'RD5' })).toBe('not_comparable:exception_ref_unparsed');
    expect(ex({ exception_ref: '900.3.10(99)' })).toBe('not_comparable:row_not_in_table');
    expect(ex({ exception_ref: '900.6.10(18)' })).toBe('not_comparable:row_pending');
    expect(ex({ target: 'height_m', required_unit: 'm', required_value: 10 })).toBe('not_comparable:target_not_modelled');
    expect(ex({ target: 'unmapped', target_status: 'unmapped' })).toBe('not_comparable:target_ambiguous');
    expect(ex({ parse_status: 'multi_value_ambiguous' })).toBe('not_comparable:parse_failed');
    expect(ex({ cited_bylaw: null })).toBe('not_comparable:citation_absent');
    expect(ex({ target: 'lot_coverage_pct', required_unit: 'pct', required_value: 33 })).toBe('not_comparable:lot_input_unavailable:building_type');
    for (const r of OC.EXCEPTION_REASONS) expect(OC.REASONS.includes(r) || r === 'exception_ref_unparsed').toBe(true);
  });
  it('an exception item with a chapter citation beside it is in the mode; others are refused', () => {
    expect(ex({ citation_kind: 'chapter_regulation', regulation_id_as_cited: '10.20.40.40(1)' })).toBe('match');
    expect(OC.inExceptionMode(EX({}))).toBe(true);
    expect(OC.inExceptionMode(ITEM({}))).toBe(false);
    expect(() => OC.compareExceptionItem(ITEM({}), R3)).toThrow(/exception mode/);
  });
  it('summarize takes the exception reason set', () => {
    const rs = [EX({}), EX({ variance_key: 'k2', exception_ref: 'RD5' })].map((i) => OC.compareExceptionItem(i, R3));
    const s = OC.summarize(rs, { complete_rows: 1, reasons: OC.EXCEPTION_REASONS });
    expect([s.by_answer.match, s.by_reason.exception_ref_unparsed]).toEqual([1, 1]);
  });
});
