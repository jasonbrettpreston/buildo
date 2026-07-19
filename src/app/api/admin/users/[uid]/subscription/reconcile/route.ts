// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §6 (Subscription-Ops)
//             docs/specs/02-web-admin/20_stripe_web_checkout.md §7
//             docs/specs/00-architecture/116_multi_product_architecture.md §4 N2 + OD3/OD5
//
// Admin subscription reconcile (P26-26-ADMIN). Webhooks are best-effort — a
// dropped or out-of-order event leaves the per-product `entitlements` rows out
// of step with Stripe's actual state. This route is the operator's drift check
// (entitlements swap, `.cursor/phase1_plan.md` Item 4 W7 — PER-PRODUCT now):
//   GET  — live-GET the customer's Stripe subscriptions, derive each product's
//          effective status (price → product map, OD3), and report
//          stored-vs-Stripe as an ARRAY of {product, stored_status,
//          stripe_status, drift} (read-only, no mutation). Response-SHAPE
//          change from the single-scalar v1 is deliberate and admin-only
//          (plan W7 — no mobile/contract implications).
//   POST — apply the Stripe truth to `entitlements` (admin-confirmed, reason
//          mandatory, audit-logged; one audit row per product actually
//          changed). Optional `product` body field scopes the apply; omitted
//          reconciles every drifted product. REFUSES to touch protected
//          per-product states (deleted / admin_managed) so it can never
//          resurrect a deleted account or demote a comp account.
//
// Auth: verifyAdminAuth FIRST line. POST additionally requires an attributable
// session admin (admin_key cannot perform an audited mutation).

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withApiEnvelope } from '@/lib/api/with-api-envelope';
import { verifyAdminAuth, parseAdminAllowlist, type AdminContext } from '@/lib/auth/verify-admin';
import { pool, withTransaction } from '@/lib/db/client';
import { ok, err } from '@/features/leads/api/envelope';
import { badRequestZod, internalError } from '@/features/leads/api/error-mapping';
import { logError, logWarn } from '@/lib/logger';
import { writeAdminAudit } from '@/lib/admin/admin-audit';
import {
  getStripeClient,
  deriveEffectiveStripeStatusByProduct,
  StripeNotConfiguredError,
} from '@/lib/stripe/client';
import { isUuid, type Product } from '@/lib/entitlements';
import {
  ReconcileApplySchema,
  RECONCILE_PROTECTED_STATUSES,
} from '@/lib/admin/subscription-ops-schemas';

const TAG = '[api/admin/users/uid/subscription/reconcile]';

function unauthorizedEnvelope(): NextResponse {
  return NextResponse.json(
    { data: null, error: { code: 'UNAUTHORIZED', message: 'Admin auth required' }, meta: null },
    { status: 401 },
  );
}

function stripeNotConfigured(): NextResponse {
  return NextResponse.json(
    { data: null, error: { code: 'STRIPE_NOT_CONFIGURED', message: 'Stripe is not configured' }, meta: null },
    { status: 500 },
  );
}

async function getParams(context: unknown): Promise<{ uid: string }> {
  return (context as { params: Promise<{ uid: string }> }).params;
}

interface ProfileRow {
  stripe_customer_id: string | null;
}

async function loadProfile(uid: string): Promise<ProfileRow | null> {
  const res = await pool.query<ProfileRow>(
    `SELECT stripe_customer_id FROM user_profiles WHERE user_id = $1`,
    [uid],
  );
  return res.rows[0] ?? null;
}

interface StoredEntitlementRow {
  product: Product;
  status: string;
}

async function loadStoredEntitlements(uid: string): Promise<StoredEntitlementRow[]> {
  if (!isUuid(uid)) return [];
  const res = await pool.query<StoredEntitlementRow>(
    `SELECT product, status FROM entitlements WHERE user_id = $1 ORDER BY product`,
    [uid],
  );
  return res.rows;
}

/** Live-derive the customer's per-product effective Stripe statuses. */
async function stripeStatusesFor(
  customerId: string,
): Promise<Map<Product, 'active' | 'past_due' | 'expired'>> {
  const stripe = getStripeClient();
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
  return deriveEffectiveStripeStatusByProduct(pool, subs.data);
}

interface ProductDriftRow {
  product: Product;
  stored_status: string | null;
  stripe_status: 'active' | 'past_due' | 'expired';
  drift: boolean;
  protected: boolean;
}

/**
 * Cross-reference stored entitlement rows against the live per-product Stripe
 * map. The product universe is the UNION of both sides: a stored row with no
 * live subscription reads Stripe-truth 'expired' (the no-subscriptions case,
 * same as v1's derive), and a live subscription with no stored row is drift
 * with stored_status null (a webhook gap the apply can repair).
 */
function crossReference(
  stored: StoredEntitlementRow[],
  live: Map<Product, 'active' | 'past_due' | 'expired'>,
): ProductDriftRow[] {
  const storedByProduct = new Map(stored.map((r) => [r.product, r.status]));
  const products = [...new Set<Product>([...storedByProduct.keys(), ...live.keys()])].sort();
  return products.map((product) => {
    const storedStatus = storedByProduct.get(product) ?? null;
    const stripeStatus = live.get(product) ?? 'expired';
    const isProtected = storedStatus !== null && RECONCILE_PROTECTED_STATUSES.has(storedStatus);
    // Drift is only actionable when the stored status is Stripe-governed.
    const drift = !isProtected && storedStatus !== stripeStatus;
    return { product, stored_status: storedStatus, stripe_status: stripeStatus, drift, protected: isProtected };
  });
}

// ---------------------------------------------------------------------------
// GET — read-only drift report (per-product array)
// ---------------------------------------------------------------------------
export const GET = withApiEnvelope(async function GET(request: NextRequest, context?: unknown) {
  const adminCtx = await verifyAdminAuth(request);
  if (!adminCtx) return unauthorizedEnvelope();

  const { uid } = await getParams(context);

  try {
    const profile = await loadProfile(uid);
    if (!profile) return err('NOT_FOUND', 'User not found', 404);

    const stored = await loadStoredEntitlements(uid);

    if (!profile.stripe_customer_id) {
      return ok(
        {
          products: stored.map((r) => ({
            product: r.product,
            stored_status: r.status,
            stripe_status: null,
            drift: false,
          })),
        },
        { reconcilable: false, reason: 'no_stripe_customer' },
      );
    }

    const live = await stripeStatusesFor(profile.stripe_customer_id);
    const products = crossReference(stored, live);

    return ok(
      { products },
      {
        reconcilable: products.some((p) => !p.protected),
        protected: products.filter((p) => p.protected).map((p) => p.product),
      },
    );
  } catch (cause) {
    if (cause instanceof StripeNotConfiguredError) return stripeNotConfigured();
    return internalError(cause, { route: 'GET /api/admin/users/[uid]/subscription/reconcile' });
  }
});

// ---------------------------------------------------------------------------
// POST — apply the Stripe truth (audited mutation, per product)
// ---------------------------------------------------------------------------
function forbiddenNonSessionWrite(ctx: AdminContext): NextResponse | null {
  if (ctx.authMethod === 'admin_key') {
    logWarn(TAG, 'admin_key mutation rejected — reconcile-apply requires a session admin', {
      authMethod: ctx.authMethod,
    });
    return err('FORBIDDEN', 'Reconcile-apply requires a session admin', 403);
  }
  return null;
}

export const POST = withApiEnvelope(async function POST(request: NextRequest, context?: unknown) {
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
  const parsed = ReconcileApplySchema.safeParse(rawBody);
  if (!parsed.success) return badRequestZod(parsed.error);
  const { reason, product: requestedProduct } = parsed.data;

  // Never mutate an admin allowlist member.
  const adminUids = parseAdminAllowlist(process.env.ADMIN_USER_IDS);
  if (adminUids.includes(targetUid)) {
    return err('FORBIDDEN', 'Cannot mutate an admin account', 403);
  }

  try {
    const profile = await loadProfile(targetUid);
    if (!profile) return err('NOT_FOUND', 'User not found', 404);
    if (!profile.stripe_customer_id) {
      return err('BAD_REQUEST', 'User has no Stripe customer to reconcile against', 400);
    }
    if (!isUuid(targetUid)) {
      // Pre-229 legacy/dev uid shapes cannot key an entitlements row (UUID FK)
      // — nothing to reconcile onto; refuse loudly rather than 500 on the cast.
      return err('BAD_REQUEST', 'Target uid is not entitlements-keyed (non-uuid legacy account)', 400);
    }

    const stored = await loadStoredEntitlements(targetUid);
    const live = await stripeStatusesFor(profile.stripe_customer_id);
    let products = crossReference(stored, live);
    if (requestedProduct) {
      products = products.filter((p) => p.product === requestedProduct);
    }
    // Protected states are refused loudly (409) rather than silently skipped
    // when they are ALL there is to reconcile — preserves the v1 scalar
    // contract ("cannot reconcile a deleted/comp account") for both the
    // targeted-product case and the whole-account case.
    if (products.length > 0 && products.every((p) => p.protected)) {
      return err('CONFLICT', `Cannot reconcile a '${products[0]!.stored_status}' entitlement`, 409);
    }

    const drifted = products.filter((p) => p.drift);
    if (drifted.length === 0) {
      // No drift — idempotent no-op (no audit row for a non-change).
      return ok({ products, applied: [] }, { drift: false });
    }

    // Atomic mutation + audit (P26 review — DeepSeek/Observability CRITICAL):
    // each product's upsert and its admin_audit_log row commit together or not
    // at all. The WHERE fence excludes BOTH protected statuses at the SQL
    // level (not just the read-time check above), so a concurrent flip to
    // 'admin_managed' or the deletion state during the Stripe round-trip can't
    // be overwritten. last_stripe_event_at = NOW() blocks a subsequently-
    // arriving STALE webhook from reverting this operator decision (Gemini
    // MED). The upsert's INSERT arm repairs a missing row (webhook gap) —
    // there is no protected state to fence when no row exists.
    const applied: Array<{ product: Product; from: string | null; to: string }> = [];
    await withTransaction(async (client) => {
      for (const p of drifted) {
        const updated = await client.query(
          `INSERT INTO entitlements (user_id, product, status, last_stripe_event_at, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW(), NOW())
           ON CONFLICT (user_id, product) DO UPDATE
             SET status = EXCLUDED.status, last_stripe_event_at = NOW(), updated_at = NOW()
             WHERE entitlements.status NOT IN ('cancelled_pending_deletion', 'admin_managed')`,
          [targetUid, p.product, p.stripe_status],
        );
        if ((updated.rowCount ?? 0) === 0) {
          // The fence caught a concurrent state change — no mutation, no audit
          // for THIS product; the others still apply.
          continue;
        }
        await writeAdminAudit(
          {
            adminUid: adminCtx.uid,
            action: 'subscription_reconcile_apply',
            targetUid,
            oldValue: { product: p.product, subscription_status: p.stored_status },
            newValue: { product: p.product, subscription_status: p.stripe_status },
            reason,
          },
          client,
        );
        applied.push({ product: p.product, from: p.stored_status, to: p.stripe_status });
      }
    });

    if (applied.length === 0) {
      return err('CONFLICT', 'Account state changed concurrently; reconcile not applied', 409);
    }

    return ok(
      { products, applied },
      { drift: true, audited: true },
    );
  } catch (cause) {
    if (cause instanceof StripeNotConfiguredError) return stripeNotConfigured();
    logError(TAG, cause, { stage: 'reconcile_apply', targetUid });
    return internalError(cause, { route: 'POST /api/admin/users/[uid]/subscription/reconcile' });
  }
});
