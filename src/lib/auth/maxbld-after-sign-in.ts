// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.3 (`web_login`: the MaxBLD post-login target, never /dashboard);
//            ~/Buildo-scratch/mcfrontend/MF-46/DECISIONS-v1.md D-2 (b) (the terms step once after the first MaxBLD sign-in).
//
// MF-46 · where a MaxBLD sign-in goes: the terms step, which passes straight on when the terms are already accepted, carrying the
// visitor's own target through the MaxBLD branch of the shared guard.
import { safeRedirectPath } from './safe-redirect';

export function maxbldAfterSignIn(rawRedirect: string | string[] | undefined): string {
  const raw = typeof rawRedirect === 'string' ? rawRedirect : null;
  return `/terms-accept?redirect=${encodeURIComponent(safeRedirectPath(raw, { maxbld: true }))}`;
}
