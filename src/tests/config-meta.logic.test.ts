// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-BZ G1; R-CM ctx.config.$meta)
//
// R-CM (2026-10-12): a compute must never read `logic_variables` itself (R-BZ
// G1), yet `compute-parcel-cost-estimates.js` wanted `cost_escalation_index`'s
// `updated_at` as a version stamp — a separate, LATER read that could disagree
// with the value it stamps. The stamp is now library-owned: it is selected by
// the SAME statement that reads the value, travels with the config, and is
// exposed as `ctx.config.$meta[name].updated_at`. These cases pin the three
// properties that make the fix safe to consume:
//   (a) the projection of VALUES is unchanged by the stamp's presence;
//   (b) the stamp is exactly the row's `updated_at`, taken from that snapshot;
//   (c) exactly ONE statement reads `logic_variables` VALUES and it selects
//       `updated_at` — value + stamp cannot come from two reads;
//   (d) `$meta` is non-enumerable, so counts, hashes and serialisations of
//       `values` are byte-identical to the pre-R-CM behaviour.

import { describe, expect, it, vi } from 'vitest';

const { resolveConfig } = await import('../../scripts/lib/step/config.js');

/** The fake pool is structurally compatible, but not to the JSDoc `Pool` type. */
type PoolArg = Parameters<typeof resolveConfig>[0];

/** The `updated_at` the fake `logic_variables` row carries. */
const ROW_UPDATED_AT = new Date('2026-10-01T00:00:00Z');

/**
 * A pool whose `query(sql, params)` answers by statement text, the way the two
 * callers inside this path do: the loader's logic_variables SELECT, the
 * loader's trade_configurations SELECT, and `resolveConfig`'s own declared-names
 * presence SELECT. Every statement is recorded, verbatim.
 */
function fakePool() {
  const sql: string[] = [];
  const pool = {
    query: vi.fn(async (text: string, _params?: unknown[]) => {
      sql.push(text);
      if (text.includes('FROM logic_variables') && text.includes('WHERE')) {
        // The presence query (R-A/R-D) — answer it for the one declared name.
        return { rows: [{ variable_key: 'a' }] };
      }
      if (text.includes('variable_value_json')) {
        // THE logic-variables value statement — value AND stamp, one row.
        return {
          rows: [
            {
              variable_key: 'a',
              variable_value: '1',
              variable_value_json: null,
              updated_at: ROW_UPDATED_AT,
            },
          ],
        };
      }
      if (text.includes('trade_configurations')) return { rows: [] };
      return { rows: [] };
    }),
  };
  return { pool, sql };
}

/** A descriptor declaring exactly one logic variable, `a`. */
const descriptor = {
  identity: { name: 'meta-probe' },
  config: {
    category: 'logic-variables',
    logic_variables: [{ name: 'a', min: 0, max: 10, on_invalid: 'fail' }],
  },
};

describe('ctx.config.$meta (R-CM)', () => {
  it('projects the same value and carries the row stamp', async () => {
    const { pool } = fakePool();
    const { values, stamp } = await resolveConfig(pool as unknown as PoolArg, descriptor);

    // (a) the VALUE projection is unchanged by the stamp's presence.
    expect(values.a).toBe(1);
    expect(stamp).toEqual({ a: 1 });

    // (b) the stamp is the row's `updated_at`, from the same snapshot. `$meta` is not on the
    // JSDoc-declared type, so read it through a typed view.
    const meta = (values as unknown as { $meta: Record<string, { updated_at: unknown }> }).$meta;
    expect(meta.a?.updated_at).toBe(ROW_UPDATED_AT);
    expect(Object.keys(meta)).toEqual(['a']);

    // (e) `$meta` is frozen — and non-extensible in shape.
    expect(Object.isFrozen(meta)).toBe(true);
    expect(() => {
      (meta as any).a = { updated_at: null };
    }).toThrow();
  });

  it('keeps $meta invisible to enumeration, serialisation and the config hash', async () => {
    const { pool } = fakePool();
    const { values } = await resolveConfig(pool as unknown as PoolArg, descriptor);

    // (c) NON-enumerable: no key appears to `Object.keys`…
    expect(Object.keys(values)).toEqual(['a']);
    expect(Object.getOwnPropertyNames(values)).toContain('$meta');
    // …and no serialisation (the config hash's input) can see it.
    expect(JSON.stringify(values)).toBe('{"a":1}');
    expect(JSON.stringify(values)).not.toContain('$meta');
  });

  it('reads the value and its stamp in exactly ONE statement', async () => {
    const { pool, sql } = fakePool();
    await resolveConfig(pool as unknown as PoolArg, descriptor);

    // (d) exactly one recorded statement reads `logic_variables` VALUES, and it
    // selects `updated_at` alongside `variable_key` — a stamp that cannot be a
    // separate, later read (the F11 atomic-read fence, strengthened by R-CM).
    const valueStatements = sql.filter(
      (s) => s.includes('FROM logic_variables') && s.includes('variable_key') && s.includes('variable_value'),
    );
    expect(valueStatements).toHaveLength(1);
    expect(valueStatements[0]).toContain('updated_at');
    expect(valueStatements[0]).not.toContain('WHERE');
  });

  it('leaves a config: "none" step with a frozen empty values and no $meta', async () => {
    const { pool, sql } = fakePool();
    const none = { identity: { name: 'meta-probe' }, config: 'none' };
    const { values, stamp } = await resolveConfig(pool as unknown as PoolArg, none);

    expect(Object.keys(values)).toEqual([]);
    expect((values as any).$meta).toBeUndefined();
    expect(stamp).toBeNull();
    expect(sql).toHaveLength(0);
  });
});
