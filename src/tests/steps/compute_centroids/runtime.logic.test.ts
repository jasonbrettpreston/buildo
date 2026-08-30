// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (runBackfillPhase, ruling A-4)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 7 (archetype gates categories — BACKFILL:
//            recovery.reset != "none"), Rule 12 (truthful crash posture)
//
// Peel 8a (gating/staleness) — pilot 6 (`compute_centroids`). Everything this peel asserts was
// already DECLARED in the descriptor at commit 7 (staleness.fingerprint_inputs, the `backlog_count`
// `when:"pre"` check, `recovery.interrupted`/`before_image` both `"none"`+why). What did NOT yet
// exist before this peel is a RUNTIME proof, against a fake pool (no DB, no child process), that
// `runBackfillPhase` (via `pipeline.step(...).run(...)`) actually behaves the way the descriptor
// claims — no prior test anywhere in the suite drives `runBackfillPhase`/`executeBackfillUpdate`
// directly; the only existing exercise of the write path is the DB-integration fixture
// (`migration-245-centroid-invalidation.db.test.ts` case 4). This file is the fixture-level
// counterpart, mirroring the `run(ctx) — the lifecycle, against a fake pool` convention in
// `src/tests/step-library.logic.test.ts`.
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library + this step's real descriptor/compute */
const pipeline = require(join(process.cwd(), 'scripts/lib/pipeline.js'));
const writeLib = require(join(process.cwd(), 'scripts/lib/step/write.js'));
const DESCRIPTOR = require(join(process.cwd(), 'scripts/compute-centroids.descriptor.json'));
const compute = require(join(process.cwd(), 'scripts/lib/compute/compute-centroids.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

const BACKLOG_SQL_NEEDLE = 'FROM parcels';
const UPDATE_SQL_NEEDLE = 'UPDATE parcels SET';
const FAILED_SQL_NEEDLE = 'geometry IS NOT NULL AND geom IS NULL';
const EXTENSION_SQL_NEEDLE = 'FROM pg_extension';

type PoolOpts = {
  postgisPresent?: boolean;
  migrations?: number;
  backlogCount?: number;
  updateReturnsIds?: number[];
  failedGeometries?: number;
  logicVars?: Record<string, unknown>;
  /** R-T addendum (commit 4) — the descriptor's own invariants[]/plausibility[] queries. */
  centroidQualityViolations?: number;
};

/**
 * A fixture pool dedicated to this BACKFILL's own query shapes, built independently of
 * `step-library.logic.test.ts`'s shared `fakePool` (that helper has no case for
 * `SELECT NOW()`/`pg_extension`, neither of which any prior converted archetype's own
 * fixture tests needed to answer — a BACKFILL is the first shape whose phase runner reads
 * the DB clock (`clockNow`) and a `guards.requires: extension` precondition in the same
 * run, so this file owns its own answer table rather than silently depending on defaults
 * that happen to return `{rows: []}`).
 */
function backfillPool(opts: PoolOpts = {}) {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const answer = (text: string) => {
    if (text.includes('current_database()')) {
      return { rows: [{ database: 'postgres', db_user: 'postgres', has_tracking: true }] };
    }
    if (text.includes('FROM logic_variables')) {
      return {
        rows: Object.entries(opts.logicVars ?? {}).map(([variable_key, variable_value]) => ({
          variable_key, variable_value, variable_value_json: null,
        })),
      };
    }
    if (text.includes('FROM public.schema_migrations')) return { rows: [{ n: opts.migrations ?? 999 }] };
    if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] };
    if (text.startsWith('INSERT INTO pipeline_runs')) return { rows: [{ id: 4242 }] };
    if (text.includes(EXTENSION_SQL_NEEDLE)) return { rows: opts.postgisPresent === false ? [] : [{ '?column?': 1 }] };
    if (text.trim().startsWith('SELECT NOW()')) return { rows: [{ now: new Date('2026-08-29T00:00:00Z') }] };
    if (text.includes(UPDATE_SQL_NEEDLE)) {
      return { rows: (opts.updateReturnsIds ?? []).map((id) => ({ id })) };
    }
    if (text.includes(FAILED_SQL_NEEDLE)) return { rows: [{ failed_geometries: opts.failedGeometries ?? 0 }] };
    // The REAL backlog query (buildPreSql, scripts/lib/compute/compute-centroids.js) ALSO
    // references centroid_lat (`WHERE geometry IS NOT NULL AND centroid_lat IS NULL`) — its
    // own column alias `AS backlog_count` is the more specific, disambiguating match, so it
    // MUST be checked before the R-T addendum catch-all just below (which would otherwise
    // intercept it and silently zero out matched.backlog_count — measured live: it did,
    // turning a REAL-WORK fixture into a false ZERO-WORK one before this fix).
    if (text.includes('AS backlog_count')) return { rows: [{ backlog_count: opts.backlogCount ?? 0 }] };
    // R-T addendum (commit 4) — the descriptor's own invariants[]/plausibility[] queries
    // (scripts/lib/step/plausibility.js's executor, hooked at index.js:1834) all reference
    // centroid_lat in their WHERE clause too; checked BEFORE the generic BACKLOG_SQL_NEEDLE
    // below (which would otherwise intercept them with the UNRELATED backlog_count value —
    // measured live: it did, turning every REAL-WORK fixture's clean run into a spurious
    // WARN before this fix). Clean (0) by default — a test opting into a non-zero centroid
    // quality signal declares it explicitly via opts.centroidQualityViolations.
    if (text.includes('centroid_lat')) return { rows: [{ count: opts.centroidQualityViolations ?? 0 }] };
    if (text.includes(BACKLOG_SQL_NEEDLE)) return { rows: [{ backlog_count: opts.backlogCount ?? 0 }] };
    return { rows: [] };
  };
  const record = async (text: string, values?: unknown[]) => {
    sql.push(text);
    params.push(values ?? []);
    return answer(text);
  };
  return {
    sql,
    params,
    query: record,
    connect: async () => ({ query: record, release: () => {} }),
  };
}

function captureEmissions() {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  return {
    restore: () => spy.mockRestore(),
    summary: () => JSON.parse(lines.filter((l) => l.startsWith('PIPELINE_SUMMARY:')).pop()!.slice('PIPELINE_SUMMARY:'.length)),
    lines,
  };
}

const seededVars = () => ({
  [compute.FAILED_GEOMETRIES_VAR]: '0',
  [compute.COMPUTE_RATE_VAR]: '98',
});

describe('peel 8a — runBackfillPhase against a fake pool (no DB): the descriptor\'s gating/staleness claims, proven at runtime', () => {
  it('ZERO-WORK completion: backlog_count === 0 reports matched.backlog_count === 0, the UPDATE is NEVER issued, and the terminal is the discriminated zero_work id (R-P N/A — not a skip_gated terminal)', async () => {
    const pool = backfillPool({ postgisPresent: true, backlogCount: 0, logicVars: seededVars() });
    const cap = captureEmissions();
    try {
      const out = await pipeline.step(DESCRIPTOR, compute).run({ pool, chainId: 'sources' });
      expect(out.status).toBe('completed');
      const summary = cap.summary();
      expect(summary.records_meta.terminal).toBe('zero_work');
      expect(summary.records_meta.audit_table.verdict).toBe('PASS');
      const backlogRow = summary.records_meta.audit_table.rows.find((r: { metric: string }) => r.metric === 'backlog_count');
      expect(backlogRow, 'backlog_count must be scored on the zero-work path (R-P\'s spirit, when:"pre")').toBeDefined();
      expect(backlogRow.value).toBe(0);
      expect(pool.sql.some((s) => s.includes(UPDATE_SQL_NEEDLE)), 'the UPDATE must never be issued when backlog_count === 0').toBe(false);
      expect(pool.sql.some((s) => s.includes(FAILED_SQL_NEEDLE)), 'the post-run failed_geometries query must never be issued on the zero-work path (checks narrowed to when:"pre")').toBe(false);
    } finally {
      cap.restore();
    }
  });

  it('REAL-WORK completion: backlog_count > 0 ALSO reports matched.backlog_count (the pre-count is present on BOTH branches, not only the zero-work one), issues the UPDATE exactly once, and scores the post checks — 0 failed geometries keeps T1/T2 clean so this fixture isolates the gating claim from peel 8b\'s own sabotage battery', async () => {
    const pool = backfillPool({
      postgisPresent: true, backlogCount: 5, updateReturnsIds: [1, 2, 3, 4, 5], failedGeometries: 0, logicVars: seededVars(),
    });
    const cap = captureEmissions();
    try {
      const out = await pipeline.step(DESCRIPTOR, compute).run({ pool, chainId: 'sources' });
      expect(out.status).toBe('completed');
      const summary = cap.summary();
      expect(summary.records_meta.terminal).not.toBe('zero_work');
      expect(summary.records_meta.audit_table.verdict).toBe('PASS');
      const rows = summary.records_meta.audit_table.rows as Array<{ metric: string; value: unknown }>;
      expect(rows.find((r) => r.metric === 'backlog_count')?.value).toBe(5);
      expect(rows.find((r) => r.metric === 'centroids_computed')?.value).toBe(5);
      expect(rows.find((r) => r.metric === 'failed_geometries')?.value).toBe(0);
      expect(rows.find((r) => r.metric === 'parcels_processed')?.value).toBe(5);
      const updateHits = pool.sql.filter((s) => s.includes(UPDATE_SQL_NEEDLE));
      expect(updateHits.length, 'the UPDATE must be issued exactly once').toBe(1);
      expect(summary.records_new).toBe(0);
      expect(summary.records_updated).toBe(5);
      expect(summary.records_total).toBe(5);
    } finally {
      cap.restore();
    }
  });

  it('guards.requires postgis / on_missing:"fail" HALTS before the first read — the backlog query is never issued when the extension is absent (A-1(a), the link_massing A-8 precedent)', async () => {
    const pool = backfillPool({ postgisPresent: false, backlogCount: 5, logicVars: seededVars() });
    const cap = captureEmissions();
    try {
      await expect(pipeline.step(DESCRIPTOR, compute).run({ pool, chainId: 'sources' })).rejects.toThrow(/postgis/i);
      expect(pool.sql.some((s) => s.includes(BACKLOG_SQL_NEEDLE)), 'the backlog_count query must never run once the precondition has failed').toBe(false);
      expect(pool.sql.some((s) => s.includes(UPDATE_SQL_NEEDLE))).toBe(false);
    } finally {
      cap.restore();
    }
  });

  it('recovery.interrupted / before_image are truthfully "none" — write.buildWritePlan for this write target carries no clear_sql (class E has no destructive retraction to leave half-done, R-B carried forward per the report\'s R-F item 1)', () => {
    const spec = DESCRIPTOR.outputs.writes[0];
    const plan = writeLib.buildWritePlan(spec, DESCRIPTOR);
    expect(plan.clear_sql, 'a write_once_backfill target has no clear_sql — there is nothing an interrupted run leaves half-retracted').toBeNull();
    expect(spec.retract).toBe('none');
    expect(DESCRIPTOR.recovery.interrupted).toBe('none');
    expect(DESCRIPTOR.recovery.before_image).toBe('none');
  });

  it('staleness.fingerprint_inputs names exactly the 3 declared inputs (the compute file + the two corpus signals) — no 4th input silently added or one silently dropped', () => {
    expect(DESCRIPTOR.staleness.fingerprint_inputs).toEqual([
      'scripts/lib/compute/compute-centroids.js',
      'parcels:count',
      'parcels:centroid_lat_null_count',
    ]);
    expect(DESCRIPTOR.staleness.mode_select, 'a BACKFILL has no FULL/incremental distinction to select (§seam-map: 0 argv/env reads)').toBe('none');
  });
});
