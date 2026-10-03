// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (Phase 1 WITNESS, P1-C4b fixture guard)
// Plan: .cursor/wf2_registry_truth_active_task.md "## Fold 7" ruling 2 (P1-C4b: guarded fixture tests for the no-DB suites)
//
// P1-C4b — `assert_engine_health`: drives the REAL lifecycle (`pipeline.step(DESCRIPTOR, compute).run(...)`, real descriptor +
// real compute + real step library) on a RECORDING FAKE pool (no DB, no network) wrapped by the fixture guard,
// so every statement the step issues is resolved against its descriptor and recorded in
// docs/reports/witness/assert_engine_health.fixture.json. The fake answers the runtime table-discovery read
// (`SELECT relname FROM pg_stat_user_tables`) plus the one-pass stats read with two monitored tables
// (coa_applications, permit_inspections) carrying a 2% dead-tuple ratio — above the seeded warn max (0) — so the
// compute issues one per-table engine_health_snapshots upsert AND a VACUUM ANALYZE per table.
// MEASURED: chains coa / sources / deep_scrapes issue the identical statement set (the seeded-with-zeroRow run is
// chain-agnostic), so permits alone pins the whole statement set.
// Undeclared reads/writes are RECORDED, never asserted away (converted slug → report-only, Fold 7 ruling 3).
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { witnessGuard } from '../_witness-guard';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library + this step's real descriptor/compute */
const pipeline = require(join(process.cwd(), 'scripts/lib/pipeline.js'));
const DESCRIPTOR = require(join(process.cwd(), 'scripts/quality/assert-engine-health.descriptor.json'));
const compute = require(join(process.cwd(), 'scripts/lib/compute/assert-engine-health.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

// P1-C4b fixture guard (Fold 7): every statement on the wrapped handle is resolved against this step's descriptor.
const guard = witnessGuard('assert_engine_health', __filename);

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

describe('P1-C4b — assert_engine_health lifecycle on a guarded recording pool (no DB)', () => {
  it('records the snapshot upserts and the dead-tuple VACUUMs for the discovered tables', async () => {
    const MONITORED = ['coa_applications', 'permit_inspections'];
    const stepAnswer = (text: string): Answer | null => {
      if (text.includes('SELECT relname FROM pg_stat_user_tables')) return { rows: MONITORED.map((relname) => ({ relname })) };
      // the one-pass stats read: 2% dead > the seeded warn max (0) => the compute issues VACUUM ANALYZE per table.
      if (text.includes('relname AS table_name')) {
        return { rows: MONITORED.map((table_name) => ({ table_name, n_live_tup: 1000, n_dead_tup: 20, seq_scan: 5, idx_scan: 50, n_tup_ins: 100, n_tup_upd: 10 })) };
      }
      if (text.includes('n_tup_ins::bigint AS ins')) return { rows: [{ ins: 100, upd: 10, last_autovacuum: null }] };
      return null;
    };
    const pool = recordingPool(stepAnswer, zeroRow);
    const restore = silenceLogs();
    try {
      const out = await pipeline.step(DESCRIPTOR, compute).run({ pool, chainId: 'permits' });
      expect(out.status).toBe('completed_with_warnings');
      // The stepAnswer's two monitored stats rows (2% dead > the seeded warn max of 0) drive the whole run:
      // one guarded upsert AND one VACUUM ANALYZE per discovered table. The one-pass stats read carries the
      // n_tup_ins::bigint attribute (first line: `SELECT relname AS table_name,`; the ins/upd triple is read
      // from `n_tup_ins::bigint AS n_tup_ins` in this same statement). MEASURED: fetchInsUpdVac's separate
      // `n_tup_ins::bigint AS ins` per-table follow-up is NOT issued here — the zeroRow fallback answers the
      // check-selected follow-up path only when a stats row contains that table_name, which this run's
      // stepAnswer never reaches for the ins/upd triple.
      expect(pool.sql.some((s) => s.includes('INSERT INTO engine_health_snapshots')), 'INSERT INTO engine_health_snapshots must be issued').toBe(true);
      expect(pool.sql.filter((s) => s.includes('INSERT INTO engine_health_snapshots')).length, 'one upsert per discovered table').toBe(MONITORED.length);
      expect(pool.sql.some((s) => s.includes('n_tup_ins::bigint AS n_tup_ins')), 'the one-pass stats read must carry n_tup_ins::bigint').toBe(true);
      expect(pool.sql.filter((s) => s.includes('VACUUM ANALYZE')).length, 'one VACUUM ANALYZE per monitored table').toBe(MONITORED.length);
    } finally {
      restore();
    }
    expect(Object.keys(guard.record().writes)).toEqual(expect.arrayContaining(['engine_health_snapshots']));
  });
});
