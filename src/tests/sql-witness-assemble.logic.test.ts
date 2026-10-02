// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (Phase 1 WITNESS, P1-C3b trace assembly)
// Plan: .cursor/wf2_registry_truth_active_task.md PHASE 1 (WITNESS)
//
// RED-first lock for scripts/lib/sql-witness/assemble.cjs (brief p1c3b1).
// The assembly harness is created by the sibling brief p1c3b2, so this file is
// RED today: the module is missing (or incomplete). Every RED carries a GREEN
// control proving the same assertion shape can pass on a sibling input once the
// module exists.
//
// Input shape it must consume (the tracer's NDJSON, see
// .cursor/engine-briefs/p1c3a-contract.md): per-pid files, each with a
// `{"type":"header", pid, tracer_self_ms, distinct, calls}` line, one
// `{"type":"statement", i, text, count, rowCount, clients, params?, error?}`
// line per distinct text, and one `{"type":"client", id, seq}[]` line per
// client. Output shape: .cursor/engine-briefs/p1c3-trace-format.md.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';

type StatementOut = {
  fingerprint: string;
  kind: 'read' | 'write' | 'utility';
  count: number;
  rowCount: number;
  reads: Record<string, string[]>;
  writes: Record<string, string[]>;
  excluded: string[];
  error: string | null;
  text?: string;
  params?: unknown[];
};

type TraceDoc = {
  trace_version: number;
  step: string;
  chain: string;
  source_fingerprint: string | null;
  git_head: string;
  header: {
    processes: number;
    calls: number;
    distinct: number;
    utility: number;
    tracer_self_ms: number;
    wall_ms: number;
  };
  statements: StatementOut[];
  transactions: Array<{ client: string; write_fingerprints: string[] }>;
  autocommit_writes: string[];
  touched: {
    reads: Record<string, string[]>;
    writes: Record<string, string[]>;
  };
  errors: string[];
};

type AssembleModule = {
  assembleTrace: (input: {
    ndjsonTexts: string[];
    catalog: Record<string, string[]>;
    meta: {
      step: string;
      chain: string;
      source_fingerprint: string | null;
      git_head: string;
      wall_ms: number;
    };
  }) => Promise<TraceDoc>;
  tracePathFor: (goldenOutPath: string) => string;
  preTablesFromTrace: (trace: TraceDoc) => string[];
};

// Loaded lazily inside beforeAll (error re-thrown per test in beforeEach) so a
// missing module turns every test RED (per-test failed assertionResults)
// instead of failing the file with 0 tests.
let A: AssembleModule;

// Catalog fixture (information_schema.columns snapshot shape).
const CAT: Record<string, string[]> = {
  parcels: ['id', 'parcel_id', 'lot_size_sqm'],
  permits: ['id', 'status'],
};

const META = {
  step: 'scripts/load-parcels.js',
  chain: 'sources',
  source_fingerprint: 'fp-abc123',
  git_head: 'deadbeefcafe',
  wall_ms: 987654,
};

let loadError: unknown = null;
beforeAll(async () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    A = require(
      path.join(process.cwd(), 'scripts/lib/sql-witness/assemble.cjs'),
    ) as AssembleModule;
  } catch (err) {
    loadError = err;
  }
});
beforeEach(() => {
  if (loadError) throw loadError;
});

// ---------------------------------------------------------------------------
// NDJSON fixture builders — mirror exactly what trace-preload.cjs flushes.
// ---------------------------------------------------------------------------

/** One `statement` line, index `i`. */
function stmt(i: number, entry: Record<string, unknown>): Record<string, unknown> {
  return { type: 'statement', i, ...entry };
}

/** One `client` line. `seq` is an ordered run-length list of [textIndex, repeat]. */
function client(id: number, seq: Array<[number, number]>): Record<string, unknown> {
  return { type: 'client', id, seq };
}

/** A `header` line. */
function header(
  pid: number,
  tracerSelfMs: number,
  distinct: number,
  calls: number,
): Record<string, unknown> {
  return { type: 'header', pid, tracer_self_ms: tracerSelfMs, distinct, calls };
}

/** Join NDJSON lines into a file body (trailing newline, as the tracer writes). */
function ndjson(lines: Array<Record<string, unknown>>): string {
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
}

const sorted = (xs: string[]): string[] => [...xs].sort();
const keys = (m: Record<string, string[]>): string[] => Object.keys(m).sort();

const UPDATE = 'UPDATE parcels SET lot_size_sqm = $1 WHERE id = $2';
const SELECT_PERMITS = 'SELECT id FROM permits';
const PIPELINE_RUNS = 'SELECT records_meta FROM pipeline_runs WHERE pipeline = $1';
const BEGIN = 'BEGIN';
const COMMIT = 'COMMIT';

// The canonical single-pid fixture: BEGIN; UPDATE ×3; COMMIT; SELECT.
// Text indexes: 0=BEGIN, 1=UPDATE, 2=COMMIT, 3=SELECT permits.
function onePidLines(): Array<Record<string, unknown>> {
  return [
    header(4242, 11.5, 4, 6),
    stmt(0, { text: BEGIN, count: 1, rowCount: 0, clients: [1] }),
    stmt(1, { text: UPDATE, count: 3, rowCount: 3, clients: [1] }),
    stmt(2, { text: COMMIT, count: 1, rowCount: 0, clients: [1] }),
    stmt(3, { text: SELECT_PERMITS, count: 1, rowCount: 1, clients: [1] }),
    client(1, [
      [0, 1],
      [1, 3],
      [2, 1],
      [3, 1],
    ]),
  ];
}

describe('sql-witness assemble — one pid, one BEGIN..COMMIT write + one read (contract: merge, classify, touch)', () => {
  it('RED: assembleTrace produces the exact statement/transaction/touch shape for one pid', async () => {
    const trace = await A.assembleTrace({
      ndjsonTexts: [ndjson(onePidLines())],
      catalog: CAT,
      meta: META,
    });

    // Exactly one write statement, counted 3, rowCount 3, writes parcels.lot_size_sqm.
    const writes = trace.statements.filter((s) => s.kind === 'write');
    expect(writes).toHaveLength(1);
    expect(writes[0]!.count).toBe(3);
    expect(writes[0]!.rowCount).toBe(3);
    expect(writes[0]!.writes).toEqual({ parcels: ['lot_size_sqm'] });

    // Exactly one read statement.
    const reads = trace.statements.filter((s) => s.kind === 'read');
    expect(reads).toHaveLength(1);

    // The two utility statements (BEGIN + COMMIT) are counted in header.utility.
    expect(trace.header.utility).toBe(2);

    // One transactional block containing that write's fingerprint.
    expect(trace.transactions).toHaveLength(1);
    expect(trace.transactions[0]!.write_fingerprints).toEqual([writes[0]!.fingerprint]);

    // The write happened inside a transaction, so nothing autocommits.
    expect(trace.autocommit_writes).toEqual([]);

    // Union of touched writes is exactly parcels.lot_size_sqm.
    expect(trace.touched.writes).toEqual({ parcels: ['lot_size_sqm'] });

    // Touched reads include both the guarded UPDATE column and the SELECT.
    expect(trace.touched.reads.parcels).toEqual(
      expect.arrayContaining(['id', 'lot_size_sqm']),
    );
    expect(trace.touched.reads.permits).toEqual(['id']);
  });

  it('GREEN control: the same fixture yields a non-empty statements array (module reaches the shape)', async () => {
    const trace = await A.assembleTrace({
      ndjsonTexts: [ndjson(onePidLines())],
      catalog: CAT,
      meta: META,
    });
    expect(Array.isArray(trace.statements)).toBe(true);
    expect(trace.statements.length).toBeGreaterThan(0);
  });
});

describe('sql-witness assemble — same statement text across two pids merges (contract: per-distinct-text merge)', () => {
  it('RED: two pids running the same UPDATE merge into one statement with summed counts', async () => {
    const fileA = ndjson([
      header(1001, 1.25, 1, 2),
      stmt(0, { text: UPDATE, count: 2, rowCount: 2, clients: [1] }),
      client(1, [[0, 2]]),
    ]);
    const fileB = ndjson([
      header(1002, 2.5, 1, 3),
      stmt(0, { text: UPDATE, count: 3, rowCount: 3, clients: [1] }),
      client(1, [[0, 3]]),
    ]);

    const trace = await A.assembleTrace({
      ndjsonTexts: [fileA, fileB],
      catalog: CAT,
      meta: META,
    });

    // One distinct fingerprint, count summed across processes.
    const writes = trace.statements.filter((s) => s.kind === 'write');
    expect(writes).toHaveLength(1);
    expect(writes[0]!.count).toBe(5);
    expect(trace.header.processes).toBe(2);
  });

  it('GREEN control: the merged fingerprint is stable and non-empty', async () => {
    const fileA = ndjson([
      header(1001, 1.25, 1, 2),
      stmt(0, { text: UPDATE, count: 2, rowCount: 2, clients: [1] }),
      client(1, [[0, 2]]),
    ]);
    const fileB = ndjson([
      header(1002, 2.5, 1, 3),
      stmt(0, { text: UPDATE, count: 3, rowCount: 3, clients: [1] }),
      client(1, [[0, 3]]),
    ]);
    const trace = await A.assembleTrace({
      ndjsonTexts: [fileA, fileB],
      catalog: CAT,
      meta: META,
    });
    expect(trace.statements).toHaveLength(1);
    expect(typeof trace.statements[0]!.fingerprint).toBe('string');
    expect(trace.statements[0]!.fingerprint.length).toBeGreaterThan(0);
  });
});

describe('sql-witness assemble — a write with no BEGIN before it is an autocommit write (contract: autocommit_writes)', () => {
  it('RED: a bare UPDATE with no surrounding BEGIN lands in autocommit_writes', async () => {
    const trace = await A.assembleTrace({
      ndjsonTexts: [
        ndjson([
          header(2001, 0.5, 1, 1),
          stmt(0, { text: UPDATE, count: 1, rowCount: 1, clients: [1] }),
          client(1, [[0, 1]]),
        ]),
      ],
      catalog: CAT,
      meta: META,
    });

    const writes = trace.statements.filter((s) => s.kind === 'write');
    expect(writes).toHaveLength(1);
    expect(trace.autocommit_writes).toEqual([writes[0]!.fingerprint]);
    expect(trace.transactions).toEqual([]);
  });

  it('GREEN control: nothing autocommits when the write is wrapped in BEGIN..COMMIT', async () => {
    const trace = await A.assembleTrace({
      ndjsonTexts: [ndjson(onePidLines())],
      catalog: CAT,
      meta: META,
    });
    expect(trace.autocommit_writes).toEqual([]);
  });
});

describe('sql-witness assemble — two BEGIN..COMMIT blocks on one client (contract: one transaction per write block)', () => {
  it('RED: two BEGIN..COMMIT blocks with writes yield two transactions', async () => {
    // Text indexes: 0=BEGIN, 1=UPDATE, 2=COMMIT.
    const trace = await A.assembleTrace({
      ndjsonTexts: [
        ndjson([
          header(3001, 3.75, 3, 4),
          stmt(0, { text: BEGIN, count: 2, rowCount: 0, clients: [1] }),
          stmt(1, { text: UPDATE, count: 2, rowCount: 2, clients: [1] }),
          stmt(2, { text: COMMIT, count: 2, rowCount: 0, clients: [1] }),
          client(1, [
            [0, 1],
            [1, 1],
            [2, 1],
            [0, 1],
            [1, 1],
            [2, 1],
          ]),
        ]),
      ],
      catalog: CAT,
      meta: META,
    });

    expect(trace.transactions).toHaveLength(2);
    for (const tx of trace.transactions) {
      expect(tx.write_fingerprints).toHaveLength(1);
    }
    expect(trace.autocommit_writes).toEqual([]);
  });

  it('GREEN control: a single BEGIN..COMMIT block yields one transaction', async () => {
    const trace = await A.assembleTrace({
      ndjsonTexts: [ndjson(onePidLines())],
      catalog: CAT,
      meta: META,
    });
    expect(trace.transactions).toHaveLength(1);
  });
});

describe('sql-witness assemble — pipeline_runs is excluded but keeps text/params (contract: PRODUCER witness)', () => {
  it('RED: a pipeline_runs read keeps text+params, is excluded, and no other statement has a text key', async () => {
    const trace = await A.assembleTrace({
      ndjsonTexts: [
        ndjson([
          header(4001, 0.25, 2, 2),
          stmt(0, {
            text: PIPELINE_RUNS,
            count: 1,
            rowCount: 1,
            clients: [1],
            params: [['load_parcels']],
          }),
          stmt(1, { text: SELECT_PERMITS, count: 1, rowCount: 1, clients: [1] }),
          client(1, [
            [0, 1],
            [1, 1],
          ]),
        ]),
      ],
      catalog: CAT,
      meta: META,
    });

    const prStmt = trace.statements.find((s) => s.excluded.includes('pipeline_runs'));
    expect(prStmt).toBeDefined();
    expect(typeof prStmt!.text).toBe('string');
    expect(prStmt!.text).toBe(PIPELINE_RUNS);
    expect(prStmt!.params).toEqual([['load_parcels']]);

    // Every OTHER statement must carry no `text` key at all (PRODUCER check is
    // scoped to pipeline_runs statements).
    for (const s of trace.statements) {
      if (s === prStmt) continue;
      expect('text' in s).toBe(false);
    }
  });

  it('GREEN control: a non-runner statement carries an empty excluded list', async () => {
    const trace = await A.assembleTrace({
      ndjsonTexts: [ndjson(onePidLines())],
      catalog: CAT,
      meta: META,
    });
    const selects = trace.statements.filter((s) => s.kind === 'read');
    expect(selects).toHaveLength(1);
    expect(selects[0]!.excluded).toEqual([]);
  });
});

describe('sql-witness assemble — unparseable SQL is a FAIL:INPUT:parse error, never a throw (contract: errors)', () => {
  it('RED: an unparseable statement yields a FAIL:INPUT:parse errors entry and assembly resolves', async () => {
    const trace = await A.assembleTrace({
      ndjsonTexts: [
        ndjson([
          header(5001, 0.1, 1, 1),
          stmt(0, { text: 'SELEC id FRM x', count: 1, rowCount: 0, clients: [1] }),
          client(1, [[0, 1]]),
        ]),
      ],
      catalog: CAT,
      meta: META,
    });

    expect(trace.errors.some((e) => e.startsWith('FAIL:INPUT:parse:'))).toBe(true);
  });

  it('GREEN control: valid SQL produces no errors entries', async () => {
    const trace = await A.assembleTrace({
      ndjsonTexts: [ndjson(onePidLines())],
      catalog: CAT,
      meta: META,
    });
    expect(trace.errors).toEqual([]);
  });
});

describe('sql-witness assemble — a tracer FAIL:INPUT:no-text entry is carried through (contract: errors passthrough)', () => {
  it('RED: a statement with error FAIL:INPUT:no-text lands in errors', async () => {
    const trace = await A.assembleTrace({
      ndjsonTexts: [
        ndjson([
          header(6001, 0.2, 1, 1),
          stmt(0, {
            text: '\u0000NO_TEXT',
            count: 1,
            rowCount: 0,
            clients: [1],
            error: 'FAIL:INPUT:no-text',
          }),
          client(1, [[0, 1]]),
        ]),
      ],
      catalog: CAT,
      meta: META,
    });

    expect(trace.errors).toContain('FAIL:INPUT:no-text');
  });

  it('GREEN control: an error-free tracer file yields no errors', async () => {
    const trace = await A.assembleTrace({
      ndjsonTexts: [
        ndjson([
          header(6002, 0.2, 1, 1),
          stmt(0, { text: SELECT_PERMITS, count: 1, rowCount: 1, clients: [1] }),
          client(1, [[0, 1]]),
        ]),
      ],
      catalog: CAT,
      meta: META,
    });
    expect(trace.errors).toEqual([]);
  });
});

describe('sql-witness assemble — header copies meta and sums tracer_self_ms (contract: header/meta/trace_version)', () => {
  it('RED: header carries meta fields, sums tracer_self_ms over pids, and trace_version is 1', async () => {
    const fileA = ndjson([
      header(7001, 10.5, 1, 1),
      stmt(0, { text: BEGIN, count: 1, rowCount: 0, clients: [1] }),
      client(1, [[0, 1]]),
    ]);
    const fileB = ndjson([
      header(7002, 2.25, 1, 1),
      stmt(0, { text: BEGIN, count: 1, rowCount: 0, clients: [1] }),
      client(1, [[0, 1]]),
    ]);

    const trace = await A.assembleTrace({
      ndjsonTexts: [fileA, fileB],
      catalog: CAT,
      meta: META,
    });

    expect(trace.trace_version).toBe(1);
    expect(trace.source_fingerprint).toBe(META.source_fingerprint);
    expect(trace.git_head).toBe(META.git_head);
    expect(trace.step).toBe(META.step);
    expect(trace.chain).toBe(META.chain);
    expect(trace.header.wall_ms).toBe(META.wall_ms);
    expect(trace.header.tracer_self_ms).toBeCloseTo(12.75, 3);
  });

  it('GREEN control: a chain of "none" is copied verbatim (null source_fingerprint allowed)', async () => {
    const trace = await A.assembleTrace({
      ndjsonTexts: [
        ndjson([
          header(7003, 1, 1, 1),
          stmt(0, { text: BEGIN, count: 1, rowCount: 0, clients: [1] }),
          client(1, [[0, 1]]),
        ]),
      ],
      catalog: CAT,
      meta: { ...META, chain: 'none', source_fingerprint: null },
    });
    expect(trace.chain).toBe('none');
    expect(trace.source_fingerprint).toBeNull();
  });
});

describe('sql-witness assemble — tracePathFor maps a golden path into the witness tree (contract: traces outside golden dirs)', () => {
  it('RED: a golden path maps into docs/reports/witness/, never back into the golden dir', () => {
    const out = A.tracePathFor(
      path.join('docs', 'reports', 'golden', 'parcels', 'post', 'sources.json'),
    );
    expect(out).toBe(
      path.join('docs', 'reports', 'witness', 'parcels', 'post', 'sources.trace.json'),
    );
    // LOCK: every golden reader lists `*.json`; a trace inside the golden tree
    // would be misread as a capture, so the mapped path must never contain it.
    expect(out.replace(/\\/g, '/')).not.toContain('reports/golden');
  });

  it('GREEN control: a standalone.json golden maps into the witness tree', () => {
    const out = A.tracePathFor(
      path.join('docs', 'reports', 'golden', 'parcels', 'pre', 'standalone.json'),
    );
    expect(out).toBe(
      path.join('docs', 'reports', 'witness', 'parcels', 'pre', 'standalone.trace.json'),
    );
    expect(out.replace(/\\/g, '/')).not.toContain('reports/golden');
  });

  it('RED: a non-golden path (tmp dir) keeps the beside-the-file fallback', () => {
    const out = A.tracePathFor(path.join('/tmp', 'buildo-witness-', 'post', 'sources.json'));
    expect(out).toBe(path.join('/tmp', 'buildo-witness-', 'post', 'sources.trace.json'));
  });

  it('GREEN control: the fallback also fires for a bare filename with no directory', () => {
    expect(A.tracePathFor('standalone.json')).toBe('standalone.trace.json');
  });
});

describe('sql-witness assemble — preTablesFromTrace returns written tables sorted (contract: table-level deps)', () => {
  it('RED: preTablesFromTrace lists written tables in sorted order', async () => {
    // Build a trace that writes both parcels and permits.
    const trace = await A.assembleTrace({
      ndjsonTexts: [
        ndjson([
          header(8001, 0.4, 2, 2),
          stmt(0, { text: UPDATE, count: 1, rowCount: 1, clients: [1] }),
          stmt(1, {
            text: 'UPDATE permits SET status = $1 WHERE id = $2',
            count: 1,
            rowCount: 1,
            clients: [1],
          }),
          client(1, [
            [0, 1],
            [1, 1],
          ]),
        ]),
      ],
      catalog: CAT,
      meta: META,
    });

    expect(keys(trace.touched.writes)).toEqual(sorted(['parcels', 'permits']));
    expect(A.preTablesFromTrace(trace)).toEqual(sorted(['parcels', 'permits']));
  });

  it('GREEN control: a single written table is returned alone', async () => {
    const trace = await A.assembleTrace({
      ndjsonTexts: [ndjson(onePidLines())],
      catalog: CAT,
      meta: META,
    });
    expect(A.preTablesFromTrace(trace)).toEqual(['parcels']);
  });
});

// ── WF3 witness-unblock C2 — session temp tables (shared by the two describes below) ──
const TCAT: Record<string, string[]> = {
  parcels: ['id', 'parcel_id', 'geom', 'centreline_id'], toronto_centreline: ['centreline_id', 'geom'], permits: ['id', 'status'],
};
const CTAS = 'CREATE TEMP TABLE tmp_x ON COMMIT DROP AS SELECT p.parcel_id, c.centreline_id FROM parcels p JOIN toronto_centreline c ON ST_DWithin(p.geom, c.geom, 50)';
const UPD = 'UPDATE parcels p SET centreline_id = e.centreline_id FROM tmp_x e WHERE p.parcel_id = e.parcel_id';
const TALLY = 'SELECT COUNT(*) FROM tmp_x';
const pidFile = (pid: number, texts: string[]): string => ndjson([
  header(pid, 0, texts.length, texts.length),
  ...texts.map((text, i) => stmt(i, { text, count: 1, rowCount: 1, clients: [1] })),
  client(1, texts.map((_, i) => [i, 1] as [number, number])),
]);
const assembleTemp = (files: string[]): Promise<TraceDoc> => A.assembleTrace({ ndjsonTexts: files, catalog: TCAT, meta: META });
const DESC = {
  inputs: { reads: { tables: [{ table: 'parcels', columns: ['parcel_id', 'geom'] }, { table: 'toronto_centreline', columns: ['centreline_id', 'geom'] }] } },
  outputs: { writes: [{ table: 'parcels', columns: [{ name: 'centreline_id' }] }], write_inventory: { statements: 1 } },
  execution: { txn_scope: 'step' },
};
async function gateRows(trace: TraceDoc): Promise<string[]> {
  const { pathToFileURL } = await import('url');
  const G = await import(pathToFileURL(path.join(process.cwd(), 'scripts/analysis/gates/witness.mjs')).href);
  return G.evaluateWitness({ slug: 'fx', descriptor: DESC, status: 'pending', currentFingerprint: META.source_fingerprint,
    postTraces: { fx: trace }, preTraces: {}, explainedDiffs: [] }).rows;
}

describe('sql-witness assemble — session temp tables bind per pid (WF3 C2: R7, C-a, C-b)', () => {
  it('R7 RED: temp CTAS + UPDATE … FROM temp + tally → no tmp_x anywhere, one write fingerprint, gate PASS', async () => {
    const t = await assembleTemp([pidFile(1, ['BEGIN', CTAS, UPD, TALLY, 'COMMIT'])]);
    expect(keys(t.touched.reads)).not.toContain('tmp_x');
    expect(keys(t.touched.writes)).not.toContain('tmp_x');
    expect(t.statements.filter((s) => s.kind === 'write').length).toBe(1);
    expect(await gateRows(t)).toEqual([]);
  });
  it('C-a GREEN control: a non-temp CTAS still writes its target', async () => {
    const t = await assembleTemp([pidFile(1, ['CREATE TABLE parcels_copy AS SELECT id FROM permits'])]);
    expect(keys(t.touched.writes)).toContain('parcels_copy');
  });
  it('C-b canary: tmp_x read in a pid that never created it is still a:tmp_x.*', async () => {
    const t = await assembleTemp([pidFile(1, ['BEGIN', CTAS, UPD, 'COMMIT']), pidFile(2, [TALLY])]);
    expect(await gateRows(t)).toContain('FAIL:WITNESS:fx:a:tmp_x.*');
  });
});

describe('sql-witness assemble — temp shadows and the temp rule (WF3 C2: C-c, R16)', () => {
  it('C-c RED: CREATE TEMP TABLE parcels (shadows a catalog table) → FAIL:INPUT:temp-shadows, never exempt', async () => {
    const t = await assembleTemp([pidFile(1, ['CREATE TEMP TABLE parcels AS SELECT id FROM permits', 'UPDATE parcels SET centreline_id = 1'])]);
    expect(t.errors).toContain('FAIL:INPUT:temp-shadows:parcels');
    expect(t.touched.writes.parcels).toContain('centreline_id');
  });
  it('R16 RED: a schema-qualified shadow (public.parcels) is temp-shadows too', async () => {
    const t = await assembleTemp([pidFile(1, ['CREATE TEMP TABLE public.parcels AS SELECT id FROM permits'])]);
    expect(t.errors).toContain('FAIL:INPUT:temp-shadows:parcels');
  });
  it('R16 RED: CREATE TABLE pg_temp.x AS … is a temp; a later SELECT … FROM x in the same pid gives no a:x.* row', async () => {
    const t = await assembleTemp([pidFile(1, ['CREATE TABLE pg_temp.x AS SELECT id FROM permits', 'SELECT id FROM x'])]);
    expect(keys(t.touched.writes)).not.toContain('x');
    expect(await gateRows(t)).not.toContain('FAIL:WITNESS:fx:a:x.*');
  });
  it('R16 GREEN control: CREATE TEMP TABLE … (LIKE …) stays utility', async () => {
    const t = await assembleTemp([pidFile(1, ['CREATE TEMP TABLE tmp_y (LIKE parcels)'])]);
    expect(t.statements.map((s) => s.kind)).toEqual(['utility']);
  });
  it('R16 GREEN control: the fingerprint is whole-text, so a 2-write text is ONE write fingerprint', async () => {
    const t = await assembleTemp([pidFile(1, ["UPDATE parcels SET centreline_id = 1 WHERE id = 1; UPDATE permits SET status = 'x' WHERE id = 2"])]);
    expect(t.statements.filter((s) => s.kind === 'write').length).toBe(1);
    expect(keys(t.touched.writes)).toEqual(['parcels', 'permits']);
  });
});
