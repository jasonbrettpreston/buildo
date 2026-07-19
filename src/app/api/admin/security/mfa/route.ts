// 🔗 SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.6 (MFA gate)
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8.1 + §13
//             .cursor/phase1_plan.md Item 6 / P1-F4.3 (fold 22 minimums)
//
// Admin MFA (TOTP) — status + enroll + unenroll.
//   GET    — list the session admin's verified TOTP factors + unused
//            backup-code count (read-only status for /admin/security).
//   POST   — start TOTP enrollment: server-side `supabase.auth.mfa.enroll`
//            (fold 22 req 2: SERVER-generated secret). The QR/secret in the
//            response is displayed ONCE by the client and never logged here.
//   DELETE — unenroll a factor (?factor_id=...) + delete the admin's backup
//            codes (codes are a challenge alternative; no factor, no codes).
//
// Auth: verifyAdminAuth FIRST line. All three verbs additionally require
// authMethod === 'session' (Spec 33 §8.1): MFA factors belong to a concrete
// Supabase session identity — the `admin_key` / `dev_bypass` sentinels have
// no auth.users row to enroll against, so they get 403, not a broken enroll.

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
import { countUnusedBackupCodes, deleteBackupCodes } from '@/lib/admin/backup-codes';
import { createClient } from '@/lib/supabase/server';

const TAG = '[api/admin/security/mfa]';

function unauthorized() {
  return err('UNAUTHORIZED', 'Admin auth required', 401);
}

function sessionRequired() {
  // Spec 33 §8.1 — per-admin identity exists only on the session path.
  return err('FORBIDDEN', 'MFA management requires a session admin (not admin_key/dev_bypass)', 403);
}

function hashAdminUid(uid: string): string {
  return createHash('sha256').update(uid).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// GET — MFA status
// ---------------------------------------------------------------------------
export const GET = withApiEnvelope(async (request: NextRequest) => {
  const admin = await verifyAdminAuth(request);
  if (!admin) return unauthorized();
  if (admin.authMethod !== 'session') return sessionRequired();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    logError(TAG, error, { stage: 'list-factors', uid: admin.uid });
    return err('MFA_LIST_FAILED', 'Could not list MFA factors', 502);
  }

  const factors = (data?.totp ?? []).map((f) => ({
    id: f.id,
    friendly_name: f.friendly_name ?? null,
    status: f.status,
    created_at: f.created_at,
  }));
  const backupCodesRemaining = await countUnusedBackupCodes(admin.uid);

  return ok({ factors, backup_codes_remaining: backupCodesRemaining });
});

// ---------------------------------------------------------------------------
// POST — start TOTP enrollment
// ---------------------------------------------------------------------------
export const POST = withApiEnvelope(async (request: NextRequest) => {
  const admin = await verifyAdminAuth(request);
  if (!admin) return unauthorized();
  if (admin.authMethod !== 'session') return sessionRequired();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Buildo Admin TOTP',
  });
  if (error || !data) {
    // GoTrue's message is operator-actionable ("factor with this friendly
    // name already exists", etc.) and contains no secret material.
    logError(TAG, error ?? new Error('enroll returned no data'), {
      stage: 'enroll',
      uid: admin.uid,
    });
    return err('MFA_ENROLL_FAILED', error?.message ?? 'Enrollment failed', 400);
  }

  void track(hashAdminUid(admin.uid), 'admin_mfa_enroll_started', {}).catch(() => undefined);

  // qr_code / secret: shown ONCE by the client (fold 22 req 2) — deliberately
  // NOT logged, NOT audited with values, NOT persisted by us (GoTrue holds
  // the factor server-side in unverified state until verify).
  return ok({
    factor_id: data.id,
    qr_code: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  });
});

// ---------------------------------------------------------------------------
// DELETE — unenroll (?factor_id=...)
// ---------------------------------------------------------------------------
const UnenrollQuerySchema = z.object({
  factor_id: z.string().min(1, 'factor_id is required'),
});

export const DELETE = withApiEnvelope(async (request: NextRequest) => {
  const admin = await verifyAdminAuth(request);
  if (!admin) return unauthorized();
  if (admin.authMethod !== 'session') return sessionRequired();

  const parsed = UnenrollQuerySchema.safeParse({
    factor_id: request.nextUrl.searchParams.get('factor_id') ?? '',
  });
  if (!parsed.success) return badRequestZod(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId: parsed.data.factor_id });
  if (error) {
    logError(TAG, error, { stage: 'unenroll', uid: admin.uid });
    return err('MFA_UNENROLL_FAILED', error.message, 400);
  }

  // Codes exist only as an MFA-challenge alternative — with the factor gone
  // they are a stale bypass credential, so they go too (see backup-codes.ts).
  await deleteBackupCodes(admin.uid);

  try {
    await writeAdminAudit({
      adminUid: admin.uid,
      action: 'mfa_unenrolled',
      targetUid: admin.uid,
      oldValue: { factor_id: parsed.data.factor_id },
      newValue: null,
      reason: 'self-service TOTP unenroll (admin security page)',
    });
  } catch (auditErr) {
    // Audit failure must not un-unenroll the factor — log distinguishably.
    logError(TAG, auditErr, { stage: 'unenroll-audit', uid: admin.uid });
  }
  void track(hashAdminUid(admin.uid), 'admin_mfa_unenrolled', {}).catch(() => undefined);

  return ok({ unenrolled: true });
});
