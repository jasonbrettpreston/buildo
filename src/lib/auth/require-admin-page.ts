// SPEC LINK: docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §8 (admin guard)
//            docs/specs/00-architecture/13_authentication.md §3.6 + §4a (profiles.is_admin, MFA gate)
//
// The PAGE-side admin guard (MF-37 plan §3.3). Server components have no NextRequest, so this mirrors
// verifyAdminAuth's decisions without editing it:
//   DEV (isDevMode): a valid DEV_ADMIN_UID → that uid; unset/malformed → 'dev-user' (reads only; the
//     mutation routes still 403 a non-session method).
//   Otherwise: session getUser() → profiles.is_admin (fail closed: logError 'session-verify' /
//     'profiles-lookup'; logWarn for a non-admin) → when ADMIN_MFA_ENFORCED=true, aal2 required (no
//     backup-code path on a page: the header-borne code exists only on API requests).
// Any failure → notFound() (the page does not admit an admin area exists). Call it first in each page.

import { notFound } from 'next/navigation';
import { isProfileAdmin } from '@/lib/auth/verify-admin';
import { isDevMode } from '@/lib/auth/route-guard';
import { pool } from '@/lib/db/client';
import { isUuid } from '@/lib/entitlements';
import { logError, logWarn } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';

const TAG = '[auth/require-admin-page]';

export async function requireAdminPage(): Promise<{ uid: string }> {
  if (isDevMode()) {
    const devAdminUid = process.env.DEV_ADMIN_UID;
    if (process.env.NODE_ENV !== 'production' && devAdminUid && isUuid(devAdminUid)) return { uid: devAdminUid };
    if (devAdminUid && !isUuid(devAdminUid)) {
      logWarn(TAG, 'DEV_ADMIN_UID is set but is not a UUID — falling back to the dev sentinel', {});
    }
    return { uid: 'dev-user' };
  }

  let uid: string | null = null;
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    uid = data.user?.id ?? null;
  } catch (cause) {
    logError(TAG, cause, { stage: 'session-verify' });
    notFound();
  }
  if (!uid) notFound();

  let isAdmin = false;
  try {
    isAdmin = await isProfileAdmin(pool, uid);
  } catch (cause) {
    logError(TAG, cause, { stage: 'profiles-lookup', uid });
    notFound();
  }
  if (!isAdmin) {
    logWarn(TAG, 'authenticated user is not an admin', { uid });
    notFound();
  }

  if (process.env.ADMIN_MFA_ENFORCED === 'true') {
    let level: string | null = null;
    try {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      level = data?.currentLevel ?? null;
    } catch (cause) {
      logError(TAG, cause, { stage: 'mfa-check', uid });
      notFound();
    }
    if (level !== 'aal2') {
      logWarn(TAG, 'admin session below aal2 — MFA challenge required', { uid });
      notFound();
    }
  }

  return { uid };
}
