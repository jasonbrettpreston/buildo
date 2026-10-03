// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (Phase 1 WITNESS, P1-C4b fixture guard)
// Plan: .cursor/wf2_registry_truth_active_task.md "## Fold 7" ruling 2 (P1-C4b: guarded fixture tests for the no-DB suites)
//
// P1-C4b — `parcels`: drives the REAL lifecycle (`pipeline.step(DESCRIPTOR, compute).run(...)`, real descriptor +
// real compute + real step library) on a RECORDING FAKE pool (no DB, no network) wrapped by the fixture guard,
// so every statement the step issues is resolved against its descriptor and recorded in
// docs/reports/witness/parcels.fixture.json. The fake serves the fixture CSV through a faked `fetch`
// (HEAD for the last-modified probe, GET for the bytes) and answers the codegen's geometry-validation
// `WITH input AS` selection and the guarded `INSERT INTO parcels` upsert; every other statement falls back
// to an empty result. Undeclared reads/writes are RECORDED, never asserted away (converted slug → report-only, Fold 7 ruling 3).
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import fs from 'node:fs';
import { witnessGuard } from '../_witness-guard';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library + this step's real descriptor/compute */
const pipeline = require(join(process.cwd(), 'scripts/lib/pipeline.js'));
const DESCRIPTOR = require(join(process.cwd(), 'scripts/load-parcels.descriptor.json'));
const compute = require(join(process.cwd(), 'scripts/lib/compute/load-parcels.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

// P1-C4b fixture guard (Fold 7): every statement on the wrapped handle is resolved against this step's descriptor.
const guard = witnessGuard('parcels', __filename);

type Answer = { rows: unknown[]; rowCount?: number };

/** Every declared logic variable, seeded at its declared `min` (inside [min,max]; the config loader requires a row for each). */
function seededVars(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const v of (DESCRIPTOR.config as { logic_variables: Array<{ name: string; min?: number }> }).logic_variables) {
    out[v.name] = v.min ?? 0;
  }
  return out;
}

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

const CSV = fs.readFileSync(join(process.cwd(), 'src/tests/steps/parcels/fixtures/parcels-6rows.csv'));
const LAST_MODIFIED = 'Tue, 01 Sep 2026 00:00:00 GMT';
const fetch = async (_url: string, init?: { method?: string }) => (init && init.method === 'HEAD'
  ? new Response(null, { headers: { 'last-modified': LAST_MODIFIED } })
  : new Response(new Uint8Array(CSV), { headers: { 'last-modified': LAST_MODIFIED } }));

const stepAnswer = (text: string, values: unknown[]): Answer | null => {
  // the declared geometry validation (write.js validateGeometries): one 'accepted' row per input key.
  if (/^WITH input AS/.test(text.trim())) {
    return { rows: (values[0] as unknown[]).map((k) => ({ source_key: k, status: 'accepted', geom_wkb: Buffer.from('0101000020E6100000000000000000F03F000000000000F03F', 'hex'), is_valid_original: true })) };
  }
  if (/INSERT INTO parcels\b/.test(text)) {
    const n = (text.match(/\),\s*\(/g) || []).length + 1;
    return { rows: Array.from({ length: n }, () => ({ is_insert: true })), rowCount: n };
  }
  return null;
};

describe('P1-C4b — parcels lifecycle on a guarded recording pool (no DB)', () => {
  it('runs the real INGESTOR lifecycle over the fixture CSV and issues the declared geometry check + guarded upsert', async () => {
    const pool = recordingPool(stepAnswer, () => ({ rows: [], rowCount: 0 }));
    const restore = silenceLogs();
    try {
      const out = await pipeline.step(DESCRIPTOR, compute).run({ pool, chainId: 'sources', fetch });
      expect(out.status).toBe('failed');
      expect(pool.sql.some((s) => s.includes('WITH input AS')), 'WITH input AS must be issued').toBe(true);
      expect(pool.sql.some((s) => s.includes('INSERT INTO parcels')), 'INSERT INTO parcels must be issued').toBe(true);
    } finally {
      restore();
    }
    expect(Object.keys(guard.record().writes)).toEqual(expect.arrayContaining(['parcels']));
  });
});
