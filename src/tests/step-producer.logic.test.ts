// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BZ / Rule 10
//
// S1-P-2 — the producer library: `makeProducer` + `evaluatePins`.
//
// WHY THIS FILE EXISTS. `makeProducer` is built ON `readRunHistory` (S1-R, the
// ONE run-history reader). It must forward the caller's opts WITHOUT defeating
// the reader's defaults — so this test asserts on the SQL TEXT and the params
// ARRAY the way `ledger-reader.logic.test.ts` does: a mirror that quietly
// differed from the SQL is exactly the class of drift this lock closes.
//
// The second half locks Rule 10 (124:129): a producer-contract violation is a
// DECLARED check row through `deriveVerdict` — never a compute throw, never a
// parallel boolean. So `makeProducer` NEVER rethrows (an error is a row), and
// `evaluatePins` returns fail-closed MISSING/ERROR rows rather than halting.
// The final case is a source-scan lock: no `.halt` read, no `throw` inside
// `evaluatePins`.
import { describe, it, expect } from 'vitest';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library */
const producerLib = require('../../scripts/lib/step/producer.js');
/* eslint-enable @typescript-eslint/no-require-imports */

const {
  PIN_OPS,
  PRODUCER_READS,
  makeProducer,
  evaluatePins,
  readPath,
  pinReadKey,
  producerOptsForPin,
} = producerLib as {
  PIN_OPS: readonly string[];
  PRODUCER_READS: readonly string[];
  makeProducer: (deps: { pool: FakePool; chains?: string[] }) => Producer;
  evaluatePins: (pins: Pin[], resultsBySlug: Record<string, ProducerResult>) => PinRow[];
  readPath: (meta: unknown, stamp: string) => { present: boolean; value: unknown };
  pinReadKey: (pin: Pin) => string;
  producerOptsForPin: (pin: Pin) => { statuses?: string[]; metaObject?: string };
};

type LedgerRow = {
  id: number;
  pipeline: string;
  status: string;
  started_at: string;
  completed_at: string;
  records_meta: Record<string, unknown> | null;
};

type ProducerResult = {
  slug: string;
  forms: string[];
  reason: 'FOUND' | 'MISSING' | 'ERROR';
  error?: string;
  sid: number | null;
  status: string | null;
  started_at: string | null;
  completed_at: string | null;
  records_meta: Record<string, unknown> | null;
  rows: LedgerRow[];
};

type Producer = (slug: string, opts?: Record<string, unknown>) => Promise<ProducerResult>;

type Pin = {
  step: string;
  stamp: string;
  equals?: string;
  op?: string;
  statuses?: string[];
  meta_object?: string;
};

type PinRow = {
  metric: string;
  pin_id: string;
  predicate: string;
  observed: unknown;
  producer_run_id: number | null;
  producer_status: string | null;
  producer_completed_at: string | null;
  result: string;
  status: string;
  value: unknown;
  threshold: unknown;
  note: string;
};

type Query = { sql: string; params: unknown[] };

const row = (over: Partial<LedgerRow> & { id: number; pipeline: string }): LedgerRow => ({
  status: 'completed',
  started_at: '2026-01-01T00:00:00Z',
  completed_at: '2026-01-01T00:01:00Z',
  records_meta: null,
  ...over,
});

/**
 * Does this row carry the `write_skipped_pre_write_warn` marker that the
 * R-BG (iv) warn-skip predicate (`WARN_SKIP_PREDICATE_SQL`) excludes? The mirror
 * must clear it honestly, or a FOUND case would pass for the wrong reason.
 */
function carriesWarnSkip(r: LedgerRow): boolean {
  const rows = (r.records_meta as { audit_table?: { rows?: Array<{ metric?: string }> } } | null)?.audit_table?.rows;
  return Array.isArray(rows) && rows.some((x) => x && x.metric === 'write_skipped_pre_write_warn');
}

/**
 * A fake pool that MIRRORS `readRunHistory`'s SQL in JS — no parsing. The WHERE
 * half is cleared here using `params`; every SQL string and param array is
 * RECORDED so the pass-through case can assert what actually reached Postgres.
 */
class FakePool {
  calls: Query[] = [];
  rejectWith: Error | null = null;

  constructor(private readonly table: LedgerRow[] = []) {}

  async query(sql: string, params: unknown[]): Promise<{ rows: LedgerRow[] }> {
    this.calls.push({ sql, params });
    if (this.rejectWith) throw this.rejectWith;

    // WHERE — pipeline = ANY($1) AND status = ANY($2), warn-skip cleared in JS.
    const forms = params[0] as string[];
    const statuses = params[1] as string[];
    const limit = params[2] as number;
    const excludeWarnSkip = sql.includes('write_skipped_pre_write_warn');

    let matched = this.table.filter(
      (r) =>
        forms.includes(r.pipeline) &&
        statuses.includes(r.status) &&
        !(excludeWarnSkip && carriesWarnSkip(r)),
    );

    // An optional `metaObject` binds AFTER $3; mirror its filter so a MISSING
    // case is exercised through the real reader path, not a stub.
    const metaObjectMatch = /jsonb_typeof\(records_meta -> \$(\d+)::text\)/.exec(sql);
    if (metaObjectMatch) {
      const key = params[Number(metaObjectMatch[1]) - 1] as string;
      matched = matched.filter((r) => r.records_meta && typeof r.records_meta[key] === 'object');
    }

    // ORDER BY <orderBy> DESC, id DESC — the tie-break the SQL text locks.
    const key: keyof LedgerRow = sql.includes('ORDER BY started_at DESC, id DESC')
      ? 'started_at'
      : 'completed_at';
    matched = [...matched].sort((a, b) => {
      const ka = String(a[key]);
      const kb = String(b[key]);
      if (ka !== kb) return ka < kb ? 1 : -1; // DESC
      return b.id - a.id; // id DESC
    });

    return { rows: matched.slice(0, limit) };
  }
}

// ---------------------------------------------------------------------------
// 0. The frozen vocabularies
// ---------------------------------------------------------------------------

describe('producer library — frozen vocabularies', () => {
  it('exposes the CLOSED op set and read kinds', () => {
    expect(PIN_OPS).toEqual(['equals', 'nonzero', 'true', 'not_failed']);
    expect(PRODUCER_READS).toEqual(['baseline', 'activity', 'verdict']);
    expect(Object.isFrozen(PIN_OPS)).toBe(true);
    expect(Object.isFrozen(PRODUCER_READS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// a. FOUND — one row → sid/status/records_meta set; columns are the projection
// ---------------------------------------------------------------------------

describe('makeProducer — a. FOUND', () => {
  it('returns the winning row and selects ONLY the producer columns', async () => {
    const meta = { ravine_load: { spec_version: '2' } };
    const pool = new FakePool([row({ id: 812, pipeline: 'sources:load_ravines', records_meta: meta })]);
    const producer = makeProducer({ pool, chains: ['sources'] });

    const res = await producer('load_ravines');

    expect(res.reason).toBe('FOUND');
    expect(res.slug).toBe('load_ravines');
    expect(res.sid).toBe(812);
    expect(res.status).toBe('completed');
    expect(res.started_at).toBe('2026-01-01T00:00:00Z');
    expect(res.completed_at).toBe('2026-01-01T00:01:00Z');
    expect(res.records_meta).toEqual(meta);
    expect(res.rows).toHaveLength(1);

    const { sql } = pool.calls[0]!;
    expect(sql).toContain('SELECT id, status, started_at, completed_at, records_meta FROM pipeline_runs');
    // The projection is EXACT — no `pipeline`, no `*`.
    expect(sql).not.toContain('SELECT *');
    expect(sql).not.toContain('pipeline,');
  });
});

// ---------------------------------------------------------------------------
// b. MISSING — zero rows → every field `null`, NEVER `undefined`
// ---------------------------------------------------------------------------

describe('makeProducer — b. MISSING', () => {
  it('returns nulls (never undefined) when no run matches', async () => {
    const pool = new FakePool([row({ id: 1, pipeline: 'unrelated' })]);
    const producer = makeProducer({ pool });

    const res = await producer('load_ravines');

    expect(res.reason).toBe('MISSING');
    expect(res.sid).toBe(null);
    expect(res.status).toBe(null);
    expect(res.started_at).toBe(null);
    expect(res.completed_at).toBe(null);
    expect(res.records_meta).toBe(null);
    expect(res.rows).toEqual([]);
    // No `undefined` anywhere — a consumer's `!== null` must not misread absence.
    expect(res.sid === undefined).toBe(false);
    expect(res.status === undefined).toBe(false);
    expect(Object.values(res as unknown as Record<string, unknown>).includes(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// c. ERROR — pool.query rejects → reason 'ERROR', message carried, NO throw
// ---------------------------------------------------------------------------

describe('makeProducer — c. ERROR (Rule 10: never rethrow)', () => {
  it('catches the reader throw and returns an ERROR result', async () => {
    const pool = new FakePool([]);
    pool.rejectWith = new Error('connection terminated unexpectedly');
    const producer = makeProducer({ pool });

    const res = await producer('load_ravines');

    expect(res.reason).toBe('ERROR');
    expect(res.error).toBe('connection terminated unexpectedly');
    expect(res.sid).toBe(null);
    expect(res.status).toBe(null);
    expect(res.started_at).toBe(null);
    expect(res.completed_at).toBe(null);
    expect(res.records_meta).toBe(null);
    expect(res.rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// d. opts pass-through — statuses + metaObject reach the SQL params
// ---------------------------------------------------------------------------

describe('makeProducer — d. opts pass-through', () => {
  it('forwards statuses and metaObject into the bound params', async () => {
    const pool = new FakePool([
      row({ id: 2189, pipeline: 'sources:load_zoning', records_meta: { zoning_layers_loaded: { base: true } } }),
    ]);
    const producer = makeProducer({ pool, chains: ['sources'] });

    const res = await producer('load_zoning', {
      statuses: ['completed', 'failed'],
      metaObject: 'zoning_layers_loaded',
    });

    expect(res.reason).toBe('FOUND');
    expect(res.sid).toBe(2189);

    const { sql, params } = pool.calls[0]!;
    expect(params[0]).toEqual(['sources:load_zoning', 'load_zoning', 'load-zoning']);
    expect(params[1]).toEqual(['completed', 'failed']);
    expect(sql).toContain("status = ANY($2::text[])");
    expect(sql).toContain("jsonb_typeof(records_meta -> $4::text) = 'object'");
    expect(params[3]).toBe('zoning_layers_loaded');
  });

  it('does NOT forward an undefined option — the reader default applies', async () => {
    const pool = new FakePool([row({ id: 5, pipeline: 'sources:load_ravines' })]);
    const producer = makeProducer({ pool });

    await producer('load_ravines');

    const { sql, params } = pool.calls[0]!;
    // No metaObject → no bound key, no extra param.
    expect(sql).not.toContain('jsonb_typeof');
    expect(params).toHaveLength(3);
    expect(params[2]).toBe(1); // the producer window
  });
});

// ---------------------------------------------------------------------------
// e. equals PASS / FAIL (string compare of a number stamp)
// ---------------------------------------------------------------------------

describe('evaluatePins — e. equals', () => {
  const result = (meta: Record<string, unknown>): ProducerResult => ({
    slug: 'load_ravines',
    forms: ['sources:load_ravines'],
    reason: 'FOUND',
    sid: 812,
    status: 'completed',
    started_at: '2026-01-01T00:00:00Z',
    completed_at: '2026-01-01T00:01:00Z',
    records_meta: meta,
    rows: [],
  });

  it('PASSes equal and string-compares a number stamp', () => {
    const pins: Pin[] = [{ step: 'load_ravines', stamp: 'ravine_load.spec_version', equals: '2' }];
    // The stamp is the NUMBER 2; "2" === String(2) → PASS.
    const rows = evaluatePins(pins, { load_ravines: result({ ravine_load: { spec_version: 2 } }) });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.result).toBe('PASS');
    expect(rows[0]!.status).toBe('INFO');
    expect(rows[0]!.observed).toBe(2);
    expect(rows[0]!.value).toBe(2);
    expect(rows[0]!.threshold).toBe('2');
  });

  it('reads the schema stamp form records_meta.<dotted> (the real descriptor shape)', () => {
    const pins: Pin[] = [{ step: 'load_ravines', stamp: 'records_meta.ravine_load.spec_version', equals: '3' }];
    const rows = evaluatePins(pins, { load_ravines: result({ ravine_load: { spec_version: '3' } }) });
    expect(rows[0]!.result).toBe('PASS');
    expect(rows[0]!.metric).toBe('producer_pin_load_ravines_records_meta_ravine_load_spec_version');
  });

  it('FAILs a differing value and writes one FAIL row', () => {
    const pins: Pin[] = [{ step: 'load_ravines', stamp: 'ravine_load.spec_version', equals: '3' }];
    const rows = evaluatePins(pins, { load_ravines: result({ ravine_load: { spec_version: '2' } }) });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.result).toBe('FAIL');
    expect(rows[0]!.status).toBe('FAIL');
    expect(rows[0]!.metric).toBe('producer_pin_load_ravines_ravine_load_spec_version');
    expect(rows[0]!.note).toContain('"2"');
    expect(rows[0]!.note).toContain('"3"');
    // Rule 10: the row NEVER carries a `halt` field.
    expect('halt' in rows[0]!).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// f. nonzero — 5 PASS, 0 FAIL, '' FAIL, 'v1' PASS, null FAIL
// ---------------------------------------------------------------------------

describe('evaluatePins — f. nonzero', () => {
  const at = (value: unknown): Record<string, ProducerResult> => ({
    load_ravines: {
      slug: 'load_ravines',
      forms: [],
      reason: 'FOUND',
      sid: 1,
      status: 'completed',
      started_at: null,
      completed_at: null,
      records_meta: { ravine_load: { source_dataset_version: value } },
      rows: [],
    },
  });
  const pin: Pin[] = [{ step: 'load_ravines', stamp: 'ravine_load.source_dataset_version', op: 'nonzero' }];

  const run = (value: unknown) => evaluatePins(pin, at(value))[0]!.result;

  it('5 → PASS', () => expect(run(5)).toBe('PASS'));
  it('0 → FAIL', () => expect(run(0)).toBe('FAIL'));
  it("'' → FAIL", () => expect(run('')).toBe('FAIL'));
  it("'v1' → PASS", () => expect(run('v1')).toBe('PASS'));
  it('null → FAIL', () => expect(run(null)).toBe('FAIL'));
});

// ---------------------------------------------------------------------------
// g. true — true PASS, 'true' FAIL, false FAIL
// ---------------------------------------------------------------------------

describe('evaluatePins — g. true', () => {
  const at = (value: unknown): Record<string, ProducerResult> => ({
    load_zoning: {
      slug: 'load_zoning',
      forms: [],
      reason: 'FOUND',
      sid: 2189,
      status: 'completed',
      started_at: null,
      completed_at: null,
      records_meta: { zoning_layers_loaded: { base: value } },
      rows: [],
    },
  });
  const pin: Pin[] = [{ step: 'load_zoning', stamp: 'zoning_layers_loaded.base', op: 'true' }];

  const run = (value: unknown) => evaluatePins(pin, at(value))[0]!.result;

  it('true → PASS', () => expect(run(true)).toBe('PASS'));
  it("'true' → FAIL (strict identity, a string is not the boolean)", () => expect(run('true')).toBe('FAIL'));
  it('false → FAIL', () => expect(run(false)).toBe('FAIL'));
});

// ---------------------------------------------------------------------------
// h. MISSING producer → every pin of that step is one MISSING row, null producer_*
// ---------------------------------------------------------------------------

describe('evaluatePins — h. MISSING producer', () => {
  it('writes one MISSING row per pin with null producer fields', () => {
    const pins: Pin[] = [
      { step: 'load_ravines', stamp: 'ravine_load.spec_version', equals: '2' },
      { step: 'load_ravines', stamp: 'ravine_load.source_dataset_version', op: 'nonzero' },
    ];
    const missing: ProducerResult = {
      slug: 'load_ravines',
      forms: ['sources:load_ravines'],
      reason: 'MISSING',
      sid: null,
      status: null,
      started_at: null,
      completed_at: null,
      records_meta: null,
      rows: [],
    };

    const rows = evaluatePins(pins, { load_ravines: missing });

    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.result).toBe('MISSING');
      expect(r.status).toBe('FAIL');
      expect(r.producer_run_id).toBe(null);
      expect(r.producer_status).toBe(null);
      expect(r.producer_completed_at).toBe(null);
      expect(r.observed).toBe(null);
    }
    expect(rows[0]!.pin_id).toBe('load_ravines.ravine_load.spec_version');
  });
});

// ---------------------------------------------------------------------------
// i. absent path → MISSING (not ERROR); ERROR producer → ERROR row
// ---------------------------------------------------------------------------

describe('evaluatePins — i. absent path and ERROR producer', () => {
  it('treats an ABSENT path as MISSING, not ERROR', () => {
    const pins: Pin[] = [{ step: 'load_ravines', stamp: 'ravine_load.spec_version', equals: '2' }];
    const noKey: ProducerResult = {
      slug: 'load_ravines',
      forms: [],
      reason: 'FOUND',
      sid: 812,
      status: 'completed',
      started_at: null,
      completed_at: '2026-01-01T00:01:00Z',
      records_meta: { something_else: {} },
      rows: [],
    };
    const rows = evaluatePins(pins, { load_ravines: noKey });
    expect(rows[0]!.result).toBe('MISSING');
    expect(rows[0]!.status).toBe('FAIL');
    expect(rows[0]!.observed).toBe(null);
    expect(rows[0]!.producer_run_id).toBe(812);
  });

  it('propagates an ERROR producer as an ERROR row', () => {
    const pins: Pin[] = [{ step: 'load_ravines', stamp: 'ravine_load.spec_version', equals: '2' }];
    const errored: ProducerResult = {
      slug: 'load_ravines',
      forms: [],
      reason: 'ERROR',
      error: 'boom',
      sid: null,
      status: null,
      started_at: null,
      completed_at: null,
      records_meta: null,
      rows: [],
    };
    const rows = evaluatePins(pins, { load_ravines: errored });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.result).toBe('ERROR');
    expect(rows[0]!.status).toBe('FAIL');
  });

  it('an op outside the closed set is an ERROR row that names the op', () => {
    const pins: Pin[] = [{ step: 'load_ravines', stamp: 'ravine_load.spec_version', op: 'max_ratio' }];
    const found: ProducerResult = {
      slug: 'load_ravines',
      forms: [],
      reason: 'FOUND',
      sid: 1,
      status: 'completed',
      started_at: null,
      completed_at: null,
      records_meta: { ravine_load: { spec_version: '2' } },
      rows: [],
    };
    const rows = evaluatePins(pins, { load_ravines: found });
    expect(rows[0]!.result).toBe('ERROR');
    expect(rows[0]!.note).toContain('max_ratio');
  });
});

// ---------------------------------------------------------------------------
// j. a watermark pin (no op, no equals) produces NO row
// ---------------------------------------------------------------------------

describe('evaluatePins — j. watermark pins are skipped', () => {
  it('emits no row for { step, stamp } with neither op nor equals', () => {
    const pins: Pin[] = [{ step: 'x', stamp: 'parcels.zoning_updated_at' }];
    const rows = evaluatePins(pins, { x: { reason: 'FOUND', sid: 1, records_meta: {}, status: 'completed', completed_at: null } as ProducerResult });
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// k. source-scan lock — Rule 10 purity of evaluatePins
// ---------------------------------------------------------------------------

describe('producer.js — k. source-scan lock (Rule 10)', () => {
  it('reads no `.halt` field and throws nowhere inside evaluatePins', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const file = path.join(__dirname, '..', '..', 'scripts', 'lib', 'step', 'producer.js');
    const src = fs.readFileSync(file, 'utf8') as string;

    // No `halt` read/write anywhere — the row flows through deriveVerdict.
    expect(src.includes('.halt')).toBe(false);
    expect(/\bhalt\s*:/.test(src)).toBe(false);

    // `evaluatePins` contains no `throw` — a violation is a row, never an exception.
    const start = src.indexOf('function evaluatePins(');
    expect(start).toBeGreaterThan(-1);
    const after = src.indexOf('\nfunction ', start + 1);
    const body = src.slice(start, after === -1 ? undefined : after);
    expect(body.includes('throw')).toBe(false);
  });

  it('readPath is a pure own-property walk', () => {
    expect(readPath({ a: { b: { c: 7 } } }, 'a.b.c')).toEqual({ present: true, value: 7 });
    expect(readPath({ a: {} }, 'a.b.c')).toEqual({ present: false, value: undefined });
    expect(readPath(null, 'a.b.c')).toEqual({ present: false, value: undefined });
    // Does not walk the prototype chain.
    expect(readPath({}, 'toString')).toEqual({ present: false, value: undefined });
  });

  it('pinReadKey and producerOptsForPin dedupe reads and drop undefined keys', () => {
    const a: Pin = { step: 'load_zoning', stamp: 'records_meta.zoning_layers_loaded', statuses: ['completed'], meta_object: 'zoning_layers_loaded' };
    const b: Pin = { step: 'load_zoning', stamp: 'records_meta.zoning_layers_loaded', statuses: ['completed'], meta_object: 'zoning_layers_loaded' };
    expect(pinReadKey(a)).toBe(pinReadKey(b));
    expect(pinReadKey({ step: 'x', stamp: 'p.q' })).toBe(JSON.stringify(['x', null, null]));

    expect(producerOptsForPin(a)).toEqual({ statuses: ['completed'], metaObject: 'zoning_layers_loaded' });
    expect(producerOptsForPin({ step: 'x', stamp: 'p.q' })).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Guardian fold (2026-10-13): metric uniqueness + a null opts object
// ---------------------------------------------------------------------------

describe('evaluatePins — metric uniqueness (audit rows are keyed by metric)', () => {
  const found = (meta: Record<string, unknown>): ProducerResult => ({
    slug: 's', forms: ['s'], reason: 'FOUND', sid: 1, status: 'completed',
    started_at: '2026-01-01T00:00:00Z', completed_at: '2026-01-01T00:01:00Z', records_meta: meta, rows: [],
  });

  it('never emits two rows with the same metric (sanitize collisions, same stamp under two ops, repeats)', () => {
    const pins: Pin[] = [
      { step: 's', stamp: 'records_meta.a.b_c', op: 'nonzero' },
      { step: 's', stamp: 'records_meta.a_b.c', op: 'nonzero' },
      { step: 's', stamp: 'records_meta.x', equals: '1' },
      { step: 's', stamp: 'records_meta.x', op: 'nonzero' },
      { step: 's', stamp: 'records_meta.x', equals: '1' },
    ];
    const rows = evaluatePins(pins, { s: found({ a: { b_c: 1 }, a_b: { c: 1 }, x: 1 }) });
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((r) => r.metric)).size).toBe(rows.length);
  });
});

describe('makeProducer — a null opts object is treated as no options (Rule 10: never a throw)', () => {
  it('producer(slug, null) reads with defaults', async () => {
    const pool = new FakePool([row({ id: 7, pipeline: 'load_ravines' })]);
    const producer = makeProducer({ pool });
    const res = await producer('load_ravines', null as unknown as undefined);
    expect(['FOUND', 'MISSING']).toContain(res.reason);
  });
});

describe("makeProducer — onError: 'throw' (a fail-closed HOOK read; the rethrow is the library's, R-BZ G8)", () => {
  it('rethrows the reader error only when asked; default stays an ERROR result (Rule 10)', async () => {
    const pool = { query: async () => { throw new Error('boom'); } };
    const producer = makeProducer({ pool: pool as unknown as FakePool });
    await expect(producer('load_zoning', { onError: 'throw' })).rejects.toThrow('boom');
    const res = await producer('load_zoning');
    expect(res.reason).toBe('ERROR');
  });
});

// ---------------------------------------------------------------------------
// j. not_failed — the run-status op (CP-S1 #12c, operator 2026-10-14; proposed row amends R-CB)
// ---------------------------------------------------------------------------

describe('evaluatePins — j. not_failed (the producer run status, never a records_meta stamp)', () => {
  const TERMINAL = ['completed', 'completed_with_warnings', 'completed_with_errors', 'failed', 'crashed', 'cancelled'];
  const PIN: Pin = { step: 'load_zoning', stamp: 'pipeline_runs.status', op: 'not_failed', statuses: TERMINAL };
  const res = (status: string | null, reason: 'FOUND' | 'MISSING' | 'ERROR' = 'FOUND'): ProducerResult => ({
    slug: 'load_zoning',
    forms: [],
    reason,
    sid: reason === 'FOUND' ? 2637 : null,
    status,
    started_at: null,
    completed_at: reason === 'FOUND' ? '2026-10-14T00:00:00Z' : null,
    // a run status is NOT in records_meta: an empty meta must not make the pin MISSING
    records_meta: reason === 'FOUND' ? {} : null,
    rows: [],
  });
  const row = (r: ProducerResult) => evaluatePins([PIN], { load_zoning: r })[0]!;

  it('failed → FAIL (status FAIL, observed "failed", producer fields set)', () => {
    const r = row(res('failed'));
    expect(r.result).toBe('FAIL');
    expect(r.status).toBe('FAIL');
    expect(r.observed).toBe('failed');
    expect(r.producer_run_id).toBe(2637);
    expect(r.metric).toBe('producer_pin_load_zoning_pipeline_runs_status_not_failed');
  });

  it.each(['completed', 'completed_with_warnings', 'completed_with_errors', 'crashed', 'cancelled'])('%s → PASS', (s) => {
    const r = row(res(s));
    expect(r.result).toBe('PASS');
    expect(r.status).toBe('INFO');
    expect(r.observed).toBe(s);
  });

  it('no run → MISSING; reader error → ERROR (both FAIL rows, as every pin)', () => {
    expect(row(res(null, 'MISSING')).result).toBe('MISSING');
    expect(row(res(null, 'ERROR')).result).toBe('ERROR');
    expect(row(res(null, 'ERROR')).status).toBe('FAIL');
  });

  it('reads through the EXISTING pin read identity: the declared statuses, no new read option', () => {
    expect(producerOptsForPin(PIN)).toEqual({ statuses: TERMINAL });
  });
});
