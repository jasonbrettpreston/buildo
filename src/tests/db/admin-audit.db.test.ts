// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §3.4
//
// P24-24D — admin_audit_log .db battery (migration 217). Validates against a
// real Postgres (BUILDO_TEST_DB=1) that:
//   - the table + columns exist and accept a mutation row
//   - the PII-FACT convention holds (redactPii replaces PII VALUES with a
//     marker but preserves non-PII values + the fact-of-change keys)
//   - scrub_admin_audit_for_target NULLs the payloads while the fact-of-action
//     row survives (right-to-be-forgotten)
//
// Run: BUILDO_TEST_DB=1 npm run test:db -- admin-audit

import { describe, it, expect, afterAll } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';
import { redactPii } from '@/lib/admin/admin-audit';

const pool = getTestPool();
const TARGET = 'p24-audit-target-uid';
const ADMIN = 'p24-audit-admin-uid';

async function insertAudit(action: string, oldV: unknown, newV: unknown, reason: string): Promise<void> {
  await pool!.query(
    `INSERT INTO admin_audit_log (admin_uid, action, target_uid, old_value, new_value, reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [ADMIN, action, TARGET, oldV != null ? JSON.stringify(oldV) : null, newV != null ? JSON.stringify(newV) : null, reason],
  );
}

describe.skipIf(!dbAvailable())('admin_audit_log (migration 217)', () => {
  afterAll(async () => {
    if (pool) await pool.query(`DELETE FROM admin_audit_log WHERE target_uid = $1`, [TARGET]);
  });

  it('PII-FACT: redactPii masks PII values but keeps non-PII values + all keys', () => {
    const snapshot = { full_name: 'Jane Doe', phone_number: '+14165551234', account_preset: 'supplier', trade_slug: 'glazing' };
    const redacted = redactPii(snapshot);
    expect(redacted).toEqual({
      full_name: '<redacted>',
      phone_number: '<redacted>',
      account_preset: 'supplier', // non-PII preserved
      trade_slug: 'glazing',
    });
  });

  it('accepts a mutation row and stores the redacted payload', async () => {
    const oldV = redactPii({ full_name: 'Jane Doe', account_preset: 'tradesperson' });
    const newV = redactPii({ account_preset: 'supplier' });
    await insertAudit('set_preset', oldV, newV, 'reclassify as supplier');

    const res = await pool!.query<{ old_value: Record<string, unknown>; new_value: Record<string, unknown>; reason: string }>(
      `SELECT old_value, new_value, reason FROM admin_audit_log WHERE target_uid = $1 AND action = 'set_preset'`,
      [TARGET],
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.old_value.full_name).toBe('<redacted>'); // PII value never stored
    expect(res.rows[0]!.old_value.account_preset).toBe('tradesperson'); // non-PII kept
    expect(res.rows[0]!.new_value.account_preset).toBe('supplier');
    expect(res.rows[0]!.reason).toBe('reclassify as supplier');
  });

  it('scrub_admin_audit_for_target NULLs payloads but keeps the fact-of-action row (RTBF)', async () => {
    await insertAudit('delete', redactPii({ had_pii: true }), { account_deleted_at: 'set' }, 'user requested deletion');

    const before = await pool!.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM admin_audit_log WHERE target_uid = $1`, [TARGET]);
    const rowCountBefore = before.rows[0]!.n;
    expect(rowCountBefore).toBeGreaterThanOrEqual(1);

    const scrub = await pool!.query<{ n: number }>(`SELECT scrub_admin_audit_for_target($1) AS n`, [TARGET]);
    expect(scrub.rows[0]!.n).toBe(rowCountBefore); // scrubbed every row for the target

    const after = await pool!.query<{ old_value: unknown; new_value: unknown; action: string; reason: string }>(
      `SELECT old_value, new_value, action, reason FROM admin_audit_log WHERE target_uid = $1`,
      [TARGET],
    );
    // fact-of-action rows survive; ALL payloads are gone — incl. the free-text
    // `reason` (P24 close-out / mig 223: admin-typed reason could hold PII and
    // was never redacted, so it must be scrubbed too, not just old/new_value).
    expect(after.rows.length).toBe(rowCountBefore);
    for (const r of after.rows) {
      expect(r.old_value).toBeNull();
      expect(r.new_value).toBeNull();
      expect(r.reason).toBeNull(); // 223: reason is now scrubbed (was a PII leak)
      expect(r.action).toBeTruthy(); // the FACT remains (action / admin_uid / created_at)
    }
  });
});
