// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (a data-table cell carries its row and column headers), §7.4, §9 G-CLAUSE; docs/specs/01-pipeline/69a_mcbylaw_register.md M-83
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs modules / seed JSON
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const CL = await load('scripts/analysis/bylaw/clause.mjs');
const FX = await load('scripts/analysis/bylaw/authored-fixtures.mjs');

const RID = '220.5.10.1(3)';
const rowOf = (): Json => FX.liveSlice().rows.find((r: Json) => r.regulation_id === RID);
const unitOf = (cond: string): Json => ({
  unit_id: '220.5.10.1(3)#(3)[T1.R3.C2]', archetype: 'LIMIT', target: 'loading_spaces', bound: 'min',
  numeric_expression: ['loading_spaces = 1 units @(3)[T1.R3.C2]'], requirement: 'none', instrument: 'none',
  evaluated_by_us: 'none', ranks_layers: 'none', condition: { tokens: [], if: cond }, applies_to: { part: 'whole', refs: [] },
  literals_not_expressed: [], application: { zones: [], building_types: ['non_residential_building'], lot_conditions: [], uses: [], evidence: { non_residential_building: 'a retail store' } },
  calculation_handling: { status: 'partially_modelled', not_modelled_reason: 'none', user_inputs: ['building_type'], description: 'x', gaps: 'y' },
  disclosure: 'none', not_an_override: [],
});
const run = (cond: string): Json => { const U = unitOf(cond); return CL.checkClause({ slice: FX.liveSlice(), units: new Map([[U.unit_id, U]]), vocab: FX.REAL_VOCAB, adjudications: FX.realAdjudications() }); };
const codes = (cond: string): string[] => run(cond).violations.map((v: Json) => v.code);

describe('P1-R6 W-3: a data-table cell is licensed by its row AND column header text (Spec 68 §6, G-CLAUSE §7.4)', () => {
  it('a: headerTexts walks one hop further than headerPaths (a row header is a cell under its own column header)', () => {
    expect(CL.headerTexts(rowOf(), '(3)[T1.R3.C2]')).toEqual(['Gross Floor Area', 'Minimum Number of Loading Spaces Required', '500 to 1,999 square metres']);
  });

  it('b: headerTexts of the column header cell is just its own row header', () => {
    expect(CL.headerTexts(rowOf(), '(3)[T1.R1.C2]')).toEqual(['Gross Floor Area']);
  });

  it('c: headerTexts is empty for a clause that is not a table cell / for an unknown cell', () => {
    expect(CL.headerTexts(rowOf(), '(3)')).toEqual([]);
    expect(CL.headerTexts(rowOf(), '(9)[T1.R9.C9]')).toEqual([]);
  });

  it('d: the column-header text licenses gfa_m2 ("gross floor area") and the header literals bind', () => {
    expect(codes('gfa_m2 ≥ 500 m2 and gfa_m2 ≤ 1999 m2')).toEqual([]);
  });

  it('e: a literal in no header stays red; licensing no longer adds variable_unlicensed', () => {
    expect(codes('gfa_m2 ≥ 501 m2 and gfa_m2 ≤ 1999 m2')).toEqual(['literal_not_in_clause']);
  });

  it('f: a variable no header or clause text licenses stays red (control)', () => {
    expect(codes('lot_area_m2 ≥ 500 m2')).toEqual(['variable_unlicensed']);
  });

  it('g: existing clause fixtures all keep their expected reason', () => {
    expect(CL.selfTest().pass).toBe(true);
  });
});
