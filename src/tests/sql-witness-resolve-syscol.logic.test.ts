// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md §5 R-BW (6) ("system columns and derived FROM/USING sources stay derived"); scripts/lib/sql-witness/resolve.cjs SYSTEM_COLUMNS ("never in information_schema.columns, never credited")
//
// RED-first lock: a PostgreSQL system column is never credited as a read or write, on EVERY
// resolver path. Before the fix only the write-scope unqualified path (writeScopeUnqualified)
// honoured SYSTEM_COLUMNS; a QUALIFIED reference (`lp.ctid`) or an unqualified one in a SELECT
// scope with a lone relation was credited, so the link_coa_to_parcels wave-4 PRE trace
// (statement 0785f3332266f06c) named `lead_parcels.ctid` — a column the witness catalog
// (information_schema.columns) can never carry. Operator ruling 2026-10-19: the existing rule
// R-BW (6) wins; the catalog stays as it is.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import path from 'path';

type ResolverModule = {
  init: () => Promise<void>;
  resolveStatement: (
    sql: string,
    catalog: Record<string, string[]>,
  ) => {
    kind: string;
    reads: Record<string, string[]>;
    writes: Record<string, string[]>;
    error: string | null;
  };
};

let R: ResolverModule;
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

const CAT: Record<string, string[]> = {
  lead_parcels: ['lead_id', 'parcel_id'],
  coa_applications: ['lead_id'],
};

const SYSTEM = ['ctid', 'xmin', 'xmax', 'cmin', 'cmax', 'tableoid', 'oid'];

const credited = (res: { reads: Record<string, string[]>; writes: Record<string, string[]> }): string[] =>
  [...Object.values(res.reads), ...Object.values(res.writes)].flat().filter((c) => SYSTEM.includes(c));

describe('R-BW (6) — system columns are never credited, on every resolver path', () => {
  it('S1 the 0785f3332266f06c shape: DELETE … WHERE ctid IN (SELECT lp.ctid …) credits no ctid, errors nowhere, keeps the real reads', () => {
    const res = R.resolveStatement(
      `DELETE FROM lead_parcels
        WHERE ctid IN (
          SELECT lp.ctid FROM lead_parcels lp
           WHERE lp.lead_id LIKE 'coa:%'
             AND NOT EXISTS (SELECT 1 FROM coa_applications ca WHERE ca.lead_id = lp.lead_id)
           LIMIT $1
        )`,
      CAT,
    );
    expect(res.error).toBeNull();
    expect(res.kind).toBe('write');
    expect(credited(res)).toEqual([]);
    expect(res.reads).toEqual({ coa_applications: ['lead_id'], lead_parcels: ['lead_id'] });
  });

  it('S2 a qualified system column in a SELECT is not a read (every member of the set)', () => {
    for (const c of SYSTEM) {
      const res = R.resolveStatement(`SELECT lp.${c}, lp.lead_id FROM lead_parcels lp`, CAT);
      expect(res.error, c).toBeNull();
      expect(credited(res), c).toEqual([]);
      expect(res.reads, c).toEqual({ lead_parcels: ['lead_id'] });
    }
  });

  it('S3 an unqualified system column on a lone relation is not a read', () => {
    const res = R.resolveStatement('SELECT ctid, lead_id FROM lead_parcels', CAT);
    expect(res.error).toBeNull();
    expect(credited(res)).toEqual([]);
    expect(res.reads).toEqual({ lead_parcels: ['lead_id'] });
  });

  it('S4 fence: an ordinary column that is NOT in the system set is still credited (qualified and unqualified)', () => {
    const res = R.resolveStatement('SELECT lp.parcel_id, lead_id FROM lead_parcels lp', CAT);
    expect(res.reads).toEqual({ lead_parcels: ['lead_id', 'parcel_id'] });
  });
});
