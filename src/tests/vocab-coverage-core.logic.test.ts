// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-CA(i); R-CH vocab core)
//
// The vocab-coverage CORE (`scripts/lib/vocab-coverage.js`) is what an ASSERT compute may
// call inside the runner-owned READ ONLY snapshot (`ctx.readSnapshot`, R-CH). Per R-CA(i) such a
// compute holds NO transaction, NO `SET` and NO `ROLLBACK` of its own — so the core must issue
// read queries ONLY, never connection/txn control. The legacy pool wrapper
// (`scripts/lib/vocab-coverage.js`) keeps that discipline and delegates to the core.

import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveAndCountTripleWithClient, quoteOrNull, typeFamily } = require('../../scripts/lib/vocab-coverage.js') as {
  resolveAndCountTripleWithClient: (
    client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
    t: Record<string, unknown>,
    opts?: {
      logWarn?: (tag: string, msg: string, ctx?: object) => void;
      columnType?: (table: string, column: string) => Promise<string | null>;
    },
  ) => Promise<{ present: number; vocab_size: number } | { unresolved: string }>;
  quoteOrNull: (name: unknown) => string | null;
  typeFamily: (dt: string) => string;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveAndCountTriple } = require('../../scripts/lib/vocab-coverage-pool.js') as {
  resolveAndCountTriple: (
    pool: { connect: () => Promise<unknown> },
    t: Record<string, unknown>,
    opts?: { logWarn?: (tag: string, msg: string, ctx?: object) => void; statementTimeoutMs?: number },
  ) => Promise<{ present: number; vocab_size: number } | { unresolved: string }>;
};

const TRIPLE = {
  dataTable: 'source_parcels',
  dataColumn: 'property_type',
  vocabTable: 'vocab_property_type',
  vocabColumn: 'value',
};

/** Fake client: records every SQL string, answers schema probes + the intersection count. */
function makeFakeClient(over: { types?: Record<string, string | null>; count?: { present: number; vocab_size: number }; fail?: { code?: string; message?: string } } = {}) {
  const seen: Array<{ text: string; params?: unknown[] | undefined }> = [];
  const client = {
    seen,
    async query(text: string, params?: unknown[]) {
      seen.push({ text, params });
      if (over.fail) {
        const err = Object.assign(new Error(over.fail.message ?? 'boom'), { code: over.fail.code });
        throw err;
      }
      if (/information_schema\.columns/.test(text)) {
        const table = String(params?.[0]);
        const col = String(params?.[1]);
        const key = `${table}.${col}`;
        const dt = over.types?.[key] ?? (over.types ? undefined : 'character varying');
        return { rows: dt ? [{ data_type: dt }] : [] };
      }
      const count = over.count ?? { present: 3, vocab_size: 5 };
      return { rows: [count] };
    },
  };
  return client;
}

const silent = { logWarn: () => {} };

/**
 * CP-S5 (Spec 124 R-CX, amends R-CH): the core takes its column-type reader as an argument.
 * This stand-in answers like the old schema probe (the `types` map, default character varying)
 * WITHOUT touching the client — so the client sees only the core's own intersection count.
 */
function readerOf(over: { types?: Record<string, string | null> } = {}) {
  const asked: string[] = [];
  const columnType = async (table: string, col: string) => {
    const key = `${table}.${col}`;
    asked.push(key);
    return over.types?.[key] ?? (over.types ? null : 'character varying');
  };
  return { asked, columnType };
}
const withReader = (over: { types?: Record<string, string | null> } = {}) => ({ ...silent, columnType: readerOf(over).columnType });
const sqlOf = (seen: Array<{ text: string }>) => seen.map((s) => s.text).join('\n');

describe('vocab-coverage core — compute-safe (no txn control)', () => {
  it('(a) happy path returns counts and issues NO BEGIN / SET / ROLLBACK', async () => {
    const client = makeFakeClient({ count: { present: 4, vocab_size: 7 } });
    const reader = readerOf();
    const out = await resolveAndCountTripleWithClient(client, TRIPLE, { ...silent, columnType: reader.columnType });

    expect(out).toEqual({ present: 4, vocab_size: 7 });
    const sql = sqlOf(client.seen);
    expect(sql).not.toMatch(/\bBEGIN\b/i);
    expect(sql).not.toMatch(/\bROLLBACK\b/i);
    expect(sql).not.toMatch(/\bSET\b/i);
    // CP-S5: the two column types come from the reader; the client runs ONE intersection count.
    expect(reader.asked).toEqual(['source_parcels.property_type', 'vocab_property_type.value']);
    expect(client.seen).toHaveLength(1);
    expect(sql).not.toMatch(/information_schema/);
  });

  it('(b) a bad identifier returns unresolved WITHOUT touching the client', async () => {
    const client = makeFakeClient();
    const out = await resolveAndCountTripleWithClient(client, { ...TRIPLE, dataColumn: 'bad col; DROP TABLE x' }, withReader());

    expect(out).toEqual({ unresolved: 'bad identifier' });
    expect(client.seen).toHaveLength(0);
  });

  it('(c) maps query failures to markers and NEVER throws', async () => {
    const warn: Array<{ tag: string; msg: string }> = [];
    const timeoutClient = makeFakeClient({ fail: { code: '57014', message: 'canceling statement due to statement timeout' } });
    const t = await resolveAndCountTripleWithClient(timeoutClient, TRIPLE, { logWarn: (tag, msg) => warn.push({ tag, msg }), columnType: readerOf().columnType });
    expect(t).toEqual({ unresolved: 'timeout' });

    const errClient = makeFakeClient({ fail: { code: '42P01', message: 'relation does not exist' } });
    const e = await resolveAndCountTripleWithClient(errClient, TRIPLE, withReader());
    expect(e).toEqual({ unresolved: 'query error' });

    // The raw error message goes to logWarn only — never into the returned value.
    expect(warn).toHaveLength(1);
    expect(warn[0]!.tag).toBe('[vocab-coverage]');
    expect(warn[0]!.msg).toContain('→ timeout'); // the raw pg message rides the log context, never the marker

    // A client that throws a non-Error still cannot escape as a rejection.
    const weird = { query: async () => { throw { code: '57014' }; } };
    await expect(resolveAndCountTripleWithClient(weird, TRIPLE, withReader())).resolves.toEqual({ unresolved: 'timeout' });
  });

  it('reports missing columns and type mismatches without querying the data', async () => {
    const missing = makeFakeClient();
    expect(await resolveAndCountTripleWithClient(missing, TRIPLE, withReader({ types: {} }))).toEqual({ unresolved: 'missing column' });
    expect(missing.seen).toHaveLength(0);

    const mismatch = makeFakeClient();
    const types = { 'source_parcels.property_type': 'integer', 'vocab_property_type.value': 'text' };
    expect(await resolveAndCountTripleWithClient(mismatch, TRIPLE, withReader({ types }))).toEqual({ unresolved: 'type mismatch' });
    // The reader answered both types — no count query on a mismatched pair.
    expect(mismatch.seen).toHaveLength(0);
  });

  it('exports the shared helpers', () => {
    expect(quoteOrNull('source_parcels')).toBe('"source_parcels"');
    expect(quoteOrNull('bad-name')).toBeNull();
    expect(quoteOrNull(null)).toBeNull();
    expect(typeFamily('character varying')).toBe('text');
    expect(typeFamily('numeric(12,2)')).toBe('num');
    expect(typeFamily('boolean')).toBe('boolean');
  });
});

describe('vocab-coverage legacy wrapper — owns the transaction discipline', () => {
  function makeFakePool() {
    const base = makeFakeClient({ count: { present: 2, vocab_size: 6 } });
    const events: string[] = [];
    let released = 0;
    const client = {
      query: (text: string, params?: unknown[]) => {
        events.push(text);
        return base.query(text, params);
      },
      release: () => {
        released += 1;
      },
    };
    return {
      events,
      get released() {
        return released;
      },
      pool: { connect: async () => client },
    };
  }

  it('(d) issues BEGIN, SET LOCAL statement_timeout = 15000 (default), the core queries, then ROLLBACK + release()', async () => {
    const h = makeFakePool();
    const out = await resolveAndCountTriple(h.pool, TRIPLE, silent);

    expect(out).toEqual({ present: 2, vocab_size: 6 });
    expect(h.events[0]).toBe('BEGIN');
    expect(h.events[1]).toBe('SET LOCAL statement_timeout = 15000');
    expect(sqlOf(h.events.map((text) => ({ text })))).toMatch(/information_schema\.columns/);
    expect(h.events.filter((t) => /information_schema\.columns/.test(t))).toHaveLength(2);
    expect(h.events[h.events.length - 1]).toBe('ROLLBACK');
    expect(h.released).toBe(1);
  });

  it('honours statementTimeoutMs and still rolls back when the core degrades', async () => {
    const h = makeFakePool();
    const out = await resolveAndCountTriple(h.pool, TRIPLE, { ...silent, statementTimeoutMs: 2500 });

    expect(out).toEqual({ present: 2, vocab_size: 6 });
    expect(h.events[1]).toBe('SET LOCAL statement_timeout = 2500');
    expect(h.events[h.events.length - 1]).toBe('ROLLBACK');
    expect(h.released).toBe(1);
  });

  it('validates identifiers before borrowing a connection', async () => {
    let connects = 0;
    const pool = { connect: async () => { connects += 1; return makeFakeClient(); } };
    const out = await resolveAndCountTriple(pool, { ...TRIPLE, vocabTable: 'nope.table' }, silent);

    expect(out).toEqual({ unresolved: 'bad identifier' });
    expect(connects).toBe(0);
  });

  it('degrades a failing connect() to a marker without a release attempt', async () => {
    const pool = { connect: async () => { throw Object.assign(new Error('too many clients'), { code: '57014' }); } };
    const out = await resolveAndCountTriple(pool, TRIPLE, silent);
    expect(out).toEqual({ unresolved: 'timeout' });
  });
});
