// SPEC LINK: docs/specs/00-architecture/13_authentication.md §3.2 (getClaims: the read-path default), docs/specs/02-web-admin/33_web_admin_engineering_protocol.md
//            §8 (dated note 2026-11-09: a server page that reads rows gates itself first), docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.1
//            (product gates are per-feature code), §11b.3 dated note 2026-11-11 (MF-44), MF-45 D-4 a (the web is parcel_tool only).
//
// MF-44 · the PAGE-side gate of the MaxBLD web pages (the sibling of require-admin-page.ts; a server component has no NextRequest, so
// getClaimsUid(request) cannot be used). Order:
//   1. session: DEV (isDevMode) -> the dev sentinel 'dev-user', which is not a uuid, so it is NEVER entitled (no entitlement bypass in dev);
//      otherwise createClient().auth.getClaims(); no session -> redirect('/login?redirect=/parcel-tool') (the middleware already sends a signed-out visitor there:
//      route-guard.ts classifyRoute's fail-closed default; this is the second line). A sign-in service that throws (network, JWKS) is NOT
//      a missing session: it is thrown to error.tsx, so a transient failure never bounces a signed-in user to /login (OUTPUT panel, DeepSeek F11).
//   2. plan: getEntitlementStatus(pool, uid, 'parcel_tool') with a status in ACTIVE_SUBSCRIPTION_STATUSES -> entitled. The lead_gen transitional
//      path is the App A shelf only (MF-45 D-4 a), never the web.
//   3. a DB error is thrown (fail closed): the segment's error.tsx shows the error state; nothing is rendered unchecked.
// One log line per outcome with the uid only (never a query, Spec 100 §2.8).
import { redirect } from 'next/navigation';
import { isDevMode } from '@/lib/auth/route-guard';
import { pool } from '@/lib/db/client';
import { ACTIVE_SUBSCRIPTION_STATUSES, getEntitlementStatus, isUuid, type Queryable } from '@/lib/entitlements';
import { logError, logInfo } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';

const TAG = '[auth/require-parcel-tool-page]';

export type ParcelToolPageAccess = { uid: string; entitled: boolean };

/** The signed-in user's uid from the session cookie (claims), or null when there is none; a thrown sign-in call is logged and re-thrown. */
async function sessionUid(): Promise<string | null> {
  if (isDevMode()) return 'dev-user';
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data) return null;
    return typeof data.claims.sub === 'string' ? data.claims.sub : null;
  } catch (cause) {
    logError(TAG, cause, { stage: 'session-verify' });
    throw cause;
  }
}

/** Gate first in every MaxBLD web page: redirects a signed-out visitor, returns whether the user holds an active parcel_tool plan. */
export async function requireParcelToolPage(db: Queryable = pool): Promise<ParcelToolPageAccess> {
  const uid = await sessionUid();
  if (!uid) {
    logInfo(TAG, 'no session, sent to sign-in', {});
    redirect('/login?redirect=/parcel-tool'); // the return path, so safe-redirect.ts never falls back to /dashboard (scope D; OUTPUT security F4)
  }
  if (!isUuid(uid)) {
    logInfo(TAG, 'not entitled (dev sentinel)', { uid });
    return { uid, entitled: false };
  }
  let status: string | null = null;
  try {
    status = (await getEntitlementStatus(db, uid, 'parcel_tool'))?.status ?? null;
  } catch (cause) {
    logError(TAG, cause, { stage: 'entitlement-lookup', uid });
    throw cause;
  }
  const entitled = status !== null && ACTIVE_SUBSCRIPTION_STATUSES.has(status);
  logInfo(TAG, entitled ? 'entitled' : 'not entitled', { uid, status });
  return { uid, entitled };
}
