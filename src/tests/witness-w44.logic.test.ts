// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-BL(iv), R-DG (#44 witness), 122 §6.6.1(a)
//
// #44 diagnosis 2026-10-17 (.cursor/v3-w44-diagnosis-2026-10-17.md), McDonald's Airtight V3:
//   G13  an outputs.invalidates[] row carrying set_null_on_change_of is a DECLARED write (and read) of its
//        table — the same rule deriveMeta applies — so (a) no longer reports it; a `by:"trigger"` row is not.
//   G7   (R-DG) a READ statement whose fingerprint equals the step's OWN plausibility[]/invariants[] SQL is
//        accounted against that SQL in (a)'s traced ⊆ declared half; any other statement reading the same
//        column, or an own-fingerprint WRITE, still fails. The declared ⊆ witnessed half is unchanged.
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

type Touched = { reads: Record<string, string[]>; writes: Record<string, string[]> };
type Statement = { fingerprint: string; kind: string; reads: Record<string, string[]>; writes: Record<string, string[]>; error: string | null };
type WitnessModule = {
  undeclaredItems: (descriptor: unknown, touched: Touched) => string[];
  declaredWrites: (descriptor: unknown) => Array<{ table: string; cols: string[] }>;
  ownMeasurementSql: (descriptor: unknown) => string[];
  withoutOwnMeasurementReads: (trace: { statements: Statement[]; touched: Touched }, own: Set<string> | null) => Touched;
};

let W: WitnessModule;

const base = {
  inputs: { reads: { tables: [{ table: 'parcels', columns: ['id', 'geom'] }] } },
  outputs: { writes: [{ table: 'parcels', columns: [{ name: 'a' }] }] },
};

describe('#44 witness — G13 invalidates columns and G7 own-measurement accounting (McDonald\'s Airtight V3)', () => {
  beforeAll(async () => {
    W = (await import(pathToFileURL(path.join(process.cwd(), 'scripts/analysis/gates/witness.mjs')).href)) as unknown as WitnessModule;
  });

  it('G13: a set_null_on_change_of column is a declared write of its table', () => {
    const d = { ...base, outputs: { ...base.outputs, invalidates: [{ table: 'parcels', column: 'v_when', set_null_on_change_of: 'geom', by: 'set_null_on_change_of' }] } };
    expect(W.declaredWrites(d).find((w) => w.table === 'parcels')!.cols).toEqual(['a', 'v_when']);
    expect(W.undeclaredItems(d, { reads: { parcels: ['geom', 'v_when'] }, writes: { parcels: ['a', 'v_when'] } })).toEqual([]);
  });

  it('G13 control: a by:"trigger" invalidates row is someone else\'s write', () => {
    const d = { ...base, outputs: { ...base.outputs, invalidates: [{ table: 'parcels', column: 'v_when', by: 'trigger' }] } };
    expect(W.undeclaredItems(d, { reads: {}, writes: { parcels: ['a', 'v_when'] } })).toEqual(['a:parcels.v_when']);
  });

  it('G7: the own-measurement SQL is the descriptor\'s plausibility[] and invariants[] sql', () => {
    expect(W.ownMeasurementSql({ plausibility: [{ sql: 'SELECT 1' }], invariants: [{ sql: 'SELECT 2' }, { id: 'x' }] })).toEqual(['SELECT 1', 'SELECT 2']);
  });

  const trace = (extra: Statement[]) => ({
    statements: [
      { fingerprint: 'w1', kind: 'write', reads: { parcels: ['id'] }, writes: { parcels: ['a'] }, error: null },
      { fingerprint: 'own', kind: 'read', reads: { permits: ['permit_num'] }, writes: {}, error: null },
      ...extra,
    ],
    touched: { reads: { parcels: ['id'], permits: ['permit_num'] }, writes: { parcels: ['a'] } },
  });

  it('G7: a read only the step\'s own measurement SQL made is accounted against that SQL', () => {
    expect(W.undeclaredItems(base, W.withoutOwnMeasurementReads(trace([]), new Set(['own'])))).toEqual([]);
  });

  it('G7 control: the same column read by a compute statement still fails (a)', () => {
    const t = trace([{ fingerprint: 'c9', kind: 'read', reads: { permits: ['permit_num'] }, writes: {}, error: null }]);
    expect(W.undeclaredItems(base, W.withoutOwnMeasurementReads(t, new Set(['own'])))).toEqual(['a:permits.*']);
  });

  it('G7 control: no own fingerprints → nothing is accounted', () => {
    expect(W.undeclaredItems(base, W.withoutOwnMeasurementReads(trace([]), new Set()))).toEqual(['a:permits.*']);
  });
});
