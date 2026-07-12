// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §6 (Subscription-Ops)
//             docs/specs/02-web-admin/20_stripe_web_checkout.md §7
//
// Request schemas for the admin Subscription-Ops mutation routes (P26-26-ADMIN).
// Kept in the schemas layer (Spec 33 §13) so the .logic tests import the same
// contract the routes enforce. A `reason` is MANDATORY on every mutation — it
// is written verbatim to admin_audit_log; the min length rejects empty/ceremony
// reasons at the boundary.

import { z } from 'zod';

const reasonField = z
  .string()
  .trim()
  .min(3, 'A reason of at least 3 characters is required (audit-logged)')
  .max(500);

/** POST /api/admin/users/[uid]/subscription/reconcile — apply Stripe truth. */
export const ReconcileApplySchema = z.object({
  apply: z.literal(true),
  reason: reasonField,
});
export type ReconcileApply = z.infer<typeof ReconcileApplySchema>;

/** POST /api/admin/users/[uid]/subscription/retry-cancel — re-run 26D cancel. */
export const RetryCancelSchema = z.object({
  reason: reasonField,
});
export type RetryCancel = z.infer<typeof RetryCancelSchema>;

/**
 * Stored statuses that reconcile-apply must NEVER overwrite:
 *   - cancelled_pending_deletion: a deleted account; applying Stripe truth
 *     would resurrect it (Spec 96 §2 forbids re-subscribe of a deleted acct).
 *   - admin_managed: a comp/manual account whose status is deliberately not
 *     governed by Stripe billing.
 * The reconcile route returns 409 rather than mutate these.
 */
export const RECONCILE_PROTECTED_STATUSES: ReadonlySet<string> = new Set([
  'cancelled_pending_deletion',
  'admin_managed',
]);
