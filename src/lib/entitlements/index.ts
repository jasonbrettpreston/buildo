// SPEC LINK: docs/specs/00-architecture/116_multi_product_architecture.md §4 N2/N3 + OD3/OD5
//            docs/specs/00-architecture/13_authentication.md §3.4 (uid at the API boundary)
//
// Per-product entitlements (Spec 116 N2) — the successor surface for the
// retired `user_profiles.subscription_status` / `trial_started_at` /
// `last_stripe_event_at` columns (dropped by migration 229, the wave AFTER
// this one; until then the columns exist but NO code may touch them — the
// `.cursor/phase1_plan.md` P1-F3d grep gate).
//
// Server-side only, raw pg (D1) — never imported from client components.
// Every helper takes a `Queryable` (a pg Pool OR a transaction-scoped
// PoolClient) so writers can participate in their route's existing
// `withTransaction` boundary.
//
// UID SHAPE GUARD: `entitlements.user_id` is UUID (FK -> auth.users). Until
// migration 229 lands, `user_profiles.user_id` is still VARCHAR and two
// non-UUID uid shapes are live in dev: the DEV_MODE bypass uid ('dev-user')
// and the admin-provisioning dev fallback ('dev_<preset>_<hash>'). Passing
// either into a `user_id = $1::uuid` predicate would raise 22P02 (invalid
// uuid syntax) and turn a soft "no entitlement" into a 500. Every helper
// therefore no-ops (null / 0 rows) on a non-UUID uid instead of throwing —
// behaviourally identical to "no entitlement row exists", which is true.

import type { QueryResult, QueryResultRow } from 'pg';
import { logWarn } from '@/lib/logger';

/** A pg Pool or PoolClient — anything exposing parameterised `query`. */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    queryText: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}

// Mirrors migration 228's chk_entitlements_product CHECK constraint AND the
// `_contracts.json` key schema.entitlement_products (landed with migration
// 229's commit, plan P1-F3g) — contracts.infra.test.ts locks all three
// against each other.
export const PRODUCTS = ['lead_gen', 'flight_center'] as const;
export type Product = (typeof PRODUCTS)[number];

/** OD5 (RULED): the shipped parcel tool + every Phase-1 gate folds into lead_gen. */
export const DEFAULT_PRODUCT: Product = 'lead_gen';

// Mirrors migration 228's chk_entitlements_status CHECK constraint AND
// `_contracts.json` schema.entitlement_statuses (contracts.infra.test.ts).
export const ENTITLEMENT_STATUSES = [
  'trial',
  'active',
  'past_due',
  'expired',
  'cancelled_pending_deletion',
  'admin_managed',
] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

/**
 * Reusable SQL fragment: LEFT JOIN the lead_gen entitlement row onto a
 * `user_profiles up` query so `e.status AS subscription_status` /
 * `e.trial_started_at` keep the exact response field names mobile's
 * UserProfileSchema parses (plan Item 4, R6 mobile-contract freeze).
 *
 * Plain uuid = uuid compare: migration 229 converted `up.user_id` to UUID
 * (FK auth.users), matching `e.user_id` — the interim `::text` casts the
 * pre-229 wave carried (uuid = varchar has no operator) are dropped, per
 * that wave's own drop-casts note.
 */
export const LEAD_GEN_ENTITLEMENT_JOIN = `LEFT JOIN entitlements e ON e.user_id = up.user_id AND e.product = 'lead_gen'`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is a canonical UUID string (auth.users id shape). */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export interface EntitlementStatusRow {
  status: EntitlementStatus;
  // pg returns TIMESTAMPTZ as a JS Date; JSON.stringify renders it as an ISO
  // string, which is the shape the mobile contract sees. String accepted for
  // mocked-query tests.
  trial_started_at: Date | string | null;
}

/**
 * The per-product entitlement read (plan Item 4, new-helper row). One indexed
 * PK lookup; returns null when the user has no row for the product (a
 * zero-entitlement user is a legal state, never an error).
 */
export async function getEntitlementStatus(
  db: Queryable,
  uid: string,
  product: Product,
): Promise<EntitlementStatusRow | null> {
  if (!isUuid(uid)) return null;
  const res = await db.query<EntitlementStatusRow>(
    `SELECT status, trial_started_at FROM entitlements WHERE user_id = $1 AND product = $2`,
    [uid, product],
  );
  return res.rows[0] ?? null;
}

/**
 * Row-locked variant for TOCTOU-sensitive readers (R3 subscribe/session) and
 * the W6 audit `oldValue` snapshot (plan R8): serialises with the webhook's
 * upsert on the same (user_id, product) row. Zero matching rows takes no lock
 * and returns null — a first-time subscriber simply has no row yet.
 */
export async function getEntitlementStatusForUpdate(
  db: Queryable,
  uid: string,
  product: Product,
): Promise<EntitlementStatusRow | null> {
  if (!isUuid(uid)) return null;
  const res = await db.query<EntitlementStatusRow>(
    `SELECT status, trial_started_at FROM entitlements WHERE user_id = $1 AND product = $2 FOR UPDATE`,
    [uid, product],
  );
  return res.rows[0] ?? null;
}

export interface StripeEventUpsertArgs {
  userId: string;
  product: Product;
  status: 'active' | 'past_due' | 'expired';
  stripeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  /** Stripe's OWN event.created timestamp — NEVER wall clock (plan fold 17). */
  eventCreatedAt: Date;
}

/**
 * W1's transactional write (plan Item 4 W1, SQL binding as written there).
 * INSERT ... ON CONFLICT upsert preserving, in order, the three fences the
 * legacy user_profiles UPDATE carried:
 *   1. out-of-order-event fence — per (user_id, product) watermark, keyed on
 *      the STRIPE EVENT `created` timestamp (fold 17): Stripe does not
 *      guarantee delivery order, so an older-but-late event must lose even
 *      when it is PROCESSED second. Wall clock would let it win.
 *   2. deletion fence — a 'cancelled_pending_deletion' row is never touched
 *      (P26-26D: period-end webhook events must not resurrect a deleted
 *      account).
 *   3. superseded-subscription fence — a REVOKING/downgrading event applies
 *      only when it belongs to the subscription this row currently tracks
 *      (`stripe_subscription_id` equality — a MEANING CHANGE from the legacy
 *      customer-id fence, deliberate: per-product entitlements make multiple
 *      concurrent subscriptions per customer the normal case; plan Item 4 W1
 *      + open-item 2). Activating events still claim the row authoritatively.
 * Returns the affected row count (0 = fenced/stale — expected, not an error).
 */
export async function upsertEntitlementFromStripeEvent(
  db: Queryable,
  args: StripeEventUpsertArgs,
): Promise<number> {
  if (!isUuid(args.userId)) {
    logWarn('[entitlements/upsert-stripe-event]', 'non-uuid user id — skipping entitlement write', {
      user_id: args.userId,
      product: args.product,
    });
    return 0;
  }
  const res = await db.query(
    `INSERT INTO entitlements (user_id, product, status, stripe_subscription_id, current_period_end, last_stripe_event_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT (user_id, product) DO UPDATE
       SET status = EXCLUDED.status,
           stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, entitlements.stripe_subscription_id),
           current_period_end = EXCLUDED.current_period_end,
           last_stripe_event_at = EXCLUDED.last_stripe_event_at,
           updated_at = NOW()
       WHERE (entitlements.last_stripe_event_at IS NULL OR entitlements.last_stripe_event_at < EXCLUDED.last_stripe_event_at)
         AND entitlements.status IS DISTINCT FROM 'cancelled_pending_deletion'
         AND ($3 = 'active' OR entitlements.stripe_subscription_id IS NOT DISTINCT FROM EXCLUDED.stripe_subscription_id)`,
    [
      args.userId,
      args.product,
      args.status,
      args.stripeSubscriptionId,
      args.currentPeriodEnd,
      args.eventCreatedAt,
    ],
  );
  return res.rowCount ?? 0;
}

/**
 * W3's trial bootstrap (plan Item 4 W3): idempotent INSERT — a row existing
 * AT ALL for (user, product) means "already handled" (any status: an active
 * subscriber, an expired trial, an admin_managed comp all block re-init),
 * matching the legacy `!existing.subscription_status` guard's intent.
 * Returns true when a fresh trial row was created.
 */
export async function initTrialEntitlement(
  db: Queryable,
  uid: string,
  product: Product,
): Promise<boolean> {
  if (!isUuid(uid)) return false;
  const res = await db.query(
    `INSERT INTO entitlements (user_id, product, status, trial_started_at, created_at, updated_at)
     VALUES ($1, $2, 'trial', NOW(), NOW(), NOW())
     ON CONFLICT (user_id, product) DO NOTHING`,
    [uid, product],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Generic status upsert for the admin/provisioning writers (W6 revoke/suspend,
 * R5 admin_managed provisioning): sets `status` regardless of prior state —
 * the CALLER is responsible for any protected-state fencing (the admin
 * mutation set is deliberately allowed to overwrite states the webhook may
 * not). Returns the affected row count.
 */
export async function upsertEntitlementStatus(
  db: Queryable,
  uid: string,
  product: Product,
  status: EntitlementStatus,
): Promise<number> {
  if (!isUuid(uid)) return 0;
  const res = await db.query(
    `INSERT INTO entitlements (user_id, product, status, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (user_id, product) DO UPDATE
       SET status = EXCLUDED.status, updated_at = NOW()`,
    [uid, product, status],
  );
  return res.rowCount ?? 0;
}

/**
 * W6 extend_trial (plan Item 4 W6): set the trial window so it expires in
 * exactly `days` days (expiration = trial_started_at + 14d, Spec 96).
 * Preserves the legacy route's `NOW() - INTERVAL '14 days' + make_interval(...)`
 * arithmetic byte-for-byte, now on the entitlement row.
 */
export async function upsertTrialWindow(
  db: Queryable,
  uid: string,
  product: Product,
  days: number,
): Promise<number> {
  if (!isUuid(uid)) return 0;
  const res = await db.query(
    `INSERT INTO entitlements (user_id, product, status, trial_started_at, created_at, updated_at)
     VALUES ($1, $2, 'trial', NOW() - INTERVAL '14 days' + make_interval(days => $3), NOW(), NOW())
     ON CONFLICT (user_id, product) DO UPDATE
       SET status = 'trial',
           trial_started_at = EXCLUDED.trial_started_at,
           updated_at = NOW()`,
    [uid, product, days],
  );
  return res.rowCount ?? 0;
}

/**
 * W5/W6-delete fan-out (plan Item 4 W5): deletion is account-level, so every
 * entitlement row the user has flips to 'cancelled_pending_deletion' — no
 * product filter, deliberately.
 */
export async function markAllEntitlementsCancelledPendingDeletion(
  db: Queryable,
  uid: string,
): Promise<number> {
  if (!isUuid(uid)) return 0;
  const res = await db.query(
    `UPDATE entitlements
     SET status = 'cancelled_pending_deletion', updated_at = NOW()
     WHERE user_id = $1`,
    [uid],
  );
  return res.rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Price -> product resolution (plan Item 4, fold 20)
// ---------------------------------------------------------------------------

let priceProductMapCache: { map: Record<string, string>; expiresAt: number } | null = null;
const PRICE_PRODUCT_MAP_TTL_MS = 60_000;

/** Test seam — the module-level TTL cache would otherwise leak across cases. */
export function _resetPriceProductMapCacheForTests(): void {
  priceProductMapCache = null;
}

/**
 * Maps a Stripe Price ID to the Buildo product it entitles, via the
 * `logic_variables.stripe_price_product_map` JSONB variable seeded by
 * migration 228 (mig-219 pattern: operator-editable without a deploy).
 * Module-level ~60s TTL cache (fold 20) so a webhook burst doesn't re-query
 * logic_variables per event — the map only changes on an operator edit, so a
 * short staleness window is an explicit, acceptable tradeoff.
 *
 * OD5 default: a null/unmapped price resolves to 'lead_gen'. Unmapped prices
 * additionally log a WARN (a real price the operator forgot to map is an ops
 * signal; a null price — e.g. checkout.session.completed, which doesn't carry
 * line items — is the documented belt-and-suspenders case and stays silent).
 */
export async function resolvePriceProduct(
  db: Queryable,
  priceId: string | null,
): Promise<Product> {
  if (!priceId) return DEFAULT_PRODUCT;
  if (!priceProductMapCache || Date.now() >= priceProductMapCache.expiresAt) {
    const res = await db.query<{ variable_value_json: Record<string, string> | null }>(
      `SELECT variable_value_json FROM logic_variables WHERE variable_key = 'stripe_price_product_map'`,
    );
    priceProductMapCache = {
      map: res.rows[0]?.variable_value_json ?? {},
      expiresAt: Date.now() + PRICE_PRODUCT_MAP_TTL_MS,
    };
  }
  const product = priceProductMapCache.map[priceId];
  if (!product) {
    logWarn('[stripe/resolve-price-product]', 'unmapped Stripe price, defaulting to lead_gen', {
      priceId,
    });
    return DEFAULT_PRODUCT;
  }
  if (!(PRODUCTS as readonly string[]).includes(product)) {
    // A mapped-but-invalid value would fail chk_entitlements_product on write —
    // fail soft to the OD5 default instead of 500ing the webhook.
    logWarn('[stripe/resolve-price-product]', 'price maps to an unknown product, defaulting to lead_gen', {
      priceId,
      mapped: product,
    });
    return DEFAULT_PRODUCT;
  }
  return product as Product;
}
