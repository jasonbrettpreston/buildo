// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 (McDonald's Airtight V2 — Phase 1 WITNESS, P1-C2 resolver)
// Plan: .cursor/wf2_registry_truth_active_task.md PHASE 1 item 2
//
// RED-first lock for scripts/lib/sql-witness/resolve.cjs (brief p1c2a).
// The resolver is created by the sibling brief p1c2b, so this file is RED
// today: the module is missing. Every RED carries a GREEN control proving
// the same assertion can pass on a sibling input once the module exists.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';

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

// Loaded lazily inside beforeAll (error re-thrown per test in beforeEach) so a missing module turns every test RED
// (per-test failed assertionResults) instead of failing the file with 0 tests.
let R: ResolverModule;

// Catalog fixture (information_schema.columns snapshot shape).
const CAT: Record<string, string[]> = {
  parcels: ['id', 'parcel_id', 'lot_size_sqm', 'lot_size_sqft', 'geom', 'max_build_stories'],
  parcel_buildings: ['parcel_id', 'building_id'],
  permits: ['id', 'parcel_id', 'status'],
};

// Helpers shared by the assertions below.
const keys = (m: Record<string, string[]>): string[] => Object.keys(m).sort();
const sorted = (xs: string[]): string[] => [...xs].sort();

// A throwing beforeAll SKIPS tests; a throwing beforeEach FAILS each one, which is what
// gate K's red evidence needs (>=1 failed assertionResults).
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

describe('sql-witness resolver — staging → base table (contract: staging tables resolve to the base table)', () => {
  it('RED: resolving `CREATE TEMP TABLE parcels_staging (LIKE parcels)` is kind utility', () => {
    const r = R.resolveStatement('CREATE TEMP TABLE parcels_staging (LIKE parcels)', CAT);
    expect(r.kind).toBe('utility');
  });

  it('GREEN control: a plain transactional utility statement is also kind utility', () => {
    const r = R.resolveStatement('BEGIN', CAT);
    expect(r.kind).toBe('utility');
  });

  it('RED: `INSERT INTO parcels … SELECT … FROM parcels_staging` writes/reads parcels, and never the staging key', () => {
    const r = R.resolveStatement(
      'INSERT INTO parcels (id, lot_size_sqm) SELECT id, lot_size_sqm FROM parcels_staging',
      CAT,
    );
    expect(r.writes.parcels).toEqual(sorted(['id', 'lot_size_sqm']));
    expect(r.reads.parcels).toEqual(sorted(['id', 'lot_size_sqm']));
    expect(keys(r.writes)).not.toContain('parcels_staging');
    expect(keys(r.reads)).not.toContain('parcels_staging');
    expect(JSON.stringify(r)).not.toContain('parcels_staging');
  });

  it('GREEN control: a plain `INSERT INTO parcels (id) VALUES ($1)` writes exactly parcels.id', () => {
    const r = R.resolveStatement('INSERT INTO parcels (id) VALUES ($1)', CAT);
    expect(r.writes.parcels).toEqual(['id']);
  });
});

describe('sql-witness resolver — every statement of a multi-statement text (WF3 C2: R5, R6)', () => {
  const MCAT: Record<string, string[]> = { ...CAT, ravines: ['id', 'name'], toronto_centreline: ['centreline_id', 'geom'] };

  it('R5 RED: a write behind a leading SELECT is witnessed (kind write, writes ravines.name)', () => {
    const r = R.resolveStatement("SELECT id FROM parcels WHERE id = 1; UPDATE ravines SET name = 'x' WHERE id = 2", MCAT);
    expect(r.kind).toBe('write');
    expect(r.writes.ravines).toEqual(['name']);
    expect(r.reads.parcels).toContain('id');
  });

  it('R6 RED: the centreline full-mode text (DROP …; CREATE TEMP … AS SELECT) witnesses its query reads', () => {
    const r = R.resolveStatement(
      'DROP TABLE IF EXISTS tmp_centreline_enrich;\nCREATE TEMP TABLE tmp_centreline_enrich AS SELECT p.parcel_id, c.centreline_id FROM parcels p JOIN toronto_centreline c ON ST_DWithin(p.geom, c.geom, 50)',
      MCAT,
    );
    expect(r.reads.parcels).toEqual(sorted(['geom', 'parcel_id']));
    expect(r.reads.toronto_centreline).toEqual(sorted(['centreline_id', 'geom']));
  });

  it('GREEN control: one statement keeps its contract; the fingerprint stays whole-text', () => {
    const one = R.resolveStatement('SELECT 1', MCAT);
    expect(one.kind).toBe('read');
    expect(keys(one.reads)).toEqual([]);
    expect(R.resolveStatement('SELECT 1; SELECT 2', MCAT).fingerprint).not.toBe(one.fingerprint);
  });

  it('GREEN control: a parse error anywhere in a multi-statement text stays FAIL:INPUT:parse, never a throw', () => {
    const r = R.resolveStatement('SELECT 1; SELEC x', MCAT);
    expect(r.error).toMatch(/^FAIL:INPUT:parse:/);
  });
});

describe('sql-witness resolver — CTE names bind in nested scopes (WF3 C2b: F1, R20)', () => {
  const XCAT: Record<string, string[]> = { ...CAT, a: ['id'], pipeline_runs: ['id', 'pipeline', 'status', 'started_at'] };
  const reads = (sql: string): Record<string, string[]> => R.resolveStatement(sql, XCAT).reads;

  it('F1a RED: a CTE referenced from a scalar SubLink is not a table read', () => {
    expect(keys(reads('WITH c AS (SELECT started_at FROM pipeline_runs) SELECT id FROM pipeline_runs WHERE started_at > COALESCE((SELECT started_at FROM c), now())'))).toEqual([]);
  });
  it('F1b RED: an aliased CTE reference (FROM a z) is derived', () => {
    expect(keys(reads('WITH a AS (SELECT id FROM parcels) SELECT z.id FROM a z'))).toEqual(['parcels']);
  });
  it('F1c RED: a sibling CTE body (b AS (SELECT id FROM a)) does not read a', () => {
    expect(keys(reads('WITH a AS (SELECT id FROM parcels), b AS (SELECT id FROM a) SELECT id FROM b'))).toEqual(['parcels']);
  });
  it('F1d RED: write-statement CTEs bind in sibling bodies and in the INSERT … SELECT', () => {
    const r = R.resolveStatement('WITH a AS (SELECT id FROM parcels), b AS (SELECT id FROM a) INSERT INTO permits (id) SELECT id FROM b', XCAT);
    expect(keys(r.reads)).not.toContain('a');
    expect(keys(r.reads)).not.toContain('b');
    expect(r.writes.permits).toEqual(['id']);
  });
  it('precedence RED: a CTE named *_staging beats the staging→base mapping in a nested scope', () => {
    expect(keys(reads('WITH parcels_staging AS (SELECT id FROM permits) SELECT id FROM permits WHERE id IN (SELECT id FROM parcels_staging)'))).toEqual(['permits']);
  });
  it('R20 GREEN control: a CTE from an EARLIER statement does not hide a later real table a', () => {
    expect(reads('WITH a AS (SELECT id FROM parcels) SELECT 1; SELECT id FROM a').a).toEqual(['id']);
  });
  it('R20 RED: a CTE bound only inside a sibling subquery does not hide the outer real table a', () => {
    expect(reads('SELECT x.id FROM (WITH a AS (SELECT id FROM parcels) SELECT id FROM a) x JOIN a ON a.id = x.id').a).toContain('id');
  });
  it('GREEN control: a top-level CTE stays derived and a plain table stays a read', () => {
    expect(keys(reads('WITH a AS (SELECT id FROM parcels) SELECT id FROM a'))).toEqual(['parcels']);
  });
});

describe('sql-witness resolver — R14: runner ledger SQL has no a:<cte> rows at gate #44 (WF3 C2b)', () => {
  it('R14 RED: real runLedgerGateDecision + detectInterruptedRetraction SQL → assembleTrace → evaluateWitness: no :a: rows', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sv = require(path.join(process.cwd(), 'scripts/lib/source-version.js'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const st = require(path.join(process.cwd(), 'scripts/lib/step/staleness.js'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const A = require(path.join(process.cwd(), 'scripts/lib/sql-witness/assemble.cjs'));
    // FLEET-2 §5 triage 2026-10-06: link_massing's recovery.interrupted became "none" (FLEET-2 R2), so detectInterruptedRetraction
    // returns before querying; link_wsib still declares force_full_on_next_run, so the real CTE query is still exercised here.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const linkWsib = require(path.join(process.cwd(), 'scripts/link-wsib.descriptor.json')); // declares force_full_on_next_run
    const { pathToFileURL } = await import('url');
    const G = await import(pathToFileURL(path.join(process.cwd(), 'scripts/analysis/gates/witness.mjs')).href);

    const captured: Array<{ text: string; params: unknown[] }> = [];
    const pool = { query: async (text: string, params: unknown[]) => { captured.push({ text, params }); return { rows: [] }; } };
    await sv.runLedgerGateDecision(pool, { ownSlugs: ['sources:x'], upstreamSlugs: ['sources:y'] });
    await st.detectInterruptedRetraction(pool, linkWsib, {});
    expect(captured.length).toBe(2);

    const lines = [
      { type: 'header', pid: 1, tracer_self_ms: 0, distinct: captured.length, calls: captured.length },
      ...captured.map((c, i) => ({ type: 'statement', i, text: c.text, count: 1, rowCount: 0, clients: [1], params: [c.params] })),
      { type: 'client', id: 1, seq: captured.map((_, i) => [i, 1]) },
    ];
    const trace = await A.assembleTrace({
      ndjsonTexts: [lines.map((l) => JSON.stringify(l)).join('\n') + '\n'],
      catalog: {},
      meta: { step: 'fx', chain: 'sources', source_fingerprint: 'fp', git_head: 'g', wall_ms: 0 },
    });
    const out = G.evaluateWitness({
      slug: 'fx', descriptor: { inputs: { reads: { tables: [] } }, outputs: { writes: [] } }, status: 'pending',
      currentFingerprint: 'fp', postTraces: { fx: trace }, preTraces: {}, explainedDiffs: [],
    });
    expect(out.rows.filter((r: string) => r.includes(':a:'))).toEqual([]);
  });
});

describe('sql-witness resolver — function-alias column lists bind (WF3 C2c: R21, R22)', () => {
  type W = { table: string; geometry_kind?: string; columns: Array<{ name: string }> };
  const geomCases = (): Array<{ label: string; w: W; D: unknown }> => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rav = require(path.join(process.cwd(), 'scripts/load-ravines.descriptor.json')) as { outputs: { writes: W[] } };
    const rw = rav.outputs.writes[0]!;
    const out = [{ label: 'load_ravines', w: rw, D: rav as unknown }];
    const hp = path.join(process.cwd(), 'scripts/load-heritage.descriptor.json');
    if (fs.existsSync(hp)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const her = require(hp) as { outputs: { writes: W[] } };
      for (const w of her.outputs.writes) out.push({ label: `load_heritage ${w.table}`, w, D: her });
    } else {
      // heritage descriptor lives in another worktree: its writes = ravines' write with these kinds
      out.push({ label: 'heritage_properties (point clone)', w: { ...rw, table: 'heritage_properties', geometry_kind: 'point' }, D: rav });
      out.push({ label: 'heritage_districts (polygon clone)', w: { ...rw, table: 'heritage_districts', geometry_kind: 'polygon' }, D: rav });
    }
    return out;
  };

  it('R21 RED: the real geometry-guard validation_sql binds s/g/input/validated (no error, no such reads)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const write = require(path.join(process.cwd(), 'scripts/lib/step/write.js')) as {
      buildWritePlan: (w: unknown, d: unknown) => { validation_sql: string | null };
    };
    for (const { label, w, D } of geomCases()) {
      const sql = write.buildWritePlan(w, D).validation_sql;
      expect(sql, label).toBeTruthy();
      const r = R.resolveStatement(sql as string, { [w.table]: w.columns.map((c) => c.name) });
      expect(r.error, label).toBeNull();
      for (const k of ['input', 's', 'g', 'validated']) expect(keys(r.reads), label).not.toContain(k);
    }
  });

  it('R21 RED: a no-list alias names its single column; UPDATE … FROM unnest binds; a real column beside it still reads', () => {
    expect(R.resolveStatement('SELECT h.h FROM unnest($1::int[]) h', CAT).error).toBeNull();
    const u = R.resolveStatement(
      'UPDATE parcels p SET max_build_stories = u.v FROM unnest($1::int[], $2::int[]) AS u(id, v) WHERE p.id = u.id', CAT);
    expect(u.error).toBeNull();
    expect(u.writes.parcels).toEqual(['max_build_stories']);
    expect(u.reads.parcels).toEqual(expect.arrayContaining(['id']));
    const j = R.resolveStatement('SELECT p.geom, g.geojson FROM parcels p JOIN unnest($1::text[]) AS g(geojson) ON true', CAT);
    expect(j.error).toBeNull();
    expect(keys(j.reads)).toEqual(['parcels']);
    const q = R.resolveStatement('SELECT geom, geojson FROM parcels p JOIN unnest($1::text[]) AS g(geojson) ON true', CAT);
    expect(q.reads.parcels).toEqual(['geom']); // geojson is g's column, never parcels'
  });

  it('R22 control: unknown alias columns still FAIL; a real column beside an unnest alias is still read', () => {
    expect(R.resolveStatement('SELECT g.nope FROM unnest($1::text[]) AS g(geojson)', CAT).error).toBe('FAIL:INPUT:column:nope');
    expect(R.resolveStatement('SELECT h.other FROM unnest($1::int[]) h', CAT).error).toBe('FAIL:INPUT:column:other');
    expect(R.resolveStatement(
      'SELECT g.parcel_id FROM parcels p JOIN unnest($1::text[]) AS g(geojson) ON true', CAT).error).toBe('FAIL:INPUT:column:parcel_id');
    const q = R.resolveStatement('SELECT geom, geojson FROM parcels p JOIN unnest($1::text[]) AS g(geojson) ON true', CAT);
    expect(q.reads.parcels).toEqual(expect.arrayContaining(['geom']));
  });
});

describe('sql-witness resolver — utility statements counted and excluded (contract: resolveAll.utility)', () => {
  it('RED: a mixed batch counts 5 utility statements, keeps only permits reads, and no writes', () => {
    const out = R.resolveAll(
      [
        'BEGIN',
        'SELECT pg_advisory_xact_lock($1)',
        'VACUUM ANALYZE parcels',
        'SET statement_timeout = 0',
        'COMMIT',
        'SELECT id FROM permits',
      ],
      CAT,
    );
    expect(out.utility).toBe(5);
    expect(out.reads).toEqual({ permits: ['id'] });
    expect(out.writes).toEqual({});
  });

  it('GREEN control: a batch of one plain SELECT counts 0 utility statements', () => {
    const out = R.resolveAll(['SELECT id FROM permits'], CAT);
    expect(out.utility).toBe(0);
  });
});

describe('sql-witness resolver — column → table with aliases (contract: alias maps to relname)', () => {
  it('RED: aliased JOIN columns resolve to their owning tables', () => {
    const r = R.resolveStatement(
      'SELECT p.lot_size_sqm, pb.building_id FROM parcels p JOIN parcel_buildings pb ON pb.parcel_id = p.parcel_id',
      CAT,
    );
    expect(r.reads.parcels).toEqual(sorted(['lot_size_sqm', 'parcel_id']));
    expect(r.reads.parcel_buildings).toEqual(sorted(['building_id', 'parcel_id']));
  });

  it('GREEN control: a single unaliased relation resolves its column', () => {
    const r = R.resolveStatement('SELECT lot_size_sqm FROM parcels', CAT);
    expect(r.reads.parcels).toEqual(['lot_size_sqm']);
  });
});

describe('sql-witness resolver — unqualified column against the catalog (contract: unique in-scope relation)', () => {
  it('RED: unqualified columns across two relations resolve via the catalog', () => {
    const r = R.resolveStatement(
      'SELECT lot_size_sqm, building_id FROM parcels p JOIN parcel_buildings pb ON pb.parcel_id = p.parcel_id',
      CAT,
    );
    expect(r.reads.parcels).toEqual(sorted(['lot_size_sqm', 'parcel_id']));
    expect(r.reads.parcel_buildings).toEqual(sorted(['building_id', 'parcel_id']));
  });

  it('RED: a column resolving to no in-scope relation errors with FAIL:INPUT:column:', () => {
    const r = R.resolveStatement(
      'SELECT nope FROM parcels p JOIN permits q ON q.parcel_id = p.parcel_id',
      CAT,
    );
    expect(r.error).not.toBeNull();
    expect(String(r.error).startsWith('FAIL:INPUT:column:')).toBe(true);
  });

  it('GREEN control: a resolvable column across two relations has no error', () => {
    const r = R.resolveStatement(
      'SELECT building_id FROM parcels p JOIN parcel_buildings pb ON pb.parcel_id = p.parcel_id',
      CAT,
    );
    expect(r.error).toBeNull();
  });
});

describe('sql-witness resolver — `*` expands from the catalog (contract: catalog-driven expansion)', () => {
  it('RED: `SELECT * FROM permits` reads every catalogued column', () => {
    const r = R.resolveStatement('SELECT * FROM permits', CAT);
    expect(r.reads.permits).toEqual(sorted(['id', 'parcel_id', 'status']));
  });

  it('GREEN control: an explicit column list reads only the listed columns', () => {
    const r = R.resolveStatement('SELECT id FROM permits', CAT);
    expect(r.reads.permits).toEqual(['id']);
  });
});

describe('sql-witness resolver — unparseable SQL is FAIL:INPUT:parse, never a throw', () => {
  it('RED: `SELEC id FRM x` returns error starting FAIL:INPUT:parse: and does not throw', () => {
    const r = R.resolveStatement('SELEC id FRM x', CAT);
    expect(r.error).not.toBeNull();
    expect(String(r.error).startsWith('FAIL:INPUT:parse:')).toBe(true);
  });

  it('GREEN control: valid SQL returns error null', () => {
    const r = R.resolveStatement('SELECT id FROM permits', CAT);
    expect(r.error).toBeNull();
  });
});

describe('sql-witness resolver — guarded UPDATE reads the guarded column (contract: guard columns are reads AND writes)', () => {
  it('RED: an IS DISTINCT FROM guard column appears in both writes and reads', () => {
    const r = R.resolveStatement(
      'UPDATE parcels t SET max_build_stories = $1 WHERE t.id = $2 AND t.max_build_stories IS DISTINCT FROM $1',
      CAT,
    );
    expect(r.kind).toBe('write');
    expect(r.writes.parcels).toEqual(['max_build_stories']);
    expect(r.reads.parcels).toEqual(expect.arrayContaining(['id', 'max_build_stories']));
  });

  it('GREEN control: an UPDATE that only reads its WHERE key writes just the SET column', () => {
    const r = R.resolveStatement(
      'UPDATE parcels SET max_build_stories = $1 WHERE id = $2',
      CAT,
    );
    expect(r.kind).toBe('write');
    expect(r.writes.parcels).toEqual(['max_build_stories']);
    expect(r.reads.parcels).toEqual(['id']);
  });
});

describe('sql-witness resolver — CTEs are not tables (contract: CTE body is its own scope)', () => {
  it('RED: a CTE feeding an UPDATE resolves to the base table, never the CTE name', () => {
    const r = R.resolveStatement(
      'WITH c AS (SELECT p.id, p.lot_size_sqm FROM parcels p) UPDATE parcels t SET max_build_stories = c.lot_size_sqm FROM c WHERE t.id = c.id',
      CAT,
    );
    expect(r.kind).toBe('write');
    expect(r.reads.parcels).toEqual(expect.arrayContaining(['id', 'lot_size_sqm']));
    expect(keys(r.reads)).not.toContain('c');
    expect(keys(r.writes)).not.toContain('c');
  });

  it('GREEN control: the same UPDATE without the CTE still writes parcels.max_build_stories', () => {
    const r = R.resolveStatement(
      'UPDATE parcels t SET max_build_stories = $1 WHERE t.id = $2',
      CAT,
    );
    expect(r.kind).toBe('write');
    expect(r.writes.parcels).toEqual(['max_build_stories']);
  });
});

describe('sql-witness resolver — runner-owned relations (contract: RUNNER_OWNED excludes, each entry cited)', () => {
  it('RED: a pipeline_runs read is excluded and contributes no reads', () => {
    const r = R.resolveStatement(
      'SELECT records_meta FROM pipeline_runs WHERE pipeline = $1',
      CAT,
    );
    expect(r.reads).toEqual({});
    expect(r.excluded).toEqual(['pipeline_runs']);
  });

  it('GREEN control: a non-runner table read is kept, not excluded', () => {
    const r = R.resolveStatement('SELECT id FROM permits', CAT);
    expect(r.reads).toEqual({ permits: ['id'] });
    expect(r.excluded).toEqual([]);
  });

  it('RED: every RUNNER_OWNED entry carries a non-empty cite', () => {
    expect(Array.isArray(R.RUNNER_OWNED)).toBe(true);
    expect(R.RUNNER_OWNED.length).toBeGreaterThan(0);
    for (const entry of R.RUNNER_OWNED) {
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.cite).toBe('string');
      expect(entry.cite.length).toBeGreaterThan(0);
    }
  });

  it('GREEN control: pipeline_runs is present in RUNNER_OWNED by name', () => {
    expect(R.RUNNER_OWNED.map((e) => e.name)).toContain('pipeline_runs');
  });

  it('RED: schema_migrations (runner DB-target floor, resolve-db.js:268-272) is runner-owned', () => {
    expect(R.RUNNER_OWNED.some((e) => e.name === 'schema_migrations')).toBe(true);

    const r = R.resolveStatement('SELECT COUNT(*)::int AS n FROM schema_migrations', CAT);
    expect(r.reads).toEqual({});
    expect(r.excluded).toEqual(['schema_migrations']);
  });
});

describe('sql-witness resolver — DELETE touches without column writes (contract: writes.t = [], key read)', () => {
  it('RED: `DELETE FROM parcel_buildings WHERE parcel_id = $1` writes [] and reads the key', () => {
    const r = R.resolveStatement('DELETE FROM parcel_buildings WHERE parcel_id = $1', CAT);
    expect(r.kind).toBe('write');
    expect(r.writes.parcel_buildings).toEqual([]);
    expect(r.reads.parcel_buildings).toEqual(['parcel_id']);
  });

  it('GREEN control: `DELETE FROM parcel_buildings` with no WHERE still records the table with []', () => {
    const r = R.resolveStatement('DELETE FROM parcel_buildings', CAT);
    expect(r.kind).toBe('write');
    expect(r.writes.parcel_buildings).toEqual([]);
  });
});

describe('sql-witness resolver — fingerprint stability (contract: fingerprintSync is whitespace-insensitive)', () => {
  it('RED: the same SQL with different whitespace yields an equal fingerprint', () => {
    const a = R.resolveStatement('SELECT id,   lot_size_sqm FROM parcels', CAT);
    const b = R.resolveStatement('SELECT id, lot_size_sqm\nFROM parcels', CAT);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(typeof a.fingerprint).toBe('string');
    expect(a.fingerprint.length).toBeGreaterThan(0);
  });

  it('GREEN control: a different statement yields a different fingerprint', () => {
    const a = R.resolveStatement('SELECT id FROM parcels', CAT);
    const b = R.resolveStatement('SELECT parcel_id FROM parcels', CAT);
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});

describe('sql-witness resolver — real pipeline SQL shapes (orchestrator probe 2026-10-01)', () => {
  // The loader the resolver must survive: the shapes below are lifted from the
  // ACTUAL converted step, not invented. The GENERATED arm (#4) is fabricated at
  // test time by the same library that emits the production statement.
  it('RED: `EXCLUDED` is the proposed row, not a relation (INSERT … ON CONFLICT … DO UPDATE)', () => {
    const r = R.resolveStatement(
      'INSERT INTO parcels (parcel_id, lot_size_sqm) VALUES ($1,$2) ' +
        'ON CONFLICT (parcel_id) DO UPDATE SET lot_size_sqm = COALESCE(EXCLUDED.lot_size_sqm, parcels.lot_size_sqm) ' +
        'WHERE (EXCLUDED.lot_size_sqm IS NOT NULL AND parcels.lot_size_sqm IS DISTINCT FROM EXCLUDED.lot_size_sqm)',
      CAT,
    );
    expect(r.error).toBeNull();
    expect(r.writes.parcels).toEqual(sorted(['lot_size_sqm', 'parcel_id']));
    expect(r.reads.parcels).toEqual(expect.arrayContaining(['lot_size_sqm']));
    // EXCLUDED is a pseudo-relation: it must never appear as a table key.
    expect(keys(r.reads)).not.toContain('excluded');
    expect(keys(r.reads)).not.toContain('EXCLUDED');
    expect(keys(r.writes)).not.toContain('excluded');
    expect(keys(r.writes)).not.toContain('EXCLUDED');
  });

  it('GREEN control: the same INSERT with no ON CONFLICT resolves with no error', () => {
    const r = R.resolveStatement(
      'INSERT INTO parcels (parcel_id, lot_size_sqm) VALUES ($1,$2)',
      CAT,
    );
    expect(r.error).toBeNull();
  });

  it('RED: a correlated LATERAL subquery resolves both sides, never the LATERAL alias', () => {
    const r = R.resolveStatement(
      'SELECT p.id FROM parcels p ' +
        'LEFT JOIN LATERAL (SELECT b.building_id FROM parcel_buildings b WHERE b.parcel_id = p.parcel_id LIMIT 1) x ON true ' +
        'WHERE p.lot_size_sqm IS NULL',
      CAT,
    );
    expect(r.error).toBeNull();
    expect(r.reads.parcels).toEqual(expect.arrayContaining(['id', 'lot_size_sqm', 'parcel_id']));
    expect(r.reads.parcel_buildings).toEqual(expect.arrayContaining(['building_id', 'parcel_id']));
  });

  it('RED: a correlated EXISTS in an UPDATE resolves the subquery relation against the alias', () => {
    const r = R.resolveStatement(
      'UPDATE parcels t SET max_build_stories = NULL ' +
        'WHERE NOT EXISTS (SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = t.parcel_id)',
      CAT,
    );
    expect(r.error).toBeNull();
    expect(r.writes.parcels).toEqual(['max_build_stories']);
    expect(r.reads.parcel_buildings).toEqual(expect.arrayContaining(['parcel_id']));
    expect(r.reads.parcels).toEqual(expect.arrayContaining(['parcel_id']));
  });

  it('RED: the REAL generated parcels upsert resolves every declared column to `parcels`', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const write = require(path.join(process.cwd(), 'scripts/lib/step/write.js')) as {
      buildWritePlan: (
        writeSpec: unknown,
        descriptor: unknown,
      ) => { upsertSqlFor: (rowCount: number) => string };
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const D = require(path.join(process.cwd(), 'scripts/load-parcels.descriptor.json')) as {
      outputs: { writes: Array<{ columns: Array<{ name: string; written?: string }> }> };
    };
    const writeSpec = D.outputs.writes[0]!;
    const sql = write.buildWritePlan(writeSpec, D).upsertSqlFor(2);

    const catalog = {
      parcels: [
        ...writeSpec.columns.map((c) => c.name),
        'ravine_dataset_version_when_enriched',
        'heritage_dataset_version_when_enriched',
        'centreline_dataset_version_when_enriched',
      ],
    };

    const r = R.resolveStatement(sql, catalog);
    expect(r.error).toBeNull();
    expect(keys(r.writes)).toEqual(['parcels']);
    // `geom` is written via an expression (ST_GeomFromWKB), so the resolver may or
    // may not report it; it is included only if it appears. Every other declared
    // column must land in writes.parcels.
    // A written:"db_default" column (parcels.id, FLEET-2 unproduced reads) is declared precisely as one the
    // statement never writes (write.js keeps it out of INSERT / SET / guard), so it is excluded here.
    const declared = writeSpec.columns.filter((c) => c.written !== 'db_default').map((c) => c.name).filter((n) => n !== 'geom');
    expect(r.writes.parcels).toEqual(expect.arrayContaining(declared));
  });
});

describe('WF3 resolver scope + closed statement kinds (outer-scope binding, loud refusal)', () => {
  const CAT2: Record<string, string[]> = { a: ['id', 'x'], b: ['id', 'y'], c: ['z'] };

  it('R-A1 RED: outer-scope ambiguity errors', () => {
    const r = R.resolveStatement('SELECT 1 FROM a, b WHERE EXISTS (SELECT 1 FROM c WHERE id = 1)', CAT2);
    expect(r.error).toBe('FAIL:INPUT:column:id');
    expect(r.reads.c ?? []).not.toContain('id');
  });

  it('R-A2 RED: outer column binds to the outer table', () => {
    const r = R.resolveStatement('SELECT 1 FROM a WHERE EXISTS (SELECT 1 FROM c WHERE id = 1)', CAT2);
    expect(r.error).toBeNull();
    expect(r.reads.a).toEqual(['id']);
    expect(r.reads.c).toEqual([]);
  });

  it('R-A3 RED: outer column binds to the outer UPDATE target', () => {
    const r = R.resolveStatement('UPDATE a SET x = 1 WHERE EXISTS (SELECT 1 FROM c WHERE id = 2)', CAT2);
    expect(r.reads.a).toEqual(['id']);
    expect(r.reads.c).toEqual([]);
    expect(r.writes.a).toEqual(['x']);
  });

  it('R-A4 RED: subquery splits reads across outer and inner tables', () => {
    const r = R.resolveStatement(
      'SELECT 1 FROM a JOIN b ON a.id = b.id WHERE x IN (SELECT z FROM c WHERE y = 1)',
      CAT2,
    );
    expect(r.reads.b).toEqual(['id', 'y']);
    expect(r.reads.c).toEqual(['z']);
  });

  it('G-A1 GREEN control: innermost ambiguity is unchanged', () => {
    const r = R.resolveStatement('SELECT 1 FROM a, b WHERE id = 1', CAT2);
    expect(r.error).toBe('FAIL:INPUT:column:id');
  });

  it('G-A2 GREEN control: inner table wins when it has the column', () => {
    const r = R.resolveStatement('SELECT 1 FROM a WHERE EXISTS (SELECT 1 FROM b WHERE id = 1)', CAT2);
    expect(r.reads.b).toEqual(['id']);
  });

  it('G-A3 GREEN control: uncatalogued lone relation `d` binds as a fence', () => {
    const r = R.resolveStatement('SELECT 1 FROM a WHERE EXISTS (SELECT 1 FROM d WHERE id = 1)', CAT2);
    expect(r.reads.d).toEqual(['id']);
    expect(r.error).toBeNull();
  });

  it('G-A4 GREEN control: stale catalog (column `q` not declared) still binds', () => {
    const r = R.resolveStatement('SELECT q FROM c', CAT2);
    expect(r.reads.c).toEqual(['q']);
    expect(r.error).toBeNull();
  });

  it('R-B1 RED: EXPLAIN refuses by name', () => {
    const r = R.resolveStatement('EXPLAIN SELECT id FROM a', CAT2);
    expect(r.error).toBe('FAIL:INPUT:unsupported:ExplainStmt');
  });

  it('R-B2 RED: EXPLAIN ANALYZE refuses by name', () => {
    const r = R.resolveStatement('EXPLAIN ANALYZE UPDATE a SET x = 1', CAT2);
    expect(r.error).toBe('FAIL:INPUT:unsupported:ExplainStmt');
  });

  it('R-B3 RED: DO block refuses by name', () => {
    const r = R.resolveStatement('DO $$ BEGIN UPDATE a SET x = 1; END $$', CAT2);
    expect(r.error).toBe('FAIL:INPUT:unsupported:DoStmt');
  });

  it('R-B4 RED: CALL refuses by name', () => {
    const r = R.resolveStatement('CALL refresh_all(1)', CAT2);
    expect(r.error).toBe('FAIL:INPUT:unsupported:CallStmt');
  });

  it('R-B5 RED: CALL refuses by name but still resolves preceding reads', () => {
    const r = R.resolveStatement('SELECT id FROM a; CALL refresh_all(1)', CAT2);
    expect(r.error).toBe('FAIL:INPUT:unsupported:CallStmt');
    expect(r.reads.a).toEqual(['id']);
  });

  it('R-B6 RED: TRUNCATE refuses by name', () => {
    const r = R.resolveStatement('TRUNCATE a', CAT2);
    expect(r.error).toBe('FAIL:INPUT:unsupported:TruncateStmt');
  });

  it('R-B7 RED: unsupported statement first refuses by name but still resolves later reads', () => {
    const r = R.resolveStatement('CALL refresh_all(1); SELECT id FROM a', CAT2);
    expect(r.error).toBe('FAIL:INPUT:unsupported:CallStmt');
    expect(r.reads.a).toEqual(['id']);
  });

  it('R-C1 RED: MERGE refuses by name without a TypeError/relname leak', () => {
    const r = R.resolveStatement(
      'MERGE INTO a USING b ON a.id = b.id WHEN MATCHED THEN UPDATE SET x = b.y',
      CAT2,
    );
    expect(r.error).toBe('FAIL:INPUT:unsupported:MergeStmt');
    expect(String(r.error)).not.toMatch(/TypeError|relname/);
  });

  it('G-B1 GREEN control: CREATE INDEX + ANALYZE is a utility statement', () => {
    const r = R.resolveStatement('CREATE INDEX comp_cand_gix ON comp_cand USING gist (geom); ANALYZE comp_cand;', CAT2);
    expect(r.kind).toBe('utility');
    expect(r.error).toBeNull();
  });

  it('G-B2 RED: REINDEX (schema-permitted maintenance op, plausibility.js MAINTENANCE_SQL) is a utility statement', () => {
    const r = R.resolveStatement('REINDEX TABLE parcels', CAT2);
    expect(r.kind).toBe('utility');
    expect(r.error).toBeNull();
  });
});

// WF3 resolver temp staging (2026-10-04, .cursor/wf3_resolver_temp_staging_active_task.md): `_staging`
// maps to a base table ONLY when it stages a catalog table. The legacy zoning loader's
// `CREATE TEMP TABLE _zoning_staging …` stages nothing in the catalog — it is a session temp
// (no read, no write), never the nonexistent table `_zoning`.
describe('sql-witness resolver — a TEMP *_staging that stages no catalog table is a session temp (WF3 temp staging)', () => {
  const ZCAT: Record<string, string[]> = { ...CAT, zoning_height_overlay: ['source_id', 'geom'] };
  const CREATE = 'CREATE TEMP TABLE _zoning_staging (source_id INTEGER NOT NULL) ON COMMIT DROP';
  const INSERT = 'INSERT INTO _zoning_staging VALUES ($1), ($2)';
  const DELETE = 'DELETE FROM zoning_height_overlay t WHERE NOT EXISTS (SELECT 1 FROM _zoning_staging s WHERE s.source_id = t.source_id)';

  it('T1 RED: collectSessionTemps returns _zoning_staging (its base _zoning is not a catalog table)', () => {
    expect([...R.collectSessionTemps(CREATE, ZCAT)]).toEqual(['_zoning_staging']);
  });

  it('T2 RED: with that session temp, the INSERT writes nothing and the DELETE reads only the real table', () => {
    const temps = R.collectSessionTemps(CREATE, ZCAT);
    const ins = R.resolveStatement(INSERT, ZCAT, { sessionTemps: temps });
    expect(ins.writes).toEqual({});
    expect(ins.error).toBeNull();
    const del = R.resolveStatement(DELETE, ZCAT, { sessionTemps: temps });
    expect(del.reads).toEqual({ zoning_height_overlay: ['source_id'] });
    expect(del.writes).toEqual({ zoning_height_overlay: [] });
    expect(del.error).toBeNull();
    expect(JSON.stringify([ins, del])).not.toMatch(/"_zoning/);
  });

  it('T3 GREEN fence: a staging of a CATALOG table still maps to its base and is not a session temp', () => {
    expect([...R.collectSessionTemps('CREATE TEMP TABLE parcels_staging (LIKE parcels)', CAT)]).toEqual([]);
    const r = R.resolveStatement('INSERT INTO parcels (id, lot_size_sqm) SELECT id, lot_size_sqm FROM parcels_staging', CAT);
    expect(keys(r.writes)).toEqual(['parcels']);
    expect(keys(r.reads)).toEqual(['parcels']);
  });

  it('T4 GREEN fence: with an EMPTY catalog the legacy strip holds (src-sql-ledger passes {})', () => {
    const r = R.resolveStatement(DELETE, {});
    expect(keys(r.reads)).toContain('_zoning');
    expect([...R.collectSessionTemps(CREATE, {})]).toEqual([]);
  });

  it('T5 GREEN fence: a non-staging TEMP that shadows a catalog table still fails loudly', () => {
    const r = R.resolveStatement('CREATE TEMP TABLE parcels AS SELECT id FROM permits', CAT);
    expect(r.error).toBe('FAIL:INPUT:temp-shadows:parcels');
  });

  it('T6 RED: statement-at-a-time (no sessionTemps) with a full catalog never credits the nonexistent _zoning', () => {
    const r = R.resolveStatement(DELETE, ZCAT);
    expect(keys(r.reads)).not.toContain('_zoning');
    expect(keys(r.reads)).toContain('_zoning_staging');
  });

  it('T7 GREEN fence (plan fold, DeepSeek lens): a *_staging name that is ITSELF a catalog table is a real table, never stripped', () => {
    const SCAT: Record<string, string[]> = { ...CAT, parcels_staging: ['id', 'note'] };
    const r = R.resolveStatement('SELECT note FROM parcels_staging', SCAT);
    expect(r.reads).toEqual({ parcels_staging: ['note'] });
    expect(r.error).toBeNull();
  });
});

describe('sql-witness resolver — F8: ON CONFLICT DO UPDATE SET targets are writes (WF1 LDG-10 T6)', () => {
  // The real load_parcels statement and its committed catalog snapshot. The catalog file
  // is `{catalog_version, source, tables: {<table>: [...]}}`, so the resolver is handed
  // `.tables` (a plain table -> columns map) — the shape `resolveStatement` expects.
  const loadCatalog = (): Record<string, string[]> => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const snap = require(path.join(process.cwd(), 'docs/reports/witness/_catalog.json')) as {
      tables: Record<string, string[]>;
    };
    return snap.tables;
  };
  const realUpsertSql = (): string => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const write = require(path.join(process.cwd(), 'scripts/lib/step/write.js')) as {
      buildWritePlan: (writeSpec: unknown, descriptor: unknown) => { upsert_sql: string };
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const D = require(path.join(process.cwd(), 'scripts/load-parcels.descriptor.json')) as {
      outputs: { writes: unknown[] };
    };
    return write.buildWritePlan(D.outputs.writes[0], D).upsert_sql;
  };

  it('T6 RED: `INSERT … ON CONFLICT (id) DO UPDATE SET s = …` writes the unlisted SET target `t.s`', () => {
    // RED today — resolveWrite's InsertStmt ON CONFLICT branch resolves the SET right-hand
    // sides as READS but never calls recordWrite for a ResTarget.name, so `s` (a SET target
    // absent from the INSERT column list) never reaches writes.t.
    const r = R.resolveStatement(
      'INSERT INTO t (id, a) VALUES ($1, $2) ' +
        'ON CONFLICT (id) DO UPDATE SET a = EXCLUDED.a, ' +
        's = CASE WHEN t.a IS DISTINCT FROM EXCLUDED.a THEN NULL ELSE t.s END ' +
        'WHERE t.a IS DISTINCT FROM EXCLUDED.a',
      { t: ['id', 'a', 's'] },
    );
    expect(r.error).toBeNull();
    expect(r.kind).toBe('write');
    expect(r.writes.t).toContain('s');
    expect(r.writes.t).toEqual(expect.arrayContaining(['id', 'a']));
  });

  it('T6b RED: the REAL load_parcels upsert writes all three `*_dataset_version_when_enriched` columns', () => {
    // RED today — measured against the committed witness trace: the live `upsert_sql` SETs
    // these three columns (none of them is in the INSERT column list), but the resolver
    // reports them under reads.parcels and NOT under writes.parcels.
    const r = R.resolveStatement(realUpsertSql(), loadCatalog());
    expect(r.error).toBeNull();
    expect(r.writes.parcels).toEqual(
      expect.arrayContaining([
        'ravine_dataset_version_when_enriched',
        'heritage_dataset_version_when_enriched',
        'centreline_dataset_version_when_enriched',
      ]),
    );
  });

  it('GREEN control: a plain INSERT with no ON CONFLICT still writes exactly its column list', () => {
    // GREEN control — no ON CONFLICT clause at all, so the INSERT column list is the whole
    // write set: unchanged by any fix to the DO UPDATE SET target handling.
    const r = R.resolveStatement('INSERT INTO t (id, a) VALUES ($1, $2)', { t: ['id', 'a', 's'] });
    expect(sorted(r.writes.t!)).toEqual(['a', 'id']);
  });

  it('GREEN control: ON CONFLICT DO NOTHING adds no write beyond the INSERT column list', () => {
    // GREEN control — DO NOTHING has no ResTargets, so it can never add a write: the write
    // set stays exactly the INSERT column list.
    const r = R.resolveStatement(
      'INSERT INTO t (id, a) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
      { t: ['id', 'a', 's'] },
    );
    expect(sorted(r.writes.t!)).toEqual(['a', 'id']);
  });
});
