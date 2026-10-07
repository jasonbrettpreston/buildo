// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-UNIVERSE (census arm), §10 (--refresh-census,
//            determinism rules), §11 Inputs (one BEGIN TRANSACTION READ ONLY session);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-15 (direct-lot census, R -1 sentinel), M-42 (R-ZV);
//            docs/reports/mcbylaw-phase1-plan.md S11
//
// S11 census module, offline: the witness check on census.sql (SELECT-only, catalog columns, shape, R-ZV),
// the pure census build (sentinel on its own line, threshold summary, determinism), the G-UNIVERSE census
// arm (blob sha, counts present, arithmetic, stale -> not_run) and the read-only refresh session (fake client).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module / seed JSON
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const C = await load('scripts/analysis/bylaw/census.mjs');
const SNAP = await load('scripts/analysis/bylaw/snapshot.mjs');

const CATALOG = { parcels: ['bylaw_max_fsi', 'exception_number', 'zoning_class', 'zoning_overlays'], permits: ['permit_num'] };
const GOOD_SQL = [
  'WITH base AS (SELECT p.zoning_class AS zone, p.exception_number AS exception_number FROM parcels p)',
  "SELECT 'database' AS kind, NULL::text AS zone, NULL::integer AS exception_number, current_database() AS label, NULL::bigint AS n",
  "UNION ALL SELECT 'source_rows', NULL, NULL, 'parcels', count(*) FROM base",
  "UNION ALL SELECT 'exception', b.zone, b.exception_number, NULL, count(*) FROM base b GROUP BY b.zone, b.exception_number",
  '',
].join('\n');

// A small DB answer: R 10 lots (x5: 4, x7: 1, sentinel 3, none 2), RD 6 lots (x5: 6), 2 unzoned, 4 coverage-null.
const ROWS = [
  { kind: 'database', zone: null, exception_number: null, label: 'postgres', n: null },
  { kind: 'source_rows', zone: null, exception_number: null, label: 'parcels', n: '18' },
  { kind: 'residential', zone: 'R', exception_number: null, label: null, n: '10' },
  { kind: 'residential', zone: 'RD', exception_number: null, label: null, n: '6' },
  { kind: 'exception', zone: 'R', exception_number: 5, label: null, n: '4' },
  { kind: 'exception', zone: 'R', exception_number: 7, label: null, n: '1' },
  { kind: 'exception', zone: 'RD', exception_number: 5, label: null, n: '6' },
  { kind: 'sentinel', zone: 'R', exception_number: -1, label: null, n: '3' },
  { kind: 'no_exception', zone: 'R', exception_number: null, label: null, n: '2' },
  { kind: 'unzoned', zone: null, exception_number: null, label: null, n: '2' },
  { kind: 'coverage_null', zone: 'R', exception_number: null, label: null, n: '4' },
];
const READS = { parcels: ['exception_number', 'zoning_class'] };
const build = (rows = ROWS, extra: Json = {}) => C.buildCensus({ rows, sqlBlobSha: C.gitBlobSha(Buffer.from(GOOD_SQL, 'utf8')), adoptionId: 'adoption-1', reads: READS, minDirectLots: 4, ...extra });

const check = (root: string): Promise<Json> => C.checkCensus({ root, minDirectLots: 4 });

function tmpRoot(census: Json | null, { sql = GOOD_SQL, adoption = 'adoption-1' }: { sql?: string | null; adoption?: string } = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bylaw-census-'));
  const seeds = path.join(root, 'scripts/seeds/bylaw');
  fs.mkdirSync(seeds, { recursive: true });
  fs.mkdirSync(path.join(root, 'docs/reports/witness'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs/reports/witness/_catalog.json'), JSON.stringify({ catalog_version: 1, tables: CATALOG }));
  fs.writeFileSync(path.join(seeds, 'adoptions.json'), JSON.stringify({ adoptions: [{ adoption_id: 'adoption-1' }, ...(adoption === 'adoption-1' ? [] : [{ adoption_id: adoption }])] }));
  if (sql !== null) fs.writeFileSync(path.join(seeds, 'census.sql'), sql);
  if (census) fs.writeFileSync(path.join(seeds, 'census.json'), SNAP.stableStringify(census));
  return root;
}

describe('gitBlobSha', () => {
  it('equals `git hash-object` (the blob sha G-UNIVERSE compares)', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bylaw-blob-')), 'x.sql');
    fs.writeFileSync(f, GOOD_SQL);
    const git = execFileSync('git', ['hash-object', f], { encoding: 'utf8' }).trim();
    expect(C.gitBlobSha(Buffer.from(GOOD_SQL, 'utf8'))).toBe(git);
  });
});

describe('witnessCheck — census.sql is SELECT-only with catalog columns (Spec 68 §9 G-UNIVERSE census arm)', () => {
  it('good: one SELECT, catalog columns, catalog tables only inside a CTE', async () => {
    const r = await C.witnessCheck(GOOD_SQL, CATALOG);
    expect(r.violations).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.reads).toEqual({ parcels: ['exception_number', 'zoning_class'] });
  });

  const bad: Array<[string, string, string]> = [
    ['a write', 'census_sql_not_select_only', 'UPDATE parcels SET zoning_class = NULL'],
    ['two statements', 'census_sql_not_select_only', 'SELECT 1; SELECT 2'],
    ['a SET before the SELECT', 'census_sql_not_select_only', 'SET search_path = public; SELECT p.zoning_class FROM parcels p'],
    ['unparseable text', 'census_sql_parse_error', 'SELEC zoning_class FROM parcels'],
    ['a table the catalog does not carry', 'census_sql_uncatalogued_table', 'SELECT n.x FROM not_a_table n'],
    ['a column the catalog does not carry', 'census_sql_unknown_column', 'SELECT p.nope FROM parcels p'],
    ['a parcels.bylaw_* read (R-ZV, M-42)', 'census_reads_bylaw_column', 'SELECT p.bylaw_max_fsi FROM parcels p'],
    ['a catalog table read in a UNION arm (resolver blind spot)', 'census_sql_shape', 'WITH b AS (SELECT p.zoning_class FROM parcels p) SELECT 1 FROM b UNION ALL SELECT 2 FROM parcels q'],
    ['a bylaw_* read hidden in a UNION arm', 'census_reads_bylaw_column', 'WITH b AS (SELECT p.zoning_class FROM parcels p) SELECT 1 FROM b UNION ALL SELECT q.bylaw_max_fsi FROM parcels q'],
    ['a set operation inside the CTE', 'census_sql_shape', 'WITH b AS (SELECT p.zoning_class FROM parcels p UNION SELECT p.zoning_class FROM parcels p) SELECT 1 FROM b'],
    ['a star read (would carry bylaw_*)', 'census_sql_shape', 'WITH b AS (SELECT p.* FROM parcels p) SELECT 1 FROM b'],
    ['a star read is also caught by the expanded reads', 'census_reads_bylaw_column', 'WITH b AS (SELECT p.* FROM parcels p) SELECT 1 FROM b'],
    ['a whole-row read (row_to_json(p))', 'census_sql_shape', 'WITH b AS (SELECT row_to_json(p) AS j FROM parcels p) SELECT 1 FROM b'],
    ['a quoted mixed-case "Bylaw_" column', 'census_reads_bylaw_column', 'WITH b AS (SELECT p."Bylaw_Max_Fsi" FROM parcels p) SELECT 1 FROM b'],
    ['SELECT ... INTO', 'census_sql_not_select_only', 'SELECT p.zoning_class INTO scratch FROM parcels p'],
    ['FOR UPDATE', 'census_sql_not_select_only', 'WITH b AS (SELECT p.zoning_class FROM parcels p FOR UPDATE) SELECT 1 FROM b'],
    ['a data-modifying CTE', 'census_sql_not_select_only', 'WITH d AS (DELETE FROM parcels RETURNING zoning_class) SELECT 1 FROM d'],
  ];
  for (const [name, code, sql] of bad) {
    it(`bad: ${name} -> ${code}`, async () => {
      const r = await C.witnessCheck(sql, CATALOG);
      expect(r.pass).toBe(false);
      expect(r.violations.some((v: string) => v.startsWith(`${code}:`))).toBe(true);
    });
  }
});

describe('buildCensus — direct-lot backlog (Spec 69 M-15)', () => {
  it('backlog by zone and exception, sentinel on its own line, never counted as an exception', () => {
    const c = build();
    expect(c.backlog).toEqual([
      { exception_number: 5, lots: 6, zone: 'RD' },
      { exception_number: 5, lots: 4, zone: 'R' },
      { exception_number: 7, lots: 1, zone: 'R' },
    ]);
    expect(c.sentinel).toEqual([{ exception_number: -1, lots: 3, zone: 'R' }]);
    expect(c.excepted).toEqual({ by_zone: { R: { exceptions: 2, lots: 5 }, RD: { exceptions: 1, lots: 6 } }, exceptions: 3, lots: 11 });
    expect(c.residential).toEqual({ by_zone: { R: 10, RD: 6 }, lots: 16 });
    expect(c.no_exception).toEqual({ by_zone: { R: 2 }, lots: 2 });
  });

  it('threshold summary uses direct lots over excepted lots (sentinel excluded from the denominator)', () => {
    const c = build();
    expect(c.min_direct_lots).toBe(4);
    expect(c.at_or_above_threshold).toEqual({ exceptions: 2, lots: 10, share_of_excepted: 0.909091 });
    expect(c.below_threshold).toEqual({ exceptions: 1, lots: 1 });
  });

  it('unzoned parcels and the coverage-null share are stated once, from data', () => {
    const c = build();
    expect(c.unzoned_parcels).toBe(2);
    expect(c.coverage_null).toEqual({ by_zone: { R: 4 }, lots: 4, of_residential: 16, share: 0.25 });
  });

  it('records the SQL blob sha, DB name, source-table row counts, the reads and the adoption id', () => {
    const c = build();
    expect(c.sql).toEqual({ blob_sha: C.gitBlobSha(Buffer.from(GOOD_SQL, 'utf8')), path: 'scripts/seeds/bylaw/census.sql' });
    expect(c.database).toBe('postgres');
    expect(c.source_tables).toEqual({ parcels: 18 });
    expect(c.reads).toEqual(READS);
    expect(c.adoption_id).toBe('adoption-1');
    expect(JSON.stringify(c)).not.toMatch(/generated_at|mtime|refreshed_at/);
  });

  it('is deterministic: row order does not change the bytes', () => {
    const a = SNAP.stableStringify(build());
    const b = SNAP.stableStringify(build([...ROWS].reverse()));
    expect(b).toBe(a);
  });

  it('refuses rows with no database line, a read table with no source_rows line, an unknown kind or a non-integer count', () => {
    expect(() => build(ROWS.filter((r) => r.kind !== 'database'))).toThrow(/census_counts_missing/);
    expect(() => build(ROWS.filter((r) => r.kind !== 'source_rows'))).toThrow(/census_counts_missing/);
    expect(() => build([...ROWS, { kind: 'mystery', zone: null, exception_number: null, label: null, n: '1' }])).toThrow(/census_unknown_row/);
    expect(() => build(ROWS.map((r) => (r.kind === 'unzoned' ? { ...r, n: 'x' } : r)))).toThrow(/census_counts_missing/);
  });
});

describe('checkCensus — G-UNIVERSE census arm', () => {
  it('good: pass', async () => {
    const r = await check(tmpRoot(build()));
    expect(r.violations).toEqual([]);
    expect(r.status).toBe('pass');
    expect(r.pass).toBe(true);
  });

  it('census.sql edited after the census ran -> FAIL census_sql_sha_mismatch', async () => {
    const r = await check(tmpRoot(build(), { sql: `${GOOD_SQL}-- edited\n` }));
    expect(r.status).toBe('fail');
    expect(r.violations.some((v: string) => v.startsWith('census_sql_sha_mismatch:'))).toBe(true);
  });

  it('census.sql missing -> FAIL census_sql_missing; census.json missing -> FAIL census_json_missing', async () => {
    expect((await check(tmpRoot(build(), { sql: null }))).violations.some((v: string) => v.startsWith('census_sql_missing:'))).toBe(true);
    const r = await check(tmpRoot(null));
    expect(r.status).toBe('fail');
    expect(r.violations.some((v: string) => v.startsWith('census_json_missing:'))).toBe(true);
  });

  it('census.sql that is not SELECT-only -> FAIL (even when census.json carries its sha)', async () => {
    const sql = 'UPDATE parcels SET zoning_class = NULL\n';
    const census = { ...build(), sql: { blob_sha: C.gitBlobSha(Buffer.from(sql, 'utf8')), path: 'scripts/seeds/bylaw/census.sql' } };
    const r = await check(tmpRoot(census, { sql }));
    expect(r.status).toBe('fail');
    expect(r.violations.some((v: string) => v.startsWith('census_sql_not_select_only:'))).toBe(true);
  });

  it('counts absent -> FAIL census_counts_missing (database, a source table, residential)', async () => {
    for (const mutate of [
      (c: Json) => ({ ...c, database: '' }),
      (c: Json) => ({ ...c, source_tables: {} }),
      (c: Json) => ({ ...c, residential: { by_zone: {}, lots: 0 } }),
      (c: Json) => {
        const { unzoned_parcels: _u, ...rest } = c; // eslint-disable-line @typescript-eslint/no-unused-vars
        return rest;
      },
    ]) {
      const r = await check(tmpRoot(mutate(build())));
      expect(r.status).toBe('fail');
      expect(r.violations.some((v: string) => v.startsWith('census_counts_missing:'))).toBe(true);
    }
  });

  it('hand-edited count that breaks the partition -> FAIL census_arithmetic', async () => {
    const c = build();
    const r = await check(tmpRoot({ ...c, excepted: { ...c.excepted, lots: c.excepted.lots + 1 } }));
    expect(r.status).toBe('fail');
    expect(r.violations.some((v: string) => v.startsWith('census_arithmetic:'))).toBe(true);
  });

  it('a newer adoption than the census ran against -> not_run (census_stale), exit-neutral', async () => {
    const r = await check(tmpRoot(build(), { adoption: 'adoption-2' }));
    expect(r.status).toBe('not_run');
    expect(r.pass).toBe(false);
    expect(r.violations).toEqual(['census_stale: census.json ran against adoption-1, latest adoption is adoption-2']);
  });
});

describe('refreshCensus — one BEGIN TRANSACTION READ ONLY session (Spec 68 §11 Inputs)', () => {
  function fakeConnect(readOnly = 'on') {
    const calls: string[] = [];
    let closed = false;
    const client = {
      query: async (sql: string) => {
        calls.push(sql.trim().split('\n')[0] ?? '');
        if (/^SHOW transaction_read_only/.test(sql)) return { rows: [{ transaction_read_only: readOnly }] };
        if (/^WITH base/.test(sql)) return { rows: ROWS };
        return { rows: [] };
      },
    };
    return { calls, isClosed: () => closed, connect: async () => ({ client, close: async () => { closed = true; } }) };
  }

  it('runs census.sql inside a read-only transaction, rolls back, writes census.json deterministically', async () => {
    const root = tmpRoot(null);
    const f = fakeConnect();
    const { census } = await C.refreshCensus({ root, connect: f.connect, minDirectLots: 4 });
    expect(f.calls).toEqual(['BEGIN TRANSACTION READ ONLY', 'SHOW transaction_read_only', 'WITH base AS (SELECT p.zoning_class AS zone, p.exception_number AS exception_number FROM parcels p)', 'ROLLBACK']);
    expect(f.isClosed()).toBe(true);
    const text = fs.readFileSync(path.join(root, 'scripts/seeds/bylaw/census.json'), 'utf8');
    expect(text).toBe(SNAP.stableStringify(census));
    expect(text.includes('\r')).toBe(false);
    expect((await check(root)).status).toBe('pass');
  });

  it('a session that is not read-only -> refused, rolled back, nothing written', async () => {
    const root = tmpRoot(null);
    const f = fakeConnect('off');
    await expect(C.refreshCensus({ root, connect: f.connect, minDirectLots: 4 })).rejects.toThrow(/census_session_not_read_only/);
    expect(f.calls).toContain('ROLLBACK');
    expect(f.calls.some((c) => c.startsWith('WITH base'))).toBe(false);
    expect(f.isClosed()).toBe(true);
    expect(fs.existsSync(path.join(root, 'scripts/seeds/bylaw/census.json'))).toBe(false);
  });

  it('a census.sql that fails the witness check never opens a connection', async () => {
    const root = tmpRoot(null, { sql: 'UPDATE parcels SET zoning_class = NULL\n' });
    const f = fakeConnect();
    await expect(C.refreshCensus({ root, connect: f.connect })).rejects.toThrow(/census_sql_not_select_only/);
    expect(f.calls).toEqual([]);
  });
});

describe('review-lens fixes (DeepSeek spec / error-paths / idempotency, adjudicated)', () => {
  it('a census built under another threshold FAILs against the ruling constant (min_direct_lots bound to M-15)', async () => {
    const census = C.buildCensus({ rows: ROWS, sqlBlobSha: C.gitBlobSha(Buffer.from(GOOD_SQL, 'utf8')), adoptionId: 'adoption-1', reads: READS, minDirectLots: 1 });
    const r = await check(tmpRoot(census));
    expect(r.status).toBe('fail');
    expect(r.violations.some((v: string) => v.startsWith('census_arithmetic: min_direct_lots 1'))).toBe(true);
  });

  for (const [name, mutate] of [
    ['a hand-edited share', (c: Json) => ({ ...c, coverage_null: { ...c.coverage_null, share: 0.5 } })],
    ['a hand-edited by_zone count', (c: Json) => ({ ...c, excepted: { ...c.excepted, by_zone: { ...c.excepted.by_zone, RD: { exceptions: 1, lots: 7 } } } })],
    ['a reordered backlog', (c: Json) => ({ ...c, backlog: [...c.backlog].reverse() })],
    ['an extra field', (c: Json) => ({ ...c, note: 'typed by hand' })],
  ] as Array<[string, (c: Json) => Json]>) {
    it(`${name} -> FAIL census_arithmetic (derived fields are re-derived)`, async () => {
      const r = await check(tmpRoot(mutate(build())));
      expect(r.status).toBe('fail');
      expect(r.violations.some((v: string) => v.startsWith('census_arithmetic:'))).toBe(true);
    });
  }

  it('reads in census.json that differ from the witness reads -> FAIL census_reads_mismatch', async () => {
    const census = C.buildCensus({ rows: ROWS, sqlBlobSha: C.gitBlobSha(Buffer.from(GOOD_SQL, 'utf8')), adoptionId: 'adoption-1', reads: { parcels: ['zoning_class'] }, minDirectLots: 4 });
    const r = await check(tmpRoot(census));
    expect(r.violations.some((v: string) => v.startsWith('census_reads_mismatch:'))).toBe(true);
  });

  it('a malformed census.json or adoptions.json is a named FAIL, never a throw', async () => {
    const root = tmpRoot(build());
    fs.writeFileSync(path.join(root, 'scripts/seeds/bylaw/census.json'), '{"truncated":');
    fs.writeFileSync(path.join(root, 'scripts/seeds/bylaw/adoptions.json'), '{"adoptions": []}');
    const r = await check(root);
    expect(r.status).toBe('fail');
    expect(r.violations.filter((v: string) => v.startsWith('census_input_unreadable:')).length).toBe(2);
  });

  it('a duplicate or non-identifier zone row is refused (no by_zone overwrite, no __proto__ key)', () => {
    expect(() => build([...ROWS, { kind: 'residential', zone: 'R', exception_number: null, label: null, n: '1' }])).toThrow(/census_unknown_row: residential: duplicate zone R/);
    expect(() => build([...ROWS, { kind: 'coverage_null', zone: '__proto__', exception_number: null, label: null, n: '1' }])).toThrow(/census_unknown_row/);
  });

  it('a failing ROLLBACK does not mask the read-only refusal', async () => {
    const root = tmpRoot(null);
    const logs: string[] = [];
    const client = {
      query: async (sql: string) => {
        if (sql === 'ROLLBACK') throw new Error('connection terminated');
        if (sql === 'SHOW transaction_read_only') return { rows: [{ transaction_read_only: 'off' }] };
        return { rows: [] };
      },
    };
    await expect(C.refreshCensus({ root, connect: async () => ({ client, close: async () => {} }), log: (m: string) => logs.push(m) })).rejects.toThrow(/census_session_not_read_only/);
    expect(logs.some((m) => m.includes('ROLLBACK failed'))).toBe(true);
  });
});
