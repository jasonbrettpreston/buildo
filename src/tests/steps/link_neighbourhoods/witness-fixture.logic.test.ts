// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (Phase 1 WITNESS, P1-C4b fixture guard)
// Plan: .cursor/wf2_registry_truth_active_task.md "## Fold 7" ruling 2 (P1-C4b: guarded fixture tests for the no-DB suites)
//
// P1-C4b — `link_neighbourhoods`: drives the REAL lifecycle (`pipeline.step(DESCRIPTOR, compute).run(...)`, real descriptor +
// real compute + real step library) on a RECORDING FAKE pool (no DB, no network) wrapped by the fixture guard,
// so every statement the step issues is resolved against its descriptor and recorded in
// docs/reports/witness/link_neighbourhoods.fixture.json. The step's chain is MEASURED as `sources`: this descriptor
// declares `sharing.varies_by_chain.checks: "none"`, every one of its checks carries `chains: "all"`, and its
// `execution.invocation` names both `permits` (phase 8) and `sources` (phase 10) — so BOTH chains issue the identical
// statement set, and `sources` is the one whose fixture record this suite writes. The fake answers the pre-write gate's
// corpus read with 150 — a non-empty boundary table ABOVE the seeded floor (`sources_neighbourhoods_floor` at its declared
// min), which is the measured path that lets the gate open — and the single set-based join UPDATE with one stamped
// `permit_num`; the post-write checks then read the `zeroRow` fallback, so the cumulative rate and the table-wide counts
// read 0 and the run's terminal is pinned as OBSERVED rather than assumed. Undeclared reads/writes are RECORDED, never
// asserted away (converted slug → report-only, Fold 7 ruling 3).
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { witnessGuard } from '../_witness-guard';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library + this step's real descriptor/compute */
const pipeline = require(join(process.cwd(), 'scripts/lib/pipeline.js'));
const DESCRIPTOR = require(join(process.cwd(), 'scripts/link-neighbourhoods.descriptor.json'));
const compute = require(join(process.cwd(), 'scripts/lib/compute/link-neighbourhoods.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

// P1-C4b fixture guard (Fold 7): every statement on the wrapped handle is resolved against this step's descriptor.
const guard = witnessGuard('link_neighbourhoods', __filename);

type Answer = { rows: unknown[]; rowCount?: number };

/** Every declared logic variable, seeded at its declared `min` (inside [min,max]; the config loader requires a row for each). */
function seededVars(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const v of (DESCRIPTOR.config as { logic_variables: Array<{ name: string; min?: number }> }).logic_variables) {
    out[v.name] = v.min ?? 0;
  }
  return out;
}

/** A row whose every property reads 0 — answers the compute's COUNT/aggregate reads without naming a column. */
const zeroRow = (): Answer => ({
  rows: [new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k !== 'then' && k !== 'toJSON' ? 0 : undefined) })],
  rowCount: 0,
});

function recordingPool(stepAnswer: (text: string, values: unknown[]) => Answer | null, fallback: () => Answer) {
  const sql: string[] = [];
  const logicVars = seededVars();
  const answer = (text: string, values: unknown[]): Answer => {
    const own = stepAnswer(text, values);
    if (own) return own;
    if (text.includes('current_database()')) return { rows: [{ database: 'postgres', db_user: 'postgres', has_tracking: true }] };
    if (text.includes('FROM logic_variables')) {
      return { rows: Object.entries(logicVars).map(([variable_key, variable_value]) => ({ variable_key, variable_value, variable_value_json: null })) };
    }
    if (text.includes('FROM public.schema_migrations')) return { rows: [{ n: 999 }] };
    if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] };
    if (text.startsWith('INSERT INTO pipeline_runs')) return { rows: [{ id: 4242 }] };
    if (/SELECT NOW\(\)/i.test(text)) return { rows: [{ now: new Date('2026-09-28T00:00:00Z') }] };
    // guards.requires probes (extension / function / index / column presence) all answer "present".
    if (/^SELECT 1 FROM (pg_|information_schema)/.test(text.trim())) return { rows: [{ '?column?': 1 }] };
    return fallback();
  };
  const query = async (q: string | { text: string }, values?: unknown[]) => {
    const text = typeof q === 'string' ? q : q.text;
    if (sql.length > 2000) throw new Error('runaway statement loop');
    sql.push(text);
    return answer(text, values ?? []);
  };
  return guard.wrap({ sql, query, connect: async () => ({ query, release: () => {} }) });
}

function silenceLogs() {
  const spies = [vi.spyOn(console, 'log').mockImplementation(() => {}), vi.spyOn(console, 'error').mockImplementation(() => {}), vi.spyOn(console, 'warn').mockImplementation(() => {})];
  return () => spies.forEach((s) => s.mockRestore());
}

describe('P1-C4b — link_neighbourhoods lifecycle on a guarded recording pool (no DB)', () => {
  it('runs the REAL LINK_COLUMN over a 150-polygon corpus, stamps one permit through the single set-based join UPDATE and must issue its pre-write read, its write and its post-write round trip', async () => {
    const stepAnswer = (text: string): Answer | null => {
      // FLEET-2 A-1: the runner's input guards (#12 inputs.expect_nonempty / #32 guards.empty_source) COUNT each
      // declared table before compute and halt on 0 — this fixture models a POPULATED corpus.
      if (/^SELECT COUNT\(\*\)::bigint AS n FROM \w+$/.test(text.trim())) return { rows: [{ n: '1' }] };
      // neighbourhoods_loaded_before_write (pre-write gate): a non-empty boundary table, above the seeded floor.
      if (text.includes('count(*)::int AS n FROM neighbourhoods')) return { rows: [{ n: 150 }] };
      if (/UPDATE permits/i.test(text)) return { rows: [{ permit_num: '24 100001 BLD', revision_num: '00' }], rowCount: 1 };
      return null;
    };
    const pool = recordingPool(stepAnswer, zeroRow);
    const restore = silenceLogs();
    try {
      const out = await pipeline.step(DESCRIPTOR, compute).run({ pool, chainId: 'sources' });
      expect(out.status).toBe('failed');
      expect(pool.sql.some((s) => s.includes('UPDATE permits')), 'UPDATE permits must be issued').toBe(true);
      expect(pool.sql.some((s) => s.includes('FROM neighbourhoods')), 'FROM neighbourhoods must be issued').toBe(true);
      expect(pool.sql.some((s) => s.includes('neighbourhood_id')), 'neighbourhood_id must be issued').toBe(true);
    } finally {
      restore();
    }
    expect(Object.keys(guard.record().writes)).toEqual(expect.arrayContaining(['permits']));
  });
});
