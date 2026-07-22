// Logic Layer Tests — Supabase restore tooling (scripts/restore-db.js +
// scripts/validation/supabase-load-gates.js)
// SPEC LINK: docs/specs/00-architecture/112_backup_recovery.md §4.3
// SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §5, §9.2, §13
import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const restoreDb = require('../../scripts/restore-db.js') as {
  parseArgs: (argv: string[]) => {
    target: string;
    mode: string | null;
    dumpPath: string | null;
    dumpOut: string | null;
    tables: string[] | null;
    keepDump: boolean;
    skipGates: boolean;
    verifyOnly: boolean;
    iReallyMeanToTruncate: boolean;
    skipTruncate: boolean;
  };
  validateArgs: (args: ReturnType<typeof restoreDb.parseArgs>) => void;
  truncateGuardDecision: (a: {
    authUsersCount: number | null;
    dataRowCounts: Record<string, number | null>;
    override: boolean;
    dataThreshold?: number;
  }) => { allowed: boolean; tripped: boolean; reason: string };
  buildGuardProbeExprs: (scopedTables: string[]) => string[];
  truncateGuardApplies: (targetConnectionString: string) => boolean;
  TRUNCATE_GUARD_DATA_THRESHOLD: number;
  parsePgToolVersion: (v: string) => { major: number; minor: number; patch: number; raw: string };
  isClientVersionSufficient: (v: { major: number }, minMajor?: number) => boolean;
  stderrGateDecision: (a: { exitCode: number; stderr: string }) => { pass: boolean; reason: string };
  quoteIdent: (name: string) => string;
  buildTruncateSql: (tables: string[], opts?: { cascade: boolean }) => string | null;
  buildPgDumpArgs: (a: { tables: string[]; outFile: string; source: { host: string; port: number; user: string; database: string } }) => string[];
  buildPgRestoreArgs: (a: { dumpPath: string; targetConnectionString: string }) => string[];
  unquoteTocIdent: (s: string) => string;
  parseTocTables: (listOutput: string) => Set<string>;
  checkTocCoversScope: (tocTables: Set<string>, scopedTables: string[]) => { covered: boolean; missing: string[] };
  decideDumpPlan: (a: { dumpPath: string | null; dumpOut: string | null; keepDump: boolean }) => {
    mode: 'existing' | 'explicit-out' | 'temp';
    dumpIsTemp: boolean;
  };
  MIN_CLIENT_MAJOR: number;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const gates = require('../../scripts/validation/supabase-load-gates.js') as {
  EXCLUDED_TABLES: string[];
  computeTableList: (a: { sourceTables: string[]; targetTables: string[]; excluded?: string[]; requested?: string[] | null }) => string[];
  quoteIdent: (name: string) => string;
  compareRowCounts: (a: Record<string, number>, b: Record<string, number>) => { table: string; source: number; target: number; status: string }[];
  compareIdSets: (a: number[], b: number[], expected: number) => {
    status: string;
    sourceCount: number;
    targetCount: number;
    idSetMatches: boolean;
    missingInTarget: number[];
    extraInTarget: number[];
  };
  compareSequences: (
    a: { sequence_name: string; last_value: number | null }[],
    b: { sequence_name: string; last_value: number | null }[]
  ) => { sequence: string; source: number | null; target: number | null; status: string }[];
  checkBaselineAssertions: (counts: Record<string, number>, scopedTables: string[]) => { table: string; expected: number; actual: number | null; status: string }[];
  compareRavineEpsilonSample: (
    a: { id: number; value: number | null }[],
    b: { id: number; value: number | null }[],
    opts?: { relEpsilon?: number }
  ) => {
    status: string;
    count: number;
    sourceSum: number;
    targetSum: number;
    sumRelDiff: number;
    maxAbsDiff: number;
    missingKeys: number[];
    nullMismatches: { id: number; source: number | null; target: number | null }[];
  };
  rollUpVerdict: (rows: { status: string }[]) => string;
  applyAuthLinkedExclusion: (a: {
    tables: string[];
    authLinkedTables: string[];
    requested?: string[] | null;
    targetIsLocal: boolean;
  }) => { tables: string[]; excluded: string[] };
  G10_ROW_COUNT_BASELINE: Record<string, number>;
  G10_INVALID_GEOM_EXPECTED_COUNT: Record<string, number>;
};

describe('restore-db.js — parseArgs', () => {
  it('defaults to target=local, mode=null, no scoping', () => {
    const args = restoreDb.parseArgs([]);
    expect(args.target).toBe('local');
    expect(args.mode).toBeNull();
    expect(args.tables).toBeNull();
    expect(args.verifyOnly).toBe(false);
    expect(args.skipGates).toBe(false);
    expect(args.keepDump).toBe(false);
  });

  it('parses --target, --mode, --dump, --dump-out', () => {
    const args = restoreDb.parseArgs(['--target=cloud', '--mode=fresh', '--dump=/tmp/x.dump', '--dump-out=/tmp/y.dump']);
    expect(args.target).toBe('cloud');
    expect(args.mode).toBe('fresh');
    expect(args.dumpPath).toBe('/tmp/x.dump');
    expect(args.dumpOut).toBe('/tmp/y.dump');
  });

  it('parses --tables as a trimmed, non-empty comma list', () => {
    const args = restoreDb.parseArgs(['--tables=trades, logic_variables,  ,parcels']);
    expect(args.tables).toEqual(['trades', 'logic_variables', 'parcels']);
  });

  it('parses bare boolean flags --verify-only, --skip-gates, --keep-dump', () => {
    const args = restoreDb.parseArgs(['--verify-only', '--skip-gates', '--keep-dump']);
    expect(args.verifyOnly).toBe(true);
    expect(args.skipGates).toBe(true);
    expect(args.keepDump).toBe(true);
  });

  it('defaults iReallyMeanToTruncate to false and parses --i-really-mean-to-truncate', () => {
    expect(restoreDb.parseArgs([]).iReallyMeanToTruncate).toBe(false);
    expect(restoreDb.parseArgs(['--i-really-mean-to-truncate']).iReallyMeanToTruncate).toBe(true);
  });

  it('defaults skipTruncate to false and parses --skip-truncate (greenfield empty-target subset load)', () => {
    expect(restoreDb.parseArgs([]).skipTruncate).toBe(false);
    expect(restoreDb.parseArgs(['--skip-truncate']).skipTruncate).toBe(true);
  });

  it('ignores unrecognized flags instead of crashing', () => {
    expect(() => restoreDb.parseArgs(['--bogus-flag=1', '--target=local'])).not.toThrow();
  });
});

describe('restore-db.js — validateArgs (Spec 112 §8 edge case: target-empty state must be stated, not inferred)', () => {
  it('throws when --mode is omitted for a real restore', () => {
    const args = restoreDb.parseArgs(['--target=local']);
    expect(() => restoreDb.validateArgs(args)).toThrow(/--mode/);
  });

  it('accepts --mode=fresh', () => {
    const args = restoreDb.parseArgs(['--target=local', '--mode=fresh']);
    expect(() => restoreDb.validateArgs(args)).not.toThrow();
  });

  it('rejects --mode=dr as not implemented by this tooling', () => {
    const args = restoreDb.parseArgs(['--target=local', '--mode=dr']);
    expect(() => restoreDb.validateArgs(args)).toThrow(/not supported/);
  });

  it('rejects an unknown --target', () => {
    const args = restoreDb.parseArgs(['--target=staging', '--mode=fresh']);
    expect(() => restoreDb.validateArgs(args)).toThrow(/--target/);
  });

  it('does not require --mode when --verify-only is set', () => {
    const args = restoreDb.parseArgs(['--target=local', '--verify-only']);
    expect(() => restoreDb.validateArgs(args)).not.toThrow();
  });
});

describe('restore-db.js — parsePgToolVersion / isClientVersionSufficient (Spec 112 §5)', () => {
  it('parses a typical pg_dump --version string', () => {
    const v = restoreDb.parsePgToolVersion('pg_dump (PostgreSQL) 18.2');
    expect(v).toEqual(expect.objectContaining({ major: 18, minor: 2 }));
  });

  it('parses a version string with a trailing platform suffix', () => {
    const v = restoreDb.parsePgToolVersion('pg_restore (PostgreSQL) 17.0 (Debian 17.0-1.pgdg120+1)');
    expect(v.major).toBe(17);
  });

  it('throws on an unparseable version string', () => {
    expect(() => restoreDb.parsePgToolVersion('not a version')).toThrow();
  });

  it('MIN_CLIENT_MAJOR is 17 (Supabase PG17)', () => {
    expect(restoreDb.MIN_CLIENT_MAJOR).toBe(17);
  });

  it('flags a client older than the target major version as insufficient', () => {
    expect(restoreDb.isClientVersionSufficient({ major: 15 })).toBe(false);
    expect(restoreDb.isClientVersionSufficient({ major: 16 })).toBe(false);
  });

  it('accepts a client at or above the target major version', () => {
    expect(restoreDb.isClientVersionSufficient({ major: 17 })).toBe(true);
    expect(restoreDb.isClientVersionSufficient({ major: 18 })).toBe(true);
  });
});

describe('restore-db.js — stderrGateDecision (Spec 112 §9: "no stderr output" is the pass condition, not exit code)', () => {
  it('passes on exit 0 with empty stderr', () => {
    const r = restoreDb.stderrGateDecision({ exitCode: 0, stderr: '' });
    expect(r.pass).toBe(true);
  });

  it('passes on exit 0 with whitespace-only stderr', () => {
    const r = restoreDb.stderrGateDecision({ exitCode: 0, stderr: '   \n  ' });
    expect(r.pass).toBe(true);
  });

  it('fails on non-zero exit even with empty stderr', () => {
    const r = restoreDb.stderrGateDecision({ exitCode: 1, stderr: '' });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/exit code 1/);
  });

  it('fails on exit 0 with non-empty stderr — the exact silent-partial-failure mode Spec 112 §9 guards against', () => {
    const r = restoreDb.stderrGateDecision({ exitCode: 0, stderr: 'pg_restore: [archiver] could not execute query: ERROR: permission denied' });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/non-empty stderr despite exit 0/);
  });
});

describe('restore-db.js — quoteIdent / buildTruncateSql', () => {
  it('quotes a valid identifier', () => {
    expect(restoreDb.quoteIdent('parcels')).toBe('"parcels"');
  });

  it('rejects identifiers with SQL-injection-shaped content', () => {
    expect(() => restoreDb.quoteIdent('parcels; DROP TABLE users; --')).toThrow();
    expect(() => restoreDb.quoteIdent('parcels"; --')).toThrow();
  });

  it('builds a plain TRUNCATE (no CASCADE) by default — required for a --tables-scoped run', () => {
    const sql = restoreDb.buildTruncateSql(['parcels', 'permits']);
    expect(sql).toBe('TRUNCATE TABLE public."parcels", public."permits"');
  });

  it('builds TRUNCATE ... CASCADE only when explicitly opted in (full-scope run)', () => {
    const sql = restoreDb.buildTruncateSql(['parcels', 'permits'], { cascade: true });
    expect(sql).toBe('TRUNCATE TABLE public."parcels", public."permits" CASCADE');
  });

  it('returns null for an empty table list', () => {
    expect(restoreDb.buildTruncateSql([])).toBeNull();
  });
});

describe('restore-db.js — buildPgDumpArgs / buildPgRestoreArgs', () => {
  it('pg_dump args: custom format, data-only, no-owner/no-acl, one --table per table, --file, positional dbname', () => {
    const args = restoreDb.buildPgDumpArgs({
      tables: ['trades', 'logic_variables'],
      outFile: '/tmp/x.dump',
      source: { host: 'localhost', port: 5432, user: 'postgres', database: 'buildo' },
    });
    expect(args).toContain('--format=custom');
    expect(args).toContain('--data-only');
    expect(args).toContain('--no-owner');
    expect(args).toContain('--no-acl');
    expect(args).toContain('--file');
    expect(args[args.indexOf('--file') + 1]).toBe('/tmp/x.dump');
    expect(args.filter((a) => a === '--table')).toHaveLength(2);
    expect(args).toContain('public.trades');
    expect(args).toContain('public.logic_variables');
    expect(args[args.length - 1]).toBe('buildo');
  });

  it('pg_restore args: single-transaction, exit-on-error, dbname + dump path — NOT --disable-triggers (Supabase postgres role is not superuser)', () => {
    const args = restoreDb.buildPgRestoreArgs({
      dumpPath: '/tmp/x.dump',
      targetConnectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    });
    expect(args).toContain('--single-transaction');
    expect(args).toContain('--exit-on-error');
    expect(args).not.toContain('--disable-triggers');
    expect(args).toContain('--data-only');
    expect(args[args.indexOf('--dbname') + 1]).toBe('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
    expect(args[args.length - 1]).toBe('/tmp/x.dump');
  });
});

describe('restore-db.js — parseTocTables / checkTocCoversScope (Spec 112 §4.3 TOC preflight, the CRITICAL gate)', () => {
  const SAMPLE_LIST_OUTPUT = `;
; Archive created at 2026-07-18 12:00:00 UTC
;     dbname: buildo
;     TOC Entries: 4
;     Format: CUSTOM
;
;
; Selected TOC Entries:
;
3; 2615 12345 SCHEMA - public postgres
181; 0 16400 TABLE DATA public parcels postgres
182; 0 16410 TABLE DATA public permits postgres
183; 0 16420 TABLE DATA public "Trades" postgres
`;

  it('parses TABLE DATA lines into a lowercase schema.table set, ignoring non-TABLE-DATA TOC lines', () => {
    const toc = restoreDb.parseTocTables(SAMPLE_LIST_OUTPUT);
    expect(toc.has('public.parcels')).toBe(true);
    expect(toc.has('public.permits')).toBe(true);
    expect(toc.size).toBe(3);
  });

  it('unquotes a double-quoted identifier (mixed-case table name)', () => {
    const toc = restoreDb.parseTocTables(SAMPLE_LIST_OUTPUT);
    expect(toc.has('public.trades')).toBe(true); // "Trades" -> trades (lowercased)
  });

  it('returns an empty set for empty/garbage input rather than throwing', () => {
    expect(restoreDb.parseTocTables('').size).toBe(0);
    expect(restoreDb.parseTocTables('not a toc listing at all').size).toBe(0);
  });

  it('checkTocCoversScope: covered=true when every scoped table has a TABLE DATA entry', () => {
    const toc = restoreDb.parseTocTables(SAMPLE_LIST_OUTPUT);
    const result = restoreDb.checkTocCoversScope(toc, ['parcels', 'permits']);
    expect(result.covered).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('checkTocCoversScope: covered=false and reports EVERY missing table when the dump is a crafted minimal subset (the exact CRITICAL scenario)', () => {
    const toc = restoreDb.parseTocTables(SAMPLE_LIST_OUTPUT); // has parcels, permits, trades only
    const result = restoreDb.checkTocCoversScope(toc, ['parcels', 'trade_products', 'lead_trades']);
    expect(result.covered).toBe(false);
    expect(result.missing).toEqual(['trade_products', 'lead_trades']);
  });

  it('checkTocCoversScope against a TOC with zero TABLE DATA entries (e.g. a schema-only dump) refuses everything', () => {
    const schemaOnlyToc = restoreDb.parseTocTables('3; 2615 12345 SCHEMA - public postgres\n');
    const result = restoreDb.checkTocCoversScope(schemaOnlyToc, ['parcels']);
    expect(result.covered).toBe(false);
    expect(result.missing).toEqual(['parcels']);
  });
});

describe('restore-db.js — decideDumpPlan (§1a/§1b cleanup-pathing decision — never delete a user-supplied --dump=)', () => {
  it('defaults (no --dump, no --dump-out, no --keep-dump) -> temp mode, deletable', () => {
    const plan = restoreDb.decideDumpPlan({ dumpPath: null, dumpOut: null, keepDump: false });
    expect(plan).toEqual({ mode: 'temp', dumpIsTemp: true });
  });

  it('--keep-dump with no explicit path -> still temp mode, but NOT deletable', () => {
    const plan = restoreDb.decideDumpPlan({ dumpPath: null, dumpOut: null, keepDump: true });
    expect(plan).toEqual({ mode: 'temp', dumpIsTemp: false });
  });

  it('--dump-out=<path> -> explicit-out mode, never deletable (regardless of --keep-dump)', () => {
    expect(restoreDb.decideDumpPlan({ dumpPath: null, dumpOut: '/tmp/mine.dump', keepDump: false })).toEqual({
      mode: 'explicit-out',
      dumpIsTemp: false,
    });
    expect(restoreDb.decideDumpPlan({ dumpPath: null, dumpOut: '/tmp/mine.dump', keepDump: true })).toEqual({
      mode: 'explicit-out',
      dumpIsTemp: false,
    });
  });

  it('--dump=<path> -> existing mode, NEVER deletable — a user-supplied dump is never touched by cleanup', () => {
    expect(restoreDb.decideDumpPlan({ dumpPath: '/tmp/theirs.dump', dumpOut: null, keepDump: false })).toEqual({
      mode: 'existing',
      dumpIsTemp: false,
    });
  });

  it('--dump= takes precedence over --dump-out when both are somehow set', () => {
    const plan = restoreDb.decideDumpPlan({ dumpPath: '/tmp/theirs.dump', dumpOut: '/tmp/mine.dump', keepDump: false });
    expect(plan.mode).toBe('existing');
    expect(plan.dumpIsTemp).toBe(false);
  });
});

describe('restore-db.js — truncateGuardDecision (Phase 4 F0 step 0; C1 rework: scope-aware probes + fail-closed)', () => {
  it('allows an EMPTY target with no flag — the Phase-4.0 cloud load path', () => {
    const d = restoreDb.truncateGuardDecision({
      authUsersCount: 0,
      dataRowCounts: { 'public."parcels"': 0, 'public."trades"': 0 },
      override: false,
    });
    expect(d.allowed).toBe(true);
    expect(d.tripped).toBe(false);
  });

  it('REFUSES a target holding auth.users rows without the override flag', () => {
    const d = restoreDb.truncateGuardDecision({
      authUsersCount: 3,
      dataRowCounts: { 'public."parcels"': 0 },
      override: false,
    });
    expect(d.allowed).toBe(false);
    expect(d.tripped).toBe(true);
    expect(d.reason).toMatch(/REFUSING to TRUNCATE/);
    expect(d.reason).toMatch(/--i-really-mean-to-truncate/);
  });

  it('REFUSES a target holding data rows (parcels belt probe) above the threshold without the flag', () => {
    const d = restoreDb.truncateGuardDecision({
      authUsersCount: 0,
      dataRowCounts: { 'public."parcels"': 486530 },
      override: false,
    });
    expect(d.allowed).toBe(false);
    expect(d.tripped).toBe(true);
  });

  it('C1 CRITICAL scenario: REFUSES when a SCOPED table (--tables subset) holds rows even though auth.users AND parcels are empty — the old fixed probe was blind to this', () => {
    const d = restoreDb.truncateGuardDecision({
      authUsersCount: 0,
      dataRowCounts: { 'public."parcels"': 0, 'public."trades"': 36, 'public."logic_variables"': 397 },
      override: false,
    });
    expect(d.allowed).toBe(false);
    expect(d.tripped).toBe(true);
    expect(d.reason).toMatch(/"trades"=36/);
    expect(d.reason).toMatch(/"logic_variables"=397/);
  });

  it('C1 fail-closed: REFUSES when the auth.users probe errored (null count) — an unverifiable target is never treated as empty', () => {
    const d = restoreDb.truncateGuardDecision({
      authUsersCount: null,
      dataRowCounts: { 'public."parcels"': 0 },
      override: false,
    });
    expect(d.allowed).toBe(false);
    expect(d.tripped).toBe(true);
    expect(d.reason).toMatch(/fails CLOSED/);
    expect(d.reason).toMatch(/auth\.users/);
  });

  it('C1 fail-closed: REFUSES when any scoped-table probe errored (null count)', () => {
    const d = restoreDb.truncateGuardDecision({
      authUsersCount: 0,
      dataRowCounts: { 'public."parcels"': 0, 'public."trades"': null },
      override: false,
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/trades/);
  });

  it('C1 fail-closed + override: proceeds but marks tripped and names the unverifiable probe', () => {
    const d = restoreDb.truncateGuardDecision({
      authUsersCount: null,
      dataRowCounts: {},
      override: true,
    });
    expect(d.allowed).toBe(true);
    expect(d.tripped).toBe(true);
    expect(d.reason).toMatch(/could NOT be verified/);
  });

  it('ALLOWS a populated target when --i-really-mean-to-truncate is passed', () => {
    const d = restoreDb.truncateGuardDecision({
      authUsersCount: 3,
      dataRowCounts: { 'public."parcels"': 486530 },
      override: true,
    });
    expect(d.allowed).toBe(true);
    expect(d.tripped).toBe(true);
    expect(d.reason).toMatch(/proceeding under --i-really-mean-to-truncate/);
  });

  it('TRUNCATE_GUARD_DATA_THRESHOLD is 0 (any real data-bearing rows are a signal)', () => {
    expect(restoreDb.TRUNCATE_GUARD_DATA_THRESHOLD).toBe(0);
  });
});

describe('restore-db.js — buildGuardProbeExprs (C1: the guard probes what the run actually truncates)', () => {
  it('always includes the auth.users + public.parcels belt probes, auth.users first', () => {
    const exprs = restoreDb.buildGuardProbeExprs([]);
    expect(exprs[0]).toBe('auth.users');
    expect(exprs).toContain('public."parcels"');
  });

  it('adds every scoped table, deduplicating parcels against the belt probe', () => {
    const exprs = restoreDb.buildGuardProbeExprs(['trades', 'parcels', 'logic_variables']);
    expect(exprs).toContain('public."trades"');
    expect(exprs).toContain('public."logic_variables"');
    expect(exprs.filter((e) => e === 'public."parcels"')).toHaveLength(1);
    expect(exprs).toHaveLength(4); // auth.users + parcels + trades + logic_variables
  });

  it('refuses an injection-shaped table name (quoteIdent defense-in-depth)', () => {
    expect(() => restoreDb.buildGuardProbeExprs(['parcels; DROP TABLE users; --'])).toThrow();
  });
});

describe('restore-db.js — truncateGuardApplies (Guardian MED-1 regression lock: loopback bypass is intentional)', () => {
  it('does NOT apply to a loopback target — the D13 local truncate-first re-run flow must stay ungated', () => {
    expect(restoreDb.truncateGuardApplies('postgresql://postgres:postgres@127.0.0.1:54322/postgres')).toBe(false);
    expect(restoreDb.truncateGuardApplies('postgresql://postgres:postgres@localhost:5432/buildo')).toBe(false);
  });

  it('APPLIES to any non-loopback (cloud/remote) target', () => {
    expect(
      restoreDb.truncateGuardApplies('postgresql://postgres.abc:pw@aws-0-ca-central-1.pooler.supabase.com:5432/postgres')
    ).toBe(true);
    expect(restoreDb.truncateGuardApplies('postgresql://u:p@db.gcnatfpacuhsytcbaszi.supabase.co:5432/postgres')).toBe(true);
  });
});

describe('supabase-load-gates.js — EXCLUDED_TABLES (the logic_variables decision)', () => {
  it('excludes schema_migrations and spatial_ref_sys only', () => {
    expect(gates.EXCLUDED_TABLES).toEqual(['schema_migrations', 'spatial_ref_sys']);
  });

  it('does NOT exclude logic_variables — dev-DB tuned values must overwrite target seeds', () => {
    expect(gates.EXCLUDED_TABLES).not.toContain('logic_variables');
  });
});

describe('supabase-load-gates.js — computeTableList', () => {
  const sourceTables = ['parcels', 'permits', 'trades', 'schema_migrations', 'spatial_ref_sys', '_backup_scratch'];
  const targetTables = ['parcels', 'permits', 'trades', 'schema_migrations', 'spatial_ref_sys'];

  it('intersects source/target and drops EXCLUDED_TABLES, ignoring source-only scratch tables', () => {
    const tables = gates.computeTableList({ sourceTables, targetTables });
    expect(tables).toEqual(['parcels', 'permits', 'trades']);
  });

  it('honors an explicit --tables subset when every requested table is eligible', () => {
    const tables = gates.computeTableList({ sourceTables, targetTables, requested: ['trades', 'parcels'] });
    expect(tables).toEqual(['parcels', 'trades']);
  });

  it('throws when a requested table is excluded (e.g. schema_migrations)', () => {
    expect(() => gates.computeTableList({ sourceTables, targetTables, requested: ['schema_migrations'] })).toThrow(/not eligible/);
  });

  it('throws when a requested table does not exist on the target', () => {
    expect(() => gates.computeTableList({ sourceTables, targetTables, requested: ['_backup_scratch'] })).toThrow(/not eligible/);
  });

  it('throws when a requested table does not exist on the source at all', () => {
    expect(() => gates.computeTableList({ sourceTables, targetTables, requested: ['nonexistent_table'] })).toThrow(/not eligible/);
  });
});

describe('supabase-load-gates.js — compareRowCounts (gate a)', () => {
  it('PASSes matching counts and FAILs mismatched counts', () => {
    const rows = gates.compareRowCounts({ parcels: 486530, trades: 36 }, { parcels: 486530, trades: 35 });
    const parcelsRow = rows.find((r) => r.table === 'parcels');
    const tradesRow = rows.find((r) => r.table === 'trades');
    expect(parcelsRow?.status).toBe('PASS');
    expect(tradesRow?.status).toBe('FAIL');
  });
});

describe('supabase-load-gates.js — compareIdSets (gate b: invalid-geom id-set diff, Spec 113 §13)', () => {
  it('PASSes on an exact id-set + count match', () => {
    const ids = Array.from({ length: 16 }, (_, i) => i + 1);
    const result = gates.compareIdSets(ids, [...ids], 16);
    expect(result.status).toBe('PASS');
    expect(result.idSetMatches).toBe(true);
  });

  it('FAILs on a matching COUNT but a DIFFERENT id set — the GEOS-drift signal Spec 113 §13 requires catching', () => {
    const sourceIds = [1, 2, 3];
    const targetIds = [1, 2, 4]; // same count, different id 3 -> 4
    const result = gates.compareIdSets(sourceIds, targetIds, 3);
    expect(result.status).toBe('FAIL');
    expect(result.idSetMatches).toBe(false);
    expect(result.missingInTarget).toEqual([3]);
    expect(result.extraInTarget).toEqual([4]);
  });

  it('FAILs when the source count itself does not match the G10 pinned expectation', () => {
    const ids = [1, 2, 3];
    const result = gates.compareIdSets(ids, ids, 16); // G10 expects 16, got 3
    expect(result.status).toBe('FAIL');
  });

  it('G10 pins parcels=16 and building_footprints=17 invalid geometries', () => {
    expect(gates.G10_INVALID_GEOM_EXPECTED_COUNT).toEqual({ parcels: 16, building_footprints: 17 });
  });
});

describe('supabase-load-gates.js — compareSequences (gate c)', () => {
  it('PASSes when last_value matches and FAILs on drift or a missing target sequence', () => {
    const source = [
      { sequence_name: 'parcels_id_seq', last_value: 5836789 },
      { sequence_name: 'coa_applications_id_seq', last_value: 185294 },
      { sequence_name: 'orphan_id_seq', last_value: 1 },
    ];
    const target = [
      { sequence_name: 'parcels_id_seq', last_value: 5836789 },
      { sequence_name: 'coa_applications_id_seq', last_value: 100 }, // drift
    ];
    const rows = gates.compareSequences(source, target);
    expect(rows.find((r) => r.sequence === 'parcels_id_seq')?.status).toBe('PASS');
    expect(rows.find((r) => r.sequence === 'coa_applications_id_seq')?.status).toBe('FAIL');
    expect(rows.find((r) => r.sequence === 'orphan_id_seq')?.status).toBe('FAIL'); // missing on target
  });

  it('treats a null last_value (never-used sequence) as an exact-match candidate', () => {
    const source = [{ sequence_name: 'admin_audit_log_id_seq', last_value: null }];
    const target = [{ sequence_name: 'admin_audit_log_id_seq', last_value: null }];
    const rows = gates.compareSequences(source, target);
    expect(rows[0]?.status).toBe('PASS');
  });
});

describe('supabase-load-gates.js — checkBaselineAssertions (gate f: G10 exact pinned baseline)', () => {
  it('pins the exact G10 baseline row counts', () => {
    expect(gates.G10_ROW_COUNT_BASELINE).toEqual({
      permits: 254082,
      parcels: 486530,
      coa_applications: 33400,
      building_footprints: 427077,
    });
  });

  it('PASSes exact matches for in-scope tables', () => {
    const rows = gates.checkBaselineAssertions({ parcels: 486530 }, ['parcels']);
    expect(rows.find((r) => r.table === 'parcels')?.status).toBe('PASS');
  });

  it('FAILs a rounded/approximate match — G10 pins exact figures, not rounded ones', () => {
    const rows = gates.checkBaselineAssertions({ parcels: 486500 }, ['parcels']);
    expect(rows.find((r) => r.table === 'parcels')?.status).toBe('FAIL');
  });

  it('SKIPs tables outside the run scope (e.g. a --tables smoke subset) instead of false-failing', () => {
    const rows = gates.checkBaselineAssertions({}, ['trades']);
    expect(rows.every((r) => r.status === 'SKIP')).toBe(true);
  });
});

describe('supabase-load-gates.js — compareRavineEpsilonSample (gate g: double-precision epsilon, Spec 113 §12)', () => {
  it('PASSes identical samples', () => {
    const rows = [
      { id: 1, value: 120.71794012 },
      { id: 2, value: 377.38067222 },
    ];
    const result = gates.compareRavineEpsilonSample(rows, rows);
    expect(result.status).toBe('PASS');
    expect(result.count).toBe(2);
  });

  it('PASSes a sub-epsilon float representation difference (e.g. round-trip through pg_dump text encoding)', () => {
    const source = [{ id: 1, value: 120.71794012 }];
    const target = [{ id: 1, value: 120.71794012000001 }]; // far below 1e-9 relative
    const result = gates.compareRavineEpsilonSample(source, target);
    expect(result.status).toBe('PASS');
  });

  it('FAILs a real magnitude drift beyond the relative epsilon', () => {
    const source = [{ id: 1, value: 100.0 }];
    const target = [{ id: 1, value: 100.01 }]; // 1e-4 relative diff, way above 1e-9
    const result = gates.compareRavineEpsilonSample(source, target);
    expect(result.status).toBe('FAIL');
  });

  it('FAILs when a keyed row is missing on the target side', () => {
    const source = [{ id: 1, value: 100.0 }, { id: 2, value: 50.0 }];
    const target = [{ id: 1, value: 100.0 }];
    const result = gates.compareRavineEpsilonSample(source, target);
    expect(result.status).toBe('FAIL');
    expect(result.missingKeys).toEqual([2]);
  });

  it('null==null on both sides is fine — matched, no numeric contribution, no mismatch', () => {
    const rows = [{ id: 1, value: null }, { id: 2, value: 42.0 }];
    const result = gates.compareRavineEpsilonSample(rows, rows);
    expect(result.status).toBe('PASS');
    expect(result.nullMismatches).toEqual([]);
    expect(result.count).toBe(2);
  });

  it('FAILs and reports a nullMismatch when source is populated but target is null (the value did not survive)', () => {
    const source = [{ id: 1, value: 100.0 }];
    const target = [{ id: 1, value: null }];
    const result = gates.compareRavineEpsilonSample(source, target);
    expect(result.status).toBe('FAIL');
    expect(result.nullMismatches).toEqual([{ id: 1, source: 100.0, target: null }]);
  });

  it('FAILs and reports a nullMismatch when source is null but target is populated (the reverse XOR)', () => {
    const source = [{ id: 1, value: null }];
    const target = [{ id: 1, value: 7.5 }];
    const result = gates.compareRavineEpsilonSample(source, target);
    expect(result.status).toBe('FAIL');
    expect(result.nullMismatches).toEqual([{ id: 1, source: null, target: 7.5 }]);
  });

  it('does NOT coalesce a null-mismatch into the numeric epsilon sum as a value-vs-0 comparison', () => {
    // Before the fix, `value ?? 0` would treat a null as exactly 0 and fold
    // it into sourceSum/targetSum — this asserts the null-mismatch row is
    // excluded from the numeric sums entirely, not counted as a 0.
    const source = [{ id: 1, value: null }, { id: 2, value: 10.0 }];
    const target = [{ id: 1, value: 3.0 }, { id: 2, value: 10.0 }];
    const result = gates.compareRavineEpsilonSample(source, target);
    expect(result.nullMismatches).toEqual([{ id: 1, source: null, target: 3.0 }]);
    expect(result.sourceSum).toBe(10.0);
    expect(result.targetSum).toBe(10.0);
    expect(result.status).toBe('FAIL'); // still fails overall due to the null mismatch
  });
});

describe('supabase-load-gates.js — rollUpVerdict (row-derived, never a parallel boolean, Spec 48 §3.6/§3.7)', () => {
  it('is PASS when every row PASSes (INFO/SKIP rows do not count)', () => {
    expect(gates.rollUpVerdict([{ status: 'PASS' }, { status: 'INFO' }, { status: 'SKIP' }])).toBe('PASS');
  });

  it('is FAIL if any row FAILs, even alongside PASS rows', () => {
    expect(gates.rollUpVerdict([{ status: 'PASS' }, { status: 'FAIL' }])).toBe('FAIL');
  });

  it('is WARN if any row WARNs and none FAIL', () => {
    expect(gates.rollUpVerdict([{ status: 'PASS' }, { status: 'WARN' }])).toBe('WARN');
  });
});

describe('supabase-load-gates.js — quoteIdent (shared identifier-safety guard)', () => {
  it('quotes a valid identifier and rejects an injection-shaped one', () => {
    expect(gates.quoteIdent('mv_monthly_permit_stats')).toBe('"mv_monthly_permit_stats"');
    expect(() => gates.quoteIdent('parcels; DROP TABLE users; --')).toThrow();
  });
});

describe('supabase-load-gates.js — applyAuthLinkedExclusion (P4-F0 fold C2: codified auth-linked exclusion)', () => {
  const AUTH_LINKED = ['profiles', 'user_profiles', 'lead_views', 'notifications'];
  const ALL = ['lead_views', 'notifications', 'parcels', 'permits', 'profiles', 'trades', 'user_profiles'];

  it('UNSCOPED run vs a REMOTE target excludes every auth-linked table and reports them', () => {
    const r = gates.applyAuthLinkedExclusion({ tables: ALL, authLinkedTables: AUTH_LINKED, requested: null, targetIsLocal: false });
    expect(r.tables).toEqual(['parcels', 'permits', 'trades']);
    expect(r.excluded).toEqual(['lead_views', 'notifications', 'profiles', 'user_profiles']);
  });

  it('a LOCAL target keeps auth-linked tables in scope — the D13 full-load flow must not lose coverage', () => {
    const r = gates.applyAuthLinkedExclusion({ tables: ALL, authLinkedTables: AUTH_LINKED, requested: null, targetIsLocal: true });
    expect(r.tables).toEqual(ALL);
    expect(r.excluded).toEqual([]);
  });

  it('an explicit --tables scope wins verbatim — the operator may deliberately include an auth-linked table', () => {
    const r = gates.applyAuthLinkedExclusion({
      tables: ['profiles', 'trades'],
      authLinkedTables: AUTH_LINKED,
      requested: ['profiles', 'trades'],
      targetIsLocal: false,
    });
    expect(r.tables).toEqual(['profiles', 'trades']);
    expect(r.excluded).toEqual([]);
  });

  it('no auth-linked tables on the target (plain Postgres, no auth schema) → scope unchanged', () => {
    const r = gates.applyAuthLinkedExclusion({ tables: ALL, authLinkedTables: [], requested: null, targetIsLocal: false });
    expect(r.tables).toEqual(ALL);
    expect(r.excluded).toEqual([]);
  });
});
