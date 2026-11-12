// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.3 (terms: `tos_accepted_at` only, never `onboarding_complete`);
//            ~/Buildo-scratch/mcfrontend/MF-46/DECISIONS-v1.md D-2 (b) (RULED 2026-11-11, "8. y"); docs/specs/02-web-admin/33_web_admin_engineering_protocol.md
//            section 8 (a server page that reads rows gates itself first).
//
// MF-46 · maxbld.ca /terms-accept: the terms step once after the first MaxBLD sign-in. Signed out -> /login (the middleware's first line;
// this is the second). Already accepted -> straight on to the visitor's MaxBLD target. Otherwise the one checkbox; the server stamps the time.
import { redirect } from 'next/navigation';
import { pool } from '@/lib/db/client';
import { termsAccepted } from '@/lib/auth/maxbld-terms';
import { safeRedirectPath } from '@/lib/auth/safe-redirect';
import { isUuid } from '@/lib/entitlements';
import { logError } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';
import { TermsAcceptClient } from './TermsAcceptClient';

export const dynamic = 'force-dynamic';

export default async function MaxbldTermsAcceptPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { redirect: raw } = await searchParams;
  const target = safeRedirectPath(typeof raw === 'string' ? raw : null, { maxbld: true });
  let uid: string | null = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    uid = !error && data && typeof data.claims.sub === 'string' ? data.claims.sub : null;
  } catch (cause) {
    logError('[maxbld/terms-accept]', cause, { stage: 'session-verify' });
    throw cause;
  }
  if (!uid || !isUuid(uid)) redirect(`/login?redirect=${encodeURIComponent(target)}`);
  let accepted: boolean;
  try {
    accepted = await termsAccepted(pool, uid);
  } catch (cause) {
    logError('[maxbld/terms-accept]', cause, { stage: 'terms-lookup', uid });
    throw cause;
  }
  if (accepted) redirect(target);
  return <TermsAcceptClient target={target} />;
}
