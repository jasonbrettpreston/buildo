// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §3.4 (audit logging)
//
// admin_audit_log writer (P24-24B). Every admin mutation on a user account
// writes exactly one row here. Two invariants:
//
//   1. PII-FACT convention — the log records that a PII field changed, never
//      the raw value. `redactPii` replaces the VALUE of any PII field in the
//      old/new snapshots with the marker '<redacted>' before the row is
//      written. A compliance reader learns "an admin changed this user's phone
//      number, when, and why" without the log itself becoming a PII store.
//
//   2. Right-to-be-forgotten — on a hard delete, `scrubAdminAuditForTarget`
//      NULLs the residual JSONB for that target (the fact-of-action row stays;
//      the payloads go). Backed by the SQL function created in migration 217.

import { pool } from '@/lib/db/client';
import { logError } from '@/lib/logger';

// The user_profiles columns whose VALUES are PII and must never land in the
// audit payload. Keep in sync with the CLIENT_SAFE / mobile-omit lists.
const PII_FIELDS: ReadonlySet<string> = new Set([
  'full_name',
  'phone_number',
  'email',
  'backup_email',
  'company_name',
]);

/**
 * Replace the value of any PII field with the redaction marker, preserving the
 * KEY (so the fact-of-change is auditable) and all non-PII values verbatim.
 */
export function redactPii(
  obj: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (obj == null) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = PII_FIELDS.has(k) ? '<redacted>' : v;
  }
  return out;
}

export interface AdminAuditParams {
  adminUid: string;
  action: string;
  targetUid: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  reason: string;
}

/**
 * Write one admin_audit_log row. old/new snapshots are PII-redacted here (the
 * caller passes the literal before/after field maps; redaction is centralized
 * so a caller can never forget it). Throws on DB error so the mutation handler
 * can decide whether the audit failure should fail the request (it should — an
 * unaudited admin mutation is a compliance hole).
 */
// A minimal query-runner both `pool` and a transaction `PoolClient` satisfy —
// so a caller can pass its withTransaction client to make the mutation and its
// audit row commit atomically (P26 review — an UPDATE that commits before a
// failing audit write is an unrecoverable compliance hole).
type AuditExecutor = { query: (text: string, values?: unknown[]) => Promise<unknown> };

export async function writeAdminAudit(
  params: AdminAuditParams,
  executor: AuditExecutor = pool,
): Promise<void> {
  const { adminUid, action, targetUid, oldValue, newValue, reason } = params;
  await executor.query(
    `INSERT INTO admin_audit_log (admin_uid, action, target_uid, old_value, new_value, reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      adminUid,
      action,
      targetUid,
      oldValue !== undefined ? JSON.stringify(redactPii(oldValue)) : null,
      newValue !== undefined ? JSON.stringify(redactPii(newValue)) : null,
      reason,
    ],
  );
}

/**
 * Right-to-be-forgotten scrub. NULLs old_value/new_value on every audit row for
 * a hard-deleted target. Returns the count scrubbed. Non-throwing at the call
 * site is the caller's choice; here we surface errors so the delete handler can
 * log them (the DB row is authoritative — a scrub failure is logged, not fatal).
 */
export async function scrubAdminAuditForTarget(targetUid: string): Promise<number> {
  try {
    const res = await pool.query<{ n: number }>(
      `SELECT scrub_admin_audit_for_target($1) AS n`,
      [targetUid],
    );
    return res.rows[0]?.n ?? 0;
  } catch (err) {
    logError('[admin/admin-audit]', err, { stage: 'scrub', targetUid });
    return 0;
  }
}
