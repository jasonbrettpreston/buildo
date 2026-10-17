// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-BZ, CP-S2 ctx.tempTable)
//
// RED — S2-T1. The module under test does NOT exist yet:
//   scripts/lib/step/temp-table.js  (CommonJS, exports `makeTempTable(client, tag)`)
//
// R-BZ / Spec 122a §A26 G5: the compute owns the SELECT and NOTHING ELSE. The DDL half of a
// temp-table build (DROP → CREATE TEMP … ON COMMIT DROP → optional CREATE INDEX → ANALYZE) is
// harness policy, so it moves behind the `ctx.tempTable` seam. Two consequences are pinned here:
//
//   1. the seam issues the DDL in a fixed, exact shape (tests 1-4), and
//   2. every surviving compute-side "temp builder" returns BARE SQL — a WITH/SELECT statement
//      with no DDL verbs in it (test 5). The two builders that today return DDL
//      (`buildCompCandidatesIndexSql` in enrich-parcels, `DROP_TEMP_SQL` in enrich-centreline)
//      must be gone from the module surface entirely.
//
// The CREATE's `params` argument is load-bearing: a call with NO values array keeps pg's
// SIMPLE protocol, which is the only reason the legacy multi-statement DDL string ever worked
// (enrich-parcels.js:1186-1199 documents the "cannot insert multiple commands into a prepared
// statement" failure that splitting it out fixed). The seam must reproduce that distinction,
// so test 2 asserts `params === undefined` rather than an empty array.

import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const ROOT = '../../';
const tempTableModulePath = `${ROOT}scripts/lib/step/temp-table.js`;

/** gate E — the G2 side helper, an ESM module (dynamic import via a file URL). */
const gateModulePath = pathToFileURL(
  path.resolve(process.cwd(), 'scripts/analysis/gates/compute-purity-sql.mjs'),
).href;

/** The G4 seam introduced by R-BZ. */
const mod = require(tempTableModulePath) as {
  makeTempTable: (
    client: unknown,
    tag: string,
  ) => (opts: {
    name: string;
    selectSql: string;
    params?: unknown[];
    index?: { name: string; using: string; column: string };
    analyze?: boolean;
  }) => Promise<void>;
};

type Call = { sql: string; params: unknown };

type FakeClient = { calls: Call[]; query: (sql: string, params?: unknown[]) => Promise<unknown> };

/** Records every query the seam issues, in order. Mirrors the harness client shape. */
function makeFakeClient(): FakeClient {
  return {
    calls: [] as Call[],
    query(sql: string, params?: unknown[]) {
      this.calls.push({ sql, params });
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
}

// ---------------------------------------------------------------------------
// The DDL the seam owns (R-BZ G4). No compute module may hold these verbs.
// ---------------------------------------------------------------------------

const IDENT = /^[a-z_][a-z0-9_]*$/;
const DDL_VERBS = /CREATE\s+TEMP|DROP\s+TABLE|ON\s+COMMIT\s+DROP|CREATE\s+INDEX|\bANALYZE\s/i;

/** Strip leading whitespace and leading `--` line comments, then report whether the statement
 * opens with WITH or SELECT (case-insensitive). This is the shape every compute builder must
 * now return: a bare query, never a statement frame. */
function opensWithQuery(sql: string): boolean {
  let s = sql;
  // Trim whitespace and peel any leading line comments.
  for (;;) {
    s = s.replace(/^[\s]+/, '');
    if (s.startsWith('--')) {
      const nl = s.indexOf('\n');
      if (nl === -1) return false;
      s = s.slice(nl + 1);
      continue;
    }
    break;
  }
  return /^(WITH|SELECT)\b/i.test(s);
}

describe('ctx.tempTable seam — DDL shape (R-BZ G4)', () => {
  it('issues exactly DROP then CREATE TEMP … ON COMMIT DROP AS, in order', async () => {
    const client = makeFakeClient();
    const tempTable = mod.makeTempTable(client, 'unit_test');

    await tempTable({ name: 't_x', selectSql: 'SELECT 1 AS a', params: [5] });

    expect(client.calls).toEqual([
      { sql: 'DROP TABLE IF EXISTS t_x', params: undefined },
      { sql: 'CREATE TEMP TABLE t_x ON COMMIT DROP AS\nSELECT 1 AS a', params: [5] },
    ]);
  });

  it('passes params === undefined when no values are supplied (simple protocol stays available)', async () => {
    const client = makeFakeClient();
    const tempTable = mod.makeTempTable(client, 'unit_test');

    await tempTable({ name: 't_y', selectSql: 'SELECT 1 AS a' });

    expect(client.calls).toHaveLength(2);
    expect(client.calls[0]).toEqual({ sql: 'DROP TABLE IF EXISTS t_y', params: undefined });
    expect(client.calls[1]!.sql).toBe('CREATE TEMP TABLE t_y ON COMMIT DROP AS\nSELECT 1 AS a');
    // NOT [] — a values array would flip the CREATE onto the extended protocol.
    expect(client.calls[1]!.params).toBeUndefined();
  });

  it('appends CREATE INDEX then ANALYZE, both parameterless, when index/analyze are requested', async () => {
    const client = makeFakeClient();
    const tempTable = mod.makeTempTable(client, 'unit_test');

    await tempTable({
      name: 't_x',
      selectSql: 'SELECT 1 AS a',
      params: [5],
      index: { name: 't_x_gix', using: 'gist', column: 'geom' },
      analyze: true,
    });

    expect(client.calls).toHaveLength(4);
    expect(client.calls.slice(2)).toEqual([
      { sql: 'CREATE INDEX t_x_gix ON t_x USING gist (geom)', params: undefined },
      { sql: 'ANALYZE t_x', params: undefined },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Refusals. The seam is the only place identifiers enter DDL, so it must refuse
// anything that is not a bare lowercase SQL identifier — BEFORE it issues a query.
// ---------------------------------------------------------------------------

describe('ctx.tempTable seam — identifier refusals (R-BZ G4)', () => {
  const refuse = async (opts: Parameters<ReturnType<typeof mod.makeTempTable>>[0]) => {
    const client = makeFakeClient();
    const tempTable = mod.makeTempTable(client, 'unit_test');
    await expect(tempTable(opts)).rejects.toThrow(/ctx\.tempTable/);
    // A refusal must never reach the database, not even the DROP.
    expect(client.calls).toEqual([]);
  };

  it('refuses an injected name', async () => {
    await refuse({ name: 't; DROP TABLE parcels', selectSql: 'SELECT 1 AS a' });
  });

  it('refuses an uppercase name', async () => {
    await refuse({ name: 'Parcels', selectSql: 'SELECT 1 AS a' });
  });

  it('refuses a selectSql that is not a query', async () => {
    await refuse({ name: 't_x', selectSql: 'CREATE TABLE y AS SELECT 1' });
  });

  it('refuses a selectSql that drops', async () => {
    await refuse({ name: 't_x', selectSql: 'DROP TABLE y' });
  });

  it('refuses an unknown index method', async () => {
    await refuse({
      name: 't_x',
      selectSql: 'SELECT 1 AS a',
      index: { name: 't_x_gix', using: 'gist; x', column: 'geom' },
    });
  });

  it('refuses an injected index column', async () => {
    await refuse({
      name: 't_x',
      selectSql: 'SELECT 1 AS a',
      index: { name: 't_x_gix', using: 'gist', column: 'geom)' },
    });
  });

  // The predicates the refusals above are instances of.
  it('pins the admitted identifier / index-method / query-shape grammar', () => {
    expect(IDENT.test('t_x')).toBe(true);
    expect(IDENT.test('t; DROP TABLE parcels')).toBe(false);
    expect(IDENT.test('Parcels')).toBe(false);
    expect(IDENT.test('geom)')).toBe(false);
    expect(['gist', 'btree']).toContain('gist');
    expect(['gist', 'btree']).toContain('btree');
    expect(['gist', 'btree']).not.toContain('gist; x');
    // Leading line comments are peeled before the WITH/SELECT test; case is irrelevant.
    expect(opensWithQuery('  select 1')).toBe(true);
    expect(opensWithQuery('-- note\nWITH x AS (SELECT 1) SELECT * FROM x')).toBe(true);
    expect(opensWithQuery('CREATE TABLE y AS SELECT 1')).toBe(false);
    expect(opensWithQuery('DROP TABLE y')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 5 — compute owns ONLY the SELECT (R-BZ G4, Spec 122a §A26 G5).
// ---------------------------------------------------------------------------

describe('compute owns only the SELECT (R-BZ G4)' , () => {
  const centrelineMod = require(`${ROOT}scripts/lib/compute/enrich-centreline.js`) as {
    buildTempSql: (opts: { scoped?: boolean }, cfg: Record<string, unknown>) => string;
    DROP_TEMP_SQL?: unknown;
  };
  const parcelsMod = require(`${ROOT}scripts/lib/compute/enrich-parcels.js`) as Record<string, unknown>;

  // Every config.enrich_centreline_* key buildTempSql reads (:73-79). Small numbers only —
  // this test reads the SQL text, it never executes it.
  const cfg = {
    enrich_centreline_proximity_m: 1,
    enrich_centreline_pair_cap: 1,
    enrich_centreline_abut_m: 1,
    enrich_centreline_parallel_tol_deg: 1,
    enrich_centreline_azimuth_sample_m: 1,
    enrich_centreline_through_opposite_tol_deg: 1,
  };

  const builders: Array<[string, () => string]> = [
    ['enrich-centreline buildTempSql (full)', () => centrelineMod.buildTempSql({ scoped: false }, cfg)],
    ['enrich-centreline buildTempSql (scoped)', () => centrelineMod.buildTempSql({ scoped: true }, cfg)],
    [
      // ≈:287 buildEnrichmentSql — the builder whose body today opens with
      // `CREATE TEMP TABLE parcel_zoning_enrich ON COMMIT DROP AS`.
      'enrich-parcels buildEnrichmentSql',
      () =>
        (parcelsMod.buildEnrichmentSql as (o: Record<string, unknown>) => string)({
          scopeWhere: 'TRUE',
          full: true,
          staleOverlays: new Set(),
          bboxDivisor: 1,
        }),
    ],
    [
      // ≈:527 buildMaxBuildSql — today returns `CREATE TEMP TABLE parcel_max_build …`.
      'enrich-parcels buildMaxBuildSql',
      () =>
        (parcelsMod.buildMaxBuildSql as (o: Record<string, unknown>) => string)({
          scopeWhere: 'TRUE',
          full: true,
          storeyHeight: {},
          acc: {},
          mislinkTol: 1,
          minDim: 1,
          lotMinSqm: 1,
          lotMaxSqm: 1,
        }),
    ],
    [
      // ≈:954 buildExistingStructureSql — today returns `CREATE TEMP TABLE parcel_existing_struct …`.
      'enrich-parcels buildExistingStructureSql',
      () =>
        (parcelsMod.buildExistingStructureSql as (o: Record<string, unknown>) => string)({
          scopeWhere: 'TRUE',
          full: true,
        }),
    ],
    [
      // ≈:1150 buildCompCandidatesSql — today returns `CREATE TEMP TABLE comp_cand …`; the
      // DDL pair that used to ride the same string now belongs to the ctx.tempTable seam
      // (the `index` + `analyze` options, see the shape tests above).
      'enrich-parcels buildCompCandidatesSql',
      () =>
        (parcelsMod.buildCompCandidatesSql as (o: Record<string, unknown>) => string)({
          asOfDateParamIndex: 1,
          windowYearsParamIndex: 2,
        }),
    ],
  ];

  for (const [label, render] of builders) {
    it(`${label} returns bare WITH/SELECT SQL and no DDL verbs`, () => {
      const sql = render();
      expect(typeof sql).toBe('string');
      expect(opensWithQuery(sql)).toBe(true);
      expect(sql).not.toMatch(DDL_VERBS);
    });
  }

  it('no longer exports buildCompCandidatesIndexSql (the seam owns CREATE INDEX/ANALYZE)', () => {
    expect(parcelsMod.buildCompCandidatesIndexSql).toBeUndefined();
  });

  it('no longer exports DROP_TEMP_SQL from enrich-centreline (the seam owns the DROP)', () => {
    expect(centrelineMod.DROP_TEMP_SQL).toBeUndefined();
  });
});

// --------------------------------------------------------------------------------------
// gate E — the G2 counterpart. S2 moved `CREATE TEMP TABLE` text out of the compute and
// behind the `ctx.tempTable` seam, so `collectFileTemps` (compute-purity-sql.mjs) must
// also read a LITERAL-named `ctx.tempTable` call as a session temp the file owns; else
// every later read of that temp is a false G2 `compute-undeclared-relation`.
// --------------------------------------------------------------------------------------
describe('gate E — ctx.tempTable declares a session temp (G2)', () => {
  const tempTableSrc = `await ctx.tempTable({ name: 'tmp_a', selectSql: q })`;
  const templateNameSrc = 'await ctx.tempTable({ name: `tmp_b`, selectSql: q })';
  const dynamicNameSrc = 'await ctx.tempTable({ name: n, selectSql: q })';
  const controlNameSrc = `await ctx.tempTable({ name: 'pipeline_runs', selectSql: q })`;

  const tempsOf = async (src: string) => {
    const { collectFileTemps } = await import(gateModulePath);
    const sf = ts.createSourceFile('x.js', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    return collectFileTemps(sf, []);
  };

  it('a string-literal name declares the temp', async () => {
    expect([...(await tempsOf(tempTableSrc))]).toContain('tmp_a');
  });

  it('a no-substitution template name declares the temp', async () => {
    expect([...(await tempsOf(templateNameSrc))]).toContain('tmp_b');
  });

  it('a non-literal name declares nothing (the set stays closed)', async () => {
    expect((await tempsOf(dynamicNameSrc)).size).toBe(0);
  });

  it('a control-table name is never exempted by the temp rule', async () => {
    expect([...(await tempsOf(controlNameSrc))]).not.toContain('pipeline_runs');
  });

  it('the old CREATE TEMP literal arm still works with no SourceFile', async () => {
    const { collectFileTemps } = await import(gateModulePath);
    expect([
      ...collectFileTemps(undefined, ['CREATE TEMP TABLE tmp_c ON COMMIT DROP AS SELECT 1']),
    ]).toContain('tmp_c');
  });

  it('a non-ctx receiver declares nothing (only the ctx seam counts)', async () => {
    const src = `await other.tempTable({ name: 'tmp_z', selectSql: q })`;
    expect([...(await tempsOf(src))]).not.toContain('tmp_z');
  });

  it('the ctx receiver still declares the temp', async () => {
    const src = `await ctx.tempTable({ name: 'tmp_y', selectSql: q })`;
    expect([...(await tempsOf(src))]).toContain('tmp_y');
  });
});
