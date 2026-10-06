// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6.1 / §10.1; Spec 124 §5 R-BG (ii); WF3 resolver five defects (.cursor/wf3_resolver_five_defects_active_task.md)
//
// RED-first lock for the WF3 resolver's five defects. This file covers three of them:
//   (a) UPDATE … FROM (subquery): the derived relation's alias never binds its output
//       columns, so every reference to one is FAIL:INPUT:column:<name> — which is what
//       the two committed link_wsib POST traces carry today (T-a1, T-a2).
//   (b) ON CONFLICT DO UPDATE SET targets (and every INSERT column) are missing from
//       `writes` (T-b1, T-b2); runner-owned tables stay `excluded` (T-b3).
//   (e) a session temp declared WITHOUT `AS` that shadows a catalog table is not refused
//       (T-e1); non-shadowing temps and staging relations stay utility (T-e2..T-e4).
//
// Per Spec 122 §6.6.1 (#44) declared must equal observed; per Spec 122 §10.1 there is
// ONE resolver, so these three defects are witnessed in one place. Per Spec 124 §5 R-BG
// (ii), a temp that shadows a catalog table is FAIL:INPUT — never a silent utility.
//
// Every RED carries a GREEN fence proving the same assertion surface passes on a
// sibling input today, so the guard cannot be "fixed" by blanket-loosening the resolver.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';

// Copied verbatim from sql-witness-resolve.logic.test.ts (module contract + extra fields
// this file asserts on: `kind` and the session-temp collector).
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
  t: ['a', 'b', 'c', 'id', 'updated_at'],
  u: ['id', 'x', 'y'],
  parcels: ['id', 'geom'],
  entities: ['id', 'primary_phone', 'primary_email', 'website'],
  wsib_registry: ['linked_entity_id', 'match_confidence', 'primary_phone', 'primary_email', 'website'],
  engine_health_snapshots: [
    'table_name',
    'snapshot_date',
    'n_live_tup',
    'n_dead_tup',
    'dead_ratio',
    'seq_scan',
    'idx_scan',
    'seq_ratio',
    'captured_at',
  ],
  pipeline_runs: ['id', 'pipeline', 'status', 'completed_at'],
};

// Helpers shared by the assertions below.
const keys = (m: Record<string, string[]>): string[] => Object.keys(m).sort();
const sorted = (xs: string[]): string[] => [...xs].sort();

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

describe('WF3 resolver five defects', () => {
  // -------------------------------------------------------------------------
  // (a) UPDATE … FROM (subquery) — the derived alias must bind its outputs
  // -------------------------------------------------------------------------

  it('T-a1 RED: UPDATE … FROM (SELECT … GROUP BY) binds the subquery alias and reads both tables', () => {
    // RED today: the subquery alias `s` is unbound, so `s.total` becomes
    // FAIL:INPUT:column:total and the error is non-null.
    const sql =
      'UPDATE t SET a = s.total FROM (SELECT id, count(*) AS total FROM u GROUP BY id) s WHERE t.id = s.id';
    const res = R.resolveStatement(sql, CAT);
    expect(res.error).toBeNull();
    expect(res.reads).toEqual({ t: ['id'], u: ['id'] });
    expect(res.writes).toEqual({ t: ['a'] });
  });

  it('T-a2 RED: the committed link_wsib contacts UPDATE resolves cleanly (no FAIL:INPUT:column:primary_phone)', () => {
    // RED today: this exact shape yields FAIL:INPUT:column:primary_phone — the error
    // carried by the two committed link_wsib POST traces.
    // Extract the template literal buildContactsSql() returns, verbatim, from source.
    const src = fs.readFileSync(
      path.join(process.cwd(), 'scripts/lib/compute/link-wsib.js'),
      'utf8',
    );
    const startMarker = 'return `UPDATE entities e';
    const start = src.indexOf(startMarker);
    expect(start).toBeGreaterThanOrEqual(0);
    const bodyStart = start + 'return `'.length;
    const end = src.indexOf('`', bodyStart);
    expect(end).toBeGreaterThan(bodyStart);
    const sql = src.slice(bodyStart, end).replace(/\$1/g, '$1');

    const res = R.resolveStatement(sql, CAT);
    expect(res.error).toBeNull();
    expect(res.writes).toEqual({
      entities: ['primary_email', 'primary_phone', 'website'],
    });
    expect(keys(res.writes)).toEqual(['entities']);
    expect(res.reads.wsib_registry).toBeDefined();
    expect(res.reads.wsib_registry).toContain('linked_entity_id');
    expect(res.reads.wsib_registry).toContain('match_confidence');
    expect(res.reads.wsib_registry).toContain('primary_phone');
    expect(res.reads.entities).toBeDefined();
    expect(res.reads.entities).toContain('id');
  });

  it('T-a3 GREEN fence: a subquery output name is never credited to a catalog table (and is accepted, not refused)', () => {
    // GREEN today: neither the outer table nor the subquery base gains `nope`.
    const sql =
      'UPDATE t SET a = s.nope FROM (SELECT id FROM u) s WHERE t.id = s.id';
    const res = R.resolveStatement(sql, CAT);
    expect(res.reads.t ?? []).not.toContain('nope');
    expect(res.reads.u ?? []).not.toContain('nope');
    // Accepted by design: a derived (subquery) alias's output names are not validated — the same rule resolveScope applies to SELECT; what is locked is that the name is never credited to a catalog table.
    expect(res.error).toBeNull();
  });

  // -------------------------------------------------------------------------
  // (b) ON CONFLICT DO UPDATE SET targets are writes
  // -------------------------------------------------------------------------

  it('T-b1 RED: ON CONFLICT (a) DO UPDATE SET targets are recorded as writes', () => {
    // RED today: `updated_at` (and the ON CONFLICT target's own column) is missing
    // from writes, so declared != observed per Spec 122 §6.6.1.
    const sql =
      'INSERT INTO t (a, b) VALUES ($1, $2) ON CONFLICT (a) DO UPDATE SET b = EXCLUDED.b, updated_at = now()';
    const res = R.resolveStatement(sql, CAT);
    expect(res.writes).toEqual({ t: ['a', 'b', 'updated_at'] });
    expect(res.error).toBeNull();
  });

  it('T-b2 RED: the committed assert_engine_health UPSERT_SQL writes every INSERT column plus captured_at', () => {
    // RED today: `captured_at` (and the DO UPDATE SET columns) is absent from
    // engine_health_snapshots' write set.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(
      path.join(process.cwd(), 'scripts/lib/compute/assert-engine-health.js'),
    ) as { UPSERT_SQL: string };
    const res = R.resolveStatement(mod.UPSERT_SQL, CAT);
    const w = res.writes.engine_health_snapshots ?? [];
    expect(w).toContain('captured_at');
    expect(w).toContain('table_name');
    expect(w).toContain('snapshot_date');
    expect(w).toContain('n_live_tup');
  });

  it('T-b3 GREEN fence: a runner-owned table stays excluded even with ON CONFLICT DO UPDATE', () => {
    // GREEN today: pipeline_runs is runner-owned, so the upsert's conflict-clause
    // columns must not leak into writes; the table shows up under `excluded`.
    const sql =
      'INSERT INTO pipeline_runs (pipeline, status) VALUES ($1, $2) ON CONFLICT (pipeline) DO UPDATE SET completed_at = now()';
    const res = R.resolveStatement(sql, CAT);
    expect(res.writes).toEqual({});
    expect(res.excluded).toContain('pipeline_runs');
  });

  // -------------------------------------------------------------------------
  // (e) a non-AS TEMP that shadows a catalog table is a mismatch
  // -------------------------------------------------------------------------

  it('T-e1 RED: CREATE TEMP TABLE parcels (id int) is FAIL:INPUT:temp-shadows, as the AS form already is', () => {
    // RED today: the plain column-definition form falls through to a silent
    // utility; the AS form already raises the error (asserted here as the control).
    const plain = R.resolveStatement('CREATE TEMP TABLE parcels (id int)', CAT);
    expect(plain.error).toBe('FAIL:INPUT:temp-shadows:parcels');

    const asForm = R.resolveStatement('CREATE TEMP TABLE parcels AS SELECT id FROM u', CAT);
    expect(asForm.error).toBe('FAIL:INPUT:temp-shadows:parcels');
  });

  it('T-e2 GREEN fence: a non-shadowing temp is utility and collected as a session temp', () => {
    // GREEN today: scratch_x is neither a catalog table nor a staging relation.
    const res = R.resolveStatement('CREATE TEMP TABLE scratch_x (id int)', CAT);
    expect(res.kind).toBe('utility');
    expect(res.error).toBeNull();
    expect(R.collectSessionTemps('CREATE TEMP TABLE scratch_x (id int)', CAT).has('scratch_x')).toBe(true);
  });

  it('T-e3 GREEN fence: a non-temp CREATE TABLE is utility', () => {
    // GREEN today: no temp persistence bit, so no shadow rule applies.
    const res = R.resolveStatement('CREATE TABLE parcels_new (id int)', CAT);
    expect(res.kind).toBe('utility');
    expect(res.error).toBeNull();
  });

  it('T-e4 GREEN fence: a TEMP staging of a catalog table is not a shadow', () => {
    // GREEN today: isCatalogStaging (e33b8121) exempts the `_staging` of a catalog
    // relation from the temp-shadow rule.
    const res = R.resolveStatement('CREATE TEMP TABLE parcels_staging (LIKE parcels)', CAT);
    expect(res.error).toBeNull();
  });

  it('sanity: the fixture write sets above are sorted-string comparisons on real column lists', () => {
    // Guards the helpers themselves: sorted()/keys() must not silently normalize
    // a missing column into a pass.
    expect(keys({ t: ['a'] })).toEqual(['t']);
    expect(sorted(['b', 'a'])).toEqual(['a', 'b']);
  });

  it('sanity: resolver module exposes every entry point these tests rely on', () => {
    expect(typeof R.resolveStatement).toBe('function');
    expect(typeof R.collectSessionTemps).toBe('function');
  });
});
