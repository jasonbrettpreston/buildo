// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (Phase 1 WITNESS, P1-C4b fixture guard)
// Plan: .cursor/wf2_registry_truth_active_task.md "## Fold 7" ruling 2 (P1-C4b: guarded fixture tests for the no-DB suites)
//
// P1-C4b — `enrich_heritage`: drives the REAL lifecycle (`pipeline.step(DESCRIPTOR, compute).run(...)`, real descriptor +
// real compute + real step library) on a RECORDING FAKE pool (no DB, no network) wrapped by the fixture guard,
// so every statement the step issues is resolved against its descriptor and recorded in
// docs/reports/witness/enrich_heritage.fixture.json. The fake answers the producer's last completed run
// (the versioned `heritage_load` contract block), both source COUNT probes (L14 non-empty) and the §3.10 SRID
// guard, so the run reaches the heritage_join write phase and issues its statements. The zero post-phase counts
// make the designated-count checks fail (`out.status === 'failed'` — expected; the point is the statements).
// Undeclared reads/writes are RECORDED, never asserted away (converted slug → report-only, Fold 7 ruling 3).
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { witnessGuard } from '../_witness-guard';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library + this step's real descriptor/compute */
const pipeline = require(join(process.cwd(), 'scripts/lib/pipeline.js'));
const DESCRIPTOR = require(join(process.cwd(), 'scripts/enrich-heritage.descriptor.json'));
const compute = require(join(process.cwd(), 'scripts/lib/compute/enrich-heritage.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

// P1-C4b fixture guard (Fold 7): every statement on the wrapped handle is resolved against this step's descriptor.
const guard = witnessGuard('enrich_heritage', __filename);

type Answer = { rows: unknown[]; rowCount?: number };

const sub = { feature_count: 10, drift_check_passed: true, source_dataset_version: 'fixture-v1' };
const stepAnswer = (text: string): Answer | null => {
  // readHeritageContract: the producer's last completed run carries the versioned contract block.
  if (text.includes('SELECT records_meta FROM pipeline_runs') && text.includes("status = 'completed'")) {
    return { rows: [{ records_meta: { heritage_load: { spec_version: '1.1', heritage_register: sub, heritage_districts: sub } } }] };
  }
  if (text.includes('COUNT(*)::int AS n FROM heritage_')) return { rows: [{ n: 10 }] };   // L14 non-empty sources
  if (text.includes('Find_SRID')) return { rows: [{ srid: 4326 }] };                      // §3.10 SRID guard
  if (/UPDATE parcels/i.test(text)) return { rows: [{ id: 1 }, { id: 2 }], rowCount: 2 };  // the heritage_join phase write
  return null;
};

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

describe('P1-C4b — enrich_heritage lifecycle on a guarded recording pool (no DB)', () => {
  it('runs the real lifecycle over the contract/source/SRID reads and the heritage_join write', async () => {
    const pool = recordingPool(stepAnswer, zeroRow);
    const restore = silenceLogs();
    try {
      const out = await pipeline.step(DESCRIPTOR, compute).run({ pool, chainId: 'sources' });
      expect(out.status).toBe('failed');
      expect(pool.sql.some((s) => s.includes('UPDATE parcels')), 'UPDATE parcels must be issued').toBe(true);
      expect(pool.sql.some((s) => s.includes('FROM heritage_properties')), 'FROM heritage_properties must be issued').toBe(true);
      expect(pool.sql.some((s) => s.includes('FROM heritage_districts')), 'FROM heritage_districts must be issued').toBe(true);
      expect(pool.sql.some((s) => s.includes('is_heritage_designated')), 'is_heritage_designated must be issued').toBe(true);
    } finally {
      restore();
    }
    expect(Object.keys(guard.record().writes)).toEqual(expect.arrayContaining(['parcels']));
  });
});
