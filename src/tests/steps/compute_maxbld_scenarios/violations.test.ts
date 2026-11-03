// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md section 6 (G7: the step's violation suite); docs/specs/01-pipeline/78_optimal_lot_configuration.md D-1
//
// G7: every violation the step's census can raise is exercised directly against `censusOf` / `contentSha` /
// `populationIds`, and the dispatch table covers every check the descriptor declares.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const M = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js'));
const descriptor: Json = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scripts/compute-maxbld-scenarios.descriptor.json'), 'utf8'),
);

const NO_UNIVERSE = { lv: {}, names: {} };
const row = (over: Json): Json =>
  ({ status: 'computed', value: null, trace: [], flags: [], reason: null, ...over });

const baseRow = (value: number | null): Json => ({
  parcel_id: 1, building_type: 'b', field_id: 'f', increment: '1', status: 'computed', value, unit: 'm',
  reason: null, flags: [], trace: [], switches: [], catalogue_sha: 'c', switchboard_sha: 's', settings_sha: 't',
  layer2_table_version: 'v', building_types_sha: 'bt',
});

describe('compute_maxbld_scenarios violations (G7)', () => {
  it('a status outside the closed set is counted', () => {
    const rows = [row({ status: 'invented', value: null, trace: [], flags: [], reason: 'x' })];
    expect(M.censusOf(rows, NO_UNIVERSE).status_outside_closed_set).toBe(1);
  });

  it('a number with no trace is counted', () => {
    const rows = [row({ status: 'computed', value: 3, trace: [], flags: [], reason: null })];
    expect(M.censusOf(rows, NO_UNIVERSE).numbers_without_trace).toBe(1);
  });

  it('a not_buildable row that still carries a value is counted', () => {
    const rows = [row({ status: 'not_buildable', value: 7, trace: [], flags: ['no_room'], reason: 'r' })];
    expect(M.censusOf(rows, NO_UNIVERSE).not_buildable_with_value).toBe(1);
  });

  it('a trace entry naming an undeclared fact is a closure violation', () => {
    const violated = [row({ status: 'computed', value: 3, trace: [{ kind: 'fact', id: 'nowhere' }] })];
    expect(M.censusOf(violated, NO_UNIVERSE).closure_violations).toBe(1);
    const resolved = [row({ status: 'computed', value: 3, trace: [{ kind: 'fact', id: 'nowhere' }] })];
    expect(M.censusOf(resolved, { lv: {}, names: { nowhere: 'm' } }).closure_violations).toBe(0);
  });

  it('a not_evaluated row with neither flag nor reason is counted', () => {
    const rows = [row({ status: 'not_evaluated', value: null, trace: [], flags: [], reason: null })];
    expect(M.censusOf(rows, NO_UNIVERSE).flags_missing).toBe(1);
  });

  it('a changed value changes the content sha', () => {
    expect(M.contentSha(baseRow(1))).not.toBe(M.contentSha(baseRow(2)));
  });

  it('every declared check id has a dispatch entry', () => {
    for (const check of descriptor.checks as Json[]) {
      expect(Object.prototype.hasOwnProperty.call(M.CHECKS, check.id)).toBe(true);
    }
  });

  it('a population id that is not an integer is dropped', () => {
    expect(M.populationIds(['1', 'x', '2.5', '3'])).toEqual([1, 3]);
  });
});
