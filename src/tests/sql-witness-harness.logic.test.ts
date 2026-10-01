// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (Phase 1 WITNESS, P1-C3b harness)
// Plan: .cursor/wf2_registry_truth_active_task.md PHASE 1 (WITNESS) — harness helpers
//
// RED-first lock for scripts/analysis/capture-witness.js (brief P1-C3b2).
// The helper module is created by the sibling brief P1-C3b1-src, so this file is
// RED today: the module is missing. Every RED carries a GREEN control proving the
// same assertion can pass on a sibling input once the module exists.
//
// The module under test is CommonJS and exports:
//   PRELOAD_PATH                       absolute path of scripts/lib/sql-witness/trace-preload.cjs
//   traceEnv(env, traceDir)            NEW object: BUILDO_SQL_TRACE + NODE_OPTIONS --require PRELOAD_PATH
//   snapshotCatalog(pool)              { table: [cols…] } from information_schema.columns
//   dsmGuard(pool, env)                SHOW dynamic_shared_memory_type → buildDsmCapacityRow → refuse-or-return
//   writeTraceFromDir({...})           read *.ndjson → assembleTrace → write tracePathFor(outPath)
//
// No DB, no network, no docker: every pool is a fake `{ query: async (sql) => ({ rows }) }`.

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const requireCjs = require as unknown as (id: string) => unknown;

type Row = Record<string, unknown>;
type FakePool = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }> };

type TraceDoc = {
  trace_version: number;
  step?: string;
  chain?: string;
  source_fingerprint?: string | null;
  statements: Array<{
    fingerprint: string;
    kind: string;
    writes: Record<string, string[]>;
    reads: Record<string, string[]>;
    excluded: string[];
    error: string | null;
  }>;
  touched: { reads: Record<string, string[]>; writes: Record<string, string[]> };
};

type HarnessModule = {
  PRELOAD_PATH: string;
  traceEnv: (env: Record<string, string | undefined>, traceDir: string) => Record<string, string>;
  snapshotCatalog: (pool: FakePool) => Promise<Record<string, string[]>>;
  dsmGuard: (pool: FakePool, env: Record<string, string | undefined>) => Promise<Row>;
  writeTraceFromDir: (input: {
    traceDir: string;
    pool?: FakePool;
    catalog?: Record<string, string[]>;
    meta: Record<string, unknown>;
    outPath: string;
  }) => Promise<{ trace: TraceDoc; tracePath: string }>;
  tablesFromTraceIfNone: (input: {
    tables: string[];
    source: string;
    trace: TraceDoc;
  }) => { tables: string[]; source: string };
};

// Loaded lazily inside beforeAll (error re-thrown per test in beforeEach) so a missing module turns every test RED
// (per-test failed assertionResults) instead of failing the file with 0 tests.
let H: HarnessModule;

// The catalog snapshot shape (information_schema.columns rows → table → sorted columns).
const CAT_COLUMNS: Row[] = [
  { table_name: 'parcels', column_name: 'lot_size_sqm' },
  { table_name: 'parcels', column_name: 'id' },
  { table_name: 'parcels', column_name: 'parcel_id' },
  { table_name: 'parcel_buildings', column_name: 'parcel_id' },
  { table_name: 'parcel_buildings', column_name: 'building_id' },
  { table_name: 'permits', column_name: 'id' },
];

/**
 * A fake pool answering the two shapes the harness issues:
 *   - SHOW dynamic_shared_memory_type          → `dsmPosix` decides the reported type
 *   - SELECT … FROM information_schema.columns → CAT_COLUMNS
 * Unknown SQL throws, so an unexpected query surfaces as a failure instead of a silent empty row.
 */
function catalogPool(dsmPosix = false): FakePool {
  return {
    query: async (sql: string) => {
      if (/dynamic_shared_memory_type/i.test(sql)) {
        return { rows: [{ dynamic_shared_memory_type: dsmPosix ? 'posix' : 'mmap' }] };
      }
      if (/information_schema\.columns/i.test(sql)) return { rows: CAT_COLUMNS };
      throw new Error(`fake pool: unexpected SQL: ${String(sql).slice(0, 80)}`);
    },
  };
}

// A throwing beforeAll SKIPS tests; a throwing beforeEach FAILS each one, which is what
// gate K's red evidence needs (>=1 failed assertionResults).
let loadError: unknown = null;
beforeAll(() => {
  try {
    H = requireCjs(path.join(process.cwd(), 'scripts/analysis/capture-witness.js')) as HarnessModule;
  } catch (err) {
    loadError = err;
  }
});
beforeEach(() => {
  if (loadError) throw loadError;
});

const rows = (xs: Row[]): Row[] => xs;
const sorted = (xs: string[]): string[] => [...xs].sort();

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('sql-witness harness — traceEnv (contract: child env carries the tracer, caller env untouched)', () => {
  it('RED: sets BUILDO_SQL_TRACE and appends --require PRELOAD_PATH to NODE_OPTIONS', () => {
    const input: Record<string, string | undefined> = { PG_HOST: '127.0.0.1' };
    const out = H.traceEnv(input, '/tmp/buildo-trace');

    expect(out.BUILDO_SQL_TRACE).toBe('/tmp/buildo-trace');
    expect(out.NODE_OPTIONS).toContain('--require');
    expect(out.NODE_OPTIONS).toContain(`"${H.PRELOAD_PATH}"`);
    expect(out.PG_HOST).toBe('127.0.0.1');
  });

  it('RED: appends to an existing NODE_OPTIONS value without clobbering it', () => {
    const out = H.traceEnv({ NODE_OPTIONS: '--max-old-space-size=4096' }, '/tmp/buildo-trace');
    expect(out.NODE_OPTIONS!.startsWith('--max-old-space-size=4096')).toBe(true);
    expect(out.NODE_OPTIONS).toContain(`--require "${H.PRELOAD_PATH}"`);
  });

  it('RED: does not mutate the input env object', () => {
    const input: Record<string, string | undefined> = { NODE_OPTIONS: '--trace-warnings' };
    const before = { ...input };
    const out = H.traceEnv(input, '/tmp/buildo-trace');
    expect(input).toEqual(before);
    expect(out).not.toBe(input);
  });

  it('RED: PRELOAD_PATH is absolute and exists on disk', () => {
    expect(path.isAbsolute(H.PRELOAD_PATH)).toBe(true);
    expect(fs.existsSync(H.PRELOAD_PATH)).toBe(true);
    expect(H.PRELOAD_PATH.endsWith(path.join('scripts', 'lib', 'sql-witness', 'trace-preload.cjs'))).toBe(true);
  });

  it('GREEN control: an empty env yields exactly the two tracer keys', () => {
    const out = H.traceEnv({}, '/tmp/empty');
    expect(out.BUILDO_SQL_TRACE).toBe('/tmp/empty');
    expect(out.NODE_OPTIONS).toBe(`--require "${H.PRELOAD_PATH}"`);
  });
});

describe('sql-witness harness — snapshotCatalog (contract: information_schema snapshot, grouped + sorted)', () => {
  it('RED: groups rows by table and sorts both the table keys and each column list', async () => {
    const cat = await H.snapshotCatalog(catalogPool());

    expect(Object.keys(cat)).toEqual(sorted(['parcels', 'parcel_buildings', 'permits']));
    expect(cat.parcels).toEqual(sorted(['id', 'lot_size_sqm', 'parcel_id']));
    expect(cat.parcel_buildings).toEqual(sorted(['building_id', 'parcel_id']));
    expect(cat.permits).toEqual(['id']);
  });

  it('RED: queries the public schema only', async () => {
    const seen: string[] = [];
    const pool: FakePool = {
      query: async (sql: string) => {
        seen.push(sql);
        return { rows: CAT_COLUMNS };
      },
    };
    await H.snapshotCatalog(pool);

    expect(seen.length).toBe(1);
    expect(seen[0]).toMatch(/information_schema\.columns/i);
    expect(seen[0]).toMatch(/public/);
    expect(seen[0]).toMatch(/table_name/i);
    expect(seen[0]).toMatch(/column_name/i);
  });

  it('GREEN control: an empty result yields an empty map, never a throw', async () => {
    const pool: FakePool = { query: async () => ({ rows: rows([]) }) };
    expect(await H.snapshotCatalog(pool)).toEqual({});
  });
});

describe('sql-witness harness — dsmGuard canary 15 (contract: local Supabase on posix DSM REFUSES)', () => {
  // The port loadSupabaseDbPort reads from supabase/config.toml's [db] table.
  const SUPABASE_PORT = '54322';
  const LOCAL_ENV: Record<string, string | undefined> = {
    PG_HOST: '127.0.0.1',
    PG_PORT: SUPABASE_PORT,
  };

  it('RED canary 15: posix DSM on the local Supabase port throws REFUSED (sys_dsm_capacity)', async () => {
    await expect(H.dsmGuard(catalogPool(true), LOCAL_ENV)).rejects.toThrow(
      /^\[capture-step-golden\] REFUSED \(sys_dsm_capacity\)/,
    );
  });

  it('RED canary 15: the refusal error is an Error and names the remediation command', async () => {
    let caught: unknown = null;
    try {
      await H.dsmGuard(catalogPool(true), LOCAL_ENV);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message.startsWith('[capture-step-golden] REFUSED (sys_dsm_capacity)')).toBe(true);
    expect((caught as Error).message).toContain('dynamic_shared_memory_type');
  });

  it('GREEN control canary 15: mmap DSM returns the row and does not throw', async () => {
    const row = await H.dsmGuard(catalogPool(false), LOCAL_ENV);
    expect(row).toBeTruthy();
    expect(row.metric).toBe('sys_dsm_capacity');
    expect(row.status).toBe('PASS');
    expect(row.value).toBe('mmap');
  });
});

describe('sql-witness harness — writeTraceFromDir (contract: NDJSON → assembled trace beside the golden)', () => {
  // One NDJSON body in the exact shape trace-preload.cjs flushes: a header line, one
  // line per distinct statement, and one run-length `seq` line per client.
  const NDJSON = [
    JSON.stringify({ type: 'header', pid: 4242, tracer_self_ms: 1.5, distinct: 2, calls: 3 }),
    JSON.stringify({
      type: 'statement',
      i: 0,
      text: 'UPDATE parcels SET lot_size_sqm = $1 WHERE id = $2',
      count: 2,
      rowCount: 2,
      clients: [1],
    }),
    JSON.stringify({ type: 'client', id: 1, seq: [[0, 2]] }),
  ].join('\n') + '\n';

  const META: Record<string, unknown> = {
    step: 'load_parcels',
    chain: 'sources',
    source_fingerprint: 'sha256:deadbeefcafe',
    git_head: 'a'.repeat(40),
    wall_ms: 123,
  };

  function fixture(): { dir: string; outPath: string } {
    const dir = tmpDir('buildo-witness-');
    fs.writeFileSync(path.join(dir, '4242.ndjson'), NDJSON);
    return { dir, outPath: path.join(dir, 'post', 'sources.json') };
  }

  it('RED: writes <out dir>/sources.trace.json as 2-space JSON with a trailing newline', async () => {
    const { dir, outPath } = fixture();
    const { trace, tracePath } = await H.writeTraceFromDir({
      traceDir: dir,
      pool: catalogPool(),
      meta: META,
      outPath,
    });

    expect(tracePath).toBe(path.join(dir, 'post', 'sources.trace.json'));
    expect(fs.existsSync(tracePath)).toBe(true);
    const raw = fs.readFileSync(tracePath, 'utf8');
    expect(raw.endsWith('}\n')).toBe(true);
    expect(raw).toContain('\n  "trace_version"');
    expect(JSON.parse(raw)).toEqual(trace);
  });

  it('RED: the UPDATE witnesses parcels.lot_size_sqm as a write and copies source_fingerprint from meta', async () => {
    const { dir, outPath } = fixture();
    const { trace } = await H.writeTraceFromDir({
      traceDir: dir,
      pool: catalogPool(),
      meta: META,
      outPath,
    });

    expect(trace.touched.writes.parcels).toEqual(['lot_size_sqm']);
    expect(trace.touched.reads.parcels).toEqual(expect.arrayContaining(['id']));
    expect(trace.source_fingerprint).toBe('sha256:deadbeefcafe');
    expect(trace.step).toBe('load_parcels');
    expect(trace.chain).toBe('sources');
    expect(trace.statements.some((s) => s.kind === 'write' && s.error === null)).toBe(true);
  });

  it('GREEN control: a trace directory with no NDJSON still assembles an empty trace', async () => {
    const dir = tmpDir('buildo-witness-empty-');
    const outPath = path.join(dir, 'post', 'sources.json');
    const { trace, tracePath } = await H.writeTraceFromDir({
      traceDir: dir,
      pool: catalogPool(),
      meta: META,
      outPath,
    });

    expect(fs.existsSync(tracePath)).toBe(true);
    expect(trace.statements).toEqual([]);
    expect(trace.touched.writes).toEqual({});
  });
});

describe('sql-witness harness — canary 10 (contract: the harness prints NOTHING, ever)', () => {
  it('RED canary 10: writeTraceFromDir writes zero bytes to process.stdout', async () => {
    const dir = tmpDir('buildo-witness-silent-');
    fs.writeFileSync(
      path.join(dir, '1.ndjson'),
      [
        JSON.stringify({ type: 'header', pid: 1, tracer_self_ms: 0, distinct: 1, calls: 1 }),
        JSON.stringify({
          type: 'statement',
          i: 0,
          text: 'UPDATE parcels SET lot_size_sqm = $1 WHERE id = $2',
          count: 1,
          rowCount: 1,
          clients: [1],
        }),
        JSON.stringify({ type: 'client', id: 1, seq: [[0, 1]] }),
      ].join('\n') + '\n',
    );
    const outPath = path.join(dir, 'post', 'sources.json');

    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    let outN = 0;
    try {
      await H.writeTraceFromDir({ traceDir: dir, pool: catalogPool(), meta: { step: 'load_parcels' }, outPath });
      // Read the count BEFORE restoring: mockRestore() clears the call record.
      outN = outSpy.mock.calls.length;
    } finally {
      outSpy.mockRestore();
    }

    expect(outN).toBe(0);
  });

  it('GREEN control canary 10: the spy mechanism does observe a deliberate write (proves the assertion is live)', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    let n = 0;
    try {
      process.stdout.write('probe');
      n = spy.mock.calls.length;
    } finally {
      spy.mockRestore();
    }
    expect(n).toBe(1);
  });
});

describe('sql-witness harness — the catalog may be passed in, and canary 9 (contract: no pool when catalog given; empty tables fall back to the trace)', () => {
  // The catalog object a caller can hand over instead of letting the harness
  // snapshot the DB. Same shape as snapshotCatalog() returns and as the pool
  // control fixtures produce, so the pool-based test above stays the control.
  const CATALOG: Record<string, string[]> = {
    parcels: ['id', 'lot_size_sqm', 'parcel_id'],
    permits: ['id'],
    pipeline_runs: ['pipeline', 'records_meta'],
  };

  // A read of a NON-witnessed table (pipeline_runs) plus a write of parcels:
  // only a catalog containing pipeline_runs can witness the read, so this
  // fixture proves the supplied catalog was the one consulted.
  const NOTES_META: Record<string, unknown> = {
    step: 'load_permits',
    chain: 'sources',
    source_fingerprint: 'sha256:feedfacecafe',
    git_head: 'b'.repeat(40),
    wall_ms: 321,
  };

  const WRITE_LINE = 'UPDATE permits SET id = $1 WHERE id = $2';

  const NDJSON = [
    JSON.stringify({ type: 'header', pid: 9001, tracer_self_ms: 0.5, distinct: 2, calls: 2 }),
    JSON.stringify({
      type: 'statement',
      i: 0,
      text: WRITE_LINE,
      count: 1,
      rowCount: 1,
      clients: [1],
    }),
    JSON.stringify({
      type: 'statement',
      i: 1,
      text: 'SELECT records_meta FROM pipeline_runs WHERE pipeline = $1',
      count: 1,
      rowCount: 1,
      clients: [1],
    }),
    JSON.stringify({
      type: 'client',
      id: 1,
      seq: [
        [0, 1],
        [1, 1],
      ],
    }),
  ].join('\n') + '\n';

  function fixture(): { dir: string; outPath: string } {
    const dir = tmpDir('buildo-witness-catalog-');
    fs.writeFileSync(path.join(dir, '9001.ndjson'), NDJSON);
    return { dir, outPath: path.join(dir, 'post', 'permits.json') };
  }

  // A pool that records calls and would blow up on ANY query: if the harness
  // consults it despite a supplied catalog, the test fails for that reason.
  let poolCalls: number;
  function forbiddenPool(): FakePool {
    return {
      query: async (sql: string) => {
        poolCalls += 1;
        throw new Error(`pool must not be queried when a catalog is given: ${String(sql).slice(0, 60)}`);
      },
    };
  }

  beforeEach(() => {
    poolCalls = 0;
  });

  it('RED: a caller-supplied catalog resolves touched.writes/reads with no pool involved', async () => {
    const { dir, outPath } = fixture();
    const { trace, tracePath } = await H.writeTraceFromDir({
      traceDir: dir,
      catalog: CATALOG,
      meta: NOTES_META,
      outPath,
    });

    expect(poolCalls).toBe(0);
    expect(tracePath).toBe(path.join(dir, 'post', 'permits.trace.json'));
    expect(trace.touched.writes.permits).toEqual(['id']);
    // pipeline_runs is RUNNER_OWNED: excluded from touched (resolve.cjs contract),
    // visible only in the statement's `excluded` list.
    expect(trace.touched.reads.pipeline_runs).toBeUndefined();
    expect(trace.statements.some((s: { excluded?: string[] }) => (s.excluded ?? []).includes('pipeline_runs'))).toBe(true);
    expect(fs.existsSync(tracePath)).toBe(true);
    expect(trace.source_fingerprint).toBe('sha256:feedfacecafe');
  });

  it('RED: a catalog column absent from the trace leaves that table unwitnessed (catalog is authoritative)', async () => {
    const { dir, outPath } = fixture();
    const sparse: Record<string, string[]> = { permits: ['id'] };
    const { trace } = await H.writeTraceFromDir({
      traceDir: dir,
      catalog: sparse,
      meta: NOTES_META,
      outPath,
    });

    // No pipeline_runs key in the catalog → no read witness for it at all.
    expect(poolCalls).toBe(0);
    expect(trace.touched.writes.permits).toEqual(['id']);
    expect(trace.touched.reads.pipeline_runs).toBeUndefined();
  });

  it('GREEN control: the pool snapshot and the equivalent catalog object yield the same witnesses', async () => {
    const { dir, outPath } = fixture();
    const viaPool = await H.writeTraceFromDir({
      traceDir: dir,
      pool: catalogPool(),
      meta: NOTES_META,
      outPath,
    });
    const viaCatalog = await H.writeTraceFromDir({
      traceDir: dir,
      catalog: CATALOG,
      meta: NOTES_META,
      outPath,
    });

    expect(poolCalls).toBe(0);
    expect(viaCatalog.trace.touched).toEqual(viaPool.trace.touched);
    expect(viaCatalog.trace.statements).toEqual(viaPool.trace.statements);
  });

  it('RED canary 9: empty tables with source none fall back to the trace\'s sorted written tables', async () => {
    const { dir, outPath } = fixture();
    const { trace } = await H.writeTraceFromDir({
      traceDir: dir,
      catalog: CATALOG,
      meta: NOTES_META,
      outPath,
    });

    const out = H.tablesFromTraceIfNone({ tables: [], source: 'none', trace });
    expect(out).toEqual({ tables: ['permits'], source: 'trace' });
  });

  it('GREEN control canary 9: a non-empty table list is returned unchanged with its source', () => {
    const out = H.tablesFromTraceIfNone({ tables: ['x'], source: 'none', trace: {} as TraceDoc });
    expect(out).toEqual({ tables: ['x'], source: 'none' });
  });

  it('RED canary 9: a descriptor source and an arg source are returned unchanged', async () => {
    const { dir, outPath } = fixture();
    const { trace } = await H.writeTraceFromDir({
      traceDir: dir,
      catalog: CATALOG,
      meta: NOTES_META,
      outPath,
    });

    const descriptor = H.tablesFromTraceIfNone({ tables: ['x'], source: 'descriptor', trace });
    expect(descriptor).toEqual({ tables: ['x'], source: 'descriptor' });

    const arg = H.tablesFromTraceIfNone({ tables: ['x'], source: 'arg', trace });
    expect(arg).toEqual({ tables: ['x'], source: 'arg' });
  });
});
