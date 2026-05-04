// SPEC LINK: docs/specs/03-mobile/95_mobile_user_profiles.md §5 API Contract
import { z } from 'zod';

// Full shape of a user_profiles row as returned by GET/PATCH responses.
export const UserProfileSchema = z.object({
  user_id: z.string(),
  trade_slug: z.string().nullable(),
  display_name: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  // Identity
  full_name: z.string().nullable(),
  phone_number: z.string().nullable(),
  company_name: z.string().nullable(),
  email: z.string().nullable(),
  backup_email: z.string().nullable(),
  // Profession / feed-scoping
  default_tab: z.enum(['feed', 'flight_board']).nullable(),
  location_mode: z.enum(['gps_live', 'home_base_fixed']).nullable(),
  // pg returns NUMERIC(9,6) as string — coerce to number before storing
  home_base_lat: z.coerce.number().nullable(),
  home_base_lng: z.coerce.number().nullable(),
  radius_km: z.number().int().nullable(),
  supplier_selection: z.string().nullable(),
  lead_views_count: z.number().int(),
  // Subscription
  subscription_status: z
    .enum(['trial', 'active', 'past_due', 'expired', 'cancelled_pending_deletion', 'admin_managed'])
    .nullable(),
  trial_started_at: z.string().nullable(),
  stripe_customer_id: z.string().nullable(),
  // Account state
  onboarding_complete: z.boolean(),
  tos_accepted_at: z.string().nullable(),
  account_deleted_at: z.string().nullable(),
  // Admin-configured
  account_preset: z.enum(['tradesperson', 'realtor', 'manufacturer']).nullable(),
  trade_slugs_override: z.array(z.string()).nullable(),
  radius_cap_km: z.number().int().nullable(),
  // Notification preferences — flattened from JSONB to 5 sibling columns in
  // migration 117 per Spec 99 §9.14 (eliminates the deep-equal hot path on
  // the mobile side; replaces JSONB merge SQL on the server). DB column for
  // `lifecycle_stalled` was renamed `lifecycle_stalled_pref` to avoid silent
  // ambiguity in pipeline SELECTs that join `permits.lifecycle_stalled`.
  new_lead_min_cost_tier: z.enum(['low', 'medium', 'high']),
  phase_changed: z.boolean(),
  lifecycle_stalled_pref: z.boolean(),
  start_date_urgent: z.boolean(),
  notification_schedule: z.enum(['morning', 'anytime', 'evening']),
});

export type UserProfileType = z.infer<typeof UserProfileSchema>;

// Whitelist for PATCH body — only these fields are client-writable.
// .strip() silently discards any extra keys (subscription_status, account_deleted_at, etc.)
//
// WF3 2026-05-04 hardening (review_followups.md /api/user-profile bundle):
// `trade_slug` IS a client-writable field (the onboarding profession step
// PATCHes it as the first write of the user_profiles row), but it has
// special semantics — first-write only, immutable thereafter. Pre-WF3 the
// route handler read `rawBody.trade_slug` directly BEFORE calling safeParse,
// bypassing Zod entirely; future schema constraints (length, charset
// regex) would not have been enforced. Adding it here lets the route
// read `parsed.data.trade_slug` instead.
//
// Server-canonical column list (the columns that should be returned to
// clients on GET / PATCH). Exclude internal fields:
//   - `stripe_customer_id`, `radius_cap_km`, `trade_slugs_override` (admin-internal)
//   - `account_preset` (admin-set, but DOES need to leak — clients read it
//     to know e.g. "manufacturer" preset and skip subscription UI)
// Used by `/api/user-profile` GET and PATCH RETURNING — replaces `SELECT *`
// / `RETURNING *` which leaked any future internal column automatically.
export const CLIENT_SAFE_COLUMNS = [
  'user_id',
  'trade_slug',
  'display_name',
  'created_at',
  'updated_at',
  'full_name',
  'phone_number',
  'company_name',
  'email',
  'backup_email',
  'default_tab',
  'location_mode',
  'home_base_lat',
  'home_base_lng',
  'radius_km',
  'supplier_selection',
  'lead_views_count',
  'subscription_status',
  'trial_started_at',
  'onboarding_complete',
  'tos_accepted_at',
  'account_deleted_at',
  'account_preset',
  'new_lead_min_cost_tier',
  'phase_changed',
  'lifecycle_stalled_pref',
  'start_date_urgent',
  'notification_schedule',
] as const;
export const CLIENT_SAFE_SELECT_LIST = CLIENT_SAFE_COLUMNS.join(', ');

export const UserProfileUpdateSchema = z
  .object({
    // Spec 95 §3.1 trade_slug: first-write only, immutable thereafter.
    // Validation gate runs at safeParse; immutability gate is enforced
    // in the route handler against existing row state.
    trade_slug: z.string().min(1).max(50).optional(),
    full_name: z.string().max(120).nullable().optional(),
    phone_number: z.string().max(30).nullable().optional(),
    company_name: z.string().max(120).nullable().optional(),
    backup_email: z.string().email().nullable().optional(),
    default_tab: z.enum(['feed', 'flight_board']).nullable().optional(),
    location_mode: z.enum(['gps_live', 'home_base_fixed']).nullable().optional(),
    home_base_lat: z.number().min(-90).max(90).nullable().optional(),
    home_base_lng: z.number().min(-180).max(180).nullable().optional(),
    radius_km: z.number().int().min(1).max(200).nullable().optional(),
    supplier_selection: z.string().nullable().optional(),
    // Spec 99 §9.14 — flat notification fields (was a JSONB sub-object pre-117)
    new_lead_min_cost_tier: z.enum(['low', 'medium', 'high']).optional(),
    phase_changed: z.boolean().optional(),
    lifecycle_stalled_pref: z.boolean().optional(),
    start_date_urgent: z.boolean().optional(),
    notification_schedule: z.enum(['morning', 'anytime', 'evening']).optional(),
    // Onboarding-only fields written by Spec 94 screens
    onboarding_complete: z.boolean().optional(),
    tos_accepted_at: z.string().optional(),
  })
  .strip();

export type UserProfileUpdateType = z.infer<typeof UserProfileUpdateSchema>;
