// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.4 (canonical projection), §9 (a report-only arm never
//            changes the exit code or a word verdict), §10 (determinism); docs/specs/01-pipeline/69a_mcbylaw_register.md
//            M-117 (R-DET); process row "twins key alike (report-only)" (operator-approved 2026-10-14, row proposed).
//
// TWINS KEY ALIKE — scripts/analysis/bylaw/twins.mjs. Fixtures both directions (a twin keyed alike is `same`; keyed
// differently is `value_differs` / `label_only`) plus the normalisation edge cases the sweep's rules exist for.
import { describe, expect, it } from 'vitest';
import * as twinsRaw from '../../scripts/analysis/bylaw/twins.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const { normaliseClause, leafOf, projectUnit, twinsReport, twinsLine, selfTest, KINDS, COMPARED_FIELDS } = twinsRaw as unknown as Json;

const T = 'The permitted maximum height for a building or structure on a lot in the R zone is the numerical value following HT.';
const zoneOf: Record<string, string> = { '10.10': 'R', '10.20': 'RD', '10.40': 'RS', '10.60': 'RT', '10.80': 'RM' };
const unit = (reg: string, path: string, over: Json = {}): Json => ({
  unit_id: `${reg}#${path}`,
  archetype: 'LIMIT',
  target: 'height_m',
  bound: 'max',
  numeric_expression: [`height_m = overlay(HT) @${path}`],
  condition: 'none',
  applies_to: { part: 'whole', refs: [] },
  literals_not_expressed: [],
  calculation_handling: { status: 'modelled' },
  application: { zones: [zoneOf[reg.slice(0, 5)] || 'R'], building_types: ['any'], lot_conditions: [], uses: [], evidence: {} },
  ...over,
});
const textFor = (reg: string) => T.replace('R zone', `${zoneOf[reg.slice(0, 5)] || 'R'} zone`);
const report = (...us: Json[]) => twinsReport(us.map((u) => ({ unit: u, text: textFor(u.unit_id.split('#')[0]) })));
const R = unit('10.10.40.10(1)', '(1)(A)');

describe('normaliseClause (the sweep rules)', () => {
  it('zone symbols before "zone", By-law tags, regulation numbers, "regulation(s)", case and whitespace normalise away', () => {
    expect(normaliseClause('Regulation 10.20.40.10(1)(A) applies  IN the RD zone [ By-law: 89-2022 ]')).toBe(normaliseClause('regulation 10.10.40.10(3) applies in the R zone'));
  });
  it('a reference list collapses to REF however many members it names', () => {
    expect(normaliseClause('despite regulations 10.20.40.10(1) and 10.20.40.10(2), x')).toBe(normaliseClause('despite regulations 10.10.40.10(1) to 10.10.40.10(4), x'));
  });
  it('the leading (n) drops; inner (n) become (n)', () => {
    expect(normaliseClause('(3) see clause (5) here')).toBe(normaliseClause('(1) see clause (2) here'));
  });
  it('a zone symbol not followed by "zone" is kept (RD lots ≠ R lots); a different word is never normalised', () => {
    expect(normaliseClause('RD lots')).not.toBe(normaliseClause('R lots'));
    expect(normaliseClause('maximum height in the R zone')).not.toBe(normaliseClause('minimum height in the R zone'));
  });
  it('leafOf drops the regulation-local leading (n) and ~under_appeal', () => {
    expect(leafOf('10.20.40.1(5)#(5)(A)')).toBe('(A)');
    expect(leafOf('200.15.1(1)~under_appeal#(1)~under_appeal(A)')).toBe('(A)');
  });
});

describe('twinsReport — both directions', () => {
  it('twins keyed alike are `same` (zones, leading (n) and expression anchors never differ)', () => {
    const r = report(R, unit('10.20.40.10(2)', '(2)(A)'), unit('10.80.40.10(1)', '(1)(A)', { numeric_expression: ['height_m = overlay(HT) @(1)'] }));
    expect([r.groups, r.differ, r.list[0].kind, r.list[0].units.length]).toEqual([1, 0, 'same', 3]);
  });
  it.each([
    ['archetype', { archetype: 'PERMIT' }],
    ['bound', { bound: 'min' }],
    ['target', { target: 'height_storeys' }],
    ['numeric_expression', { numeric_expression: ['height_m = 10 m @(1)(A)'] }],
    ['condition', { condition: { tokens: ['overlay_mapped'], if: 'mapped(HT)' } }],
  ])('a %s difference is value_differs', (field, over) => {
    const r = report(R, unit('10.20.40.10(1)', '(1)(A)', over as Json));
    expect([r.list[0].kind, r.list[0].fields]).toEqual(['value_differs', [field]]);
    expect([r.differ, r.value, r.label_only]).toEqual([1, 1, 0]);
  });
  it.each([
    ['application', { application: { zones: ['RD'], building_types: ['detached_house'], lot_conditions: [], uses: [], evidence: {} } }],
    ['applies_to', { applies_to: { part: 'map_area', refs: [] } }],
    ['literals_not_expressed', { literals_not_expressed: [{ literal: '7.5', clause: '(1)(A)', reason: 'informational' }] }],
    ['calculation_handling.status', { calculation_handling: { status: 'partially_modelled' } }],
  ])('a %s-only difference is label_only', (field, over) => {
    const r = report(R, unit('10.20.40.10(1)', '(1)(A)', over as Json));
    expect([r.list[0].kind, r.list[0].fields]).toEqual(['label_only', [field]]);
    expect([r.differ, r.value, r.label_only, r.by_field[field]]).toEqual([1, 0, 1, 1]);
  });
  it('a value difference wins over a label difference in the same group', () => {
    const r = report(R, unit('10.20.40.10(1)', '(1)(A)', { bound: 'min', calculation_handling: { status: 'not_modelled' } }));
    expect([r.list[0].kind, r.list[0].fields]).toEqual(['value_differs', ['bound', 'calculation_handling.status']]);
  });
  it('the zone carried in application is never a difference; the evidence phrase never compared', () => {
    const r = report(R, unit('10.20.40.10(1)', '(1)(A)', { application: { zones: ['RD'], building_types: ['any'], lot_conditions: [], uses: [], evidence: { RD: 'the RD zone' } } }));
    expect(r.list[0].kind).toBe('same');
  });
  it('a literal entry keyed at its own regulation-local clause number is not a difference', () => {
    const a = unit('10.10.40.10(1)', '(1)(A)', { literals_not_expressed: [{ literal: '7.5', clause: '(1)(A)', reason: 'informational' }] });
    const b = unit('10.20.40.10(3)', '(3)(A)', { literals_not_expressed: [{ literal: '7.5', clause: '(3)(A)', reason: 'informational' }] });
    expect(report(a, b).list[0].kind).toBe('same');
  });
});

describe('twinsReport — what is not a twin group', () => {
  it('two units of the same regulation are never a group', () => {
    // same leaf `(A)` after the leading (n) drops, same text, but one regulation
    expect(twinsReport([{ unit: R, text: T }, { unit: unit('10.10.40.10(1)', '(2)(A)'), text: T }]).groups).toBe(0);
  });
  it('a different leaf, Ch.900 exceptions, a short text and different words are never grouped', () => {
    expect(report(R, unit('10.20.40.10(1)', '(1)(B)')).groups).toBe(0);
    expect(twinsReport([{ unit: unit('900.2.10(5)', '(5)(A)'), text: T }, { unit: unit('900.3.10(5)', '(5)(A)'), text: T }]).groups).toBe(0);
    expect(twinsReport([{ unit: R, text: '(A) 7.5 metres;' }, { unit: unit('10.20.40.10(1)', '(1)(A)'), text: '(A) 7.5 metres;' }]).groups).toBe(0);
    expect(twinsReport([{ unit: R, text: T }, { unit: unit('10.20.40.10(1)', '(1)(A)'), text: T.replace('maximum', 'minimum') }]).groups).toBe(0);
  });
  it('an unparseable expression projects without throwing (the report never throws on content)', () => {
    expect(() => projectUnit(unit('10.10.40.10(1)', '(1)(A)', { numeric_expression: ['not a statement'] }))).not.toThrow();
  });
});

describe('determinism + the line + the module self-test', () => {
  it('any input order gives a byte-identical report', () => {
    const us = [R, unit('10.20.40.10(1)', '(1)(A)', { bound: 'min' }), unit('10.40.40.10(1)', '(1)(A)'), unit('10.60.40.10(1)', '(1)(B)'), unit('10.80.40.10(1)', '(1)(B)', { archetype: 'PERMIT' })];
    const a = JSON.stringify(report(...us));
    expect(JSON.stringify(report(...[...us].reverse()))).toBe(a);
    expect(JSON.stringify(report(us[2]!, us[4]!, us[0]!, us[3]!, us[1]!))).toBe(a);
  });
  it('the --check line is indented (never WORD:-shaped, Spec 68 §4) and carries the counts', () => {
    const l = twinsLine({ groups: 106, differ: 69, value: 10, label_only: 59, units_in_differ: 245 });
    expect(l).toBe('  report-only twins: groups 106 · differ 69 (value 10 · label 59; 245 units) — never a blocker');
    expect(/^[A-Z ]+[0-9]?: /.test(l)).toBe(false);
  });
  it('closed sets: three kinds, nine compared fields', () => {
    expect(KINDS).toEqual(['same', 'label_only', 'value_differs']);
    expect(COMPARED_FIELDS).toEqual(['archetype', 'target', 'bound', 'numeric_expression', 'condition', 'application', 'applies_to', 'literals_not_expressed', 'calculation_handling.status']);
  });
  it('selfTest passes every fixture', () => {
    const r = selfTest();
    expect(r.results.filter((x: Json) => !x.pass)).toEqual([]);
    expect(r.pass).toBe(true);
  });
});
