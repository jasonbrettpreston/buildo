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
      outputs: { writes: Array<{ columns: Array<{ name: string }> }> };
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
    const declared = writeSpec.columns.map((c) => c.name).filter((n) => n !== 'geom');
    expect(r.writes.parcels).toEqual(expect.arrayContaining(declared));
  });
});
