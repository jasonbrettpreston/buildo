// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (Phase 1 WITNESS, P1-C4b fixture guard)
// Plan: .cursor/wf2_registry_truth_active_task.md "## Fold 7" ruling 2 (P1-C4b: guarded fixture tests for the no-DB suites)
//
// P1-C4b — `link_parcels`: drives the REAL lifecycle (`pipeline.step(DESCRIPTOR, compute).run(...)`, real descriptor +
// real compute + real step library) on a RECORDING FAKE pool (no DB, no network) wrapped by the fixture guard,
// so every statement the step issues is resolved against its descriptor and recorded in
// docs/reports/witness/link_parcels.fixture.json.
//
// The fake answers the eligible-count aggregate, ONE batch of the LG-25 keyset SELECT (a closure counter created
// inside the `it` makes the SECOND batch SELECT return zero rows — without that, a non-empty answer on every call
// would loop the batch phase forever), and one tier-1 address-match row per permit so the guarded upsert, the
// per-batch keyed DELETE and the LP-D10 watermark UPDATE are all reached. Everything else (database probe,
// logic_variables, schema_migrations, advisory lock, pipeline_runs INSERT, guards.requires probes) falls through
// to the recordingPool defaults and `zeroRow` (no column names needed).
//
// MEASURED: this step has no prior run in the record, so the mode gate's own signals (no prior code_version /
// staleness row) select the mode — adding `--full` to argv produced the IDENTICAL statement set, so one run
// suffices and this fixture omits `--full` and pins the run to that single measured mode.
// DANGER: a non-empty answer to the batch SELECT on EVERY call loops forever; the batch answer below returns rows
// ONCE (closure counter).
// Undeclared reads/writes are RECORDED, never asserted away (converted slug → report-only, Fold 7 ruling 3).
// The run's before-image JSONL (write.js persistBeforeImageRows writes it into docs/reports/golden/link_parcels/before-image/) is asserted, then removed, so the test leaves no file in the repo.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { join } from 'node:path';
import { witnessGuard } from '../_witness-guard';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library + this step's real descriptor/compute */
const pipeline = require(join(process.cwd(), 'scripts/lib/pipeline.js'));
const DESCRIPTOR = require(join(process.cwd(), 'scripts/link-parcels.descriptor.json'));
const compute = require(join(process.cwd(), 'scripts/lib/compute/link-parcels.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

// P1-C4b fixture guard (Fold 7): every statement on the wrapped handle is resolved against this step's descriptor.
const guard = witnessGuard('link_parcels', __filename);

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

/** The before-image files this run writes (write.js persistBeforeImageRows names them by the faked DB clock). */
const BEFORE_IMAGE_DIR = join(process.cwd(), 'docs/reports/golden/link_parcels/before-image');
const BEFORE_IMAGE_PREFIX = '2026-09-28T00-00-00.000Z-';
function runBeforeImages(): string[] {
  return fs.existsSync(BEFORE_IMAGE_DIR) ? fs.readdirSync(BEFORE_IMAGE_DIR).filter((f) => f.startsWith(BEFORE_IMAGE_PREFIX)) : [];
}

function silenceLogs() {
  const spies = [vi.spyOn(console, 'log').mockImplementation(() => {}), vi.spyOn(console, 'error').mockImplementation(() => {}), vi.spyOn(console, 'warn').mockImplementation(() => {})];
  return () => spies.forEach((s) => s.mockRestore());
}

describe('P1-C4b — link_parcels lifecycle on a guarded recording pool (no DB)', () => {
  it('runs the real LINK lifecycle on sources: one batch resolves tier-1 matches, then the guarded upsert / keyed DELETE / watermark UPDATE are issued', async () => {
    let batches = 0;
    const permitsBatch = [
      { permit_num: '24 100001 BLD', revision_num: '00', street_num: '100', street_name: 'DAVENPORT', street_type: 'RD', latitude: 43.67, longitude: -79.39 },
      { permit_num: '24 100002 BLD', revision_num: '00', street_num: '102', street_name: 'DAVENPORT', street_type: 'RD', latitude: 43.671, longitude: -79.391 },
    ];
    const stepAnswer = (text: string): Answer | null => {
      // FLEET-2 A-1: the runner's input guards (#12 inputs.expect_nonempty / #32 guards.empty_source) COUNT each
      // declared table before compute and halt on 0 — this fixture models a POPULATED corpus.
      if (/^SELECT COUNT\(\*\)::bigint AS n FROM \w+$/.test(text.trim())) return { rows: [{ n: '1' }] };
      const t = text.trim();
      // the keyed-delete / retraction before-image reads (R-M): no prior rows to preserve on this fixture.
      if (/^SELECT permit_num, revision_num, parcel_id, match_type, confidence, linked_at FROM permit_parcels/.test(t)) return { rows: [] };
      if (/SELECT COUNT\(\*\) AS total FROM permits/.test(t)) return { rows: [{ total: permitsBatch.length }] };
      if (/^SELECT p\.permit_num, p\.revision_num, p\.street_num/.test(t)) {
        batches += 1;
        return { rows: batches === 1 ? permitsBatch : [] };   // one batch, then the loop ends
      }
      // the tier-1 address match (buildMatchSql): one parcel per permit, so the guarded upsert is issued.
      if (/^WITH input_permits/.test(t)) {
        return { rows: [
          { permit_num: '24 100001 BLD', revision_num: '00', parcel_id: 11, match_type: 'exact_address', confidence: 0.95 },
          { permit_num: '24 100002 BLD', revision_num: '00', parcel_id: 12, match_type: 'address_points_exact', confidence: 0.95 },
        ] };
      }
      return null;
    };
    const pool = recordingPool(stepAnswer, zeroRow);
    const restore = silenceLogs();
    // start clean so the assertion below measures THIS run's before-image, not a stale one from an earlier run.
    for (const f of runBeforeImages()) fs.rmSync(join(BEFORE_IMAGE_DIR, f));
    try {
      const out = await pipeline.step(DESCRIPTOR, compute).run({ pool, chainId: 'sources' });
      expect(out.status).toBe('failed');
      // writes: the guarded upsert, the per-batch keyed DELETE, the LP-D10 watermark UPDATE.
      // (The watermark needle is newline-agnostic: the SQL text has a line break after
      // `UPDATE permits` in `buildMatchSql`'s own template literal.)
      expect(pool.sql.some((s) => s.includes('INSERT INTO permit_parcels')), 'INSERT INTO permit_parcels must be issued').toBe(true);
      expect(pool.sql.some((s) => s.includes('DELETE FROM permit_parcels')), 'DELETE FROM permit_parcels must be issued').toBe(true);
      expect(pool.sql.some((s) => /UPDATE permits\s+SET parcel_linked_at/.test(s)), 'UPDATE permits SET parcel_linked_at must be issued').toBe(true);
      // reads: the tier-1 address UNION ALL (address_points bridge + parcel_address_points).
      expect(pool.sql.some((s) => s.includes('FROM address_points')), 'FROM address_points must be issued').toBe(true);
      expect(pool.sql.some((s) => s.includes('JOIN parcel_address_points')), 'JOIN parcel_address_points must be issued').toBe(true);
      expect(runBeforeImages().length, 'the declared before-image is persisted before the keyed delete').toBeGreaterThan(0);
    } finally {
      restore();
      for (const f of runBeforeImages()) fs.rmSync(join(BEFORE_IMAGE_DIR, f));
    }
    expect(Object.keys(guard.record().writes)).toEqual(expect.arrayContaining(['permit_parcels', 'permits']));
  });
});
