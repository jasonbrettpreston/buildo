// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (a data-table cell carries its row and column headers), §9 G-CLAUSE; docs/specs/01-pipeline/69a_mcbylaw_register.md M-83
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

describe('P1-R5 Q7(a): a data-table cell clause includes its row and column headers (Spec 68 §6, G-CLAUSE)', () => {
  it('a: headerPaths names the row-header cell and the column-header cells only', () => {
    const row = rowOf();
    expect([...CL.headerPaths(row, '(3)[T1.R3.C2]')].sort()).toEqual(['(3)[T1.R1.C2]', '(3)[T1.R3.C1]']);
    expect([...CL.headerPaths(row, '(3)[T1.R1.C2]')]).toEqual(['(3)[T1.R1.C1]']);
    expect(CL.headerPaths(row, '(3)').size).toBe(0);
    expect(CL.headerPaths(row, '(9)[T1.R9.C9]').size).toBe(0);
  });

  it('b: a condition literal in a row/column header binds and the header licenses the variable', () => {
    const r = run('gfa_m2 ≥ 500 m2 and gfa_m2 ≤ 1999 m2');
    const codes = r.violations.map((v: Json) => v.code);
    expect(codes).not.toContain('literal_not_in_clause');
    expect(codes).toEqual([]);
  });

  it('c: a literal in no header and not in the cell stays a violation', () => {
    const r = run('gfa_m2 ≥ 501 m2 and gfa_m2 ≤ 1999 m2');
    const bad = r.violations.filter((v: Json) => v.code === 'literal_not_in_clause');
    expect(bad).toHaveLength(1);
    expect(bad[0].detail).toContain('501m2');
  });

  it('d: existing clause fixtures all keep their expected single reason', () => {
    expect(CL.selfTest().pass).toBe(true);
  });
});
