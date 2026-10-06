// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7.2 A5
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 10 — verdict row-derived)
//
// scripts/analysis/cloud-pre-dispatch.mjs — fixture-level (no DB) coverage. Every check
// is driven in BOTH directions through a duck-typed pool that dispatches on a substring
// of the SQL text (the chain-end-synthesis.logic.test.ts pattern), so a PASS and a FAIL
// are both reachable from the same code path — the Spec 121 §12b.6 "green because it
// never looked" class this checklist itself exists to close.
//
// The verdict is asserted ONLY through buildReport (which calls deriveVerdict) — never
// by re-implementing the cascade here. If this file computed its own lattice, the test
// would pass while the script disagreed.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cloudPre = require('../../scripts/analysis/cloud-pre-dispatch.mjs') as unknown as {
  buildReport: (
    pool: unknown,
    opts?: Record<string, unknown>,
  ) => Promise<{ database: string | null; generated_at: string; rows: Array<{ id: string; severity: string; value: unknown; limit: string; why: string }>; verdict: string }>;
  checkStrandedRunningRows: (pool: unknown) => Promise<{ id: string; severity: string; value: unknown; limit: string; why: string }>;
  checkMigrationsMissing: (pool: unknown, deps?: Record<string, unknown>) => Promise<{ id: string; severity: string; value: unknown; limit: string; why: string }>;
  checkDeclaredGuardsPresent: (pool: unknown, descriptorsByName: Record<string, { descriptor: Record<string, unknown> }>) => Promise<{ id: string; severity: string; value: unknown; limit: string; why: string }>;
  checkTableFloors: (pool: unknown, descriptorsByName: Record<string, { descriptor: Record<string, unknown> }>) => Promise<{ id: string; severity: string; value: unknown; limit: string; why: string }>;
  checkSeedRowsPresent: (pool: unknown, descriptorsByName: Record<string, { descriptor: Record<string, unknown> }>) => Promise<{ id: string; severity: string; value: unknown; limit: string; why: string }>;
  checkSharingChainRunning: (pool: unknown, chainId?: string) => Promise<{ id: string; severity: string; value: unknown; limit: string; why: string }>;
  checkCiGreenForSha: (opts: { sha: string; listCiRuns: (sha: string) => Promise<Array<{ workflowName: string; status: string; conclusion: string }>> }) => Promise<{ id: string; severity: string; value: unknown; limit: string; why: string }>;
  CHECK_IDS: string[];
  REQUIRED_CI_WORKFLOWS: string[];
  renderMarkdown: (report: unknown) => string;
  renderConsoleTable: (rows: Array<Record<string, unknown>>) => string;
  parseArgs: (argv: string[]) => { out: string | null; dry: boolean; help: boolean; only: string[] | null; sha: string | null };
  usage: () => string;
  reportStamp: (date?: Date) => string;
  convertedWriteTables: (descriptorsByName: Record<string, { descriptor: Record<string, unknown> }>) => string[];
  declaredLogicVariables: (descriptorsByName: Record<string, { descriptor: Record<string, unknown> }>) => string[];
};

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts/analysis/cloud-pre-dispatch.mjs');

/**
 * A duck-typed pool. `answers` maps a SUBSTRING of the query text to the rows the
 * query returns — the same mechanism chain-end-synthesis.logic.test.ts uses for its
 * own fake pool, extended to return multi-row/multi-column result sets.
 *
 * First matching key wins, so a test declares the query it means and every other query
 * returns `{ rows: [] }` (the healthy empty case for most of these checks).
 */
function fakePool(answers: Array<[string, Array<Record<string, unknown>>]>) {
  const calls: Array<{ text: string; values: unknown[] | undefined }> = [];
  return {
    calls,
    async query(text: string, values?: unknown[]) {
      calls.push({ text, values });
      for (const [needle, rows] of answers) {
        if (text.includes(needle)) return { rows };
      }
      return { rows: [] };
    },
  };
}

/** The empty pool — every query returns zero rows (the healthy state for all six checks). */
const emptyPool = () => fakePool([]);

function fakeDescriptors(spec: Record<string, Record<string, unknown>>) {
  const out: Record<string, { descriptor: Record<string, unknown> }> = {};
  for (const [slug, descriptor] of Object.entries(spec)) out[slug] = { descriptor };
  return out;
}

/**
 * A stubbed `listCiRuns` returning the newest-first success runs for BOTH required
 * workflows — every EXISTING `buildReport` call passes this so no test ever spawns
 * `gh`. The real default (`spawnSync('gh', ['run','list',...])`) is exercised by
 * nothing here on purpose: CI is not reachable from a unit test.
 */
const greenCi = async () => [
  { workflowName: 'DB Integration Tests', status: 'completed', conclusion: 'success' },
  { workflowName: 'Test Suite', status: 'completed', conclusion: 'success' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. stranded_running_rows
// ─────────────────────────────────────────────────────────────────────────────

describe('checkStrandedRunningRows — both directions (runbook §3b query)', () => {
  it('RED: any stranded running row is a FAIL, and the value names the ids', async () => {
    const pool = fakePool([
      ['FROM pipeline_runs', [
        { id: 41, pipeline: 'sources:load_parcels', started_at: '2026-09-20T01:00:00Z' },
        { id: 42, pipeline: 'chain_sources', started_at: '2026-09-20T02:00:00Z' },
      ]],
    ]);
    const r = await cloudPre.checkStrandedRunningRows(pool);
    expect(r.id).toBe('stranded_running_rows');
    expect(r.severity).toBe('FAIL');
    expect(r.value).toEqual([
      { id: 41, pipeline: 'sources:load_parcels', started_at: '2026-09-20T01:00:00Z' },
      { id: 42, pipeline: 'chain_sources', started_at: '2026-09-20T02:00:00Z' },
    ]);
  });

  it('GREEN: zero stranded rows is INFO, never a verdict driver', async () => {
    const r = await cloudPre.checkStrandedRunningRows(emptyPool());
    expect(r.severity).toBe('INFO');
    expect(r.value).toEqual([]);
  });

  it('the query is runbook §3b verbatim — status = running, ORDER BY id', async () => {
    const pool = emptyPool();
    await cloudPre.checkStrandedRunningRows(pool);
    const sql = pool.calls[0]?.text ?? '';
    expect(sql).toMatch(/FROM pipeline_runs/);
    expect(sql).toMatch(/status = 'running'/);
    expect(sql).toMatch(/ORDER BY id/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. migrations_missing
// ─────────────────────────────────────────────────────────────────────────────

describe('checkMigrationsMissing — both directions (filename-keyed, never version-keyed)', () => {
  const listMigrations = () => ['001_permits.sql', '222_notification_gateflip.sql', '245_parcels_centroid_geom_invalidation.sql'];

  it('RED: a migration filename absent from schema_migrations is a FAIL naming it', async () => {
    const pool = fakePool([
      ['FROM schema_migrations', [{ filename: '001_permits.sql' }, { filename: '222_notification_gateflip.sql' }]],
    ]);
    const r = await cloudPre.checkMigrationsMissing(pool, { listMigrations });
    expect(r.severity).toBe('FAIL');
    expect(r.value).toEqual(['245_parcels_centroid_geom_invalidation.sql']);
  });

  it('GREEN: every filename present is INFO', async () => {
    const pool = fakePool([
      ['FROM schema_migrations', listMigrations().map((filename) => ({ filename }))],
    ]);
    const r = await cloudPre.checkMigrationsMissing(pool, { listMigrations });
    expect(r.severity).toBe('INFO');
    expect(r.value).toEqual([]);
  });

  it('round-trips through buildReport with the real migrations/ dir — the fake only supplies schema_migrations', async () => {
    // The real repo has ~250 migrations and this fake DB has applied exactly one of
    // them, so a FAIL is the only correct answer; the point is that the REAL file
    // listing is what drives it (the check is not fed a hand-written list).
    const pool = fakePool([['FROM schema_migrations', [{ filename: '001_permits.sql' }]]]);
    const report = await cloudPre.buildReport(pool, { descriptorsByName: fakeDescriptors({}), listCiRuns: greenCi });
    const r = report.rows.find((x) => x.id === 'migrations_missing');
    expect(r?.severity).toBe('FAIL');
    expect((r?.value as string[]).length).toBeGreaterThan(100);
    expect(r?.value).toContain('245_parcels_centroid_geom_invalidation.sql');
  });

  it('keys by filename — a version that exists in the gaps (043) is not "missing" because it does not exist at all', async () => {
    const pool = fakePool([['FROM schema_migrations', []]]);
    const r = await cloudPre.checkMigrationsMissing(pool, {
      listMigrations: () => ['043_does_not_exist.sql'],
    });
    // 043 is not in the (fake) listing either — an EMPTY applied set makes it missing.
    expect(r.value).toEqual(['043_does_not_exist.sql']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. declared_guards_present
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDeclaredGuardsPresent — both directions (the runner\'s own probe)', () => {
  const descriptorsByName = () => fakeDescriptors({
    load_ravines: {
      guards: { requires: [
        { kind: 'extension', name: 'postgis', on_missing: 'fail' },
        { kind: 'index', name: 'idx_ravines_geom_gist', on_missing: 'fail' },
      ] },
    },
    enrich_heritage: {
      guards: { requires: [
        { kind: 'column', name: 'parcels.heritage_verified_flag', on_missing: 'warn' },
        { kind: 'function', name: 'normalize_address', on_missing: 'fail' },
        { kind: 'rls_bypass_or_policy', name: 'parcel_buildings', on_missing: 'fail' },
      ] },
    },
  });

  /** Answers every catalog probe as present. */
  const allPresent = () => fakePool([
    ['FROM pg_extension', [{ '?column?': 1 }]],
    ['FROM pg_indexes', [{ '?column?': 1 }]],
    ['FROM pg_proc', [{ '?column?': 1 }]],
    ['FROM information_schema.columns', [{ '?column?': 1 }]],
  ]);

  it('GREEN: every declared requirement present is INFO, and the value lists nothing', async () => {
    const r = await cloudPre.checkDeclaredGuardsPresent(allPresent(), descriptorsByName());
    expect(r.severity).toBe('INFO');
    expect(r.value).toEqual([]);
  });

  it('RED: a missing requirement with on_missing:"fail" is a FAIL naming slug:name', async () => {
    // pg_extension answers empty → postgis absent → load_ravines refuses.
    const pool = fakePool([
      ['FROM pg_indexes', [{ '?column?': 1 }]],
      ['FROM pg_proc', [{ '?column?': 1 }]],
      ['FROM information_schema.columns', [{ '?column?': 1 }]],
    ]);
    const r = await cloudPre.checkDeclaredGuardsPresent(pool, descriptorsByName());
    expect(r.severity).toBe('FAIL');
    expect(r.value).toEqual(['load_ravines:postgis']);
  });

  it('WARN: a missing requirement with on_missing NOT "fail" reddens without blocking', async () => {
    const pool = fakePool([
      ['FROM pg_extension', [{ '?column?': 1 }]],
      ['FROM pg_indexes', [{ '?column?': 1 }]],
      ['FROM pg_proc', [{ '?column?': 1 }]],
      // information_schema.columns answers empty → the heritage column is absent.
    ]);
    const r = await cloudPre.checkDeclaredGuardsPresent(pool, descriptorsByName());
    expect(r.severity).toBe('WARN');
    expect(r.value).toEqual(['enrich_heritage:parcels.heritage_verified_flag']);
  });

  it('never probes rls_bypass_or_policy — that requirement is owned by write.assertWritePrivileges', async () => {
    const pool = fakePool([
      ['FROM pg_extension', [{ '?column?': 1 }]],
      ['FROM pg_indexes', [{ '?column?': 1 }]],
      ['FROM pg_proc', [{ '?column?': 1 }]],
      ['FROM information_schema.columns', [{ '?column?': 1 }]],
    ]);
    const r = await cloudPre.checkDeclaredGuardsPresent(pool, descriptorsByName());
    expect(r.value).toEqual([]);
    // Four probed requirements (2 + 1 column + 1 function), never the fifth.
    const probed = pool.calls.filter((c) => /pg_extension|pg_indexes|pg_proc|information_schema/.test(c.text));
    expect(probed).toHaveLength(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. table_floors
// ─────────────────────────────────────────────────────────────────────────────

describe('checkTableFloors — both directions (sources_<table>_floor)', () => {
  const descriptorsByName = () => fakeDescriptors({
    load_parcels: { outputs: { writes: [{ table: 'parcels' }, { table: 'parcel_buildings' }] } },
    load_ravines: { outputs: { writes: [{ table: 'ravines' }] } },
  });

  it('RED: a table below its sources_<table>_floor is a FAIL naming the table', async () => {
    const pool = fakePool([
      ['FROM logic_variables', [
        { variable_key: 'sources_parcels_floor', variable_value: '400000' },
        { variable_key: 'sources_ravines_floor', variable_value: '800' },
      ]],
      ['FROM "parcels"', [{ n: 12345 }]],
      ['FROM "ravines"', [{ n: 854 }]],
      ['FROM "parcel_buildings"', [{ n: 1 }]],
    ]);
    const r = await cloudPre.checkTableFloors(pool, descriptorsByName());
    expect(r.severity).toBe('FAIL');
    const below = (r.value as Array<{ table: string; count: number; floor: number | null }>).filter((v) => v.floor !== null && v.count < v.floor);
    expect(below.map((b) => b.table)).toEqual(['parcels']);
    expect(below[0]?.count).toBe(12345);
    expect(below[0]?.floor).toBe(400000);
  });

  it('GREEN: at or above every floor is INFO, and the counts are reported for every table', async () => {
    const pool = fakePool([
      ['FROM logic_variables', [
        { variable_key: 'sources_parcels_floor', variable_value: '400000' },
        { variable_key: 'sources_ravines_floor', variable_value: '800' },
      ]],
      ['FROM "parcels"', [{ n: 437279 }]],
      ['FROM "ravines"', [{ n: 854 }]],
      ['FROM "parcel_buildings"', [{ n: 512000 }]],
    ]);
    const r = await cloudPre.checkTableFloors(pool, descriptorsByName());
    expect(r.severity).toBe('INFO');
    const values = r.value as Array<{ table: string; count: number; floor: number | null }>;
    expect(values.map((v) => v.table)).toEqual(['parcel_buildings', 'parcels', 'ravines']);
    expect(values.find((v) => v.table === 'parcel_buildings')?.floor).toBeNull();
  });

  it('a table with NO declared floor is INFO with the count, never a FAIL', async () => {
    const pool = fakePool([
      ['FROM logic_variables', []],
      ['FROM "parcels"', [{ n: 3 }]],
      ['FROM "ravines"', [{ n: 0 }]],
      ['FROM "parcel_buildings"', [{ n: 0 }]],
    ]);
    const r = await cloudPre.checkTableFloors(pool, descriptorsByName());
    expect(r.severity).toBe('INFO');
  });

  it('convertedWriteTables is DISTINCT and sorted — a table written by two descriptors is counted once', () => {
    const tables = cloudPre.convertedWriteTables(fakeDescriptors({
      a: { outputs: { writes: [{ table: 'parcels' }, { table: 'ravines' }] } },
      b: { outputs: { writes: [{ table: 'parcels' }] } },
    }));
    expect(tables).toEqual(['parcels', 'ravines']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. seed_rows_present — the LM-D15 cloud hole
// ─────────────────────────────────────────────────────────────────────────────

describe('checkSeedRowsPresent — both directions (LM-D15 cloud hole)', () => {
  const descriptorsByName = () => fakeDescriptors({
    compute_centroids: { config: { logic_variables: [
      { name: 'compute_centroids_failed_geometries_warn' },
      { name: 'compute_centroids_full_recompute_batch_size' },
    ] } },
    compute_parcel_cost_estimates: { config: { logic_variables: [
      { name: 'compute_parcel_cost_menu_coverage_min_pct' },
    ] } },
  });

  it('RED: a declared variable with no logic_variables row is a FAIL naming it (LM-D15)', async () => {
    const pool = fakePool([
      ['FROM logic_variables', [
        { variable_key: 'compute_centroids_failed_geometries_warn' },
        { variable_key: 'compute_centroids_full_recompute_batch_size' },
      ]],
    ]);
    const r = await cloudPre.checkSeedRowsPresent(pool, descriptorsByName());
    expect(r.severity).toBe('FAIL');
    expect(r.value).toEqual(['compute_parcel_cost_menu_coverage_min_pct']);
  });

  it('GREEN: every declared variable seeded is INFO', async () => {
    const pool = fakePool([
      ['FROM logic_variables', cloudPre.declaredLogicVariables(descriptorsByName()).map((variable_key) => ({ variable_key }))],
    ]);
    const r = await cloudPre.checkSeedRowsPresent(pool, descriptorsByName());
    expect(r.severity).toBe('INFO');
    expect(r.value).toEqual([]);
  });

  it('queries the registry ONCE with the whole declared set (never per-variable)', async () => {
    const pool = fakePool([['FROM logic_variables', []]]);
    const r = await cloudPre.checkSeedRowsPresent(pool, descriptorsByName());
    expect(r.value).toEqual([
      'compute_centroids_failed_geometries_warn',
      'compute_centroids_full_recompute_batch_size',
      'compute_parcel_cost_menu_coverage_min_pct',
    ]);
    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0]?.values?.[0]).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. sharing_chain_running
// ─────────────────────────────────────────────────────────────────────────────

describe('checkSharingChainRunning — both directions (isChainRunning)', () => {
  it('RED: a running chain_sources row is a FAIL', async () => {
    const pool = fakePool([
      ['status = \'running\'', [{ id: 9001, started_at: '2026-09-21T10:00:00Z' }]],
    ]);
    const r = await cloudPre.checkSharingChainRunning(pool, 'sources');
    expect(r.severity).toBe('FAIL');
    expect(r.value).toMatchObject({ chain: 'sources', running: true });
  });

  it('GREEN: no running chain row is INFO', async () => {
    const r = await cloudPre.checkSharingChainRunning(emptyPool(), 'sources');
    expect(r.severity).toBe('INFO');
    expect(r.value).toMatchObject({ chain: 'sources', running: false, row: null });
  });

  it('queries the Spec 113 §8.3 exact pipeline name chain_sources (not bare sources)', async () => {
    const pool = emptyPool();
    await cloudPre.checkSharingChainRunning(pool, 'sources');
    expect(pool.calls[0]?.values).toEqual(['chain_sources']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The verdict — ROW-DERIVED, via buildReport (never re-implemented here).
// ─────────────────────────────────────────────────────────────────────────────

describe('buildReport — the verdict reads off the rows alone (Spec 124 Rule 10)', () => {
  /** A healthy pool: every migration applied, no stranded rows, no running chain. */
  function healthyPool(extra: Array<[string, Array<Record<string, unknown>>]> = []) {
    const migrationFiles = readdirSync(path.join(REPO_ROOT, 'migrations'))
      .filter((f: string) => /^\d{3}_.*\.sql$/.test(f))
      .map((filename: string) => ({ filename }));
    return fakePool([
      // Order matters (first match wins): the stranded-rows query is distinguished by
      // ORDER BY id, the chain query by the chain_sources parameter.
      ['ORDER BY id', extra.find(([n]) => n === 'stranded')?.[1] ?? []],
      ['chain_sources', []],
      ['FROM schema_migrations', migrationFiles],
      ['FROM logic_variables', []],
      ...extra.filter(([n]) => n !== 'stranded'),
    ]);
  }

  it('one FAIL row among otherwise-INFO rows yields verdict FAIL', async () => {
    // Everything healthy EXCEPT a stranded running row.
    const pool = healthyPool([['stranded', [{ id: 7, pipeline: 'sources:parcels', started_at: null }]]]);
    const report = await cloudPre.buildReport(pool, { descriptorsByName: fakeDescriptors({}), listCiRuns: greenCi });
    const severities = report.rows.map((r) => r.severity);
    expect(severities.filter((s) => s === 'FAIL')).toHaveLength(1);
    expect(severities.filter((s) => s === 'INFO').length).toBeGreaterThanOrEqual(4);
    expect(report.verdict).toBe('FAIL');
  });

  it('only WARN rows yields verdict WARN, never FAIL', async () => {
    const pool = healthyPool();
    const report = await cloudPre.buildReport(pool, {
      descriptorsByName: fakeDescriptors({
        enrich_heritage: { guards: { requires: [{ kind: 'column', name: 'parcels.heritage_verified_flag', on_missing: 'warn' }] } },
      }),
      listCiRuns: greenCi,
    });
    expect(report.rows.map((r) => r.severity)).toContain('WARN');
    expect(report.rows.map((r) => r.severity)).not.toContain('FAIL');
    expect(report.verdict).toBe('WARN');
  });

  it('all seven checks emit exactly one row each, in declaration order', async () => {
    const pool = healthyPool();
    const report = await cloudPre.buildReport(pool, { descriptorsByName: fakeDescriptors({}), listCiRuns: greenCi });
    expect(report.rows.map((r) => r.id)).toEqual([
      'stranded_running_rows',
      'migrations_missing',
      'declared_guards_present',
      'table_floors',
      'seed_rows_present',
      'sharing_chain_running',
      'ci_green_for_sha',
    ]);
  });

  it('every row carries the {id, severity, value, limit, why} shape (one row per check, Spec 48 §3.6)', async () => {
    const pool = healthyPool();
    const report = await cloudPre.buildReport(pool, { descriptorsByName: fakeDescriptors({}), listCiRuns: greenCi });
    for (const r of report.rows) {
      expect(typeof r.id).toBe('string');
      expect(['FAIL', 'WARN', 'INFO']).toContain(r.severity);
      expect(typeof r.limit).toBe('string');
      expect((r.why ?? '').length).toBeGreaterThan(0);
      expect('value' in r).toBe(true);
    }
    expect(report.verdict).toBe('PASS');
  });

  it('the report names the database it graded (never silent about the target)', async () => {
    const pool = healthyPool();
    const report = await cloudPre.buildReport(pool, { descriptorsByName: fakeDescriptors({}), database: 'postgres', listCiRuns: greenCi });
    expect(report.database).toBe('postgres');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The `--only` filter — a selected subset runs, in DECLARATION order, and only
// the selected checks touch the pool.
// ─────────────────────────────────────────────────────────────────────────────

describe('buildReport { only } — selected subset, declaration order, unselected never runs', () => {
  /** A healthy pool: every migration applied, no stranded rows, no running chain. */
  function healthyPool(extra: Array<[string, Array<Record<string, unknown>>]> = []) {
    const migrationFiles = readdirSync(path.join(REPO_ROOT, 'migrations'))
      .filter((f: string) => /^\d{3}_.*\.sql$/.test(f))
      .map((filename: string) => ({ filename }));
    return fakePool([
      ['ORDER BY id', extra.find(([n]) => n === 'stranded')?.[1] ?? []],
      ['chain_sources', []],
      ['FROM schema_migrations', migrationFiles],
      ['FROM logic_variables', []],
      ...extra.filter(([n]) => n !== 'stranded'),
    ]);
  }

  it('runs ONLY the selected checks, and in CHECK_IDS declaration order (migrations_missing first)', async () => {
    const pool = healthyPool();
    const report = await cloudPre.buildReport(pool, {
      descriptorsByName: fakeDescriptors({}),
      only: ['seed_rows_present', 'migrations_missing'],
      listCiRuns: greenCi,
    });
    // Declaration order: migrations_missing (2) before seed_rows_present (5), never the
    // order they were named on the command line.
    expect(report.rows.map((r) => r.id)).toEqual(['migrations_missing', 'seed_rows_present']);
  });

  it('an UNSELECTED check never runs — no stranded-rows query text is ever issued', async () => {
    const pool = healthyPool();
    await cloudPre.buildReport(pool, {
      descriptorsByName: fakeDescriptors({
        compute_centroids: { config: { logic_variables: [{ name: 'compute_centroids_full_recompute_batch_size' }] } },
      }),
      only: ['seed_rows_present', 'migrations_missing'],
      listCiRuns: greenCi,
    });
    expect(pool.calls.some((c) => /FROM pipeline_runs/.test(c.text))).toBe(false);
    // ...and the two selected queries WERE issued (the filter is not \"run nothing\").
    expect(pool.calls.some((c) => /FROM schema_migrations/.test(c.text))).toBe(true);
    expect(pool.calls.some((c) => /FROM logic_variables/.test(c.text))).toBe(true);
  });

  it('only: null runs all seven checks (the default is unchanged)', async () => {
    const pool = healthyPool();
    const report = await cloudPre.buildReport(pool, { descriptorsByName: fakeDescriptors({}), only: null, listCiRuns: greenCi });
    expect(report.rows.map((r) => r.id)).toEqual(cloudPre.CHECK_IDS);
  });

  it('an unknown id rejects with an Error naming it AND listing the known ids', async () => {
    const pool = healthyPool();
    await expect(cloudPre.buildReport(pool, { descriptorsByName: fakeDescriptors({}), only: ['nope'], listCiRuns: greenCi }))
      .rejects.toThrow(/nope/);
    let err: Error | null = null;
    try {
      await cloudPre.buildReport(pool, { descriptorsByName: fakeDescriptors({}), only: ['nope'], listCiRuns: greenCi });
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    for (const id of cloudPre.CHECK_IDS) expect((err as Error).message).toContain(id);
  });

  it('only: [] rejects — a gate that selects NO checks must not fold to a vacuous PASS', async () => {
    // `--only=` / `--only=,` parse to [] (parseArgs drops empty entries). Running zero
    // checks over zero measurements would yield verdict PASS and let a chain dispatch
    // unchecked — the "green because it never looked" failure this checklist closes.
    const pool = healthyPool();
    await expect(cloudPre.buildReport(pool, { descriptorsByName: fakeDescriptors({}), only: [], listCiRuns: greenCi }))
      .rejects.toThrow(/selected no checks/);
    // Nothing ran: the refusal is BEFORE any check touches the pool.
    expect(pool.calls).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. ci_green_for_sha — operator D2 (2026-09-27): never dispatch on a SHA whose CI
//    is not green. Both directions, through a stubbed listCiRuns (never `gh`).
// ─────────────────────────────────────────────────────────────────────────────

describe('checkCiGreenForSha — both directions (operator D2)', () => {
  /** @param {Array<{workflowName:string,status:string,conclusion:string}>} runs */
  const stub = (runs: Array<{ workflowName: string; status: string; conclusion: string }>) =>
    async () => runs;

  it('GREEN: both required workflows completed/success is INFO', async () => {
    const r = await cloudPre.checkCiGreenForSha({
      sha: 'abc',
      listCiRuns: stub([
        { workflowName: 'Test Suite', status: 'completed', conclusion: 'success' },
        { workflowName: 'DB Integration Tests', status: 'completed', conclusion: 'success' },
      ]),
    });
    expect(r.id).toBe('ci_green_for_sha');
    expect(r.severity).toBe('INFO');
    expect(r.value).toMatchObject({
      sha: 'abc',
      workflows: { 'Test Suite': 'success', 'DB Integration Tests': 'success' },
    });
  });

  it('RED: one required workflow failed is a FAIL', async () => {
    const r = await cloudPre.checkCiGreenForSha({
      sha: 'abc',
      listCiRuns: stub([
        { workflowName: 'Test Suite', status: 'completed', conclusion: 'success' },
        { workflowName: 'DB Integration Tests', status: 'completed', conclusion: 'failure' },
      ]),
    });
    expect(r.severity).toBe('FAIL');
    expect((r.value as { workflows: Record<string, string> }).workflows['DB Integration Tests']).toBe('failure');
  });

  it('RED: an in_progress run (conclusion \'\') is a FAIL', async () => {
    const r = await cloudPre.checkCiGreenForSha({
      sha: 'abc',
      listCiRuns: stub([
        { workflowName: 'Test Suite', status: 'in_progress', conclusion: '' },
        { workflowName: 'DB Integration Tests', status: 'completed', conclusion: 'success' },
      ]),
    });
    expect(r.severity).toBe('FAIL');
    expect((r.value as { workflows: Record<string, string> }).workflows['Test Suite']).toBe('in_progress');
  });

  it('RED: a required workflow ABSENT is a FAIL whose value names it `missing`', async () => {
    const r = await cloudPre.checkCiGreenForSha({
      sha: 'abc',
      listCiRuns: stub([
        { workflowName: 'Test Suite', status: 'completed', conclusion: 'success' },
      ]),
    });
    expect(r.severity).toBe('FAIL');
    expect((r.value as { workflows: Record<string, string> }).workflows['DB Integration Tests']).toBe('missing');
  });

  it('RED: only the NEWEST run per workflow counts — an older success under a newer failure is a FAIL', async () => {
    const r = await cloudPre.checkCiGreenForSha({
      sha: 'abc',
      listCiRuns: stub([
        // gh run list is newest-first: the first row for Test Suite wins.
        { workflowName: 'Test Suite', status: 'completed', conclusion: 'failure' },
        { workflowName: 'Test Suite', status: 'completed', conclusion: 'success' },
        { workflowName: 'DB Integration Tests', status: 'completed', conclusion: 'success' },
      ]),
    });
    expect(r.severity).toBe('FAIL');
    expect((r.value as { workflows: Record<string, string> }).workflows['Test Suite']).toBe('failure');
  });

  it('RED: listCiRuns throwing is a FAIL with the error text in value', async () => {
    const r = await cloudPre.checkCiGreenForSha({
      sha: 'abc',
      listCiRuns: async () => { throw new Error('gh exploded'); },
    });
    expect(r.severity).toBe('FAIL');
    expect(JSON.stringify(r.value)).toContain('gh exploded');
  });

  it('RED: an empty sha is a FAIL (nothing to check against)', async () => {
    const r = await cloudPre.checkCiGreenForSha({ sha: '', listCiRuns: stub([]) });
    expect(r.severity).toBe('FAIL');
  });

  it('the row states the limit, and pull-quotes operator D2 / Spec 124 §5 R-BA 11(e)', async () => {
    const r = await cloudPre.checkCiGreenForSha({ sha: 'abc', listCiRuns: stub([]) });
    expect(r.limit).toBe("every required CI workflow's newest run for this SHA = success");
    expect(r.why).toContain('R-BA 11(e)');
    expect(r.why).toContain('D2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// READ-ONLY LOCK — the script's source text.
// ─────────────────────────────────────────────────────────────────────────────

describe('READ-ONLY lock — no write verb in the script outside comments', () => {
  /**
   * Strip line comments, block comments and the doc-comment prose, then assert no SQL
   * write verb survives in executable source. Comment-stripping is deliberately crude
   * (a regex, not a parser) — it must over-strip, never under-strip, for this lock to
   * mean anything.
   */
  function executableSource(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
      .replace(/(^|[^:])\/\/.*$/gm, '$1'); // line comments (`//`, but not `://`)
  }

  const src = readFileSync(SCRIPT_PATH, 'utf8');
  const stripped = executableSource(src);

  for (const verb of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'ALTER']) {
    it(`executable source contains no ${verb}`, () => {
      // Word-boundary, case-sensitive: the SQL keywords as they would be written.
      expect(stripped).not.toMatch(new RegExp(`\\b${verb}\\b`));
    });
  }

  it('the header says so, in those words', () => {
    expect(src).toContain('READ-ONLY — this script never writes to the database');
  });

  it('the header cites the governing spec sections', () => {
    expect(src).toContain('123_step_opt_assessment_validation.md §7.2 A5');
    expect(src).toContain('Rule 10');
  });

  it('every SQL statement is a SELECT (or a read-only catalog probe)', () => {
    const statements = stripped.match(/\b(SELECT|WITH)\b/g) ?? [];
    expect(statements.length).toBeGreaterThan(4);
  });

  it('the header tells the truth about the exit code: FAIL exits 1 with OR without --dry', () => {
    // The old header said "Exit 1 on FAIL, 0 otherwise, 0 on --dry." — false: main()
    // returns the FAIL exit code in both modes, and the chain-*.yml gate depends on it
    // (--dry only skips writing the report files).
    expect(src).toMatch(/return report\.verdict === 'FAIL' \? 1 : 0;/);
    // ...and the return is NOT guarded by an `opts.dry` branch, so --dry cannot swallow it.
    expect(src).not.toMatch(/opts\.dry[\s\S]{0,200}return report\.verdict === 'FAIL' \? 1 : 0;/);
    expect(src).toContain('Exit 1 on FAIL, 0 otherwise — with or without');
    expect(src).not.toContain('Exit 1 on FAIL, 0 otherwise, 0 on --dry.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLI surface — --help must work with no DB and no env.
// ─────────────────────────────────────────────────────────────────────────────

describe('argv + usage', () => {
  it('DEBUG prints buildReport rows', async () => {
    const pool = fakePool([['ORDER BY id', [{ id: 7, pipeline: 'x', started_at: null }]]]);
    const r = await cloudPre.buildReport(pool, { descriptorsByName: fakeDescriptors({}) });
    expect(r.rows).toBeDefined();
  });

  it('parseArgs reads --out=<dir>, --dry and --help/-h', () => {
    expect(cloudPre.parseArgs(['--out=/tmp/x', '--dry'])).toEqual({ out: '/tmp/x', dry: true, help: false, only: null, sha: null });
    expect(cloudPre.parseArgs(['--help']).help).toBe(true);
    expect(cloudPre.parseArgs(['-h']).help).toBe(true);
    expect(cloudPre.parseArgs([])).toEqual({ out: null, dry: false, help: false, only: null, sha: null });
  });

  it('parseArgs reads --only=<csv> (trimmed, empty entries dropped) and --sha=<sha>', () => {
    expect(cloudPre.parseArgs(['--only=a,b', '--sha=abc'])).toEqual({
      out: null, dry: false, help: false, only: ['a', 'b'], sha: 'abc',
    });
    expect(cloudPre.parseArgs(['--only= a , ,b ']).only).toEqual(['a', 'b']);
    expect(cloudPre.parseArgs(['--only=']).only).toEqual([]);
    expect(cloudPre.parseArgs([]).only).toBeNull();
    expect(cloudPre.parseArgs([]).sha).toBeNull();
  });

  it('usage() documents all three flags and the cloud invocation', () => {
    const text = cloudPre.usage();
    expect(text).toContain('--out=');
    expect(text).toContain('--dry');
    expect(text).toContain('--help');
    expect(text).toContain('--only=');
    expect(text).toContain('--sha=');
    expect(text).toContain('SUPABASE_DATABASE_URL');
  });

  it('reportStamp produces a filesystem-safe UTC stamp', () => {
    expect(cloudPre.reportStamp(new Date('2026-09-21T14:03:09.123Z'))).toBe('2026-09-21T14-03-09Z');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// probeRequirement — the extraction from the runner's assertRequirements.
// ─────────────────────────────────────────────────────────────────────────────

describe('probeRequirement — extracted from index.js, and the runner still calls it', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const stepLib = require('../../scripts/lib/step/index.js') as unknown as {
    probeRequirement: (pool: unknown, requirement: Record<string, unknown>) => Promise<{ present: boolean; detail: string }>;
    assertRequirements: (pool: unknown, descriptor: unknown, opts: { log: { warn: () => void }; tag: string }) => Promise<Record<string, boolean>>;
  };

  const indexSrc = readFileSync(path.join(REPO_ROOT, 'scripts/lib/step/index.js'), 'utf8');

  it('index.js exposes probeRequirement and its guard block calls it', () => {
    expect(typeof stepLib.probeRequirement).toBe('function');
    // The guard block (assertRequirements) references the extracted function — this is
    // the lock that the runner did not keep a second, drifted copy of the probe. (MQ-D3: the descriptor is passed so the trigger body check uses its by:"trigger" columns).
    expect(indexSrc).toMatch(/async function assertRequirements[\s\S]{0,1200}probeRequirement\(pool, r, descriptor\)/);
  });

  it('probeRequirement reports present:true when the probe returns a row', async () => {
    const pool = fakePool([['FROM pg_extension', [{ '?column?': 1 }]]]);
    const out = await stepLib.probeRequirement(pool, { kind: 'extension', name: 'postgis' });
    expect(out.present).toBe(true);
  });

  it('probeRequirement reports present:false when the probe returns nothing, and names the SQL it asked', async () => {
    const out = await stepLib.probeRequirement(emptyPool(), { kind: 'index', name: 'idx_parcels_geom_gist' });
    expect(out.present).toBe(false);
    expect(out.detail).toMatch(/FROM pg_indexes/);
  });

  it('a column requirement splits `table.column` into the probe\'s two args', async () => {
    const pool = emptyPool();
    await stepLib.probeRequirement(pool, { kind: 'column', name: 'parcels.ravine_dataset_version_when_enriched' });
    expect(pool.calls[0]?.values).toEqual(['parcels', 'ravine_dataset_version_when_enriched']);
  });

  it('a kind with no catalog probe reads present:true (never an unprobed kind read as missing)', async () => {
    const out = await stepLib.probeRequirement(emptyPool(), { kind: 'rls_bypass_or_policy', name: 'parcel_buildings' });
    expect(out.present).toBe(true);
  });

  it('assertRequirements still throws on a missing on_missing:"fail" requirement and warns otherwise (behaviour unchanged)', async () => {
    const descriptor = {
      guards: { requires: [
        { kind: 'extension', name: 'postgis', on_missing: 'fail' },
        { kind: 'index', name: 'idx_gone', on_missing: 'warn' },
      ] },
    };
    const warns: string[] = [];
    const log = { warn: (...args: unknown[]) => { warns.push(String(args[1])); } };
    await expect(stepLib.assertRequirements(emptyPool(), descriptor, { log, tag: '[test]' }))
      .rejects.toThrow(/required extension "postgis" is ABSENT/);

    // With postgis present, the missing WARN requirement logs and does not throw.
    const pool = fakePool([['FROM pg_extension', [{ '?column?': 1 }]]]);
    const measured = await stepLib.assertRequirements(pool, descriptor, { log, tag: '[test]' });
    expect(measured).toEqual({ postgis: true, idx_gone: false });
    expect(warns).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cross-check with the cloud runbook's own wording (a)-(e)
// ─────────────────────────────────────────────────────────────────────────────

describe('the seven checks cover the runbook §3c pre-checks\' DB-side items', () => {
  it('the report renders as both markdown and a console table without throwing', async () => {
    const pool = fakePool([['FROM pipeline_runs', [{ id: 7, pipeline: 'chain_sources', started_at: null }]]]);
    const report = await cloudPre.buildReport(pool, { descriptorsByName: fakeDescriptors({}), database: 'postgres', listCiRuns: greenCi });
    const md = cloudPre.renderMarkdown(report);
    expect(md).toContain('CLOUD-PRE');
    expect(md).toContain(report.verdict);
    expect(md).toContain('stranded_running_rows');
    expect(cloudPre.renderConsoleTable(report.rows)).toContain('stranded_running_rows');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LDG-10 T14/T16 — the `trigger` requirement kind + no vacuous pass for an unknown kind.
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.4 / §6.6 (LDG-10 class 4)
// ─────────────────────────────────────────────────────────────────────────────

describe('LDG-10 — guards.requires kind "trigger" (T14) and unknown-kind refusal (T16)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const stepLib = require('../../scripts/lib/step/index.js') as unknown as {
    probeRequirement: (pool: unknown, requirement: Record<string, unknown>, descriptor?: unknown) => Promise<{ present: boolean; detail: string }>;
    assertRequirements: (pool: unknown, descriptor: unknown, opts: { log: { warn: () => void }; tag: string }) => Promise<Record<string, boolean>>;
    triggerInvalidatedColumns: (d: unknown, name: string) => string[];
    triggerBodyMissingColumns: (prosrc: unknown, cols: string[]) => string[];
  };

  /**
   * A tiny pg_trigger catalog simulator: answers a pg_trigger probe from `triggers`, applying
   * ONLY the filters the probe's own SQL text states. So a DISABLED trigger reads present
   * unless the SQL itself carries the enabled filter — the lock is on the SQL, not on the mock.
   */
  function triggerCatalogPool(triggers: Array<{ relname: string; tgname: string; tgenabled: string; tgisinternal: boolean }>) {
    const calls: Array<{ text: string; values: unknown[] | undefined }> = [];
    return {
      calls,
      async query(text: string, values?: unknown[]) {
        calls.push({ text, values });
        if (!text.includes('FROM pg_trigger')) return { rows: [] };
        const [rel, name] = (values ?? []) as string[];
        const rows = triggers.filter((t) => t.relname === rel && t.tgname === name
          && (!/NOT t\.tgisinternal/.test(text) || !t.tgisinternal)
          && (!/t\.tgenabled IN \('O','A'\)/.test(text) || t.tgenabled === 'O' || t.tgenabled === 'A'));
        return { rows: rows.map(() => ({ '?column?': 1 })) };
      },
    };
  }

  /**
   * D3: a pool that additionally answers the `prosrc` body query. Records `calls` like
   * `triggerCatalogPool`. A query whose text includes `prosrc` returns the function body
   * (`null` → no row); any other `FROM pg_trigger` query is the presence probe.
   */
  function bodyPool(prosrc: string | null, present = true) {
    const calls: Array<{ text: string; values: unknown[] | undefined }> = [];
    return {
      calls,
      async query(text: string, values?: unknown[]) {
        calls.push({ text, values });
        if (!text.includes('FROM pg_trigger')) return { rows: [] };
        if (text.includes('prosrc')) return { rows: prosrc === null ? [] : [{ prosrc }] };
        return { rows: present ? [{ '?column?': 1 }] : [] };
      },
    };
  }

  const REQ = { kind: 'trigger', name: 'parcels.trg_parcels_geom_invalidation', on_missing: 'fail' };

  /** Build a descriptor whose `outputs.invalidates[]` claims each column is stamped by the trigger. */
  const inv = (cols: string[], trigger = 'parcels.trg_parcels_geom_invalidation') => ({
    guards: { requires: [REQ] },
    outputs: { invalidates: cols.map((c) => ({ table: 'parcels', column: c, when: 'x', by: 'trigger', trigger })) },
  });

  /** A trigger body whose two arms stamp both invalidated columns. */
  const BODY_OK = 'BEGIN\n  IF NEW.geom IS DISTINCT FROM OLD.geom THEN\n    NEW.zoning_enriched_at := NULL;\n    NEW.heritage_dataset_version_when_enriched := NULL;\n  END IF;\n  RETURN NEW;\nEND;';

  it('GREEN: an ENABLED (origin) trigger reads present, and the probe splits <table>.<trigger>', async () => {
    const pool = triggerCatalogPool([{ relname: 'parcels', tgname: 'trg_parcels_geom_invalidation', tgenabled: 'O', tgisinternal: false }]);
    const out = await stepLib.probeRequirement(pool, REQ);
    expect(out.present).toBe(true);
    expect(pool.calls[0]?.values).toEqual(['parcels', 'trg_parcels_geom_invalidation']);
    expect(out.detail).toMatch(/tgenabled IN \('O','A'\)/);
  });

  it('GREEN: an ALWAYS-enabled trigger reads present', async () => {
    const pool = triggerCatalogPool([{ relname: 'parcels', tgname: 'trg_parcels_geom_invalidation', tgenabled: 'A', tgisinternal: false }]);
    expect((await stepLib.probeRequirement(pool, REQ)).present).toBe(true);
  });

  it('RED: a DISABLED trigger (tgenabled D) reads ABSENT', async () => {
    const pool = triggerCatalogPool([{ relname: 'parcels', tgname: 'trg_parcels_geom_invalidation', tgenabled: 'D', tgisinternal: false }]);
    expect((await stepLib.probeRequirement(pool, REQ)).present).toBe(false);
  });

  it('RED: a replica-only trigger (tgenabled R) and an internal trigger read ABSENT', async () => {
    expect((await stepLib.probeRequirement(triggerCatalogPool([{ relname: 'parcels', tgname: 'trg_parcels_geom_invalidation', tgenabled: 'R', tgisinternal: false }]), REQ)).present).toBe(false);
    expect((await stepLib.probeRequirement(triggerCatalogPool([{ relname: 'parcels', tgname: 'trg_parcels_geom_invalidation', tgenabled: 'O', tgisinternal: true }]), REQ)).present).toBe(false);
  });

  it('RED: an absent trigger reads ABSENT, and the runner refuses the step on on_missing "fail"', async () => {
    const pool = triggerCatalogPool([]);
    expect((await stepLib.probeRequirement(pool, REQ)).present).toBe(false);
    await expect(stepLib.assertRequirements(pool, { guards: { requires: [REQ] } }, { log: { warn: () => {} }, tag: '[test]' }))
      .rejects.toThrow(/required trigger "parcels\.trg_parcels_geom_invalidation" is ABSENT/);
  });

  it('cloud:pre declared_guards_present probes a trigger requirement: DISABLED flips the row FAIL naming slug:name', async () => {
    const descriptors = fakeDescriptors({ compute_centroids: { guards: { requires: [REQ] } } });
    const disabled = triggerCatalogPool([{ relname: 'parcels', tgname: 'trg_parcels_geom_invalidation', tgenabled: 'D', tgisinternal: false }]);
    const r = await cloudPre.checkDeclaredGuardsPresent(disabled, descriptors);
    expect(r.severity).toBe('FAIL');
    expect(r.value).toEqual(['compute_centroids:parcels.trg_parcels_geom_invalidation']);
    expect(r.limit).toMatch(/index\/extension\/function\/column\/trigger present/);
    const enabled = triggerCatalogPool([{ relname: 'parcels', tgname: 'trg_parcels_geom_invalidation', tgenabled: 'O', tgisinternal: false }]);
    const g = await cloudPre.checkDeclaredGuardsPresent(enabled, descriptors);
    expect(g.severity).toBe('INFO');
    expect(g.value).toEqual([]);
  });

  it('T16 RED: a kind missing from BOTH the probes and the owned-elsewhere set is REFUSED by probeRequirement (no vacuous pass)', async () => {
    await expect(stepLib.probeRequirement(emptyPool(), { kind: 'srid', name: 'parcels.geom' }))
      .rejects.toThrow(/has no catalog probe and is not owned elsewhere/);
  });

  it('T16 RED: assertRequirements refuses a step declaring an unknown kind instead of skipping it', async () => {
    await expect(stepLib.assertRequirements(emptyPool(), { guards: { requires: [{ kind: 'srid', name: 'parcels.geom', on_missing: 'fail' }] } }, { log: { warn: () => {} }, tag: '[test]' }))
      .rejects.toThrow(/has no catalog probe and is not owned elsewhere/);
  });

  it('T16 GREEN: rls_bypass_or_policy keeps its documented skip (owned by write.assertWritePrivileges) — never probed, never refused', async () => {
    const pool = emptyPool();
    const out = await stepLib.probeRequirement(pool, { kind: 'rls_bypass_or_policy', name: 'parcels' });
    expect(out.present).toBe(true);
    const measured = await stepLib.assertRequirements(pool, { guards: { requires: [{ kind: 'rls_bypass_or_policy', name: 'parcels', on_missing: 'fail' }] } }, { log: { warn: () => {} }, tag: '[test]' });
    expect(measured).toEqual({});
    expect(pool.calls).toHaveLength(0);
  });

  // FLEET-2 MQ-D3 (a) — the `trigger` guard probe also checks the live function body.
  // R-BF "declared == observed": a trigger whose function lacks the stamp arm makes the
  // step's `outputs.invalidates[] by:"trigger"` claim false at runtime.

  it('D3-1 RED: triggerInvalidatedColumns derives the columns a trigger claims to stamp', () => {
    // RED today: the derivation helper does not exist yet.
    expect(stepLib.triggerInvalidatedColumns(inv(['zoning_enriched_at', 'heritage_dataset_version_when_enriched']), REQ.name))
      .toEqual(['zoning_enriched_at', 'heritage_dataset_version_when_enriched']);
    // A row naming a DIFFERENT trigger, or stamped by the step, is excluded.
    expect(stepLib.triggerInvalidatedColumns({
      guards: { requires: [REQ] },
      outputs: { invalidates: [
        { table: 'parcels', column: 'zoning_enriched_at', when: 'x', by: 'trigger', trigger: 'parcels.other_trigger' },
        { table: 'parcels', column: 'heritage_dataset_version_when_enriched', when: 'x', by: 'step' },
      ] },
    }, REQ.name)).toEqual([]);
    // `outputs: "none"` → no columns.
    expect(stepLib.triggerInvalidatedColumns({ outputs: 'none' }, REQ.name)).toEqual([]);
  });

  it('D3-2 RED: triggerBodyMissingColumns matches the stamp arms, comment- and case-insensitively', () => {
    // RED today: the body matcher does not exist yet.
    expect(stepLib.triggerBodyMissingColumns(BODY_OK, ['zoning_enriched_at', 'heritage_dataset_version_when_enriched'])).toEqual([]);
    // A commented-out arm never passes.
    expect(stepLib.triggerBodyMissingColumns('-- NEW.zoning_enriched_at := NULL;\n/* NEW.heritage_dataset_version_when_enriched := NULL; */', ['zoning_enriched_at', 'heritage_dataset_version_when_enriched']))
      .toEqual(['zoning_enriched_at', 'heritage_dataset_version_when_enriched']);
    // Case- and whitespace-insensitive.
    expect(stepLib.triggerBodyMissingColumns('new.ZONING_ENRICHED_AT:=null;', ['zoning_enriched_at'])).toEqual([]);
    // A null body means every column is missing.
    expect(stepLib.triggerBodyMissingColumns(null, ['a'])).toEqual(['a']);
  });

  it('D3-3 GREEN: a trigger present whose body stamps both columns reads present, with exactly 2 queries', async () => {
    // GREEN control: the presence probe plus ONE prosrc query.
    const pool = bodyPool(BODY_OK);
    const out = await stepLib.probeRequirement(pool, REQ, inv(['zoning_enriched_at', 'heritage_dataset_version_when_enriched']));
    expect(out.present).toBe(true);
    expect(pool.calls).toHaveLength(2);
    expect(pool.calls[1]?.text).toContain('prosrc');
    expect(pool.calls[1]?.values).toEqual(['parcels', 'trg_parcels_geom_invalidation']);
  });

  it('D3-4 RED: a body with only the zoning arm reads ABSENT, naming the missing column', async () => {
    // RED today: the body is never read, so the missing arm goes unnoticed.
    const body = 'BEGIN\n  IF NEW.geom IS DISTINCT FROM OLD.geom THEN\n    NEW.zoning_enriched_at := NULL;\n  END IF;\n  RETURN NEW;\nEND;';
    const out = await stepLib.probeRequirement(bodyPool(body), REQ, inv(['zoning_enriched_at', 'heritage_dataset_version_when_enriched']));
    expect(out.present).toBe(false);
    expect(out.detail).toContain('heritage_dataset_version_when_enriched');
  });

  it('D3-5 RED: an arm commented out reads ABSENT', async () => {
    // RED today: the commented arm is treated as a stamp.
    const body = 'BEGIN\n  NEW.zoning_enriched_at := NULL;\n  -- NEW.heritage_dataset_version_when_enriched := NULL;\n  RETURN NEW;\nEND;';
    const out = await stepLib.probeRequirement(bodyPool(body), REQ, inv(['zoning_enriched_at', 'heritage_dataset_version_when_enriched']));
    expect(out.present).toBe(false);
  });

  it('D3-6 GREEN: with no invalidates the presence-only path is said out loud (1 query)', async () => {
    // GREEN control (link_massing shape): nothing to check in the body, and the detail says so.
    const pool = bodyPool(null);
    const out = await stepLib.probeRequirement(pool, REQ, { guards: { requires: [REQ] } });
    expect(out.present).toBe(true);
    expect(out.detail).toContain('presence only');
    expect(pool.calls).toHaveLength(1);
  });

  it('D3-7 RED: an ABSENT trigger short-circuits — no prosrc query is issued', async () => {
    // RED today: the body query is issued even when the trigger is absent.
    const pool = bodyPool(BODY_OK, false);
    const out = await stepLib.probeRequirement(pool, REQ, inv(['zoning_enriched_at']));
    expect(out.present).toBe(false);
    expect(pool.calls).toHaveLength(1);
  });

  it('D3-8 RED: the runner refuses a step whose trigger body lacks the stamp arm', async () => {
    // RED today: only presence is proven, so the runner passes.
    await expect(stepLib.assertRequirements(bodyPool('BEGIN RETURN NEW; END;'), inv(['zoning_enriched_at']), { log: { warn: () => {} }, tag: '[test]' }))
      .rejects.toThrow(/required trigger "parcels\.trg_parcels_geom_invalidation" is ABSENT/);
  });

  it('D3-9 RED: cloud:pre uses the same probe and the same derived columns', async () => {
    // RED today: cloud:pre passes no descriptor, so the body is never read.
    const bad = await cloudPre.checkDeclaredGuardsPresent(bodyPool('BEGIN RETURN NEW; END;'), fakeDescriptors({ enrich_parcels: inv(['zoning_enriched_at']) }));
    expect(bad.severity).toBe('FAIL');
    expect(bad.value).toEqual(['enrich_parcels:parcels.trg_parcels_geom_invalidation']);
    const ok = await cloudPre.checkDeclaredGuardsPresent(bodyPool(BODY_OK), fakeDescriptors({ enrich_parcels: inv(['zoning_enriched_at']) }));
    expect(ok.severity).toBe('INFO');
  });
});
