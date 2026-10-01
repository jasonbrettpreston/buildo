// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (Phase 1 WITNESS, P1-C3a tracer)
// Plan: .cursor/wf2_registry_truth_active_task.md PHASE 1 item 1 (tracer, D5)
//
// RED-first lock for scripts/lib/sql-witness/trace-preload.cjs (brief p1c3a).
// The preload is created by the sibling brief p1c3b, so this file is RED today:
// the module is missing. No DB and no network are touched — `pg.Client` is
// constructed but never `.connect()`ed, and `query` is replaced by a fake
// BEFORE the preload loads (the preload wraps whatever is on the prototype).

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

type Response = { rowCount?: number; rows?: unknown[] };

type StateEntry = {
  text: string;
  count: number;
  rowCount: number;
  clients: number[];
  params?: unknown[];
  error?: string;
};

type TracerState = {
  statements: StateEntry[];
  clients: Record<string, number[][]>;
  tracer_self_ms: number;
};

type TracePreload = {
  flush: () => void;
  _reset: () => void;
  _state: () => TracerState;
};

const PRELOAD_PATH = path.join(process.cwd(), 'scripts/lib/sql-witness/trace-preload.cjs');

// Fakes must never reach the wire. A missing method is an outright failure.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pg: any;
const origQuery: unknown = undefined;
const savedEnv: Record<string, string | undefined> = {};
let traceDir = '';
let tracer: TracePreload;

// A throwing beforeEach FAILS each test (per-test failed assertionResults, gate
// K's red evidence); a throwing beforeAll alone would SKIP them. Same pattern as
// src/tests/sql-witness-resolve.logic.test.ts.
let loadError: unknown = null;

// The stream case: `query()` may receive the QueryStream/Submittable object
// itself (no wrapping config), so the return value must be the SAME object —
// the preload must not synthesise a resolved promise.
const isCursorArg = (arg0: unknown): boolean =>
  !!arg0 && typeof arg0 === 'object' && 'cursor' in (arg0 as Record<string, unknown>);

const fakeQueryFor = (arg0: unknown) =>
  (isCursorArg(arg0) ? arg0 : Promise.resolve({ rowCount: 3, rows: [] })) as unknown;

// One call site for every kind of client call the tracer must survive.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const callQuery = (client: any, arg0: unknown, arg1?: unknown) =>
  arg1 === undefined ? client.query(arg0) : client.query(arg0, arg1);

const entryFor = (text: string): StateEntry => {
  const hit = tracer._state().statements.find((s) => s.text === text);
  if (!hit) throw new Error(`no statement entry recorded for text: ${JSON.stringify(text)}`);
  return hit;
};

const readTraceLines = (): Array<Record<string, unknown>> => {
  const file = path.join(traceDir, `${process.pid}.ndjson`);
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
};

beforeAll(async () => {
  try {
    savedEnv.BUILDO_SQL_TRACE = process.env.BUILDO_SQL_TRACE;

    traceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlw-'));
    process.env.BUILDO_SQL_TRACE = traceDir;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    pg = require('pg');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require.cache[require.resolve('pg')]!.exports = pg;
    // The fake replaces the real `query` BEFORE the preload installs its
    // wrapper, so the tracer wraps the fake: its pass-through assertion is
    // `=====` the fake's own promise, not a connection result.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pg.Client.prototype as any).query = (...args: unknown[]) => fakeQueryFor(args[0]);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tracer = require(PRELOAD_PATH) as TracePreload;
  } catch (err) {
    loadError = err;
  }
});

beforeEach(() => {
  if (loadError) throw loadError;
  tracer._reset();
});

afterAll(() => {
  if (savedEnv.BUILDO_SQL_TRACE === undefined) delete process.env.BUILDO_SQL_TRACE;
  else process.env.BUILDO_SQL_TRACE = savedEnv.BUILDO_SQL_TRACE;
  if (traceDir) fs.rmSync(traceDir, { recursive: true, force: true });
});

describe('sql-witness tracer — pass-through (contract: the wrapper never alters the query result)', () => {
  it('RED: a query promise resolves to the EXACT object the underlying query returned', async () => {
    const client = new pg.Client();
    const result = await callQuery(client, 'SELECT id FROM permits');
    expect(result).toEqual({ rowCount: 3, rows: [] });
    expect((result as Response).rowCount).toBe(3);
  });

  it('RED: a streamed call (the object itself) is handed back unchanged, not promised', () => {
    const client = new pg.Client();
    const stream = { cursor: { text: 'SELECT geom FROM parcels' } };
    expect(callQuery(client, stream)).toBe(stream);
  });

  it('GREEN control: a config-style call with a plain result resolves a promise', async () => {
    const client = new pg.Client();
    const result = await callQuery(client, { text: 'SELECT 1' });
    expect(result).toEqual({ rowCount: 3, rows: [] });
  });
});

describe('sql-witness tracer — deduplication and rowCount (contract: per distinct text, summed rowCount)', () => {
  it('RED: two calls of the same text collapse to one entry with count 2 and rowCount 6', async () => {
    const client = new pg.Client();
    await callQuery(client, 'SELECT id FROM permits');
    await callQuery(client, 'SELECT id FROM permits');

    const entries = tracer._state().statements.filter((s) => s.text === 'SELECT id FROM permits');
    expect(entries.length).toBe(1);
    expect(entries[0]!.count).toBe(2);
    expect(entries[0]!.rowCount).toBe(6);
  });

  it('GREEN control: two calls of different texts stay two entries', async () => {
    const client = new pg.Client();
    await callQuery(client, 'SELECT id FROM permits');
    await callQuery(client, 'SELECT id FROM parcels');
    const texts = tracer._state().statements.map((s) => s.text);
    expect(texts).toContain('SELECT id FROM permits');
    expect(texts).toContain('SELECT id FROM parcels');
  });
});

describe('sql-witness tracer — text extraction incl. streams (Integration R1; contract: cursor.text)', () => {
  it('RED: a QueryStream-shaped call records the cursor text', () => {
    const client = new pg.Client();
    const stream = { cursor: { text: 'SELECT geom FROM parcels' } };
    const ret = callQuery(client, stream);
    expect(ret).toBe(stream);
    expect(entryFor('SELECT geom FROM parcels').text).toBe('SELECT geom FROM parcels');
  });

  it('GREEN control: a config `{ text }` call records that text', () => {
    const client = new pg.Client();
    callQuery(client, { text: 'SELECT 1' });
    expect(entryFor('SELECT 1').text).toBe('SELECT 1');
  });
});

describe('sql-witness tracer — no text is FAIL:INPUT, never skipped (contract: NO_TEXT sentinel)', () => {
  it('RED: a call with no text is recorded with an error starting FAIL:INPUT:', () => {
    const client = new pg.Client();
    callQuery(client, {});

    const recorded = tracer._state().statements.find(
      (s) => typeof s.error === 'string' && s.error.startsWith('FAIL:INPUT:'),
    );
    expect(recorded).toBeDefined();
    expect(String(recorded!.error).startsWith('FAIL:INPUT:')).toBe(true);
  });

  it('GREEN control: a call WITH text records no error', async () => {
    const client = new pg.Client();
    await callQuery(client, 'SELECT id FROM permits');
    expect(entryFor('SELECT id FROM permits').error).toBeUndefined();
  });
});

describe('sql-witness tracer — pipeline_runs params only (contract: EC-D10 witness)', () => {
  it('RED: a pipeline_runs read records its values array', async () => {
    const client = new pg.Client();
    await callQuery(client, 'SELECT records_meta FROM pipeline_runs WHERE pipeline = $1', [
      'sources:parcels',
    ]);

    const entry = entryFor('SELECT records_meta FROM pipeline_runs WHERE pipeline = $1');
    expect(entry.params).toEqual([['sources:parcels']]);
  });

  it('GREEN control: a non-pipeline_runs statement carries no params', async () => {
    const client = new pg.Client();
    await callQuery(client, 'SELECT id FROM permits WHERE pipeline_id = $1', ['sources:parcels']);
    expect(entryFor('SELECT id FROM permits WHERE pipeline_id = $1').params).toBeUndefined();
  });
});

describe('sql-witness tracer — per-client sequence, run-length encoded (contract: client seq)', () => {
  it('RED: BEGIN, X, X, COMMIT on A and Y on B yield A=[[i,1],[j,2],[k,1]] and separate ids', async () => {
    const a = new pg.Client();
    const b = new pg.Client();

    await callQuery(a, 'BEGIN');
    await callQuery(a, 'SELECT id FROM permits');
    await callQuery(a, 'SELECT id FROM permits');
    await callQuery(a, 'COMMIT');
    await callQuery(b, 'SELECT id FROM parcels');

    const clients = tracer._state().clients;
    const ids = Object.keys(clients).map((k) => Number(k));
    expect(ids.length).toBe(2);

    const indexOf = (text: string): number =>
      tracer._state().statements.findIndex((s) => s.text === text && !s.error);

    // Find A as the client whose sequence mentions BEGIN; B as the other.
    const iBegin = indexOf('BEGIN');
    const iX = indexOf('SELECT id FROM permits');
    const iCommit = indexOf('COMMIT');
    const iY = indexOf('SELECT id FROM parcels');

    const aEntry = ids
      .map((id) => clients[String(id)])
      .find((seq) => (seq ?? []).some(([i]) => i === iBegin));
    const bEntry = ids
      .map((id) => clients[String(id)])
      .find((seq) => (seq ?? []).some(([i]) => i === iY));

    expect(aEntry).toEqual([
      [iBegin, 1],
      [iX, 2],
      [iCommit, 1],
    ]);
    expect(bEntry).toEqual([[iY, 1]]);
  });

  it('GREEN control: a single client with a single call has a one-entry sequence', async () => {
    const client = new pg.Client();
    await callQuery(client, 'SELECT id FROM parcels');

    const seqs = Object.values(tracer._state().clients);
    expect(seqs.length).toBe(1);
    expect(seqs[0]!.length).toBe(1);
    expect(seqs[0]![0]![1]).toBe(1);
  });
});

describe('sql-witness tracer — stays silent on stdout/stderr (contract: prints NOTHING, ever)', () => {
  it('RED: queries plus flush() write zero bytes to either stream', async () => {
    const client = new pg.Client();

    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    let outN = 0;
    let errN = 0;
    try {
      await callQuery(client, 'SELECT id FROM permits');
      await callQuery(client, { cursor: { text: 'SELECT geom FROM parcels' } });
      await callQuery(client, 'SELECT records_meta FROM pipeline_runs WHERE pipeline = $1', [
        'sources:parcels',
      ]);
      tracer.flush();
      // Read the counts BEFORE restoring: mockRestore() clears the call record.
      outN = outSpy.mock.calls.length;
      errN = errSpy.mock.calls.length;
    } finally {
      outSpy.mockRestore();
      errSpy.mockRestore();
    }
    expect(outN).toBe(0);
    expect(errN).toBe(0);
  });

  it('GREEN control: the spy mechanism does observe a deliberate write (proves the assertion is live)', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    let n = 0;
    try {
      process.stderr.write('probe');
      // Read the count BEFORE restoring: mockRestore() clears the call record.
      n = spy.mock.calls.length;
    } finally {
      spy.mockRestore();
    }
    expect(n).toBe(1);
  });
});

describe('sql-witness tracer — flush() writes the per-pid NDJSON (contract: header, statements, clients)', () => {
  it('RED: flush() writes <dir>/<pid>.ndjson with a header and one line per text/client', async () => {
    const a = new pg.Client();
    const b = new pg.Client();
    await callQuery(a, 'BEGIN');
    await callQuery(a, 'SELECT id FROM permits');
    await callQuery(a, 'SELECT id FROM permits');
    await callQuery(a, 'COMMIT');
    await callQuery(b, 'SELECT id FROM parcels');

    tracer.flush();

    const lines = readTraceLines();
    const header = lines[0]!;
    expect(header.type).toBe('header');
    expect(header.pid).toBe(process.pid);
    expect(typeof header.tracer_self_ms).toBe('number');
    expect(header.tracer_self_ms as number).toBeGreaterThanOrEqual(0);

    const distinctTexts = new Set(tracer._state().statements.map((s) => s.text));
    const statementLines = lines.filter((l) => l.type === 'statement');
    expect(statementLines.length).toBe(distinctTexts.size);

    const clientCount = Object.keys(tracer._state().clients).length;
    const clientLines = lines.filter((l) => l.type === 'client');
    expect(clientLines.length).toBe(clientCount);
    expect(clientCount).toBe(2);
  });

  it('GREEN control: the header line parses as JSON and carries zero calls before any query', () => {
    tracer.flush();
    const lines = readTraceLines();
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0]!.type).toBe('header');
    expect(lines[0]!.calls).toBe(0);
  });
});

describe('sql-witness tracer — double-wrap guard (contract: wrap ONCE, symbol-guarded)', () => {
  it('RED: re-requiring the preload does not double-count a single query', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    delete require.cache[require.resolve(PRELOAD_PATH)];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tracer2 = require(PRELOAD_PATH) as TracePreload;

    const client = new pg.Client();
    await callQuery(client, 'SELECT id FROM permits');

    const entries = tracer2._state().statements.filter((s) => s.text === 'SELECT id FROM permits');
    expect(entries.length).toBe(1);
    expect(entries[0]!.count).toBe(1);
    expect(entries[0]!.rowCount).toBe(3);
  });

  it('GREEN control: two distinct texts after the reload still read as two calls', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    delete require.cache[require.resolve(PRELOAD_PATH)];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tracer2 = require(PRELOAD_PATH) as TracePreload;

    const client = new pg.Client();
    await callQuery(client, 'SELECT id FROM permits');
    await callQuery(client, 'SELECT id FROM parcels');

    const calls = tracer2._state().statements.reduce((n, s) => n + s.count, 0);
    expect(calls).toBe(2);
    expect(origQuery).toBeUndefined();
  });
});
