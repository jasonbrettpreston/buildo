// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §2 (Population: a query over the logic variable resolve_bylaws_population_zone_classes);
//            docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-IU (Q-L2-4: the zone list is a logic variable), R-IX (commit ①), R-AY
// Handbook: Spec 132 §core.8 (R-CV: EXTERNALIZED, a missing row fails the run); Spec 132 §core.17 (R-AY: the population is a declared query over registered variables)
//
// Q-J: the list-valued logic variable, third kind after the numeric and the R-CE string enum. The seed loader's `type: "list"` landed in
// daed754a (src/tests/list-logic-variable.logic.test.ts); this is the config.js arm that was owed to commit ①: invalidReason(raw, min, max, allowed, listOf)
// and the descriptor field `list_of` (a closed set of allowed items, min/max "none", on_invalid "fail" only, like `enum`).
// RED FIRST: docs/reports/red-evidence/resolve_bylaws/list-config-red.json.
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runnerVariableRows } from './helpers/runner-variables';

const ROOT = path.resolve(__dirname, '..', '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { invalidReason, resolveConfig } = require('../../scripts/lib/step/config.js');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/steps/_schema/step.schema.json'), 'utf8')) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ZONES = ['R', 'RD', 'RS', 'RT', 'RM'];

describe('invalidReason — the list arm (Q-J)', () => {
  it('a non-empty array of distinct allowed items is usable', () => {
    expect(invalidReason(['RD', 'R'], null, null, undefined, ZONES)).toBeNull();
    expect(invalidReason(['RM'], null, null, undefined, ZONES)).toBeNull();
  });

  it("an empty list, a repeat, a non-member, a non-string item or a non-array is 'not_in_list'", () => {
    for (const bad of [[], ['RD', 'RD'], ['RD', 'CR'], ['RD', 3], 'RD', 5, null, undefined, { 0: 'RD' }]) {
      expect(invalidReason(bad, null, null, undefined, ZONES), JSON.stringify(bad)).toBe('not_in_list');
    }
  });

  it('the numeric and the enum paths are unchanged byte for byte', () => {
    expect(invalidReason(5, 0, 10)).toBeNull();
    expect(invalidReason(11, 0, 10)).toBe('above_max');
    expect(invalidReason('x', 0, 10)).toBe('non_finite');
    expect(invalidReason('UTC', null, null, ['UTC'])).toBeNull();
    expect(invalidReason('Paris', null, null, ['UTC'])).toBe('not_in_enum');
    expect(invalidReason(['RD'], null, null, undefined, undefined)).toBe('non_finite');
  });
});

describe('the descriptor schema: a logic variable may declare list_of (closed items), min/max none, on_invalid fail only', () => {
  const item = (): Record<string, any> => SCHEMA.properties.config.anyOf[1].properties.logic_variables.items; // eslint-disable-line @typescript-eslint/no-explicit-any
  it('list_of is a unique non-empty array of strings', () => {
    expect(item().properties.list_of).toMatchObject({ type: 'array', minItems: 1, uniqueItems: true });
  });
  it('a list_of variable pins min and max to "none" and on_invalid to "fail" (as enum does)', () => {
    const rule = (item().allOf as Array<Record<string, any>>).find((r) => JSON.stringify(r.if).includes('list_of')); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(rule).toBeTruthy();
    expect(rule!.then.properties).toMatchObject({ min: { const: 'none' }, max: { const: 'none' }, on_invalid: { const: 'fail' } });
  });
});

describe('resolveConfig — a list-valued variable resolves through the JSON branch', () => {
  function poolWith(logicVars: Record<string, unknown>) {
    const rows = Object.entries(logicVars).map(([variable_key, json]) => ({ variable_key, variable_value: 0, variable_value_json: json }));
    return { query: async () => ({ rows: [...runnerVariableRows(), ...rows] }) };
  }
  const decl = (over: Record<string, unknown> = {}) => ({
    identity: { name: 'test_step' },
    config: { logic_variables: [{ name: 'test_zone_list', min: 'none', max: 'none', on_invalid: 'fail', list_of: ZONES, ...over }] },
  });

  it('a valid list is projected into values and stamp as the array itself', async () => {
    const { values, stamp } = await resolveConfig(poolWith({ test_zone_list: ['RD', 'RM'] }), decl());
    expect(values.test_zone_list).toEqual(['RD', 'RM']);
    expect(stamp.test_zone_list).toEqual(['RD', 'RM']);
  });

  it('a list with a non-member is refused by on_invalid "fail", naming the list', async () => {
    await expect(resolveConfig(poolWith({ test_zone_list: ['RD', 'CR'] }), decl())).rejects.toThrow(/not_in_list/);
    await expect(resolveConfig(poolWith({ test_zone_list: ['RD', 'CR'] }), decl())).rejects.toThrow(/items of/);
  });

  it('an empty list is refused (an empty population retracts every lot)', async () => {
    await expect(resolveConfig(poolWith({ test_zone_list: [] }), decl())).rejects.toThrow(/not_in_list/);
  });

  it('a list_of with on_invalid other than "fail" throws the defence-in-depth error', async () => {
    await expect(resolveConfig(poolWith({ test_zone_list: ['RD'] }), decl({ on_invalid: 'clamp' }))).rejects.toThrow(/on_invalid .* "fail" only/);
  });
});
