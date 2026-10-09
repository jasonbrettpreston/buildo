// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1(e) / §10.1; Spec 124 §5 R-BG (ii); WF3 sql-witness write-scope relations + unqualified columns (docs/reports/review_followups.md, set-op deferrals rows 2-3)
//
// RED-first lock for two write-scope gaps in the SQL witness resolver:
//   (1) `UPDATE … FROM t` / `DELETE … USING t` records no bare read of `t` when no column
//       of `t` is named — so the FROM/USING relation is silently dropped from `reads`;
//   (2) an unknown unqualified column in UPDATE/DELETE/INSERT-RETURNING is silent: the
//       write scope has no relations of its own (the target sits in the parent scope), so
//       the SELECT rule — a lone candidate is credited, 2+ candidates with no match
//       refuse — never fires.
//
// The W-tests and T-tests below are RED until the fix; the G-tests are fences that must
// pass BOTH before and after (G4–G6 pin that a write scope with a DERIVED source in
// FROM/USING stays conservative — the resolver cannot know a derived source's columns).

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';

// Copied verbatim from sql-witness-resolve-dmlcte.logic.test.ts (module contract + the
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
  b: ['x', 'y'],
  parcels: ['id', 'zone'],
  other: ['id', 'w'],
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

describe('WF3 sql-witness write-scope relations (RED)', () => {
  it('W1 an UPDATE … FROM with no named column still records the FROM relation as a bare read', () => {
    expectRes('UPDATE parcels SET zone = 1 FROM other', CAT, {
      kind: 'write',
      reads: { other: [] },
      writes: { parcels: ['zone'] },
    });
  });

  it('W2 a DELETE … USING with no named column still records the USING relation as a bare read', () => {
    expectRes('DELETE FROM parcels USING other', CAT, {
      kind: 'write',
      reads: { other: [] },
      writes: { parcels: [] },
    });
  });

  it('W3 an UPDATE … FROM names a column of the FROM relation and the target', () => {
    expectRes('UPDATE parcels SET zone = 1 FROM other WHERE zone = 1', CAT, {
      kind: 'write',
      reads: { other: [], parcels: ['zone'] },
      writes: { parcels: ['zone'] },
    });
  });
});

describe('WF3 sql-witness write-scope unqualified columns (RED)', () => {
  it('T1 a lone target is credited with an unknown unqualified column', () => {
    expectRes('DELETE FROM parcels WHERE typo = 1', CAT, {
      kind: 'write',
      reads: { parcels: ['typo'] },
      writes: { parcels: [] },
    });
  });

  it('T2 an unknown unqualified column on a SET right-hand side is credited to the lone target', () => {
    expectRes('UPDATE parcels SET zone = typo', CAT, {
      kind: 'write',
      reads: { parcels: ['typo'] },
      writes: { parcels: ['zone'] },
    });
  });

  it('T3 a target plus FROM with no matching column is refused by name', () => {
    expect(R.resolveStatement('UPDATE parcels SET zone = 1 FROM other WHERE typo = 1', CAT).error).toBe(
      'FAIL:INPUT:column:typo',
    );
  });

  it('T4 an unknown unqualified column in INSERT RETURNING is credited to the lone target', () => {
    expectRes('INSERT INTO b (x) VALUES (1) RETURNING typo', CAT, {
      kind: 'write',
      reads: { b: ['typo'] },
      writes: { b: ['x'] },
    });
  });
});

describe('WF3 sql-witness write-scope fences (green before and after)', () => {
  it('G1 a named column of the FROM relation is credited there', () => {
    expectRes('UPDATE parcels SET zone = 1 FROM other WHERE w = 1', CAT, {
      kind: 'write',
      reads: { other: ['w'] },
      writes: { parcels: ['zone'] },
    });
  });

  it('G2 aliased target and FROM relation both read by alias-qualified column', () => {
    expectRes('UPDATE parcels p SET zone = 1 FROM other o WHERE p.id = o.id', CAT, {
      kind: 'write',
      reads: { other: ['id'], parcels: ['id'] },
      writes: { parcels: ['zone'] },
    });
  });

  it('G3 a system column is never credited', () => {
    expectRes('UPDATE parcels SET zone = 1 WHERE ctid = 1', CAT, {
      kind: 'write',
      reads: {},
      writes: { parcels: ['zone'] },
    });
  });

  it('G4 a subquery source in FROM leaves the write scope conservative', () => {
    expectRes('UPDATE parcels SET zone = s.v FROM (SELECT 1 AS v) s WHERE typo = 1', CAT, {
      kind: 'write',
      reads: {},
      writes: { parcels: ['zone'] },
    });
  });

  it('G5 a CTE source in FROM leaves the write scope conservative', () => {
    expectRes('WITH c AS (SELECT 1 AS q) UPDATE parcels SET zone = q FROM c', CAT, {
      kind: 'write',
      reads: {},
      writes: { parcels: ['zone'] },
    });
  });

  it('G6 a function alias in FROM leaves the write scope conservative', () => {
    expectRes('UPDATE parcels SET zone = u.z FROM unnest(ARRAY[1]) AS u(z) WHERE typo = 1', CAT, {
      kind: 'write',
      reads: {},
      writes: { parcels: ['zone'] },
    });
  });

  it('G7 xmax in RETURNING is neither an error nor a read', () => {
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

  it('G8 a subquery keeps its own scope', () => {
    expectRes('DELETE FROM parcels WHERE id IN (SELECT id FROM other WHERE w = 1)', CAT, {
      kind: 'write',
      reads: { other: ['id', 'w'], parcels: ['id'] },
      writes: { parcels: [] },
    });
  });

  it('G9 a known target column is read from the target', () => {
    expectRes('UPDATE parcels SET zone = 1 WHERE id = 1', CAT, {
      kind: 'write',
      reads: { parcels: ['id'] },
      writes: { parcels: ['zone'] },
    });
  });
});
