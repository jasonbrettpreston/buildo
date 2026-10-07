// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1(e) / §10.1; Spec 124 §5 R-BG (ii); WF3 sql-witness set-op (.cursor/wf3_sql_witness_setop_active_task.md)
//
// RED-first lock for set-operation arms in the SQL witness resolver.
//
// Today `resolveScope` never resolves a UNION / INTERSECT / EXCEPT arm (`SelectStmt.op`
// != SETOP_NONE, arms in `larg`/`rarg`) as its own scope. An arm's columns are therefore
// never credited to the arm's own relations, and a table read ONLY inside an arm's own
// WITH is never witnessed at all — with `error: null`, so nothing surfaces the miss.
//
// The S-tests below are RED until the fix; the F-tests are fences that must pass BOTH
// before and after, so the guard cannot be "fixed" by blanket-loosening the resolver.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';

// Copied verbatim from sql-witness-resolve-five.logic.test.ts (module contract + the
// extra fields this file asserts on: `kind` and `excluded`).
type ResolverModule = {
  init: () => Promise<void>;
  RUNNER_OWNED: Array<{ name: string; cite: string }>;
  resolveStatement: (
    sql: string,
    catalog: Record<string, string[]>,
    opts?: { sessionTemps?: Set<string> },
  ) => {
    kind: string;
    fingerprint: string;
    reads: Record<string, string[]>;
    writes: Record<string, string[]>;
    excluded: string[];
    error: string | null;
  };
  resolveAll: (
    statements: string[],
    catalog: Record<string, string[]>,
  ) => {
    reads: Record<string, string[]>;
    writes: Record<string, string[]>;
    excluded: string[];
    utility: number;
    errors: string[];
  };
  collectSessionTemps: (sql: string, catalog: Record<string, string[]>) => Set<string>;
};

// Loaded lazily inside beforeAll (error re-thrown per test in beforeEach) so a missing
// module turns every test RED instead of failing the file with 0 tests.
let R: ResolverModule;

// Catalog fixture (information_schema.columns snapshot shape).
const CAT: Record<string, string[]> = {
  parcels: ['id', 'bylaw_max_fsi', 'zone', 'lot_area', 'status', 'parent_id'],
  b: ['x', 'y'],
  permits: ['status', 'zone'],
  zoning: ['zone', 'fsi'],
};

// A throwing beforeAll SKIPS tests; a throwing beforeEach FAILS each one, which is what
// the RED evidence needs (>=1 failed assertionResults).
let loadError: unknown = null;
beforeAll(async () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    R = require(path.join(process.cwd(), 'scripts/lib/sql-witness/resolve.cjs')) as ResolverModule;
    await R.init();
  } catch (err) {
    loadError = err;
  }
});
beforeEach(() => {
  if (loadError) throw loadError;
});

// Witness artifacts, read from the repo root (this test runs with cwd = repo root).
const repoPath = (...parts: string[]): string => path.resolve(__dirname, '../..', ...parts);

describe('WF3 sql-witness set-operation arms (RED)', () => {
  it('S1 UNION ALL with qualified alias', () => {
    const r = R.resolveStatement(
      'SELECT 1 FROM b UNION ALL SELECT q.bylaw_max_fsi FROM parcels q',
      CAT,
    );
    expect(r.reads).toEqual({ b: [], parcels: ['bylaw_max_fsi'] });
    expect(r.error).toBeNull();
  });

  it('S2 UNION of two single-column arms', () => {
    const r = R.resolveStatement('SELECT x FROM b UNION SELECT zone FROM parcels', CAT);
    expect(r.reads).toEqual({ b: ['x'], parcels: ['zone'] });
    expect(r.error).toBeNull();
  });

  it('S3 INTERSECT', () => {
    const r = R.resolveStatement(
      'SELECT zone FROM parcels INTERSECT SELECT zone FROM zoning',
      CAT,
    );
    expect(r.reads).toEqual({ parcels: ['zone'], zoning: ['zone'] });
    expect(r.error).toBeNull();
  });

  it('S4 EXCEPT with a WHERE in the right arm', () => {
    const r = R.resolveStatement(
      'SELECT zone FROM parcels EXCEPT SELECT zone FROM zoning WHERE fsi > 1',
      CAT,
    );
    expect(r.reads).toEqual({ parcels: ['zone'], zoning: ['fsi', 'zone'] });
    expect(r.error).toBeNull();
  });

  it('S5 three chained arms', () => {
    const r = R.resolveStatement(
      'SELECT x FROM b UNION SELECT zone FROM parcels UNION SELECT status FROM permits',
      CAT,
    );
    expect(r.reads).toEqual({ b: ['x'], parcels: ['zone'], permits: ['status'] });
    expect(r.error).toBeNull();
  });

  it('S6 parenthesised arms with aliases', () => {
    const r = R.resolveStatement(
      "(SELECT x FROM b) UNION ALL (SELECT p.lot_area FROM parcels p WHERE p.zone = 'R')",
      CAT,
    );
    expect(r.reads).toEqual({ b: ['x'], parcels: ['lot_area', 'zone'] });
    expect(r.error).toBeNull();
  });

  it('S7 nested parenthesised EXCEPT as the right arm', () => {
    const r = R.resolveStatement(
      'SELECT x FROM b UNION (SELECT zone FROM parcels EXCEPT SELECT zone FROM zoning)',
      CAT,
    );
    expect(r.reads).toEqual({ b: ['x'], parcels: ['zone'], zoning: ['zone'] });
    expect(r.error).toBeNull();
  });

  it("S8 a WITH over the set-op node (arm tables read only inside the CTE)", () => {
    const r = R.resolveStatement(
      'WITH c AS (SELECT x FROM b UNION ALL SELECT bylaw_max_fsi FROM parcels) SELECT * FROM c',
      CAT,
    );
    expect(r.reads).toEqual({ b: ['x'], parcels: ['bylaw_max_fsi'] });
    expect(r.error).toBeNull();
  });

  it('S9 a set-op subquery in FROM with an alias', () => {
    const r = R.resolveStatement(
      'SELECT s.v FROM (SELECT x AS v FROM b UNION ALL SELECT lot_area FROM parcels) s',
      CAT,
    );
    expect(r.reads).toEqual({ b: ['x'], parcels: ['lot_area'] });
    expect(r.error).toBeNull();
  });

  it('S10 IN (subquery) whose subquery is a set-op', () => {
    const r = R.resolveStatement(
      'SELECT x FROM b WHERE y IN (SELECT zone FROM parcels UNION SELECT status FROM permits)',
      CAT,
    );
    expect(r.reads).toEqual({ b: ['x', 'y'], parcels: ['zone'], permits: ['status'] });
    expect(r.error).toBeNull();
  });

  it('S11 INSERT … SELECT set-op', () => {
    const r = R.resolveStatement(
      'INSERT INTO b (x) SELECT zone FROM parcels UNION SELECT status FROM permits',
      CAT,
    );
    expect(r.reads).toEqual({ parcels: ['zone'], permits: ['status'] });
    expect(r.writes).toEqual({ b: ['x'] });
    expect(r.error).toBeNull();
  });

  it('S12 UPDATE … WHERE … IN (set-op subquery)', () => {
    const r = R.resolveStatement(
      "UPDATE b SET y = 'z' WHERE x IN (SELECT zone FROM parcels EXCEPT SELECT zone FROM zoning WHERE fsi > 2)",
      CAT,
    );
    expect(r.reads).toEqual({ b: ['x'], parcels: ['zone'], zoning: ['fsi', 'zone'] });
    expect(r.writes).toEqual({ b: ['y'] });
    expect(r.error).toBeNull();
  });

  it('S13 a parenthesised WITH-arm: the arm-only CTE table must be witnessed', () => {
    const r = R.resolveStatement(
      '(WITH c AS (SELECT lot_area FROM parcels) SELECT lot_area FROM c) UNION SELECT fsi FROM zoning',
      CAT,
    );
    expect(r.reads).toEqual({ parcels: ['lot_area'], zoning: ['fsi'] });
    // The table-level miss: `parcels` is read ONLY by the arm's own WITH, and today
    // it never reaches `reads` at all.
    expect(Object.keys(r.reads)).toContain('parcels');
    expect(r.error).toBeNull();
  });

  it('S14 both arms reuse the same alias name `p` for different tables', () => {
    const r = R.resolveStatement(
      'SELECT p.zone FROM parcels p UNION ALL SELECT p.status FROM permits p',
      CAT,
    );
    expect(r.reads).toEqual({ parcels: ['zone'], permits: ['status'] });
    expect(r.error).toBeNull();
  });

  it('S15 EXISTS with a two-arm set-op and correlated outer references', () => {
    const r = R.resolveStatement(
      'SELECT x FROM b WHERE EXISTS (SELECT 1 FROM parcels WHERE parcels.zone = b.x UNION ALL SELECT 1 FROM zoning WHERE zoning.fsi::text = b.y)',
      CAT,
    );
    expect(r.reads).toEqual({ b: ['x', 'y'], parcels: ['zone'], zoning: ['fsi'] });
    expect(r.error).toBeNull();
  });

  it('S16 WITH RECURSIVE whose recursive term is a UNION ALL arm', () => {
    const r = R.resolveStatement(
      'WITH RECURSIVE t AS (SELECT id, parent_id FROM parcels WHERE id = 1 UNION ALL SELECT p.id, p.parent_id FROM parcels p JOIN t ON p.parent_id = t.id) SELECT id FROM t',
      CAT,
    );
    expect(r.reads).toEqual({ parcels: ['id', 'parent_id'] });
    expect(r.error).toBeNull();
  });

  it('S17 LIMIT (subquery) where the subquery is itself a set-op', () => {
    const r = R.resolveStatement(
      'SELECT x FROM b UNION SELECT zone FROM parcels LIMIT (SELECT max(fsi) FROM zoning)',
      CAT,
    );
    expect(r.reads).toEqual({ b: ['x'], parcels: ['zone'], zoning: ['fsi'] });
    expect(r.error).toBeNull();
  });

  it('S18 UPDATE … FROM (set-op subquery) binds the derived alias and reads both arms', () => {
    const r = R.resolveStatement(
      'UPDATE b SET y = s.zone FROM (SELECT id, zone FROM parcels UNION SELECT 1, zone FROM zoning WHERE fsi > 1) s WHERE b.x = s.zone',
      CAT,
    );
    expect(r.reads).toEqual({ b: ['x'], parcels: ['id', 'zone'], zoning: ['fsi', 'zone'] });
    expect(r.writes).toEqual({ b: ['y'] });
    expect(r.error).toBeNull();
  });

  it('S19 unknown qualifier inside an arm is refused by name', () => {
    // The refuse-by-name contract must hold inside an arm too. No reads/null-error
    // assertion here: today the arm is skipped entirely, so the wrong qualifier is
    // silently accepted.
    const r = R.resolveStatement(
      'SELECT x FROM b UNION SELECT q.zone FROM parcels p',
      CAT,
    );
    expect(r.error).toBe('FAIL:INPUT:column:zone');
  });

  it('S20 unqualified unknown column in a two-relation arm is refused by name', () => {
    const r = R.resolveStatement(
      'SELECT x FROM b UNION SELECT nope FROM parcels p, zoning z',
      CAT,
    );
    expect(r.error).toBe('FAIL:INPUT:column:nope');
  });

  it('S21 a WITH on the set-op node itself feeds both arms', () => {
    const r = R.resolveStatement(
      'WITH c AS (SELECT zone FROM parcels) SELECT zone FROM c UNION SELECT zone FROM zoning',
      CAT,
    );
    expect(r.reads).toEqual({ parcels: ['zone'], zoning: ['zone'] });
    expect(r.error).toBeNull();
  });

  it('S22 JOIN inside an arm; `status` binds to the arm\'s own relation', () => {
    const r = R.resolveStatement(
      'SELECT status FROM permits UNION SELECT status FROM parcels JOIN zoning ON parcels.zone = zoning.zone',
      CAT,
    );
    expect(r.reads).toEqual({ parcels: ['status', 'zone'], permits: ['status'], zoning: ['zone'] });
    expect(r.error).toBeNull();
  });

  it('S23 a VALUES arm', () => {
    const r = R.resolveStatement('SELECT x FROM b UNION VALUES (1)', CAT);
    expect(r.reads).toEqual({ b: ['x'] });
    expect(r.error).toBeNull();
  });

  it('S24 EXCEPT ALL', () => {
    const r = R.resolveStatement('SELECT zone FROM parcels EXCEPT ALL SELECT zone FROM zoning', CAT);
    expect(r.reads).toEqual({ parcels: ['zone'], zoning: ['zone'] });
    expect(r.error).toBeNull();
  });

  it('S25 INSERT … WITH … SELECT set-op', () => {
    const r = R.resolveStatement(
      'INSERT INTO b (x) WITH c AS (SELECT zone FROM parcels) SELECT zone FROM c UNION SELECT status FROM permits',
      CAT,
    );
    expect(r.reads).toEqual({ parcels: ['zone'], permits: ['status'] });
    expect(r.writes).toEqual({ b: ['x'] });
    expect(r.error).toBeNull();
  });
});

describe('WF3 sql-witness set-operation fences (GREEN before and after)', () => {
  it('F1 a set-op ORDER BY names an OUTPUT column and credits nothing', () => {
    const r = R.resolveStatement('SELECT x AS v FROM b UNION SELECT zone FROM parcels ORDER BY v', CAT);
    expect(Object.values(r.reads).flat()).not.toContain('v');
    expect(r.error).toBeNull();
  });

  it('F2 a non-set-op unknown qualifier is still refused by name', () => {
    const r = R.resolveStatement('SELECT q.nope FROM parcels p', CAT);
    expect(r.error).toBe('FAIL:INPUT:column:nope');
  });

  it('F3 JoinExpr also uses larg/rarg keys', () => {
    const r = R.resolveStatement('SELECT x, fsi FROM b JOIN zoning ON zone = x', CAT);
    expect(r.reads).toEqual({ b: ['x'], zoning: ['fsi', 'zone'] });
    expect(r.error).toBeNull();
  });

  it('F4 a plain qualified select from one table', () => {
    const r = R.resolveStatement('SELECT q.bylaw_max_fsi FROM parcels q', CAT);
    expect(r.reads).toEqual({ parcels: ['bylaw_max_fsi'] });
    expect(r.error).toBeNull();
  });

  it('F5 a constants-only UNION reads nothing', () => {
    const r = R.resolveStatement('SELECT 1 UNION SELECT 2', CAT);
    expect(r.reads).toEqual({});
    expect(r.error).toBeNull();
  });

  it('F6 the committed link_parcels primary match SQL resolves to its committed trace entry', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildMatchSql } = require(
      path.join(process.cwd(), 'scripts/lib/compute/link-parcels.js'),
    ) as { buildMatchSql: (d: unknown, c: unknown, m: string) => { primary_match_sql: string } };
    const sql = buildMatchSql(null, null, 'full').primary_match_sql;
    const catalog = (
      JSON.parse(
        fs.readFileSync(repoPath('docs/reports/witness/_catalog.json'), 'utf8'),
      ) as { tables: Record<string, string[]> }
    ).tables;

    const r = R.resolveStatement(sql, catalog);
    expect(r.error).toBeNull();
    expect(r.fingerprint).toBe('c10cd7338ceb2234');

    const trace = JSON.parse(
      fs.readFileSync(
        repoPath('docs/reports/witness/link_parcels/post/sources.trace.json'),
        'utf8',
      ),
    ) as { statements: Array<{ fingerprint: string; reads: Record<string, string[]> }> };
    const pinned = trace.statements.find((s) => s.fingerprint === r.fingerprint);
    expect(pinned).toBeDefined();
    expect(r.reads).toEqual(pinned!.reads);
  });

  it('F7 the committed link_wsib derivation SQL resolves to its committed trace entry', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildDerivationSql } = require(
      path.join(process.cwd(), 'scripts/lib/compute/link-wsib.js'),
    ) as {
      buildDerivationSql: (
        d: unknown,
        c: Record<string, number>,
      ) => { diff_sql: string };
    };
    const descriptor = JSON.parse(
      fs.readFileSync(repoPath('scripts/link-wsib.descriptor.json'), 'utf8'),
    );
    const sql = buildDerivationSql(descriptor, {
      wsib_fuzzy_match_threshold: 0.5,
      wsib_confidence_exact_trade: 1,
      wsib_confidence_exact_legal: 0.95,
      wsib_confidence_fuzzy: 0.6,
    }).diff_sql;
    const catalog = (
      JSON.parse(
        fs.readFileSync(repoPath('docs/reports/witness/_catalog.json'), 'utf8'),
      ) as { tables: Record<string, string[]> }
    ).tables;

    const r = R.resolveStatement(sql, catalog);
    expect(r.error).toBeNull();
    expect(r.fingerprint).toBe('10ee26a7b34c8467');

    const trace = JSON.parse(
      fs.readFileSync(
        repoPath('docs/reports/witness/link_wsib/post/sources-full-forced-4.trace.json'),
        'utf8',
      ),
    ) as { statements: Array<{ fingerprint: string; reads: Record<string, string[]> }> };
    const pinned = trace.statements.find((s) => s.fingerprint === r.fingerprint);
    expect(pinned).toBeDefined();
    expect(r.reads).toEqual(pinned!.reads);
  });
});
