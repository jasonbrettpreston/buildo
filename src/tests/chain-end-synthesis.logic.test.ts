// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 13, R-T addendum, commit 5)
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md
//
// scripts/analysis/chain-end-synthesis.mjs — fixture-level (no DB) coverage
// for the two pure pieces: the Fold B-9 cost-cap formula, and the
// `validate_only`-only execution filter (Ask 6(b)'s "GREEN" counterpart to
// commit 3's existing "a validate_only invariant does NOT fire at the
// run-end hook" RED lock — this proves it DOES fire here).

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const synthesis = require('../../scripts/analysis/chain-end-synthesis.mjs') as unknown as {
  computeValidateOnlyCostCap: (
    descriptorsByName: Record<string, { descriptor: Record<string, unknown> }>,
    chainDurationMs: number | null,
  ) => { entries: Array<Record<string, unknown>>; summedCostMs: number; chainDurationMs: number | null; unmeasuredCount: number; ratio: number | null };
  runValidateOnlyTier: (
    pool: { query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>; connect: () => Promise<unknown> },
    descriptorsByName: Record<string, { descriptor: Record<string, unknown> }>,
  ) => Promise<Array<{ step: string; metric: string; source: string; status: string; value: unknown }>>;
};

// Node ESM interop under vitest/CJS require: the .mjs module's named exports
// land on the resolved module namespace object directly (no `.default`
// wrapper needed here — proven by the assertions below actually resolving).

function fakeDescriptors(spec: Record<string, { invariants?: unknown[]; plausibility?: unknown[] }>) {
  const out: Record<string, { descriptor: Record<string, unknown> }> = {};
  for (const [step, { invariants, plausibility }] of Object.entries(spec)) {
    out[step] = { descriptor: { invariants: invariants ?? 'none', plausibility: plausibility ?? 'none' } };
  }
  return out;
}

describe('computeValidateOnlyCostCap (Fold B-9) — computed LIVE from last_measured, never hardcoded', () => {
  it('sums cost_ms across validate_only entries only, ignoring every_run entries entirely', () => {
    const byName = fakeDescriptors({
      link_massing: {
        invariants: [
          { id: 'cheap', frequency: 'every_run', last_measured: { cost_ms: 500 } },
          { id: 'slow', frequency: 'validate_only', last_measured: { cost_ms: 30000 } },
        ],
      },
      link_parcel_addresses: {
        invariants: [{ id: 'missed_link_count', frequency: 'validate_only', last_measured: { cost_ms: 66534 } }],
      },
    });
    const cap = synthesis.computeValidateOnlyCostCap(byName, 600000);
    expect(cap.summedCostMs).toBe(30000 + 66534);
    expect(cap.entries).toHaveLength(2);
    expect(cap.entries.map((e) => e.id)).toEqual(['slow', 'missed_link_count']);
    expect(cap.ratio).toBeCloseTo((30000 + 66534) / 600000, 10);
  });

  it('a different chain duration produces a DIFFERENT ratio from the SAME cost sum — proves the formula is live, not a hardcoded constant', () => {
    const byName = fakeDescriptors({
      link_massing: { invariants: [{ id: 'slow', frequency: 'validate_only', last_measured: { cost_ms: 10000 } }] },
    });
    const capShort = synthesis.computeValidateOnlyCostCap(byName, 20000);
    const capLong = synthesis.computeValidateOnlyCostCap(byName, 2000000);
    expect(capShort.summedCostMs).toBe(capLong.summedCostMs); // same numerator
    expect(capShort.ratio).not.toBe(capLong.ratio); // different denominator -> different ratio
    expect(capShort.ratio).toBeCloseTo(0.5, 10);
    expect(capLong.ratio).toBeCloseTo(0.005, 10);
  });

  it('an entry with no last_measured yet contributes 0 to the sum but IS counted as unmeasured (never silently dropped)', () => {
    const byName = fakeDescriptors({
      link_massing: { invariants: [{ id: 'not_yet_timed', frequency: 'validate_only' }] },
    });
    const cap = synthesis.computeValidateOnlyCostCap(byName, 1000);
    expect(cap.summedCostMs).toBe(0);
    expect(cap.unmeasuredCount).toBe(1);
    expect(cap.entries[0]?.cost_ms).toBeNull();
  });

  it('null chain duration (chain row has no duration_ms yet) yields a null ratio, not a divide-by-zero/Infinity', () => {
    const byName = fakeDescriptors({
      link_massing: { invariants: [{ id: 'slow', frequency: 'validate_only', last_measured: { cost_ms: 100 } }] },
    });
    const cap = synthesis.computeValidateOnlyCostCap(byName, null);
    expect(cap.ratio).toBeNull();
  });

  it('plausibility[] entries are counted alongside invariants[], tagged with the right source', () => {
    const byName = fakeDescriptors({
      compute_centroids: {
        plausibility: [{ id: 'drift', frequency: 'validate_only', last_measured: { cost_ms: 1200 } }],
      },
    });
    const cap = synthesis.computeValidateOnlyCostCap(byName, 10000);
    expect(cap.entries).toEqual([{ step: 'compute_centroids', id: 'drift', source: 'plausibility', cost_ms: 1200 }]);
  });
});

describe('runValidateOnlyTier — Ask 6(b) GREEN: validate_only entries DO execute here (fake pool)', () => {
  function fakePool(answers: Record<string, unknown>) {
    return {
      query: async (text: string) => {
        for (const [needle, value] of Object.entries(answers)) {
          if (text.includes(needle)) return { rows: [{ v: value }] };
        }
        return { rows: [{ v: 0 }] };
      },
      connect: async () => ({
        query: async (text: string) => {
          if (text === 'BEGIN' || text === 'COMMIT' || text.startsWith('SET LOCAL')) return { rows: [] };
          for (const [needle, value] of Object.entries(answers)) {
            if (text.includes(needle)) return { rows: [{ v: value }] };
          }
          return { rows: [{ v: 0 }] };
        },
        release: () => {},
      }),
    };
  }

  it('executes ONLY the validate_only entry, never the every_run sibling (the run-end hook already owns that one)', async () => {
    const byName = fakeDescriptors({
      link_massing: {
        invariants: [
          { id: 'every_run_entry', frequency: 'every_run', bound: 'value_min 0', severity: 'INFO', blocking: false, source: 'invariant', sql: 'SELECT count(*) AS v FROM EVERY_RUN_NEEDLE' },
          { id: 'validate_only_entry', frequency: 'validate_only', bound: 'value_min 0', severity: 'INFO', blocking: false, source: 'invariant', sql: 'SELECT count(*) AS v FROM VALIDATE_ONLY_NEEDLE' },
        ],
      },
    });
    const pool = fakePool({ VALIDATE_ONLY_NEEDLE: 7 });
    const rows = await synthesis.runValidateOnlyTier(pool, byName);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ step: 'link_massing', metric: 'validate_only_entry', source: 'invariant', status: 'INFO', value: 7 });
  });

  it('a step with neither invariants nor plausibility contributes zero rows, no error', async () => {
    const byName = fakeDescriptors({ assert_schema: {} });
    const pool = fakePool({});
    const rows = await synthesis.runValidateOnlyTier(pool, byName);
    expect(rows).toEqual([]);
  });

  it('a query error becomes a FAIL row, never silently swallowed', async () => {
    const byName = fakeDescriptors({
      link_wsib: {
        invariants: [{ id: 'broken', frequency: 'validate_only', bound: 'value_min 0', severity: 'WARN', blocking: false, source: 'invariant', sql: 'SELECT 1/0 AS v' }],
      },
    });
    const throwingPool = {
      query: async () => { throw new Error('simulated DB error'); },
      connect: async () => ({ query: async () => { throw new Error('simulated DB error'); }, release: () => {} }),
    };
    const rows = await synthesis.runValidateOnlyTier(throwingPool, byName);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('FAIL');
    expect(String(rows[0]?.value)).toMatch(/simulated DB error/);
  });
});
