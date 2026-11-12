// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.3 (`web_login`), 11b.7 W2; plan ~/Buildo-scratch/mcfrontend/MF-46/plan.v1.md §3.2.
//
// MF-46 · maxbld.ca /signup (host table row; the visitor never sees this internal path). The shared sign-in screen, MaxBLD variant, mode "signup".
import { maxbldAfterSignIn } from '@/lib/auth/maxbld-after-sign-in';
import { MaxbldAuthClient } from '../MaxbldAuthClient';

export const dynamic = 'force-dynamic';

export default async function MaxbldAuthPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { redirect } = await searchParams;
  return <MaxbldAuthClient mode="signup" afterSignIn={maxbldAfterSignIn(redirect)} />;
}
