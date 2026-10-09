// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1(e) / §10.1; Spec 124 §5 R-BG (ii); WF3 sql-witness DML CTE (.cursor/wf3_sql_witness_dml_cte_active_task.md)
//
// RED-first lock for data-modifying CTEs (INSERT/UPDATE/DELETE inside WITH) and for the
// PG18 `returningClause.exprs` shape in the SQL witness resolver.
//
// Two defects today:
//   (1) a data-modifying CTE body is resolved as a READ scope — `resolveCtes` calls
//       `resolveScope` on every CTE body, so an INSERT/UPDATE/DELETE inside WITH produces
//       reads and no writes, and the statement is classified `read` instead of `write`;
//   (2) libpg-query 18 moved a RETURNING column list to `returningClause.exprs`, but the
//       resolver still reads `returningList`, so RETURNING columns are never witnessed
//       (so RETURNING columns and RETURNING subqueries are silently dropped).
//
// The D-tests and R-tests below are RED until the fix; the F-tests are fences that must
// pass BOTH before and after, so the guard cannot be "fixed" by blanket-loosening the
// resolver.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { pathToFileURL } from 'node:url';
import path from 'path';
import fs from 'fs';

// Copied verbatim from sql-witness-resolve-setop.logic.test.ts (module contract + the
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
  parcels: ['id', 'bylaw_max_fsi', 'zone', 'lot_area', 'parent_id'],
  b: ['x', 'y'],
  permits: ['id', 'status', 'zone'],
  zoning: ['zone', 'fsi'],
};

type Expectation = {
  kind: string;
  reads: Record<string, string[]>;
  writes: Record<string, string[]>;
  excluded?: string[];
};

// Throwing beforeAll SKIPS tests; a throwing beforeEach FAILS each one (RED evidence).
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

// Assert the whole result shape (plus a null error) in one place.
const expectRes = (sql: string, cat: Record<string, string[]>, exp: Expectation): void => {
  const r = R.resolveStatement(sql, cat);
  expect({
    kind: r.kind,
    reads: r.reads,
    writes: r.writes,
    excluded: r.excluded,
    error: r.error,
  }).toEqual({
    kind: exp.kind,
    reads: exp.reads,
    writes: exp.writes,
    excluded: exp.excluded === undefined ? [] : exp.excluded,
    error: null,
  });
};

// The real committed catalog (information_schema.columns snapshot) for the D19-D21 cases.
const realCatalog = (): Record<string, string[]> =>
  (
    JSON.parse(
      fs.readFileSync(repoPath('docs/reports/witness/_catalog.json'), 'utf8'),
    ) as { tables: Record<string, string[]> }
  ).tables;

const BT = String.fromCharCode(96); // the backtick, built without one in source

describe('WF3 sql-witness DML CTE (RED)', () => {
  it('D1 a DELETE CTE with RETURNING makes the statement a write', () => {
    expectRes('WITH del AS (DELETE FROM b WHERE x = 1 RETURNING *) SELECT * FROM del', CAT, {
      kind: 'write',
      reads: { b: ['x'] },
      writes: { b: [] },
    });
  });

  it('D2 a DELETE CTE without RETURNING still writes the target', () => {
    expectRes('WITH del AS (DELETE FROM b WHERE x = 1) SELECT 1', CAT, {
      kind: 'write',
      reads: { b: ['x'] },
      writes: { b: [] },
    });
  });

  it('D3 an INSERT CTE with RETURNING writes every listed column', () => {
    expectRes('WITH ins AS (INSERT INTO b (x, y) VALUES (1, 2) RETURNING x) SELECT x FROM ins', CAT, {
      kind: 'write',
      reads: { b: ['x'] },
      writes: { b: ['x', 'y'] },
    });
  });

  it('D4 an INSERT … SELECT CTE reads the source table', () => {
    expectRes(
      'WITH ins AS (INSERT INTO b (x) SELECT zone FROM parcels WHERE lot_area > 1 RETURNING x) SELECT count(*) FROM ins',
      CAT,
      {
        kind: 'write',
        reads: { b: ['x'], parcels: ['lot_area', 'zone'] },
        writes: { b: ['x'] },
      },
    );
  });

  it('D5 an UPDATE CTE writes and reads the same target', () => {
    expectRes('WITH u AS (UPDATE b SET x = 2 WHERE y = 3 RETURNING x) SELECT * FROM u', CAT, {
      kind: 'write',
      reads: { b: ['x', 'y'] },
      writes: { b: ['x'] },
    });
  });

  it('D6 an UPDATE … FROM CTE with aliases', () => {
    expectRes(
      'WITH u AS (UPDATE parcels p SET zone = z.zone FROM zoning z WHERE p.lot_area > z.fsi RETURNING p.id) SELECT count(*) FROM u',
      CAT,
      {
        kind: 'write',
        reads: { parcels: ['id', 'lot_area'], zoning: ['fsi', 'zone'] },
        writes: { parcels: ['zone'] },
      },
    );
  });

  it('D7 two chained data-modifying CTEs', () => {
    expectRes(
      'WITH d AS (DELETE FROM b WHERE x = 1 RETURNING x, y), i AS (INSERT INTO permits (id, status) SELECT x, y FROM d RETURNING id) SELECT count(*) FROM i',
      CAT,
      {
        kind: 'write',
        reads: { b: ['x', 'y'], permits: ['id'] },
        writes: { b: [], permits: ['id', 'status'] },
      },
    );
  });

  it('D8 a read CTE feeding an INSERT CTE stays a CTE, never a table', () => {
    const sql =
      'WITH pb AS (SELECT id FROM parcels), i AS (INSERT INTO b (x) SELECT pb.id FROM pb RETURNING x) SELECT count(*) FROM i';
    const r = R.resolveStatement(sql, CAT);
    expect({
      kind: r.kind,
      reads: r.reads,
      writes: r.writes,
      excluded: r.excluded,
      error: r.error,
    }).toEqual({
      kind: 'write',
      reads: { b: ['x'], parcels: ['id'] },
      writes: { b: ['x'] },
      excluded: [],
      error: null,
    });
    expect(r.reads.pb).toBeUndefined();
  });

  it('D9 an UPDATE CTE whose FROM is a read CTE', () => {
    expectRes(
      'WITH pb AS (SELECT id, zone FROM parcels), u AS (UPDATE permits t SET status = pb.zone FROM pb WHERE t.id = pb.id RETURNING t.id) SELECT 1',
      CAT,
      {
        kind: 'write',
        reads: { parcels: ['id', 'zone'], permits: ['id'] },
        writes: { permits: ['status'] },
      },
    );
  });

  it('D10a a DELETE … USING CTE', () => {
    expectRes(
      'WITH pb AS (SELECT id FROM parcels), d AS (DELETE FROM permits t USING pb WHERE t.id = pb.id) SELECT 1',
      CAT,
      {
        kind: 'write',
        reads: { parcels: ['id'], permits: ['id'] },
        writes: { permits: [] },
      },
    );
  });

  it('D10b a DELETE … IN (SELECT … FROM cte) CTE', () => {
    expectRes(
      'WITH pb AS (SELECT id FROM parcels), d AS (DELETE FROM permits WHERE id IN (SELECT id FROM pb)) SELECT 1',
      CAT,
      {
        kind: 'write',
        reads: { parcels: ['id'], permits: ['id'] },
        writes: { permits: [] },
      },
    );
  });

  it('D11 a WITH whose PG18 shape is a top-level INSERT', () => {
    expectRes('WITH d AS (DELETE FROM b WHERE x = 1 RETURNING x) INSERT INTO permits (id) SELECT x FROM d', CAT, {
      kind: 'write',
      reads: { b: ['x'] },
      writes: { b: [], permits: ['id'] },
    });
  });

  it('D12 a WITH whose PG18 shape is a top-level UPDATE', () => {
    expectRes(
      "WITH i AS (INSERT INTO b (x) VALUES (1) RETURNING x) UPDATE parcels SET zone = 'R' WHERE id IN (SELECT x FROM i)",
      CAT,
      {
        kind: 'write',
        reads: { b: ['x'], parcels: ['id'] },
        writes: { b: ['x'], parcels: ['zone'] },
      },
    );
  });

  it('D13 a WITH whose PG18 shape is a top-level DELETE', () => {
    expectRes(
      'WITH u AS (UPDATE b SET y = 2 RETURNING x) DELETE FROM parcels WHERE id IN (SELECT x FROM u)',
      CAT,
      {
        kind: 'write',
        reads: { b: ['x'], parcels: ['id'] },
        writes: { b: ['y'], parcels: [] },
      },
    );
  });

  it('D14 an INSERT … ON CONFLICT DO UPDATE CTE', () => {
    expectRes(
      'WITH ins AS (INSERT INTO b (x, y) VALUES (1, 2) ON CONFLICT (x) DO UPDATE SET y = EXCLUDED.y RETURNING x) SELECT count(*) FROM ins',
      CAT,
      {
        kind: 'write',
        reads: { b: ['x'] },
        writes: { b: ['x', 'y'] },
      },
    );
  });

  it('D15 a data-modifying CTE on a runner-owned table is write with the table excluded', () => {
    expectRes(
      'WITH d AS (DELETE FROM pipeline_runs WHERE id = 1 RETURNING id) SELECT count(*) FROM d',
      CAT,
      {
        kind: 'write',
        reads: {},
        writes: {},
        excluded: ['pipeline_runs'],
      },
    );
  });

  it('D16 a data-modifying CTE feeding a set-op arm', () => {
    expectRes(
      'WITH d AS (DELETE FROM b RETURNING x) SELECT x FROM d UNION ALL SELECT id FROM parcels',
      CAT,
      {
        kind: 'write',
        reads: { b: ['x'], parcels: ['id'] },
        writes: { b: [] },
      },
    );
  });

  it('D17 a data-modifying CTE as the second statement of a text', () => {
    expectRes('SELECT 1; WITH d AS (DELETE FROM b RETURNING x) SELECT x FROM d', CAT, {
      kind: 'write',
      reads: { b: ['x'] },
      writes: { b: [] },
    });
  });

  it('D17b the write kind does not leak into the next resolveStatement / resolveAll call', () => {
    const writeSql = 'WITH d AS (DELETE FROM b RETURNING x) SELECT x FROM d';
    const readSql = 'WITH c AS (SELECT zone FROM parcels) SELECT zone FROM c';
    expect(R.resolveStatement(writeSql, CAT).kind).toBe('write');
    const second = R.resolveStatement(readSql, CAT);
    expect(second.kind).toBe('read');
    expect(second.writes).toEqual({});
    expect(R.resolveAll([writeSql, readSql], CAT)).toEqual({
      reads: { b: ['x'], parcels: ['zone'] },
      writes: { b: [] },
      excluded: [],
      utility: 0,
      errors: [],
    });
  });

  it('D18 a data-modifying CTE joined by the outer query', () => {
    expectRes(
      "WITH u AS (UPDATE parcels SET zone = 'R' WHERE id = 1 RETURNING id) SELECT p.zone FROM parcels p JOIN u ON u.id = p.id",
      CAT,
      {
        kind: 'write',
        reads: { parcels: ['id', 'zone'] },
        writes: { parcels: ['zone'] },
      },
    );
  });

  it('D19 the committed link_parcel_addresses batch SQL', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildBatchSql } = require(
      path.join(process.cwd(), 'scripts/lib/compute/link-parcel-addresses.js'),
    ) as { buildBatchSql: () => string };
    expectRes(buildBatchSql(), realCatalog(), {
      kind: 'write',
      reads: {
        address_points: ['address_point_id', 'geom', 'retired_at'],
        parcel_address_points: ['parcel_id'],
        parcels: ['geom', 'id'],
      },
      writes: { parcel_address_points: ['address_point_id', 'computed_at', 'parcel_id'] },
    });
  });

  it('D20 the committed enrich_parcels retirement DELETE', () => {
    const src = fs.readFileSync(repoPath('scripts/lib/compute/enrich-parcels.js'), 'utf8');
    const sql = src.slice(
      src.indexOf(`${BT}WITH victims AS (`) + 1,
      src.indexOf(`FROM victims${BT}`) + `FROM victims`.length,
    );
    expect(sql.startsWith('WITH victims AS (')).toBe(true);
    expectRes(sql, realCatalog(), {
      kind: 'write',
      reads: { enrich_parcels_pass3_scope: ['consumed_at', 'created_at', 'run_id'] },
      writes: { enrich_parcels_pass3_scope: [] },
      excluded: ['pipeline_runs'],
    });
  });

  it('D21 the committed leads/view route CTE', () => {
    const src = fs.readFileSync(repoPath('src/app/api/leads/view/route.ts'), 'utf8');
    const sql = src.slice(
      src.indexOf(`${BT}WITH ins AS (`) + 1,
      src.indexOf(`AND EXISTS (SELECT 1 FROM ins)`) + `AND EXISTS (SELECT 1 FROM ins)`.length,
    );
    expect(sql.startsWith('WITH ins AS (')).toBe(true);
    const r = R.resolveStatement(sql, realCatalog());
    expect({
      kind: r.kind,
      reads: r.reads,
      writes: r.writes,
      excluded: r.excluded,
      error: r.error,
    }).toEqual({
      kind: 'write',
      reads: { user_profiles: ['lead_views_count', 'user_id'] },
      writes: {
        lead_view_events: ['permit_num', 'revision_num', 'user_id'],
        user_profiles: ['lead_views_count'],
      },
      excluded: [],
      error: null,
    });
    expect(r.reads.lead_view_events).toBeUndefined();
  });

  it('D22 a MERGE CTE body is refused by name, never a silent read', () => {
    const C: Record<string, string[]> = { load_parcels: ['id', 'v'], src: ['id', 'v'] };
    const r = R.resolveStatement(
      'WITH d AS (MERGE INTO load_parcels p USING src s ON p.id = s.id WHEN MATCHED THEN UPDATE SET v = s.v RETURNING p.id) SELECT * FROM d',
      C,
    );
    expect(r.error).toBe('FAIL:INPUT:unsupported:MergeStmt');
  });

  it('D23 a temp CTAS over a DML CTE is a write', () => {
    const C: Record<string, string[]> = { load_parcels: ['id', 'v'], src: ['id', 'v'] };
    const r = R.resolveStatement(
      'CREATE TEMP TABLE s AS WITH d AS (DELETE FROM load_parcels RETURNING *) SELECT * FROM d',
      C,
    );
    expect(r.kind).toBe('write');
    expect(r.writes).toEqual({ load_parcels: [] });
    expect(r.error).toBeNull();
  });
});

describe('WF3 sql-witness RETURNING (RED)', () => {
  it('R1 UPDATE RETURNING a non-SET column', () => {
    expectRes('UPDATE b SET x = 1 RETURNING y', CAT, {
      kind: 'write',
      reads: { b: ['y'] },
      writes: { b: ['x'] },
    });
  });

  it('R1b DELETE WHERE RETURNING', () => {
    expectRes('DELETE FROM b WHERE x = 1 RETURNING y', CAT, {
      kind: 'write',
      reads: { b: ['x', 'y'] },
      writes: { b: [] },
    });
  });

  it('R2 UPDATE RETURNING a scalar subquery', () => {
    expectRes('UPDATE b SET x = 1 RETURNING (SELECT max(fsi) FROM zoning)', CAT, {
      kind: 'write',
      reads: { zoning: ['fsi'] },
      writes: { b: ['x'] },
    });
  });

  it('R3 INSERT RETURNING a column not in the INSERT list', () => {
    expectRes('INSERT INTO b (x) VALUES (1) RETURNING y', CAT, {
      kind: 'write',
      reads: { b: ['y'] },
      writes: { b: ['x'] },
    });
  });
});

describe('WF3 sql-witness DML CTE fences (green before and after)', () => {
  it('R4 ON CONFLICT DO UPDATE RETURNING the xmax system column errors nowhere and is never credited', () => {
    expectRes(
      'INSERT INTO b (x) VALUES (1) ON CONFLICT (x) DO UPDATE SET y = 2 RETURNING (xmax = 0) AS is_insert',
      CAT,
      {
        kind: 'write',
        reads: {},
        writes: { b: ['x', 'y'] },
      },
    );
  });

  it('F1a a plain INSERT', () => {
    expectRes('INSERT INTO b (x, y) VALUES (1, 2)', CAT, {
      kind: 'write',
      reads: {},
      writes: { b: ['x', 'y'] },
    });
  });

  it('F1b a plain UPDATE', () => {
    expectRes('UPDATE b SET x = 2 WHERE y = 3', CAT, {
      kind: 'write',
      reads: { b: ['y'] },
      writes: { b: ['x'] },
    });
  });

  it('F1c a plain DELETE', () => {
    expectRes('DELETE FROM b WHERE x = 1', CAT, {
      kind: 'write',
      reads: { b: ['x'] },
      writes: { b: [] },
    });
  });

  it('F2 a plain read CTE', () => {
    expectRes('WITH c AS (SELECT zone FROM parcels) SELECT zone FROM c', CAT, {
      kind: 'read',
      reads: { parcels: ['zone'] },
      writes: {},
    });
  });

  it('F3 a read CTE feeding a top-level INSERT', () => {
    expectRes('WITH c AS (SELECT zone FROM parcels) INSERT INTO b (x) SELECT zone FROM c', CAT, {
      kind: 'write',
      reads: { parcels: ['zone'] },
      writes: { b: ['x'] },
    });
  });

  it('F4 an unknown column inside a data-modifying CTE is still refused by name', () => {
    const r = R.resolveStatement('WITH d AS (DELETE FROM b WHERE q.nope = 1) SELECT 1', CAT);
    expect(r.error).toBe('FAIL:INPUT:column:nope');
  });

  it('F5 the census witnessCheck still refuses a data-modifying CTE', async () => {
    const C = (await import(
      pathToFileURL(path.join(process.cwd(), 'scripts/analysis/bylaw/census.mjs')).href
    )) as {
      witnessCheck: (
        sql: string,
        catalog: Record<string, string[]>,
      ) => Promise<{ pass: boolean; violations: string[] }>;
    };
    const w = await C.witnessCheck('WITH d AS (DELETE FROM parcels RETURNING zoning_class) SELECT 1 FROM d', {
      parcels: ['bylaw_max_fsi', 'exception_number', 'zoning_class', 'zoning_overlays'],
      permits: ['permit_num'],
    });
    expect(w.pass).toBe(false);
    expect(w.violations.some((v) => v.startsWith('census_sql_not_select_only:'))).toBe(true);
  });
});
