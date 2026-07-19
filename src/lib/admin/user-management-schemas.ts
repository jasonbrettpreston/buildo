// 🔗 SPEC LINK: docs/specs/02-web-admin/21_admin_user_management.md §3 + §4
//
// Zod schemas for the admin User Management tool (P24-24B). Request validation
// for the directory GET, the detail GET, the PATCH mutation set (discriminated
// union on `action`), and the supplier/enterprise creation POST.

import { z } from 'zod';
import { TRADES } from '@/lib/classification/trades';
import { PRODUCTS } from '@/lib/entitlements';

export const USER_DIRECTORY_PAGE_SIZE = 25;

// The canonical set of assignable trade slugs (active only — deprecated trades
// excluded). Sourced from the single trades taxonomy so the admin picker and
// the validator can never drift.
export const ASSIGNABLE_TRADE_SLUGS: readonly string[] = TRADES.filter(
  (t) => t.kind !== 'deprecated',
).map((t) => t.slug);

const ASSIGNABLE_TRADE_SET = new Set(ASSIGNABLE_TRADE_SLUGS);

export const ACCOUNT_PRESET_VALUES = [
  'tradesperson',
  'realtor',
  'manufacturer',
  'supplier',
] as const;

export const SUBSCRIPTION_STATUS_VALUES = [
  'trial',
  'active',
  'past_due',
  'expired',
  'cancelled_pending_deletion',
  'admin_managed',
] as const;

// Every mutation carries a mandatory human reason (3-500 chars) → audit row.
const reasonSchema = z.string().trim().min(3).max(500);

// A trade slug that must be a member of the assignable set.
const assignableTradeSlug = z
  .string()
  .trim()
  .refine((s) => ASSIGNABLE_TRADE_SET.has(s), { message: 'unknown trade slug' });

// Entitlements swap (`.cursor/phase1_plan.md` Item 4 W6): subscription
// mutations are per-product. Optional for the single-product window — the
// route defaults an omitted product to 'lead_gen' (OD5). Values mirror
// migration 228's chk_entitlements_product via the shared PRODUCTS constant
// (the `_contracts.json` schema.entitlement_products key lands with 229's
// commit, next wave, and PRODUCTS becomes its consumer then).
const productField = z.enum(PRODUCTS).optional();

// ---------------------------------------------------------------------------
// Directory GET — search + filter + pagination
// ---------------------------------------------------------------------------
export const UserDirectoryQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(), // email / phone / name substring
    preset: z.enum(ACCOUNT_PRESET_VALUES).optional(),
    trade_slug: z.string().trim().max(50).optional(),
    subscription_status: z.enum(SUBSCRIPTION_STATUS_VALUES).optional(),
    // P26-26D sweep surface (Spec 21 §6): filter to accounts with an outstanding
    // delete-time Stripe-cancel failure (stripe_cancel_failed_at IS NOT NULL).
    // Explicit 'true'/'false' enum — NOT z.coerce.boolean() (which coerces every
    // non-empty string, incl. 'false'/'0', to true — P26 review R2 Integration).
    stripe_cancel_failed: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    offset: z.coerce.number().int().nonnegative().max(1_000_000).default(0),
  })
  .strict();
export type UserDirectoryQuery = z.infer<typeof UserDirectoryQuerySchema>;

// ---------------------------------------------------------------------------
// PATCH mutations — discriminated union on `action`
// ---------------------------------------------------------------------------
export const AdminUserMutationSchema = z.discriminatedUnion('action', [
  // THE JOIN EDITOR — set the account trade SET. First element becomes the
  // primary `trade_slug`; the rest become `trade_slugs_override`.
  z.object({
    action: z.literal('set_trades'),
    trade_slugs: z.array(assignableTradeSlug).min(1).max(35),
    reason: reasonSchema,
  }),
  z.object({
    action: z.literal('set_preset'),
    account_preset: z.enum(ACCOUNT_PRESET_VALUES),
    reason: reasonSchema,
  }),
  z.object({
    action: z.literal('extend_trial'),
    days: z.coerce.number().int().min(1).max(365).default(14),
    product: productField,
    reason: reasonSchema,
  }),
  z.object({
    action: z.literal('revoke'), // revoke subscription → expired
    product: productField,
    reason: reasonSchema,
  }),
  z.object({
    action: z.literal('suspend'), // suspend account access → expired (audit-distinct)
    product: productField,
    reason: reasonSchema,
  }),
  z.object({
    action: z.literal('delete'), // Firebase delete + PII nullify + cancelled_pending_deletion
    reason: reasonSchema,
  }),
]);
export type AdminUserMutation = z.infer<typeof AdminUserMutationSchema>;

// The actions that mutate/destroy account access. Self-target is forbidden on
// these; targeting an admin allowlist member is forbidden on ALL actions.
export const DESTRUCTIVE_ACTIONS: ReadonlySet<AdminUserMutation['action']> = new Set([
  'revoke',
  'suspend',
  'delete',
]);

// ---------------------------------------------------------------------------
// Creation POST — supplier / enterprise account provisioning
// ---------------------------------------------------------------------------
export const CreateUserBodySchema = z
  .object({
    email: z.string().trim().email().max(320),
    company_name: z.string().trim().max(120).optional(),
    // Only the two admin-provisioned personas are creatable here. A supplier is
    // a single-trade product account; an enterprise/manufacturer is multi-trade.
    account_preset: z.enum(['supplier', 'manufacturer']),
    trade_slugs: z.array(assignableTradeSlug).min(1).max(35),
    radius_cap_km: z.coerce.number().int().min(1).max(1000).optional(),
    reason: reasonSchema,
  })
  .strict();
export type CreateUserBody = z.infer<typeof CreateUserBodySchema>;
