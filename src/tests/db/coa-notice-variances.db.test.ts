// 🔗 SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D4 (migration 252)
//   + docs/specs/00-architecture/114_rls_policy_catalog.md §4 (Class B default deny)
//
// Live-DB proof of migration 252 (T-DB): every CHECK rejects its bad value by NAME, a valid row
// inserts with `retired_at` NULL and `loaded_at` defaulted, the (family, application, ordinal) triple
// is UNIQUE, and RLS is enabled with zero policies. Skipped unless BUILDO_TEST_DB=1 (npm run test:db).
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { makeCoaNoticeVariance, type CoaNoticeVarianceRow } from '../factories';

const APP = 'A0999/17EYK';

function insertSql(row: CoaNoticeVarianceRow): { text: string; values: unknown[] } {
  const cols = Object.keys(row);
  return {
    text: `INSERT INTO coa_notice_variances (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
           RETURNING retired_at, loaded_at`,
    values: cols.map((c) => (row as unknown as Record<string, unknown>)[c]),
  };
}

describe.skipIf(!dbAvailable())('migration 252 — coa_notice_variances (live DB)', () => {
  let pool: Pool;
  beforeAll(() => {
    pool = getTestPool() as Pool;
  });
  afterEach(async () => {
    await pool.query(`DELETE FROM coa_notice_variances WHERE application_number = $1`, [APP]);
  });
  afterAll(async () => {
    await pool.end();
  });

  const reject = async (overrides: Partial<CoaNoticeVarianceRow>, constraint: RegExp) => {
    const q = insertSql(makeCoaNoticeVariance({ application_number: APP, ...overrides }));
    await expect(pool.query(q.text, q.values)).rejects.toThrow(constraint);
  };

  it('T-DB-valid a valid row inserts; retired_at is NULL and loaded_at is defaulted', async () => {
    const q = insertSql(makeCoaNoticeVariance({ application_number: APP }));
    const res = await pool.query(q.text, q.values);
    expect(res.rows[0].retired_at).toBeNull();
    expect(res.rows[0].loaded_at).toBeInstanceOf(Date);
  });

  it('T-DB-1 a bad source family is rejected', () => reject({ source_family: 'ckan' }, /chk_cnv_source_family/));
  it('T-DB-2 an un-relabelled unit is rejected', () => reject({ required_unit: 'metres' }, /chk_cnv_required_unit/));
  it('T-DB-3 ordinal 0 is rejected', () => reject({ item_ordinal: 0, variance_key: `toronto_ca_decision_pdf|${APP}|0` }, /chk_cnv_item_ordinal/));
  it('T-DB-4 a bad sha is rejected', () => reject({ source_sha256: 'A'.repeat(64) }, /chk_cnv_source_sha256/));
  it('T-DB-5 a pair with a NULL value is rejected', () => reject({ proposed_value: null }, /chk_cnv_pair_values/));
  it('T-DB-5b a pair with a NULL unit is rejected', () => reject({ proposed_unit: null }, /chk_cnv_pair_values/));
  it('T-DB-6 mapped/target incoherence is rejected', () => reject({ target_status: 'mapped', target: 'unmapped' }, /chk_cnv_target_coherent/));
  it('T-DB-6b a sentinel target with a different status is rejected', () => reject({ target_status: 'ambiguous', target: 'unmapped' }, /chk_cnv_target_sentinel/));
  it('T-DB-8 a key that is not the triple is rejected', () => reject({ variance_key: 'x' }, /chk_cnv_variance_key/));
  it('T-DB-9 a non-digit-initial by-law is rejected', () => reject({ cited_bylaw: 'A-438-86' }, /chk_cnv_cited_bylaw/));
  it('T-DB-10 a negative value is rejected', () => reject({ required_value: -1 }, /chk_cnv_required_value/));

  it('T-DB-7 a duplicate (family, application, ordinal) triple is rejected', async () => {
    const q = insertSql(makeCoaNoticeVariance({ application_number: APP }));
    await pool.query(q.text, q.values);
    await expect(pool.query(q.text, q.values)).rejects.toThrow(/coa_notice_variances_pkey|uq_coa_notice_variances_item/);
  });

  it('T-DB-RLS RLS is enabled with zero policies (Spec 114 Class B)', async () => {
    const rls = await pool.query(`SELECT relrowsecurity FROM pg_class WHERE relname = 'coa_notice_variances'`);
    expect(rls.rows).toHaveLength(1);
    expect(rls.rows[0].relrowsecurity).toBe(true);
    const policies = await pool.query(`SELECT COUNT(*)::int AS n FROM pg_policies WHERE tablename = 'coa_notice_variances'`);
    expect(policies.rows[0].n).toBe(0);
  });
});
