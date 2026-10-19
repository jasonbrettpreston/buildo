// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-CX — CP-S5 catalog / SRID probe; R-BZ G3/G8, C3; Rule 10)
//
// CP-S5 (2026-10-16). A catalog fact a compute depends on is a RUNNER-OWNED probe:
//   S5-a  `guards.requires {kind:"srid", name:"<table>.<column>", equals:<int>}` is probed by
//         REQUIREMENT_PROBES.srid (Find_SRID) before any hook — it replaces the compute
//         Find_SRID read + SRID throw in enrich_heritage / enrich_ravines.
//   S5-b  `ctx.catalog` (scripts/lib/step/catalog.js) — columnCount / columnCounts /
//         columnType, read-only, `public` only, REFUSING a table outside the step's declared
//         read set — replaces the compute `information_schema.columns` reads in
//         assert_global_coverage, refresh_snapshot and the vocab-coverage core.
//
// Locks (plan .cursor/wf2_purity_s5_active_task.md): L1 srid probe, L2 schema, L3 catalog
// refusal, L4 gate E (both directions), L5 C3 expiry, L7 refresh_snapshot failure path.
// L6 (output equality against the dev DB) is H-lane (test:db / fleet capture), not here.
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as ledger from '../../scripts/analysis/gates/ledger.mjs';
import { runnerValues } from './helpers/runner-variables';

const REPO_ROOT = process.cwd();
const TIMEOUT = 120_000;
// refresh_snapshot buildReads binds the run clock (CP-PLANA, R-CY); any fixed instant serves here.
const RUN_AT = new Date("2026-10-16T12:00:00Z");

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library + JSON */
const runner = require(path.join(REPO_ROOT, 'scripts/lib/step/index.js')) as {
  assertRequirements: (pool: unknown, descriptor: unknown, opts: { log: unknown; tag: string }) => Promise<Record<string, boolean>>;
  probeRequirement: (pool: unknown, r: unknown, d?: unknown) => Promise<{ present: boolean; detail: string }>;
  runEnrichPhase: (args: Record<string, unknown>) => Promise<unknown>;
  runRecorderPhase: (args: Record<string, unknown>) => Promise<{ writeSkipped: boolean }>;
  REQUIREMENT_PROBES: Record<string, { sql: string; args: (r: unknown) => unknown[] }>;
};
const { compileStepSchema } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  compileStepSchema: (schema: unknown) => ((data: unknown) => boolean) & { errors?: unknown[] | null };
};
const rsCompute = require(path.join(REPO_ROOT, 'scripts/lib/compute/refresh-snapshot.js')) as {
  buildReads: (config: Record<string, unknown>, runAt: Date | string) => { main: unknown[]; optional: Array<Record<string, unknown>> };
  buildRow: (results: Record<string, unknown>, prevRow: Record<string, unknown>, prior: unknown, config: unknown) => {
    row: Record<string, unknown>;
    matched: { optional_query_failed: string[] };
  };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const readJson = (rel: string): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const silentLog = { info: () => {}, warn: () => {}, error: () => {} };

/** The catalog module is NEW in CP-S5 — loaded lazily so the other locks still run (and fail on their own merits) before it exists. */
type Catalog = {
  columnCount: (table: string) => Promise<number>;
  columnCounts: (tables: string[]) => Promise<Record<string, number>>;
  columnType: (table: string, column: string) => Promise<string | null>;
};
type CatalogMod = {
  makeCatalog: (deps: { pool: unknown; declaredTables: Iterable<string>; tag?: string }) => Catalog;
  catalogDeclaredTables: (descriptor: unknown) => Set<string>;
};
function loadCatalog(): CatalogMod {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS module under test
  return require(path.join(REPO_ROOT, 'scripts/lib/step/catalog.js')) as CatalogMod;
}

const SRID_ROW = { kind: 'srid', name: 'parcels.geom', equals: 4326, on_missing: 'fail' };

/** A pool whose `Find_SRID('public', $1, $2) = $3` answers like Postgres for a column of SRID `actual`. */
function sridPool(actual: number | Error) {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  return {
    calls,
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (/find_srid/i.test(sql)) {
        if (actual instanceof Error) throw actual;
        return { rows: params && params[2] === actual ? [{ '?column?': 1 }] : [] };
      }
      return { rows: [{ '?column?': 1 }] };
    },
  };
}

// ---------------------------------------------------------------------------
// L1 — the srid probe (S5-a)
// ---------------------------------------------------------------------------
describe('L1 — REQUIREMENT_PROBES.srid (S5-a, Rule 10: a declared guard, not a compute halt)', () => {
  const desc = { identity: { name: 't' }, guards: { requires: [SRID_ROW] } };

  it('Find_SRID = 4326 → present; one parameterised probe (public, table, column, equals)', async () => {
    const pool = sridPool(4326);
    const measured = await runner.assertRequirements(pool, desc, { log: silentLog, tag: '[t]' });
    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0]!.sql).toMatch(/Find_SRID\('public', \$1, \$2\) = \$3/);
    expect(pool.calls[0]!.params).toEqual(['parcels', 'geom', 4326]);
    // keyed by kind:name — a srid fact never collides with a `column:parcels.geom` presence fact
    expect(measured).toEqual({ 'srid:parcels.geom': true });
  });

  it('Find_SRID = 3857 → refused BEFORE any hook: runEnrichPhase rejects and the contract hook is never called', async () => {
    const hook = vi.fn(async () => ({}));
    const pool = sridPool(3857);
    const descriptor = {
      identity: { name: 'enrich_x' },
      execution: { shape: 'enrich', enrich_hooks: { contract_read: 'readContract' } },
      guards: { requires: [SRID_ROW] },
      outputs: { writes: [{ table: 'parcels', columns: [] }] },
    };
    await expect(
      runner.runEnrichPhase({ descriptor, pool, compute: { readContract: hook }, config: {}, chainId: null, log: silentLog, tag: '[enrich_x]', clockNow: new Date() }),
    ).rejects.toThrow(/required srid "parcels\.geom" is ABSENT/);
    expect(hook).not.toHaveBeenCalled();
    expect(pool.calls).toHaveLength(1); // the probe, and nothing after it
  });

  it('a Find_SRID error (column not registered) propagates loud — never read as present', async () => {
    const pool = sridPool(new Error('find_srid() - could not find the corresponding SRID'));
    await expect(runner.assertRequirements(pool, desc, { log: silentLog, tag: '[t]' })).rejects.toThrow(/could not find the corresponding SRID/);
  });

  it('cloud:pre parity — probeRequirement answers a srid row with the SAME SQL the runner uses', async () => {
    const out = await runner.probeRequirement(sridPool(4326), SRID_ROW);
    expect(out.present).toBe(true);
    expect(out.detail).toBe(runner.REQUIREMENT_PROBES.srid!.sql);
  });
});

// ---------------------------------------------------------------------------
// L2 — schema: definitions.requirement admits kind "srid" with a required integer `equals`
// ---------------------------------------------------------------------------
describe('L2 — step.schema.json definitions.requirement kind "srid"', () => {
  const validate = compileStepSchema(readJson('scripts/steps/_schema/step.schema.json'));
  const heritage = readJson('scripts/enrich-heritage.descriptor.json');
  const withRequire = (row: Record<string, unknown>): Record<string, unknown> => {
    const d = clone(heritage) as { guards: { requires: Array<Record<string, unknown>> } };
    d.guards.requires = d.guards.requires.filter((r) => r.kind !== 'srid').concat([row]);
    return d as unknown as Record<string, unknown>;
  };
  const ok = (d: unknown): boolean => validate(d) === true;

  it('GREEN: {kind:"srid", name:"parcels.geom", equals:4326, on_missing:"fail"} is valid', () => {
    expect(ok(withRequire(SRID_ROW)), JSON.stringify(validate.errors)).toBe(true);
  });
  it('RED: kind "srid" without `equals` is invalid', () => {
    const { equals: _drop, ...noEquals } = SRID_ROW;
    void _drop;
    expect(ok(withRequire(noEquals))).toBe(false);
  });
  it('RED: a srid name with no dot (<table>.<column>) is invalid', () => {
    expect(ok(withRequire({ ...SRID_ROW, name: 'geom' }))).toBe(false);
  });
  it('RED: a non-integer `equals` is invalid, and `equals` on a non-srid kind is invalid', () => {
    expect(ok(withRequire({ ...SRID_ROW, equals: '4326' }))).toBe(false);
    expect(ok(withRequire({ kind: 'column', name: 'parcels.geom', equals: 4326, on_missing: 'fail' }))).toBe(false);
  });
  it('the two SRID consumers declare it: enrich_heritage + enrich_ravines carry the srid row and validate', () => {
    for (const rel of ['scripts/enrich-heritage.descriptor.json', 'scripts/enrich-ravines.descriptor.json']) {
      const d = readJson(rel) as { guards: { requires: Array<Record<string, unknown>> } };
      const row = d.guards.requires.find((r) => r.kind === 'srid');
      expect(row, `${rel} declares no srid requirement`).toMatchObject(SRID_ROW);
      expect(ok(d), `${rel}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// L3 — ctx.catalog refuses an undeclared table BEFORE any SQL (S5-b)
// ---------------------------------------------------------------------------
describe('L3 — scripts/lib/step/catalog.js (ctx.catalog)', () => {
  const recordingPool = (rows: Array<Record<string, unknown>>) => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    return { calls, query: async (sql: string, params?: unknown[]) => { calls.push({ sql, params }); return { rows }; } };
  };

  it('columnCount(undeclared) throws before any query (0 calls)', async () => {
    const { makeCatalog } = loadCatalog();
    const pool = recordingPool([{ cols: 3 }]);
    const cat = makeCatalog({ pool, declaredTables: ['parcels'], tag: '[t]' });
    await expect(cat.columnCount('not_declared')).rejects.toThrow(/not_declared.*not in this step's declared read set/);
    await expect(cat.columnCounts(['parcels', 'not_declared'])).rejects.toThrow(/not_declared/);
    await expect(cat.columnType('not_declared', 'x')).rejects.toThrow(/not_declared/);
    expect(pool.calls).toHaveLength(0);
  });

  it('a declared table issues exactly ONE parameterised read-only query over public information_schema.columns', async () => {
    const { makeCatalog } = loadCatalog();
    const pool = recordingPool([{ cols: '87' }]);
    const cat = makeCatalog({ pool, declaredTables: ['permits'] });
    expect(await cat.columnCount('permits')).toBe(87);
    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0]!.sql).toMatch(/^\s*SELECT\b/);
    expect(pool.calls[0]!.sql).toMatch(/information_schema\.columns/);
    expect(pool.calls[0]!.sql).toMatch(/table_schema = 'public'/);
    expect(pool.calls[0]!.params).toEqual(['permits']);
  });

  it('columnCounts → one query, a {table: n} map (absent tables omitted); columnType → data_type or null', async () => {
    const { makeCatalog } = loadCatalog();
    const pool = recordingPool([{ table_name: 'parcels', col_count: '40' }, { table_name: 'permits', col_count: 87 }]);
    const cat = makeCatalog({ pool, declaredTables: new Set(['parcels', 'permits', 'gone']) });
    expect(await cat.columnCounts(['parcels', 'permits', 'gone'])).toEqual({ parcels: 40, permits: 87 });
    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0]!.params).toEqual([['parcels', 'permits', 'gone']]);

    const tPool = recordingPool([{ data_type: 'text' }]);
    expect(await makeCatalog({ pool: tPool, declaredTables: ['parcels'] }).columnType('parcels', 'zone')).toBe('text');
    expect(tPool.calls[0]!.params).toEqual(['parcels', 'zone']);
    const nPool = recordingPool([]);
    expect(await makeCatalog({ pool: nPool, declaredTables: ['parcels'] }).columnType('parcels', 'nope')).toBeNull();
  });

  it('the declared set is inputs.reads.tables ∪ checks[].reads ∪ outputs.writes (the set gate E G2 uses)', () => {
    const { catalogDeclaredTables } = loadCatalog();
    const s = catalogDeclaredTables({
      inputs: { reads: { tables: [{ table: 'a', columns: ['x'] }] } },
      checks: [{ id: 'c', reads: [{ table: 'b', columns: ['y'] }, 'c.z'] }],
      outputs: { writes: [{ table: 'd', columns: [] }] },
    });
    expect([...s].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect([...catalogDeclaredTables({ outputs: 'none' })]).toEqual([]);
  });

  it('every catalog table a converted compute asks for is declared by its step (no live refusal)', () => {
    const { catalogDeclaredTables } = loadCatalog();
    const rs = catalogDeclaredTables(readJson('scripts/refresh-snapshot.descriptor.json'));
    const entry = rsCompute.buildReads(new Proxy({}, { get: () => 1 }), RUN_AT).optional.find((o) => o.key === 'schemaColumnCounts') as { catalog?: { tables?: string[] } };
    for (const t of entry.catalog?.tables ?? ['<no catalog entry>']) expect(rs.has(t), `refresh_snapshot does not declare ${t}`).toBe(true);
    const agc = catalogDeclaredTables(readJson('scripts/quality/assert-global-coverage.descriptor.json'));
    for (const t of ['coa_applications', 'permits']) expect(agc.has(t)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// L4 — gate E: the 8 CP-S5 sites are gone, the rows are deleted, and the reverse direction holds
// ---------------------------------------------------------------------------
describe('L4 — gate E (compute purity G3/G8) after CP-S5', () => {
  const FILES = [
    'scripts/lib/compute/enrich-heritage.js',
    'scripts/lib/compute/enrich-ravines.js',
    'scripts/lib/compute/assert-global-coverage.js',
    'scripts/lib/compute/refresh-snapshot.js',
    'scripts/lib/vocab-coverage.js',
  ];

  it('the live scan has 0 G3 and 0 G8 sites in the 5 CP-S5 files', async () => {
    const purity = await import('../../scripts/analysis/gates/compute-purity.mjs');
    const sites = (await purity.scanPurity({ repoRoot: REPO_ROOT })) as Array<{ code: string; file: string; line: number }>;
    const hits = sites.filter((s) => FILES.includes(s.file) && (s.code === 'G3' || s.code === 'G8'));
    expect(hits.map((s) => `${s.code} ${s.file}:${s.line}`)).toEqual([]);
  }, TIMEOUT);

  it('the ledger carries 0 rows closing on CP-S5', () => {
    const live = ledger.loadLedger(REPO_ROOT) as { rows: Array<Record<string, unknown>> };
    expect(live.rows.filter((r) => r.closing_brief === 'CP-S5')).toEqual([]);
  });

  it('reverse direction: the BAD_FIXTURE carries a Find_SRID read tagged G3 and the scan fires G3 (relation find_srid) on it', async () => {
    const purity = await import('../../scripts/analysis/gates/compute-purity.mjs');
    const text = fs.readFileSync(path.join(REPO_ROOT, purity.BAD_FIXTURE), 'utf8').split(/\r?\n/);
    const line = text.findIndex((l) => /find_srid\s*\(/i.test(l) && /expect:\s*G3/.test(l)) + 1;
    expect(line, 'BAD_FIXTURE has no `Find_SRID(...)  // expect: G3` line').toBeGreaterThan(0);
    const sites = (await purity.scanPurity({ repoRoot: REPO_ROOT, files: [purity.BAD_FIXTURE, purity.BAD_HELPER], entries: [purity.BAD_FIXTURE] })) as Array<{ code: string; file: string; line: number; relation?: string }>;
    expect(sites.some((s) => s.code === 'G3' && s.file === purity.BAD_FIXTURE && s.line === line && s.relation === 'find_srid')).toBe(true);
  }, TIMEOUT);
});

// ---------------------------------------------------------------------------
// L5 — R-BZ C3: CP-S5 BUILT expires any row still closing on it
// ---------------------------------------------------------------------------
describe('L5 — C3 programme expiry for CP-S5', () => {
  const items = (): Array<{ id: string; status: string }> => readJson('scripts/steps/_schema/programme-items.json').items as Array<{ id: string; status: string }>;
  const row = {
    gate: 'E', step: 'enrich-heritage', file: 'scripts/lib/compute/enrich-heritage.js',
    item: 'compute-catalog@9b97ae14cd1eaa94#1', disposition: 'pending_remediation', why: 'x',
    closing_brief: 'CP-S5', filed: '2026-10-11', adjudicated_by: 'operator',
  };

  it('CP-S5 is BUILT, so one row left closing on it is expired as item_built (RED while NOT_STARTED)', () => {
    expect(items().find((i) => i.id === 'CP-S5')?.status).toBe('BUILT');
    expect(ledger.programmeExpiry([row], items())).toEqual([
      { step: 'enrich-heritage', item: 'compute-catalog@9b97ae14cd1eaa94#1', closing_brief: 'CP-S5', reason: 'item_built' },
    ]);
  });

  it('GREEN: with 0 CP-S5 rows the live ledger expires nothing', () => {
    const live = ledger.loadLedger(REPO_ROOT) as { rows: Array<Record<string, unknown>> };
    expect(ledger.programmeExpiry(live.rows, items())).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// L7 — refresh_snapshot: a failing catalog read takes the SAME carry-forward path as a failing SQL read
// ---------------------------------------------------------------------------
describe('L7 — refresh_snapshot schemaColumnCounts through the runner-owned catalog', () => {
  const descriptor = readJson('scripts/refresh-snapshot.descriptor.json');
  const config = new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? 1 : undefined) });

  /** A pool for the whole recorder phase: every read answers [], the catalog read answers `catalog`. */
  function recorderPool(catalog: (sql: string, params?: unknown[]) => { rows: unknown[] }) {
    const answer = async (sql: string, params?: unknown[]) => {
      if (/information_schema\.columns/.test(sql)) return catalog(sql, params);
      if (/pg_backend_pid/.test(sql)) return { rows: [{ pid: 1 }] };
      return { rows: [] };
    };
    return { query: answer, connect: async () => ({ query: answer, release: () => {} }) };
  }
  async function runReads(pool: unknown, compute: unknown = rsCompute): Promise<Record<string, unknown>> {
    let captured: Record<string, unknown> | null = null;
    const out = await runner.runRecorderPhase({
      descriptor, pool, compute, config, runner: runnerValues(), chainId: null, log: silentLog, tag: '[refresh_snapshot]', clockNow: new Date(),
      preWriteGate: async ({ matched }: { matched: { results: Record<string, unknown> } }) => { captured = matched.results; return { abort: true, failed: ['probe'] }; },
    });
    expect(out.writeSkipped).toBe(true);
    return captured as unknown as Record<string, unknown>;
  }
  /** Synthetic main-read rows so buildRow can run on the captured optional results. */
  const zeroRow = new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? '0' : undefined) });
  const withMains = (r: Record<string, unknown>) => ({
    ...r, permitsScalar: [zeroRow], trades: [zeroRow], tradeByType: [zeroRow], builders: [zeroRow], parcels: [zeroRow], coa: [zeroRow], tagBreakdown: [], sync: [],
    // the other optional reads are not under test here — their rows are [] from the fake, so null them (carry-forward)
    massing: null, sla: null, inspections: null, costEst: null, coaFunnel: null,
  });

  it('compute authors no catalog SQL: the schemaColumnCounts optional read is a declared catalog op', () => {
    const entry = rsCompute.buildReads(config, RUN_AT).optional.find((o) => o.key === 'schemaColumnCounts')!;
    expect(entry.sql).toBeUndefined();
    expect(entry.catalog).toEqual({ op: 'columnCounts', tables: ['coa_applications', 'parcels', 'permit_parcels', 'permit_trades', 'permits'] });
  });

  it('a throwing catalog read → results.schemaColumnCounts null → prevRow carried forward + optional_query_failed names it', async () => {
    const results = await runReads(recorderPool(() => { throw Object.assign(new Error('catalog boom'), { code: 'XX000' }); }));
    expect(results.schemaColumnCounts).toBeNull();
    const built = rsCompute.buildRow(withMains(results), { schema_column_counts: { permits: 42 } }, null, config);
    expect(built.row.schema_column_counts).toBe(JSON.stringify({ permits: 42 }));
    expect(built.matched.optional_query_failed).toContain('schemaColumnCounts');
  });

  it('a successful catalog read → rows the unchanged buildRow folds into the same {table: n} map', async () => {
    const results = await runReads(recorderPool(() => ({ rows: [{ table_name: 'parcels', col_count: 40 }, { table_name: 'permits', col_count: '87' }] })));
    const built = rsCompute.buildRow(withMains(results), {}, null, config);
    expect(built.row.schema_column_counts).toBe(JSON.stringify({ parcels: 40, permits: 87 }));
    expect(built.matched.optional_query_failed).not.toContain('schemaColumnCounts');
  });

  it('an UNDECLARED catalog table is a defect: the run throws instead of carrying forward silently', async () => {
    const bad = {
      ...rsCompute,
      buildReads: (c: Record<string, unknown>, runAt: Date | string) => {
        const r = rsCompute.buildReads(c, runAt);
        return { ...r, optional: r.optional.map((o) => (o.key === 'schemaColumnCounts' ? { key: o.key, catalog: { op: 'columnCounts', tables: ['nope_table'] } } : o)) };
      },
    };
    await expect(runReads(recorderPool(() => ({ rows: [] })), bad)).rejects.toThrow(/nope_table/);
  });
});

// ---------------------------------------------------------------------------
// vocab-coverage core (amends R-CH): the column-type reader is an ARGUMENT
// ---------------------------------------------------------------------------
describe('vocab-coverage core takes its column-type reader as an argument (R-CX amends R-CH)', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { resolveAndCountTripleWithClient } = require(path.join(REPO_ROOT, 'scripts/lib/vocab-coverage.js')) as {
    resolveAndCountTripleWithClient: (client: unknown, t: unknown, opts?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  /* eslint-enable @typescript-eslint/no-require-imports */
  const TRIPLE = { dataTable: 'permits', dataColumn: 'status', vocabTable: 'vocab_status', vocabColumn: 'value' };

  it('the core text holds no information_schema read', () => {
    expect(fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/vocab-coverage.js'), 'utf8')).not.toMatch(/information_schema/);
  });

  it('no reader → { unresolved: "no column-type reader" }, no query, never a throw', async () => {
    const calls: string[] = [];
    const client = { query: async (sql: string) => { calls.push(sql); return { rows: [{ present: 1, vocab_size: 1 }] }; } };
    await expect(resolveAndCountTripleWithClient(client, TRIPLE, {})).resolves.toEqual({ unresolved: 'no column-type reader' });
    expect(calls).toHaveLength(0);
  });

  it('with a reader: the types come from it, the client runs only the intersection count', async () => {
    const calls: string[] = [];
    const client = { query: async (sql: string) => { calls.push(sql); return { rows: [{ present: 2, vocab_size: 5 }] }; } };
    const asked: string[] = [];
    const columnType = async (t: string, c: string) => { asked.push(`${t}.${c}`); return 'text'; };
    await expect(resolveAndCountTripleWithClient(client, TRIPLE, { columnType })).resolves.toEqual({ present: 2, vocab_size: 5 });
    expect(asked).toEqual(['permits.status', 'vocab_status.value']);
    expect(calls).toHaveLength(1);
  });

  it('a catalog REFUSAL (undeclared table) is a defect and propagates; a plain reader error degrades to "query error"', async () => {
    const client = { query: async () => ({ rows: [] }) };
    const refusal = Object.assign(new Error('[t] ctx.catalog: table "vocab_status" is not in this step\'s declared read set'), { catalogRefusal: true });
    await expect(resolveAndCountTripleWithClient(client, TRIPLE, { columnType: async () => { throw refusal; } })).rejects.toBe(refusal);
    await expect(resolveAndCountTripleWithClient(client, TRIPLE, { columnType: async () => { throw new Error('boom'); } })).resolves.toEqual({ unresolved: 'query error' });
  });
});
