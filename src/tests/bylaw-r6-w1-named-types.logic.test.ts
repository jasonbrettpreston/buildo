// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-76 (A1); docs/specs/01-pipeline/68_mcbylaw_standard.md §6.4 rule 7, §9 G-CLAUSE
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs modules / seed JSON
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const CL = await load('scripts/analysis/bylaw/clause.mjs');
const FX = await load('scripts/analysis/bylaw/authored-fixtures.mjs');

const V = { building_type: { any: {}, ancillary_building: {}, garden_suite: {}, laneway_suite: {}, detached_house: {}, semi_detached_house: {}, townhouse: {}, apartment_building: {} } };

describe('namedTypes (Spec 69a M-76 A1; Spec 68 §6.4 rule 7)', () => {
  it('drops "except when located inside X containing Y or Z"', () => {
    expect(CL.namedTypes('access must be provided via an unobstructed aisle, except when located inside an ancillary building containing a garden suite or laneway suite: (A) 2.5 metres', V)).toEqual([]);
  });
  it('drops "other than an X containing Y or Z"', () => {
    expect(CL.namedTypes('All bicycle parking spaces located in a building, other than an ancillary building containing a laneway suite or garden suite, must have a passageway', V)).toEqual([]);
  });
  it('keeps a positively named type alongside "or a building"', () => {
    expect(CL.namedTypes('a day nursery may be in an apartment building or a building', V)).toEqual(['apartment_building']);
  });
  it('drops a trailing "except a <type>"', () => {
    expect(CL.namedTypes('a detached house, except a garden suite, has', V)).toEqual(['detached_house']);
  });
  it('keeps a positive list of named types', () => {
    expect(CL.namedTypes('a garden suite and a laneway suite are', V)).toEqual(['garden_suite', 'laneway_suite']);
  });
  it('drops the "other than a <t>, <t> or a <t>" list form', () => {
    expect(CL.namedTypes('other than a detached house, semi-detached house or a townhouse', V)).toEqual([]);
  });
  it('keeps "X containing Y" when it is not an exclusion', () => {
    expect(CL.namedTypes('an ancillary building containing a garden suite', V)).toEqual(['ancillary_building', 'garden_suite']);
  });
  it('real 230.5.1.10(14) clause names no building type', () => {
    const text = '(14) Aisle Width Within areas used for bicycle parking, access to bicycle parking spaces must be provided via an unobstructed aisle that complies with the following, except when located inside an ancillary building containing a garden suite or laneway suite: (A) 2.5 metres width if it is a stacked bicycle parking space or an oversized bicycle parking space; and';
    expect(CL.namedTypes(text, FX.REAL_VOCAB)).toEqual([]);
  });
  it('real 800.50(345) clause still names ancillary_building', () => {
    const text = '(345) Home Occupation means a business use within a dwelling unit, living accommodation or ancillary building or structure, where the dwelling unit or living accommodation is the principal residence of the business operator.';
    expect(CL.namedTypes(text, FX.REAL_VOCAB)).toEqual(['ancillary_building']);
  });
  it('clause selfTest passes', () => {
    expect(CL.selfTest().pass).toBe(true);
  });
});
