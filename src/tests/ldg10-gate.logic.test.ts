// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DI (LDG-10), R-BC (c), R-BF, R-BJ, R-BP
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §6.6 / §6.6.1
//
// LDG-10 (McDonald's Airtight V3, operator y 2026-10-17): the cross-step ledger is proven from WITNESSED traces.
// One lock per built part, both directions:
//   P1-C9  — #44 is HARD for a converted slug as for a pending one;
//   G5     — a DECLARED system relation (pg_*) joins the witness catalog and resolves at column level;
//            an undeclared one stays excluded;
//   gate D — an unconverted step's observed read of a step-written table's unwritten column is counted
//            (hard when the table has a converted inserter, MQ-A5);
//   #50    — the LDG-10 status line is a conjunction: clean → PARTIAL while a clause is pending, any FAIL → FAIL.
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = process.cwd();
type Witness = {
  evaluateWitness: (a: Record<string, unknown>) => { rows: string[]; hardStop: boolean };
};
type Ldg10 = {
  ldg10Status: (a: Record<string, unknown>) => { answer: string; classes: Record<string, string> };
  selfTest: () => { ok: boolean; detail: string };
};
type Registry = {
  unproducedStepReads: (eff: { inchain: Record<string, unknown> }) => string[];
  splitUnproduced: (u: string[], inserters: string[]) => { hard: string[]; unwitnessed: string[] };
};
type Resolver = {
  init: () => Promise<void>;
  resolveStatement: (sql: string, catalog: Record<string, string[]>) => { reads: Record<string, string[]>; excluded: string[]; error: string | null };
};
type Harness = {
  snapshotCatalog: (pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, string>> }> }, opts?: { systemRelations?: string[] }) => Promise<Record<string, string[]>>;
  declaredSystemRelations: (d: unknown) => string[];
  fleetSystemRelations: () => string[];
};

const imp = async <T>(rel: string): Promise<T> => (await import(pathToFileURL(path.join(ROOT, rel)).href)) as T;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const R = require(path.join(ROOT, 'scripts/lib/sql-witness/resolve.cjs')) as Resolver;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const H = require(path.join(ROOT, 'scripts/analysis/capture-witness.js')) as Harness;

const DESCRIPTOR = {
  identity: { name: 'fx' },
  inputs: { reads: { tables: [{ table: 'parcels', columns: ['id'] }] } },
  outputs: { writes: [{ table: 'parcels', columns: [{ name: 'a' }] }], write_inventory: { statements: 1 } },
  execution: { txn_scope: 'step' },
};
const trace = (reads: Record<string, string[]>) => ({
  source_fingerprint: 'fp',
  statements: [{ fingerprint: 'w1', kind: 'write', reads: { parcels: ['id'] }, writes: { parcels: ['a'] }, excluded: [], error: null }],
  transactions: [{ client: '1:1', write_fingerprints: ['w1'] }],
  autocommit_writes: [],
  touched: { reads, writes: { parcels: ['a'] } },
  errors: [],
});

describe('LDG-10 (Spec 124 R-DI) — P1-C9: #44 is hard for converted slugs', () => {
  let W: Witness;
  beforeAll(async () => { W = await imp<Witness>('scripts/analysis/gates/witness.mjs'); });
  const base = { slug: 'fx', descriptor: DESCRIPTOR, currentFingerprint: 'fp', preTraces: {}, explainedDiffs: [] };

  it('RED: an undeclared read on a CONVERTED slug hard-stops', () => {
    const r = W.evaluateWitness({ ...base, status: 'converted', postTraces: { fx: trace({ parcels: ['id', 'secret'] }) } });
    expect(r.rows).toContain('FAIL:WITNESS:fx:a:parcels.secret');
    expect(r.hardStop).toBe(true);
  });

  it('GREEN: a declared trace on a converted slug does not', () => {
    const r = W.evaluateWitness({ ...base, status: 'converted', postTraces: { fx: trace({ parcels: ['id'] }) } });
    expect(r.rows).toEqual([]);
    expect(r.hardStop).toBe(false);
  });
});

describe('LDG-10 G5 — a declared system relation is witnessed at column level', () => {
  beforeAll(async () => { await R.init(); });

  it('the harness snapshots pg_catalog columns only for the system relations it is given', async () => {
    const seen: string[] = [];
    const pool = {
      query: async (sql: string) => {
        seen.push(sql);
        return /pg_catalog/.test(sql)
          ? { rows: [{ table_name: 'pg_stat_user_tables', column_name: 'relname' }, { table_name: 'pg_stat_user_tables', column_name: 'n_dead_tup' }] }
          : { rows: [{ table_name: 'parcels', column_name: 'id' }] };
      },
    };
    expect(await H.snapshotCatalog(pool, { systemRelations: ['pg_stat_user_tables'] })).toEqual({
      parcels: ['id'],
      pg_stat_user_tables: ['n_dead_tup', 'relname'],
    });
    expect(seen.length).toBe(2);
    seen.length = 0;
    await H.snapshotCatalog(pool);
    expect(seen.length).toBe(1); // no system relation → the public-only contract, unchanged
  });

  it('the fleet set is every declared pg_* read (assert_engine_health declares pg_stat_user_tables)', () => {
    expect(H.declaredSystemRelations({ inputs: { reads: { tables: [{ table: 'pg_stat_user_tables' }, { table: 'parcels' }] } } })).toEqual(['pg_stat_user_tables']);
    expect(H.fleetSystemRelations()).toContain('pg_stat_user_tables');
  });

  it('GREEN: a catalogued pg_* relation resolves at column level', () => {
    const r = R.resolveStatement('SELECT relname, n_dead_tup FROM pg_stat_user_tables', { pg_stat_user_tables: ['n_dead_tup', 'relname'] });
    expect(r.error).toBeNull();
    expect(r.reads.pg_stat_user_tables).toEqual(['n_dead_tup', 'relname']);
  });

  it('RED control: the same relation NOT in the catalog stays excluded (an undeclared system read is never credited)', () => {
    const r = R.resolveStatement('SELECT relname FROM pg_stat_user_tables', { parcels: ['id'] });
    expect(r.reads.pg_stat_user_tables).toBeUndefined();
    expect(r.excluded).toContain('pg_stat_user_tables');
  });
});

describe('LDG-10 class 2 — gate D counts unconverted steps\' observed reads', () => {
  let G: Registry;
  beforeAll(async () => { G = await imp<Registry>('scripts/analysis/gates/consumer-registry.mjs'); });
  const eff = {
    inchain: {
      producer: { source: 'descriptor', reads: {}, writes: { t: ['x'] } },
      legacy: { source: 'snapshot', reads: { t: ['x', 'y'], other: ['z'] }, writes: {} },
      converted_reader: { source: 'descriptor', reads: { t: ['y'] }, writes: {} },
    },
  };

  it('RED: an unconverted step reading an unwritten column of a step-written table is listed (the converted reader is not — #44 owns it)', () => {
    expect(G.unproducedStepReads(eff)).toEqual(['unproduced:step:legacy:t.y']);
  });

  it('MQ-A5: hard only when the table has a converted inserter', () => {
    expect(G.splitUnproduced(G.unproducedStepReads(eff), ['t']).hard).toEqual(['unproduced:step:legacy:t.y']);
    expect(G.splitUnproduced(G.unproducedStepReads(eff), []).unwitnessed).toEqual(['UNPRODUCED-UNWITNESSED:step:legacy:t.y']);
  });

  it('GREEN: once the producer declares the column, nothing is listed', () => {
    const fixed = { inchain: { ...eff.inchain, producer: { source: 'descriptor', reads: {}, writes: { t: ['x', 'y'] } } } };
    expect(G.unproducedStepReads(fixed)).toEqual([]);
  });
});

describe('LDG-10 #50 — the status line is a conjunction, never a PASS by absence', () => {
  let L: Ldg10;
  beforeAll(async () => { L = await imp<Ldg10>('scripts/analysis/gates/ldg10.mjs'); });

  it('module self-test passes', () => {
    expect(L.selfTest().ok).toBe(true);
  });

  it('clean measured classes with a pending clause → PARTIAL; a #44 FAIL → FAIL; a slug with no #44 evaluation → FAIL', () => {
    const base = {
      sourcesSlugs: ['a'], convertedSlugs: ['a'], exemptSlugs: [], witnessRowsBySlug: { a: [] },
      gateD: { pass: true }, orderRows: [], pending: ['EP-PIN-D17 cloud proof'],
    };
    expect(L.ldg10Status(base).answer).toBe('PARTIAL');
    expect(L.ldg10Status({ ...base, witnessRowsBySlug: { a: ['FAIL:WITNESS:a:e:missing:p'] } }).answer).toBe('FAIL');
    expect(L.ldg10Status({ ...base, witnessRowsBySlug: {} }).answer).toBe('FAIL');
    expect(L.ldg10Status({ ...base, gateD: { pass: false } }).answer).toBe('FAIL');
  });
});
