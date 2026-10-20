// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BG R-CB
//
// S1R-1 — `readRunHistory`, THE one run-history reader (purity seam S1-R).
//
// WHY THIS FILE EXISTS. Spec 124 R-BG (iv): a PRIOR-RUN BASELINE is
// `status IN ('completed','completed_with_warnings')`, NEVER
// `completed_with_errors`, and never a run carrying the
// `write_skipped_pre_write_warn` audit row. Spec 124 R-CB (operator 2026-10-12,
// purity seam S1 OQ-1) then settles the SCOPE of that rule: R-BG (iv) is a
// BASELINE rule — it governs this one reader and nothing else. An ordering/seam
// read is not a baseline and accepts every finished status.
//
// The two properties a baseline reader must have, and the reason the SQL TEXT is
// asserted here rather than only the rows: 1) a fake pool that MIRRORS the SQL in
// JS proves the READER's parameters, but only the literal `ORDER BY … DESC, id
// DESC` and the literal warn-skip predicate prove the TIE-BREAK and the
// preserve-and-WARN exclusion actually reach Postgres — a mirror that quietly
// differed from the SQL is exactly the class of drift this lock closes.
//
// The fake pool evaluates WHERE/ORDER/LIMIT against an in-memory row array using
// the SAME params the reader passed (no SQL parsing): it clears the status and
// warn-skip filters in JS, asserts the SQL text carries the tie-break, and lets
// the reader's own ORDER/LIMIT decide which row wins.
import { describe, it, expect } from 'vitest';

/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library */
const ledgerLib = require('../../scripts/lib/step/ledger.js');
const { slugForms } = require('../../scripts/lib/ledger.js');
/* eslint-enable @typescript-eslint/no-require-imports */

const { readRunHistory, BASELINE_STATUSES, WARN_SKIP_PREDICATE_SQL } = ledgerLib as {
  readRunHistory: (
    pool: FakePool,
    opts: Record<string, unknown>,
  ) => Promise<{ rows: LedgerRow[]; forms: string[] }>;
  BASELINE_STATUSES: readonly string[];
  WARN_SKIP_PREDICATE_SQL: string;
};

type LedgerRow = {
  id: number;
  pipeline: string;
  status: string;
  started_at: string;
  completed_at: string;
  records_meta: Record<string, unknown> | null;
};

/** The `write_skipped_pre_write_warn` marker row (the R-BG (iv) preserve-and-WARN shape). */
const WARN_SKIP_META = {
  audit_table: { rows: [{ metric: 'write_skipped_pre_write_warn', value: 1, status: 'WARN' }] },
};

const row = (over: Partial<LedgerRow> & { id: number; pipeline: string }): LedgerRow => ({
  status: 'completed',
  started_at: '2026-01-01T00:00:00Z',
  completed_at: '2026-01-01T00:01:00Z',
  records_meta: null,
  ...over,
});

/** Does this row carry the warn-skip marker the R-BG (iv) predicate excludes? */
function carriesWarnSkip(r: LedgerRow): boolean {
  const rows = (r.records_meta as { audit_table?: { rows?: Array<{ metric?: string }> } } | null)?.audit_table?.rows;
  return Array.isArray(rows) && rows.some((x) => x && x.metric === 'write_skipped_pre_write_warn');
}

type Query = { sql: string; params: unknown[] };

/**
 * A fake pool that MIRRORS the reader's SQL in JS — no parsing. The WHERE half
 * is cleared here using `params`, the ORDER/LIMIT half is mirrored so the
 * tie-break is what selects `rows[0]`, and every SQL string is RECORDED for the
 * purity case (item 8).
 */
class FakePool {
  calls: Query[] = [];

  constructor(private readonly table: LedgerRow[]) {}

  async query(sql: string, params: unknown[]): Promise<{ rows: LedgerRow[] }> {
    this.calls.push({ sql, params });

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

const HEADLINE_SQL_TAIL = 'ORDER BY completed_at DESC, id DESC LIMIT $3';

// ---------------------------------------------------------------------------
// 1. HEADLINE (HQ-6) — a standalone, BARE-slug run is found for a chain-declaring step
// ---------------------------------------------------------------------------

describe('readRunHistory — HEADLINE (HQ-6)', () => {
  it('finds a bare standalone run and expands the declared chain form', async () => {
    const pool = new FakePool([
      row({ id: 7, pipeline: 'load_coa_notices', status: 'completed' }),
    ]);

    const { rows, forms } = await readRunHistory(pool, {
      slug: 'load_coa_notices',
      chains: ['sources'],
    });

    // The run-history read is what makes a standalone run visible to a
    // chain-scoped step: the bare slug is queried AND the prefixed form is.
    expect(forms).toContain('load_coa_notices');
    expect(forms).toContain('sources:load_coa_notices');
    expect(rows.map((r) => r.id)).toEqual([7]);
  });

  it('returns exactly the deduped slugForms expansion (bare + chain + dash)', async () => {
    const { forms } = await readRunHistory(new FakePool([]), {
      slug: 'load_coa_notices',
      chains: ['sources'],
    });
    expect(forms).toEqual([...new Set(slugForms('load_coa_notices', ['sources']))]);
  });
});

// ---------------------------------------------------------------------------
// 2. Multi-chain — every declared chain contributes a prefixed form, deduped
// ---------------------------------------------------------------------------

describe('readRunHistory — multi-chain expansion', () => {
  it('emits both prefixed forms plus the bare + dash forms, without duplicates', async () => {
    const { forms } = await readRunHistory(new FakePool([]), {
      slug: 'load_coa_notices',
      chains: ['permits', 'coa'],
    });

    expect(forms).toEqual([
      'permits:load_coa_notices',
      'coa:load_coa_notices',
      'load_coa_notices',
      'load-coa-notices',
    ]);
    expect(forms.length).toBe(new Set(forms).size);
  });
});

// ---------------------------------------------------------------------------
// 3. The R-BG (iv) STATUS SET — cw/w accepted, cwe/captured/failed rejected
// ---------------------------------------------------------------------------

describe('readRunHistory — R-BG (iv) status set', () => {
  it('defaults to BASELINE_STATUSES = {completed, completed_with_warnings}', () => {
    expect([...BASELINE_STATUSES]).toEqual(['completed', 'completed_with_warnings']);
  });

  it('accepts completed and completed_with_warnings, rejects every non-baseline status', async () => {
    const pool = new FakePool([
      row({ id: 1, pipeline: 'link_x', status: 'completed' }),
      row({ id: 2, pipeline: 'link_x', status: 'completed_with_warnings' }),
      // Wall-clock LATER than the accepted two — if any of these were admitted
      // they would win rows[0], so their absence is proved by the id, not by
      // an empty result.
      row({ id: 3, pipeline: 'link_x', status: 'completed_with_errors', completed_at: '2026-06-01T00:00:00Z' }),
      row({ id: 4, pipeline: 'link_x', status: 'captured', completed_at: '2026-06-02T00:00:00Z' }),
      row({ id: 5, pipeline: 'link_x', status: 'failed', completed_at: '2026-06-03T00:00:00Z' }),
    ]);

    const { rows } = await readRunHistory(pool, { slug: 'link_x', limit: 10 });

    expect(rows.map((r) => r.status)).toEqual(['completed_with_warnings', 'completed']);
    expect(pool.calls[0]?.params[1]).toEqual(['completed', 'completed_with_warnings']);
  });

  it('never lets completed_with_errors be a baseline even when it is the only finished run', async () => {
    const pool = new FakePool([
      row({ id: 9, pipeline: 'link_x', status: 'completed_with_errors' }),
    ]);
    const { rows } = await readRunHistory(pool, { slug: 'link_x' });
    expect(rows).toEqual([]);
  });

  it('honours an explicit statuses override (the seam reader\'s set is the caller\'s call, R-CB)', async () => {
    const pool = new FakePool([
      row({ id: 9, pipeline: 'link_x', status: 'completed_with_errors' }),
    ]);
    const { rows } = await readRunHistory(pool, {
      slug: 'link_x',
      statuses: ['completed', 'completed_with_warnings', 'completed_with_errors'],
    });
    expect(rows.map((r) => r.id)).toEqual([9]);
    expect(pool.calls[0]?.params[1]).toEqual([
      'completed',
      'completed_with_warnings',
      'completed_with_errors',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 4. The warn-skip predicate — ON by default, omittable by explicit opt-out
// ---------------------------------------------------------------------------

describe('readRunHistory — write_skipped_pre_write_warn exclusion', () => {
  it('excludes a preserve-and-WARN run by default (the predicate is IN the SQL)', async () => {
    const pool = new FakePool([
      row({ id: 1, pipeline: 'link_x', status: 'completed' }),
      row({
        id: 2,
        pipeline: 'link_x',
        status: 'completed',
        completed_at: '2026-06-01T00:00:00Z', // later — would win if admitted
        records_meta: WARN_SKIP_META,
      }),
    ]);

    const { rows } = await readRunHistory(pool, { slug: 'link_x', limit: 10 });

    expect(pool.calls[0]?.sql).toContain(WARN_SKIP_PREDICATE_SQL);
    expect(pool.calls[0]?.sql).toContain('write_skipped_pre_write_warn');
    expect(rows.map((r) => r.id)).toEqual([1]);
  });

  it('omits the predicate under excludeWarnSkip:false (and then the skip run IS visible)', async () => {
    const skip = row({
      id: 2,
      pipeline: 'link_x',
      status: 'completed',
      completed_at: '2026-06-01T00:00:00Z',
      records_meta: WARN_SKIP_META,
    });
    const pool = new FakePool([row({ id: 1, pipeline: 'link_x', status: 'completed' }), skip]);

    const { rows } = await readRunHistory(pool, { slug: 'link_x', excludeWarnSkip: false });

    expect(pool.calls[0]?.sql).not.toContain('write_skipped_pre_write_warn');
    expect(rows.map((r) => r.id)).toEqual([2]);
  });
});

// ---------------------------------------------------------------------------
// 5. Tie-break — `ORDER BY <key> DESC, id DESC` literally in the SQL text
// ---------------------------------------------------------------------------

describe('readRunHistory — ordering + id tie-break', () => {
  it('defaults to completed_at DESC with id DESC as the tie-break', async () => {
    const pool = new FakePool([]);
    await readRunHistory(pool, { slug: 'link_x' });
    expect(pool.calls[0]?.sql.endsWith(HEADLINE_SQL_TAIL)).toBe(true);
  });

  it('orderBy:started_at switches the key and KEEPS the id DESC tie-break', async () => {
    const pool = new FakePool([]);
    await readRunHistory(pool, { slug: 'link_x', orderBy: 'started_at' });
    expect(pool.calls[0]?.sql).toContain('ORDER BY started_at DESC, id DESC');
    expect(pool.calls[0]?.sql.endsWith('ORDER BY started_at DESC, id DESC LIMIT $3')).toBe(true);
  });

  it('breaks a completed_at tie with the HIGHER id (the only deterministic answer)', async () => {
    const at = '2026-03-01T00:00:00Z';
    const pool = new FakePool([
      row({ id: 4, pipeline: 'link_x', completed_at: at }),
      row({ id: 5, pipeline: 'link_x', completed_at: at }),
    ]);
    const { rows } = await readRunHistory(pool, { slug: 'link_x' });
    expect(rows.map((r) => r.id)).toEqual([5]);
  });
});

// ---------------------------------------------------------------------------
// 6. invocation 'none' — no chains, so bare + dash forms only
// ---------------------------------------------------------------------------

describe('readRunHistory — invocation: none (standalone-only step)', () => {
  it('emits bare + dash forms and no chain prefix when chains is empty', async () => {
    // `deriveLedgerSlugs` maps `invocation: "none"` to chains `[]`; the reader
    // takes that array as given, so `[]` here IS the invocation-'none' shape.
    const { forms } = await readRunHistory(new FakePool([]), {
      slug: 'load_coa_notices',
      chains: [],
    });

    expect(forms).toEqual(['load_coa_notices', 'load-coa-notices']);
    expect(forms.some((f) => f.includes(':'))).toBe(false);
  });

  it('still matches a legacy hyphenated writer under invocation:none', async () => {
    const pool = new FakePool([row({ id: 3, pipeline: 'load-coa-notices' })]);
    const { rows } = await readRunHistory(pool, { slug: 'load_coa_notices', chains: [] });
    expect(rows.map((r) => r.id)).toEqual([3]);
  });
});

// ---------------------------------------------------------------------------
// 7. Guards — a bad selector is a THROW, never a silently different read
// ---------------------------------------------------------------------------

describe('readRunHistory — argument guards', () => {
  it('throws on an unknown orderBy (never falls back to the default)', async () => {
    await expect(readRunHistory(new FakePool([]), { slug: 'link_x', orderBy: 'duration_ms' })).rejects.toThrow(/orderBy/);
  });

  it('clamps limit 0 up to 1', async () => {
    const pool = new FakePool([
      row({ id: 1, pipeline: 'link_x', started_at: '2026-01-01T00:00:00Z' }),
      row({ id: 2, pipeline: 'link_x', started_at: '2026-02-01T00:00:00Z' }),
    ]);
    const { rows } = await readRunHistory(pool, { slug: 'link_x', limit: 0 });
    expect(pool.calls[0]?.params[2]).toBe(1);
    expect(rows.length).toBe(1);
  });

  it('floors a fractional limit rather than erroring', async () => {
    const pool = new FakePool([]);
    await readRunHistory(pool, { slug: 'link_x', limit: 2.9 });
    expect(pool.calls[0]?.params[2]).toBe(2);
  });

  it('throws on limit NaN (an unbounded LIMIT is never an acceptable default)', async () => {
    await expect(readRunHistory(new FakePool([]), { slug: 'link_x', limit: Number.NaN })).rejects.toThrow(/limit/);
  });

  it('throws on a non-whitelisted column', async () => {
    await expect(
      readRunHistory(new FakePool([]), { slug: 'link_x', columns: ['id', 'error_message'] }),
    ).rejects.toThrow(/columns/);
  });

  it('throws on an empty or non-string statuses array', async () => {
    await expect(readRunHistory(new FakePool([]), { slug: 'link_x', statuses: [] })).rejects.toThrow(/statuses/);
    await expect(readRunHistory(new FakePool([]), { slug: 'link_x', statuses: [7] })).rejects.toThrow(/statuses/);
  });

  it('throws when slug is missing', async () => {
    await expect(readRunHistory(new FakePool([]), {})).rejects.toThrow(/slug/);
  });

  it('projects ONLY the requested whitelisted columns', async () => {
    const pool = new FakePool([]);
    await readRunHistory(pool, { slug: 'link_x', columns: ['id', 'status'] });
    expect(pool.calls[0]?.sql.startsWith('SELECT id, status FROM pipeline_runs')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. PURITY — the reader is a reader (it never writes `baseline_absent`)
// ---------------------------------------------------------------------------

describe('readRunHistory — purity (a reader, never a writer)', () => {
  it('issues exactly one statement, and it is a SELECT', async () => {
    const pool = new FakePool([row({ id: 1, pipeline: 'link_x' })]);
    await readRunHistory(pool, { slug: 'link_x', chains: ['sources'] });

    expect(pool.calls.length).toBe(1);
    expect(pool.calls[0]?.sql.trim().toUpperCase().startsWith('SELECT')).toBe(true);
  });

  it('never issues an INSERT/UPDATE/DELETE on ANY path, including the no-baseline path', async () => {
    // The empty result is the case where a mutating reader would be tempted to
    // write the caller's `baseline_absent` row. It must not: the caller writes it.
    for (const table of [[], [row({ id: 1, pipeline: 'link_x' })]]) {
      const pool = new FakePool(table);
      await readRunHistory(pool, { slug: 'link_x', chains: ['sources'] });
      for (const { sql } of pool.calls) {
        expect(sql).toMatch(/^\s*SELECT/);
        expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 9. S1-R CONSUMERS — the two call sites that must consume the seam verbatim
// ---------------------------------------------------------------------------
//
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md HQ-6, R-CC
//
// The S1-R locks above pin THE ONE RUN-HISTORY READER. These two cases pin the
// consumers that read THROUGH it, because a re-parameterization at the CALL
// SITE (a chain dropped from the union, or the O-6 fail-safe "optimized" into a
// baseline filter) is invisible to a reader-only lock and exactly the drift the
// seam exists to prevent.
describe('S1-R consumers', () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS library */
  const sourceVersion = require('../../scripts/lib/source-version.js');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const { readPriorRunMeta, runLedgerGateDecision } = sourceVersion as {
    readPriorRunMeta: (
      pool: FakePool,
      pipelineName: string,
      opts?: { chains?: string[] },
    ) => Promise<Record<string, unknown> | null>;
    runLedgerGateDecision: (
      pool: FakePool,
      input: { ownSlugs: string[]; upstreamSlugs: string[]; now?: Date | string | null },
    ) => Promise<{ skip: boolean; reason: string; nonCompleted: number }>;
  };

  it('HQ-6 multi-chain union: readPriorRunMeta(["coa"]) issues ONE query over every chain form', async () => {
    // A step invoked as {permits, coa} but addressed here as the chain-scoped
    // `permits:enrich_permits` must read BOTH chains' history: the union is
    // de-duped and reaches Postgres as ONE `= ANY($1)` query — never two reads.
    const pool = new FakePool([]);

    const meta = await readPriorRunMeta(pool, 'permits:enrich_permits', { chains: ['coa'] });

    expect(meta).toBeNull();
    expect(pool.calls.length).toBe(1);
    const call = pool.calls[0];
    if (!call) throw new Error("readPriorRunMeta issued no query");
    const { sql, params } = call;

    // $1 — the de-duped slug-form union: every declared chain's prefix, the
    // bare slug, and the hyphenated form exactly once each (HQ-6).
    const forms = params[0] as string[];
    expect(forms).toContain('permits:enrich_permits');
    expect(forms).toContain('coa:enrich_permits');
    expect(forms).toContain('enrich_permits');
    expect(forms).toContain('enrich-permits');
    expect(forms.length).toBe(new Set(forms).size);

    // $2 — the R-BG (iv) BASELINE status set (the reader's default).
    expect(params[1]).toEqual(['completed', 'completed_with_warnings']);

    // The tie-break + LIMIT reach Postgres literally (orderBy: started_at).
    expect(sql.endsWith('ORDER BY started_at DESC, id DESC LIMIT $3')).toBe(true);
  });

  // R-CC keeps O-6 (provisional 2026-10-12, operator to confirm)
  // rule-map: Q-S1-a — completed_with_warnings upstream counts as non-completed (verify-12 N1, operator y 2026-10-20 consolidation 1-4)
  it('O-6 fail-safe kept (Spec 124 R-CC): the upstream predicate stays bare `<> \'completed\'`', async () => {
    // R-CC keeps O-6 (provisional 2026-10-12, operator to confirm)
    //
    // The upstream window counts ACTIVITY, not a baseline: a
    // completed_with_warnings upstream row must count as NON-completed → RUN.
    // Widening the predicate to the baseline set would flip RUN → SKIP, the
    // NON-fail-safe direction. Pin the BARE literal and its negative.
    const pool = new FakePool([]);

    await runLedgerGateDecision(pool, {
      ownSlugs: ['sources:x'],
      upstreamSlugs: ['sources:y'],
    });

    expect(pool.calls.length).toBe(1);
    const sql = pool.calls[0]?.sql;

    // The bare literal is STILL there (the upstream_since non_completed FILTER).
    expect(sql).toContain("p.status <> 'completed'");
    // …and the baseline predicate has NOT leaked into the upstream window.
    expect(sql).not.toContain("NOT IN ('completed', 'completed_with_warnings')");
  });
});

// ---------------------------------------------------------------------------
// 10. S1-P — `completedSince` (activity window) + `metaObject` (bound-key probe)
// ---------------------------------------------------------------------------
//
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (design Fold 1
// items 1 + 7-REVERSED).
//
// Two CLOSED options on the one reader. Each emits ONE extra AND clause AFTER
// the warn-skip predicate and BEFORE ` ORDER BY`, appending its param after $3
// so that with NEITHER option present the SQL and params are byte-identical to
// the pre-change read (locked by case (a)).
describe('readRunHistory — completedSince + metaObject (S1-P)', () => {
  it('a) neither option → SQL is the pre-change string; params length 3', async () => {
    const pool = new FakePool([]);
    await readRunHistory(pool, { slug: 'link_x' });
    const sql = pool.calls[0]?.sql;
    if (typeof sql !== 'string') throw new Error('readRunHistory issued no query');

    // The EXACT pre-change text (defaults: warn-skip ON, completed_at DESC).
    expect(sql).toBe(
      'SELECT id, pipeline, status, started_at, completed_at, records_meta FROM pipeline_runs' +
        ' WHERE pipeline = ANY($1::text[]) AND status = ANY($2::text[])' +
        ` AND ${WARN_SKIP_PREDICATE_SQL}` +
        ' ORDER BY completed_at DESC, id DESC LIMIT $3',
    );
    expect(sql).not.toContain('completed_at >=');
    expect(sql).not.toContain('jsonb_typeof');
    expect(pool.calls[0]?.params.length).toBe(3);
  });

  it('b) completedSince as a Date → clause + $4, bound as the ISO string', async () => {
    const pool = new FakePool([]);
    const since = new Date('2026-05-01T12:00:00.000Z');
    await readRunHistory(pool, { slug: 'link_x', completedSince: since });
    const sql = pool.calls[0]?.sql;
    if (typeof sql !== 'string') throw new Error('readRunHistory issued no query');

    expect(sql).toContain('AND completed_at >= $4::timestamptz');
    expect(sql).toContain('ORDER BY completed_at DESC, id DESC LIMIT $3');
    expect(pool.calls[0]?.params[3]).toBe('2026-05-01T12:00:00.000Z');
    expect(pool.calls[0]?.params.length).toBe(4);
  });

  it('b2) completedSince as an ISO string is accepted and normalised', async () => {
    const pool = new FakePool([]);
    await readRunHistory(pool, { slug: 'link_x', completedSince: '2026-05-01T12:00:00+02:00' });
    expect(pool.calls[0]?.sql).toContain('AND completed_at >= $4::timestamptz');
    expect(pool.calls[0]?.params[3]).toBe('2026-05-01T10:00:00.000Z');
  });

  it('c) completedSince epoch ms 0 is FINITE (accepted); NaN, bad string, object throw', async () => {
    const pool = new FakePool([]);
    await readRunHistory(pool, { slug: 'link_x', completedSince: 0 });
    expect(pool.calls[0]?.sql).toContain('AND completed_at >= $4::timestamptz');
    expect(pool.calls[0]?.params[3]).toBe('1970-01-01T00:00:00.000Z');

    await expect(
      readRunHistory(new FakePool([]), { slug: 'link_x', completedSince: Number.NaN }),
    ).rejects.toThrow(/completedSince/);
    await expect(
      readRunHistory(new FakePool([]), { slug: 'link_x', completedSince: 'not-a-date' }),
    ).rejects.toThrow(/completedSince/);
    await expect(
      readRunHistory(new FakePool([]), { slug: 'link_x', completedSince: {} }),
    ).rejects.toThrow(/completedSince/);
    await expect(
      readRunHistory(new FakePool([]), { slug: 'link_x', completedSince: '' }),
    ).rejects.toThrow(/completedSince/);
  });

  it('d) metaObject alone → bound-key probe as $4', async () => {
    const pool = new FakePool([]);
    await readRunHistory(pool, { slug: 'link_x', metaObject: 'zoning_layers_loaded' });
    const sql = pool.calls[0]?.sql;
    if (typeof sql !== 'string') throw new Error('readRunHistory issued no query');

    expect(sql).toContain("AND jsonb_typeof(records_meta -> $4::text) = 'object'");
    expect(sql).toContain('ORDER BY completed_at DESC, id DESC LIMIT $3');
    expect(pool.calls[0]?.params[3]).toBe('zoning_layers_loaded');
    expect(pool.calls[0]?.params.length).toBe(4);
    // The key is BOUND, never interpolated into the SQL text.
    expect(sql).not.toContain('zoning_layers_loaded');
  });

  it('e) both → completedSince is $4, metaObject is $5, both before ORDER BY', async () => {
    const pool = new FakePool([]);
    await readRunHistory(pool, {
      slug: 'link_x',
      completedSince: new Date('2026-05-01T12:00:00.000Z'),
      metaObject: 'zoning_layers_loaded',
    });
    const sql = pool.calls[0]?.sql;
    if (typeof sql !== 'string') throw new Error('readRunHistory issued no query');

    expect(sql).toContain('AND completed_at >= $4::timestamptz');
    expect(sql).toContain("AND jsonb_typeof(records_meta -> $5::text) = 'object'");
    expect(sql.indexOf('completed_at >= $4::timestamptz')).toBeLessThan(sql.indexOf('ORDER BY'));
    expect(sql.indexOf("jsonb_typeof(records_meta -> $5::text) = 'object'")).toBeLessThan(sql.indexOf('ORDER BY'));
    expect(pool.calls[0]?.params[3]).toBe('2026-05-01T12:00:00.000Z');
    expect(pool.calls[0]?.params[4]).toBe('zoning_layers_loaded');
    expect(pool.calls[0]?.params.length).toBe(5);
  });

  it('f) metaObject rejects an injection string and the empty key (bound-key guard)', async () => {
    await expect(
      readRunHistory(new FakePool([]), { slug: 'link_x', metaObject: "x'; DROP" }),
    ).rejects.toThrow(/metaObject/);
    await expect(
      readRunHistory(new FakePool([]), { slug: 'link_x', metaObject: '' }),
    ).rejects.toThrow(/metaObject/);
  });
});
