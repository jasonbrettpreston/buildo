// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.6 (MFA gate)
//            .cursor/phase1_plan.md Item 6 / P1-F4.3 (fold 22 minimums)
//
// MFA backup codes — server-only logic over `admin_backup_codes` (migration
// 231, RLS deny-all, D1 pool access only). supabase-js exposes no native
// backup-code API, so this module owns the full lifecycle:
//
//   generate  -> 10 random codes at TOTP verify-success (plaintext returned
//                to the route ONCE for one-time display, never persisted)
//   store     -> sha256(salt || normalized code) with a per-code random salt
//   consume   -> verify-admin's MFA gate accepts one valid UNUSED code as a
//                challenge alternative; consumption is race-guarded by the
//                UPDATE's `used_at IS NULL` predicate.
//
// WHY sha256 + per-code salt, not bcrypt/argon2: these are ONE-TIME,
// SERVER-GENERATED, HIGH-ENTROPY credentials (64 random bits each), not
// user-chosen passwords. An offline attacker with the table dump faces a
// 2^64 preimage search per code — infeasible without a KDF — and a consumed
// code is worthless. A memory-hard KDF would add its (deliberate) latency to
// EVERY gate check that falls back to a backup code, for zero added security
// at this entropy. The per-code salt exists to prevent cross-row correlation
// (two admins holding the same code — vanishingly unlikely but free to
// prevent) and precomputed-table reuse, mirroring the no-plaintext-secret
// posture of `timingSafeStringEqual` in verify-admin.ts.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { pool, withTransaction } from '@/lib/db/client';
import { logWarn } from '@/lib/logger';

/** Number of backup codes issued per (re)generation. Fold 22: exactly 10. */
export const BACKUP_CODE_COUNT = 10;

/**
 * Normalize a user-supplied backup code for hashing: case-insensitive,
 * separator-insensitive ("A1B2-C3D4-..." === "a1b2c3d4..."). Codes are
 * hex, so stripping non-alphanumerics is lossless.
 */
export function normalizeBackupCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * One backup code: 8 random bytes -> 16 hex chars, displayed in 4-char
 * groups (`a1b2-c3d4-e5f6-a7b8`) for transcription ergonomics.
 */
export function generateBackupCode(): string {
  const hex = randomBytes(8).toString('hex');
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

/** sha256(salt || normalized code), hex-encoded. Salt is hex from `newSalt`. */
export function hashBackupCode(code: string, salt: string): string {
  return createHash('sha256')
    .update(`${salt}:${normalizeBackupCode(code)}`)
    .digest('hex');
}

/** Per-code random salt (16 bytes, hex). */
export function newSalt(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Replace the admin's backup-code set: delete ALL existing rows (used and
 * unused — a regeneration invalidates the old set wholesale, there is no
 * partial-refresh semantics) and insert BACKUP_CODE_COUNT fresh hashed rows,
 * atomically. Returns the PLAINTEXT codes for one-time display — the caller
 * must never log or persist them (fold 22 requirement 3).
 */
export async function replaceBackupCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, () => generateBackupCode());
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM admin_backup_codes WHERE user_id = $1`, [userId]);
    for (const code of codes) {
      const salt = newSalt();
      await client.query(
        `INSERT INTO admin_backup_codes (user_id, code_hash, code_salt) VALUES ($1, $2, $3)`,
        [userId, hashBackupCode(code, salt), salt],
      );
    }
  });
  return codes;
}

/** Delete every backup code for an admin (used on TOTP unenroll — a backup
 *  code is an MFA-challenge alternative; with no factor there is nothing to
 *  back up, and leaving live codes behind is a stale bypass credential). */
export async function deleteBackupCodes(userId: string): Promise<void> {
  await pool.query(`DELETE FROM admin_backup_codes WHERE user_id = $1`, [userId]);
}

/** Count of unused codes — surfaced read-only in the admin security UI. */
export async function countUnusedBackupCodes(userId: string): Promise<number> {
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM admin_backup_codes WHERE user_id = $1 AND used_at IS NULL`,
    [userId],
  );
  return Number(res.rows[0]?.count ?? 0);
}

/**
 * Attempt to consume a backup code as an MFA-challenge alternative.
 * Returns true iff `candidate` matches an UNUSED code for `userId`, in which
 * case that code is atomically marked used (the UPDATE re-checks
 * `used_at IS NULL`, so two concurrent presentations of the same code can
 * never both succeed). Hash comparison is constant-time per row.
 *
 * At most BACKUP_CODE_COUNT (10) rows are scanned — the per-row hash+compare
 * cost is negligible and bounded.
 */
export async function consumeBackupCode(userId: string, candidate: string): Promise<boolean> {
  const normalized = normalizeBackupCode(candidate);
  if (normalized.length === 0) return false;

  const res = await pool.query<{ id: string; code_hash: string; code_salt: string }>(
    `SELECT id, code_hash, code_salt FROM admin_backup_codes
      WHERE user_id = $1 AND used_at IS NULL`,
    [userId],
  );

  for (const row of res.rows) {
    const candidateHash = hashBackupCode(normalized, row.code_salt);
    const a = Buffer.from(candidateHash, 'hex');
    const b = Buffer.from(row.code_hash, 'hex');
    if (a.length === b.length && timingSafeEqual(a, b)) {
      const updated = await pool.query(
        `UPDATE admin_backup_codes SET used_at = NOW()
          WHERE id = $1 AND used_at IS NULL
          RETURNING id`,
        [row.id],
      );
      if ((updated.rowCount ?? 0) > 0) return true;
      // Raced: another request consumed this exact code between our SELECT
      // and UPDATE. Treat as invalid — single-use means single-use.
      logWarn('[admin/backup-codes]', 'backup code consume raced — already used', {
        userId,
      });
      return false;
    }
  }
  return false;
}
