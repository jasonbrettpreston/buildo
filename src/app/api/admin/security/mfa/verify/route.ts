// 🔗 SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.6 (MFA gate)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8.1 + §13
//             .cursor/phase1_plan.md Item 6 / P1-F4.3 (fold 22 minimums)
//
// Admin MFA (TOTP) — challenge + verify, the second half of enrollment.
//   POST { factor_id, code } —
//     1. `supabase.auth.mfa.challenge({ factorId })` (server-side)
//     2. `supabase.auth.mfa.verify({ factorId, challengeId, code })` — on
//        success GoTrue upgrades the session to aal2 and @supabase/ssr
//        persists the upgraded session cookie (Route Handlers may write
//        cookies — server.ts setAll).
//     3. Backup codes: 10 server-generated random codes, hashed+stored
//        (migration 231), PLAINTEXT returned exactly once in this response
//        (fold 22 req 3) — never logged, never re-displayable.
//
// Auth: verifyAdminAuth FIRST line + authMethod === 'session' (Spec 33 §8.1).

import type { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';
import { ok, err } from '@/features/leads/api/envelope';
import { badRequestZod } from '@/features/leads/api/error-mapping';
import { logError } from '@/lib/logger';
import { track } from '@/lib/admin/analytics';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
import { replaceBackupCodes, BACKUP_CODE_COUNT } from '@/lib/admin/backup-codes';
import { createClient } from '@/lib/supabase/server';

const TAG = '[api/admin/security/mfa/verify]';

const VerifyBodySchema = z.object({
  factor_id: z.string().min(1, 'factor_id is required'),
  code: z
    .string()
    .regex(/^\d{6}$/, 'code must be the 6-digit TOTP from your authenticator app'),
});

function hashAdminUid(uid: string): string {
  return createHash('sha256').update(uid).digest('hex').slice(0, 16);
}

export const POST = withApiEnvelope(async (request: NextRequest) => {
  const admin = await verifyAdminAuth(request);
  if (!admin) return err('UNAUTHORIZED', 'Admin auth required', 401);
  if (admin.authMethod !== 'session') {
    return err('FORBIDDEN', 'MFA management requires a session admin (not admin_key/dev_bypass)', 403);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return err('BAD_REQUEST', 'Request body must be JSON', 400);
  }
  const parsed = VerifyBodySchema.safeParse(rawBody);
  if (!parsed.success) return badRequestZod(parsed.error);
  const { factor_id: factorId, code } = parsed.data;

  const supabase = await createClient();

  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) {
    logError(TAG, challenge.error ?? new Error('challenge returned no data'), {
      stage: 'challenge',
      uid: admin.uid,
    });
    return err('MFA_CHALLENGE_FAILED', challenge.error?.message ?? 'Challenge failed', 400);
  }

  const verify = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verify.error) {
    // Wrong/expired TOTP — expected user error, not a server fault. The
    // client re-prompts; no enumeration risk (factor is the session's own).
    return err('MFA_VERIFY_FAILED', verify.error.message, 400);
  }

  // Verify-success: (re)issue the backup-code set. Plaintext goes out ONCE
  // in this response and nowhere else (fold 22 req 3) — replaceBackupCodes
  // stores only sha256(salt||code) rows.
  const backupCodes = await replaceBackupCodes(admin.uid);

  try {
    await writeAdminAudit({
      adminUid: admin.uid,
      action: 'mfa_enrolled',
      targetUid: admin.uid,
      oldValue: null,
      // Counts only — never code material (fold 22: hashed at rest, shown once).
      newValue: { factor_id: factorId, backup_codes_issued: BACKUP_CODE_COUNT },
      reason: 'self-service TOTP enrollment verified (admin security page)',
    });
  } catch (auditErr) {
    // The factor IS verified and codes ARE stored at this point — failing the
    // request now would strand a live enrollment behind a 500 while hiding
    // the one-time backup codes. Log distinguishably instead.
    logError(TAG, auditErr, { stage: 'verify-audit', uid: admin.uid });
  }
  void track(hashAdminUid(admin.uid), 'admin_mfa_enrolled', {}).catch(() => undefined);

  return ok({ verified: true, backup_codes: backupCodes });
});
