// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §3 + §4
//             docs/specs/02-web-admin/33_web_admin_engineering_protocol.md §5 + §8 + §13
//             docs/specs/00-architecture/116_multi_product_architecture.md §4 N2 + OD5
//
// Admin User Management — single-account detail + mutations (P24-24B).
//   GET   — full profile + activity counts. A view of a deletion-window account
//           is ALLOWED but annotated (deleted: true) AND audit-logged.
//   PATCH — the mutation set (discriminated union on `action`): set_trades (the
//           JOIN EDITOR), set_preset, extend_trial, revoke, suspend, delete.
//
// Entitlements swap (`.cursor/phase1_plan.md` Item 4 W6 + R7/R8): the
// subscription mutations (extend_trial / revoke / suspend) write per-product
// `entitlements` rows (product from the request body, default 'lead_gen' —
// OD5 single-product window); delete fans out to every entitlement row. The
// detail view (R7) and the audit `oldValue` snapshots (R8) derive
// subscription_status / trial_started_at from `entitlements`, never from the
// retiring user_profiles columns.
//
// Auth: verifyAdminAuth FIRST line. Mutations require authMethod !== 'admin_key'
// (the shared CI sentinel cannot perform per-admin-attributable writes). Every
// mutation writes exactly one admin_audit_log row (PII-redacted). Guards:
//   - targeting an ADMIN_USER_IDS allowlist member → 403 (all actions)
//   - self-target on a DESTRUCTIVE action (revoke/suspend/delete) → 403

import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth, parseAdminAllowlist, type AdminContext } from '@/lib/auth/verify-admin';
import { pool, withTransaction } from '@/lib/db/client';
import { ok, err } from '@/features/leads/api/envelope';
import { badRequestZod, internalError } from '@/features/leads/api/error-mapping';
import { logError, logWarn } from '@/lib/logger';
import { track } from '@/lib/admin/analytics';
import { writeAdminAudit, scrubAdminAuditForTarget } from '@/lib/admin/admin-audit';
import { cancelAllStripeSubscriptions } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  LEAD_GEN_ENTITLEMENT_JOIN,
  DEFAULT_PRODUCT,
  getEntitlementStatusForUpdate,
  upsertEntitlementStatus,
  upsertTrialWindow,
  markAllEntitlementsCancelledPendingDeletion,
  type Product,
  type Queryable,
} from '@/lib/entitlements';
import {
  AdminUserMutationSchema,
  DESTRUCTIVE_ACTIONS,
  type AdminUserMutation,
} from '@/lib/admin/user-management-schemas';

const TAG = '[api/admin/users/uid]';

function unauthorizedEnvelope(): NextResponse {
  return NextResponse.json(
    { data: null, error: { code: 'UNAUTHORIZED', message: 'Admin auth required' }, meta: null },
    { status: 401 },
  );
}

function hashAdminUid(uid: string): string {
  return createHash('sha256').update(uid).digest('hex').slice(0, 16);
}

// user_profiles columns returned by the detail view. Admin sees more than the
// mobile client (stripe_customer_id for the dashboard link-out;
// trade_slugs_override for the JOIN editor) — this is an admin-only surface
// behind verifyAdminAuth. subscription_status / trial_started_at are NOT in
// this list anymore — they come from the lead_gen entitlements row (R7).
const DETAIL_BASE_COLUMNS = [
  'user_id', 'email', 'phone_number', 'full_name', 'company_name', 'display_name',
  'trade_slug', 'trade_slugs_override', 'account_preset', 'radius_km', 'radius_cap_km',
  'location_mode', 'stripe_customer_id', 'stripe_cancel_failed_at',
  'onboarding_complete', 'tos_accepted_at', 'account_deleted_at', 'lead_views_count',
  'created_at', 'updated_at',
] as const;

// Response-shape freeze: the joined SELECT restores subscription_status /
// trial_started_at under their existing field names (single-product window —
// the detail view gains a per-product breakdown only if/when a second product
// ships, plan R7).
const DETAIL_JOINED_SELECT =
  DETAIL_BASE_COLUMNS.map((c) => `up.${c}`).join(', ') +
  ', e.status AS subscription_status, e.trial_started_at';

const DETAIL_SELECT_SQL = `SELECT ${DETAIL_JOINED_SELECT} FROM user_profiles up ${LEAD_GEN_ENTITLEMENT_JOIN} WHERE up.user_id = $1`;

async function getParams(context: unknown): Promise<{ uid: string }> {
  return (context as { params: Promise<{ uid: string }> }).params;
}

// ---------------------------------------------------------------------------
// GET — account detail
// ---------------------------------------------------------------------------
export const GET = withApiEnvelope(async function GET(request: NextRequest, context?: unknown) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorizedEnvelope();

  const { uid } = await getParams(context);

  try {
    const res = await pool.query<Record<string, unknown>>(DETAIL_SELECT_SQL, [uid]);
    const row = res.rows[0];
    if (!row) return err('NOT_FOUND', 'User not found', 404);

    // Activity counts — saved leads + view events. LEFT-scoped, best-effort.
    const counts = await pool.query<{ saved_count: number; view_events: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM lead_views WHERE user_id = $1 AND saved = true) AS saved_count,
         (SELECT COUNT(*)::int FROM lead_view_events WHERE user_id = $1) AS view_events`,
      [uid],
    );

    const isDeleted = row.account_deleted_at != null;

    // Deletion-window view is allowed but ANNOTATED + audit-logged (admins
    // legitimately service the 30-day window; the access is not silently
    // hidden). admin_key cannot be attributed, so skip the audit for it.
    if (isDeleted && adminCtx.authMethod !== 'admin_key') {
      try {
        await writeAdminAudit({
          adminUid: adminCtx.uid,
          action: 'view_deleted_account',
          targetUid: uid,
          reason: 'Admin viewed a deletion-window account detail',
        });
      } catch (auditErr) {
        logError(TAG, auditErr, { stage: 'audit_view_deleted', uid });
      }
    }

    return ok(
      { ...row, saved_count: counts.rows[0]?.saved_count ?? 0, view_events: counts.rows[0]?.view_events ?? 0 },
      { deleted: isDeleted },
    );
  } catch (cause) {
    return internalError(cause, { route: 'GET /api/admin/users/[uid]' });
  }
});

// ---------------------------------------------------------------------------
// PATCH — the mutation set
// ---------------------------------------------------------------------------
function forbiddenNonSessionWrite(ctx: AdminContext): NextResponse | null {
  if (ctx.authMethod === 'admin_key') {
    logWarn(TAG, 'admin_key mutation rejected — user mutations require an attributable session admin', {
      authMethod: ctx.authMethod,
    });
    return err('FORBIDDEN', 'User mutations require a session admin (admin_key writes are not permitted)', 403);
  }
  return null;
}

/**
 * R8: the audit `oldValue` subscription snapshot reads the entitlement row
 * FOR UPDATE inside the mutation transaction — the row-lock serialises with
 * the webhook's upsert AND makes the recorded old value the value actually
 * replaced, never a stale read.
 */
async function lockedOldSubscriptionValue(
  client: Queryable,
  uid: string,
  product: Product,
): Promise<{ status: string | null; trial_started_at: unknown }> {
  const row = await getEntitlementStatusForUpdate(client, uid, product);
  return { status: row?.status ?? null, trial_started_at: row?.trial_started_at ?? null };
}

export const PATCH = withApiEnvelope(async function PATCH(request: NextRequest, context?: unknown) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorizedEnvelope();
  const forbidden = forbiddenNonSessionWrite(adminCtx);
  if (forbidden) return forbidden;

  const { uid: targetUid } = await getParams(context);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return err('INVALID_JSON', 'Request body is not valid JSON', 400);
  }
  const parsed = AdminUserMutationSchema.safeParse(rawBody);
  if (!parsed.success) return badRequestZod(parsed.error);
  const mutation = parsed.data;

  // Guard 1 — never mutate an admin allowlist member (all actions).
  const adminUids = parseAdminAllowlist(process.env.ADMIN_USER_IDS);
  if (adminUids.includes(targetUid)) {
    logWarn(TAG, 'refused mutation targeting an admin allowlist member', {
      action: mutation.action,
      by: hashAdminUid(adminCtx.uid),
    });
    return err('FORBIDDEN', 'Cannot mutate an admin account', 403);
  }

  // Guard 2 — no self-target on destructive actions.
  if (DESTRUCTIVE_ACTIONS.has(mutation.action) && targetUid === adminCtx.uid) {
    return err('FORBIDDEN', 'Cannot perform a destructive action on your own account', 403);
  }

  try {
    const existingRes = await pool.query<Record<string, unknown>>(DETAIL_SELECT_SQL, [targetUid]);
    const existing = existingRes.rows[0];
    if (!existing) return err('NOT_FOUND', 'User not found', 404);

    const result = await applyMutation(mutation, targetUid, existing);

    await track(hashAdminUid(adminCtx.uid), 'admin_user_mutation', {
      action: mutation.action,
      auth_method: adminCtx.authMethod,
    });

    return ok(result.row, { action: mutation.action, audited: true });
  } catch (cause) {
    return internalError(cause, { route: 'PATCH /api/admin/users/[uid]', action: mutation.action });
  }

  // -------------------------------------------------------------------------
  // Mutation dispatch (closure captures adminCtx for the audit writer)
  // -------------------------------------------------------------------------
  async function applyMutation(
    m: AdminUserMutation,
    tUid: string,
    existing: Record<string, unknown>,
  ): Promise<{ row: Record<string, unknown> }> {
    switch (m.action) {
      // Every case wraps its writes + writeAdminAudit in ONE transaction (P24
      // close-out CRIT — a mutation that commits before a failing audit write
      // is an unrecoverable compliance hole; the executor param exists for
      // exactly this). Network calls (Supabase/Stripe in delete) stay OUTSIDE
      // the txn. Each case re-SELECTs the joined detail row inside the txn so
      // the response reflects the committed entitlement state.
      case 'set_trades': {
        const [primary, ...rest] = m.trade_slugs;
        const override = rest.length > 0 ? rest : null;
        return withTransaction(async (client) => {
          await client.query(
            `UPDATE user_profiles
               SET trade_slug = $2, trade_slugs_override = $3, updated_at = NOW()
             WHERE user_id = $1`,
            [tUid, primary, override],
          );
          await writeAdminAudit({
            adminUid: adminCtx!.uid,
            action: 'set_trades',
            targetUid: tUid,
            oldValue: { trade_slug: existing.trade_slug, trade_slugs_override: existing.trade_slugs_override },
            newValue: { trade_slug: primary, trade_slugs_override: override },
            reason: m.reason,
          }, client);
          const updated = await client.query<Record<string, unknown>>(DETAIL_SELECT_SQL, [tUid]);
          return { row: updated.rows[0]! };
        });
      }
      case 'set_preset': {
        return withTransaction(async (client) => {
          await client.query(
            `UPDATE user_profiles SET account_preset = $2, updated_at = NOW()
             WHERE user_id = $1`,
            [tUid, m.account_preset],
          );
          await writeAdminAudit({
            adminUid: adminCtx!.uid,
            action: 'set_preset',
            targetUid: tUid,
            oldValue: { account_preset: existing.account_preset },
            newValue: { account_preset: m.account_preset },
            reason: m.reason,
          }, client);
          const updated = await client.query<Record<string, unknown>>(DETAIL_SELECT_SQL, [tUid]);
          return { row: updated.rows[0]! };
        });
      }
      case 'extend_trial': {
        // Set the product's trial window so it expires in exactly `days` days
        // (expiration = trial_started_at + 14d, per Spec 96) — an entitlements
        // upsert (W6), product defaulting to lead_gen in the single-product
        // window (OD5).
        const product: Product = m.product ?? DEFAULT_PRODUCT;
        return withTransaction(async (client) => {
          const oldValue = await lockedOldSubscriptionValue(client, tUid, product);
          await upsertTrialWindow(client, tUid, product, m.days);
          await writeAdminAudit({
            adminUid: adminCtx!.uid,
            action: 'extend_trial',
            targetUid: tUid,
            oldValue: { product, subscription_status: oldValue.status, trial_started_at: oldValue.trial_started_at },
            newValue: { product, subscription_status: 'trial', trial_days_remaining: m.days },
            reason: m.reason,
          }, client);
          const updated = await client.query<Record<string, unknown>>(DETAIL_SELECT_SQL, [tUid]);
          return { row: updated.rows[0]! };
        });
      }
      case 'revoke':
      case 'suspend': {
        // Both block access via the entitlement status 'expired'; the audit
        // action distinguishes intent (a dedicated 'suspended' status is a
        // future enum addition — documented in Spec 21).
        const product: Product = m.product ?? DEFAULT_PRODUCT;
        return withTransaction(async (client) => {
          const oldValue = await lockedOldSubscriptionValue(client, tUid, product);
          await upsertEntitlementStatus(client, tUid, product, 'expired');
          await writeAdminAudit({
            adminUid: adminCtx!.uid,
            action: m.action,
            targetUid: tUid,
            oldValue: { product, subscription_status: oldValue.status },
            newValue: { product, subscription_status: 'expired' },
            reason: m.reason,
          }, client);
          const updated = await client.query<Record<string, unknown>>(DETAIL_SELECT_SQL, [tUid]);
          return { row: updated.rows[0]! };
        });
      }
      case 'delete': {
        // --- Network calls FIRST, OUTSIDE the txn (§R9 — never hold a txn across
        // I/O). Both best-effort/loud-non-fatal: a Supabase or Stripe outage must
        // never block the DB deletion (the DB row is authoritative).
        // P1-G5 Admin-SDK-successor site: admin.auth().deleteUser(tUid) ->
        // supabase.auth.admin.deleteUser(tUid) — a clean 1:1 swap (hard-deletes
        // the auth.users row, same as Firebase's deleteUser).
        try {
          const supabaseAdmin = createAdminClient();
          await supabaseAdmin.auth.admin.deleteUser(tUid);
        } catch (supabaseErr) {
          logError(TAG, supabaseErr, { stage: 'supabase_delete', targetUid: tUid });
        }
        // Delete-time Stripe cancel (P26 review — Code Reviewer CRITICAL). Spec 21
        // §7 assigns cancel-on-delete to the money loop; the admin delete reaches
        // the same 'cancelled_pending_deletion' terminal state as the self-serve
        // delete route, so it MUST cancel identically — else an admin-deleted
        // user's subscription bills forever. A cancel failure sets the durable
        // stripe_cancel_failed_at marker (folded into the atomic write below) so
        // the sweep/retry route surfaces it.
        let stripeCancelFailed = false;
        const stripeCustomerId = existing.stripe_customer_id as string | null;
        if (stripeCustomerId) {
          try {
            await cancelAllStripeSubscriptions(stripeCustomerId);
          } catch (stripeErr) {
            logError(TAG, stripeErr, { stage: 'stripe_cancel', targetUid: tUid });
            stripeCancelFailed = true;
          }
        }
        // --- Atomic: PII-nullify + terminal state on EVERY entitlement row
        // (account-level fan-out, same as W5's self-serve delete) + (marker on
        // cancel failure) + the audit row in ONE transaction (P24 close-out
        // CRIT — a mutation must never commit without its audit; for delete
        // the un-audited state is irreversible PII destruction with no
        // attribution).
        const { row } = await withTransaction(async (client) => {
          const oldValue = await lockedOldSubscriptionValue(client, tUid, DEFAULT_PRODUCT);
          await client.query(
            `UPDATE user_profiles
               SET full_name = NULL, phone_number = NULL, email = NULL,
                   backup_email = NULL, company_name = NULL,
                   account_deleted_at = NOW(),
                   stripe_cancel_failed_at = CASE WHEN $2 THEN NOW() ELSE stripe_cancel_failed_at END,
                   updated_at = NOW()
             WHERE user_id = $1`,
            [tUid, stripeCancelFailed],
          );
          await markAllEntitlementsCancelledPendingDeletion(client, tUid);
          await writeAdminAudit({
            adminUid: adminCtx!.uid,
            action: 'delete',
            targetUid: tUid,
            oldValue: { subscription_status: oldValue.status, had_pii: true },
            newValue: { account_deleted_at: 'set', subscription_status: 'cancelled_pending_deletion' },
            reason: m.reason,
          }, client);
          const updated = await client.query<Record<string, unknown>>(DETAIL_SELECT_SQL, [tUid]);
          return { row: updated.rows[0]! };
        });
        // RTBF scrub — a separate step (NULLs residual payloads on ALL prior audit
        // rows for the target). Runs after the delete-fact audit is committed.
        await scrubAdminAuditForTarget(tUid);
        return { row };
      }
    }
  }
});
