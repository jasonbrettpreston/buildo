// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BZ G1/G6, R-CB
//
// S1-P-8b — enrich_parcels' zoning-change scope reader (#12a own baseline, #12b producer
// activity window). `readZoningChange` no longer issues ANY SQL: both its reads go through
// `ctx.producer` (the ONE `readRunHistory` reader, `scripts/lib/step/producer.js`), and the
// two predicates the old CTE expressed in SQL are now PURE JS (`zoningRunWrote`) over the
// returned rows. So:
//
//   * E (own baseline, #12a) is `producer('enrich_parcels')` — the R-BG(iv) DEFAULT status set
//     (completed / completed_with_warnings, warn-skip excluded) comes from the library, NOT
//     from a literal here;
//   * P (producer activity window, #12b) is `producer('load_zoning', {statuses:'terminal',
//     excludeWarnSkip:false, completedSince: own.started_at, limit: MAX_SAFE_INTEGER})` — an
//     EXPLICIT wider set (R-CB). E and P use DIFFERENT status sets ON PURPOSE (F-3, R-CB): E is
//     under-inclusive (a FAIL is never a baseline), P over-inclusive (a failed/crashed load may
//     have committed a write). Both fail safe. The fence at enrich-parcels.js "P and E use
//     DIFFERENT status sets on purpose" is PRESERVED and LOCKED here.
//
// No DB, no pool: `ctx.producer` is stubbed. The `vi.fn()` records every call so the two option
// objects can be asserted EXACTLY (the fence).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS compute module */
const compute = require('../../scripts/lib/compute/enrich-parcels.js');
/* eslint-enable @typescript-eslint/no-require-imports */

const ROOT = path.resolve(__dirname, '../..');
const COMPUTE_PATH = path.join(ROOT, 'scripts/lib/compute/enrich-parcels.js');
const SRC = fs.readFileSync(COMPUTE_PATH, 'utf8');

const ENRICH_SELF_STEP = 'enrich_parcels';
const ZONING_PRODUCER_STEP = 'load_zoning';

const D = new Date('2026-01-01T00:00:00Z');
const T1 = new Date('2025-12-30T00:00:00Z');
const T3 = new Date('2025-12-31T00:00:00Z');

type ProducerResult = Record<string, unknown>;

/**
 * A stub ctx: `producer(slug)` answers `own` for this step's own slug and `win` for the
 * zoning producer. The recorded `vi.fn()` is the call log the fence assertions read.
 */
const mk = (own: ProducerResult, win: ProducerResult) => ({
  /* library-faithful: onError:"throw" rethrows an ERROR result (producer.js) */
  producer: vi.fn(async (slug: string, o: Record<string, unknown> = {}) => {
    const r = slug === ENRICH_SELF_STEP ? own : win;
    if (r.reason === 'ERROR' && o.onError === 'throw') throw new Error(String(r.error));
    return r;
  }),
});

/** A MISSING producer result — the library's shape (every field null, `rows: []`). */
const missing = (over: ProducerResult = {}): ProducerResult => ({
  slug: null,
  forms: [],
  reason: 'MISSING',
  sid: null,
  status: null,
  started_at: null,
  completed_at: null,
  records_meta: null,
  rows: [],
  audit_outcome: null,
  ...over,
});

/** A FOUND baseline result for THIS step (E). */
const ownFound = (over: ProducerResult = {}): ProducerResult => ({
  slug: ENRICH_SELF_STEP,
  forms: ['sources:enrich_parcels', 'enrich_parcels', 'enrich-parcels'],
  reason: 'FOUND',
  sid: 10,
  status: 'completed',
  started_at: D,
  completed_at: D,
  records_meta: {},
  rows: [{ id: 10, status: 'completed', started_at: D, completed_at: D, records_meta: {} }],
  audit_outcome: null,
  ...over,
});

/** A producer-window result (P) with the given rows (already newest-first, as the reader returns). */
const winRows = (rows: object[], over: ProducerResult = {}): ProducerResult => ({
  slug: ZONING_PRODUCER_STEP,
  forms: ['sources:load_zoning', 'load_zoning', 'load-zoning'],
  reason: rows.length === 0 ? 'MISSING' : 'FOUND',
  sid: rows.length === 0 ? null : (rows[0] as { id: number }).id,
  status: rows.length === 0 ? null : ((rows[0] as { status?: string }).status ?? null),
  started_at: rows.length === 0 ? null : ((rows[0] as { started_at?: unknown }).started_at ?? null),
  completed_at: rows.length === 0 ? null : ((rows[0] as { completed_at?: unknown }).completed_at ?? null),
  records_meta: rows.length === 0 ? null : ((rows[0] as { records_meta?: object }).records_meta ?? {}),
  rows,
  audit_outcome: null,
  ...over,
});

describe('readZoningChange (#12a own baseline, #12b producer window) — producer-based, no SQL', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // (a) no E at all → scope all (fail-safe), and the window is NEVER read.
  it('(a) own MISSING → changed true + all-null id fields, and the producer is called ONCE (window never read)', async () => {
    const ctx = mk(missing(), winRows([{ id: 31, records_meta: { zoning_rows_changed: 4 } }]));
    const out = await compute.readZoningChange(ctx);
    expect(out).toEqual({
      changed: true,
      producer_run_id: null,
      producer_completed_at: null,
      own_last_run_id: null,
      own_last_started_at: null,
    });
    expect(ctx.producer).toHaveBeenCalledTimes(1);
    expect(ctx.producer).toHaveBeenCalledWith(ENRICH_SELF_STEP, { onError: 'throw' });
  });

  // (b) E present, P empty → nothing wrote since E started.
  it('(b) own FOUND + window MISSING (no rows) → changed false, own ids echo E, producer ids null', async () => {
    const ctx = mk(ownFound({ sid: 10, started_at: D }), winRows([]));
    const out = await compute.readZoningChange(ctx);
    expect(out).toEqual({
      changed: false,
      producer_run_id: null,
      producer_completed_at: null,
      own_last_run_id: 10,
      own_last_started_at: D,
    });
  });

  // (c) gated skip and zero-write are skipped; a FAILED run that wrote COUNTS.
  it('(c) window newest-first: a gated skip and a 0-write run are skipped, a failed run that wrote wins → producer_run_id 31', async () => {
    const rows = [
      { id: 33, status: 'completed', completed_at: T3, records_meta: { gate: { gated_skip: true } } },
      { id: 32, status: 'completed', completed_at: T3, records_meta: { zoning_rows_changed: 0 } },
      { id: 31, status: 'failed', completed_at: T1, records_meta: { zoning_rows_changed: 4 } },
    ];
    const ctx = mk(ownFound(), winRows(rows));
    const out = await compute.readZoningChange(ctx);
    expect(out.changed).toBe(true);
    expect(out.producer_run_id).toBe(31);
    expect(out.producer_completed_at).toBe(T1);
  });

  // (d) malformed / absent meta is a WROTE (fail-safe), each in turn.
  it('(d) fail-safe: a non-number zoning_rows_changed, a null meta, and a null zoning_rows_changed all count as wrote', async () => {
    const cases: Array<[string, object]> = [
      ['the string "x"', { id: 40, records_meta: { zoning_rows_changed: 'x' } }],
      ['a null records_meta', { id: 41, records_meta: null }],
      ['a null zoning_rows_changed', { id: 42, records_meta: { zoning_rows_changed: null } }],
    ];
    for (const [label, row] of cases) {
      const ctx = mk(ownFound(), winRows([row]));
      const out = await compute.readZoningChange(ctx);
      expect(out.changed, `${label} must count as wrote`).toBe(true);
      expect(out.producer_run_id, `${label} → that run's id`).toBe((row as { id: number }).id);
    }
  });

  // (e) THE FENCE — the two reads' option objects, EXACTLY (R-CB: E baseline default != P terminal).
  it('(e) fence — E is a bare slug call with no statuses; P is exactly {statuses:terminal, excludeWarnSkip:false, completedSince:E.started_at, limit:MAX_SAFE_INTEGER}', async () => {
    const ctx = mk(ownFound({ started_at: D }), winRows([]));
    await compute.readZoningChange(ctx);

    const calls = ctx.producer.mock.calls as unknown as Array<[string, (Record<string, unknown> & { statuses?: unknown }) | undefined]>;
    const [eCall, pCall] = calls;
    expect(eCall).toBeDefined();
    expect(pCall).toBeDefined();
    expect(eCall?.[0]).toBe(ENRICH_SELF_STEP);
    // E must NOT declare a statuses set: it takes the library's R-BG(iv) baseline default (only the fail-closed onError).
    expect(eCall?.[1]).toEqual({ onError: 'throw' });

    expect(pCall?.[0]).toBe(ZONING_PRODUCER_STEP);
    expect(pCall?.[1]).toEqual({
      statuses: 'terminal',
      excludeWarnSkip: false,
      completedSince: D,
      limit: Number.MAX_SAFE_INTEGER,
      onError: 'throw',
    });
  });

  // (f) fail-closed: an unreadable ledger NEVER picks a scope — it throws, naming the leg.
  it('(f) own ERROR → rejects naming the own-run read; window ERROR → rejects naming the producer read', async () => {
    await expect(
      compute.readZoningChange(mk({ ...missing(), reason: 'ERROR', error: 'x' }, winRows([]))),
    ).rejects.toThrow(/^x$/);

    await expect(
      compute.readZoningChange(mk(ownFound(), { ...winRows([]), reason: 'ERROR', error: 'boom' })),
    ).rejects.toThrow(/^boom$/);
  });
});

describe('zoningRunWrote — the #12b predicate, pure (data in, decision out)', () => {
  it('(g) table: gated skip always false (string or boolean); a numeric >0 true; 0 false; missing/null/malformed true', () => {
    const table: Array<[string, unknown, boolean]> = [
      ['null', null, true],
      ['empty object', {}, true],
      ['gated_skip true (boolean)', { gate: { gated_skip: true } }, false],
      ['gated_skip "true" (string)', { gate: { gated_skip: 'true' } }, false],
      ['gated_skip false + 0 written', { gate: { gated_skip: false }, zoning_rows_changed: 0 }, false],
      ['7 written', { zoning_rows_changed: 7 }, true],
      ['"7" (malformed) counts as wrote', { zoning_rows_changed: '7' }, true],
    ];
    for (const [label, meta, expected] of table) {
      expect(compute.zoningRunWrote(meta), `${label} → ${expected}`).toBe(expected);
    }
  });
});

describe('source locks — the compute file no longer carries the reads it delegated', () => {
  // (h) the whole point of 8b: the SQL and the DB clock are GONE from the reader.
  it('(h1) enrich-parcels.js contains no `pipeline_runs` text at all', () => {
    expect(/pipeline_runs/.test(SRC)).toBe(false);
  });

  it('(h2) no `now()` inside the readZoningChange region (the retired DB clock)', () => {
    const start = SRC.indexOf('async function readZoningChange');
    expect(start, 'readZoningChange must exist').toBeGreaterThan(-1);
    // The region runs to the next top-level `\n}` (the function's close) — generous but bounded.
    const end = SRC.indexOf('\n}\n', start);
    expect(end, 'the function must close').toBeGreaterThan(start);
    const region = SRC.slice(start, end);
    expect(/now\(\)/.test(region)).toBe(false);
    // and it reads through `ctx.producer`, never a pool/client.
    expect(/ctx\.producer\(/.test(region)).toBe(true);
    expect(/\.query\(/.test(region)).toBe(false);
  });

  it('(h3) computeDeferScope threads the ctx (not the bare client) into readZoningChange', () => {
    const start = SRC.indexOf('async function computeDeferScope');
    expect(start, 'computeDeferScope must exist').toBeGreaterThan(-1);
    const end = SRC.indexOf('\n}\n', start);
    const region = SRC.slice(start, end);
    expect(region).toContain('readZoningChange(ctx)');
    expect(region).not.toContain('readZoningChange(client)');
  });
});
