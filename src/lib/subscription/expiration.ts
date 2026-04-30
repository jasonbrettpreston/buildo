// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §10 Step 4
//
// Server-side helpers for the trial lifecycle. Both functions are
// idempotent — under concurrent GETs from the same uid (e.g., two
// app screens hydrating in parallel), only one row UPDATE will mutate
// state; the other will hit the WHERE predicate after the first
// write commits and find no matching rows. Pure DB helpers (no
// Next.js dependencies) so a future Phase 2 Cloud Function batch
// sweep can import directly.

import { query } from '@/lib/db/client';

/**
 * GET-time fallback for when the PATCH-time trial init was missed
 * (old client, app crash mid-PATCH, etc.). The conditions match the
 * server-side rules from Spec 96 §10 Step 4: profile is fully
 * onboarded, no trial timestamp yet, no subscription status assigned,
 * and not a manufacturer (manufacturers are admin-managed and never
 * receive a trial — see Spec 96 §8).
 *
 * The `WHERE trial_started_at IS NULL` clause makes concurrent GETs
 * race-safe: only the first transaction wins; subsequent transactions
 * find zero matching rows and become a no-op.
 *
 * Returns the updated row when a write occurred, null otherwise.
 */
export async function applyFallbackTrialInitIfNeeded(
  uid: string,
): Promise<Record<string, unknown> | null> {
  const rows = await query<Record<string, unknown>>(
    `UPDATE user_profiles
     SET trial_started_at = NOW(), subscription_status = 'trial', updated_at = NOW()
     WHERE user_id = $1
       AND onboarding_complete = true
       AND trial_started_at IS NULL
       AND subscription_status IS NULL
       AND (account_preset IS NULL OR account_preset != 'manufacturer')
     RETURNING *`,
    [uid],
  );
  return rows[0] ?? null;
}

/**
 * Phase 1 trial expiration. When a user's `trial_started_at + 14 days`
 * has passed and they haven't yet subscribed, write
 * `subscription_status = 'expired'` to the DB row (not just the
 * response — see spec §Step 4 explicit: a computed-only response
 * leaves admin dashboards / analytics out of sync with locked-out
 * users).
 *
 * Inclusive `<=` per spec — the user gets the full 14th day before
 * the gate flips.
 *
 * The double-check (status='trial' AND trial+14d<=NOW()) in the WHERE
 * clause prevents redundant writes under concurrent GETs.
 *
 * Returns the updated row when a write occurred, null otherwise.
 */
export async function applyTrialExpirationIfNeeded(
  uid: string,
): Promise<Record<string, unknown> | null> {
  const rows = await query<Record<string, unknown>>(
    `UPDATE user_profiles
     SET subscription_status = 'expired', updated_at = NOW()
     WHERE user_id = $1
       AND subscription_status = 'trial'
       AND trial_started_at IS NOT NULL
       AND trial_started_at + INTERVAL '14 days' <= NOW()
     RETURNING *`,
    [uid],
  );
  return rows[0] ?? null;
}
