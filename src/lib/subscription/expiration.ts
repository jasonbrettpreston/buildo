// SPEC LINK: docs/specs/03-mobile/96_mobile_subscription.md §10 Step 4
//            docs/specs/00-architecture/116_multi_product_architecture.md §4 N2 (per-product trial clock)
//
// Server-side helpers for the PER-PRODUCT trial lifecycle
// (`.cursor/phase1_plan.md` Item 4 W2 — writes moved from
// user_profiles.subscription_status/trial_started_at to `entitlements`).
// Both functions are idempotent — under concurrent GETs from the same uid
// (e.g., two app screens hydrating in parallel), only one write will mutate
// state; the other will hit the WHERE/NOT EXISTS predicate after the first
// write commits and find no matching rows. Pure DB helpers (no Next.js
// dependencies) so a future batch sweep can import directly.
//
// AUTHORIZATION CONTRACT: callers MUST verify that the supplied `uid` is
// authorized — typically by passing the result of `getUserIdFromSession`
// or another Supabase-verified UID. These helpers do NOT re-validate
// ownership; they will write whatever entitlement row the predicates
// match. Calling either with an arbitrary uid from untrusted input would
// let a caller start or expire trials for unrelated users (within the
// bounds: only onboarded non-manufacturers for fallback-init, only
// status='trial' rows for expiration). The user-profile route is the only
// caller today (product 'lead_gen', per OD5); any new caller must document
// its authorization path.

import { query } from '@/lib/db/client';
import { isUuid, type Product } from '@/lib/entitlements';

/**
 * GET-time fallback for when the PATCH-time trial init was missed
 * (old client, app crash mid-PATCH, etc.). The conditions match the
 * server-side rules from Spec 96 §10 Step 4: profile is fully onboarded,
 * not a manufacturer (manufacturers are admin-managed and never receive a
 * trial — Spec 96 §8), and NO entitlement row exists yet for the product.
 *
 * The `NOT EXISTS` replaces the legacy `trial_started_at IS NULL AND
 * subscription_status IS NULL` double-guard with a single existence check —
 * a row existing AT ALL for that product means "already handled" (any
 * status: active subscriber, expired trial, admin_managed comp), matching
 * the old intent that ANY non-null status meant "don't re-init". It also
 * makes concurrent GETs race-safe: only the first transaction's INSERT
 * lands; subsequent ones find the row and become a no-op.
 *
 * Returns the inserted entitlement row when a write occurred, null otherwise.
 */
export async function applyFallbackTrialInitIfNeeded(
  uid: string,
  product: Product,
): Promise<Record<string, unknown> | null> {
  // Pre-229 dev uid shapes ('dev-user') are not UUIDs and cannot key an
  // entitlements row — no-op, identical to "no entitlement" (see
  // src/lib/entitlements UID SHAPE GUARD note).
  if (!isUuid(uid)) return null;
  const rows = await query<Record<string, unknown>>(
    `INSERT INTO entitlements (user_id, product, status, trial_started_at, created_at, updated_at)
     SELECT $1::uuid, $2, 'trial', NOW(), NOW(), NOW()
     WHERE EXISTS (
             SELECT 1 FROM user_profiles
             WHERE user_id = $1
               AND onboarding_complete = true
               AND (account_preset IS NULL OR account_preset != 'manufacturer'))
       AND NOT EXISTS (
             SELECT 1 FROM entitlements WHERE user_id = $1::uuid AND product = $2)
     ON CONFLICT (user_id, product) DO NOTHING
     RETURNING *`,
    [uid, product],
  );
  return rows[0] ?? null;
}

/**
 * Phase 1 trial expiration. When the product's `trial_started_at + 14 days`
 * has passed and the user hasn't subscribed, write `status = 'expired'` to
 * the entitlement row (not just the response — see spec §Step 4 explicit: a
 * computed-only response leaves admin dashboards / analytics out of sync
 * with locked-out users).
 *
 * Inclusive `<=` per spec — the user gets the full 14th day before the gate
 * flips.
 *
 * The double-check (status='trial' AND trial+14d<=NOW()) in the WHERE
 * clause prevents redundant writes under concurrent GETs.
 *
 * Returns the updated entitlement row when a write occurred, null otherwise.
 */
export async function applyTrialExpirationIfNeeded(
  uid: string,
  product: Product,
): Promise<Record<string, unknown> | null> {
  if (!isUuid(uid)) return null;
  const rows = await query<Record<string, unknown>>(
    `UPDATE entitlements
     SET status = 'expired', updated_at = NOW()
     WHERE user_id = $1 AND product = $2
       AND status = 'trial'
       AND trial_started_at IS NOT NULL
       AND trial_started_at + INTERVAL '14 days' <= NOW()
     RETURNING *`,
    [uid, product],
  );
  return rows[0] ?? null;
}
