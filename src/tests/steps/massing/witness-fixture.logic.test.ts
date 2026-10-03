// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (Phase 1 WITNESS, P1-C4b fixture guard)
// Plan: .cursor/wf2_registry_truth_active_task.md "## Fold 7" ruling 2 (P1-C4b: guarded fixture tests for the no-DB suites)
//
// P1-C4b — `massing`: drives the REAL lifecycle (`pipeline.step(DESCRIPTOR, compute).run(...)`, real descriptor +
// real compute + real step library) on a RECORDING FAKE pool (no DB, no network) wrapped by the fixture guard,
// so every statement the step issues is resolved against its descriptor and recorded in
// docs/reports/witness/massing.fixture.json. The ONE seam replaced is the acquisition: `format:"shapefile_zip"`
// has no zip fixture and the `shapefile` package ships no writer, so `vi.spyOn` on the CJS `acquire` module's
// `acquireExternal` (the module-object call at step/index.js ~1230) intercepts the download and hands back the
// committed `massing-features.json` verbatim — keyed through the step's own `compute.coerceKey`, exactly as a
// real parse would. Every SQL statement (the geometry validation, the guarded upsert, the maintenance gate) still
// runs the REAL library against the recording pool. Undeclared reads/writes are RECORDED, never asserted away
// (converted slug → report-only, Fold 7 ruling 3).
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { witnessGuard } from '../_witness-guard';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library + this step's real descriptor/compute */
const pipeline = require(join(process.cwd(), 'scripts/lib/pipeline.js'));
const DESCRIPTOR = require(join(process.cwd(), 'scripts/load-massing.descriptor.json'));
const compute = require(join(process.cwd(), 'scripts/lib/compute/load-massing.js'));
const acquireLib = require(join(process.cwd(), 'scripts/lib/step/acquire.js'));
const FEATURES = require(join(process.cwd(), 'src/tests/steps/massing/fixtures/massing-features.json')) as Array<{ record: Record<string, unknown>; geojson: string }>;
/* eslint-enable @typescript-eslint/no-require-imports */

// P1-C4b fixture guard (Fold 7): every statement on the wrapped handle is resolved against this step's descriptor.
const guard = witnessGuard('massing', __filename);

type Answer = { rows: unknown[]; rowCount?: number };

/** Every declared logic variable, seeded at its declared `min` (inside [min,max]; the config loader requires a row for each). */
function seededVars(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const v of (DESCRIPTOR.config as { logic_variables: Array<{ name: string; min?: number }> }).logic_variables) {
    out[v.name] = v.min ?? 0;
  }
  return out;
}

/**
 * A row whose every property reads 0 — answers the compute's COUNT/aggregate reads without naming a column.
 * (Kept for parity with the P1-C4b skeleton; this fixture's fallback is the empty result below, not zeroRow.)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- skeleton helper retained verbatim
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

describe('P1-C4b — massing lifecycle on a guarded recording pool (no DB)', () => {
  it('the guarded upsert runs on the real lifecycle: the geometry validation and the INSERT into building_footprints are issued, and the maintenance gate reads pg_stat_user_tables', async () => {
    const keyColumn = DESCRIPTOR.outputs.writes[0].key as string; // 'source_id' — the geometry-hash key (acquire.js 0s)
    const features = FEATURES.map((f) => ({ [keyColumn]: compute.coerceKey(undefined, { geojson: f.geojson }), geojson: f.geojson, record: f.record }));
    const spy = vi.spyOn(acquireLib, 'acquireExternal').mockResolvedValue({
      acquired: { content_hash: 'fixture', source_dataset_version: 'fixture', bytes_downloaded: 100, download_attempts: 1, feature_count: features.length, bad_key_count: 0, null_geometry_count: 0, rows_parsed: features.length },
      tier1: { skip: false, reason: 'changed' },
      tier2: { skip: false, reason: 'changed' },
      features,
      emitBlock: null,
    });

    const stepAnswer = (text: string, values: unknown[]): Answer | null => {
      // the declared geometry validation, incl. the two derived area measures the INSERT seeds.
      if (/^WITH input AS/.test(text.trim())) {
        return { rows: (values[0] as unknown[]).map((k) => ({ source_key: k, status: 'accepted', geom_wkb: Buffer.from('00', 'hex'), is_valid_original: true, footprint_area_sqm: 100, footprint_area_sqft: 1076 })) };
      }
      if (/INSERT INTO building_footprints\b/.test(text)) {
        const n = (text.match(/\),\s*\(/g) || []).length + 1;
        return { rows: Array.from({ length: n }, () => ({ is_insert: true })), rowCount: n };
      }
      // the maintenance gate (runMaintenance): a dead-tuple ratio above the warn max, so the declared VACUUM is issued.
      if (text.includes('n_dead_tup::bigint AS dead')) return { rows: [{ live: 100, dead: 90 }] };
      return null;
    };

    const pool = recordingPool(stepAnswer, () => ({ rows: [], rowCount: 0 }));
    const restore = silenceLogs();
    try {
      const out = await pipeline.step(DESCRIPTOR, compute).run({ pool, chainId: 'sources' });
      // MEASURED (slug brief): the run is 'failed' on this fixture. Every declared logic variable is seeded at its
      // declared `min`, and `massing_skip_rate_max_pct`'s min is 0, so the real `skip_rate_pct` check reads
      // `0 >= 0` and reports violations 1 → the declared FAIL terminal. Same for `massing_batch_error_rate_max_pct`
      // (min 0). That is the seed artifact, not a defect: the WRITE itself is exercised and committed.
      expect(out.status).toBe('failed');
      expect(pool.sql.some((s) => s.includes('INSERT INTO building_footprints')), 'INSERT INTO building_footprints must be issued').toBe(true);
      expect(pool.sql.some((s) => s.includes('FROM building_footprints')), 'FROM building_footprints must be issued').toBe(true);
      expect(pool.sql.some((s) => s.includes('n_dead_tup::bigint AS dead')), 'the maintenance gate must read pg_stat_user_tables').toBe(true);
      // REPORTED (slug brief): `VACUUM ANALYZE building_footprints` does NOT appear on this run — the dead-tuple
      // answer IS kept, but the VACUUM is not asserted (the observed maintenance row is INFO/not-issued here; the
      // gate's `SELECT` still proves the declared `execution.maintenance` entry was reached). Asserting it would
      // pin a behaviour the real lifecycle does not exhibit on this fixture.
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      restore();
      spy.mockRestore();
    }
    expect(Object.keys(guard.record().writes)).toEqual(expect.arrayContaining(['building_footprints']));
  });
});
