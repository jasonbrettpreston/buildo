// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DP
//
// R-DP (operator y 2026-10-18): ingestor-forced-cohort.js --op=delete_reinsert is the
// INSERT-only form of the gate G #38 bracket. The cohort is the first N DISTINCT keys, the
// before-image holds their FULL rows, --run DELETEs them, the step must re-insert exactly the
// deleted (key, column) pairs, and the restore re-inserts only the pairs still missing.

import { describe, expect, it } from 'vitest';
import * as path from 'node:path';

type Entry = { key: string; value: unknown };
/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS instrument */
const cohort = require(path.join(process.cwd(), 'scripts/analysis/ingestor-forced-cohort.js')) as {
  parseArgs: (a: string[]) => Record<string, unknown>;
  validateFlags: (a: Record<string, unknown>) => Record<string, unknown>;
  parseOp: (raw: string) => { kind: string };
  perturbationDeleteSql: (o: Record<string, unknown>) => string;
  eligibleCountSql: (o: Record<string, unknown>) => string;
  orderedKeysSql: (o: Record<string, unknown>, b: { bounded: boolean }) => string;
  backupCreateSql: (o: Record<string, unknown>) => string;
  restoreSql: (o: Record<string, unknown>, columns?: string[]) => string;
  hashOf: (o: Record<string, unknown>) => string;
  pairSafetySql: (kind: string) => string;
  pairModeRefusal: (r: Partial<Record<'inboundFks' | 'deleteTriggers' | 'generatedColumns', { n: number; names: string }>>) => { ok: boolean; reason?: string };
  backupColumnsSql: () => string;
  pairId: (k: unknown, c: unknown) => string;
  rowsToKeyValues: (rows: Array<Record<string, unknown>>, key: string, column: string, pair?: boolean) => Entry[];
  captureClaim: (o: { recordsUpdated: number; recordsNew: number; liveValues: Entry[]; backupValues: Entry[] }) => { ok: boolean };
};

const flags = [
  '--run', '--table=parcel_address_points', '--key=parcel_id', '--column=address_point_id',
  '--op=delete_reinsert', '--count=200', '--where=true', '--order=t.parcel_id',
  '--backup-table=parcel_address_points_cohort_bak_20261018t0100z',
  '--step=scripts/link-parcel-addresses.js', '--chain=sources',
  '--out=docs/reports/golden/link_parcel_addresses/post/sources.json',
  '--env=LINK_PARCEL_ADDRESSES_FORCE_FULL=1',
];
const pairs = (rows: Array<[number, number]>) =>
  cohort.rowsToKeyValues(rows.map(([p, a]) => ({ parcel_id: p, address_point_id: a })), 'parcel_id', 'address_point_id', true);

describe('R-DP — ingestor-forced-cohort --op=delete_reinsert (INSERT-only bracket)', () => {
  it('parses as its own op and validates with the key as the order', () => {
    expect(cohort.parseOp('delete_reinsert').kind).toBe('delete_reinsert');
    expect(() => cohort.validateFlags(cohort.parseArgs(flags))).not.toThrow();
    expect(() => cohort.validateFlags(cohort.parseArgs(flags.map((a) => (a.startsWith('--order=') ? '--order=t.address_point_id' : a))))).toThrow(/cohort key/);
  });

  it('the cohort is N distinct keys, the before-image is the full row, the perturbation is a keyed DELETE', () => {
    const o = cohort.validateFlags(cohort.parseArgs(flags));
    expect(cohort.eligibleCountSql(o)).toContain('count(DISTINCT t."parcel_id")');
    expect(cohort.orderedKeysSql(o, { bounded: true })).toContain('GROUP BY t."parcel_id" ORDER BY t."parcel_id" LIMIT 200');
    expect(cohort.backupCreateSql(o)).toContain('SELECT t.* FROM parcel_address_points t WHERE t."parcel_id" = ANY($1)');
    expect(cohort.perturbationDeleteSql(o)).toBe('DELETE FROM parcel_address_points t WHERE t."parcel_id" = ANY($1) RETURNING t."parcel_id", t."address_point_id"');
  });

  it('the restore re-inserts only missing cohort pairs, through an EXPLICIT column list (never b.*)', () => {
    const o = cohort.validateFlags(cohort.parseArgs(flags));
    const sql = cohort.restoreSql(o, ['parcel_id', 'address_point_id', 'linked_at']);
    expect(sql).toMatch(/^INSERT INTO parcel_address_points \("parcel_id", "address_point_id", "linked_at"\) SELECT b\."parcel_id", b\."address_point_id", b\."linked_at" FROM parcel_address_points_cohort_bak_20261018t0100z b/);
    expect(sql).not.toContain('b.*');
    expect(sql).toContain('b."parcel_id" = ANY($1)');
    expect(sql).toContain('NOT EXISTS');
    expect(() => cohort.restoreSql(o)).toThrow(/column list/);
    expect(() => cohort.restoreSql(o, ['parcel_id', 'linked_at'])).toThrow(/lacks the key or the column/);
    expect(() => cohort.restoreSql(o, ['parcel_id', 'address_point_id', 'Bad"col'])).toThrow(/invalid column/);
    expect(cohort.backupColumnsSql()).toContain('attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum');
  });

  // Spec 08 output panel round 1, 2026-10-18 — R-DP safety folds.
  it('pair mode refuses a table with an inbound FK, a DELETE trigger, or a generated/identity column (both ways)', () => {
    const clean = { n: 0, names: '' };
    expect(cohort.pairModeRefusal({ inboundFks: clean, deleteTriggers: clean, generatedColumns: clean }).ok).toBe(true);
    expect(cohort.pairModeRefusal({ inboundFks: { n: 2, names: 'a_fk,b_fk' }, deleteTriggers: clean, generatedColumns: clean })).toMatchObject({ ok: false, reason: expect.stringMatching(/inbound foreign key.*a_fk,b_fk/) });
    expect(cohort.pairModeRefusal({ inboundFks: clean, deleteTriggers: { n: 1, names: 'trg_del' }, generatedColumns: clean })).toMatchObject({ ok: false, reason: expect.stringMatching(/DELETE trigger.*trg_del/) });
    expect(cohort.pairModeRefusal({ inboundFks: clean, deleteTriggers: clean, generatedColumns: { n: 1, names: 'id' } })).toMatchObject({ ok: false, reason: expect.stringMatching(/generated\/identity column.*id/) });
    expect(cohort.pairModeRefusal({ inboundFks: clean, deleteTriggers: clean }).ok).toBe(false);
  });

  it('the three safety reads are catalog SQL keyed on the table', () => {
    expect(cohort.pairSafetySql('inboundFks')).toContain("pg_constraint WHERE contype = 'f' AND confrelid = $1::regclass");
    expect(cohort.pairSafetySql('deleteTriggers')).toMatch(/pg_trigger WHERE tgrelid = \$1::regclass AND NOT tgisinternal AND \(tgtype::int & 8\) <> 0/);
    expect(cohort.pairSafetySql('generatedColumns')).toContain("attgenerated <> '' OR attidentity <> ''");
    expect(() => cohort.pairSafetySql('nope')).toThrow(/unknown kind/);
  });

  it('pair identity is JSON [key, column] (no "|" aliasing) and the --plan pair hash orders by (key, column)', () => {
    expect(cohort.pairId(1, 10)).toBe('["1","10"]');
    expect(cohort.pairId('a|b', 'c')).not.toBe(cohort.pairId('a', 'b|c'));
    expect(pairs([[1, 10]])[0]!.key).toBe('["1","10"]');
    const o = cohort.validateFlags(cohort.parseArgs(flags));
    expect(cohort.hashOf(o)).toContain('ORDER BY "parcel_id", "address_point_id"');
  });

  it('heal compares the pair set: every deleted pair back passes, one missing fails', () => {
    const before = pairs([[1, 10], [1, 11], [2, 20]]);
    expect(cohort.captureClaim({ recordsUpdated: 0, recordsNew: 3, liveValues: pairs([[2, 20], [1, 11], [1, 10]]), backupValues: before }).ok).toBe(true);
    expect(cohort.captureClaim({ recordsUpdated: 0, recordsNew: 2, liveValues: pairs([[1, 10], [2, 20]]), backupValues: before }).ok).toBe(false);
  });
});
