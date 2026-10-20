// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DY (e), R-DP, R-DN, R-ET
//
// R-ET (Spec 124 §5, operator y 2026-10-20): ingestor-forced-cohort.js --op=derived_status:<s> is the gate G
// #38 bracket for an R-DY DERIVED target. In one transaction it appends <s> to the guard column (--column)
// AND the derive prior column (--derive-column) of N cohort rows; the before-image holds (key, column,
// derive column) and a second before-image snapshots the derived table's natural keys for the cohort.
// After the run: (a) the primary is restored to the snapshot exactly, (b) exactly ONE derived row was
// inserted per cohort key, counted through the step's own int emit <derived_table>_written (R-DN). The
// restore deletes exactly those inserted rows by natural key and COMMITs only when the DELETE's RETURNING
// set equals them, else ROLLBACK. Fixtures/mocks only — no database.

import { describe, expect, it } from 'vitest';
import * as path from 'node:path';

type Entry = { key: string; value: unknown };
type DerivedRow = { dk: string; nk: string };
type Decision = { ok: boolean; reason?: string; written?: number };
/* eslint-disable @typescript-eslint/no-require-imports -- exercising the real CJS instrument */
const cohort = require(path.join(process.cwd(), 'scripts/analysis/ingestor-forced-cohort.js')) as {
  parseArgs: (a: string[]) => Record<string, unknown>;
  validateFlags: (a: Record<string, unknown>) => Record<string, unknown>;
  parseOp: (raw: string) => { kind: string };
  opBindValue: (raw: string) => unknown;
  isDerivedMode: (o: Record<string, unknown>) => boolean;
  perturbationSetExpr: (op: { kind: string }, column: string, deriveColumn?: string) => string;
  backupCreateSql: (o: Record<string, unknown>) => string;
  backupSelectSql: (o: Record<string, unknown>) => string;
  restoreSql: (o: Record<string, unknown>, columns?: string[]) => string;
  derivedSnapshotTable: (o: Record<string, unknown>) => string;
  derivedKeysFor: (o: Record<string, unknown>, keys: unknown[]) => string[];
  derivedRowsSql: (o: Record<string, unknown>) => string;
  derivedSnapshotCreateSql: (o: Record<string, unknown>) => string;
  derivedDeleteSql: (o: Record<string, unknown>) => string;
  derivedInsertedRows: (a: { before: DerivedRow[]; after: DerivedRow[] }) => { inserted: DerivedRow[]; removed: DerivedRow[] };
  derivedClaim: (a: {
    countPathResult: { ok: boolean; n?: number; reason?: string } | null;
    liveValues: Entry[]; backupValues: Entry[];
    derivedKeys: string[]; before: DerivedRow[]; after: DerivedRow[];
  }) => Decision;
  derivedRestoreDecision: (a: { expected: DerivedRow[]; returned: DerivedRow[] }) => Decision;
  deleteInsertedDerived: (client: MockClient, o: Record<string, unknown>, derivedKeys: string[], inserted: DerivedRow[]) => Promise<number>;
  rowsToKeyValues: (rows: Array<Record<string, unknown>>, key: string, column: string, pair?: boolean, deriveColumn?: string | null) => Entry[];
  recoveryCommand: (o: Record<string, unknown>) => string;
  countPathCohortDecision: (doc: unknown, a: { table: string; countPath: string | null }) => { ok: boolean; reason?: string };
};

type MockClient = { query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number; rows: DerivedRow[] }>; log: string[] };

const flags = [
  '--run', '--table=coa_applications', '--key=application_number', '--column=data_hash',
  '--op=derived_status: forced', '--derive-column=status',
  '--derived-table=lifecycle_status_history', '--derived-key=lead_id', '--derived-key-prefix=coa:',
  '--derived-natural-key=lead_id,to_status,transitioned_at',
  '--count=3', '--where=status IS NOT NULL', '--order=application_number',
  '--backup-table=coa_applications_cohort_bak_20261020t0100z',
  '--step=scripts/load-coa.js', '--chain=coa',
  '--out=docs/reports/golden/coa/post/coa-forced-1.json',
  '--count-path=lifecycle_status_history_written',
];
const valid = () => cohort.validateFlags(cohort.parseArgs(flags));
const without = (prefix: string) => flags.filter((a) => !a.startsWith(prefix));
const swap = (prefix: string, next: string) => flags.map((a) => (a.startsWith(prefix) ? next : a));
const prim = (rows: Array<[string, string, string]>) =>
  cohort.rowsToKeyValues(rows.map(([k, h, s]) => ({ application_number: k, data_hash: h, status: s })), 'application_number', 'data_hash', false, 'status');
const nk = (lead: string, to: string, at = '2026-10-20 01:00:00+00') => `(${lead},"${to}","${at}")`;
const KEYS = ['coa:A1', 'coa:A2', 'coa:A3'];
const BEFORE: DerivedRow[] = [{ dk: 'coa:A1', nk: nk('coa:A1', 'Hearing Scheduled', '2026-10-01 00:00:00+00') }];
const ONE_EACH: DerivedRow[] = [...BEFORE, ...KEYS.map((k) => ({ dk: k, nk: nk(k, 'Approved') }))];
const PRIMARY = prim([['A1', 'h1', 'Approved'], ['A2', 'h2', 'Approved'], ['A3', 'h3', 'Approved']]);

function mockClient(returned: DerivedRow[]): MockClient {
  const log: string[] = [];
  return {
    log,
    async query(sql: string) {
      log.push(sql.split(' ')[0]!);
      if (sql.startsWith('DELETE')) return { rowCount: returned.length, rows: returned };
      return { rowCount: 0, rows: [] };
    },
  };
}

describe('R-ET — ingestor-forced-cohort --op=derived_status (#38 bracket for an R-DY derived target)', () => {
  it('parses derived_status:<s> as its own op, binding <s> to both perturbed columns', () => {
    expect(cohort.parseOp('derived_status: forced').kind).toBe('derived_status');
    expect(cohort.opBindValue('derived_status: forced')).toBe(' forced');
    expect(() => cohort.parseOp('derived_status')).toThrow(/derived_status:<s>/);
    expect(() => cohort.parseOp('derived_status:')).toThrow(/derived_status:<s>/);
    const o = valid();
    expect(cohort.isDerivedMode(o)).toBe(true);
    expect(cohort.perturbationSetExpr(o.op as { kind: string }, 'data_hash', 'status')).toBe('"data_hash" = "data_hash" || $2, "status" = "status" || $2');
  });

  it('refuses, before any DB connect, every incomplete or contradictory derived flag set', () => {
    expect(() => valid()).not.toThrow();
    expect(() => cohort.validateFlags(cohort.parseArgs(without('--derive-column=')))).toThrow(/--derive-column/);
    expect(() => cohort.validateFlags(cohort.parseArgs(without('--derived-table=')))).toThrow(/--derived-table/);
    expect(() => cohort.validateFlags(cohort.parseArgs(without('--derived-key=')))).toThrow(/--derived-key/);
    expect(() => cohort.validateFlags(cohort.parseArgs(without('--derived-natural-key=')))).toThrow(/--derived-natural-key/);
    expect(() => cohort.validateFlags(cohort.parseArgs(swap('--derive-column=', '--derive-column=data_hash')))).toThrow(/must differ/);
    expect(() => cohort.validateFlags(cohort.parseArgs(swap('--derived-table=', '--derived-table=coa_applications')))).toThrow(/must differ/);
    expect(() => cohort.validateFlags(cohort.parseArgs(swap('--derived-natural-key=', '--derived-natural-key=to_status,transitioned_at')))).toThrow(/must include --derived-key/);
    // R-DN: the derived count is the step's own <derived_table>_written int emit, never the summary counters.
    expect(() => cohort.validateFlags(cohort.parseArgs(without('--count-path=')))).toThrow(/--count-path=lifecycle_status_history_written/);
    expect(() => cohort.validateFlags(cohort.parseArgs(swap('--count-path=', '--count-path=records_new')))).toThrow(/--count-path=lifecycle_status_history_written/);
    // A derived flag without the derived op is a silent no-op — refused.
    expect(() => cohort.validateFlags(cohort.parseArgs(swap('--op=', '--op=append_text: x')))).toThrow(/only with --op=derived_status/);
  });

  it('the before-image holds (key, column, derive column) and the derived snapshot is a sibling _cohort_bak_ table', () => {
    const o = valid();
    expect(cohort.backupCreateSql(o)).toBe('CREATE TABLE coa_applications_cohort_bak_20261020t0100z AS SELECT t."application_number", t."data_hash", t."status" FROM coa_applications t WHERE t."application_number" = ANY($1)');
    expect(cohort.backupSelectSql(o)).toContain('t."application_number", t."data_hash", t."status"');
    expect(cohort.derivedSnapshotTable(o)).toBe('lifecycle_status_history_cohort_bak_20261020t0100z');
    expect(cohort.derivedKeysFor(o, ['A1', 2])).toEqual(['coa:A1', 'coa:2']);
    const rowText = 'ROW(t."lead_id", t."to_status", t."transitioned_at")::text';
    expect(cohort.derivedRowsSql(o)).toBe(`SELECT t."lead_id"::text AS dk, ${rowText} AS nk FROM lifecycle_status_history t WHERE t."lead_id" = ANY($1)`);
    expect(cohort.derivedSnapshotCreateSql(o)).toBe(`CREATE TABLE lifecycle_status_history_cohort_bak_20261020t0100z AS SELECT t."lead_id"::text AS dk, ${rowText} AS nk FROM lifecycle_status_history t WHERE t."lead_id" = ANY($1)`);
    expect(cohort.derivedDeleteSql(o)).toBe(`DELETE FROM lifecycle_status_history t WHERE t."lead_id" = ANY($1) AND ${rowText} = ANY($2::text[]) RETURNING t."lead_id"::text AS dk, ${rowText} AS nk`);
  });

  it('the primary restore puts BOTH perturbed columns back, IS DISTINCT FROM-guarded, cohort-scoped', () => {
    const sql = cohort.restoreSql(valid());
    expect(sql).toBe('UPDATE coa_applications t SET "data_hash" = b."data_hash", "status" = b."status" FROM coa_applications_cohort_bak_20261020t0100z b'
      + ' WHERE b."application_number" = t."application_number" AND t."application_number" = ANY($1)'
      + ' AND (t."data_hash" IS DISTINCT FROM b."data_hash" OR t."status" IS DISTINCT FROM b."status")');
  });

  it('the derived diff: rows present after and absent before are the inserted set; a vanished row is reported', () => {
    expect(cohort.derivedInsertedRows({ before: BEFORE, after: ONE_EACH }).inserted).toHaveLength(3);
    expect(cohort.derivedInsertedRows({ before: BEFORE, after: ONE_EACH.slice(1) }).removed).toEqual(BEFORE);
  });

  it('GREEN: one inserted derived row per cohort key, the emit counts them, the primary healed', () => {
    const claim = cohort.derivedClaim({
      countPathResult: { ok: true, n: 3 }, liveValues: PRIMARY, backupValues: PRIMARY, derivedKeys: KEYS, before: BEFORE, after: ONE_EACH,
    });
    expect(claim).toMatchObject({ ok: true, written: 3 });
  });

  it('RED: a fixture that writes NO ledger row fails the claim even though the primary healed', () => {
    const claim = cohort.derivedClaim({
      countPathResult: { ok: true, n: 3 }, liveValues: PRIMARY, backupValues: PRIMARY, derivedKeys: KEYS, before: BEFORE, after: BEFORE,
    });
    expect(claim.ok).toBe(false);
    expect(claim.reason).toMatch(/coa:A1: 0 inserted derived row\(s\), expected exactly 1/);
    // ...and the emit itself reading 0 is gate G's own refusal (countPathDecision), surfaced verbatim.
    const zero = cohort.derivedClaim({
      countPathResult: { ok: false, reason: 'count_path lifecycle_status_history_written emitted 0 in x.json' }, liveValues: PRIMARY, backupValues: PRIMARY, derivedKeys: KEYS, before: BEFORE, after: BEFORE,
    });
    expect(zero).toMatchObject({ ok: false, reason: expect.stringMatching(/count_path: .*emitted 0/) });
  });

  it('RED: two rows for one key, an emit below the cohort size, a vanished prior row, or an unhealed primary', () => {
    const base = { countPathResult: { ok: true, n: 3 }, liveValues: PRIMARY, backupValues: PRIMARY, derivedKeys: KEYS, before: BEFORE, after: ONE_EACH };
    expect(cohort.derivedClaim({ ...base, after: [...ONE_EACH, { dk: 'coa:A2', nk: nk('coa:A2', 'Refused') }] }).reason).toMatch(/coa:A2: 2 inserted/);
    expect(cohort.derivedClaim({ ...base, countPathResult: { ok: true, n: 2 } }).reason).toMatch(/emitted 2 < the cohort's 3/);
    expect(cohort.derivedClaim({ ...base, after: ONE_EACH.slice(1) }).reason).toMatch(/1 prior derived row\(s\) vanished/);
    const unhealed = prim([['A1', 'h1 forced', 'Approved forced'], ['A2', 'h2', 'Approved'], ['A3', 'h3', 'Approved']]);
    expect(cohort.derivedClaim({ ...base, liveValues: unhealed }).reason).toMatch(/did not heal/);
    expect(cohort.derivedClaim({ ...base, countPathResult: null }).reason).toMatch(/count_path/);
  });

  it('the restore decision accepts only the exact inserted natural-key set', () => {
    const ins = ONE_EACH.slice(1);
    expect(cohort.derivedRestoreDecision({ expected: ins, returned: [...ins].reverse() }).ok).toBe(true);
    expect(cohort.derivedRestoreDecision({ expected: ins, returned: ins.slice(1) }).ok).toBe(false);
    expect(cohort.derivedRestoreDecision({ expected: ins, returned: [...ins, BEFORE[0]!] }).ok).toBe(false);
  });

  it('restore COMMITs when the DELETE returns exactly the inserted set', async () => {
    const ins = ONE_EACH.slice(1);
    const client = mockClient(ins);
    await expect(cohort.deleteInsertedDerived(client, valid(), KEYS, ins)).resolves.toBe(3);
    expect(client.log).toEqual(['BEGIN', 'DELETE', 'COMMIT']);
  });

  it('restore-mismatch ROLLS BACK: a DELETE returning a different set never commits', async () => {
    const ins = ONE_EACH.slice(1);
    const client = mockClient([...ins, BEFORE[0]!]);
    await expect(cohort.deleteInsertedDerived(client, valid(), KEYS, ins)).rejects.toThrow(/rolled back/);
    expect(client.log).toEqual(['BEGIN', 'DELETE', 'ROLLBACK']);
    expect(client.log).not.toContain('COMMIT');
  });

  it('nothing inserted means no transaction at all', async () => {
    const client = mockClient([]);
    await expect(cohort.deleteInsertedDerived(client, valid(), KEYS, [])).resolves.toBe(0);
    expect(client.log).toEqual([]);
  });

  it('the recovery command carries every derived flag; the R-DN cross-check reads the DERIVED table target', () => {
    const cmd = cohort.recoveryCommand(valid());
    for (const f of ['--derive-column=status', '--derived-table=lifecycle_status_history', '--derived-key=lead_id', '--derived-key-prefix="coa:"', '--derived-natural-key=lead_id,to_status,transitioned_at']) {
      expect(cmd).toContain(f);
    }
    const doc = { targets: [{ table: 'lifecycle_status_history', capture: 'coa-forced-1.json', count_path: 'lifecycle_status_history_written' }] };
    expect(cohort.countPathCohortDecision(doc, { table: 'lifecycle_status_history', countPath: 'lifecycle_status_history_written' }).ok).toBe(true);
  });
});
