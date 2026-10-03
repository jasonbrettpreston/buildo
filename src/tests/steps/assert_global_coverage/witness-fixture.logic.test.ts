// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (Phase 1 WITNESS, P1-C4b fixture guard)
// Plan: .cursor/wf2_registry_truth_active_task.md "## Fold 7" ruling 2 (P1-C4b: guarded fixture tests for the no-DB suites)
//
// P1-C4b guarded fixture test for `assert_global_coverage`.
//
// WHAT LIFECYCLE PATH IS DRIVEN: `pipeline.step(DESCRIPTOR, compute).run({ pool, chainId })`
// — the REAL descriptor (`scripts/quality/assert-global-coverage.descriptor.json`), the REAL
// compute (`scripts/lib/compute/assert-global-coverage.js`) and the REAL step library
// (`scripts/lib/step/*`: DB-target guard, hoisted config resolution, advisory lock, audit
// table, ledger), against a RECORDING FAKE pool (no DB, no network, no child process).
//
// WHY ONE `it` PER CHAIN: `sharing.varies_by_chain.checks === "per_chain"`, so
// `selectChecks(descriptor, chainId)` hands the compute a DIFFERENT subset of checks per
// chain — and the compute's `loadBranch()` dispatch table (`coa` / `sources` / `permits`)
// issues a DIFFERENT coverage SQL set per branch. A single `it` would only ever execute one
// branch's reads; three `it`s (permits, coa, sources), each with its own fresh pool/guard
// run, execute every chain-specific read the step can issue.
//
// WHAT THE FAKE ANSWERS: the identity/migration/advisory-lock/ledger prelude plus the
// `logic_variables` registry (seeded from the descriptor itself so the config loader finds
// every declared row — LM-D15). Every OTHER statement resolves to the default "all-zero
// aggregate row" `{ rows: [{}] }`: the compute destructures `rows[0]` of each COUNT/
// aggregate query and then reads its count columns, so a zero row keeps every coverage
// metric at 0% without fabricating a single table/column NAME. The measured consequence is
// that the sources run ends `failed` (0% coverage fails its thresholds) — the reads are
// still issued, which is the point of this fixture.
//
// UNDECLARED READS/WRITES ARE RECORDED (never asserted away): `assert_global_coverage` is
// `converted[]` (Fold 7 ruling 3), so the guard's `undeclaredItems()` findings land in the
// fixture record as report-only violations and are pinned by the committed record. This
// file does NOT assert on `violations`/`errors`.
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { witnessGuard } from '../_witness-guard';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library + this step's real descriptor/compute */
const pipeline = require(join(process.cwd(), 'scripts/lib/pipeline.js'));
const DESCRIPTOR = require(join(process.cwd(), 'scripts/quality/assert-global-coverage.descriptor.json'));
const compute = require(join(process.cwd(), 'scripts/lib/compute/assert-global-coverage.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

// P1-C4b fixture guard (Fold 7): every statement on the wrapped handle is resolved against this step's descriptor.
const guard = witnessGuard('assert_global_coverage', __filename);

// Chain-unique needles, one per coverage SQL set (the loader dispatch table in
// scripts/lib/compute/assert-global-coverage.js). Each string appears in exactly ONE
// branch loader, so a match proves that channel's own read really executed.
const PERMITS_NEEDLE = 'FROM entities';
const COA_NEEDLE = 'AS calibration_coa_rows';
const SOURCES_NEEDLE = 'envelope_constraint_reason AS reason';

/** The 20 declared logic_variables, each seeded to `min` (0) — inside `[min,max]`, so nothing throws. */
function seededVars(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const decl of (DESCRIPTOR.config as { logic_variables: Array<{ name: string; min: number }> }).logic_variables) {
    out[decl.name] = decl.min;
  }
  return out;
}

/**
 * A fixture pool dedicated to this step's own query shapes. The default answer is the
 * "all-zero aggregate row" `{ rows: [{}] }` — never `{ rows: [] }`, because the compute
 * destructures `rows[0]` of every aggregate (`const { rows: [caRaw] } = await pool.query(...)`)
 * and then walks its keys; an undefined row would throw before the next branch loader ran,
 * silently truncating the reads this fixture exists to exercise.
 */
function coveragePool(opts: { logicVars?: Record<string, unknown> } = {}) {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const logicVars = opts.logicVars ?? {};
  const answer = (text: string) => {
    if (text.includes('current_database()')) {
      return { rows: [{ database: 'postgres', db_user: 'postgres', has_tracking: true }] };
    }
    // Both the registry-wide SELECT (config-loader) and the declared-names presence
    // SELECT (config.js's LM-D15 query) read this table; answering the full set makes
    // every declared name "present in the live table".
    if (text.includes('FROM logic_variables')) {
      return {
        rows: Object.entries(logicVars).map(([variable_key, variable_value]) => ({
          variable_key, variable_value, variable_value_json: null,
        })),
      };
    }
    if (text.includes('FROM public.schema_migrations')) return { rows: [{ n: 999 }] };
    if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] };
    if (text.startsWith('INSERT INTO pipeline_runs')) return { rows: [{ id: 4242 }] };
    return { rows: [{}] };
  };
  const record = async (text: string, values?: unknown[]) => {
    if (sql.length > 2000) throw new Error('runaway statement loop');
    sql.push(text);
    params.push(values ?? []);
    return answer(text);
  };
  return guard.wrap({
    sql,
    params,
    query: record,
    connect: async () => ({ query: record, release: () => {} }),
  });
}

function captureEmissions() {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  return { restore: () => spy.mockRestore(), lines };
}

describe('P1-C4b — assert_global_coverage lifecycle against a fake pool (no DB): every chain-specific coverage read is executed', () => {
  it('permits chain: the run resolves and its own permits-branch coverage SQL (FROM entities) is issued; the step writes nothing', async () => {
    const pool = coveragePool({ logicVars: seededVars() });
    const cap = captureEmissions();
    try {
      const out = await pipeline.step(DESCRIPTOR, compute).run({ pool, chainId: 'permits' });
      expect(out.status).toBe('failed');
      expect(pool.sql.some((s) => s.includes(PERMITS_NEEDLE)), `out=${JSON.stringify(out).slice(0, 1500)}; the permits-branch read (${PERMITS_NEEDLE}) must be issued`).toBe(true);
      expect(Object.keys(guard.record().writes)).toEqual([]);
    } finally {
      cap.restore();
    }
  });

  it('coa chain: the run resolves and its own coa-branch coverage SQL (AS calibration_coa_rows) is issued; the step writes nothing', async () => {
    const pool = coveragePool({ logicVars: seededVars() });
    const cap = captureEmissions();
    try {
      const out = await pipeline.step(DESCRIPTOR, compute).run({ pool, chainId: 'coa' });
      expect(out.status).toBe('failed');
      expect(pool.sql.some((s) => s.includes(COA_NEEDLE)), `the coa-branch read (${COA_NEEDLE}) must be issued; SQL was:\n${pool.sql.map((s) => s.slice(0, 200)).join('\n====\n')}`).toBe(true);
      expect(Object.keys(guard.record().writes)).toEqual([]);
    } finally {
      cap.restore();
    }
  });

  it('sources chain: the run resolves and its own sources-branch coverage SQL (envelope_constraint_reason AS reason) is issued; the step writes nothing', async () => {
    const pool = coveragePool({ logicVars: seededVars() });
    const cap = captureEmissions();
    try {
      const out = await pipeline.step(DESCRIPTOR, compute).run({ pool, chainId: 'sources' });
      expect(out.status).toBe('failed');
      expect(pool.sql.some((s) => s.includes(SOURCES_NEEDLE)), `the sources-branch read (${SOURCES_NEEDLE}) must be issued`).toBe(true);
      expect(Object.keys(guard.record().writes)).toEqual([]);
    } finally {
      cap.restore();
    }
  });
});
