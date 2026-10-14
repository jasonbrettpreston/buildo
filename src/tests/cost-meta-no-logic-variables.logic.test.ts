// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-BZ G1; R-CM)
//
// R-CM (2026-10-12): a cost stamp is a CONFIG-READ stamp, not a SQL re-read. The library reads
// each declared logic variable's `updated_at` in the SAME statement that reads its value and
// hangs it on the frozen, NON-enumerable `$meta` map of the config object it returns
// (scripts/lib/config-loader.js). Two sites in compute-parcel-cost-estimates.js used to re-read
// `logic_variables.updated_at` for `cost_escalation_index` — an emit stamp in `readCostContract`
// (sigRes.index_updated_at) and the freshness clock in `computePostPhase` (freshRes.index_as_of).
// Both subqueries are now bound parameters fed from `ctx.config.$meta` / `config.$meta`, so the
// value and its stamp cannot come from two different row versions. This test pins that:
// no statement issued by either hook mentions `logic_variables` at all, and the stamp parameter
// is exactly the `$meta` Date (or `null` when the row is absent — the same NULL the subquery
// returned).
//
// Fakes: a recording pool that answers every query with a plausible single row, so the stamp
// statements run for real. `readCostContract` merges the `parcel_cost_lines` rows through
// `mergeCostLines`, so the mock derives one row per declared `PARCEL_COST_LINES` id (imported
// from scripts/lib/parcel-cost.js) to keep the merge from throwing. `computePostPhase` runs past
// its freshness query into a `cost_by_zone` identity check that a stub `passRaw` cannot satisfy —
// unrelated to the stamp contract, so the throw is caught after the recorded SQL is asserted.

import { describe, expect, it } from 'vitest';

const compute = await import('../../scripts/lib/compute/compute-parcel-cost-estimates.js');
const { readCostContract, computePostPhase } = compute;
const { PARCEL_COST_LINES } = await import('../../scripts/lib/parcel-cost.js');

// The fakes below are structurally compatible, but not to the JSDoc-declared parameter types.
type ReadCostContractArg = Parameters<typeof readCostContract>[0];
/** `computePostPhase`'s JSDoc parameter list does not accept the bare fakes; call it through this. */
const callComputePostPhase = computePostPhase as unknown as (
  pool: unknown,
  ctx: unknown,
) => Promise<void>;

// One DB catalogue row per declared line id. A fit-gated line (carries `fitField`) MUST carry a
// permission vocabulary and a non-fit-gated line MUST NOT (mergeCostLines' vocabulary guard).
const parcelCostLineRows = () =>
  PARCEL_COST_LINES.map((line: { id: string; fitField?: string }) => ({
    id: line.id,
    archetype: 'A',
    base_confidence: 'high',
    fit_permitted_values: line.fitField ? ['permitted'] : null,
  }));

// `$meta` is FROZEN and NON-ENUMERABLE on the real config object (config-loader) — build it the
// same way, so a stray `config.$meta` enumeration or an accidental mutation would show up here.
const configWithMeta = (meta: Record<string, unknown>) => {
  const config: Record<string, unknown> = {
    cost_escalation_index: 1.07,
    cost_rates_stale_months: 24,
    cost_index_stale_months: 12,
  };
  Object.defineProperty(config, '$meta', {
    value: Object.freeze({ ...meta }),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return config;
};

type Call = { sql: string; params: unknown[] };

// A pool that records every `(sql, params)` and answers each query with a plausible row set.
const recordingPool = (calls: Call[]) => ({
  query: async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params || [] });
    if (/FROM parcel_cost_lines/.test(sql)) return { rows: parcelCostLineRows() };
    if (/FROM archetype_cost_rates/.test(sql) && !/MAX\(updated_at\)/.test(sql)) {
      return {
        rows: [
          { archetype: 'A', cost_per_sqm: 1000, cost_adjustment_factor: 1, escalation_index_base: 1 },
        ],
      };
    }
    // Both `readCostContract`'s sig query and `computePostPhase`'s freshness query select the
    // stamp aliases; hand back a single row carrying every plausible alias.
    return {
      rows: [
        {
          rates_as_of: null,
          index_updated_at: null,
          cost_lines_updated_at: null,
          index_as_of: null,
          rates_age_months: null,
          index_age_months: null,
          rates_future: false,
        },
      ],
    };
  },
});

const INDEX_STAMP = new Date('2026-04-01T02:03:04.000Z');

describe('cost stamps come from config.$meta, never logic_variables (R-CM)', () => {
  it('readCostContract binds the $meta Date and issues no logic_variables SQL (sigRes)', async () => {
    const calls: Call[] = [];
    const pool = recordingPool(calls);
    const ctx = { pool, config: configWithMeta({ cost_escalation_index: { updated_at: INDEX_STAMP } }) };

    await readCostContract(ctx as unknown as ReadCostContractArg);

    expect(calls.length).toBeGreaterThan(0);
    for (const { sql } of calls) expect(sql).not.toContain('logic_variables');

    // The stamp statement: the one selecting `index_updated_at` as a bound parameter.
    const sig = calls.find((c) => c.sql.includes('index_updated_at'));
    expect(sig).toBeDefined();
    expect(sig!.sql).toContain('$1::timestamptz AS index_updated_at');
    expect(sig!.params).toEqual([INDEX_STAMP]);
  });

  it('readCostContract binds null when $meta lacks the name', async () => {
    const calls: Call[] = [];
    const pool = recordingPool(calls);

    await readCostContract({ pool, config: configWithMeta({}) } as unknown as ReadCostContractArg);

    const sig = calls.find((c) => c.sql.includes('index_updated_at'));
    expect(sig).toBeDefined();
    expect(sig!.params).toEqual([null]);
  });

  it('computePostPhase binds [runAt, $meta Date] and issues no logic_variables SQL (freshRes)', async () => {
    const calls: Call[] = [];
    const pool = recordingPool(calls);
    const runAt = new Date('2026-05-05T00:00:00.000Z');
    const config = configWithMeta({ cost_escalation_index: { updated_at: INDEX_STAMP } });

    try {
      await callComputePostPhase(pool, { passRaw: {}, config, runAt });
    } catch {
      // cost_by_zone identity HALT on the stub passRaw — not the subject; SQL is recorded.
    }

    expect(calls.length).toBeGreaterThan(0);
    for (const { sql } of calls) expect(sql).not.toContain('logic_variables');

    const fresh = calls.find((c) => c.sql.includes('index_as_of'));
    expect(fresh).toBeDefined();
    // The statement is column-aligned, so collapse runs of whitespace before matching the phrase.
    expect(fresh!.sql.replace(/\s+/g, ' ')).toContain('$2::timestamptz::date AS index_as_of');
    expect(fresh!.params).toEqual([runAt, INDEX_STAMP]);
  });

  it('computePostPhase binds null for a missing $meta entry', async () => {
    const calls: Call[] = [];
    const pool = recordingPool(calls);
    const runAt = new Date('2026-05-05T00:00:00.000Z');

    try {
      await callComputePostPhase(pool, { passRaw: {}, config: configWithMeta({}), runAt });
    } catch {
      /* see above */
    }

    const fresh = calls.find((c) => c.sql.includes('index_as_of'));
    expect(fresh).toBeDefined();
    expect(fresh!.params).toEqual([runAt, null]);
  });
});

// R-CL (2026-10-12): the duplicate-archetype HALT that used to live in `readCostContract`
// (a `seen` Set over the `archetype_cost_rates` rows) was dead code — `migrations/205` declares
// `archetype TEXT PRIMARY KEY`, so a duplicate row cannot exist and no compute-side check can
// ever fire. The invariant is now cited at its source of truth (the table's own key). These two
// tests are the lock: if the key is ever dropped, (a) goes red and the compute check must come
// back as a `checks[]` row; (b) keeps the retired throw from creeping back in unaccompanied.
describe('R-CL — archetype uniqueness is the primary key', () => {
  it('migration 205 declares archetype as the archetype_cost_rates PRIMARY KEY', async () => {
    const fs = await import('node:fs');
    const sql = fs.readFileSync('migrations/205_archetype_cost_rates.sql', 'utf8');
    expect(sql).toMatch(/archetype\s+TEXT\s+PRIMARY KEY/);
  });

  it('the compute source no longer carries the duplicate-archetype HALT', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(
      'scripts/lib/compute/compute-parcel-cost-estimates.js',
      'utf8',
    );
    expect(src).not.toContain('duplicate archetype');
  });
});
