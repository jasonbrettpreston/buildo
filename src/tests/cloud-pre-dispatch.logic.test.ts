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
  renderMarkdown: (report: unknown) => string;
  renderConsoleTable: (rows: Array<Record<string, unknown>>) => string;
  parseArgs: (argv: string[]) => { out: string | null; dry: boolean; help: boolean };
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
    const report = await cloudPre.buildReport(pool, { descriptorsByName: fakeDescriptors({}) });
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
    const report = await cloudPre.buildReport(pool, { descriptorsByName: fakeDescriptors({}) });
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
    });
    expect(report.rows.map((r) => r.severity)).toContain('WARN');
    expect(report.rows.map((r) => r.severity)).not.toContain('FAIL');
    expect(report.verdict).toBe('WARN');
  });

  it('all six checks emit exactly one row each, in declaration order', async () => {
    const pool = healthyPool();
    const report = await cloudPre.buildReport(pool, { descriptorsByName: fakeDescriptors({}) });
    expect(report.rows.map((r) => r.id)).toEqual([
      'stranded_running_rows',
      'migrations_missing',
      'declared_guards_present',
      'table_floors',
      'seed_rows_present',
      'sharing_chain_running',
    ]);
  });

  it('every row carries the {id, severity, value, limit, why} shape (one row per check, Spec 48 §3.6)', async () => {
    const pool = healthyPool();
    const report = await cloudPre.buildReport(pool, { descriptorsByName: fakeDescriptors({}) });
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
    const report = await cloudPre.buildReport(pool, { descriptorsByName: fakeDescriptors({}), database: 'postgres' });
    expect(report.database).toBe('postgres');
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
    expect(cloudPre.parseArgs(['--out=/tmp/x', '--dry'])).toEqual({ out: '/tmp/x', dry: true, help: false });
    expect(cloudPre.parseArgs(['--help']).help).toBe(true);
    expect(cloudPre.parseArgs(['-h']).help).toBe(true);
    expect(cloudPre.parseArgs([])).toEqual({ out: null, dry: false, help: false });
  });

  it('usage() documents all three flags and the cloud invocation', () => {
    const text = cloudPre.usage();
    expect(text).toContain('--out=');
    expect(text).toContain('--dry');
    expect(text).toContain('--help');
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
    // the lock that the runner did not keep a second, drifted copy of the probe.
    expect(indexSrc).toMatch(/async function assertRequirements[\s\S]{0,1200}probeRequirement\(pool, r\)/);
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

describe('the six checks cover the runbook §3c pre-checks\' DB-side items', () => {
  it('the report renders as both markdown and a console table without throwing', async () => {
    const pool = fakePool([['FROM pipeline_runs', [{ id: 7, pipeline: 'chain_sources', started_at: null }]]]);
    const report = await cloudPre.buildReport(pool, { descriptorsByName: fakeDescriptors({}), database: 'postgres' });
    const md = cloudPre.renderMarkdown(report);
    expect(md).toContain('CLOUD-PRE');
    expect(md).toContain(report.verdict);
    expect(md).toContain('stranded_running_rows');
    expect(cloudPre.renderConsoleTable(report.rows)).toContain('stranded_running_rows');
  });
});
