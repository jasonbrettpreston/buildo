// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.3 (terms: `tos_accepted_at` only, never `onboarding_complete`, D-10);
//            ~/Buildo-scratch/mcfrontend/MF-46/DECISIONS-v1.md D-2 (b) (RULED 2026-11-11, "8. y"): once after the first MaxBLD sign-in, the
//            server stamps the time and writes only while the column is empty (security F5: never a client-supplied time).
//
// MF-46 · the MaxBLD terms record. One read and one write on user_profiles.tos_accepted_at (migration 114). The write creates the profile
// row when it is missing (the PATCH /api/user-profile precedent, route.ts :139-141) and never touches any other column.
import type { Queryable } from '@/lib/entitlements';

export const TERMS_READ_SQL = 'SELECT tos_accepted_at FROM user_profiles WHERE user_id = $1';
export const TERMS_WRITE_SQL = `INSERT INTO user_profiles (user_id, tos_accepted_at) VALUES ($1, NOW())
ON CONFLICT (user_id) DO UPDATE SET tos_accepted_at = NOW() WHERE user_profiles.tos_accepted_at IS NULL`;

/** True when the user has a recorded terms acceptance. */
export async function termsAccepted(db: Queryable, uid: string): Promise<boolean> {
  const { rows } = await db.query(TERMS_READ_SQL, [uid]);
  const row = rows[0] as { tos_accepted_at?: unknown } | undefined;
  return row !== undefined && row.tos_accepted_at !== null && row.tos_accepted_at !== undefined;
}

/** Stamps the server time once; a second call changes nothing. */
export async function acceptTerms(db: Queryable, uid: string): Promise<void> {
  await db.query(TERMS_WRITE_SQL, [uid]);
}
