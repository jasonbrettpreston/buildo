// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §2 Population (line 36: "the logic variable
//            resolve_bylaws_population_zone_classes (a JSON list of evaluator zone codes ...)"; line 121 prerequisites);
//            docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-IX (Q-L2-3, the seed loader's list type is
//            settled at commit ①); docs/specs/01-pipeline/124_step_standard_policy.md R-AY (a registered logic variable)
//
// The seed loader's list type: a seed entry `type: "list"` stores like a string-typed variable (R-CE): sentinel 0 in
// variable_value, the JSON array in variable_value_json (migration 097 column; migration 280's storage shape). The
// numeric and string arms are byte-identical (locked in string-logic-variable.logic.test.ts).
//
// RED FIRST: docs/reports/red-evidence/resolve_bylaws/list-type-red.json.
import { describe, expect, it } from 'vitest';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const apply = require(path.join(ROOT, 'scripts/seeds/apply-logic-variables.js')) as (pool: unknown, seeds?: Record<string, unknown>) => Promise<void>;

type Call = { sql: string; params: unknown[] };
const run = async (seeds: Record<string, unknown>): Promise<Call[]> => {
  const calls: Call[] = [];
  await apply({ query: async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return { rowCount: 1 }; } }, seeds);
  return calls;
};

describe('apply-logic-variables: the list type', () => {
  it('a type "list" entry stores sentinel 0 in variable_value and the JSON array in variable_value_json, idempotently', async () => {
    const calls = await run({ zone_list: { type: 'list', default: ['R', 'RD'], description: 'd' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/variable_value_json/);
    expect(calls[0]!.sql).toMatch(/VALUES \(\$1, 0, \$2::jsonb, \$3\)/);
    expect(calls[0]!.sql).toMatch(/ON CONFLICT \(variable_key\) DO NOTHING/);
    expect(calls[0]!.params).toEqual(['zone_list', '["R","RD"]', 'd']);
  });

  it('a list default that is not an array is refused by name', async () => {
    await expect(run({ zone_list: { type: 'list', default: 'R', description: 'd' } })).rejects.toThrow(/zone_list.*list.*array/);
  });

  it('the number and string arms are unchanged', async () => {
    const calls = await run({ n: { type: 'number', default: 5 }, s: { type: 'string', default: 'UTC' } });
    expect(calls[0]!.params).toEqual(['n', 5, null]);
    expect(calls[1]!.sql).toContain('to_jsonb($2::text)');
    expect(calls[1]!.params).toEqual(['s', 'UTC', null]);
  });
});
